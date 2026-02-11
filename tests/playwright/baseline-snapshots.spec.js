/**
 * PR 0 – Baseline & Safety Net
 * 
 * Captures viewport snapshots and computed style fixtures at critical viewports
 * to establish a baseline for all subsequent UI scaling improvements.
 * 
 * This test creates:
 * 1. PNG screenshots at all specified viewports
 * 2. JSON fixtures of computed styles and bounding boxes for:
 *    - Primary content column (#appContainer)
 *    - Header elements
 *    - Footer elements
 * 
 * All artifacts are stored in tests/playwright/baseline/ and committed to git.
 * 
 * USAGE:
 * - Baseline generation (one-time): GENERATE_BASELINE=1 npx playwright test baseline-snapshots.spec.js --project=chromium
 * - Validation (regression test): npx playwright test baseline-snapshots.spec.js
 * 
 * The baseline generation mode is gated by GENERATE_BASELINE env var and runs only on chromium
 * to avoid race conditions from multiple projects writing to the same files.
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Check if we're in baseline generation mode
const GENERATE_BASELINE = process.env.GENERATE_BASELINE === '1';

/**
 * Required viewport configurations from PR 0 specification
 */
const BASELINE_VIEWPORTS = [
  { name: '320x568', width: 320, height: 568 },
  { name: '375x667', width: 375, height: 667 },
  { name: '600x900', width: 600, height: 900 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '769x1024', width: 769, height: 1024 },
  { name: '900x900', width: 900, height: 900 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '1200x900', width: 1200, height: 900 },
  { name: '1440x900', width: 1440, height: 900 },
];

/**
 * Key UI elements to capture computed styles and bounding boxes
 */
const KEY_ELEMENTS = {
  appContainer: '#appContainer',
  titleBar: '#titleBar',
  board: '#board',
  keyboard: '#keyboard',
  // Footer elements
  chatBox: '#chatBox',
  historyBox: '#historyBox',
};

/**
 * Helper function to capture computed styles and bounding boxes
 */
async function captureElementData(page, selector) {
  try {
    const element = page.locator(selector);
    const count = await element.count();
    
    if (count === 0) {
      return { exists: false, selector };
    }
    
    const isVisible = await element.isVisible();
    const box = await element.boundingBox();
    
    // Capture computed styles
    const computedStyles = await element.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        display: styles.display,
        position: styles.position,
        width: styles.width,
        height: styles.height,
        maxWidth: styles.maxWidth,
        maxHeight: styles.maxHeight,
        minWidth: styles.minWidth,
        minHeight: styles.minHeight,
        padding: styles.padding,
        paddingTop: styles.paddingTop,
        paddingRight: styles.paddingRight,
        paddingBottom: styles.paddingBottom,
        paddingLeft: styles.paddingLeft,
        margin: styles.margin,
        marginTop: styles.marginTop,
        marginRight: styles.marginRight,
        marginBottom: styles.marginBottom,
        marginLeft: styles.marginLeft,
        fontSize: styles.fontSize,
        fontWeight: styles.fontWeight,
        lineHeight: styles.lineHeight,
        zIndex: styles.zIndex,
      };
    });
    
    return {
      exists: true,
      visible: isVisible,
      boundingBox: box,
      computedStyles,
      selector,
    };
  } catch (error) {
    return {
      exists: false,
      error: error.message,
      selector,
    };
  }
}

/**
 * Helper to ensure baseline directory exists
 */
function ensureBaselineDir() {
  const baselineDir = path.join(__dirname, 'baseline');
  if (!fs.existsSync(baselineDir)) {
    fs.mkdirSync(baselineDir, { recursive: true });
  }
  return baselineDir;
}

// ============================================================================
// Test Suite: Baseline Snapshots
// ============================================================================

