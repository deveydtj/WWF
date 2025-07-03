/**
 * Fetch the latest game state from the server.
 *
 * @param {string} [emoji] - Current player's emoji to include in the request.
 * @returns {Promise<Object>} Parsed JSON state payload.
 */
export async function getState(emoji, lobbyId) {
  const base = lobbyId ? `/lobby/${lobbyId}/state` : '/state';
  const url = emoji ? `${base}?emoji=${encodeURIComponent(emoji)}` : base;
  const r = await fetch(url);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error('HTTP ' + r.status);
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}

/**
 * Submit a guess to the backend.
 *
 * @param {string} guess - Five letter word.
 * @param {string} emoji - Player identifier.
 * @returns {Promise<Object>} Guess response payload.
 */
export async function sendGuess(guess, emoji, playerId, lobbyId) {
  const url = lobbyId ? `/lobby/${lobbyId}/guess` : '/guess';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guess, emoji, player_id: playerId })
  });
  return r.json();
}

/**
 * Force a new round by resetting the current game.
 */
export async function resetGame(lobbyId, hostToken) {
  const url = lobbyId ? `/lobby/${lobbyId}/reset` : '/reset';
  const body = hostToken ? { host_token: hostToken } : {};
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json();
}

/**
 * Register the player's chosen emoji with the server.
 *
 * @param {string} emoji - Emoji avatar.
 * @returns {Promise<Object>} Response payload.
 */
export async function sendEmoji(emoji, playerId, lobbyId) {
  const url = lobbyId ? `/lobby/${lobbyId}/emoji` : '/emoji';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emoji, player_id: playerId })
  });
  return r.json();
}

/**
 * Let the server know the player is still active.
 *
 * @param {string} emoji - Player identifier.
 * @returns {Promise<Response>} Raw fetch response.
 */
export async function sendHeartbeat(emoji, playerId, lobbyId) {
  const url = lobbyId ? `/lobby/${lobbyId}/state` : '/state';
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emoji, player_id: playerId })
  });
}

/**
 * Post a chat message to the game room.
 *
 * @param {string} text - Message text.
 * @param {string} emoji - Player emoji.
 * @returns {Promise<Object>} Response payload.
 */
export async function sendChatMessage(text, emoji, playerId, lobbyId) {
  const url = lobbyId ? `/lobby/${lobbyId}/chat` : '/chat';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, emoji, player_id: playerId })
  });
  return r.json();
}

/**
 * Retrieve the current list of chat messages.
 *
 * @returns {Promise<Object>} Chat message payload.
 */
export async function getChatMessages(lobbyId) {
  const url = lobbyId ? `/lobby/${lobbyId}/chat` : '/chat';
  const r = await fetch(url);
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
export async function requestHint(col, emoji, playerId, lobbyId) {
  const url = lobbyId ? `/lobby/${lobbyId}/hint` : '/hint';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ col, emoji, player_id: playerId })
  });
  return r.json();
}

export async function kickPlayerRequest(lobbyId, emoji, hostToken) {
  const url = `/lobby/${lobbyId}/kick`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emoji, host_token: hostToken })
  });
  return r.json();
}

/**
 * Listen for server-sent game state updates.
 *
 * @param {(state:Object)=>void} onMessage - Callback for each update.
 * @returns {EventSource|null} EventSource handle or null when unsupported.
 */
export function subscribeToUpdates(onMessage, lobbyId) {
  if (!window.EventSource) return null;
  const url = lobbyId ? `/lobby/${lobbyId}/stream` : '/stream';
  const es = new EventSource(url);
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onMessage(data);
    } catch {}
  };
  return es;
}
