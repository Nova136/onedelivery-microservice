# OneDelivery Microservices

NestJS microservices for the **OneDelivery** platform (Agentic AI for Customer Service). Aligned with the [Architecting AI Systems - Practice Module](Architecting%20AI%20Systems%20-%20Practice%20Module.pdf) and [NestJS Microservices](https://docs.nestjs.com/microservices/basics).

## Microservices

| Service       | Port | Role                                                |
| ------------- | ---- | --------------------------------------------------- |
| **Order**     | 3001 | Order lifecycle: create, get, list                  |
| **Logistics** | 3002 | Delivery tracking, status updates, delay prediction |
| **Payment**   | 3003 | Process payment, refund, get payment                |
| **Audit**     | 3004 | Audit logging, incident logging, query audit trail  |

Each service runs as a **TCP microservice** and exposes **message patterns** (e.g. `order.get`, `logistics.track`, `payment.refund`, `audit.log`) for other apps or an API gateway to call.

## SonarCloud

Per-app analysis on [SonarCloud](https://sonarcloud.io/organization/nova136) (`nova136`). Badges use the [SonarCloud badge API](https://docs.sonarsource.com/sonarqube-cloud/managing-your-projects/project-dashboard/#badges) (default branch).

| Module                 | Quality Gate                                                                                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **audit**              | [![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=nova136_onedelivery-audit&metric=alert_status)](https://sonarcloud.io/dashboard?id=nova136_onedelivery-audit)                           |
| **guardian-agent**     | [![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=nova136_onedelivery-guardian-agent&metric=alert_status)](https://sonarcloud.io/dashboard?id=nova136_onedelivery-guardian-agent)         |
| **incident**           | [![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=nova136_onedelivery-incident&metric=alert_status)](https://sonarcloud.io/dashboard?id=nova136_onedelivery-incident)                     |
| **knowledge**          | [![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=nova136_onedelivery-knowledge&metric=alert_status)](https://sonarcloud.io/dashboard?id=nova136_onedelivery-knowledge)                   |
| **logistics**          | [![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=nova136_onedelivery-logistics&metric=alert_status)](https://sonarcloud.io/dashboard?id=nova136_onedelivery-logistics)                   |
| **logistics-agent**    | [![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=nova136_onedelivery-logistics-agent&metric=alert_status)](https://sonarcloud.io/dashboard?id=nova136_onedelivery-logistics-agent)       |
| **orchestrator-agent** | [![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=nova136_onedelivery-orchestrator-agent&metric=alert_status)](https://sonarcloud.io/dashboard?id=nova136_onedelivery-orchestrator-agent) |
| **order**              | [![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=nova136_onedelivery-order&metric=alert_status)](https://sonarcloud.io/dashboard?id=nova136_onedelivery-order)                           |
| **payment**            | [![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=nova136_onedelivery-payment&metric=alert_status)](https://sonarcloud.io/dashboard?id=nova136_onedelivery-payment)                       |
| **qa-agent**           | [![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=nova136_onedelivery-qa-agent&metric=alert_status)](https://sonarcloud.io/dashboard?id=nova136_onedelivery-qa-agent)                     |
| **resolution-agent**   | [![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=nova136_onedelivery-resolution-agent&metric=alert_status)](https://sonarcloud.io/dashboard?id=nova136_onedelivery-resolution-agent)     |
| **user**               | [![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=nova136_onedelivery-user&metric=alert_status)](https://sonarcloud.io/dashboard?id=nova136_onedelivery-user)                             |

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
├── docker-compose.yml       # Postgres, RabbitMQ, LocalStack, Kong (API gateway)
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

**Health check:** Each service exposes **GET /health** on its HTTP port (port 80 in containers; 3001–3004 when running locally via `npm run *:start:dev`). Returns `200` and `{ status: 'ok', service: 'order' }` (or logistics/payment/audit). Used by the ALB target group health checks when deployed.

## Database (per-service schemas and tables)

Each microservice uses the same Postgres database with **its own schema** and tables:

| Schema      | Tables                            | Service   |
| ----------- | --------------------------------- | --------- |
| `order`     | `orders`, `order_items`           | Order     |
| `logistics` | `deliveries`, `delivery_tracking` | Logistics |
| `payment`   | `payments`, `refunds`             | Payment   |
| `audit`     | `audit_events`                    | Audit     |
| `incident`  | `incidents`                       | Incident  |

Set `DATABASE_URL` (e.g. in `.env`) so all apps connect to the same DB. TypeORM is configured with `schema` and `synchronize: true` in development so tables are created/updated on startup.

**Incident migration:** If you had data in `audit.incidents` before moving to the incident microservice, run once: `node scripts/migrate-incidents-to-incident-schema.js` (with `DATABASE_URL` set). This creates the `incident` schema and copies rows from `audit.incidents` to `incident.incidents`.

## Seeding data per microservice

Each microservice has its own **seed script** and **TypeORM seeder**:

- **Order**: seed entry `apps/order/seed.ts`, data in `apps/order/src/database/seeds/order.seed.ts`
- **Logistics**: seed entry `apps/logistics/seed.ts`, data in `apps/logistics/src/database/seeds/product.seed.ts`
- **Payment**: seed entry `apps/payment/seed.ts`, data in `apps/payment/src/database/seeds/payment.seed.ts`
- **User**: seed entry `apps/user/seed.ts`, data in `apps/user/src/database/seeds/user.seed.ts`
- **Incident**: seed entry `apps/incident/seed.ts`, data in `apps/incident/src/database/seeds/incidents.seed.ts`
- **Audit**: seed entry `apps/audit/seed.ts`, data in `apps/audit/src/database/seeds/audit-event.seed.ts`

All seeders implement the `Seeder` interface from `typeorm-extension` and insert rows via a repository. To **change the initial data**:

1. **Edit the seeder file** for the service and adjust the array of objects (e.g. add products in `product.seed.ts`, change seed users in `user.seed.ts`, etc.).
2. **Keep the guard that checks for existing rows** (the `repo.count()` check) so running the seeder twice does not duplicate data. If you want to re-seed from scratch, truncate the table (or drop/recreate the DB) before running again.
3. **Run the service-specific seed script** from the repo root (Docker compose + `.env` must already be up):
    - `npm run seed-order`
    - `npm run seed-logistics`
    - `npm run seed-payment`
    - `npm run seed-user`
    - `npm run seed-incident`
    - `npm run seed-audit`
    - `npm run seed-knowledge`
4. To seed **everything at once**, run: `npm run seeding-all-datas`.

## Local stack (Postgres, RabbitMQ, LocalStack, Kong)

Docker Compose runs **PostgreSQL**, **RabbitMQ** (event bus), **LocalStack** (S3 + SNS), and **Kong** (API gateway) for local development.

| Service    | Port(s)                            | Purpose                                                       |
| ---------- | ---------------------------------- | ------------------------------------------------------------- |
| **Kong**   | 8000 (proxy), 8001 (admin)         | API gateway — **point the frontend to http://localhost:8000** |
| Postgres   | 5432                               | Database                                                      |
| RabbitMQ   | 5672 (AMQP), 15672 (Management UI) | Event bus / message broker                                    |
| LocalStack | 4566                               | S3 and SNS (AWS-compatible)                                   |

**Kong routes (path prefix stripped when proxying):** `/order` → order:3001, `/logistics` → logistics:3002, `/payment` → payment:3003, `/audit` → audit:3004, `/user` → user:3005. Run microservices on the host with `npm run start:all`, then the frontend can call e.g. `http://localhost:8000/order/health`, `http://localhost:8000/user/login`, etc.

**Start the stack:**

```bash
cp .env.example .env   # optional: adjust credentials/ports
docker compose up -d
```

**Database schemas:** One schema per microservice (`order`, `logistics`, `payment`, `audit`). They are created on first Postgres init by `scripts/init-schemas.sql`. If the DB already existed before adding that script, run the SQL once manually or recreate the volume (`docker compose down -v && docker compose up -d`).

**Endpoints:**

- **Kong (gateway):** `http://localhost:8000` — Use this as the base URL for the frontend. Routes: `/order`, `/logistics`, `/payment`, `/audit`, `/user`.
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

## Updating ECS Variable via terraform

Update new variable on ./infrastructure/ecs.tf
Then execute the update
export AWS_PROFILE=onedelivery
terraform plan -out=tfplan  
terraform apply tfplan

account_id = "542829982577"
alb_dns_name = "onedelivery-alb-870475991.ap-southeast-1.elb.amazonaws.com"
alb_zone_id = "Z1LMS91P8CMLE5"
api_gateway_id = "q08c0f2i55"
api_gateway_invoke_url = "https://q08c0f2i55.execute-api.ap-southeast-1.amazonaws.com"
ecs_cluster_arn = "arn:aws:ecs:ap-southeast-1:542829982577:cluster/onedelivery-cluster"
ecs_cluster_name = "onedelivery-cluster"
postgres_address = "onedelivery-postgres.chqkmym8y08l.ap-southeast-1.rds.amazonaws.com"
postgres_endpoint = <sensitive>
postgres_port = 5432
region = "ap-southeast-1"
routing_note = "API Gateway -> ALB:80 -> path-based to ECS (/order, /logistics, /payment, /audit, /user, /incident, /knowledge, /orchestrator-agent, /guardian-agent, /logistics-agent, /qa-agent). Use api_gateway_invoke_url as the API base URL."
vpc_id = "vpc-0xxxxxxxxxxxxxxxxx"
websocket_management_endpoint = "https://18gvmx3hn7.execute-api.ap-southeast-1.amazonaws.com/prod"
websocket_url = "wss://18gvmx3hn7.execute-api.ap-southeast-1.amazonaws.com/prod"

## Connecting to RDS

The RDS instance is in a private subnet (not publicly accessible). Both methods below tunnel through a running ECS task — no bastion host or public RDS exposure needed.

**Prerequisites:** Install the [SSM Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html):

```bash
brew install session-manager-plugin
```

**Step 1 — Enable ECS Exec on the service (one-time):**

```bash
export AWS_PROFILE=onedelivery
aws ecs update-service \
  --cluster onedelivery-cluster \
  --service user \
  --enable-execute-command \
  --force-new-deployment \
  --region ap-southeast-1
```

---

### Option A — psql in the container (CLI)

**Step 2 — Get the running task ID:**

```bash
aws ecs list-tasks --cluster onedelivery-cluster --service-name user \
  --region ap-southeast-1 --query 'taskArns[0]' --output text
```

**Step 3 — Exec into the container:**

```bash
aws ecs execute-command \
  --cluster onedelivery-cluster \
  --task <TASK_ID> \
  --container user \
  --interactive \
  --command "/bin/sh" \
  --region ap-southeast-1
```

**Step 4 — Inside the shell, install psql and connect:**

```sh
apk add --no-cache postgresql-client
psql "postgresql://postgres:<DB_PASSWORD>@onedelivery-postgres.chqkmym8y08l.ap-southeast-1.rds.amazonaws.com:5432/onedelivery?sslmode=require"
```

---

### Option B — pgAdmin or any GUI (automated tunnel script)

Run the script — it auto-detects the task ID and runtime ID, then opens the tunnel:

```bash
export AWS_PROFILE=onedelivery
./scripts/rds-tunnel.sh
```

Optional arguments:

```bash
# Custom service or local port
./scripts/rds-tunnel.sh user 5433
```

Once the tunnel is open, connect pgAdmin to:

| Field    | Value                |
| -------- | -------------------- |
| Host     | `localhost`          |
| Port     | `5433`               |
| Database | `onedelivery`        |
| Username | `postgres`           |
| Password | _(see `.env.cloud`)_ |
| SSL mode | `Require`            |

Press `Ctrl+C` in the tunnel terminal when done.

---

> Credentials are in `.env.cloud`. Replace `<TASK_ID>` with the value from Step 2.
> Local Postgres:
> ./scripts/truncate-seeded-tables.sh

RDS via tunnel (tunnel must already be open via ./scripts/rds-tunnel.sh):  
 ./scripts/truncate-seeded-tables.sh --cloud
