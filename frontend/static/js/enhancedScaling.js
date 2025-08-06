/**
 * Enhanced Display Scaling System
 * Modern, device-aware scaling with comprehensive viewport management
 */

/**
 * Device capability detection and viewport analysis
 */
export class ViewportAnalyzer {
  constructor() {
    this.updateViewportInfo();
    this.setupEventListeners();
  }

  updateViewportInfo() {
    this.viewport = {
      // Basic dimensions
      width: window.innerWidth,
      height: window.innerHeight,
      
      // Visual viewport (accounts for virtual keyboards)
      visualWidth: window.visualViewport?.width || window.innerWidth,
      visualHeight: window.visualViewport?.height || window.innerHeight,
      
      // Device capabilities
      devicePixelRatio: window.devicePixelRatio || 1,
      orientation: screen.orientation?.type || 'portrait-primary',
      
      // Touch capabilities
      isTouchDevice: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      
      // Environment info
      safeAreaInsets: {
        top: this.getCSSEnvValue('safe-area-inset-top'),
        right: this.getCSSEnvValue('safe-area-inset-right'),
        bottom: this.getCSSEnvValue('safe-area-inset-bottom'),
        left: this.getCSSEnvValue('safe-area-inset-left')
      },
      
      // Keyboard detection
      keyboardVisible: this.detectVirtualKeyboard()
    };
    
    this.deviceCategory = this.categorizeDevice();
    this.scalingContext = this.determineScalingContext();
  }

  getCSSEnvValue(property) {
    const testEl = document.createElement('div');
    testEl.style.position = 'fixed';
    testEl.style.top = `env(${property}, 0px)`;
    document.body.appendChild(testEl);
    const value = parseInt(getComputedStyle(testEl).top) || 0;
    document.body.removeChild(testEl);
    return value;
  }

  detectVirtualKeyboard() {
    if (!window.visualViewport) return false;
    
    const heightDifference = window.innerHeight - window.visualViewport.height;
    const widthDifference = window.innerWidth - window.visualViewport.width;
    
    // Virtual keyboard typically reduces height significantly
    return heightDifference > 150 && Math.abs(widthDifference) < 50;
  }

  categorizeDevice() {
    const { width, height, isTouchDevice } = this.viewport;
    const minDimension = Math.min(width, height);
    const maxDimension = Math.max(width, height);
    
    if (minDimension < 320) return 'tiny-mobile'; // Very small phones
    if (minDimension < 400) return 'small-mobile';
    if (minDimension < 600) return 'mobile';
    if (minDimension < 900 && isTouchDevice) return 'tablet';
    if (maxDimension < 1200) return 'small-desktop';
    if (maxDimension < 1920) return 'desktop';
    return 'large-desktop';
  }

  determineScalingContext() {
    const { width, height, keyboardVisible } = this.viewport;
    const aspectRatio = width / height;
    
    return {
      category: this.deviceCategory,
      isLandscape: aspectRatio > 1,
      isNarrow: aspectRatio < 0.6,
      isWide: aspectRatio > 1.8,
      isSquare: Math.abs(aspectRatio - 1) < 0.1,
      keyboardVisible,
      availableHeight: keyboardVisible ? this.viewport.visualHeight : height,
      availableWidth: width,
      needsCompactMode: height < 600 || keyboardVisible
    };
  }

  setupEventListeners() {
    window.addEventListener('resize', () => this.updateViewportInfo());
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.updateViewportInfo(), 100);
    });
    
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this.updateViewportInfo());
    }
  }
}

/**
 * Advanced scaling calculator with device-aware algorithms
 */
export class ScalingCalculator {
  constructor(viewportAnalyzer) {
    this.viewport = viewportAnalyzer;
    this.constraints = this.getScalingConstraints();
  }

