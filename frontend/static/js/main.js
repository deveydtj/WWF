import { createBoard, updateBoard, updateKeyboardFromGuesses, updateHardModeConstraints, isValidHardModeGuess, animateTilesOut, animateTilesIn } from './board.js';
import { renderHistory } from './history.js';
import { getMyEmoji, setMyEmoji, showEmojiModal } from './emoji.js';
import { getState, sendGuess, resetGame, sendHeartbeat, sendChatMessage, subscribeToUpdates, requestHint } from './api.js';
import { renderChat } from './chat.js';
import { setupTypingListeners, updateBoardFromTyping } from './keyboard.js';
import { showMessage, applyDarkModePreference, shakeInput, repositionResetButton,
         positionSidePanels, updateVH, applyLayoutMode, isMobile, showPopup } from './utils.js';

let activeEmojis = [];
let leaderboard = [];
let skipAutoClose = false;
let myEmoji = getMyEmoji();
let showEmojiModalOnNextFetch = false;
let leaderboardScrolling = false;
let leaderboardScrollTimeout = null;
let hadNetworkError = false;

// Default to sound off unless user explicitly enabled it
let soundEnabled = localStorage.getItem('soundEnabled') === 'true';
let audioCtx = null;

let maxRows = 6;
let requiredLetters = new Set();
let greenPositions = {};
let gameOver = false;
let latestState = null;
let dailyDoubleRow = null;
let dailyDoubleHint = null;

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
const closeCallPopup = document.getElementById('closeCallPopup');
const closeCallText = document.getElementById('closeCallText');
const closeCallOk = document.getElementById('closeCallOk');
// Ensure the close-call popup starts hidden even if CSS hasn't loaded yet
closeCallPopup.style.display = 'none';
const chatNotify = document.getElementById('chatNotify');
const infoPopup = document.getElementById('infoPopup');
const infoClose = document.getElementById('infoClose');
const menuInfo = document.getElementById('menuInfo');

let chatWiggleTimer = null;

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

function playClick() {
  if (!soundEnabled) return;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
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
    if (entry.last_active !== undefined && (now - entry.last_active > 300)) {
      node.classList.add('inactive');
    }
    node.innerText = `${entry.emoji} ${entry.score}`;

    if (entry.emoji === myEmoji) {
      node.style.cursor = 'pointer';
      node.title = 'Click to change your emoji';
      node.addEventListener('click', () => {
        skipAutoClose = true;
        const taken = activeEmojis.filter(e => e !== myEmoji);
        showEmojiModal(taken, { onChosen: (e) => { myEmoji = e; fetchState(); }, skipAutoCloseRef: { value: skipAutoClose } });
      });
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
    }, 1000);
  };
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
  await animateTilesOut(board);
  await resetGame();
  await fetchState();
  await animateTilesIn(board);
  showMessage('Game reset!', { messageEl, messagePopup });
}

async function quickResetHandler() {
  // Ensure our view is up to date before attempting a one-click reset.
  await fetchState();
  if (!latestState.is_over) {
    // Another player already started a new round; switch to hold-to-reset mode.
    showMessage('Board already reset.', { messageEl, messagePopup });
    return;
  }
  await performReset();
}

function updateResetButton() {
  if (gameOver) {
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
  activeEmojis = state.active_emojis || [];
  leaderboard = state.leaderboard || [];
  renderLeaderboard();

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
  updateBoard(board, state, guessInput, maxRows, gameOver, animateRow, dailyDoubleHint, dailyDoubleRow);
  if (dailyDoubleRow !== null && state.guesses.length > dailyDoubleRow) {
    dailyDoubleRow = null;
    dailyDoubleHint = null;
  }
  if (dailyDoubleHint && state.guesses.length > dailyDoubleHint.row) {
    dailyDoubleHint = null;
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
  const prevGameOver = gameOver;
  gameOver = state.is_over;
  guessInput.disabled = gameOver;
  submitButton.disabled = gameOver;
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
      onChosen: e => { myEmoji = e; fetchState(); },
      skipAutoCloseRef: { value: skipAutoClose }
    });
    showEmojiModalOnNextFetch = false;
  } else if (!skipAutoClose) {
    document.getElementById('emojiModal').style.display = 'none';
  }
}

