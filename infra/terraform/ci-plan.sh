#!/usr/bin/env bash
set -euo pipefail

# Always run from the script directory
cd "$(dirname "$0")"

terraform init -reconfigure
terraform plan -input=false -lock=false -var-file=../live/variables.tfvars
