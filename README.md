# ShopNow — Microservices on AWS ECS

A containerized e-commerce platform built with Node.js microservices, deployed on AWS ECS Fargate across three clusters using ECS Service Connect for cross-cluster communication.

---

## Services

| Service | Port | Storage | Responsibility |
|---|---|---|---|
| `auth-service` | 3001 | RDS (`shopnow_auth`) | Register, login, JWT issue |
| `product-service` | 3002 | RDS (`shopnow_products`) + S3 | Product catalog, image uploads |
| `cart-service` | 3003 | ElastiCache Redis (1h TTL) | Per-user session cart |
| `order-service` | 3004 | RDS (`shopnow_orders`) | Checkout, cart clearing |
| `frontend` | 80 | — | React SPA served by nginx |

---

## Tech Stack

**Backend:** Node.js 20 · TypeScript · Express · JWT (local verification)
**Frontend:** React 18 · TypeScript · Vite · Tailwind CSS v4
**Storage:** PostgreSQL 15 (RDS) · Redis 7 (ElastiCache) · S3 + CloudFront
**Infrastructure:** Docker · AWS ECS Fargate · AWS Cloud Map · Service Connect
**CI/CD:** Jenkins (local) · Declarative pipeline · ECR · task-definition-in-repo deploy

---

## AWS Resources

| Resource | Name | Purpose |
|---|---|---|
| VPC | `shopnow-vpc` | `10.0.0.0/16` network boundary |
| Public Subnet | `shopnow-public-subnet` | `10.0.1.0/24` — ALB + NAT Gateway |
| Private Subnet | `shopnow-private-subnet` | `10.0.3.0/24` — ECS tasks + data layer |
| Internet Gateway | `shopnow-igw` | VPC internet access |
| NAT Gateway | `shopnow-nat` | Outbound internet for private subnet |
| ALB | `shopnow-alb` | Internet-facing, port 80 → frontend |
| ECS Cluster | `shopnow-auth-cluster` | Runs auth-service |
| ECS Cluster | `shopnow-products-cluster` | Runs product-service |
| ECS Cluster | `shopnow-core-cluster` | Runs cart, order, frontend |
| ECR | `shopnow/*` | 5 private image repositories |
| RDS | `shopnow-db` | PostgreSQL, 3 databases |
| ElastiCache | `shopnow-redis` | Redis, cart sessions |
| S3 | `shopnow-product-images` | Product image uploads |
| CloudFront | — | CDN in front of S3 |
| Cloud Map | `shopnow.local` | Service Connect namespace |
| IAM Role | `ecsTaskExecutionRole` | ECS pulls ECR + writes CloudWatch |
| IAM User | `shopnow-jenkins` | Jenkins ECR push + ECS deploy |
| Log Groups | `/ecs/*` | 5 CloudWatch log groups (7-day retention) |

### Security Groups

| Name | Allows |
|---|---|
| `shopnow-alb-sg` | TCP 80 from `0.0.0.0/0` |
| `shopnow-frontend-sg` | TCP 80 from `shopnow-alb-sg` only |
| `shopnow-backend-sg` | TCP 3001–3004 from within VPC |
| `shopnow-rds-sg` | TCP 5432 from `shopnow-backend-sg` only |
| `shopnow-redis-sg` | TCP 6379 from `shopnow-backend-sg` only |

---

## CI/CD Pipeline (Jenkinsfile)

Jenkins triggers on every push to GitHub via webhook. The pipeline has 6 stages:

```
1. Checkout        — pull latest code from GitHub
2. Set Image Tag   — git rev-parse --short HEAD (e.g. a3f9d2c)
3. Build Images    — docker build × 5 (parallel)
4. Login to ECR    — aws ecr get-login-password | docker login
5. Push to ECR     — docker push :SHA + :latest × 5 (parallel)
6. Deploy to ECS   — per service:
                       describe-task-definition (fetch current from AWS)
                       jq — strip read-only fields, inject new image URI
                       register-task-definition (new revision)
                       update-service --task-definition <pinned ARN>
7. Verify          — aws ecs wait services-stable × 3 clusters
```

