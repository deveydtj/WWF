import { createBoard, updateBoard, updateKeyboardFromGuesses, updateHardModeConstraints, isValidHardModeGuess, animateTilesOut, animateTilesIn } from './board.js';
import { renderHistory } from './history.js';
import { getMyEmoji, setMyEmoji, showEmojiModal, getMyPlayerId, setMyPlayerId, applyEmojiVariantStyling, getBaseEmoji } from './emoji.js';
import { getState, sendEmoji, sendGuess, resetGame, sendHeartbeat, sendChatMessage, subscribeToUpdates, requestHint, kickPlayerRequest, leaveLobbyRequest } from './api.js';
import { renderChat } from './chat.js';
import { setupTypingListeners, updateBoardFromTyping } from './keyboard.js';
import { showMessage, announce, applyDarkModePreference, shakeInput, repositionResetButton,
         positionSidePanels, updateVH, applyLayoutMode, fitBoardToContainer, isMobile, isMobileView, showPopup,
         openDialog, closeDialog, focusFirstElement, setGameInputDisabled, enableClickOffDismiss,
         adjustKeyboardForViewport, verifyElementsFitInViewport, applyOptimalScaling, 
         checkKeyboardVisibility, ensureKeyboardVisibility, calculateMinRequiredHeight } from './utils.js';
import { positionResponsive, positionContextMenu, positionModal, positionOnGrid } from './popupPositioning.js';

// Make enhanced positioning available globally for backward compatibility
if (typeof window !== 'undefined') {
  window.popupPositioning = {
    positionResponsive,
    positionContextMenu, 
    positionModal,
    positionOnGrid
  };
}
import { updateHintBadge } from './hintBadge.js';
import { saveHintState, loadHintState } from './hintState.js';
import { GAME_NAME } from './config.js';

import { StateManager, STATES } from './stateManager.js';

// Import board scaling test utilities for debugging
import './boardScalingTests.js';

const gameState = new StateManager();

let activeEmojis = [];
let prevActiveEmojis = [];
let leaderboard = [];
let prevLeaderboard = {};
let skipAutoClose = false;
let myEmoji = getMyEmoji();
let myPlayerId = getMyPlayerId();
let showEmojiModalOnNextFetch = false;
let leaderboardScrolling = false;
let leaderboardScrollTimeout = null;
let hadNetworkError = false;

// Chat spam control
let lastChatTime = 0;
const CHAT_COOLDOWN_MS = 1000; // 1 second cooldown between messages
const MAX_CHAT_LENGTH = 140; // Already enforced in HTML, but double-check

// Default to sound off unless user explicitly enabled it
let soundEnabled = localStorage.getItem('soundEnabled') === 'true';
let audioCtx = null;

function ensureAudioContext() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (err) {
      console.error('Failed to init audio context:', err);
      soundEnabled = false;
      if (menuSound) menuSound.textContent = '🔈 Sound Off';
      return null;
    }
  }
  return audioCtx;
}

function stopAllSounds() {
  if (audioCtx) {
    try {
      audioCtx.close();
    } catch {}
    audioCtx = null;
  }
}

const HOST_TOKEN = localStorage.getItem('hostToken');

let maxRows = 6;
let requiredLetters = new Set();
let greenPositions = {};
let latestState = null;
let dailyDoubleRow = null;
let dailyDoubleHint = null;
let dailyDoubleAvailable = false;
({ row: dailyDoubleRow, hint: dailyDoubleHint } = loadHintState(myEmoji));

const board = document.getElementById('board');
const guessInput = document.getElementById('guessInput');
const submitButton = document.getElementById('submitGuess');
const messageEl = document.getElementById('message');
const messagePopup = document.getElementById('messagePopup');
const keyboard = document.getElementById('keyboard');
const definitionText = document.getElementById('definitionText');
const definitionBox = document.getElementById('definitionBox');
const chatBox = document.getElementById('chatBox');
const chatMessagesEl = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const historyClose = document.getElementById('historyClose');
const gameTitle = document.getElementById('gameTitle');
if (gameTitle) gameTitle.textContent = GAME_NAME;
const definitionClose = document.getElementById('definitionClose');
const chatClose = document.getElementById('chatClose');
const optionsToggle = document.getElementById('optionsToggle');
const optionsMenu = document.getElementById('optionsMenu');
const optionsClose = document.getElementById('optionsClose');
const menuHistory = document.getElementById('menuHistory');
const menuDefinition = document.getElementById('menuDefinition');
const menuChat = document.getElementById('menuChat');
const menuDarkMode = document.getElementById('menuDarkMode');
const menuSound = document.getElementById('menuSound');
const holdReset = document.getElementById('holdReset');
const holdResetProgress = document.getElementById('holdResetProgress');
const holdResetText = document.getElementById('holdResetText');
const boardArea = document.getElementById('boardArea');
const historyBox = document.getElementById('historyBox');
const historyList = document.getElementById('historyList');
const definitionBoxEl = document.getElementById('definitionBox');
const stampContainer = document.getElementById('stampContainer');
const hintTooltip = document.getElementById('hintTooltip');
const closeCallPopup = document.getElementById('closeCallPopup');
const closeCallText = document.getElementById('closeCallText');
const closeCallOk = document.getElementById('closeCallOk');
const titleHintBadge = document.getElementById('titleHintBadge');
const lobbyCodeEl = document.getElementById('lobbyCode');
const playerCountEl = document.getElementById('playerCount');
const copyLobbyLink = document.getElementById('copyLobbyLink');
const leaveLobby = document.getElementById('leaveLobby');
const lobbyHeader = document.getElementById('lobbyHeader');
const waitingOverlay = document.getElementById('waitingOverlay');
let waitingOverlayDismissed = false;
if (waitingOverlay) {
  document.addEventListener('click', () => {
    if (waitingOverlay.style.display !== 'none') {
      waitingOverlayDismissed = true;
      waitingOverlay.classList.add('fade-out');
      waitingOverlay.addEventListener(
        'animationend',
        () => {
          waitingOverlay.style.display = 'none';
          waitingOverlay.classList.remove('fade-out');
        },
        { once: true }
      );
    }
  });
}
// Ensure the close-call popup starts hidden even if CSS hasn't loaded yet
closeCallPopup.style.display = 'none';
const chatNotify = document.getElementById('chatNotify');
const chatMessagePopup = document.getElementById('chatMessagePopup');
const infoPopup = document.getElementById('infoPopup');
const infoClose = document.getElementById('infoClose');
const menuInfo = document.getElementById('menuInfo');
const shareModal = document.getElementById('shareModal');
const shareLink = document.getElementById('shareLink');
const shareCopy = document.getElementById('shareCopy');
const shareClose = document.getElementById('shareClose');
const playerSidebar = document.getElementById('playerSidebar');
const playerList = document.getElementById('playerList');
const playerToggleBtn = document.getElementById('playerToggle');
const playerCloseBtn = document.getElementById('playerClose');

