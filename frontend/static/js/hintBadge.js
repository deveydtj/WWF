export function updateHintBadge(badgeEl, available, selecting = false) {
  if (!badgeEl) return;
  if (available) {
    badgeEl.style.display = 'inline';
    badgeEl.textContent = selecting ? '🔍 Cancel' : '🔍 x1';
    badgeEl.title = selecting ? 'Cancel hint selection' : 'Click to select a hint tile';
  } else {
    badgeEl.style.display = 'none';
  }
}

