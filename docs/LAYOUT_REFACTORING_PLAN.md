# WordSquad Layout Refactoring Plan

## Executive Summary

This document provides a comprehensive plan to refactor the WordSquad layout system from a hybrid CSS Grid approach to two completely separate and optimized layouts: one for mobile devices and one for desktop devices. This plan is optimized for GitHub Copilot Coding Agent to execute in future PRs.

## Problem Statement

### Current State Issues

The current layout system uses a hybrid approach that attempts to handle all viewport sizes with:
- A single CSS Grid system (`#mainGrid`) with complex media queries
- Three responsive modes (light/medium/full) managed by JavaScript
- Multiple CSS files with overlapping responsibilities:
  - `layout.css` - CSS Grid positioning
  - `responsive.css` - Media query adaptations
  - `modern-responsive.css` - Modern CSS features (container queries, viewport units)
- JavaScript layout mode management in `utils.js` (`applyLayoutMode()`)
- Complex conditional logic for panel positioning (grid vs overlay)

### Key Pain Points

1. **Complexity**: The hybrid approach tries to use CSS Grid for both mobile and desktop, leading to complex override chains
2. **Maintainability**: Changes to one breakpoint often affect others unexpectedly
3. **Performance**: Excessive media query evaluations and layout recalculations
4. **Debugging**: Difficult to trace why specific layouts appear on certain devices
5. **Scaling**: Edge cases at breakpoint boundaries (900px, 600px) cause layout jumping
6. **Mixed paradigms**: Container queries, viewport units, and traditional media queries compete

## Goal

Create two completely separate, purpose-built layout systems:

1. **Mobile Layout** (≤768px): Touch-optimized, vertical stacking, overlay panels
2. **Desktop Layout** (>768px): Mouse-optimized, multi-panel grid, side-by-side content

**Key Decision**: Use **768px as the single breakpoint** between mobile and desktop layouts (standard tablet/desktop boundary).

## Architecture Overview

### New Layout Philosophy

```
┌─────────────────────────────────────────────┐
│         Single Breakpoint: 768px            │
├──────────────────────┬──────────────────────┤
│   Mobile Layout      │   Desktop Layout     │
│   (≤768px)          │   (>768px)           │
├──────────────────────┼──────────────────────┤
│ - Flexbox-based      │ - CSS Grid-based     │
│ - Vertical stacking  │ - Horizontal panels  │
│ - Full-screen panels │ - Side-by-side view  │
│ - Touch-optimized    │ - Mouse-optimized    │
│ - No grid areas      │ - Grid template areas│
└──────────────────────┴──────────────────────┘
```

## Detailed Implementation Plan

### Phase 1: File Structure Reorganization

**Objective**: Separate mobile and desktop CSS into distinct, non-overlapping files.

#### Tasks

1. **Create new CSS files**:
   ```
   frontend/static/css/
   ├── mobile-layout.css      (NEW - Mobile-only layout system)
   ├── desktop-layout.css     (NEW - Desktop-only layout system)
   ├── shared-base.css        (NEW - Common styles for both)
   └── components/            (Keep existing component styles)
       ├── board.css
       ├── keyboard.css
       ├── panels.css
       ├── buttons.css
       ├── leaderboard.css
       └── modals.css
   ```

2. **File loading strategy in game.html**:
   ```html
   <!-- Shared foundation -->
   <link rel="stylesheet" href="static/css/theme.css">
   <link rel="stylesheet" href="static/css/z-index.css">
   <link rel="stylesheet" href="static/css/shared-base.css">
   
   <!-- Component styles (work on both layouts) -->
   <link rel="stylesheet" href="static/css/components/board.css">
   <link rel="stylesheet" href="static/css/components/keyboard.css">
   <link rel="stylesheet" href="static/css/components/panels.css">
   <link rel="stylesheet" href="static/css/components/buttons.css">
   <link rel="stylesheet" href="static/css/components/leaderboard.css">
   <link rel="stylesheet" href="static/css/components/modals.css">
   
   <!-- Layout-specific styles (loaded conditionally) -->
   <link rel="stylesheet" href="static/css/mobile-layout.css" media="(max-width: 768px)">
   <link rel="stylesheet" href="static/css/desktop-layout.css" media="(min-width: 769px)">
   
   <!-- Animations (shared) -->
   <link rel="stylesheet" href="static/css/animations.css">
   ```

