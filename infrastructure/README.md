# OneDelivery Infrastructure (Terraform)

Terraform for AWS: **RDS PostgreSQL Free Tier**, **ECS Fargate** (order, logistics, payment, audit, user), **Application Load Balancer** (path-based routing), and **API Gateway HTTP API** (public entry).

Account: `542829982577` (default in variables).

## What gets created

| Resource | Purpose |
|----------|--------|
| **VPC** | Public subnets (ALB, ECS), private subnets (RDS only), internet gateway; **no NAT** |
| **RDS PostgreSQL** | PostgreSQL 17.6, db.t3.micro instance (free tier eligible), private subnets, 20 GB storage |
| **ECS Fargate** | Cluster + 5 services in **public subnets** (public IP; ECR/internet via IGW) |
| **ALB** | Listener 80, path-based rules: `/order*`, `/logistics*`, `/payment*`, `/audit*`, `/user*` → respective ECS target groups |
| **API Gateway HTTP API** | Routes `ANY /` and `ANY /{proxy+}` to the ALB |

Flow: **Client → API Gateway URL → ALB → ECS** (by path).

## Estimated monthly cost (ap-southeast-1)

Rough estimate for **default Terraform settings** (ECS desired count **0**, RDS PostgreSQL free tier, **no NAT gateways** — ECS runs in public subnets). Prices are approximate and vary by region and usage.

| Resource | Assumption | Est. USD/month |
|----------|------------|----------------|
| **NAT Gateway** | None (ECS in public subnets) | **0** |
| **RDS PostgreSQL Free Tier** | db.t3.micro instance (750 hrs/month free for 12 months) + 20 GB storage (free for 12 months) | **~0** (free tier) or **~15** (after free tier) |
| **ECS Fargate** | 0 tasks (default); 4 × (0.25 vCPU, 0.5 GB) if set to 1 each | **0** (or ~38) |
| **Application Load Balancer** | 1 ALB hourly + ~1 LCU | **~25** |
| **API Gateway HTTP API** | Low request volume (first 1M requests free for 12 months) | **~0–2** |
| **VPC Link** | 1 link for API Gateway → ALB | **~7** |
| **Data transfer** | Outbound/in-region (depends on traffic) | **~5–20** |
| **Total (default, 0 tasks, free tier)** | | **~32–50** |
| **Total (enable_alb = false, 0 tasks, free tier)** | No ALB, no API Gateway, no VPC Link | **~0–15** (RDS free tier) |

**Why NAT gateway?** ECS tasks run in **private subnets** (no public IP). To pull images from ECR or reach the internet they need outbound access; that traffic goes through a NAT Gateway. So NAT is only needed **when ECS tasks are running** and are in private subnets.

**What if ECS runs in public subnets?** If ECS tasks are in **public subnets** with `assign_public_ip = true`, they get a public IP and reach the internet (e.g. ECR) directly via the Internet Gateway—**no NAT needed**. You can then **remove NAT gateways** and save ~\$99/month (or ~\$33 with one NAT). The trade-off: tasks are on the “public” side of the VPC. The ALB remains the intended entry point, but if a security group is misconfigured or the app has a vulnerability, tasks could be more exposed than in private subnets. For **dev or low-risk workloads**, running ECS in public subnets and removing NAT is a common cost-saving choice. **RDS stays in private subnets** and does not need internet access, so no NAT is required for it. This Terraform uses **public subnets for ECS** and **no NAT gateways**.

**Ways to reduce cost**

- **ECS at 0:** Default `ecs_desired_count` is **0** so you don’t pay for Fargate until you scale up. Set to `1` (or more) in `terraform.tfvars` when you need the services.
- **No NAT:** ECS runs in **public subnets** with a public IP, so tasks reach ECR and the internet via the Internet Gateway. NAT gateways are not used; RDS stays in private subnets and does not need internet.
- **Turn off ALB and API Gateway when not needed:** Set **`enable_alb = false`** in `terraform.tfvars` to skip creating the ALB and API Gateway (and VPC Link). Saves **~\$32/month** (ALB + API Gateway + VPC Link). ECS and RDS still exist; you just have no external HTTP entry until you set `enable_alb = true` and apply again.
- **RDS Free Tier:** Using `db.t3.micro` instance class qualifies for AWS free tier (750 hours/month for 12 months). After free tier expires, expect ~$15/month for the instance.

For **default setup** (no NAT, ECS at 0, free tier): expect roughly **~32–50 USD/month** (free tier) or **~47–65 USD/month** (after free tier). With **`enable_alb = false`** as well: **~0–15 USD/month** (free tier) or **~15–30 USD/month** (after free tier).

## Prerequisites

- Terraform >= 1.0
- AWS credentials (see below)
- ECR repositories already created (e.g. by GitHub Actions): `onedelivery-order`, `onedelivery-logistics`, `onedelivery-payment`, `onedelivery-audit`, `onedelivery-user`, each with at least one image (e.g. `:latest`)

## AWS credentials (export / configure)

