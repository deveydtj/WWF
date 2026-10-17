variable "aws_region" {
  description = "AWS region. Keep us-east-1: CloudFront certificates must live there."
  type        = string
}

variable "frontend_bucket" {
  description = "S3 bucket name for static frontend"
  type        = string
}

variable "domain" {
  description = "Domain name for TLS certificate"
  type        = string
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID for the domain"
  type        = string
}

variable "vpc_id" {
  description = "VPC for the API server (the default VPC is fine)"
  type        = string
}

variable "subnet_id" {
  description = "One PUBLIC subnet (route to an internet gateway) for the API server. No NAT gateway is used."
  type        = string
}

variable "api_image" {
  description = "Docker image for the Flask API. Its CPU architecture must match cpu_architecture."
  type        = string
}

variable "session_secret_arn" {
  description = "Secrets Manager or SSM ARN holding a random SECRET_KEY of at least 32 characters for signed age sessions. Never put the secret value in Terraform variables. An SSM SecureString parameter is free; Secrets Manager costs $0.40/month per secret."
  type        = string
  default     = ""
  nullable    = false
}

variable "private_rooms_redis_secret_arn" {
  description = "Secrets Manager or SSM ARN containing a rediss:// URL for durable private-room Redis storage. Empty keeps private rooms unavailable in production."
  type        = string
  default     = ""
}

variable "enable_local_redis" {
  description = "Run a small TLS Redis container on the existing API server, configured in place through Systems Manager."
  type        = bool
  default     = false
}

variable "local_redis_image" {
  description = "Redis image for the same-server private-room store."
  type        = string
  default     = "redis:7.4-alpine"
}

variable "operator_secret_arn" {
  description = "Secrets Manager or SSM ARN containing the operator bearer token for maintenance endpoints."
  type        = string
  default     = ""
}

variable "single_instance" {
  description = "Run the API in single instance mode"
  type        = bool
  default     = true
}

variable "kms_key_arn" {
  description = "KMS key ARN for encrypting AWS resources"
  type        = string
  default     = "arn:aws:kms:us-east-1:718219275474:key/cfde95d6-be42-44c1-96ff-67a671169f35"
}

# ------- Low-cost server settings -------

variable "instance_type" {
  description = "EC2 size for the API server. t4g.micro (2 vCPU burst, 1 GB) is about $0.0084/hour while running and $0 while stopped."
  type        = string
  default     = "t4g.micro"
}

variable "cpu_architecture" {
  description = "arm64 for Graviton types (t4g, the cheapest) or x86_64 for t3/t3a. Must match the Docker image."
  type        = string
  default     = "arm64"

  validation {
    condition     = contains(["arm64", "x86_64"], var.cpu_architecture)
    error_message = "cpu_architecture must be arm64 or x86_64."
  }
}

variable "root_volume_gb" {
  description = "Server disk size. 8 GB gp3 is about $0.64/month and is the only cost while the server is stopped."
  type        = number
  default     = 8
}

variable "idle_shutdown_minutes" {
  description = "Stop the server after this many minutes with no player activity (typing, tapping, guesses, chat). The check runs every 5 minutes, so it stops 15-20 minutes after the last action."
  type        = number
  default     = 15

  validation {
    condition     = var.idle_shutdown_minutes >= 10
    error_message = "Use at least 10 minutes so a server that just woke up is not stopped before players arrive."
  }
}

variable "nightly_stop_schedule" {
  description = "Backstop that stops the server once a day even if the idle check fails (EventBridge cron, UTC). Default 09:00 UTC = 3-4 AM Central. Empty string disables it."
  type        = string
  default     = "cron(0 9 * * ? *)"
}

variable "origin_subdomain" {
  description = "Hostname under the domain that CloudFront uses to reach the server (origin.<domain>)."
  type        = string
  default     = "origin"
}

variable "acme_email" {
  description = "Optional email for Let's Encrypt expiry notices on the server's origin certificate."
  type        = string
  default     = ""
}

# ------- Cost guardrails -------

variable "monthly_budget_usd" {
  description = "Account-wide monthly budget. At 100% of ACTUAL spend the server is stopped and wake-ups are paused until you resume (scripts/emergency_cost_control.sh --resume)."
  type        = number
  default     = 10
}

variable "budget_alert_email" {
  description = "Email address for budget and cost alerts"
  type        = string
  default     = ""
}

# ------- Remote state (optional) -------

variable "state_bucket" {
  description = "S3 bucket for Terraform state storage (only used if you switch backend.tf to S3)"
  type        = string
  default     = ""
}

variable "lock_table" {
  description = "DynamoDB table for Terraform state locking (only used if you switch backend.tf to S3)"
  type        = string
  default     = ""
}

# ------- Live donation total (Stripe) -------

variable "enable_donations" {
  description = "Create the Stripe webhook that keeps the landing page's server-fund card up to date."
  type        = bool
  default     = false
}

variable "stripe_payment_link_url" {
  description = "Your Stripe Payment Link (https://buy.stripe.com/...). Shown as the card's donate button."
  type        = string
  default     = ""

  validation {
    condition     = var.stripe_payment_link_url == "" || startswith(var.stripe_payment_link_url, "https://")
    error_message = "stripe_payment_link_url must be an https:// link."
  }
}

variable "stripe_payment_link_id" {
  description = "Optional plink_... ID. When set, only payments through this Payment Link count toward the total."
  type        = string
  default     = ""
}

variable "stripe_webhook_secret_param" {
  description = "Name of the SSM SecureString parameter holding Stripe's webhook signing secret (whsec_...). You create it after the first apply; the value never goes in Terraform."
  type        = string
  default     = "/wwf/stripe-webhook-secret"
}

variable "donation_goal_usd" {
  description = "Monthly goal shown on the card. Defaults to monthly_budget_usd (what the servers actually cost)."
  type        = number
  default     = null
}
