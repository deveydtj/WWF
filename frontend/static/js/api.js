/**
 * Fetch the latest game state from the server.
 *
 * @param {string} [emoji] - Current player's emoji to include in the request.
 * @param {string} [lobbyId] - Lobby code, or omitted for the default game.
 * @param {string} [playerId] - Proves the caller owns `emoji`, so the server
 *   includes that player's private Daily Double letter. Sent as a header to
 *   keep it out of URLs and logs; private rooms use their session instead.
 * @returns {Promise<Object>} Parsed JSON state payload.
 */
export async function getState(emoji, lobbyId, playerId) {
  const base = lobbyId ? `/lobby/${lobbyId}/state` : '/state';
  const url = emoji ? `${base}?emoji=${encodeURIComponent(emoji)}` : base;
  const headers = emoji && playerId ? { 'X-WordSquad-Player': playerId } : {};
  const r = await fetch(url, { headers });
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
    headers: { 'Content-Type': 'application/json', 'X-WordSquad-Request': '1' },
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
    headers: { 'Content-Type': 'application/json', 'X-WordSquad-Request': '1' },
    body: JSON.stringify(body)
  });
  return r.json();
}

/**
 * Start the next word, or call or answer a squad vote to scrap this one.
 *
 * Settled rounds (word found or every row used) start the next word at once.
 * A live round needs a majority vote; when it passes, the round's points are
 * refunded.
 *
 * @param {string|null} lobbyId - Lobby code, or null for the default game.
 * @param {string} emoji - Player emoji.
 * @param {string} playerId - Player identifier.
 * @param {'yes'|'no'} [vote='yes'] - Calling a vote counts as a yes.
 * @returns {Promise<Object>} `{status, outcome, vote?, refunded?}` or an error.
 */
export async function voteReset(lobbyId, emoji, playerId, vote = 'yes') {
  const url = lobbyId ? `/lobby/${lobbyId}/vote-reset` : '/vote-reset';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-WordSquad-Request': '1' },
    body: JSON.stringify({ emoji, player_id: playerId, vote })
  });
  return r.json().catch(() => ({ status: 'error', msg: 'Could not reach the game.' }));
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
    headers: { 'Content-Type': 'application/json', 'X-WordSquad-Request': '1' },
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
    headers: { 'Content-Type': 'application/json', 'X-WordSquad-Request': '1' },
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
    headers: { 'Content-Type': 'application/json', 'X-WordSquad-Request': '1' },
    body: JSON.stringify({ text, emoji, player_id: playerId })
  });
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
    headers: { 'Content-Type': 'application/json', 'X-WordSquad-Request': '1' },
    body: JSON.stringify({ col, emoji, player_id: playerId })
  });
  return r.json();
}

export async function leaveLobbyRequest(lobbyId, emoji, playerId) {
  const url = `/lobby/${lobbyId}/leave`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-WordSquad-Request': '1' },
    body: JSON.stringify({ emoji, player_id: playerId })
  });
  const data = await r.json();
  if (!r.ok || data.status !== 'ok') {
    throw new Error(data.msg || 'Could not leave lobby');
  }
  return data;
}

/**
 * Kick a player from the lobby (host only).
 *
 * @param {string} emoji - Emoji of the player to kick.
 * @param {string} playerId - Player ID of the player to kick.
 * @param {string} lobbyId - Lobby code.
 * @param {string} hostToken - Host token for authorization.
 * @returns {Promise<Object>} Response payload.
 */
export async function kickPlayer(emoji, playerId, lobbyId, hostToken) {
  const url = `/lobby/${lobbyId}/kick`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-WordSquad-Request': '1' },
    body: JSON.stringify({ emoji, player_id: playerId, host_token: hostToken })
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