Terraform uses the same credentials as the AWS CLI. Choose one of these:

### Option 1: Environment variables (access key + secret)

From the AWS Console: **IAM → Users → your user → Security credentials → Create access key**. Then:

```bash
export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_REGION="ap-southeast-1"
```

(Or use `AWS_DEFAULT_REGION` instead of `AWS_REGION`.)

### Option 2: AWS CLI profile

If you already ran `aws configure` (or `aws configure --profile myprofile`):

```bash
export AWS_PROFILE=default   # or your profile name
export AWS_REGION=ap-southeast-1
```

Then run Terraform in the same shell; the provider will use that profile.

### Option 3: AWS SSO (Single Sign-On)

```bash
aws sso login --profile your-sso-profile
export AWS_PROFILE=your-sso-profile
export AWS_REGION=ap-southeast-1
```

### Switching between profiles (macOS / Linux)

Profiles are stored in `~/.aws/credentials` (and optionally `~/.aws/config`). To use a different profile in the current shell:

```bash
# Use a specific profile (all AWS/Terraform commands in this terminal use it)
export AWS_PROFILE=onedelivery

# Switch to another profile
export AWS_PROFILE=default

# Clear and use default profile
unset AWS_PROFILE
```

To use a profile for a single command: `aws s3 ls --profile onedelivery`. Terraform always uses the profile in your environment, so set `AWS_PROFILE` before running `terraform plan` or `terraform apply`.

Check which profile is active: `echo $AWS_PROFILE` (empty means `[default]` in credentials).

---

**Verify:** `aws sts get-caller-identity` should return account `542829982577` (or your account).

## Required Terraform variables

- **`db_username`** – PostgreSQL master username (e.g. `postgres`)
- **`db_password`** – PostgreSQL master password (do not commit)

Set via environment:

```bash
export TF_VAR_db_username=postgres
export TF_VAR_db_password='your-secure-password'
```

Or use a `terraform.tfvars` file (already in `.gitignore`):

```hcl
db_username = "postgres"
db_password = "your-secure-password"
```

## How to run Terraform

From the repo root:

```bash
# 1. Set AWS credentials (see above)
export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_REGION=ap-southeast-1

# 2. Set DB variables
export TF_VAR_db_username=postgres
export TF_VAR_db_password='your-secure-password'

# 3. Run Terraform
cd infrastructure
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

Or with a profile and tfvars:

```bash
export AWS_PROFILE=default
cd infrastructure
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars and set db_password
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

## Tear down (destroy)

To remove all infrastructure created by Terraform:

```bash
cd infrastructure
terraform destroy
```

Terraform will list every resource it plans to delete and ask for confirmation. Type **`yes`** to proceed.

- **Same variables:** Use the same `terraform.tfvars` (or `TF_VAR_*`) and AWS credentials as when you applied, so Terraform can match and remove resources.
- **Order:** Terraform destroys in a safe order (e.g. ECS services and ALB before the VPC). If something fails (e.g. dependency or protection), fix the cause and run `terraform destroy` again.
- **RDS:** If the instance has `deletion_protection = true` (e.g. prod), turn it off in the Terraform config and apply before destroying, or remove protection in the AWS console.
- **State:** After a full destroy, your `terraform.tfstate` will be empty. To recreate later, run `terraform apply` again.

To preview what would be destroyed without deleting:

```bash
terraform plan -destroy
```

## Outputs

After apply:

- **`api_gateway_invoke_url`** – Public API base URL (e.g. `https://xxx.execute-api.ap-southeast-1.amazonaws.com`). Call e.g. `{url}/order/...`, `{url}/logistics/...`, etc.
- **`alb_dns_name`** – ALB hostname (optional direct access, same path-based routing).
- **`postgres_endpoint`** – RDS PostgreSQL endpoint for `DATABASE_URL` (used by ECS tasks).
- **`ecs_cluster_name`** – For GitHub Actions / deploy pipelines.

## App requirements for this setup

1. **HTTP on port 80** – The ALB forwards HTTP to container port 80. Your NestJS apps should expose an HTTP server on port 80 (in addition to or instead of TCP) so that path-based routing works (e.g. add an HTTP listener in `main.ts` and route `/order/*` to order service logic).
2. **Health check** – ALB target groups use **HTTP GET /health** with expected 200. Add a `GET /health` endpoint that returns 200 so ECS tasks pass health checks.
3. **Database** – Each app already uses its own schema (`order`, `logistics`, `payment`, `audit`). Terraform passes a single `DATABASE_URL` (no schema in URL); keep using your TypeORM `schema` option per app.
4. **Schemas in PostgreSQL** – Run your `scripts/init-schemas.sql` once against the RDS PostgreSQL instance (e.g. from a bastion or one-off task) so the four schemas exist.

## Optional: remote state

Uncomment the `backend "s3"` block in `main.tf` and create the bucket and DynamoDB table, then run `terraform init -reconfigure`.

## Optional: use account variable

If you use a different account, set `aws_account_id` (e.g. in `terraform.tfvars`). The default is `542829982577`.
