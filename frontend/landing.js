import { ViewportService } from './static/js/layout/viewportService.js';
import { applyDarkMode as applyTheme } from './static/js/themeManager.js';
import { ensureAgeEligibility, getAgeStatus } from './static/js/ageEligibility.js';

const viewportService = new ViewportService({
  appContainer: '#landingView',
  gameplayContainer: '#heroCard',
});

// Set the payment-provider link and manually maintained server-fund totals here.
// Leave unknown totals null; no sample donations are shown to players.
const donationSettings = { url: null, goal: null, raised: null };

export function updateDonationSection({ url, goal, raised } = donationSettings) {
  const section = document.getElementById('donationSection');
  if (!section) return;

  const hasGoal = Number.isFinite(goal) && goal > 0;
  const hasRaised = Number.isFinite(raised) && raised >= 0;
  const hasProgress = hasGoal && hasRaised;
  const percentage = hasProgress ? Math.min(100, Math.round(raised / goal * 100)) : 0;
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const progress = document.getElementById('donationProgress');
  section.style.setProperty('--donation-progress', percentage);
  section.dataset.funded = String(hasProgress && percentage > 0);
  document.getElementById('donationRaised').textContent = hasRaised ? money.format(raised) : '—';
  document.getElementById('donationGoal').textContent = hasGoal ? money.format(goal) : '—';
  document.getElementById('donationPercent').textContent = hasProgress ? `${percentage}%` : '—';
  document.getElementById('donationProgressLabel').textContent = hasProgress
    ? (raised >= goal ? 'Goal reached. Thank you!' : 'of our server goal')
    : (hasGoal ? 'Total coming soon' : 'Goal coming soon');
  if (hasProgress) {
    progress.setAttribute('aria-valuenow', String(percentage));
    progress.setAttribute('aria-valuetext', `${money.format(raised)} raised of ${money.format(goal)} server goal`);
  } else {
    progress.removeAttribute('aria-valuenow');
    progress.setAttribute('aria-valuetext', 'Funding details are not available yet');
  }

  const link = document.getElementById('donationLink');
  let donationUrl;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) donationUrl = parsed.href;
  } catch { /* No payment destination configured yet. */ }
  link.hidden = !donationUrl;
  document.getElementById('donationPending').hidden = Boolean(donationUrl);
  if (donationUrl) link.href = donationUrl;
  else link.removeAttribute('href');
  document.getElementById('donationStatus').textContent = donationUrl
    ? 'Every contribution helps cover server hosting. Thank you for playing.'
    : 'Funding details are being set up. Check back soon.';
}

// List of available emojis for the landing page (same as game)
const allEmojis = [
  "🐶", "🦊", "🐼", "🐸", "🐵", "🐧", "🐙", "🦉", "🦄", "🦁",
  "🐯", "🐨", "🐻", "🦖", "🦕", "🐝", "🐳", "🦋", "🐢", "🐬"
];

function updateDarkToggleIcon() {
  if (typeof document === 'undefined') return;
  const btn = document.getElementById && document.getElementById('darkToggle');
  if (!btn) return;
  
  const isDarkMode = document.body && document.body.classList.contains('dark-mode');
  if (isDarkMode) {
    btn.textContent = '☀️';
    btn.setAttribute('aria-label', 'Switch to light mode');
    btn.setAttribute('title', 'Switch to light mode');
  } else {
    btn.textContent = '🌙';
    btn.setAttribute('aria-label', 'Switch to dark mode');
    btn.setAttribute('title', 'Switch to dark mode');
  }
}

function applyDarkMode() {
  const enabled = localStorage.getItem('darkMode') === 'true';
  if (document.body) {
    applyTheme(enabled);
  }
  updateDarkToggleIcon();
}

export function setDarkMode(enabled) {
  localStorage.setItem('darkMode', String(enabled));
  applyTheme(enabled, { animate: true });
  updateDarkToggleIcon();
}

function initDarkToggle() {
  const btn = document.getElementById('darkToggle');
  if (!btn) return;
  
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
    if (emoji) {
      el.textContent = emoji;
      el.setAttribute('aria-label', `Selected emoji: ${emoji}. Click to change.`);
    } else {
      el.textContent = '👤';
      el.setAttribute('aria-label', 'Click to select your emoji');
    }
  }
}

