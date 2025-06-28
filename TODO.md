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

## Accessibility
No outstanding tasks.

## Testing
No outstanding tasks.

## Polish

- [ ] Keep this TODO list updated as new issues arise.
