export function saveHintState(emoji, row, hint) {
  if (!emoji) return;
  const data = { row, hint };
  localStorage.setItem('hintState-' + emoji, JSON.stringify(data));
}

export function loadHintState(emoji) {
  if (!emoji) return { row: null, hint: null };
  const raw = localStorage.getItem('hintState-' + emoji);
  if (!raw) return { row: null, hint: null };
  try {
    const data = JSON.parse(raw);
    return {
      row: data.row !== undefined ? data.row : null,
      hint: data.hint || null
    };
  } catch (e) {
    return { row: null, hint: null };
  }
}
