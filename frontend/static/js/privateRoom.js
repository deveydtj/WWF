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

// Copies through an off-screen field so the invitation never appears on screen.
// Works on plain-HTTP LAN addresses, where navigator.clipboard is unavailable.
// The field goes inside the open modal dialog, because everything outside it is inert.
function copyHidden(text, container) {
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.setAttribute('aria-hidden', 'true');
  field.tabIndex = -1;
  Object.assign(field.style, {
    position: 'fixed', top: '0', left: '0', width: '1px', height: '1px',
    opacity: '0', fontSize: '16px', border: '0', padding: '0', pointerEvents: 'none'
  });
  const focused = document.activeElement;
  container.appendChild(field);
  let copied = false;
  try {
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, text.length);
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    field.remove();
    window.getSelection()?.removeAllRanges();
    focused?.focus?.({ preventScroll: true });
  }
  return copied;
}

async function copyText(text, container) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* Fall back below. */ }
  }
  return copyHidden(text, container);
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
    const card = document.createElement('div');
    card.className = 'room-unavailable';
    card.dataset.popup = 'notice';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'popup-eyebrow';
    eyebrow.textContent = 'Private room';
    const heading = document.createElement('h1');
    heading.textContent = 'Room unavailable';
    const message = document.createElement('p');
    message.textContent = 'This private room is unavailable. Return home to request a new invitation.';
    const link = document.createElement('a');
    link.className = 'popup-primary';
    link.href = '/';
    link.textContent = 'Return home';
    card.append(eyebrow, heading, message, link);
    document.body.replaceChildren(card);
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
  dialog.dataset.popup = 'task';
  dialog.innerHTML = `<div class="popup-header"><h2 id="privateRoomTitle">Private room</h2></div>
    <p class="popup-description">Send invitations privately. Verify who is requesting entry before approving.</p>
    <div class="room-actions">
      <button type="button" id="copyInvitation" class="popup-primary">Replace &amp; copy invitation</button>
      <button type="button" id="lockAdmission">Lock admission</button>
    </div>
    <p class="room-note">Replacing an invitation cancels pending requests. Approved friends stay in the room.</p>
    <h3 class="popup-section-label">Waiting for approval</h3><ul id="admissionRequests"></ul>
    <p id="privateRoomStatus" role="status"></p>
    <form method="dialog" class="room-footer"><button>Close</button></form>`;
  document.body.appendChild(dialog);
  const status = dialog.querySelector('#privateRoomStatus');
  const lock = dialog.querySelector('#lockAdmission');
  const copy = dialog.querySelector('#copyInvitation');
  const list = dialog.querySelector('#admissionRequests');
  const url = `/lobby/${room.room}/admission`;
  let locked = false;
  let lastRequests = '';
  let pendingCount = 0;
  let refreshing = false;

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      const data = await privateRequest(url);
      locked = data.locked;
      lock.textContent = locked ? 'Unlock admission' : 'Lock admission';
      lock.setAttribute('aria-pressed', String(locked));
      copy.disabled = locked;
      // Nudge the host when someone new starts waiting.
      if (data.pending.length > pendingCount) {
        button.classList.remove('room-alert');
        void button.offsetWidth;
        button.classList.add('room-alert');
      }
      pendingCount = data.pending.length;
      button.textContent = data.pending.length ? '🔔' : '🔒';
      button.title = `Room controls (${data.pending.length} waiting)`;
      button.setAttribute('aria-label', button.title);
      const signature = JSON.stringify([locked, data.pending]);
      if (signature !== lastRequests) {
        lastRequests = signature;
        list.replaceChildren();
        for (const entry of data.pending) {
          const row = document.createElement('li');
          row.className = 'admission-row';
          const name = document.createElement('span');
          name.className = 'admission-name';
          name.textContent = entry.name;
          row.appendChild(name);
          for (const action of ['approve', 'reject']) {
            const control = document.createElement('button');
            control.type = 'button';
            control.className = `admission-${action}`;
            control.textContent = action === 'approve' ? 'Approve' : 'Reject';
            control.setAttribute('aria-label', `${control.textContent} ${entry.name}`);
            control.disabled = action === 'approve' && locked;
            control.onclick = () => perform({ action, id: entry.id });
            row.appendChild(control);
          }
          list.appendChild(row);
        }
        if (!data.pending.length) {
          const empty = document.createElement('li');
          empty.className = 'admission-empty';
          empty.textContent = 'No pending requests.';
          list.appendChild(empty);
        }
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
  button.addEventListener('animationend', () => button.classList.remove('room-alert'));
  button.onclick = () => { dialog.showModal(); refresh(); };
  lock.onclick = () => perform({ action: 'lock', locked: !locked });
  // A fresh invitation that could not reach the clipboard yet. It stays in
  // memory only, so a second tap can copy it without replacing it again.
  let heldInvitation = null;
  function holdInvitation(text) {
    heldInvitation = text;
    copy.textContent = text ? 'Tap to copy invitation' : 'Replace & copy invitation';
  }
  copy.onclick = async () => {
    if (heldInvitation) {
      // Synchronous copy while this tap still counts as a user gesture.
      if (copyHidden(heldInvitation, dialog)) {
        holdInvitation(null);
        status.textContent = 'Invitation copied. Send it privately.';
      } else {
        status.textContent = 'This browser blocked copying. Open the game over HTTPS or on the host computer.';
      }
      return;
    }
    copy.disabled = true;
    try {
      const data = await privateRequest(url, { action: 'rotate' });
      const text = `${location.origin}/invite.html#private/${data.invitation}`;
      if (await copyText(text, dialog)) {
        status.textContent = 'Invitation copied. Send it privately.';
      } else {
        holdInvitation(text);
        status.textContent = 'New invitation ready. Tap the button again to copy it.';
      }
    } catch (error) {
      status.textContent = error.message || 'Could not create an invitation. Try again.';
    } finally {
      await refresh();
    }
  };
  lock.addEventListener('click', () => holdInvitation(null));
  dialog.addEventListener('close', () => holdInvitation(null));
  refresh();
  const timer = setInterval(refresh, 3000);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
}
