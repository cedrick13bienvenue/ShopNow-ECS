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