// Retrieve the latest game state from the server and handle connection issues
async function fetchState() {
  try {
    const state = await getState();
    if (hadNetworkError) {
      showMessage('Reconnected to server.', { messageEl, messagePopup });
    }
    hadNetworkError = false;
    applyState(state);
  } catch (err) {
    console.error('fetchState error:', err);
    if (!hadNetworkError) {
      showMessage('Connection lost. Retrying...', { messageEl, messagePopup });
      hadNetworkError = true;
    }
  }
}

// Handle guess submission from input or keyboard
async function submitGuessHandler() {
  if (gameOver) return;
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
  const resp = await sendGuess(guess, myEmoji);
  guessInput.value = '';
  if (resp.status === 'ok') {
    applyState(resp.state);
    if (resp.daily_double) {
      dailyDoubleRow = resp.state.guesses.length;
      dailyDoubleHint = null;
      showMessage('Daily Double! Tap a tile in the next row for a hint.', { messageEl, messagePopup });
    }
    if (typeof resp.pointsDelta === 'number') showPointsDelta(resp.pointsDelta);
    if (resp.won) {
      showMessage('You got it! The word was ' + resp.state.target_word.toUpperCase(), { messageEl, messagePopup });
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
    } else {
      showMessage(resp.msg, { messageEl, messagePopup });
    }
    shakeInput(guessInput);
  }
}

function onActivity() {
  lastActivity = Date.now();
  if (!eventSource && currentInterval !== FAST_INTERVAL) startPolling(FAST_INTERVAL);
  sendHeartbeat(myEmoji);
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
  });
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
  updateBoardFromTyping: () => updateBoardFromTyping(board, latestState, guessInput, maxRows, gameOver, dailyDoubleHint, dailyDoubleRow),
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
}

function toggleHistory() {
  togglePanel('history-open');
}

function toggleDefinition() {
  togglePanel('definition-open');
}

function showInfo() {
  infoPopup.style.display = 'flex';
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
});
optionsToggle.addEventListener('click', () => {
  showPopup(optionsMenu, optionsToggle);
});
optionsClose.addEventListener('click', () => { optionsMenu.style.display = 'none'; });
menuHistory.addEventListener('click', () => { toggleHistory(); optionsMenu.style.display = 'none'; });
menuDefinition.addEventListener('click', () => { toggleDefinition(); optionsMenu.style.display = 'none'; });
menuChat.addEventListener('click', () => {
  togglePanel('chat-open');
  hideChatNotify();
  optionsMenu.style.display = 'none';
});
menuInfo.addEventListener('click', () => { showInfo(); optionsMenu.style.display = 'none'; });
menuDarkMode.addEventListener('click', toggleDarkMode);
menuSound.addEventListener('click', toggleSound);
closeCallOk.addEventListener('click', () => { closeCallPopup.style.display = 'none'; });
infoClose.addEventListener('click', () => { infoPopup.style.display = 'none'; });

applyDarkModePreference(menuDarkMode);
menuSound.textContent = soundEnabled ? '🔊 Sound On' : '🔈 Sound Off';
applyLayoutMode();
createBoard(board, maxRows);
repositionResetButton();
positionSidePanels(boardArea, historyBox, definitionBoxEl, chatBox);
renderEmojiStamps([]);
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
  const resp = await requestHint(col, myEmoji);
  if (resp.status === 'ok') {
    dailyDoubleHint = { row: resp.row, col: resp.col, letter: resp.letter };
    dailyDoubleRow = null;
    fetchState();
  } else if (resp.msg) {
    showMessage(resp.msg, { messageEl, messagePopup });
  }
});

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  await sendChatMessage(text, myEmoji);
  fetchState();
});