export function showEmojiPicker() {
  const modal = document.getElementById('emojiModal');
  const choices = document.getElementById('emojiChoices');
  const errorEl = document.getElementById('emojiModalError');
  
  if (!modal || !choices || !errorEl) return;
  
  if (modal.classList.contains('show')) return;

  // Clear previous choices and errors
  choices.innerHTML = '';
  errorEl.textContent = '';
  
  // Create emoji choice buttons
  allEmojis.forEach(emoji => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-choice';
    btn.textContent = emoji;
    btn.setAttribute('aria-label', `Select ${emoji} emoji`);
    
    const selectEmoji = () => {
      localStorage.setItem('myEmoji', emoji);
      showSavedEmoji();
      closeEmojiPicker();
      announce(`Selected ${emoji} emoji`);
    };
    
    btn.addEventListener('click', selectEmoji);
    
    choices.appendChild(btn);
  });
  
  // Show modal
  modal.style.display = 'flex';
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('emojiPickerClose').onclick = closeEmojiPicker;
  
  // Focus first emoji choice
  const firstChoice = choices.querySelector('.emoji-choice');
  if (firstChoice) firstChoice.focus();
  
  // Handle escape key and background click to close
  const handleKeydown = (e) => {
    if (e.key === 'Escape') {
      closeEmojiPicker();
    } else if (e.key === 'Tab') {
      const controls = [...modal.querySelectorAll('button')];
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  
  const handleBackgroundClick = (e) => {
    if (e.target === modal) closeEmojiPicker();
  };

  document.addEventListener('keydown', handleKeydown);
  modal.addEventListener('click', handleBackgroundClick);
  
  // Store handlers for cleanup
  modal._handleKeydown = handleKeydown;
  modal._handleBackgroundClick = handleBackgroundClick;
}

export function closeEmojiPicker() {
  const modal = document.getElementById('emojiModal');
  if (!modal) return;
  
  modal.style.display = 'none';
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  
  // Clean up event listeners
  if (modal._handleKeydown) {
    document.removeEventListener('keydown', modal._handleKeydown);
    delete modal._handleKeydown;
  }
  if (modal._handleBackgroundClick) {
    modal.removeEventListener('click', modal._handleBackgroundClick);
    delete modal._handleBackgroundClick;
  }
  
  // Return focus to emoji display button
  const emojiDisplay = document.getElementById('emojiDisplay');
  if (emojiDisplay) emojiDisplay.focus();
}

export function storeLastLobby(id) {
  localStorage.setItem('lastLobby', id);
}

export function getLastLobby() {
  return localStorage.getItem('lastLobby');
}

function checkEmojiSelected() {
  const emoji = localStorage.getItem('myEmoji');
  if (!emoji) {
    announce('Please select an emoji first');
    showEmojiPicker();
    return false;
  }
  return true;
}

function updateRoomMode() {
  const mode = document.getElementById('privateRoom')?.checked ? 'private' : 'open';
  document.querySelector('.create-group').dataset.mode = mode;
  document.getElementById('createLabel').textContent = mode === 'private' ? 'Create Private Room' : 'Create Lobby';
  return mode;
}

function initRoomMode() {
  const radios = document.querySelectorAll('input[name="roomMode"]');
  if (!radios.length) return;
  let saved = null;
  try { saved = localStorage.getItem('roomMode'); } catch { /* Default to open. */ }
  const initial = [...radios].find(radio => radio.value === saved);
  if (initial) initial.checked = true;
  updateRoomMode();
  radios.forEach(radio => radio.addEventListener('change', () => {
    const mode = updateRoomMode();
    try { localStorage.setItem('roomMode', mode); } catch { /* Not remembered. */ }
  }));
}

export async function createLobby() {
  if (!await ensureAgeEligibility()) return;
  if (!checkEmojiSelected()) {
    return;
  }
  
  const isPrivate = document.getElementById('privateRoom')?.checked === true;
  const resp = await fetch('/lobby', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-WordSquad-Request': '1' },
    body: JSON.stringify({ private: isPrivate })
  });
  const data = await resp.json();
  if (resp.ok && data.id) {
    if (data.private) {
      sessionStorage.setItem('privateRoom', data.id);
      window.location.href = '/game';
      return;
    }
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
  if (!await ensureAgeEligibility()) return;
  if (!checkEmojiSelected()) {
    return;
  }
  
  const resp = await fetch(`/lobby/${code}/state`);
  if (resp.ok) {
    storeLastLobby(code);
    localStorage.removeItem('hostToken');
    window.location.hash = `#lobby/${code}`;
  } else {
    announce('Lobby not found');
  }
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
  const dialog = document.getElementById('howTo');
  if (!toggle || !dialog) return;
  toggle.addEventListener('click', () => {
    dialog.showModal();
    toggle.setAttribute('aria-expanded', 'true');
  });
  dialog.addEventListener('close', () => {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus({ preventScroll: true });
  });
}

export async function fetchNetworkLobbies() {
  try {
    const { eligibility } = await getAgeStatus();
    if (eligibility !== 'eligible') {
      document.getElementById('networkLobbyList').replaceChildren();
      document.getElementById('networkLobbyStatus').textContent = eligibility === 'blocked'
        ? 'Multiplayer is unavailable for this session.'
        : 'Find a game on your network, or create a lobby for others to join.';
      return;
    }
    const resp = await fetch('/lobbies/network');
    if (resp.ok) {
      const data = await resp.json();
      displayNetworkLobbies(data.lobbies);
    } else {
      document.getElementById('networkLobbyStatus').textContent = 'Could not find local lobbies. Try again.';
      console.warn('Failed to fetch network lobbies');
    }
  } catch (error) {
    document.getElementById('networkLobbyStatus').textContent = 'Could not find local lobbies. Try again.';
    console.warn('Error fetching network lobbies:', error);
  }
}

export function displayNetworkLobbies(lobbies) {
  const section = document.getElementById('networkLobbies');
  const list = document.getElementById('networkLobbyList');
  
  if (!section || !list) return;
  
  section.hidden = false;
  list.innerHTML = '';
  document.getElementById('networkLobbyStatus').textContent = lobbies.length
    ? 'Choose a lobby to join.'
    : 'No local lobbies yet. Create one on another device, then check again.';
  
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
    joinButton.className = 'join-network-lobby-btn play-secondary';
    joinButton.type = 'button';
    joinButton.setAttribute('aria-label', `Join lobby ${lobby.id}`);
    joinButton.textContent = 'Join';
    joinButton.addEventListener('click', () => joinLobby(lobby.id));
    
    lobbyItem.appendChild(lobbyInfo);
    lobbyItem.appendChild(joinButton);
    list.appendChild(lobbyItem);
  });
}

