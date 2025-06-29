# Development TODOs

This file tracks outstanding tasks for "Wordle with Friends". Completed items are checked off. Remaining work is grouped by focus area.

## Completed

- Added ARIA roles and keyboard focus management.
- Verified color contrast across themes.
- Sanitized definition text and handled emoji race conditions.
- Reduced polling interval when no users are active.
- Implemented Close-Call popup and server support.
- Implemented Daily Double mechanics with confetti and hint preview.
- Added optional sound effects and neumorphic notifications.
- Exposed `daily_double_available` in API responses and HUD badge.
- Implemented chat panel with toggle and animations.
- Documented public functions and added integration tests for major features.
- Provided a fully keyboard-driven flow for Daily Double selection
  (toggle `.hint-selecting` on badge click or `Space`, constrain focus to eligible tiles).
- Optional jingle respects the sound toggle and announces via `#ariaLive`.
- Unit test hint badge visibility and disappearance.
- Integration test reconnecting with an active Daily Double hint.
- A11y test for live region announcements and color contrast.
- Expand unit tests to cover additional API and UI logic.
- Add focused Jest/Pytest cases for Daily Double scenarios.

## Lobby System & API

- [ ] Convert global game state to a per-lobby dictionary keyed by six-character lobby codes.
- [ ] Implement the `/lobby` route family: create, state, emoji, guess, reset, stream, and lobby list.
- [ ] Enforce lobby lifecycle (waiting → active → finished) and purge idle or finished lobbies after 30 minutes.
- [ ] Require a `host_token` for privileged actions and rate-limit lobby creation.

## Frontend

- [x] Build new landing page served from `/` (see `LANDING_PAGE_REQUIREMENTS.md`).
- [x] Implement hero card actions: create lobby, join validation, and Quick Play.
- [x] Display a re-join chip using the last saved lobby code.
- [x] Add a sticky header with theme toggle plus Help and GitHub links.
- [x] Show feature highlight cards and a collapsible How-to-Play accordion.
- [x] Persist dark mode, emoji, and last lobby code in `localStorage`.
- [x] Write Jest DOM tests for rendering, validation, and preference storage.
- [ ] Display lobby header with code, player count, and host controls.
- [ ] Persist emoji across reloads and reclaim it via `POST /lobby/<id>/emoji`.

## Hosting & DevOps

- [ ] Containerize the Flask API and push images to ECR.
- [ ] Provision S3, CloudFront, ACM, ALB, and an ECS service via infrastructure as code.
- [ ] Configure GitHub Actions for CI/CD including Cypress tests and cache invalidation.
- [ ] Move persistence to Redis or DynamoDB when running multiple ECS tasks.

## Testing

- [ ] Add unit tests for lobby creation, join/rejoin flows, and SSE isolation per lobby.
- [ ] Add integration tests ensuring guesses and chat do not leak across lobbies.
- [ ] Add Playwright end-to-end test covering lobby creation through auto-expiration.

## Accessibility
No outstanding tasks.

## Polish

- [ ] Keep this TODO list updated as new issues arise.
