# Use existing VPC and create dedicated public/private subnets for ECS and RDS.
data "aws_vpc" "main" {
  id = var.vpc_id
}

# Public subnets for ECS/Fargate and ALB (one per AZ)
resource "aws_subnet" "public_a" {
  vpc_id                  = data.aws_vpc.main.id
  cidr_block              = "10.0.0.0/20"
  availability_zone       = local.azs[0]
  map_public_ip_on_launch = true
  tags = {
    Name = "${local.name}-public-a"
  }
}

resource "aws_subnet" "public_b" {
  vpc_id                  = data.aws_vpc.main.id
  cidr_block              = "10.0.16.0/20"
  availability_zone       = local.azs[1]
  map_public_ip_on_launch = true
  tags = {
    Name = "${local.name}-public-b"
  }
}

resource "aws_subnet" "public_c" {
  vpc_id                  = data.aws_vpc.main.id
  cidr_block              = "10.0.32.0/20"
  availability_zone       = local.azs[2]
  map_public_ip_on_launch = true
  tags = {
    Name = "${local.name}-public-c"
  }
}

# Private subnets for RDS (no public IPs)
resource "aws_subnet" "private_a" {
  vpc_id            = data.aws_vpc.main.id
  cidr_block        = "10.0.64.0/20"
  availability_zone = local.azs[0]
  tags = {
    Name = "${local.name}-private-a"
  }
}

resource "aws_subnet" "private_b" {
  vpc_id            = data.aws_vpc.main.id
  cidr_block        = "10.0.80.0/20"
  availability_zone = local.azs[1]
  tags = {
    Name = "${local.name}-private-b"
  }
}

resource "aws_subnet" "private_c" {
  vpc_id            = data.aws_vpc.main.id
  cidr_block        = "10.0.96.0/20"
  availability_zone = local.azs[2]
  tags = {
    Name = "${local.name}-private-c"
  }
}

# Security group for VPC endpoints (optional; only created in this Terraform)
resource "aws_security_group" "vpc_endpoints" {
  name_prefix = "${local.name}-vpc-ep-"
  vpc_id      = data.aws_vpc.main.id
  description = "VPC endpoint SG for ${local.name}"
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.main.cidr_block]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
