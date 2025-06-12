export function createBoard(board, rows = 6) {
  board.innerHTML = '';
  for (let i = 0; i < rows * 5; i++) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    board.appendChild(tile);
  }
}

export function updateBoard(board, state, guessInput, rows = 6, gameOver = false) {
  const guesses = state.guesses;
  const tiles = board.children;
  for (let i = 0; i < rows * 5; i++) {
    tiles[i].textContent = '';
    tiles[i].className = 'tile';
  }
  guesses.forEach((g, row) => {
    for (let i = 0; i < 5; i++) {
      const tile = tiles[row * 5 + i];
      tile.textContent = g.guess[i].toUpperCase();
      tile.classList.add(g.result[i]);
    }
  });
  if (!gameOver && guessInput.value && guesses.length < rows) {
    for (let i = 0; i < guessInput.value.length; i++) {
      const tile = tiles[guesses.length * 5 + i];
      tile.textContent = guessInput.value[i].toUpperCase();
    }
  }
}

export function animateTilesOut(board) {
  const tiles = Array.from(board.children);
  tiles.forEach(t => t.classList.add('reset-out'));
  return new Promise(resolve => setTimeout(resolve, 250));
}

export function animateTilesIn(board) {
  const tiles = Array.from(board.children);
  tiles.forEach(t => {
    t.classList.add('reset-in');
    t.addEventListener('animationend', () => t.classList.remove('reset-in'), { once: true });
  });
  return new Promise(resolve => setTimeout(resolve, 250));
}

export function resetKeyboard(keyboard) {
  Array.from(keyboard.querySelectorAll('.key')).forEach(key => {
    key.classList.remove('correct', 'present', 'absent');
  });
}

export function updateKeyboardFromGuesses(keyboard, guesses) {
  resetKeyboard(keyboard);
  const statusOrder = { absent: 1, present: 2, correct: 3 };
  const keyStatus = {};
  guesses.forEach(g => {
    for (let i = 0; i < 5; i++) {
      const letter = g.guess[i].toLowerCase();
      const status = g.result[i];
      if (!keyStatus[letter] || statusOrder[status] > statusOrder[keyStatus[letter]]) {
        keyStatus[letter] = status;
      }
    }
  });
  for (const letter in keyStatus) {
    const keyEl = keyboard.querySelector(`.key[data-key="${letter}"]`);
    if (keyEl) keyEl.classList.add(keyStatus[letter]);
  }
}

export function updateHardModeConstraints(guesses) {
  const requiredLetters = new Set();
  const greenPositions = {};
  guesses.forEach(g => {
    for (let i = 0; i < 5; i++) {
      if (g.result[i] === 'correct') {
        requiredLetters.add(g.guess[i]);
        greenPositions[i] = g.guess[i];
      } else if (g.result[i] === 'present') {
        requiredLetters.add(g.guess[i]);
      }
    }
  });
  return { requiredLetters, greenPositions };
}

export function isValidHardModeGuess(guess, requiredLetters, greenPositions, showMessage) {
  for (const index in greenPositions) {
    if (guess[index] !== greenPositions[index]) {
      showMessage(`Letter ${greenPositions[index].toUpperCase()} must be in position ${Number(index) + 1}.`);
      return false;
    }
  }
  const guessLetters = new Set(guess.split(''));
  for (const required of requiredLetters) {
    if (!guessLetters.has(required)) {
      showMessage(`Guess must contain letter ${required.toUpperCase()}.`);
      return false;
    }
  }
  return true;
}
