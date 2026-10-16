"""Stripe webhook -> live "server fund" total on the landing page.

Stripe calls this function's URL after every payment. It checks Stripe's
signature, adds the amount to this month's total in DynamoDB (each Stripe event
is counted once, even if Stripe retries), and rewrites the public
``donations.json`` file that the landing page's donation card reads.

Nothing about the donor (name, email, message) is stored or published, only
amounts per month.

Events handled:
* checkout.session.completed (paid) / checkout.session.async_payment_succeeded:
  add the donation.
* charge.refunded: subtract the refunded part of a donation counted here.
* {"action": "publish"} (monthly schedule and at deploy): rewrite the file so a
  new month starts at $0.
"""
import base64
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

TABLE = os.environ["TABLE_NAME"]
BUCKET = os.environ["BUCKET"]
OBJECT_KEY = os.environ.get("OBJECT_KEY", "donations.json")
GOAL_USD = float(os.environ["GOAL_USD"])
DONATE_URL = os.environ.get("DONATE_URL", "")
SECRET_PARAM = os.environ["WEBHOOK_SECRET_PARAM"]
PAYMENT_LINK_ID = os.environ.get("PAYMENT_LINK_ID", "")  # optional: only count this link
CURRENCY = "usd"
SIGNATURE_TOLERANCE = 300  # seconds, same as Stripe's libraries
EVENT_TTL = 90 * 24 * 3600

ddb = boto3.client("dynamodb")
s3 = boto3.client("s3")
ssm = boto3.client("ssm")
_secret = None


def lambda_handler(event, context):
    if event.get("action") == "publish":
        return {"published": publish()}
    if "requestContext" not in event:
        return {"ignored": True}
    return _webhook(event)


# ---------- webhook ----------

def _webhook(event):
    method = event["requestContext"].get("http", {}).get("method", "")
    if method != "POST":
        return _http(405, "POST only")
    body = event.get("body") or ""
    raw = base64.b64decode(body) if event.get("isBase64Encoded") else body.encode("utf-8")
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    secret = _webhook_secret()
    if not secret:
        # Secret not stored yet: ask Stripe to retry later rather than drop it.
        return _http(503, "Webhook secret not configured")
    if not verify_signature(raw, headers.get("stripe-signature", ""), secret):
        return _http(400, "Bad signature")

    stripe_event = json.loads(raw)
    kind = stripe_event.get("type")
    obj = stripe_event.get("data", {}).get("object", {})
    if kind in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        _on_checkout(stripe_event, obj)
    elif kind == "charge.refunded":
        _on_refund(stripe_event, obj)
    # Anything else is acknowledged so Stripe doesn't keep retrying it.
    return _http(200, "ok")


def verify_signature(raw, header, secret, now=None):
    """Stripe's v1 scheme: HMAC-SHA256 of "<timestamp>.<raw body>"."""
    if not header or not secret:
        return False
    timestamp, signatures = None, []
    for part in header.split(","):
        key, _, value = part.strip().partition("=")
        if key == "t":
            timestamp = value
        elif key == "v1":
            signatures.append(value)
    if not timestamp or not timestamp.isdigit() or not signatures:
        return False
    now = time.time() if now is None else now
    if abs(now - int(timestamp)) > SIGNATURE_TOLERANCE:
        return False
    expected = hmac.new(secret.encode("utf-8"), timestamp.encode("utf-8") + b"." + raw,
                        hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, sig) for sig in signatures)


def _on_checkout(stripe_event, session):
    if session.get("payment_status") != "paid":
        return  # async methods arrive later as async_payment_succeeded
    if (session.get("currency") or "").lower() != CURRENCY:
        print(f"Skipping non-USD session {session.get('id')}")
        return
    if PAYMENT_LINK_ID and session.get("payment_link") != PAYMENT_LINK_ID:
        return
    amount = int(session.get("amount_total") or 0)
    if amount <= 0:
        return
    month = _month(stripe_event.get("created"))
    items = [
        _event_marker(stripe_event["id"]),
        _month_update(month, amount, count=1),
    ]
    if session.get("payment_intent"):
        # Remember which month this payment counted toward, for refunds.
        items.append({"Put": {
            "TableName": TABLE,
            "Item": {"pk": {"S": f"pi#{session['payment_intent']}"},
                     "month": {"S": month}, "amount_cents": {"N": str(amount)}},
        }})
    if _apply(items):
        publish()


def _on_refund(stripe_event, charge):
    payment_intent = charge.get("payment_intent")
    if not payment_intent:
        return
    found = ddb.get_item(TableName=TABLE, Key={"pk": {"S": f"pi#{payment_intent}"}}).get("Item")
    if not found:
        return  # not a donation this function counted
    previous = stripe_event.get("data", {}).get("previous_attributes", {})
    refunded_now = int(charge.get("amount_refunded") or 0)
    refunded_before = int(previous.get("amount_refunded") or 0)
    delta = min(refunded_now - refunded_before, int(found["amount_cents"]["N"]))
    if delta <= 0:
        return
    items = [_event_marker(stripe_event["id"]), _month_update(found["month"]["S"], -delta, count=0)]
    if _apply(items):
        publish()


def _event_marker(event_id):
    return {"Put": {
        "TableName": TABLE,
        "Item": {"pk": {"S": f"evt#{event_id}"},
                 "expires_at": {"N": str(int(time.time()) + EVENT_TTL)}},
        "ConditionExpression": "attribute_not_exists(pk)",
    }}


def _month_update(month, cents, count):
    return {"Update": {
        "TableName": TABLE,
        "Key": {"pk": {"S": f"month#{month}"}},
        "UpdateExpression": "ADD raised_cents :c, donations :n",
        "ExpressionAttributeValues": {":c": {"N": str(cents)}, ":n": {"N": str(count)}},
    }}


def _apply(items):
    """Write everything or nothing; False if Stripe re-sent an event we already counted."""
    try:
        ddb.transact_write_items(TransactItems=items)
        return True
    except ClientError as err:
        reasons = err.response.get("CancellationReasons") or []
        if reasons and reasons[0].get("Code") == "ConditionalCheckFailed":
            print("Duplicate Stripe event ignored")
            return False
        raise


# ---------- public file ----------

def publish():
    month = _month()
    item = ddb.get_item(TableName=TABLE, Key={"pk": {"S": f"month#{month}"}}).get("Item", {})
    raised_cents = max(0, int(item.get("raised_cents", {}).get("N", "0")))
    body = {
        "month": month,  # UTC calendar month the total belongs to
        "raised": round(raised_cents / 100, 2),
        "goal": GOAL_USD,
        "currency": "USD",
        "donations": int(item.get("donations", {}).get("N", "0")),
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    if DONATE_URL:
        body["url"] = DONATE_URL
    s3.put_object(Bucket=BUCKET, Key=OBJECT_KEY, Body=json.dumps(body).encode("utf-8"),
                  ContentType="application/json", CacheControl="no-cache, max-age=0")
    return body


# ---------- helpers ----------

def _month(unix_seconds=None):
    when = datetime.fromtimestamp(unix_seconds, timezone.utc) if unix_seconds else datetime.now(timezone.utc)
    return when.strftime("%Y-%m")


def _webhook_secret():
    global _secret
    if not _secret:
        try:
            _secret = ssm.get_parameter(Name=SECRET_PARAM, WithDecryption=True)["Parameter"]["Value"].strip()
        except ClientError as err:
            print(f"Cannot read {SECRET_PARAM}: {err}")
            return ""
    return _secret


def _http(status, text):
    return {"statusCode": status, "headers": {"Content-Type": "text/plain"}, "body": text}
