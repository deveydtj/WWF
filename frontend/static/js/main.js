import { createBoard, updateBoard, updateKeyboardFromGuesses, updateHardModeConstraints, isValidHardModeGuess, animateTilesOut, animateTilesIn } from './board.js';
import { renderHistory } from './history.js';
import { getMyEmoji, setMyEmoji, showEmojiModal, getMyPlayerId, setMyPlayerId } from './emoji.js';
import { getState, sendEmoji, sendGuess, resetGame, sendHeartbeat, sendChatMessage, subscribeToUpdates, requestHint, kickPlayerRequest } from './api.js';
import { renderChat } from './chat.js';
import { setupTypingListeners, updateBoardFromTyping } from './keyboard.js';
import { showMessage, announce, applyDarkModePreference, shakeInput, repositionResetButton,
         positionSidePanels, updateVH, applyLayoutMode, isMobile, showPopup,
         openDialog, closeDialog, focusFirstElement, setGameInputDisabled } from './utils.js';
import { updateHintBadge } from './hintBadge.js';
import { saveHintState, loadHintState } from './hintState.js';

import { StateManager, STATES } from './stateManager.js';

const gameState = new StateManager();

let activeEmojis = [];
let prevActiveEmojis = [];
let leaderboard = [];
let skipAutoClose = false;
let myEmoji = getMyEmoji();
let myPlayerId = getMyPlayerId();
let showEmojiModalOnNextFetch = false;
let leaderboardScrolling = false;
let leaderboardScrollTimeout = null;
let hadNetworkError = false;

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
      waitingOverlay.style.display = 'none';
    }
  });
}
// Ensure the close-call popup starts hidden even if CSS hasn't loaded yet
closeCallPopup.style.display = 'none';
const chatNotify = document.getElementById('chatNotify');
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
    if (navigator.share) {
      navigator.share({ url }).catch(() => {
        shareLink.value = url;
        shareModal.style.display = 'flex';
        openDialog(shareModal);
        shareLink.focus();
        shareLink.select();
      });
    } else {
      shareLink.value = url;
      shareModal.style.display = 'flex';
      openDialog(shareModal);
      shareLink.focus();
      shareLink.select();
    }
  });
}

if (shareCopy) {
  shareCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(shareLink.value).then(() => {
      showMessage('Link copied!', { messageEl, messagePopup });
      announce('Lobby link copied');
    });
  });
}

if (shareClose) {
  shareClose.addEventListener('click', () => { closeDialog(shareModal); });
}

if (leaveLobby && LOBBY_CODE) {
  leaveLobby.addEventListener('click', () => {
    stopAllSounds();
    window.location.href = '/';
  });
}

const FAST_INTERVAL = 2000;
const SLOW_INTERVAL = 15000;
const INACTIVE_DELAY = 60000; // 1 minute
let lastActivity = Date.now();
let pollTimer;
let currentInterval = FAST_INTERVAL;
let eventSource = null;

if (isMobile) {
  guessInput.readOnly = true;
  guessInput.setAttribute('inputmode', 'none');
  guessInput.style.display = 'none';
  submitButton.style.display = 'none';
  messageEl.style.display = 'none';
} else {
  messageEl.style.visibility = 'hidden';
}

