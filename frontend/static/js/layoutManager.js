/**
 * layoutManager.js
 * 
 * Simple layout manager for WordSquad - delegates layout logic to CSS
 * Manages the single breakpoint (768px) between mobile and desktop layouts
 * 
 * Part of Phase 1: File Structure Reorganization
 * See: docs/LAYOUT_REFACTORING_PLAN.md
 * 
 * Purpose:
 * - Detect current layout (mobile vs desktop)
 * - Listen for layout changes at the 768px breakpoint
 * - Dispatch layout change events for other components
 * - Provide simple API for layout queries
 * 
 * TODO (Phase 4): Activate this manager in appInitializer.js
 * TODO (Phase 4): Replace applyLayoutMode() logic in utils.js
 * TODO (Phase 4): Update panel managers to use layout events
 * 
 * Design Philosophy:
 * - CSS handles all layout rendering
 * - JavaScript only detects and communicates layout state
 * - No complex calculations or positioning logic
 * - Use native matchMedia API for efficiency
 * 
 * @module layoutManager
 */

/**
 * LayoutManager class
 * Manages layout detection and switching between mobile and desktop modes
 */
export class LayoutManager {
  /**
   * Initialize the layout manager
   */
  constructor() {
    // Single breakpoint between mobile and desktop
    this.breakpoint = 768;
    
    // Current layout state
    this.currentLayout = this.detectLayout();
    
    // Set up media query listener
    this.setupListeners();
    
    // Apply initial layout class to body
    this.applyLayoutClass();
    
    console.log('[LayoutManager] Initialized with layout:', this.currentLayout);
  }
  
  /**
   * Detect current layout based on viewport width
   * @returns {string} 'mobile' or 'desktop'
   */
  detectLayout() {
    return window.innerWidth <= this.breakpoint ? 'mobile' : 'desktop';
  }
  
  /**
   * Set up media query listener for breakpoint changes
   * Uses matchMedia API for efficient breakpoint detection
   */
  setupListeners() {
    // Create media query matcher
    this.mediaQuery = window.matchMedia(`(max-width: ${this.breakpoint}px)`);
    
    // Listen for changes
    this.mediaQuery.addEventListener('change', (e) => {
      this.handleLayoutChange(e.matches ? 'mobile' : 'desktop');
    });
  }
  
  /**
   * Handle layout change event
   * @param {string} newLayout - The new layout ('mobile' or 'desktop')
   */
  handleLayoutChange(newLayout) {
    // Skip if layout hasn't changed
    if (newLayout === this.currentLayout) {
      return;
    }
    
    console.log('[LayoutManager] Layout changed:', this.currentLayout, '->', newLayout);
    
    // Update current layout
    this.currentLayout = newLayout;
    
    // Update body classes
    this.applyLayoutClass();
    
    // Dispatch custom event for other components to listen to
    const event = new CustomEvent('layoutchange', {
      detail: { 
        layout: newLayout,
        previousLayout: this.currentLayout === 'mobile' ? 'desktop' : 'mobile',
        breakpoint: this.breakpoint
      }
    });
    document.dispatchEvent(event);
  }
  
  /**
   * Apply layout-specific class to body element
   */
  applyLayoutClass() {
    document.body.classList.toggle('mobile-layout', this.currentLayout === 'mobile');
    document.body.classList.toggle('desktop-layout', this.currentLayout === 'desktop');
  }
  
  /**
   * Check if current layout is mobile
   * @returns {boolean} True if mobile layout is active
   */
  isMobile() {
    return this.currentLayout === 'mobile';
  }
  
  /**
   * Check if current layout is desktop
   * @returns {boolean} True if desktop layout is active
   */
  isDesktop() {
    return this.currentLayout === 'desktop';
  }
  
  /**
   * Get current layout name
   * @returns {string} Current layout ('mobile' or 'desktop')
   */
  getCurrentLayout() {
    return this.currentLayout;
  }
  
  /**
   * Get the breakpoint value
   * @returns {number} Breakpoint in pixels
   */
  getBreakpoint() {
    return this.breakpoint;
  }
  
  /**
   * Force a layout check and update if needed
   * Useful after window resize or orientation change
   */
  refresh() {
    const newLayout = this.detectLayout();
    if (newLayout !== this.currentLayout) {
      this.handleLayoutChange(newLayout);
    }
  }
}

/**
 * Create and export a singleton instance
 * TODO (Phase 4): Initialize in appInitializer.js instead of here
 */
// export const layoutManager = new LayoutManager();
