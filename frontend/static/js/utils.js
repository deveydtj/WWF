import { getCurrentLayoutState, refreshLayoutState } from './layoutManager.js';
import { OVERLAYS, closeOverlay, openOverlay } from './overlayState.js';
import {
  isPhoneLayout,
  isTabletLayout
} from './layoutModes.js';

/**
 * Basic mobile device check used to tailor UI behavior.
 * @type {boolean}
 */
export const isMobile =
  typeof navigator !== 'undefined' &&
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * Check if we're in phone responsive layout (viewport <= 600px).
 * This matches the Phase 1 layout contract.
 */
export function isPhoneView() {
  return isPhoneLayout(getCurrentLayoutState().mode);
}

/**
 * Check if we're in tablet responsive layout (viewport 601px-900px).
 */
export function isTabletView() {
  return isTabletLayout(getCurrentLayoutState().mode);
}

/**
 * Compatibility alias for older call sites.
 *
 * @deprecated Consume the current layout profile's interaction and density
 * fields instead. Do not add new call sites.
 */
export function isMobileView() {
  return isPhoneView();
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
 * On phone layouts (≤600px) the reset control lives in the top header per Phase 6.
 * On tablet/desktop it lives in the input area below the board.
 */
export function repositionResetButton() {
  const resetWrapper = document.getElementById('resetWrapper');
  const inputArea = document.getElementById('inputArea');
  const lobbyHeader = document.getElementById('lobbyHeader');
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
    // Phone layout: reset lives in the top header
    if (lobbyHeader && resetWrapper.parentElement !== lobbyHeader) {
      if (resetWrapper.parentElement) {
        resetWrapper.parentElement.removeChild(resetWrapper);
      }
      lobbyHeader.appendChild(resetWrapper);
      console.log('✅ Moved reset button to lobbyHeader for phone layout');
    }
  } else if (resetWrapper.parentElement !== inputArea) {
    // Tablet/Desktop: reset lives in the input area below the board
    if (resetWrapper.parentElement) {
      resetWrapper.parentElement.removeChild(resetWrapper);
    }
    inputArea.appendChild(resetWrapper);
    console.log('✅ Moved reset button to inputArea for tablet/desktop layout');
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

/**
 * Set the layout mode (phone/tablet/desktop) based on viewport width.
 * Also determines if history panel should be in popup mode when rail space is constrained.
 */
export function applyLayoutMode() {
  return refreshLayoutState();
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

const DIALOG_OVERLAY_BY_ID = Object.freeze({
  optionsMenu: OVERLAYS.OPTIONS
});

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

  const overlayKey = DIALOG_OVERLAY_BY_ID[dialog.id];
  if (overlayKey) {
    openOverlay(overlayKey, { closeCompeting: false });
  }
  
  // Show with animation
  dialog.style.display = 'flex';
  dialog.classList.remove('hide');
  dialog.classList.add('visible');
  dialog.classList.add('show');
}

/**
 * Close a dialog with smooth animation.
 *
 * @param {HTMLElement} dialog
 */
export function closeDialog(dialog) {
  const overlayKey = DIALOG_OVERLAY_BY_ID[dialog.id];
  if (overlayKey) {
    closeOverlay(overlayKey);
  }

  dialog.classList.remove('show');
  dialog.classList.remove('visible');
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
