// Import core functionality
import { isValidHardModeGuess, shakeRow, getActiveRowIndex, msUntilReveal, REVEAL_FLIP_MS } from './board.js';
import { getMyEmoji, setMyEmoji, showEmojiModal, getMyPlayerId, setMyPlayerId } from './emoji.js';
import { sendEmoji, sendGuess, leaveLobbyRequest } from './api.js';
import { showMessage, shakeInput as shakeElement, closeDialog, openDialog, announce } from './utils.js';
import { loadHintState } from './hintState.js';
import { STATES } from './stateManager.js';
import { hapticFeedback } from './haptics.js';

// Import UI notification functions
import { showPointsDelta, showHintTooltip, burstConfetti, glowDailyDoubleTile } from './uiNotifications.js';
import { playJingle, playClick, stopAllSounds } from './audioManager.js';
import { selectHint, updateHintState, exitHintSelection, HINT_SAVED_MESSAGE } from './hintManager.js';

// Import the new modular managers
import domManager from './domManager.js';
import networkManager from './networkManager.js';
import gameStateManager from './gameStateManager.js';
import eventListenersManager from './eventListenersManager.js';
import appInitializer from './appInitializer.js';

// Global state variables
let skipAutoClose = false;
let myEmoji = getMyEmoji();
let myPlayerId = getMyPlayerId();
const controlsHelpText = 'Use arrow keys to choose a tile';
const supportsWebShare = typeof navigator !== 'undefined' && !!navigator.share;

// Function to update global myPlayerId (called by appInitializer during auto-reconnection)
export function updateGlobalPlayerId(newPlayerId) {
  myPlayerId = newPlayerId;
}

// Get lobby code from URL
const LOBBY_CODE = (() => {
  const m = window.location.pathname.match(/\/lobby\/([A-Za-z0-9]{6})/);
  return window.PRIVATE_ROOM?.room || (m ? m[1] : null);
})();
window.LOBBY_CODE = LOBBY_CODE;

// Initialize the application
async function initializeApp() {
  // Setup the submit guess handler BEFORE app initialization
  // so it's available during keyboard setup
  window.submitGuessHandler = submitGuessHandler;
  console.debug(controlsHelpText);

  // Initialize with all managers
  const success = await appInitializer.initialize({
    domManager,
    networkManager,
    gameStateManager,
    eventListenersManager
  });

  if (!success) {
    console.error('Failed to initialize application');
    return;
  }

  console.log('🚀 Application initialized successfully');
}