3. **Deprecate old files**:
   - Mark `layout.css` for removal
   - Mark `responsive.css` for removal
   - Mark `modern-responsive.css` for removal

### Phase 2: Mobile Layout Implementation (≤768px)

**Objective**: Create a simple, touch-optimized vertical layout using Flexbox.

#### HTML Structure for Mobile

```html
<body class="mobile-layout">
  <div id="appContainer">
    <!-- Mobile header (always visible) -->
    <div id="mobileHeader">
      <button id="mobileMenuToggle">☰</button>
      <div id="mobileLobbyCode"></div>
      <div id="mobileLeaderboard"></div>
    </div>
    
    <!-- Main content (vertical flex) -->
    <div id="mobileContent">
      <div id="titleBar"></div>
      <div id="boardArea"></div>
      <div id="inputArea"></div>
      <div id="keyboard"></div>
    </div>
    
    <!-- Mobile panels (fixed overlays) -->
    <div id="historyPanel" class="mobile-panel"></div>
    <div id="definitionPanel" class="mobile-panel"></div>
    <div id="chatPanel" class="mobile-panel"></div>
    
    <!-- Mobile menu -->
    <div id="mobileMenu"></div>
  </div>
</body>
```

#### CSS Architecture: mobile-layout.css

```css
/* ===================================
   MOBILE LAYOUT - Flexbox-based
   Target: ≤768px
   =================================== */

@media (max-width: 768px) {
  /* Container */
  #appContainer {
    display: flex;
    flex-direction: column;
    height: 100dvh; /* Dynamic viewport height */
    width: 100vw;
    overflow: hidden;
  }
  
  /* Header - Fixed at top */
  #mobileHeader {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    background: var(--bg-color);
    z-index: var(--z-header);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  
  /* Main content area - Scrollable */
  #mobileContent {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 72px 12px 12px; /* Top padding for fixed header */
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
  }
  
  /* Board */
  #boardArea {
    width: 100%;
    max-width: 360px;
    display: flex;
    justify-content: center;
    position: relative;
  }
  
  #board {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: clamp(4px, 2vw, 8px);
    width: 100%;
    max-width: 100%;
  }
  
  /* Keyboard - Fixed at bottom */
  #keyboard {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--bg-color);
    padding: 8px;
    padding-bottom: max(8px, env(safe-area-inset-bottom));
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
    z-index: var(--z-keyboard);
  }
  
  /* Mobile panels - Full-screen overlays */
  .mobile-panel {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--bg-color);
    z-index: var(--z-panel-overlay);
    display: none; /* Hidden by default */
    flex-direction: column;
    padding: 60px 16px 16px;
    overflow-y: auto;
    transform: translateY(100%);
    transition: transform 0.3s ease-in-out;
  }
  
  .mobile-panel.active {
    display: flex;
    transform: translateY(0);
  }
  
  /* Hide desktop-only elements */
  #mainGrid,
  #stampContainer,
  #optionsToggle,
  #playerCount {
    display: none !important;
  }
}

/* Sub-breakpoints for very small devices */
@media (max-width: 375px) {
  #board {
    gap: clamp(3px, 1.5vw, 6px);
  }
  
  .tile {
    font-size: clamp(14px, 4vw, 18px);
  }
}
```

#### Key Features

1. **Flexbox-based layout**: Simple vertical stacking, no grid complexity
2. **Fixed header and keyboard**: Always accessible
3. **Scrollable content**: Main game area scrolls naturally
4. **Full-screen panels**: Clean overlay experience
5. **Touch-optimized**: Larger tap targets, swipe-friendly
6. **Safe area insets**: Respects notches and device UI

#### Implementation Tasks

1. Create `mobile-layout.css` with complete mobile styling
2. Update tile sizing for mobile (min 44px for touch targets)
3. Implement mobile header component
4. Create mobile panel transition animations
5. Add mobile menu system
6. Handle keyboard visibility with visual viewport API
7. Test on various mobile devices (iOS Safari, Chrome Android)

### Phase 3: Desktop Layout Implementation (>768px)

