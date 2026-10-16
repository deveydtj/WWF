"""Stripe donation webhook: signature checks, totals, retries and refunds.

Runs fully offline: boto3 is replaced with small in-memory fakes, so no AWS
account or Stripe account is touched.
"""
import base64
import hashlib
import hmac
import importlib.util
import json
import sys
import time
import types
from pathlib import Path

import pytest

LAMBDA = Path(__file__).resolve().parents[1] / "infra/terraform/donations_lambda.py"
SECRET = "whsec_test_secret"


class ClientError(Exception):
    def __init__(self, response):
        super().__init__(response)
        self.response = response


class FakeDynamo:
    def __init__(self):
        self.items = {}

    def get_item(self, TableName, Key):
        item = self.items.get(Key["pk"]["S"])
        return {"Item": dict(item)} if item else {}

    def transact_write_items(self, TransactItems):
        for entry in TransactItems:  # check every condition before writing anything
            put = entry.get("Put")
            if put and "ConditionExpression" in put and put["Item"]["pk"]["S"] in self.items:
                raise ClientError({"CancellationReasons": [{"Code": "ConditionalCheckFailed"}]})
        for entry in TransactItems:
            if "Put" in entry:
                item = entry["Put"]["Item"]
                self.items[item["pk"]["S"]] = dict(item)
            else:
                update = entry["Update"]
                pk = update["Key"]["pk"]["S"]
                item = self.items.setdefault(pk, {"pk": {"S": pk}})
                values = update["ExpressionAttributeValues"]
                for field, key in (("raised_cents", ":c"), ("donations", ":n")):
                    total = int(item.get(field, {}).get("N", "0")) + int(values[key]["N"])
                    item[field] = {"N": str(total)}


class FakeS3:
    def __init__(self):
        self.objects = {}

    def put_object(self, Bucket, Key, Body, ContentType, CacheControl):
        self.objects[Key] = {"body": json.loads(Body), "cache": CacheControl}


class FakeSSM:
    def __init__(self, value):
        self.value = value

    def get_parameter(self, Name, WithDecryption):
        if self.value is None:
            raise ClientError({"Error": {"Code": "ParameterNotFound"}})
        return {"Parameter": {"Value": self.value}}


@pytest.fixture
def webhook(monkeypatch):
    fakes = {"dynamodb": FakeDynamo(), "s3": FakeS3(), "ssm": FakeSSM(SECRET)}
    boto3 = types.ModuleType("boto3")
    boto3.client = lambda name: fakes[name]
    botocore = types.ModuleType("botocore")
    exceptions = types.ModuleType("botocore.exceptions")
    exceptions.ClientError = ClientError
    botocore.exceptions = exceptions
    monkeypatch.setitem(sys.modules, "boto3", boto3)
    monkeypatch.setitem(sys.modules, "botocore", botocore)
    monkeypatch.setitem(sys.modules, "botocore.exceptions", exceptions)
    for key, value in {"TABLE_NAME": "wwf-donations", "BUCKET": "site", "GOAL_USD": "10",
                       "DONATE_URL": "https://buy.stripe.com/test", "PAYMENT_LINK_ID": "",
                       "WEBHOOK_SECRET_PARAM": "/wwf/stripe-webhook-secret"}.items():
        monkeypatch.setenv(key, value)
    spec = importlib.util.spec_from_file_location("donations_lambda_under_test", LAMBDA)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.fakes = fakes
    return module


def signed_request(payload, secret=SECRET, timestamp=None, base64_body=False):
    raw = json.dumps(payload).encode()
    timestamp = str(int(time.time()) if timestamp is None else timestamp)
    signature = hmac.new(secret.encode(), timestamp.encode() + b"." + raw, hashlib.sha256).hexdigest()
    return {
        "requestContext": {"http": {"method": "POST"}},
        "headers": {"Stripe-Signature": f"t={timestamp},v1={signature}"},
        "body": base64.b64encode(raw).decode() if base64_body else raw.decode(),
        "isBase64Encoded": base64_body,
    }


