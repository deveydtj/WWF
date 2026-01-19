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
 */
function tuneSizing() {
  const root = document.documentElement;
  const app = document.querySelector("#appContainer") || document.body;
  const titleBar = document.querySelector("#titleBar");
  const keyboard = document.querySelector("#keyboard");

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
  // Estimate keyboard total height: 3 rows of keys + 2 gaps + breathing room
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
  
  if (!styles.getPropertyValue("--pad-x")) {
    root.style.setProperty("--pad-x", "16px");
  }
  if (!styles.getPropertyValue("--pad-y")) {
    root.style.setProperty("--pad-y", "14px");
  }

  // Add event listeners for resize and orientation change
  window.addEventListener("resize", tuneSizing);
  window.addEventListener("orientationchange", tuneSizing);

  // Run initial sizing
  tuneSizing();

  // Run again after fonts/layout settle
  requestAnimationFrame(tuneSizing);
  setTimeout(tuneSizing, 250);

  console.log('✅ Responsive scaling initialized');
}

/**
 * Force a recalculation of sizing (useful for dynamic content changes)
 */
export function recalculateScaling() {
  tuneSizing();
}

// Export for debugging
if (typeof window !== 'undefined') {
  window.tuneSizing = tuneSizing;
  window.recalculateScaling = recalculateScaling;
}