enableClickOffDismiss(closeCallPopup);
enableClickOffDismiss(infoPopup);
enableClickOffDismiss(shareModal);

let chatWiggleTimer = null;

const LOBBY_CODE = (() => {
  const m = window.location.pathname.match(/\/lobby\/([A-Za-z0-9]{6})/);
  return m ? m[1] : null;
})();
window.LOBBY_CODE = LOBBY_CODE;

if (lobbyCodeEl && LOBBY_CODE) {
  lobbyCodeEl.textContent = LOBBY_CODE;
} else if (lobbyHeader) {
  lobbyHeader.style.display = 'none';
}

if (copyLobbyLink && LOBBY_CODE) {
  copyLobbyLink.addEventListener('click', () => {
    const url = window.location.href;
    // Check if Web Share API is available
    if (navigator.share) {
      navigator.share({
        title: 'Join my WordSquad game',
        text: 'Come play WordSquad with me!',
        url: url
      }).catch(() => {
        // Fallback to custom modal if sharing fails
        shareLink.value = url;
        openDialog(shareModal);
        shareLink.focus();
        shareLink.select();
      });
    } else {
      // Fallback for browsers without Web Share API
      shareLink.value = url;
      openDialog(shareModal);
      shareLink.focus();
      shareLink.select();
    }
  });
}

if (shareCopy) {
  shareCopy.addEventListener('click', () => {
    if (!shareLink.value) {
      showMessage('No link to copy!', { messageEl, messagePopup });
      return;
    }
    navigator.clipboard.writeText(shareLink.value).then(() => {
      showMessage('Link copied!', { messageEl, messagePopup });
      announce('Lobby link copied');
    }).catch((err) => {
      console.error('Failed to copy:', err);
      showMessage('Failed to copy link. Try selecting and copying manually.', { messageEl, messagePopup });
    });
  });
}

if (shareClose) {
  shareClose.addEventListener('click', () => { closeDialog(shareModal); });
}

if (leaveLobby && LOBBY_CODE) {
  leaveLobby.addEventListener('click', async () => {
    // Only call the API if we have player info and are in a lobby
    if (myEmoji && myPlayerId) {
      try {
        await leaveLobbyRequest(LOBBY_CODE, myEmoji, myPlayerId);
      } catch (err) {
        console.error('Failed to leave lobby:', err);
        // Still redirect even if the API call fails
      }
    }
    
    // Clear stored lobby info when user explicitly leaves
    localStorage.removeItem('lastLobby');
    
    // Close event source and redirect to home
    if (eventSource) {
      try { eventSource.close(); } catch {}
      eventSource = null;
    }
    stopAllSounds();
    
    // Check if we're in an iframe (lobby loaded within landing page)
    if (window.parent !== window) {
      // Clear the hash in the parent window to ensure proper navigation
      window.parent.location.hash = '';
      window.parent.location.href = '/';
    } else {
      // If not in iframe, navigate normally
      window.location.href = '/';
    }
  });
}

const FAST_INTERVAL = 2000;
const SLOW_INTERVAL = 15000;
const INACTIVE_DELAY = 60000; // 1 minute
let lastActivity = Date.now();
let pollTimer;
let currentInterval = FAST_INTERVAL;
let eventSource = null;

function updateInputVisibility() {
  // Use isMobileView() for browser, fallback to isMobile for testing environments without window
  const useMobileDisplay = (typeof window !== 'undefined') ? isMobileView() : isMobile;
  
  if (useMobileDisplay) {
    // Show input area on mobile, positioned above keyboard
    guessInput.readOnly = false;
    guessInput.setAttribute('inputmode', 'text');
    guessInput.style.display = 'block';
    submitButton.style.display = 'block';
    messageEl.style.display = 'block';
    messageEl.style.visibility = 'hidden';
  } else {
    guessInput.readOnly = false;
    guessInput.setAttribute('inputmode', 'text');
    guessInput.style.display = 'block';
    submitButton.style.display = 'block';
    messageEl.style.display = 'block';
    messageEl.style.visibility = 'hidden';
  }
}

// Initial call
updateInputVisibility();

// Animate the temporary points indicator after each guess
function showPointsDelta(delta) {
  const msg = (delta > 0 ? '+' : '') + delta + ' point' + (Math.abs(delta) !== 1 ? 's' : '');
  // Use isMobileView() for browser, fallback to isMobile for testing environments without window
  const useMobileDisplay = (typeof window !== 'undefined') ? isMobileView() : isMobile;
  
  if (useMobileDisplay) {
    // Mobile uses the popup element
    messagePopup.textContent = msg;
    messagePopup.style.display = 'block';
    messagePopup.style.animation = 'fadeInOut 2s';
    messagePopup.addEventListener('animationend', () => {
      messagePopup.style.display = 'none';
      messagePopup.style.animation = '';
    }, { once: true });
  } else {
    messageEl.classList.remove('positive', 'negative');
    if (delta > 0) messageEl.classList.add('positive');
    if (delta < 0) messageEl.classList.add('negative');
    messageEl.textContent = msg;
    messageEl.style.visibility = 'visible';
    messageEl.style.animation = 'fadeInOut 2s';
    messageEl.addEventListener('animationend', () => {
      messageEl.style.visibility = 'hidden';
      messageEl.style.animation = '';
      messageEl.classList.remove('positive', 'negative');
    }, { once: true });
  }
}