async function initTileAnimation() {
  const landing = document.getElementById('landingView');
  if (!landing?.classList.contains('tiles-preparing')) return;
  const hero = document.getElementById('heroCard');
  const local = document.getElementById('networkLobbies');
  const donation = document.getElementById('donationSection');
  local.classList.add('animation-pending');
  donation.classList.add('animation-pending');

  if (document.readyState !== 'complete') {
    await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
  }
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  // A tall mobile card cannot fit at once; wait for its animated content instead.
  function waitUntilVisible(card, content) {
    return new Promise(resolve => {
      const check = () => {
        if (landing.hidden) return;
        const viewport = window.visualViewport;
        const top = viewport?.offsetTop || 0;
        const height = viewport?.height || window.innerHeight;
        const width = viewport?.width || window.innerWidth;
        const left = viewport?.offsetLeft || 0;
        const target = card.getBoundingClientRect().height > height ? content : card;
        const rect = target.getBoundingClientRect();
        if (rect.top < top - 1 || rect.bottom > top + height + 1 ||
            rect.left < left - 1 || rect.right > left + width + 1) return;
        observer.disconnect();
        resizeObserver.disconnect();
        window.removeEventListener('scroll', check);
        window.removeEventListener('resize', check);
        window.removeEventListener('hashchange', check);
        viewport?.removeEventListener('resize', check);
        viewport?.removeEventListener('scroll', check);
        resolve();
      };
      const observer = new IntersectionObserver(check, { threshold: [0, 1] });
      const resizeObserver = new ResizeObserver(check);
      resizeObserver.observe(card);
      observer.observe(card);
      observer.observe(content);
      window.addEventListener('scroll', check, { passive: true });
      window.addEventListener('resize', check);
      window.addEventListener('hashchange', check);
      window.visualViewport?.addEventListener('resize', check);
      window.visualViewport?.addEventListener('scroll', check);
      check();
    });
  }

  async function glow(card) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    await card.querySelector('.card-eyebrow span').animate([
      { opacity: 0.25, textShadow: '0 0 0px #64f69600' },
      { opacity: 1, textShadow: '0 0 24px #64f696ff', offset: 0.7 },
      { opacity: 1, textShadow: '0 0 16px #64f696a6' },
    ], { duration: 650, easing: 'ease-out' }).finished;
  }

  await waitUntilVisible(hero.querySelector('.play-copy'), hero.querySelector('.play-copy'));
  await glow(hero);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    landing.classList.remove('tiles-preparing');
  } else {
    await new Promise(resolve => {
      landing.querySelector('.play-tiles span:last-child').addEventListener('animationend', resolve, { once: true });
      landing.classList.replace('tiles-preparing', 'tiles-ready');
    });
    landing.classList.remove('tiles-ready');
  }

  await waitUntilVisible(local, local);
  await glow(local);
  local.classList.remove('animation-pending');

  await waitUntilVisible(donation, donation.querySelector('.donation-meter'));
  await glow(donation);
  donation.classList.remove('animation-pending');
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const progress = getComputedStyle(donation).getPropertyValue('--donation-progress').trim();
    await Promise.all([...donation.querySelectorAll('.donation-ring, .donation-ring-glow')].map(ring =>
      ring.animate([{ strokeDasharray: '0 100', opacity: 0 },
        { strokeDasharray: `${progress} 100`, opacity: donation.dataset.funded === 'true' ? 1 : 0 }],
      { duration: 1100, easing: 'ease-out' }).finished));
  }
}

