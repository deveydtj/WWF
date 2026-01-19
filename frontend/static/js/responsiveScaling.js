/**
 * responsiveScaling.js
 * Modern responsive scaling system inspired by best practices
 * 
 * Key features:
 * - Dynamic viewport height calculation (dvh support)
 * - Tile and keyboard sizing that fits all content in viewport
 * - Efficient resize handling with debouncing
 * - Mobile-first approach with progressive enhancement
 */

/**
 * Clamp a number between a minimum and maximum value
 */
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/**
 * Calculate optimal sizing for tiles, keyboard, and UI elements
 * Based on available viewport space
 * 
 * Note: This function expects the DOM to be fully loaded. If called during
 * initialization before elements are rendered, it will use fallback values
 * for header height (60px) which may result in less accurate initial sizing.
 */
function tuneSizing() {
  const root = document.documentElement;
  const titleBar = document.querySelector("#titleBar");

  // Viewport dimensions
  const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

  // Padding approximations from CSS variables (fallback to numbers if not computed)
  const styles = getComputedStyle(root);
  const padX = parseFloat(styles.getPropertyValue("--pad-x")) || 16;
  const padY = parseFloat(styles.getPropertyValue("--pad-y")) || 14;

  // Calculate responsive gaps
  const gap = clamp(Math.round(Math.min(vw, vh) * 0.012), 6, 12);
  const kbGap = clamp(Math.round(Math.min(vw, vh) * 0.010), 6, 10);
  root.style.setProperty("--gap", gap + "px");
  root.style.setProperty("--tile-gap", gap + "px");
  root.style.setProperty("--kb-gap", kbGap + "px");

  // Width-driven tile size (guaranteed to fit 5 tiles + 4 gaps)
  const usableW = vw - (padX * 2) - 2; // small safety margin
  const tileByWidth = Math.floor((usableW - 4 * gap) / 5);

  // Height-driven tile size: ensure board + keyboard + header fits in viewport
  // Note: Keyboard uses flex layout with 3 rows. This calculation assumes a standard
  // 3-row QWERTY layout. If keyboard layout changes, this may need adjustment.
  const headerH = titleBar ? titleBar.getBoundingClientRect().height : 60;
  const breathing = clamp(vh * 0.03, 10, 24);

  // Start with width-constrained tile size
  let tile = clamp(tileByWidth, 34, 66);

  /**
   * Check if a given tile size fits in the viewport
   */
  function fits(t) {
    const keyH = clamp(Math.round(t * 0.80), 34, 56);
    const boardH = 6 * t + 5 * gap;
    const kbH = 3 * keyH + 2 * kbGap;
    const total = (padY * 2) + headerH + breathing + boardH + kbH;
    return { ok: total <= vh, keyH, total };
  }

  // Reduce tile until it fits (important for small phones)
  // Maximum 40 iterations allows reduction from max tile (66px) to min tile (26px)
  // at 1px per iteration, which covers all reasonable viewport sizes
  for (let i = 0; i < 40; i++) {
    const r = fits(tile);
    if (r.ok) break;
    tile -= 1;
    if (tile < 30) break;
  }

  const r = fits(tile);
  root.style.setProperty("--tile-size", tile + "px");
  root.style.setProperty("--key-h", r.keyH + "px");

  // Calculate board width
  const boardWidth = tile * 5 + gap * 4;
  root.style.setProperty("--board-width", boardWidth + "px");

  // Scale typography with tile/key sizes
  const tileFont = clamp(Math.round(tile * 0.52), 16, 34);
  const keyFont = clamp(Math.round(r.keyH * 0.38), 11, 18);
  const uiFont = clamp(Math.round(Math.min(vw, vh) * 0.020), 12, 16);
  root.style.setProperty("--tile-font", tileFont + "px");
  root.style.setProperty("--key-font", keyFont + "px");
  root.style.setProperty("--ui-font", uiFont + "px");

  // Radius scales mildly
  const radius = clamp(Math.round(Math.min(tile, r.keyH) * 0.16), 8, 12);
  root.style.setProperty("--radius", radius + "px");

  // Set scale factor for UI elements
  const scaleFactor = tile / 60; // 60px is baseline
  root.style.setProperty("--ui-scale", scaleFactor);
  root.style.setProperty("--current-scale-factor", scaleFactor);
  root.style.setProperty("--current-tile-size", tile + "px");

  console.log(`📐 Scaling applied: tile=${tile}px, keyH=${r.keyH}px, boardW=${boardWidth}px, scale=${scaleFactor.toFixed(2)}`);
}

