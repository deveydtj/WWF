// Import core functionality
import { isValidHardModeGuess } from './board.js';
import { getMyEmoji, setMyEmoji, showEmojiModal, getMyPlayerId, setMyPlayerId } from './emoji.js';
import { sendEmoji, sendGuess, leaveLobbyRequest } from './api.js';
import { showMessage, shakeInput, closeDialog, openDialog, announce } from './utils.js';
import { loadHintState, saveHintState } from './hintState.js';
import { STATES } from './stateManager.js';

// Import UI notification functions
import { showPointsDelta, showHintTooltip, hideHintTooltip, burstConfetti } from './uiNotifications.js';
import { playJingle, playClick, stopAllSounds } from './audioManager.js';
import { selectHint } from './hintManager.js';

// Import the new modular managers
import domManager from './domManager.js';
import networkManager from './networkManager.js';
import gameStateManager from './gameStateManager.js';
import eventListenersManager from './eventListenersManager.js';
import mobileMenuManager from './mobileMenuManager.js';
import appInitializer from './appInitializer.js';

// Import board scaling test utilities for debugging
import './boardScalingTests.js';

// Global state variables
let skipAutoClose = false;
let myEmoji = getMyEmoji();
let myPlayerId = getMyPlayerId();

// Get lobby code from URL
const LOBBY_CODE = (() => {
  const m = window.location.pathname.match(/\/lobby\/([A-Za-z0-9]{6})/);
  return m ? m[1] : null;
})();
window.LOBBY_CODE = LOBBY_CODE;

// Initialize the application
async function initializeApp() {
  // Setup the submit guess handler BEFORE app initialization
  // so it's available during keyboard setup
  window.submitGuessHandler = submitGuessHandler;

  // Initialize with all managers
  const success = await appInitializer.initialize({
    domManager,
    networkManager,
    gameStateManager,
    eventListenersManager,
    mobileMenuManager
  });

  if (!success) {
    console.error('Failed to initialize application');
    return;
  }

  console.log('🚀 Application initialized successfully');
}

// Handle guess submission from input or keyboard
async function submitGuessHandler() {
  console.log('🎮 submitGuessHandler called');
  const gameState = gameStateManager.gameState;
  if (gameState?.is(STATES.GAME_OVER)) return;
  
  const guessInput = domManager.get('guessInput');
  if (!guessInput) return;
  
  const guess = guessInput.value.trim().toLowerCase();
  
  if (guess.length !== 5) {
    shakeInput(guessInput);
    showMessage('Please enter a 5-letter word.', {
      messageEl: domManager.get('messageEl'),
      messagePopup: domManager.get('messagePopup')
    });
    return;
  }
  
  if (!isValidHardModeGuess(
    guess, 
    gameStateManager.getRequiredLetters(), 
    gameStateManager.getGreenPositions(), 
    (m) => showMessage(m, {
      messageEl: domManager.get('messageEl'),
      messagePopup: domManager.get('messagePopup')
    })
  )) {
    shakeInput(guessInput);
    return;
  }
  
  if (!myPlayerId) {
    try {
      const d = await sendEmoji(myEmoji, null, LOBBY_CODE);
      if (d && d.player_id) {
        myPlayerId = d.player_id;
        setMyPlayerId(d.player_id);
        eventListenersManager.updatePlayerInfo(myEmoji, myPlayerId);
      }
    } catch {}
  }
  
  // Record the guess attempt BEFORE sending to provide grace period for auto-reconnection scenarios
  // This protects against SSE updates that arrive while the network request is in flight
  gameStateManager.recordGuessAttempt();
  
  let resp = await sendGuess(guess, myEmoji, myPlayerId, LOBBY_CODE);
  
  // If we get a 403 error, it might be due to player ID mismatch
  // Try to re-register the emoji and retry the guess once
  if (resp && resp.status === 'error' && resp.msg && resp.msg.includes('pick an emoji')) {
    console.log('🔧 Player ID mismatch detected, re-registering emoji...');
    try {
      const emojiResp = await sendEmoji(myEmoji, null, LOBBY_CODE);
      if (emojiResp && emojiResp.status === 'ok') {
        // Update our local state with the corrected information
        if (emojiResp.player_id) {
          myPlayerId = emojiResp.player_id;
          setMyPlayerId(emojiResp.player_id);
        }
        if (emojiResp.emoji) {
          myEmoji = emojiResp.emoji;
          setMyEmoji(emojiResp.emoji);
        }
        eventListenersManager.updatePlayerInfo(myEmoji, myPlayerId);
        console.log('🔧 Re-registration successful, retrying guess...');
        // Record the retry attempt BEFORE sending to protect against race conditions
        gameStateManager.recordGuessAttempt();
        // Retry the guess with the updated information
        resp = await sendGuess(guess, myEmoji, myPlayerId, LOBBY_CODE);
      }
    } catch (retryError) {
      console.error('Failed to retry guess after emoji re-registration:', retryError);
    }
  }
  
  guessInput.value = '';
  
  if (resp.status === 'ok') {
    gameStateManager.applyState(resp.state);
    
    if (resp.daily_double) {
      if (resp.daily_double_tile) {
        burstConfetti(resp.daily_double_tile.row, resp.daily_double_tile.col);
      }
      
      gameStateManager.setDailyDoubleState(resp.state.guesses.length, null);
      saveHintState(myEmoji, resp.state.guesses.length, null);
      
      showMessage('Daily Double! Tap a tile in the next row for a hint.', {
        messageEl: domManager.get('messageEl'),
        messagePopup: domManager.get('messagePopup')
      });
      showHintTooltip('Tap a tile in the next row to reveal a letter!');
      announce('Daily Double earned – choose one tile in the next row to preview.');
    }
    
    if (typeof resp.pointsDelta === 'number') showPointsDelta(resp.pointsDelta);
    
    if (resp.won) {
      showMessage('You got it! The word was ' + resp.state.target_word.toUpperCase(), {
        messageEl: domManager.get('messageEl'),
        messagePopup: domManager.get('messagePopup')
      });
      playJingle();
    }
    
    if (resp.over && !resp.won) {
      showMessage('Game Over! The word was ' + resp.state.target_word.toUpperCase(), {
        messageEl: domManager.get('messageEl'),
        messagePopup: domManager.get('messagePopup')
      });
    }
  } else {
    if (resp.close_call) {
      const closeCallText = domManager.get('closeCallText');
      const closeCallPopup = domManager.get('closeCallPopup');
      
      if (closeCallText && closeCallPopup) {
        closeCallText.textContent = `Close call! ${resp.close_call.winner} beat you by ${resp.close_call.delta_ms}ms.`;
        closeCallPopup.style.display = 'flex';
        openDialog(closeCallPopup);
      }
    } else {
      showMessage(resp.msg, {
        messageEl: domManager.get('messageEl'),
        messagePopup: domManager.get('messagePopup')
      });
    }
    shakeInput(guessInput);
  }
}