  getScalingConstraints() {
    const { category, isTouchDevice } = this.viewport.viewport;
    
    const baseConstraints = {
      minTileSize: 24,
      maxTileSize: 80,
      targetAspectRatio: 5/6, // 5 cols, 6 rows
      minTouchTarget: isTouchDevice ? 44 : 32,
      gapRatio: 0.15, // Gap as ratio of tile size
      boardPadding: 20,
      keyboardBuffer: 60
    };

    // Device-specific adjustments
    const deviceAdjustments = {
      'tiny-mobile': {
        minTileSize: 18,
        maxTileSize: 32,
        keyboardBuffer: 30,
        gapRatio: 0.10
      },
      'small-mobile': {
        minTileSize: 20,
        maxTileSize: 40,
        keyboardBuffer: 40,
        gapRatio: 0.12
      },
      'mobile': {
        minTileSize: 24,
        maxTileSize: 48,
        keyboardBuffer: 50,
        gapRatio: 0.13
      },
      'tablet': {
        minTileSize: 32,
        maxTileSize: 60,
        keyboardBuffer: 60,
        gapRatio: 0.14
      },
      'desktop': {
        minTileSize: 40,
        maxTileSize: 70,
        keyboardBuffer: 40,
        gapRatio: 0.16
      },
      'large-desktop': {
        minTileSize: 50,
        maxTileSize: 65, // Prevent tiles from becoming too large
        keyboardBuffer: 30,
        gapRatio: 0.15
      }
    };

    return { ...baseConstraints, ...deviceAdjustments[category] };
  }

  calculateOptimalScaling(rows = 6, cols = 5) {
    this.viewport.updateViewportInfo();
    const { availableWidth, availableHeight, needsCompactMode, keyboardVisible } = this.viewport.scalingContext;
    
    // Calculate UI element heights
    const uiHeights = this.calculateUIHeights();
    
    // Enhanced keyboard buffer calculation
    let keyboardBuffer = this.constraints.keyboardBuffer;
    if (keyboardVisible) {
      keyboardBuffer += 40; // Extra space when virtual keyboard is visible
    }
    if (needsCompactMode) {
      keyboardBuffer = Math.min(keyboardBuffer, 30); // Reduce buffer in compact mode
    }
    
    // Calculate available space for the board
    const availableForBoard = {
      width: availableWidth - (this.constraints.boardPadding * 2),
      height: availableHeight - uiHeights.total - keyboardBuffer
    };

    // Calculate optimal tile size based on constraints
    const tileSizeByWidth = (availableForBoard.width - (this.constraints.gapRatio * this.constraints.maxTileSize * (cols - 1))) / cols;
    const tileSizeByHeight = (availableForBoard.height - (this.constraints.gapRatio * this.constraints.maxTileSize * (rows - 1))) / rows;
    
    let optimalTileSize = Math.min(tileSizeByWidth, tileSizeByHeight);
    
    // Apply constraints
    optimalTileSize = Math.max(this.constraints.minTileSize, optimalTileSize);
    optimalTileSize = Math.min(this.constraints.maxTileSize, optimalTileSize);
    
    // Ensure minimum touch target size
    if (this.viewport.viewport.isTouchDevice) {
      optimalTileSize = Math.max(optimalTileSize, this.constraints.minTouchTarget);
    }
    
    // Compact mode adjustments - more aggressive on very small screens
    if (needsCompactMode) {
      const compactFactor = availableHeight < 500 ? 0.8 : 0.9;
      optimalTileSize *= compactFactor;
    }
    
    // Prevent tiles from being too small on very small screens
    const minViableTileSize = this.viewport.viewport.width < 300 ? 18 : 20;
    optimalTileSize = Math.max(optimalTileSize, minViableTileSize);
    
    // Calculate derived values
    const gap = Math.max(3, Math.min(12, optimalTileSize * this.constraints.gapRatio));
    const boardWidth = (optimalTileSize * cols) + (gap * (cols - 1));
    const boardHeight = (optimalTileSize * rows) + (gap * (rows - 1));
    
    // Calculate scale factor for UI elements
    const scaleFactor = optimalTileSize / 60; // 60px is our baseline
    
    return {
      tileSize: Math.round(optimalTileSize),
      gap: Math.round(gap),
      boardWidth: Math.round(boardWidth),
      boardHeight: Math.round(boardHeight),
      scaleFactor: Math.round(scaleFactor * 100) / 100,
      constraints: this.constraints,
      viewport: this.viewport.scalingContext,
      uiHeights,
      availableForBoard,
      fitsInViewport: this.validateFit(boardWidth, boardHeight + uiHeights.total + keyboardBuffer)
    };
  }

