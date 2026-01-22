# Responsive Scaling & Test Plan

## Goals
- Confirm the UI scales cleanly from small phones through ultra-wide desktops.
- Keep panels, board, and keyboard within the visible viewport at common breakpoints.
- Ensure automated tests cover layout-critical flows.

## Test Coverage (Small Batches)
- **Unit/Backend**: `python -m pytest -v`.
- **Frontend smoke**: open the landing page + game page at common widths (320, 375, 768, 1024, 1440, 1920).
- **E2E (optional)**: run Playwright/Cypress if browsers are installed.

## Layout Audit Checklist
- Verify the board fits without horizontal scrolling at each breakpoint.
- Confirm header, chat/history/definition panels remain reachable.
- Validate keyboard visibility on mobile (iOS/Android emulation).

## Implementation Steps
1. **CSS sizing pass**
   - Use `clamp()` for panel widths and board sizing tokens.
   - Limit overly wide layouts with a max-width container.
2. **Viewport spacing**
   - Ensure fixed headers/footers don’t overlap playable space.
   - Re-check padding with safe-area insets.
3. **JS scaling hooks**
   - Validate resize/orientation handlers still trigger correctly.
   - Add logs or telemetry only if needed for debugging.

## Post-Change Verification
- Re-run smoke checks at the listed breakpoints.
- Capture screenshots for landing + in-game views.
- Log any device-specific quirks for follow-up tickets.
