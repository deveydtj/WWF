/**
 * Enhanced board container measurement and scaling utilities
 * Provides better understanding of the gameboard size and ensures all items fit on any screen
 */

/**
 * Comprehensive board container dimensions and constraints
 * @typedef {Object} BoardContainerInfo
 * @property {DOMRect} containerRect - Container bounding rectangle
 * @property {DOMRect} viewportRect - Viewport dimensions
 * @property {Object} availableSpace - Available space calculations
 * @property {Object} constraints - Layout constraints
 * @property {Object} margins - Calculated margins and spacing
 * @property {Object} elements - Heights of key UI elements
 */

/**
 * Get comprehensive information about the board container and its constraints
 * @param {number} rows - Number of board rows (default 6)
 * @returns {BoardContainerInfo}
 */
export function getBoardContainerInfo(rows = 6) {
  const boardArea = document.getElementById('boardArea');
  const appContainer = document.getElementById('appContainer');
  const board = document.getElementById('board');
  
  if (!boardArea || !appContainer) {
    return null;
  }

  // Get viewport dimensions
  const viewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;
  const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  
  const viewportRect = {
    width: viewportWidth,
    height: viewportHeight,
    left: 0,
    top: 0,
    right: viewportWidth,
    bottom: viewportHeight
  };

  // Get container dimensions
  const containerRect = boardArea.getBoundingClientRect();
  const appContainerRect = appContainer.getBoundingClientRect();

  // Calculate UI element heights
  const elements = {
    titleBar: getElementHeight('titleBar'),
    lobbyHeader: getElementHeight('lobbyHeader'),
    leaderboard: getElementHeight('leaderboard'),
    inputArea: getElementHeight('inputArea'),
    keyboard: getElementHeight('keyboard'),
    message: getElementHeight('message', 25), // Reserve space for messages
    messagePopup: getElementHeight('messagePopup')
  };

  // Calculate margins and spacing
  const boardAreaStyle = getComputedStyle(boardArea);
  const appContainerStyle = getComputedStyle(appContainer);
  
  const margins = {
    boardArea: {
      top: parseFloat(boardAreaStyle.marginTop) || 0,
      bottom: parseFloat(boardAreaStyle.marginBottom) || 0,
      left: parseFloat(boardAreaStyle.marginLeft) || 0,
      right: parseFloat(boardAreaStyle.marginRight) || 0
    },
    appContainer: {
      top: parseFloat(appContainerStyle.paddingTop) || 0,
      bottom: parseFloat(appContainerStyle.paddingBottom) || 0,
      left: parseFloat(appContainerStyle.paddingLeft) || 0,
      right: parseFloat(appContainerStyle.paddingRight) || 0
    }
  };

  // Calculate constraints
  const constraints = {
    maxWidth: containerRect.width,
    maxHeight: calculateMaxBoardHeight(elements, margins, viewportHeight),
    minTileSize: 20, // Minimum usable tile size
    maxTileSize: viewportWidth >= 1200 ? 65 : 60, // Allow larger tiles for 1200px+ screens
    targetAspectRatio: 5 / rows, // Board aspect ratio (5 columns, variable rows)
    gapRatio: 0.1 // Gap as ratio of tile size
  };

  // Calculate available space
  const totalUIHeight = Object.values(elements).reduce((sum, height) => sum + height, 0);
  const totalMargins = margins.boardArea.top + margins.boardArea.bottom + 
                      margins.appContainer.top + margins.appContainer.bottom;
  
  const availableSpace = {
    width: Math.max(0, containerRect.width - margins.boardArea.left - margins.boardArea.right),
    height: Math.max(0, viewportHeight - totalUIHeight - totalMargins - 40), // 40px buffer
    totalUIHeight,
    totalMargins
  };

  return {
    containerRect,
    viewportRect,
    availableSpace,
    constraints,
    margins,
    elements,
    rows,
    cols: 5 // Fixed for word game
  };
}

/**
 * Calculate optimal tile size based on container constraints
 * @param {BoardContainerInfo} containerInfo - Container information
 * @returns {Object} Optimal sizing information
 */