// Handle emoji modal logic - only for users without an emoji
function handleEmojiModal(activeEmojis) {
  const haveMy = activeEmojis.includes(myEmoji);
  
  // Only show the emoji modal if the user doesn't have an emoji at all
  // Users who want to change their emoji should exit to the landing page
  if (!myEmoji) {
    showEmojiModal(activeEmojis, {
      onChosen: e => { 
        myEmoji = e; 
        myPlayerId = getMyPlayerId(); 
        gameStateManager.setMyEmoji(myEmoji);
        eventListenersManager.updatePlayerInfo(myEmoji, myPlayerId);
        
        const { row, hint } = loadHintState(myEmoji);
        gameStateManager.setDailyDoubleState(row, hint);
        
        networkManager.fetchState(myEmoji, LOBBY_CODE);
      },
      skipAutoCloseRef: { value: skipAutoClose },
      onError: (msg) => showMessage(msg, {
        messageEl: domManager.get('messageEl'),
        messagePopup: domManager.get('messagePopup')
      })
    });
    showEmojiModalOnNextFetch = false;
  } else {
    // Close any existing modal if user already has an emoji
    closeDialog(document.getElementById('emojiModal'));
  }
}

// Enhanced applyState wrapper that includes emoji modal handling
function applyStateWithEmojiModal(state) {
  gameStateManager.applyState(state);
  handleEmojiModal(state.active_emojis || []);
}

// Setup board-specific event listeners for hints
function setupBoardHintListeners() {
  const board = domManager.get('board');
  if (!board) return;

  // Board click handler for hint selection
  board.addEventListener('click', async (e) => {
    const dailyDoubleRow = gameStateManager.getDailyDoubleRow();
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

  // Board keyboard navigation for hints
  board.addEventListener('keydown', async (e) => {
    if (!document.body.classList.contains('hint-selecting')) return;
    
    const dailyDoubleRow = gameStateManager.getDailyDoubleRow();
    if (dailyDoubleRow === null) return;
    
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
}

// Handle lobby leaving
function setupLobbyLeaving() {
  const leaveLobby = domManager.get('leaveLobby');
  if (leaveLobby && LOBBY_CODE) {
    leaveLobby.addEventListener('click', async () => {
      // Immediately update URL to prevent refresh back into lobby before any async operations
      if (window.parent !== window) {
        // Clear the hash in the parent window to ensure proper navigation
        window.parent.location.hash = '';
        window.parent.history.replaceState(null, '', '/');
      } else {
        // Immediately update URL to prevent refresh back into lobby
        window.history.replaceState(null, '', '/');
      }
      
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
      
      // Cleanup and redirect
      networkManager.cleanup();
      stopAllSounds();
      
      // Check if we're in an iframe (lobby loaded within landing page)
      if (window.parent !== window) {
        window.parent.location.href = '/';
      } else {
        // If not in iframe, navigate normally
        window.location.href = '/';
      }
    });
  }
}

// Start the application
initializeApp().then(() => {
  // Override the network manager's state update callback to include emoji modal handling
  networkManager.initialize({
    onStateUpdate: applyStateWithEmojiModal,
    onServerUpdate: (data) => networkManager.handleServerUpdateNotification(data),
    messageHandlers: {
      messageEl: domManager.get('messageEl'),
      messagePopup: domManager.get('messagePopup')
    }
  });
  
  // Setup additional event listeners that aren't handled by the managers
  setupBoardHintListeners();
  setupLobbyLeaving();
  
  console.log('🎮 Game ready to play!');
}).catch(error => {
  console.error('💥 Failed to start application:', error);
});