// Handle guess submission from the shared currentGuess state.
async function submitGuessHandler() {
  console.log('🎮 submitGuessHandler called');
  const gameState = gameStateManager.gameState;
  if (gameState?.is(STATES.GAME_OVER)) return;
  
  const guessInput = domManager.get('guessInput');
  const board = domManager.get('board');
  // The visible guess field shakes when it is in use; otherwise only the
  // row being typed shakes, leaving earlier guesses still.
  const shakeTarget = guessInput && !guessInput.hidden ? guessInput : board;
  const shakeInput = (target) => {
    if (target === board && shakeRow(board, getActiveRowIndex(board))) return;
    shakeElement(target);
  };
  
  const guess = gameStateManager.getCurrentGuess().trim().toLowerCase();
  
  if (guess.length !== 5) {
    hapticFeedback([20, 40, 20]);
    if (shakeTarget) shakeInput(shakeTarget);
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
    hapticFeedback([20, 40, 20]);
    if (shakeTarget) shakeInput(shakeTarget);
    return;
  }
  
  hapticFeedback(18);

  // Startup may have reclaimed or re-assigned our identity after this module
  // loaded. Always read the stored values so a first guess never registers a
  // second (variant) copy of our emoji.
  myEmoji = getMyEmoji() || myEmoji;
  myPlayerId = getMyPlayerId() || myPlayerId;

  if (!myPlayerId) {
    try {
      // Record the emoji registration attempt for grace period protection
      gameStateManager.recordEmojiRegistration();
      const d = await sendEmoji(myEmoji, null, LOBBY_CODE);
      if (d && d.player_id) {
        myPlayerId = d.player_id;
        setMyPlayerId(d.player_id);
        if (d.emoji) {
          myEmoji = d.emoji;
          setMyEmoji(d.emoji);
          gameStateManager.setMyEmoji(d.emoji);
        }
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
      // Record the emoji registration attempt for grace period protection
      gameStateManager.recordEmojiRegistration();
      // Keep our player ID so the server restores this player rather than
      // treating us as a newcomer and assigning a duplicate variant.
      const emojiResp = await sendEmoji(myEmoji, myPlayerId, LOBBY_CODE);
      if (emojiResp && emojiResp.status === 'ok') {
        // Update our local state with the corrected information
        if (emojiResp.player_id) {
          myPlayerId = emojiResp.player_id;
          setMyPlayerId(emojiResp.player_id);
        }
        if (emojiResp.emoji) {
          myEmoji = emojiResp.emoji;
          setMyEmoji(emojiResp.emoji);
          gameStateManager.setMyEmoji(emojiResp.emoji);
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
  
  // While the server is waking, keep the typed word so Enter sends it again.
  if (!resp.waking) gameStateManager.clearCurrentGuess();
  
  if (resp.status === 'ok') {
    gameStateManager.applyState(resp.state);
    // Results that reveal the outcome wait for the tiles to finish flipping.
    // Time it from the flip on screen, which a live update may have started.
    const board = domManager.get('board');
    const guessRow = resp.state.guesses.length - 1;
    const afterReveal = (callback, extra = 0) => setTimeout(callback, msUntilReveal(board, guessRow) + extra);
    
    if (resp.daily_double) {
      announceDailyDouble(resp, board, afterReveal);
    }
    
    if (typeof resp.pointsDelta === 'number') {
      const delta = resp.pointsDelta;
      afterReveal(() => showPointsDelta(delta));
    }
    
    if (resp.won) {
      const word = resp.state.target_word.toUpperCase();
      afterReveal(() => {
        hapticFeedback([20, 50, 30, 50, 40]);
        showMessage('You got it! The word was ' + word, {
          messageEl: domManager.get('messageEl'),
          messagePopup: domManager.get('messagePopup')
        });
        playJingle();
      });
    }
    
    if (resp.over && !resp.won) {
      const word = resp.state.target_word.toUpperCase();
      afterReveal(() => showMessage('Game Over! The word was ' + word, {
        messageEl: domManager.get('messageEl'),
        messagePopup: domManager.get('messagePopup')
      }));
    }
  } else {
    hapticFeedback([20, 40, 20]);
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
    if (shakeTarget && !resp.waking) shakeInput(shakeTarget);
  }
}

/**
 * Celebrate a Daily Double once its tile has flipped green, then explain how
 * to use the hint: tap a tile in the next row, or, when the guess also ended
 * the round, that the hint is saved for the next round.
 */
function announceDailyDouble(resp, board, afterReveal) {
  const messageHandlers = {
    messageEl: domManager.get('messageEl'),
    messagePopup: domManager.get('messagePopup')
  };
  const tile = resp.daily_double_tile;
  if (tile) {
    setTimeout(() => burstConfetti(tile.row, tile.col), msUntilReveal(board, tile.row, tile.col));
    // The ring follows once the tile has finished turning over.
    setTimeout(() => glowDailyDoubleTile(tile.row, tile.col),
      msUntilReveal(board, tile.row, tile.col) + REVEAL_FLIP_MS / 2);
  }

  const carried = resp.daily_double_carried ?? resp.over;
  if (carried) {
    // The win or game-over message comes first; this follows it.
    const text = `Daily Double! ${HINT_SAVED_MESSAGE}`;
    afterReveal(() => {
      showMessage(text, messageHandlers);
      announce(text);
    }, 2200);
    return;
  }

  afterReveal(() => {
    const row = gameStateManager.getDailyDoubleRow();
    if (row === null) return; // already spent, or another guess ended the round
    // One callout, pointing at the row to tap, rather than a separate banner
    // that would cover the top of the board on phones.
    showHintTooltip('🎉 Daily Double! Tap a tile in this row to reveal its letter.', row);
    announce('Daily Double earned – choose one tile in the next row to preview its letter.');
  });
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
        updateHintState(myEmoji, myPlayerId);
        
        networkManager.fetchState(myEmoji, LOBBY_CODE);
      },
      skipAutoCloseRef: { value: skipAutoClose },
      onError: (msg) => showMessage(msg, {
        messageEl: domManager.get('messageEl'),
        messagePopup: domManager.get('messagePopup')
      }),
      onEmojiRegistration: () => {
        // Record the emoji registration attempt for grace period protection
        gameStateManager.recordEmojiRegistration();
      }
    });
    showEmojiModalOnNextFetch = false;
  } else {
    // Close any existing modal if user already has an emoji
    closeDialog(document.getElementById('emojiModal'));
  }
}

function updateDefinitionPanel(state) {
  const definitionText = domManager.get('definitionText');
  if (!definitionText) return;
  
  if (state?.is_over && state?.definition) {
    definitionText.textContent = `${state.target_word?.toUpperCase() || ''} – ${state.definition}`;
  } else if (state?.last_word) {
    const def = state.last_definition || 'Definition not found.';
    definitionText.textContent = `${state.last_word.toUpperCase()} – ${def}`;
  } else {
    definitionText.textContent = '';
  }
}

// Enhanced applyState wrapper that includes emoji modal handling
function applyStateWithEmojiModal(state) {
  gameStateManager.applyState(state);
  updateDefinitionPanel(state);
  handleEmojiModal(state.active_emojis || []);
}

// Spend the hint on a column, unless that letter is already known.
async function chooseHintColumn(col) {
  if (gameStateManager.getGreenPositions()[col]) {
    showMessage('You already know that letter – pick another tile.', {
      messageEl: domManager.get('messageEl'),
      messagePopup: domManager.get('messagePopup')
    });
    return;
  }
  await selectHint(col);
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
    
    await chooseHintColumn(col);
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
      await chooseHintColumn(index);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      exitHintSelection({ announceCancel: true });
      gameStateManager.refreshHintBadge();
    }
  });
}