**Objective**: Create a powerful multi-panel layout using CSS Grid.

#### HTML Structure for Desktop

```html
<body class="desktop-layout">
  <div id="appContainer">
    <!-- Desktop header -->
    <div id="desktopHeader">
      <div id="lobbyCode"></div>
      <div id="leaderboard"></div>
      <div id="hostControls"></div>
    </div>
    
    <!-- CSS Grid main layout -->
    <div id="desktopGrid">
      <!-- Left sidebar -->
      <aside id="leftPanel">
        <div id="historyPanel"></div>
      </aside>
      
      <!-- Center game area -->
      <main id="centerPanel">
        <div id="titleBar"></div>
        <div id="boardArea"></div>
        <div id="inputArea"></div>
        <div id="keyboard"></div>
      </main>
      
      <!-- Right sidebar -->
      <aside id="rightPanel">
        <div id="definitionPanel"></div>
        <div id="chatPanel"></div>
      </aside>
    </div>
  </div>
</body>
```

#### CSS Architecture: desktop-layout.css

```css
/* ===================================
   DESKTOP LAYOUT - CSS Grid-based
   Target: >768px
   =================================== */

@media (min-width: 769px) {
  /* Container */
  #appContainer {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
  }
  
  /* Header - Fixed at top */
  #desktopHeader {
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    background: var(--bg-color);
    border-bottom: 1px solid var(--border-color);
  }
  
  /* Main grid - Three columns */
  #desktopGrid {
    display: grid;
    grid-template-columns: 
      minmax(240px, 280px)  /* Left sidebar */
      minmax(400px, 800px)  /* Center panel */
      minmax(240px, 280px); /* Right sidebar */
    grid-template-rows: 1fr;
    gap: 24px;
    padding: 24px;
    flex: 1;
    overflow: hidden;
    justify-content: center;
  }
  
  /* Left panel */
  #leftPanel {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    gap: 16px;
  }
  
  /* Center panel */
  #centerPanel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    overflow-y: auto;
  }
  
  /* Right panel */
  #rightPanel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow-y: auto;
  }
  
  /* Board */
  #boardArea {
    width: 100%;
    max-width: 500px;
    display: flex;
    justify-content: center;
  }
  
  #board {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
  }
  
  /* Panels */
  #historyPanel,
  #definitionPanel,
  #chatPanel {
    background: var(--bg-color);
    border-radius: 16px;
    padding: 20px;
    box-shadow: var(--neumorphic-shadow);
  }
  
  #chatPanel {
    display: flex;
    flex-direction: column;
    min-height: 300px;
  }
  
  /* Panel visibility */
  #leftPanel:not(.visible) {
    display: none;
  }
  
  #rightPanel .panel:not(.visible) {
    display: none;
  }
  
  /* Hide mobile-only elements */
  #mobileHeader,
  #mobileMenuToggle,
  .mobile-panel {
    display: none !important;
  }
}

/* Large desktop optimization */
@media (min-width: 1400px) {
  #desktopGrid {
    grid-template-columns: 280px 900px 280px;
    gap: 32px;
  }
  
  #board {
    gap: 10px;
  }
  
  .tile {
    font-size: 28px;
  }
}

/* Ultra-wide displays */
@media (min-width: 1920px) {
  #desktopGrid {
    max-width: 1800px;
    margin: 0 auto;
  }
}
```

#### Key Features

1. **CSS Grid layout**: Clean three-column structure
2. **Fixed proportions**: Sidebars and center maintain good ratios
3. **Independent scrolling**: Each panel scrolls separately
4. **Neumorphic styling**: Premium desktop appearance
5. **Responsive within desktop**: Adapts from 769px to ultra-wide
6. **Panel visibility**: Clean show/hide without position changes

#### Implementation Tasks

1. Create `desktop-layout.css` with complete desktop styling
2. Implement three-column grid with proper constraints
3. Handle panel visibility (collapsible sidebars)
4. Add panel resize animations
5. Optimize for large screens (1400px+, 1920px+)
6. Test on various desktop resolutions
7. Ensure keyboard shortcuts work properly

### Phase 4: JavaScript Simplification

**Objective**: Remove complex layout mode logic and use simple media query detection.

#### Current State (to be removed)

