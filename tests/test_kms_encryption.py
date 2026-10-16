"""
Tests for encryption configuration in Terraform infrastructure.

The low-cost layout keeps data encrypted at rest without paying for extra KMS
traffic where AWS-managed encryption is free: the server disk uses the project
KMS key, and the static frontend bucket uses SSE-S3 so CloudFront can read it.
"""
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
MAIN_TF = ROOT / "infra/terraform/main.tf"
KEY_ARN = "arn:aws:kms:us-east-1:718219275474:key/cfde95d6-be42-44c1-96ff-67a671169f35"


def _block(content, resource_type, name):
    match = re.search(rf'resource "{resource_type}" "{name}" \{{.*?\n\}}', content, re.DOTALL)
    assert match is not None, f"{resource_type}.{name} not found"
    return match.group(0)


def test_kms_key_variable_defined():
    """Test that KMS key variable is defined in Terraform variables."""
    content = (ROOT / "infra/terraform/variables.tf").read_text()
    assert 'variable "kms_key_arn"' in content
    assert "KMS key ARN for encrypting AWS resources" in content
    assert KEY_ARN in content


def test_s3_bucket_encryption_configured():
    """The frontend bucket is encrypted at rest (SSE-S3, readable through CloudFront OAC)."""
    block = _block(MAIN_TF.read_text(), "aws_s3_bucket_server_side_encryption_configuration", "frontend")
    assert 'sse_algorithm = "AES256"' in block


def test_server_disk_encrypted_with_kms():
    """The API server's disk is encrypted with the project KMS key when one is set."""
    block = _block(MAIN_TF.read_text(), "aws_instance", "api")
    assert "encrypted             = true" in block
    assert "kms_key_id            = local.use_kms ? var.kms_key_arn : null" in block


def test_server_can_be_started_with_kms_encrypted_disk():
    """Starting an instance with a customer-managed KMS disk needs a KMS grant."""
    content = MAIN_TF.read_text()
    assert "kms:CreateGrant" in content
    assert "ec2.${var.aws_region}.amazonaws.com" in content


def test_kms_key_documented_in_live_config():
    """Test that KMS key is documented in live configuration."""
    content = (ROOT / "infra/live/variables.tfvars").read_text()
    assert "kms_key_arn" in content
    assert KEY_ARN in content
