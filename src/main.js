import { createBoard, updateBoard, updateKeyboardFromGuesses, updateHardModeConstraints, isValidHardModeGuess } from './board.js';
import { renderHistory } from './history.js';
import { getMyEmoji, setMyEmoji, showEmojiModal } from './emoji.js';
import { getState, sendGuess, resetGame, sendHeartbeat } from './api.js';
import { setupTypingListeners, updateBoardFromTyping } from './keyboard.js';
import { showMessage, applyDarkModePreference, shakeInput, repositionResetButton, positionSidePanels, updateVH, isMobile } from './utils.js';

let activeEmojis = [];
let leaderboard = [];
let skipAutoClose = false;
let myEmoji = getMyEmoji();
let showEmojiModalOnNextFetch = false;
let leaderboardScrolling = false;
let leaderboardScrollTimeout = null;
let lastDeltaTimeout = null;
let hadNetworkError = false;

let maxRows = 6;
let requiredLetters = new Set();
let greenPositions = {};
let gameOver = false;

const board = document.getElementById('board');
const guessInput = document.getElementById('guessInput');
const submitButton = document.getElementById('submitGuess');
const messageEl = document.getElementById('message');
const messagePopup = document.getElementById('messagePopup');
const keyboard = document.getElementById('keyboard');
const darkModeToggle = document.getElementById('darkModeToggle');
const historyToggle = document.getElementById('historyToggle');
const definitionToggle = document.getElementById('definitionToggle');
const definitionText = document.getElementById('definitionText');
const definitionBox = document.getElementById('definitionBox');
const historyClose = document.getElementById('historyClose');
const definitionClose = document.getElementById('definitionClose');
const optionsToggle = document.getElementById('optionsToggle');
const optionsMenu = document.getElementById('optionsMenu');
const optionsClose = document.getElementById('optionsClose');
const menuHistory = document.getElementById('menuHistory');
const menuDefinition = document.getElementById('menuDefinition');
const menuDarkMode = document.getElementById('menuDarkMode');
const holdReset = document.getElementById('holdReset');
const holdResetProgress = document.getElementById('holdResetProgress');
const holdResetText = document.getElementById('holdResetText');
const boardArea = document.getElementById('boardArea');
const historyBox = document.getElementById('historyBox');
const historyList = document.getElementById('historyList');
const definitionBoxEl = document.getElementById('definitionBox');

const FAST_INTERVAL = 2000;
const SLOW_INTERVAL = 15000;
const INACTIVE_DELAY = 60000; // 1 minute
let lastActivity = Date.now();
let pollTimer;
let currentInterval = FAST_INTERVAL;

if (isMobile) {
  guessInput.readOnly = true;
  guessInput.setAttribute('inputmode', 'none');
  guessInput.style.display = 'none';
  submitButton.style.display = 'none';
  messageEl.style.display = 'none';
} else {
  messageEl.style.visibility = 'hidden';
}