test.describe('PR 0 - Baseline Viewport Snapshots', () => {
  // Skip these tests unless we're generating the baseline
  test.skip(!GENERATE_BASELINE, 'Baseline generation disabled (set GENERATE_BASELINE=1 to enable)');
  
  for (const viewport of BASELINE_VIEWPORTS) {
    test(`Capture baseline at ${viewport.name}`, async ({ page }, testInfo) => {
      // Only run on chromium to avoid race conditions
      if (testInfo.project.name !== 'chromium') {
        test.skip();
        return;
      }
      
      // Set viewport size
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      
      // Navigate to game page
      await page.goto('game.html');
      await page.waitForLoadState('networkidle');
      
      // Ensure the initial waiting overlay is not present in baseline captures
      // main.js shows #waitingOverlay on load and auto-hides it after ~4s or on user dismissal.
      // Try to dismiss it explicitly, then wait for it to become hidden, but don't fail if it never existed.
      await page.evaluate(() => {
        const dismissButton = document.querySelector('#waitingDismiss');
        if (dismissButton instanceof HTMLElement && !dismissButton.hasAttribute('disabled')) {
          dismissButton.click();
        }
      });
      try {
        await page.waitForSelector('#waitingOverlay', { state: 'hidden', timeout: 5000 });
      } catch (e) {
        // If the overlay never appears or is already gone, ignore the timeout and proceed.
      }
      
      const baselineDir = ensureBaselineDir();
      
      // 1. Capture PNG screenshot
      const screenshotPath = path.join(baselineDir, `${viewport.name}.png`);
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
      });
      
      console.log(`✓ Screenshot saved: ${screenshotPath}`);
      
      // 2. Capture computed styles and bounding boxes for key elements
      const elementData = {};
      
      for (const [key, selector] of Object.entries(KEY_ELEMENTS)) {
        elementData[key] = await captureElementData(page, selector);
      }
      
      // Add viewport info (no timestamp for deterministic fixtures)
      const fixtureData = {
        viewport: {
          width: viewport.width,
          height: viewport.height,
          name: viewport.name,
        },
        elements: elementData,
      };
      
      // 3. Save JSON fixture
      const fixturePath = path.join(baselineDir, `${viewport.name}.json`);
      fs.writeFileSync(fixturePath, JSON.stringify(fixtureData, null, 2));
      
      console.log(`✓ JSON fixture saved: ${fixturePath}`);
      
      // Verify that critical elements have expected properties
      // (This doesn't assert specific values, just validates structure)
      const appContainer = elementData.appContainer;
      if (appContainer.exists) {
        expect(appContainer.boundingBox).toBeTruthy();
        expect(appContainer.computedStyles).toBeTruthy();
      }
    });
  }
});

// ============================================================================
// Test Suite: Baseline Heading Typography Hierarchy
// ============================================================================

