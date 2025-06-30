import { sendEmoji } from './api.js';
import { openDialog, closeDialog } from './utils.js';

/**
 * Retrieve the player's stored emoji identifier.
 *
 * @returns {string|null} Saved emoji or null if none.
 */
export function getMyEmoji() {
  return localStorage.getItem('myEmoji') || null;
}

/**
 * Persist the player's chosen emoji locally.
 *
 * @param {string} e - Emoji string.
 */
export function setMyEmoji(e) {
  localStorage.setItem('myEmoji', e);
}

export const allEmojis = [
  "🐶", "🦊", "🐼", "🐸", "🐵", "🐧", "🐙", "🦉", "🦄", "🦁",
  "🐯", "🐨", "🐻", "🦖", "🦕", "🐝", "🐳", "🦋", "🐢", "🐬"
];

/**
 * Display the emoji picker modal.
 *
 * @param {Array<string>} takenEmojis - Emojis already claimed by others.
 * @param {{onChosen:function, skipAutoCloseRef:{value:boolean}}} options
 */
export function showEmojiModal(takenEmojis, {
  onChosen,
  skipAutoCloseRef,
  onError
}) {
  const modal = document.getElementById('emojiModal');
  const choices = document.getElementById('emojiChoices');
  const errorEl = document.getElementById('emojiModalError');
  choices.innerHTML = '';

  allEmojis.forEach(e => {
    const btn = document.createElement('span');
    btn.className = 'emoji-choice';
    btn.innerText = e;
    btn.style.opacity = takenEmojis.includes(e) ? 0.3 : 1;
    btn.style.pointerEvents = takenEmojis.includes(e) ? 'none' : 'auto';

    btn.onclick = async () => {
    const data = await sendEmoji(e, window.LOBBY_CODE);
    if (data.status === 'ok') {
      if (skipAutoCloseRef) skipAutoCloseRef.value = false;
      setMyEmoji(e);
      if (typeof onChosen === 'function') onChosen(e);
      closeDialog(modal);
    } else {
      errorEl.textContent = data.msg || 'That emoji is taken.';
      if (typeof onError === 'function') onError(data.msg);
    }
  };

    choices.appendChild(btn);
  });

  errorEl.textContent = '';
  modal.style.display = 'flex';
  openDialog(modal);
}
