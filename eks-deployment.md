# ShopNow — EKS Manual Deployment Guide

Full step-by-step guide to provision and deploy ShopNow on AWS EKS from zero.

---

## Prerequisites

```bash
# install and configure
aws configure          # access key, secret, region eu-west-1
terraform -v           # not needed for manual deploy
kubectl version
docker login           # log in to Docker Hub
```

---

## Architecture

```
Internet → NLB → frontend pod (nginx) → proxies /api/* to backend services
                                      → ClusterIP Services → pods
                                      → postgres pod → EBS volume
                                      → product-service pod → S3 → CloudFront
```

---

## PART 1 — IAM Roles

### 1a. EKS Cluster Role

1. IAM → Roles → Create role
2. Trusted entity: **AWS service**
3. Use case: **EKS → EKS - Cluster**
4. Policy `AmazonEKSClusterPolicy` is pre-selected
5. Role name: `shopnow-eks-cluster-role`
6. Create role

---

### 1b. EKS Node Role

1. IAM → Roles → Create role
2. Trusted entity: **AWS service**
3. Use case: **EC2**
4. Attach these policies:
   - `AmazonEKSWorkerNodePolicy`
   - `AmazonEC2ContainerRegistryReadOnly`
   - `AmazonEKS_CNI_Policy`
5. Role name: `shopnow-eks-node-role`
6. Create role

After creation, add the 4th policy:

7. Open `shopnow-eks-node-role` → Add permissions → Attach policies
8. Search and attach `AmazonEBSCSIDriverPolicy`

---

### 1c. EBS CSI Driver Role

> ⚠️ This role is required. Without it the EBS CSI controller crashes and PVCs stay Pending forever.

1. IAM → Roles → Create role
2. Trusted entity: **Web identity**
3. Identity provider: select your OIDC provider (created in Part 4 — come back here after Part 4)
4. Audience: `sts.amazonaws.com`
5. Add condition:
   - Condition: `StringEquals`
   - Key: `<oidc-url>:sub`
   - Value: `system:serviceaccount:kube-system:ebs-csi-controller-sa`
6. Attach policy: `AmazonEBSCSIDriverPolicy`
7. Role name: `shopnow-ebs-csi-role`
8. Create role

Then annotate the service account:

```bash
kubectl annotate serviceaccount ebs-csi-controller-sa \
  -n kube-system \
  eks.amazonaws.com/role-arn=arn:aws:iam::<account-id>:role/shopnow-ebs-csi-role \
  --overwrite

kubectl rollout restart deployment ebs-csi-controller -n kube-system
```

Verify it's running (all should show 6/6):

```bash
kubectl get pods -n kube-system | grep ebs
```

---

### 1d. Product Service S3 Role (IRSA)

> Do this after Part 4 (OIDC provider must exist first).

1. IAM → Roles → Create role
2. Trusted entity: **Web identity**
3. Identity provider: select your OIDC provider
4. Audience: `sts.amazonaws.com`
5. Add condition:
   - Condition: `StringEquals`
   - Key: `<oidc-url>:sub`
   - Value: `system:serviceaccount:shopnow:shopnow-product-sa`
6. Skip permissions for now
7. Role name: `shopnow-product-s3-role`
8. Create role

Add inline policy:

9. Open `shopnow-product-s3-role` → Add permissions → Create inline policy → Visual tab
10. Service: **S3**
11. Actions: `PutObject`, `GetObject`, `DeleteObject` (Write + Read), `ListBucket` (List)
12. Resources:
    - bucket: `shopnow-product-images-cedrick`
    - object: `shopnow-product-images-cedrick` + Any object name
13. Policy name: `shopnow-product-s3-policy`
14. Create policy

---

## PART 2 — VPC & Networking

### 2a. VPC

1. VPC → Your VPCs → Create VPC → **VPC only**
2. Name: `shopnow-vpc`
3. IPv4 CIDR: `10.0.0.0/16`
4. Create VPC

---

### 2b. Subnets

1. VPC → Subnets → Create subnet
2. Select `shopnow-vpc`
3. Subnet 1:
   - Name: `shopnow-public-1`
   - AZ: `eu-west-1a`
   - CIDR: `10.0.0.0/24`
4. Add new subnet
5. Subnet 2:
   - Name: `shopnow-public-2`
   - AZ: `eu-west-1b`
   - CIDR: `10.0.1.0/24`
6. Create subnet

Enable auto-assign public IP on both:

7. Select `shopnow-public-1` → Actions → Edit subnet settings
8. Check **Enable auto-assign public IPv4 address** → Save
9. Repeat for `shopnow-public-2`

Add required EKS tags to **both** subnets:

