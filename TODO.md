# Development TODOs

This file lists the outstanding tasks and issues for the "Wordle with Friends"
project. Items are derived from the requirements overview and should be checked
as they are completed.

## Accessibility

- [ ] Add additional ARIA roles for interactive elements.
- [ ] Implement focus management for keyboard users.
- [ ] Verify color contrast and adjust themes if necessary.

## Backend Integration

- [x] Sanitize definition text received from the backend before display.
- [x] Handle race conditions when two players attempt to select the same emoji.
- [x] Allow polling interval to decrease when no users are active.
- [x] Close-Call Expansion: Detect "same-word" submissions that occur within two
  seconds and include the milliseconds difference in the `/guess` response for
  all involved players.
- [x] Daily Double State:
  - Randomly assign a hidden "Daily Double" tile each game (never on the last
    row).
  - Persist tile index server-side and expose a per-player flag when they
    qualify for the hint.
  - Ensure hint-reveal data is sent only to the qualifying player.

## Gameplay Mechanics

- [ ] Implement Close-Call popup logic:
  - Broadcast a toast/modal to every player who submitted the winning word
    within the 2-second window.
  - Show the fastest player the time delta between their guess and the
    runner-up(s).
- [ ] Implement Daily Double feature:
  - [x] Grant a hidden hint when a player turns the Daily Double tile green.
  - [x] Let the player choose one unrevealed tile in the next row to preview in a
    ghost/outline style.
  - [x] Prevent other players from seeing the revealed hint.
  - [x] Disallow Daily Double tile selection on the bottom row.

## UI Enhancements

 - [x] Animate tile reveal after each guess.
 - [x] Add optional sound effects with on/off toggle.
 - [x] Close-Call Notifications: design a neumorphic popup/overlay.
 - [ ] Daily Double FX:
   - Confetti/particle burst on the qualifying tile.
   - Ghost-style preview for the chosen hint tile.
   - Tooltip/toast informing the player they earned a hint.

## Chat Box

- [x] Implement a chat panel for players to send messages during a game.
- [x] Add a toggle control to show or hide the chat panel on any screen size.
- [x] Use each player's selected emoji as their chat avatar.
- [x] Add neumorphic animations for message bubbles appearing and disappearing.

## Code Quality

- [ ] Expand unit tests to cover additional API and UI logic.
- [ ] Document public functions in the JavaScript code.
- [x] Add integration tests for Close-Call and Daily Double scenarios.
- [ ] Keep this TODO list updated as new issues are discovered.

