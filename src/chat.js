export function renderChat(container, messages) {
  // If messages were cleared (e.g., new game), reset the container
  if (messages.length < container.childElementCount) {
    container.innerHTML = '';
  }

  const wasAtBottom =
    Math.abs(container.scrollHeight - container.scrollTop - container.clientHeight) < 5;

  // Append any new messages that haven't been rendered yet
  for (let i = container.childElementCount; i < messages.length; i++) {
    const m = messages[i];
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
  }

  // Keep the view pinned to the latest message if user was at bottom
  if (messages.length && wasAtBottom) {
    container.scrollTop = container.scrollHeight;
  }
}
