# Development TODOs

This file tracks outstanding tasks for WordSquad. Completed items are checked off. Remaining work is grouped by focus area.

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
 - [x] Convert global game state to a per-lobby dictionary keyed by six-character lobby codes.
 - [x] Implement the `/lobby` route family: create, state, emoji, guess, reset, stream, and lobby list.
 - [x] Enforce lobby lifecycle (waiting → active → finished) and purge idle or finished lobbies after 30 minutes.
 - [x] Require a `host_token` for privileged actions and rate-limit lobby creation.
- [x] Build new landing page served from `/` (see `docs/LANDING_PAGE_REQUIREMENTS.md`).
- [x] Implement hero card actions: create lobby, join validation, and Quick Play.
- [x] Display a re-join chip using the last saved lobby code.
- [x] Add a sticky header with theme toggle plus Help and GitHub links.
- [x] Show feature highlight cards and a collapsible How-to-Play accordion.
- [x] Persist dark mode, emoji, and last lobby code in `localStorage`.
- [x] Write Jest DOM tests for rendering, validation, and preference storage.
- [x] Implement How-to-Play accordion toggle and inline join-code validation.
- [x] Display lobby header with code, player count, and host controls.
- [x] Persist emoji across reloads and reclaim it via `POST /lobby/<id>/emoji`.
 - [x] Containerize the Flask API and push images to ECR.
- [x] Provision S3, CloudFront, ACM, ALB, and an ECS service via infrastructure as code.
- [x] Configure GitHub Actions for CI/CD including Cypress tests and cache invalidation.
- [x] Move persistence to Redis or DynamoDB when running multiple ECS tasks.
- [x] Consolidate backend Python dependencies in `backend/requirements.txt` and update the workflow to install from this file instead of only pytest.
- [x] Add a `tests/` directory with a health-check Pytest that hits the Flask server and expects a 200 response. Update the workflow to fail fast with `pytest -x`.
- [x] Move `package.json` and lockfile into `frontend/` and ensure Cypress and build tools are listed under dev dependencies. Run `npm ci` from that folder in the workflow.
- [x] Create a minimal Cypress config that targets the Flask backend URL and add a smoke test verifying the page loads. Start the server in the workflow before launching Cypress.
- [x] Harden the AWS deploy stage so it only runs on `main` when AWS secrets are present.
- [x] Execute the frontend build step prior to Docker and copy the `dist` output into the backend's static directory.
- [x] Add a `.dockerignore` excluding tests, workflow files, and `frontend/node_modules` to reduce image build context.
- [x] Cache Python and Node dependencies in the workflow and temporarily allow the Cypress step to continue on error until the smoke test passes.
- [x] Add unit tests for lobby creation, join/rejoin flows, and SSE isolation per lobby.
- [x] Add integration tests ensuring guesses and chat do not leak across lobbies.
- [x] Add Playwright end-to-end test covering lobby creation through auto-expiration.
- [x] Keep this TODO list updated as new issues arise.
- [x] Establish a short branch naming convention such as `feat/lobby-backend` or `fix/landing-ui`.
- [x] Require GitHub status checks (pytest, Cypress, Terraform plan) before merging to `main`.
- [x] Create `lobby.py` with a `Lobby` dataclass storing id, host token, state, players, chat and timestamps.
- [x] Maintain a global thread-safe `LOBBIES` dictionary and remove the single-room globals from `server.py`.
- [x] Implement REST endpoints:
- [x] Scope SSE broadcasting to each lobby via `listeners[lobby_id]`.
- [x] Clean up idle lobbies every ten minutes when `last_active` is over thirty minutes old.
- [x] Add middleware for rate limiting (max five lobby creations per IP per minute) and lobby id validation.
- [x] Toggle persistence: JSON file in single-instance mode, stubs for Redis or DynamoDB otherwise.
- [x] Add unit tests for all lobby service helpers.
 - [x] Add `frontend/landing.html`, `landing.js` and `landing.css` implementing the hero panel and create/join flows.
- [x] Provide a modal to copy the invite link and use the Web Share API on mobile if available.
 - [x] Implement a lightweight hash router to swap between the landing page and lobby board.
 - [x] Include a header bar inside the lobby view with lobby code, player count and host menu.
 - [x] Build a player sidebar component with emoji, score and AFK indicator plus kick controls.
 - [x] Display a waiting-room overlay while the lobby state is `waiting`.
 - [x] Perform an accessibility pass covering focus management, ARIA labels and color contrast.
 - [x] Replace hard-coded `/state` and `/stream` calls with lobby-specific endpoints.
