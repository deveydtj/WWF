/**
 * layoutManager.js
 * 
 * Simple layout manager for WordSquad - delegates layout logic to CSS
 * Uses the Phase 1 layout contract: phone, tablet, and desktop
 * 
 * Part of Phase 1: Layout vocabulary alignment
 * See: docs/REQUIREMENTS.md
 * 
 * Purpose:
 * - Detect current layout (phone, tablet, desktop)
 * - Listen for layout changes at the 600px and 900px breakpoints
 * - Dispatch layout change events for other components
 * - Provide simple API for layout queries
 * 
 * Design Philosophy:
 * - CSS handles all layout rendering
 * - JavaScript only detects and communicates layout state
 * - No complex calculations or positioning logic
 * - Use native matchMedia API for efficiency
 * 
 * @module layoutManager
 */

import {
  LAYOUT_BREAKPOINTS,
  LAYOUT_MODES,
  getLayoutModeForWidth,
  isSmallLayout
} from './layoutModes.js';

const DEFAULT_LAYOUT_STATE = Object.freeze({
  mode: LAYOUT_MODES.DESKTOP,
  historyPopup: false
});

let currentLayoutState = null;

function getDocumentBody() {
  return typeof document !== 'undefined' ? document.body : null;
}

function parseSize(value, fallback) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getRootStyles() {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') {
    return { getPropertyValue: () => '' };
  }

  const root = document.documentElement || document.body;
  return root ? getComputedStyle(root) : { getPropertyValue: () => '' };
}

function getBoardAreaRect(width, minBoardWidth) {
  if (typeof document === 'undefined') {
    return {
      left: (width - minBoardWidth) / 2,
      right: (width + minBoardWidth) / 2
    };
  }

  const boardArea = typeof document.getElementById === 'function'
    ? document.getElementById('boardArea')
    : null;
  if (boardArea && typeof boardArea.getBoundingClientRect === 'function') {
    return boardArea.getBoundingClientRect();
  }

  return {
    left: (width - minBoardWidth) / 2,
    right: (width + minBoardWidth) / 2
  };
}

function normalizeLayoutState(state) {
  return {
    mode: state?.mode || DEFAULT_LAYOUT_STATE.mode,
    historyPopup: Boolean(state?.historyPopup)
  };
}

function layoutStatesEqual(a, b) {
  return Boolean(a && b && a.mode === b.mode && a.historyPopup === b.historyPopup);
}

/**
 * Calculate the full responsive layout state for the current viewport.
 *
 * This is the only place that decides both the named layout mode and whether
 * the history rail needs to behave like a popup because side-rail space is
 * constrained.
 *
 * @param {number} [width]
 * @returns {{mode:string, historyPopup:boolean}}
 */
export function calculateLayoutState(width = (typeof window !== 'undefined' ? window.innerWidth : 1200)) {
  const rootStyles = getRootStyles();
  const panelWidth = parseSize(rootStyles.getPropertyValue('--panel-width'), 240);
  const stampWidth = parseSize(rootStyles.getPropertyValue('--stamp-width'), 60);
  const computedBoardWidth = parseSize(rootStyles.getPropertyValue('--board-width'), 0);
  const minBoardWidth = Math.max(computedBoardWidth, 340);
  const gapSize = 15;
  const rect = getBoardAreaRect(width, minBoardWidth);
  const leftSpace = Math.max(0, rect.left);
  const rightSpace = Math.max(0, width - rect.right);

  const mode = getLayoutModeForWidth(width);
  let historyPopup = false;

  if (mode === LAYOUT_MODES.TABLET) {
    const inlineGaps = gapSize * 4;
    const margins = 40;
    const minRequiredWidth = panelWidth + stampWidth + minBoardWidth + inlineGaps + margins;
    historyPopup = width < minRequiredWidth;
  } else if (mode === LAYOUT_MODES.DESKTOP && width <= 1150) {
    historyPopup = true;
  } else if (mode === LAYOUT_MODES.DESKTOP && width <= 1550) {
    historyPopup = false;
  } else if (mode === LAYOUT_MODES.DESKTOP) {
    const minPanelWidth = 280;
    const margin = 40;
    historyPopup = leftSpace < minPanelWidth + margin || rightSpace < minPanelWidth + margin;
  }

  return { mode, historyPopup };
}

