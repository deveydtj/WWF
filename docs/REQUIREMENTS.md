# WordSquad Requirements

This document summarizes the functional, UI/UX, and technical requirements for the
browser-based WordSquad project. It is derived from the project
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
- **Leaderboard:** Horizontally centered list of current players with emoji and score. The
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
- **Close Call Notification:** When two players submit the winning word within two seconds of each other, display the difference in milliseconds between their submissions.
- **Daily Double Bonus:** One random tile (not on the final row) contains a bonus. When a player turns it green, they may privately reveal one tile on the next row. Only that player sees the letter.
- The client must display a persistent hint indicator whenever the player has an unused Daily Double bonus.

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
- Popups opened from the options menu use a shared positioning helper so they
  remain fully visible on small screens.
- Modal Popups (non-side-panel):
  - Can be dismissed by clicking/tapping anywhere outside the popup (click-off dismissal).
  - Display a softly blurred page backdrop while open, reducing visual noise and directing focus to the modal.
  - Retain all existing accessibility guarantees (keyboard focus trap, ESC to close, ARIA roles, etc.).
- Landing page at `/` offers Create and Join dialogs with lobby code validation.
- `/lobby/<id>` shows the game board for that lobby with a header displaying code, player count, and host controls.
- Player list panel shows avatars, scores, AFK status, and kick controls for the host.
- On first load the client hydrates state from `GET /lobby/<id>/state` and subscribes to `/lobby/<id>/stream` with polling fallback.
- Reconnecting with a stored emoji reclaims it via `POST /lobby/<id>/emoji`.

### 2.1. Layout System Architecture

WordSquad uses a responsive three-panel layout system that adapts to different viewport sizes:

**Layout Modes:**
- **Light Mode** (≤600px): Mobile-first single-column layout
  - Side panels hidden by default
  - Panels appear as overlay modals when activated
  - Game board and controls stack vertically
  - Input optimized for touch and virtual keyboards

- **Medium Mode** (601px-900px): Tablet and small desktop layout
  - Three-panel container structure (`#leftPanel`, `#centerPanel`, `#rightPanel`)
  - Panels positioned within their designated containers using relative positioning
  - History panel in left container, game board in center, definition/chat in right
  - Panels scale appropriately with viewport size
  - No fixed viewport centering or overlay behavior

- **Full Mode** (>900px): Large desktop layout
  - Full three-panel layout with adequate space for side panels
  - Panels positioned absolutely with calculated offsets relative to game board
  - Advanced positioning logic accounts for available space around game board
  - Optimal panel width (280px) and spacing for comfortable interaction

**Panel System:**
- **History Panel** (`#historyBox`): Shows guess history, positioned in left panel area
- **Definition Panel** (`#definitionBox`): Shows word definitions, positioned in right panel area  
- **Chat Panel** (`#chatBox`): Real-time chat functionality, positioned in right panel area
- All panels support smooth scaling transitions and maintain proper z-index hierarchy
- Panel visibility controlled via CSS classes (`history-open`, `definition-open`, `chat-open`)

**Technical Requirements:**
- CSS-based layout switching using `body[data-mode]` attributes set by JavaScript
- Viewport-aware panel positioning without conflicting CSS rules
- Proper transform origins and animation timing for smooth panel transitions
- Consistent behavior across layout mode changes during window resizing

## 3. Server Integration

- **Endpoints:**
  - `POST /lobby` – create a new lobby and return `{id, host_token, join_url}`.
  - `GET /lobby/<id>/state` – fetch the current state for that lobby.
  - `POST /lobby/<id>/state` – heartbeat used to mark a player active.
  - `POST /lobby/<id>/emoji` – claim or change an emoji inside the lobby.
  - `POST /lobby/<id>/guess` – submit a word guess.
  - `POST /lobby/<id>/reset` – host only; begins a new round.
  - `GET /lobby/<id>/stream` – SSE stream scoped to that lobby.
  - `GET /lobbies` – (optional) list of public lobbies with player counts.
