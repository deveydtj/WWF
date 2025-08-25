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
let isDisplayingGameReset = false;
let eventListenersDisabled = false;

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
  // During display phase, the original button is hidden so no interaction is possible
  // This function can be simplified since the display button has no event listeners
  
  isButtonPressed = false;
  clearInterval(holdProgress);
  holdResetProgress.style.transition = 'width 0.15s';
  holdResetProgress.style.width = '0%';
  holdResetProgress.style.opacity = '0.9';
}

// Morph the reset button to show "Game Reset" and then back to "Reset"
function morphResetButton() {
  // Clear any existing timeout to prevent conflicts
  if (morphTimeout) {
    clearTimeout(morphTimeout);
    morphTimeout = null;
  }
  
  // Create a duplicate button to display "Game Reset" without any interaction
  const displayButton = holdReset.cloneNode(true);
  displayButton.id = 'holdResetDisplay'; // Give it a unique ID
  
  // Remove all event listeners from the display button by replacing it with a clean clone
  const cleanDisplayButton = displayButton.cloneNode(true);
  
  // Get computed styles from the original button to ensure exact matching
  const computedStyle = window.getComputedStyle(holdReset);
  const rect = holdReset.getBoundingClientRect();
  
  // Position the display button exactly over the original button with computed styles
  cleanDisplayButton.style.position = 'fixed';
  cleanDisplayButton.style.top = rect.top + 'px';
  cleanDisplayButton.style.left = rect.left + 'px';
  cleanDisplayButton.style.width = rect.width + 'px';
  cleanDisplayButton.style.height = rect.height + 'px';
  cleanDisplayButton.style.zIndex = '1001'; // Higher than original button
  cleanDisplayButton.style.pointerEvents = 'none'; // Completely disable interaction
  
  // Copy essential computed styles to prevent size snapping
  cleanDisplayButton.style.fontSize = computedStyle.fontSize;
  cleanDisplayButton.style.fontWeight = computedStyle.fontWeight;
  cleanDisplayButton.style.padding = computedStyle.padding;
  cleanDisplayButton.style.borderRadius = computedStyle.borderRadius;
  cleanDisplayButton.style.boxShadow = computedStyle.boxShadow;
  cleanDisplayButton.style.background = computedStyle.background;
  cleanDisplayButton.style.color = computedStyle.color;
  
  // Get the text element in the display button
  const displayText = cleanDisplayButton.querySelector('#holdResetText') || cleanDisplayButton;
  if (displayText && displayText.id === 'holdResetText') {
    displayText.id = 'holdResetDisplayText'; // Avoid ID conflicts
  }
  
  // Hide the progress bar on the duplicate to prevent green overlay interference
  const displayProgress = cleanDisplayButton.querySelector('#holdResetProgress');
  if (displayProgress) {
    displayProgress.style.opacity = '0'; // Hide the progress bar completely
    displayProgress.style.width = '0%'; // Reset width to prevent background interference
  }
  
  // Enhance text visibility with better styling
  if (displayText) {
    displayText.style.position = 'relative';
    displayText.style.zIndex = '10'; // Ensure text is above any background elements
    displayText.style.color = computedStyle.color; // Use original text color
    displayText.style.textShadow = '0 1px 2px rgba(0,0,0,0.1)'; // Add subtle text shadow for contrast
  }
  
  // Hide the original button completely during display
  holdReset.style.visibility = 'hidden';
  
  // Insert the display button into the DOM
  document.body.appendChild(cleanDisplayButton);
  
  // Start the animation sequence
  const originalWidth = rect.width;
  const newWidth = Math.max(originalWidth * 1.5, originalWidth + 50); // Slightly more expansion for better visual effect
  
  // Initial setup - ensure button starts at original size
  cleanDisplayButton.style.width = originalWidth + 'px';
  
  // Animate text change: fade out "Reset" first
  if (displayText) {
    displayText.style.transition = 'opacity 0.2s ease-out';
    displayText.style.opacity = '0';
    
    // After text fades out, start width expansion and text change simultaneously
    setTimeout(() => {
      // Start width expansion with a more noticeable easing
      cleanDisplayButton.style.transition = 'width 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      cleanDisplayButton.style.width = newWidth + 'px';
      
      // Change text and fade in "Game Reset" slightly after width animation starts
      setTimeout(() => {
        displayText.textContent = 'Game Reset';
        displayText.style.transition = 'opacity 0.3s ease-in';
        displayText.style.opacity = '1';
      }, 100); // Small delay to let width animation start first
      
      // Display "Game Reset" for exactly 3 seconds with no possibility of interruption
      morphTimeout = setTimeout(() => {
        revertResetButton(cleanDisplayButton, displayText, originalWidth);
      }, 3000);
    }, 200);
  }
  
  // Helper function to revert to original button
  function revertResetButton(displayBtn, displayTxt, origWidth) {
    // Clear the timeout reference since we're now reverting
    morphTimeout = null;
    
    // Fade out "Game Reset" text first
    if (displayTxt) {
      displayTxt.style.transition = 'opacity 0.2s ease-out';
      displayTxt.style.opacity = '0';
      
      // After text fades out, change to "Reset" and start width transition
      setTimeout(() => {
        displayTxt.textContent = 'Reset';
        
        // Start width transition back with smooth easing
        displayBtn.style.transition = 'width 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        displayBtn.style.width = origWidth + 'px';
        
        // Fade in "Reset" text slightly after width animation starts
        setTimeout(() => {
          displayTxt.style.transition = 'opacity 0.25s ease-in';
          displayTxt.style.opacity = '1';
        }, 100);
        
        // Wait for animations to complete before removing display button
        setTimeout(() => {
          // Show the original button
          holdReset.style.visibility = 'visible';
          
          // Remove the display button from DOM
          if (displayBtn.parentNode) {
            displayBtn.parentNode.removeChild(displayBtn);
          }
          
          // Reset any state flags
          isDisplayingGameReset = false;
          eventListenersDisabled = false;
        }, 400); // Wait for width animation to complete
      }, 200);
    } else {
      // Fallback if no display text found
      displayBtn.style.transition = 'width 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      displayBtn.style.width = origWidth + 'px';
      
      setTimeout(() => {
        holdReset.style.visibility = 'visible';
        if (displayBtn.parentNode) {
          displayBtn.parentNode.removeChild(displayBtn);
        }
        isDisplayingGameReset = false;
        eventListenersDisabled = false;
      }, 400);
    }
  }
}

export {
  initResetManager,
  performReset,
  quickResetHandler,
  updateResetButton,
  startHoldReset,
  stopHoldReset
};