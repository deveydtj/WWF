# WordSquad Responsive Layout and Input Refactor Plan

**Repository:** `deveydtj/WWF`  
**Recommended repo path:** `docs/RESPONSIVE_LAYOUT_AND_INPUT_REFACTOR_PLAN.md`  
**Plan type:** Production implementation plan  
**Primary goal:** Make WordSquad scale cleanly and behave correctly across phones, tablets, laptops, desktops, short screens, wide screens, portrait, landscape, touch input, physical keyboards, and browser-native keyboards.

---

## 1. Executive Decision

WordSquad should stop deciding the entire interface from the labels **phone**, **tablet**, and **desktop** alone.

Those labels are useful for product expectations, but they are not sufficient layout rules. A 1024×768 viewport can be an iPad in landscape, a small laptop, a browser window on a desktop, or a touch-enabled Windows device. The application must instead combine:

1. **Available container width and height**
2. **Visual viewport size**, including browser chrome and the native keyboard
3. **Pointer capability**, such as coarse touch versus precise pointer
4. **Hover capability**
5. **Current orientation and aspect ratio**
6. **Which panels are open and how much room they require**
7. **User preference for showing the in-game keyboard on larger screens**

The final implementation should still expose understandable UX profiles, but rendering decisions must be capability- and space-aware.

### Required product behavior

| Environment | Word entry | In-game keyboard | Secondary panels | Native device keyboard |
|---|---|---|---|---|
| Compact phone | In-game keyboard; physical keyboard events may still work if attached | Required and always reachable during gameplay | Modal popup/card | Must not open for word guesses; allowed for chat |
| Large phone / phone landscape | In-game keyboard with compact or two-region formatting | Required and dynamically placed | Modal popup/card | Must not open for word guesses; allowed for chat |
| Tablet portrait | In-game keyboard; attached physical keyboard may also work | Required and always reachable | Modal by default; rail only when the measured layout genuinely fits | Allowed for chat; not required for word guesses |
| Tablet landscape / wide tablet | In-game keyboard plus attached physical keyboard support | Required and always reachable | One rail when it fits without shrinking gameplay below minimums; modal fallback for other panels | Allowed for chat |
| Small laptop / constrained desktop window | Physical keyboard plus in-game keyboard | Available; shown by default initially, optionally collapsible | Zero or one rail depending on measured room; modal fallback | Physical keyboard is primary but not exclusive |
| Large desktop | Physical keyboard plus in-game keyboard | Available and fully functional | One or two persistent rails, with popup/modal support for transient surfaces | Physical keyboard supported globally outside editable fields |

### Core architectural decision

Replace the current combination of fixed breakpoint modes, ad hoc panel-width rules, multiple scaling functions, and runtime inline-style corrections with five coordinated systems:

- `ViewportService`
- `LayoutProfileManager`
- `LayoutMetricsEngine`
- `InputController`
- `PanelPresentationManager`

CSS remains responsible for rendering. JavaScript calculates only the state and metrics that CSS cannot reliably infer by itself.

---

## 2. Current Repository Findings

The current implementation contains useful pieces, but they overlap and contradict one another.

### 2.1 Hard-coded device classification

Current files:

- `frontend/static/js/layoutModes.js`
- `frontend/static/js/layoutManager.js`
- `frontend/static/css/mobile-layout.css`
- `frontend/static/css/desktop-layout.css`
- `frontend/game.html`

Current behavior:

- Phone is `<=600px`.
- Tablet is `601px-900px`.
- Desktop is `>900px`.
- Separate mobile and desktop CSS files are activated at the 900/901 boundary.
- Additional rules at 1150px, 1200px, and 1550px introduce more implicit layout modes.
- Only the history panel has an explicit `historyPopup` fit calculation.

Problems:

- Device identity is inferred from viewport width.
- Tablet landscape and small laptop can receive the same layout despite different interaction capabilities.
- Definition, chat, players, and history do not share one general rail-fit model.
- The 900/901 transition is structurally large and can cause visible jumps.
- Available height is not part of the panel presentation decision.

### 2.2 Competing scaling engines

Current files:

- `frontend/static/js/responsiveScaling.js`
- `frontend/static/js/utils.js`
- `frontend/static/js/boardContainer.js`
- `frontend/static/css/base.css`
- `frontend/static/css/mobile-layout.css`
- `frontend/static/css/desktop-layout.css`

Current behavior:

- `responsiveScaling.js` writes `--tile-size`, `--tile-gap`, `--board-width`, `--key-h`, typography, modal size, and other tokens.
- `utils.js` still contains `fitBoardToContainer()`, mobile keyboard transforms, keyboard visibility repair functions, height recommendations, and additional writes to the same CSS variables.
- `updateVH()` can call the legacy board fitting path while the new scaling engine also reacts to resize.
- CSS also places fixed limits on board width, panel width, keyboard position, and bottom padding.

Problems:

- More than one subsystem owns the same layout variables.
- Resize can trigger multiple delayed recalculations.
- Inline transforms can visually scale the keyboard without updating its layout box, creating overlap and hit-target problems.
- The main scaling calculation uses viewport dimensions rather than the actual center-column dimensions after rails and padding.
- The calculation assumes a fixed vertical stack even when the keyboard is fixed to the viewport.
- Debug and compatibility code is mixed with production sizing code.

### 2.3 Word-entry behavior conflicts with the intended mobile experience

Current files:

- `frontend/static/js/keyboard.js`
- `frontend/static/js/uiNotifications.js`
- `frontend/static/js/appInitializer.js`
- `frontend/game.html`

Current behavior:

- The shared `currentGuess` state exists and is a good foundation.
- Clicking or touching an in-game key calls `guessInput.focus()` when chat is not active.
- `guessInput` remains a normal text input in the DOM.
- `updateInputVisibility()` searches for `#resetButton`, but the actual reset control is `#holdReset`, causing an early return.
- Mobile CSS contains visible styling for `#guessInput` and `#submitGuess` instead of making board-row entry the only phone word-entry surface.
- Both `click` and `touchstart` listeners are registered on the in-game keyboard.

Problems:

- Tapping the in-game keyboard can summon the device keyboard on a phone or tablet.
- The incorrect reset selector prevents the input visibility function from completing.
- `touchstart` plus `click` can create duplicate-event risk and inconsistent accessibility behavior.
- Focus is being used as an input-routing mechanism rather than an accessibility decision.

### 2.4 Panel presentation and modal semantics are mixed

Current files:

- `frontend/game.html`
- `frontend/static/js/panelManager.js`
- `frontend/static/js/overlayState.js`
- `frontend/static/css/mobile-layout.css`
- `frontend/static/css/desktop-layout.css`

Current behavior:

- History, definition, chat, and player surfaces are marked as `role="dialog" aria-modal="true"` in the HTML.
- The same DOM elements become persistent desktop rails.
- Overlay exclusivity depends on the named layout and `historyPopup`.
- Tablet has a special-case history rail, while other panels remain overlays.

