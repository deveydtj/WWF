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
  - `currentGuess` is the source of truth for the active guess and is rendered
    directly on the active board row in every layout.
  - The in-game keyboard remains available in every layout. It is required on
    touch-first profiles and available by default on keyboard-first profiles.
  - Physical keyboard input is accepted during active gameplay when focus is
    not owned by a modal, input, textarea, or editable element.
  - A visible text field may mirror `currentGuess` on keyboard-first profiles,
    but game state must not depend on that field.
  - On touch-first profiles, the word-entry text field is hidden and removed
    from the tab order, and the in-game keyboard must not summon the native
    device keyboard.
  - Chat uses its own text field and may invoke the native device keyboard in
    every layout.
  - Keyboard keys reflect feedback from prior guesses.
- **Multiplayer:** Each player selects a unique emoji avatar. Selection is stored
  with `localStorage` and posted to the server. The emoji picker disables
  emojis already in use.
- **Leaderboard:** Horizontally centered list of current players with emoji and score. The
  current player's entry is scrolled into view. Inactive players (idle for more
  than five minutes) appear dimmed.
- **History Panel:** Lists all guesses from all players with emoji, tile results,
  and point changes. Its presentation is a centered card modal or a persistent
  rail according to the measured panel capacity.
- **Word Definition:** After the game ends, the definition of the correct word
  is displayed in a panel or centered card modal depending on layout.
- **Reset:** If the game is over, a reset button instantly starts a new game. If
  the game is ongoing, the button must be held for two seconds before posting to
  `/reset`. Compact-header profiles place the reset control in the top header.
- **Close Call Notification:** When two players submit the winning word within two seconds of each other, display the difference in milliseconds between their submissions.
- **Daily Double Bonus:** One random tile (not on the final row) contains a bonus. When a player turns it green, they may privately reveal one tile on the next row. Only that player sees the letter.
- The client must display a persistent hint indicator whenever the player has an unused Daily Double bonus.

## 2. UI/UX

- Responsive design is driven by measured container space, visual viewport,
  orientation, input capabilities, and user preference. Phone, tablet, laptop,
  and desktop categories describe expected examples; they do not determine the
  layout by themselves.
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

WordSquad uses a capability- and space-aware responsive layout system that keeps
the board as the primary visual focus. Layout decisions must consider:

- Available app and gameplay-container width and height
- Visual viewport size and offsets, including browser chrome and the native
  keyboard
- Pointer and hover capabilities
- Orientation and aspect ratio
- The space required by open panels
- The user's persisted preference for the desktop in-game keyboard

Viewport width or a phone, tablet, laptop, or desktop label must not determine
the complete layout. The authoritative layout state separately defines density,
interaction style, game flow, panel capacity and presentation, guess-field
visibility, in-game-keyboard visibility, and header density.

**Expected Product Profiles:**

- **Compact phone:** Board-first vertical flow, compact header, hidden word-entry
  field, required in-game keyboard, and modal secondary panels.
- **Large or landscape phone:** Required in-game keyboard with a measured split
  or compact vertical flow. Landscape gameplay must remain available and must
  not be blocked by a rotate-device overlay.
- **Tablet:** Touch-first or hybrid interaction with a required in-game keyboard.
  Secondary panels default to modals; one rail is allowed only when measured
  width and height preserve gameplay minimums.
- **Constrained laptop or desktop window:** Keyboard-first or hybrid interaction,
  an available in-game keyboard, and zero or one rail according to measured fit.
- **Large desktop:** Keyboard-first interaction, an available in-game keyboard,
  and up to two persistent rails when measured fit preserves the playable center.

Two environments with the same viewport dimensions may receive different
interaction profiles because their pointer and hover capabilities differ.

**Panel System:**

- **History Panel** (`#historyBox`): Shows guess history; preferred left rail
  when rail capacity is available, otherwise a centered card modal
- **Definition Panel** (`#definitionBox`): Shows word definitions; preferred
  right rail when rail capacity is available, otherwise a centered card modal
