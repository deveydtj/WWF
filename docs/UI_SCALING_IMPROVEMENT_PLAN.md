# 📐 UI Responsive & Scaling Improvements – Unified Implementation Plan
> **Copilot Coding Agent–Safe Version (Strict Rails & Checklists)**

This file is intentionally written so a **GitHub Copilot Coding Agent** can complete each PR
**independently, deterministically, and with minimal risk**.

Agents MUST follow the rails defined in each PR.

---

## How Agents Should Use This File

1. Pick **one PR section only**
2. Create a branch following repo convention: `feat/ui-scaling-pr-X` or `fix/ui-scaling-pr-X`
3. Edit **only the files explicitly listed**
4. Check off tasks as completed
5. Stop immediately when acceptance criteria are met

Unchecked boxes = incomplete work.

---

## Global Hard Constraints (DO NOT VIOLATE)

- ❌ No visual redesign
- ❌ No component rewrites
- ❌ No new breakpoints
- ❌ No layout re-architecture
- ❌ No new container queries (existing `container-type: inline-size` on `#appContainer` in `base.css` is allowed)
- ❌ No additional JS resize / keyboard listeners (existing listeners in `appInitializer.js` calling `recalculateScaling()` are allowed but MUST NOT be duplicated or extended)
- ❌ No animation changes

If a task requires violating these → **STOP AND ESCALATE**

---

## Allowed Breakpoints (Read-Only)

```
Mobile Layout: ≤768px (mobile-layout.css)
Desktop Layout: ≥769px (desktop-layout.css)
```

**Note:** Legacy docs reference Light ≤600px / Medium 601-900px / Full >900px, but the current active system uses the 768px split shown above (see `frontend/game.html` media queries).

Do not introduce or modify breakpoint values.

---

# ✅ PR 0 – Baseline & Safety Net

## Scope Boundary
**You may edit only:**
- `tests/playwright/**`

## Tasks
- [ ] Add viewport snapshot testing (Playwright preferred)
- [ ] Capture screenshots:
  - 375×667
  - 768×1024
  - 1024×768
  - 1440×900
- [ ] Commit golden images

## Commands
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
- [ ] Define scale tokens in `base.css`:
  - `--scale-xxs`
  - `--scale-xs`
  - `--scale-sm`
  - `--scale-md`
  - `--scale-lg`
- [ ] Assign scale values per breakpoint in `mobile-layout.css` and `desktop-layout.css`
- [ ] Replace hard-coded scaling values with token references
- [ ] Ensure monotonic scale progression

## Commands
- [ ] `python -m pytest -v`
- [ ] `cd frontend && npm run build`
- [ ] `npx playwright test`

## Acceptance Criteria
- [ ] Desktop visually unchanged
- [ ] No snapshot diffs
- [ ] Tokens defined in ONE location only

---

# ✅ PR 2 – Width & Height Constraints

## Scope Boundary
**You may edit only:**
- `frontend/static/css/mobile-layout.css`
- `frontend/static/css/desktop-layout.css`
- `frontend/static/css/components/modals.css` (for modal wrapper constraints)

## Explicit Targets (ONLY THESE)
- Main app container (`#appContainer`)
- Modal wrapper (`.modal`, `#emojiModal`, etc. in modals.css)
- Card grid container (if present in layout files)
- Primary side panel (panels in layout files)

❌ Do NOT add constraints to individual component internals

## Tasks
- [ ] Add `min-width` to prevent collapse
- [ ] Add `max-width` to prevent over-expansion
- [ ] Add `min-height` where clipping occurs
- [ ] Prefer `%`, `rem`, `vh`, `vw`

## Commands
- [ ] `python -m pytest -v`
- [ ] `cd frontend && npm run build`
- [ ] `npx playwright test`

## Acceptance Criteria
- [ ] No horizontal scroll ≤768px (Mobile Layout)
- [ ] No clipping at 200% zoom
- [ ] No new snapshot diffs

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
- [ ] `npx playwright test --update-snapshots`

## Acceptance Criteria
- [ ] Continuous resize produces no snapping
- [ ] Typography hierarchy unchanged
- [ ] Snapshot diffs limited to approved containers

---

# ✅ PR 4 – Mobile Interaction Safety

## Scope Boundary
**You may edit only:**
- `frontend/static/css/mobile-layout.css`
- `frontend/static/css/layout.css`

## Explicit Targets
- Primary navigation buttons
- Form submit buttons
- Icon-only buttons

## Tasks
- [ ] Enforce 44px minimum tap target
- [ ] Add safe-area padding using `env(safe-area-inset-*)`
- [ ] Prevent keyboard overlap via CSS only

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

| Viewport | Zoom | Pass |
|--------|------|------|
| 375px | 100% | [ ] |
| 375px | 200% | [ ] |
| 768px | 100% | [ ] |
| 1024px | 125% | [ ] |
| 1440px | 100% | [ ] |

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
