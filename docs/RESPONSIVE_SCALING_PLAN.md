# Responsive UI Scaling Reliability Plan

## Context

Universal scaling has improved layout consistency, but it still has edge-case failures when browser zoom or viewport changes happen during runtime. In particular, some UI elements can shrink too aggressively on small screens (or after browser-level scaling), creating usability and readability regressions.

This plan defines a **no-code planning roadmap** that breaks the work into **small, independent pull requests** so level 1 engineers can execute safely.

## Goals

- Remove hard width caps that cause clipping or undersized UI on extreme viewports.
- Introduce responsive sizing tokens so spacing, type, controls, and board elements scale predictably.
- Ensure reliable behavior on:
  - Small phones
  - Tablets (portrait + landscape)
  - Standard desktop
  - Large and ultra-wide desktop
- Add a compact but repeatable validation plan for viewport and layout behavior.

## Non-Goals

- No redesign of game mechanics or visual theme.
- No migration to a new CSS framework.
- No full rewrite of all layout files in one PR.

---

## Delivery Strategy (Small PRs)

Each PR should be reviewable in under ~300 LOC (where practical) and should include:
- Scope statement
- Before/after screenshots for changed breakpoints
- Explicit acceptance checklist
- Minimal regression checks

### PR-01: Baseline Audit + Token Contract (Documentation Only)

**Objective**: Create a shared map of current sizing behavior and define the initial responsive token contract.

**Changes**
- Add a short audit section to docs identifying:
  - Current hard caps (e.g., `max-width`, fixed `px` widths/heights) in layout-critical areas.
  - Current breakpoint behavior and known failures.
- Define first-pass token groups (names only; no broad implementation yet):
  - `--size-space-*`
  - `--size-font-*`
  - `--size-control-*`
  - `--size-board-*`
  - `--size-shell-*`

**Implementation steps**
1. Catalog current fixed sizes in layout and component CSS.
2. Group each fixed size by purpose (spacing, typography, control, board, container).
3. Propose token naming + fallback strategy.
4. Record migration priority list (high-risk areas first).

**Acceptance criteria**
- A single source-of-truth token naming contract exists in docs.
- Hard-cap hotspots are listed with file references.
- Follow-up PR order is documented.

---

### PR-02: Introduce Base Responsive Tokens (Non-breaking)

**Objective**: Add token definitions without changing behavior materially.

**Changes**
- Add a token file or token section in existing shared CSS.
- Define tokens using `clamp()` and viewport-aware units where appropriate.
- Keep current selectors intact; only wire a limited subset to reduce risk.

**Implementation steps**
1. Create token values for base spacing and typography.
2. Add optional device buckets (mobile/tablet/desktop/ultra-wide) using media query overrides.
3. Replace only low-risk duplicated values with tokens.
4. Verify visual parity at common desktop width to avoid broad regressions.

**Acceptance criteria**
- Token layer exists and is loaded globally.
- No visible regression at primary desktop width.
- Token usage starts in low-risk shared styles.

---

### PR-03: Remove Critical Hard Width Caps in Main Layout Shell

**Objective**: Fix the highest-impact shrinking/clipping behaviors by removing restrictive caps in core containers.

**Changes**
- Update app shell/container width constraints in primary layout styles.
- Convert rigid widths to fluid patterns (`min()`, `max()`, `clamp()`, `%`, `vw`, container-aware rules).
- Preserve upper readability bounds using tokenized max measures instead of brittle hard caps.

**Implementation steps**
1. Target top 3–5 shell-level constraints identified in PR-01.
2. Replace each with token-driven fluid rules.
3. Add comments where constraints must remain intentional.
4. Capture screenshots at each validation breakpoint.

**Acceptance criteria**
- No shell-level horizontal overflow at target breakpoints.
- Core game surface remains readable and centered.
- Elements no longer collapse too small during browser resize.

---

### PR-04: Board + Input Scaling Stabilization

**Objective**: Ensure board cells and input areas preserve usability under dynamic viewport changes.

**Changes**
- Tokenize board tile sizing and gaps.
- Add minimum interactive target safeguards for inputs/buttons.
- Normalize font scaling in board/input contexts.

**Implementation steps**
1. Replace board tile fixed sizes with tokenized `clamp()`.
2. Add minimum touch-target guardrails.
3. Validate landscape small-phone and portrait-tablet behavior.
4. Tune only within documented bounds (avoid visual redesign).

**Acceptance criteria**
- Board remains legible across smallest supported phone viewport.
- Input controls meet minimum usable size.
- No overlap between board, input, and keyboard/action regions.

---

### PR-05: Sidebar/Panel/Ancillary UI Responsiveness

**Objective**: Prevent side panels and secondary modules from forcing main content shrinkage.

