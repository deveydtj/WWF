/**
 * Basic mobile device check used to tailor UI behavior.
 * @type {boolean}
 */
export const isMobile =
  typeof navigator !== 'undefined' &&
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * Check if we're in mobile responsive layout (viewport <= 600px).
 * This matches the CSS media query breakpoint for mobile layout.
 */
export function isMobileView() {
  return window.innerWidth <= 600;
}

/**
 * Display a transient message to the user.
 *
 * @param {string} msg
 * @param {{messageEl:HTMLElement, messagePopup:HTMLElement}} param1
 */
export function showMessage(msg, {messageEl, messagePopup}) {
  // Use isMobileView() for browser, fallback to isMobile for testing environments without window
  const useMobileDisplay = (typeof window !== 'undefined') ? isMobileView() : isMobile;
  
  if (useMobileDisplay) {
    messagePopup.textContent = msg;
    messagePopup.style.display = 'block';
    messagePopup.style.animation = 'fadeInOut 2s';
    messagePopup.addEventListener('animationend', () => {
      messagePopup.style.display = 'none';
      messagePopup.style.animation = '';
    }, { once: true });
  } else {
    messageEl.textContent = msg;
    if (msg) {
      messageEl.style.visibility = 'visible';
      messageEl.style.animation = 'fadeInOut 2s';
      messageEl.addEventListener('animationend', () => {
        messageEl.style.visibility = 'hidden';
        messageEl.style.animation = '';
      }, { once: true });
    } else {
      messageEl.style.visibility = 'hidden';
    }
  }
}

/**
 * Update the ARIA live region with a message for screen readers.
 *
 * @param {string} text
 */
export function announce(text) {
  const el = typeof document !== 'undefined' ? document.getElementById('ariaLive') : null;
  if (el) {
    el.textContent = text;
  }
}

/**
 * Sync the UI with the stored dark mode preference.
 *
 * @param {HTMLElement} toggle - The dark mode toggle button.
 */
export function applyDarkModePreference(toggle) {
  const prefersDark = localStorage.getItem('darkMode') === 'true';
  document.body.classList.toggle('dark-mode', prefersDark);
  toggle.textContent = prefersDark ? '☀️ Light Mode' : '🌙 Dark Mode';
  toggle.title = prefersDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
}

/**
 * Apply a shake animation to indicate invalid input.
 *
 * @param {HTMLElement} input
 */
export function shakeInput(input) {
  input.style.animation = 'shake 0.4s';
  input.addEventListener('animationend', () => {
    input.style.animation = '';
  }, { once: true });
}

/**
 * Move the reset button based on viewport width.
 * On mobile, move to appContainer for proper z-index stacking instead of titleBar.
 */
export function repositionResetButton() {
  const resetWrapper = document.getElementById('resetWrapper');
  const titleBar = document.getElementById('titleBar');
  const inputArea = document.getElementById('inputArea');
  const appContainer = document.getElementById('appContainer');
  
  // Validate required elements exist
  if (!resetWrapper || !appContainer || !inputArea) {
    console.warn('repositionResetButton: Missing required elements', {
      resetWrapper: !!resetWrapper,
      appContainer: !!appContainer,
      inputArea: !!inputArea
    });
    return;
  }
  
  if (window.innerWidth <= 600) {
    // Move to appContainer as direct child (not inside inputArea which is hidden on mobile)
    if (resetWrapper.parentElement !== appContainer) {
      // Remove from current parent (inputArea or titleBar)
      if (resetWrapper.parentElement) {
        resetWrapper.parentElement.removeChild(resetWrapper);
      }
      // Add to appContainer as first child for proper z-index stacking
      appContainer.insertBefore(resetWrapper, appContainer.firstChild);
      console.log('✅ Moved reset button to appContainer for mobile layout');
    }
  } else if (resetWrapper.parentElement !== inputArea) {
    // Move back to inputArea for desktop
    if (resetWrapper.parentElement) {
      resetWrapper.parentElement.removeChild(resetWrapper);
    }
    // Add back to inputArea for desktop
    inputArea.appendChild(resetWrapper);
    console.log('✅ Moved reset button to inputArea for desktop layout');
  }
}

/**
 * Enable or disable game input elements, e.g. while selecting a Daily Double hint.
 *
 * @param {boolean} disabled
 */
export function setGameInputDisabled(disabled) {
  const guessInput = typeof document !== 'undefined' ? document.getElementById('guessInput') : null;
  const submitButton = typeof document !== 'undefined' ? document.getElementById('submitGuess') : null;
  const chatInput = typeof document !== 'undefined' ? document.getElementById('chatInput') : null;
  if (guessInput) guessInput.disabled = disabled;
  if (submitButton) submitButton.disabled = disabled;
  if (chatInput) chatInput.disabled = disabled;
}

/**
 * Position the side panels relative to the board depending on width.
 * Enhanced with better viewport boundary detection.
 *
 * @param {HTMLElement} boardArea
 * @param {HTMLElement} historyBox
 * @param {HTMLElement} definitionBox
 * @param {HTMLElement} [chatBox]
 */
