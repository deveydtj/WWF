# 🎯 Peripheral UI Elements Scaling & Layout Plan

> **Planning Document for GitHub Copilot Coding Agent**

This document outlines a comprehensive plan to fix scaling, positioning, and overlap issues with UI elements surrounding the game board. The game board itself scales well, but buttons, panels, hints, keyboard, and other peripheral elements can overlap and display incorrectly at various viewport sizes.

---

## Problem Statement

### Current State

The WordSquad game board has been successfully improved with responsive scaling (per `UI_SCALING_IMPROVEMENT_PLAN.md`). However, the **peripheral UI elements** still have issues:

**Problematic Elements:**
1. **Buttons** (Submit Guess, Reset, Options, Chat Notify)
   - Can overlap with board edges at certain breakpoints
   - Inconsistent positioning across viewport sizes
   - Touch targets may be too small on mobile

2. **History Panel** (`#historyBox`)
   - Positioning conflicts in desktop layout
   - Overlay behavior inconsistent on mobile/tablet
   - Can obscure game board content

3. **Hints Box/Notification**
   - Daily Double hint indicator positioning issues
   - May overlap with other UI elements
   - Not consistently visible across all layouts

4. **Keyboard** (`#keyboard`)
   - Fixed bottom positioning can conflict with virtual keyboards on mobile
   - Key sizing doesn't scale smoothly with viewport changes
   - Layout can break at breakpoint transitions

5. **Definition Panel** (`#definitionBox`) and **Chat Panel** (`#chatBox`)
   - Similar positioning issues as History Panel
   - Overlay z-index conflicts
   - Inconsistent padding/margins across breakpoints

### Root Causes

1. **Absolute Positioning**: Many elements use absolute positioning with calc() values tied to board dimensions, causing misalignment when board scales
2. **Breakpoint Gaps**: CSS rules don't cover all viewport transition points smoothly
3. **Z-Index Conflicts**: Overlapping elements don't have clear stacking hierarchy
4. **Touch Target Sizing**: Mobile buttons don't consistently meet 44px minimum
5. **Container Constraints**: Elements positioned relative to board don't account for container padding/margins

---

## Goals

Create a cohesive peripheral UI scaling system that:

1. ✅ Ensures all UI elements scale proportionally with the board
2. ✅ Eliminates overlaps and positioning conflicts
3. ✅ Maintains consistent spacing across all breakpoints
4. ✅ Provides adequate touch targets on mobile (≥44px)
5. ✅ Works seamlessly with the existing board scaling system
6. ✅ Preserves the current visual style and user experience

---

## Architecture Overview

### Design Principles

```
┌─────────────────────────────────────────────────┐
│         Board Scaling (Already Fixed)          │
│              (Foundation Layer)                  │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│      Peripheral UI Scaling (This Plan)         │
├─────────────────────────────────────────────────┤
│  • Buttons tied to board size tokens           │
│  • Panels positioned relative to layout grid   │
│  • Keyboard scales with viewport height        │
│  • Hints positioned consistently in all modes  │
│  • Z-index hierarchy clearly defined           │
└─────────────────────────────────────────────────┘
```

### Key Strategy

**Use CSS Custom Properties from Board Scaling:**
- Leverage existing `--tile-size`, `--board-width`, `--ui-scale` tokens
- Create new tokens for peripheral element sizing: `--button-size`, `--panel-width`, `--keyboard-height`
- Ensure all elements respond to the same scaling system

**Layout Mode Awareness:**
- Mobile (≤768px): Stack elements, use overlays, fixed keyboard
- Desktop (≥769px): Grid positioning, sidebar panels, inline keyboard

---

## Detailed Implementation Plan

### Phase 1: Button Positioning & Scaling

**Objective**: Fix all button positioning and ensure consistent sizing across viewport sizes.

#### Target Elements

1. `#optionsToggle` - Options menu button (⚙️)
2. `#chatNotify` - Chat notification button (💬)
3. `#holdReset` - Reset button (in input area)
4. `#submitGuess` - Submit guess button (in input area)
5. Mobile menu buttons (various)

#### Current Issues

- `#optionsToggle` and `#chatNotify` use absolute positioning with `calc(50% + var(--board-width) / 2 + var(--tile-gap))`
- This calculation doesn't account for container constraints or responsive padding
- Buttons can overlap board on narrow viewports
- Touch targets inconsistent across devices