function showPointsDelta(delta) {
  const el = document.getElementById('pointsDelta');
  if (lastDeltaTimeout) clearTimeout(lastDeltaTimeout);
  el.className = '';
  if (delta > 0) el.classList.add('positive');
  if (delta < 0) el.classList.add('negative');
  el.textContent = (delta > 0 ? '+' : '') + delta + ' point' + (Math.abs(delta) !== 1 ? 's' : '');
  el.classList.add('visible');
  lastDeltaTimeout = setTimeout(() => {
    el.classList.remove('visible');
  }, 2200);
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

function updateResetButton() {
  if (gameOver) {
    holdResetText.textContent = 'Reset';
    holdResetProgress.style.width = '0%';
    holdResetProgress.style.opacity = '0';
    holdReset.onmousedown = null;
    holdReset.ontouchstart = null;
    holdReset.onclick = () => {
      resetGame().then(() => {
        fetchState();
        showMessage('Game reset!', { messageEl, messagePopup });
      });
    };
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
      resetGame().then(() => {
        fetchState();
        showMessage('Game reset!', { messageEl, messagePopup });
      });
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

async function fetchState() {
  try {
    const state = await getState();
    if (hadNetworkError) {
      showMessage('Reconnected to server.', { messageEl, messagePopup });
    }
    hadNetworkError = false;
    activeEmojis = state.active_emojis || [];
    leaderboard = state.leaderboard || [];
    renderLeaderboard();

    const historyEntries = [];
    if (state.past_games) {
      state.past_games.forEach(game => game.forEach(e => historyEntries.push(e)));
    }
    historyEntries.push(...state.guesses);
    renderHistory(historyList, historyEntries);

    maxRows = state.max_rows || 6;
    updateBoard(board, state, guessInput, maxRows, gameOver);
    updateKeyboardFromGuesses(keyboard, state.guesses);
    const constraints = updateHardModeConstraints(state.guesses);
    requiredLetters = constraints.requiredLetters;
    greenPositions = constraints.greenPositions;

    gameOver = state.is_over;
    guessInput.disabled = gameOver;
    submitButton.disabled = gameOver;
    updateResetButton();

    if (state.is_over && state.definition) {
      definitionText.textContent = `${state.target_word.toUpperCase()} – ${state.definition}`;
    } else if (state.last_word && state.last_definition) {
      definitionText.textContent = `${state.last_word.toUpperCase()} – ${state.last_definition}`;
    } else {
      definitionText.textContent = '';
    }

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
  } catch (err) {
    console.error('fetchState error:', err);
    if (!hadNetworkError) {
      showMessage('Connection lost. Retrying...', { messageEl, messagePopup });
      hadNetworkError = true;
    }
  }
}

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
  if (resp.status === 'ok') {
    fetchState();
    guessInput.value = '';
    if (typeof resp.pointsDelta === 'number') showPointsDelta(resp.pointsDelta);
    if (resp.won) {
      showMessage('You got it! The word was ' + resp.state.target_word.toUpperCase(), { messageEl, messagePopup });
    }
    if (resp.over && !resp.won) {
      showMessage('Game Over! The word was ' + resp.state.target_word.toUpperCase(), { messageEl, messagePopup });
    }
    if (resp.over && resp.state.definition) {
      definitionText.textContent = `${resp.state.target_word.toUpperCase()} – ${resp.state.definition}`;
    }
  } else {
    if (resp.close_call) {
      showMessage(
        `Close call! ${resp.close_call.winner} beat you by ${resp.close_call.delta_ms}ms.`,
        { messageEl, messagePopup }
      );
    } else {
      showMessage(resp.msg, { messageEl, messagePopup });
    }
    shakeInput(guessInput);
  }
}

function onActivity() {
  lastActivity = Date.now();
  if (currentInterval !== FAST_INTERVAL) startPolling(FAST_INTERVAL);
  sendHeartbeat(myEmoji);
  fetchState();
}

function startPolling(interval) {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(fetchState, interval);
  currentInterval = interval;
}

function checkInactivity() {
  if (Date.now() - lastActivity > INACTIVE_DELAY && currentInterval !== SLOW_INTERVAL) {
    startPolling(SLOW_INTERVAL);
  }
}

setupTypingListeners({
  keyboardEl: keyboard,
  guessInput,
  submitButton,
  submitGuessHandler,
  updateBoardFromTyping: () => updateBoardFromTyping(board, guessInput, maxRows, gameOver),
  isAnimating: () => false
});

darkModeToggle.addEventListener('click', () => {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', isDark);
  applyDarkModePreference(darkModeToggle);
});

historyToggle.addEventListener('click', () => { document.body.classList.toggle('history-open'); });
historyClose.addEventListener('click', () => { document.body.classList.remove('history-open'); });
definitionToggle.addEventListener('click', () => { document.body.classList.toggle('definition-open'); });
definitionClose.addEventListener('click', () => { document.body.classList.remove('definition-open'); });
optionsToggle.addEventListener('click', () => {
  const rect = optionsToggle.getBoundingClientRect();
  optionsMenu.style.display = 'block';
  optionsMenu.style.top = `${rect.bottom + window.scrollY}px`;
  optionsMenu.style.left = `${rect.left + window.scrollX}px`;
});
optionsClose.addEventListener('click', () => { optionsMenu.style.display = 'none'; });
menuHistory.addEventListener('click', () => { historyToggle.click(); optionsMenu.style.display = 'none'; });
menuDefinition.addEventListener('click', () => { definitionToggle.click(); optionsMenu.style.display = 'none'; });
menuDarkMode.addEventListener('click', () => { darkModeToggle.click(); });

applyDarkModePreference(darkModeToggle);
createBoard(board, maxRows);
repositionResetButton();
positionSidePanels(boardArea, historyBox, definitionBoxEl);
if (window.innerWidth > 600) {
  document.body.classList.add('history-open');
  document.body.classList.add('definition-open');
}
fetchState();
startPolling(FAST_INTERVAL);
setInterval(checkInactivity, 5000);
document.addEventListener('keydown', onActivity);
document.addEventListener('click', onActivity);
window.addEventListener('resize', repositionResetButton);
window.addEventListener('resize', () => positionSidePanels(boardArea, historyBox, definitionBoxEl));
updateVH();
window.addEventListener('resize', updateVH);

