import { updateBoard } from './board.js';
import { getState } from './api.js';

export function handleVirtualKey(event, {guessInput, submitGuessHandler, isAnimating}, updateBoardFromTyping) {
  if (event.target.classList.contains('key') && !guessInput.disabled && !isAnimating()) {
    event.preventDefault();
    const key = event.target.dataset.key;
    const currentValue = guessInput.value;
    if (key === 'Enter') {
      submitGuessHandler();
    } else if (key === 'Backspace') {
      guessInput.value = currentValue.slice(0, -1);
    } else if (currentValue.length < 5 && /^[a-z]$/i.test(key)) {
      guessInput.value += key.toUpperCase();
    }
    guessInput.focus();
    updateBoardFromTyping();
  }
}

export function setupTypingListeners({keyboardEl, guessInput, submitButton, submitGuessHandler, updateBoardFromTyping, isAnimating}) {
  keyboardEl.addEventListener('click', (e) => handleVirtualKey(e, {guessInput, submitGuessHandler, isAnimating}, updateBoardFromTyping));
  keyboardEl.addEventListener('touchstart', (e) => handleVirtualKey(e, {guessInput, submitGuessHandler, isAnimating}, updateBoardFromTyping));
  submitButton.addEventListener('click', submitGuessHandler);
  guessInput.addEventListener('input', function () {
    this.value = this.value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 5);
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
    const currentValue = guessInput.value;
    if (key === 'enter') {
      event.preventDefault();
      submitGuessHandler();
    } else if (key === 'backspace') {
      event.preventDefault();
      guessInput.value = currentValue.slice(0, -1);
      updateBoardFromTyping();
    } else if (currentValue.length < 5 && /^[a-z]$/.test(key)) {
      event.preventDefault();
      guessInput.value += key.toUpperCase();
      updateBoardFromTyping();
    }
    const keyElement = keyboardEl.querySelector(`.key[data-key="${key}"]`);
    if (keyElement) {
      keyElement.classList.add('active-key-press');
      setTimeout(() => keyElement.classList.remove('active-key-press'), 150);
    }
  });
}

export async function updateBoardFromTyping(boardEl, guessInput, rows, gameOver) {
  const state = await getState();
  updateBoard(boardEl, state, guessInput, rows, gameOver);
}