Problems:

- A persistent rail is not an ARIA modal dialog.
- Focus trapping, backdrop behavior, and Escape behavior should depend on presentation mode, not element identity alone.
- Panel open state and panel presentation state are coupled.
- A resize can force panel closures instead of preserving the surface and changing only its presentation.
- Tablet support is history-specific rather than generic.

### 2.5 Fixed positioning and rigid size assumptions

Current files:

- `frontend/static/css/mobile-layout.css`
- `frontend/static/css/desktop-layout.css`

Examples:

- Fixed 60px mobile header.
- Fixed bottom keyboard.
- Main content reserves 180px plus keyboard inset.
- Board area has fixed minimum and maximum widths.
- Mobile tiles have 44px minimum width and height.
- Desktop rails have fixed 240px widths, later 280px.
- Desktop app container is capped at 1600px while the fixed header spans the viewport.
- Portrait-only phone overlay blocks landscape gameplay.

Problems:

- Fixed keyboard placement complicates visual viewport changes.
- Reserved bottom padding can be wrong when key height or safe-area changes.
- A 44px minimum width is not practical for ten keys in one keyboard row on narrow phones; target height and spacing should carry the touch-accessibility requirement.
- Header and centered app container can use different horizontal coordinate systems on ultra-wide displays.
- Blocking phone landscape conflicts with the goal of dynamic formatting.

### 2.6 Existing tests are permissive and often do not test real gameplay

Current files:

- `tests/playwright/ui-responsiveness.spec.js`
- `tests/playwright/UI_RESPONSIVENESS_TESTS.md`
- `frontend/static/js/responsiveScaling.js`

Problems:

- Many tests load `game.html` without creating a lobby or initializing meaningful game state.
- Board assertions are skipped when the board is absent or not visible.
- Tests permit keyboard overflow and significant board/keyboard overlap.
- The same 1024×768 dimensions are labeled both tablet landscape and small desktop without capability emulation.
- Desktop panel tests often assert only that panel elements exist in the DOM.
- Breakpoint tests log changes without asserting the expected layout state.
- The JavaScript “cross-device” helper iterates device names without changing the viewport.
- Native-keyboard, chat-keyboard, rail fallback, resize continuity, and physical keyboard behavior are not validated end to end.

### 2.7 Incomplete cleanup from the previous refactor

- `shared-base.css` remains a placeholder.
- Comments reference a deleted `docs/LAYOUT_REFACTORING_PLAN.md`.
- Legacy compatibility functions remain in active production modules.
- Production code contains extensive layout debug logging.
- CSS ownership is spread among base, component, mobile, desktop, and inline styles.

---

## 3. Final UX Contract

This section is authoritative. Implementation must not invent behavior that conflicts with it.

### 3.1 Word-entry contract

1. `currentGuess` is the only source of truth for the active guess.
2. The board row renders `currentGuess` directly in every layout.
3. The in-game keyboard updates `currentGuess` directly.
4. Physical keyboard events update `currentGuess` whenever:
   - Gameplay is active.
   - No modal owns keyboard focus.
   - The active element is not chat, another input, a textarea, or contenteditable content.
5. The word-entry text field is not required for game state.
6. On compact touch and adaptive touch profiles:
   - The word-entry text field is removed from the tab order and visually hidden.
   - Tapping an in-game key must not focus the text field.
   - The device keyboard must not appear for word guesses.
7. On laptop/desktop profiles:
   - A visible guess field may be offered as an optional mirror of `currentGuess`.
   - Physical typing works even when that field is not focused.
   - The in-game keyboard remains usable.
8. Chat always uses its own text field and may open the native device keyboard.
9. Opening chat on a touch device temporarily de-emphasizes or hides the game keyboard so the chat field and send button remain above the visual viewport.
10. Closing chat restores gameplay focus without summoning the native keyboard.

### 3.2 In-game keyboard contract

1. The in-game keyboard is available on every supported layout.
2. It is required and visible during active gameplay on phones and tablets.
3. It is visible by default on desktop/laptop for feature parity.
4. A desktop user preference may collapse it, but the control to restore it must remain visible.
5. Keyboard rows must never create horizontal document overflow.
6. Touch profiles must maintain at least 44px key height whenever the visual viewport permits it.
7. Key width may be narrower than 44px on compact screens, but keys must have clear separation and no overlapping hit regions.
8. Enter and Backspace remain distinguishable and sufficiently wide.
9. Use one pointer/click activation path, not parallel `touchstart` and `click` mutation paths.
10. Physical key presses should visually animate the corresponding in-game key.

### 3.3 Panel contract

Panels: History, Definition, Chat, Players.

Presentation modes:

- `modal`
- `left-rail`
- `right-rail`
- `stacked-right-rail`
- `hidden`

Rules:

1. Phones use modal cards for all secondary panels.
2. Tablets use a rail only when measured width and height allow it without violating board and keyboard minimums.
3. A wide tablet can show one persistent rail; remaining panels open as modal cards or replace the rail based on the defined policy.
4. A constrained laptop/desktop can use zero or one rail and modal fallback.
5. A large desktop can use left history plus right definition/chat presentation.
6. Open state survives presentation changes during resize.
7. Only modal presentation uses:
   - Backdrop
   - Focus trap
   - `aria-modal="true"`
   - Background inertness
8. Rail presentation uses an appropriate region/complementary role and does not trap focus.
9. Escape closes the active modal. It must not silently hide a persistent rail unless the rail has an explicit close action.
10. Modal bounds use the visual viewport, safe areas, and internal scrolling.

### 3.4 Orientation contract

1. Remove the production requirement that phones only work in portrait.
2. Do not block landscape gameplay with a full-screen rotate overlay.
3. Compact portrait uses vertical board-first layout.
4. Compact landscape uses one of these measured arrangements:
   - Board and keyboard in two regions when both meet minimum sizes.
   - Compact vertical layout with controlled internal scrolling when two regions do not fit.
5. Tablet landscape may gain a rail if the fit calculation passes.
6. Orientation changes preserve the current guess, active panel, scroll state where practical, and game state.

### 3.5 Scaling contract

1. There is exactly one production owner for responsive sizing variables.
2. Board sizing uses the actual center gameplay container, not full viewport width.
3. Height calculations use `visualViewport` when available.
4. Scaling accounts for:
   - Header
   - Safe areas
   - Status/message reserve
   - Visible controls
   - In-game keyboard
   - Current panel presentation
5. No production layout correction uses `transform: scale()` on the entire keyboard.
6. No horizontal document scrolling is permitted.
7. The board remains centered in its gameplay region.
8. Tiles remain square.
9. Popup content scrolls internally instead of exceeding the viewport.
10. Resize processing is batched into one animation-frame update.

