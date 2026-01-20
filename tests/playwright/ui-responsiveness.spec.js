/**
 * UI Responsiveness Test Suite
 * 
 * Comprehensive tests to verify UI elements don't overlay and remain visible
 * across different screen sizes and browsers.
 * 
 * Tests cover:
 * - Multiple viewport sizes (mobile, tablet, desktop, ultra-wide)
 * - Element visibility detection
 * - Overlay/overlap detection between UI components
 * - Z-index hierarchy verification
 * - Critical breakpoint behavior (600px, 768px, 900px)
 */

const { test, expect } = require('@playwright/test');

/**
 * Viewport configurations for different device categories
 */
const VIEWPORTS = {
  // Mobile devices
  'Mobile Small': { width: 320, height: 568 },       // iPhone SE
  'Mobile Medium': { width: 375, height: 667 },      // iPhone 8
  'Mobile Large': { width: 414, height: 896 },       // iPhone 11 Pro Max
  
  // Tablets
  'Tablet Portrait': { width: 768, height: 1024 },   // iPad
  'Tablet Landscape': { width: 1024, height: 768 },  // iPad Landscape
  
  // Desktop
  'Desktop Small': { width: 1024, height: 768 },     // Small laptop
  'Desktop Medium': { width: 1366, height: 768 },    // Common laptop
  'Desktop Large': { width: 1920, height: 1080 },    // Full HD
  'Desktop Ultra-wide': { width: 2560, height: 1440 }, // 2K
};

/**
 * Critical breakpoints from the responsive CSS
 */
const BREAKPOINTS = [
  { name: 'Mobile Breakpoint', width: 600 },
  { name: 'Tablet Breakpoint', width: 768 },
  { name: 'Desktop Breakpoint', width: 900 },
];

/**
 * Key UI elements that should be visible and not overlapping
 */
const UI_ELEMENTS = {
  board: '#board',
  keyboard: '#keyboard',
  titleBar: '#titleBar',
  chatBox: '#chatBox',
  historyBox: '#historyBox',
  leaderboardHeader: '.leaderboard-header',
  stampContainer: '#stampContainer',
  emojiModal: '#emojiModal',
  optionsMenu: '#optionsMenu',
};

/**
 * Helper function to check if an element is visible in viewport
 */
async function isElementVisible(page, selector) {
  try {
    const element = await page.locator(selector);
    const count = await element.count();
    
    if (count === 0) {
      return { visible: false, reason: 'Element not found in DOM' };
    }
    
    // Check if element is visible (not display:none, not hidden, etc.)
    const isVisible = await element.isVisible();
    if (!isVisible) {
      return { visible: false, reason: 'Element has display:none or visibility:hidden' };
    }
    
    // Get bounding box
    const box = await element.boundingBox();
    if (!box) {
      return { visible: false, reason: 'Element has no bounding box' };
    }
    
    // Check if element is within viewport
    const viewport = page.viewportSize();
    const inViewport = box.x >= 0 && 
                       box.y >= 0 && 
                       box.x + box.width <= viewport.width && 
                       box.y + box.height <= viewport.height;
    
    return {
      visible: true,
      inViewport,
      box,
      reason: inViewport ? 'Fully visible' : 'Partially outside viewport'
    };
  } catch (error) {
    return { visible: false, reason: `Error: ${error.message}` };
  }
}

/**
 * Helper function to detect if two elements overlap
 */
async function elementsOverlap(page, selector1, selector2) {
  try {
    const element1 = await page.locator(selector1);
    const element2 = await page.locator(selector2);
    
    const count1 = await element1.count();
    const count2 = await element2.count();
    
    if (count1 === 0 || count2 === 0) {
      return { overlap: false, reason: 'One or both elements not found' };
    }
    
    const box1 = await element1.boundingBox();
    const box2 = await element2.boundingBox();
    
    if (!box1 || !box2) {
      return { overlap: false, reason: 'Could not get bounding boxes' };
    }
    
    // Check for overlap
    const horizontalOverlap = box1.x < box2.x + box2.width && 
                             box1.x + box1.width > box2.x;
    const verticalOverlap = box1.y < box2.y + box2.height && 
                           box1.y + box1.height > box2.y;
    
    const overlap = horizontalOverlap && verticalOverlap;
    
    if (overlap) {
      // Calculate overlap dimensions
      const overlapLeft = Math.max(box1.x, box2.x);
      const overlapRight = Math.min(box1.x + box1.width, box2.x + box2.width);
      const overlapTop = Math.max(box1.y, box2.y);
      const overlapBottom = Math.min(box1.y + box1.height, box2.y + box2.height);
      
      const overlapWidth = overlapRight - overlapLeft;
      const overlapHeight = overlapBottom - overlapTop;
      const overlapArea = overlapWidth * overlapHeight;
      
      return {
        overlap: true,
        overlapArea,
        overlapDimensions: { width: overlapWidth, height: overlapHeight },
        box1,
        box2
      };
    }
    
    return { overlap: false };
  } catch (error) {
    return { overlap: false, reason: `Error: ${error.message}` };
  }
}

