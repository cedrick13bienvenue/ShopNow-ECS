# ShopNow — Microservices E-Commerce on AWS ECS

5-service Node.js e-commerce app deployed on AWS ECS Fargate.
ECS Service Connect handles inter-service communication via the `shopnow.local` namespace.

---

## Kubernetes Architecture (Minikube)

```
YOUR MACHINE
│
├── eval $(minikube docker-env)
│     └── docker build × 5 → images built directly inside Minikube
│
└── Minikube  (single-node cluster, Docker driver)
      │
      └── Namespace: shopnow
            │
            ├── Ingress  shopnow-ingress ◄── http://localhost  (minikube tunnel)
            │
            ├── frontend Pod        :80   ──▶ proxies /api/* to backend services
            ├── auth-service Pod    :3001 ──▶ postgres  shopnow_auth
            ├── product-service Pod :3002 ──▶ postgres  shopnow_products · PVC (uploads)
            ├── cart-service Pod    :3003 ──▶ redis
            ├── order-service Pod   :3004 ──▶ postgres  shopnow_orders
            ├── postgres Pod        :5432 ──▶ PVC  1Gi
            └── redis Pod           :6379
            │
            ├── ConfigMap  shopnow-config   (ports, hostnames, DB names)
            ├── Secret     shopnow-secret   (DB password, JWT secret)
            └── PVC × 2                     (postgres data · product uploads)
```

---

## Kubernetes Resources

| Resource | Name | Count |
|---|---|---|
| Namespace | `shopnow` | 1 |
| Deployment | one per service | 7 |
| Service (ClusterIP) | postgres, redis, auth, product, cart, order | 6 |
| Service (NodePort) | `frontend` — port 30080 | 1 |
| Ingress | `shopnow-ingress` | 1 |
| ConfigMap | `shopnow-config` | 1 |
| Secret | `shopnow-secret` | 1 |
| PersistentVolumeClaim | postgres data + product uploads | 2 |

Manifests live in `k8s/`. Secrets are gitignored — copy `k8s/secret.yaml.example` to `k8s/secret.yaml` and fill in values before deploying.

---

## ECS Architecture

```
YOUR MACHINE
│
└── Jenkins ──→ docker build × 5 → ECR push → register-task-def → ECS rolling deploy

AWS (eu-west-1)
│
└── VPC  10.0.0.0/16
    ├── Public Subnets  (eu-west-1a / eu-west-1b)
    │     └── shopnow-alb :80          shopnow-nat (Elastic IP → internet)
    │
    └── Private Subnets  (eu-west-1a / eu-west-1b)
          ├── shopnow-auth-cluster
          │     └── auth-service      :3001 ──▶ RDS  shopnow_auth
          ├── shopnow-products-cluster
          │     └── product-service   :3002 ──▶ RDS  shopnow_products
          │                                      S3  ──▶  CloudFront
          └── shopnow-core-cluster
                ├── frontend          :80   ◄── shopnow-alb
                ├── cart-service      :3003 ──▶ ElastiCache Redis
                └── order-service     :3004 ──▶ RDS  shopnow_orders
          │
          ├── RDS PostgreSQL 18  (3 databases, private, SSL)
          ├── ElastiCache Redis 7  (cart sessions, 1 h TTL)
          └── Service Connect namespace  shopnow.local
```

---

## Services

| Service | Port | Storage | Responsibility |
|---|---|---|---|
| `auth-service` | 3001 | RDS `shopnow_auth` | Register, login, issue JWT |
| `product-service` | 3002 | RDS `shopnow_products` + S3 | Product catalog, image uploads |
| `cart-service` | 3003 | ElastiCache Redis | Per-user cart (1 h TTL) |
| `order-service` | 3004 | RDS `shopnow_orders` | Checkout, clear cart, update stock |
| `frontend` | 80 | — | React SPA + nginx reverse proxy |

---

## AWS Resources