IMAGE_TAG is the git commit SHA — every ECR image maps to an exact commit. Rolling back means deploying a previous task definition revision.

### Task Definition Files

`task-definitions/` contains JSON skeletons for all 5 services. These are used to seed the **first** task definition registration in the AWS Console. After that, the pipeline reads the live definition from AWS via `describe-task-definition` and only swaps the image — Console changes (env vars, scaling) are preserved across deploys.

---

## Running Locally

### Prerequisites
- Docker Desktop running

### Start all services

```bash
docker compose up --build
```

Open [http://localhost](http://localhost)

### Default credentials

```
Username: admin
Password: admin123
```

All other users registered via the UI are regular users.

### Role capabilities

| Capability | User | Admin |
|---|---|---|
| Browse products | Yes | Yes |
| Add to cart | Yes | Yes |
| Place order | Yes | Yes |
| View orders | Yes | Yes |
| Delete orders | Yes | Yes |
| Add products | No | Yes |
| Delete products | No | Yes |

---

## Project Structure

```
ShopNow-ECS/
├── auth_service/           # JWT auth — register, login
├── product_service/        # Product catalog + S3 image uploads
├── cart_service/           # Redis cart — add, remove, clear
├── order_service/          # Checkout — clears cart after order
├── frontend/               # React SPA + nginx reverse proxy
│   └── nginx.conf          # Proxies /api/* to backend services
├── task-definitions/       # ECS task definition JSON skeletons
│   ├── auth-service.json
│   ├── product-service.json
│   ├── cart-service.json
│   ├── order-service.json
│   └── frontend.json
├── Jenkinsfile             # CI/CD pipeline
├── docker-compose.yml      # Local orchestration
└── default.env             # Environment variable reference
```

---

## API Reference

### Auth (`/api/auth`)
| Method | Path | Body | Auth | Description |
|---|---|---|---|---|
| POST | `/api/auth/register` | `{username, password}` | — | Create account |
| POST | `/api/auth/login` | `{username, password}` | — | Returns JWT token |

### Products (`/api/products`)
| Method | Path | Body | Auth | Description |
|---|---|---|---|---|
| GET | `/api/products` | — | Any user | List all products |
| POST | `/api/products` | `multipart/form-data` | Admin | Add product with image |
| DELETE | `/api/products/:id` | — | Admin | Delete product + S3 image |

### Cart (`/api/cart`)
| Method | Path | Body | Auth | Description |
|---|---|---|---|---|
| GET | `/api/cart/:userId` | — | Any user | Get user cart |
| POST | `/api/cart/:userId` | `{productId, name, price, quantity, image_url}` | Any user | Add item |
| DELETE | `/api/cart/:userId/:productId` | — | Any user | Remove item |
| DELETE | `/api/cart/:userId` | — | Any user | Clear full cart |

### Orders (`/api/orders`)
| Method | Path | Body | Auth | Description |
|---|---|---|---|---|
| POST | `/api/orders` | — | Any user | Checkout — creates order, clears cart |
| GET | `/api/orders/:userId` | — | Any user | List user orders |
| DELETE | `/api/orders/:orderId` | — | Any user | Delete order |

---

## Authentication Flow

```
Login → JWT issued (1h expiry)
     → stored in localStorage (AES encrypted via crypto-js)
     → decoded client-side to check expiry on app load
     → sent as Bearer token on every API request
     → verified locally in each service (shared JWT_SECRET)
     → on expiry → auto logout
```

JWT is verified locally in each backend service using the shared `JWT_SECRET` — no HTTP call to auth-service per request.

---

## Image Upload Flow

**Local (docker-compose):**
```
Admin uploads image
  → multer writes to /app/uploads (container disk)
  → URL stored as /uploads/filename.jpg
  → nginx proxies /uploads → product-service static files
```

**AWS (Fargate):**
```
Admin uploads image
  → multer-s3 streams directly to S3 bucket
  → URL stored as https://<cloudfront-domain>/filename.jpg
  → browser fetches image directly from CloudFront (bypasses nginx)
```

Storage mode is selected automatically based on the `S3_BUCKET` environment variable.

---

## Environment Variables

### auth-service
| Variable | Description |
|---|---|
| `DB_HOST` | RDS endpoint |
| `DB_PORT` | `5432` |
| `DB_NAME` | `shopnow_auth` |
| `DB_USER` | RDS master username |
| `DB_PASSWORD` | RDS master password |
| `JWT_SECRET` | Shared secret for signing/verifying JWTs |

### product-service
| Variable | Description |
|---|---|
| `DB_HOST` | RDS endpoint |
| `DB_NAME` | `shopnow_products` |
| `DB_USER` / `DB_PASSWORD` | RDS credentials |
| `JWT_SECRET` | Shared JWT secret |
| `S3_BUCKET` | `shopnow-product-images` |
| `AWS_REGION` | `eu-west-1` |
| `CLOUDFRONT_DOMAIN` | CloudFront distribution domain |

### cart-service
| Variable | Description |
|---|---|
| `REDIS_HOST` | ElastiCache primary endpoint |
| `REDIS_PORT` | `6379` |
| `JWT_SECRET` | Shared JWT secret |

### order-service
| Variable | Description |
|---|---|
| `DB_HOST` | RDS endpoint |
| `DB_NAME` | `shopnow_orders` |
| `DB_USER` / `DB_PASSWORD` | RDS credentials |
| `JWT_SECRET` | Shared JWT secret |
| `CART_SERVICE_URL` | `http://cart-service:3003` |

---

## From-Scratch AWS Provisioning Guide

Follow every step in order. Complete one section fully before moving to the next.

---

### 0 — Values to collect as you go

Keep these handy — you will need them in later steps.

| What | Where to find it | Your value |
|---|---|---|
| Account ID | Top-right of AWS Console | e.g. `414392949441` |
| RDS endpoint | RDS → shopnow-db → Connectivity | e.g. `shopnow-db.xxxx.eu-west-1.rds.amazonaws.com` |
| ElastiCache endpoint | ElastiCache → shopnow-redis → Details | e.g. `shopnow-redis.xxxx.cfg.euw1.cache.amazonaws.com` |
| CloudFront domain | CloudFront → distribution → Domain name | e.g. `d1abc123.cloudfront.net` |
| S3 bucket name | S3 → bucket | `shopnow-product-images-<suffix>` |
| ecsTaskExecutionRole ARN | IAM → Roles | `arn:aws:iam::<ACCOUNT_ID>:role/ecsTaskExecutionRole` |

---

### 1 — IAM

#### 1.1 — Create ecsTaskExecutionRole

1. IAM → Roles → **Create role**
2. Trusted entity type → **AWS service**
3. Use case → **Elastic Container Service Task** → Next
4. Attach policies:
   - `AmazonECSTaskExecutionRolePolicy`
   - `CloudWatchLogsFullAccess`
5. Role name → `ecsTaskExecutionRole` → **Create role**
6. Open the role → copy the **ARN** — save it

#### 1.2 — Create shopnow-jenkins IAM user

1. IAM → Users → **Create user**
2. Username → `shopnow-jenkins`
3. **Next** (no console access needed)
4. Attach policies directly:
   - `AmazonEC2ContainerRegistryFullAccess`
   - `AmazonECS_FullAccess`
   - `AmazonS3FullAccess`
5. **Create user**
6. Open the user → Security credentials → **Create access key**
7. Use case → **Other** → **Create**
8. Download / copy the Access Key ID and Secret — save them (shown once only)

---

### 2 — ECR Repositories

Search bar → **ECR** → **Create repository** — repeat for all 5:

| Repository name | Visibility |
|---|---|
| `shopnow/auth-service` | Private |
| `shopnow/product-service` | Private |
| `shopnow/cart-service` | Private |
| `shopnow/order-service` | Private |
| `shopnow/frontend` | Private |

Settings for each: all defaults, click **Create repository**.

---

### 3 — S3 + CloudFront

#### 3.1 — S3 bucket

1. S3 → **Create bucket**
2. Bucket name → `shopnow-product-images-<your-suffix>` (must be globally unique)
3. Region → `eu-west-1`
4. **Block all public access** → leave checked (CloudFront will access it)
5. **Create bucket**

#### 3.2 — CloudFront distribution

1. CloudFront → **Create distribution**
2. Origin domain → select your S3 bucket from dropdown
3. Origin access → **Origin access control settings (recommended)**
4. Click **Create new OAC** → Create
5. Copy the S3 bucket policy shown → go to S3 → your bucket → Permissions → Bucket policy → paste → Save
6. Viewer protocol policy → **Redirect HTTP to HTTPS**
7. Price class → **Use only North America and Europe**
8. **Create distribution**
9. Copy the **Distribution domain name** (e.g. `d1abc123.cloudfront.net`) — save it

---

### 4 — Networking

Region: **eu-west-1** for everything.

#### 4.1 — VPC

1. VPC → Your VPCs → **Create VPC**
2. Name → `shopnow-vpc`
3. IPv4 CIDR → `10.0.0.0/16`
4. **Create VPC**

#### 4.2 — Subnets (create 4)

VPC → Subnets → **Create subnet** → select `shopnow-vpc`

| Name | AZ | CIDR |
|---|---|---|
| `shopnow-public-subnet` | eu-west-1a | `10.0.1.0/24` |
| `shopnow-public-subnet-b` | eu-west-1b | `10.0.2.0/24` |
| `shopnow-private-subnet` | eu-west-1a | `10.0.3.0/24` |
| `shopnow-private-subnet-b` | eu-west-1b | `10.0.4.0/24` |

Create all 4 in one form by clicking **Add new subnet** for each.

#### 4.3 — Internet Gateway

1. VPC → Internet gateways → **Create internet gateway**
2. Name → `shopnow-igw` → **Create**
3. Actions → **Attach to VPC** → select `shopnow-vpc` → Attach

#### 4.4 — Route tables

**Public route table:**

1. VPC → Route tables → **Create route table**
2. Name → `shopnow-public-rt` → VPC → `shopnow-vpc` → Create
3. Select it → **Routes** tab → **Edit routes** → **Add route**
   - Destination: `0.0.0.0/0` → Target: `shopnow-igw` → Save
4. **Subnet associations** tab → **Edit subnet associations**
   - Select `shopnow-public-subnet` AND `shopnow-public-subnet-b` → Save

**Private route table:**

1. Create route table → Name `shopnow-private-rt` → VPC `shopnow-vpc` → Create
2. **Subnet associations** → Edit → select `shopnow-private-subnet` AND `shopnow-private-subnet-b` → Save
3. Routes will get the NAT Gateway added in step 4.6 below

#### 4.5 — Elastic IP

1. VPC → Elastic IPs → **Allocate Elastic IP address**
2. Region: `eu-west-1`
3. **Allocate** → note the allocation ID

#### 4.6 — NAT Gateway

1. VPC → NAT Gateways → **Create NAT gateway**
2. Name → `shopnow-nat`
3. Subnet → `shopnow-public-subnet` (public — important)
4. Connectivity type → **Public**
5. Elastic IP → select the one you just allocated
6. **Create NAT gateway** — wait for status **Available** (~1 min)
7. VPC → Route tables → `shopnow-private-rt` → Routes → **Edit routes** → Add route
   - Destination: `0.0.0.0/0` → Target: select the NAT gateway → Save

#### 4.7 — Security Groups (create 5)

VPC → Security groups → **Create security group** — do this for each:

**shopnow-alb-sg**
- VPC: `shopnow-vpc`
- Inbound: HTTP (80) from `0.0.0.0/0`
- Outbound: All traffic

**shopnow-frontend-sg**
- VPC: `shopnow-vpc`
- Inbound: HTTP (80) from `shopnow-alb-sg`
- Outbound: All traffic

**shopnow-backend-sg**
- VPC: `shopnow-vpc`
- Inbound: Custom TCP 3001–3004 from `10.0.0.0/16`
- Outbound: All traffic

**shopnow-rds-sg**
- VPC: `shopnow-vpc`
- Inbound: PostgreSQL (5432) from `shopnow-backend-sg`
- Outbound: All traffic

**shopnow-redis-sg**
- VPC: `shopnow-vpc`
- Inbound: Custom TCP (6379) from `shopnow-backend-sg`
- Outbound: All traffic

---

### 5 — RDS PostgreSQL

#### 5.1 — Subnet group

1. RDS → Subnet groups → **Create DB subnet group**
2. Name → `shopnow-db-subnet-group`
3. VPC → `shopnow-vpc`
4. AZs → `eu-west-1a` and `eu-west-1b`
5. Subnets → `shopnow-private-subnet` + `shopnow-private-subnet-b`
6. **Create**

#### 5.2 — RDS instance

1. RDS → **Create database**
2. Engine → **PostgreSQL** — version **18**
3. Template → **Free tier**
4. DB instance identifier → `shopnow-db`
5. Master username → `shopnow_user`
6. Master password → your chosen password (save it)
7. Instance class → `db.t4g.micro`
8. Storage → 20 GiB gp2, enable autoscaling
9. **Connectivity:**
   - VPC → `shopnow-vpc`
   - Subnet group → `shopnow-db-subnet-group`
   - Public access → **No**
   - VPC security group → remove default, add `shopnow-rds-sg`
10. Additional configuration → Initial database name → `shopnow`
11. **Create database** — wait ~10 min for status **Available**
12. Copy the **Endpoint** — save it

---

### 6 — ElastiCache Redis

#### 6.1 — Subnet group

1. ElastiCache → Subnet groups → **Create subnet group**
2. Name → `shopnow-redis-subnet-group`
3. VPC → `shopnow-vpc`
4. Subnets → `shopnow-private-subnet`
5. **Create**

#### 6.2 — Redis cluster

1. ElastiCache → Redis OSS caches → **Create**
2. Design your own → Easy create off → **Next**
3. Cluster mode → **Disabled**
4. Name → `shopnow-redis`
5. Engine version → 7.x
6. Node type → `cache.t3.micro`
7. Replicas → `0`
8. Subnet group → `shopnow-redis-subnet-group`
9. Security groups → `shopnow-redis-sg`
10. **Create** — wait for status **Available**
11. Copy the **Primary endpoint** (without port) — save it

---

### 7 — Cloud Map Namespace

1. AWS Cloud Map → Namespaces → **Create namespace**
2. Namespace name → `shopnow.local`
3. Instance discovery → **API calls and DNS queries in VPCs**
4. VPC → `shopnow-vpc`
5. **Create namespace**

---

### 8 — ECS Clusters (create 3)

ECS → Clusters → **Create cluster** — repeat for each:

| Cluster name | Namespace |
|---|---|
| `shopnow-auth-cluster` | `shopnow.local` |
| `shopnow-products-cluster` | `shopnow.local` |
| `shopnow-core-cluster` | `shopnow.local` |

Settings for each:
- Infrastructure → **AWS Fargate**
- Monitoring → enable Container Insights (optional)
- Under **Service Connect defaults** → enable → select `shopnow.local` namespace

---

### 9 — Task Definitions (create 5)

ECS → Task definitions → **Create new task definition with JSON**

For each service paste the corresponding JSON from `task-definitions/` and replace:
- `ACCOUNT_ID` → your AWS Account ID
- `IMAGE_TAG` → `latest`
- `REPLACE_DB_HOST` → your RDS endpoint
- `REPLACE_DB_USER` → `shopnow_user`
- `REPLACE_DB_PASSWORD` → your RDS password
- `REPLACE_JWT_SECRET` → `microservices-shopnow-super-secret-jwt-key-2026`
- `REPLACE_REDIS_HOST` → your ElastiCache primary endpoint (without port)

Files to use:

| File | Task family |
|---|---|
| `task-definitions/auth-service.json` | `auth-service` |
| `task-definitions/product-service.json` | `product-service` |
| `task-definitions/cart-service.json` | `cart-service` |
| `task-definitions/order-service.json` | `order-service` |
| `task-definitions/frontend.json` | `frontend` |

Also set for product-service:
- `S3_BUCKET` → your S3 bucket name
- `CLOUDFRONT_DOMAIN` → your CloudFront domain

---

### 10 — ECS Services (create 5)

Create one service per cluster. Navigate to each cluster → **Create service**.

Common settings for all:
- Launch type → **Fargate / LATEST**
- Subnets → `shopnow-private-subnet` only
- Public IP → **Turned off**
- Service Connect → **Enabled** → namespace `shopnow.local`

| Service name | Cluster | Task definition | SG | Service Connect mode |
|---|---|---|---|---|
| `auth-service` | `shopnow-auth-cluster` | `auth-service` | `shopnow-backend-sg` | Client and server |
| `product-service` | `shopnow-products-cluster` | `product-service` | `shopnow-backend-sg` | Client and server |
| `cart-service` | `shopnow-core-cluster` | `cart-service` | `shopnow-backend-sg` | Client and server |
| `order-service` | `shopnow-core-cluster` | `order-service` | `shopnow-backend-sg` | Client and server |
| `frontend` | `shopnow-core-cluster` | `frontend` | `shopnow-frontend-sg` | **Client only** |

For **Client and server** services, set the port alias to match the service name and port (e.g. `auth-service` → port `3001`).

---

### 11 — ALB + Target Group

#### 11.1 — Target group

1. EC2 → Target groups → **Create target group**
2. Target type → **IP addresses**
3. Name → `shopnow-frontend-tg`
4. Protocol → HTTP, Port → 80
5. VPC → `shopnow-vpc`
6. Health check path → `/`
7. **Next** → skip registering targets → **Create target group**

#### 11.2 — Application Load Balancer

1. EC2 → Load Balancers → **Create load balancer** → **Application Load Balancer**
2. Name → `shopnow-alb`
3. Scheme → **Internet-facing**
4. IP address type → **IPv4**
5. VPC → `shopnow-vpc`
6. AZs → select **eu-west-1a** (`shopnow-public-subnet`) + **eu-west-1b** (`shopnow-public-subnet-b`)
7. Security groups → remove default → add `shopnow-alb-sg`
8. Listener HTTP:80 → Forward to `shopnow-frontend-tg`
9. **Create load balancer**

#### 11.3 — Attach ALB to frontend service

1. ECS → `shopnow-core-cluster` → Services → `frontend` → **Update service**
2. Load balancing section → **Add load balancer**
3. Load balancer type → Application Load Balancer
4. Load balancer → `shopnow-alb`
5. Listener → `HTTP:80`
6. Target group → `shopnow-frontend-tg`
7. **Update**

---

### 12 — Jenkins Setup

1. Open Jenkins → `http://localhost:8080`
2. Credentials → System → Global → **Add credentials**
   - Kind: **AWS Credentials**
   - ID: `aws-credentials`
   - Access Key ID / Secret: from the `shopnow-jenkins` IAM user
3. **Add credentials** again:
   - Kind: **Username with password**
   - ID: `github-credentials`
   - Username: your GitHub username
   - Password: your GitHub personal access token
4. Create a **Pipeline** job → Pipeline from SCM → Git
5. Repository URL → `https://github.com/cedrick13bienvenue/ShopNow-ECS`
6. Credentials → `github-credentials`
7. Branch → `*/main`
8. Script path → `Jenkinsfile`
9. **Save** → click **Build Now**

---

### 13 — Verify

1. Wait for Jenkins build to show **SUCCESS**
2. EC2 → Load Balancers → `shopnow-alb` → copy **DNS name**
3. Open in browser → login with `admin / admin123`

---

### Pause / Resume

**To pause (saves ~$2/day):**

1. ECS → each cluster → each service → Update → desired tasks = `0`
2. RDS → `shopnow-db` → Actions → **Stop temporarily**
3. ElastiCache → `shopnow-redis` → **Delete** (no backup needed)
4. VPC → NAT Gateways → `shopnow-nat` → **Delete**
5. VPC → Elastic IPs → release the unassociated IP

**To resume:**

1. RDS → `shopnow-db` → Actions → **Start** → wait for Available
2. Recreate ElastiCache (step 6.2 above)
3. Allocate new Elastic IP → recreate NAT Gateway (step 4.5–4.6) → update private route table
4. ECS → each service → Update → desired tasks = `1`
5. Jenkins → **Build Now**