  calculateUIHeights() {
    const elements = {
      title: this.getElementHeight('titleBar') || 60,
      lobby: this.getElementHeight('lobbyHeader') || 40,
      leaderboard: this.getElementHeight('leaderboard') || 50,
      input: this.getElementHeight('inputArea') || 60,
      keyboard: this.getElementHeight('keyboard') || 120,
      message: 30, // Reserve space for messages
      margins: 40 // Additional margins and padding
    };
    
    elements.total = Object.values(elements).reduce((sum, height) => sum + height, 0);
    return elements;
  }

  getElementHeight(id) {
    const element = document.getElementById(id);
    return element ? element.offsetHeight : 0;
  }

  validateFit(boardWidth, totalHeight) {
    const { availableWidth, availableHeight } = this.viewport.scalingContext;
    
    return {
      fitsWidth: boardWidth <= availableWidth,
      fitsHeight: totalHeight <= availableHeight,
      widthRatio: boardWidth / availableWidth,
      heightRatio: totalHeight / availableHeight,
      overall: boardWidth <= availableWidth && totalHeight <= availableHeight
    };
  }
}

/**
 * Modern CSS property manager for enhanced scaling
 */
export class CSSScalingManager {
  constructor() {
    this.root = document.documentElement;
  }

  applyScaling(scalingResult) {
    const { tileSize, gap, boardWidth, scaleFactor } = scalingResult;
    
    // Apply core scaling properties
    this.setProperty('--tile-size', `${tileSize}px`);
    this.setProperty('--tile-gap', `${gap}px`);
    this.setProperty('--board-width', `${boardWidth}px`);
    this.setProperty('--ui-scale', scaleFactor);
    
    // Apply modern responsive properties
    this.setProperty('--current-tile-size', `${tileSize}px`);
    this.setProperty('--current-scale-factor', scaleFactor);
    
    // Update keyboard scaling for better visibility
    this.updateKeyboardScaling(scalingResult);
    
    // Apply accessibility enhancements
    this.applyAccessibilityScaling(scalingResult);
    
    return true;
  }

  updateKeyboardScaling(scalingResult) {
    const { scaleFactor, viewport } = scalingResult;
    
    if (viewport.needsCompactMode) {
      // On very small displays, ensure keyboard doesn't get too small
      const minKeyboardScale = viewport.availableWidth < 350 ? 0.85 : 0.8;
      const keyboardScale = Math.max(minKeyboardScale, Math.min(scaleFactor * 0.9, 1));
      this.setProperty('--keyboard-scale', keyboardScale);
      this.setProperty('--keyboard-height', 'auto');
      console.log(`🔧 Compact mode keyboard scaling: ${keyboardScale} (viewport: ${viewport.availableWidth}px)`);
    } else {
      this.setProperty('--keyboard-scale', scaleFactor);
      this.setProperty('--keyboard-height', 'auto');
    }
  }

  applyAccessibilityScaling(scalingResult) {
    const { tileSize, scaleFactor } = scalingResult;
    
    // Ensure minimum font sizes for accessibility
    const minFontSize = Math.max(14, tileSize * 0.25);
    this.setProperty('--min-font-size', `${minFontSize}px`);
    
    // Scale touch targets appropriately
    const minTouchTarget = Math.max(44, tileSize);
    this.setProperty('--min-touch-target', `${minTouchTarget}px`);
  }

  setProperty(property, value) {
    this.root.style.setProperty(property, value);
  }

  getProperty(property) {
    return getComputedStyle(this.root).getPropertyValue(property);
  }
}

/**
 * Main enhanced scaling system
 */
export class EnhancedScalingSystem {
  constructor() {
    this.viewportAnalyzer = new ViewportAnalyzer();
    this.calculator = new ScalingCalculator(this.viewportAnalyzer);
    this.cssManager = new CSSScalingManager();
    this.isInitialized = false;
  }

  initialize() {
    if (this.isInitialized) return;
    
    this.setupEventListeners();
    this.applyOptimalScaling();
    this.isInitialized = true;
    
    console.log('🚀 Enhanced scaling system initialized');
  }

