# Wordle With Friends Requirements

This document summarizes the functional, UI/UX, and technical requirements for the
browser-based "Wordle with Friends" project. It is derived from the project
overview and should be kept up to date as features evolve.

## 1. Game Play

- **Wordle Board:** 5×6 grid. Each guess fills a row. Tiles are colored after
  submission (green = correct letter/position, yellow = correct letter wrong
  position, gray = absent).
- **Hard Mode:** Subsequent guesses must reuse green letters in the same
  positions and include all previously revealed green/yellow letters.
- **Guess Input:**
  - Desktop: text field limited to five alphabetic characters plus a submit
    button.
  - Mobile: physical field hidden; uses only an on-screen keyboard.
  - Keyboard keys reflect feedback from prior guesses.
- **Multiplayer:** Each player selects a unique emoji avatar. Selection is stored
  with `localStorage` and posted to the server. The emoji picker disables
  emojis already in use.
- **Leaderboard:** Horizontal list of current players with emoji and score. The
  current player's entry is scrolled into view. Inactive players (idle for more
  than five minutes) appear dimmed.
- **History Panel:** Lists all guesses from all players with emoji, tile results,
  and point changes. On mobile it can be toggled from a menu; on desktop it is a
  side panel.
- **Word Definition:** After the game ends, the definition of the correct word
  is displayed in a panel.
- **Reset:** If the game is over, a reset button instantly starts a new game. If
  the game is ongoing, the button must be held for two seconds before posting to
  `/reset`.

## 2. UI/UX

- Responsive design for desktop and mobile. Desktop uses side panels; mobile
  panels slide from the bottom.
- Title bar includes the game title, reset control, and options for dark mode
  and panel visibility.
- Soft "Neumorphic" visual style using inset and outset shadows.
- Dark mode toggle persisted via `localStorage`.
- Feedback includes toast messages for errors and game events, shake animation
  for invalid guesses, and transient point deltas after submissions.
- All interactive elements must be accessible via keyboard and screen readers.

## 3. Server Integration

- **Endpoints:**
  - `GET /state` – returns the current game state (guesses, leaderboard, etc.).
  - `POST /state` – heartbeat with selected emoji to indicate activity.
  - `POST /guess` – submit a guess and return updated state.
  - `POST /reset` – reset the game.
- Data contracts for guesses, leaderboard entries, and definitions are JSON
  objects as defined in the project overview.
- The client polls `/state` every two seconds to keep the board synchronized.

## 4. Technical Constraints

- Implementation must be vanilla HTML, CSS, and JavaScript only.
- Styles use CSS custom properties and are embedded in `index.html`.
- Game state drives all board rendering based on server responses.
- Emoji, dark mode preference, and user session information live in
  `localStorage`.
- Mobile detection hides the physical input field and uses only the virtual
  keyboard; desktop supports both.
- On mobile, the viewport `--vh` custom property is updated on resize to account
  for browser chrome.

## 5. Extensibility

- Emoji lists, keyboard layout, and theme colors should be easy to extend.
- Panels (history, definition, leaderboard) are modular so features like chat or
  statistics can be added.
- Board and keyboard logic should allow future changes to word length and row
  count.

## 6. Known Issues / Future Enhancements

- Add more ARIA roles and better focus management for accessibility.
- Ensure definition text from the backend is sanitized for display.
- Consider adapting the polling interval when users are idle.
- Handle race conditions when two users try to claim the same emoji.
- Potential future features include animations, sound effects, user account
  linking, hints, and internationalization support.

