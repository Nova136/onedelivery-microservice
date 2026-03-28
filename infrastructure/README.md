# OneDelivery Infrastructure (Terraform)

Terraform for AWS: **RDS PostgreSQL**, **ECS Fargate** (12 services), **Application Load Balancer** (path-based routing), and **API Gateway HTTP API** (public entry point).

Account: `542829982577` (default in variables). Region: `ap-southeast-1`.

## Architecture overview

```
Client
  └── API Gateway HTTP API (HTTPS)
        └── VPC Link → ALB :80 (HTTP)
              ├── /order*              → ECS: order
              ├── /logistics*          → ECS: logistics
              ├── /payment*            → ECS: payment
              ├── /audit*              → ECS: audit
              ├── /user*               → ECS: user
              ├── /incident*           → ECS: incident
              ├── /knowledge*          → ECS: knowledge
              ├── /orchestrator-agent* → ECS: orchestrator-agent
              ├── /guardian-agent*     → ECS: guardian-agent
              ├── /logistics-agent*    → ECS: logistics-agent
              ├── /resolution-agent*   → ECS: resolution-agent
              └── /qa-agent*           → ECS: qa-agent
```

ALB and API Gateway are optional — controlled by `enable_alb` (default `false`).

## What gets created

| Resource | Details |
|----------|---------|
| **VPC** | New VPC; 3 public subnets for ALB + ECS, 3 private subnets for RDS; internet gateway; **no NAT gateways** |
| **ECS Cluster** | `onedelivery-cluster`; 12 Fargate services in **public subnets** (public IP via IGW — no NAT cost) |
| **RDS PostgreSQL** | v17.6, `db.t3.micro`, 20 GB GP3, private subnets, single-AZ |
| **ALB** | Internet-facing, port 80, path-based routing to all 12 target groups |
| **API Gateway** | HTTP API, `ANY /` + `ANY /{proxy+}` proxied to ALB via VPC Link |
| **CloudWatch Logs** | Log group per service (`/ecs/onedelivery-{service}`), 14-day retention |
| **IAM** | `onedelivery-ecs-exec` (pull images, write logs) + `onedelivery-ecs-task` (task permissions) |

### VPC / Subnet layout

| Subnet | CIDR | Use |
|--------|------|-----|
| onedelivery-public-a | 10.0.0.0/20 | ALB, ECS (AZ-a) |
| onedelivery-public-b | 10.0.16.0/20 | ALB, ECS (AZ-b) |
| onedelivery-public-c | 10.0.32.0/20 | ALB, ECS (AZ-c) |
| onedelivery-private-a | 10.0.64.0/20 | RDS (AZ-a) |
| onedelivery-private-b | 10.0.80.0/20 | RDS (AZ-b) |
| onedelivery-private-c | 10.0.96.0/20 | RDS (AZ-c) |

### Security groups

| SG | Inbound | Outbound |
|----|---------|----------|
| ALB | HTTP 80 + HTTPS 443 from `0.0.0.0/0` | All |
| ECS tasks | All TCP 0–65535 from ALB SG | All |
| RDS | PostgreSQL 5432 from ECS tasks SG | All |
| VPC Endpoints | HTTPS 443 from VPC CIDR | All |

### ECS services

All 12 services share the same task definition template:

| Setting | Value |
|---------|-------|
| Launch type | FARGATE |
| CPU | 256 units (0.25 vCPU) |
| Memory | 512 MB |
| Container port | 80 |
| Desired count (default) | 0 |
| Network | awsvpc, public subnets, `assign_public_ip = true` |
| Image pattern | `{account}.dkr.ecr.{region}.amazonaws.com/onedelivery-{service}:latest` |
| Logging | CloudWatch Logs driver → `/ecs/onedelivery-{service}`, 14-day retention |

Environment variables injected at runtime: `NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`, `RABBITMQ_URL`, `CORS_ORIGIN`, `DB_*`.

> **RabbitMQ** is an **external managed service** (CloudAMQP). The AMQP URL and credentials are passed as an ECS environment variable — not provisioned by this Terraform.

### ALB path routing

