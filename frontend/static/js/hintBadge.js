export function updateHintBadge(badgeEl, available) {
  if (!badgeEl) return;
  badgeEl.style.display = available ? 'inline' : 'none';
}

