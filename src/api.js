export async function getState() {
  const r = await fetch('/state');
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