export function positionSidePanels(boardArea, historyBox, definitionBox, chatBox) {
  const viewportWidth = window.innerWidth;
  
  if (viewportWidth > 1550) {
    // Very large screens - let CSS handle positioning for truly large screens
    // Clear any inline styles to let CSS take precedence
    historyBox.style.position = '';
    historyBox.style.top = '';
    historyBox.style.left = '';
    historyBox.style.right = '';
    
    definitionBox.style.position = '';
    definitionBox.style.top = '';
    definitionBox.style.left = '';
    definitionBox.style.right = '';
    
    if (chatBox) {
      chatBox.style.position = '';
      chatBox.style.top = '';
      chatBox.style.left = '';
      chatBox.style.right = '';
    }
  } else {
    // Medium and mobile modes, and constrained large screens - let CSS handle positioning
    historyBox.style.position = '';
    historyBox.style.top = '';
    historyBox.style.left = '';
    historyBox.style.right = '';
    
    definitionBox.style.position = '';
    definitionBox.style.top = '';
    definitionBox.style.left = '';
    definitionBox.style.right = '';
    
    if (chatBox) {
      chatBox.style.position = '';
      chatBox.style.top = '';
      chatBox.style.left = '';
      chatBox.style.right = '';
    }
  }
}

/**
 * Dynamically position the chat panel based on definition panel height.
 * This ensures the chat panel is always positioned just below the definition panel
 * with a small gap, regardless of the definition panel's content height.
 * 
 * Note: This function is designed for absolute positioning layouts. When panels are
 * positioned using CSS Grid, this repositioning is skipped as the grid handles layout.
 */
export function updateChatPanelPosition() {
  const viewportWidth = window.innerWidth;
  
  // Only apply dynamic positioning for large screens (≥901px)
  if (viewportWidth <= 900) {
    return;
  }
  
  const definitionBox = document.getElementById('definitionBox');
  const chatBox = document.getElementById('chatBox');
  
  if (!definitionBox || !chatBox) {
    return;
  }
  
  // Check if panels are positioned using CSS Grid instead of absolute positioning
  // If they're grid items, skip the repositioning as CSS Grid handles layout
  const definitionStyles = window.getComputedStyle(definitionBox);
  const definitionPosition = definitionStyles.position;
  
  // If definition box is not absolutely positioned, it's likely using CSS Grid
  // Skip repositioning to avoid interfering with grid layout
  if (definitionPosition !== 'absolute' && definitionPosition !== 'fixed') {
    // Reset any inline styles that might have been set by previous runs
    chatBox.style.top = '';
    chatBox.style.maxHeight = '';
    return;
  }
  
  // Get the definition panel's position and actual height
  const definitionRect = definitionBox.getBoundingClientRect();
  const definitionComputedStyle = window.getComputedStyle(definitionBox);
  const definitionTop = parseInt(definitionComputedStyle.top, 10) || 180; // fallback to CSS default
  
  // Calculate the bottom position of the definition panel
  // Use scrollHeight to get the actual content height, but respect max-height
  const maxHeight = parseInt(definitionComputedStyle.maxHeight, 10) || 300;
  const actualContentHeight = Math.min(definitionBox.scrollHeight, maxHeight);
  
  // Position chat panel just below definition panel with 10px gap
  const chatTop = definitionTop + actualContentHeight + 10;
  
  // Set the chat panel position
  chatBox.style.top = `${chatTop}px`;
  
  // Adjust max-height to ensure chat panel doesn't extend beyond viewport
  const remainingViewportHeight = window.innerHeight - chatTop - 20; // 20px bottom margin
  const newMaxHeight = Math.max(100, remainingViewportHeight); // Minimum 100px height
  chatBox.style.maxHeight = `${newMaxHeight}px`;
}


/**
 * Update the CSS `--vh` custom property to handle mobile browser chrome.
 */
export function updateVH() {
  const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const vh = height * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);

  const container = document.getElementById('appContainer');
  if (container) {
    // Use the visual viewport height for better mobile experience
    container.style.height = `${height}px`;
    container.style.minHeight = `${height}px`;
  }

  const board = document.getElementById('board');
  if (board) {
    const rows = Math.max(1, Math.floor(board.children.length / 5));
    fitBoardToContainer(rows);
  } else {
    fitBoardToContainer();
  }
}


/**
 * Set the layout mode (light/medium/full) based on viewport width.
 * Also determines if history panel should be in popup mode on narrow desktop layouts.
 */
