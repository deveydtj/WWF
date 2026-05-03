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
  - Phone: physical word input is hidden completely. The active board row is the
    visible current guess, and word entry uses only the in-game on-screen
    keyboard.
  - Chat remains allowed to use the device keyboard on all screen sizes.
  - Keyboard keys reflect feedback from prior guesses.
- **Multiplayer:** Each player selects a unique emoji avatar. Selection is stored
  with `localStorage` and posted to the server. The emoji picker disables
  emojis already in use.
- **Leaderboard:** Horizontally centered list of current players with emoji and score. The
  current player's entry is scrolled into view. Inactive players (idle for more
  than five minutes) appear dimmed.
- **History Panel:** Lists all guesses from all players with emoji, tile results,
  and point changes. On phone and tablet it opens as a centered card modal; on
  desktop it is a side rail.
- **Word Definition:** After the game ends, the definition of the correct word
  is displayed in a panel or centered card modal depending on layout.
- **Reset:** If the game is over, a reset button instantly starts a new game. If
  the game is ongoing, the button must be held for two seconds before posting to
  `/reset`. On phone layouts the reset control lives in the top header.
- **Close Call Notification:** When two players submit the winning word within two seconds of each other, display the difference in milliseconds between their submissions.
- **Daily Double Bonus:** One random tile (not on the final row) contains a bonus. When a player turns it green, they may privately reveal one tile on the next row. Only that player sees the letter.
- The client must display a persistent hint indicator whenever the player has an unused Daily Double bonus.

## 2. UI/UX

- Responsive design for desktop, tablet, and phone. Desktop uses side rails;
  phone and tablet use centered card modals for secondary panels.
- The top header includes the lobby code, leaderboard, reset control on phone,
  and primary actions. The title bar sits above the board content.
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
- Player list panel shows the full roster with avatars, scores, AFK status, and
  kick controls for the host.
- On first load the client hydrates state from `GET /lobby/<id>/state` and subscribes to `/lobby/<id>/stream` with polling fallback.
- Reconnecting with a stored emoji reclaims it via `POST /lobby/<id>/emoji`.

### 2.1. Layout System Architecture

WordSquad uses a responsive layout system that adapts to phone, tablet, and
desktop viewports while keeping the board as the primary visual focus.

**Layout Modes:**
- **Phone Mode** (≤600px): Portrait-first single-column layout
  - Gameplay is optimized only for portrait phone use
  - The board is centered and acts as the visible current-guess surface
  - The word input field is hidden completely
  - The in-game keyboard is fixed within the phone gameplay layout
  - History, definition, chat, players, options, share, and info use centered
    card modals
  - Reset is placed in the top header

- **Tablet Mode** (601px-900px): Board-first single-column layout
  - The board remains centered with generous touch spacing
  - Secondary panels open as centered card modals
  - Chat may still invoke the device keyboard when focused
  - Panel sizing must remain comfortable within the viewport without relying on
    slide-up sheets

- **Desktop Mode** (>900px): Large-screen layout with persistent rails
  - Full CSS Grid layout with dedicated rail areas for panel content
  - Grid template areas: history | stamp | center | definition/chat
  - History appears on the left rail
  - Definition and chat occupy the right rail
  - Automatic spacing and positioning are handled by CSS layout tokens
  - Optimal panel width is maintained without crowding the board

**Panel System:**
- **History Panel** (`#historyBox`): Shows guess history; left rail on desktop,
  centered card modal on phone and tablet
- **Definition Panel** (`#definitionBox`): Shows word definitions; right rail on
  desktop, centered card modal on phone and tablet
- **Chat Panel** (`#chatBox`): Real-time chat; right rail on desktop, centered
  card modal on phone and tablet
- **Player Panel** (`#playerSidebar` or successor): Shows the full player roster;
  popup/modal on smaller layouts and desktop panel or modal as needed
