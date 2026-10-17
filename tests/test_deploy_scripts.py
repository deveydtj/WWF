"""Run the deploy scripts against fake aws/docker/npm/curl commands.

The fakes keep an S3 bucket in a temp directory and log every call, so these
tests check what reaches S3 and in which order, without touching AWS.
"""
import base64
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
NEW_JS, NEW_CSS = "assets/game-NEW111.js", "assets/game-NEW222.css"
OLD_JS = "assets/game-OLD000.js"

FAKE = r'''#!PYTHON
import json, os, shutil, sys
from pathlib import Path

work = Path(os.environ["FAKE_WORK"])
bucket = work / "bucket"
name, args = Path(sys.argv[0]).name, sys.argv[1:]
with open(work / "calls.log", "a") as log:
    log.write(json.dumps([name] + args) + "\n")

def opt(flag, default=None):
    return args[args.index(flag) + 1] if flag in args else default

if name == "npm":
    dist = Path("dist")  # run from frontend/
    shutil.rmtree(dist, ignore_errors=True)
    (dist / "assets").mkdir(parents=True)
    for asset in json.loads(os.environ["FAKE_BUILD_ASSETS"]):
        (dist / asset).write_text("x")
    refs = json.loads(os.environ.get("FAKE_HTML_REFS", os.environ["FAKE_BUILD_ASSETS"]))
    tags = "".join(f'<script type="module" src="/{r}"></script>' for r in refs)
    for page in ["index", "game", "join", "age-check", "waking"]:
        (dist / f"{page}.html").write_text(f"<html>{tags}</html>")
elif name == "docker":
    if "--password-stdin" in args:
        sys.stdin.read()
elif name == "curl":
    url, out = args[-1], opt("-o")
    path = "/" + url.split("://", 1)[1].split("/", 1)[1] if url.count("/") > 2 else "/"
    if path == "/health":
        code, body = os.environ.get("FAKE_HEALTH", "200"), "{}"
    elif path == "/game":
        code, body = "302", ""
    elif path in ("/", "/join", "/age-check"):
        key = {"/": "index.html", "/join": "join.html", "/age-check": "age-check.html"}[path]
        source = bucket / key if path == "/" else Path(os.environ["FAKE_ROOT"]) / "frontend/dist" / key
        code, body = ("200", source.read_text()) if source.exists() else ("404", "")
    else:
        code, body = ("200", "x") if (bucket / path.lstrip("/")).exists() else ("403", "")
    if out and out != "/dev/null":
        Path(out).write_text(body)
    sys.stdout.write(code)
elif name == "aws":
    service, command = args[0], args[1]
    if (service, command) == ("s3", "sync"):
        src, dest = Path(args[2]), bucket / args[3].split("/", 3)[3] if args[3].count("/") > 2 else bucket
        excludes = [args[i + 1] for i, a in enumerate(args) if a == "--exclude"]
        def excluded(rel):
            return any(rel == e or (e.endswith("/*") and rel.startswith(e[:-1])) for e in excludes)
        files = {str(p.relative_to(src)) for p in src.rglob("*") if p.is_file()}
        for rel in files:
            if not excluded(rel):
                (dest / rel).parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(src / rel, dest / rel)
        if "--delete" in args:
            for p in list(dest.rglob("*")):
                rel = str(p.relative_to(dest))
                if p.is_file() and rel not in files and not excluded(rel):
                    p.unlink()
    elif (service, command) == ("s3api", "head-bucket"):
        sys.exit(254 if os.environ.get("FAKE_NO_BUCKET") else 0)
    elif (service, command) == ("s3api", "head-object"):
        sys.exit(0 if (bucket / opt("--key")).exists() else 254)
    elif service == "cloudfront" and command == "create-invalidation":
        print("I123")
    elif service == "ecr" and command == "get-login-password":
        print("pw")
    elif service == "ecr" and command == "describe-images":
        print("sha256:" + "a" * 64)
    elif service == "ec2":
        print(os.environ.get("FAKE_INSTANCES", ""))
    elif service == "ssm" and command == "send-command":
        params = opt("--parameters")
        shutil.copy(params.split("file://", 1)[1], work / "ssm-params.json")
        print("cmd-1")
    elif service == "ssm" and command == "get-command-invocation":
        if "Status" == opt("--query"):
            statuses = (work / "statuses").read_text().split()
            print(statuses[0])
            if len(statuses) > 1:
                (work / "statuses").write_text(" ".join(statuses[1:]))
        else:
            print("remote output\t")
'''.replace("#!PYTHON", "#!" + sys.executable)


@pytest.fixture
def deploy(tmp_path):
    root = tmp_path / "repo"
    shutil.copytree(ROOT / "scripts", root / "scripts")
    (root / "frontend").mkdir()
    (root / "bucket").mkdir()
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake = bin_dir / "fake.py"
    fake.write_text(FAKE)
    fake.chmod(0o755)
    for name in ["aws", "docker", "npm", "curl"]:
        (bin_dir / name).symlink_to(fake)
    # The old release's asset, still used by its HTML and open pages.
    (root / "bucket/assets").mkdir()
    (root / "bucket" / OLD_JS).write_text("old")
    (root / "bucket/donations.json").write_text("{}")
    (root / "bucket/stale.html").write_text("old page")
    (root / "bucket/index.html").write_text(f'<script type="module" src="/{OLD_JS}"></script>')

    def run(script, *args, **env):
        environ = {
            **os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}", "FAKE_WORK": str(root),
            "FAKE_ROOT": str(root), "FRONTEND_BUCKET": "bucket", "AWS_REGION": "us-east-1",
            "CF_DISTRIBUTION_ID": "E1", "SITE_DOMAIN": "example.test", "POLL_SECONDS": "0",
            "FAKE_BUILD_ASSETS": json.dumps([NEW_JS, NEW_CSS]), **env,
        }
        result = subprocess.run(["bash", str(root / "scripts" / script), *args], env=environ,
                                capture_output=True, text=True, timeout=60)
        calls = [json.loads(line) for line in (root / "calls.log").read_text().splitlines()] \
            if (root / "calls.log").exists() else []
        return result, calls

    run.root = root
    return run


