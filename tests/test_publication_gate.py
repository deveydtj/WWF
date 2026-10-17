"""Run the actual Terraform publication guard without AWS or credentials."""
import json
from pathlib import Path
import shutil
import subprocess

import pytest

TERRAFORM = shutil.which('terraform')
pytestmark = pytest.mark.skipif(not TERRAFORM, reason='Terraform is not installed')
VALID_OPERATOR = {
    'legal_name': 'Test Operator',
    'mailing_address': '123 Test Street, Test City',
    'phone': '+1-202-555-0100',
    'email': 'privacy@example.com',
    'website_url': 'https://example.com',
}


@pytest.fixture(scope='module')
def gate_dir(tmp_path_factory):
    directory = tmp_path_factory.mktemp('publication-gate')
    source = Path(__file__).resolve().parents[1] / 'infra/terraform/privacy-publication.tf'
    shutil.copyfile(source, directory / source.name)
    subprocess.run([TERRAFORM, 'init', '-backend=false', '-input=false', '-no-color'],
                   cwd=directory, check=True, capture_output=True, text=True, timeout=30)
    return directory


def plan(directory, variables):
    (directory / 'release.auto.tfvars.json').write_text(json.dumps(variables))
    return subprocess.run([TERRAFORM, 'plan', '-input=false', '-lock=false', '-no-color'],
                          cwd=directory, capture_output=True, text=True, timeout=30)


def test_defaults_block_publication(gate_dir):
    result = plan(gate_dir, {})
    assert result.returncode != 0
    assert 'PUBLICATION BLOCKED' in result.stderr


@pytest.mark.parametrize('field', list(VALID_OPERATOR))
def test_each_missing_operator_detail_blocks_publication(gate_dir, field):
    operator = {**VALID_OPERATOR, field: ' '}
    result = plan(gate_dir, {'privacy_operator': operator, 'privacy_notice_reviewed': True})
    assert result.returncode != 0
    assert 'PUBLICATION BLOCKED' in result.stderr


def test_notice_review_required_even_with_operator_details(gate_dir):
    result = plan(gate_dir, {'privacy_operator': VALID_OPERATOR})
    assert result.returncode != 0
    assert 'privacy_notice_reviewed=true' in result.stderr


@pytest.mark.parametrize(('field', 'value'), [('email', 'invalid'),
                                               ('website_url', 'http://example.com')])
def test_invalid_contact_or_insecure_url_blocks_publication(gate_dir, field, value):
    result = plan(gate_dir, {'privacy_operator': {**VALID_OPERATOR, field: value},
                            'privacy_notice_reviewed': True})
    assert result.returncode != 0
    assert 'valid privacy contact email and HTTPS website URL' in ' '.join(result.stderr.split())


def test_completed_operator_prerequisites_allow_plan(gate_dir):
    result = plan(gate_dir, {'privacy_operator': VALID_OPERATOR, 'privacy_notice_reviewed': True})
    assert result.returncode == 0, result.stderr


def test_owner_can_explicitly_defer_publication_gate(gate_dir):
    result = plan(gate_dir, {'enforce_privacy_publication_gate': False})
    assert result.returncode == 0, result.stderr
    assert 'No changes.' in result.stdout


def test_publication_resources_depend_on_gate():
    # Keep targeted publishing plans from bypassing the shared precondition.
    source = (Path(__file__).resolve().parents[1] / 'infra/terraform/main.tf').read_text()
    for resource_type, name in [('aws_s3_bucket_policy', 'frontend'),
                                ('aws_cloudfront_distribution', 'cdn'),
                                ('aws_instance', 'api')]:
        block = source.split(f'resource "{resource_type}" "{name}" {{', 1)[1].split('\nresource ', 1)[0]
        dependency = block.split('depends_on', 1)[1].split(']', 1)[0]
        assert 'terraform_data.privacy_publication_gate' in dependency
