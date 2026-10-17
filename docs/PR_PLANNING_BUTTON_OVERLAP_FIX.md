# PR Planning: Fix Overlapping Buttons on Gameboard

## Overview

This document provides a comprehensive plan for entry-level software engineers to fix overlapping button issues on the WordSquad gameboard. The plan is divided into small, manageable PRs with clear acceptance criteria and testing requirements.

## Problem Statement

Currently, the gameboard has three control buttons that can overlap with each other or with game tiles, especially on smaller mobile devices:

1. **Mobile Menu Toggle** (`#mobileMenuToggle`) - Top-left corner on mobile
2. **Options Toggle** (`#optionsToggle`) - Top-right corner
3. **Chat Notify** (`#chatNotify`) - Bottom-right corner

### Current Implementation

- **Location**: Buttons are positioned absolutely within `#boardArea` container
- **Sizing**: Buttons scale dynamically based on `--tile-size` and `--scale-md` CSS variables
- **Positioning**: Uses `--mobile-board-padding` (8px) and `--desktop-content-padding` (16px)
- **Files Involved**:
  - `frontend/static/css/mobile-layout.css` - Mobile positioning (≤768px)
  - `frontend/static/css/desktop-layout.css` - Desktop positioning (>768px)
  - `frontend/static/css/components/panels.css` - Button sizing and styling
  - `frontend/static/css/components/mobile-menu.css` - Mobile menu button styles
  - `frontend/game.html` - Button HTML structure

### Known Issues

1. **Insufficient padding on small mobile devices** - 8px padding may not provide enough separation
2. **Button overlap on very small screens** (<375px) - Buttons may overlap with board tiles
3. **Dynamic sizing conflicts** - Button size scales with tile size, which can cause unpredictable spacing
4. **Z-index conflicts** - Buttons may not always appear above game tiles
5. **Touch target overlap** - On mobile, 44px minimum touch targets can extend beyond visual boundaries

---

## PR #1: Investigation and Documentation

### Goal
Understand and document the current button overlap issues with visual evidence and measurements.

### Tasks Checklist

#### Investigation Phase
- [ ] Set up local development environment
  - [ ] Clone the repository
  - [ ] Install dependencies: `cd frontend && npm install`
  - [ ] Run development server: `npm run dev`
  - [ ] Open `http://localhost:5173/game.html` in browser

- [ ] Document current button behavior
  - [ ] Test on desktop (>768px width)
  - [ ] Test on tablet (769px - 768px)
  - [ ] Test on mobile (≤768px width)
  - [ ] Test on very small mobile (≤375px width)
  - [ ] Test on ultra-small mobile (≤320px width)

- [ ] Capture visual evidence
  - [ ] Take screenshots of buttons on each viewport size
  - [ ] Use browser DevTools to measure button positions and sizes
  - [ ] Document actual vs. expected button spacing
  - [ ] Identify which viewports have overlap issues
  - [ ] Measure minimum safe padding needed

- [ ] Analyze CSS calculations
  - [ ] Review `--mobile-board-padding` usage in `mobile-layout.css`
  - [ ] Review `--desktop-content-padding` usage in `desktop-layout.css`
  - [ ] Check button sizing calculations in `components/panels.css`
  - [ ] Verify `--scale-md` and `--tile-size` values at different breakpoints
  - [ ] Calculate actual button dimensions at each viewport size

- [ ] Create issue report
  - [ ] Document all findings in a GitHub issue or markdown file
  - [ ] Include screenshots and measurements
  - [ ] List affected viewport sizes
  - [ ] Prioritize issues by severity and frequency

### Acceptance Criteria

✅ **Complete when:**
- [ ] Comprehensive documentation file exists in `docs/` directory
- [ ] Screenshots demonstrate overlap issues at specific viewport sizes
- [ ] Measurements show exact pixel values for button positions and sizes
- [ ] Clear prioritization of which issues to fix first
- [ ] No code changes have been made (documentation only)

