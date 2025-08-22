/**
 * Reset functionality management for WordSquad.
 * Handles game reset operations, hold-to-reset UI, and reset button states.
 */

import { stopAllSounds } from './audioManager.js';
import { animateTilesOut, animateTilesIn } from './board.js';
import { resetGame } from './api.js';
import { showMessage } from './utils.js';
import { STATES } from './stateManager.js';

// DOM elements for reset functionality
const holdReset = document.getElementById('holdReset');
const holdResetProgress = document.getElementById('holdResetProgress');
const holdResetText = document.getElementById('holdResetText');

// Reset state tracking
let holdProgress = null;

// External dependencies that need to be set
let gameState = null;
let fetchState = null;
let LOBBY_CODE = null;
let HOST_TOKEN = null;
let board = null;
let messageEl = null;
let messagePopup = null;

// Initialize reset manager with required dependencies
function initResetManager(dependencies) {
  gameState = dependencies.gameState;
  fetchState = dependencies.fetchState;
  LOBBY_CODE = dependencies.LOBBY_CODE;
  HOST_TOKEN = dependencies.HOST_TOKEN;
  board = dependencies.board;
  messageEl = dependencies.messageEl;
  messagePopup = dependencies.messagePopup;
  
  // Set up event listeners for hold-to-reset
  ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(ev => 
    holdReset.addEventListener(ev, stopHoldReset)
  );
}

async function performReset() {
  stopAllSounds();
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
      if (e.cancelable) {
        e.preventDefault();
      }
      startHoldReset();
    };
  }
}

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
      
      // Start button morphing animation instead of showing popup
      morphResetButton();
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

// Morph the reset button to show "Game Reset" and then back to "Reset"
function morphResetButton() {
  // Save original styles
  const originalTransition = holdReset.style.transition;
  const originalWidth = holdReset.style.width;
  
  // Add smooth width transition
  holdReset.style.transition = 'width 0.3s ease-out';
  
  // Increase width to accommodate "Game Reset" text and change text
  const currentWidth = holdReset.offsetWidth;
  const newWidth = Math.max(currentWidth * 1.3, currentWidth + 40); // Ensure minimum expansion
  holdReset.style.width = newWidth + 'px';
  holdResetText.textContent = 'Game Reset';
  
  // After 1.5 seconds, return to original width and change text back
  setTimeout(() => {
    holdReset.style.width = originalWidth;
    holdResetText.textContent = 'Reset';
    
    // Reset transition after animation completes
    setTimeout(() => {
      holdReset.style.transition = originalTransition;
    }, 300);
  }, 1500);
}

export {
  initResetManager,
  performReset,
  quickResetHandler,
  updateResetButton,
  startHoldReset,
  stopHoldReset
};