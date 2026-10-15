// Room identifiers are tab-local selectors. Only the HttpOnly session authorizes access.
export async function privateRequest(url, body) {
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-WordSquad-Request': '1' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.msg || 'Room unavailable');
  return data;
}

export async function preparePrivateRoom() {
  const directRoom = location.pathname.match(/^\/lobby\/(p[0-9a-f]{5})$/)?.[1];
  if (directRoom) {
    sessionStorage.setItem('privateRoom', directRoom);
    history.replaceState(null, '', '/game');
  }
  if (location.pathname !== '/game') return true;
  const room = sessionStorage.getItem('privateRoom');
  // A new tab without a room selector uses the ordinary default game.
  // An invalid private selector fails closed below, never changing rooms.
  if (!room) return true;
  try {
    const identity = await privateRequest('/private/context?room=' + encodeURIComponent(room));
    window.PRIVATE_ROOM = { ...identity, room, emoji: identity.emoji || localStorage.getItem('myEmoji') || null };
    return true;
  } catch {
    const message = document.createElement('p');
    message.textContent = 'This private room is unavailable. Return home to request a new invitation.';
    const link = document.createElement('a');
    link.href = '/';
    link.textContent = 'Return home';
    document.body.replaceChildren(message, link);
    return false;
  }
}

export function installRoomControls() {
  const room = window.PRIVATE_ROOM;
  if (!room) return;
  const button = document.getElementById('copyLobbyLink');
  button.hidden = !room.host;
  if (!room.host) return;
  button.textContent = '🔒';
  button.title = 'Room controls';
  button.setAttribute('aria-label', 'Room controls');
  const dialog = document.createElement('dialog');
  dialog.id = 'privateRoomDialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'privateRoomTitle');
  dialog.innerHTML = `<h2 id="privateRoomTitle">Private room</h2>
    <p>Send invitations privately. Verify who is requesting entry before approving.</p>
    <p>Replacing an invitation cancels pending requests. Approved friends stay in the room.</p>
    <button type="button" id="copyInvitation">Replace &amp; copy invitation</button>
    <button type="button" id="lockAdmission">Lock admission</button>
    <h3>Waiting for approval</h3><ul id="admissionRequests"></ul>
    <p id="privateRoomStatus" role="status"></p>
    <form method="dialog"><button>Close</button></form>`;
  document.body.appendChild(dialog);
  const status = dialog.querySelector('#privateRoomStatus');
  const lock = dialog.querySelector('#lockAdmission');
  const copy = dialog.querySelector('#copyInvitation');
  const list = dialog.querySelector('#admissionRequests');
  const url = `/lobby/${room.room}/admission`;
  let locked = false;
  let lastRequests = '';
  let refreshing = false;

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      const data = await privateRequest(url);
      locked = data.locked;
      lock.textContent = locked ? 'Unlock admission' : 'Lock admission';
      copy.disabled = locked;
      button.textContent = data.pending.length ? '🔔' : '🔒';
      button.title = `Room controls (${data.pending.length} waiting)`;
      button.setAttribute('aria-label', button.title);
      const signature = JSON.stringify([locked, data.pending]);
      if (signature !== lastRequests) {
        lastRequests = signature;
        list.replaceChildren();
        for (const entry of data.pending) {
          const row = document.createElement('li');
          const name = document.createElement('span');
          name.textContent = entry.name + ' ';
          row.appendChild(name);
          for (const action of ['approve', 'reject']) {
            const control = document.createElement('button');
            control.textContent = action === 'approve' ? 'Approve' : 'Reject';
            control.setAttribute('aria-label', `${control.textContent} ${entry.name}`);
            control.disabled = action === 'approve' && locked;
            control.onclick = () => perform({ action, id: entry.id });
            row.appendChild(control);
          }
          list.appendChild(row);
        }
        if (!data.pending.length) list.textContent = 'No pending requests.';
      }
    } catch (error) {
      status.textContent = error.message;
    } finally {
      refreshing = false;
    }
  }
  async function perform(body) {
    try {
      await privateRequest(url, body);
      status.textContent = 'Room updated.';
      await refresh();
    } catch (error) {
      status.textContent = error.message;
    }
  }
  button.onclick = () => { dialog.showModal(); refresh(); };
  lock.onclick = () => perform({ action: 'lock', locked: !locked });
  copy.onclick = async () => {
    copy.disabled = true;
    try {
      const data = await privateRequest(url, { action: 'rotate' });
      await navigator.clipboard.writeText(`${location.origin}/join#${data.invitation}`);
      status.textContent = 'Invitation copied. Send it privately.';
    } catch {
      status.textContent = 'Could not copy an invitation. Try again using HTTPS or localhost.';
    } finally {
      await refresh();
    }
  };
  refresh();
  const timer = setInterval(refresh, 3000);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
}
