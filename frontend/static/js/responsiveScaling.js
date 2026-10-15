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
 * The rendered center region supplies the budget after header and shell space.
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

  // The shell has already removed the lobby header, gutters, and safe areas.
  // Read all remaining reservations before committing sizing tokens.
  const columnWidth = gameColumn?.getBoundingClientRect?.().width || gameplayWidth;
  const gap = clamp(Math.min(vw, vh) * 0.012, 6, 12);
  const kbGap = clamp(Math.min(vw, vh) * 0.010, 4, 8);
  const gameColumnGap = computedPixels(gameColumn, 'rowGap')
    || computedPixels(gameColumn, 'gap') || 6;
  const controlGutter = computedPixels(gameColumn, '--board-control-gutter') || 52;
  const keyboardShown = document.body?.dataset?.showOnscreenKeyboard !== 'false';
  const touchFirst = document.body?.dataset?.interaction !== 'keyboard-first';
  const keyH = clamp(visualHeight * 0.06, touchFirst ? 44 : 34, 56);
  const keyboardH = keyboardShown ? 3 * keyH + 2 * kbGap : 0;
  const verticalBudget = calculateVerticalBudget({
    layoutViewportBlockSize: layoutHeight,
    visualViewportBlockSize: visualHeight,
    gameplayBlockSize: gameplayHeight,
    headerBlockSize: measuredBlockSize(titleBar),
    statusBlockSize: measuredBlockSize(message),
    statusMinimumBlockSize: 20,
    actionRowBlockSize: measuredBlockSize(inputArea),
    keyboardBlockSize: keyboardH,
    verticalGap: gameColumnGap,
    chatOpen: Boolean(document.body?.classList?.contains('chat-open')),
    nativeKeyboardLikelyOpen: viewportSnapshot?.nativeKeyboardLikelyOpen
  }, { verticalGapCount: keyboardShown ? 4 : 3 });
  // Short windows scroll the vertical stack rather than shrinking tiles away.
  const tile = Math.max(30, Math.min(
    (columnWidth - 2 * controlGutter - 4 * gap) / 5,
    (verticalBudget.availableBoardBlockSize - 5 * gap) / 6,
    66
  ));
  const boardWidth = tile * 5 + gap * 4;
  const safeArea = viewportSnapshot?.safeArea || {};
  const safeAreaTop = Number.isFinite(safeArea.top) ? safeArea.top : 0;
  const safeAreaBottom = Number.isFinite(safeArea.bottom) ? safeArea.bottom : 0;

  // Fractional sizes track continuous resizes without one-pixel tile steps.
  const tokens = {
    "--gap": gap + "px",
    "--tile-gap": gap + "px",
    "--keyboard-row-gap": kbGap + "px",
    "--keyboard-inline-gap": kbGap + "px",
    "--tile-size": tile + "px",
    "--keyboard-key-height": keyH + "px",
    "--available-board-block-size": verticalBudget.availableBoardBlockSize + "px",
    "--board-width": boardWidth + "px",
    "--tile-font": clamp(tile * 0.52, 12, 34) + "px",
    "--key-font": clamp(keyH * 0.38, 11, 18) + "px",
    "--ui-font": clamp(Math.min(vw, vh) * 0.020, 12, 16) + "px",
    "--radius": clamp(Math.min(tile, keyH) * 0.16, 6, 12) + "px",
    "--ui-scale": tile / 60,
    "--current-scale-factor": tile / 60,
    "--current-tile-size": tile + "px"
  };
  Object.entries(tokens).forEach(([property, value]) => {
    if (root.style.getPropertyValue?.(property) !== String(value)) {
      root.style.setProperty(property, value);
    }
  });

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
        availableBlockSize: keyboardH
      },
      tokens: {
        '--tile-size': tile,
        '--tile-gap': gap,
        '--board-width': boardWidth,
        '--keyboard-key-height': keyH,
        '--keyboard-row-gap': kbGap,
        '--keyboard-inline-gap': kbGap,
        '--available-board-block-size': verticalBudget.availableBoardBlockSize
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