### Testing Requirements

- **Manual Testing**: Test on real devices if possible (iPhone SE, iPhone 12, iPad, desktop)
- **Browser Testing**: Test in Chrome DevTools device emulation mode
- **Viewport Testing**: Test at exact breakpoints (320px, 375px, 600px, 768px, 769px, 900px, 1200px)

### Resources

- **CSS Variables Location**: `frontend/static/css/theme.css` and layout files
- **Button Elements**: Search for `#mobileMenuToggle`, `#optionsToggle`, `#chatNotify` in CSS
- **DevTools**: Use "Elements" panel to inspect computed styles and bounding boxes

---

## PR #2: Fix Mobile Menu Button Overlap (≤768px)

### Goal
Ensure the mobile menu button (#mobileMenuToggle) never overlaps with board tiles or other buttons on mobile devices.

### Tasks Checklist

#### Code Changes

- [ ] Review current mobile menu button positioning
  - [ ] Check `mobile-layout.css` lines 222-235 for `#mobileMenuToggle` rules
  - [ ] Verify current padding value: `--mobile-board-padding` (8px)
  - [ ] Note current size: 44px × 44px

- [ ] Calculate safe positioning
  - [ ] Measure minimum distance from board edge to first tile
  - [ ] Account for 44px button size plus safe margin
  - [ ] Consider touch target extension (may be larger than visual size)
  - [ ] Determine optimal padding value (recommend 12-16px minimum)

- [ ] Update mobile menu button positioning
  - [ ] Modify `#mobileMenuToggle` positioning in `mobile-layout.css`
  - [ ] Increase `top` offset from `var(--mobile-board-padding)` to a larger value
  - [ ] Increase `left` offset from `var(--mobile-board-padding)` to a larger value
  - [ ] Consider using fixed pixel values instead of variable if needed
  - [ ] Add comments explaining the padding choice

- [ ] Test button placement
  - [ ] Test at 768px viewport width
  - [ ] Test at 375px viewport width (iPhone SE)
  - [ ] Test at 320px viewport width (very small phones)
  - [ ] Verify no overlap with board tiles
  - [ ] Verify no overlap with options button (top-right)

#### Alternative Approach (if needed)

- [ ] Consider moving button outside of `#boardArea`
  - [ ] Move to fixed position relative to viewport
  - [ ] Update z-index to ensure visibility
  - [ ] Adjust positioning to avoid header overlap

### Acceptance Criteria

✅ **Complete when:**
- [ ] Mobile menu button has minimum 12px clearance from board on all sides
- [ ] Button is fully clickable on all mobile devices (320px - 768px)
- [ ] No visual overlap with board tiles at any tested viewport size
- [ ] No overlap with other buttons (#optionsToggle)
- [ ] Touch target (44px minimum) does not interfere with board interaction
- [ ] Button remains visible and accessible during gameplay
- [ ] Existing functionality is not broken

### Testing Requirements

#### Manual Testing
- [ ] Test on Chrome DevTools mobile emulation (320px, 375px, 768px)
- [ ] Click button to verify it opens mobile menu successfully
- [ ] Play a game and verify button doesn't interfere with tile interaction
- [ ] Verify button visibility in both light and dark mode

#### Visual Testing
- [ ] Take before/after screenshots at 320px, 375px, 768px
- [ ] Compare button positioning and clearance
- [ ] Verify button doesn't cover any game content

#### Playwright Tests (if applicable)
- [ ] Run existing UI responsiveness tests: `npx playwright test ui-responsiveness.spec.js`
- [ ] Verify tests pass or update expectations if needed
- [ ] Check for overlap detection test failures

### Files to Modify

- `frontend/static/css/mobile-layout.css` - Lines ~222-235 (#mobileMenuToggle positioning)

### Rollback Plan

If issues arise:
1. Revert changes to `mobile-layout.css`
2. Document why the approach didn't work
3. Try alternative approach (moving button outside boardArea)

---

## PR #3: Fix Options and Chat Button Overlap (Mobile)

### Goal
Ensure the options button (#optionsToggle) and chat notification button (#chatNotify) don't overlap with board tiles or each other on mobile devices.

### Tasks Checklist

#### Code Changes

- [ ] Review current button positioning
  - [ ] Check `mobile-layout.css` lines 237-248 for button rules
  - [ ] Verify current padding: `--mobile-board-padding` (8px)
  - [ ] Note button sizes (44px × 44px minimum)
  - [ ] Check spacing between buttons (vertical distance)

- [ ] Calculate safe positioning for options button (top-right)
  - [ ] Measure minimum safe distance from board edge
  - [ ] Account for 44px button size plus margin
  - [ ] Verify no conflict with header/leaderboard
  - [ ] Determine optimal `top` and `right` offset values

- [ ] Calculate safe positioning for chat button (bottom-right)
  - [ ] Measure minimum safe distance from board edge
  - [ ] Account for 44px button size plus margin
  - [ ] Verify no conflict with keyboard (fixed at bottom)
  - [ ] Ensure sufficient vertical spacing from options button above
  - [ ] Determine optimal `bottom` and `right` offset values

- [ ] Update button positioning
  - [ ] Modify `#optionsToggle` in `mobile-layout.css` (line ~238)
  - [ ] Modify `#chatNotify` in `mobile-layout.css` (line ~244)
  - [ ] Increase spacing from `var(--mobile-board-padding)` to larger values
  - [ ] Ensure consistent right offset for both buttons (visual alignment)
  - [ ] Add comments explaining padding choices

- [ ] Test button spacing
  - [ ] Verify buttons align vertically (same right offset)
  - [ ] Measure vertical gap between buttons
  - [ ] Verify minimum 8px gap between button edges
  - [ ] Test at multiple viewport sizes

#### Edge Case Handling

- [ ] Test very small mobile screens (<375px)
  - [ ] Verify buttons don't overlap at 320px width
  - [ ] Check if buttons need to be smaller on tiny screens
  - [ ] Consider reducing button size using media query if needed

- [ ] Test board height variations
  - [ ] Verify spacing works with 6-row game board (current)
  - [ ] Consider future board size changes
  - [ ] Ensure buttons don't extend beyond boardArea boundaries

### Acceptance Criteria

✅ **Complete when:**
- [ ] Options button has minimum 12px clearance from board tiles
- [ ] Chat button has minimum 12px clearance from board tiles
- [ ] Minimum 8px vertical gap between options and chat buttons
- [ ] Both buttons align vertically (same right offset)
- [ ] No overlap with board at any viewport size (320px - 768px)
- [ ] Buttons remain fully clickable
- [ ] Touch targets don't interfere with board interaction
- [ ] Existing functionality is preserved

### Testing Requirements

#### Manual Testing
- [ ] Test at 320px, 375px, 600px, 768px viewport widths
- [ ] Click both buttons to verify functionality
- [ ] Play through a full game to check interference
- [ ] Test with chat notifications active
- [ ] Verify wiggle animation on chat button works correctly

#### Visual Testing
- [ ] Take before/after screenshots at each viewport size
- [ ] Measure and document button spacing
- [ ] Verify vertical alignment of buttons

#### Playwright Tests
- [ ] Run `npx playwright test ui-responsiveness.spec.js`
- [ ] Run `npx playwright test pr6-peripheral-ui.spec.js` (button positioning tests)
- [ ] Verify no test failures or update expectations

### Files to Modify

- `frontend/static/css/mobile-layout.css` - Lines ~238-248 (button positioning)

### Rollback Plan

If issues arise:
1. Revert changes to `mobile-layout.css`
2. Document specific failures
3. Consider alternative approach: move buttons outside boardArea entirely

---

## PR #4: Fix Desktop Button Overlap (>768px)

### Goal
Ensure options and chat buttons don't overlap with board tiles or each other on desktop viewports.

### Tasks Checklist

#### Code Changes

- [ ] Review current desktop button positioning
  - [ ] Check `desktop-layout.css` lines 306-317 for button rules
  - [ ] Verify current padding: `--desktop-content-padding` (16px)
  - [ ] Note button sizes (calculated from tile size and scale tokens)
  - [ ] Check if 16px padding is sufficient at all desktop sizes

- [ ] Calculate button dimensions at different viewport sizes
  - [ ] Calculate at 769px (smallest desktop viewport)
  - [ ] Calculate at 1200px (large desktop)
  - [ ] Calculate at 1551px+ (ultra-wide desktop)
  - [ ] Formula: `width = calc(var(--tile-size) * var(--scale-md))`
  - [ ] Verify against 44px minimum from panels.css

- [ ] Test spacing at desktop breakpoints
  - [ ] Test at 769px (just above mobile breakpoint)
  - [ ] Test at 900px
  - [ ] Test at 1200px
  - [ ] Test at 1551px+
  - [ ] Verify buttons don't overlap with tiles at any size

- [ ] Update button positioning if needed
  - [ ] Modify `#optionsToggle` in `desktop-layout.css` (line ~307)
  - [ ] Modify `#chatNotify` in `desktop-layout.css` (line ~313)
  - [ ] Increase `top`/`bottom`/`right` offsets if needed
  - [ ] Consider using fixed pixel values if `--desktop-content-padding` is insufficient
  - [ ] Ensure buttons stay within visible boardArea bounds

- [ ] Review button sizing calculations
  - [ ] Check if `--scale-md` provides appropriate sizing
  - [ ] Verify `min-width` and `min-height` (44px from panels.css)
  - [ ] Consider if maximum size is needed for ultra-wide displays
  - [ ] Document expected button sizes at each breakpoint

### Acceptance Criteria

✅ **Complete when:**
- [ ] Options button has minimum 16px clearance from board tiles on desktop
- [ ] Chat button has minimum 16px clearance from board tiles on desktop
- [ ] No overlap at any desktop viewport size (769px+)
- [ ] Buttons scale appropriately with tile size
- [ ] Buttons remain fully clickable
- [ ] Hover states work correctly
- [ ] Button size doesn't grow excessively on ultra-wide displays
- [ ] Existing functionality is preserved

### Testing Requirements

#### Manual Testing
- [ ] Test at 769px, 900px, 1200px, 1551px viewports
- [ ] Hover over buttons to verify hover states
- [ ] Click buttons to verify functionality
- [ ] Resize browser window to check responsive behavior
- [ ] Test with different board sizes (if applicable)

#### Visual Testing
- [ ] Take screenshots at multiple desktop sizes
- [ ] Measure button sizes and spacing
- [ ] Verify buttons scale proportionally with board

#### Playwright Tests
- [ ] Run full test suite: `npx playwright test`
- [ ] Specifically check desktop viewport tests
- [ ] Verify no regression in button functionality

### Files to Modify

- `frontend/static/css/desktop-layout.css` - Lines ~307-317 (button positioning)
- `frontend/static/css/components/panels.css` - Lines ~7-53 (button sizing, if needed)

### Rollback Plan

If issues arise:
1. Revert changes to `desktop-layout.css`
2. Document specific sizing/positioning issues
3. Consider capping maximum button size for ultra-wide displays

---

## PR #5: Improve Button Z-Index and Stacking

### Goal
Ensure buttons always appear above game tiles and other UI elements, preventing any z-index conflicts.

### Tasks Checklist

#### Investigation

- [ ] Review current z-index values
  - [ ] Check `frontend/static/css/z-index.css` for all z-index definitions
  - [ ] Note current button z-index values
  - [ ] Note board/tile z-index values
  - [ ] Identify any stacking context issues

- [ ] Test z-index conflicts
  - [ ] Test buttons with animated tiles (flip reveal)
  - [ ] Test buttons with hint tooltips
  - [ ] Test buttons with confetti effects
  - [ ] Test buttons with panel overlays open
  - [ ] Identify any scenarios where buttons are hidden

#### Code Changes

- [ ] Review z-index hierarchy
  - [ ] Verify `--z-ui-component` is used for buttons
  - [ ] Check if `--z-panel-notification` is appropriate for #chatNotify
  - [ ] Ensure proper stacking order in z-index.css

- [ ] Update z-index values if needed
  - [ ] Ensure buttons are above board tiles
  - [ ] Ensure buttons are below modal overlays
  - [ ] Maintain logical z-index hierarchy
  - [ ] Update `z-index.css` with clear comments

- [ ] Test stacking contexts
  - [ ] Verify buttons create proper stacking context
  - [ ] Check if position: absolute creates new stacking context
  - [ ] Ensure transform/opacity doesn't affect stacking
  - [ ] Test in both light and dark mode

### Acceptance Criteria

✅ **Complete when:**
- [ ] Buttons always appear above game tiles
- [ ] Buttons appear above board animations (flip, confetti)
- [ ] Buttons appear below modal overlays (as expected)
- [ ] No z-index conflicts at any viewport size
- [ ] Z-index hierarchy is documented clearly in code
- [ ] Visual stacking order is logical and predictable

### Testing Requirements

#### Manual Testing
- [ ] Play a full game and verify button visibility throughout
- [ ] Submit guesses and watch tile flip animations
- [ ] Trigger confetti effect and verify buttons stay visible
- [ ] Open/close panels and verify button layering
- [ ] Test hint tooltip interactions

#### Visual Testing
- [ ] Take screenshots during animations
- [ ] Verify buttons remain visible over animated tiles
- [ ] Check button visibility with overlays open

#### Playwright Tests
- [ ] Run animation tests if they exist
- [ ] Verify no visual regression in stacking order

### Files to Modify

- `frontend/static/css/z-index.css` - Z-index definitions (if needed)
- `frontend/static/css/components/panels.css` - Button z-index (if needed)
- `frontend/static/css/mobile-layout.css` - Mobile button z-index (if needed)
- `frontend/static/css/desktop-layout.css` - Desktop button z-index (if needed)

### Rollback Plan

If issues arise:
1. Revert z-index changes
2. Document specific stacking context issues
3. Review CSS stacking context rules and try alternative approach

---

## PR #6: Add CSS Variable for Button Padding

### Goal
Create a reusable CSS variable for button padding to make future adjustments easier and more maintainable.

### Tasks Checklist

#### Code Changes

- [ ] Define new CSS variables in theme.css
  - [ ] Open `frontend/static/css/theme.css` or `shared-base.css`
  - [ ] Add `--button-board-padding-mobile: 12px;` (or value from PR #2/#3)
  - [ ] Add `--button-board-padding-desktop: 16px;` (or value from PR #4)
  - [ ] Add clear comments explaining the purpose
  - [ ] Consider if different values needed for top/bottom/left/right

- [ ] Replace hardcoded values in mobile-layout.css
  - [ ] Find all button positioning rules
  - [ ] Replace padding values with `var(--button-board-padding-mobile)`
  - [ ] Update `#mobileMenuToggle` positioning
  - [ ] Update `#optionsToggle` positioning
  - [ ] Update `#chatNotify` positioning

- [ ] Replace hardcoded values in desktop-layout.css
  - [ ] Find all button positioning rules
  - [ ] Replace padding values with `var(--button-board-padding-desktop)`
  - [ ] Update `#optionsToggle` positioning
  - [ ] Update `#chatNotify` positioning

- [ ] Add responsive overrides if needed
  - [ ] Consider very small mobile (<375px) needing different padding
  - [ ] Add media query in mobile-layout.css if needed
  - [ ] Ensure smooth transition at 768px breakpoint

#### Documentation

- [ ] Document CSS variable in code comments
  - [ ] Explain what the variable controls
  - [ ] Document expected values
  - [ ] Note which elements use the variable

- [ ] Update architecture documentation
  - [ ] Add note to `docs/LAYOUT_REFACTORING_PLAN.md` if applicable
  - [ ] Document the button padding system

### Acceptance Criteria

✅ **Complete when:**
- [ ] New CSS variables defined in theme/shared-base files
- [ ] All button padding uses CSS variables (no hardcoded values)
- [ ] Variables have clear, descriptive names
- [ ] Code comments explain variable purpose
- [ ] No visual changes (should look identical to previous PRs)
- [ ] Easier to adjust padding in future (one place to change)

### Testing Requirements

#### Manual Testing
- [ ] Visual regression testing at all viewport sizes
- [ ] Verify button positioning identical to previous PRs
- [ ] Test at 320px, 375px, 768px, 1200px viewports
- [ ] Verify no spacing changes occurred

#### Automated Testing
- [ ] Run full Playwright test suite
- [ ] Compare screenshots to baseline (should be identical)
- [ ] Verify no test failures

### Files to Modify

- `frontend/static/css/theme.css` or `frontend/static/css/shared-base.css` - Add variables
- `frontend/static/css/mobile-layout.css` - Use variables for button positioning
- `frontend/static/css/desktop-layout.css` - Use variables for button positioning

### Rollback Plan

If issues arise:
1. Revert CSS variable changes
2. Restore hardcoded padding values
3. Review CSS variable fallback handling

---

## PR #7: Add Comprehensive Button Overlap Tests

### Goal
Add automated Playwright tests to detect button overlap issues and prevent future regressions.

### Tasks Checklist

#### Test File Creation

- [ ] Create new test file
  - [ ] Create `tests/playwright/button-overlap.spec.js`
  - [ ] Add file header with description
  - [ ] Import required Playwright testing utilities
  - [ ] Set up test suite structure

#### Mobile Button Tests (≤768px)

- [ ] Test mobile menu button positioning
  - [ ] Test at 320px viewport
  - [ ] Test at 375px viewport
  - [ ] Test at 768px viewport
  - [ ] Verify minimum clearance from board (12px)
  - [ ] Verify no overlap with options button
  - [ ] Verify button is visible and clickable

- [ ] Test options button positioning
  - [ ] Test at multiple mobile viewports
  - [ ] Verify minimum clearance from board
  - [ ] Verify no overlap with mobile menu button
  - [ ] Verify no overlap with chat button

- [ ] Test chat button positioning
  - [ ] Test at multiple mobile viewports
  - [ ] Verify minimum clearance from board
  - [ ] Verify no overlap with options button above
  - [ ] Verify minimum 8px gap between buttons

- [ ] Test button spacing on very small screens
  - [ ] Test at 320px specifically
  - [ ] Verify buttons still have adequate spacing
  - [ ] Verify no overlap with board tiles

#### Desktop Button Tests (>768px)

- [ ] Test options button positioning
  - [ ] Test at 769px viewport
  - [ ] Test at 1200px viewport
  - [ ] Test at 1551px viewport
  - [ ] Verify minimum clearance from board (16px)
  - [ ] Verify button size scales appropriately

- [ ] Test chat button positioning
  - [ ] Test at multiple desktop viewports
  - [ ] Verify minimum clearance from board
  - [ ] Verify button positioning relative to board

#### Overlap Detection Helpers

- [ ] Create helper function: `getElementBounds(selector)`
  - [ ] Return x, y, width, height of element
  - [ ] Handle element not found case

- [ ] Create helper function: `checkOverlap(element1, element2)`
  - [ ] Calculate if bounding boxes overlap
  - [ ] Return overlap amount and percentage
  - [ ] Return clear diagnostic message

- [ ] Create helper function: `measureClearance(button, board)`
  - [ ] Calculate distance between button and board edges
  - [ ] Return top, right, bottom, left clearance
  - [ ] Flag if clearance below minimum threshold

#### Test Assertions

- [ ] Add clear assertion messages
  - [ ] Include actual vs expected values
  - [ ] Include element selectors in messages
  - [ ] Include viewport size in failure messages

- [ ] Add screenshot capture on failure
  - [ ] Capture full page screenshot
  - [ ] Highlight overlapping elements if possible
  - [ ] Save with descriptive filename

### Acceptance Criteria

✅ **Complete when:**
- [ ] Test file created with comprehensive coverage
- [ ] Tests cover mobile viewports (320px, 375px, 768px)
- [ ] Tests cover desktop viewports (769px, 1200px, 1551px)
- [ ] Tests detect button-to-board overlap
- [ ] Tests detect button-to-button overlap
- [ ] Tests measure minimum clearance requirements
- [ ] Tests pass with current button positioning (from PR #2-4)
- [ ] Test failures provide clear diagnostic messages
- [ ] Screenshots captured on test failures
- [ ] Tests can be run independently: `npx playwright test button-overlap.spec.js`

### Testing Requirements

#### Test Development
- [ ] Write tests incrementally (one button at a time)
- [ ] Run tests locally as you write them
- [ ] Verify tests catch overlap issues when padding is reduced
- [ ] Verify tests pass with correct padding values

#### CI Integration
- [ ] Add test to CI pipeline (if applicable)
- [ ] Verify tests run in CI environment
- [ ] Ensure screenshots saved as artifacts on failure

### Files to Create

- `tests/playwright/button-overlap.spec.js` - New test file

### Example Test Structure

```javascript
// Example test structure (DO NOT copy literally, write your own)
test('mobile menu button has minimum clearance from board at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/game.html');
  
  // Get button and board positions
  const buttonBounds = await page.locator('#mobileMenuToggle').boundingBox();
  const boardBounds = await page.locator('#board').boundingBox();
  
  // Calculate clearance
  const clearance = {
    top: buttonBounds.y - boardBounds.y,
    left: buttonBounds.x - boardBounds.x,
  };
  
  // Assert minimum clearance
  expect(clearance.top).toBeGreaterThanOrEqual(12);
  expect(clearance.left).toBeGreaterThanOrEqual(12);
});
```

### Rollback Plan

Not applicable (adding tests only, no code changes)

---

## General Guidelines for All PRs

### Before Starting Any PR

1. **Pull latest changes**: `git pull origin main`
2. **Create feature branch**: `git checkout -b fix/button-overlap-pr[NUMBER]`
3. **Read this entire PR plan section**
4. **Review related files** mentioned in "Files to Modify"
5. **Set up testing environment** if needed

### Development Workflow

1. **Make small, incremental changes**
2. **Test after each change** (don't wait until the end)
3. **Use browser DevTools** to inspect and measure elements
4. **Take screenshots** before and after changes
5. **Document your reasoning** in code comments
6. **Commit frequently** with clear commit messages

### Commit Message Format

```
fix(mobile): increase mobile menu button padding

- Increases top and left padding from 8px to 12px
- Prevents overlap with board tiles on small screens
- Tested on 320px, 375px, and 768px viewports

Fixes #[issue-number]
```

### Pull Request Guidelines

1. **Title Format**: `Fix: [Brief description] (PR #[number])`
2. **Description**: Include:
   - What changed
   - Why it changed
   - How to test it
   - Screenshots (before/after)
   - Related issue number
3. **Request review** from team members
4. **Be responsive** to feedback
5. **Update documentation** if needed

### Testing Checklist (For Every PR)

- [ ] Test on actual mobile device (if available)
- [ ] Test in Chrome DevTools device emulation
- [ ] Test at exact breakpoints (320px, 375px, 768px, 769px, 1200px)
- [ ] Test in both light and dark mode
- [ ] Run existing Playwright tests
- [ ] Run linter: `npm run lint` (if applicable)
- [ ] Build production bundle: `npm run build`
- [ ] Verify no console errors
- [ ] Test button functionality (not just positioning)
- [ ] Play through a full game to ensure no interference

### Common Pitfalls to Avoid

1. **Don't make changes outside your PR scope** - Stay focused on the specific issue
2. **Don't remove or modify other working code** - Only change button positioning
3. **Don't skip testing** - Always verify your changes work at all viewport sizes
4. **Don't use magic numbers** - Document why you chose specific padding values
5. **Don't assume** - Measure actual dimensions, don't guess
6. **Don't forget comments** - Explain non-obvious decisions in code
7. **Don't change multiple things at once** - One PR, one focused change

### Getting Help

If you get stuck:

1. **Review existing code** - Look for similar patterns in the codebase
2. **Check documentation** - Read `docs/LAYOUT_REFACTORING_PLAN.md` and `docs/ARCHITECTURE.md`
3. **Use DevTools** - Inspect elements, check computed styles
4. **Ask for help** - Create a draft PR and ask for early feedback
5. **Look at tests** - Review existing Playwright tests for examples

### Success Criteria for Overall Fix

When all PRs are complete:

- [ ] No button overlap at any viewport size (320px - 2000px+)
- [ ] Buttons have consistent, predictable spacing
- [ ] All buttons remain fully clickable
- [ ] Touch targets meet 44px minimum for accessibility
- [ ] Automated tests prevent future regressions
- [ ] Code is maintainable with CSS variables
- [ ] Documentation is clear and comprehensive

---

## Additional Resources

### CSS Files Reference

- **Mobile Layout**: `frontend/static/css/mobile-layout.css` (≤768px)
- **Desktop Layout**: `frontend/static/css/desktop-layout.css` (>768px)
- **Component Styles**: `frontend/static/css/components/panels.css`
- **Mobile Menu**: `frontend/static/css/components/mobile-menu.css`
- **Theme Variables**: `frontend/static/css/theme.css`
- **Z-Index**: `frontend/static/css/z-index.css`

### HTML Reference

- **Game Page**: `frontend/game.html`
- **Button Elements**: Lines 192-194 (optionsToggle, chatNotify, mobileMenuToggle)

### Key CSS Variables

- `--tile-size`: Size of game board tiles (varies by viewport)
- `--scale-md`: Medium scale factor (1.125 desktop, 1 mobile)
- `--mobile-board-padding`: Current padding around board on mobile (8px)
- `--desktop-content-padding`: Current padding on desktop (16px)
- `--min-touch-target`: Minimum touch target size (44px)

### Browser DevTools Tips

- **Device Emulation**: Chrome DevTools > Toggle device toolbar (Cmd/Ctrl + Shift + M)
- **Measure Tool**: Chrome DevTools > Elements > Styles > Box model diagram
- **Computed Styles**: Chrome DevTools > Elements > Computed tab
- **Bounding Box**: Console: `document.querySelector('#element').getBoundingClientRect()`

### Useful Commands

```bash
# Start development server
cd frontend && npm run dev

# Build for production
npm run build

# Run tests
npx playwright test

# Run specific test file
npx playwright test button-overlap.spec.js

# Run tests in headed mode (see browser)
npx playwright test --headed

# Run tests in debug mode
npx playwright test --debug

# Lint CSS (if available)
npm run lint:css
```

---

## Conclusion

This plan breaks down the button overlap fix into **7 small, manageable PRs**:

1. **Investigation & Documentation** - Understand the problem
2. **Mobile Menu Button** - Fix top-left button
3. **Options & Chat Buttons (Mobile)** - Fix right-side buttons on mobile
4. **Desktop Buttons** - Fix button spacing on desktop
5. **Z-Index Improvements** - Fix layering issues
6. **CSS Variables** - Improve maintainability
7. **Automated Tests** - Prevent future regressions

Each PR is **focused**, **testable**, and **reviewable**. Follow the checklists and acceptance criteria to ensure high-quality work.

**Remember**: The goal is not just to fix the current overlap issues, but to create a maintainable system that prevents future issues and makes button positioning easy to adjust.

Good luck! 🚀
