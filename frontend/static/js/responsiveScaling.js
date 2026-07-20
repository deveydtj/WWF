/**
 * responsiveScaling.js
 * Modern responsive scaling system inspired by best practices
 * 
 * Key features:
 * - Dynamic viewport height calculation (dvh support)
 * - Tile and keyboard sizing that fits all content in viewport
 * - Sizing updates driven by the shared ViewportService scheduler
 * - Mobile-first approach with progressive enhancement
 */

import {
  calculateModalMetrics,
  calculateVerticalBudget,
  createModalMetricTokens,
  reportLayoutMetricInvariants
} from './layout/layoutMetricsEngine.js';

const DEVELOPMENT_INVARIANTS_ENABLED =
  typeof __WORD_SQUAD_DEVELOPMENT__ !== 'undefined'
  && __WORD_SQUAD_DEVELOPMENT__;

/**
 * Clamp a number between a minimum and maximum value
 */
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function measuredBlockSize(element) {
  const height = element?.getBoundingClientRect?.().height;
  return Number.isFinite(height) && height > 0 ? height : 0;
}

function computedPixels(element, property) {
  if (!element || typeof getComputedStyle !== 'function') return 0;
  const styles = getComputedStyle(element);
  return parseFloat(styles?.[property] || styles?.getPropertyValue?.(property)) || 0;
}

/**
 * Calculate optimal sizing for tiles, keyboard, and UI elements
 * Based on available viewport space
 * 
 * Note: This function expects the DOM to be fully loaded. If called during
 * initialization before elements are rendered, it will use fallback values
 * for header height (60px) which may result in less accurate initial sizing.
 */
