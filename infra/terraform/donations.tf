# ------- Live donation total (Stripe) -------
#
#   Stripe Payment Link -> webhook -> wwf-donations Lambda -> DynamoDB total
#                                                           -> s3://<bucket>/donations.json
#   landing page donation card <- CloudFront /donations.json (10 s cache)
#
# Turned on with enable_donations = true. Never wakes the game server.
# After the first apply, put Stripe's webhook signing secret (whsec_...) in the
# SSM SecureString parameter named by stripe_webhook_secret_param.
# Cost at this scale: Lambda and DynamoDB on-demand stay in the free tier /
# fractions of a cent; S3 + CloudFront requests for one small file are pennies.

locals {
  donations_enabled  = var.enable_donations
  webhook_secret_arn = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${trimprefix(var.stripe_webhook_secret_param, "/")}"
  donation_goal_usd  = coalesce(var.donation_goal_usd, var.monthly_budget_usd)
}

resource "aws_dynamodb_table" "donations" {
  count        = local.donations_enabled ? 1 : 0
  name         = "wwf-donations"
  billing_mode = "PAY_PER_REQUEST" # no hourly charge
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  # Processed Stripe event IDs expire after 90 days; monthly totals stay.
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  tags = {
    Purpose = "donation-totals"
  }
}

data "archive_file" "donations" {
  type        = "zip"
  source_file = "${path.module}/donations_lambda.py"
  output_path = "${path.module}/donations_lambda.zip"
}

resource "aws_iam_role" "donations" {
  count              = local.donations_enabled ? 1 : 0
  name               = "wwf-donations"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "donations_logs" {
  count      = local.donations_enabled ? 1 : 0
  role       = aws_iam_role.donations[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "donations" {
  count = local.donations_enabled ? 1 : 0

  statement {
    sid       = "Totals"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:ConditionCheckItem"]
    resources = [aws_dynamodb_table.donations[0].arn]
  }

  statement {
    sid       = "PublishTotal"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/donations.json"]
  }

  statement {
    sid       = "WebhookSecret"
    actions   = ["ssm:GetParameter"]
    resources = [local.webhook_secret_arn]
  }

  statement {
    sid       = "DecryptWebhookSecret"
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.aws_region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "donations" {
  count  = local.donations_enabled ? 1 : 0
  name   = "wwf-donations"
  role   = aws_iam_role.donations[0].id
  policy = data.aws_iam_policy_document.donations[0].json
}

resource "aws_cloudwatch_log_group" "donations" {
  count             = local.donations_enabled ? 1 : 0
  name              = "/aws/lambda/wwf-donations"
  retention_in_days = 30
}

resource "aws_lambda_function" "donations" {
  count            = local.donations_enabled ? 1 : 0
  function_name    = "wwf-donations"
  role             = aws_iam_role.donations[0].arn
  runtime          = "python3.12"
  architectures    = ["arm64"]
  handler          = "donations_lambda.lambda_handler"
  filename         = data.archive_file.donations.output_path
  source_code_hash = data.archive_file.donations.output_base64sha256
  memory_size      = 128
  timeout          = 15

  environment {
    variables = {
      TABLE_NAME           = aws_dynamodb_table.donations[0].name
      BUCKET               = aws_s3_bucket.frontend.bucket
      GOAL_USD             = tostring(local.donation_goal_usd)
      DONATE_URL           = var.stripe_payment_link_url
      PAYMENT_LINK_ID      = var.stripe_payment_link_id
      WEBHOOK_SECRET_PARAM = var.stripe_webhook_secret_param
    }
  }

  depends_on = [aws_cloudwatch_log_group.donations, aws_iam_role_policy_attachment.donations_logs]
}

# Public HTTPS endpoint for Stripe. Every request must carry a valid Stripe
# signature or it is rejected before anything is written.
resource "aws_lambda_function_url" "donations" {
  count              = local.donations_enabled ? 1 : 0
  function_name      = aws_lambda_function.donations[0].function_name
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "donations_url" {
  count                  = local.donations_enabled ? 1 : 0
  statement_id           = "StripeWebhookUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.donations[0].function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

# Public function URLs also need InvokeFunction. (Provider 5.x can't add the
# InvokedViaFunctionUrl condition; direct calls can still only publish the
# current total, since adding money requires a valid Stripe signature.)
resource "aws_lambda_permission" "donations_url_invoke" {
  count         = local.donations_enabled ? 1 : 0
  statement_id  = "StripeWebhookInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.donations[0].function_name
  principal     = "*"
}

# New month: republish so the card starts again from $0.
resource "aws_cloudwatch_event_rule" "donations_new_month" {
  count               = local.donations_enabled ? 1 : 0
  name                = "wwf-donations-new-month"
  description         = "Reset the public donation total at the start of each month (UTC)"
  schedule_expression = "cron(5 0 1 * ? *)"
}

resource "aws_cloudwatch_event_target" "donations_new_month" {
  count     = local.donations_enabled ? 1 : 0
  rule      = aws_cloudwatch_event_rule.donations_new_month[0].name
  target_id = "donations"
  arn       = aws_lambda_function.donations[0].arn
  input     = jsonencode({ action = "publish" })
}

resource "aws_lambda_permission" "donations_new_month" {
  count         = local.donations_enabled ? 1 : 0
  statement_id  = "AllowNewMonth"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.donations[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.donations_new_month[0].arn
}

# Write donations.json right away (and whenever the goal or link changes) so
# the card shows the goal before the first donation arrives.
resource "aws_lambda_invocation" "donations_publish" {
  count         = local.donations_enabled ? 1 : 0
  function_name = aws_lambda_function.donations[0].function_name
  input = jsonencode({
    action = "publish"
    goal   = local.donation_goal_usd
    url    = var.stripe_payment_link_url
  })

  depends_on = [aws_iam_role_policy.donations]
}

output "stripe_webhook_url" {
  value       = local.donations_enabled ? aws_lambda_function_url.donations[0].function_url : null
  description = "Paste into Stripe: Developers > Webhooks > Add endpoint"
}