- All panels support smooth transitions, accessible focus management, and proper
  z-index hierarchy
- Phone and tablet must not use sliding bottom sheets for these panels

**Technical Requirements:**
- CSS-first layout rendering with minimal JavaScript state orchestration
- Layout state must distinguish between phone, tablet, and desktop behavior
- Grid template columns and rail areas are defined in responsive media queries
- Popup and modal positioning must remain fully visible on smaller screens
- Consistent behavior across layout mode changes during window resizing

### 2.2. Phone and Tablet Interaction Model

- Phone gameplay is portrait-only. The application may use best-effort browser
  orientation locking where supported, but the layout is only required to be
  production-ready in portrait phone orientation.
- The active guess is rendered directly on the current board row on phone.
- The physical word input field is hidden completely on phone layouts.
- The in-game on-screen keyboard is the only input mechanism for word guesses on
  phone layouts.
- Chat is the only gameplay-adjacent feature that may still invoke the device
  keyboard on phone and tablet.
- Reset must be available in the top header on phone.
- Phone and tablet secondary surfaces use centered card modals with blurred
  backdrops rather than sliding bottom sheets.
- The player experience on smaller layouts must show the full roster, not only
  the current player summary.

### 2.3. Layout and Scaling Refactor Phases

1. Define the final UX contract in the requirements and align naming around
   phone, tablet, and desktop layouts.
2. Replace mixed layout state with one authoritative layout state and one
   authoritative overlay state model.
3. Replace word-entry dependence on the physical input field with a shared
   `currentGuess` state rendered onto the board row.
4. Consolidate board, keyboard, spacing, and popup sizing into one responsive
   scaling system that owns the layout CSS variables.
5. Convert phone and tablet secondary panels to centered card modals while
   preserving desktop side rails.
6. Move phone reset behavior into the top header and render the player surface
   as a full-roster experience.
7. Add portrait-only phone handling and validate the refactor with expanded
   cross-device responsive testing.

### 2.4. Uniform Button Layout System

WordSquad implements a uniform button layout system ensuring visual consistency across all responsive breakpoints.

**Implementation:**
- **Button Size Consistency:** Guess and Reset buttons use identical dimensions via CSS custom properties
- **Width Alignment:** Desktop input/control rows align visually with board width,
  while phone controls follow the same sizing tokens where applicable
- **Responsive Scaling:** Uniform sizing maintained across phone, tablet, and
  desktop breakpoints
- **Accessibility Compliance:** Touch targets meet 44px minimum requirements on
  phone and tablet devices

**CSS Implementation:**
```css
--uniform-button-width: calc(var(--tile-size) * 1.8);
--uniform-button-height: calc(var(--tile-size) * 0.8);
```

**Validated Breakpoints:**
- Phone (≤600px): Touch-optimized portrait scaling
- Tablet (601-900px): Consistent board-first layout with centered card modals
- Desktop (901px+): Stable alignment within the side-rail layout

All acceptance criteria have been validated through comprehensive cross-breakpoint testing.

### 2.5. Responsive Design Conflict Resolution

WordSquad implements systematic CSS conflict resolution and smooth window resize behavior to ensure consistent layout performance across all breakpoints.

**CSS Rule Organization:**
- **Consolidated Breakpoints:** Phone, tablet, and desktop rules are consolidated
  into authoritative layout definitions
- **Clear File Separation:** Structural layout, component styling, and responsive
  adaptations are separated cleanly
- **No Rule Conflicts:** Eliminated overlapping selectors targeting same elements at same breakpoints
- **Container Query Cleanup:** Removed conflicting `@container` and `@media` rules

**Window Resize Behavior:**
- **Smooth Transitions:** 0.3s CSS transitions for layout mode changes (`flex-direction`, `gap`, `width`, `opacity`)
- **Dynamic Breakpoint Crossing:** Validated smooth transitions across all
  breakpoints (phone ↔ tablet ↔ desktop)