function tuneSizing(viewportSnapshot = null) {
  const root = document.documentElement;
  const titleBar = document.querySelector("#titleBar");
  const gameColumn = document.querySelector("#gameColumn");
  const inputArea = document.querySelector("#inputArea");
  const message = document.querySelector("#message");
  const keyboard = document.querySelector("#keyboard");
  const board = document.querySelector("#board");

  // Viewport dimensions
  const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  const measuredLayoutHeight = viewportSnapshot?.layoutViewport?.height;
  const layoutHeight = Number.isFinite(measuredLayoutHeight) && measuredLayoutHeight > 0
    ? measuredLayoutHeight
    : vh;
  const measuredVisualHeight = viewportSnapshot?.visualViewport?.height;
  const visualHeight = Number.isFinite(measuredVisualHeight) && measuredVisualHeight > 0
    ? measuredVisualHeight
    : layoutHeight;

  // ViewportService measures the content box of #centerPanel after the shell
  // has assigned app padding and any rail columns. Board width must use that
  // center-region budget rather than the full viewport.
  const measuredGameplayWidth = viewportSnapshot?.gameplayContainer?.width;
  const gameplayWidth = Number.isFinite(measuredGameplayWidth) && measuredGameplayWidth > 0
    ? measuredGameplayWidth
    : document.querySelector('#centerPanel')?.clientWidth || vw;
  const measuredGameplayHeight = viewportSnapshot?.gameplayContainer?.height;
  const gameplayHeight = Number.isFinite(measuredGameplayHeight) && measuredGameplayHeight > 0
    ? measuredGameplayHeight
    : layoutHeight;

  // Vertical padding approximation from CSS variables (fallback if not computed)
  const styles = getComputedStyle(root);
  const padY = parseFloat(styles.getPropertyValue("--pad-y")) || 14;

  // Calculate responsive gaps
  const gap = clamp(Math.round(Math.min(vw, vh) * 0.012), 6, 12);
  const kbGap = clamp(Math.round(Math.min(vw, vh) * 0.010), 6, 10);
  root.style.setProperty("--gap", gap + "px");
  root.style.setProperty("--tile-gap", gap + "px");
  root.style.setProperty("--keyboard-row-gap", kbGap + "px");
  root.style.setProperty("--keyboard-inline-gap", kbGap + "px");

  // Width-driven tile size (guaranteed to fit 5 tiles + 4 gaps)
  const usableW = gameplayWidth - 2; // small safety margin
  const tileByWidth = Math.floor((usableW - 4 * gap) / 5);

  // Height-driven tile size: ensure board + keyboard + header fits in viewport
  // Note: Keyboard uses flex layout with 3 rows. This calculation assumes a standard
  // 3-row QWERTY layout. If keyboard layout changes, this may need adjustment.
  const headerH = measuredBlockSize(titleBar) || 60;
  const statusH = measuredBlockSize(message);
  const stableStatusH = Math.max(computedPixels(message, 'minHeight'), 20);
  const actionRowH = measuredBlockSize(inputArea);
  const gameColumnGap = computedPixels(gameColumn, 'rowGap')
    || computedPixels(gameColumn, 'gap')
    || parseFloat(styles.getPropertyValue('--component-gap'))
    || gap;
  const keyboardPadding = computedPixels(keyboard, 'paddingTop')
    + computedPixels(keyboard, 'paddingBottom');
  const safeArea = viewportSnapshot?.safeArea || {};
  const safeAreaTop = Number.isFinite(safeArea.top) ? safeArea.top : 0;
  const safeAreaBottom = Number.isFinite(safeArea.bottom) ? safeArea.bottom : 0;
  const chatOpen = Boolean(document.body?.classList?.contains('chat-open'));

  // Start with width-constrained tile size
  let tile = clamp(tileByWidth, 34, 66);

  /**
   * Check if a given tile size fits in the viewport
   */
  function fits(t) {
    const keyH = clamp(Math.round(t * 0.80), 34, 56);
    const boardH = 6 * t + 5 * gap;
    const kbH = 3 * keyH + 2 * kbGap + keyboardPadding;
    const verticalBudget = calculateVerticalBudget({
      layoutViewportBlockSize: layoutHeight,
      visualViewportBlockSize: visualHeight,
      gameplayBlockSize: gameplayHeight,
      headerBlockSize: headerH,
      statusBlockSize: statusH,
      statusMinimumBlockSize: stableStatusH,
      actionRowBlockSize: actionRowH,
      keyboardBlockSize: kbH,
      verticalGap: gameColumnGap,
      safeAreaTop,
      safeAreaBottom,
      additionalReservedBlockSize: padY * 2,
      chatOpen,
      nativeKeyboardLikelyOpen: viewportSnapshot?.nativeKeyboardLikelyOpen
    });
    const total = verticalBudget.reservedBlockSize + boardH;
    return {
      ok: boardH <= verticalBudget.availableBoardBlockSize,
      keyH,
      total,
      verticalBudget
    };
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
  root.style.setProperty("--keyboard-key-height", r.keyH + "px");
  root.style.setProperty(
    "--available-board-block-size",
    r.verticalBudget.availableBoardBlockSize + "px"
  );

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
  // Baseline of 60px represents the standard tile size for desktop viewports
  const BASELINE_TILE_SIZE = 60;
  const scaleFactor = tile / BASELINE_TILE_SIZE;
  root.style.setProperty("--ui-scale", scaleFactor);
  root.style.setProperty("--current-scale-factor", scaleFactor);
  root.style.setProperty("--current-tile-size", tile + "px");

  // Modal metrics share the pure engine with the board. In particular, they
  // use the visual viewport (including its pan offset) so native keyboards and
  // browser chrome cannot leave a close control outside the visible bounds.
  const measuredVisualWidth = viewportSnapshot?.visualViewport?.width;
  const visualWidth = Number.isFinite(measuredVisualWidth) && measuredVisualWidth > 0
    ? measuredVisualWidth
    : vw;
  const modalMetrics = calculateModalMetrics({
    visualViewport: {
      width: visualWidth,
      height: visualHeight,
      offsetTop: viewportSnapshot?.visualViewport?.offsetTop || 0,
      offsetLeft: viewportSnapshot?.visualViewport?.offsetLeft || 0
    },
    safeArea: {
      top: safeAreaTop,
      right: Number.isFinite(safeArea.right) ? safeArea.right : 0,
      bottom: safeAreaBottom,
      left: Number.isFinite(safeArea.left) ? safeArea.left : 0
    },
    board: { inlineSize: boardWidth, tileSize: tile }
  });
  Object.entries(createModalMetricTokens(modalMetrics)).forEach(([property, value]) => {
    root.style.setProperty(property, value);
  });

  if (DEVELOPMENT_INVARIANTS_ENABLED && board && keyboard) {
    const boardRect = board.getBoundingClientRect();
    const keyboardRect = keyboard.getBoundingClientRect();
    reportLayoutMetricInvariants({
      board: {
        columns: 5,
        rows: 6,
        tileSize: tile,
        tileGap: gap,
        inlineSize: boardRect.width,
        blockSize: boardRect.height
      },
      keyboard: {
        inlineSize: keyboardRect.width,
        blockSize: keyboardRect.height,
        availableInlineSize: gameplayWidth,
        availableBlockSize: r.verticalBudget.reservations.keyboardBlockSize
      },
      tokens: {
        '--tile-size': tile,
        '--tile-gap': gap,
        '--board-width': boardWidth,
        '--keyboard-key-height': r.keyH,
        '--keyboard-row-gap': kbGap,
        '--keyboard-inline-gap': kbGap,
        '--available-board-block-size': r.verticalBudget.availableBoardBlockSize
      }
    }, { enabled: true });
  }

}

/**
 * Initialize responsive scaling system
 * 
 * Note: This function should only be called once during app initialization.
 * Viewport changes are owned by ViewportService; this module only calculates
 * sizing when the application layout pipeline asks it to.
 */
let isScalingInitialized = false;

export function initializeResponsiveScaling() {
  // Prevent duplicate initialization
  if (isScalingInitialized) {
    console.warn('⚠️ Responsive scaling already initialized, skipping duplicate initialization');
    return;
  }
  
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

  isScalingInitialized = true;
  console.log('✅ Responsive scaling initialized');
}

/**
 * Force a recalculation of sizing (useful for dynamic content changes)
 */
export function recalculateScaling(viewportSnapshot = null) {
  tuneSizing(viewportSnapshot);
}
