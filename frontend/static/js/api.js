export async function getState(emoji) {
  const url = emoji ? `/state?emoji=${encodeURIComponent(emoji)}` : '/state';
  const r = await fetch(url);
  if (!r.ok) throw new Error('Network response was not OK');
  return r.json();
}

export async function sendGuess(guess, emoji) {
  const r = await fetch('/guess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guess, emoji })
  });
  return r.json();
}

export async function resetGame() {
  const r = await fetch('/reset', { method: 'POST' });
  return r.json();
}

export async function sendEmoji(emoji) {
  const r = await fetch('/emoji', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emoji })
  });
  return r.json();
}

export async function sendHeartbeat(emoji) {
  return fetch('/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emoji })
  });
}

export async function sendChatMessage(text, emoji) {
  const r = await fetch('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, emoji })
  });
  return r.json();
}

export async function getChatMessages() {
  const r = await fetch('/chat');
  if (!r.ok) throw new Error('Network response was not OK');
  return r.json();
}

export async function requestHint(col, emoji) {
  const r = await fetch('/hint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ col, emoji })
  });
  return r.json();
}

export function subscribeToUpdates(onMessage) {
  if (!window.EventSource) return null;
  const es = new EventSource('/stream');
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onMessage(data);
    } catch {}
  };
  return es;
}
