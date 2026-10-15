# WordSquad COPPA readiness review

Reviewed October 13, 2026 against the current 16 CFR Part 312 and FTC guidance.

**Status: not certified; not ready to represent that the service meets COPPA.**
This is a source-code review of the local working tree. It does not establish
actual production behavior, legal coverage, or acceptance by a certification
program. No certification seal or compliance claim has been added.

## Decisions needed from the operator

The owner has deferred the operator details until before publication. AWS
publication now has a hard Terraform gate in
`infra/terraform/privacy-publication.tf`: all five `privacy_operator` fields
must be supplied, the contact email and HTTPS website URL must pass basic
format checks, and `privacy_notice_reviewed` must be explicitly true after
the notice is complete and reviewed. The live tfvars deliberately leave the
fields empty and the flag false. This blocks fresh plans/applies, including
`ci-plan.sh`; it does not control uploads made independently through AWS tools,
retroactively invalidate saved plans, or establish certification.

The owner chose ages 13+ for multiplayer and chat. A neutral age screen now
runs before lobby creation/registration, direct game initialization, or chat.
The server checks the signed eligibility cookie for game requests, including
state, lobby discovery and SSE, so hiding the screen or changing localStorage
does not grant access. An under-13 result prevents resubmission in the same
browser session; public home/how-to content remains accessible. The submitted
age is not stored. Only eligibility, check time and the nonpermanent session
marker are retained in the cookie. Eligible sessions expire after 12 hours,
and existing streams close at that deadline. Denied results remain blocked
for the validity of the browser-session cookie. Cookies are HttpOnly and
SameSite=Lax, and Secure in production. Browser session restoration can retain
session cookies, and deleting cookies or using another browser can permit a
new screen. This is self-reported eligibility, not identity verification,
parental consent, or certification.

AWS configuration injects the signing key using `session_secret_arn`, sets
production cookie behavior, and routes age/game endpoints through CloudFront
to the ALB without caching, forwarding only the age-session cookie. A missing
secret ARN blocks API deployment; a missing or short signing key blocks
production startup. These settings still need verification on the deployed
HTTPS domain; no AWS deployment was performed in this work.

- Review the selected 13+ audience classification before publication.
  A general-audience age restriction cannot substitute for parental consent
  if the service is primarily directed to children. Audience classification
  needs to consider design, marketing, and actual audience evidence.
- Supply the legal operator name, mailing address, telephone number, privacy
  contact email, deployed URL, and actual service providers.
- Choose an FTC-approved COPPA safe harbor program if formal certification
  is desired. Certification requires its assessment and acceptance; code
  changes alone cannot award it. Do not publish a seal before authorization.

## Source evidence and unresolved requirements

