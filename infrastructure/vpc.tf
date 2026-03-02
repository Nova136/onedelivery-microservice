# Use existing VPC and subnets — do not create or recreate them.
# Terraform will fail at plan/apply if the VPC or subnets do not exist.
data "aws_vpc" "main" {
  id = var.vpc_id
}

# Validate that configured subnets exist and belong to this VPC (fails early if wrong)
data "aws_subnets" "public" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.main.id]
  }
  filter {
    name   = "subnet-id"
    values = var.public_subnet_ids
  }

  lifecycle {
    postcondition {
      condition     = length(self.ids) == length(var.public_subnet_ids)
      error_message = "Not all public_subnet_ids exist in VPC ${var.vpc_id}. Check that each ID is correct and in this VPC."
    }
  }
}

data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.main.id]
  }
  filter {
    name   = "subnet-id"
    values = var.private_subnet_ids
  }

  lifecycle {
    postcondition {
      condition     = length(self.ids) == length(var.private_subnet_ids)
      error_message = "Not all private_subnet_ids exist in VPC ${var.vpc_id}. Check that each ID is correct and in this VPC."
    }
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
