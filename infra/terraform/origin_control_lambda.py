"""Start/stop helper for the single WordSquad API server.

One small function handles every way the server gets started or stopped:

* ``GET /wake`` (Lambda function URL behind CloudFront): start the server when
  a player visits and it is asleep. Refuses while the budget kill switch is on.
* EC2 state-change events: point ``origin.<domain>`` at the server's new public
  IP when it starts, and park the record on an unroutable address when it stops
  so CloudFront never sends players to a recycled IP.
* Nightly schedule (``{"action": "nightly-stop"}``): backstop stop in case the
  on-server idle timer ever fails.
* Budget alert via SNS: stop the server and turn on the kill switch so /wake
  cannot start it again until the owner clears it.
"""
import json
import os
import time
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

INSTANCE_ID = os.environ["INSTANCE_ID"]
HOSTED_ZONE_ID = os.environ["HOSTED_ZONE_ID"]
ORIGIN_RECORD = os.environ["ORIGIN_RECORD"]
PARKED_IP = os.environ.get("PARKED_IP", "192.0.2.1")  # TEST-NET-1, never assigned
WAKE_DISABLED_PARAM = os.environ["WAKE_DISABLED_PARAM"]
DNS_TTL = 30

ec2 = boto3.client("ec2")
route53 = boto3.client("route53")
ssm = boto3.client("ssm")


def lambda_handler(event, context):
    if event.get("source") == "aws.ec2":
        return _on_state_change(event)
    records = event.get("Records") or []
    if records and records[0].get("EventSource") == "aws:sns":
        return _kill_switch()
    if event.get("action") == "nightly-stop":
        return {"stopped": _stop("nightly backstop")}
    if "requestContext" in event:
        return _wake(event)
    return {"ignored": True}


# ---------- wake endpoint ----------

def _wake(event):
    if _wake_disabled():
        return _http(423, {"state": "disabled",
                           "msg": "Server paused by the monthly budget cap."})
    instance = _describe()
    state = instance["State"]["Name"]
    elapsed = _seconds_since_start(instance)
    if state == "stopped":
        try:
            ec2.start_instances(InstanceIds=[INSTANCE_ID])
            state = "pending"
            elapsed = 0
            # One bounded record per actual start, in the existing 7-day logs.
            # Keep cookies, credentials, query strings and request bodies out.
            http = event["requestContext"].get("http", {})
            headers = {key.lower(): value for key, value in event.get("headers", {}).items()}
            print(json.dumps({
                "event": "server_wake",
                "request_id": event["requestContext"].get("requestId", "")[:128],
                "forwarded_for": headers.get("x-forwarded-for", "")[-256:],
                "peer_ip": http.get("sourceIp", "")[:64],
                "user_agent": headers.get("user-agent", http.get("userAgent", ""))[:256],
            }))
        except ClientError as err:  # e.g. still finishing a stop
            print(f"start_instances failed: {err}")
            state = "stopping"
    body = {"state": state}
    # How long ago this boot began, so waiting pages can show a live estimate.
    if state in ("pending", "running") and elapsed is not None:
        body["elapsed"] = elapsed
    return _http(202 if state != "running" else 200, body)


def _http(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Cache-Control": "no-store"},
        "body": json.dumps(body),
    }


def _wake_disabled():
    try:
        value = ssm.get_parameter(Name=WAKE_DISABLED_PARAM)["Parameter"]["Value"]
    except ClientError:
        return False
    return value.strip().lower() == "true"


# ---------- stop paths ----------

def _stop(reason):
    if _state() in ("pending", "running"):
        print(f"Stopping {INSTANCE_ID}: {reason}")
        ec2.stop_instances(InstanceIds=[INSTANCE_ID])
        return True
    return False


def _kill_switch():
    ssm.put_parameter(Name=WAKE_DISABLED_PARAM, Value="true", Type="String", Overwrite=True)
    return {"stopped": _stop("budget cap reached"), "wake_disabled": True}


# ---------- DNS follow ----------

def _on_state_change(event):
    detail = event.get("detail", {})
    if detail.get("instance-id") != INSTANCE_ID:
        return {"ignored": True}
    state = detail.get("state")
    if state == "running":
        ip = None
        for _ in range(10):
            ip = _public_ip()
            if ip:
                break
            time.sleep(2)
        if not ip:
            print("Instance is running but has no public IPv4 address yet")
            return {"updated": False}
        _set_origin(ip)
        return {"updated": True, "ip": ip}
    if state in ("stopping", "stopped", "shutting-down", "terminated"):
        _set_origin(PARKED_IP)
        return {"updated": True, "ip": PARKED_IP}
    return {"ignored": True}


def _set_origin(ip):
    route53.change_resource_record_sets(
        HostedZoneId=HOSTED_ZONE_ID,
        ChangeBatch={"Changes": [{
            "Action": "UPSERT",
            "ResourceRecordSet": {
                "Name": ORIGIN_RECORD,
                "Type": "A",
                "TTL": DNS_TTL,
                "ResourceRecords": [{"Value": ip}],
            },
        }]},
    )
    print(f"{ORIGIN_RECORD} -> {ip}")


# ---------- helpers ----------

def _describe():
    reservations = ec2.describe_instances(InstanceIds=[INSTANCE_ID])["Reservations"]
    return reservations[0]["Instances"][0]


def _state():
    return _describe()["State"]["Name"]


def _seconds_since_start(instance):
    """Whole seconds since the instance last started (EC2 resets LaunchTime on every start)."""
    launched = instance.get("LaunchTime")
    if not isinstance(launched, datetime):
        return None
    if launched.tzinfo is None:
        launched = launched.replace(tzinfo=timezone.utc)
    return max(0, int((datetime.now(timezone.utc) - launched).total_seconds()))


def _public_ip():
    return _describe().get("PublicIpAddress")