export function init() {
  initTileAnimation();
  initDarkToggle();
  updateDonationSection();
  initRoomMode();
  initJoinForm();
  initHowTo();
  initEmojiPicker();
  showSavedEmoji();
  viewportService.start();
  document.getElementById('createBtn').addEventListener('click', createLobby);
  document.getElementById('findNetworkLobbies').addEventListener('click', async () => {
    if (await ensureAgeEligibility()) await fetchNetworkLobbies();
  });
  const refreshNetwork = () => {
    if (!document.hidden && !document.getElementById('landingView').hidden) fetchNetworkLobbies();
  };
  window.addEventListener('focus', refreshNetwork);
  setInterval(refreshNetwork, 10000);

  handleHashChange();
  window.addEventListener('hashchange', handleHashChange);
}

function initEmojiPicker() {
  const emojiDisplay = document.getElementById('emojiDisplay');
  if (emojiDisplay) {
    emojiDisplay.addEventListener('click', showEmojiPicker);
    emojiDisplay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showEmojiPicker();
      }
    });
  }
}

async function handleHashChange() {
  const match = window.location.hash.match(/^#lobby\/([A-Za-z0-9]{6})$/);
  const landing = document.getElementById('landingView');
  const lobby = document.getElementById('lobbyView');
  if (!landing || !lobby) return;
  if (match) {
    if (!await ensureAgeEligibility()) {
      window.location.hash = '';
      return;
    }
    if (window.location.hash !== match[0]) return;
    landing.hidden = true;
    lobby.hidden = false;
    if (!lobby.dataset.code || lobby.dataset.code !== match[1]) {
      lobby.dataset.code = match[1];
      // Clear existing content and create iframe safely
      lobby.innerHTML = '';
      const iframe = document.createElement('iframe');
      // Safari paints a pending iframe white, even inside a dark page.
      iframe.hidden = true;
      iframe.addEventListener('load', () => { iframe.hidden = false; }, { once: true });
      iframe.src = `/lobby/${match[1]}`;
      iframe.title = 'Game lobby';
      lobby.appendChild(iframe);
    }
  } else {
    lobby.hidden = true;
    landing.hidden = false;
    fetchNetworkLobbies(); // Refresh network lobbies when returning to landing page
  }
}

document.addEventListener('DOMContentLoaded', init);