function showHintTooltip(text) {
  if (!hintTooltip) return;
  hintTooltip.textContent = text;
  hintTooltip.style.display = 'block';
}

function hideHintTooltip() {
  if (!hintTooltip) return;
  hintTooltip.style.display = 'none';
}

function burstConfetti(row, col) {
  const tiles = Array.from(board.children);
  const tile = tiles[row * 5 + col];
  if (!tile) return;
  const boardRect = boardArea.getBoundingClientRect();
  const tileRect = tile.getBoundingClientRect();
  const originX = tileRect.left - boardRect.left + tileRect.width / 2;
  const originY = tileRect.top - boardRect.top + tileRect.height / 2;
  const container = document.createElement('div');
  container.className = 'confetti-container';
  container.style.left = `${originX}px`;
  container.style.top = `${originY}px`;
  boardArea.appendChild(container);
  const colors = ['#f87171', '#facc15', '#34d399', '#60a5fa', '#a78bfa'];
  for (let i = 0; i < 15; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.backgroundColor = colors[i % colors.length];
    const dx = (Math.random() - 0.5) * 120;
    const dy = -Math.random() * 120 - 30;
    const rotate = Math.random() * 720;
    piece.style.transform = 'translate(0,0) rotate(0deg)';
    piece.style.opacity = '1';
    piece.style.transition = 'transform 0.8s ease-out, opacity 0.8s';
    container.appendChild(piece);
    requestAnimationFrame(() => {
      piece.style.transform = `translate(${dx}px, ${dy}px) rotate(${rotate}deg)`;
      piece.style.opacity = '0';
    });
  }
  setTimeout(() => container.remove(), 900);
}

function playClick() {
  if (!soundEnabled) return;
  if (!ensureAudioContext()) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(600, audioCtx.currentTime);
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.05);
}

function playJingle() {
  if (!soundEnabled) return;
  if (!ensureAudioContext()) return;
  const notes = [523.25, 659.25, 783.99];
  notes.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + i * 0.2);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime + i * 0.2);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime + i * 0.2);
    osc.stop(audioCtx.currentTime + i * 0.2 + 0.18);
  });
  announce('Jingle playing');
}

function showChatNotify() {
  chatNotify.style.display = 'block';
  requestAnimationFrame(() => chatNotify.classList.add('visible'));
  clearTimeout(chatWiggleTimer);
  chatWiggleTimer = setTimeout(() => {
    if (chatNotify.classList.contains('visible')) {
      chatNotify.classList.add('wiggle');
      chatNotify.addEventListener('animationend', () => {
        chatNotify.classList.remove('wiggle');
      }, { once: true });
    }
  }, 2000);
}

function showChatMessagePopup(message) {
  if (!message || !chatNotify || !chatMessagePopup) return;
  
  // Position popup relative to chat notify button
  const chatRect = chatNotify.getBoundingClientRect();
  const boardArea = document.getElementById('boardArea');
  const boardRect = boardArea.getBoundingClientRect();
  
  // Calculate position relative to board area
  const left = chatRect.left - boardRect.left + chatRect.width / 2;
  const top = chatRect.top - boardRect.top + chatRect.height / 2;
  
  chatMessagePopup.style.left = left + 'px';
  chatMessagePopup.style.top = top + 'px';
  
  // Limit popup text to a couple of words to prevent long paragraphs
  const POPUP_CHAR_LIMIT = 30;
  let displayText = message.text;
  if (displayText.length > POPUP_CHAR_LIMIT) {
    displayText = displayText.substring(0, POPUP_CHAR_LIMIT).trim() + '...';
  }
  
  // Set content
  chatMessagePopup.innerHTML = `
    <span class="chat-emoji">${message.emoji}</span>
    <span class="chat-text">${displayText}</span>
  `;
  
  // Show popup with animation
  chatMessagePopup.classList.remove('show');
  requestAnimationFrame(() => {
    chatMessagePopup.classList.add('show');
  });
  
  // Remove animation class after animation completes
  setTimeout(() => {
    chatMessagePopup.classList.remove('show');
  }, 3000);
}

function hideChatNotify() {
  chatNotify.classList.remove('visible');
  clearTimeout(chatWiggleTimer);
}

function centerLeaderboardOnMe() {
  const lb = document.getElementById('leaderboard');
  if (!lb || leaderboardScrolling) return;
  if (lb.scrollWidth > lb.clientWidth) {
    const mine = lb.querySelector('.leaderboard-entry.me');
    if (mine) {
      const offset = mine.offsetLeft + mine.offsetWidth / 2 - lb.clientWidth / 2;
      lb.scrollLeft = offset;
    }
  } else {
    lb.scrollLeft = 0;
  }
}

function setupMobileLeaderboard() {
  if (isMobileView()) {
    const lb = document.getElementById('leaderboard');
    const mobileContainer = document.querySelector('.mobile-leaderboard-container');
    
    if (lb && mobileContainer && !mobileContainer.contains(lb)) {
      // Move leaderboard to mobile container
      lb.classList.add('mobile-inline');
      mobileContainer.appendChild(lb);
    }
  } else {
    // Move leaderboard back to original position for desktop
    const lb = document.getElementById('leaderboard');
    const mobileContainer = document.querySelector('.mobile-leaderboard-container');
    const originalContainer = document.querySelector('#gameColumn');
    
    if (lb && mobileContainer && mobileContainer.contains(lb)) {
      lb.classList.remove('mobile-inline');
      // Insert leaderboard after titleBar but before boardArea
      const titleBar = document.getElementById('titleBar');
      const boardArea = document.getElementById('boardArea');
      originalContainer.insertBefore(lb, boardArea);
    }
  }
}