/**
 * Apply the layout state to the document. CSS consumes these as render output;
 * callers should read state from this module instead of body attributes.
 *
 * @param {{mode:string, historyPopup:boolean}} state
 */
export function applyLayoutStateToDocument(state) {
  const body = getDocumentBody();
  if (!body) return;

  const normalized = normalizeLayoutState(state);
  body.dataset.layout = normalized.mode;
  body.dataset.mode = normalized.mode;
  body.dataset.historyPopup = normalized.historyPopup ? 'true' : 'false';

  if (body.classList && typeof body.classList.toggle === 'function') {
    body.classList.toggle('phone-layout', normalized.mode === LAYOUT_MODES.PHONE);
    body.classList.toggle('tablet-layout', normalized.mode === LAYOUT_MODES.TABLET);
    body.classList.toggle('desktop-layout', normalized.mode === LAYOUT_MODES.DESKTOP);
    body.classList.toggle('mobile-layout', isSmallLayout(normalized.mode));
  }
}

/**
 * Read the authoritative layout state.
 *
 * @returns {{mode:string, historyPopup:boolean}}
 */
export function getCurrentLayoutState() {
  if (currentLayoutState) {
    return { ...currentLayoutState };
  }

  const body = getDocumentBody();
  if (body?.dataset?.mode) {
    return {
      mode: body.dataset.mode,
      historyPopup: body.dataset.historyPopup === 'true'
    };
  }

  return calculateLayoutState();
}

/**
 * Refresh and publish the authoritative layout state.
 *
 * @param {{dispatch?: boolean, previousState?: object}} [options]
 * @returns {{mode:string, historyPopup:boolean}}
 */
export function refreshLayoutState(options = {}) {
  const previousState = options.previousState || currentLayoutState;
  const nextState = normalizeLayoutState(calculateLayoutState());
  currentLayoutState = nextState;
  applyLayoutStateToDocument(nextState);

  if (
    options.dispatch &&
    !layoutStatesEqual(previousState, nextState) &&
    typeof document !== 'undefined' &&
    typeof CustomEvent !== 'undefined'
  ) {
    document.dispatchEvent(new CustomEvent('layoutchange', {
      detail: {
        layout: nextState.mode,
        previousLayout: previousState?.mode,
        layoutState: { ...nextState },
        previousLayoutState: previousState ? { ...previousState } : null,
        historyPopup: nextState.historyPopup,
        breakpoints: LAYOUT_BREAKPOINTS
      }
    }));
  }

  return { ...nextState };
}

export function getCurrentLayoutMode() {
  return getCurrentLayoutState().mode;
}

/**
 * LayoutManager class
 * Manages layout detection and switching between phone, tablet, and desktop modes.
 */
export class LayoutManager {
  /**
   * Initialize the layout manager
   */
  constructor() {
    this.breakpoints = LAYOUT_BREAKPOINTS;
    
    // Current layout state
    this.currentState = refreshLayoutState();
    this.currentLayout = this.currentState.mode;
    
    // Set up media query listeners
    this.setupListeners();

    console.log('[LayoutManager] Initialized with layout:', this.currentLayout);
  }
  
  /**
   * Detect current layout based on viewport width
   * @returns {string} 'phone', 'tablet', or 'desktop'
   */
  detectLayout() {
    return this.detectLayoutState().mode;
  }

  /**
   * Detect the complete current layout state.
   * @returns {{mode:string, historyPopup:boolean}}
   */
  detectLayoutState() {
    return calculateLayoutState();
  }
  
  /**
   * Set up media query listener for breakpoint changes
   * Uses matchMedia API for efficient breakpoint detection
   */
  setupListeners() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    this.mediaQueries = [
      window.matchMedia(`(max-width: ${this.breakpoints.PHONE_MAX}px)`),
      window.matchMedia(`(min-width: ${this.breakpoints.PHONE_MAX + 1}px) and (max-width: ${this.breakpoints.TABLET_MAX}px)`),
      window.matchMedia(`(min-width: ${this.breakpoints.TABLET_MAX + 1}px)`)
    ];