#### Implementation Strategy

**Step 1: Use Existing Button Sizing Tokens**

Leverage existing tokens from `base.css`:
```css
:root {
  /* Use existing semantic scale tokens for button sizing */
  /* --scale-xxs: 0.75  (Extra extra small) */
  /* --scale-xs: 0.875  (Extra small) */
  /* --scale-sm: 1      (Small) */
  /* --scale-md: 1.125  (Medium - baseline) */
  /* --scale-lg: 1.25   (Large - prominent) */
  
  /* Use existing minimum touch target token */
  /* --min-touch-target: 44px (already defined) */
  
  /* Use existing uniform button sizing */
  /* --uniform-button-width: max(calc(var(--tile-size) * var(--scale-lg)), var(--min-touch-target)) */
  /* --uniform-button-height: max(calc(var(--tile-size) * var(--scale-sm)), var(--min-touch-target)) */
}
```

**Step 2: Refactor Button Positioning**

In `components/panels.css`, replace absolute positioning for `#optionsToggle` and `#chatNotify`:

```css
/* Desktop: Position relative to board container using existing scale tokens */
@media (min-width: 769px) {
  #optionsToggle {
    position: relative;  /* Changed from absolute */
    width: calc(var(--tile-size) * var(--scale-md));
    height: calc(var(--tile-size) * var(--scale-md));
    /* Remove left: calc() - let flexbox/grid handle positioning */
  }
  
  #chatNotify {
    position: relative;
    width: calc(var(--tile-size) * var(--scale-md));
    height: calc(var(--tile-size) * var(--scale-md));
    /* Remove top/left calc() */
  }
}

/* Mobile: Ensure touch targets using existing token */
@media (max-width: 768px) {
  .mobile-menu-item,
  #optionsToggle,
  #chatNotify {
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
  }
}
```

**Step 3: Update Input Area Button Layout**

Ensure Submit and Reset buttons scale together:

```css
#inputArea {
  display: flex;
  gap: calc(var(--tile-size) * 0.2);
  align-items: center;
  justify-content: center;
  width: var(--board-width);  /* Match board width */
}

#submitGuess,
#holdReset {
  width: var(--uniform-button-width);  /* Already defined */
  height: var(--uniform-button-height);
  /* Ensure they scale with board */
}
```

#### Tasks

- [ ] Add button sizing tokens to `base.css`
- [ ] Refactor `#optionsToggle` and `#chatNotify` positioning
- [ ] Update input area button layout to scale with board
- [ ] Ensure all buttons meet 44px touch target on mobile
- [ ] Test button positioning at all breakpoints (375px, 768px, 1024px, 1440px)
- [ ] Verify no overlap with board or other elements

#### Acceptance Criteria

- [ ] All buttons scale proportionally with `--tile-size`
- [ ] No absolute positioning with complex calc() expressions
- [ ] Mobile buttons meet 44px minimum touch target
- [ ] Desktop buttons maintain consistent spacing from board
- [ ] No overlap at any viewport size (320px to 2560px)
- [ ] Visual regression tests pass

---

### Phase 2: Panel Layout & Positioning

**Objective**: Fix panel positioning, eliminate overlaps, ensure consistent behavior across layouts.

#### Target Elements

1. `#historyBox` - History panel (left sidebar on desktop)
2. `#definitionBox` - Definition panel (right sidebar on desktop)
3. `#chatBox` - Chat panel (right sidebar on desktop)
4. All panel overlays on mobile/tablet

#### Current Issues

- Panels use mix of absolute positioning and CSS Grid
- Z-index conflicts between overlapping panels
- Inconsistent show/hide transitions
- Panel widths don't scale with viewport
- Mobile overlays can obscure important content

#### Implementation Strategy

**Step 1: Use Existing Panel Sizing Tokens**

Reference existing tokens from `desktop-layout.css`:
```css
:root {
  /* Use existing desktop panel width token (defined in desktop-layout.css) */
  /* --desktop-panel-width: 240px (base) */
  /* --desktop-panel-width: 280px (at 1200px+ breakpoint) */
  
  /* Use existing desktop spacing tokens */
  /* --desktop-grid-gap: 20px */
  /* --desktop-content-padding: 16px */
  
  /* Panel overlay padding can use existing scale tokens */
  --panel-overlay-padding: calc(var(--tile-size) * var(--scale-md));
}
```