export function applyLayoutMode() {
  const width = window.innerWidth;
  let mode = 'full';
  let historyPopup = false; // Track if history panel should be popup on desktop
  
  if (width <= 600) {
    mode = 'light';
  } else if (width <= 900) {
    mode = 'medium';
  } else if (width <= 1150) {
    // Narrow desktop - use grid layout but make history panel a popup to prevent overflow
    mode = 'full';
    historyPopup = true;
  } else if (width <= 1550) {
    // For screens 1151-1550px, allow full mode with all panels in grid
    mode = 'full';
    historyPopup = false;
  } else {
    // For screens wider than 1550px, use full mode with side panels
    const boardArea = document.getElementById('boardArea');
    if (boardArea) {
      const rect = boardArea.getBoundingClientRect();
      const leftSpace = rect.left;
      const rightSpace = width - rect.right;
      const minPanelWidth = 280; // 17.5rem in pixels (approximately)
      const margin = 40; // Margin for comfortable spacing
      
      // Only use full mode if there's enough space for side panels
      if (leftSpace < minPanelWidth + margin || rightSpace < minPanelWidth + margin) {
        mode = 'medium';
      }
    }
  }
  
  if (document.body.dataset.mode !== mode) {
    document.body.dataset.mode = mode;
  }
  
  // Set history popup state for CSS to use
  if (historyPopup !== (document.body.dataset.historyPopup === 'true')) {
    document.body.dataset.historyPopup = historyPopup ? 'true' : 'false';
  }
}

/**
 * Calculate a tile size that fits the board within the viewport.
 * Prevents overlap with the header and leaderboard in full mode.
 * Enhanced version with improved container measurement and guaranteed keyboard visibility.
 *
 * @param {number} rows - Number of board rows
 * @returns {{ tile: number, board: number }} Size in pixels
 */
export function fitBoardToContainer(rows = 6) {
  // First try the enhanced scaling system if available
  if (typeof window !== 'undefined' && window.boardScalingTests) {
    try {
      const containerInfo = window.boardScalingTests.getBoardContainerInfo(rows);
      if (containerInfo) {
        const verification = window.boardScalingTests.verifyElementsFitInViewport(rows);
        if (verification.success && verification.optimalSizing) {
          const { tileSize, gap, boardWidth } = verification.optimalSizing;
          const root = document.documentElement;
          root.style.setProperty('--tile-size', `${tileSize}px`);
          root.style.setProperty('--tile-gap', `${gap}px`);
          root.style.setProperty('--board-width', `${boardWidth}px`);
          root.style.setProperty('--ui-scale', `${tileSize / 60}`);
          
          // Ensure keyboard visibility after scaling
          setTimeout(() => ensureKeyboardVisibility(), 100);
          return { tile: tileSize, board: boardWidth };
        }
      }
    } catch (error) {
      console.warn('Enhanced scaling failed, falling back to original method:', error);
    }
  }

  // Enhanced implementation with keyboard-first approach
  const boardArea = document.getElementById('boardArea');
  if (!boardArea) return { tile: 0, board: 0 };

  const root = document.documentElement;
  const style = getComputedStyle(root);
  const gap = parseFloat(style.getPropertyValue('--tile-gap')) || 10;

  // Use CSS --tile-size as an upper bound so media queries can limit scaling.
  let cssLimit = parseFloat(style.getPropertyValue('--tile-size'));
  if (isNaN(cssLimit)) {
    cssLimit = 60;
  } else {
    const gapVal = parseFloat(style.getPropertyValue('--tile-gap')) || 0;
    if (cssLimit <= gapVal + 1) cssLimit = 60;
  }

  const maxSize = Math.min(60, cssLimit);
  let width = boardArea.clientWidth;

  const getHeights = () => {
    const titleBar = document.getElementById('titleBar');
    const leaderboard = document.getElementById('leaderboard');
    const inputArea = document.getElementById('inputArea');
    const keyboard = document.getElementById('keyboard');
    const lobbyHeader = document.getElementById('lobbyHeader');
    const messageEl = document.getElementById('message');

    return {
      title: titleBar ? titleBar.offsetHeight : 0,
      lobby: lobbyHeader ? lobbyHeader.offsetHeight : 0,
      leaderboard: leaderboard ? leaderboard.offsetHeight : 0,
      input: inputArea ? inputArea.offsetHeight : 0,
      keyboard: keyboard ? keyboard.offsetHeight : 0,
      message: messageEl ? 25 : 0 // Reserve space for messages
    };
  };

  const applySize = (s) => {
    root.style.setProperty('--tile-size', `${s}px`);
    root.style.setProperty('--ui-scale', `${s / maxSize}`);
  };

  let size = maxSize;
  applySize(size);

  // Multiple iterations to converge on correct size
  for (let i = 0; i < 5; i++) {
    width = boardArea.clientWidth;
    const h = getHeights();

    // Calculate margins and padding
    const boardAreaStyle = getComputedStyle(boardArea);
    const boardMargins = parseFloat(boardAreaStyle.marginTop) +
                        parseFloat(boardAreaStyle.marginBottom);

    const kb = document.getElementById('keyboard');
    const kbStyle = kb ? getComputedStyle(kb) : null;
    const kbMargins = kbStyle ?
      parseFloat(kbStyle.marginTop) + parseFloat(kbStyle.marginBottom) : 0;

    // Enhanced keyboard safety calculations
    const keyboardSafetyBuffer = calculateKeyboardSafetyBuffer();
    const totalUsedHeight = h.title + h.lobby + h.leaderboard + h.input +
                           boardMargins + kbMargins + h.message;

    let containerHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    if (boardArea.parentElement && boardArea.parentElement.clientHeight) {
      containerHeight = containerHeight
        ? Math.min(boardArea.parentElement.clientHeight, containerHeight)
        : boardArea.parentElement.clientHeight;
    }

    // Calculate available height with guaranteed keyboard space
    // The keyboard MUST fit, so we work backwards from that requirement
    const reservedForKeyboard = h.keyboard + keyboardSafetyBuffer;
    const availableForOtherElements = Math.max(0, containerHeight - reservedForKeyboard);
    const availableForBoard = Math.max(0, availableForOtherElements - totalUsedHeight);

    // Size constraints
    const sizeByWidth = Math.max(20, (width - gap * 4) / 5);
    const sizeByHeight = Math.max(20, (availableForBoard - gap * (rows - 1)) / rows);

    const newSize = Math.min(maxSize, sizeByWidth, sizeByHeight);

    // Convergence check
    if (Math.abs(newSize - size) < 0.5) {
      size = Math.max(20, newSize);
      break;
    }

    size = Math.max(20, newSize);
    applySize(size);
  }

  // Apply final size and board width
  applySize(size);
  const boardWidth = size * 5 + gap * 4;
  root.style.setProperty('--board-width', `${boardWidth}px`);

  // Enhanced mobile-specific adjustments with keyboard visibility
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  
  if (viewportWidth <= 600) {
    // Mobile adjustments with keyboard safety
    applyMobileKeyboardAdjustments(size, viewportHeight);
  }

  // Validate and ensure keyboard visibility
  setTimeout(() => {
    const visibility = checkKeyboardVisibility();
    if (!visibility.visible) {
      console.warn('Keyboard visibility issue detected, applying fixes...');
      ensureKeyboardVisibility(true);
    }
  }, 100);

  return { tile: size, board: boardWidth };
}