export function calculateOptimalTileSize(containerInfo) {
  if (!containerInfo) return null;

  const { availableSpace, constraints, rows, cols } = containerInfo;
  
  // Calculate tile size based on width constraint
  const gapTotal = (cols - 1) * constraints.gapRatio;
  const widthBasedSize = Math.floor(availableSpace.width / (cols + gapTotal));
  
  // Calculate tile size based on height constraint  
  const heightGapTotal = (rows - 1) * constraints.gapRatio;
  const heightBasedSize = Math.floor(availableSpace.height / (rows + heightGapTotal));
  
  // Choose the limiting dimension
  const constrainedSize = Math.min(widthBasedSize, heightBasedSize);
  
  // Apply min/max constraints
  const optimalSize = Math.max(
    constraints.minTileSize,
    Math.min(constraints.maxTileSize, constrainedSize)
  );
  
  const gap = Math.max(2, optimalSize * constraints.gapRatio);
  const boardWidth = cols * optimalSize + (cols - 1) * gap;
  const boardHeight = rows * optimalSize + (rows - 1) * gap;
  
  return {
    tileSize: optimalSize,
    gap,
    boardWidth,
    boardHeight,
    scaleFactor: optimalSize / constraints.maxTileSize,
    fitsInContainer: boardWidth <= availableSpace.width && boardHeight <= availableSpace.height,
    constrainedBy: widthBasedSize < heightBasedSize ? 'width' : 'height'
  };
}

/**
 * Verify that all game elements fit within the viewport
 * @param {number} rows - Number of board rows
 * @returns {Object} Verification results
 */
export function verifyElementsFitInViewport(rows = 6) {
  const containerInfo = getBoardContainerInfo(rows);
  if (!containerInfo) return { success: false, error: 'Unable to get container info' };

  const optimalSizing = calculateOptimalTileSize(containerInfo);
  if (!optimalSizing) return { success: false, error: 'Unable to calculate optimal sizing' };

  const { viewportRect, elements, margins } = containerInfo;
  const { boardWidth, boardHeight, tileSize } = optimalSizing;

  // Check if board fits horizontally
  const totalWidth = boardWidth + margins.appContainer.left + margins.appContainer.right;
  const fitsHorizontally = totalWidth <= viewportRect.width;

  // Check if all elements fit vertically
  const totalUIHeight = Object.values(elements).reduce((sum, height) => sum + height, 0);
  const totalVerticalSpace = boardHeight + totalUIHeight + 
                            margins.appContainer.top + margins.appContainer.bottom + 20; // buffer
  const fitsVertically = totalVerticalSpace <= viewportRect.height;

  // Check individual element visibility
  const elementChecks = checkElementVisibility();

  const verification = {
    success: fitsHorizontally && fitsVertically && optimalSizing.fitsInContainer,
    fitsHorizontally,
    fitsVertically,
    optimalSizing,
    containerInfo,
    elementChecks,
    recommendations: generateScalingRecommendations(containerInfo, optimalSizing)
  };

  return verification;
}

/**
 * Check if all key game elements are visible in the viewport
 * @returns {Object} Visibility check results
 */
export function checkElementVisibility() {
  const elementsToCheck = [
    'board', 'keyboard', 'titleBar', 'leaderboard', 
    'inputArea', 'lobbyHeader', 'submitGuess'
  ];

  const visibility = {};
  const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const viewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;

  elementsToCheck.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      const rect = element.getBoundingClientRect();
      visibility[id] = {
        exists: true,
        visible: rect.top >= 0 && rect.left >= 0 && 
                rect.bottom <= viewportHeight && rect.right <= viewportWidth,
        partiallyVisible: rect.top < viewportHeight && rect.bottom > 0 && 
                         rect.left < viewportWidth && rect.right > 0,
        rect: {
          top: rect.top,
          left: rect.left,
          bottom: rect.bottom,
          right: rect.right,
          width: rect.width,
          height: rect.height
        }
      };
    } else {
      visibility[id] = { exists: false, visible: false, partiallyVisible: false };
    }
  });

  return visibility;
}

