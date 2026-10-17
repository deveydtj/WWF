export function updateHintBadge(badgeEl, available, selecting = false, saved = false) {
  if (!badgeEl) return;
  if (available) {
    badgeEl.style.display = 'inline';
    badgeEl.textContent = selecting ? '🔍 Cancel' : '🔍 x1';
    badgeEl.classList?.toggle('hint-saved', Boolean(saved));
    badgeEl.title = selecting
      ? 'Cancel hint selection'
      : saved ? 'Hint saved for the next round' : 'Click to select a hint tile';
    badgeEl.setAttribute?.('aria-label', badgeEl.title);
  } else {
    badgeEl.style.display = 'none';
  }
}