  applyOptimalScaling(rows = 6) {
    try {
      const scalingResult = this.calculator.calculateOptimalScaling(rows);
      const success = this.cssManager.applyScaling(scalingResult);
      
      if (success) {
        this.verifyAndAdjust(scalingResult);
        console.log('✅ Enhanced scaling applied successfully', scalingResult);
        return { success: true, result: scalingResult };
      } else {
        console.warn('⚠️ Enhanced scaling application failed');
        return { success: false, fallback: true };
      }
    } catch (error) {
      console.error('❌ Enhanced scaling error:', error);
      return { success: false, error, fallback: true };
    }
  }

  verifyAndAdjust(scalingResult) {
    // Verify keyboard visibility
    setTimeout(() => {
      if (!this.isKeyboardVisible()) {
        console.log('✅ Keyboard visibility confirmed');
      } else {
        console.warn('⚠️ Keyboard visibility issue detected, applying fixes');
        this.fixKeyboardVisibility();
      }
    }, 100);
  }

  isKeyboardVisible() {
    const keyboard = document.getElementById('keyboard');
    if (!keyboard) return true; // Assume visible if not found
    
    const rect = keyboard.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    
    // Check if keyboard is fully visible with some buffer
    const isVisible = (rect.bottom + 10) <= viewportHeight && rect.top >= 0;
    
    return isVisible;
  }

  fixKeyboardVisibility() {
    const keyboard = document.getElementById('keyboard');
    if (!keyboard) {
      console.log('🔧 Keyboard element not found, skipping visibility fix');
      return;
    }
    
    // Get current viewport info
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const keyboardRect = keyboard.getBoundingClientRect();
    
    console.log(`🔧 Keyboard visibility check: viewport=${viewportHeight}px, keyboard.bottom=${keyboardRect.bottom}px, keyboard.top=${keyboardRect.top}px`);
    
    // Only apply fixes if keyboard is actually cut off
    if (keyboardRect.bottom > viewportHeight + 5) { // Add 5px buffer
      // Apply CSS-based fix first
      keyboard.style.position = 'fixed';
      keyboard.style.bottom = `max(0px, env(safe-area-inset-bottom, 0px))`;
      keyboard.style.left = '50%';
      keyboard.style.transform = 'translateX(-50%)';
      keyboard.style.zIndex = '1000';
      
      // Ensure keyboard isn't too small on very small displays
      const minKeyboardHeight = Math.max(120, viewportHeight * 0.2);
      const maxKeyboardHeight = Math.min(200, viewportHeight * 0.35);
      keyboard.style.minHeight = `${minKeyboardHeight}px`;
      keyboard.style.maxHeight = `${maxKeyboardHeight}px`;
      keyboard.style.overflow = 'hidden';
      
      console.log(`🔧 Applied keyboard visibility fix: minHeight=${minKeyboardHeight}px, maxHeight=${maxKeyboardHeight}px`);
    } else {
      console.log('🔧 Keyboard is visible, no fix needed');
    }
  }

  setupEventListeners() {
    // Debounced resize handler
    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this.applyOptimalScaling();
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.applyOptimalScaling(), 200);
    });

    // Visual viewport changes (virtual keyboard)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
    }
  }

  // Diagnostic methods for testing
  getDiagnostics() {
    return {
      viewport: this.viewportAnalyzer.viewport,
      scalingContext: this.viewportAnalyzer.scalingContext,
      deviceCategory: this.viewportAnalyzer.deviceCategory,
      constraints: this.calculator.constraints,
      currentScaling: this.calculator.calculateOptimalScaling()
    };
  }
}

// Initialize and expose globally
let enhancedScalingSystem;

export function initializeEnhancedScaling() {
  if (!enhancedScalingSystem) {
    enhancedScalingSystem = new EnhancedScalingSystem();
    enhancedScalingSystem.initialize();
    
    // Expose for debugging
    if (typeof window !== 'undefined') {
      window.enhancedScaling = enhancedScalingSystem;
    }
  }
  
  return enhancedScalingSystem;
}

export { enhancedScalingSystem };