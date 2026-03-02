variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-southeast-1"
}

variable "aws_account_id" {
  description = "AWS account ID (e.g. for ECR image URIs)"
  type        = string
  default     = "542829982577"
}

variable "environment" {
  description = "Environment name (e.g. dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "onedelivery"
}

variable "db_username" {
  description = "Master username for PostgreSQL (stored in SSM or set via TF_VAR)"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "Master password for PostgreSQL (set via TF_VAR_db_password)"
  type        = string
  sensitive   = true
}

variable "ecr_repository_names" {
  description = "ECR repository names for each microservice"
  type        = map(string)
  default = {
    order             = "onedelivery-order"
    logistics         = "onedelivery-logistics"
    payment           = "onedelivery-payment"
    audit             = "onedelivery-audit"
    user              = "onedelivery-user"
    incident          = "onedelivery-incident"
    orchestrator-agent = "onedelivery-orchestrator-agent"
    guardian-agent     = "onedelivery-guardian-agent"
    logistic-agent     = "onedelivery-logistic-agent"
    resolution-agent   = "onedelivery-resolution-agent"
    qa-agent          = "onedelivery-qa-agent"
  }
}

variable "ecs_cpu" {
  description = "CPU units per ECS task (1024 = 1 vCPU)"
  type        = number
  default     = 256
}

variable "ecs_memory_mb" {
  description = "Memory per ECS task (MB)"
  type        = number
  default     = 512
}

variable "ecs_desired_count" {
  description = "Desired number of tasks per ECS service (set to 0 to spin down and avoid Fargate cost)"
  type        = number
  default     = 0
}

variable "postgres_instance_class" {
  description = "RDS PostgreSQL instance class (db.t3.micro or db.t2.micro for free tier)"
  type        = string
  default     = "db.t3.micro"
}

variable "postgres_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "17.6"
}

variable "postgres_allocated_storage" {
  description = "Initial allocated storage in GB (20 GB for free tier)"
  type        = number
  default     = 20
}

variable "postgres_max_allocated_storage" {
  description = "Maximum allocated storage for autoscaling in GB"
  type        = number
  default     = 20
}

variable "postgres_backup_retention_period" {
  description = "Number of days to retain backups (0-7 for free tier, 0 disables automated backups)"
  type        = number
  default     = 7
}

variable "enable_alb" {
  description = "Create ALB and API Gateway (set to false to save ~$32/month when not needed; ECS will have no external HTTP entry)"
  type        = bool
  default     = false
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC. When reusing an existing VPC, this must match its actual CIDR (for example 172.16.94.0/24)."
  type        = string
  default     = "10.0.0.0/16"
}

variable "vpc_id" {
  description = "Existing VPC ID to use (e.g. vpc-0eeecdaacba51204a). Prevents Terraform from creating a new VPC."
  type        = string
}

variable "public_subnet_ids" {
  description = "List of existing public subnet IDs for ECS Fargate and ALB (e.g. [\"subnet-xxx\", \"subnet-yyy\"]). Must be in the VPC specified by vpc_id."
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "List of existing private subnet IDs for RDS (e.g. [\"subnet-aaa\", \"subnet-bbb\"]). Must be in the VPC specified by vpc_id."
  type        = list(string)
}

# Optional: CIDR references (not used by Terraform; for documentation / other tooling)
variable "alb_cidr" {
  description = "Optional CIDR for ALB subnet (not used by Terraform when using existing subnets)"
  type        = string
  default     = null
}

variable "fargate_subnet_cidr" {
  description = "Optional CIDR for Fargate subnets (not used by Terraform when using existing subnets)"
  type        = string
  default     = null
}

variable "endpoints_subnet_cidr" {
  description = "Optional CIDR for VPC endpoints subnet (not used by Terraform when using existing subnets)"
  type        = string
  default     = null
}

variable "rds_subnet_cidr" {
  description = "Optional CIDR for RDS subnets (not used by Terraform when using existing subnets)"
  type        = string
  default     = null
}
