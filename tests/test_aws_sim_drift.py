"""Keep the local AWS simulator (dev-tools/aws-sim) in step with production.

The simulator reads CloudFront from main.tf each time it starts. Server,
nginx, systemd, Lambda and container behaviour can't be read that way, so
aws_sim.py carries hand-made copies. These tests fail when a copied source
changes, so the copy is reviewed in the same change. See dev-tools/aws-sim/README.md.
"""
import importlib.util
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def sim():
    spec = importlib.util.spec_from_file_location("aws_sim", ROOT / "dev-tools/aws-sim/aws_sim.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_simulator_can_read_cloudfront_from_main_tf(sim):
    cf = sim.parse_cloudfront_config(sim.MAIN_TF)   # raises ConfigDrift on anything unexpected
    routes = dict(cf["behaviors"])
    assert routes["/wake"] == "wake"
    assert routes["/waking.html"] == "frontend"
    assert {"/state", "/guess", "/stream", "/health", "/vote-reset"} <= set(cf["api_patterns"])
    assert cf["default_origin"] == "frontend"
    assert cf["error_page"] == "/waking.html" and cf["error_codes"]


def test_hand_made_copies_match_their_sources(sim):
    stale = {key: sim.fingerprint(text) for key, text in sim.source_sections().items()
             if sim.SOURCE_FINGERPRINTS.get(key) != sim.fingerprint(text)}
    assert not stale, (
        "Production behaviour the AWS simulator copies has changed:\n"
        + "\n".join(f"  {key}" for key in stale)
        + "\nUpdate the matching copy in dev-tools/aws-sim/aws_sim.py (see the comment above "
          "SOURCE_FINGERPRINTS), then record the new fingerprints from\n"
          "  python3 dev-tools/aws-sim/aws_sim.py --fingerprints")


def test_copied_values_agree_with_production(sim):
    """Direct checks for the copies that matter most, independent of the fingerprints."""
    sections = sim.source_sections()
    nginx = sections["infra/terraform/user_data.sh.tftpl#nginx"]
    # The activity map: GET pages that count, and POST paths that don't.
    get_rule = re.search(r'"~\^0:(/[^"]+)" 1;', nginx).group(1)
    post_skip = re.search(r'"~\^1:(/[^"]+)" 0;', nginx).group(1)
    assert sim.ACTIVITY_GET_RE.pattern == "^" + get_rule
    assert sim.ACTIVITY_POST_EXCLUDE_RE.pattern == "^" + post_skip
    assert "location = /activity" in nginx and "return 204;" in nginx

    unit = sections["infra/terraform/user_data.sh.tftpl#wwf-app.service"]
    restart = int(re.search(r"RestartSec=(\d+)", unit).group(1))
    grace = int(re.search(r"docker stop -t (\d+)", unit).group(1))
    for preset in sim.PRESETS.values():
        assert preset["restart_sec"] == restart
        assert preset["app_stop_grace"] == grace

    prepare = sections["infra/terraform/user_data.sh.tftpl#wwf-prepare"]
    hops = re.search(r"TRUSTED_PROXY_HOPS=(\d+)", prepare).group(1)
    assert f'"TRUSTED_PROXY_HOPS": "{hops}"' in (ROOT / "dev-tools/aws-sim/aws_sim.py").read_text()

    entry = sections["docker/Dockerfile#ENTRYPOINT"]
    assert "gunicorn -k gevent --timeout 0" in entry and "backend.server:app" in entry
