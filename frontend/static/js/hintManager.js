/**
 * Hint system management for WordSquad.
 * Handles hint selection UI and hint application functionality.
 *
 * Daily Double rules (the server enforces them; this module mirrors them):
 * - A hint can be spent on the next open row while the round is in play.
 * - Earned on the round's final guess, it is saved for the next round.
 * - The revealed letter is private and stays until the player guesses again.
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
let updateHintBadge = null; // Function to update hint badge
let titleHintBadge = null; // Hint badge element
let requestInFlight = false;

export const HINT_SAVED_MESSAGE = 'Your 🔍 hint is saved for the next round.';

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
  updateHintBadge = dependencies.updateHintBadge;
  titleHintBadge = dependencies.titleHintBadge;
}

// Update hint state variables
function updateHintState(newMyEmoji, newMyPlayerId) {
  myEmoji = newMyEmoji;
  myPlayerId = newMyPlayerId;
}

function rowTiles(row) {
  return board ? Array.from(board.children).slice(row * 5, row * 5 + 5) : [];
}

/** Leave selection mode, e.g. when the hint is spent or its row is gone. */
function exitHintSelection({ announceCancel = false } = {}) {
  if (!document.body.classList.contains('hint-selecting')) return;
  document.body.classList.remove('hint-selecting');
  if (board) Array.from(board.children).forEach(t => (t.tabIndex = -1));
  if (announceCancel) announce('Hint selection canceled.');
}

/**
 * Keep selection mode on the row the hint now targets. Another player's guess
 * moves the next open row down; a finished round ends selection.
 */
function syncHintSelection(row) {
  if (!document.body.classList.contains('hint-selecting')) return;
  if (row === null) {
    exitHintSelection();
    return;
  }
  if (!board) return;
  Array.from(board.children).forEach((t, i) => {
    t.tabIndex = Math.floor(i / 5) === row ? 0 : -1;
  });
}

function toggleHintSelection() {
  const { dailyDoubleRow, dailyDoubleAvailable } = getDailyDoubleState();
  if (dailyDoubleRow === null) {
    if (dailyDoubleAvailable) {
      showMessage(HINT_SAVED_MESSAGE, { messageEl, messagePopup });
      announce(HINT_SAVED_MESSAGE);
    }
    return;
  }

  const isCurrentlySelecting = document.body.classList.contains('hint-selecting');

  if (isCurrentlySelecting) {
    exitHintSelection({ announceCancel: true });
    if (updateHintBadge && titleHintBadge) {
      updateHintBadge(titleHintBadge, true, false);
    }
  } else {
    // Enter hint selection mode
    document.body.classList.add('hint-selecting');
    syncHintSelection(dailyDoubleRow);
    if (updateHintBadge && titleHintBadge) {
      updateHintBadge(titleHintBadge, true, true);
    }
    const first = rowTiles(dailyDoubleRow)[0];
    if (first) first.focus(); else focusFirstElement(board);
    announce('Hint selection active. Use arrow keys to choose a tile, then press Enter.');
  }
}

async function selectHint(col) {
  if (requestInFlight) return;
  requestInFlight = true;
  hideHintTooltip();
  let resp;
  try {
    resp = await requestHint(col, myEmoji, myPlayerId, LOBBY_CODE);
  } catch {
    resp = { status: 'error', msg: 'Could not reach the server. Try again.' };
  } finally {
    requestInFlight = false;
  }
  if (resp.status === 'ok') {
    const dailyDoubleHint = { row: resp.row, col: resp.col, letter: resp.letter };
    const dailyDoubleRow = null;
    setDailyDoubleState(dailyDoubleRow, dailyDoubleHint);
    exitHintSelection();
    setGameInputDisabled(gameState.is(STATES.GAME_OVER));
    saveHintState(myEmoji, dailyDoubleRow, dailyDoubleHint);
    // Hide the hint badge since hint is now consumed
    if (updateHintBadge && titleHintBadge) {
      updateHintBadge(titleHintBadge, false, false);
    }
    const text = `Hint: the letter '${resp.letter.toUpperCase()}' – only you can see it.`;
    showMessage(text, { messageEl, messagePopup });
    announce(text);
    fetchState();
  } else {
    exitHintSelection();
    if (resp.msg) showMessage(resp.msg, { messageEl, messagePopup });
    fetchState();
  }
}

export {
  initHintManager,
  updateHintState,
  toggleHintSelection,
  syncHintSelection,
  exitHintSelection,
  selectHint
};
