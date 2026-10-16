#!/usr/bin/env bash
# Emergency AWS Cost Control for WordSquad
#
#   scripts/emergency_cost_control.sh            Stop the game server now and pause
#                                                wake-ups (players see "taking a break")
#   scripts/emergency_cost_control.sh --resume   Allow wake-ups again (after a pause or
#                                                after the monthly budget cap tripped)
#   scripts/emergency_cost_control.sh --audit    Read-only: list anything in this region
#                                                that bills by the hour, plus this
#                                                month's spend. Changes nothing.
#
# Works on macOS (bash 3.2) and Linux.
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-stop}"
WAKE_PARAM="/wwf/wake-disabled"

if ! command -v aws > /dev/null 2>&1; then
  echo "AWS CLI not found. Install it: https://aws.amazon.com/cli/" >&2
  exit 1
fi
if ! aws sts get-caller-identity > /dev/null 2>&1; then
  echo "AWS CLI not configured. Run: aws configure" >&2
  exit 1
fi

REGION="${AWS_REGION:-$(aws configure get region || true)}"
if [ -z "$REGION" ]; then
  REGION=$(sed -n 's/^aws_region *= *"\([^"]*\)".*/\1/p' infra/live/variables.tfvars 2> /dev/null | head -n 1)
fi
REGION="${REGION:-us-east-1}"
echo "Region: $REGION"

server_ids() { # $1 = comma-separated states
  aws ec2 describe-instances --region "$REGION" \
    --filters "Name=tag:Name,Values=wwf-api" "Name=tag:Project,Values=WWF" "Name=instance-state-name,Values=$1" \
    --query 'Reservations[].Instances[].InstanceId' --output text
}

count_or_none() { # prints the lines, or "none"
  if [ -z "$1" ] || [ "$1" = "None" ]; then echo "  none"; else echo "$1" | sed 's/^/  /'; fi
}

month_spend() {
  local start end
  start=$(date +%Y-%m-01)
  end=$(date -v+1d +%Y-%m-%d 2> /dev/null || date -d tomorrow +%Y-%m-%d)
  # Cost Explorer charges $0.01 per request.
  aws ce get-cost-and-usage --region us-east-1 \
    --time-period "Start=$start,End=$end" --granularity MONTHLY --metrics UnblendedCost \
    --query 'ResultsByTime[0].Total.UnblendedCost.[Amount,Unit]' --output text 2> /dev/null \
    | awk '{ printf "  $%.2f %s month to date\n", $1, $2 }' \
    || echo "  (could not read Cost Explorer; check the Billing console)"
}

