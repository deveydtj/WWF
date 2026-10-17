terraform {
  required_version = ">= 1.4"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.82" # CloudFront origin access control for Lambda URLs
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project = "WWF"
    }
  }
}

# =====================================================================
# Low-cost layout (replaces ALB + ECS Fargate + EFS):
#
#   players -> CloudFront -> S3                    (static site, always on)
#                         -> origin.<domain> :443  (one small EC2 server)
#                         -> /wake                 (Lambda: starts the server)
#
# The server stops itself after `idle_shutdown_minutes` with no players. A
# player who arrives while it is stopped sees a "starting up" page that calls
# /wake and reloads when the server is healthy (~1-2 minutes).
#
# Stopped cost: disk (~$0.64/mo) + Route53 zone ($0.50/mo) + pennies of S3.
# Running cost: ~$0.0084/h for t4g.micro + $0.005/h for its public IPv4.
# =====================================================================

locals {
  origin_host = "${var.origin_subdomain}.${var.domain}"
  parked_ip   = "192.0.2.1" # TEST-NET-1: unroutable placeholder while stopped
  use_kms     = trimspace(var.kms_key_arn) != ""
}

data "aws_caller_identity" "current" {}

# ------- S3 Bucket for frontend -------
resource "aws_s3_bucket" "frontend" {
  bucket = var.frontend_bucket

  tags = {
    Environment = "production"
    Purpose     = "frontend-hosting"
  }
}

# SSE-S3 is free and readable by CloudFront without extra KMS key policy work.
resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend.json

  depends_on = [aws_s3_bucket_public_access_block.frontend, terraform_data.privacy_publication_gate]
}

data "aws_iam_policy_document" "frontend" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.cdn.arn]
    }
  }
}

# ------- ACM Certificate (viewer side, free) -------
resource "aws_acm_certificate" "cert" {
  domain_name       = var.domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# ------- Route53 Configuration -------
data "aws_route53_zone" "main" {
  zone_id = var.hosted_zone_id
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cert.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.main.zone_id
}

resource "aws_acm_certificate_validation" "cert" {
  certificate_arn         = aws_acm_certificate.cert.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# origin.<domain>: the Lambda points this at the server's public IP while it
# runs and back at the parked address when it stops. Terraform only creates it.
resource "aws_route53_record" "origin" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = local.origin_host
  type    = "A"
  ttl     = 30
  records = [local.parked_ip]

  lifecycle {
    ignore_changes = [records]
  }
}

resource "aws_route53_record" "main" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.cdn.domain_name
    zone_id                = aws_cloudfront_distribution.cdn.hosted_zone_id
    evaluate_target_health = false
  }
}