**Step 2: Refine Existing Desktop Panel Grid**

The desktop grid layout is already implemented in `desktop-layout.css` (lines 142-166). Focus on refining spacing within the existing structure:
```css
@media (min-width: 769px) {
  /* The grid is already defined with:
   * grid-template-columns: var(--desktop-panel-width) 1fr var(--desktop-panel-width);
   * grid-template-areas: "left center right";
   * Dynamic column adjustments based on panel visibility already implemented
   */
  
  /* Refine panel constraints using existing tokens */
  #historyBox {
    /* Already has grid-area: left */
    max-height: var(--desktop-panel-max-height);
    overflow-y: auto;
  }
  
  #definitionBox,
  #chatBox {
    /* Already have grid-area: right */
    max-height: var(--desktop-panel-max-height);
    overflow-y: auto;
  }
}
```

**Step 3: Mobile Panel Overlays**

In `mobile-layout.css`:
```css
@media (max-width: 768px) {
  .panel-box {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: var(--z-panel-overlay);
    background: var(--bg-color);
    padding: var(--panel-overlay-padding);
    display: none;  /* Hidden by default */
    flex-direction: column;
    overflow-y: auto;
    transform: translateY(100%);
    transition: transform 0.3s ease-out;
  }
  
  .panel-box.active {
    display: flex;
    transform: translateY(0);
  }
  
  /* Ensure safe area insets */
  .panel-box {
    padding-top: max(var(--panel-overlay-padding), env(safe-area-inset-top));
    padding-bottom: max(var(--panel-overlay-padding), env(safe-area-inset-bottom));
  }
}
```

**Step 4: Use Existing z-index Hierarchy**

Reference existing z-index values from `z-index.css` (no new tokens needed):
```css
:root {
  /* Use existing panel z-index hierarchy (from z-index.css) */
  /* --z-panel-base: 20 */
  /* --z-panel-overlay: 30        (Mobile panel overlays) */
  /* --z-panel-notification: 30   (Chat notification badge) */
  /* --z-keyboard: 10             (Keyboard below panels) */
  
  /* Use existing modal z-index tokens */
  /* --z-modal-backdrop: 60       (Backdrop behind modal content) */
  /* --z-modal-content: 65        (Modal content above all panels) */
}
```

#### Tasks

- [ ] Add panel sizing tokens to `base.css`
- [ ] Refactor desktop panel positioning to use CSS Grid (not absolute)
- [ ] Fix mobile panel overlay positioning and transitions
- [ ] Clarify z-index hierarchy in `z-index.css`
- [ ] Update panel CSS in `components/panels.css` to use tokens
- [ ] Test panel visibility and transitions at all breakpoints
- [ ] Verify panels don't overlap board or buttons
- [ ] Ensure panel scrolling works correctly

#### Acceptance Criteria

- [ ] Desktop panels positioned via CSS Grid with flexible widths
- [ ] Mobile panels use full-screen overlays with slide transitions
- [ ] Z-index hierarchy prevents unintended overlaps
- [ ] Panel widths scale smoothly with viewport
- [ ] No content clipping or overflow issues
- [ ] Safe area insets respected on mobile devices
- [ ] Smooth transitions between layout modes

---

### Phase 3: Keyboard Layout & Scaling

**Objective**: Fix keyboard positioning, ensure keys scale properly, prevent conflicts with virtual keyboards.

#### Target Elements

1. `#keyboard` - On-screen keyboard container
2. `.key` - Individual keyboard keys
3. `.key-row` - Keyboard rows

#### Current Issues

- Fixed bottom positioning conflicts with mobile virtual keyboards
- Key sizes don't scale smoothly across viewports
- Keyboard can obscure input area on small screens
- Letter spacing inconsistent at different scales

#### Implementation Strategy

**Step 1: Use Existing Keyboard Sizing Tokens**