- **Layout Mode Switching:** Proper CSS class management during window resize without visual glitches
- **Performance Optimized:** No layout thrashing or console warnings during resize operations

**Implementation Details:**
```css
#gameLayoutContainer {
  transition: flex-direction 0.3s ease, gap 0.3s ease;
}

.layout-panel {
  transition: width 0.3s ease, opacity 0.3s ease;
}
```

**Validation Results:**
- ✅ No CSS conflicts or console warnings
- ✅ Smooth transitions between all layout modes  
- ✅ Enhanced scaling system compatibility
- ✅ Cross-browser transition support

For complete technical specifications, see `docs/requirements/responsive-design-conflict-resolution.md`.

### 2.6. Cross-Device Layout Validation

WordSquad implements comprehensive cross-device layout validation ensuring consistent user experience across all devices and browsers.

**Device Testing Coverage:**
- **Phone Devices (≤600px):** iPhone SE, iPhone 12, Galaxy S20, and other
  portrait phone form factors
- **Tablet Devices (601px-900px):** iPad Mini, iPad Air, and various tablet sizes
- **Desktop Devices (>900px):** Small desktop (1024px) through ultra-wide displays (2560px+)

**Browser Compatibility Validation:**
- **CSS Grid Support:** Verified across Chrome 57+, Firefox 52+, Safari 10.1+, Edge 16+
- **Flexbox Implementation:** Consistent behavior across all major browsers
- **Responsive Viewport Units:** vw, vh, vmin, vmax working correctly in all target browsers
- **Transition Animations:** Smooth layout changes during responsive breakpoint crossing

**Automated Testing Infrastructure:**
- **Cypress E2E Tests:** 9+ viewport configurations tested automatically
- **JavaScript Utilities:** 10+ device simulations with comprehensive scaling analysis
- **Backend Validation:** Complete test suite for CSS features and browser compatibility

For complete cross-device validation specifications, see `docs/requirements/cross-device-layout-validation.md`.

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
- Phone layouts hide the physical word input field completely and use only the
  in-game keyboard for guesses; desktop supports both physical keyboard entry
  and the in-game keyboard.
- Chat input may still use the device keyboard on phone and tablet layouts.
- Portrait phone orientation is the only required gameplay orientation; any
  browser orientation lock is best-effort rather than guaranteed.
- On phone and tablet, the viewport `--vh` custom property is updated on resize
  to account for browser chrome.
- Blurred popup backdrop must be implemented with vanilla CSS only (e.g., `backdrop-filter`).

## 5. Extensibility

- Emoji lists, keyboard layout, and theme colors should be easy to extend.
- Panels (history, definition, leaderboard) are modular so features like chat or
  statistics can be added.
- Board and keyboard logic should allow future changes to word length and row
  count.

## 6. Board Scaling and Container Measurement System

WordSquad implements an advanced board scaling system to ensure optimal display across all device types and screen sizes.

### 6.1 Scaling Requirements

- **Universal Device Support:** The game board must display correctly on devices
  from iPhone SE class portrait layouts (375×667) to large desktop displays
  (1920×1080+)
- **Container-Aware Scaling:** Board size calculations must account for available container space, UI element heights, and margins
- **Responsive Tile Sizing:** Tile sizes scale dynamically from 20px minimum to 65px maximum based on viewport constraints
- **Viewport Fitting Verification:** The primary gameplay stack on phone
  (header, board, current-guess row, and game keyboard) must fit within the
  portrait viewport without gameplay-breaking overlap
- **Layout Mode Compatibility:** Scaling must work correctly across Phone
  (≤600px), Tablet (601-900px), and Desktop (>900px) layout modes
- **Modal Compatibility:** Centered card modals on phone and tablet must size
  safely within the viewport without clipping behind browser chrome or the game
  keyboard

### 6.2 Technical Implementation

