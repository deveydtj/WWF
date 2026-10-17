## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for `deveydtj/WWF`. Before issue operations, read `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. Before triaging issues, read `docs/agents/triage-labels.md`.

### Domain docs

Use a single-context layout: root `GLOSSARY.md` and `docs/adr/`. Before exploring the codebase, read `docs/agents/domain.md`.

### AWS simulator

`dev-tools/aws-sim/` runs the real app behind a local copy of the AWS sleep/wake setup (CloudFront, the wake Lambda, EC2 stop/start, nginx idle shutdown). It reads CloudFront from `infra/terraform/main.tf` and keeps hand-made copies of the rest. When a change touches `main.tf` cache behaviours or origins, `user_data.sh.tftpl`, `setup_local_redis.sh`, `origin_control_lambda.py` or `docker/Dockerfile`, update the simulator in the same change; `tests/test_aws_sim_drift.py` fails until you do. Before deploying anything that affects sleep, wake or reconnecting, run `python3 dev-tools/aws-sim/scenarios.py` and `python3 dev-tools/aws-sim/browser_check.py`.