---

## 4. Target Architecture

### 4.1 `ViewportService`

**Recommended file:** `frontend/static/js/layout/viewportService.js`

Responsibilities:

- Read layout viewport width/height.
- Read visual viewport width/height and offsets.
- Read safe-area values through CSS variables.
- Observe `window.resize`, `visualViewport.resize`, `visualViewport.scroll`, and orientation changes.
- Read media capabilities:
  - `(pointer: coarse)`
  - `(any-pointer: coarse)`
  - `(hover: hover)`
  - `(any-hover: hover)`
- Observe `#appContainer` and the gameplay center using `ResizeObserver`.
- Publish a normalized snapshot only when meaningful values change.
- Batch updates through `requestAnimationFrame`.
- Expose one subscription API.

Example snapshot:

```js
{
  layoutViewport: { width, height },
  visualViewport: { width, height, offsetTop, offsetLeft },
  appContainer: { width, height },
  gameplayContainer: { width, height },
  orientation: 'portrait' | 'landscape',
  pointer: 'coarse' | 'fine' | 'mixed',
  hover: true | false,
  nativeKeyboardLikelyOpen: true | false
}
```

Do not detect a physical keyboard from user agent or viewport width. Physical keyboard events should simply work when received.

### 4.2 `LayoutProfileManager`

**Recommended file:** `frontend/static/js/layout/layoutProfileManager.js`

Responsibilities:

- Convert the viewport snapshot and user preferences into a UX profile.
- Decide shell format, input presentation, and panel capacity.
- Set stable data attributes on `body` or `#appContainer`.
- Emit one `layoutprofilechange` event.

Recommended state:

```js
{
  density: 'compact' | 'comfortable' | 'spacious',
  interaction: 'touch-first' | 'hybrid' | 'keyboard-first',
  orientation: 'portrait' | 'landscape',
  gameFlow: 'vertical' | 'split-landscape',
  panelCapacity: 0 | 1 | 2,
  panelPresentation: {
    history: 'modal' | 'left-rail',
    definition: 'modal' | 'right-rail',
    chat: 'modal' | 'right-rail',
    players: 'modal' | 'right-rail'
  },
  showGuessField: true | false,
  showOnscreenKeyboard: true | false,
  compactHeader: true | false
}
```

Do not expose `historyPopup` as a one-off special case.

### 4.3 `LayoutMetricsEngine`

**Recommended file:** `frontend/static/js/layout/layoutMetricsEngine.js`

Responsibilities:

- Own all runtime layout tokens.
- Calculate board, tile, keyboard, panel, and modal metrics.
- Use actual measured center width and visual viewport height.
- Write variables once per frame.
- Avoid element-by-element inline positioning.

Owned variables should include:

```css
--visual-viewport-width
--visual-viewport-height
--visual-viewport-offset-top
--app-inline-size
--app-block-size
--game-inline-size
--game-block-size
--header-block-size
--board-inline-size
--tile-size
--tile-gap
--keyboard-key-height
--keyboard-row-gap
--keyboard-inline-gap
--rail-inline-size
--surface-max-inline-size
--surface-max-block-size
--surface-padding
--safe-bottom-space
```

#### Board formula

Use the smaller of the width budget and height budget.

```text
widthTile = (availableBoardWidth - 4 × tileGap) / 5
heightTile = (availableBoardHeight - 5 × tileGap) / 6
tileSize = floor(min(widthTile, heightTile, preferredMaximum))
boardWidth = 5 × tileSize + 4 × tileGap
boardHeight = 6 × tileSize + 5 × tileGap
```

The height budget must be calculated after reserving the visible header, status area, controls, keyboard, safe area, and vertical gaps.

#### Rail-capacity formula

Do not use only a magic viewport breakpoint.

```text
oneRailFits =
  availableInline >=
    minimumPlayableCenter + railMinimum + requiredGutters

and

  availableBlock >= minimumPlayableStackHeight

twoRailsFit =
  availableInline >=
    minimumPlayableCenter + 2 × railMinimum + requiredGutters

and

  availableBlock >= minimumPlayableStackHeight
```

The first implementation may use product-approved minimum constants, but the decision must use measured container space.

### 4.4 `InputController`

**Recommended file:** `frontend/static/js/input/inputController.js`

Responsibilities:

- Own all gameplay character entry.
- Receive virtual-key, physical-key, and optional guess-field events.
- Sanitize input once.
- Update `currentGuess` once.
- Render through the existing state manager and board renderer.
- Route Enter and Backspace consistently.
- Suppress gameplay keys while a modal or editable field owns input.
- Never focus the guess field as a side effect of an in-game key.
- Provide a clear focus restoration target after modal closure.

### 4.5 `PanelPresentationManager`

**Recommended file:** `frontend/static/js/layout/panelPresentationManager.js`

Responsibilities:

- Keep panel open state separate from panel presentation.
- Assign each panel to modal or rail mode from the layout profile.
- Update ARIA roles and `aria-modal` dynamically.
- Apply focus trapping only for modal mode.
- Preserve open state during resize.
- Manage one active modal surface at a time.
- Coordinate with the existing overlay state or replace it after migration.

---

## 5. Implementation Phases

Each phase is intended to leave the repository in a working, testable state. Do not begin the next phase until the listed acceptance criteria pass.

---

# Phase 0 — Establish a Reproducible Baseline

## Goal

Capture the current behavior and create reliable test fixtures before changing layout code.

## Tasks

- [x] **0.1 Create a responsive audit document.**
  - Add `docs/responsive/CURRENT_STATE_AUDIT.md`.
  - Record screenshots and measurements for every target viewport in the test matrix.
  - Record whether board, keyboard, header, input row, and panels fit.
  - Record whether tapping an in-game key opens the native keyboard.

- [x] **0.2 Add a deterministic local lobby fixture.**
  - Create a test helper that opens a real lobby route or stubs the state APIs consistently.
  - Ensure the board always renders six rows.
  - Seed history, definition, chat messages, and multiple players.
  - Seed both active-game and completed-game states.

- [x] **0.3 Add layout diagnostics for tests only.**
  - Expose the current layout profile and metrics behind a test/debug namespace.
  - Do not log every resize in production.
  - Include profile, panel capacity, board bounds, keyboard bounds, and visual viewport values.

- [x] **0.4 Add a CSS syntax and style check.**
  - Add Stylelint or an equivalent parser check.
  - Catch unmatched braces, invalid declarations, duplicate property ownership, and malformed media blocks.
  - Audit the end of `desktop-layout.css` and all responsive files.

- [x] **0.5 Add baseline failures as skipped or expected-failure tests.**
  - Native keyboard opens after virtual-key tap.
  - Phone guess field remains available when it should be hidden.
  - Tablet rail selection is width-label based.
  - Current cross-device helper does not apply viewport dimensions.
  - Existing permissive overlap/overflow allowances are documented.