// Rebuild the leaderboard DOM and keep it centered on the current player
function renderLeaderboard() {
  setupMobileLeaderboard(); // Ensure proper mobile layout
  
  const lb = document.getElementById('leaderboard');
  if (!lb) return;
  
  lb.innerHTML = '';
  const now = Date.now() / 1000;

  leaderboard.forEach(entry => {
    const node = document.createElement('span');
    node.className = 'leaderboard-entry' + (myEmoji === entry.emoji ? ' me' : '');
    const prevScore = prevLeaderboard[entry.emoji];
    if (prevScore === undefined || prevScore !== entry.score) {
      node.classList.add('flash');
      node.addEventListener('animationend', () => {
        node.classList.remove('flash');
      }, { once: true });
    }
    if (entry.last_active !== undefined && (now - entry.last_active > 300)) {
      node.classList.add('inactive');
    }
    
    // Create separate elements for emoji and score
    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'leaderboard-emoji';
    applyEmojiVariantStyling(emojiSpan, entry.emoji);
    
    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'leaderboard-score';
    scoreSpan.textContent = ` ${entry.score}`;
    
    node.appendChild(emojiSpan);
    node.appendChild(scoreSpan);

    if (entry.emoji === myEmoji) {
      node.style.cursor = 'pointer';
      node.title = 'Click to change your emoji';
      node.addEventListener('click', () => {
        skipAutoClose = true;
        // Pass active emojis for variant detection
        const taken = activeEmojis;
        showEmojiModal(taken, {
          onChosen: (e) => { myEmoji = e; myPlayerId = getMyPlayerId(); ({ row: dailyDoubleRow, hint: dailyDoubleHint } = loadHintState(myEmoji)); fetchState(); },
          skipAutoCloseRef: { value: skipAutoClose },
          onError: (msg) => showMessage(msg, { messageEl, messagePopup })
        });
      });
      if (dailyDoubleAvailable) {
        const badge = document.createElement('span');
        badge.className = 'hint-badge';
        badge.textContent = '🔍 x1';
        node.appendChild(badge);
      }
    }

    lb.appendChild(node);
  });

  centerLeaderboardOnMe();

  lb.onscroll = () => {
    leaderboardScrolling = true;
    clearTimeout(leaderboardScrollTimeout);
    leaderboardScrollTimeout = setTimeout(() => {
      leaderboardScrolling = false;
      centerLeaderboardOnMe();
    }, 5000); // Changed to 5 seconds as requested
  };
}

function renderPlayerSidebar() {
  const list = document.getElementById('playerList');
  if (!list) return;
  list.innerHTML = '';
  const now = Date.now() / 1000;
  leaderboard.forEach(entry => {
    const li = document.createElement('li');
    li.className = 'player-row';
    if (entry.last_active !== undefined && (now - entry.last_active > 300)) {
      li.classList.add('inactive');
    }
    
    // Create emoji span with variant styling
    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'player-emoji';
    applyEmojiVariantStyling(emojiSpan, entry.emoji);
    
    const scoreText = document.createTextNode(` ${entry.score}`);
    li.appendChild(emojiSpan);
    li.appendChild(scoreText);
    
    if (HOST_TOKEN && entry.emoji !== myEmoji) {
      const btn = document.createElement('button');
      btn.textContent = 'Kick';
      btn.addEventListener('click', () => {
        kickPlayerRequest(LOBBY_CODE, entry.emoji, HOST_TOKEN).then(fetchState);
      });
      li.appendChild(btn);
    }
    list.appendChild(li);
  });
}

// Display emoji markers beside each completed guess in medium mode
function renderEmojiStamps(guesses) {
  stampContainer.innerHTML = '';
  if (document.body.dataset.mode !== 'medium') return;
  const boardRect = board.getBoundingClientRect();
  guesses.forEach((g, idx) => {
    const tile = board.children[idx * 5];
    if (!tile) return;
    const tileRect = tile.getBoundingClientRect();
    const top = tileRect.top - boardRect.top + tile.offsetHeight / 2;
    const span = document.createElement('span');
    span.className = 'board-stamp';
    applyEmojiVariantStyling(span, g.emoji);
    span.style.top = `${top}px`;
    stampContainer.appendChild(span);
  });
}

async function performReset() {
  if (typeof stopAllSounds === 'function') stopAllSounds();
  await animateTilesOut(board);
  const resp = await resetGame(LOBBY_CODE, HOST_TOKEN);
  if (!resp || resp.status !== 'ok') {
    if (resp && resp.msg) {
      showMessage(resp.msg, { messageEl, messagePopup });
    }
    return resp;
  }
  await fetchState();
  await animateTilesIn(board);
  showMessage('Game reset!', { messageEl, messagePopup });
  return resp;
}

async function quickResetHandler() {
  // Quick reset is only enabled when the game is over, so proceed directly
  return await performReset();
}

function updateResetButton() {
  if (gameState.is(STATES.GAME_OVER)) {
    holdResetText.textContent = 'Reset';
    holdResetProgress.style.width = '0%';
    holdResetProgress.style.opacity = '0';
    holdReset.onmousedown = null;
    holdReset.ontouchstart = null;
    holdReset.onclick = () => { quickResetHandler(); };
  } else {
    holdResetText.textContent = 'Reset';
    holdResetProgress.style.opacity = '0.9';
    holdReset.onclick = null;
    holdReset.onmousedown = startHoldReset;
    holdReset.ontouchstart = (e) => {
      e.preventDefault();
      startHoldReset();
    };
  }
}

