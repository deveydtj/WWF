/**
 * Build an empty game board consisting of ``rows`` rows of tiles.
 *
 * @param {HTMLElement} board - Container element.
 * @param {number} [rows=6] - Number of rows to generate.
 */
export function createBoard(board, rows = 6) {
  board.innerHTML = '';
  for (let i = 0; i < rows * 5; i++) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.tabIndex = -1;
    board.appendChild(tile);
  }
}

/**
 * Render all guesses and the current input onto the board.
 * Existing tiles are cleared before applying new status classes.
 */
export function updateBoard(board, state, guessInput, rows = 6, gameOver = false, animateRow = -1, hint = null, hintRow = null) {
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
      if (row === animateRow) {
        tile.style.transitionDelay = `${i * 0.15}s`;
      } else {
        tile.style.transitionDelay = '';
      }
    }
  });

  const greenPositions = {};
  guesses.forEach(g => {
    for (let i = 0; i < 5; i++) {
      if (g.result[i] === 'correct') {
        greenPositions[i] = g.guess[i];
      }
    }
  });

  if (!gameOver && guesses.length < rows) {
    const rowIndex = guesses.length;
    for (let i = 0; i < 5; i++) {
      const tile = tiles[rowIndex * 5 + i];
      tile.classList.toggle('hint-target', hintRow === rowIndex);
      if (hint && hint.row === rowIndex && hint.col === i) {
        tile.textContent = hint.letter.toUpperCase();
        tile.classList.add('ghost');
      } else if (i < guessInput.value.length) {
        tile.textContent = guessInput.value[i].toUpperCase();
      } else if (greenPositions[i]) {
        tile.textContent = greenPositions[i].toUpperCase();
        tile.classList.add('ghost');
      }
    }
  }
}

/**
 * Play the reset animation that slides tiles off the board.
 *
 * @param {HTMLElement} board - Game board element.
 * @returns {Promise<void>} Resolves when animation completes.
 */
export function animateTilesOut(board) {
  const tiles = Array.from(board.children);
  tiles.forEach(t => t.classList.add('reset-out'));
  return new Promise(resolve => setTimeout(resolve, 250));
}

/**
 * Slide tiles back in after a reset animation.
 *
 * @param {HTMLElement} board - Board element.
 * @returns {Promise<void>} Resolves after tiles animate in.
 */
export function animateTilesIn(board) {
  const tiles = Array.from(board.children);
  tiles.forEach(t => {
    t.classList.add('reset-in');
    t.addEventListener('animationend', () => t.classList.remove('reset-in'), { once: true });
  });
  return new Promise(resolve => setTimeout(resolve, 250));
}

/**
 * Clear all status classes from the on-screen keyboard.
 *
 * @param {HTMLElement} keyboard - Keyboard container.
 */
export function resetKeyboard(keyboard) {
  Array.from(keyboard.querySelectorAll('.key')).forEach(key => {
    key.classList.remove('correct', 'present', 'absent');
  });
}

/**
 * Update the on-screen keyboard colors based on prior guesses.
 * Later guesses override earlier ones so the highest information wins.
 *
 * @param {HTMLElement} keyboard - Keyboard container.
 * @param {Array} guesses - List of guess objects from the server.
 */
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

/**
 * Derive required letters and fixed positions from previous guesses.
 *
 * @param {Array} guesses - Guess history from the server.
 * @returns {{requiredLetters:Set<string>, greenPositions:Object}}
 */
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

/**
 * Validate a guess against the hard mode constraints and report errors.
 *
 * @param {string} guess
 * @param {Set<string>} requiredLetters
 * @param {Object} greenPositions
 * @param {(msg:string)=>void} showMessage - Callback for errors.
 * @returns {boolean} True when the guess meets all constraints.
 */
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