- **Chat Panel** (`#chatBox`): Real-time chat; preferred right rail when rail
  capacity is available, otherwise a centered card modal
- **Player Panel** (`#playerSidebar` or successor): Shows the full player roster;
  preferred right rail when capacity is available, otherwise a centered card
  modal
- Panel capacity is `0`, `1`, or `2` and is determined from measured inline and
  block space after preserving minimum gameplay and rail sizes.
- Open state is independent of presentation and survives a resize or orientation
  change when practical.
- Only modal presentation uses a backdrop, focus trap, background inertness, and
  `aria-modal="true"`. Rails use region/complementary semantics and do not trap
  focus.
- Compact and touch-first profiles must not use sliding bottom sheets for these
  panels.

**Technical Requirements:**
- CSS-first layout rendering with minimal JavaScript state orchestration
- JavaScript calculates only capability/profile state and metrics CSS cannot
  reliably infer.
- Panel-capacity decisions use measured width and height rather than a viewport
  breakpoint alone.
- Board sizing uses the measured gameplay container after rails and gutters are
  assigned, not the full viewport width.
- Popup and modal positioning uses visual-viewport bounds and safe areas and
  remains fully visible with internal scrolling when necessary.
- Resize and orientation changes preserve game state, current guess, and open
  panel state while presentation adapts.

### 2.2. Input and Orientation Model

- The active guess is rendered directly on the current board row in every
  layout.
- Touch-first and hybrid profiles hide the word-entry field, remove it from the
  tab order, and route word guesses through the shared state without invoking
  the native keyboard.
- The in-game keyboard is required and always reachable during active gameplay
  on phones and tablets. It remains available and enabled on laptops and
  desktops, where physical keyboard entry also works outside editable fields.
- Chat uses its own input and may invoke the native device keyboard. While chat
  is active on a touch device, gameplay controls must remain clear of the visual
  viewport and closing chat must not summon the native keyboard again.
- Compact-header profiles keep reset available in the top header.
- Compact secondary surfaces use centered card modals with blurred backdrops
  rather than sliding bottom sheets. A tablet or constrained desktop may use a
  rail only when the measured fit passes.
- Compact player presentation shows the full roster, not only the current-player
  summary.
- Both portrait and landscape gameplay are production requirements. Compact
  portrait uses a vertical board-first flow. Compact landscape uses a measured
  board/keyboard split when both regions meet their minimums, otherwise a compact
  vertical flow with controlled internal scrolling.
- Orientation changes preserve the current guess, active panel, and game state.

### 2.3. Layout and Scaling Refactor Phases

1. Define the final UX contract in the requirements and align naming around
   capability, density, flow, and panel-capacity profiles.
2. Replace mixed layout state with one authoritative layout state and one
   authoritative overlay state model.
3. Replace word-entry dependence on the physical input field with a shared
   `currentGuess` state rendered onto the board row.
4. Consolidate board, keyboard, spacing, and popup sizing into one responsive
   scaling system that owns the layout CSS variables.
5. Present secondary panels as centered card modals or rails according to
   measured panel capacity.
6. Move phone reset behavior into the top header and render the player surface
   as a full-roster experience.
7. Add compact landscape handling and validate the refactor with expanded
   cross-capability responsive testing.

### 2.4. Uniform Button Layout System

WordSquad implements a uniform button layout system ensuring visual consistency across all responsive breakpoints.

**Implementation:**
- **Button Size Consistency:** Guess and Reset buttons use identical dimensions via CSS custom properties
- **Width Alignment:** Desktop input/control rows align visually with board width,
  while phone controls follow the same sizing tokens where applicable
- **Responsive Scaling:** Uniform sizing maintained across compact, comfortable,
  and spacious density profiles
- **Accessibility Compliance:** Touch targets meet 44px minimum requirements on
  phone and tablet devices

**CSS Implementation:**
```css
--uniform-button-width: calc(var(--tile-size) * 1.8);
--uniform-button-height: calc(var(--tile-size) * 0.8);
```

