# Development TODOs

This file lists the outstanding tasks and issues for the "Wordle with Friends"
project. Items are derived from the requirements overview and should be checked
as they are completed.

## Accessibility

- [ ] Add additional ARIA roles for interactive elements.
- [ ] Implement focus management for keyboard users.
- [ ] Verify color contrast and adjust themes if necessary.

## Backend Integration

- [ ] Sanitize definition text received from the backend before display.
- [ ] Handle race conditions when two players attempt to select the same emoji.
 - [x] Allow polling interval to decrease when no users are active.

## UI Enhancements

 - [x] Animate tile reveal after each guess.
 - [x] Add optional sound effects with on/off toggle.

## Chat Box

- [x] Implement a chat panel for players to send messages during a game.
- [x] Add a toggle control to show or hide the chat panel on any screen size.
- [x] Use each player's selected emoji as their chat avatar.
- [x] Add neumorphic animations for message bubbles appearing and disappearing.

## Code Quality

- [ ] Expand unit tests to cover additional API and UI logic.
- [ ] Document public functions in the JavaScript code.
- [ ] Keep this TODO list updated as new issues are discovered.