/**
 * Calculate safety buffer needed for keyboard visibility
 */
function calculateKeyboardSafetyBuffer() {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  
  // More buffer for smaller screens
  if (viewportHeight < 600) {
    return 30; // Extra buffer for very small screens
  } else if (viewportWidth <= 600) {
    return 20; // Standard mobile buffer
  } else {
    return 10; // Minimal buffer for desktop
  }
}

/**
 * Apply mobile-specific keyboard adjustments
 */
function applyMobileKeyboardAdjustments(tileSize, viewportHeight) {
  const keyboard = document.getElementById('keyboard');
  if (!keyboard) return;

  // Reset any problematic CSS properties first
  keyboard.style.transform = '';
  keyboard.style.transformOrigin = '';
  keyboard.style.position = '';
  keyboard.style.overflow = '';
  keyboard.style.minHeight = '';
  keyboard.style.maxHeight = '';
  keyboard.style.marginBottom = '';

  if (viewportHeight < 600) {
    // Very small screens: aggressive optimizations
    const scale = Math.max(0.75, Math.min(1, viewportHeight / 600));
    keyboard.style.transform = `scale(${scale})`;
    keyboard.style.transformOrigin = 'center bottom';
    keyboard.style.marginBottom = '2px';
    
    // Also make the keyboard more compact - but don't use overflow: hidden
    keyboard.style.maxHeight = `${Math.min(120, viewportHeight * 0.2)}px`;
    console.log(`🔧 Applied mobile keyboard scaling: ${scale} for very small screen`);
  } else if (tileSize < 35) {
    // Small tiles: moderate scaling
    const scale = Math.max(0.85, tileSize / 35);
    keyboard.style.transform = `scale(${scale})`;
    keyboard.style.transformOrigin = 'center bottom';
    console.log(`🔧 Applied mobile keyboard scaling: ${scale} for small tiles`);
  } else {
    // Larger screens: ensure clean reset
    console.log('🔧 Mobile keyboard: reset to normal CSS for larger screen');
  }
}

/**
 * Place a popup near an anchor element while clamping to the viewport.
 * In mobile view, this defers to CSS media queries for centering.
 * 
 * @deprecated Use positionResponsive from popupPositioning.js for enhanced positioning
 * @param {HTMLElement} popup
 * @param {HTMLElement} anchor
 */
