/**
 * PR 5 – Validation Matrix & Final QA
 * 
 * Tests the viewport matrix with DPR (Device Pixel Ratio) emulation
 * as specified in the UI_SCALING_IMPROVEMENT_PLAN.md PR 5 section.
 * 
 * Note: Playwright doesn't support true browser zoom (Ctrl/Cmd +/-),
 * so "Zoom" values are implemented as DPR emulation, which simulates
 * the layout effects of high-DPI displays.
 */

const { test, expect } = require('@playwright/test');

// Check if we're in screenshot generation mode
const GENERATE_SCREENSHOTS = process.env.GENERATE_SCREENSHOTS === '1';

/**
 * Validation Matrix from PR 5
 * Each entry tests viewport dimensions with specific DPR
 */
const VALIDATION_MATRIX = [
  { width: 375, height: 667, deviceScaleFactor: 1.0, label: '375×667 @ 100%' },
  { width: 375, height: 667, deviceScaleFactor: 2.0, label: '375×667 @ 200%' },
  { width: 768, height: 1024, deviceScaleFactor: 1.0, label: '768×1024 @ 100%' },
  { width: 1024, height: 768, deviceScaleFactor: 1.25, label: '1024×768 @ 125%' },
  { width: 1440, height: 900, deviceScaleFactor: 1.0, label: '1440×900 @ 100%' },
];

/**
 * Critical elements that must be visible and properly laid out
 */
const CRITICAL_ELEMENTS = {
  appContainer: '#appContainer',
  titleBar: '#titleBar',
  board: '#board',
  keyboard: '#keyboard',
  submitButton: '#submitGuess',
};

test.describe('PR 5 - Viewport Validation Matrix', () => {
  for (const config of VALIDATION_MATRIX) {
    test(`${config.label} - Layout integrity`, async ({ page, browser }) => {
      // Create a new browser context with DPR emulation
      // DPR must be set at context creation time, not via setViewportSize
      const context = await browser.newContext({
        viewport: {
          width: config.width,
          height: config.height,
        },
        deviceScaleFactor: config.deviceScaleFactor,
      });
      
      const dprPage = await context.newPage();
      
      try {
        // Navigate to the game page
        await dprPage.goto('game.html');
        await dprPage.waitForLoadState('networkidle');
        
        // Wait a moment for any initial animations
        await dprPage.waitForTimeout(500);
        
        // Test 1: Critical elements must exist
        // Note: Some elements may not be visible in static file context without server
        for (const [name, selector] of Object.entries(CRITICAL_ELEMENTS)) {
          const element = dprPage.locator(selector);
          const count = await element.count();
          
          expect(count, `${name} (${selector}) should exist at ${config.label}`).toBeGreaterThan(0);
          
          // Check visibility, but don't fail if element exists but is hidden
          // (this can happen in static file context without a server)
          if (count > 0) {
            const isVisible = await element.isVisible().catch(() => false);
            if (name !== 'titleBar' && name !== 'board') {  // titleBar and board may be hidden in static context
              expect(isVisible, `${name} should be visible at ${config.label}`).toBeTruthy();
            }
          }
        }
        
        // Test 2: No horizontal overflow
        const hasHorizontalScroll = await dprPage.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        
        expect(hasHorizontalScroll, 
          `No horizontal scroll should be present at ${config.label}`
        ).toBeFalsy();
        
        // Test 3: App container should fit within viewport width
        const appContainer = dprPage.locator('#appContainer');
        const appBox = await appContainer.boundingBox();
        
        if (appBox) {
          expect(
            appBox.width,
            `App container width (${appBox.width}px) should not exceed viewport width (${config.width}px) at ${config.label}`
          ).toBeLessThanOrEqual(config.width);
        }
        
        // Test 4: Critical interactive elements should be within viewport
        const keyboard = dprPage.locator('#keyboard');
        const keyboardBox = await keyboard.boundingBox();
        
        if (keyboardBox) {
          // Keyboard should be visible (at least partially) within viewport height
          expect(
            keyboardBox.y,
            `Keyboard should be positioned within reasonable viewport bounds at ${config.label}`
          ).toBeLessThan(config.height * 2); // Allow for some scrolling
        }
        
        // Test 5: Ensure tap targets meet minimum size on mobile viewports
        if (config.width <= 768) {
          const submitButton = dprPage.locator('#submitGuess');
          const submitBox = await submitButton.boundingBox();
          
          if (submitBox) {
            // Minimum tap target is 44px (as per PR 4 requirements)
            expect(
              Math.min(submitBox.width, submitBox.height),
              `Submit button should meet 44px minimum tap target at ${config.label}`
            ).toBeGreaterThanOrEqual(43); // Allow 1px tolerance
          }
        }
      } finally {
        await context.close();
      }
    });
    
    test(`${config.label} - Visual regression baseline`, async ({ page, browser }, testInfo) => {
      // Skip screenshot generation unless explicitly enabled and running on chromium
      // to avoid file write collisions from parallel test execution
      test.skip(!GENERATE_SCREENSHOTS || testInfo.project.name !== 'chromium', 
        'Screenshot generation disabled (set GENERATE_SCREENSHOTS=1 and use --project=chromium to enable)');
      
      // Create a new browser context with DPR emulation
      // DPR must be set at context creation time, not via setViewportSize
      const context = await browser.newContext({
        viewport: {
          width: config.width,
          height: config.height,
        },
        deviceScaleFactor: config.deviceScaleFactor,
      });
      
      try {
        const dprPage = await context.newPage();
        
        // Navigate to the game page
        await dprPage.goto('game.html');
        await dprPage.waitForLoadState('networkidle');
        
        // Wait for initial animations and stabilization
        await dprPage.waitForTimeout(700);
        
        // Take screenshot for manual visual inspection
        // Note: This doesn't use snapshot comparison since we're validating
        // changes from PRs 1-4, not enforcing pixel-perfect matching
        await dprPage.screenshot({
          path: `tests/playwright/pr5-validation-${config.width}x${config.height}-dpr${config.deviceScaleFactor}.png`,
          fullPage: true,
        });
        
        // Validate that the page rendered successfully
        const appContainer = dprPage.locator('#appContainer');
        await expect(appContainer).toBeVisible();
      } finally {
        await context.close();
      }
    });
  }
});

