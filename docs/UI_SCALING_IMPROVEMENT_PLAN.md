# 📐 UI Responsive & Scaling Improvements – Unified Implementation Plan
> **Copilot Coding Agent–Safe Version (Strict Rails & Checklists)**

This file is intentionally written so a **GitHub Copilot Coding Agent** can complete each PR
**independently, deterministically, and with minimal risk**.

Agents MUST follow the rails defined in each PR.

---

## How Agents Should Use This File

1. Pick **one PR section only**
2. Create a branch following repo convention: `feat/ui-scaling-pr-X` (all PRs are feature enhancements, use `feat/` prefix consistently)
3. Edit **only the files explicitly listed**
4. Check off tasks as completed
5. Stop immediately when acceptance criteria are met

**PR Dependencies:**
- PR 0: No prerequisites (foundation)
- PRs 1-4: **Prerequisite: PR 0 must be completed** (snapshot tests required for validation)
- PR 5: **Prerequisites: PRs 0-4 must be completed** (validates all changes)
- PRs 1-4 should be done **sequentially** to avoid conflicts (multiple PRs may modify same files like `base.css`)

Unchecked boxes = incomplete work.

---

## Global Hard Constraints (DO NOT VIOLATE)

- ❌ No visual redesign
- ❌ No component rewrites
- ❌ No new breakpoints
- ❌ No layout re-architecture
- ❌ No new container queries (existing `container-type: inline-size` on `#appContainer` in `base.css` is allowed)
- ❌ No additional JS resize / keyboard listeners (existing listeners in `appInitializer.js` calling `recalculateScaling()` and in the responsive scaling system via `initializeResponsiveScaling()` in `responsiveScaling.js` are allowed but MUST NOT be duplicated or extended)
- ❌ No animation changes

If a task requires violating these → **STOP AND ESCALATE**

---

## Allowed Breakpoints (Read-Only)

**Primary layout switch:**
```
Mobile Layout: ≤768px (mobile-layout.css)
Desktop Layout: ≥769px (desktop-layout.css)
```

**Existing sub-breakpoints (also read-only):**
- `@media (max-width: 375px)` in mobile-layout.css
- `@media (max-width: 600px)` in base.css
- `@media (min-width: 1200px)` in desktop-layout.css
- `@media (min-width: 1551px)` in desktop-layout.css

**Note:** Legacy docs reference Light ≤600px / Medium 601-900px / Full >900px.
The **CSS layout-switch system** between `mobile-layout.css` and `desktop-layout.css` uses the 768px / 769px split shown above (see `frontend/game.html` media queries).
Separately, `900px` is still an **active behavioral threshold** in existing JS (e.g., popup positioning / device categorization) and Playwright tests; agents MUST preserve those usages and MUST NOT add alternative pixel thresholds.

**Editing rules:**
- ❌ Do NOT introduce new breakpoint values
- ❌ Do NOT modify any existing breakpoint threshold values (including 375, 600, 768, 769, 900, 1200, 1551, etc.), whether they appear in CSS, JS, or tests
- ✅ DO edit CSS rules *inside* existing breakpoint blocks when those files are in-scope for the PR

---

# ✅ PR 0 – Baseline & Safety Net

## Scope Boundary
**You may edit only:**
- `tests/playwright/**`
- `.gitignore` (to allowlist Playwright snapshot directory if needed)

## Tasks
- [ ] Add viewport snapshot testing (Playwright preferred)
- [ ] Capture screenshots at all viewport widths that subsequent PRs will assert on:
  - 320×568
  - 375×667
  - 600×900
  - 768×1024
  - 769×1024
  - 900×900
  - 1024×768
  - 1200×900
  - 1440×900
- [ ] Update `.gitignore` to allowlist Playwright snapshots (e.g., `!tests/playwright/**/*.png`) so golden images can be committed
- [ ] Commit golden images

**Note:** The repo's `.gitignore` currently ignores all `*.png` files and `test-results/`. You must allowlist the Playwright snapshot directory to commit golden images.

## Commands
- [ ] `npx playwright install` (install browsers if needed)
- [ ] `npx playwright test`
- [ ] `npx playwright test --update-snapshots`

## Acceptance Criteria
- [ ] All tests pass
- [ ] Zero UI code touched

---

# ✅ PR 1 – Scaling Tokens & CSS Foundations

## Scope Boundary
**You may edit only:**
- `frontend/static/css/base.css` (for tokens - this is where active CSS vars live)
- `frontend/static/css/mobile-layout.css` (for mobile breakpoint scaling)
- `frontend/static/css/desktop-layout.css` (for desktop breakpoint scaling)

❌ Do NOT edit component files
❌ Do NOT edit `responsive.css` or `layout.css` (neutralized behind `.legacy-layout-active`)

## Tasks
- [ ] Define scale tokens in `base.css` (extending existing `--ui-scale`, `--current-scale-factor`, `--tile-size` system):
  - `--scale-xxs`
  - `--scale-xs`
  - `--scale-sm`
  - `--scale-md`
  - `--scale-lg`
