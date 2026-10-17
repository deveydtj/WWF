import { updateBoard } from './board.js';
import { INPUT_OUTCOMES } from './inputController.js';
import { hapticFeedback } from './haptics.js';

const EDITABLE_TAG_NAMES = new Set(['INPUT', 'SELECT', 'TEXTAREA']);
const MODAL_SELECTOR = '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]';
const keyAnimationTimers = new WeakMap();

/**
 * Convert a physical keyboard value into the canonical value used by the
 * in-game keyboard. Non-gameplay keys deliberately return null.
 *
 * @param {unknown} key
 * @returns {string|null}
 */
export function normalizePhysicalKey(key) {
  if (key === 'Enter' || key === 'Backspace') return key;
  if (typeof key === 'string' && /^[a-z]$/i.test(key)) return key.toLowerCase();
  return null;
}

/**
 * Whether an element owns text entry that must remain separate from gameplay.
 * `isContentEditable` accounts for descendants of a contenteditable host.
 *
 * @param {Element|null|undefined} element
 * @returns {boolean}
 */
export function isEditableElement(element) {
  const tagName = String(element?.tagName || '').toUpperCase();
  return EDITABLE_TAG_NAMES.has(tagName) || Boolean(element?.isContentEditable);
}

/**
 * Modal controls retain their keyboard events. This also ensures Escape can
 * reach the modal manager without affecting the active guess.
 *
 * @param {Element|null|undefined} element
 * @returns {boolean}
 */
export function isWithinModal(element) {
  return Boolean(element?.closest?.(MODAL_SELECTOR));
}

/**
 * Decide whether a document keydown belongs to gameplay.
 *
 * @param {KeyboardEvent} event
 * @param {HTMLInputElement} guessInput
 * @returns {boolean}
 */
export function shouldRoutePhysicalKey(event, guessInput) {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.key === 'Escape' ||
    !normalizePhysicalKey(event.key) ||
    guessInput.disabled
  ) {
    return false;
  }

  const eventTarget = event.target?.tagName ? event.target : null;
  const activeElement = eventTarget || document.activeElement;

  return activeElement !== guessInput &&
    !isEditableElement(activeElement) &&
    !isWithinModal(activeElement);
}

/**
 * Mirror a physical key press on the corresponding in-game key.
 *
 * @param {HTMLElement} keyboardEl
 * @param {string} key
 */
export function animatePhysicalKey(keyboardEl, key) {
  const keyElement = keyboardEl.querySelector(`.key[data-key="${key}"]`);
  if (!keyElement) return;

  const previousTimer = keyAnimationTimers.get(keyElement);
  if (previousTimer) clearTimeout(previousTimer);

  keyElement.classList.add('active-key-press');
  const timer = setTimeout(() => {
    keyElement.classList.remove('active-key-press');
    keyAnimationTimers.delete(keyElement);
  }, 150);
  keyAnimationTimers.set(keyElement, timer);
}

// Physical key presses hold the on-screen key down until the key is released,
// so a computer keyboard visibly drives the game keyboard. Phones and tablets
// type through the on-screen keys themselves, so this is for fine pointers.
const PHYSICAL_PRESS_CLASS = 'physical-press';
const MIN_PHYSICAL_PRESS_MS = 90;
const physicalPresses = new Map(); // key element -> { downAt, timer }

function supportsPhysicalPressFeedback() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/**
 * Press the on-screen key matching a physical key.
 *
 * @param {HTMLElement} keyboardEl
 * @param {string} key - Canonical key from normalizePhysicalKey().
 */
export function pressPhysicalKey(keyboardEl, key) {
  const keyElement = keyboardEl?.querySelector(`.key[data-key="${key}"]`);
  if (!keyElement) return;
  const previous = physicalPresses.get(keyElement);
  if (previous?.timer) clearTimeout(previous.timer);
  physicalPresses.set(keyElement, { downAt: Date.now(), timer: null });
  keyElement.classList.add(PHYSICAL_PRESS_CLASS);
}

/**
 * Release a pressed on-screen key, keeping a quick tap visible briefly.
 *
 * @param {HTMLElement} keyboardEl
 * @param {string} key
 */
export function releasePhysicalKey(keyboardEl, key) {
  const keyElement = keyboardEl?.querySelector(`.key[data-key="${key}"]`);
  const press = keyElement && physicalPresses.get(keyElement);
  if (!press || press.timer) return;
  const remaining = Math.max(0, MIN_PHYSICAL_PRESS_MS - (Date.now() - press.downAt));
  press.timer = setTimeout(() => {
    keyElement.classList.remove(PHYSICAL_PRESS_CLASS);
    physicalPresses.delete(keyElement);
  }, remaining);
}

/** Release every held key, e.g. when the window loses focus mid-press. */
export function releaseAllPhysicalKeys() {
  physicalPresses.forEach((press, keyElement) => {
    if (press.timer) clearTimeout(press.timer);
    keyElement.classList.remove(PHYSICAL_PRESS_CLASS);
  });
  physicalPresses.clear();
}

/**
 * Whether a physical key press should show on the on-screen keyboard. Typing
 * into the visible guess field counts; chat, other fields and modals do not.
 *
 * @param {KeyboardEvent} event
 * @param {HTMLInputElement} guessInput
 * @returns {boolean}
 */
export function shouldMirrorPhysicalKey(event, guessInput) {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey ||
      !normalizePhysicalKey(event.key) || guessInput.disabled) {
    return false;
  }
  const target = event.target?.tagName ? event.target : document.activeElement;
  if (target === guessInput) return true;
  return !isEditableElement(target) && !isWithinModal(target);
}