let holdProgress = null;
// Animate the hold-to-reset progress bar and trigger a reset when complete
function startHoldReset() {
  let heldTime = 0;
  const holdDuration = 2000;
  holdResetProgress.style.width = '0%';
  holdResetProgress.style.transition = 'none';
  holdResetProgress.style.opacity = '0.9';
  holdResetProgress.style.background = 'var(--absent-shadow-light)';
  holdProgress = setInterval(() => {
    heldTime += 20;
    const percent = Math.min(heldTime / holdDuration, 1) * 100;
    holdResetProgress.style.width = percent + '%';
    if (heldTime >= holdDuration) {
      clearInterval(holdProgress);
      holdResetProgress.style.width = '100%';
      holdResetProgress.style.opacity = '0.95';
      holdResetProgress.style.background = 'var(--correct-shadow-light)';
      setTimeout(() => {
        holdResetProgress.style.width = '0%';
      }, 350);
      performReset();
    }
  }, 20);
}
function stopHoldReset() {
  clearInterval(holdProgress);
  holdResetProgress.style.transition = 'width 0.15s';
  holdResetProgress.style.width = '0%';
  holdResetProgress.style.opacity = '0.9';
}
['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(ev => holdReset.addEventListener(ev, stopHoldReset));

// Apply the server state to the UI and update all related variables
function applyState(state) {
  const prevGuessCount = latestState ? latestState.guesses.length : 0;
  const prevChatCount = latestState && latestState.chat_messages ? latestState.chat_messages.length : 0;
  latestState = state;
  prevActiveEmojis = activeEmojis.slice();
  prevLeaderboard = Object.fromEntries(leaderboard.map(e => [e.emoji, e.score]));
  activeEmojis = state.active_emojis || [];
  leaderboard = state.leaderboard || [];
  dailyDoubleAvailable = !!state.daily_double_available;
  if (dailyDoubleAvailable && state.guesses.length === 0) {
    dailyDoubleRow = 0;
    dailyDoubleHint = null;
    saveHintState(myEmoji, dailyDoubleRow, dailyDoubleHint);
  } else if (!dailyDoubleAvailable && (dailyDoubleRow !== null || dailyDoubleHint !== null)) {
    // Clear hint state if server says no daily double available
    // This handles cases where user switches lobbies and has stale localStorage state
    dailyDoubleRow = null;
    dailyDoubleHint = null;
    saveHintState(myEmoji, dailyDoubleRow, dailyDoubleHint);
  }
  if (myEmoji && prevActiveEmojis.includes(myEmoji) && !activeEmojis.includes(myEmoji)) {
    showMessage('You were removed from the lobby.', { messageEl, messagePopup });
  }
  if (playerCountEl) {
    playerCountEl.textContent = `${activeEmojis.length} player${activeEmojis.length !== 1 ? 's' : ''}`;
  }
  if (waitingOverlay) {
    if (state.phase !== 'waiting') {
      waitingOverlayDismissed = false;
    }
    if (state.phase === 'waiting' && !waitingOverlayDismissed) {
      waitingOverlay.classList.remove('fade-out');
      waitingOverlay.style.display = 'flex';
    } else if (!waitingOverlay.classList.contains('fade-out')) {
      waitingOverlay.style.display = 'none';
    }
  }
  renderLeaderboard();
  renderPlayerSidebar();
  updateHintBadge(titleHintBadge, dailyDoubleAvailable);

  if (state.chat_messages) {
    renderChat(chatMessagesEl, state.chat_messages);
    if (state.chat_messages.length > prevChatCount && !document.body.classList.contains('chat-open')) {
      showChatNotify();
      // Show popup with the latest message
      const latestMessage = state.chat_messages[state.chat_messages.length - 1];
      if (latestMessage) {
        showChatMessagePopup(latestMessage);
      }
    }
  }

  const historyEntries = [];
  if (state.past_games) {
    state.past_games.forEach(game => game.forEach(e => historyEntries.push(e)));
  }
  if (state.guesses) {
    historyEntries.push(...state.guesses);
  }
  renderHistory(historyList, historyEntries);
  
  // Update panel visibility after rendering history
  updatePanelVisibility();

  maxRows = state.max_rows || 6;
  const animateRow = state.guesses && state.guesses.length > prevGuessCount ? state.guesses.length - 1 : -1;
  updateBoard(board, state, guessInput, maxRows, gameState.is(STATES.GAME_OVER), animateRow, dailyDoubleHint, dailyDoubleRow);
  if (dailyDoubleRow !== null && state.guesses.length > dailyDoubleRow) {
    dailyDoubleRow = null;
    dailyDoubleHint = null;
    hideHintTooltip();
    setGameInputDisabled(gameState.is(STATES.GAME_OVER));
    saveHintState(myEmoji, dailyDoubleRow, dailyDoubleHint);
  }
  if (dailyDoubleHint && state.guesses.length > dailyDoubleHint.row) {
    dailyDoubleHint = null;
    saveHintState(myEmoji, dailyDoubleRow, dailyDoubleHint);
  }
  if (animateRow >= 0) {
    for (let i = 0; i < 5; i++) {
      setTimeout(playClick, i * 150);
    }
  }
  renderEmojiStamps(state.guesses);
  updateKeyboardFromGuesses(keyboard, state.guesses);

  const constraints = updateHardModeConstraints(state.guesses);
  requiredLetters = constraints.requiredLetters;
  greenPositions = constraints.greenPositions;
  const prevGameOver = gameState.is(STATES.GAME_OVER);
  if (state.is_over) {
    gameState.transition(STATES.GAME_OVER);
  } else if (gameState.is(STATES.GAME_OVER)) {
    gameState.transition(STATES.PLAYING);
  }
  setGameInputDisabled(gameState.is(STATES.GAME_OVER));
  updateResetButton();

  if (state.is_over) {
    const def = state.definition || 'Definition not found.';
    definitionText.textContent = `${state.target_word.toUpperCase()} – ${def}`;
  } else if (state.last_word) {
    const def = state.last_definition || 'Definition not found.';
    definitionText.textContent = `${state.last_word.toUpperCase()} – ${def}`;
  } else {
    definitionText.textContent = '';
  }
  
  // Update panel visibility after definition content changes
  updatePanelVisibility();

  const justEnded = !prevGameOver && state.is_over;

  const haveMy = activeEmojis.includes(myEmoji);
  if (!myEmoji || !haveMy || showEmojiModalOnNextFetch) {
    showEmojiModal(activeEmojis, {
      onChosen: e => { myEmoji = e; myPlayerId = getMyPlayerId(); ({ row: dailyDoubleRow, hint: dailyDoubleHint } = loadHintState(myEmoji)); fetchState(); },
      skipAutoCloseRef: { value: skipAutoClose },
      onError: (msg) => showMessage(msg, { messageEl, messagePopup })
    });
    showEmojiModalOnNextFetch = false;
  } else if (!skipAutoClose) {
    closeDialog(document.getElementById('emojiModal'));
  }
}

// Retrieve the latest game state from the server and handle connection issues
async function fetchState() {
  try {
    const state = await getState(myEmoji, LOBBY_CODE);
    if (hadNetworkError) {
      showMessage('Reconnected to server.', { messageEl, messagePopup });
    }
    hadNetworkError = false;
    applyState(state);
  } catch (err) {
    console.error('fetchState error:', err);
    if (err && err.status === 404) {
      showMessage('This lobby has expired or was closed.', { messageEl, messagePopup });
      setTimeout(() => { window.location.href = '/'; }, 3000);
      return;
    }
    if (!hadNetworkError) {
      showMessage('Connection lost. Retrying...', { messageEl, messagePopup });
      hadNetworkError = true;
    }
  }
}

// Handle guess submission from input or keyboard
async function submitGuessHandler() {
  if (gameState.is(STATES.GAME_OVER)) return;
  const guess = guessInput.value.trim().toLowerCase();
  if (guess.length !== 5) {
    shakeInput(guessInput);
    showMessage('Please enter a 5-letter word.', { messageEl, messagePopup });
    return;
  }
  if (!isValidHardModeGuess(guess, requiredLetters, greenPositions, (m)=>showMessage(m,{messageEl,messagePopup}))) {
    shakeInput(guessInput);
    return;
  }
  if (!myPlayerId) {
    try {
      const d = await sendEmoji(myEmoji, null, LOBBY_CODE);
      if (d && d.player_id) {
        myPlayerId = d.player_id;
        setMyPlayerId(d.player_id);
      }
    } catch {}
  }
  const resp = await sendGuess(guess, myEmoji, myPlayerId, LOBBY_CODE);
  guessInput.value = '';
    if (resp.status === 'ok') {
      applyState(resp.state);
      if (resp.daily_double) {
        if (resp.daily_double_tile) {
          burstConfetti(resp.daily_double_tile.row, resp.daily_double_tile.col);
        }
        dailyDoubleRow = resp.state.guesses.length;
        dailyDoubleHint = null;
        // Don't disable input - allow players to continue guessing while having Daily Double
        // setGameInputDisabled(true);
        saveHintState(myEmoji, dailyDoubleRow, dailyDoubleHint);
      showMessage('Daily Double! Tap a tile in the next row for a hint.', { messageEl, messagePopup });
      showHintTooltip('Tap a tile in the next row to reveal a letter!');
      announce('Daily Double earned \u2013 choose one tile in the next row to preview.');
    }
    if (typeof resp.pointsDelta === 'number') showPointsDelta(resp.pointsDelta);
    if (resp.won) {
      showMessage('You got it! The word was ' + resp.state.target_word.toUpperCase(), { messageEl, messagePopup });
      playJingle();
    }
    if (resp.over && !resp.won) {
      showMessage('Game Over! The word was ' + resp.state.target_word.toUpperCase(), { messageEl, messagePopup });
    }
    if (resp.over) {
      const def = resp.state.definition || 'Definition not found.';
      definitionText.textContent = `${resp.state.target_word.toUpperCase()} – ${def}`;
      positionSidePanels(boardArea, historyBox, definitionBoxEl, chatBox);
    }
  } else {
    if (resp.close_call) {
      closeCallText.textContent = `Close call! ${resp.close_call.winner} beat you by ${resp.close_call.delta_ms}ms.`;
      closeCallPopup.style.display = 'flex';
      openDialog(closeCallPopup);
    } else {
      showMessage(resp.msg, { messageEl, messagePopup });
    }
    shakeInput(guessInput);
  }
}

function onActivity() {
  lastActivity = Date.now();
  if (!eventSource && currentInterval !== FAST_INTERVAL) startPolling(FAST_INTERVAL);
  sendHeartbeat(myEmoji, myPlayerId, LOBBY_CODE);
  fetchState();
}

// Begin polling the server at the given interval for state updates
function startPolling(interval) {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(fetchState, interval);
  currentInterval = interval;
}

// Slow down polling when the user has been inactive for a while
function checkInactivity() {
  if (!eventSource && Date.now() - lastActivity > INACTIVE_DELAY && currentInterval !== SLOW_INTERVAL) {
    startPolling(SLOW_INTERVAL);
  }
}

function handleServerUpdateNotification(data) {
  const { message, delay_seconds } = data;
  
  // Log the server update notification
  console.log('Server update notification received:', data);
  
  // Show the server update message to the user
  try {
    showMessage(message, { messageEl, messagePopup });
    announce(message);
    console.log('Server update message displayed:', message);
  } catch (error) {
    console.error('Error displaying server update message:', error);
    // Fallback: use alert if showMessage fails
    alert(message);
  }
  
  // Close event source to prevent additional messages
  if (eventSource) {
    try { 
      eventSource.close(); 
      console.log('EventSource closed');
    } catch (error) {
      console.error('Error closing EventSource:', error);
    }
    eventSource = null;
  }
  
  // Set a timeout to refresh the page after the specified delay
  const refreshDelayMs = (delay_seconds || 5) * 1000;
  console.log(`Scheduling page refresh in ${refreshDelayMs}ms`);
  
  const refreshTimeout = setTimeout(() => {
    console.log('About to refresh page...');
    
    // Show a final message before refresh
    try {
      showMessage('Refreshing page...', { messageEl, messagePopup });
    } catch (error) {
      console.error('Error showing refresh message:', error);
    }
    
    // Small delay to let the user see the message, then refresh
    setTimeout(() => {
      console.log('Executing page refresh');
      try {
        window.location.reload();
      } catch (error) {
        console.error('Error refreshing page:', error);
        // Fallback: redirect to current URL
        window.location.href = window.location.href;
      }
    }, 1000);
  }, refreshDelayMs);
  
  console.log('Refresh timeout set with ID:', refreshTimeout);
}

function initEventStream() {
  eventSource = subscribeToUpdates((data) => {
    // Check if this is a server update notification
    if (data.type === 'server_update') {
      handleServerUpdateNotification(data);
      return;
    }
    
    // Normal game state update
    applyState(data);
  }, LOBBY_CODE);
  if (eventSource) {
    eventSource.onerror = () => {
      eventSource.close();
      eventSource = null;
      startPolling(FAST_INTERVAL);
    };
  } else {
    startPolling(FAST_INTERVAL);
  }
}

// Check if history panel has content to display
function hasHistoryContent() {
  const historyList = document.getElementById('historyList');
  return historyList && historyList.children.length > 0;
}

// Check if definition panel has content to display
function hasDefinitionContent() {
  return definitionText && definitionText.textContent.trim() !== '';
}

// Show or hide panels based on content and viewport size
function updatePanelVisibility() {
  if (window.innerWidth > 900) {
    // Full mode - show panels only if they have content
    if (hasHistoryContent()) {
      document.body.classList.add('history-open');
    } else {
      document.body.classList.remove('history-open');
    }
    
    if (hasDefinitionContent()) {
      document.body.classList.add('definition-open');
    } else {
      document.body.classList.remove('definition-open');
    }
    
    positionSidePanels(boardArea, historyBox, definitionBoxEl, chatBox);
  }
}

// Toggle one of the side panels while closing any others in medium mode
function togglePanel(panelClass) {
  if (document.body.dataset.mode === 'medium') {
    ['history-open', 'definition-open', 'chat-open', 'info-open'].forEach(c => {
      if (c !== panelClass) document.body.classList.remove(c);
    });
  }
  document.body.classList.toggle(panelClass);
  positionSidePanels(boardArea, historyBox, definitionBoxEl, chatBox);
}

setupTypingListeners({
  keyboardEl: keyboard,
  guessInput,
  submitButton,
  submitGuessHandler,
  updateBoardFromTyping: () => updateBoardFromTyping(board, latestState, guessInput, maxRows, gameState.is(STATES.GAME_OVER), dailyDoubleHint, dailyDoubleRow),
  isAnimating: () => false
});

function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', isDark);
  applyDarkModePreference(menuDarkMode);
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem('soundEnabled', soundEnabled);
  menuSound.textContent = soundEnabled ? '🔊 Sound On' : '🔈 Sound Off';
  if (!soundEnabled) {
    stopAllSounds();
  }
}