Reference existing keyboard tokens from `base.css`:
```css
:root {
  /* Use existing keyboard sizing tokens (already defined in base.css) */
  /* --key-h: 44px          (key height) */
  /* --kb-gap: 8px          (keyboard gap) */
  /* --key-font: 16px       (key font size) */
  
  /* If enhanced responsive sizing is needed, use clamp() with existing token names */
  /* Maintain token name consistency with existing codebase */
}
```

**Step 2: Desktop Keyboard Layout**

In `desktop-layout.css`:
```css
@media (min-width: 769px) {
  #keyboard {
    position: relative;  /* Not fixed */
    width: 100%;
    max-width: var(--board-width);
    margin: var(--keyboard-padding) auto 0;
    padding: var(--keyboard-padding);
  }
  
  .key {
    min-width: var(--key-h);
    min-height: var(--key-h);
    font-size: var(--key-font);
  }
  
  .key-row {
    display: flex;
    gap: var(--kb-gap);
    justify-content: center;
    margin-bottom: var(--kb-gap);
  }
}
```

**Step 3: Mobile Keyboard Layout**

In `mobile-layout.css`:
```css
@media (max-width: 768px) {
  #keyboard {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--bg-color);
    padding: var(--keyboard-padding);
    padding-bottom: max(
      var(--keyboard-padding),
      env(safe-area-inset-bottom)
    );
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
    z-index: var(--z-keyboard);
  }
  
  /* Account for virtual keyboard */
  #keyboard {
    transform: translateY(0);
    transition: transform 0.3s ease;
  }
  
  /* When virtual keyboard is visible, slide up on-screen keyboard */
  body.virtual-keyboard-visible #keyboard {
    transform: translateY(calc(var(--keyboard-inset-height, 0px)));
  }
  
  .key {
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    font-size: var(--key-font);
  }
}
```

**Step 4: Integrate with Existing Virtual Keyboard Detection**

Reuse the existing virtual keyboard detection system already implemented in the codebase:
```javascript
// Virtual keyboard detection is ALREADY IMPLEMENTED in:
// - appInitializer.js (lines 455-461): visualViewport resize listener
// - enhancedScaling.js (lines 60-68): detectVirtualKeyboard() method
// - utils.js (lines 917-926, 983-984): virtual keyboard offset/detection

// Ensure the existing system:
// 1. Updates document.body.style.setProperty('--keyboard-inset-height', '<px value>')
// 2. Adds/removes the 'virtual-keyboard-visible' class on <body>
// 3. No new event listeners or pixel thresholds should be added

// The CSS above is designed to respond to these existing mechanisms
```

#### Tasks

- [ ] Add keyboard sizing tokens to `base.css`
- [ ] Refactor desktop keyboard positioning (relative, not fixed)
- [ ] Update mobile keyboard to handle virtual keyboard conflicts
- [ ] Ensure key sizes scale proportionally with viewport
- [ ] Add safe-area-inset handling for mobile keyboards
- [ ] Implement visual viewport detection for virtual keyboard
- [ ] Test keyboard on various mobile devices (iOS, Android)
- [ ] Verify keyboard doesn't obscure input area

#### Acceptance Criteria

- [ ] Keyboard keys scale smoothly with viewport size
- [ ] Mobile keyboard respects safe area insets
- [ ] Virtual keyboard detection works on iOS and Android
- [ ] Desktop keyboard positioned relative to board
- [ ] Key spacing consistent across all layouts
- [ ] All keys meet 44px touch target on mobile
- [ ] No overlap with game board or input area

---

### Phase 4: Hints & Notifications

**Objective**: Fix Daily Double hint indicator positioning and ensure consistent visibility.

#### Target Elements

1. Daily Double hint badge (🔍 next to player emoji)
2. Hint tile selection overlay
3. Notification toasts

#### Current Issues

- Hint badge positioning relative to leaderboard can shift
- Hint overlay z-index conflicts with panels
- Toast notifications can be obscured by keyboard

#### Implementation Strategy

**Step 1: Hint Badge Positioning**

In `components/leaderboard.css`:
```css
.player-emoji {
  position: relative;
}

.hint-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: calc(var(--tile-size) * 0.4);
  height: calc(var(--tile-size) * 0.4);
  font-size: calc(var(--tile-size) * 0.3);
  background: var(--correct-color);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-badge);
  pointer-events: none;
}
```

**Step 2: Hint Tile Overlay**