**Unified Responsive Scaling System:**
- One authoritative scaling engine owns board, keyboard, spacing, and modal
  sizing tokens
- Layout calculations account for available space, UI element heights, and
  margins
- Real-time viewport dimension tracking includes visual viewport behavior for
  chat keyboard scenarios on smaller devices

**Verification System:**
- Validates that all elements fit horizontally and vertically within the viewport
- Provides specific recommendations for scaling adjustments
- Handles edge cases gracefully with fallback logic

**CSS Layout Fixes:**
- Correct `#boardArea` positioning for phone, tablet, and desktop layouts
- Proper max-width constraints that work within both centered-modal and
  side-rail systems
- Elimination of conflicting CSS and JavaScript sizing paths

### 6.3 Performance and Compatibility

- **Single Source of Truth:** Board and keyboard sizing must not be managed by
  multiple competing runtime systems
- **Minimal Performance Impact:** Calculations are cached and only recalculate on viewport changes
- **Cross-Device Validation:** Comprehensive testing covers phone portrait,
  tablet, and desktop breakpoints
- **No Console Warnings:** Clean console output with informative logging for debugging

### 6.4 Quality Assurance

The system has been verified to:
- Eliminate all board scaling verification failures
- Provide consistent measurements across screen sizes
- Handle desktop rail layout conflicts properly
- Ensure proper board centering in all layout modes
- Support board size calculations for all viewport dimensions

All requirements have been validated through comprehensive testing including real device simulation and manual verification.

## 7. Chat Box

- Optional side panel for real-time text chat during a game.
- Users can toggle the chat panel to show or hide it at any time.
- On phone and tablet, chat opens in a centered card modal. On desktop it uses
  the right rail.
- Chat may invoke the device keyboard on phone and tablet.
- The panel scales smoothly with all screen sizes, maintaining usability on
  smaller layouts and desktop.
- Uses each player's selected emoji as their chat avatar.
- Messages appear with soft neumorphic bubbles and animated transitions.
- Chat history updates live for all participants as messages are posted.
- Must be fully keyboard accessible and responsive on phone, tablet, and desktop.

## 8. Hosting & DevOps

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

## 9. Testing Requirements

- Unit tests cover lobby creation, join/expire logic, emoji selection, and per-lobby SSE isolation.
- Integration tests run multiple lobbies in parallel to verify guesses and chat never leak between them.
- End-to-end tests with Playwright create a lobby, share the link, join from a second browser, play to completion, and confirm the lobby auto-expires.
- Responsive and layout tests validate phone portrait behavior, centered card
  modal behavior on smaller layouts, desktop side rails, and full-roster player
  rendering.

## 10. CI/CD and Repository Practices

- Branch names follow the short `feat/*`, `fix/*`, or `docs/*` pattern.
- Merges into `main` require passing status checks for Pytest, Cypress, and `terraform plan`.
- Secrets required for deployment include `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ACCOUNT_ID`, `AWS_REGION`, `ECR_REPO`, `TF_VAR_domain`, and `CF_DISTRIBUTION_ID`.
- The workflow runs `terraform fmt -check`, `terraform init -backend-config …`, `terraform plan`, and only applies on `main` once tests pass. Deploys end with a CloudFront invalidation.

## 11. Logging & Monitoring

- Structured JSON logs record `lobby_created`, `lobby_joined`, and `lobby_finished` events.
- CloudWatch metric filters alert when error rates exceed five per minute.
- A daily CloudWatch Event or Lambda triggers idle-lobby cleanup when not using the in-process thread.

## 12. Documentation & Deliverables

- `docs/ARCHITECTURE.md` outlines the flow from landing page to lobby with SSE diagrams.
- `README.md` explains the multi-lobby model and links to `docs/LANDING_PAGE_REQUIREMENTS.md`.
- `docs/DEPLOY_GUIDE.md` documents the Terraform bootstrap process and secret configuration.
