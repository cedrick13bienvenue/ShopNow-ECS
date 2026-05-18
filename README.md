# ShopNow — Microservices on AWS ECS

A containerized e-commerce platform built with Node.js microservices, deployed on AWS ECS Fargate across three clusters using ECS Service Connect for cross-cluster communication.

## Architecture

```
                         INTERNET
                             │
                    ┌────────▼────────┐
                    │      ALB        │  port 80, public subnet
                    └────────┬────────┘
                             │
        ╔════════════════════▼═══════════════════════╗
        ║         VPC  10.0.0.0/16  (eu-west-1)      ║
        ║                                            ║
        ║  ┌──────────────────────────────────────┐  ║
        ║  │           PRIVATE SUBNET             │  ║
        ║  │                                      │  ║
        ║  │  shopnow-core-cluster                │  ║
        ║  │  ┌──────────────────────────────┐   │  ║
        ║  │  │ frontend :80  (nginx)         │   │  ║
        ║  │  │  proxies /api/* via           │   │  ║
        ║  │  │  Service Connect              │   │  ║
        ║  │  └──────┬───────────────────┬───┘   │  ║
        ║  │         │                   │        │  ║
        ║  │  ┌──────▼──────┐   ┌───────▼──────┐ │  ║
        ║  │  │ cart  :3003 │   │ order :3004  │ │  ║
        ║  │  └─────────────┘   └──────────────┘ │  ║
        ║  │                                      │  ║
        ║  │  shopnow-auth-cluster                │  ║
        ║  │  ┌─────────────┐                    │  ║
        ║  │  │ auth  :3001 │                    │  ║
        ║  │  └─────────────┘                    │  ║
        ║  │                                      │  ║
        ║  │  shopnow-products-cluster            │  ║
        ║  │  ┌───────────────────┐               │  ║
        ║  │  │ product :3002     │──→ S3/CF      │  ║
        ║  │  └───────────────────┘               │  ║
        ║  │                                      │  ║
        ║  │  DATA LAYER                          │  ║
        ║  │  ┌──────────────┐  ┌──────────────┐ │  ║
        ║  │  │ RDS Postgres │  │  ElastiCache │ │  ║
        ║  │  │ shopnow_auth │  │    Redis     │ │  ║
        ║  │  │ shopnow_prod │  │ (cart sess.) │ │  ║
        ║  │  │ shopnow_ord  │  └──────────────┘ │  ║
        ║  │  └──────────────┘                   │  ║
        ║  └──────────────────────────────────────┘  ║
        ║                                            ║
        ║  PUBLIC SUBNET                             ║
        ║  ┌──────────┐  ┌─────────────┐            ║
        ║  │   ALB    │  │ NAT Gateway │            ║
        ║  └──────────┘  └─────────────┘            ║
        ╚════════════════════════════════════════════╝

OUTSIDE VPC:
├── ECR          — 5 private Docker image repositories
├── S3           — product image storage
├── CloudFront   — CDN in front of S3
└── Cloud Map    — shopnow.local namespace (Service Connect)
```

Service Connect registers all services under the `shopnow.local` namespace. Each service reaches others by name (e.g. `http://cart-service:3003`) — Envoy sidecars are injected automatically by ECS.

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
