# ShopNow — Microservices on AWS ECS

A containerized e-commerce platform built with Node.js microservices, deployed on AWS ECS (Fargate) across three clusters using ECS Service Connect for cross-cluster communication.

## Architecture

```
                        ┌─────────────────────────────────────────────┐
                        │              Cluster 1 (Frontend)            │
                        │   ┌───────────┐                              │
Browser ──────────────▶ │   │  Frontend │  React + Nginx               │
                        │   │  (port 80)│                              │
                        └───┴─────┬─────┴──────────────────────────────┘
                                  │ proxies /api/*
          ┌───────────────────────┼──────────────────────────┐
          │                       │                          │
          ▼                       ▼                          ▼
┌──────────────────┐   ┌─────────────────────┐   ┌───────────────────────┐
│  Cluster 2       │   │  Cluster 2           │   │  Cluster 3            │
│  Auth Service    │   │  Product Service     │   │  Cart Service         │
│  port 3001       │   │  port 3002           │   │  port 3003            │
│  ┌────────────┐  │   │  ┌────────────────┐  │   │  ┌─────────────────┐  │
│  │  Postgres  │  │   │  │    Postgres    │  │   │  │      Redis      │  │
│  └────────────┘  │   │  └────────────────┘  │   │  └─────────────────┘  │
└──────────────────┘   └─────────────────────┘   └───────────────────────┘
                                                          │
                                               ┌──────────┴──────────┐
                                               │     Cluster 3        │
                                               │  Order Service       │
                                               │  port 3004           │
                                               │  ┌───────────────┐   │
                                               │  │   Postgres    │   │
                                               │  └───────────────┘   │
                                               └──────────────────────┘
```

Cross-cluster calls use ECS Service Connect via a shared AWS Cloud Map namespace. Locally, Docker handles service discovery via a shared bridge network.

## Services

| Service | Port | Storage | Responsibility |
|---|---|---|---|
| `auth_service` | 3001 | Postgres | Register, login, JWT issue & verify |
| `product_service` | 3002 | Postgres + Filesystem | Product catalog, image uploads |
| `cart_service` | 3003 | Redis | Per-user session cart (1h TTL) |
| `order_service` | 3004 | Postgres | Checkout, cross-service cart fetch |
| `frontend` | 80 | — | React SPA served by Nginx |

## Tech Stack

**Backend:** Node.js 20 · TypeScript · Express · JWT  
**Frontend:** React 18 · TypeScript · Vite · Tailwind CSS v4  
**Storage:** PostgreSQL 15 · Redis 7  
**Infrastructure:** Docker · AWS ECS Fargate · AWS Cloud Map  
**CI/CD:** Jenkins

## Running Locally

### Prerequisites
- Docker Desktop running

### Start all services

```bash
docker compose up --build
```

Open [http://localhost](http://localhost)

### Seed admin credentials

An admin user is seeded automatically on first run:

```
Username: admin
Password: admin123
```

All other users registered via the UI are regular users.

### Role differences

| Capability | Regular User | Admin |
|---|---|---|
| Browse products | Yes | Yes |
| Add to cart | Yes | Yes |
| Place order | Yes | Yes |
| Add new products | No | Yes |

## Project Structure

```
ShopNow-ECS/
├── auth_service/        # JWT auth — register, login, verify
├── product_service/     # Product catalog + image uploads (multer)
├── cart_service/        # Redis cart — add, remove, fetch
├── order_service/       # Checkout — cross-cluster cart fetch
├── frontend/            # React + Nginx — SPA with dark mode
├── docker-compose.yml   # Local orchestration
└── default.env          # AWS environment variable reference
```

## API Reference

### Auth (`/api/auth`)
| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/api/auth/register` | `{username, password}` | Create account |
| POST | `/api/auth/login` | `{username, password}` | Get JWT token |
| GET | `/api/auth/verify` | — | Validate token (Bearer) |

### Products (`/api/products`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/products` | Any user | List all products |
| POST | `/api/products` | Admin only | Add product (multipart/form-data with image) |

### Cart (`/api/cart`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/cart/:userId` | Any user | Get user cart |
| POST | `/api/cart/:userId` | Any user | Add item to cart |
| DELETE | `/api/cart/:userId/:productId` | Any user | Remove item |

### Orders (`/api/orders`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/orders` | Any user | Checkout (fetches cart, creates order) |
| GET | `/api/orders/:userId` | Any user | List user orders |

## Authentication Flow

```
Login → JWT issued (1h expiry) → stored in localStorage
Every request → Bearer token → service calls Auth /api/auth/verify
Logout → localStorage cleared → token invalidated client-side
```

## Coming Soon

- Jenkinsfile — build, push to ECR, deploy to ECS
- Terraform — VPC, subnets, 3 ECS clusters, Cloud Map namespace
- ECS Task Definitions
- S3 + CloudFront for product image storage