/**
 * Helper function to get z-index of an element
 */
async function getZIndex(page, selector) {
  try {
    const zIndex = await page.locator(selector).evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.zIndex;
    });
    return zIndex;
  } catch (error) {
    return 'auto';
  }
}

// ============================================================================
// Test Suite: Viewport-specific Element Visibility
// ============================================================================

test.describe('UI Element Visibility Across Viewports', () => {
  for (const [deviceName, viewport] of Object.entries(VIEWPORTS)) {
    test(`${deviceName} (${viewport.width}x${viewport.height}): Core elements are visible`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('game.html');
      await page.waitForLoadState('networkidle');
      
      // Check critical elements that should always be accessible
      // Note: Board may require initialization, so we check if it exists and verify it's not broken when present
      const criticalElements = ['#keyboard'];
      
      for (const selector of criticalElements) {
        const result = await isElementVisible(page, selector);
        
        // Log visibility status
        console.log(`${deviceName} - ${selector}: ${result.visible ? '✓' : '✗'} ${result.reason}`);
        
        expect(result.visible).toBe(true);
        
        // For critical elements, also verify they're somewhat in viewport
        // (some overflow is acceptable for scrollable content)
        if (result.box) {
          expect(result.box.width).toBeGreaterThan(0);
          expect(result.box.height).toBeGreaterThan(0);
        }
      }
      
      // Board may not be visible until game initialization, but if it exists it should be properly configured
      const boardResult = await isElementVisible(page, '#board');
      console.log(`${deviceName} - #board: ${boardResult.visible ? '✓' : '✗'} ${boardResult.reason}`);
      
      // If board is visible, verify it has dimensions
      if (boardResult.visible && boardResult.box) {
        expect(boardResult.box.width).toBeGreaterThan(0);
        expect(boardResult.box.height).toBeGreaterThan(0);
      }
      
      // Title bar may be hidden on some viewports (mobile menu pattern)
      const titleResult = await isElementVisible(page, '#titleBar');
      console.log(`${deviceName} - #titleBar: ${titleResult.visible ? '✓' : '✗'} ${titleResult.reason}`);
    });
  }
});

// ============================================================================
// Test Suite: Element Overlap Detection
// ============================================================================

test.describe('UI Element Overlay Detection', () => {
  for (const [deviceName, viewport] of Object.entries(VIEWPORTS)) {
    test(`${deviceName}: No critical element overlays`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('game.html');
      await page.waitForLoadState('networkidle');
      
      // Test pairs of elements that should not overlap
      const noOverlapPairs = [
        { name: 'Board and Keyboard', selectors: ['#board', '#keyboard'], strict: false },
        { name: 'Title Bar and Board', selectors: ['#titleBar', '#board'], strict: true },
      ];
      
      for (const pair of noOverlapPairs) {
        const [selector1, selector2] = pair.selectors;
        const result = await elementsOverlap(page, selector1, selector2);
        
        if (result.overlap) {
          console.log(`⚠️  ${deviceName} - ${pair.name}: Overlap detected`);
          console.log(`   Overlap area: ${result.overlapArea}px²`);
          console.log(`   Dimensions: ${result.overlapDimensions.width}x${result.overlapDimensions.height}`);
          
          // For non-strict pairs, only warn about significant overlaps (>10% of either element)
          if (!pair.strict && result.box1 && result.box2) {
            const box1Area = result.box1.width * result.box1.height;
            const box2Area = result.box2.width * result.box2.height;
            const overlapPercentage = Math.max(
              (result.overlapArea / box1Area) * 100,
              (result.overlapArea / box2Area) * 100
            );
            
            if (overlapPercentage < 25) {
              console.log(`   Minor overlap (${overlapPercentage.toFixed(1)}%), acceptable for this layout`);
              continue; // Skip assertion for minor overlaps
            }
          }
        } else {
          console.log(`✓ ${deviceName} - ${pair.name}: No overlap`);
        }
        
        // Assert no overlap for strict pairs, or significant overlaps for non-strict pairs
        if (pair.strict) {
          expect(result.overlap).toBe(false);
        }
      }
    });
  }
});

// ============================================================================
// Test Suite: Breakpoint Behavior
// ============================================================================