export function positionPopup(popup, anchor) {
  // Import enhanced positioning if available
  if (typeof window !== 'undefined' && window.popupPositioning) {
    return window.popupPositioning.positionResponsive(popup, anchor, 'menu');
  }
  
  // Fallback to original logic
  if (isMobileView()) {
    popup.style.position = '';
    popup.style.left = '';
    popup.style.top = '';
    popup.style.transform = '';
    return;
  }

  const rect = anchor.getBoundingClientRect();
  const menuWidth = popup.offsetWidth;
  const menuHeight = popup.offsetHeight;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const scrollX = window.scrollX || 0;
  const scrollY = window.scrollY || 0;
  const margin = 10;
  
  // Enhanced positioning logic with better boundary detection
  let left, top;
  
  // Try positioning to the right first
  if (rect.right + margin + menuWidth <= viewportWidth - margin) {
    left = rect.right + margin + scrollX;
  }
  // Try positioning to the left
  else if (rect.left - margin - menuWidth >= margin) {
    left = rect.left - menuWidth - margin + scrollX;
  }
  // Center horizontally if neither side works
  else {
    left = Math.max(margin + scrollX, 
                   Math.min((viewportWidth - menuWidth) / 2 + scrollX,
                           viewportWidth - menuWidth - margin + scrollX));
  }
  
  // Vertical positioning
  top = rect.top + scrollY;
  
  // Ensure popup doesn't go below viewport
  if (top + menuHeight > scrollY + viewportHeight - margin) {
    top = scrollY + viewportHeight - menuHeight - margin;
  }
  
  // Ensure popup doesn't go above viewport
  top = Math.max(top, scrollY + margin);
  
  popup.style.position = 'absolute';
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

let lastFocused = null;
let trapHandler = null;
let trappedDialog = null;

function getFocusable(container) {
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  );
}

function trapFocus(dialog) {
  const focusable = getFocusable(dialog);
  let first = focusable[0];
  let last = focusable[focusable.length - 1];
  if (!first) {
    dialog.setAttribute('tabindex', '-1');
    first = last = dialog;
  }
  const handler = (e) => {
    if (e.key === 'Tab') {
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    } else if (e.key === 'Escape') {
      closeDialog(dialog);
    }
  };
  dialog.addEventListener('keydown', handler);
  first.focus();
  return handler;
}

/**
 * Open a dialog with smooth animation.
 *
 * @param {HTMLElement} dialog
 */
export function openDialog(dialog) {
  lastFocused = document.activeElement;
  trappedDialog = dialog;
  trapHandler = trapFocus(dialog);
  
  // Show with animation
  dialog.style.display = 'flex';
  dialog.classList.remove('hide');
  dialog.classList.add('show');
}

/**
 * Close a dialog with smooth animation.
 *
 * @param {HTMLElement} dialog
 */
export function closeDialog(dialog) {
  dialog.classList.remove('show');
  dialog.classList.add('hide');
  
  // Wait for animation to complete before hiding
  setTimeout(() => {
    dialog.style.display = 'none';
    dialog.classList.remove('hide');
  }, 300); // Match animation duration
  
  if (trapHandler) {
    dialog.removeEventListener('keydown', trapHandler);
    trapHandler = null;
  }
  if (lastFocused && typeof lastFocused.focus === 'function') {
    lastFocused.focus();
  }
  trappedDialog = null;
}

/**
 * Enable click-off dismissal for a dialog by closing it when the
 * background overlay is clicked.
 *
 * @param {HTMLElement} dialog
 */
export function enableClickOffDismiss(dialog) {
  if (!dialog) return;
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      closeDialog(dialog);
    }
  });
}

/**
 * Focus the first focusable element within a container.
 *
 * @param {HTMLElement} container
 */
export function focusFirstElement(container) {
  const focusable = getFocusable(container);
  if (focusable.length) {
    focusable[0].focus();
  } else {
    container.setAttribute('tabindex', '-1');
    container.focus();
  }
}

/**
 * Display a popup anchored to a button or element.
 *
 * @param {HTMLElement} popup
 * @param {HTMLElement} anchor
 */
export function showPopup(popup, anchor) {
  popup.style.display = 'block';
  
  // Use enhanced positioning if available
  if (typeof window !== 'undefined' && window.popupPositioning) {
    window.popupPositioning.positionResponsive(popup, anchor, 'menu');
  } else {
    positionPopup(popup, anchor);
  }
  
  openDialog(popup);
}

/**
 * Check if the keyboard is fully visible in the viewport.
 * @returns {Object} Visibility status and metrics
 */
export function checkKeyboardVisibility() {
  const keyboard = document.getElementById('keyboard');
  if (!keyboard) return { visible: false, error: 'Keyboard not found' };

  const keyboardRect = keyboard.getBoundingClientRect();
  const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const viewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;

  const fullyVisible = keyboardRect.top >= 0 && 
                      keyboardRect.left >= 0 && 
                      keyboardRect.bottom <= viewportHeight && 
                      keyboardRect.right <= viewportWidth;

  const partiallyVisible = keyboardRect.top < viewportHeight && 
                          keyboardRect.bottom > 0 && 
                          keyboardRect.left < viewportWidth && 
                          keyboardRect.right > 0;

  const cutOffBottom = keyboardRect.bottom > viewportHeight;
  const cutOffAmount = cutOffBottom ? keyboardRect.bottom - viewportHeight : 0;

  return {
    visible: fullyVisible,
    partiallyVisible,
    cutOffBottom,
    cutOffAmount,
    keyboardRect: {
      top: keyboardRect.top,
      bottom: keyboardRect.bottom,
      left: keyboardRect.left,
      right: keyboardRect.right,
      width: keyboardRect.width,
      height: keyboardRect.height
    },
    viewport: {
      width: viewportWidth,
      height: viewportHeight
    }
  };
}

