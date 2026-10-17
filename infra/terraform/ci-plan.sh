#!/usr/bin/env bash
set -euo pipefail

# Always run from the script directory
cd "$(dirname "$0")"

terraform init -reconfigure
# When enabled, the privacy-publication.tf gate blocks plans while operator
# details or the reviewed privacy notice are missing.
terraform plan -input=false -lock=false -var-file=../live/variables.tfvars
