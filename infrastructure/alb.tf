# Application Load Balancer and target groups (path-based routing to ECS services)
# Set enable_alb = false to skip ALB + API Gateway and save ~$32/month
resource "aws_security_group" "alb" {
  count       = var.enable_alb ? 1 : 0
  name_prefix = "${local.name}-alb-"
  vpc_id      = aws_vpc.main.id
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP"
  }
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS"
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_lb" "main" {
  count              = var.enable_alb ? 1 : 0
  name               = "${local.name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb[0].id]
  subnets            = aws_subnet.public[*].id
}

resource "aws_lb_target_group" "service" {
  for_each    = var.enable_alb ? local.services : toset([])
  name        = "${local.name}-${each.key}"
  port        = local.service_ports[each.key]
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    protocol            = "HTTP"
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }
}

resource "aws_lb_listener" "http" {
  count             = var.enable_alb ? 1 : 0
  load_balancer_arn = aws_lb.main[0].arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not Found"
      status_code  = "404"
    }
  }
}

# Path-based routing: /order/* -> order, /logistics/* -> logistics, etc.
resource "aws_lb_listener_rule" "order" {
  count        = var.enable_alb ? 1 : 0
  listener_arn = aws_lb_listener.http[0].arn
  priority     = 100
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service["order"].arn
  }
  condition {
    path_pattern { values = ["/order", "/order/*"] }
  }
}

resource "aws_lb_listener_rule" "logistics" {
  count        = var.enable_alb ? 1 : 0
  listener_arn = aws_lb_listener.http[0].arn
  priority     = 110
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service["logistics"].arn
  }
  condition {
    path_pattern { values = ["/logistics", "/logistics/*"] }
  }
}

resource "aws_lb_listener_rule" "payment" {
  count        = var.enable_alb ? 1 : 0
  listener_arn = aws_lb_listener.http[0].arn
  priority     = 120
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service["payment"].arn
  }
  condition {
    path_pattern { values = ["/payment", "/payment/*"] }
  }
}

resource "aws_lb_listener_rule" "audit" {
  count        = var.enable_alb ? 1 : 0
  listener_arn = aws_lb_listener.http[0].arn
  priority     = 130
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service["audit"].arn
  }
  condition {
    path_pattern { values = ["/audit", "/audit/*"] }
  }
}

resource "aws_lb_listener_rule" "user" {
  count        = var.enable_alb ? 1 : 0
  listener_arn = aws_lb_listener.http[0].arn
  priority     = 140
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service["user"].arn
  }
  condition {
    path_pattern { values = ["/user", "/user/*"] }
  }
}