    this.mediaQueries.forEach((query) => {
      query.addEventListener('change', () => {
        this.refresh();
      });
    });
  }
  
  /**
   * Handle layout change event
   * @param {string|{mode:string,historyPopup:boolean}} newLayout - The new layout
   */
  handleLayoutChange(newLayout) {
    const nextState = typeof newLayout === 'string'
      ? { ...calculateLayoutState(), mode: newLayout }
      : normalizeLayoutState(newLayout);

    // Skip if layout hasn't changed
    if (layoutStatesEqual(nextState, this.currentState)) {
      return;
    }
    
    console.log('[LayoutManager] Layout changed:', this.currentState, '->', nextState);
    
    // Capture previous layout before updating
    const previousState = this.currentState;
    
    // Update current layout
    this.currentState = nextState;
    this.currentLayout = nextState.mode;
    
    // Update body classes
    currentLayoutState = nextState;
    applyLayoutStateToDocument(nextState);

    if (typeof document !== 'undefined' && typeof CustomEvent !== 'undefined') {
      document.dispatchEvent(new CustomEvent('layoutchange', {
        detail: {
          layout: nextState.mode,
          previousLayout: previousState?.mode,
          layoutState: { ...nextState },
          previousLayoutState: previousState ? { ...previousState } : null,
          historyPopup: nextState.historyPopup,
          breakpoints: this.breakpoints
        }
      }));
    }
  }
  
  /**
   * Apply layout-specific class to body element
   */
  applyLayoutClass() {
    applyLayoutStateToDocument(this.currentState || { mode: this.currentLayout, historyPopup: false });
  }

  /**
   * Check if current layout is phone
   * @returns {boolean} True if phone layout is active
   */
  isPhone() {
    return this.currentLayout === LAYOUT_MODES.PHONE;
  }

  /**
   * Check if current layout is tablet
   * @returns {boolean} True if tablet layout is active
   */
  isTablet() {
    return this.currentLayout === LAYOUT_MODES.TABLET;
  }
  
  /**
   * Check if current layout is a smaller-screen layout.
   *
   * Kept for compatibility while call sites migrate from mobile naming.
   * @returns {boolean} True if phone or tablet layout is active
   */
  isMobile() {
    return isSmallLayout(this.currentLayout);
  }
  
  /**
   * Check if current layout is desktop
   * @returns {boolean} True if desktop layout is active
   */
  isDesktop() {
    return this.currentLayout === LAYOUT_MODES.DESKTOP;
  }
  
  /**
   * Get current layout name
   * @returns {string} Current layout ('phone', 'tablet', or 'desktop')
   */
  getCurrentLayout() {
    return this.currentLayout;
  }

  /**
   * Get complete layout state.
   * @returns {{mode:string, historyPopup:boolean}}
   */
  getCurrentLayoutState() {
    return { ...this.currentState };
  }
  
  /**
   * Get the legacy compact/desktop breakpoint value.
   *
   * Prefer getBreakpoints() for new code.
   * @returns {number} Tablet maximum width in pixels
   */
  getBreakpoint() {
    return this.breakpoints.TABLET_MAX;
  }

  /**
   * Get the named layout breakpoints.
   * @returns {{PHONE_MAX:number,TABLET_MAX:number}}
   */
  getBreakpoints() {
    return this.breakpoints;
  }
  
  /**
   * Force a layout check and update if needed
   * Useful after window resize or orientation change
   */
  refresh() {
    const newState = this.detectLayoutState();
    if (!layoutStatesEqual(newState, this.currentState)) {
      this.handleLayoutChange(newState);
    }

    return { ...this.currentState };
  }
}

/**
 * Instances of LayoutManager are created and initialized
 * by the application bootstrap logic (e.g. appInitializer.js).
 * This module only exports the class definition.
 */