| Resource | Name / Value | Purpose |
|---|---|---|
| VPC | `shopnow-vpc`  `10.0.0.0/16` | Network boundary |
| Public Subnets | `shopnow-public-subnet` / `-b` | ALB + NAT |
| Private Subnets | `shopnow-private-subnet` / `-b` | ECS tasks, RDS, Redis |
| Internet Gateway | `shopnow-igw` | VPC → internet |
| NAT Gateway | `shopnow-nat` | Private subnets → internet |
| ALB | `shopnow-alb` | Port 80 → frontend |
| ECR | `shopnow/*` (5 repos) | Docker image registry |
| ECS Clusters | 3 (auth, products, core) | Fargate task hosting |
| RDS PostgreSQL 18 | `shopnow-db` | 3 app databases |
| ElastiCache Redis 7 | `shopnow-redis` | Cart sessions |
| S3 | `shopnow-product-images-*` | Product image storage |
| CloudFront | — | CDN in front of S3 |
| Cloud Map | `shopnow.local` | Service Connect namespace |
| IAM Role | `ecsTaskExecutionRole` | ECR pull + CloudWatch logs |
| IAM Role | `shopnow-product-task-role` | S3 access from product-service |
| IAM User | `shopnow-jenkins` | Jenkins ECR push + ECS deploy |
| CloudWatch | `/ecs/*` (5 log groups) | Container logs, 7-day retention |

---

## Networking & Security Groups

| Security Group | Allows |
|---|---|
| `shopnow-alb-sg` | TCP 80 from `0.0.0.0/0` |
| `shopnow-frontend-sg` | TCP 80 from `shopnow-alb-sg` |
| `shopnow-backend-sg` | TCP 3001–3004 from `10.0.0.0/16` |
| `shopnow-rds-sg` | TCP 5432 from `shopnow-backend-sg` |
| `shopnow-redis-sg` | TCP 6379 from `shopnow-backend-sg` |

---

## ECS Clusters & ECR

| Cluster | Service(s) | Service Connect mode |
|---|---|---|
| `shopnow-auth-cluster` | `auth-service` | Client and server |
| `shopnow-products-cluster` | `product-service` | Client and server |
| `shopnow-core-cluster` | `cart-service`, `order-service`, `frontend` | Client and server / Client only (frontend) |

All clusters use **Fargate** with the `shopnow.local` Service Connect namespace.
Task definitions live in `task-definitions/` and are seeded on first registration.

---

## Data Layer

**RDS PostgreSQL 18** — `shopnow-db` (private, no public access, SSL required)

| Database | Owner service |
|---|---|
| `shopnow_auth` | auth-service |
| `shopnow_products` | product-service |
| `shopnow_orders` | order-service |

Each service auto-creates its database on first boot.

**ElastiCache Redis 7** — `shopnow-redis` (`cache.t3.micro`, no replicas)
Cart items stored per user ID with 1-hour TTL.

**S3 + CloudFront** — images streamed directly from product-service via `multer-s3`.
CloudFront OAC policy restricts S3 access to CloudFront only.

---

## CI/CD Pipeline

```
1. Checkout          git pull
2. Set Image Tag     git rev-parse --short HEAD  (e.g. a3f9d2c)
3. Build Images      docker build × 5  (parallel)
4. Login ECR         aws ecr get-login-password | docker login
5. Push to ECR       docker push :SHA + :latest × 5  (parallel)
6. Deploy ECS        per service:
                       describe-task-definition  (read live def from AWS)
                       jq                        (strip read-only fields, inject new image)
                       register-task-definition  (new revision)
                       update-service            (pin to new revision ARN)
7. Verify            aws ecs wait services-stable × 3 clusters
```

Image tag = git commit SHA → rollback = deploy a previous task-definition revision.

---

## IAM

| Principal | Policy | Purpose |
|---|---|---|
| `ecsTaskExecutionRole` | `AmazonECSTaskExecutionRolePolicy` + `CloudWatchLogsFullAccess` | ECS pulls ECR images, writes logs |
| `shopnow-product-task-role` | `AmazonS3FullAccess` | product-service uploads/deletes S3 objects |
| `shopnow-jenkins` (IAM user) | `AmazonEC2ContainerRegistryFullAccess` + `AmazonECS_FullAccess` | Jenkins pipeline |

---

## Environment Variables

### Shared (all backend services)