## Acceptance criteria

- A test can load a fully initialized game deterministically.
- Every target viewport produces a screenshot and metrics artifact.
- Known failures are reproducible.
- No layout refactor code has been introduced yet.

---

# Phase 1 — Replace the Device-Label Contract with a Capability Contract

## Goal

Define one authoritative layout state that represents actual UX behavior.

## Tasks

- [x] **1.1 Update `docs/REQUIREMENTS.md`.**
  - Replace fixed “phone/tablet/desktop determines everything” language.
  - Retain product categories as expected behavior examples.
  - Make panel capacity, input presentation, and orientation behavior authoritative.
  - Remove the portrait-only phone requirement.

- [x] **1.2 Introduce the new profile vocabulary.**
  - `density`
  - `interaction`
  - `gameFlow`
  - `panelCapacity`
  - `panelPresentation`
  - `showGuessField`
  - `showOnscreenKeyboard`
  - `compactHeader`

- [x] **1.3 Create pure profile decision functions.**
  - Input: viewport snapshot, panel minimums, gameplay minimums, preference state.
  - Output: immutable layout profile.
  - No DOM writes in the decision functions.
  - Add unit tests for boundary conditions.

- [x] **1.4 Preserve compatibility temporarily.**
  - Map the new profile back to existing `phone-layout`, `tablet-layout`, and `desktop-layout` classes only while migration is underway.
  - Mark compatibility APIs deprecated.
  - Do not add new call sites to `isMobileView()` or `historyPopup`.

- [x] **1.5 Define user preferences.**
  - Add a persisted `showOnscreenKeyboardOnDesktop` preference.
  - Default to `true` for initial parity.
  - Do not allow the keyboard to be hidden on touch-first phone/tablet profiles during active gameplay.

## Acceptance criteria

- One pure function can classify every test scenario.
- A 1024×768 coarse-pointer landscape scenario and a 1024×768 fine-pointer laptop scenario may share similar space constraints but can receive different interaction profiles.
- Panel capacity is 0, 1, or 2 based on measured fit.
- No production behavior has regressed.

---

# Phase 2 — Make `currentGuess` the Complete Input Source of Truth

## Goal

Remove dependence on the guess field and prevent the native keyboard from appearing during touch gameplay.

## Tasks

- [x] **2.1 Create `InputController`.**
  - Move sanitation, append, delete, submit, and input-routing logic out of `keyboard.js`.
  - Keep one mutation path for all input sources.
  - Return explicit outcomes such as `accepted`, `ignored`, `submitted`, or `blocked`.

- [x] **2.2 Remove virtual-key focus side effects.**
  - Delete `guessInput.focus()` from virtual-key handling.
  - After a virtual key, leave focus on the activated button or restore focus to a stable gameplay container.
  - Confirm that no native keyboard appears.

- [x] **2.3 Replace parallel `touchstart` and `click` mutation listeners.**
  - Prefer `click` for accessible button activation, or use a carefully designed pointer event path.
  - Ensure touch, mouse, keyboard activation, and assistive technology trigger exactly one mutation.

- [x] **2.4 Make the guess field an optional presentation.**
  - Keep the field only as a desktop/laptop mirror if product design retains it.
  - Bind it to `currentGuess` through the controller.
  - On touch-first layouts, apply `hidden`, `aria-hidden`, and tab-order behavior through the profile.
  - Do not use `inputmode="none"` as the sole protection because browser support is inconsistent.

- [x] **2.5 Repair or remove `updateInputVisibility()`.**
  - Remove the invalid `#resetButton` dependency.
  - Prefer declarative profile rendering over direct inline `display` writes.
  - Ensure `#holdReset` is not accidentally hidden by legacy code.

- [x] **2.6 Refine document key handling.**
  - Ignore gameplay keys when chat, another input, textarea, contenteditable area, or modal control owns focus.
  - Let Escape remain available to the modal manager.
  - Let physical keyboards work on every profile when the event is received.
  - Animate the corresponding in-game key for letters, Enter, and Backspace.

- [x] **2.7 Add input behavior tests.**
  - Virtual keys create one character per activation.
  - Virtual Backspace removes one character.
  - Virtual Enter submits once.
  - Physical keyboard works without focusing the guess field.
  - Chat typing never modifies `currentGuess`.
  - Modal typing never modifies `currentGuess` unless the modal explicitly allows it.
  - Virtual-key activation on a touch profile does not focus `#guessInput`.

## Acceptance criteria

- Word guessing works with the in-game keyboard on all profiles.
- Physical keyboard guessing works on laptop/desktop and attached-keyboard scenarios.
- The native keyboard does not appear for word guesses on phone/tablet.
- Chat still opens and uses the native keyboard.
- The board is always the visible source of the current guess on compact layouts.

---

# Phase 3 — Create One Viewport and Resize Pipeline

## Goal

Eliminate duplicate resize listeners, delayed recalculations, and competing viewport measurements.

## Tasks

- [x] **3.1 Implement `ViewportService`.**
  - Track layout viewport and visual viewport.
  - Track visual viewport offsets.
  - Track app and gameplay container dimensions with `ResizeObserver`.
  - Track pointer, hover, orientation, and aspect ratio.

- [x] **3.2 Use one scheduler.**
  - Coalesce resize, visual viewport, orientation, panel, and container changes.
  - Recalculate at most once per animation frame.
  - Prevent recursive ResizeObserver loops by comparing outputs before writing.

- [ ] **3.3 Remove duplicate listeners.**
  - Remove independent resize debounces from `responsiveScaling.js` and `appInitializer.js` after migration.
  - Remove delayed 50ms, 100ms, 150ms, and 300ms layout recalculations where the new scheduler replaces them.
  - Retain a targeted post-orientation stabilization only if tests prove a browser needs it.

- [ ] **3.4 Normalize visual viewport CSS variables.**
  - Replace mixed `--vh`, `--viewport-height`, `100vh`, and `100dvh` ownership with one service.
  - Publish visual height and offset values.
  - Include safe-area insets in CSS calculations.

- [ ] **3.5 Detect native keyboard state conservatively.**
  - Treat a meaningful visual viewport height reduction while an editable element is focused as `nativeKeyboardLikelyOpen`.
  - Do not infer keyboard state from height alone.
  - Use this state only for layout adaptation, not for game logic.

## Acceptance criteria

- One viewport change produces one profile/metrics update cycle.
- Resize does not cause repeated console output or visible oscillation.
- Opening and closing chat on mobile updates the visual viewport layout correctly.
- Orientation changes preserve state and settle without manual timeouts in normal browsers.

---

# Phase 4 — Replace All Sizing Logic with `LayoutMetricsEngine`

## Goal

Create a single owner for board, keyboard, spacing, rail, and popup dimensions.

## Tasks