- [ ] Assign scale values per breakpoint in `mobile-layout.css` and `desktop-layout.css` (token *overrides* per breakpoint; token *names* centralized in `base.css`)
- [ ] Replace hard-coded scaling values with token references
- [ ] Ensure monotonic scale progression (values for `--scale-xxs` through `--scale-lg` must be strictly increasing, and for any given token, values at larger breakpoints must not be smaller than at smaller breakpoints)

**Note:** The `--scale-*` tokens are **semantic size tiers** (e.g., for typography, spacing, and component sizing) that sit *on top of* the existing numeric scaling system:
- `--ui-scale` / `--current-scale-factor` remain the **global numeric controls** for overall UI zoom/responsiveness.
- `--scale-xxs` → `--scale-lg` are **relative multipliers/tiers** that should be derived from the current `--ui-scale` / `--current-scale-factor` values for each breakpoint.
- `--tile-size` and other component-level sizes should read from these tokens where appropriate (e.g., `--tile-size` may be defined in terms of `--scale-md` or similar), not introduce a separate scaling system.

New tokens must **extend** the existing token system, not replace it:
- Define token *names* and their semantic ordering in ONE location (`base.css`).
- Override token *values* per breakpoint only in layout files (`mobile-layout.css`, `desktop-layout.css`), keeping a single, unified scaling model.

## Commands
- [ ] `python -m pytest -v`
- [ ] `cd frontend && npm run build`
- [ ] `npx playwright test`

## Acceptance Criteria
- [ ] Desktop visually unchanged (validated against PR 0 snapshots)
- [ ] No snapshot diffs (compared to PR 0 baseline)
- [ ] Token *names* defined in ONE location only (`base.css`); breakpoint-specific overrides allowed in layout files

**Prerequisite:** PR 0 must be completed and snapshot tests passing before starting this PR.

---

# ✅ PR 2 – Width & Height Constraints

## Scope Boundary
**You may edit only:**
- `frontend/static/css/mobile-layout.css`
- `frontend/static/css/desktop-layout.css`
- `frontend/static/css/components/modals.css` **(explicit exception to "no component files" rule – modal wrapper constraints only, e.g., `.modal`, `#emojiModal`; do NOT modify inner component styles)**
- `frontend/static/css/base.css` (if adjusting `#appContainer` max-width)

## Explicit Targets (ONLY THESE)
- Main app container (`#appContainer`)
  - **Note:** `#appContainer` already has `max-width: 980px` in `base.css` with documented rationale (readability, reference layout matching). **Decision criteria:** Remove if goal is full-width scaling on ultra-wide displays; keep if maintaining centered content with readable line lengths; override per-breakpoint if different behavior needed for mobile vs desktop.
- Modal wrapper (`.modal`, `#emojiModal`, etc. in modals.css)
- Main grid layout container (`#mainGrid` – desktop three-column layout)
- Primary side panel (panels in layout files)

❌ Do NOT add constraints to individual component internals

## Tasks
- [ ] Review existing `max-width: 980px` on `#appContainer` in `base.css`
- [ ] Decide based on criteria: remove for ultra-wide scaling, keep for centered content, or override per breakpoint
- [ ] Add `min-width` to prevent collapse (if not already present)
- [ ] Add `min-height` where clipping occurs
- [ ] Prefer `%`, `rem`, `vh`, `vw`

## Commands
- [ ] `python -m pytest -v`
- [ ] `cd frontend && npm run build`
- [ ] `npx playwright test`

