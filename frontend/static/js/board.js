/*
 * Reveal timing. Tiles flip one after another; each tile shows its colour at
 * the moment it is edge-on. Other feedback (keyboard colours, emoji stamps,
 * points) waits for getRevealDuration() so nothing spoils the reveal.
 */
export const REVEAL_STAGGER_MS = 220;
export const REVEAL_FLIP_MS = 500;
const WIN_HOP_PAUSE_MS = 80;
const WIN_HOP_STAGGER_MS = 90;
const WIN_HOP_MS = 480;
const RESULT_CLASSES = ['correct', 'present', 'absent'];
// Animation classes that must survive a state refresh until they finish.
const PERSISTENT_ANIMATIONS = ['letter-in', 'row-shake', 'dd-glow'];
const REVEAL_ANIMATIONS = ['flip-reveal', 'win-hop'];

export function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Milliseconds from a row's submission until its last tile has flipped. */
export function getRevealDuration() {
  return prefersReducedMotion() ? 0 : REVEAL_STAGGER_MS * 4 + REVEAL_FLIP_MS;
}

/** Milliseconds from submission until a tile is edge-on and changes colour. */
export function getTileRevealMoment(col) {
  return prefersReducedMotion() ? 0 : REVEAL_STAGGER_MS * col + REVEAL_FLIP_MS / 2;
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Milliseconds until a row that is flipping right now finishes, or until one
 * tile in it changes colour when ``col`` is given. Zero when nothing is
 * flipping. Measured from the reveal that is actually on screen, which may
 * have started from a live update before this player's own response arrived.
 */
export function msUntilReveal(board, row, col = null) {
  const tile = board?.children?.[row * 5 + (col ?? 0)];
  const start = Number(tile?.dataset?.revealStart);
  if (!start) return 0;
  const offset = col === null ? getRevealDuration() : getTileRevealMoment(col);
  return Math.max(0, Math.round(start + offset - now()));
}

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
 * Add animation when a letter appears in a tile
 */
function animateLetterIn(tile, letter) {
  tile.textContent = letter.toUpperCase();
  tile.classList.add('letter-in');
  
  // Remove animation class after animation completes
  tile.addEventListener('animationend', () => {
    tile.classList.remove('letter-in');
  }, { once: true });
}

/**
 * Render all guesses and the current guess state onto the board.
 * Existing tiles are cleared before applying new status classes.
 */
export function updateBoard(board, state, currentGuess = '', rows = 6, gameOver = false, animateRow = -1, hint = null, hintRow = null) {
  const guesses = state.guesses;
  const activeGuess = String(currentGuess || '').slice(0, 5);
  const tiles = board.children;
  
  // Store previous state to detect new letters
  const previousTexts = Array.from(tiles).map(tile => tile.textContent);
  const previousGhosts = Array.from(tiles).map(tile => tile.classList.contains('ghost'));
  
  const renderTime = now();
  for (let i = 0; i < rows * 5; i++) {
    const tile = tiles[i];
    tile.textContent = '';
    // State refreshes must not cancel an animation already in progress.
    const kept = PERSISTENT_ANIMATIONS.filter(name => tile.classList.contains(name));
    const revealEnd = tile.dataset?.revealEnd;
    if (Number(revealEnd) > renderTime) {
      kept.push(...REVEAL_ANIMATIONS.filter(name => tile.classList.contains(name)));
    } else if (revealEnd) {
      delete tile.dataset.revealEnd;
      delete tile.dataset.revealStart;
      tile.style.removeProperty('--reveal-delay');
      tile.style.removeProperty('--hop-delay');
    }
    tile.className = ['tile', ...kept].join(' ');
  }

  const revealMs = animateRow >= 0 ? getRevealDuration() : 0;
  const animatedGuess = revealMs ? guesses[animateRow] : null;
  const isWinningRow = Boolean(animatedGuess?.result?.every(r => r === 'correct'));
  guesses.forEach((g, row) => {
    for (let i = 0; i < 5; i++) {
      const tile = tiles[row * 5 + i];
      tile.textContent = g.guess[i].toUpperCase();
      tile.classList.add(g.result[i]);
      if (row === animateRow && revealMs) {
        tile.style.setProperty('--reveal-delay', `${i * REVEAL_STAGGER_MS}ms`);
        tile.style.setProperty('--reveal-flip', `${REVEAL_FLIP_MS}ms`);
        tile.classList.remove(...REVEAL_ANIMATIONS);
        tile.classList.add('flip-reveal');
        let end = revealMs;
        if (isWinningRow) {
          const hopDelay = revealMs + WIN_HOP_PAUSE_MS + i * WIN_HOP_STAGGER_MS;
          tile.style.setProperty('--hop-delay', `${hopDelay}ms`);
          tile.classList.add('win-hop');
          end = hopDelay + WIN_HOP_MS;
        }
        tile.dataset.revealEnd = String(renderTime + end);
        tile.dataset.revealStart = String(renderTime);
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
      const tileIndex = rowIndex * 5 + i;
      
      tile.classList.toggle('hint-target', hintRow === rowIndex);
      if (i < activeGuess.length) {
        // A typed letter always shows; the hint stays as a ghost behind it.
        const newLetter = activeGuess[i].toUpperCase();
        if (previousTexts[tileIndex] !== newLetter || previousGhosts[tileIndex]) {
          animateLetterIn(tile, newLetter);
        } else {
          tile.textContent = newLetter;
        }
        if (greenPositions[i] === activeGuess[i]) tile.classList.add('correct');
      } else if (hint && hint.row === rowIndex && hint.col === i) {
        if (previousTexts[tileIndex] !== hint.letter.toUpperCase()) {
          animateLetterIn(tile, hint.letter);
        } else {
          tile.textContent = hint.letter.toUpperCase();
        }
        tile.classList.add('ghost', 'hint-letter');
      } else if (greenPositions[i]) {
        if (previousTexts[tileIndex] !== greenPositions[i].toUpperCase()) {
          animateLetterIn(tile, greenPositions[i]);
        } else {
          tile.textContent = greenPositions[i].toUpperCase();
        }
        tile.classList.add('ghost');
      }
    }
  }
}

/**
 * Shake one row of tiles to reject a guess.
 *
 * @param {HTMLElement} board - Game board element.
 * @param {number} rowIndex - Row to shake.
 * @returns {boolean} False when the row does not exist.
 */
export function shakeRow(board, rowIndex) {
  const tiles = Array.from(board?.children || []).slice(rowIndex * 5, rowIndex * 5 + 5);
  if (tiles.length !== 5 || prefersReducedMotion()) return tiles.length === 5;
  tiles.forEach(tile => {
    tile.classList.remove('row-shake');
    void tile.offsetWidth;
    tile.classList.add('row-shake');
    // Always clear the class, even if the animation is cancelled, so it can
    // never linger and block a later reveal.
    const done = () => {
      clearTimeout(fallback);
      tile.classList.remove('row-shake');
      tile.removeEventListener('animationend', onEnd);
      tile.removeEventListener('animationcancel', onEnd);
    };
    const onEnd = (event) => { if (event.animationName === 'shake') done(); };
    const fallback = setTimeout(done, 600);
    tile.addEventListener('animationend', onEnd);
    tile.addEventListener('animationcancel', onEnd);
  });
  return true;
}

/**
 * The first row that has not been submitted yet.
 *
 * @param {HTMLElement} board
 * @returns {number}
 */
export function getActiveRowIndex(board) {
  const tiles = Array.from(board?.children || []);
  for (let row = 0; row * 5 < tiles.length; row++) {
    const rowTiles = tiles.slice(row * 5, row * 5 + 5);
    const submitted = rowTiles.every(t => !t.classList.contains('ghost') &&
      RESULT_CLASSES.some(c => t.classList.contains(c)));
    if (!submitted) return row;
  }
  return -1;
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