def checkout(event_id, cents, intent="pi_1", currency="usd", status="paid", link="plink_1"):
    return {"id": event_id, "type": "checkout.session.completed", "created": int(time.time()),
            "data": {"object": {"payment_status": status, "currency": currency, "amount_total": cents,
                                "payment_intent": intent, "payment_link": link}}}


def published(webhook):
    return webhook.fakes["s3"].objects["donations.json"]["body"]


def test_donation_updates_public_total(webhook):
    assert webhook.lambda_handler(signed_request(checkout("evt_1", 500)), None)["statusCode"] == 200
    assert webhook.lambda_handler(signed_request(checkout("evt_2", 250, "pi_2"), base64_body=True), None)["statusCode"] == 200
    total = published(webhook)
    assert total["raised"] == 7.5 and total["goal"] == 10 and total["donations"] == 2
    assert total["url"] == "https://buy.stripe.com/test"
    assert total["month"] == time.strftime("%Y-%m", time.gmtime())
    assert webhook.fakes["s3"].objects["donations.json"]["cache"].startswith("no-cache")
    # Nothing identifying the donor is published.
    assert set(total) == {"month", "raised", "goal", "currency", "donations", "updated", "url"}


def test_stripe_retry_is_counted_once(webhook):
    request = signed_request(checkout("evt_1", 500))
    webhook.lambda_handler(request, None)
    assert webhook.lambda_handler(request, None)["statusCode"] == 200
    assert published(webhook)["raised"] == 5


@pytest.mark.parametrize("request_event", [
    signed_request(checkout("evt_x", 500), secret="whsec_wrong"),
    signed_request(checkout("evt_x", 500), timestamp=int(time.time()) - 3600),
    {**signed_request(checkout("evt_x", 500)), "headers": {}},
])
def test_forged_or_stale_requests_are_rejected(webhook, request_event):
    assert webhook.lambda_handler(request_event, None)["statusCode"] == 400
    assert "donations.json" not in webhook.fakes["s3"].objects


def test_tampered_body_is_rejected(webhook):
    request = signed_request(checkout("evt_x", 500))
    request["body"] = request["body"].replace("500", "50000")
    assert webhook.lambda_handler(request, None)["statusCode"] == 400


def test_missing_secret_asks_stripe_to_retry(webhook):
    webhook.fakes["ssm"].value = None
    assert webhook.lambda_handler(signed_request(checkout("evt_1", 500)), None)["statusCode"] == 503


def test_unpaid_and_non_usd_sessions_do_not_count(webhook):
    webhook.lambda_handler(signed_request(checkout("evt_1", 500, status="unpaid")), None)
    webhook.lambda_handler(signed_request(checkout("evt_2", 500, currency="eur")), None)
    assert "donations.json" not in webhook.fakes["s3"].objects


def test_partial_then_full_refund(webhook):
    webhook.lambda_handler(signed_request(checkout("evt_1", 1000, "pi_9")), None)

    def refund(event_id, now, before):
        return {"id": event_id, "type": "charge.refunded",
                "data": {"object": {"payment_intent": "pi_9", "amount_refunded": now},
                         "previous_attributes": {"amount_refunded": before}}}

    webhook.lambda_handler(signed_request(refund("evt_r1", 300, 0)), None)
    assert published(webhook)["raised"] == 7
    webhook.lambda_handler(signed_request(refund("evt_r2", 1000, 300)), None)
    assert published(webhook)["raised"] == 0
    # Refunds of payments this webhook never counted are ignored.
    other = refund("evt_r3", 500, 0)
    other["data"]["object"]["payment_intent"] = "pi_other"
    webhook.lambda_handler(signed_request(other), None)
    assert published(webhook)["raised"] == 0


def test_payment_link_filter(webhook, monkeypatch):
    webhook.PAYMENT_LINK_ID = "plink_1"
    webhook.lambda_handler(signed_request(checkout("evt_1", 500, link="plink_other")), None)
    assert "donations.json" not in webhook.fakes["s3"].objects
    webhook.lambda_handler(signed_request(checkout("evt_2", 500, link="plink_1")), None)
    assert published(webhook)["raised"] == 5


def test_publish_action_starts_month_at_zero(webhook):
    assert webhook.lambda_handler({"action": "publish"}, None)["published"]["raised"] == 0