```javascript
// utils.js - Complex layout mode management
export function applyLayoutMode() {
  // 40+ lines of complex calculations
  // Panel popup logic
  // History panel positioning
  // Mode switching
}
```

#### New State (simplified)

```javascript
// layoutManager.js (NEW)

/**
 * Simple layout manager - delegates to CSS
 */
export class LayoutManager {
  constructor() {
    this.breakpoint = 768;
    this.currentLayout = this.detectLayout();
    this.setupListeners();
  }
  
  detectLayout() {
    return window.innerWidth <= this.breakpoint ? 'mobile' : 'desktop';
  }
  
  setupListeners() {
    // Use matchMedia for efficient breakpoint detection
    this.mediaQuery = window.matchMedia(`(max-width: ${this.breakpoint}px)`);
    this.mediaQuery.addEventListener('change', (e) => {
      this.handleLayoutChange(e.matches ? 'mobile' : 'desktop');
    });
  }
  
  handleLayoutChange(newLayout) {
    if (newLayout === this.currentLayout) return;
    
    this.currentLayout = newLayout;
    document.body.classList.toggle('mobile-layout', newLayout === 'mobile');
    document.body.classList.toggle('desktop-layout', newLayout === 'desktop');
    
    // Dispatch event for other components
    document.dispatchEvent(new CustomEvent('layoutchange', {
      detail: { layout: newLayout }
    }));
  }
  
  isMobile() {
    return this.currentLayout === 'mobile';
  }
  
  isDesktop() {
    return this.currentLayout === 'desktop';
  }
}
```

#### Implementation Tasks

1. Create new `layoutManager.js` with simplified logic
2. Remove `applyLayoutMode()` from `utils.js`
3. Update `appInitializer.js` to use new LayoutManager
4. Remove all layout mode calculations and conditionals
5. Update panel managers to use layout events
6. Remove unnecessary transform calculations
7. Simplify `enhancedScaling.js` to focus only on tile sizing

### Phase 5: Component Updates

**Objective**: Update component files to work with both layout systems.

#### Components to Update

1. **board.css**: Ensure tiles work on both layouts
   - Mobile: Touch-friendly sizing (min 44px)
   - Desktop: Precision sizing (flexible)
   
2. **keyboard.css**: Different positioning strategies
   - Mobile: Fixed at bottom
   - Desktop: Inline in center panel
   
3. **panels.css**: Different panel behaviors
   - Mobile: Full-screen overlays with slide-in animation
   - Desktop: Sidebar panels with show/hide
   
4. **leaderboard.css**: Different placements
   - Mobile: Compact horizontal scroll in header
   - Desktop: Full list in header
   
5. **modals.css**: Shared modal system
   - Works the same on both layouts
   - Center of viewport
   - Backdrop blur

#### Implementation Strategy

Use CSS custom properties and scoped media queries:

```css
/* board.css - Component adapts to layout */

/* Base styles (shared) */
.tile {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  border-radius: 4px;
  transition: all 0.3s ease;
}

/* Mobile specific */
@media (max-width: 768px) {
  .tile {
    width: clamp(44px, 15vw, 60px);
    height: clamp(44px, 15vw, 60px);
    font-size: clamp(16px, 5vw, 24px);
  }
}

/* Desktop specific */
@media (min-width: 769px) {
  .tile {
    width: clamp(50px, 4vw, 80px);
    height: clamp(50px, 4vw, 80px);
    font-size: clamp(18px, 2vw, 32px);
  }
}
```

#### Implementation Tasks

1. Update each component CSS with layout-specific rules
2. Remove conflicting styles from old files
3. Test each component on both layouts
4. Ensure smooth transitions at breakpoint
5. Verify accessibility on both layouts

### Phase 6: Testing Strategy

**Objective**: Comprehensive testing of both layouts.

#### Test Matrix