In `components/board.css`:
```css
.tile-hint-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(var(--correct-rgb), 0.3);
  border: 2px solid var(--correct-color);
  border-radius: 4px;
  z-index: var(--z-tile-overlay);
  pointer-events: none;
  animation: hint-pulse 1s ease-in-out infinite;
}

@keyframes hint-pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
```

**Step 3: Toast Notification Positioning**

Ensure toasts appear above keyboard:
```css
.toast-notification {
  position: fixed;
  top: calc(var(--tile-size) * 2);
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-toast);
  max-width: 80vw;
  padding: calc(var(--tile-size) * 0.3);
}

/* Mobile: Account for keyboard */
@media (max-width: 768px) {
  .toast-notification {
    bottom: calc(var(--keyboard-height, 200px) + var(--tile-size));
    top: auto;
  }
}
```

#### Tasks

- [ ] Fix hint badge positioning relative to player emoji
- [ ] Add hint tile overlay styling
- [ ] Update toast notification positioning to avoid keyboard
- [ ] Ensure hint elements respect z-index hierarchy
- [ ] Test hint visibility in all layout modes
- [ ] Verify hint badge scales with leaderboard

#### Acceptance Criteria

- [ ] Hint badge always visible next to player emoji
- [ ] Hint overlay clearly indicates selectable tiles
- [ ] Toast notifications never obscured by keyboard
- [ ] All hint elements scale with tile-size token
- [ ] Z-index hierarchy prevents conflicts
- [ ] Smooth animations on hint appearance

---

### Phase 5: Container & Spacing Consistency

**Objective**: Ensure consistent spacing and container constraints across all viewport sizes.

#### Target Areas

1. `#appContainer` - Main app wrapper
2. `#mainGrid` - Desktop grid layout
3. `#boardArea` - Board container
4. `#inputArea` - Input and button container
5. Overall padding and margins

#### Implementation Strategy

**Step 1: Use Existing Container Sizing**

Reference existing container sizing from `desktop-layout.css`:
```css
:root {
  /* Container max-width already defined in desktop-layout.css line 79 */
  /* #appContainer { max-width: 1600px; } */
  
  /* If tokenizing is needed, define in desktop-layout.css (not base.css) */
  /* --desktop-max-width: 1600px; */
  
  /* Use existing desktop spacing tokens */
  /* --desktop-content-padding: 16px (already defined) */
  /* --desktop-grid-gap: 20px (already defined) */
}
```

**Step 2: Responsive Spacing**

Update spacing across layouts:
```css
#appContainer {
  max-width: 1600px; /* Already defined in desktop-layout.css */
  padding: var(--desktop-content-padding);
  margin: 0 auto;
}

#mainGrid {
  width: 100%;
  margin: 0 auto;
  padding: var(--desktop-content-padding);
  gap: var(--desktop-grid-gap);
}

#boardArea {
  width: 100%;
  max-width: var(--board-width);
  margin: 0 auto;
}
```

**Step 3: Breakpoint-Specific Adjustments**

Fine-tune spacing at key breakpoints:
```css
@media (max-width: 375px) {
  :root {
    --app-padding: 8px;
    --panel-padding: 12px;
  }
}

@media (min-width: 1200px) {
  :root {
    --panel-gap: calc(var(--tile-size) * 0.4);
  }
}
```

#### Tasks

- [ ] Add container sizing tokens to `base.css`
- [ ] Update `#appContainer`, `#mainGrid`, `#boardArea` spacing
- [ ] Ensure consistent padding across all breakpoints
- [ ] Test container constraints at all viewport sizes
- [ ] Verify centering and alignment
- [ ] Check for unwanted horizontal scroll

#### Acceptance Criteria

- [ ] Consistent spacing using tokens across all files
- [ ] No hard-coded pixel values for spacing
- [ ] Container max-widths prevent content overflow
- [ ] Proper centering at all viewport sizes
- [ ] No horizontal scroll at any breakpoint
- [ ] Smooth spacing transitions between layouts

---

## Testing Strategy

### Manual Testing Matrix