- [ ] **4.1 Implement the metrics engine as pure calculations.**
  - Separate measurement input from token output.
  - Unit-test the calculations without the DOM.
  - Include width-constrained, height-constrained, and panel-constrained cases.

- [ ] **4.2 Calculate from the gameplay container.**
  - Measure the center region after rail capacity and app padding are applied.
  - Do not use full viewport width as the board width budget.

- [ ] **4.3 Calculate the vertical budget correctly.**
  - Reserve header, status, action row, keyboard, gaps, and safe area.
  - If status text is transient, reserve a stable minimum rather than allowing the board to jump.
  - Use visual viewport height when chat/native keyboard is open.

- [ ] **4.4 Replace keyboard transform scaling.**
  - Delete `applyMobileKeyboardAdjustments()` and any full-keyboard `transform: scale()` corrections.
  - Size keys with layout tokens.
  - Keep the rendered box and hit box identical.

- [ ] **4.5 Consolidate modal metrics.**
  - Set modal maximum inline/block sizes from visual viewport and board proportions.
  - Apply internal scrolling to content regions.
  - Keep close controls inside the visible bounds.

- [ ] **4.6 Remove legacy production sizing paths.**
  - Retire `fitBoardToContainer()` after all callers use the new engine.
  - Retire compatibility wrappers in `boardContainer.js` that mutate production layout.
  - Move test-only helpers into test modules.
  - Remove window globals such as deprecated scaling APIs unless a debug build explicitly enables them.

- [ ] **4.7 Add invariant checks in development.**
  - Board width equals five tiles plus four gaps.
  - Board height equals six tiles plus five gaps.
  - Keyboard fits its allocated region.
  - No token is `NaN`, negative, or below approved minimums.
  - Production builds should not spam logs.

## Acceptance criteria

- Only one module writes core sizing variables.
- No keyboard transform scaling remains.
- Board and keyboard remain fully inside their assigned regions at every automated viewport.
- Changing panel capacity recalculates the center region without oscillation.

---

# Phase 5 — Rebuild the Responsive CSS Shell

## Goal

Use a stable DOM and CSS layout system that can smoothly support compact, adaptive, and expansive profiles.

## Tasks

- [ ] **5.1 Replace the hard mobile/desktop stylesheet split.**
  - Create `frontend/static/css/responsive-layout.css` or a similarly authoritative file.
  - Load it for all viewports.
  - Use profile data attributes and container queries where appropriate.
  - Keep component CSS device-agnostic.

- [ ] **5.2 Populate `shared-base.css` or remove it.**
  - Move actual shared resets, typography, spacing, and surface primitives into it.
  - Remove stale placeholder comments and deleted-plan references.

- [ ] **5.3 Create a stable application grid.**
  - Define grid areas for header, left rail, game, right rail, and game keyboard.
  - Allow panel capacity 0, 1, or 2 without reparenting core gameplay nodes.
  - Keep the header aligned to the same max-width/container coordinate system as the app content.

- [ ] **5.4 Remove fixed bottom keyboard on normal gameplay.**
  - Prefer a grid row or sticky region inside the app shell.
  - The keyboard should occupy known layout space.
  - Avoid manually reserving a hard-coded 180px bottom padding.

- [ ] **5.5 Remove rigid board minimums that cause overflow.**
  - Let metrics tokens define board size.
  - Retain product minimums in the metrics decision, not conflicting CSS minimums.
  - Ensure 320px wide screens do not overflow.

- [ ] **5.6 Rebuild the keyboard rows.**
  - Use CSS Grid row templates or a controlled flex basis.
  - Ensure ten-letter rows distribute available width cleanly.
  - Size Enter and Backspace intentionally.
  - Keep key height independent from key width.

- [ ] **5.7 Create compact landscape flow.**
  - Add `data-game-flow="split-landscape"` styling.
  - Place board and keyboard in separate measured regions when possible.
  - Fall back to compact vertical flow when split layout violates minimums.

- [ ] **5.8 Stabilize header and controls.**
  - Prevent leaderboard, lobby code, and actions from squeezing each other unpredictably.
  - Define overflow behavior for the leaderboard.
  - Use icon buttons with accessible labels.
  - Do not move the same reset DOM node between parents on resize.

- [ ] **5.9 Replace reset reparenting.**
  - Preferred approach: provide compact-header and game-action reset controls backed by one reset action/state.
  - Only one is visible and focusable per profile.
  - Alternative: restructure the DOM so one reset control can occupy profile-dependent grid areas without JavaScript reparenting.
  - Remove `repositionResetButton()` after migration.

## Acceptance criteria

- The application has no document-level horizontal scroll from 320px through 2560px.
- The keyboard occupies real layout space and never covers the board.
- Phone landscape is playable.
- Resizing across prior breakpoints does not cause a structural flash.
- Reset remains available and does not lose focus/hold state because of DOM reparenting.

---

# Phase 6 — Generalize Rails, Popups, and Modal Behavior

## Goal

Allow tablets and constrained computers to use rails only when they fit, while retaining reliable popup fallbacks.

## Tasks

- [ ] **6.1 Separate open state from presentation state.**
  - `historyOpen` is independent from `historyPresentation`.
  - Apply the same structure to definition, chat, and players.
  - Remove `historyPopup` as a special layout field.

- [ ] **6.2 Implement generic panel capacity.**
  - Capacity 0: all secondary panels are modal.
  - Capacity 1: one selected/pinned panel may occupy a rail.
  - Capacity 2: history may use left rail; definition/chat may use right rail.
  - Players defaults to modal unless explicitly designed as a persistent rail.

- [ ] **6.3 Define rail priority and replacement policy.**
  - Suggested left priority: History.
  - Suggested right priority: Chat when open; Definition when game is complete and chat is closed.
  - On capacity 1, opening another rail-eligible panel may replace the existing rail or open modally according to a documented rule.
  - Avoid silent closures.

- [ ] **6.4 Correct ARIA semantics.**
  - Modal presentation: `role="dialog"`, `aria-modal="true"`, labelled title, focus trap.
  - Rail presentation: `role="region"` or `complementary`, `aria-modal="false"`, no focus trap.
  - Hidden panels: `hidden` or equivalent non-interactive state.

- [ ] **6.5 Implement one modal surface controller.**
  - One backdrop.
  - One active modal at a time.
  - Escape closes it.
  - Click-off dismissal works where allowed.
  - Background becomes inert.
  - Focus returns to the trigger.

- [ ] **6.6 Make modals visual-viewport aware.**
  - Clamp to visual viewport height and offsets.
  - Keep chat input and Send button visible above the native keyboard.
  - Use internal content scrolling.
  - Respect safe areas.

- [ ] **6.7 Preserve state during presentation changes.**
  - Resize from rail to modal without losing panel content or open state.
  - Resize from modal to rail and remove backdrop/focus trap correctly.
  - Preserve chat draft text.