/**
 * Calculate minimum required viewport height to fit all game elements including keyboard.
 * @param {number} rows - Number of board rows
 * @returns {Object} Height requirements and recommendations
 */
export function calculateMinRequiredHeight(rows = 6) {
  const elements = {
    titleBar: getElementHeight('titleBar'),
    lobbyHeader: getElementHeight('lobbyHeader'),
    leaderboard: getElementHeight('leaderboard'),
    board: calculateBoardHeight(rows),
    inputArea: getElementHeight('inputArea'),
    keyboard: getElementHeight('keyboard'),
    message: 25, // Reserve space for messages
  };

  // Add margins and padding
  const margins = {
    appContainer: 20, // Top/bottom padding
    boardArea: 20, // Board area margins
    keyboard: 10, // Keyboard margins
    buffer: 20 // Safety buffer
  };

  const totalRequired = Object.values(elements).reduce((sum, height) => sum + height, 0) + 
                       Object.values(margins).reduce((sum, margin) => sum + margin, 0);

  return {
    elements,
    margins,
    totalRequired,
    current: window.visualViewport ? window.visualViewport.height : window.innerHeight,
    deficit: Math.max(0, totalRequired - (window.visualViewport ? window.visualViewport.height : window.innerHeight)),
    recommendations: generateHeightRecommendations(elements, margins, totalRequired)
  };
}

/**
 * Generate recommendations for height constraints.
 */
function generateHeightRecommendations(elements, margins, totalRequired) {
  const currentHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const recommendations = [];

  if (totalRequired > currentHeight) {
    const deficit = totalRequired - currentHeight;
    recommendations.push({
      type: 'critical',
      message: `Viewport too short by ${deficit}px. Keyboard may be cut off.`,
      action: 'reduce_element_sizes'
    });

    // Suggest specific reductions
    if (elements.board > currentHeight * 0.4) {
      recommendations.push({
        type: 'suggestion',
        message: 'Board taking up significant space. Consider smaller tiles.',
        action: 'reduce_tile_size'
      });
    }

    if (elements.keyboard > currentHeight * 0.25) {
      recommendations.push({
        type: 'suggestion', 
        message: 'Keyboard taking up significant space. Consider compact mode.',
        action: 'compact_keyboard'
      });
    }
  }

  return recommendations;
}

/**
 * Calculate board height based on current tile size and rows.
 */
function calculateBoardHeight(rows) {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const tileSize = parseFloat(style.getPropertyValue('--tile-size')) || 40;
  const gap = parseFloat(style.getPropertyValue('--tile-gap')) || 8;
  return rows * tileSize + (rows - 1) * gap;
}

/**
 * Get element height safely with fallback.
 */
function getElementHeight(id, fallback = 0) {
  const element = document.getElementById(id);
  return element ? element.offsetHeight : fallback;
}

/**
 * Ensure keyboard stays visible by adjusting layout if needed.
 * @param {boolean} force - Force adjustment even if keyboard appears visible
 * @returns {boolean} Whether adjustment was successful
 */
export function ensureKeyboardVisibility(force = false) {
  const visibility = checkKeyboardVisibility();
  
  if (visibility.visible && !force) {
    return true; // Already visible
  }

  if (!visibility.partiallyVisible) {
    console.warn('Keyboard completely outside viewport');
    return false;
  }

  // Try different strategies to make keyboard visible
  const strategies = [
    () => adjustKeyboardForViewport(),
    () => compactKeyboardForSmallViewports(),
    () => repositionKeyboardDynamically(),
    () => reduceOtherElementSizes()
  ];

  for (const strategy of strategies) {
    try {
      strategy();
      const newVisibility = checkKeyboardVisibility();
      if (newVisibility.visible) {
        return true;
      }
    } catch (error) {
      console.warn('Keyboard visibility strategy failed:', error);
    }
  }

  return false;
}

/**
 * Compact keyboard for small viewports.
 */
function compactKeyboardForSmallViewports() {
  const keyboard = document.getElementById('keyboard');
  if (!keyboard) return;

  const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  
  if (viewportHeight < 600) {
    // Apply more aggressive scaling for very small screens
    const scale = Math.max(0.7, Math.min(1, viewportHeight / 600));
    keyboard.style.transform = `scale(${scale})`;
    keyboard.style.transformOrigin = 'center bottom';
    keyboard.style.marginBottom = '5px';
  }
}

/**
 * Dynamically reposition keyboard if it's cut off.
 */
function repositionKeyboardDynamically() {
  const keyboard = document.getElementById('keyboard');
  if (!keyboard) return;

  const visibility = checkKeyboardVisibility();
  
  // If keyboard is visible, reset any transforms
  if (!visibility.cutOffBottom) {
    keyboard.style.transform = '';
    return;
  }
  
  // Only apply transform if keyboard is significantly cut off
  if (visibility.cutOffAmount > 20) {
    // Move keyboard up by the amount it's cut off, plus a small buffer
    const adjustment = Math.min(visibility.cutOffAmount + 10, 80); // Limit max adjustment
    keyboard.style.transform = `translateY(-${adjustment}px)`;
    console.log(`🔧 Applied keyboard reposition adjustment: ${adjustment}px`);
  }
}