| Element | Mobile (375px) | Tablet (768px) | Desktop (1024px) | Large (1440px) |
|---------|----------------|----------------|------------------|----------------|
| Submit Button | Touch target ≥44px | Proper spacing | Aligned with board | Scales correctly |
| Reset Button | Touch target ≥44px | Proper spacing | Aligned with board | Scales correctly |
| Options Button | No overlap | No overlap | Positioned correctly | Positioned correctly |
| Chat Notify | No overlap | No overlap | Positioned correctly | Positioned correctly |
| History Panel | Full overlay | Full overlay | Left sidebar | Left sidebar |
| Definition Panel | Full overlay | Full overlay | Right sidebar | Right sidebar |
| Chat Panel | Full overlay | Full overlay | Right sidebar | Right sidebar |
| Keyboard | Fixed bottom | Fixed bottom | Relative position | Relative position |
| Hint Badge | Visible | Visible | Visible | Visible |
| Toast Notifications | Above keyboard | Above keyboard | Top center | Top center |

### Automated Tests (Playwright)

Create test suite following existing naming pattern (e.g., `pr6-peripheral-ui.spec.js`):

```javascript
// Test button positioning
test('buttons do not overlap board at all viewports', async ({ page }) => {
  const viewports = [
    { width: 375, height: 667 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 }
  ];
  
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    
    const board = await page.locator('#board').boundingBox();
    const buttons = await page.locator('#optionsToggle, #chatNotify').all();
    
    for (const button of buttons) {
      const bbox = await button.boundingBox();
      // Ensure buttons don't overlap board
      expect(bbox.x >= board.x + board.width).toBeTruthy();
    }
  }
});

// Test panel positioning
test('panels positioned correctly in each layout mode', async ({ page }) => {
  // Mobile: panels are overlays
  await page.setViewportSize({ width: 375, height: 667 });
  await page.click('#menuHistory');
  const historyPanel = page.locator('#historyBox');
  await expect(historyPanel).toHaveCSS('position', 'fixed');
  
  // Desktop: panels in grid
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(historyPanel).toHaveCSS('position', 'relative');
});

// Test keyboard scaling
test('keyboard keys meet touch target requirements', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  
  const keys = await page.locator('.key').all();
  for (const key of keys) {
    const bbox = await key.boundingBox();
    expect(bbox.width).toBeGreaterThanOrEqual(44);
    expect(bbox.height).toBeGreaterThanOrEqual(44);
  }
});
```

### Visual Regression Tests

Use existing baseline snapshot system from `UI_SCALING_IMPROVEMENT_PLAN.md`:

- Capture screenshots at all breakpoints
- Compare button positions
- Verify panel layouts
- Check keyboard rendering
- Validate hint badge visibility

### Device Testing

**Mobile Devices:**
- iPhone SE (375×667)
- iPhone 12/13/14 (390×844)
- Samsung Galaxy S21 (360×800)
- iPad Mini (768×1024)

**Desktop Browsers:**
- Chrome 120+ (1920×1080)
- Firefox 120+ (1440×900)
- Safari 17+ (1280×720)
- Edge 120+ (1366×768)

---

## Implementation Order

### PR Sequence

**PR 1: Button Positioning & Sizing** (Prerequisite: None)
- Add button sizing tokens
- Refactor button positioning
- Ensure touch targets
- Test at all breakpoints

**PR 2: Panel Layout & Positioning** (Prerequisite: PR 1)
- Add panel sizing tokens
- Refactor desktop grid positioning
- Fix mobile overlay behavior
- Update z-index hierarchy

**PR 3: Keyboard Scaling** (Prerequisite: PR 1, PR 2)
- Add keyboard sizing tokens
- Update desktop keyboard layout
- Fix mobile keyboard positioning
- Implement virtual keyboard detection

**PR 4: Hints & Notifications** (Prerequisite: PR 2)
- Fix hint badge positioning
- Add hint overlay styling
- Update toast positioning

**PR 5: Container Consistency** (Prerequisite: All above)
- Add container sizing tokens
- Update spacing across layouts
- Final integration testing

**PR 6: Testing & Validation** (Prerequisite: All above)
- Add Playwright test suite
- Visual regression testing
- Device testing
- Documentation updates

---

## Success Criteria

### Functional Requirements

✅ **Buttons:**
- [ ] All buttons positioned correctly at all viewport sizes
- [ ] No overlap with board or other UI elements
- [ ] Touch targets ≥44px on mobile
- [ ] Consistent spacing and alignment