- [ ] **6.8 Add panel behavior tests.**
  - Phone: every secondary panel is modal.
  - Narrow tablet: modal.
  - Wide tablet: one rail when fit passes.
  - Small laptop: zero/one rail depending on center minimum.
  - Large desktop: two rails.
  - Short desktop: modal fallback despite wide viewport if vertical usability fails.
  - Resize preserves panel state.

## Acceptance criteria

- Tablet rails are selected by measured fit.
- All panels share one presentation model.
- Rail semantics and modal semantics are correct.
- Modal content is usable above the native keyboard.
- No backdrop remains after a modal becomes a rail.

---

# Phase 7 — Refine Device-Specific Interaction Without Device Sniffing

## Goal

Meet the phone/tablet/laptop/desktop expectations while remaining robust on hybrid devices.

## Tasks

- [ ] **7.1 Remove user-agent-based layout decisions.**
  - Retire `isMobile` as a layout authority.
  - Use it only if a narrowly documented browser workaround truly requires it.

- [ ] **7.2 Define touch-first behavior.**
  - Large touch targets.
  - Required in-game keyboard.
  - No native keyboard for guesses.
  - Modal-first panels.
  - Compact header.

- [ ] **7.3 Define hybrid behavior.**
  - In-game keyboard remains visible.
  - Physical key events work.
  - One rail may appear when space permits.
  - Hover-only affordances must have touch equivalents.

- [ ] **7.4 Define keyboard-first behavior.**
  - Physical key events work globally outside editable/modal contexts.
  - In-game keyboard works with mouse and keyboard.
  - Desktop keyboard visibility preference is available.
  - Rails appear from capacity, not from the `desktop` name alone.

- [ ] **7.5 Remove portrait lock and rotate overlay.**
  - Remove `_lockPortraitOrientation()`.
  - Remove `#landscapeOverlay` and related CSS after compact landscape passes.
  - Do not request orientation lock.

- [ ] **7.6 Validate browser-specific viewport behavior.**
  - iOS Safari address bar changes.
  - iOS Safari chat keyboard.
  - Android Chrome chat keyboard.
  - Desktop browser zoom at 80%, 100%, 125%, 150%, and 200%.
  - Touch-enabled Windows browser.

## Acceptance criteria

- No feature depends on a user-agent guess about device category.
- Hybrid devices support both touch and physical keyboard input.
- Phone landscape is not blocked.
- Browser zoom does not create hidden controls or horizontal scroll.

---

# Phase 8 — Accessibility and Interaction Hardening

## Goal

Ensure the responsive refactor improves rather than weakens accessibility.

## Tasks

- [ ] **8.1 Add automated accessibility checks.**
  - Add `@axe-core/playwright` or equivalent.
  - Run checks for each major profile with no modal, each modal open, and each rail state.

- [ ] **8.2 Validate focus order.**
  - Header actions.
  - Board/hint controls.
  - Optional guess field.
  - In-game keyboard.
  - Rails.
  - Modal focus trap and return.

- [ ] **8.3 Correct keyboard labels.**
  - Every in-game key has an accessible name.
  - Enter and Backspace names do not depend only on visual abbreviations.
  - Icon-only buttons have `aria-label`.

- [ ] **8.4 Validate target sizing and spacing.**
  - Touch key height target.
  - Close buttons.
  - Header actions.
  - Modal actions.
  - Ensure narrow keys remain separated and do not overlap.

- [ ] **8.5 Honor reduced motion.**
  - Panel transitions.
  - Keyboard feedback.
  - Orientation/layout changes.
  - Score animations.

- [ ] **8.6 Validate 200% zoom/reflow.**
  - No loss of content or functionality.
  - Modal and rail content scrolls appropriately.
  - Fixed/sticky elements do not obscure focus.

## Acceptance criteria

- Automated accessibility checks pass for all major states.
- Rails are not announced as modal dialogs.
- The guess field is not focusable on touch-first layouts.
- Focus never moves behind a modal.
- All controls remain usable at 200% zoom.

---

# Phase 9 — Replace the Responsive Test Suite

## Goal

Test actual behavior rather than DOM existence and permissive geometry.

## Tasks

- [ ] **9.1 Create a new Playwright spec.**
  - Recommended: `tests/playwright/responsive-layout-and-input.spec.js`.
  - Use the deterministic initialized-lobby fixture.
  - Remove or rewrite tests that load an uninitialized static page.

- [ ] **9.2 Add profile assertion helpers.**
  - Assert `data-density`.
  - Assert `data-interaction`.
  - Assert `data-game-flow`.
  - Assert `data-panel-capacity`.
  - Assert each panel presentation.

- [ ] **9.3 Add strict geometry assertions.**
  - Board fully inside gameplay region.
  - Keyboard fully inside assigned region.
  - No board/keyboard overlap.
  - No header/content overlap.
  - No horizontal page overflow.
  - Open modal fully inside visual viewport.
  - Rails do not reduce center below approved minimum.

- [ ] **9.4 Add input-mode tests.**
  - Touch virtual input.
  - Physical keyboard input.
  - Hybrid input.
  - Chat isolation.
  - Native-keyboard visual viewport adaptation.
  - No guess-field focus after virtual key.

- [ ] **9.5 Add panel mode tests.**
  - Capacity 0, 1, and 2.
  - Modal-to-rail and rail-to-modal transitions.
  - Focus trap only in modal mode.
  - Backdrop only in modal mode.

- [ ] **9.6 Add continuous resize tests.**
  - Sweep width and height, not width alone.
  - Assert no oscillation between profiles.
  - Assert current guess and open panel survive.
  - Test around calculated fit thresholds, not only 600 and 900.

- [ ] **9.7 Add visual regression snapshots.**
  - At least one stable screenshot per key scenario.
  - Mask volatile lobby/player data.
  - Include light and dark mode.
  - Include modal open and rails open.

- [ ] **9.8 Remove fake cross-device test helpers.**
  - Delete helpers that list device dimensions without applying them.
  - Keep calculations as pure unit tests and real viewports as Playwright tests.

- [ ] **9.9 Add CI artifacts.**
  - Playwright report.
  - Failure screenshot.
  - Trace.
  - Layout diagnostics snapshot.
  - Visual diff.

## Acceptance criteria

- Tests never skip board geometry because the game was not initialized.
- Overlap and overflow are failures, not warnings with large tolerances.
- Expected profile and panel behavior is asserted.
- Chromium, Firefox, and WebKit pass.
- At least one mobile emulation project and one touch-tablet project pass.

---

# Phase 10 — Remove Legacy Code and Finalize Documentation

## Goal

Leave one understandable production architecture with no inactive refactor layers.

## Tasks

- [ ] **10.1 Remove deprecated layout vocabulary.**
  - Remove legacy aliases such as `light`, `medium`, and `full` when no call sites remain.
  - Remove `isMobileView()` compatibility behavior.
  - Remove `historyPopup`.