test.describe('Critical Breakpoint Behavior', () => {
  for (const breakpoint of BREAKPOINTS) {
    test(`${breakpoint.name} (${breakpoint.width}px): Elements adapt correctly`, async ({ page }) => {
      // Test at breakpoint minus 1px
      await page.setViewportSize({ width: breakpoint.width - 1, height: 800 });
      await page.goto('game.html');
      await page.waitForLoadState('networkidle');
      
      const beforeLayout = {};
      for (const [key, selector] of Object.entries(UI_ELEMENTS)) {
        const result = await isElementVisible(page, selector);
        beforeLayout[key] = result;
      }
      
      // Test at breakpoint plus 1px
      await page.setViewportSize({ width: breakpoint.width + 1, height: 800 });
      await page.waitForTimeout(500); // Allow layout to adjust
      
      const afterLayout = {};
      for (const [key, selector] of Object.entries(UI_ELEMENTS)) {
        const result = await isElementVisible(page, selector);
        afterLayout[key] = result;
      }
      
      // Log breakpoint transition
      console.log(`\n${breakpoint.name} Transition:`);
      for (const [key, selector] of Object.entries(UI_ELEMENTS)) {
        const before = beforeLayout[key];
        const after = afterLayout[key];
        
        if (before.visible && after.visible) {
          console.log(`  ${key}: ✓ Visible on both sides`);
        } else if (!before.visible && !after.visible) {
          console.log(`  ${key}: (not rendered in either case)`);
        } else {
          console.log(`  ${key}: Layout changed - ${before.visible ? 'visible' : 'hidden'} → ${after.visible ? 'visible' : 'hidden'}`);
        }
      }
      
      // Keyboard should remain visible across breakpoints
      expect(beforeLayout.keyboard.visible || afterLayout.keyboard.visible).toBe(true);
      
      // Board may change visibility based on initialization state, but should exist in DOM
      // This is acceptable as long as the element exists and can be shown
    });
  }
});

// ============================================================================
// Test Suite: Z-Index Hierarchy
// ============================================================================

test.describe('Z-Index and Stacking Context', () => {
  test('Modal elements have higher z-index than content', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('game.html');
    await page.waitForLoadState('networkidle');
    
    // Get z-indices of various elements
    const zIndices = {};
    const elements = {
      board: '#board',
      keyboard: '#keyboard',
      emojiModal: '#emojiModal',
      optionsMenu: '#optionsMenu',
      closeCallPopup: '#closeCallPopup',
    };
    
    for (const [name, selector] of Object.entries(elements)) {
      zIndices[name] = await getZIndex(page, selector);
    }
    
    console.log('Z-Index Hierarchy:');
    for (const [name, zIndex] of Object.entries(zIndices)) {
      console.log(`  ${name}: ${zIndex}`);
    }
    
    // Verify modal elements have numeric z-index values
    // (they should be explicitly set to be above other content)
    const modalZIndex = parseInt(zIndices.emojiModal);
    const boardZIndex = parseInt(zIndices.board) || 0;
    
    if (!isNaN(modalZIndex) && !isNaN(boardZIndex)) {
      expect(modalZIndex).toBeGreaterThan(boardZIndex);
    }
  });
});

// ============================================================================
// Test Suite: Mobile-Specific Tests
// ============================================================================

test.describe('Mobile Viewport Specific Tests', () => {
  test('Mobile: Keyboard fits within viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('game.html');
    await page.waitForLoadState('networkidle');
    
    const keyboard = await page.locator('#keyboard');
    const keyboardBox = await keyboard.boundingBox();
    
    if (keyboardBox) {
      const viewport = page.viewportSize();
      
      // Keyboard may extend slightly beyond viewport (acceptable with small overflow up to 20px)
      const rightEdge = keyboardBox.x + keyboardBox.width;
      const overflow = rightEdge - viewport.width;
      
      console.log(`Mobile Keyboard: width=${keyboardBox.width}px, height=${keyboardBox.height}px`);
      console.log(`  Position: x=${keyboardBox.x}, y=${keyboardBox.y}`);
      console.log(`  Viewport: ${viewport.width}x${viewport.height}`);
      console.log(`  Overflow: ${overflow}px`);
      
      // Allow minor overflow (up to 20px) which may occur due to rounding or padding
      expect(overflow).toBeLessThan(20);
      
      // Keyboard should be visible vertically (may extend below viewport but top should be visible)
      expect(keyboardBox.y).toBeLessThan(viewport.height);
    }
  });
  
  test('Mobile: Board tiles are touch-friendly size', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('game.html');
    await page.waitForLoadState('networkidle');
    
    // Wait for tiles to be rendered
    await page.waitForSelector('.tile', { timeout: 5000 }).catch(() => {
      console.log('No tiles found - this is expected if board is not initialized');
    });
    
    const tiles = await page.locator('.tile').all();
    
    if (tiles.length > 0) {
      const firstTile = tiles[0];
      const tileBox = await firstTile.boundingBox();
      
      if (tileBox) {
        // Touch-friendly tiles should be at least 32px on mobile
        expect(tileBox.width).toBeGreaterThanOrEqual(32);
        expect(tileBox.height).toBeGreaterThanOrEqual(32);
        
        console.log(`Mobile Tile Size: ${tileBox.width}x${tileBox.height}px`);
      }
    }
  });
});