function toggleHistory() {
  togglePanel('history-open');
  if (document.body.classList.contains('history-open')) {
    focusFirstElement(historyBox);
  }
}

function toggleDefinition() {
  togglePanel('definition-open');
  if (document.body.classList.contains('definition-open')) {
    focusFirstElement(definitionBoxEl);
  }
}

function showInfo() {
  infoPopup.style.display = 'flex';
  openDialog(infoPopup);
}

function toggleHintSelection() {
  if (dailyDoubleRow === null) return;
  const selecting = document.body.classList.toggle('hint-selecting');
  const tiles = Array.from(board.children);
  tiles.forEach((t, i) => {
    const row = Math.floor(i / 5);
    t.tabIndex = selecting && row === dailyDoubleRow ? 0 : -1;
  });
  if (selecting) {
    focusFirstElement(board);
    announce('Hint selection active. Use arrow keys to choose a tile, then press Enter.');
  } else {
    announce('Hint selection canceled.');
  }
}

historyClose.addEventListener('click', () => {
  document.body.classList.remove('history-open');
  positionSidePanels(boardArea, historyBox, definitionBoxEl, chatBox);
});
definitionClose.addEventListener('click', () => {
  document.body.classList.remove('definition-open');
  positionSidePanels(boardArea, historyBox, definitionBoxEl, chatBox);
});
chatClose.addEventListener('click', () => {
  document.body.classList.remove('chat-open');
  positionSidePanels(boardArea, historyBox, definitionBoxEl, chatBox);
});
chatNotify.addEventListener('click', () => {
  togglePanel('chat-open');
  hideChatNotify();
  if (document.body.classList.contains('chat-open')) {
    focusFirstElement(chatBox);
  }
});
optionsToggle.addEventListener('click', () => {
  // Use enhanced positioning for options menu
  optionsMenu.style.display = 'block';
  positionContextMenu(optionsMenu, optionsToggle);
  openDialog(optionsMenu);
});
optionsClose.addEventListener('click', () => { closeDialog(optionsMenu); });
menuHistory.addEventListener('click', () => { toggleHistory(); closeDialog(optionsMenu); });
menuDefinition.addEventListener('click', () => { toggleDefinition(); closeDialog(optionsMenu); });
menuChat.addEventListener('click', () => {
  togglePanel('chat-open');
  hideChatNotify();
  if (document.body.classList.contains('chat-open')) {
    focusFirstElement(chatBox);
  }
  closeDialog(optionsMenu);
});
menuInfo.addEventListener('click', () => { showInfo(); closeDialog(optionsMenu); });
menuDarkMode.addEventListener('click', toggleDarkMode);
menuSound.addEventListener('click', toggleSound);
closeCallOk.addEventListener('click', () => { closeDialog(closeCallPopup); });
infoClose.addEventListener('click', () => { closeDialog(infoPopup); });
titleHintBadge.addEventListener('click', toggleHintSelection);
titleHintBadge.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    toggleHintSelection();
  }
});
if (playerToggleBtn) {
  playerToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('players-open');
    if (document.body.classList.contains('players-open')) {
      focusFirstElement(playerSidebar);
    }
  });
}
if (playerCloseBtn) {
  playerCloseBtn.addEventListener('click', () => {
    document.body.classList.remove('players-open');
  });
}

