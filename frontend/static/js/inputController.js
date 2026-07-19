export const INPUT_OUTCOMES = Object.freeze({
  ACCEPTED: 'accepted',
  IGNORED: 'ignored',
  SUBMITTED: 'submitted',
  BLOCKED: 'blocked'
});

const LETTER_PATTERN = /^[a-z]$/i;

/**
 * Normalize a guess-like value into the canonical in-progress guess format.
 *
 * @param {unknown} value
 * @param {number} maxLength
 * @returns {string}
 */
export function sanitizeGuess(value, maxLength = 5) {
  return String(value || '')
    .replace(/[^a-zA-Z]/g, '')
    .toLowerCase()
    .slice(0, maxLength);
}

/**
 * Owns all mutations and submission routing for the active gameplay guess.
 * DOM event modules should translate an event into one of these operations
 * rather than changing guess state directly.
 */
export class InputController {
  /**
   * @param {Object} options
   * @param {() => string} options.getCurrentGuess
   * @param {(value: string) => void} options.setCurrentGuess
   * @param {() => unknown} options.submitGuess
   * @param {(value: string) => void} [options.onGuessChanged]
   * @param {(source: string) => boolean} [options.isBlocked]
   * @param {number} [options.maxLength]
   */
  constructor({
    getCurrentGuess,
    setCurrentGuess,
    submitGuess,
    onGuessChanged = () => {},
    isBlocked = () => false,
    maxLength = 5
  }) {
    if (typeof getCurrentGuess !== 'function' || typeof setCurrentGuess !== 'function') {
      throw new TypeError('InputController requires guess state getter and setter functions.');
    }
    if (typeof submitGuess !== 'function') {
      throw new TypeError('InputController requires a submitGuess function.');
    }

    this.getCurrentGuess = getCurrentGuess;
    this.setCurrentGuess = setCurrentGuess;
    this.submitGuess = submitGuess;
    this.onGuessChanged = onGuessChanged;
    this.isBlocked = isBlocked;
    this.maxLength = maxLength;
  }

  getValue() {
    return sanitizeGuess(this.getCurrentGuess(), this.maxLength);
  }

  replace(value, source = 'unknown') {
    if (this.isBlocked(source)) return INPUT_OUTCOMES.BLOCKED;

    const nextGuess = sanitizeGuess(value, this.maxLength);
    if (nextGuess === this.getValue()) {
      // Re-apply the canonical value so a mirrored text field cannot retain
      // rejected characters when sanitation does not change the game state.
      this.setCurrentGuess(nextGuess);
      return INPUT_OUTCOMES.IGNORED;
    }

    return this._commit(nextGuess);
  }

  append(letter, source = 'unknown') {
    if (this.isBlocked(source)) return INPUT_OUTCOMES.BLOCKED;
    if (!LETTER_PATTERN.test(String(letter || ''))) return INPUT_OUTCOMES.IGNORED;

    const currentGuess = this.getValue();
    if (currentGuess.length >= this.maxLength) return INPUT_OUTCOMES.IGNORED;

    return this._commit(currentGuess + letter);
  }

  delete(source = 'unknown') {
    if (this.isBlocked(source)) return INPUT_OUTCOMES.BLOCKED;

    const currentGuess = this.getValue();
    if (!currentGuess) return INPUT_OUTCOMES.IGNORED;

    return this._commit(currentGuess.slice(0, -1));
  }

  submit(source = 'unknown') {
    if (this.isBlocked(source)) return INPUT_OUTCOMES.BLOCKED;
    this.submitGuess();
    return INPUT_OUTCOMES.SUBMITTED;
  }

  routeKey(key, source = 'unknown') {
    if (key === 'Enter' || key === 'enter') return this.submit(source);
    if (key === 'Backspace' || key === 'backspace') return this.delete(source);
    return this.append(key, source);
  }

  _commit(value) {
    const nextGuess = sanitizeGuess(value, this.maxLength);
    if (nextGuess === this.getValue()) return INPUT_OUTCOMES.IGNORED;

    this.setCurrentGuess(nextGuess);
    this.onGuessChanged(nextGuess);
    return INPUT_OUTCOMES.ACCEPTED;
  }
}
