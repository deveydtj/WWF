# State Manager applies the same setup to existing and newly bootstrapped servers.
# Commands contain secret ARNs only; secret values are fetched on the server.
resource "aws_ssm_association" "local_redis" {
  count            = var.enable_local_redis ? 1 : 0
  name             = "AWS-RunShellScript"
  association_name = "wwf-local-redis"

  targets {
    key    = "InstanceIds"
    values = [aws_instance.api.id]
  }

  parameters = {
    commands = join("\n", [
      "#!/bin/bash",
      "export WWF_REDIS_SECRET_ARN='${var.private_rooms_redis_secret_arn}'",
      "export WWF_OPERATOR_SECRET_ARN='${var.operator_secret_arn}'",
      "export WWF_REDIS_IMAGE='${var.local_redis_image}'",
      file("${path.module}/setup_local_redis.sh"),
    ])
    executionTimeout = "900"
  }

  wait_for_success_timeout_seconds = 900
  depends_on                       = [aws_iam_role_policy.api_server]

  lifecycle {
    precondition {
      condition     = trimspace(var.private_rooms_redis_secret_arn) != ""
      error_message = "Local Redis requires private_rooms_redis_secret_arn containing its authenticated TLS connection URL."
    }
  }
}
