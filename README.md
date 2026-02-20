# OneDelivery Microservices

NestJS microservices for the **OneDelivery** platform (Agentic AI for Customer Service). Aligned with the [Architecting AI Systems - Practice Module](Architecting%20AI%20Systems%20-%20Practice%20Module.pdf) and [NestJS Microservices](https://docs.nestjs.com/microservices/basics).

## Microservices

| Service     | Port | Role |
|------------|------|------|
| **Order**  | 3001 | Order lifecycle: create, get, list |
| **Logistics** | 3002 | Delivery tracking, status updates, delay prediction |
| **Payment** | 3003 | Process payment, refund, get payment |
| **Audit**  | 3004 | Audit logging, incident logging, query audit trail |

Each service runs as a **TCP microservice** and exposes **message patterns** (e.g. `order.get`, `logistics.track`, `payment.refund`, `audit.log`) for other apps or an API gateway to call.

## Prerequisites

- **Node.js 24** (see `engines` in root `package.json`). Use `nvm use 24` if you use nvm (`.nvmrc` is set to `24`).

## Setup

```bash
nvm use 24
npm install
```

## Run

**Run one microservice (dev with watch):**
```bash
npm run order:start:dev      # Order @ 127.0.0.1:3001
npm run logistics:start:dev  # Logistics @ 127.0.0.1:3002
npm run payment:start:dev    # Payment @ 127.0.0.1:3003
npm run audit:start:dev      # Audit @ 127.0.0.1:3004
```

**Run all four at once:**
```bash
npm run start:all
```

**Production (no watch):**
```bash
npm run order:start
npm run logistics:start
npm run payment:start
npm run audit:start
```

## Project layout

```
onedelivery-microservice/
├── apps/
│   ├── order/       # Order microservice (port 3001)
│   ├── logistics/   # Logistics microservice (port 3002)
│   ├── payment/     # Payment microservice (port 3003)
│   └── audit/       # Audit microservice (port 3004)
├── scripts/
│   ├── init-schemas.sql     # Postgres: create order, logistics, payment, audit schemas
│   └── localstack-init.sh   # LocalStack: create S3 bucket + SNS topic
├── infrastructure/          # Terraform: Aurora Serverless v2, ECS, ALB, API Gateway
├── docker-compose.yml       # Postgres, RabbitMQ, LocalStack
├── .env.example             # Env vars for compose and apps
├── package.json             # Workspaces + scripts
├── .nvmrc                   # Node 24
└── README.md
```

## Message patterns (TCP)

Clients (e.g. API gateway or agent orchestrator) send messages to the corresponding host/port and pattern:

- **Order**: `order.get`, `order.create`, `order.list`
- **Logistics**: `logistics.track`, `logistics.update`, `logistics.predictDelay`
- **Payment**: `payment.process`, `payment.refund`, `payment.get`
- **Audit**: `audit.log`, `audit.query`, `audit.incident`

Use `ClientProxy` from `@nestjs/microservices` (e.g. with `ClientProxyFactory.create()` and TCP options) to call these from another Nest app.

## Database (per-service schemas and tables)

Each microservice uses the same Postgres database with **its own schema** and tables:

| Schema     | Tables | Service  |
|------------|--------|----------|
| `order`    | `orders`, `order_items` | Order    |
| `logistics`| `deliveries`, `delivery_tracking` | Logistics |
| `payment`  | `payments`, `refunds`   | Payment  |
| `audit`    | `audit_events`, `incidents` | Audit   |

Set `DATABASE_URL` (e.g. in `.env`) so all apps connect to the same DB. TypeORM is configured with `schema` and `synchronize: true` in development so tables are created/updated on startup.

## Local stack (Postgres, RabbitMQ, LocalStack)

Docker Compose runs **PostgreSQL**, **RabbitMQ** (event bus), and **LocalStack** (S3 + SNS) for local development.

| Service    | Port(s)        | Purpose                    |
|-----------|----------------|----------------------------|
| Postgres  | 5432           | Database                   |
| RabbitMQ  | 5672 (AMQP), 15672 (Management UI) | Event bus / message broker |
| LocalStack| 4566           | S3 and SNS (AWS-compatible) |

**Start the stack:**

```bash
cp .env.example .env   # optional: adjust credentials/ports
docker compose up -d
```

**Database schemas:** One schema per microservice (`order`, `logistics`, `payment`, `audit`). They are created on first Postgres init by `scripts/init-schemas.sql`. If the DB already existed before adding that script, run the SQL once manually or recreate the volume (`docker compose down -v && docker compose up -d`).

**Endpoints:**

- **Postgres:** `postgresql://postgres:postgres@localhost:5432/onedelivery`
- **RabbitMQ:** `amqp://rabbit:rabbit@localhost:5672` — Management UI: http://localhost:15672
- **LocalStack:** `http://localhost:4566` — Use with AWS SDK: `AWS_ENDPOINT_URL=http://localhost:4566`, region `us-east-1`, dummy keys. After startup, init creates S3 bucket `onedelivery-bucket` and SNS topic `onedelivery-events`.

**Stop:**

```bash
docker compose down
```

## Infrastructure (Terraform)

The **`infrastructure/`** folder contains Terraform for AWS (account `542829982577` by default):

- **Serverless RDS**: Aurora Serverless v2 (PostgreSQL) in private subnets
- **ECS Fargate**: Cluster and four services (order, logistics, payment, audit) with task definitions pointing at ECR images
- **Application Load Balancer**: Path-based routing (`/order*`, `/logistics*`, `/payment*`, `/audit*`) to ECS target groups
- **API Gateway HTTP API**: Public entry point → VPC Link → ALB → ECS

See [infrastructure/README.md](infrastructure/README.md) for AWS credentials (including where to save a profile and how to switch between profiles), variables, `terraform apply`, and app requirements (HTTP on port 80, `GET /health` for ALB).

## Docker & AWS ECS deployment

The repo includes Dockerfiles and a GitHub Actions workflow that builds images, pushes them to **Amazon ECR**, and triggers an **ECS** redeploy.

### Local Docker build (from repo root)

```bash
docker build -f apps/order/Dockerfile -t order:latest .
docker build -f apps/logistics/Dockerfile -t logistics:latest .
docker build -f apps/payment/Dockerfile -t payment:latest .
docker build -f apps/audit/Dockerfile -t audit:latest .
```

### GitHub Actions workflow

- **Workflow file:** [.github/workflows/deploy-ecs.yml](.github/workflows/deploy-ecs.yml)
- **Trigger:** Push to `main` or manual **workflow_dispatch**
- **Steps:** Build each app → Push to ECR (tagged with `git SHA` and `latest`) → Force new deployment on the ECS services

### Required setup

1. **AWS**
   - Create an **ECS cluster** and four **ECS services** (order, logistics, payment, audit), each using a task definition that points to the corresponding ECR image (e.g. via Terraform in `infrastructure/`).
   - Create **ECR repositories** (e.g. `onedelivery-order`, `onedelivery-logistics`, `onedelivery-payment`, `onedelivery-audit`).
   - Create a **GitHub OIDC IAM role** that GitHub Actions can assume (ECR push + ECS update-service).

2. **GitHub**
   - **Secret:** `AWS_ROLE_ARN` = ARN of that IAM role (e.g. `arn:aws:iam::542829982577:role/github-actions-ecs`).
   - **Variables (optional):** `AWS_REGION`, `ECS_CLUSTER`, ECR repo names, ECS service names. Defaults are in the workflow.

After this, pushing to `main` (or running the workflow manually) will build the four images, push them to ECR, and redeploy the four ECS services.

## Next steps

- Add an **API Gateway** (Nest HTTP app) that uses `ClientProxy` to call these microservices.
- Add persistence (DB) and shared DTOs per service.
- Wire in **Order & Logistics** and **Resolution & Refund** agents from the practice module.