# ------- CloudFront Distribution -------
resource "random_password" "origin_verify" {
  length  = 40
  special = false
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "wwf-frontend-s3"
  description                       = "CloudFront access to the WWF frontend bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_origin_access_control" "wake" {
  name                              = "wwf-wake-lambda"
  description                       = "CloudFront access to the WWF wake function URL"
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Preserve the browser's User-Agent for wake diagnostics without forwarding
# cookies or query strings. CloudFront adds X-Forwarded-For automatically.
resource "aws_cloudfront_origin_request_policy" "wake" {
  name = "wwf-wake-diagnostics"
  cookies_config {
    cookie_behavior = "none"
  }
  query_strings_config {
    query_string_behavior = "none"
  }
  headers_config {
    header_behavior = "whitelist"
    headers {
      items = ["User-Agent"]
    }
  }
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

resource "aws_cloudfront_distribution" "cdn" {
  depends_on          = [terraform_data.privacy_publication_gate]
  enabled             = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100" # North America and Europe only (cheapest)
  aliases             = [var.domain]

  tags = {
    Environment = "production"
    Purpose     = "frontend-cdn"
  }

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # Gameplay and age checks must share the browser origin and session cookie.
  origin {
    domain_name         = local.origin_host
    origin_id           = "api"
    connection_attempts = 1 # fail fast to the "starting up" page while stopped
    connection_timeout  = 3

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 5
    }

    custom_header {
      name  = "X-Origin-Verify"
      value = random_password.origin_verify.result
    }
  }

  origin {
    domain_name              = split("/", aws_lambda_function_url.wake.function_url)[2]
    origin_id                = "wake"
    origin_access_control_id = aws_cloudfront_origin_access_control.wake.id

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  ordered_cache_behavior {
    path_pattern             = "/wake"
    target_origin_id         = "wake"
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["GET", "HEAD"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.wake.id
  }

  dynamic "ordered_cache_behavior" {
    for_each = ["/activity", "/private/*", "/join", "/internal/*", "/age-*", "/lobby*", "/lobbies*", "/game", "/state", "/emoji", "/guess", "/hint", "/chat", "/reset", "/stream", "/health", "/admin/*"]
    content {
      path_pattern           = ordered_cache_behavior.value
      target_origin_id       = "api"
      viewer_protocol_policy = "https-only"
      allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods         = ["GET", "HEAD"]
      # Never cache eligibility, credentials, player state, or Set-Cookie.
      min_ttl     = 0
      default_ttl = 0
      max_ttl     = 0
      forwarded_values {
        query_string = true
        # The origin's nginx sets Host and X-Forwarded-Proto for Flask; Origin
        # must reach Flask for its cross-origin checks.
        headers = ["Origin", "Content-Type", "Sec-Fetch-Site", "X-WordSquad-Request", "Authorization"]
        cookies {
          forward           = "whitelist"
          whitelisted_names = ["wordsquad_age_session", "wordsquad_room_session", "__Host-wordsquad_room_session"]
        }
      }
    }
  }

  # Custom error pages use their own cache behavior's TTL. Never retain a
  # startup response after the API is healthy, even on otherwise uncached paths.
  ordered_cache_behavior {
    path_pattern           = "/waking.html"
    target_origin_id       = "frontend"
    viewer_protocol_policy = "https-only"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.disabled.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "frontend"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600  # 1 hour
    max_ttl     = 86400 # 24 hours
  }

  ordered_cache_behavior {
    path_pattern           = "/static/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "frontend"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 86400    # 24 hours
    max_ttl     = 31536000 # 1 year
  }

  # Live donation total, written by the donations Lambda. Short cache so a
  # new donation shows up within seconds, without a request to S3 per visitor.
  ordered_cache_behavior {
    path_pattern           = "/donations.json"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "frontend"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 10
    max_ttl     = 10
  }

  # Server asleep (CloudFront can't connect, or times out): show the
  # "starting up" page, which calls /wake and reloads when /health is OK.
  # 503 is deliberately not mapped so the app's own 503s pass through.
  dynamic "custom_error_response" {
    for_each = [502, 504]
    content {
      error_code            = custom_error_response.value
      response_code         = 503
      response_page_path    = "/waking.html"
      error_caching_min_ttl = 0
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cert.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}

# ------- API server (single small EC2 instance) -------
data "aws_ssm_parameter" "al2023_ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-${var.cpu_architecture}"
}

data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

# Only CloudFront can reach the server, and nginx also requires the secret
# X-Origin-Verify header, so the two trusted forwarding hops can't be spoofed.
resource "aws_security_group" "api" {
  name        = "wwf-api-server"
  description = "WordSquad API server: HTTPS from CloudFront only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "HTTPS from CloudFront"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api_server" {
  name               = "wwf-api-server"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json
}

# Session Manager shell access (no SSH port, no key pair) and ECR image pulls.
resource "aws_iam_role_policy_attachment" "api_server_ssm" {
  role       = aws_iam_role.api_server.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "api_server_ecr" {
  role       = aws_iam_role.api_server.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

locals {
  app_secret_arns = compact([
    var.session_secret_arn,
    var.private_rooms_redis_secret_arn,
    var.operator_secret_arn,
  ])
  app_ssm_arns = [for arn in local.app_secret_arns : arn if startswith(arn, "arn:aws:ssm:")]
  app_sm_arns  = [for arn in local.app_secret_arns : arn if startswith(arn, "arn:aws:secretsmanager:")]
}

data "aws_iam_policy_document" "api_server" {
  dynamic "statement" {
    for_each = length(local.app_ssm_arns) > 0 ? [1] : []
    content {
      sid       = "ReadAppParameters"
      actions   = ["ssm:GetParameter"]
      resources = local.app_ssm_arns
    }
  }

  dynamic "statement" {
    for_each = length(local.app_sm_arns) > 0 ? [1] : []
    content {
      sid       = "ReadAppSecrets"
      actions   = ["secretsmanager:GetSecretValue"]
      resources = local.app_sm_arns
    }
  }

  statement {
    sid       = "DecryptAppSecrets"
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.aws_region}.amazonaws.com", "secretsmanager.${var.aws_region}.amazonaws.com"]
    }
  }

  # certbot proves domain ownership with a TXT record (DNS-01).
  statement {
    sid       = "AcmeDnsLookup"
    actions   = ["route53:ListHostedZones", "route53:GetChange"]
    resources = ["*"]
  }

  statement {
    sid       = "AcmeDnsChallenge"
    actions   = ["route53:ChangeResourceRecordSets"]
    resources = [data.aws_route53_zone.main.arn]
    condition {
      test     = "ForAllValues:StringEquals"
      variable = "route53:ChangeResourceRecordSetsNormalizedRecordNames"
      values   = ["_acme-challenge.${lower(local.origin_host)}"]
    }
    condition {
      test     = "ForAllValues:StringEquals"
      variable = "route53:ChangeResourceRecordSetsRecordTypes"
      values   = ["TXT"]
    }
  }
}

resource "aws_iam_role_policy" "api_server" {
  name   = "wwf-api-server"
  role   = aws_iam_role.api_server.id
  policy = data.aws_iam_policy_document.api_server.json
}

resource "aws_iam_instance_profile" "api_server" {
  name = "wwf-api-server"
  role = aws_iam_role.api_server.name
}

resource "aws_instance" "api" {
  depends_on = [terraform_data.privacy_publication_gate]

  ami                                  = data.aws_ssm_parameter.al2023_ami.value
  instance_type                        = var.instance_type
  subnet_id                            = var.subnet_id
  vpc_security_group_ids               = [aws_security_group.api.id]
  iam_instance_profile                 = aws_iam_instance_profile.api_server.name
  associate_public_ip_address          = true # billed only while running; no Elastic IP
  instance_initiated_shutdown_behavior = "stop"
  monitoring                           = false # basic (free) CloudWatch metrics only

  # "standard" never bills for burst credits; "unlimited" (the t4g default) can.
  credit_specification {
    cpu_credits = "standard"
  }

  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1 # containers can't reach instance credentials
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_gb
    encrypted             = true
    kms_key_id            = local.use_kms ? var.kms_key_arn : null
    delete_on_termination = false
  }

  user_data_replace_on_change = true
  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    aws_region         = var.aws_region
    api_image          = var.api_image
    domain             = var.domain
    origin_host        = local.origin_host
    session_secret_arn = var.session_secret_arn
    # Local Redis is configured by the SSM association after bootstrap. Keeping
    # these empty avoids replacing the existing server and its persistent disk.
    redis_secret_arn     = var.enable_local_redis ? "" : var.private_rooms_redis_secret_arn
    operator_secret_arn  = var.enable_local_redis ? "" : var.operator_secret_arn
    single_instance      = var.single_instance ? "true" : "false"
    idle_minutes         = var.idle_shutdown_minutes
    acme_email           = var.acme_email
    origin_verify_secret = random_password.origin_verify.result
  })

  tags = {
    Name        = "wwf-api"
    Environment = "production"
    Purpose     = "game-backend"
  }

  lifecycle {
    # A stopped instance has no public IP; AWS reports this attribute as false.
    # Neither that transient state nor an AMI refresh may replace persisted data.
    ignore_changes  = [ami, associate_public_ip_address]
    prevent_destroy = true
    precondition {
      condition     = length(trimspace(var.session_secret_arn)) > 0
      error_message = "PUBLICATION BLOCKED: supply session_secret_arn for the signed age-session SECRET_KEY before deploying the API."
    }
  }
}

# ------- Wake / DNS / stop controller (Lambda, free tier) -------
data "archive_file" "origin_control" {
  type        = "zip"
  source_file = "${path.module}/origin_control_lambda.py"
  output_path = "${path.module}/origin_control_lambda.zip"
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

resource "aws_iam_role" "origin_control" {
  name               = "wwf-origin-control"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "origin_control_logs" {
  role       = aws_iam_role.origin_control.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_ssm_parameter" "wake_disabled" {
  name        = "/wwf/wake-disabled"
  description = "true = budget cap hit; /wake will not start the server. Clear with scripts/emergency_cost_control.sh --resume"
  type        = "String"
  value       = "false"

  lifecycle {
    ignore_changes = [value]
  }
}

data "aws_iam_policy_document" "origin_control" {
  statement {
    sid       = "StartStopServer"
    actions   = ["ec2:StartInstances", "ec2:StopInstances"]
    resources = [aws_instance.api.arn]
  }

  statement {
    sid       = "DescribeServer"
    actions   = ["ec2:DescribeInstances"]
    resources = ["*"]
  }

  statement {
    sid       = "PointOriginDns"
    actions   = ["route53:ChangeResourceRecordSets"]
    resources = [data.aws_route53_zone.main.arn]
    condition {
      test     = "ForAllValues:StringEquals"
      variable = "route53:ChangeResourceRecordSetsNormalizedRecordNames"
      values   = [lower(local.origin_host)]
    }
  }

  statement {
    sid       = "KillSwitch"
    actions   = ["ssm:GetParameter", "ssm:PutParameter"]
    resources = [aws_ssm_parameter.wake_disabled.arn]
  }

  # Starting an instance whose disk uses a customer-managed KMS key needs these.
  dynamic "statement" {
    for_each = local.use_kms ? [1] : []
    content {
      sid       = "StartEncryptedVolume"
      actions   = ["kms:CreateGrant", "kms:Decrypt", "kms:DescribeKey", "kms:GenerateDataKeyWithoutPlaintext", "kms:ReEncrypt*"]
      resources = [var.kms_key_arn]
      condition {
        test     = "StringEquals"
        variable = "kms:ViaService"
        values   = ["ec2.${var.aws_region}.amazonaws.com"]
      }
    }
  }
}

resource "aws_iam_role_policy" "origin_control" {
  name   = "wwf-origin-control"
  role   = aws_iam_role.origin_control.id
  policy = data.aws_iam_policy_document.origin_control.json
}

resource "aws_cloudwatch_log_group" "origin_control" {
  name              = "/aws/lambda/wwf-origin-control"
  retention_in_days = 7
}

resource "aws_lambda_function" "origin_control" {
  function_name    = "wwf-origin-control"
  role             = aws_iam_role.origin_control.arn
  runtime          = "python3.12"
  architectures    = ["arm64"]
  handler          = "origin_control_lambda.lambda_handler"
  filename         = data.archive_file.origin_control.output_path
  source_code_hash = data.archive_file.origin_control.output_base64sha256
  memory_size      = 128
  timeout          = 30

  environment {
    variables = {
      INSTANCE_ID         = aws_instance.api.id
      HOSTED_ZONE_ID      = data.aws_route53_zone.main.zone_id
      ORIGIN_RECORD       = local.origin_host
      PARKED_IP           = local.parked_ip
      WAKE_DISABLED_PARAM = aws_ssm_parameter.wake_disabled.name
    }
  }

  depends_on = [aws_cloudwatch_log_group.origin_control, aws_iam_role_policy_attachment.origin_control_logs]
}

# /wake is reachable only through CloudFront (signed with OAC).
resource "aws_lambda_function_url" "wake" {
  function_name      = aws_lambda_function.origin_control.function_name
  authorization_type = "AWS_IAM"
}

resource "aws_lambda_permission" "cloudfront_wake_url" {
  statement_id  = "AllowCloudFrontFunctionUrl"
  action        = "lambda:InvokeFunctionUrl"
  function_name = aws_lambda_function.origin_control.function_name
  principal     = "cloudfront.amazonaws.com"
  source_arn    = aws_cloudfront_distribution.cdn.arn
}

resource "aws_lambda_permission" "cloudfront_wake_invoke" {
  statement_id  = "AllowCloudFrontInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.origin_control.function_name
  principal     = "cloudfront.amazonaws.com"
  source_arn    = aws_cloudfront_distribution.cdn.arn
}

# Keep origin.<domain> pointed at the server whenever it starts or stops.
resource "aws_cloudwatch_event_rule" "server_state" {
  name        = "wwf-api-server-state"
  description = "WordSquad API server started or stopped"
  event_pattern = jsonencode({
    source        = ["aws.ec2"]
    "detail-type" = ["EC2 Instance State-change Notification"]
    detail = {
      "instance-id" = [aws_instance.api.id]
      state         = ["running", "stopping", "stopped", "shutting-down"]
    }
  })
}

resource "aws_cloudwatch_event_target" "server_state" {
  rule      = aws_cloudwatch_event_rule.server_state.name
  target_id = "origin-control"
  arn       = aws_lambda_function.origin_control.arn
}

resource "aws_lambda_permission" "server_state" {
  statement_id  = "AllowServerStateEvents"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.origin_control.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.server_state.arn
}

# A newly created server's first "running" event can fire before the rule
# above exists, so point DNS at it once at apply time (re-runs only when the
# server is replaced).
resource "aws_lambda_invocation" "sync_origin_dns" {
  function_name = aws_lambda_function.origin_control.function_name
  input = jsonencode({
    source = "aws.ec2"
    detail = {
      "instance-id" = aws_instance.api.id
      state         = "running"
    }
  })

  depends_on = [aws_iam_role_policy.origin_control, aws_cloudwatch_event_target.server_state]
}

# Backstop: stop once a day even if the on-server idle check ever breaks.
resource "aws_cloudwatch_event_rule" "nightly_stop" {
  count               = trimspace(var.nightly_stop_schedule) != "" ? 1 : 0
  name                = "wwf-api-nightly-stop"
  description         = "Daily backstop stop for the WordSquad API server"
  schedule_expression = var.nightly_stop_schedule
}

resource "aws_cloudwatch_event_target" "nightly_stop" {
  count     = length(aws_cloudwatch_event_rule.nightly_stop)
  rule      = aws_cloudwatch_event_rule.nightly_stop[0].name
  target_id = "origin-control"
  arn       = aws_lambda_function.origin_control.arn
  input     = jsonencode({ action = "nightly-stop" })
}

resource "aws_lambda_permission" "nightly_stop" {
  count         = length(aws_cloudwatch_event_rule.nightly_stop)
  statement_id  = "AllowNightlyStop"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.origin_control.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.nightly_stop[0].arn
}

# ------- Cost guardrails -------

# Budget alerts at 100% actual spend land here and trip the kill switch.
resource "aws_sns_topic" "budget_kill" {
  name         = "wwf-budget-kill-switch"
  display_name = "WWF budget kill switch"
}

data "aws_iam_policy_document" "budget_kill" {
  statement {
    sid       = "AllowBudgetsPublish"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.budget_kill.arn]
    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "budget_kill" {
  arn    = aws_sns_topic.budget_kill.arn
  policy = data.aws_iam_policy_document.budget_kill.json
}

resource "aws_sns_topic_subscription" "budget_kill" {
  topic_arn = aws_sns_topic.budget_kill.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.origin_control.arn
}

resource "aws_lambda_permission" "budget_kill" {
  statement_id  = "AllowBudgetKillSwitch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.origin_control.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.budget_kill.arn
}

locals {
  alert_emails = var.budget_alert_email != "" ? [var.budget_alert_email] : []
}

# Account-wide: catches any leftover resource, tagged or not.
resource "aws_budgets_budget" "wwf_monthly" {
  name         = "wwf-monthly-budget"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Early warning by email.
  dynamic "notification" {
    for_each = length(local.alert_emails) > 0 ? [50] : []
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = local.alert_emails
    }
  }

  dynamic "notification" {
    for_each = length(local.alert_emails) > 0 ? [100] : []
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "FORECASTED"
      subscriber_email_addresses = local.alert_emails
    }
  }

  # Hard cap: stop the server and pause wake-ups.
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = local.alert_emails
    subscriber_sns_topic_arns  = [aws_sns_topic.budget_kill.arn]
  }

  depends_on = [aws_sns_topic_policy.budget_kill]
}

# ------- Outputs -------
output "cloudfront_domain" {
  value = aws_cloudfront_distribution.cdn.domain_name
}

output "cloudfront_distribution_id" {
  value       = aws_cloudfront_distribution.cdn.id
  description = "Used by scripts/deploy_frontend.sh for cache invalidation"
}

output "frontend_bucket" {
  value = aws_s3_bucket.frontend.bucket
}

output "api_instance_id" {
  value       = aws_instance.api.id
  description = "The API server. Connect with: aws ssm start-session --target <id>"
}

output "origin_hostname" {
  value = local.origin_host
}

output "domain_name" {
  value       = var.domain
  description = "The custom domain name configured for the application"
}

output "hosted_zone_id" {
  value       = var.hosted_zone_id
  description = "The Route53 hosted zone ID used for DNS configuration"
}