test.describe('PR 0 - Baseline Typography Hierarchy', () => {
  // Skip these tests unless we're generating the baseline
  test.skip(!GENERATE_BASELINE, 'Baseline generation disabled (set GENERATE_BASELINE=1 to enable)');
  
  const TYPOGRAPHY_VIEWPORTS = [
    { width: 320, height: 568 },
    { width: 768, height: 1024 },
    { width: 1200, height: 900 },
  ];
  
  for (const viewport of TYPOGRAPHY_VIEWPORTS) {
    test(`Capture heading typography at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      // Only run on chromium to avoid race conditions
      if (testInfo.project.name !== 'chromium') {
        test.skip();
        return;
      }
      
      await page.setViewportSize(viewport);
      await page.goto('game.html');
      await page.waitForLoadState('networkidle');
      
      // Wait for waiting overlay to be dismissed before capturing typography
      try {
        const waitingOverlay = page.locator('#waitingOverlay');
        await waitingOverlay.waitFor({ state: 'hidden', timeout: 10000 });
      } catch (e) {
        // Proceed if overlay never appears or is already gone
      }
      
      // Capture font sizes for all headings
      const headings = await page.evaluate(() => {
        const headingSelectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
        const results = {};
        
        for (const selector of headingSelectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            const firstElement = elements[0];
            const styles = window.getComputedStyle(firstElement);
            results[selector] = {
              fontSize: parseFloat(styles.fontSize),
              fontWeight: styles.fontWeight,
              lineHeight: styles.lineHeight,
              count: elements.length,
            };
          }
        }
        
        return results;
      });
      
      const baselineDir = ensureBaselineDir();
      const typographyPath = path.join(
        baselineDir,
        `typography-${viewport.width}x${viewport.height}.json`
      );
      
      const typographyData = {
        viewport,
        headings,
      };
      
      fs.writeFileSync(typographyPath, JSON.stringify(typographyData, null, 2));
      console.log(`✓ Typography data saved: ${typographyPath}`);
      
      // Verify heading hierarchy (if headings exist)
      const headingSizes = Object.entries(headings)
        .filter(([_, data]) => data.fontSize)
        .map(([selector, data]) => ({ selector, fontSize: data.fontSize }))
        .sort((a, b) => {
          const orderA = parseInt(a.selector.substring(1));
          const orderB = parseInt(b.selector.substring(1));
          return orderA - orderB;
        });
      
      // Log heading hierarchy (but don't assert in PR 0 - this is baseline capture)
      for (let i = 0; i < headingSizes.length - 1; i++) {
        const current = headingSizes[i];
        const next = headingSizes[i + 1];
        
        const relation = current.fontSize >= next.fontSize ? '>=' : '<';
        console.log(
          `  ${current.selector}: ${current.fontSize}px ${relation} ${next.selector}: ${next.fontSize}px`
        );
      }
    });
  }
});

// ============================================================================
// Test Suite: Baseline Element Transitions at Breakpoints
// ============================================================================

test.describe('PR 0 - Baseline Breakpoint Transitions', () => {
  // Skip these tests unless we're generating the baseline
  test.skip(!GENERATE_BASELINE, 'Baseline generation disabled (set GENERATE_BASELINE=1 to enable)');
  
  // Test the specific adjacent width pairs from PR 3 acceptance criteria
  const ADJACENT_PAIRS = [
    { from: 320, to: 375 },
    { from: 375, to: 600 },
    { from: 600, to: 768 },
    // Skip 768->769 as they straddle the CSS layout switch
    { from: 769, to: 900 },
    { from: 900, to: 1200 },
  ];
  
  const HEIGHT = 900;
  
  for (const pair of ADJACENT_PAIRS) {
    test(`Baseline transition ${pair.from}px → ${pair.to}px`, async ({ page }, testInfo) => {
      // Only run on chromium to avoid race conditions
      if (testInfo.project.name !== 'chromium') {
        test.skip();
        return;
      }
      
      // Capture at first width
      await page.setViewportSize({ width: pair.from, height: HEIGHT });
      await page.goto('game.html');
      await page.waitForLoadState('networkidle');
      
      // Wait for waiting overlay to be dismissed before capturing metrics
      try {
        const waitingOverlay = page.locator('#waitingOverlay');
        await waitingOverlay.waitFor({ state: 'hidden', timeout: 10000 });
      } catch (e) {
        // Proceed if overlay never appears or is already gone
      }
      
      const elementsFrom = {};
      for (const [key, selector] of Object.entries(KEY_ELEMENTS)) {
        elementsFrom[key] = await captureElementData(page, selector);
      }
      
      // Capture at second width
      await page.setViewportSize({ width: pair.to, height: HEIGHT });
      await page.waitForTimeout(300);
      
      const elementsTo = {};
      for (const [key, selector] of Object.entries(KEY_ELEMENTS)) {
        elementsTo[key] = await captureElementData(page, selector);
      }
      
      const baselineDir = ensureBaselineDir();
      const transitionPath = path.join(
        baselineDir,
        `transition-${pair.from}-to-${pair.to}.json`
      );
      
      const transitionData = {
        fromViewport: { width: pair.from, height: HEIGHT },
        toViewport: { width: pair.to, height: HEIGHT },
        elements: {
          from: elementsFrom,
          to: elementsTo,
        },
      };
      
      fs.writeFileSync(transitionPath, JSON.stringify(transitionData, null, 2));
      console.log(`✓ Transition data saved: ${transitionPath}`);
      
      // Calculate and log bounding box changes for primary elements
      const primaryElements = ['appContainer', 'titleBar', 'keyboard'];
      
      for (const key of primaryElements) {
        const fromData = elementsFrom[key];
        const toData = elementsTo[key];
        
        if (fromData.exists && toData.exists && fromData.boundingBox && toData.boundingBox) {
          const fromBox = fromData.boundingBox;
          const toBox = toData.boundingBox;
          
          const changes = {
            x: Math.abs(toBox.x - fromBox.x),
            y: Math.abs(toBox.y - fromBox.y),
            width: Math.abs(toBox.width - fromBox.width),
            height: Math.abs(toBox.height - fromBox.height),
          };
          
          console.log(`  ${key} changes: x=${changes.x}px, y=${changes.y}px, width=${changes.width}px, height=${changes.height}px`);
        }
      }
    });
  }
});

// ============================================================================
// Test Suite: Baseline Validation (Element Metrics Regression)
// ============================================================================

test.describe('PR 0 - Baseline Validation', () => {
  // Skip validation tests in baseline generation mode
  test.skip(GENERATE_BASELINE, 'Validation disabled in baseline generation mode');
  
  for (const viewport of BASELINE_VIEWPORTS) {
    test(`Validate UI at ${viewport.name} matches baseline`, async ({ page }, testInfo) => {
      // Only run validation on chromium since baseline was generated from chromium
      if (testInfo.project.name !== 'chromium') {
        test.skip();
        return;
      }
      
      // Set viewport size
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      
      // Navigate to game page
      await page.goto('game.html');
      await page.waitForLoadState('networkidle');
      
      // Wait for the initial waiting overlay (if present) to be dismissed
      // This ensures we capture element metrics in a stable, steady-state UI
      try {
        const waitingOverlay = page.locator('#waitingOverlay');
        await waitingOverlay.waitFor({ state: 'hidden', timeout: 10000 });
      } catch (e) {
        // If overlay never appears or is already gone, proceed
      }
      
      const baselineDir = path.join(__dirname, 'baseline');
      
      // 1. Validate that baseline artifacts exist
      const snapshotPath = path.join(baselineDir, `${viewport.name}.png`);
      const fixturePath = path.join(baselineDir, `${viewport.name}.json`);
      
      expect(fs.existsSync(snapshotPath), `Baseline screenshot missing: ${snapshotPath}`).toBeTruthy();
      expect(fs.existsSync(fixturePath), `Baseline fixture missing: ${fixturePath}`).toBeTruthy();
      
      // 2. Capture current element data
      const elementData = {};
      for (const [key, selector] of Object.entries(KEY_ELEMENTS)) {
        elementData[key] = await captureElementData(page, selector);
      }
      
      // 3. Load baseline fixture
      const baselineFixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
      
      // 4. Compare critical element properties against baseline
      for (const key of Object.keys(KEY_ELEMENTS)) {
        const current = elementData[key];
        const baseline = baselineFixture.elements[key];
        
        // Ensure we actually have baseline data for this key
        expect(
          baseline,
          `Baseline data missing for key "${key}" in viewport "${viewport.name}". ` +
            'Re-generate baselines if this element was newly added.'
        ).toBeDefined();
        
        // Ensure element existence matches between baseline and current run
        expect(
          current.exists,
          `Existence mismatch for key "${key}" in viewport "${viewport.name}": ` +
            `baseline.exists=${baseline && baseline.exists}, current.exists=${current.exists}. ` +
            'If this change is intentional, re-generate the baseline fixtures.'
        ).toBe(baseline.exists);
        
        if (baseline.exists && current.exists) {
          // Verify element visibility hasn't changed unexpectedly
          expect(
            current.visible,
            `Visibility mismatch for key "${key}" in viewport "${viewport.name}": ` +
              `baseline.visible=${baseline.visible}, current.visible=${current.visible}.`
          ).toBe(baseline.visible);
          
          // Ensure bounding box presence parity
          const baselineHasBox = !!baseline.boundingBox;
          const currentHasBox = !!current.boundingBox;
          
          expect(
            currentHasBox,
            `Bounding box presence mismatch for key "${key}" in viewport "${viewport.name}": ` +
              `baseline has boundingBox=${baselineHasBox}, current has boundingBox=${currentHasBox}. ` +
              'If this element became non-rendered, re-generate the baseline fixtures.'
          ).toBe(baselineHasBox);
          
          // Verify bounding box position and dimensions haven't changed significantly
          if (baseline.boundingBox && current.boundingBox) {
            const xDiff = Math.abs(current.boundingBox.x - baseline.boundingBox.x);
            const yDiff = Math.abs(current.boundingBox.y - baseline.boundingBox.y);
            const widthDiff = Math.abs(current.boundingBox.width - baseline.boundingBox.width);
            const heightDiff = Math.abs(current.boundingBox.height - baseline.boundingBox.height);
            
            // Allow up to 2px difference for rendering variations across runs
            expect(
              xDiff,
              `X position regression for key "${key}" in viewport "${viewport.name}": ` +
                `baseline.x=${baseline.boundingBox.x}, current.x=${current.boundingBox.x}, diff=${xDiff}px (tolerance: 2px).`
            ).toBeLessThanOrEqual(2);
            
            expect(
              yDiff,
              `Y position regression for key "${key}" in viewport "${viewport.name}": ` +
                `baseline.y=${baseline.boundingBox.y}, current.y=${current.boundingBox.y}, diff=${yDiff}px (tolerance: 2px).`
            ).toBeLessThanOrEqual(2);
            
            expect(
              widthDiff,
              `Width regression for key "${key}" in viewport "${viewport.name}": ` +
                `baseline.width=${baseline.boundingBox.width}, current.width=${current.boundingBox.width}, diff=${widthDiff}px (tolerance: 2px).`
            ).toBeLessThanOrEqual(2);
            
            expect(
              heightDiff,
              `Height regression for key "${key}" in viewport "${viewport.name}": ` +
                `baseline.height=${baseline.boundingBox.height}, current.height=${current.boundingBox.height}, diff=${heightDiff}px (tolerance: 2px).`
            ).toBeLessThanOrEqual(2);
          }
        }
      }
    });
  }
});