- [x] Hydrate the board via `GET /lobby/<id>/state` on load and subscribe to `/lobby/<id>/stream`.
- [x] Update emoji claim and rejoin logic to post to `/emoji` with the lobby id.
- [x] Show toast notifications for full lobbies, kicks and expired sessions.
- [x] Create `infra/live/variables.tfvars` and configure a remote-state backend (S3 + DynamoDB lock).
- [x] Insert an ALB idle-timeout override of 3600 seconds and optionally include Redis/Dynamo modules.
- [x] Output the CloudFront domain and ALB DNS for CI consumption.
- [x] Expose port 5000 in the Dockerfile and run `gunicorn -k gevent --timeout 0` by default.
- [x] Pass environment variables such as `SINGLE_INSTANCE=true` in the task definition.
- [x] Mount EFS when JSON persistence is enabled.
- [x] Add repository secrets for `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ACCOUNT_ID`, `AWS_REGION`, `ECR_REPO`, `TF_VAR_domain` and `CF_DISTRIBUTION_ID`.
- [x] Update the GitHub Actions workflow to run `terraform fmt -check`, `terraform init`, `terraform plan` and apply only after tests succeed.
- [x] Trigger a CloudFront cache invalidation after successful deploys.
- [x] Write backend unit tests for lobby CRUD, rate limiting and id validation.
- [x] Add integration tests confirming events never cross between lobbies.
- [x] Implement Cypress or Playwright E2E tests covering lobby creation through game completion.
- [x] Include the new tests in the CI matrix (`pytest -q`, `cypress run --browser chrome`).
- [x] Log structured JSON events for `lobby_created`, `lobby_joined` and `lobby_finished`.
- [x] Create CloudWatch metric filters alerting on error rates above five per minute.
- [x] Schedule a daily CloudWatch Event or Lambda to trigger the idle-lobby cleanup if not using the in-process thread.
- [x] Update `docs/ARCHITECTURE.md` with diagrams showing the landing page, lobby flow and SSE connections.
- [x] Replace the single-room explanation in `README.md` with the multi-lobby design.
- [x] Ensure `docs/LANDING_PAGE_REQUIREMENTS.md` is linked from the main documentation.
- [x] Provide a `docs/DEPLOY_GUIDE.md` detailing Terraform bootstrap steps and secret configuration.
- [x] Setup Validation
  - [x] State Management Framework
- [x] Sound Resilience
  - [x] Close SSE connections on page unload and lobby exit.
- [x] Add Logging
  - [x] Add prompts for key input.
  - [x] Add transition animations or effects.

## Lobby System & API


## Frontend


## Hosting & DevOps

## CI/CD Pipeline Improvements


## Testing


## Accessibility
No outstanding tasks.

## Polish


## Upcoming Milestones

### Project Hygiene
- [ ] Rename all references to "Wordle With Friends" to the new game name "WordSquad" throughout docs and code comments.

### Backend Refactor to Multi-Lobby
  - `POST /lobby`
  - `GET /lobby/<id>/state`
  - `POST /lobby/<id>/state` (heartbeat)
  - `POST /lobby/<id>/emoji`
  - `POST /lobby/<id>/guess`
  - `POST /lobby/<id>/reset`
  - `GET /lobby/<id>/stream`
  - `GET /lobbies`

### Landing Page & Client Routing

### Frontend Interaction with New API

### Infrastructure & Terraform

### Docker & ECS

### CI/CD Secrets & Workflow

### Testing Suites

### Analytics, Logging & Monitoring

### Docs & Deliverables

### To-Do List Workflow for WordSquad

  - Write a `scripts/setup.sh` or documentation to check Python version and dependencies.
  - Log missing asset errors during startup.
- [ ] Event Loop Cleanup
  - Centralize the main game loop.
  - Handle all Pygame/Arcade event types properly.
  - Reset key flags after use.
- [ ] Rendering Pipeline Correction
  - Ensure consistent asset draw order.
  - Implement a game clock and enforce a target FPS.
    - Refactor game states (MENU, PLAYING, PAUSED, GAME_OVER) into a state manager.
    - Ensure clear transitions and no lingering/ghost states.
- [ ] Collision & Scoring Fixes
  - Use correct collision detection methods for all sprites.
  - Monitor health/score types to prevent underflow or overflow.
  - Wrap audio loads in try/except blocks with a fallback plan.
  - Add mute and stop all functions on state changes.
- [ ] Resource Proper Disposal
  - Close files and surfaces correctly.
  - Call `pygame.quit()` in every exit pathway.
  - Integrate Python logging.
  - Replace print statements with logger calls.
  - Monitor asset loading, state changes, and errors.
- [ ] User Feedback Enhancements
- [ ] Automated Regression Testing
  - Create unit tests for core logic (collision, scoring, state transitions).
  - Use mocks or simulations of the event loop for automated testing.
