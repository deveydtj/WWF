import { getCurrentLayoutState, refreshLayoutState } from './layoutManager.js';
import { applyDarkMode, prefersDarkMode } from './themeManager.js';
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
    messagePopup.style.animation = 'popup-toast-lifetime 2s';
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
 * Sync the UI with the saved choice or device preference.
 *
 * @param {HTMLElement} toggle - The dark mode toggle button.
 */
export function applyDarkModePreference(toggle, animate = false) {
  const prefersDark = prefersDarkMode();
  applyDarkMode(prefersDark, { animate });
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

/** Keep the reset control in the action row across viewport changes. */
export function repositionResetButton() {
  const resetWrapper = document.getElementById('resetWrapper');
  const inputArea = document.getElementById('inputArea');
  if (resetWrapper && inputArea && resetWrapper.parentElement !== inputArea) {
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

let lastFocused = null;
let trapHandler = null;
let trappedDialog = null;

const DIALOG_OVERLAY_BY_ID = Object.freeze({
  optionsMenu: OVERLAYS.OPTIONS
});

// Overlay changes (header actions or resizing) also release dialog ownership.
if (typeof document !== 'undefined') {
  document.addEventListener?.('overlaychange', ({ detail }) => {
    if (detail?.open === false && trappedDialog && DIALOG_OVERLAY_BY_ID[trappedDialog.id] === detail.overlay) {
      closeDialog(trappedDialog);
    }
  });
}

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
      e.preventDefault();
      e.stopPropagation();
      closeDialog(dialog);
    }
  };
  dialog.addEventListener('keydown', handler);
  first.focus();
  return handler;
}

/**
 * Open one dialog at a time and focus its first control.
 *
 * @param {HTMLElement} dialog
 * @param {HTMLElement} [trigger] Control to focus when the dialog closes.
 */
export function openDialog(dialog, trigger = document.activeElement) {
  if (!dialog || trappedDialog === dialog) return;
  if (trappedDialog) closeDialog(trappedDialog);

  lastFocused = trigger;
  trappedDialog = dialog;
  const overlayKey = DIALOG_OVERLAY_BY_ID[dialog.id];
  if (overlayKey) openOverlay(overlayKey);

  // Reveal the dialog before focusing it; hidden controls cannot receive focus.
  dialog.style.display = 'flex';
  dialog.classList.remove('hide');
  dialog.classList.add('visible', 'show');
  dialog.setAttribute('aria-hidden', 'false');
  trapHandler = trapFocus(dialog);
}

/** Close the active dialog and return focus to the control that opened it. */
export function closeDialog(dialog) {
  if (!dialog || trappedDialog !== dialog) return;
  dialog.removeEventListener('keydown', trapHandler);
  const restoreFocus = lastFocused;
  trapHandler = lastFocused = trappedDialog = null;

  const overlayKey = DIALOG_OVERLAY_BY_ID[dialog.id];
  if (overlayKey) closeOverlay(overlayKey);
  dialog.classList.remove('show', 'visible', 'hide');
  dialog.style.display = 'none';
  dialog.setAttribute('aria-hidden', 'true');
  restoreFocus?.focus();
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