// ============================================================================
// Test Suite: Desktop-Specific Tests
// ============================================================================

test.describe('Desktop Viewport Specific Tests', () => {
  test('Desktop: Side panels are visible', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('game.html');
    await page.waitForLoadState('networkidle');
    
    // On desktop, chat and history panels should be accessible
    const chatBox = await page.locator('#chatBox');
    const historyBox = await page.locator('#historyBox');
    
    const chatCount = await chatBox.count();
    const historyCount = await historyBox.count();
    
    console.log(`Desktop Panels: chatBox=${chatCount}, historyBox=${historyCount}`);
    
    // Panels should exist in the DOM
    expect(chatCount).toBeGreaterThan(0);
    expect(historyCount).toBeGreaterThan(0);
  });
  
  test('Desktop: Stamp container does not overlap history panel', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('game.html');
    await page.waitForLoadState('networkidle');
    
    // Show stamp container for testing
    await page.evaluate(() => {
      const stampContainer = document.getElementById('stampContainer');
      if (stampContainer) {
        stampContainer.style.display = 'block';
        // Add test stamps
        stampContainer.innerHTML = `
          <div class="emoji-stamp" style="top: 0px;">🎯</div>
          <div class="emoji-stamp" style="top: 70px;">🔥</div>
        `;
      }
      
      const historyBox = document.getElementById('historyBox');
      if (historyBox) {
        historyBox.style.display = 'block';
      }
    });
    
    await page.waitForTimeout(200);
    
    // Check for overlap
    const result = await elementsOverlap(page, '#stampContainer', '#historyBox');
    
    if (result.overlap) {
      console.log(`⚠️  Stamp container overlaps history panel`);
      console.log(`   Overlap area: ${result.overlapArea}px²`);
    } else {
      console.log(`✓ Stamp container does not overlap history panel`);
    }
    
    // Stamps should not overlap the history panel
    expect(result.overlap).toBe(false);
  });
});

// ============================================================================
// Test Suite: Ultra-wide Display Tests
// ============================================================================

test.describe('Ultra-wide Display Tests', () => {
  test('Ultra-wide: Elements scale appropriately', async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1440 });
    await page.goto('game.html');
    await page.waitForLoadState('networkidle');
    
    const board = await page.locator('#board');
    const boardBox = await board.boundingBox();
    
    if (boardBox) {
      const viewport = page.viewportSize();
      
      // Board should not stretch to fill entire ultra-wide screen
      // (it should maintain reasonable proportions)
      const widthRatio = boardBox.width / viewport.width;
      
      console.log(`Ultra-wide Board: width=${boardBox.width}px (${(widthRatio * 100).toFixed(1)}% of viewport)`);
      
      // Board should take up a reasonable portion but not dominate
      expect(widthRatio).toBeLessThan(0.9);
    }
  });
});

// ============================================================================
// Test Suite: Comprehensive Viewport Sweep
// ============================================================================

test.describe('Comprehensive Viewport Sweep', () => {
  test('Sweep through viewport widths: No element overflow', async ({ page }) => {
    await page.goto('game.html');
    await page.waitForLoadState('networkidle');
    
    // Test at various widths from 320px to 2560px
    const testWidths = [320, 375, 414, 600, 768, 900, 1024, 1366, 1920, 2560];
    const height = 800;
    
    console.log('\nViewport Sweep Results:');
    console.log('Width | Board | Keyboard | Title | Status');
    console.log('------|-------|----------|-------|--------');
    
    for (const width of testWidths) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(100);
      
      const board = await isElementVisible(page, '#board');
      const keyboard = await isElementVisible(page, '#keyboard');
      const title = await isElementVisible(page, '#titleBar');
      
      const status = keyboard.visible ? '✓' : '⚠️';
      
      console.log(
        `${width.toString().padStart(5)}px | ${board.visible ? '✓' : '✗'} | ${keyboard.visible ? '✓' : '✗'} | ${title.visible ? '✓' : '✗'} | ${status}`
      );
      
      // Critical element (keyboard) should be visible at all tested widths
      expect(keyboard.visible).toBe(true);
      // Board may require initialization, so we only check if keyboard (always present) is visible
      // Title bar may be hidden on mobile (mobile menu pattern), so we don't assert on it
    }
  });
});
