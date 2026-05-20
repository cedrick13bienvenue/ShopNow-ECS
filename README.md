# ShopNow — Microservices E-Commerce on AWS ECS

5-service Node.js e-commerce app deployed on AWS ECS Fargate.
ECS Service Connect handles inter-service communication via the `shopnow.local` namespace.

---

## Architecture

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