**Changes**
- Convert panel widths to tokenized responsive limits.
- Ensure ancillary sections wrap/stack at defined thresholds.
- Improve ultra-wide behavior so space expands gracefully without over-stretching text blocks.

**Implementation steps**
1. Apply `clamp()` width strategy to panels.
2. Add breakpoint-specific stacking rules where side-by-side fails.
3. Set max readable measure for text-heavy regions.
4. Validate panel toggles with dynamic resizing.

**Acceptance criteria**
- Panels no longer force board/content collapse.
- Ultra-wide layouts use space effectively but keep readable line lengths.
- Toggling panels does not introduce jumpy reflow.

---

### PR-06: Browser Runtime Scaling Hardening

**Objective**: Reduce instability when users change zoom, open devtools, rotate device, or resize rapidly.

**Changes**
- Harden viewport and resize handling strategy (CSS-first, JS only where required).
- Standardize dynamic viewport unit usage (`dvh`, safe area where relevant).
- Add defensive layout recalculation trigger policy (debounced if JS path exists).

**Implementation steps**
1. Document current runtime resize/zoom handling behavior.
2. Prefer CSS-native resilience first.
3. If JS listeners are necessary, define strict, low-frequency recalculation policy.
4. Test rapid resize + orientation changes.

**Acceptance criteria**
- UI recovers gracefully after zoom/resize/orientation changes.
- No persistent undersized state after viewport returns to normal.
- Layout shifts are minimized and predictable.

---

### PR-07: Compact Cross-Viewport Test Coverage

**Objective**: Add lightweight automated/manual validation to prevent regressions.

**Changes**
- Add a compact viewport matrix to test docs.
- Add or extend e2e visual/layout checks for critical containers.
- Define pass/fail rules for overflow, clipping, and minimum control size.

**Implementation steps**
1. Create canonical viewport list (see matrix below).
2. Add checks for:
   - No horizontal overflow.
   - Board visible and not clipped.
   - Primary controls visible and usable.
3. Document manual sanity pass for runtime resizing.

**Acceptance criteria**
- Repeatable test checklist exists in repository docs.
- At least one automated check covers layout integrity at multiple breakpoints.
- Regression triage template added for viewport-related bugs.

---

## Issue Breakdown (Ready to Create)

Use these as individual GitHub issues linked to PRs.

1. **Issue A**: Audit hard width caps and breakpoints.
2. **Issue B**: Define and document responsive sizing token contract.
3. **Issue C**: Add base token layer with non-breaking integration.
4. **Issue D**: Refactor shell/container width constraints.
5. **Issue E**: Stabilize board and input scaling.
6. **Issue F**: Refactor panel/sidebar responsiveness.
7. **Issue G**: Harden runtime resize/zoom/orientation behavior.
8. **Issue H**: Add compact cross-viewport validation coverage.

Each issue should include:
- Background
- Scope in/out
- Implementation checklist
- Acceptance criteria
- Screenshots required list

---

## Compact Viewport Validation Matrix

Minimum matrix for each relevant PR:

- **Small phone portrait**: 320x568
- **Large phone portrait**: 430x932
- **Tablet portrait**: 768x1024
- **Tablet landscape**: 1024x768
- **Desktop standard**: 1440x900
- **Desktop wide**: 1920x1080
- **Ultra-wide**: 2560x1080

Additional runtime checks:
- Rotate phone portrait ↔ landscape.
- Rapid browser width drag from mobile range to desktop range and back.
- Browser zoom checks at 80%, 100%, 125% (desktop).

Pass criteria (all must hold):
- No persistent horizontal scrollbar on main shell.
- No critical action button falls below usable size.
- Main game content stays visible without overlap.
- Text remains readable (no extreme compression).

---

## Execution Notes for Level 1 Engineers

- Do not mix token introduction and large layout rewrites in one PR.
- Prefer replacing a few high-risk constraints first, then iterate.
- Keep commits scoped to one problem area.
- Include before/after screenshots for every modified breakpoint.
- If a change risks multi-area impact, split into a follow-up PR.

## Suggested PR Template Snippet

Use this in each scaling PR description:

1. **What changed** (1-3 bullets)
2. **Why this is safe** (non-breaking reasoning)
3. **Viewports tested** (from matrix)
4. **Known limitations**
5. **Follow-up issue(s)**

---

## Definition of Done (Program-Level)

This initiative is complete when:
- Responsive tokens are the primary sizing mechanism in layout-critical paths.
- Hard width caps are removed or justified in documented exceptions.
- Core game UI remains usable and readable across matrix breakpoints.
- Runtime viewport changes no longer leave UI in a shrunken/broken state.
- Compact automated and manual validation is documented and repeatable.