/**
 * Generate scaling recommendations based on container analysis
 * @param {BoardContainerInfo} containerInfo - Container information  
 * @param {Object} optimalSizing - Optimal sizing calculation
 * @returns {Array} Array of recommendation objects
 */
export function generateScalingRecommendations(containerInfo, optimalSizing) {
  const recommendations = [];

  if (!optimalSizing.fitsInContainer) {
    recommendations.push({
      type: 'critical',
      message: `Board too large for container. Constrained by ${optimalSizing.constrainedBy}.`,
      action: 'reduce_tile_size',
      currentSize: optimalSizing.tileSize,
      suggestedSize: Math.max(containerInfo.constraints.minTileSize, optimalSizing.tileSize * 0.8)
    });
  }

  if (optimalSizing.tileSize <= containerInfo.constraints.minTileSize + 5) {
    recommendations.push({
      type: 'warning', 
      message: 'Tiles are very small and may be hard to read/touch.',
      action: 'consider_ui_simplification'
    });
  }

  if (containerInfo.viewportRect.width < 400) {
    recommendations.push({
      type: 'info',
      message: 'Very small screen detected. Consider mobile-optimized layout.',
      action: 'apply_mobile_optimizations'
    });
  }

  const keyboardHeight = containerInfo.elements.keyboard;
  const availableHeightRatio = containerInfo.availableSpace.height / containerInfo.viewportRect.height;
  if (keyboardHeight > containerInfo.viewportRect.height * 0.3) {
    recommendations.push({
      type: 'warning',
      message: 'Keyboard taking up significant screen space.',
      action: 'compress_keyboard'
    });
  }

  return recommendations;
}

/**
 * Get the current CSS-defined fixed tile size if any
 * @returns {number} Current CSS tile size in pixels, or 0 if not set
 */
function getCurrentCSSFixedTileSize() {
  // Create a test element to check the computed CSS tile size
  const testElement = document.createElement('div');
  testElement.style.width = 'var(--tile-size, 0px)';
  testElement.style.height = '1px';
  testElement.style.visibility = 'hidden';
  testElement.style.position = 'absolute';
  document.body.appendChild(testElement);
  
  const computedSize = parseInt(getComputedStyle(testElement).width) || 0;
  document.body.removeChild(testElement);
  
  return computedSize;
}

/**
 * Apply optimal scaling to the board based on container analysis
 * @param {number} rows - Number of board rows
 * @returns {boolean} Success status
 */
export function applyOptimalScaling(rows = 6) {
  const verification = verifyElementsFitInViewport(rows);
  
  if (!verification.success) {
    console.warn('Board scaling verification failed:', verification);
  }

  const { optimalSizing } = verification;
  if (!optimalSizing) return false;

  const viewportWidth = window.innerWidth;
  
  // For larger screens (1200px+), check if CSS has already set appropriate fixed sizes
  // before applying JavaScript overrides
  if (viewportWidth >= 1200) {
    const currentCSSSize = getCurrentCSSFixedTileSize();
    
    // If CSS has set a good fixed size (60px+), respect it unless it's clearly inadequate
    if (currentCSSSize >= 60) {
      console.log(`CSS fixed tile size (${currentCSSSize}px) is adequate for ${viewportWidth}px viewport, respecting CSS`);
      
      // Only apply minimal adjustments if needed
      const gap = Math.max(2, currentCSSSize * 0.1);
      const boardWidth = 5 * currentCSSSize + 4 * gap;
      
      const root = document.documentElement;
      root.style.setProperty('--tile-size', `${currentCSSSize}px`);
      root.style.setProperty('--tile-gap', `${gap}px`);
      root.style.setProperty('--board-width', `${boardWidth}px`);
      root.style.setProperty('--ui-scale', `${Math.min(1.1, currentCSSSize / 60)}`); // Cap ui-scale at 1.1
      
      return true; // CSS handling is sufficient
    }
  }

  // For smaller screens or when CSS doesn't provide adequate sizing, apply JavaScript scaling
  let finalTileSize = optimalSizing.tileSize;
  
  // Apply viewport-specific minimums as safety net
  if (viewportWidth >= 1200 && viewportWidth <= 1550) {
    // For 1200px-1550px range, ensure minimum tile size of 65px for better usability
    finalTileSize = Math.max(65, optimalSizing.tileSize);
    console.log(`Applied 1200px-1550px minimum (65px): ${finalTileSize}px`);
  } else if (viewportWidth > 1550) {
    // For very large screens, ensure minimum tile size of 60px (reduced from 70px)
    finalTileSize = Math.max(60, optimalSizing.tileSize);
    console.log(`Applied 1551px+ minimum (60px): ${finalTileSize}px`);
  }
  
  // Recalculate gap and board width if tile size was adjusted
  const gap = Math.max(2, finalTileSize * 0.1);
  const boardWidth = 5 * finalTileSize + 4 * gap;

  // Apply the calculated sizing to CSS variables
  const root = document.documentElement;
  root.style.setProperty('--tile-size', `${finalTileSize}px`);
  root.style.setProperty('--tile-gap', `${gap}px`);
  root.style.setProperty('--board-width', `${boardWidth}px`);
  root.style.setProperty('--ui-scale', `${Math.min(1.1, finalTileSize / 60)}`); // Cap ui-scale at 1.1 to prevent button oversizing

  // Apply mobile optimizations if needed (but not for 1200px+ screens)
  if (viewportWidth < 1200) {
    const mobileCriticalRecs = verification.recommendations.filter(r => 
      r.type === 'critical' || (r.action === 'apply_mobile_optimizations')
    );
    
    if (mobileCriticalRecs.length > 0) {
      applyMobileOptimizations({ tileSize: finalTileSize });
    }
  }

  return verification.success || viewportWidth >= 1200; // Consider 1200px+ screens as successful
}

