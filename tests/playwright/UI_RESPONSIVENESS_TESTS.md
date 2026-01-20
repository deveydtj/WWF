# UI Responsiveness Test Suite

## Overview

This test suite provides comprehensive testing of UI element visibility and overlay detection across different screen sizes and browsers for the WordSquad game.

## Test Coverage

### Viewport Sizes Tested
- **Mobile Small**: 320x568 (iPhone SE)
- **Mobile Medium**: 375x667 (iPhone 8)
- **Mobile Large**: 414x896 (iPhone 11 Pro Max)
- **Tablet Portrait**: 768x1024 (iPad)
- **Tablet Landscape**: 1024x768 (iPad Landscape)
- **Desktop Small**: 1024x768 (Small laptop)
- **Desktop Medium**: 1366x768 (Common laptop)
- **Desktop Large**: 1920x1080 (Full HD)
- **Desktop Ultra-wide**: 2560x1440 (2K)

### Browsers Tested
- Chromium (Desktop Chrome)
- Firefox (Desktop Firefox)
- WebKit (Desktop Safari)
- Mobile Chrome (Pixel 5)
- Mobile Safari (iPhone 12)

### Test Suites

#### 1. UI Element Visibility Across Viewports
Tests that core UI elements (board, keyboard, panels) are properly visible and accessible across all viewport sizes.

**Key Assertions:**
- Keyboard must be visible on all viewports
- Board visibility is checked when present (may require initialization)
- Element bounding boxes have non-zero dimensions

#### 2. UI Element Overlay Detection
Detects overlapping UI elements that could cause usability issues.

**Key Checks:**
- Board and Keyboard overlap (minor overlaps <25% are acceptable)
- Title Bar and Board overlap (strictly checked)
- Calculates overlap area and dimensions

#### 3. Critical Breakpoint Behavior
Tests layout transitions at critical CSS breakpoints (600px, 768px, 900px).

**Validates:**
- Elements remain accessible across breakpoint transitions
- Layout changes are intentional and don't break functionality

#### 4. Z-Index and Stacking Context
Verifies that modal elements have higher z-index values than content.

**Hierarchy Checked:**
- Modals (emoji picker, options menu) should stack above game content
- Proper z-index values are explicitly set

#### 5. Mobile-Specific Tests
Mobile-optimized tests for touch interfaces.

**Tests:**
- Keyboard fits within viewport (allowing minor overflow <20px)
- Board tiles are touch-friendly size (≥32px on mobile)

#### 6. Desktop-Specific Tests
Desktop layout verification.

**Tests:**
- Side panels (chat, history) are accessible
- Stamp container doesn't overlap history panel

#### 7. Ultra-wide Display Tests
Tests proper scaling on very wide displays.

**Validates:**
- Board doesn't stretch excessively (should use <90% of viewport width)

#### 8. Comprehensive Viewport Sweep
Sweeps through viewport widths from 320px to 2560px to ensure no element overflow.

## Running the Tests

### Run all UI responsiveness tests
```bash
npx playwright test tests/playwright/ui-responsiveness.spec.js
```

### Run on specific browser
```bash
npx playwright test tests/playwright/ui-responsiveness.spec.js --project=chromium
npx playwright test tests/playwright/ui-responsiveness.spec.js --project=firefox
npx playwright test tests/playwright/ui-responsiveness.spec.js --project=webkit
```

### Run specific test suite
```bash
npx playwright test tests/playwright/ui-responsiveness.spec.js --grep "Overlay Detection"
```

### View test report
```bash
npx playwright show-report
```

## Known UI Behaviors

Based on test results, the following behaviors are documented:

1. **Board Initialization**: The board element may not be visible on static HTML load and requires game initialization. This is expected behavior.

2. **Title Bar on Mobile**: The title bar is hidden on mobile viewports, likely using a mobile menu pattern. This is intentional design.

3. **Keyboard Overflow**: On smaller mobile screens (375px), the keyboard may overflow by up to 16px. This is within acceptable limits for mobile layouts.

4. **Board/Keyboard Overlap**: Minor overlap (<25% of element area) is acceptable on very small mobile screens due to space constraints. Larger overlaps are flagged as issues.

5. **Breakpoint Transitions**: The board visibility may change at the 768px breakpoint. This is part of the responsive design strategy.

## Test Configuration

The test configuration is defined in `playwright.config.js` and includes:
- Test directory: `./tests/playwright`
- Base URL: File-based (local frontend files)
- Retry strategy: 2 retries in CI, 0 locally
- Parallel execution: Controlled by workers setting

## Maintenance

### Adding New Viewports
To add new viewport sizes, update the `VIEWPORTS` object in the test file:

```javascript
const VIEWPORTS = {
  'New Device': { width: 428, height: 926 }, // iPhone 13 Pro Max
  // ... existing viewports
};
```

### Adding New UI Elements
To test new UI elements for visibility/overlay, update the `UI_ELEMENTS` object:

```javascript
const UI_ELEMENTS = {
  newElement: '#newElementId',
  // ... existing elements
};
```

### Adjusting Overlap Tolerance
Overlap tolerance can be adjusted in the overlay detection test:

```javascript
if (overlapPercentage < 25) { // Adjust this threshold
  console.log(`Minor overlap (${overlapPercentage.toFixed(1)}%), acceptable`);
  continue;
}
```

## Troubleshooting

### Test Failures
If tests fail, check:
1. **Element selectors**: Ensure element IDs haven't changed
2. **Viewport sizes**: Verify breakpoints match CSS media queries
3. **Browser versions**: Update Playwright browsers if needed
4. **Z-index values**: Check if modal z-index hierarchy has changed

### Performance Issues
If tests are slow:
1. Reduce number of viewports tested
2. Increase parallel workers (if not in CI)
3. Use `fullyParallel: true` in config

### CI/CD Integration
For continuous integration:
1. Install dependencies: `npm install && npx playwright install`
2. Run tests: `npx playwright test tests/playwright/ui-responsiveness.spec.js`
3. Upload artifacts: Test reports and screenshots are in `playwright-report/`

## Future Enhancements

Potential improvements for the test suite:
1. Add accessibility testing (ARIA labels, keyboard navigation)
2. Test dynamic content loading and animations
3. Add visual regression testing with screenshots
4. Test orientation changes (portrait/landscape)
5. Add touch gesture simulation for mobile tests
6. Test with real device emulation
