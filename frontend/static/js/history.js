/**
 * Render the history sidebar showing all previous guesses.
 *
 * @param {HTMLElement} container - UL/OL element that receives list items.
 * @param {Array} guesses - Combined guess history.
 */
export function renderHistory(container, guesses) {
  container.innerHTML = '';
  for (let i = guesses.length - 1; i >= 0; i--) {
    const g = guesses[i];
    const li = document.createElement('li');
    li.className = g.voided ? 'history-item history-voided' : 'history-item';

    const spanEmoji = document.createElement('span');
    spanEmoji.className = 'history-emoji';
    spanEmoji.textContent = g.emoji;

    const tilesContainer = document.createElement('div');
    tilesContainer.className = 'history-guess-tiles';
    for (let j = 0; j < 5; j++) {
      const tile = document.createElement('div');
      tile.className = 'tile ' + g.result[j];
      tile.textContent = g.guess[j].toUpperCase();
      tilesContainer.appendChild(tile);
    }

    const spanPoints = document.createElement('span');
    spanPoints.className = 'history-points';
    spanPoints.textContent = (g.points >= 0 ? '+' : '') + g.points;
    if (g.voided) {
      // The squad voted to scrap this round, so these points were refunded.
      spanPoints.title = 'Refunded by squad vote';
      spanPoints.setAttribute('aria-label', `${spanPoints.textContent}, refunded`);
    }

    li.append(spanEmoji, tilesContainer, spanPoints);
    container.appendChild(li);
  }
}
