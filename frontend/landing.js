function applyDarkMode() {
  const enabled = localStorage.getItem('dark') === 'true';
  document.body.classList.toggle('dark-mode', enabled);
}

export function setDarkMode(enabled) {
  localStorage.setItem('dark', String(enabled));
  applyDarkMode();
}

function initDarkToggle() {
  const btn = document.getElementById('darkToggle');
  applyDarkMode();
  btn.addEventListener('click', () => {
    const on = !document.body.classList.contains('dark-mode');
    setDarkMode(on);
  });
}

function announce(msg) {
  const live = document.getElementById('ariaLive');
  if (live) live.textContent = msg;
}

export function showSavedEmoji() {
  const el = document.getElementById('emojiDisplay');
  if (el) {
    const emoji = localStorage.getItem('myEmoji');
    if (emoji) el.textContent = emoji;
  }
}

export function storeLastLobby(id) {
  localStorage.setItem('lastLobby', id);
}

export function getLastLobby() {
  return localStorage.getItem('lastLobby');
}

export async function createLobby() {
  const resp = await fetch('/lobby', { method: 'POST' });
  const data = await resp.json();
  if (resp.ok && data.id) {
    storeLastLobby(data.id);
    window.location.href = `/lobby/${data.id}`;
  } else {
    announce('Could not create lobby');
  }
}

export async function joinLobby(code) {
  const resp = await fetch(`/lobby/${code}/state`);
  if (resp.ok) {
    storeLastLobby(code);
    window.location.href = `/lobby/${code}`;
  } else {
    announce('Lobby not found');
  }
}

export async function quickPlay() {
  await createLobby();
}

function initJoinForm() {
  const form = document.getElementById('joinForm');
  const input = document.getElementById('joinCode');
  const rejoin = document.getElementById('rejoinChip');

  const last = getLastLobby();
  if (last) {
    rejoin.hidden = false;
    rejoin.addEventListener('click', () => joinLobby(last));
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = input.value.trim();
    if (/^[A-Za-z0-9]{6}$/.test(code)) {
      joinLobby(code);
    } else {
      announce('Enter a valid 6 character code');
    }
  });
}

export function init() {
  initDarkToggle();
  initJoinForm();
  showSavedEmoji();
  document.getElementById('createBtn').addEventListener('click', createLobby);
  document.getElementById('quickBtn').addEventListener('click', quickPlay);
}

document.addEventListener('DOMContentLoaded', init);
