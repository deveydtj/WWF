/**
 * Fetch the latest game state from the server.
 *
 * @param {string} [emoji] - Current player's emoji to include in the request.
 * @returns {Promise<Object>} Parsed JSON state payload.
 */
export async function getState(emoji) {
  const url = emoji ? `/state?emoji=${encodeURIComponent(emoji)}` : '/state';
  const r = await fetch(url);
  if (!r.ok) throw new Error('Network response was not OK');
  return r.json();
}

/**
 * Submit a guess to the backend.
 *
 * @param {string} guess - Five letter word.
 * @param {string} emoji - Player identifier.
 * @returns {Promise<Object>} Guess response payload.
 */
export async function sendGuess(guess, emoji) {
  const r = await fetch('/guess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guess, emoji })
  });
  return r.json();
}

/**
 * Force a new round by resetting the current game.
 */
export async function resetGame() {
  const r = await fetch('/reset', { method: 'POST' });
  return r.json();
}

/**
 * Register the player's chosen emoji with the server.
 *
 * @param {string} emoji - Emoji avatar.
 * @returns {Promise<Object>} Response payload.
 */
export async function sendEmoji(emoji) {
  const r = await fetch('/emoji', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emoji })
  });
  return r.json();
}

/**
 * Let the server know the player is still active.
 *
 * @param {string} emoji - Player identifier.
 * @returns {Promise<Response>} Raw fetch response.
 */
export async function sendHeartbeat(emoji) {
  return fetch('/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emoji })
  });
}

/**
 * Post a chat message to the game room.
 *
 * @param {string} text - Message text.
 * @param {string} emoji - Player emoji.
 * @returns {Promise<Object>} Response payload.
 */
export async function sendChatMessage(text, emoji) {
  const r = await fetch('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, emoji })
  });
  return r.json();
}

/**
 * Retrieve the current list of chat messages.
 *
 * @returns {Promise<Object>} Chat message payload.
 */
export async function getChatMessages() {
  const r = await fetch('/chat');
  if (!r.ok) throw new Error('Network response was not OK');
  return r.json();
}

/**
 * Claim a Daily Double hint for the next row.
 *
 * @param {number} col - Column index to reveal.
 * @param {string} emoji - Player identifier.
 * @returns {Promise<Object>} Hint response payload.
 */
export async function requestHint(col, emoji) {
  const r = await fetch('/hint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ col, emoji })
  });
  return r.json();
}

/**
 * Listen for server-sent game state updates.
 *
 * @param {(state:Object)=>void} onMessage - Callback for each update.
 * @returns {EventSource|null} EventSource handle or null when unsupported.
 */
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
