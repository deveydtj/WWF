"""
Tests for KMS encryption configuration in Terraform infrastructure.
"""
import re
from pathlib import Path


def test_kms_key_variable_defined():
    """Test that KMS key variable is defined in Terraform variables."""
    variables_file = Path(__file__).parent.parent / "infra/terraform/variables.tf"
    content = variables_file.read_text()
    
    # Check that kms_key_arn variable is defined
    assert 'variable "kms_key_arn"' in content
    assert "KMS key ARN for encrypting AWS resources" in content
    assert "arn:aws:kms:us-east-1:718219275474:key/cfde95d6-be42-44c1-96ff-67a671169f35" in content


def test_s3_bucket_encryption_configured():
    """Test that S3 bucket server-side encryption is configured with KMS."""
    main_tf_file = Path(__file__).parent.parent / "infra/terraform/main.tf"
    content = main_tf_file.read_text()
    
    # Check that S3 bucket server-side encryption configuration exists
    assert 'resource "aws_s3_bucket_server_side_encryption_configuration" "frontend"' in content
    assert "kms_master_key_id = var.kms_key_arn" in content
    assert 'sse_algorithm     = "aws:kms"' in content
    assert "bucket_key_enabled = true" in content


def test_cloudwatch_logs_kms_encryption():
    """Test that CloudWatch log group is configured with KMS encryption."""
    main_tf_file = Path(__file__).parent.parent / "infra/terraform/main.tf"
    content = main_tf_file.read_text()
    
    # Check that CloudWatch log group has KMS key configuration
    log_group_pattern = r'resource "aws_cloudwatch_log_group" "api".*?kms_key_id\s*=\s*var\.kms_key_arn'
    assert re.search(log_group_pattern, content, re.DOTALL)


def test_efs_kms_encryption():
    """Test that EFS file system is configured with KMS encryption."""
    main_tf_file = Path(__file__).parent.parent / "infra/terraform/main.tf"
    content = main_tf_file.read_text()
    
    # Check that EFS file system has encryption enabled with KMS
    efs_pattern = r'resource "aws_efs_file_system" "wwf".*?encrypted\s*=\s*true.*?kms_key_id\s*=\s*var\.kms_key_arn'
    assert re.search(efs_pattern, content, re.DOTALL)


def test_kms_key_documented_in_live_config():
    """Test that KMS key is documented in live configuration."""
    live_vars_file = Path(__file__).parent.parent / "infra/live/variables.tfvars"
    content = live_vars_file.read_text()
    
    # Check that KMS key is documented with comment
    assert "kms_key_arn" in content
    assert "arn:aws:kms:us-east-1:718219275474:key/cfde95d6-be42-44c1-96ff-67a671169f35" in content


def test_aws_resources_encrypted_with_kms():
    """Test that key AWS resources are configured for KMS encryption."""
    main_tf_file = Path(__file__).parent.parent / "infra/terraform/main.tf"
    content = main_tf_file.read_text()
    
    # Ensure multiple resources reference the KMS key
    kms_references = content.count("var.kms_key_arn")
    assert kms_references >= 3, f"Expected at least 3 KMS key references, found {kms_references}"
    
    # Verify specific services are encrypted
    assert "aws_s3_bucket_server_side_encryption_configuration" in content
    
    # Check CloudWatch logs have KMS configured
    cloudwatch_log_section = re.search(r'resource "aws_cloudwatch_log_group" "api".*?}', content, re.DOTALL)
    assert cloudwatch_log_section is not None
    assert "kms_key_id" in cloudwatch_log_section.group(0)
    
    # Check EFS has encryption enabled
    efs_section = re.search(r'resource "aws_efs_file_system" "wwf".*?}', content, re.DOTALL)
    assert efs_section is not None
    assert "encrypted  = true" in efs_section.group(0)
    assert "kms_key_id = var.kms_key_arn" in efs_section.group(0)