- All game data is namespaced by the six-character lobby code.
- Data contracts for guesses, leaderboard entries, and definitions remain JSON objects as defined in the project overview.
- Clients subscribe to `/lobby/<id>/stream` for updates and fall back to polling `GET /lobby/<id>/state` if the stream closes.
- `/guess` responses include a `close_call` object when another player submits the winning word within two seconds of the winner. Each guess record stores a timestamp so the server can report the milliseconds difference.
- Lobby creation is rate-limited to five per IP per minute. Lobby codes must match `[A-Za-z0-9]{6}`. Privileged actions require the `host_token` returned by `POST /lobby` and stored client-side.
- Lobbies transition from **waiting** → **active** → **finished** and are automatically purged if idle or finished for 30 minutes. The hidden `target_word` is never exposed until a lobby finishes.

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
- Blurred popup backdrop must be implemented with vanilla CSS only (e.g., `backdrop-filter`).

## 5. Extensibility

- Emoji lists, keyboard layout, and theme colors should be easy to extend.
- Panels (history, definition, leaderboard) are modular so features like chat or
  statistics can be added.
- Board and keyboard logic should allow future changes to word length and row
  count.

## 6. Chat Box

- Optional side panel for real-time text chat during a game.
- Users can toggle the chat panel to show or hide it at any time.
- The panel scales smoothly with all screen sizes, maintaining usability on mobile and desktop.
- Uses each player's selected emoji as their chat avatar.
- Messages appear with soft neumorphic bubbles and animated transitions.
- Chat history updates live for all participants as messages are posted.
- Must be fully keyboard accessible and responsive on mobile and desktop.

## 7. Hosting & DevOps

- Static frontend assets served from an S3 bucket behind CloudFront with TLS from ACM.
- Flask API packaged as a Docker image and run on ECS Fargate behind an Application Load Balancer.
- DNS records under Route 53 route `play.<domain>.com` to the ALB and `static.<domain>.com` to CloudFront.
- GitHub Actions builds the image, pushes to ECR, forces a new ECS deployment, runs Cypress tests, and invalidates the CloudFront cache on success.
- CloudWatch metrics track ALB response time and task CPU/memory while logs stream to CloudWatch with a retention policy.
- A daily Lambda purges idle lobbies from Redis or DynamoDB when used.
- Terraform uses remote state in S3 with a DynamoDB lock table.
- ALB listeners override the idle timeout to 3600 seconds.
- Optional modules provision Redis or DynamoDB when horizontal scaling is enabled.
- Output the CloudFront domain and ALB DNS for CI/CD pipelines.

## 8. Testing Requirements

- Unit tests cover lobby creation, join/expire logic, emoji selection, and per-lobby SSE isolation.
- Integration tests run multiple lobbies in parallel to verify guesses and chat never leak between them.
- End-to-end tests with Playwright create a lobby, share the link, join from a second browser, play to completion, and confirm the lobby auto-expires.

## 9. CI/CD and Repository Practices

- Branch names follow the short `feat/*`, `fix/*`, or `docs/*` pattern.
- Merges into `main` require passing status checks for Pytest, Cypress, and `terraform plan`.
- Secrets required for deployment include `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ACCOUNT_ID`, `AWS_REGION`, `ECR_REPO`, `TF_VAR_domain`, and `CF_DISTRIBUTION_ID`.
- The workflow runs `terraform fmt -check`, `terraform init -backend-config …`, `terraform plan`, and only applies on `main` once tests pass. Deploys end with a CloudFront invalidation.

## 10. Logging & Monitoring

- Structured JSON logs record `lobby_created`, `lobby_joined`, and `lobby_finished` events.
- CloudWatch metric filters alert when error rates exceed five per minute.
- A daily CloudWatch Event or Lambda triggers idle-lobby cleanup when not using the in-process thread.

## 11. Documentation & Deliverables

- `docs/ARCHITECTURE.md` outlines the flow from landing page to lobby with SSE diagrams.
- `README.md` explains the multi-lobby model and links to `docs/LANDING_PAGE_REQUIREMENTS.md`.
- `docs/DEPLOY_GUIDE.md` documents the Terraform bootstrap process and secret configuration.

