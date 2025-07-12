/**
 * Basic mobile device check used to tailor UI behavior.
 * @type {boolean}
 */
export const isMobile =
  typeof navigator !== 'undefined' &&
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * Display a transient message to the user.
 *
 * @param {string} msg
 * @param {{messageEl:HTMLElement, messagePopup:HTMLElement}} param1
 */
export function showMessage(msg, {messageEl, messagePopup}) {
  if (isMobile) {
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
 */
export function repositionResetButton() {
  const resetWrapper = document.getElementById('resetWrapper');
  const titleBar = document.getElementById('titleBar');
  const inputArea = document.getElementById('inputArea');
  if (window.innerWidth <= 600) {
    if (!titleBar.contains(resetWrapper)) {
      titleBar.insertBefore(resetWrapper, titleBar.firstChild);
    }
  } else if (!inputArea.contains(resetWrapper)) {
    inputArea.appendChild(resetWrapper);
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
 *
 * @param {HTMLElement} boardArea
 * @param {HTMLElement} historyBox
 * @param {HTMLElement} definitionBox
 * @param {HTMLElement} [chatBox]
 */
export function positionSidePanels(boardArea, historyBox, definitionBox, chatBox) {
  if (window.innerWidth > 900) {
    const boardRect = boardArea.getBoundingClientRect();
    const top = boardRect.top + window.scrollY;
    const left = boardRect.left + window.scrollX;
    const right = boardRect.right + window.scrollX;

    historyBox.style.position = 'absolute';
    historyBox.style.top = `${top}px`;
    historyBox.style.left = `${left - historyBox.offsetWidth - 60}px`;

    definitionBox.style.position = 'absolute';
    definitionBox.style.top = `${top}px`;
    definitionBox.style.left = `${right + 60}px`;
    if (chatBox) {
      chatBox.style.position = 'absolute';
      chatBox.style.left = `${right + 60}px`;
      chatBox.style.top = `${top + definitionBox.offsetHeight + 20}px`;
    }
  } else {
    historyBox.style.position = '';
    historyBox.style.top = '';
    historyBox.style.left = '';
    definitionBox.style.position = '';
    definitionBox.style.top = '';
    definitionBox.style.left = '';
    if (chatBox) {
      chatBox.style.position = '';
      chatBox.style.top = '';
      chatBox.style.left = '';
    }
  }
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

// Add this helper function for keyboard adjustments
export function adjustKeyboardForViewport() {
  const keyboard = document.getElementById('keyboard');
  if (!keyboard) return;

  const viewportHeight = window.visualViewport ?
    window.visualViewport.height : window.innerHeight;
  const keyboardBottom = keyboard.getBoundingClientRect().bottom;

  // If keyboard is cut off, scale it down
  if (keyboardBottom > viewportHeight) {
    const overflow = keyboardBottom - viewportHeight + 10; // 10px buffer
    const currentHeight = keyboard.offsetHeight;
    const scale = Math.max(0.7, (currentHeight - overflow) / currentHeight);

    keyboard.style.transform = `scale(${scale})`;
    keyboard.style.transformOrigin = 'center bottom';
  }
}

/**
 * Set the layout mode (light/medium/full) based on viewport width.
 */
export function applyLayoutMode() {
  const width = window.innerWidth;
  let mode = 'full';
  if (width <= 600) {
    mode = 'light';
  } else if (width <= 900) {
    mode = 'medium';
  } else {
    const boardArea = document.getElementById('boardArea');
    const historyBox = document.getElementById('historyBox');
    const definitionBox = document.getElementById('definitionBox');
    if (boardArea && historyBox && definitionBox) {
      const rect = boardArea.getBoundingClientRect();
      const leftSpace = rect.left;
      const rightSpace = width - rect.right;
      const margin = 60;
      if (
        leftSpace < historyBox.offsetWidth + margin ||
        rightSpace < definitionBox.offsetWidth + margin
      ) {
        mode = 'medium';
      }
    }
  }
  if (document.body.dataset.mode !== mode) {
    document.body.dataset.mode = mode;
  }
}

/**
 * Calculate a tile size that fits the board within the viewport.
 * Prevents overlap with the header and leaderboard in full mode.
 *
 * @param {number} rows - Number of board rows
 * @returns {{ tile: number, board: number }} Size in pixels
 */
export function fitBoardToContainer(rows = 6) {
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

    // Reserve extra space for keyboard - this is the key fix
    const keyboardReserve = isMobile ?
      Math.max(120, h.keyboard * 1.2) :
      Math.max(100, h.keyboard * 1.1);

    // Calculate available height with better keyboard spacing
    const totalUsedHeight = h.title + h.lobby + h.leaderboard + h.input +
                           keyboardReserve + boardMargins + kbMargins + h.message;

    const availHeight = Math.max(200, root.clientHeight - totalUsedHeight - 20);

    // Size constraints
    const sizeByWidth = Math.max(20, (width - gap * 4) / 5);
    const sizeByHeight = Math.max(20, (availHeight - gap * (rows - 1)) / rows);

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

  // Additional mobile-specific adjustments
  if (isMobile && size < 35) {
    // On very small screens, make keyboard even more compact
    const keyboard = document.getElementById('keyboard');
    if (keyboard) {
      keyboard.style.transform = `scale(${Math.max(0.8, size / 35)})`;
      keyboard.style.transformOrigin = 'center bottom';
    }
  } else {
    // Reset any scaling on larger screens
    const keyboard = document.getElementById('keyboard');
    if (keyboard) {
      keyboard.style.transform = '';
      keyboard.style.transformOrigin = '';
    }
  }

  return { tile: size, board: boardWidth };
}

/**
 * Place a popup near an anchor element while clamping to the viewport.
 *
 * @param {HTMLElement} popup
 * @param {HTMLElement} anchor
 */
export function positionPopup(popup, anchor) {
  const rect = anchor.getBoundingClientRect();
  const menuWidth = popup.offsetWidth;
  const menuHeight = popup.offsetHeight;
  let left = rect.right + 10 + window.scrollX;
  if (window.innerWidth - rect.right < menuWidth + 10) {
    if (rect.left >= menuWidth + 10) {
      left = rect.left - menuWidth - 10 + window.scrollX;
    } else {
      left = Math.max(10 + window.scrollX, window.innerWidth - menuWidth - 10);
    }
  }
  let top = rect.top + window.scrollY;
  if (rect.bottom + menuHeight > window.scrollY + window.innerHeight - 10) {
    top = window.scrollY + window.innerHeight - menuHeight - 10;
  }
  top = Math.max(top, window.scrollY + 10);
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
 * Trap focus inside a dialog until it is closed.
 *
 * @param {HTMLElement} dialog
 */
export function openDialog(dialog) {
  lastFocused = document.activeElement;
  trappedDialog = dialog;
  trapHandler = trapFocus(dialog);
}

/**
 * Close a dialog and restore focus to the previous element.
 *
 * @param {HTMLElement} dialog
 */
export function closeDialog(dialog) {
  dialog.style.display = 'none';
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
  positionPopup(popup, anchor);
  openDialog(popup);
}

/**
 * Adjust the on-screen keyboard position when the visual viewport changes.
 */
export function adjustKeyboardForViewport() {
  const keyboard = document.getElementById('keyboard');
  if (!keyboard) return;
  if (window.visualViewport) {
    const offset = Math.max(0, window.innerHeight - window.visualViewport.height);
    keyboard.style.transform = `translateY(-${offset}px)`;
  } else {
    keyboard.style.transform = '';
  }
}
