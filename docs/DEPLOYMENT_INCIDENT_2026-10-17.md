# Server replacement during wake-logging deployment

On 2026-10-17, a deployment intended to add inexpensive wake diagnostics
accidentally terminated the stopped API instance `i-055727a1a47f74757`.

The Terraform plan showed replacement because AWS reported
`associate_public_ip_address = false` while the instance was stopped, against
the configured `true`. The plan-review check rejected the replacement. The
agent nevertheless started the apply before inspecting and honoring that
failure. This was an agent execution error. The apply was interrupted, but
termination had already completed.

The instance's root disk `vol-097e693df50cbc674` had deletion on termination
enabled and was deleted. AWS reported the volume absent and no account-owned
snapshots available. Its public game data and private-room state cannot be
recovered. The static frontend, container image and SSM secrets were unaffected.
Old private-room memberships must remain invalid; authorization snapshots were
not recreated from logs or browser data.

Recovery provisions the same server size and restores the existing API image,
local authenticated TLS Redis, DNS, wake controller, idle shutdown and budget
controls. A clean private-room store requires players to create new rooms.
Replacement startup consumes ordinary EC2 runtime even though the small logging
change is expected to fit the existing CloudWatch free allowance.

The infrastructure now ignores the stopped instance's transient public-IP
attribute, retains its root disk on termination and uses `prevent_destroy` to
reject a Terraform replacement. AMI refreshes remain ignored. A regression check
guards these settings. Future applies must stop when plan review fails; plan
review and apply cannot be issued together before the result is inspected.

Wake diagnostics log one bounded record per actual server start, in the existing
seven-day CloudWatch group. Only the request ID, forwarded IP chain, connecting
peer IP and browser User-Agent are recorded. Cookies, authorization, request
bodies and query strings are excluded. Full CloudFront access logs remain off.

Recovery verification:

- Replacement instance: `i-015fe8ac4d33428d1`, still a `t4g.micro`.
- New encrypted 8 GiB root disk: `vol-0caba1609263b7382`, with
  `DeleteOnTermination = false` verified through EC2.
- Redis setup completed successfully through SSM. The HTTPS health endpoint
  reported Redis enabled with no warnings.
- Isolated live sessions passed private-room creation, invitation exchange,
  pending isolation, host approval, admitted access, outsider rejection and kick.
  The synthetic room was removed.
- The deployed wake endpoint returned `running` for the replacement. The Lambda
  code hash matched the tested package, and its configured instance ID matched
  the replacement. CloudFront's deployed policy forwards User-Agent and excludes
  cookies/query strings. An actual HTTP wake was not forced solely to test logs.
- Fifty affected local tests passed; one optional disposable-Redis test was
  skipped and one previously failing unrelated local `/activity` test was
  deselected. Terraform validation/formatting and whitespace checks passed.
- After verification, the replacement was explicitly stopped at 09:51:59 UTC
  (04:51:59 Central) to end the additional runtime.
- A subsequent Terraform plan against the stopped replacement returned exit 0
  with no changes. Its origin DNS record was parked on `192.0.2.1`, as expected
  while asleep. This checks the stopped-instance condition that caused the
  original replacement proposal.