// Handle lobby leaving
function setupLobbyLeaving() {
  const leaveLobby = domManager.get('leaveLobby');
  if (leaveLobby && LOBBY_CODE) {
    leaveLobby.addEventListener('click', async () => {
      if (leaveLobby.disabled) return;
      leaveLobby.disabled = true;
      // Registration may have assigned an ID or emoji after this module loaded.
      myEmoji = getMyEmoji();
      myPlayerId = getMyPlayerId();
      // Immediately update URL to prevent refresh back into lobby before any async operations
      if (window.parent !== window) {
        // Clear the hash without showing the landing list before the request finishes.
        window.parent.history.replaceState(null, '', '/');
      } else {
        // Immediately update URL to prevent refresh back into lobby
        window.history.replaceState(null, '', '/');
      }
      
      // Only call the API if we have player info and are in a lobby
      if (window.PRIVATE_ROOM || (myEmoji && myPlayerId)) {
        try {
          await leaveLobbyRequest(LOBBY_CODE, myEmoji, myPlayerId);
        } catch (err) {
          console.error('Failed to leave lobby:', err);
          leaveLobby.disabled = false;
          showMessage('Could not leave the lobby. Please try again.', {
            messageEl: domManager.get('messageEl'),
            messagePopup: domManager.get('messagePopup')
          });
          return;
        }
      }
      
      // Clear stored lobby info when user explicitly leaves
      localStorage.removeItem('lastLobby');
      if (window.PRIVATE_ROOM) sessionStorage.removeItem('privateRoom');
      
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