case "$MODE" in
  --resume)
    aws ssm put-parameter --region "$REGION" --name "$WAKE_PARAM" --value false --type String --overwrite > /dev/null
    echo "Wake-ups allowed again. The server starts the next time a player visits."
    echo "Note: if the monthly budget cap tripped, it can trip again once spend rises."
    ;;

  --audit)
    echo ""
    echo "Game server (stopped costs only its disk, ~\$0.64/mo):"
    for state in running stopped; do
      ids=$(server_ids "$state" || true)
      if [ -n "$ids" ] && [ "$ids" != "None" ]; then echo "  $state: $ids"; fi
    done
    echo "  wake-ups paused: $(aws ssm get-parameter --region "$REGION" --name "$WAKE_PARAM" --query Parameter.Value --output text 2> /dev/null || echo unknown)"

    echo ""
    echo "Running EC2 instances (all, billed per hour):"
    count_or_none "$(aws ec2 describe-instances --region "$REGION" --filters Name=instance-state-name,Values=running,pending \
      --query 'Reservations[].Instances[].[InstanceId,InstanceType,Tags[?Key==`Name`]|[0].Value]' --output text)"

    echo ""
    echo "Load balancers (~\$16+/mo each even with no traffic; the old setup used one):"
    count_or_none "$(aws elbv2 describe-load-balancers --region "$REGION" --query 'LoadBalancers[].[LoadBalancerName,Type]' --output text 2> /dev/null)"

    echo ""
    echo "ECS services still asking for tasks (old Fargate setup):"
    services=""
    for cluster in $(aws ecs list-clusters --region "$REGION" --query 'clusterArns[]' --output text 2> /dev/null); do
      arns=$(aws ecs list-services --region "$REGION" --cluster "$cluster" --query 'serviceArns[]' --output text 2> /dev/null || true)
      if [ -z "$arns" ]; then continue; fi
      found=$(aws ecs describe-services --region "$REGION" --cluster "$cluster" --services $arns \
        --query 'services[?desiredCount>`0`].[serviceName,desiredCount,runningCount]' --output text 2> /dev/null || true)
      if [ -n "$found" ]; then services="$services$found"$'\n'; fi
    done
    count_or_none "$(printf '%s' "$services" | sed '/^$/d')"

    echo ""
    echo "NAT gateways (~\$33/mo each):"
    count_or_none "$(aws ec2 describe-nat-gateways --region "$REGION" --filter Name=state,Values=available,pending \
      --query 'NatGateways[].[NatGatewayId,VpcId]' --output text)"

    echo ""
    echo "Elastic IPs (\$3.60/mo each, attached or not):"
    count_or_none "$(aws ec2 describe-addresses --region "$REGION" --query 'Addresses[].[PublicIp,InstanceId]' --output text)"

    echo ""
    echo "EFS file systems:"
    count_or_none "$(aws efs describe-file-systems --region "$REGION" --query 'FileSystems[].[FileSystemId,Name,SizeInBytes.Value]' --output text 2> /dev/null)"

    echo ""
    echo "Unattached EBS volumes (leftover disks):"
    count_or_none "$(aws ec2 describe-volumes --region "$REGION" --filters Name=status,Values=available \
      --query 'Volumes[].[VolumeId,Size]' --output text)"

    echo ""
    echo "This month's spend (all services, all regions):"
    month_spend
    echo ""
    echo "Nothing was changed. Delete leftovers from the old ALB/ECS setup in the console,"
    echo "or with 'terraform destroy' from the commit that created them."
    ;;

  stop | --stop)
    echo "Pausing wake-ups and stopping the game server..."
    aws ssm put-parameter --region "$REGION" --name "$WAKE_PARAM" --value true --type String --overwrite > /dev/null \
      || echo "  (wake switch not found; has the new Terraform been applied?)"

    ids=$(server_ids "pending,running")
    if [ -n "$ids" ] && [ "$ids" != "None" ]; then
      aws ec2 stop-instances --region "$REGION" --instance-ids $ids > /dev/null
      echo "  Stopping: $ids"
    else
      echo "  Server already stopped."
    fi

    # Old Fargate setup, if any of it is still around.
    if aws ecs describe-services --region "$REGION" --cluster wwf --services wwf-api \
        --query 'services[?status==`ACTIVE`].serviceName' --output text 2> /dev/null | grep -q wwf-api; then
      aws application-autoscaling deregister-scalable-target --region "$REGION" --service-namespace ecs \
        --scalable-dimension ecs:service:DesiredCount --resource-id service/wwf/wwf-api > /dev/null 2>&1 || true
      aws ecs update-service --region "$REGION" --cluster wwf --service wwf-api --desired-count 0 > /dev/null
      echo "  Old ECS service wwf-api scaled to 0 (its load balancer still bills; see --audit)."
    fi

    echo ""
    echo "Done. While stopped you pay only for the server disk (~\$0.64/mo), the"
    echo "Route53 zone (\$0.50/mo) and pennies of S3/CloudFront."
    echo "Players will see a 'taking a short break' page until you run:"
    echo "  scripts/emergency_cost_control.sh --resume"
    echo "Check for other billable leftovers with: scripts/emergency_cost_control.sh --audit"
    ;;

  -h | --help)
    sed -n '2,12p' "$0"
    ;;

  *)
    echo "Unknown option: $MODE (use --help)" >&2
    exit 1
    ;;
esac