| Variable | Value |
|---|---|
| `DB_HOST` | RDS endpoint |
| `DB_PORT` | `5432` |
| `DB_USER` | `shopnow_user` |
| `DB_PASSWORD` | your RDS password |
| `JWT_SECRET` | shared secret |

### Per-service extras

| Service | Variable | Value |
|---|---|---|
| `auth-service` | `DB_NAME` | `shopnow_auth` |
| `product-service` | `DB_NAME` | `shopnow_products` |
| `product-service` | `S3_BUCKET` | your bucket name |
| `product-service` | `CLOUDFRONT_DOMAIN` | CloudFront domain |
| `product-service` | `AWS_REGION` | `eu-west-1` |
| `cart-service` | `REDIS_HOST` | ElastiCache primary endpoint |
| `cart-service` | `REDIS_PORT` | `6379` |
| `order-service` | `DB_NAME` | `shopnow_orders` |
| `order-service` | `CART_SERVICE_URL` | `http://cart-service.shopnow.local:3003` |
| `order-service` | `PRODUCT_SERVICE_URL` | `http://product-service.shopnow.local:3002` |

---

## Running Locally

### Docker Compose

```bash
cp .env.example .env   # first time only — fill in DB_PASSWORD and JWT_SECRET
docker compose up --build
```

Open http://localhost → login with `admin / admin123`.

### Minikube (Kubernetes)

```bash
# 1 — start cluster
minikube start --driver=docker
minikube addons enable ingress

# 2 — build images inside Minikube
eval $(minikube docker-env)
docker build -t shopnow/auth-service:latest ./auth_service
docker build -t shopnow/product-service:latest ./product_service
docker build -t shopnow/cart-service:latest ./cart_service
docker build -t shopnow/order-service:latest ./order_service
docker build -t shopnow/frontend:latest ./frontend

# 3 — create secret (first time only)
cp k8s/secret.yaml.example k8s/secret.yaml
# edit k8s/secret.yaml — fill in DB_PASSWORD and JWT_SECRET

# 4 — deploy
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/postgres/
kubectl apply -f k8s/redis/
kubectl apply -f k8s/auth-service/
kubectl apply -f k8s/product-service/
kubectl apply -f k8s/cart-service/
kubectl apply -f k8s/order-service/
kubectl apply -f k8s/frontend/
kubectl apply -f k8s/ingress.yaml

# 5 — open tunnel (keep this terminal running)
minikube tunnel
```

Open http://localhost → login with `admin / admin123`.

---

## AWS Provisioning Order

1. **IAM** — `ecsTaskExecutionRole`, `shopnow-product-task-role`, `shopnow-jenkins` user + access key
2. **ECR** — 5 repositories under `shopnow/`
3. **S3 + CloudFront** — bucket, OAC, distribution
4. **VPC** — VPC, 4 subnets, IGW, public route table
5. **NAT Gateway** — Elastic IP → NAT → private route table
6. **Security Groups** — 5 groups (alb, frontend, backend, rds, redis)
7. **RDS** — subnet group → PostgreSQL 18 instance
8. **ElastiCache** — subnet group → Redis 7 cluster
9. **Cloud Map** — `shopnow.local` namespace (DNS + API, attached to VPC)
10. **ECS Clusters** — 3 clusters with Service Connect enabled
11. **Task Definitions** — paste JSON from `task-definitions/`, fill in endpoints + secrets
12. **ECS Services** — 5 services with Service Connect + correct security groups
13. **ALB** — target group (IP, port 80) → ALB → attach to frontend service
14. **Jenkins** — configure AWS credentials + GitHub token → trigger build

---

## Pause & Resume

**To pause** (saves ~$2/day):

1. ECS → each service → Update → desired tasks = `0`
2. RDS → `shopnow-db` → Stop temporarily
3. ElastiCache → `shopnow-redis` → Delete
4. NAT Gateway → Delete → release Elastic IP

**To resume**:

1. RDS → Start → wait Available
2. Recreate ElastiCache (step 8 above)
3. Allocate Elastic IP → recreate NAT → update private route table
4. ECS → each service → desired tasks = `1`
5. Jenkins → Build Now