| Key | Value |
|---|---|
| `kubernetes.io/role/elb` | `1` |
| `kubernetes.io/cluster/shopnow-eks` | `owned` |

---

### 2c. Internet Gateway

1. VPC → Internet Gateways → Create internet gateway
2. Name: `shopnow-igw`
3. Create
4. Actions → Attach to VPC → select `shopnow-vpc`

---

### 2d. Route Table

1. VPC → Route Tables → Create route table
2. Name: `shopnow-public-rt`
3. VPC: `shopnow-vpc`
4. Create

Add internet route:

5. Routes tab → Edit routes → Add route
6. Destination: `0.0.0.0/0`, Target: Internet Gateway → `shopnow-igw`
7. Save changes

Associate subnets:

8. Subnet associations → Edit subnet associations
9. Select both `shopnow-public-1` and `shopnow-public-2`
10. Save

---

### 2e. Security Group

1. VPC → Security Groups → Create security group
2. Name: `shopnow-node-sg`
3. Description: `EKS worker nodes`
4. VPC: `shopnow-vpc`
5. Inbound rules: add one rule only → Type `HTTP`, Port `80`, Source `0.0.0.0/0`
6. Create security group

> ⚠️ You cannot add a self-referencing rule during creation. Do it after:

7. Open `shopnow-node-sg` → Inbound rules → Edit inbound rules
8. Add rule: Type `All traffic`, Source: Custom → select `shopnow-node-sg`
9. Save rules

---

## PART 3 — EKS Cluster

1. EKS → Create cluster → **Custom configuration**
2. **Do NOT enable EKS Auto Mode**
3. Name: `shopnow-eks`
4. Kubernetes version: latest stable
5. Cluster IAM role: `shopnow-eks-cluster-role`
6. Upgrade policy: Standard support
7. Bootstrap cluster administrator access: Allow
8. Cluster authentication mode: EKS API and ConfigMap
9. ARC Zonal shift: Disabled
10. Deletion protection: off
11. Next

Networking:

12. VPC: `shopnow-vpc`
13. Subnets: `shopnow-public-1` and `shopnow-public-2`
14. Additional security groups: `shopnow-node-sg`
15. Cluster endpoint access: Public
16. Next

Observability:

17. Leave everything off → Next

Add-ons — select only these 4:

18. `kube-proxy`
19. `Amazon VPC CNI`
20. `CoreDNS`
21. `Amazon EBS CSI Driver`

22. Next → Next → Create

⏳ Wait ~10-15 minutes until status shows **Active**.

---

## PART 4 — OIDC Provider

1. EKS → shopnow-eks → Overview tab
2. Copy the **OpenID Connect provider URL**
3. IAM → Identity providers → Add provider
4. Provider type: **OpenID Connect**
5. Provider URL: paste → click **Get thumbprint**
6. Audience: `sts.amazonaws.com`
7. Add provider

> Now go back and complete **Part 1c** (EBS CSI role) and **Part 1d** (product S3 role).

---

## PART 5 — Node Group

1. EKS → shopnow-eks → Compute tab → Add node group
2. Name: `shopnow-nodes`
3. Node IAM role: `shopnow-eks-node-role`
4. Next

Compute config:

5. AMI type: `Amazon Linux 2023 (x86_64) Standard`
6. Instance type: `t3.medium`
7. Disk size: `20 GiB` (minimum for AL2023 — cannot go lower)
8. Desired: `2`, Minimum: `2`, Maximum: `3`
9. Next

Networking:

10. Subnets: both `shopnow-public-1` and `shopnow-public-2`
11. Remote access: off
12. Next → Create

⏳ Wait ~5 minutes until status shows **Active**.

---

## PART 6 — Connect kubectl

```bash
aws eks update-kubeconfig --region eu-west-1 --name shopnow-eks

# verify
kubectl get nodes
# should show 2 nodes with status Ready
```

---

## PART 7 — EBS CSI IRSA

After node group is Active, annotate the EBS CSI service account and restart:

```bash
kubectl annotate serviceaccount ebs-csi-controller-sa \
  -n kube-system \
  eks.amazonaws.com/role-arn=arn:aws:iam::<account-id>:role/shopnow-ebs-csi-role \
  --overwrite

kubectl rollout restart deployment ebs-csi-controller -n kube-system

# wait ~30 seconds then verify — all should show 6/6
kubectl get pods -n kube-system | grep ebs
```

---

## PART 8 — S3 Bucket

1. S3 → Create bucket
2. Bucket name: `shopnow-product-images-cedrick`
3. Region: `eu-west-1`
4. Block all public access: leave checked
5. Create bucket

---

