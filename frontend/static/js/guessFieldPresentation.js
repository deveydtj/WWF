/**
 * Apply the layout profile's optional guess-field presentation.
 *
 * The field remains connected to InputController even while hidden so it can
 * mirror currentGuess when a keyboard-first profile becomes active later.
 * Hiding it must not disable gameplay, because physical and virtual keys do
 * not depend on this field.
 *
 * @param {{showGuessField:boolean}} profile
 * @param {HTMLInputElement} guessInput
 */
export function applyGuessFieldPresentation(profile, guessInput) {
  if (typeof profile?.showGuessField !== 'boolean') {
    throw new TypeError('A layout profile with showGuessField is required');
  }
  if (!guessInput) return;

  if (profile.showGuessField) {
    guessInput.hidden = false;
    guessInput.removeAttribute('aria-hidden');
    guessInput.removeAttribute('tabindex');
    return;
  }

  if (typeof document !== 'undefined' && document.activeElement === guessInput) {
    guessInput.blur();
  }
  guessInput.hidden = true;
  guessInput.setAttribute('aria-hidden', 'true');
  guessInput.setAttribute('tabindex', '-1');
}