✅ **Panels:**
- [ ] Desktop panels use CSS Grid positioning
- [ ] Mobile panels use full-screen overlays
- [ ] Smooth transitions between layout modes
- [ ] No z-index conflicts

✅ **Keyboard:**
- [ ] Keys scale proportionally with viewport
- [ ] Mobile keyboard doesn't conflict with virtual keyboard
- [ ] Desktop keyboard positioned relative to board
- [ ] All keys meet touch target requirements

✅ **Hints & Notifications:**
- [ ] Hint badge always visible
- [ ] Toast notifications never obscured
- [ ] Hint overlays clearly indicate selection

✅ **Overall:**
- [ ] Consistent spacing using tokens
- [ ] No horizontal scroll at any viewport
- [ ] Smooth scaling across all breakpoints
- [ ] All elements tied to board scaling system

### Performance Requirements

- [ ] No layout thrashing during resize
- [ ] Smooth 60fps transitions
- [ ] CSS file changes <5KB per file
- [ ] No JavaScript positioning (CSS-only)

### Code Quality

- [ ] All spacing uses CSS custom properties
- [ ] No hard-coded pixel values (use tokens)
- [ ] Clear z-index hierarchy
- [ ] Comprehensive code comments
- [ ] Updated documentation

---

## Integration with Existing Systems

### Dependencies

This plan builds on:
1. **UI_SCALING_IMPROVEMENT_PLAN.md** - Board scaling tokens and system
2. **LAYOUT_REFACTORING_PLAN.md** - Layout mode system and grid structure
3. Existing CSS token system (`--tile-size`, `--ui-scale`, etc.)

### Token Compatibility

All new tokens extend the existing system:
- Use existing `--tile-size` as base unit
- Reference existing `--ui-scale` for proportional scaling
- Leverage existing breakpoints (768px, 1024px, etc.)
- Build on existing z-index values

### File Changes

**Files to Modify:**
- `frontend/static/css/base.css` - Reference and use existing sizing tokens
- `frontend/static/css/components/panels.css` - Refactor `#optionsToggle` and `#chatNotify` positioning, update panel layout
- `frontend/static/css/components/buttons.css` - Refactor button positioning (for buttons defined here)
- `frontend/static/css/components/keyboard.css` - Fix keyboard scaling using existing tokens
- `frontend/static/css/components/leaderboard.css` - Hint badge positioning
- `frontend/static/css/mobile-layout.css` - Mobile-specific adjustments
- `frontend/static/css/desktop-layout.css` - Desktop-specific adjustments, refine existing grid
- `frontend/static/css/z-index.css` - Reference existing hierarchy (clarify in comments if needed)

**No New Files Required** - All changes integrate into existing CSS architecture

---

## Risk Mitigation

### Risk 1: Breaking Board Scaling
- **Mitigation**: Use existing tokens, don't modify board CSS
- **Rollback**: Revert individual PRs without affecting board

### Risk 2: Layout Mode Conflicts
- **Mitigation**: Test layout transitions thoroughly
- **Rollback**: Each PR is independently revertable

### Risk 3: Z-Index Conflicts
- **Mitigation**: Document clear hierarchy, test overlapping scenarios
- **Rollback**: Revert z-index.css changes

### Risk 4: Touch Target Regressions
- **Mitigation**: Automated testing for 44px minimum
- **Rollback**: Quick fix via CSS variable adjustment

---

## Timeline Estimate

| Phase | Estimated Time | PRs |
|-------|---------------|-----|
| Phase 1: Buttons | 4 hours | 1 |
| Phase 2: Panels | 6 hours | 1 |
| Phase 3: Keyboard | 5 hours | 1 |
| Phase 4: Hints | 3 hours | 1 |
| Phase 5: Containers | 3 hours | 1 |
| Phase 6: Testing | 4 hours | 1 |
| **Total** | **25 hours** | **6 PRs** |

---

## Future Enhancements

Post-implementation improvements to consider:

1. **Adaptive Keyboard**: Hide on-screen keyboard when physical keyboard detected
2. **Panel Resize**: Allow users to resize desktop panels
3. **Keyboard Shortcuts**: Add keyboard navigation for all UI elements
4. **Gesture Controls**: Swipe panels on mobile
5. **Advanced Hints**: Animated hint selection with preview
6. **Notification Center**: Consolidated toast system with history

