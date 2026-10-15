function hintStorage() {
  return globalThis.PRIVATE_ROOM ? sessionStorage : localStorage;
}
function hintKey(emoji) {
  return 'hintState-' + (globalThis.PRIVATE_ROOM ? globalThis.PRIVATE_ROOM.room + '-' : '') + emoji;
}

export function saveHintState(emoji, row, hint) {
  if (!emoji) return;
  const data = { row, hint };
  hintStorage().setItem(hintKey(emoji), JSON.stringify(data));
}

export function loadHintState(emoji) {
  if (!emoji) return { row: null, hint: null };
  const raw = hintStorage().getItem(hintKey(emoji));
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
