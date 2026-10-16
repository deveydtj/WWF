"""Guard the low-cost AWS layout so the "server never shuts down" bill can't return."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TF_DIR = ROOT / "infra/terraform"
MAIN_TF = (TF_DIR / "main.tf").read_text()
USER_DATA = (TF_DIR / "user_data.sh.tftpl").read_text()


def test_no_always_on_billing_resources():
    """Load balancers, Fargate, NAT gateways, Elastic IPs and EFS bill even when idle."""
    for resource_type in ["aws_lb", "aws_alb", "aws_ecs_service", "aws_nat_gateway",
                          "aws_eip", "aws_efs_file_system", "aws_elasticache_cluster",
                          "aws_db_instance"]:
        assert f'resource "{resource_type}"' not in MAIN_TF, resource_type


def test_server_stops_instead_of_terminating_and_avoids_burst_charges():
    block = MAIN_TF.split('resource "aws_instance" "api" {', 1)[1].split("\nresource ", 1)[0]
    assert 'instance_initiated_shutdown_behavior = "stop"' in block
    assert 'cpu_credits = "standard"' in block
    assert "associate_public_ip_address          = true" in block


def test_idle_shutdown_runs_on_the_server():
    assert "systemctl poweroff" in USER_DATA
    assert "OnUnitActiveSec=5min" in USER_DATA
    # Idle timer starts before anything that can fail on first boot.
    assert USER_DATA.index("systemctl start wwf-idle.timer") < USER_DATA.index("systemctl start wwf-cert.service")
    # Health checks and live-update streams must not count as players.
    activity_map = USER_DATA.split("map \"$wwf_is_post:$uri\" $wwf_activity {", 1)[1].split("}", 1)[0]
    assert "health" not in activity_map and "stream" not in activity_map


def test_nightly_backstop_and_budget_kill_switch():
    assert 'resource "aws_cloudwatch_event_rule" "nightly_stop"' in MAIN_TF
    assert 'input     = jsonencode({ action = "nightly-stop" })' in MAIN_TF
    budget = MAIN_TF.split('resource "aws_budgets_budget" "wwf_monthly" {', 1)[1].split("\nresource ", 1)[0]
    assert "cost_filter" not in budget, "tag filters miss untagged resources"
    assert "aws_sns_topic.budget_kill.arn" in budget
    assert "budgets.amazonaws.com" in MAIN_TF  # SNS topic policy lets Budgets publish


def test_lambda_handles_wake_dns_and_kill_switch():
    source = (TF_DIR / "origin_control_lambda.py").read_text()
    for needle in ["start_instances", "stop_instances", "change_resource_record_sets",
                   "put_parameter", '"nightly-stop"', "192.0.2.1"]:
        assert needle in source


def test_waking_page_is_built_and_served_on_origin_errors():
    assert "waking: 'waking.html'" in (ROOT / "frontend/vite.config.js").read_text()
    page = (ROOT / "frontend/waking.html").read_text()
    assert "fetch('/wake'" in page and "fetch('/health'" in page
    assert re.search(r'response_page_path\s*=\s*"/waking.html"', MAIN_TF)
    # The app's own 503 responses must not be replaced by the waking page.
    assert "for_each = [502, 504]" in MAIN_TF


def test_frontend_deploy_keeps_live_donation_total():
    script = (ROOT / "scripts/deploy_frontend.sh").read_text()
    assert "--exclude donations.json" in script
    assert 'path_pattern           = "/donations.json"' in MAIN_TF
    donations = (TF_DIR / "donations.tf").read_text()
    assert 'billing_mode = "PAY_PER_REQUEST"' in donations  # no hourly DynamoDB charge
    assert 'resources = ["${aws_s3_bucket.frontend.arn}/donations.json"]' in donations


def test_idle_shutdown_is_15_minutes_and_typing_counts_as_activity():
    variables = (TF_DIR / "variables.tf").read_text()
    idle = variables.split('variable "idle_shutdown_minutes" {', 1)[1].split("\n}", 1)[0]
    assert "default     = 15" in idle
    # nginx answers the keep-alive itself; POSTs are logged as activity.
    assert "location = /activity {" in USER_DATA
    assert '"/activity"' in MAIN_TF  # CloudFront routes it to the server
    for page in ["frontend/static/js/gameBootstrap.js", "frontend/landing.js"]:
        assert "startActivityPings()" in (ROOT / page).read_text(), page


def test_activity_pings_are_throttled_to_one_a_minute():
    import subprocess
    subprocess.run(["node", "--input-type=module", "-e", """
import assert from 'node:assert/strict';
const sent = [];
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { sendBeacon: url => { sent.push(url); return true; } } });
const listeners = {};
const target = { addEventListener(type, fn) { listeners[type] = fn; } };
let clock = 0;
const { startActivityPings, PING_INTERVAL_MS } = await import('./frontend/static/js/activityPing.js');
startActivityPings(target, () => clock);
assert.deepEqual(Object.keys(listeners).sort(), ['input', 'keydown', 'pointerdown']);
listeners.keydown();                 // first letter typed -> ping
clock += 5000; listeners.keydown();  // more typing within the minute -> no extra ping
clock += 20000; listeners.pointerdown();
assert.deepEqual(sent, ['/activity']);
clock += PING_INTERVAL_MS; listeners.input();
assert.equal(sent.length, 2);
"""], check=True, cwd=ROOT, capture_output=True, text=True)


def test_flask_acknowledges_activity_pings_locally():
    from tests.test_server import load_server
    server, _ = load_server()
    assert server.activity_ping() == ("", 204)
    assert "activity_ping" in server.PUBLIC_ENDPOINTS