**Expected Profile Examples:**
- Compact touch: Touch-optimized vertical or split-landscape scaling
- Comfortable touch/hybrid: Board-first layout with modal panels and an optional
  measured rail
- Spacious keyboard-first: Stable alignment with up to two measured side rails

All acceptance criteria have been validated through comprehensive cross-breakpoint testing.

### 2.5. Responsive Design Conflict Resolution

WordSquad implements systematic CSS conflict resolution and smooth window resize behavior to ensure consistent layout performance across all breakpoints.

**CSS Rule Organization:**
- **Consolidated Breakpoints:** Phone, tablet, and desktop rules are consolidated
  into authoritative profile and layout definitions
- **Clear File Separation:** Structural layout, component styling, and responsive
  adaptations are separated cleanly
- **No Rule Conflicts:** Eliminated overlapping selectors targeting same elements at same breakpoints
- **Container Query Cleanup:** Removed conflicting `@container` and `@media` rules

**Window Resize Behavior:**
- **Smooth Transitions:** 0.3s CSS transitions for layout mode changes (`flex-direction`, `gap`, `width`, `opacity`)
- **Dynamic Profile Changes:** Validated smooth transitions as available space,
  orientation, panel capacity, or interaction capabilities change
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
- **Compact phones:** iPhone SE, iPhone 12, Galaxy S20, and comparable portrait
  and landscape form factors
- **Tablets:** iPad Mini, iPad Air, and comparable portrait and landscape sizes,
  with coarse-pointer capability emulation
- **Laptops and desktops:** Constrained 1024px windows through ultra-wide
  displays, with fine-pointer and hover capability emulation
- Viewport dimensions and input capabilities are independent test dimensions;
  the same dimensions must be exercised with both coarse- and fine-pointer
  scenarios where applicable.

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
- Emoji, dark mode preference, the desktop in-game-keyboard preference, and
  user session information live in `localStorage`. The desktop keyboard
  preference defaults to visible; touch-first and hybrid gameplay profiles
  ignore a request to hide this required input surface.
- Touch-first profiles hide the word-entry text field and use the in-game
  keyboard for guesses; keyboard-first profiles support physical keyboard entry
  and retain the in-game keyboard.
- Chat input may use the native device keyboard in every layout.
- Portrait and landscape gameplay are both required; the application must not
  depend on browser orientation locking or block gameplay behind a rotate-device
  overlay.
- Visual viewport dimensions and offsets are updated on resize, scroll, and
  orientation changes to account for browser chrome and the native keyboard.
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
- **Viewport Fitting Verification:** The primary gameplay regions (header,
  board, current-guess row, and game keyboard) must fit within the visual
  viewport in portrait and landscape without gameplay-breaking overlap.
- **Profile Compatibility:** Scaling must work correctly across compact,
  comfortable, and spacious densities and touch-first, hybrid, and
  keyboard-first interactions.
- **Panel Compatibility:** Centered card modals must size safely within the
  visual viewport without clipping behind browser chrome or the native
  keyboard; rails must be assigned only when gameplay minimums still fit.

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
- Correct `#boardArea` positioning for vertical and split-landscape game flows
- Proper maximum-width constraints that work within both centered-modal and
  measured side-rail presentations
- Elimination of conflicting CSS and JavaScript sizing paths

### 6.3 Performance and Compatibility

- **Single Source of Truth:** Board and keyboard sizing must not be managed by
  multiple competing runtime systems
- **Minimal Performance Impact:** Calculations are cached and only recalculate on viewport changes
- **Cross-Capability Validation:** Comprehensive testing covers portrait and
  landscape orientation, coarse and fine pointers, hover capability, constrained
  heights, and zero-, one-, and two-rail capacity
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
- Chat opens in a centered card modal when no rail fits and uses a right rail
  when the measured panel capacity and panel policy allow it.
- Chat may invoke the native device keyboard in every layout.
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
- Responsive and layout tests validate compact portrait and landscape behavior,
  capability differences at identical viewport sizes, centered card modal
  behavior, measured zero-/one-/two-rail capacity, visual-viewport changes, and
  full-roster player rendering.

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