- [ ] **10.2 Remove deprecated scaling code.**
  - Delete production ownership from `boardContainer.js` if replaced.
  - Delete `fitBoardToContainer()` and keyboard repair functions after migration.
  - Remove deprecated window globals.

- [ ] **10.3 Remove old responsive styles.**
  - Delete or drastically reduce `mobile-layout.css` and `desktop-layout.css` after the new stylesheet owns rendering.
  - Remove duplicate component rules from `base.css`.
  - Confirm each selector has one clear owner.

- [ ] **10.4 Remove DOM-reparenting layout code.**
  - Delete `repositionResetButton()`.
  - Remove resize calls related to reparenting.

- [ ] **10.5 Remove portrait-only implementation.**
  - Delete overlay markup, styles, orientation lock, and related tests.

- [ ] **10.6 Remove production debug logging.**
  - Replace with an opt-in debug logger.
  - Keep errors and actionable warnings only.

- [ ] **10.7 Update documentation.**
  - `README.md`
  - `docs/REQUIREMENTS.md`
  - `docs/ARCHITECTURE.md`
  - Responsive testing guide
  - Browser support guide
  - Developer instructions for adding a panel or changing keyboard rows

- [ ] **10.8 Add an ownership map.**
  - State which module owns viewport state.
  - State which module owns layout profiles.
  - State which module owns metrics.
  - State which stylesheet owns the app shell.
  - State how panels choose modal versus rail.

## Acceptance criteria

- No stale references to the deleted prior plan remain.
- One sizing engine remains.
- One layout profile manager remains.
- One panel presentation model remains.
- The production bundle contains no obsolete compatibility code required only by old tests.

---

## 6. Required Test Matrix

The matrix must test width, height, input capability, and orientation. Device names are illustrative, not the source of truth.

| Scenario | Viewport | Pointer/hover | Orientation | Expected panel capacity | Expected flow |
|---|---:|---|---|---:|---|
| Minimum supported phone | 320×568 | coarse / no hover | portrait | 0 | vertical compact |
| Small Android phone | 360×640 | coarse / no hover | portrait | 0 | vertical compact |
| Modern iPhone | 390×844 | coarse / no hover | portrait | 0 | vertical comfortable |
| Large phone | 430×932 | coarse / no hover | portrait | 0 | vertical comfortable |
| Phone landscape short | 667×375 | coarse / no hover | landscape | 0 | split or compact vertical based on fit |
| Phone landscape wide | 844×390 | coarse / no hover | landscape | 0 | split landscape |
| Small tablet portrait | 744×1133 | coarse / no hover | portrait | 0 or 1 only if measured fit passes | vertical |
| Tablet portrait | 768×1024 | coarse / no hover | portrait | 0 or 1 | vertical |
| Large tablet portrait | 820×1180 | coarse / no hover | portrait | 1 if center minimum passes | vertical |
| Tablet landscape | 1024×768 | coarse / no hover | landscape | 1 | vertical/split with rail |
| Small laptop | 1024×768 | fine / hover | landscape | 0 or 1 | keyboard-first vertical |
| Common laptop | 1366×768 | fine / hover | landscape | 1 | keyboard-first with rail |
| Short wide desktop | 1600×650 | fine / hover | landscape | fit-derived; may fall back from 2 | keyboard-first |
| Full HD desktop | 1920×1080 | fine / hover | landscape | 2 | expansive rails |
| Ultra-wide | 2560×1440 | fine / hover | landscape | 2 | centered max-width shell |
| Touch Windows laptop | 1366×768 | mixed / hover | landscape | 1 | hybrid |
| Zoomed desktop | effective 960×540 at 200% | fine / hover | landscape | fit-derived | reflow without loss |

For each scenario, test:

- Board fully visible or intentionally scroll-contained.
- In-game keyboard fully reachable.
- No document horizontal overflow.
- Word entry through in-game keyboard.
- Physical word entry where a keyboard event is provided.
- Chat opens and accepts text.
- Expected rail/modal behavior.
- Modal fits visual viewport.
- Header actions remain reachable.
- Dark mode.
- At least one panel with long content.

---

## 7. Suggested Pull Request Sequence

Keep changes reviewable and avoid one enormous untestable branch.

### PR 1 — Baseline fixtures and failing tests

- Deterministic lobby fixture
- Current-state screenshots
- Layout diagnostics
- CSS parser/style check
- Known-failure tests

### PR 2 — InputController and mobile native-keyboard fix

- Shared input controller
- Remove virtual-key focus
- Replace duplicate touch/click mutation path
- Fix guess-field presentation
- Input tests

### PR 3 — ViewportService and profile contract

- Viewport snapshot
- Capability media queries
- Pure profile decision functions
- Compatibility mapping
- Profile unit tests

### PR 4 — Single metrics engine

- Pure board/keyboard/modal calculations
- One runtime token writer
- Remove keyboard transform scaling
- Start retiring legacy board fitting

### PR 5 — Responsive app shell and keyboard layout

- Unified responsive stylesheet
- Stable grid shell
- Non-fixed gameplay keyboard
- Compact landscape
- Stable reset controls

### PR 6 — Generic panel presentation system

- Capacity 0/1/2
- Modal/rail semantics
- Visual viewport modals
- Resize state preservation

### PR 7 — Accessibility and browser hardening

- Axe tests
- Focus behavior
- Zoom/reflow
- iOS/Android viewport behavior
- Reduced motion

### PR 8 — Legacy removal and documentation

- Delete old layout/scaling code
- Remove portrait lock
- Remove stale CSS and comments
- Final documentation
- Full test matrix

Each PR must include its own passing tests and must not rely on a later PR to repair a known regression.

---

## 8. File-Level Change Map

### Existing files expected to change substantially

- `frontend/game.html`
- `frontend/static/js/appInitializer.js`
- `frontend/static/js/keyboard.js`
- `frontend/static/js/layoutManager.js`
- `frontend/static/js/layoutModes.js`
- `frontend/static/js/overlayState.js`
- `frontend/static/js/panelManager.js`
- `frontend/static/js/responsiveScaling.js`
- `frontend/static/js/uiNotifications.js`
- `frontend/static/js/utils.js`
- `frontend/static/css/base.css`
- `frontend/static/css/shared-base.css`
- `frontend/static/css/mobile-layout.css`
- `frontend/static/css/desktop-layout.css`
- `frontend/static/css/components/keyboard.css`
- `frontend/static/css/components/board.css`
- `frontend/static/css/components/panels.css`
- `frontend/static/css/components/modals.css`
- `tests/playwright/ui-responsiveness.spec.js`
- `tests/playwright/UI_RESPONSIVENESS_TESTS.md`
- `docs/REQUIREMENTS.md`
- `docs/ARCHITECTURE.md`
- `README.md`

