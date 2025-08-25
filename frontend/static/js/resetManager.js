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
let isButtonPressed = false;
let morphTimeout = null;

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
  isButtonPressed = true;
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
  isButtonPressed = false;
  clearInterval(holdProgress);
  holdResetProgress.style.transition = 'width 0.15s';
  holdResetProgress.style.width = '0%';
  holdResetProgress.style.opacity = '0.9';
  
  // If we're in the middle of a morph animation and user releases, 
  // immediately start the revert process
  if (morphTimeout && holdResetText.textContent === 'Game Reset') {
    clearTimeout(morphTimeout);
    revertResetButton();
  }
}

// Morph the reset button to show "Game Reset" and then back to "Reset"
function morphResetButton() {
  // Save original styles
  const originalTransition = holdReset.style.transition;
  const originalWidth = holdReset.style.width;
  
  // Add smooth width transition
  holdReset.style.transition = 'width 0.3s ease-out';
  
  // Increase width to accommodate "Game Reset" text
  const currentWidth = holdReset.offsetWidth;
  const newWidth = Math.max(currentWidth * 1.3, currentWidth + 40); // Ensure minimum expansion
  holdReset.style.width = newWidth + 'px';
  
  // Animate text change: fade out "Reset" more slowly
  holdResetText.style.transition = 'opacity 0.2s ease-out';
  holdResetText.style.opacity = '0';
  
  // Wait longer before changing text and fade in "Game Reset" more deliberately
  setTimeout(() => {
    holdResetText.textContent = 'Game Reset';
    holdResetText.style.transition = 'opacity 0.25s ease-in';
    holdResetText.style.opacity = '1';
    
    // Keep "Game Reset" visible for 3 seconds, but only if user is still holding
    morphTimeout = setTimeout(() => {
      // Only revert automatically if the user is still holding the button
      if (isButtonPressed) {
        revertResetButton();
      }
    }, 3000);
  }, 300);
  
  // Helper function to revert the button state
  function revertResetButton() {
    morphTimeout = null;
    
    // Start width transition back
    holdReset.style.width = originalWidth;
    
    // Fade out "Game Reset" text
    holdResetText.style.transition = 'opacity 0.2s ease-out';
    holdResetText.style.opacity = '0';
    
    // After text fades out, change back to "Reset" and fade in
    setTimeout(() => {
      holdResetText.textContent = 'Reset';
      holdResetText.style.transition = 'opacity 0.2s ease-in';
      holdResetText.style.opacity = '1';
      
      // Reset all transitions after animation completes
      setTimeout(() => {
        holdReset.style.transition = originalTransition;
        holdResetText.style.transition = '';
      }, 200);
    }, 200);
  }
}

// Helper function to revert button state (accessible from stopHoldReset)
function revertResetButton() {
  // Start width transition back - find original width from computed styles
  const computedStyle = window.getComputedStyle(holdReset);
  const currentWidth = holdReset.offsetWidth;
  
  // Estimate original width (reverse the 1.3x expansion)
  const originalWidth = Math.round(currentWidth / 1.3);
  holdReset.style.width = originalWidth + 'px';
  
  // Fade out "Game Reset" text
  holdResetText.style.transition = 'opacity 0.2s ease-out';
  holdResetText.style.opacity = '0';
  
  // After text fades out, change back to "Reset" and fade in
  setTimeout(() => {
    holdResetText.textContent = 'Reset';
    holdResetText.style.transition = 'opacity 0.2s ease-in';
    holdResetText.style.opacity = '1';
    
    // Reset all transitions after animation completes
    setTimeout(() => {
      holdReset.style.transition = '';
      holdResetText.style.transition = '';
    }, 200);
  }, 200);
}

export {
  initResetManager,
  performReset,
  quickResetHandler,
  updateResetButton,
  startHoldReset,
  stopHoldReset
};