| Path | Priority | ECS service |
|------|----------|-------------|
| `/order`, `/order/*` | 100 | order |
| `/logistics`, `/logistics/*` | 110 | logistics |
| `/payment`, `/payment/*` | 120 | payment |
| `/audit`, `/audit/*` | 130 | audit |
| `/user`, `/user/*` | 140 | user |
| `/incident`, `/incident/*` | 150 | incident |
| `/knowledge`, `/knowledge/*` | 155 | knowledge |
| `/orchestrator-agent`, `/orchestrator-agent/*` | 160 | orchestrator-agent |
| `/guardian-agent`, `/guardian-agent/*` | 170 | guardian-agent |
| `/logistics-agent`, `/logistics-agent/*` | 180 | logistics-agent |
| `/resolution-agent`, `/resolution-agent/*` | 190 | resolution-agent |
| `/qa-agent`, `/qa-agent/*` | 200 | qa-agent |

Default rule (no path match): returns HTTP 404.

Health check per target group: `GET /health` → HTTP 200; 2 healthy / 3 unhealthy thresholds, 30 s interval.

### RDS PostgreSQL

| Setting | Value |
|---------|-------|
| Identifier | onedelivery-postgres |
| Engine | PostgreSQL 17.6 |
| Instance class | db.t3.micro (free tier eligible) |
| Storage | 20 GB GP3, encrypted |
| Multi-AZ | No (single-AZ, free tier) |
| Publicly accessible | No (private subnets only) |
| Backup retention | 7 days |
| Backup window | 03:00–04:00 UTC |
| Maintenance window | Monday 04:00–05:00 UTC |
| Performance Insights | Disabled (free tier compliance) |
| Deletion protection | `true` in prod, `false` otherwise |
| Final snapshot | Skipped in non-prod |

### Outputs

| Output | Description |
|--------|-------------|
| `api_gateway_invoke_url` | Public HTTPS entry point (e.g. `https://xxx.execute-api.ap-southeast-1.amazonaws.com`) |
| `alb_dns_name` | ALB hostname for direct access |
| `postgres_endpoint` | RDS host:port (sensitive) |
| `postgres_address` | RDS hostname only |
| `postgres_port` | 5432 |
| `ecs_cluster_name` | `onedelivery-cluster` |
| `ecs_cluster_arn` | Full cluster ARN |
| `vpc_id` | VPC ID |
| `account_id` | AWS account ID |
| `region` | Deployed region |

## Estimated monthly cost (ap-southeast-1)

| Resource | Default assumption | Est. USD/month |
|----------|--------------------|----------------|
| NAT Gateway | None (ECS in public subnets) | **$0** |
| RDS PostgreSQL | db.t3.micro + 20 GB (free tier eligible for 12 months) | **~$0** (free tier) / **~$15** after |
| ECS Fargate | `ecs_desired_count = 0` by default | **$0** (or ~$38 at count 1 each) |
| ALB | 1 ALB + ~1 LCU | **~$25** |
| API Gateway | Low volume (first 1M req/month free) | **~$0–2** |
| VPC Link | 1 link for API Gateway → ALB | **~$7** |
| Data transfer | Outbound / in-region | **~$5–20** |
| **Total (default, 0 tasks, free tier, ALB on)** | | **~$32–50** |
| **Total (`enable_alb = false`, 0 tasks, free tier)** | No ALB, no API Gateway, no VPC Link | **~$0–15** |

### Ways to reduce cost

- **`ecs_desired_count = 0`** (default) — pay nothing for Fargate until you scale up.
- **`enable_alb = false`** — skip creating ALB, API Gateway, and VPC Link; saves ~$32/month. ECS and RDS still exist; re-enable with `enable_alb = true` and re-apply.
- **No NAT** — ECS runs in public subnets with `assign_public_ip = true`; tasks reach ECR and the internet via the Internet Gateway. RDS stays in private subnets and does not need internet access.
- **Free tier RDS** — `db.t3.micro` qualifies for 750 hrs/month free for 12 months.

## Prerequisites

