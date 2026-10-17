"""Wake attribution stays small and excludes private request data."""
import importlib.util
import json
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock


def test_only_actual_wakes_log_bounded_diagnostics(monkeypatch, capsys):
    for key in ('INSTANCE_ID', 'HOSTED_ZONE_ID', 'ORIGIN_RECORD', 'WAKE_DISABLED_PARAM'):
        monkeypatch.setenv(key, 'test-' + key.lower())
    clients = {name: Mock() for name in ('ec2', 'route53', 'ssm')}
    # Lambda provides the AWS SDK; local backend tests need no SDK installation.
    monkeypatch.setitem(sys.modules, 'boto3', SimpleNamespace(client=lambda name: clients[name]))
    monkeypatch.setitem(sys.modules, 'botocore', SimpleNamespace())
    monkeypatch.setitem(sys.modules, 'botocore.exceptions', SimpleNamespace(ClientError=Exception))
    path = Path(__file__).resolve().parents[1] / 'infra/terraform/origin_control_lambda.py'
    spec = importlib.util.spec_from_file_location('wake_logging_test', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    ec2, ssm = clients['ec2'], clients['ssm']
    ssm.get_parameter.return_value = {'Parameter': {'Value': 'false'}}
    state = {'State': {'Name': 'stopped'}}
    ec2.describe_instances.return_value = {'Reservations': [{'Instances': [state]}]}
    event = {
        'requestContext': {'requestId': 'request-1', 'http': {'sourceIp': '192.0.2.2'}},
        'headers': {'User-Agent': 'browser\n' * 100, 'X-Forwarded-For': '198.51.100.1, 192.0.2.2',
                    'Cookie': 'private-cookie', 'Authorization': 'private-credential',
                    'Referer': 'https://example.com/?private-query'},
        'body': 'private-invitation', 'rawQueryString': 'private-query',
    }
    response = module.lambda_handler(event, None)
    assert response['statusCode'] == 202
    ec2.start_instances.assert_called_once_with(InstanceIds=['test-instance_id'])
    output = capsys.readouterr().out
    record = json.loads(output)
    assert record == {
        'event': 'server_wake', 'request_id': 'request-1', 'peer_ip': '192.0.2.2',
        'forwarded_for': '198.51.100.1, 192.0.2.2', 'user_agent': ('browser\n' * 100)[:256],
    }
    assert len(output.splitlines()) == 1 and len(output.encode()) < 1024
    assert 'private-' not in output

    state['State']['Name'] = 'running'
    assert module.lambda_handler(event, None)['statusCode'] == 200
    ssm.get_parameter.return_value = {'Parameter': {'Value': 'true'}}
    assert module.lambda_handler(event, None)['statusCode'] == 423
    assert capsys.readouterr().out == ''
    assert ec2.start_instances.call_count == 1
