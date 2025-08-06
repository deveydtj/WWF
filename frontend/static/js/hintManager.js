/**
 * Hint system management for WordSquad.
 * Handles hint selection UI and hint application functionality.
 */

import { focusFirstElement, announce, setGameInputDisabled, showMessage } from './utils.js';
import { hideHintTooltip } from './uiNotifications.js';
import { requestHint } from './api.js';
import { saveHintState } from './hintState.js';
import { STATES } from './stateManager.js';

// External dependencies that need to be set
let board = null;
let gameState = null;
let fetchState = null;
let myEmoji = null;
let myPlayerId = null;
let LOBBY_CODE = null;
let messageEl = null;
let messagePopup = null;
let getDailyDoubleState = null; // Function to get current hint state
let setDailyDoubleState = null; // Function to set hint state

// Initialize hint manager with required dependencies
function initHintManager(dependencies) {
  board = dependencies.board;
  gameState = dependencies.gameState;
  fetchState = dependencies.fetchState;
  myEmoji = dependencies.myEmoji;
  myPlayerId = dependencies.myPlayerId;
  LOBBY_CODE = dependencies.LOBBY_CODE;
  messageEl = dependencies.messageEl;
  messagePopup = dependencies.messagePopup;
  getDailyDoubleState = dependencies.getDailyDoubleState;
  setDailyDoubleState = dependencies.setDailyDoubleState;
}

// Update hint state variables
function updateHintState(newMyEmoji, newMyPlayerId) {
  myEmoji = newMyEmoji;
  myPlayerId = newMyPlayerId;
}

function toggleHintSelection() {
  const { dailyDoubleRow } = getDailyDoubleState();
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

async function selectHint(col) {
  hideHintTooltip();
  const resp = await requestHint(col, myEmoji, myPlayerId, LOBBY_CODE);
  if (resp.status === 'ok') {
    const dailyDoubleHint = { row: resp.row, col: resp.col, letter: resp.letter };
    const dailyDoubleRow = null;
    setDailyDoubleState(dailyDoubleRow, dailyDoubleHint);
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

export {
  initHintManager,
  updateHintState,
  toggleHintSelection,
  selectHint
};