// Animate the temporary points indicator after each guess
function showPointsDelta(delta) {
  const msg = (delta > 0 ? '+' : '') + delta + ' point' + (Math.abs(delta) !== 1 ? 's' : '');
  if (isMobile) {
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

function hideChatNotify() {
  chatNotify.classList.remove('visible');
  clearTimeout(chatWiggleTimer);
}

function centerLeaderboardOnMe() {
  const lb = document.getElementById('leaderboard');
  if (leaderboardScrolling) return;
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

// Rebuild the leaderboard DOM and keep it centered on the current player
function renderLeaderboard() {
  const lb = document.getElementById('leaderboard');
  lb.innerHTML = '';
  const now = Date.now() / 1000;

  leaderboard.forEach(entry => {
    const node = document.createElement('span');
    node.className = 'leaderboard-entry' + (myEmoji === entry.emoji ? ' me' : '');
    node.classList.add('flash');
    if (entry.last_active !== undefined && (now - entry.last_active > 300)) {
      node.classList.add('inactive');
    }
    const label = document.createElement('span');
    label.textContent = `${entry.emoji} ${entry.score}`;
    node.appendChild(label);

    if (entry.emoji === myEmoji) {
      node.style.cursor = 'pointer';
      node.title = 'Click to change your emoji';
      node.addEventListener('click', () => {
        skipAutoClose = true;
        const taken = activeEmojis.filter(e => e !== myEmoji);
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
    node.addEventListener('animationend', () => {
      node.classList.remove('flash');
    }, { once: true });
  });

  centerLeaderboardOnMe();

  lb.onscroll = () => {
    leaderboardScrolling = true;
    clearTimeout(leaderboardScrollTimeout);
    leaderboardScrollTimeout = setTimeout(() => {
      leaderboardScrolling = false;
      centerLeaderboardOnMe();
    }, 1000);
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
    li.textContent = `${entry.emoji} ${entry.score}`;
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
    span.textContent = g.emoji;
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
  // Ensure our view is up to date before attempting a one-click reset.
  await fetchState();
  if (!latestState.is_over) {
    // Another player already started a new round; switch to hold-to-reset mode.
    showMessage('Board already reset.', { messageEl, messagePopup });
    return;
  }
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
  activeEmojis = state.active_emojis || [];
  leaderboard = state.leaderboard || [];
  dailyDoubleAvailable = !!state.daily_double_available;
  if (dailyDoubleAvailable && state.guesses.length === 0) {
    dailyDoubleRow = 0;
    dailyDoubleHint = null;
    saveHintState(myEmoji, dailyDoubleRow, dailyDoubleHint);
  } else if (!dailyDoubleAvailable && state.guesses.length === 0 && dailyDoubleRow !== null) {
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
    waitingOverlay.style.display =
      state.phase === 'waiting' && !waitingOverlayDismissed ? 'flex' : 'none';
  }
  renderLeaderboard();
  renderPlayerSidebar();
  updateHintBadge(titleHintBadge, dailyDoubleAvailable);

  if (state.chat_messages) {
    renderChat(chatMessagesEl, state.chat_messages);
    if (state.chat_messages.length > prevChatCount && !document.body.classList.contains('chat-open')) {
      showChatNotify();
    }
  }

  const historyEntries = [];
  if (state.past_games) {
    state.past_games.forEach(game => game.forEach(e => historyEntries.push(e)));
  }
  historyEntries.push(...state.guesses);
  renderHistory(historyList, historyEntries);

  maxRows = state.max_rows || 6;
  const animateRow = state.guesses.length > prevGuessCount ? state.guesses.length - 1 : -1;
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
  setGameInputDisabled(gameState.is(STATES.GAME_OVER) || dailyDoubleRow !== null);
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
  positionSidePanels(boardArea, historyBox, definitionBoxEl, chatBox);

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
        setGameInputDisabled(true);
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

function initEventStream() {
  eventSource = subscribeToUpdates((state) => {
    applyState(state);
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
  showPopup(optionsMenu, optionsToggle);
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
  document.body.classList.add('history-open');
  document.body.classList.add('definition-open');
  // Recalculate panel positions now that definition is visible
  positionSidePanels(boardArea, historyBox, definitionBoxEl, chatBox);
}
fetchState();
initEventStream();
setInterval(checkInactivity, 5000);
document.addEventListener('keydown', onActivity);
document.addEventListener('click', onActivity);
window.addEventListener('resize', repositionResetButton);
window.addEventListener('resize', () => {
  positionSidePanels(boardArea, historyBox, definitionBoxEl, chatBox);
  applyLayoutMode();
  if (latestState) renderEmojiStamps(latestState.guesses);
});
updateVH();
window.addEventListener('resize', updateVH);

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
  chatInput.value = '';
  await sendChatMessage(text, myEmoji, myPlayerId, LOBBY_CODE);
  fetchState();
});

window.addEventListener('beforeunload', stopAllSounds);
