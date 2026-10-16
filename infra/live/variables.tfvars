# Terraform Variables Configuration
# Copy this file and update all values before deployment

# PUBLICATION BLOCKER: operator details deferred by the owner. Complete these
# and publish/review the privacy notice before enabling the review flag.
# Passing this gate does not establish COPPA compliance or certification.
privacy_operator = {
  legal_name      = ""
  mailing_address = ""
  phone           = ""
  email           = ""
  website_url     = ""
}
privacy_notice_reviewed = false

# ARN only: store a random secret of at least 32 characters as an SSM
# SecureString parameter (free) or in Secrets Manager ($0.40/month), e.g.
#   arn:aws:ssm:us-east-1:718219275474:parameter/wwf/secret-key
# The server's IAM role is granted read access to exactly this ARN.
session_secret_arn = ""

# AWS Configuration
aws_region = "us-east-1"  # Keep us-east-1 (CloudFront certificates must live there)

# Frontend S3 Bucket (must be globally unique)
frontend_bucket = "your-wwf-frontend-bucket-name"  # Replace with unique bucket name

# Domain Configuration
domain = "wordsquad.io"  # Updated to wordsquad.io domain
hosted_zone_id = "Z04938291S4N31CYCROQC"  # Hosted zone ID for wordsquad.io

# Network: the default VPC works. Pick ONE public subnet (it has a route to an
# internet gateway). No NAT gateway or load balancer is created.
vpc_id    = "vpc-123456"     # Replace with your VPC ID
subnet_id = "subnet-abc"     # Replace with one public subnet ID

# Container Configuration (arm64 image for the default t4g server).
# scripts/deploy_api.sh builds and pushes this; check the repo name matches yours.
api_image = "718219275474.dkr.ecr.us-east-1.amazonaws.com/wwf-api:latest"

# ---- Low-cost server settings (defaults shown) ----
# instance_type         = "t4g.micro"   # ~$0.0084/hour only while running
# cpu_architecture      = "arm64"       # must match api_image
# idle_shutdown_minutes = 15            # stop after 15 min with no players
# nightly_stop_schedule = "cron(0 9 * * ? *)"  # daily backstop stop, UTC
# acme_email            = ""            # optional Let's Encrypt expiry emails

# KMS Encryption Key (defaults to provided ARN if not overridden; used for the
# server disk). Set to "" to use the free AWS-managed EBS key instead.
# kms_key_arn = "arn:aws:kms:us-east-1:718219275474:key/cfde95d6-be42-44c1-96ff-67a671169f35"

# Terraform State Configuration (only if you switch backend.tf to S3)
state_bucket = "your-terraform-state-bucket"  # S3 bucket for Terraform state
lock_table = "your-terraform-lock-table"     # DynamoDB table for state locking

# Live donation total on the landing page (Stripe). See docs/DEPLOY_GUIDE.md
# "Donations" for the 5-minute Stripe setup. Goal defaults to monthly_budget_usd.
enable_donations        = false
stripe_payment_link_url = ""   # https://buy.stripe.com/...
# stripe_payment_link_id = ""  # plink_... (optional: count only this link)
# donation_goal_usd      = 10

# Cost guardrails: email at 50% and on a forecast overrun; at 100% of actual
# spend the server is stopped and wake-ups pause until you run
#   scripts/emergency_cost_control.sh --resume
monthly_budget_usd = 10
budget_alert_email = "deveydtj@gmail.com"  # Email for cost alerts and budget notifications