/**
 * Apply mobile-specific optimizations
 * @param {Object} optimalSizing - Optimal sizing information
 */
function applyMobileOptimizations(optimalSizing) {
  const keyboard = document.getElementById('keyboard');
  if (keyboard) {
    // Reset problematic CSS properties first 
    keyboard.style.position = '';
    keyboard.style.overflow = '';
    keyboard.style.left = '';
    keyboard.style.bottom = '';
    keyboard.style.zIndex = '';
    keyboard.style.minHeight = '';
    keyboard.style.maxHeight = '';
    
    if (optimalSizing.tileSize < 35) {
      // Scale down keyboard for very small screens
      const scale = Math.max(0.8, optimalSizing.tileSize / 35);
      keyboard.style.transform = `scale(${scale})`;
      keyboard.style.transformOrigin = 'center bottom';
      console.log(`🔧 Applied mobile keyboard scaling: ${scale}`);
    } else {
      // Reset transform for larger screens with comprehensive cleanup
      keyboard.style.transform = '';
      keyboard.style.transformOrigin = '';
      console.log('🔧 Mobile keyboard: reset to normal CSS for larger screen');
    }
  }

  // Reduce padding on very small screens
  if (optimalSizing.tileSize < 30) {
    const appContainer = document.getElementById('appContainer');
    if (appContainer) {
      appContainer.style.padding = '5px';
    }
  } else {
    // Reset padding for larger screens
    const appContainer = document.getElementById('appContainer');
    if (appContainer) {
      appContainer.style.padding = '';
    }
  }
}

/**
 * Utility function to get element height safely
 * @param {string} id - Element ID
 * @param {number} fallback - Fallback height
 * @returns {number} Element height
 */
function getElementHeight(id, fallback = 0) {
  const element = document.getElementById(id);
  return element ? element.offsetHeight : fallback;
}

/**
 * Calculate maximum available height for the board
 * @param {Object} elements - UI element heights
 * @param {Object} margins - Margin information
 * @param {number} viewportHeight - Viewport height
 * @returns {number} Maximum board height
 */
function calculateMaxBoardHeight(elements, margins, viewportHeight) {
  const reservedHeight = Object.values(elements).reduce((sum, height) => sum + height, 0) +
                         margins.boardArea.top + margins.boardArea.bottom +
                         margins.appContainer.top + margins.appContainer.bottom + 
                         40; // Buffer space

  return Math.max(0, viewportHeight - reservedHeight);
}