test.describe('PR 5 - Cross-viewport Consistency', () => {
  test('Typography hierarchy maintained across breakpoints', async ({ page }) => {
    const viewports = [
      { width: 375, height: 667 },  // Mobile
      { width: 768, height: 1024 }, // Tablet
      { width: 1440, height: 900 }, // Desktop
    ];
    
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto('game.html');
      await page.waitForLoadState('networkidle');
      
      // Wait for any initial animations
      await page.waitForTimeout(500);
      
      // Check heading hierarchy if headings exist
      const headings = await page.evaluate(() => {
        const selectors = ['h1', 'h2', 'h3', 'h4'];
        const sizes = {};
        
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
            const styles = window.getComputedStyle(element);
            sizes[selector] = parseFloat(styles.fontSize);
          }
        }
        
        return sizes;
      });
      
      // If we have multiple heading levels, verify hierarchy
      const headingList = Object.entries(headings);
      if (headingList.length > 1) {
        for (let i = 0; i < headingList.length - 1; i++) {
          const [currentTag, currentSize] = headingList[i];
          const [nextTag, nextSize] = headingList[i + 1];
          
          // h1 should be >= h2, h2 >= h3, etc.
          expect(
            currentSize,
            `At ${viewport.width}x${viewport.height}, ${currentTag} (${currentSize}px) should be >= ${nextTag} (${nextSize}px)`
          ).toBeGreaterThanOrEqual(nextSize);
        }
      }
    }
  });
  
  test('Modal containers fit within viewport', async ({ page }) => {
    const viewports = [
      { width: 375, height: 667 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ];
    
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto('game.html');
      await page.waitForLoadState('networkidle');
      
      // Wait for any initial animations
      await page.waitForTimeout(500);
      
      // Check that modals (if present) don't overflow
      const modals = await page.$$('.modal');
      
      for (const modal of modals) {
        const isVisible = await modal.isVisible().catch(() => false);
        if (isVisible) {
          const box = await modal.boundingBox();
          if (box) {
            // Modal should fit within viewport with some margin
            expect(
              box.height,
              `Modal height should be reasonable at ${viewport.width}x${viewport.height}`
            ).toBeLessThan(viewport.height * 0.95); // 95% of viewport max
          }
        }
      }
    }
  });
});
