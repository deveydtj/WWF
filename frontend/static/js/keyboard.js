import { updateBoard } from './board.js';
import { OVERLAYS, isOverlayOpen } from './overlayState.js';

/**
 * Handle clicks or touches on the on-screen keyboard.
 *
 * @param {Event} event
 * @param {{guessInput:HTMLInputElement, submitGuessHandler:Function, isAnimating:Function, getCurrentGuess:Function, setCurrentGuess:Function}} opts
 * @param {Function} updateBoardFromTyping
 */
export function handleVirtualKey(event, opts, updateBoardFromTyping) {
  const { guessInput, submitGuessHandler, isAnimating } = opts;
  if (event.target.classList.contains('key') && !guessInput.disabled && !isAnimating()) {
    // Only prevent default if the event is cancelable to avoid browser intervention warnings
    if (event.cancelable) {
      event.preventDefault();
    }
    const key = event.target.dataset.key;
    const currentValue = getCurrentGuessValue(opts);
    if (key === 'Enter') {
      submitGuessHandler();
    } else if (key === 'Backspace') {
      setCurrentGuessValue(opts, currentValue.slice(0, -1));
      updateBoardFromTyping();
    } else if (currentValue.length < 5 && /^[a-z]$/i.test(key)) {
      setCurrentGuessValue(opts, currentValue + key);
      updateBoardFromTyping();
    }
    // Don't focus guess input if chat is open and chat input might be focused
    const chatOpen = isOverlayOpen(OVERLAYS.CHAT);
    const activeChatInput = document.activeElement && document.activeElement.id === 'chatInput';
    if (!chatOpen || !activeChatInput) {
      guessInput.focus();
    }
  }
}

function sanitizeGuess(value) {
  return String(value || '').replace(/[^a-zA-Z]/g, '').toLowerCase().slice(0, 5);
}

function getCurrentGuessValue({ getCurrentGuess, guessInput }) {
  if (typeof getCurrentGuess === 'function') {
    return sanitizeGuess(getCurrentGuess());
  }

  return sanitizeGuess(guessInput?.value);
}

function setCurrentGuessValue({ setCurrentGuess, guessInput }, value) {
  const nextGuess = sanitizeGuess(value);
  if (typeof setCurrentGuess === 'function') {
    setCurrentGuess(nextGuess);
  } else if (guessInput) {
    guessInput.value = nextGuess.toUpperCase();
  }

  return nextGuess;
}

/**
 * Wire up DOM event listeners for all keyboard input mechanisms.
 *
 * @param {Object} cfg
 * @param {HTMLElement} cfg.keyboardEl
 * @param {HTMLInputElement} cfg.guessInput
 * @param {HTMLElement} cfg.submitButton
 * @param {Function} cfg.submitGuessHandler
 * @param {Function} cfg.updateBoardFromTyping
 * @param {Function} cfg.isAnimating
 * @param {Function} cfg.getCurrentGuess
 * @param {Function} cfg.setCurrentGuess
 */
export function setupTypingListeners({
  keyboardEl,
  guessInput,
  submitButton,
  submitGuessHandler,
  updateBoardFromTyping,
  isAnimating,
  getCurrentGuess,
  setCurrentGuess
}) {
  const guessState = { guessInput, submitGuessHandler, isAnimating, getCurrentGuess, setCurrentGuess };

  keyboardEl.addEventListener('click', (e) => handleVirtualKey(e, guessState, updateBoardFromTyping));
  keyboardEl.addEventListener('touchstart', (e) => handleVirtualKey(e, guessState, updateBoardFromTyping));
  submitButton.addEventListener('click', submitGuessHandler);
  guessInput.addEventListener('input', function () {
    setCurrentGuessValue(guessState, this.value);
    updateBoardFromTyping();
  });
  guessInput.addEventListener('keyup', function (event) {
    if (event.key === 'Enter') submitGuessHandler();
  });
  document.addEventListener('keydown', function (event) {
    if (isAnimating()) {
      event.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (guessInput.disabled || active === guessInput) return;
    if (active && active !== document.body &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
      return;
    }
    const key = event.key.toLowerCase();
    const currentValue = getCurrentGuessValue(guessState);
    if (key === 'enter') {
      event.preventDefault();
      submitGuessHandler();
    } else if (key === 'backspace') {
      event.preventDefault();
      setCurrentGuessValue(guessState, currentValue.slice(0, -1));
      updateBoardFromTyping();
    } else if (currentValue.length < 5 && /^[a-z]$/.test(key)) {
      event.preventDefault();
      setCurrentGuessValue(guessState, currentValue + key);
      updateBoardFromTyping();
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