## PART 9 — CloudFront

1. CloudFront → Create distribution
2. Origin domain: select `shopnow-product-images-cedrick` S3 bucket
3. Grant CloudFront access to origin: Yes (OAC auto-created)
4. WAF / Security protections: **None** (costs extra)
5. Create distribution

Copy the distribution ID (e.g. `EBHLGCU8IOKBU`) and domain (e.g. `d2zhph5qkh6hqt.cloudfront.net`).

Update S3 bucket policy:

6. S3 → shopnow-product-images-cedrick → Permissions → Bucket policy → Edit
7. Paste the policy CloudFront generated (shown in the yellow banner after creation):

```json
{
  "Version": "2008-10-17",
  "Id": "PolicyForCloudFrontPrivateContent",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipal",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::shopnow-product-images-cedrick/*",
      "Condition": {
        "ArnLike": {
          "AWS:SourceArn": "arn:aws:cloudfront::<account-id>:distribution/<distribution-id>"
        }
      }
    }
  ]
}
```

8. Save changes

---

## PART 10 — Deploy

Apply the StorageClass first (PVCs depend on it):

```bash
kubectl apply -f k8s/storageclass.yaml
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/serviceaccount.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/postgres/
kubectl apply -f k8s/redis/
kubectl apply -f k8s/auth-service/
kubectl apply -f k8s/product-service/
kubectl apply -f k8s/cart-service/
kubectl apply -f k8s/order-service/
kubectl apply -f k8s/frontend/
```

Watch pods come up:

```bash
kubectl get pods -n shopnow -w
```

Get the NLB URL:

```bash
kubectl get svc frontend -n shopnow
# copy the EXTERNAL-IP value and open in browser
```

Login with `admin / admin123`.

---

## Known Issues & Fixes

### PVCs stay Pending — no storage class

**Symptom:** `no persistent volumes available for this claim and no storage class is set`

**Fix:** Apply `k8s/storageclass.yaml` before applying postgres and product-service:

```bash
kubectl apply -f k8s/storageclass.yaml
```

---

### EBS CSI controller in CrashLoopBackOff

**Symptom:** `ebs-csi-controller` shows `1/6 CrashLoopBackOff`, logs show `no EC2 IMDS role found`

**Cause:** EBS CSI controller pod cannot reach EC2 instance metadata from a public subnet pod. Needs IRSA.

**Fix:**

```bash
kubectl annotate serviceaccount ebs-csi-controller-sa \
  -n kube-system \
  eks.amazonaws.com/role-arn=arn:aws:iam::<account-id>:role/shopnow-ebs-csi-role \
  --overwrite

kubectl rollout restart deployment ebs-csi-controller -n kube-system
```

---

### Postgres pod in Error — initdb fails

**Symptom:** `initdb: error: directory "/var/lib/postgresql/data" exists but is not empty — lost+found directory`

**Cause:** EBS ext4 filesystem creates `lost+found` in the root of the volume. Postgres refuses to init in a non-empty directory.

**Fix:** Add `PGDATA` env var to postgres deployment pointing to a subdirectory:

```yaml
- name: PGDATA
  value: /var/lib/postgresql/data/pgdata
```

---

### Frontend nginx crash — host not found

**Symptom:** `host not found in upstream "auth-service.shopnow.local"`

**Cause:** Frontend Docker image was built from old ECS codebase with `.shopnow.local` FQDNs. Rebuild from updated source:

```bash
docker build -t cedrick13bienvenue/frontend:latest ./frontend
docker push cedrick13bienvenue/frontend:latest
kubectl rollout restart deployment frontend -n shopnow
```

---

## Teardown (to $0)

Always delete Kubernetes resources first — this releases the NLB and EBS volumes. If you delete AWS resources first, the NLB and volumes become orphans and block VPC deletion.

```bash
# Step 1 — release NLB and EBS volumes
kubectl delete namespace shopnow

# Step 2 — delete EKS node group (EC2 instances)
# EKS → shopnow-eks → Compute → shopnow-nodes → Delete

# Step 3 — delete EKS cluster
# EKS → shopnow-eks → Delete cluster

# Step 4 — delete remaining AWS resources (any order)
# S3 → shopnow-product-images-cedrick → Empty bucket → Delete bucket
# CloudFront → disable distribution → wait → delete
# VPC → shopnow-vpc → Delete (deletes subnets, IGW, route tables)
# EC2 → Security Groups → delete shopnow-node-sg
# IAM → Roles → delete shopnow-eks-cluster-role, shopnow-eks-node-role,
#                         shopnow-ebs-csi-role, shopnow-product-s3-role
# IAM → Identity providers → delete OIDC provider
```
