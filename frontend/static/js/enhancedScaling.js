import { resetAllElementTransforms } from './utils.js';

const clampNumber = (value, min, max) => Math.min(Math.max(value, min), max);

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
    
    // Compact mode adjustments - less aggressive to preserve keyboard usability
    if (needsCompactMode) {
      // More conservative scaling during viewport changes to prevent tiny keyboards
      const compactFactor = availableHeight < 400 ? 0.85 : 0.92; // Less aggressive
      optimalTileSize *= compactFactor;
      console.log(`🔧 Compact mode keyboard scaling: ${compactFactor} (viewport: ${availableHeight}px)`);
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
    this.lastScaling = null;
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

    // Update layout metrics for responsive panel alignment
    this.updateLayoutMetrics(scalingResult);

    // Persist last scaling snapshot for later adjustments
    this.lastScaling = { ...scalingResult };
    
    // Measure actual board width and sync --board-width variable (especially important for mobile)
    this.syncBoardWidth();
    
    return true;
  }

  syncBoardWidth() {
    // Wait a frame for CSS to be applied, then measure actual board width
    setTimeout(() => {
      const board = document.getElementById('board');
      if (board) {
        const actualBoardWidth = board.getBoundingClientRect().width;
        this.setProperty('--board-width', `${actualBoardWidth}px`);
        console.log(`🔧 Synced --board-width to actual board width: ${actualBoardWidth}px`);

        if (this.lastScaling) {
          const updatedScaling = { ...this.lastScaling, boardWidth: Math.round(actualBoardWidth) };
          this.updateLayoutMetrics(updatedScaling);
          this.lastScaling = updatedScaling;
        }
      }
    }, 0);
  }

  updateLayoutMetrics(scalingResult) {
    const { boardWidth, tileSize, viewport, uiHeights } = scalingResult;
    const availableWidth = Math.max(320, viewport?.availableWidth || window.innerWidth || 1280);
    const availableHeight = Math.max(480, viewport?.availableHeight || window.innerHeight || 720);

    const baseGutter = clampNumber(availableWidth * 0.04, 12, 48);
    const layoutGridGap = clampNumber(baseGutter * 0.75, 10, 32);
    const verticalGap = clampNumber(availableHeight * 0.04, 16, 48);
    const inferredPanelWidth = clampNumber(availableWidth * 0.22, 240, 320);
    const panelPadding = clampNumber(tileSize * 0.35, 16, 28);
    const panelContentGap = clampNumber(tileSize * 0.25, 12, 24);
    const stampColumn = clampNumber(tileSize + layoutGridGap, 48, 96);

    const minLayoutWidth = boardWidth + baseGutter * 2;
    const panelMultiplier = availableWidth > 1400 ? 2 : availableWidth > 1100 ? 1.6 : 1.4;
    const idealLayoutWidth = boardWidth + inferredPanelWidth * panelMultiplier + baseGutter * 4;
    const availableForLayout = Math.max(minLayoutWidth, availableWidth - baseGutter);
    const layoutMaxWidth = Math.max(
      minLayoutWidth,
      Math.min(idealLayoutWidth, availableForLayout)
    );

    const remainingSpace = Math.max(0, availableWidth - layoutMaxWidth);
    const edgeBuffer = clampNumber(
      Math.max(remainingSpace / 2, baseGutter * 0.75),
      baseGutter * 0.75,
      Math.max(baseGutter * 3, 220)
    );

    const panelMaxHeight = Math.max(320, availableHeight - verticalGap * 2 - (uiHeights?.margins || 0));

    this.setProperty('--layout-gutter', `${Math.round(baseGutter)}px`);
    this.setProperty('--layout-grid-gap', `${Math.round(layoutGridGap)}px`);
    this.setProperty('--layout-vertical-gap', `${Math.round(verticalGap)}px`);
    this.setProperty('--layout-max-width', `${Math.round(layoutMaxWidth)}px`);
    this.setProperty('--layout-edge-buffer', `${Math.round(edgeBuffer)}px`);
    this.setProperty('--panel-width', `${Math.round(inferredPanelWidth)}px`);
    this.setProperty('--panel-padding', `${Math.round(panelPadding)}px`);
    this.setProperty('--panel-content-gap', `${Math.round(panelContentGap)}px`);
    this.setProperty('--panel-max-height', `${Math.round(panelMaxHeight)}px`);
    this.setProperty('--stamp-column-width', `${Math.round(stampColumn)}px`);
  }

  updateKeyboardScaling(scalingResult) {
    const { scaleFactor, viewport } = scalingResult;
    
    // On mobile devices (≤600px), disable keyboard scaling to allow exact board width matching
    if (viewport.availableWidth <= 600) {
      // Set keyboard scale to 1 (no scaling) for exact board width alignment
      this.setProperty('--keyboard-scale', 1);
      this.setProperty('--keyboard-height', 'auto');
      console.log(`🔧 Mobile mode: Disabled keyboard scaling for exact board width alignment (viewport: ${viewport.availableWidth}px)`);
      
      // Apply minimum height without scaling
      const keyboard = document.getElementById('keyboard');
      if (keyboard) {
        const minHeight = Math.max(100, viewport.availableHeight * 0.15); // Less aggressive minimum
        keyboard.style.minHeight = `${minHeight}px`;
        keyboard.style.maxHeight = `${Math.min(180, viewport.availableHeight * 0.35)}px`;
        // Ensure transform is none for exact width matching
        keyboard.style.transform = 'none';
      }
      return;
    }
    
    if (viewport.needsCompactMode) {
      // On very small displays, ensure keyboard doesn't get too small
      const minKeyboardScale = viewport.availableWidth < 350 ? 0.85 : 0.8;
      const keyboardScale = Math.max(minKeyboardScale, Math.min(scaleFactor * 0.9, 1));
      this.setProperty('--keyboard-scale', keyboardScale);
      this.setProperty('--keyboard-height', 'auto');
      console.log(`🔧 Compact mode keyboard scaling: ${keyboardScale} (viewport: ${viewport.availableWidth}px)`);
      
      // Force minimum keyboard dimensions
      const keyboard = document.getElementById('keyboard');
      if (keyboard) {
        const minHeight = Math.max(120, viewport.availableHeight * 0.25);
        keyboard.style.minHeight = `${minHeight}px`;
        keyboard.style.maxHeight = `${Math.min(200, viewport.availableHeight * 0.4)}px`;
      }
    } else {
      this.setProperty('--keyboard-scale', scaleFactor);
      this.setProperty('--keyboard-height', 'auto');
      
      // Reset any forced dimensions for larger screens
      const keyboard = document.getElementById('keyboard');
      if (keyboard) {
        keyboard.style.minHeight = '';
        keyboard.style.maxHeight = '';
      }
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
      // Reset all element positioning before applying new scaling
      this.resetAllElementPositioning();
      
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
    // Store scaling context for persistent keyboard monitoring
    this.lastScalingResult = scalingResult;
    
    // Verify keyboard visibility with a brief delay to allow DOM updates
    setTimeout(() => {
      this.checkKeyboardVisibility();
    }, 100);
  }

  checkKeyboardVisibility() {
    const keyboard = document.getElementById('keyboard');
    if (!keyboard) {
      console.log('✅ Keyboard element not found, skipping visibility check');
      return;
    }
    
    const rect = keyboard.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    
    console.log(`🔧 Keyboard visibility check: viewport=${viewportHeight}px, keyboard.bottom=${rect.bottom}px, keyboard.top=${rect.top}px`);
    
    // Check if keyboard is fully visible with buffer
    const isVisible = (rect.bottom + 10) <= viewportHeight && rect.top >= 0;
    
    // Additional check: ensure keyboard isn't too small (which indicates scaling issues)
    const keyboardHeight = rect.bottom - rect.top;
    const minViableHeight = Math.max(120, viewportHeight * 0.15); // Consistent minimum height
    const isTooSmall = keyboardHeight < minViableHeight;
    
    console.log(`🔧 Keyboard size check: height=${keyboardHeight}px, minRequired=${minViableHeight}px, tooSmall=${isTooSmall}`);
    
    if (!isVisible || isTooSmall) {
      console.warn('⚠️ Keyboard visibility or sizing issue detected, applying fixes');
      this.fixKeyboardVisibility();
    } else {
      // Keyboard is properly visible, reset any forced positioning to normal CSS
      this.resetAllElementPositioning();
      console.log('🔧 Keyboard is visible and properly sized, reset all positioning to normal');
    }
  }

  fixKeyboardVisibility() {
    const keyboard = document.getElementById('keyboard');
    if (!keyboard) {
      console.log('🔧 Keyboard element not found, skipping visibility fix');
      return;
    }
    
    // Get current viewport info
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const viewportWidth = window.innerWidth;
    const keyboardRect = keyboard.getBoundingClientRect();
    
    console.log(`🔧 Keyboard visibility check: viewport=${viewportWidth}x${viewportHeight}px, keyboard.bottom=${keyboardRect.bottom}px, keyboard.top=${keyboardRect.top}px`);
    
    // Check if keyboard is cut off or too small - but be more conservative
    const isSignificantlyOffScreen = keyboardRect.bottom > viewportHeight + 20; // Increased buffer to 20px
    const currentHeight = keyboardRect.bottom - keyboardRect.top;
    const minViableHeight = Math.max(120, viewportHeight * 0.15);
    const isCriticallyTooSmall = currentHeight < (minViableHeight * 0.8); // Only trigger if really too small
    
    // Check if keyboard is severely mispositioned horizontally
    const isHorizontallyBroken = keyboardRect.left < -50 || keyboardRect.right > viewportWidth + 50;
    
    // Only apply aggressive fixes if keyboard is severely broken
    const needsEmergencyFix = (isSignificantlyOffScreen && keyboardRect.top > viewportHeight) || 
                              isCriticallyTooSmall || 
                              isHorizontallyBroken;
    
    if (needsEmergencyFix) {
      console.log('🔧 Keyboard needs emergency fix - applying position: fixed and overflow: hidden');
      
      // Apply emergency CSS fixes
      keyboard.style.position = 'fixed';
      keyboard.style.bottom = `max(0px, env(safe-area-inset-bottom, 0px))`;
      keyboard.style.zIndex = '1000';
      
      // Only center horizontally if keyboard positioning is severely broken
      if (isHorizontallyBroken) {
        keyboard.style.left = '50%';
        keyboard.style.transform = 'translateX(-50%)';
        console.log('🔧 Keyboard was severely off-screen, applied centering fix');
      } else {
        // Preserve existing horizontal positioning
        keyboard.style.left = '';
        keyboard.style.transform = '';
        console.log('🔧 Keyboard horizontal position preserved');
      }
      
      // Only apply overflow: hidden if absolutely necessary
      if (isCriticallyTooSmall) {
        keyboard.style.minHeight = `${minViableHeight}px`;
        keyboard.style.maxHeight = `${Math.min(200, viewportHeight * 0.35)}px`;
        keyboard.style.overflow = 'hidden';
        console.log(`🔧 Applied size constraints: minHeight=${minViableHeight}px, overflow=hidden`);
      }
      
      console.log(`🔧 Applied emergency keyboard fix: was=${currentHeight}px, minRequired=${minViableHeight}px`);
    } else if (isSignificantlyOffScreen || currentHeight < minViableHeight) {
      // Minor positioning issue - try gentle fixes without position: fixed
      console.log('🔧 Keyboard has minor positioning issue - applying gentle fix');
      
      // Don't use position: fixed for minor issues
      keyboard.style.position = '';
      keyboard.style.bottom = '';
      keyboard.style.zIndex = '';
      keyboard.style.overflow = ''; // Don't use overflow: hidden for minor issues
      
      // Only adjust if significantly cut off
      if (isSignificantlyOffScreen) {
        const adjustment = Math.min(keyboardRect.bottom - viewportHeight + 10, 60);
        keyboard.style.transform = `translateY(-${adjustment}px)`;
        console.log(`🔧 Applied gentle keyboard adjustment: translateY(-${adjustment}px)`);
      } else {
        keyboard.style.transform = '';
      }
      
      // Apply minimum height without overflow: hidden
      if (currentHeight < minViableHeight) {
        keyboard.style.minHeight = `${minViableHeight}px`;
        console.log(`🔧 Applied minHeight without overflow constraint: ${minViableHeight}px`);
      }
    } else {
      // Keyboard is properly positioned, reset all forced CSS
      this.resetKeyboardPositioning();
      console.log('🔧 Keyboard is properly positioned, reset all forced CSS');
    }
  }

  resetKeyboardPositioning() {
    const keyboard = document.getElementById('keyboard');
    if (!keyboard) return;
    
    // Reset any inline styles that might interfere with normal CSS
    keyboard.style.position = '';
    keyboard.style.left = '';
    keyboard.style.bottom = '';
    keyboard.style.transform = '';
    keyboard.style.zIndex = '';
    keyboard.style.minHeight = '';
    keyboard.style.maxHeight = '';
    keyboard.style.overflow = '';
    keyboard.style.transformOrigin = '';
    
    console.log('🔧 Reset keyboard positioning to normal CSS');
  }

  resetInputAreaPositioning() {
    const inputArea = document.getElementById('inputArea');
    if (!inputArea) return;
    
    // Reset any inline styles that might interfere with normal CSS
    inputArea.style.transform = '';
    inputArea.style.transition = '';
    inputArea.style.marginTop = '';
    inputArea.style.marginBottom = '';
    
    console.log('🔧 Reset inputArea positioning to normal CSS');
  }

  resetAllElementPositioning() {
    // Use the comprehensive reset from utils.js for consistency
    if (typeof resetAllElementTransforms === 'function') {
      resetAllElementTransforms();
    } else {
      // Fallback: reset locally if import fails
      this.resetKeyboardPositioning();
      this.resetInputAreaPositioning();
      
      const titleBar = document.getElementById('titleBar');
      const boardArea = document.getElementById('boardArea');
      
      if (titleBar) {
        titleBar.style.marginBottom = '';
      }
      
      if (boardArea) {
        boardArea.style.marginBottom = '';
      }
      
      console.log('🔧 Reset all element positioning to normal CSS (fallback)');
    }
  }

  setupEventListeners() {
    // Debounced resize handler with scaling persistence
    let resizeTimeout;
    let lastViewportWidth = window.innerWidth;
    let lastViewportHeight = window.innerHeight;
    
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const currentWidth = window.innerWidth;
        const currentHeight = window.innerHeight;
        
        // Only re-scale if there's a significant viewport change
        const widthChange = Math.abs(currentWidth - lastViewportWidth);
        const heightChange = Math.abs(currentHeight - lastViewportHeight);
        
        if (widthChange > 50 || heightChange > 100) {
          // Before re-scaling, check if current keyboard is already adequate
          const keyboard = document.getElementById('keyboard');
          let shouldRescale = true;
          
          if (keyboard) {
            const keyboardRect = keyboard.getBoundingClientRect();
            const keyboardHeight = keyboardRect.bottom - keyboardRect.top;
            const minViableHeight = Math.max(120, currentHeight * 0.15);
            const isCurrentlyAdequate = keyboardHeight >= minViableHeight && 
                                      keyboardRect.bottom <= currentHeight + 10;
            
            if (isCurrentlyAdequate && heightChange < 200) {
              // Keyboard is already adequate and change isn't massive, just check visibility
              console.log(`🔧 Keyboard already adequate (${keyboardHeight}px >= ${minViableHeight}px), skipping rescale`);
              this.checkKeyboardVisibility();
              shouldRescale = false;
            }
          }
          
          if (shouldRescale) {
            console.log(`🔄 Significant viewport change detected (${widthChange}px width, ${heightChange}px height), re-applying scaling`);
            this.applyOptimalScaling();
          }
          
          // Update tracking values
          lastViewportWidth = currentWidth;
          lastViewportHeight = currentHeight;
        } else {
          // Minor change, just check keyboard visibility
          this.checkKeyboardVisibility();
        }
      }, 150); // Slightly longer delay to allow viewport to stabilize
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        console.log('📱 Orientation change detected, re-applying scaling');
        this.applyOptimalScaling();
        // Update tracking values after orientation change
        lastViewportWidth = window.innerWidth;
        lastViewportHeight = window.innerHeight;
      }, 300); // Longer delay for orientation changes
    });

    // Visual viewport changes (virtual keyboard) - be more conservative
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          // Only check keyboard visibility on visual viewport changes
          // Don't re-scale unless it's a major change
          this.checkKeyboardVisibility();
        }, 100);
      });
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