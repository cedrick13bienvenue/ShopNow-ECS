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
