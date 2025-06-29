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

function showJoinError(msg) {
  const err = document.getElementById('joinError');
  if (err) {
    err.textContent = msg;
    err.classList.remove('visually-hidden');
  }
  announce(msg);
}

function clearJoinError() {
  const err = document.getElementById('joinError');
  if (err) err.classList.add('visually-hidden');
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

  input.addEventListener('input', () => {
    input.value = input.value.toUpperCase();
    if (!/^[A-Za-z0-9]{0,6}$/.test(input.value)) {
      showJoinError('Use letters and numbers only');
    } else {
      clearJoinError();
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = input.value.trim();
    if (/^[A-Za-z0-9]{6}$/.test(code)) {
      clearJoinError();
      joinLobby(code);
    } else {
      showJoinError('Enter a valid 6 character code');
    }
  });
}

function initHowTo() {
  const toggle = document.getElementById('howToggle');
  const content = document.getElementById('howContent');
  if (!toggle || !content) return;
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    content.hidden = expanded;
  });
}

export function init() {
  initDarkToggle();
  initJoinForm();
  initHowTo();
  showSavedEmoji();
  document.getElementById('createBtn').addEventListener('click', createLobby);
  document.getElementById('quickBtn').addEventListener('click', quickPlay);
}

document.addEventListener('DOMContentLoaded', init);