/**
 * Test board scaling across different device viewports
 * @param {Array} testSizes - Array of {width, height} objects to test
 * @returns {Array} Test results for each viewport size
 */
export function testBoardScalingAcrossDevices(testSizes = []) {
  // Default test sizes for common devices
  const defaultSizes = [
    { name: 'iPhone SE', width: 375, height: 667 },
    { name: 'iPhone 12', width: 390, height: 844 },
    { name: 'iPhone 12 Pro Max', width: 428, height: 926 },
    { name: 'iPad Mini', width: 768, height: 1024 },
    { name: 'iPad Air', width: 820, height: 1180 },
    { name: 'Galaxy S20', width: 360, height: 800 },
    { name: 'Galaxy Note', width: 412, height: 915 },
    { name: 'Desktop Small', width: 1024, height: 768 },
    { name: 'Desktop Medium', width: 1366, height: 768 },
    { name: 'Desktop Large', width: 1920, height: 1080 }
  ];

  const sizesToTest = testSizes.length > 0 ? testSizes : defaultSizes;
  const results = [];

  // Store original viewport size
  const originalWidth = window.innerWidth;
  const originalHeight = window.innerHeight;

  sizesToTest.forEach(size => {
    // Simulate viewport resize (note: this is conceptual - actual resize would need browser dev tools)
    const testResult = simulateViewportTest(size.width, size.height, size.name);
    results.push({
      device: size.name,
      dimensions: { width: size.width, height: size.height },
      ...testResult
    });
  });

  return {
    testResults: results,
    summary: generateTestSummary(results),
    originalDimensions: { width: originalWidth, height: originalHeight }
  };
}

/**
 * Simulate viewport testing for a given size
 * @param {number} width - Test viewport width
 * @param {number} height - Test viewport height  
 * @param {string} deviceName - Device name for testing
 * @returns {Object} Test results
 */
function simulateViewportTest(width, height, deviceName) {
  // Since we can't actually resize the viewport, we'll calculate what would happen
  const mockViewport = { width, height };
  
  // Calculate what the board container info would be for this viewport
  const containerInfo = getBoardContainerInfo(6);
  if (!containerInfo) {
    return { success: false, error: 'No container info available' };
  }

  // Override viewport dimensions for calculation
  const testContainerInfo = {
    ...containerInfo,
    viewportRect: mockViewport,
    availableSpace: {
      ...containerInfo.availableSpace,
      width: Math.min(containerInfo.availableSpace.width, width - 40), // Account for margins
      height: Math.max(0, height - containerInfo.availableSpace.totalUIHeight - 40)
    }
  };

  const optimalSizing = calculateOptimalTileSize(testContainerInfo);
  
  if (!optimalSizing) {
    return { success: false, error: 'Could not calculate optimal sizing' };
  }

  const fitsWidth = optimalSizing.boardWidth <= testContainerInfo.availableSpace.width;
  const fitsHeight = optimalSizing.boardHeight <= testContainerInfo.availableSpace.height;
  const success = fitsWidth && fitsHeight && optimalSizing.tileSize >= 20;

  return {
    success,
    fitsWidth,
    fitsHeight,
    tileSize: optimalSizing.tileSize,
    scaleFactor: optimalSizing.scaleFactor,
    boardDimensions: {
      width: optimalSizing.boardWidth,
      height: optimalSizing.boardHeight
    },
    recommendations: generateScalingRecommendations(testContainerInfo, optimalSizing)
  };
}

/**
 * Generate summary of device testing results
 * @param {Array} results - Test results array
 * @returns {Object} Test summary
 */
function generateTestSummary(results) {
  const total = results.length;
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success);
  
  const minTileSize = Math.min(...results.map(r => r.tileSize || 0));
  const maxTileSize = Math.max(...results.map(r => r.tileSize || 0));
  
  return {
    total,
    successful,
    failed: failed.length,
    successRate: (successful / total * 100).toFixed(1) + '%',
    tileSizeRange: { min: minTileSize, max: maxTileSize },
    failedDevices: failed.map(r => r.device),
    recommendations: failed.length > 0 ? 
      'Consider implementing responsive breakpoints for failed devices' : 
      'All tested devices pass scaling verification'
  };
}