| Test Case | Mobile (≤768px) | Desktop (>768px) |
|-----------|----------------|------------------|
| Initial render | ✓ Vertical stack | ✓ Three columns |
| Panel visibility | ✓ Full-screen overlay | ✓ Sidebar |
| Panel transitions | ✓ Slide up/down | ✓ Fade in/out |
| Keyboard layout | ✓ Fixed bottom | ✓ Inline |
| Board scaling | ✓ Touch targets | ✓ Precision |
| Orientation change | ✓ Landscape mode | ✓ Window resize |
| Leaderboard | ✓ Horizontal scroll | ✓ Full list |
| Modals | ✓ Center screen | ✓ Center screen |
| Chat input | ✓ Above keyboard | ✓ In panel |
| History | ✓ Full overlay | ✓ Left sidebar |

#### Devices to Test

**Mobile**:
- iPhone SE (375px)
- iPhone 12/13/14 (390px)
- iPhone 14 Pro Max (430px)
- Samsung Galaxy S21 (360px)
- iPad Mini (768px portrait)

**Desktop**:
- Small laptop (1366x768)
- Standard laptop (1920x1080)
- Large desktop (2560x1440)
- Ultra-wide (3440x1440)

#### Automated Tests

Create Playwright tests for:
1. Layout switching at 768px breakpoint
2. Panel visibility toggling
3. Keyboard positioning
4. Board tile sizing
5. Responsive behavior during resize

#### Implementation Tasks

1. Create test plan document
2. Write Playwright test suite for layout
3. Manual test on real devices
4. Create visual regression tests
5. Document any edge cases found
6. Create browser compatibility matrix

### Phase 7: Migration Plan

**Objective**: Safely transition from old to new layout system.

#### Step-by-Step Migration

1. **Preparation** (1 PR):
   - Create new file structure
   - Add new CSS files (empty, with TODOs)
   - Add new layoutManager.js
   - No functional changes

2. **Mobile Layout** (1 PR):
   - Implement complete mobile-layout.css
   - Update HTML for mobile compatibility
   - Add mobile-specific JavaScript
   - Test thoroughly on mobile devices
   - Keep old system as fallback

3. **Desktop Layout** (1 PR):
   - Implement complete desktop-layout.css
   - Update HTML for desktop compatibility
   - Add desktop-specific JavaScript
   - Test thoroughly on desktop browsers
   - Keep old system as fallback

4. **JavaScript Migration** (1 PR):
   - Activate new LayoutManager
   - Remove applyLayoutMode logic
   - Update all components to use new system
   - Run full test suite

5. **Cleanup** (1 PR):
   - Remove old CSS files (layout.css, responsive.css, modern-responsive.css)
   - Remove old JavaScript logic
   - Update documentation
   - Final testing

#### Rollback Strategy

If issues are discovered:
1. Revert layoutManager activation
2. Re-enable applyLayoutMode()
3. Use old CSS files as fallback
4. Each PR is independently revertable

#### Implementation Tasks

1. Create migration checklist
2. Set up feature flag for new layout system
3. Create A/B test configuration (if needed)
4. Prepare rollback scripts
5. Document migration progress

## File-by-File Implementation Guide

### Files to Create

1. **frontend/static/css/mobile-layout.css** (NEW)
   - Purpose: Complete mobile layout system
   - Size estimate: ~500 lines
   - Dependencies: theme.css, z-index.css
   - Media query: `@media (max-width: 768px)`

2. **frontend/static/css/desktop-layout.css** (NEW)
   - Purpose: Complete desktop layout system
   - Size estimate: ~600 lines
   - Dependencies: theme.css, z-index.css
   - Media query: `@media (min-width: 769px)`

3. **frontend/static/css/shared-base.css** (NEW)
   - Purpose: Common styles for both layouts
   - Size estimate: ~200 lines
   - Contains: Typography, colors, base element styles

4. **frontend/static/js/layoutManager.js** (NEW)
   - Purpose: Simple layout detection and management
   - Size estimate: ~150 lines
   - Exports: LayoutManager class

### Files to Modify

1. **frontend/game.html**
   - Update: CSS file loading order
   - Update: Add layout-specific class to body
   - Lines changed: ~20

2. **frontend/static/js/utils.js**
   - Remove: applyLayoutMode() function
   - Remove: Complex layout calculations
   - Lines removed: ~60

3. **frontend/static/js/appInitializer.js**
   - Update: Import new LayoutManager
   - Update: Initialize layout system
   - Lines changed: ~15

4. **frontend/static/js/panelManager.js**
   - Update: Use layout events instead of mode detection
   - Update: Simplify panel positioning logic
   - Lines changed: ~40