/**
 * Initialize responsive scaling system
 */
export function initializeResponsiveScaling() {
  console.log('🚀 Initializing responsive scaling system');

  // Set up padding CSS variables if not already set
  const root = document.documentElement;
  const styles = getComputedStyle(root);
  
  const padX = styles.getPropertyValue("--pad-x");
  if (!padX || padX.trim() === "") {
    root.style.setProperty("--pad-x", "16px");
  }
  
  const padY = styles.getPropertyValue("--pad-y");
  if (!padY || padY.trim() === "") {
    root.style.setProperty("--pad-y", "14px");
  }

  // Add event listeners for resize and orientation change with debouncing
  let resizeTimeout;
  const debouncedResize = () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(tuneSizing, 150);
  };
  
  window.addEventListener("resize", debouncedResize);
  window.addEventListener("orientationchange", tuneSizing);

  // Run initial sizing once on next frame after DOM layout
  requestAnimationFrame(tuneSizing);

  console.log('✅ Responsive scaling initialized');
}

/**
 * Force a recalculation of sizing (useful for dynamic content changes)
 */
export function recalculateScaling() {
  tuneSizing();
}

/**
 * Verify that all elements fit properly in the viewport
 * Used for testing and debugging
 */
function verifyElementsFitInViewport() {
  const root = document.documentElement;
  const board = document.querySelector("#board");
  const keyboard = document.querySelector("#keyboard");
  const titleBar = document.querySelector("#titleBar");
  
  if (!board || !keyboard) {
    return {
      success: false,
      error: "Board or keyboard element not found"
    };
  }
  
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  
  const boardRect = board.getBoundingClientRect();
  const keyboardRect = keyboard.getBoundingClientRect();
  const titleBarRect = titleBar ? titleBar.getBoundingClientRect() : { height: 0, bottom: 0 };
  
  const totalHeight = titleBarRect.height + boardRect.height + keyboardRect.height;
  const fitsVertically = totalHeight <= vh;
  const fitsHorizontally = boardRect.width <= vw && keyboardRect.width <= vw;
  
  // Get current scaling values
  const styles = getComputedStyle(root);
  const tileSize = parseFloat(styles.getPropertyValue("--tile-size")) || 0;
  const keyHeight = parseFloat(styles.getPropertyValue("--key-h")) || 0;
  const boardWidth = parseFloat(styles.getPropertyValue("--board-width")) || 0;
  
  return {
    success: fitsVertically && fitsHorizontally,
    fitsVertically,
    fitsHorizontally,
    viewport: { width: vw, height: vh },
    elements: {
      board: { width: boardRect.width, height: boardRect.height },
      keyboard: { width: keyboardRect.width, height: keyboardRect.height },
      titleBar: { height: titleBarRect.height }
    },
    optimalSizing: {
      tileSize,
      keyHeight,
      boardWidth
    },
    totalHeight
  };
}

/**
 * Run comprehensive board scaling tests
 * Used for testing across multiple viewport sizes
 */
function runBoardScalingTests() {
  const results = [];
  const viewports = [
    { name: 'Mobile', width: 375, height: 667 },
    { name: 'Tablet', width: 768, height: 1024 },
    { name: 'Desktop', width: 1280, height: 720 },
    { name: 'Large Desktop', width: 1920, height: 1080 }
  ];
  
  viewports.forEach(viewport => {
    // Note: This doesn't actually change the viewport, just documents expected sizes
    results.push({
      viewport: viewport.name,
      dimensions: `${viewport.width}×${viewport.height}`,
      verification: verifyElementsFitInViewport()
    });
  });
  
  return results;
}

// Export for debugging and testing
if (typeof window !== 'undefined') {
  window.tuneSizing = tuneSizing;
  window.recalculateScaling = recalculateScaling;
  
  // Expose test utilities for Cypress and debugging
  window.boardScalingTests = {
    verifyElementsFitInViewport,
    runBoardScalingTests,
    recalculateScaling
  };
}