### Recommended new files

- `frontend/static/js/layout/viewportService.js`
- `frontend/static/js/layout/layoutProfileManager.js`
- `frontend/static/js/layout/layoutMetricsEngine.js`
- `frontend/static/js/layout/panelPresentationManager.js`
- `frontend/static/js/input/inputController.js`
- `frontend/static/css/responsive-layout.css`
- `tests/playwright/fixtures/initializedLobby.js`
- `tests/playwright/helpers/layoutAssertions.js`
- `tests/playwright/responsive-layout-and-input.spec.js`
- `tests/unit/layoutProfileManager.test.js`
- `tests/unit/layoutMetricsEngine.test.js`
- `docs/responsive/CURRENT_STATE_AUDIT.md`
- `docs/responsive/RESPONSIVE_ARCHITECTURE.md`
- `docs/responsive/TEST_MATRIX.md`

Files may be renamed to match repository conventions, but responsibilities must remain separated.

---

## 9. Performance Requirements

- Layout recalculation occurs at most once per animation frame.
- A resize event must not trigger multiple independent token writers.
- Layout code must not repeatedly force synchronous layout by alternating DOM reads and writes.
- Measurement phase reads all required bounds first.
- Calculation phase is pure.
- Commit phase writes data attributes and CSS variables together.
- `ResizeObserver` callbacks compare prior dimensions before publishing.
- Production console output is minimal.
- Modal animation and rail transitions respect reduced motion.

Recommended development metric:

- During a continuous resize from 320px to 1920px, no long task attributable to layout code should exceed 50ms on a normal development machine.
- The profile should not toggle back and forth at the same dimensions.

---

## 10. Risks and Mitigations

### Risk: CSS and JavaScript create a feedback loop

**Cause:** Metrics change element size, `ResizeObserver` fires, profile changes, and metrics change again.

**Mitigation:**

- Use hysteresis around rail-capacity thresholds.
- Compare profile and token outputs before writing.
- Calculate rail fit from approved minimums rather than the current post-layout rail width.
- Add an oscillation test.

### Risk: Visual viewport differs across mobile browsers

**Mitigation:**

- Use progressive enhancement.
- Keep `100dvh`/`100svh` CSS fallbacks.
- Test iOS Safari and Android Chrome.
- Keep modal content internally scrollable.

### Risk: Removing the guess input weakens accessibility

**Mitigation:**

- Keep physical keydown support.
- Ensure the in-game keyboard is fully keyboard accessible.
- Preserve a desktop mirror field if it adds value.
- Add clear board live-region announcements.
- Test screen-reader focus and virtual keyboard buttons.

### Risk: One-rail tablet behavior becomes unpredictable

**Mitigation:**

- Document rail priority.
- Expose presentation state in diagnostics.
- Use deterministic capacity formulas.
- Add exact tests around thresholds.

### Risk: Existing gameplay features rely on DOM location

**Mitigation:**

- Avoid reparenting gameplay elements during the new implementation.
- Search for selectors and parent assumptions before changing markup.
- Keep IDs stable during migration.
- Add regression tests for reset hold, hints, leaderboard, chat, and options.

### Risk: Too much is changed in one branch

**Mitigation:**

- Follow the PR sequence.
- Maintain compatibility mapping until the unified shell is ready.
- Remove legacy code only in the final cleanup PR.

---

## 11. Non-Goals

This plan does not require:

- A frontend framework migration.
- A backend API redesign.
- A game-rule or scoring redesign.
- Native iOS or Android applications.
- Automatic detection of whether a physical keyboard is connected.
- Device-model-specific CSS.
- User-agent-driven layout selection.

The implementation must remain compatible with the repository’s vanilla HTML, CSS, and JavaScript architecture unless a separate approved decision changes that constraint.

---

## 12. Final Definition of Done

The responsive refactor is complete only when all statements below are true.

### Input

- [ ] Phone and tablet users can complete the game entirely with the in-game keyboard.
- [ ] Tapping the in-game keyboard does not open the native keyboard.
- [ ] Chat can open and use the native keyboard.
- [ ] Laptop/desktop physical keyboard input works.
- [ ] The in-game keyboard also works on laptop/desktop.
- [ ] Hybrid devices support both input methods.
- [ ] `currentGuess` is the only gameplay guess source of truth.

### Layout

- [ ] No horizontal document overflow exists in the required matrix.
- [ ] Board and keyboard never overlap.
- [ ] Board tiles remain square.
- [ ] Header controls remain reachable.
- [ ] Phone portrait and landscape are playable.
- [ ] Tablet rail behavior is based on measured fit.
- [ ] Constrained laptops can fall back to modals.
- [ ] Large desktops can show two rails.
- [ ] Browser zoom up to 200% retains all functionality.

### Panels and popups

- [ ] Modal surfaces fit the visual viewport.
- [ ] Chat remains usable above the native keyboard.
- [ ] Modal focus is trapped and restored correctly.
- [ ] Persistent rails are not marked as modal.
- [ ] Resize preserves open panel state and chat draft text.
- [ ] Backdrop appears only for modal presentation.

### Architecture

- [ ] One viewport service exists.
- [ ] One layout profile manager exists.
- [ ] One metrics engine owns sizing variables.
- [ ] One input controller owns guess mutation.
- [ ] One generic panel presentation system exists.
- [ ] Reset layout does not depend on DOM reparenting.
- [ ] No portrait lock or blocking landscape overlay remains.
- [ ] No production full-keyboard transform scaling remains.
- [ ] Legacy compatibility code has been removed.

### Testing

- [ ] Tests use an initialized game fixture.
- [ ] Geometry tests are strict.
- [ ] Profile behavior is asserted.
- [ ] Input routing is asserted.
- [ ] Rail/modal transitions are asserted.
- [ ] Chromium, Firefox, and WebKit pass.
- [ ] Accessibility checks pass.
- [ ] Visual regression snapshots pass.
- [ ] CI uploads useful failure artifacts.

### Documentation

- [ ] Requirements match the implemented capability model.
- [ ] Architecture ownership is documented.
- [ ] Test matrix is documented.
- [ ] Stale prior-plan references are removed.
- [ ] A developer can add a new panel without creating a panel-specific breakpoint system.

---

## 13. Recommended First Implementation Task

Begin with **Phase 0 and Phase 2**, not CSS.

The first production fix should be the input path:

1. Add the initialized lobby test fixture.
2. Add a failing touch-profile test proving that a virtual key focuses `#guessInput`.
3. Introduce `InputController`.
4. Remove virtual-key focus behavior.
5. Replace `touchstart` plus `click` mutation handling with one accessible activation path.
6. Make the guess field profile-controlled.
7. Verify chat still invokes the native keyboard.

This fixes a concrete user-facing interaction defect while creating the input foundation required by the larger responsive refactor.
