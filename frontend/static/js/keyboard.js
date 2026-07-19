import { updateBoard } from './board.js';
import { INPUT_OUTCOMES } from './inputController.js';

/**
 * Handle clicks or touches on the on-screen keyboard.
 *
 * @param {Event} event
 * @param {{inputController:import('./inputController.js').InputController}} opts
 * @returns {string}
 */
export function handleVirtualKey(event, { inputController }) {
  if (!event.target.classList.contains('key')) return INPUT_OUTCOMES.IGNORED;

  // Only prevent default if the event is cancelable to avoid browser intervention warnings
  if (event.cancelable) {
    event.preventDefault();
  }

  const outcome = inputController.routeKey(event.target.dataset.key, 'virtual-keyboard');
  if (typeof event.target.focus === 'function') {
    event.target.focus({ preventScroll: true });
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
  keyboardEl.addEventListener('touchstart', (e) => handleVirtualKey(e, guessState));
  submitButton.addEventListener('click', () => inputController.submit('submit-button'));
  guessInput.addEventListener('input', function () {
    inputController.replace(this.value, 'guess-field');
  });
  guessInput.addEventListener('keyup', function (event) {
    if (event.key === 'Enter') inputController.submit('guess-field');
  });
  document.addEventListener('keydown', function (event) {
    const active = document.activeElement;
    if (guessInput.disabled || active === guessInput) return;
    if (active && active !== document.body &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
      return;
    }
    const key = event.key.toLowerCase();
    const outcome = inputController.routeKey(key, 'physical-keyboard');
    if (outcome !== INPUT_OUTCOMES.IGNORED) {
      event.preventDefault();
    }
    const keyElement = keyboardEl.querySelector(`.key[data-key="${key}"]`);
    if (keyElement) {
      keyElement.classList.add('active-key-press');
      setTimeout(() => keyElement.classList.remove('active-key-press'), 150);
    }
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
