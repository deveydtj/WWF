import { sendEmoji } from './api.js';

export function getMyEmoji() {
  return localStorage.getItem('myEmoji') || null;
}

export function setMyEmoji(e) {
  localStorage.setItem('myEmoji', e);
}

export const allEmojis = [
  "🐶", "🦊", "🐼", "🐸", "🐵", "🐧", "🐙", "🦉", "🦄", "🦁",
  "🐯", "🐨", "🐻", "🦖", "🦕", "🐝", "🐳", "🦋", "🐢", "🐬"
];

export function showEmojiModal(takenEmojis, {
  onChosen,
  skipAutoCloseRef
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
      const data = await sendEmoji(e);
      if (data.status === 'ok') {
        if (skipAutoCloseRef) skipAutoCloseRef.value = false;
        setMyEmoji(e);
        if (typeof onChosen === 'function') onChosen(e);
        modal.style.display = 'none';
      } else {
        errorEl.textContent = data.msg || 'That emoji is taken.';
      }
    };

    choices.appendChild(btn);
  });

  errorEl.textContent = '';
  modal.style.display = '';
}
