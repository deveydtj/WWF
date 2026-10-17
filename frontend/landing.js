import { ViewportService } from './static/js/layout/viewportService.js';
import { applyDarkMode as applyTheme, prefersDarkMode } from './static/js/themeManager.js';
import { ensureAgeEligibility, getAgeStatus } from './static/js/ageEligibility.js';
import { startActivityPings } from './static/js/activityPing.js';

const viewportService = new ViewportService({
  appContainer: '#landingView',
  gameplayContainer: '#heroCard',
});

// Fallbacks only: the live total, goal and Stripe link come from /donations.json,
// which the donations Lambda rewrites after every donation (see
// infra/terraform/donations.tf). Leave null; no sample donations are shown.
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

// ---- Live server-fund total ----

const DONATION_SEEN_KEY = 'wordsquad.donationSeen';
let donationShown = null;        // raised amount currently on screen
let donationTotals = null;       // last totals from /donations.json
let donationIntroDone = false;
let donationCelebrated = false;
let resolveDonationIntro;
const donationIntro = new Promise(resolve => { resolveDonationIntro = resolve; });

// Called once the card's reveal animation has played (or was skipped).
export function finishDonationIntro() {
  donationIntroDone = true;
  resolveDonationIntro();
}

function currentMonth(now = new Date()) {
  return now.toISOString().slice(0, 7); // UTC, matching the Lambda
}

// Turn the public JSON into card values; a total from a past month means $0 so far.
export function parseDonationTotals(data, now = new Date()) {
  if (!data || typeof data !== 'object') return null;
  const goal = Number(data.goal);
  const raised = data.month === currentMonth(now) ? Number(data.raised) : 0;
  if (!Number.isFinite(goal) || !Number.isFinite(raised)) return null;
  return {
    month: currentMonth(now),
    goal,
    raised: Math.max(0, raised),
    url: typeof data.url === 'string' ? data.url : donationSettings.url,
  };
}

function readSeenDonation(month) {
  try {
    const seen = JSON.parse(localStorage.getItem(DONATION_SEEN_KEY) || 'null');
    return seen?.month === month && Number.isFinite(seen.raised) ? seen.raised : null;
  } catch { return null; }
}

function saveSeenDonation(month, raised) {
  try { localStorage.setItem(DONATION_SEEN_KEY, JSON.stringify({ month, raised })); } catch { /* Not remembered. */ }
}

export async function loadDonationTotals() {
  try {
    const resp = await fetch('/donations.json', { cache: 'no-store' });
    if (!resp.ok) return null;
    const totals = parseDonationTotals(await resp.json());
    if (totals) await showDonationTotals(totals);
    return totals;
  } catch {
    return null; // Local dev or offline: keep whatever the card shows.
  }
}

async function showDonationTotals(totals) {
  const seen = readSeenDonation(totals.month);
  let from = donationShown ?? seen;
  // First load before the card has been revealed: show it where this player
  // last saw it, then grow it once it's on screen.
  if (donationShown === null && seen !== null && totals.raised > seen && !donationIntroDone) {
    updateDonationSection({ ...totals, raised: from });
    donationShown = from;
    await donationIntro;
    from = donationShown;
  }
  donationTotals = totals;
  updateDonationSection(totals);
  donationShown = totals.raised;
  saveSeenDonation(totals.month, totals.raised);
  if (from !== null && totals.raised > from) celebrateDonation(from, totals);
}

function celebrateDonation(from, totals) {
  const section = document.getElementById('donationSection');
  if (!section) return;
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  donationCelebrated = true;
  const label = document.getElementById('donationProgressLabel');
  label.textContent = `+${money.format(totals.raised - from)} · Thank you!`;
  announce(`Server fund now ${money.format(totals.raised)}. Thank you!`);

  if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    // Count the numbers up alongside the ring's CSS transition.
    const percentEl = document.getElementById('donationPercent');
    const raisedEl = document.getElementById('donationRaised');
    const pct = value => Math.min(100, Math.round(value / totals.goal * 100));
    const start = performance.now();
    const duration = 1400;
    const step = now => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = from + (totals.raised - from) * eased;
      percentEl.textContent = `${pct(value)}%`;
      raisedEl.textContent = money.format(value);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    section.classList.remove('donation-celebrate');
    void section.offsetWidth; // restart the pulse if it is already running
    section.classList.add('donation-celebrate');
  }
  setTimeout(() => {
    section.classList.remove('donation-celebrate');
    if (donationTotals) updateDonationSection(donationTotals); // restore the normal label
  }, 6000);
}

// Stripe sends donors back to /?donated=1. The webhook usually lands within a
// few seconds, so keep checking briefly and bring the card into view.
async function welcomeBackDonor(hadSeenTotal) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('donated') !== '1') return;
  params.delete('donated');
  const query = params.toString();
  history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);

  document.getElementById('donationSection')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const status = document.getElementById('donationStatus');
  const say = text => { if (status) status.textContent = text; };
  // Without an earlier total to compare against (new browser), we can't tell
  // whether this donation is already counted, so just say thanks.
  if (hadSeenTotal) {
    for (let i = 0; i < 20 && !donationCelebrated; i += 1) {
      say('Thank you! Adding your donation to the server fund…');
      await new Promise(resolve => setTimeout(resolve, 3000));
      await loadDonationTotals();
    }
  }
  say(donationCelebrated || !hadSeenTotal
    ? 'Thank you for keeping the squad playing!'
    : 'Thank you! Your donation will show up here shortly.');
}

function initLiveDonations() {
  const hadSeenTotal = readSeenDonation(currentMonth()) !== null;
  loadDonationTotals().then(() => welcomeBackDonor(hadSeenTotal));
  // Back from the Stripe tab, or just watching: refresh while the page is visible.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadDonationTotals();
  });
  setInterval(() => {
    if (!document.hidden) loadDonationTotals();
  }, 60000);
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
  const enabled = prefersDarkMode();
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