---

## Appendix

### A. Current CSS Token Reference

Existing tokens to leverage (from `frontend/static/css/base.css`):
```css
/* Tile and board sizing */
--tile-size: 56px;  /* Base value, scales via clamp() in layout files */
--board-width: calc(var(--tile-size) * 5 + var(--tile-gap) * 4);
--tile-gap: var(--gap);
--gap: 10px;

/* Keyboard sizing */
--key-h: 44px;
--kb-gap: 8px;
--key-font: 16px;

/* Semantic scale tokens (for sizing tiers) */
--scale-xxs: 0.75;   /* Extra extra small */
--scale-xs: 0.875;   /* Extra small */
--scale-sm: 1;       /* Small */
--scale-md: 1.125;   /* Medium - baseline */
--scale-lg: 1.25;    /* Large - prominent */

/* Uniform button sizing */
--uniform-button-width: max(calc(var(--tile-size) * var(--scale-lg)), var(--min-touch-target));
--uniform-button-height: max(calc(var(--tile-size) * var(--scale-sm)), var(--min-touch-target));

/* Touch targets */
--min-touch-target: 44px;

/* Desktop panel sizing (from desktop-layout.css) */
--desktop-panel-width: 240px;  /* Base, increases to 280px at 1200px+ */
--desktop-grid-gap: 20px;
--desktop-content-padding: 16px;
```

### B. Z-Index Hierarchy

Current hierarchy should align with `frontend/static/css/z-index.css` (reference existing tokens):
```css
/* Board-level overlays (also used for tile overlays) */
--z-board-overlay: 6;

/* UI Components */
--z-keyboard: 10;
--z-ui-component: 15;

/* Panels */
--z-panel-base: 20;
--z-panel-content: 25;
--z-panel-overlay: 30;        /* Mobile panel overlays */
--z-panel-notification: 30;   /* Chat notification badge */

/* Interactive Elements */
--z-options-menu: 40;

/* Modals and Popups */
--z-modal-backdrop: 60;       /* Backdrop behind modal content */
--z-modal-content: 65;        /* Modal content above all panels */
--z-popup-message: 70;        /* Lightweight toasts / popup messages */

/* System Overlays */
--z-system-message: 85;       /* Higher-priority messages / alerts */

/* Note: There is no dedicated --z-badge token; badges should reuse an appropriate
   existing level (typically --z-popup-message or --z-system-message). */
```

### C. Breakpoint Reference

Standard breakpoints (do not modify):
- **≤375px**: Ultra-small mobile
- **≤600px**: Compact/small mobile (sub-range within mobile layout)
- **601-900px**: Tablets / medium-width viewports
- **≤768px**: Mobile layout boundary (CSS mobile layout)
- **≥769px**: Desktop layout boundary (CSS desktop layout)
- **>900px**: Wide desktop content range
- **≥1200px**: Large desktop
- **≥1440px**: Extra-large desktop / wide monitors

Note: "Light/Medium/Full mode" terminology references a legacy system. The primary layout switch occurs at 768px/769px between mobile-layout.css and desktop-layout.css.

### D. Touch Target Guidelines

WCAG 2.1 Level AAA guidelines:
- Minimum touch target: 44×44 CSS pixels
- Minimum spacing: 8px between targets
- Visual feedback on interaction
- Clear focus indicators

---

## Conclusion

This plan provides a comprehensive roadmap for fixing peripheral UI element scaling and positioning issues in WordSquad. By extending the existing board scaling system with new tokens for buttons, panels, keyboard, and hints, we ensure consistent and proportional scaling across all viewport sizes.

The phased approach allows for incremental implementation and testing, with each PR independently reviewable and revertable. All changes integrate seamlessly with the existing CSS architecture and token system established in previous planning documents.

**Key Outcomes:**
- ✅ No overlaps or positioning conflicts
- ✅ Consistent scaling tied to board system
- ✅ Mobile-optimized touch targets
- ✅ Smooth transitions between layout modes
- ✅ Clean, maintainable CSS using tokens
- ✅ Comprehensive testing coverage

Each phase is designed for GitHub Copilot Coding Agent implementation with clear tasks, acceptance criteria, and success metrics.