| Area | Current behavior | Required work before child access / certification |
| --- | --- | --- |
| Eligibility / consent | Multiplayer, registration, lobby discovery, chat and state/SSE require a signed age-eligibility session. Ages 13+ are allowed; under-13 results are blocked for that browser session. | Verify actual audience classification and deployed enforcement. If the service is child-directed or under-13 participation is added, implement the applicable parent notices, verifiable consent, rights and disclosure controls before collecting child data. An age screen alone cannot resolve audience classification. |
| Public disclosure | Eligible players can submit free-text chat, which is persisted and included in gated state/SSE broadcasts. Unscreened/under-13 requests cannot reach chat or lobby discovery. Emoji input still accepts arbitrary nonempty strings. | Review chat safety and data handling for the approved audience. If child participation is added, prevent unconsented collection/disclosure across all input and broadcast paths. Filtering alone is insufficient. |
| Privacy notice | No dedicated privacy notice was found in the frontend. | Publish accurate operator/contact, data categories, purposes, recipients, retention/deletion, parental rights, and internal-operations practices; link prominently on home and collection pages. Finalize from verified operations rather than invented contacts or promises. |
| Parent rights / actual knowledge | Under-13 participation is blocked by the new screen. Leave/kick is not comprehensive deletion; existing chat/history can remain. | Establish a process for reports that an existing player is under 13, including stopping collection and removing any improperly retained data. If child participation is added, provide the required authenticated parent review, refusal, revocation and deletion process. |
| Game storage | `backend/data_persistence.py` stores IP mappings, player IDs, chat, guesses/history, and host tokens in JSON and optionally Redis. Redis writes have no expiry. | Adopt a purpose-specific written retention policy and implement bounded retention for every store, including dormant persisted lobbies and DEFAULT. Test deletion across memory, JSON, Redis, backups, and failures. |
| Cleanup | `backend/server.py` removes loaded non-default idle lobbies after 30 minutes when cleanup runs. DEFAULT is excluded. Disk lobbies not loaded into memory are not enumerated by purge. The local cleanup thread starts only in script mode. | Schedule and monitor cleanup in the actual deployment; do not describe current cleanup as a guarantee covering all data. Implement storage-level expiration and failure handling. |
| Browser storage | Game identifiers/preferences remain in localStorage without a general expiry. The age screen retains no age/birthdate in storage and clears local player/lobby/host/hint identifiers on denial. | Establish justified lifetimes for remaining game storage, and make the notice match actual behavior. A shared-device session is not individual identity verification. |
| Logs | Application logs previously included IPs, player IDs, guesses, lobby codes and avatars; analytics appended identifying events indefinitely. | New application log calls omit identifying fields. Persistent analytics are now disabled at startup; event writers retain only event type and timestamp if explicitly initialized. Separately inventory and dispose of legacy analytics/application logs under an approved policy. Hosting/access logs remain outside these code changes. |
| Security | Broad CORS is enabled; several reconnect paths treat matching IP plus syntactically valid IDs as authorization. Admin notification endpoint lacks authentication. | Review authentication and isolation, replace IP-based identity recovery, authorize administrative routes, constrain origins, and test cross-lobby access and revocation. Maintain a written security program, designated responsibility, provider assurances and periodic review. |
| Providers | Terraform describes AWS hosting and seven-day API CloudWatch retention; Redis and server-side dictionary requests are possible. Donation links are configurable. | Confirm actual hosting, subprocessors, TLS, Redis access, access logs, backups, payment flows and written provider assurances. Inventory every third-party data flow. Obtain required separate consent for third-party disclosures; do not use child data for behavioral advertising. |

## Changes made during this review

- Disabled automatic persistent analytics initialization.
- Restricted analytics records to event type and timestamp, ignoring arbitrary
  caller fields so future event additions cannot quietly reintroduce identifiers.
- Removed identifiers and user-supplied content from application INFO log calls.
- Added `no-store` for mutation responses and SSE streams, a `no-referrer`
  policy, and content-type sniffing protection. Existing state/chat endpoints
  continue to prohibit caching.
- Added regression checks for telemetry minimization, registration log privacy,
  and credential/stream response headers; updated event tests to assert the
  minimized record shape.
- Added the neutral age screen and signed server enforcement for the selected
  13+ multiplayer/chat experience, including direct links, API calls and SSE.
- Added production signing-key checks and AWS secret injection, cookie
  forwarding, HTTPS API routing and disabled caching for age/game responses.

These changes reduce exposure. They do not implement parental consent,
parental rights, comprehensive retention, or certification. Existing stored
data has not been deleted, and no deployment has been changed.

## Completion evidence needed

Local verification of the 13+ restriction: 325 Python tests passed (5 skipped),
8 live desktop/mobile Chrome age-flow checks passed, and 8 existing lobby
startup/layout browser checks passed. The production frontend build, CSS lint,
Terraform formatting and Terraform configuration validation passed. The AWS
provider was validated locally with no deployment or AWS account operations.
The deployed HTTPS service still needs verification before publication.

Before representing child access as compliant, record the approved audience
classification, finalized notices, consent/revocation and parental-rights test
results, data inventory, implemented retention/deletion evidence, security
program and provider assurances, and a review of the deployed service. For a
certification claim, also retain the chosen program's written acceptance,
covered domains/services, current membership, seal permissions and ongoing
assessment obligations.

## Primary sources

- [Current COPPA rule, 16 CFR Part 312](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312)
- [FTC six-step compliance plan (May 2026)](https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business)
- [FTC-approved safe harbor programs](https://www.ftc.gov/enforcement/coppa-safe-harbor-program)
- [FTC neutral age-screen guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)
- [AWS cookie forwarding](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Cookies.html)
- [AWS HTTPS origin and Host certificate matching](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-https-cloudfront-to-custom-origin.html)