def index_of(calls, predicate):
    return next(i for i, call in enumerate(calls) if predicate(call))


def test_frontend_deploy_publishes_assets_first_and_keeps_old_ones(deploy):
    result, calls = deploy("deploy_frontend.sh")
    assert result.returncode == 0, result.stderr
    bucket = deploy.root / "bucket"
    assert (bucket / OLD_JS).exists(), "older pages still need this"
    assert (bucket / NEW_JS).exists() and (bucket / "game.html").exists()
    assert (bucket / "donations.json").exists()
    assert not (bucket / "stale.html").exists()
    syncs = [c for c in calls if c[1:3] == ["s3", "sync"]]
    assert syncs[0][3].endswith("dist/assets") and "--delete" not in syncs[0]
    assert "--delete" in syncs[1] and "assets/*" in syncs[1]
    first_head = index_of(calls, lambda c: c[1:3] == ["s3api", "head-object"])
    assert calls.index(syncs[0]) < first_head < calls.index(syncs[1])
    assert "Live pages load all" in result.stdout


def test_frontend_deploy_stops_before_pages_if_an_asset_is_missing(deploy):
    result, calls = deploy("deploy_frontend.sh",
                           FAKE_HTML_REFS=json.dumps([NEW_JS, "assets/never-built.js"]))
    assert result.returncode != 0
    assert "/assets/never-built.js" in result.stderr
    assert not (deploy.root / "bucket/game.html").exists()
    assert not any(c[1:3] == ["cloudfront", "create-invalidation"] for c in calls)


def test_api_deploy_publishes_assets_before_the_image_and_leaves_a_sleeping_server(deploy):
    result, calls = deploy("deploy_api.sh", "1.dkr.ecr.us-east-1.amazonaws.com/wwf-api:latest")
    assert result.returncode == 0, result.stderr
    assert (deploy.root / "bucket" / NEW_JS).exists() and (deploy.root / "bucket" / OLD_JS).exists()
    asset_sync = index_of(calls, lambda c: c[1:3] == ["s3", "sync"])
    push = index_of(calls, lambda c: c[0] == "docker" and "--push" in c)
    assert asset_sync < push
    assert not any(c[1] == "ssm" for c in calls if c[0] == "aws")
    assert "asleep" in result.stdout


@pytest.mark.parametrize("statuses,ok", [
    ("Pending InProgress InProgress Success", True),
    ("InProgress Failed", False),
    ("TimedOut", False),
])
def test_api_deploy_waits_for_the_restart_result(deploy, statuses, ok):
    (deploy.root / "statuses").write_text(statuses)
    result, calls = deploy("deploy_api.sh", "1.dkr.ecr.us-east-1.amazonaws.com/wwf-api:latest",
                           FAKE_INSTANCES="i-123")
    assert (result.returncode == 0) is ok, result.stdout + result.stderr
    polls = [c for c in calls if c[1:3] == ["ssm", "get-command-invocation"] and "Status" in c]
    assert len(polls) == len(statuses.split())
    if ok:
        assert result.stdout.rstrip().endswith("Done.")
    else:
        assert "Deploy FAILED" in result.stderr and "Done." not in result.stdout


def test_restart_command_checks_health_and_the_pushed_image(deploy):
    (deploy.root / "statuses").write_text("Success")
    deploy("deploy_api.sh", "1.dkr.ecr.us-east-1.amazonaws.com/wwf-api:latest", FAKE_INSTANCES="i-123")
    params = json.loads((deploy.root / "ssm-params.json").read_text())
    encoded = re.fullmatch(r"echo (\S+) \| base64 -d \| bash", params["commands"][0]).group(1)
    remote = base64.b64decode(encoded).decode()
    subprocess.run(["bash", "-n"], input=remote, text=True, check=True)
    assert "systemctl restart wwf-app" in remote
    assert "http://127.0.0.1:5001/health" in remote
    assert "expected='sha256:" + "a" * 64 + "'" in remote
    assert "RepoDigests" in remote
    assert params["executionTimeout"] == ["600"]


@pytest.mark.parametrize("instances,ok", [("", True), ("i-123", False)])
def test_api_deploy_before_the_bucket_exists(deploy, instances, ok):
    """First-time setup pushes the image before terraform creates the bucket."""
    result, calls = deploy("deploy_api.sh", "1.dkr.ecr.us-east-1.amazonaws.com/wwf-api:latest",
                           FAKE_NO_BUCKET="1", FAKE_INSTANCES=instances)
    assert (result.returncode == 0) is ok, result.stdout + result.stderr
    assert "does not exist yet" in result.stderr
    assert not any(c[1:3] == ["s3", "sync"] for c in calls)
    assert not any(c[1:3] == ["ssm", "send-command"] for c in calls)
