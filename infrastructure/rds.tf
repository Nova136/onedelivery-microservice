# RDS PostgreSQL Free Tier - single instance (uses existing private subnets)
resource "aws_db_subnet_group" "postgres" {
  name       = "${local.name}-postgres-v2"

  subnet_ids = [
    aws_subnet.private_a.id,
    aws_subnet.private_b.id,
    aws_subnet.private_c.id,
  ]

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group" "postgres" {
  name_prefix = "${local.name}-postgres-"
  vpc_id     = data.aws_vpc.main.id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups  = [aws_security_group.ecs_tasks.id]
    description     = "ECS tasks"
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "postgres" {
  identifier     = "${local.name}-postgres"
  engine         = "postgres"
  engine_version = var.postgres_engine_version
  instance_class = var.postgres_instance_class
  
  allocated_storage     = var.postgres_allocated_storage
  max_allocated_storage = var.postgres_max_allocated_storage
  storage_type         = "gp3"
  storage_encrypted    = true
  
  db_name  = var.db_name
  username = var.db_username
  password = var.db_password
  
  db_subnet_group_name   = aws_db_subnet_group.postgres.name
  vpc_security_group_ids = [aws_security_group.postgres.id]
  
  # Free tier: single-AZ, no Multi-AZ
  multi_az               = false
  publicly_accessible    = false
  
  # Backup settings
  backup_retention_period = var.postgres_backup_retention_period
  backup_window          = "03:00-04:00"
  maintenance_window     = "mon:04:00-mon:05:00"
  
  # Free tier: enable auto minor version upgrade
  auto_minor_version_upgrade = true
  
  skip_final_snapshot = var.environment != "prod"
  deletion_protection = var.environment == "prod"
  
  # Performance insights (optional, can be disabled for free tier)
  performance_insights_enabled = false
  
  tags = {
    Name = "${local.name}-postgres"
  }
}
