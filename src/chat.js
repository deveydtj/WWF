export function renderChat(container, messages) {
  container.innerHTML = '';
  messages.forEach(m => {
    const wrap = document.createElement('div');
    wrap.className = 'chat-entry';
    const emoji = document.createElement('span');
    emoji.className = 'chat-emoji';
    emoji.textContent = m.emoji;
    const bubble = document.createElement('span');
    bubble.className = 'chat-bubble';
    bubble.textContent = m.text;
    wrap.append(emoji, bubble);
    container.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('visible'));
  });
}