## Acceptance Criteria
- [ ] No horizontal scroll ≤768px (Mobile Layout)
- [ ] No clipping when UI is scaled to 200% using the manual zoom procedure in [Manual 200% Zoom Check](#manual-200-zoom-check)
- [ ] No new snapshot diffs

### Manual 200% Zoom Check
For each supported browser (Chrome, Firefox, Safari, Edge):
1. Open the game at the relevant route.
2. Set the viewport width to approximately 768px (or use device emulation for a narrow phone-width viewport).
3. Use the browser's built-in zoom controls to set page zoom to **200%**.
4. Scroll through the page and verify:
   - No essential UI elements are clipped or hidden behind container edges.
   - All interactive controls (keyboard, buttons, menus, scoreboard, chat) remain fully visible and reachable.
   - No horizontal scrollbar appears due to layout overflow caused by scaling.

---

# ✅ PR 3 – Breakpoint Transition Alignment

## Scope Boundary
**You may edit only:**
- `frontend/static/css/mobile-layout.css`
- `frontend/static/css/desktop-layout.css`

❌ Do NOT edit `layout.css` or `responsive.css` (neutralized behind `.legacy-layout-active`)

## Explicit Targets
- Root layout container
- Primary content column
- Global header/footer spacing

❌ Do NOT touch component spacing

## Tasks
- [ ] Normalize padding using existing spacing tokens
- [ ] Normalize margins across breakpoints
- [ ] Align typography scale with existing tokens
- [ ] Remove abrupt breakpoint jumps

## Commands
- [ ] `python -m pytest -v`
- [ ] `cd frontend && npm run build`
- [ ] `npx playwright test`

## Acceptance Criteria
- [ ] At viewport widths **320px, 375px, 600px, 768px, 769px, 900px, and 1200px**, Playwright tests capture the bounding boxes (`x`, `y`, `width`, `height`) of the primary content column, header, and footer, and the change in any of these values between adjacent widths does not exceed **10px**
- [ ] Responsive spacing and typography changes across the viewport widths listed above avoid hard-coded pixel jumps, using fluid techniques such as `clamp()`, `calc()`, viewport units, or CSS custom properties for the transitions (verified via CSS inspection and Playwright assertions on computed styles)
- [ ] **Baseline definition:** The "approved baseline" for bounding boxes, typography, and visual regressions is the set of Playwright artifacts (PNG snapshots and JSON fixtures of computed styles/bounding boxes) generated in **PR 0 – Foundation** at the viewport widths listed above and checked into `tests/playwright/baseline/`
- [ ] At viewport widths **320px, 768px, and 1200px**, Playwright typography tests confirm that the computed font-sizes for headings preserve hierarchy (`h1` ≥ `h2` ≥ `h3` ≥ `h4`), and each heading's computed font-size stays within **±2px** of the approved baseline defined above
- [ ] Visual regression snapshots taken at **320px, 375px, 600px, 768px, 769px, 900px, and 1200px** use the PR 0 baseline artifacts from `tests/playwright/baseline/` and show diffs only within the explicitly approved containers for this PR: root layout container, primary content column, and global header/footer spacing; all other containers must match the approved baseline with zero diffs

---

# ✅ PR 4 – Mobile Interaction Safety

## Scope Boundary
**You may edit only:**
- `frontend/static/css/mobile-layout.css`
- `frontend/static/css/components/buttons.css` (for tap targets)
- `frontend/static/css/base.css` (for safe-area verification only)

❌ Do NOT edit `layout.css` (neutralized behind `.legacy-layout-active` - has no effect)

## Explicit Targets
- Primary navigation buttons
- Form submit buttons
- Icon-only buttons

## Tasks
- [ ] Enforce 44px minimum tap target on buttons (in `buttons.css` and/or `mobile-layout.css`)
- [ ] Verify existing safe-area padding (via `env(safe-area-inset-*)`) on `#appContainer` in `base.css` and on the specific mobile elements in `mobile-layout.css` before making changes. Safe-area insets are already applied to `#appContainer` padding in `base.css` and to targeted mobile elements in `mobile-layout.css` (search for `env(safe-area-inset` and selectors such as `#appContainer`, `#lobbyHeader`, and bottom navigation/toolbars). Only increase these values if necessary; do **not** duplicate the `env()` padding on the same element (avoid adding a second safe-area layer).
- [ ] Prevent keyboard overlap primarily via CSS (e.g., use `env(keyboard-inset-height)` and sufficient bottom padding on scrollable containers); you MAY rely on existing `detectVirtualKeyboard` behavior in `enhancedScaling.js` but MUST NOT add new resize/keyboard listeners

## Commands
- [ ] `npx playwright test --project=mobile-chrome --project=mobile-safari`

## Acceptance Criteria
- [ ] All primary actions reachable one-handed
- [ ] No element hidden behind notch/keyboard

---

# ✅ PR 5 – Validation Matrix & Final QA

## Scope Boundary
**Read-only except tests**
- `tests/**`

## Tasks
- [ ] Run full test suite
- [ ] Validate viewport matrix below
- [ ] Update snapshots ONLY if expected

## Viewport Validation Matrix

| Viewport (W×H) | Zoom | Pass |
|----------------|------|------|
| 375×667        | 100% | [ ] |
| 375×667        | 200% | [ ] |
| 768×1024       | 100% | [ ] |
| 1024×768       | 125% | [ ] |
| 1440×900       | 100% | [ ] |

## Commands
- [ ] `python -m pytest -v`
- [ ] `cd frontend && npm run build`
- [ ] `npx playwright test`

## Acceptance Criteria
- [ ] All rows pass
- [ ] No unexplained diffs

---

## Definition of Done (ALL PRs)

- [ ] Scope boundary respected
- [ ] Tasks fully checked off
- [ ] Acceptance criteria met
- [ ] Tests passing
- [ ] No hard constraints violated

---

## AI Agent STOP Conditions

STOP immediately if:
- [ ] A redesign is required
- [ ] A component rewrite seems necessary
- [ ] You need to edit files outside scope
- [ ] Desktop regression detected
- [ ] A rule conflict cannot be resolved

---

## Required PR Template

```
### PR
feat/ui-scaling-pr-X

### Completed Tasks
- [x] ...

### Files Changed
- list files

### Validation
- Commands run
- Viewports tested

### Screenshots
- Before / After
```