5. **frontend/static/css/components/*.css**
   - Update: Add layout-specific rules
   - Update: Remove conflicting old styles
   - Lines changed: ~100 per file

### Files to Delete (in cleanup PR)

1. **frontend/static/css/layout.css** (DELETE)
2. **frontend/static/css/responsive.css** (DELETE)
3. **frontend/static/css/modern-responsive.css** (DELETE)

## Success Criteria

### Functional Requirements

✅ Mobile layout (≤768px):
- [ ] Vertical stacking works correctly
- [ ] Fixed header and keyboard
- [ ] Full-screen panel overlays
- [ ] Touch targets ≥44px
- [ ] Smooth animations
- [ ] Works on all mobile browsers

✅ Desktop layout (>768px):
- [ ] Three-column grid layout
- [ ] Sidebar panels visible
- [ ] Independent panel scrolling
- [ ] Proper proportions maintained
- [ ] Works on all desktop browsers
- [ ] Responsive to window resizing

✅ Transition:
- [ ] Smooth layout switch at 768px
- [ ] No content jumping
- [ ] Panel states preserved
- [ ] No JavaScript errors

### Performance Requirements

- [ ] Layout switch occurs in <100ms
- [ ] No layout thrashing during resize
- [ ] CSS file sizes <50KB each (mobile/desktop)
- [ ] No unnecessary JavaScript calculations
- [ ] Smooth 60fps animations

### Code Quality Requirements

- [ ] No CSS conflicts between layouts
- [ ] Clear separation of concerns
- [ ] Comprehensive code comments
- [ ] Updated documentation
- [ ] All tests passing
- [ ] No console warnings or errors

## Timeline Estimate

| Phase | Estimated Time | PRs |
|-------|---------------|-----|
| Phase 1: File Structure | 2 hours | 1 |
| Phase 2: Mobile Layout | 8 hours | 1-2 |
| Phase 3: Desktop Layout | 8 hours | 1-2 |
| Phase 4: JavaScript | 4 hours | 1 |
| Phase 5: Components | 6 hours | 1-2 |
| Phase 6: Testing | 8 hours | 1 |
| Phase 7: Migration | 4 hours | 1 |
| **Total** | **40 hours** | **8-10 PRs** |

## Risks and Mitigations

### Risk 1: Breaking Existing Functionality
- **Impact**: High
- **Probability**: Medium
- **Mitigation**: Implement incrementally, maintain old system as fallback, comprehensive testing

### Risk 2: Browser Compatibility Issues
- **Impact**: Medium
- **Probability**: Low
- **Mitigation**: Test on all major browsers, use progressive enhancement

### Risk 3: Performance Regression
- **Impact**: Medium
- **Probability**: Low
- **Mitigation**: Performance testing, use efficient CSS selectors, minimize JavaScript

### Risk 4: User Confusion During Transition
- **Impact**: Low
- **Probability**: Low
- **Mitigation**: Make transition seamless, no UI changes visible to users

## Future Considerations

### Post-Refactoring Enhancements

1. **Tablet-specific layout** (optional):
   - Add middle breakpoint at 1024px
   - Optimize for iPad Pro and large tablets
   - Hybrid features (touch + precision)

2. **Responsive images**:
   - Use `<picture>` for different layouts
   - Optimize asset loading per device

3. **Advanced animations**:
   - Layout-specific motion design
   - Gesture controls on mobile
   - Keyboard shortcuts on desktop

4. **Accessibility improvements**:
   - Layout-specific ARIA patterns
   - Optimized screen reader experience
   - Keyboard navigation paths

## Appendix

### A. Current CSS File Analysis

**layout.css** (559 lines):
- Grid template definitions
- Panel positioning logic
- Media query breakpoints at 600px, 900px, 1551px
- Complex conditional grid templates
- **Conclusion**: Too complex, needs replacement

**responsive.css** (619 lines):
- Three-mode system documentation
- Light/Medium/Full mode adaptations
- Tile sizing calculations
- Panel overlay logic
- **Conclusion**: Mixing concerns, needs simplification

**modern-responsive.css** (237 lines):
- Container queries
- Viewport units (dvh, svh, lvh)
- Fluid typography (clamp)
- Modern CSS features
- **Conclusion**: Good concepts, but applied to wrong architecture

### B. Breakpoint Analysis

Current system uses 4 major breakpoints:
- 300px (ultra-small)
- 400px (extra-small)
- 600px (mobile → medium)
- 900px (medium → full)
- 1200px (large desktop)
- 1551px (ultra-wide)

New system uses 1 major breakpoint:
- **768px (mobile ↔ desktop)**

Sub-breakpoints within each layout:
- Mobile: 375px, 430px (device-specific)
- Desktop: 1024px, 1440px, 1920px (size optimizations)

### C. Component Dependencies

```
┌─────────────────┐
│   theme.css     │ ← Colors, variables
│   z-index.css   │ ← Layering
└────────┬────────┘
         │
    ┌────┴─────┐
    │          │
┌───▼──────┐ ┌▼────────────┐
│ mobile-  │ │ desktop-    │
│ layout   │ │ layout      │
└────┬─────┘ └──┬──────────┘
     │          │
     └────┬─────┘
          │
    ┌─────▼──────┐
    │ Components │ ← board, keyboard, panels, etc.
    └────────────┘
```

### D. Testing Checklist Template

```markdown
## Layout Testing Checklist

### Mobile (≤768px)
- [ ] iPhone SE (375px) - Portrait
- [ ] iPhone SE (667px) - Landscape
- [ ] iPhone 14 (390px) - Portrait
- [ ] iPhone 14 (844px) - Landscape
- [ ] iPad Mini (768px) - Portrait
- [ ] Samsung Galaxy (360px) - Portrait

### Desktop (>768px)
- [ ] Small laptop (1366x768)
- [ ] Standard desktop (1920x1080)
- [ ] Large monitor (2560x1440)
- [ ] Ultra-wide (3440x1440)

### Features to Test (Both)
- [ ] Panel visibility toggle
- [ ] Board tile rendering
- [ ] Keyboard functionality
- [ ] Input focus handling
- [ ] Chat scrolling
- [ ] History display
- [ ] Leaderboard display
- [ ] Modal dialogs
- [ ] Theme switching
- [ ] Window resize behavior
- [ ] Orientation change
- [ ] Panel animations

### Browsers
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Safari iOS (latest)
- [ ] Chrome Android (latest)
```

### E. CSS Architecture Principles

1. **Separation of Concerns**:
   - Layout CSS handles structure only
   - Component CSS handles appearance
   - Theme CSS handles colors/variables

2. **Mobile-First (within each layout)**:
   - Start with smallest sizes
   - Add enhancements for larger sizes
   - Use min-width for sub-breakpoints

3. **Progressive Enhancement**:
   - Base layout works everywhere
   - Add modern features conditionally
   - Fallbacks for older browsers

4. **Performance**:
   - Minimize reflows and repaints
   - Use transforms for animations
   - Avoid layout thrashing
   - Efficient selectors

5. **Maintainability**:
   - Clear naming conventions
   - Comprehensive comments
   - Logical file organization
   - No magic numbers (use CSS variables)

### F. Implementation Order Rationale

The suggested order prioritizes risk reduction:

1. **File structure first**: Establishes new architecture without breaking anything
2. **Mobile layout second**: Simpler than desktop, tests new approach
3. **Desktop layout third**: More complex, benefits from mobile learnings
4. **JavaScript fourth**: Relies on CSS being complete
5. **Components fifth**: Needs both layouts working
6. **Testing sixth**: Validates everything
7. **Migration last**: Final cleanup when confident

## Conclusion

This plan provides a complete roadmap for transitioning WordSquad from a complex hybrid layout system to two clean, purpose-built layouts. By following this plan, future PRs can be implemented systematically with clear goals, success criteria, and rollback strategies.

The new architecture will be:
- **Simpler**: One breakpoint instead of multiple
- **Faster**: Less JavaScript, more efficient CSS
- **Maintainable**: Clear separation between mobile and desktop
- **Scalable**: Easy to add features to each layout
- **Testable**: Clear test matrices for each layout

Each phase is designed to be implemented by GitHub Copilot with minimal human intervention, assuming the agent has access to this plan and the existing codebase.
