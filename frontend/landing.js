import { updateVH } from './static/js/utils.js';

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
    if (data.host_token) {
      localStorage.setItem('hostToken', data.host_token);
    }
    window.location.hash = `#lobby/${data.id}`;
  } else {
    announce('Could not create lobby');
  }
}

export async function joinLobby(code) {
  const resp = await fetch(`/lobby/${code}/state`);
  if (resp.ok) {
    storeLastLobby(code);
    localStorage.removeItem('hostToken');
    window.location.hash = `#lobby/${code}`;
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

export async function fetchNetworkLobbies() {
  try {
    const resp = await fetch('/lobbies/network');
    if (resp.ok) {
      const data = await resp.json();
      displayNetworkLobbies(data.lobbies);
    } else {
      console.warn('Failed to fetch network lobbies');
    }
  } catch (error) {
    console.warn('Error fetching network lobbies:', error);
  }
}

export function displayNetworkLobbies(lobbies) {
  const section = document.getElementById('networkLobbies');
  const list = document.getElementById('networkLobbyList');
  
  if (!section || !list) return;
  
  if (lobbies.length === 0) {
    section.hidden = true;
    return;
  }
  
  section.hidden = false;
  list.innerHTML = '';
  
  lobbies.forEach(lobby => {
    const lobbyItem = document.createElement('div');
    lobbyItem.className = 'network-lobby-item';
    
    const lobbyInfo = document.createElement('div');
    lobbyInfo.className = 'lobby-info';
    
    const lobbyCode = document.createElement('span');
    lobbyCode.className = 'lobby-code';
    lobbyCode.textContent = lobby.id;
    
    const playerCount = document.createElement('span');
    playerCount.className = 'player-count';
    playerCount.textContent = `${lobby.players} player${lobby.players !== 1 ? 's' : ''}`;
    
    lobbyInfo.appendChild(lobbyCode);
    lobbyInfo.appendChild(playerCount);
    
    if (lobby.your_emoji) {
      const yourEmoji = document.createElement('span');
      yourEmoji.className = 'your-emoji';
      yourEmoji.textContent = lobby.your_emoji;
      yourEmoji.setAttribute('aria-label', 'Your emoji in this lobby');
      lobbyInfo.appendChild(yourEmoji);
    }
    
    const joinButton = document.createElement('button');
    joinButton.className = 'join-network-lobby-btn';
    joinButton.textContent = 'Join';
    joinButton.addEventListener('click', () => joinLobby(lobby.id));
    
    lobbyItem.appendChild(lobbyInfo);
    lobbyItem.appendChild(joinButton);
    list.appendChild(lobbyItem);
  });
}

export function init() {
  initDarkToggle();
  initJoinForm();
  initHowTo();
  showSavedEmoji();
  fetchNetworkLobbies();
  updateVH();
  window.addEventListener('resize', updateVH);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateVH);
  }
  window.addEventListener('orientationchange', updateVH);
  document.getElementById('createBtn').addEventListener('click', createLobby);
  document.getElementById('quickBtn').addEventListener('click', quickPlay);

  handleHashChange();
  window.addEventListener('hashchange', handleHashChange);
}

function handleHashChange() {
  const match = window.location.hash.match(/^#lobby\/([A-Za-z0-9]{6})$/);
  const landing = document.getElementById('landingView');
  const lobby = document.getElementById('lobbyView');
  if (!landing || !lobby) return;
  if (match) {
    landing.hidden = true;
    lobby.hidden = false;
    if (!lobby.dataset.code || lobby.dataset.code !== match[1]) {
      lobby.dataset.code = match[1];
      lobby.innerHTML = `<iframe src="/lobby/${match[1]}" title="Game lobby"></iframe>`;
    }
  } else {
    lobby.hidden = true;
    landing.hidden = false;
  }
}

document.addEventListener('DOMContentLoaded', init);