applyDarkModePreference(menuDarkMode);
menuSound.textContent = soundEnabled ? '🔊 Sound On' : '🔈 Sound Off';
applyLayoutMode();
createBoard(board, maxRows);

// Use enhanced container measurement and scaling
const scalingSuccess = applyOptimalScaling(maxRows);
if (!scalingSuccess) {
  // Fallback to original method if enhanced scaling fails
  fitBoardToContainer(maxRows);
}

// Verify all elements fit and log any issues
const verification = verifyElementsFitInViewport(maxRows);
if (!verification.success) {
  console.warn('Board scaling verification failed:', verification);
  if (verification.recommendations?.length > 0) {
    console.info('Scaling recommendations:', verification.recommendations);
  }
}

repositionResetButton();
positionSidePanels(boardArea, historyBox, definitionBoxEl, chatBox);
renderEmojiStamps([]);
if (myEmoji) {
  // Reclaim previously selected emoji on reload
  sendEmoji(myEmoji, myPlayerId, LOBBY_CODE).then((d) => {
    if (d.player_id) { myPlayerId = d.player_id; setMyPlayerId(d.player_id); }
  }).catch(() => {});
}
if (window.innerWidth > 900) {
  // Only show panels if they have content to display
  updatePanelVisibility();
}
fetchState();