/**
 * Handle an activation click on the on-screen keyboard.
 *
 * Clicks preserve mouse, keyboard, and assistive technology activation. Touch
 * gestures use this same path on release, after selecting the key by position.
 * Delegation also allows nested key content to activate its button.
 *
 * @param {Event} event
 * @param {{inputController:import('./inputController.js').InputController, keyboardEl:HTMLElement}} opts
 * @returns {string}
 */
export function handleVirtualKey(event, { inputController, keyboardEl }) {
  const target = event.target;
  const keyElement = target?.classList?.contains('key')
    ? target
    : target?.closest?.('.key');
  if (!keyElement) return INPUT_OUTCOMES.IGNORED;

  // Only prevent default if the event is cancelable to avoid browser intervention warnings
  if (event.cancelable) {
    event.preventDefault();
  }

  const outcome = inputController.routeKey(keyElement.dataset.key, 'virtual-keyboard');
  if (outcome !== INPUT_OUTCOMES.BLOCKED) {
    animatePhysicalKey(keyboardEl, keyElement.dataset.key);
  }
  if (outcome === INPUT_OUTCOMES.ACCEPTED) hapticFeedback();
  if (typeof keyElement.focus === 'function') {
    keyElement.focus({ preventScroll: true });
  }

  return outcome;
}

/**
 * Wire up DOM event listeners for all keyboard input mechanisms.
 *
 * @param {Object} cfg
 * @param {HTMLElement} cfg.keyboardEl
 * @param {HTMLInputElement} cfg.guessInput
 * @param {HTMLElement} cfg.submitButton
 * @param {import('./inputController.js').InputController} cfg.inputController
 */
export function setupTypingListeners({
  keyboardEl,
  guessInput,
  submitButton,
  inputController
}) {
  const guessState = { inputController, keyboardEl };

  const touchKeys = new Map();
  const previewTouch = (touch) => {
    const hit = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.key');
    const key = hit && keyboardEl.contains(hit) && !hit.disabled ? hit : null;
    const previousKey = touchKeys.get(touch.identifier);
    touchKeys.set(touch.identifier, key);
    if (previousKey && !Array.from(touchKeys.values()).includes(previousKey)) {
      previousKey.classList.remove('touch-preview');
    }
    key?.classList.add('touch-preview');
  };
  keyboardEl.addEventListener('touchstart', (event) => {
    // Own the gesture from its start: no scrolling or compatibility click.
    if (event.cancelable) event.preventDefault();
    Array.from(event.changedTouches).forEach(previewTouch);
  }, { passive: false });
  keyboardEl.addEventListener('touchmove', (event) => {
    if (event.cancelable) event.preventDefault();
    Array.from(event.changedTouches).forEach(previewTouch);
  }, { passive: false });
  const finishTouch = (event) => {
    if (event.cancelable) event.preventDefault();
    for (const touch of event.changedTouches) {
      if (!touchKeys.has(touch.identifier)) continue;
      if (event.type === 'touchend') previewTouch(touch);
      const key = touchKeys.get(touch.identifier);
      touchKeys.delete(touch.identifier);
      if (key && !Array.from(touchKeys.values()).includes(key)) {
        key.classList.remove('touch-preview');
      }
      if (event.type === 'touchend' && key) {
        handleVirtualKey({ target: key, cancelable: false }, guessState);
      }
    }
  };
  keyboardEl.addEventListener('touchend', finishTouch, { passive: false });
  keyboardEl.addEventListener('touchcancel', finishTouch, { passive: false });

  keyboardEl.addEventListener('click', (e) => handleVirtualKey(e, guessState));
  submitButton.addEventListener('click', () => inputController.submit('submit-button'));
  guessInput.addEventListener('input', function () {
    inputController.replace(this.value, 'guess-field');
  });
  guessInput.addEventListener('keyup', function (event) {
    if (event.key === 'Enter') inputController.submit('guess-field');
  });
  document.addEventListener('keydown', function (event) {
    if (!shouldRoutePhysicalKey(event, guessInput)) return;

    const key = normalizePhysicalKey(event.key);
    inputController.routeKey(key, 'physical-keyboard');
    event.preventDefault();
  });

  if (supportsPhysicalPressFeedback()) {
    // Capture phase: mirror the press even when another handler takes the key.
    document.addEventListener('keydown', (event) => {
      if (shouldMirrorPhysicalKey(event, guessInput)) {
        pressPhysicalKey(keyboardEl, normalizePhysicalKey(event.key));
      }
    }, true);
    document.addEventListener('keyup', (event) => {
      const key = normalizePhysicalKey(event.key);
      if (key) releasePhysicalKey(keyboardEl, key);
    }, true);
    window.addEventListener('blur', releaseAllPhysicalKeys);
    document.addEventListener('visibilitychange', releaseAllPhysicalKeys);
  }
}

/**
 * Re-render the board when the shared current guess changes.
 *
 * @param {HTMLElement} boardEl
 * @param {Object} state
 * @param {string} currentGuess
 * @param {number} rows
 * @param {boolean} gameOver
 * @param {Object|null} [hint]
 * @param {number|null} [hintRow]
 */
export function updateBoardFromTyping(boardEl, state, currentGuess, rows, gameOver, hint = null, hintRow = null) {
  if (!state) return;
  updateBoard(boardEl, state, currentGuess, rows, gameOver, -1, hint, hintRow);
}