// The game server naps when nobody is playing (see infra/terraform). Ask it to
// start as soon as someone opens the landing page so it is ready by the time
// they pick an emoji. Harmless when it is already running.
function wakeServer() {
  fetch('/wake', { cache: 'no-store' }).catch(() => { /* Local dev has no /wake. */ });
}

// CloudFront answers with an HTML "waking up" page (503) while the server starts.
function serverIsWaking(resp) {
  const type = resp.headers.get('content-type') || '';
  if (resp.status !== 503 || !type.includes('text/html')) return false;
  showJoinError('The game server is waking up. Try again in about a minute.');
  wakeServer();
  return true;
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

function showCreateError(message) {
  const error = document.getElementById('createError');
  if (!error) return;
  error.textContent = message;
  error.hidden = !message;
}

function updateRoomMode() {
  showCreateError('');
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
  showCreateError('');
  const resp = await fetch('/lobby', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-WordSquad-Request': '1' },
    body: JSON.stringify({ private: isPrivate })
  });
  if (serverIsWaking(resp)) return;
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.id) {
    showCreateError(data.msg || 'Could not create a lobby. Try again.');
    return;
  }
  if (isPrivate) {
    // Never fall back to a public lobby: its code would show in the URL and header.
    if (!data.private) {
      showCreateError('This server doesn\'t support private rooms. Restart it with the latest code, then try again.');
      return;
    }
    sessionStorage.setItem('privateRoom', data.id);
    window.location.href = '/game';
    return;
  }
  storeLastLobby(data.id);
  if (data.host_token) {
    localStorage.setItem('hostToken', data.host_token);
  }
  window.location.hash = `#lobby/${data.id}`;
}

export async function joinLobby(code) {
  if (!await ensureAgeEligibility()) return;
  if (!checkEmojiSelected()) {
    return;
  }
  
  const resp = await fetch(`/lobby/${code}/state`);
  if (serverIsWaking(resp)) return;
  if (resp.ok) {
    storeLastLobby(code);
    localStorage.removeItem('hostToken');
    window.location.hash = `#lobby/${code}`;
  } else {
    if (resp.status === 404 && code === getLastLobby()) forgetLastLobby();
    showJoinError('Lobby not found. It may have ended, so create a new one or check the code.');
  }
}

function forgetLastLobby() {
  localStorage.removeItem('lastLobby');
  const rejoin = document.getElementById('rejoinChip');
  if (rejoin) rejoin.hidden = true;
}

let rejoinRetry = null;

// Only offer Re-join for a lobby the server still has. Lobbies are purged when
// idle and lost when the server restarts, so a saved code can go stale.
export async function refreshRejoinChip() {
  const rejoin = document.getElementById('rejoinChip');
  const last = getLastLobby();
  clearTimeout(rejoinRetry);
  if (!rejoin || !last) {
    if (rejoin) rejoin.hidden = true;
    return;
  }
  let resp;
  try {
    resp = await fetch(`/lobby/${last}/state`, { cache: 'no-store' });
  } catch {
    rejoin.hidden = true;
    return;
  }
  if (getLastLobby() !== last) return;
  if (resp.ok) {
    rejoin.hidden = false;
  } else if (resp.status === 404 || resp.status === 400) {
    forgetLastLobby();
  } else {
    // Server asleep or waking: keep the code and check again once it is up.
    rejoin.hidden = true;
    rejoinRetry = setTimeout(refreshRejoinChip, 10000);
  }
}

function initJoinForm() {
  const form = document.getElementById('joinForm');
  const input = document.getElementById('joinCode');
  const rejoin = document.getElementById('rejoinChip');

  rejoin.addEventListener('click', () => {
    const last = getLastLobby();
    if (last) joinLobby(last);
  });
  refreshRejoinChip();
  // The lobby can expire while this tab sits idle, so check again on return.
  window.addEventListener('focus', refreshRejoinChip);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshRejoinChip();
  });

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
  if (!landing?.classList.contains('tiles-preparing')) {
    finishDonationIntro();
    return;
  }
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
  finishDonationIntro();
}

// Hovering a SQUAD tile with the mouse flips it, like the intro does.
function initTileHover() {
  const landing = document.getElementById('landingView');
  const tiles = landing?.querySelectorAll('.play-tiles span') || [];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  tiles.forEach(tile => {
    let flip = null;
    tile.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'mouse' || reduceMotion.matches) return;
      // Let the intro finish first, and let a flip finish before the next.
      if (landing.classList.contains('tiles-preparing') || landing.classList.contains('tiles-ready')) return;
      if (flip?.playState === 'running') return;
      flip = tile.animate([
        { transform: 'perspective(240px) translateY(0) rotateX(0deg)' },
        { transform: 'perspective(240px) translateY(4px) rotateX(-180deg)', offset: 0.45 },
        { transform: 'perspective(240px) translateY(0) rotateX(-360deg)' }
      ], { duration: 650, easing: 'ease-out' });
    });
  });
}

export function init() {
  wakeServer();
  startActivityPings();
  initTileAnimation();
  initTileHover();
  initDarkToggle();
  updateDonationSection();
  initLiveDonations();
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
      // Safari paints a pending iframe white, even inside a dark page, so the
      // frame stays invisible until it loads. It must still be laid out at full
      // size: a display:none (hidden) frame boots the game against the wrong
      // viewport in Safari and the board starts off-center on desktop.
      iframe.dataset.loading = '';
      iframe.addEventListener('load', () => { delete iframe.dataset.loading; }, { once: true });
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
