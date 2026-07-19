import { updateBoard } from './board.js';
import { INPUT_OUTCOMES } from './inputController.js';

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

/**
 * Handle an activation click on the on-screen keyboard.
 *
 * Native button click events provide one activation path for touch, mouse,
 * keyboard, and assistive technology. Delegation also allows nested key
 * content (such as the Backspace label or icon) to activate its button.
 *
 * @param {Event} event
 * @param {{inputController:import('./inputController.js').InputController}} opts
 * @returns {string}
 */
export function handleVirtualKey(event, { inputController }) {
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
  const guessState = { inputController };

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
    animatePhysicalKey(keyboardEl, key);
  });
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