initEventStream();
setInterval(checkInactivity, 5000);
document.addEventListener('keydown', onActivity);
document.addEventListener('click', onActivity);
window.addEventListener('resize', () => {
  repositionResetButton();
  updatePanelVisibility(); // This will handle positioning based on content
  applyLayoutMode();
  updateInputVisibility(); // Update input visibility based on current viewport
  
  // Use enhanced scaling with verification
  const scalingSuccess = applyOptimalScaling(maxRows);
  if (!scalingSuccess) {
    fitBoardToContainer(maxRows);
  }
  
  adjustKeyboardForViewport();
  setupMobileLeaderboard(); // Handle mobile leaderboard layout on resize
  if (latestState) renderEmojiStamps(latestState.guesses);
  
  // Ensure keyboard visibility after all adjustments
  setTimeout(() => ensureKeyboardVisibility(), 100);
});
updateVH();
window.addEventListener('resize', updateVH);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    updateVH();
    adjustKeyboardForViewport();
    // Ensure keyboard stays visible when visual viewport changes
    setTimeout(() => ensureKeyboardVisibility(), 50);
  });
}
window.addEventListener('orientationchange', () => {
  updateVH();
  positionSidePanels(boardArea, historyBox, definitionBoxEl, chatBox);
  applyLayoutMode();
  updateInputVisibility(); // Update input visibility on orientation change
  
  // Use enhanced scaling with verification
  const scalingSuccess = applyOptimalScaling(maxRows);
  if (!scalingSuccess) {
    fitBoardToContainer(maxRows);
  }
  
  adjustKeyboardForViewport();
  setupMobileLeaderboard(); // Handle mobile leaderboard layout on orientation change
  if (latestState) renderEmojiStamps(latestState.guesses);
  
  // Ensure keyboard visibility after orientation change
  setTimeout(() => ensureKeyboardVisibility(), 200);
});

// Add a timeout for orientation change to handle delayed layout updates
let orientationTimeout;
window.addEventListener('orientationchange', () => {
  clearTimeout(orientationTimeout);
  orientationTimeout = setTimeout(() => {
    updateVH();
    updateInputVisibility(); // Update input visibility on delayed orientation change
    
    // Use enhanced scaling with verification
    const scalingSuccess = applyOptimalScaling(maxRows);
    if (!scalingSuccess) {
      fitBoardToContainer(maxRows);
    }
    
    adjustKeyboardForViewport();
    setupMobileLeaderboard(); // Handle mobile leaderboard layout on delayed orientation change
    
    // Final keyboard visibility check after all delayed adjustments
    ensureKeyboardVisibility();
  }, 300);
});

async function selectHint(col) {
  hideHintTooltip();
  const resp = await requestHint(col, myEmoji, myPlayerId, LOBBY_CODE);
  if (resp.status === 'ok') {
    dailyDoubleHint = { row: resp.row, col: resp.col, letter: resp.letter };
    dailyDoubleRow = null;
    document.body.classList.remove('hint-selecting');
    Array.from(board.children).forEach(t => (t.tabIndex = -1));
    setGameInputDisabled(gameState.is(STATES.GAME_OVER));
    saveHintState(myEmoji, dailyDoubleRow, dailyDoubleHint);
    hideHintTooltip();
    showMessage(`Hint applied – the letter '${resp.letter.toUpperCase()}' is shown only to you.`, { messageEl, messagePopup });
    announce(`Hint applied – the letter '${resp.letter.toUpperCase()}' is shown only to you.`);
    fetchState();
  } else if (resp.msg) {
    showMessage(resp.msg, { messageEl, messagePopup });
  }
}

board.addEventListener('click', async (e) => {
  if (dailyDoubleRow === null) return;
  const tile = e.target.closest('.tile');
  if (!tile) return;
  const tiles = Array.from(board.children);
  const index = tiles.indexOf(tile);
  if (index === -1) return;
  const row = Math.floor(index / 5);
  const col = index % 5;
  if (row !== dailyDoubleRow) return;
  await selectHint(col);
});

board.addEventListener('keydown', async (e) => {
  if (!document.body.classList.contains('hint-selecting')) return;
  const tiles = Array.from(board.children).slice(dailyDoubleRow * 5, dailyDoubleRow * 5 + 5);
  let index = tiles.indexOf(document.activeElement);
  if (index === -1) index = 0;
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    tiles[(index + 4) % 5].focus();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    tiles[(index + 1) % 5].focus();
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    await selectHint(index);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    document.body.classList.remove('hint-selecting');
    tiles.forEach(t => (t.tabIndex = -1));
  }
});

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  
  // Spam control: Check cooldown
  const now = Date.now();
  if (now - lastChatTime < CHAT_COOLDOWN_MS) {
    shakeInput(chatInput);
    showMessage(`Please wait ${Math.ceil((CHAT_COOLDOWN_MS - (now - lastChatTime)) / 1000)} second(s) before sending another message.`, { messageEl, messagePopup });
    return;
  }
  
  // Check message length
  if (text.length > MAX_CHAT_LENGTH) {
    shakeInput(chatInput);
    showMessage(`Message too long. Maximum ${MAX_CHAT_LENGTH} characters allowed.`, { messageEl, messagePopup });
    return;
  }
  
  lastChatTime = now;
  chatInput.value = '';
  await sendChatMessage(text, myEmoji, myPlayerId, LOBBY_CODE);
  fetchState();
});

window.addEventListener('beforeunload', () => {
  if (eventSource) {
    try { eventSource.close(); } catch {}
    eventSource = null;
  }
  stopAllSounds();
});