/**
 * Reduce sizes of other elements to make room for keyboard.
 */
function reduceOtherElementSizes() {
  const requirements = calculateMinRequiredHeight();
  
  if (requirements.deficit > 0) {
    // Reduce tile size to make more room
    const root = document.documentElement;
    const currentTileSize = parseFloat(getComputedStyle(root).getPropertyValue('--tile-size')) || 40;
    const reductionFactor = Math.max(0.8, (requirements.current - requirements.deficit) / requirements.current);
    const newTileSize = Math.max(20, currentTileSize * reductionFactor);
    
    root.style.setProperty('--tile-size', `${newTileSize}px`);
    root.style.setProperty('--ui-scale', `${newTileSize / 60}`);
  }
}

/**
 * Adjust the on-screen keyboard position when the visual viewport changes.
 */
export function adjustKeyboardForViewport() {
  const keyboard = document.getElementById('keyboard');
  if (!keyboard) return;
  
  // Check if keyboard is cut off and needs adjustment
  const visibility = checkKeyboardVisibility();
  
  if (window.visualViewport) {
    const offset = Math.max(0, window.innerHeight - window.visualViewport.height);
    // Only apply significant offsets, ignore minor ones
    if (offset > 30) {
      const adjustment = Math.min(offset, 100); // Limit max adjustment
      keyboard.style.transform = `translateY(-${adjustment}px)`;
      console.log(`🔧 Applied viewport keyboard adjustment: ${adjustment}px`);
    } else {
      keyboard.style.transform = '';
    }
  } else if (visibility.cutOffBottom && visibility.cutOffAmount > 20) {
    // Fallback: adjust based on cut-off amount, but only for significant cuts
    const adjustment = Math.min(visibility.cutOffAmount + 5, 80);
    keyboard.style.transform = `translateY(-${adjustment}px)`;
    console.log(`🔧 Applied fallback keyboard adjustment: ${adjustment}px`);
  } else {
    keyboard.style.transform = '';
  }
}

/**
 * Check if the input field is being covered by the digital keyboard.
 * This is specifically designed to ensure the input field remains accessible.
 * @returns {Object} Status of input field visibility and overlap information
 */
export function checkInputFieldKeyboardOverlap() {
  const inputField = document.getElementById('guessInput');
  const keyboard = document.getElementById('keyboard');
  
  if (!inputField || !keyboard) {
    return { 
      error: 'Required elements not found',
      inputField: !!inputField,
      keyboard: !!keyboard,
      overlap: false
    };
  }

  const inputRect = inputField.getBoundingClientRect();
  const keyboardRect = keyboard.getBoundingClientRect();
  const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const viewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;

  // Check if input field is within viewport
  const inputInViewport = inputRect.top >= 0 && 
                         inputRect.left >= 0 && 
                         inputRect.bottom <= viewportHeight && 
                         inputRect.right <= viewportWidth;

  // Check if input field overlaps with keyboard
  const overlap = !(inputRect.bottom <= keyboardRect.top ||
                   inputRect.top >= keyboardRect.bottom ||
                   inputRect.right <= keyboardRect.left ||
                   inputRect.left >= keyboardRect.right);

  // Calculate how much of the input field is covered
  let overlapHeight = 0;
  if (overlap) {
    const overlapTop = Math.max(inputRect.top, keyboardRect.top);
    const overlapBottom = Math.min(inputRect.bottom, keyboardRect.bottom);
    overlapHeight = Math.max(0, overlapBottom - overlapTop);
  }

  const overlapPercentage = inputRect.height > 0 ? (overlapHeight / inputRect.height) * 100 : 0;

  // Check if there's a visual viewport change (indicating on-screen keyboard)
  const hasVisualViewportChange = window.visualViewport && 
                                 Math.abs(window.innerHeight - window.visualViewport.height) > 50;

  return {
    overlap,
    overlapHeight,
    overlapPercentage: Math.round(overlapPercentage * 100) / 100,
    inputInViewport,
    inputAccessible: inputInViewport && (!overlap || overlapPercentage < 50),
    hasVisualViewportChange,
    inputRect: {
      top: inputRect.top,
      bottom: inputRect.bottom,
      left: inputRect.left,
      right: inputRect.right,
      width: inputRect.width,
      height: inputRect.height
    },
    keyboardRect: {
      top: keyboardRect.top,
      bottom: keyboardRect.bottom,
      left: keyboardRect.left,
      right: keyboardRect.right,
      width: keyboardRect.width,
      height: keyboardRect.height
    },
    viewport: {
      width: viewportWidth,
      height: viewportHeight,
      innerHeight: window.innerHeight,
      visualHeight: window.visualViewport ? window.visualViewport.height : window.innerHeight
    }
  };
}

