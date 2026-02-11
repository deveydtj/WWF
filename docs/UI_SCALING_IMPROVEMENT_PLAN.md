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
- ❌ No container queries
- ❌ No JS resize / keyboard listeners
- ❌ No animation changes

If a task requires violating these → **STOP AND ESCALATE**

---

## Allowed Breakpoints (Read-Only)

```
Light Mode: ≤600px
Medium Mode: 601–900px
Full Mode: >900px
```

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
- `frontend/static/css/shared-base.css` (for tokens)
- `frontend/static/css/responsive.css` (for breakpoints)
- `frontend/static/css/layout.css`

❌ Do NOT edit component files

## Tasks
- [ ] Define scale tokens:
  - `--scale-xxs`
  - `--scale-xs`
  - `--scale-sm`
  - `--scale-md`
  - `--scale-lg`
- [ ] Assign scale values per breakpoint
- [ ] Replace hard-coded scaling ONLY in `layout.css`
- [ ] Ensure monotonic scale progression

## Commands
- [ ] `npm run test`
- [ ] `npx playwright test`

## Acceptance Criteria
- [ ] Desktop visually unchanged
- [ ] No snapshot diffs
- [ ] Tokens defined in ONE location only

---

# ✅ PR 2 – Width & Height Constraints

## Scope Boundary
**You may edit only:**
- `frontend/static/css/layout.css`
- `frontend/static/css/mobile-layout.css`
- `frontend/static/css/desktop-layout.css`

## Explicit Targets (ONLY THESE)
- Main app container
- Modal wrapper
- Card grid container
- Primary side panel

❌ Do NOT add constraints to individual components

## Tasks
- [ ] Add `min-width` to prevent collapse
- [ ] Add `max-width` to prevent over-expansion
- [ ] Add `min-height` where clipping occurs
- [ ] Prefer `%`, `rem`, `vh`, `vw`

## Commands
- [ ] `npm run test`
- [ ] `npx playwright test`

## Acceptance Criteria
- [ ] No horizontal scroll ≤600px (Light Mode)
- [ ] No clipping at 200% zoom
- [ ] No new snapshot diffs

---

# ✅ PR 3 – Breakpoint Transition Alignment

## Scope Boundary
**You may edit only:**
- `frontend/static/css/layout.css`
- `frontend/static/css/responsive.css`
- `frontend/static/css/mobile-layout.css`
- `frontend/static/css/desktop-layout.css`

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
- [ ] `npm run test`
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
- [ ] `npx playwright test --project=mobile`

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
- [ ] `npm run test`
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
