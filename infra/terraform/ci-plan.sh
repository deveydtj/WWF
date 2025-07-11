#!/usr/bin/env bash
set -euo pipefail

# Run Terraform init and plan for CI
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

terraform init -input=false
terraform plan -input=false -var-file=../live/variables.tfvars "$@"