/**
 * Ensure the input field is not covered by the digital keyboard.
 * This function specifically addresses input field accessibility issues.
 * @returns {boolean} Whether the input field is accessible
 */
export function ensureInputFieldVisibility() {
  const status = checkInputFieldKeyboardOverlap();
  
  if (status.error) {
    console.warn('Cannot check input field visibility:', status.error);
    return false;
  }

  if (status.inputAccessible) {
    return true; // Already accessible
  }

  // Try to make input field accessible
  const strategies = [
    () => adjustInputFieldPosition(),
    () => adjustKeyboardForViewport(),
    () => ensureKeyboardVisibility(),
    () => compactLayoutForInputField()
  ];

  for (const strategy of strategies) {
    try {
      strategy();
      const newStatus = checkInputFieldKeyboardOverlap();
      if (newStatus.inputAccessible) {
        console.log('Input field made accessible using strategy:', strategy.name);
        return true;
      }
    } catch (error) {
      console.warn('Input field visibility strategy failed:', error);
    }
  }

  console.warn('Could not ensure input field visibility');
  return false;
}

/**
 * Adjust input field position to avoid keyboard overlap.
 */
function adjustInputFieldPosition() {
  const inputArea = document.getElementById('inputArea');
  const status = checkInputFieldKeyboardOverlap();
  
  if (!inputArea) return;

  // If there's no overlap, reset any existing transforms
  if (!status.overlap) {
    inputArea.style.transform = '';
    inputArea.style.transition = '';
    return;
  }

  // Only apply transform if there's significant overlap and inputArea isn't already positioned well
  if (status.overlapPercentage > 30) {
    // Check if inputArea is already positioned high enough (possibly covering board)
    const inputRect = inputArea.getBoundingClientRect();
    const boardArea = document.getElementById('boardArea');
    
    if (boardArea) {
      const boardRect = boardArea.getBoundingClientRect();
      
      // If inputArea would overlap with board area, don't apply the transform
      if (inputRect.top - 60 < boardRect.bottom) {
        console.log('🔧 Skipping inputArea transform - would overlap with board');
        return;
      }
    }
    
    // Apply conservative adjustment that won't move inputArea too high
    const maxAdjustment = Math.min(status.overlapHeight + 10, 60); // Reduced from 100 to 60
    const adjustment = Math.min(maxAdjustment, window.innerHeight * 0.1); // Max 10% of viewport height
    
    inputArea.style.transform = `translateY(-${adjustment}px)`;
    inputArea.style.transition = 'transform 0.3s ease';
    
    console.log(`🔧 Applied conservative inputArea adjustment: ${adjustment}px`);
  }
}

/**
 * Compact layout specifically for input field accessibility.
 */
function compactLayoutForInputField() {
  const status = checkInputFieldKeyboardOverlap();
  
  if (!status.overlap) return;

  // Reduce margins and padding of elements above the input field
  const titleBar = document.getElementById('titleBar');
  const boardArea = document.getElementById('boardArea');
  
  if (titleBar) {
    titleBar.style.marginBottom = '5px';
  }
  
  if (boardArea) {
    boardArea.style.marginBottom = '5px';
  }

  // Make the input area more compact
  const inputArea = document.getElementById('inputArea');
  if (inputArea) {
    inputArea.style.marginTop = '3px';
    inputArea.style.marginBottom = '3px';
  }
}

// Re-export enhanced board container functions for backward compatibility
export { 
  verifyElementsFitInViewport, 
  applyOptimalScaling,
  testBoardScalingAcrossDevices,
  getBoardContainerInfo,
  calculateOptimalTileSize
} from './boardContainer.js';

/**
 * Reset all element positioning transforms that might interfere with scaling.
 * This function provides a comprehensive reset for elements that can have problematic transforms.
 */
export function resetAllElementTransforms() {
  // Reset keyboard transforms
  const keyboard = document.getElementById('keyboard');
  if (keyboard) {
    keyboard.style.transform = '';
    keyboard.style.transformOrigin = '';
    keyboard.style.position = '';
    keyboard.style.left = '';
    keyboard.style.bottom = '';
    keyboard.style.zIndex = '';
    keyboard.style.minHeight = '';
    keyboard.style.maxHeight = '';
    keyboard.style.overflow = '';
  }
  
  // Reset input area transforms
  const inputArea = document.getElementById('inputArea');
  if (inputArea) {
    inputArea.style.transform = '';
    inputArea.style.transition = '';
    inputArea.style.marginTop = '';
    inputArea.style.marginBottom = '';
  }
  
  // Reset other UI elements that might have been adjusted
  const titleBar = document.getElementById('titleBar');
  const boardArea = document.getElementById('boardArea');
  const appContainer = document.getElementById('appContainer');
  
  if (titleBar) {
    titleBar.style.marginBottom = '';
  }
  
  if (boardArea) {
    boardArea.style.marginBottom = '';
  }
  
  if (appContainer) {
    appContainer.style.padding = '';
  }
  
  console.log('🔧 Reset all element transforms to normal CSS');
}