- Terraform >= 1.0
- AWS credentials configured (see below)
- **ECR repositories already exist** — created by the GitHub Actions pipeline on the first push to `main`. All 12 repositories must have at least one image tagged `:latest`:

  ```
  onedelivery-order          onedelivery-incident
  onedelivery-logistics       onedelivery-knowledge
  onedelivery-payment         onedelivery-orchestrator-agent
  onedelivery-audit           onedelivery-guardian-agent
  onedelivery-user            onedelivery-logistics-agent
                              onedelivery-resolution-agent
                              onedelivery-qa-agent
  ```

## AWS credentials

Terraform uses the same credentials as the AWS CLI.

### Option 1: Environment variables

```bash
export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_REGION="ap-southeast-1"
```

### Option 2: AWS CLI profile

```bash
export AWS_PROFILE=default   # or your profile name
export AWS_REGION=ap-southeast-1
```

### Option 3: AWS SSO

```bash
aws sso login --profile your-sso-profile
export AWS_PROFILE=your-sso-profile
export AWS_REGION=ap-southeast-1
```

**Verify:** `aws sts get-caller-identity` should return account `542829982577`.

## Required Terraform variables

| Variable | Description |
|----------|-------------|
| `vpc_id` | **Required.** ID of an existing VPC to use (subnets are created inside it) |
| `db_username` | PostgreSQL master username (e.g. `postgres`) |
| `db_password` | PostgreSQL master password — do not commit |

Set via environment:

```bash
export TF_VAR_vpc_id=vpc-xxxxxxxx
export TF_VAR_db_username=postgres
export TF_VAR_db_password='your-secure-password'
```

Or in `terraform.tfvars` (already in `.gitignore`):

```hcl
vpc_id      = "vpc-xxxxxxxx"
db_username = "postgres"
db_password = "your-secure-password"
```

## How to run Terraform

```bash
# 1. Set AWS credentials
export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_REGION=ap-southeast-1

# 2. Set required variables
export TF_VAR_vpc_id=vpc-xxxxxxxx
export TF_VAR_db_username=postgres
export TF_VAR_db_password='your-secure-password'

# 3. Init and apply
cd infrastructure
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

Or with a profile and `terraform.tfvars`:

```bash
export AWS_PROFILE=onedelivery
cd infrastructure
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars: set vpc_id, db_password (and optionally enable_alb)
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

## Tear down

```bash
cd infrastructure
terraform destroy
```

Terraform destroys in dependency order (ECS → ALB → VPC, etc.). Confirm with `yes`.

- **Same variables** required as when you applied.
- **RDS deletion protection** — if `deletion_protection = true` (prod), disable it in config and apply first.
- **Preview** without destroying: `terraform plan -destroy`.

## CI/CD pipeline

The GitHub Actions pipeline (`.github/workflows/pipeline.yml`) runs three stages:

| Stage | Trigger | What it does |
|-------|---------|--------------|
| **CI** | All pushes and PRs | Trivy scan, lint, build, unit tests, optional LangSmith evals (gated by `ENABLE_LANGSMITH_EVALUATOR`), SonarQube scans |
| **Build & Push** | Push to `main` only | Builds all 12 Docker images and pushes to ECR (`onedelivery-{service}:latest`) |
| **Deploy** | Push to `main` only | Updates each ECS service with the new task definition (matrix parallelism) |

All 12 services are built from `.docker/Dockerfile.template` using `SERVICE_NAME` and `EXPOSE_PORT` build args. ECR repositories must exist before the first push.

## App requirements for this setup

1. **HTTP on port 80** — the ALB forwards HTTP to container port 80. NestJS apps must listen on port 80 (set `PORT=80` or configure `main.ts` accordingly).
2. **`GET /health` → 200** — ALB health checks poll `/health` every 30 s; tasks are taken out of rotation after 3 failures.
3. **Database schemas** — each service uses its own PostgreSQL schema (`order`, `logistics`, `payment`, `audit`, `user`, `incident`, `knowledge`). Run `scripts/init-schemas.sql` once against the RDS instance after first apply to create the schemas before ECS tasks start.

## Optional: remote state

Uncomment the `backend "s3"` block in `main.tf` and create the S3 bucket + DynamoDB table, then run `terraform init -reconfigure`.

## Optional: use a different account

Set `aws_account_id` in `terraform.tfvars` (default is `542829982577`). This controls the ECR image URIs in task definitions.
