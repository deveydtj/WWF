import { ensureAgeEligibility } from './ageEligibility.js';
import { privateRequest } from './privateRoom.js';

let invitation = window.privateInvitation;
delete window.privateInvitation;
const form = document.getElementById('privateJoinForm');
const status = document.getElementById('joinStatus');
let timer;
let room = sessionStorage.getItem('pendingPrivateRoom');

async function poll() {
  try {
    const result = await privateRequest('/private/request?room=' + encodeURIComponent(room));
    if (result.status === 'approved') {
      sessionStorage.setItem('privateRoom', room);
      sessionStorage.removeItem('pendingPrivateRoom');
      location.replace('/game');
    } else {
      document.body.dataset.waiting = '';
      status.textContent = 'Waiting for the host to approve your request…';
      timer = setTimeout(poll, 3000);
    }
  } catch {
    delete document.body.dataset.waiting;
    sessionStorage.removeItem('pendingPrivateRoom');
    status.textContent = 'Your request is unavailable or expired. Ask the host for a new invitation.';
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    if (!await ensureAgeEligibility()) return;
    const result = await privateRequest('/private/exchange', {
      invitation, name: document.getElementById('guestName').value.trim()
    });
    invitation = null;
    room = result.room;
    sessionStorage.setItem('pendingPrivateRoom', room);
    form.hidden = true;
    poll();
  } catch {
    status.textContent = 'Invitation unavailable. Ask the host for a new invitation.';
  } finally {
    button.disabled = false;
  }
});

if (!invitation) {
  form.hidden = true;
  if (room) ensureAgeEligibility().then(eligible => { if (eligible) poll(); });
  else status.textContent = 'Open an invitation sent privately by the host.';
}
window.addEventListener('pagehide', () => clearTimeout(timer), { once: true });
