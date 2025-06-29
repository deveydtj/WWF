terraform {
  required_version = ">= 1.4"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ------- S3 Bucket for frontend -------
resource "aws_s3_bucket" "frontend" {
  bucket = var.frontend_bucket
  acl    = "public-read"
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend.json
}

data "aws_iam_policy_document" "frontend" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
  }
}

# ------- ACM Certificate -------
resource "aws_acm_certificate" "cert" {
  domain_name       = var.domain
  validation_method = "DNS"
}

# Validation records are created outside of this module

# ------- CloudFront Distribution -------
resource "aws_cloudfront_distribution" "cdn" {
  enabled             = true
  default_root_object = "index.html"
  origins {
    domain_name = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id   = "frontend"
  }
  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "frontend"
    viewer_protocol_policy = "redirect-to-https"
  }
  viewer_certificate {
    acm_certificate_arn = aws_acm_certificate.cert.arn
    ssl_support_method  = "sni-only"
  }
}

# ------- ECS Cluster and Service -------
resource "aws_ecs_cluster" "wwf" {
  name = "wwf"
}

resource "aws_ecs_task_definition" "api" {
  family                   = "wwf-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = var.ecs_task_execution_role
  container_definitions = jsonencode([
    merge({
      name  = "api",
      image = var.api_image,
      portMappings = [
        { containerPort = 5001, protocol = "tcp" }
      ],
      environment = concat([
        {
          name  = "SINGLE_INSTANCE",
          value = var.single_instance ? "true" : "false"
        }
      ], var.enable_efs ? [{ name = "GAME_FILE", value = "/data/game_persist.json" }] : []),
      logConfiguration = {
        logDriver = "awslogs",
        options = {
          awslogs-group         = aws_cloudwatch_log_group.api.name,
          awslogs-region        = var.aws_region,
          awslogs-stream-prefix = "wwf",
        },
      }
    }, var.enable_efs ? {
      mountPoints = [{
        sourceVolume  = "game-data",
        containerPath = "/data",
        readOnly      = false
      }]
    } : {})
  ])

  dynamic "volume" {
    for_each = var.enable_efs ? [1] : []
    content {
      name = "game-data"
      efs_volume_configuration {
        file_system_id = aws_efs_file_system.wwf[0].id
      }
    }
  }
}

resource "aws_ecs_service" "api" {
  name            = "wwf-api"
  cluster         = aws_ecs_cluster.wwf.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 1
  launch_type     = "FARGATE"
  network_configuration {
    subnets         = var.subnets
    security_groups = [aws_security_group.api.id]
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 5001
  }
}

# ------- ALB -------
resource "aws_lb" "api" {
  name               = "wwf-api"
  internal           = false
  load_balancer_type = "application"
  subnets            = var.subnets
  security_groups    = [aws_security_group.alb.id]
  idle_timeout       = 3600
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  certificate_arn   = aws_acm_certificate.cert.arn
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_lb_target_group" "api" {
  name     = "wwf-api"
  port     = 5001
  protocol = "HTTP"
  vpc_id   = var.vpc_id
  health_check {
    path = "/state"
  }
}

# ------- Security Groups -------
resource "aws_security_group" "alb" {
  name   = "wwf-alb"
  vpc_id = var.vpc_id
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "api" {
  name   = "wwf-api"
  vpc_id = var.vpc_id
  ingress {
    from_port       = 5001
    to_port         = 5001
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "efs" {
  count  = var.enable_efs ? 1 : 0
  name   = "wwf-efs"
  vpc_id = var.vpc_id
  ingress {
    from_port       = 2049
    to_port         = 2049
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_efs_file_system" "wwf" {
  count = var.enable_efs ? 1 : 0
}

resource "aws_efs_mount_target" "wwf" {
  for_each       = var.enable_efs ? toset(var.subnets) : {}
  file_system_id = aws_efs_file_system.wwf[0].id
  subnet_id      = each.key
  security_groups = [aws_security_group.efs[0].id]
}

# ------- CloudWatch Logs and Alerts -------
resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/wwf-api"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_metric_filter" "api_errors" {
  name           = "wwf-api-errors"
  log_group_name = aws_cloudwatch_log_group.api.name
  pattern        = "?ERROR ?"
  metric_transformation {
    name      = "ErrorCount"
    namespace = "WWF"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "api_error_rate" {
  alarm_name          = "wwf-api-error-rate"
  metric_name         = aws_cloudwatch_log_metric_filter.api_errors.metric_transformation[0].name
  namespace           = "WWF"
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"
}

# ------- Scheduled Lobby Cleanup -------

data "archive_file" "cleanup_lambda" {
  type        = "zip"
  source_file = "${path.module}/cleanup_lambda.py"
  output_path = "${path.module}/cleanup_lambda.zip"
}

resource "aws_iam_role" "cleanup_lambda" {
  name               = "wwf-cleanup-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy_attachment" "cleanup_logs" {
  role       = aws_iam_role.cleanup_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "cleanup" {
  function_name = "wwf-lobby-cleanup"
  role          = aws_iam_role.cleanup_lambda.arn
  runtime       = "python3.11"
  handler       = "cleanup_lambda.lambda_handler"
  filename      = data.archive_file.cleanup_lambda.output_path
  source_code_hash = data.archive_file.cleanup_lambda.output_base64sha256
  environment {
    variables = {
      API_URL = "https://${aws_lb.api.dns_name}"
    }
  }
}

resource "aws_cloudwatch_event_rule" "daily_cleanup" {
  name                = "wwf-daily-lobby-cleanup"
  schedule_expression = "cron(0 5 * * ? *)"
}

resource "aws_cloudwatch_event_target" "cleanup_target" {
  rule      = aws_cloudwatch_event_rule.daily_cleanup.name
  target_id = "lambda"
  arn       = aws_lambda_function.cleanup.arn
}

resource "aws_lambda_permission" "allow_events" {
  statement_id  = "AllowExecutionFromEvents"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cleanup.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_cleanup.arn
}


# ------- Outputs -------
output "cloudfront_domain" {
  value = aws_cloudfront_distribution.cdn.domain_name
}

output "alb_dns_name" {
  value = aws_lb.api.dns_name
}
