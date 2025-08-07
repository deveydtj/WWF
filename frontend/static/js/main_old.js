// Import core functionality
import { isValidHardModeGuess } from './board.js';
import { getMyEmoji, setMyEmoji, showEmojiModal, getMyPlayerId, setMyPlayerId } from './emoji.js';
import { sendEmoji, sendGuess, leaveLobbyRequest } from './api.js';
import { showMessage, shakeInput, closeDialog, openDialog } from './utils.js';
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
import appInitializer from './appInitializer.js';

// Import board scaling test utilities for debugging
import './boardScalingTests.js';

// Global state variables
let skipAutoClose = false;
let myEmoji = getMyEmoji();
let myPlayerId = getMyPlayerId();
let showEmojiModalOnNextFetch = false;

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
const gameTitle = document.getElementById('gameTitle');
if (gameTitle) gameTitle.textContent = GAME_NAME;
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
      waitingOverlay.classList.add('fade-out');
      waitingOverlay.addEventListener(
        'animationend',
        () => {
          waitingOverlay.style.display = 'none';
          waitingOverlay.classList.remove('fade-out');
        },
        { once: true }
      );
    }
  });
}
// Ensure the close-call popup starts hidden even if CSS hasn't loaded yet
closeCallPopup.style.display = 'none';
const chatNotify = document.getElementById('chatNotify');
const chatMessagePopup = document.getElementById('chatMessagePopup');
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

enableClickOffDismiss(closeCallPopup);
enableClickOffDismiss(infoPopup);
enableClickOffDismiss(shareModal);

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
    // Check if Web Share API is available
    if (navigator.share) {
      navigator.share({
        title: 'Join my WordSquad game',
        text: 'Come play WordSquad with me!',
        url: url
      }).catch(() => {
        // Fallback to custom modal if sharing fails
        shareLink.value = url;
        openDialog(shareModal);
        shareLink.focus();
        shareLink.select();
      });
    } else {
      // Fallback for browsers without Web Share API
      shareLink.value = url;
      openDialog(shareModal);
      shareLink.focus();
      shareLink.select();
    }
  });
}

if (shareCopy) {
  shareCopy.addEventListener('click', () => {
    if (!shareLink.value) {
      showMessage('No link to copy!', { messageEl, messagePopup });
      return;
    }
    navigator.clipboard.writeText(shareLink.value).then(() => {
      showMessage('Link copied!', { messageEl, messagePopup });
      announce('Lobby link copied');
    }).catch((err) => {
      console.error('Failed to copy:', err);
      showMessage('Failed to copy link. Try selecting and copying manually.', { messageEl, messagePopup });
    });
  });
}

if (shareClose) {
  shareClose.addEventListener('click', () => { closeDialog(shareModal); });
}

if (leaveLobby && LOBBY_CODE) {
  leaveLobby.addEventListener('click', async () => {
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
    
    // Close event source and redirect to home
    if (eventSource) {
      try { eventSource.close(); } catch {}
      eventSource = null;
    }
    stopAllSounds();
    
    // Check if we're in an iframe (lobby loaded within landing page)
    if (window.parent !== window) {
      // Clear the hash in the parent window to ensure proper navigation
      window.parent.location.hash = '';
      window.parent.location.href = '/';
    } else {
      // If not in iframe, navigate normally
      window.location.href = '/';
    }
  });
}

const FAST_INTERVAL = 2000;
const SLOW_INTERVAL = 15000;
const INACTIVE_DELAY = 60000; // 1 minute
let lastActivity = Date.now();
let pollTimer;
let currentInterval = FAST_INTERVAL;
let eventSource = null;



// Initial call
updateInputVisibility();





















// Apply the server state to the UI and update all related variables
function applyState(state) {
  const prevGuessCount = latestState ? latestState.guesses.length : 0;
  const prevChatCount = latestState && latestState.chat_messages ? latestState.chat_messages.length : 0;
  latestState = state;
  prevActiveEmojis = activeEmojis.slice();
  prevLeaderboard = Object.fromEntries(leaderboard.map(e => [e.emoji, e.score]));
  activeEmojis = state.active_emojis || [];
  leaderboard = state.leaderboard || [];
  dailyDoubleAvailable = !!state.daily_double_available;
  if (dailyDoubleAvailable && state.guesses.length === 0) {
    dailyDoubleRow = 0;
    dailyDoubleHint = null;
    saveHintState(myEmoji, dailyDoubleRow, dailyDoubleHint);
  } else if (!dailyDoubleAvailable && (dailyDoubleRow !== null || dailyDoubleHint !== null)) {
    // Clear hint state if server says no daily double available
    // This handles cases where user switches lobbies and has stale localStorage state
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
    if (state.phase === 'waiting' && !waitingOverlayDismissed) {
      waitingOverlay.classList.remove('fade-out');
      waitingOverlay.style.display = 'flex';
    } else if (!waitingOverlay.classList.contains('fade-out')) {
      waitingOverlay.style.display = 'none';
    }
  }
  renderLeaderboard();
  renderPlayerSidebar();
  // Show hint badge when server indicates available OR when we have an unused hint from localStorage
  const hasUnusedHint = dailyDoubleRow !== null && dailyDoubleHint === null;
  const isSelecting = document.body.classList.contains('hint-selecting');
  updateHintBadge(titleHintBadge, dailyDoubleAvailable || hasUnusedHint, isSelecting);

  if (state.chat_messages) {
    renderChat(chatMessagesEl, state.chat_messages);
    if (state.chat_messages.length > prevChatCount && !document.body.classList.contains('chat-open')) {
      showChatNotify();
      // Show popup with the latest message
      const latestMessage = state.chat_messages[state.chat_messages.length - 1];
      if (latestMessage) {
        showChatMessagePopup(latestMessage);
      }
    }
  }

  const historyEntries = [];
  if (state.past_games) {
    state.past_games.forEach(game => game.forEach(e => historyEntries.push(e)));
  }
  if (state.guesses) {
    historyEntries.push(...state.guesses);
  }
  renderHistory(historyList, historyEntries);
  
  // Update panel visibility after rendering history
  updatePanelVisibility();

  maxRows = state.max_rows || 6;
  const animateRow = state.guesses && state.guesses.length > prevGuessCount ? state.guesses.length - 1 : -1;
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
  setGameInputDisabled(gameState.is(STATES.GAME_OVER));
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
  
  // Update chat panel position after definition content changes
  updateChatPanelPosition();
  
  // Update panel visibility after definition content changes
  updatePanelVisibility();

  const justEnded = !prevGameOver && state.is_over;

  const haveMy = activeEmojis.includes(myEmoji);
  if (!myEmoji || !haveMy || showEmojiModalOnNextFetch) {
    showEmojiModal(activeEmojis, {
      onChosen: e => { myEmoji = e; myPlayerId = getMyPlayerId(); ({ row: dailyDoubleRow, hint: dailyDoubleHint } = loadHintState(myEmoji)); updateHintState(myEmoji, myPlayerId); fetchState(); },
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
        // Don't disable input - allow players to continue guessing while having Daily Double
        // setGameInputDisabled(true);
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
      updateChatPanelPosition(); // Update chat panel position after definition changes
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

function handleServerUpdateNotification(data) {
  const { message, delay_seconds } = data;
  
  // Log the server update notification
  console.log('Server update notification received:', data);
  
  // Show the server update message to the user
  try {
    showMessage(message, { messageEl, messagePopup });
    announce(message);
    console.log('Server update message displayed:', message);
  } catch (error) {
    console.error('Error displaying server update message:', error);
    // Fallback: use alert if showMessage fails
    alert(message);
  }
  
  // Close event source to prevent additional messages
  if (eventSource) {
    try { 
      eventSource.close(); 
      console.log('EventSource closed');
    } catch (error) {
      console.error('Error closing EventSource:', error);
    }
    eventSource = null;
  }
  
  // Set a timeout to refresh the page after the specified delay
  const refreshDelayMs = (delay_seconds || 5) * 1000;
  console.log(`Scheduling page refresh in ${refreshDelayMs}ms`);
  
  const refreshTimeout = setTimeout(() => {
    console.log('About to refresh page...');
    
    // Show a final message before refresh
    try {
      showMessage('Refreshing page...', { messageEl, messagePopup });
    } catch (error) {
      console.error('Error showing refresh message:', error);
    }
    
    // Small delay to let the user see the message, then refresh
    setTimeout(() => {
      console.log('Executing page refresh');
      try {
        window.location.reload();
      } catch (error) {
        console.error('Error refreshing page:', error);
        // Fallback: redirect to current URL
        window.location.href = window.location.href;
      }
    }, 1000);
  }, refreshDelayMs);
  
  console.log('Refresh timeout set with ID:', refreshTimeout);
}

function initEventStream() {
  eventSource = subscribeToUpdates((data) => {
    // Check if this is a server update notification
    if (data.type === 'server_update') {
      handleServerUpdateNotification(data);
      return;
    }
    
    // Normal game state update
    applyState(data);
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

// Check if history panel has content to display


setupTypingListeners({
  keyboardEl: keyboard,
  guessInput,
  submitButton,
  submitGuessHandler,
  updateBoardFromTyping: () => updateBoardFromTyping(board, latestState, guessInput, maxRows, gameState.is(STATES.GAME_OVER), dailyDoubleHint, dailyDoubleRow),
  isAnimating: () => false
});



historyClose.addEventListener('click', () => {
  setManualPanelToggle('history', false);
  document.body.classList.remove('history-open');
  positionSidePanels(boardArea, historyBox, definitionBoxEl, chatBox);
});
definitionClose.addEventListener('click', () => {
  setManualPanelToggle('definition', false);
  document.body.classList.remove('definition-open');
  positionSidePanels(boardArea, historyBox, definitionBoxEl, chatBox);
  updateChatPanelPosition(); // Update chat panel position when definition panel is closed
});
// chatClose event handler is now defined above in the chat input focus management section
chatNotify.addEventListener('click', () => {
  setManualPanelToggle('chat', !document.body.classList.contains('chat-open'));
  togglePanel('chat-open');
  hideChatNotify();
  if (document.body.classList.contains('chat-open')) {
    // Use a more robust focusing approach for chat
    setTimeout(() => {
      const chatInput = document.getElementById('chatInput');
      if (chatInput) {
        chatInput.focus();
        console.log('Chat input focused via setTimeout');
      }
    }, 100);
  }
});


optionsToggle.addEventListener('click', () => {
  // Check if options menu is already open
  if (optionsMenu.style.display === 'flex' || optionsMenu.style.display === 'block') {
    // Close the menu if it's already open
    closeOptionsMenu();
    return;
  }
  
  // Check if we're in medium mode and should center the menu
  const currentMode = document.body.dataset.mode;
  if (currentMode === 'medium') {
    // In medium mode, center the options menu on screen
    optionsMenu.style.display = 'flex';
    optionsMenu.style.position = 'fixed';
    optionsMenu.style.top = '50%';
    optionsMenu.style.left = '50%';
    optionsMenu.style.transform = 'translate(-50%, -50%)';
    optionsMenu.style.zIndex = '80'; // Ensure it's above other elements
  } else {
    // Use enhanced positioning for options menu in other modes
    optionsMenu.style.display = 'block';
    positionContextMenu(optionsMenu, optionsToggle);
  }
  
  openDialog(optionsMenu);
});
optionsClose.addEventListener('click', () => { closeOptionsMenu(); });
menuHistory.addEventListener('click', () => { toggleHistory(); closeOptionsMenu(); });
menuDefinition.addEventListener('click', () => { toggleDefinition(); closeOptionsMenu(); });
menuChat.addEventListener('click', () => {
  setManualPanelToggle('chat', !document.body.classList.contains('chat-open'));
  togglePanel('chat-open');
  hideChatNotify();
  if (document.body.classList.contains('chat-open')) {
    // Use a more robust focusing approach for chat
    setTimeout(() => {
      const chatInput = document.getElementById('chatInput');
      if (chatInput) {
        chatInput.focus();
        console.log('Chat input focused via menu setTimeout');
      }
    }, 100);
  }
  closeOptionsMenu();
});
menuInfo.addEventListener('click', () => { showInfo(); closeOptionsMenu(); });
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
menuSound.textContent = isSoundEnabled() ? '🔊 Sound On' : '🔈 Sound Off';
applyLayoutMode();
createBoard(board, maxRows);

// Initialize the extracted modules
initResetManager({
  gameState,
  fetchState,
  LOBBY_CODE,
  HOST_TOKEN,
  board,
  messageEl,
  messagePopup
});

initHintManager({
  board,
  gameState,
  fetchState,
  myEmoji,
  myPlayerId,
  LOBBY_CODE,
  messageEl,
  messagePopup,
  getDailyDoubleState: () => ({ dailyDoubleRow, dailyDoubleHint }),
  setDailyDoubleState: (row, hint) => { dailyDoubleRow = row; dailyDoubleHint = hint; },
  updateHintBadge,
  titleHintBadge
});

// Initialize and use enhanced scaling system
const enhancedScaling = initializeEnhancedScaling();
const scalingResult = enhancedScaling.applyOptimalScaling(maxRows);

if (!scalingResult.success) {
  console.warn('Enhanced scaling failed, using fallback:', scalingResult.error);
  // Fallback to original method if enhanced scaling fails
  const fallbackResult = applyOptimalScaling(maxRows);
  if (!fallbackResult) {
    fitBoardToContainer(maxRows);
  }
} else {
  console.log('✅ Enhanced scaling applied successfully');
}

// Verify all elements fit and log any issues
const verification = verifyElementsFitInViewport(maxRows);
if (!verification.success) {
  console.warn('Board scaling verification failed:', verification);
  if (verification.recommendations?.length > 0) {
    console.info('Scaling recommendations:', verification.recommendations);
  }
}

repositionResetButton();
positionSidePanels(boardArea, historyBox, definitionBoxEl, chatBox);
renderEmojiStamps([]);
if (myEmoji) {
  // Reclaim previously selected emoji on reload
  sendEmoji(myEmoji, myPlayerId, LOBBY_CODE).then((d) => {
    if (d.player_id) { myPlayerId = d.player_id; setMyPlayerId(d.player_id); }
  }).catch(() => {});
}
if (window.innerWidth > 1550) {
  // Only show panels if they have content to display
  updatePanelVisibility();
}
fetchState();

initEventStream();
setInterval(checkInactivity, 5000);
document.addEventListener('keydown', (e) => {
  // Don't trigger activity on keystrokes in chat input
  if (e.target && e.target.id === 'chatInput') {
    return;
  }
  onActivity();
});
document.addEventListener('click', (e) => {
  // Don't trigger activity on clicks within chat elements to prevent focus stealing
  const chatElement = e.target.closest('#chatBox, #chatInput, #chatSend, #chatMessages, #chatForm');
  if (chatElement) {
    console.log('Preventing onActivity for chat element:', e.target, chatElement);
    
    // If clicking specifically on the chat input, ensure it gets and keeps focus
    if (e.target.id === 'chatInput' || e.target.closest('#chatInput')) {
      setTimeout(() => {
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
          chatInput.focus();
        }
      }, 50);
    }
    return;
  }
  onActivity();
});
window.addEventListener('resize', () => {
  repositionResetButton();
  updatePanelVisibility(); // This will handle positioning based on content
  updateChatPanelPosition(); // Update chat panel position on window resize
  applyLayoutMode();
  updateInputVisibility(); // Update input visibility based on current viewport
  
  // Use enhanced scaling system on resize
  if (window.enhancedScaling) {
    const scalingResult = window.enhancedScaling.applyOptimalScaling(maxRows);
    if (!scalingResult.success) {
      console.warn('Enhanced scaling failed on resize, using fallback');
      const fallbackResult = applyOptimalScaling(maxRows);
      if (!fallbackResult) {
        fitBoardToContainer(maxRows);
      }
    }
  } else {
    // Fallback if enhanced scaling not available
    const scalingSuccess = applyOptimalScaling(maxRows);
    if (!scalingSuccess) {
      fitBoardToContainer(maxRows);
    }
  }
  
  adjustKeyboardForViewport();
  setupMobileLeaderboard(); // Handle mobile leaderboard layout on resize
  if (latestState) renderEmojiStamps(latestState.guesses);
  
  // Ensure keyboard visibility after all adjustments
  setTimeout(() => ensureKeyboardVisibility(), 100);
});
updateVH();
window.addEventListener('resize', updateVH);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    updateVH();
    adjustKeyboardForViewport();
    // Ensure keyboard stays visible when visual viewport changes
    setTimeout(() => ensureKeyboardVisibility(), 50);
    // Double check that input field is not covered by digital keyboard
    setTimeout(() => ensureInputFieldVisibility(), 100);
  });
}
window.addEventListener('orientationchange', () => {
  updateVH();
  positionSidePanels(boardArea, historyBox, definitionBoxEl, chatBox);
  applyLayoutMode();
  updateInputVisibility(); // Update input visibility on orientation change
  
  // Use enhanced scaling system on orientation change
  if (window.enhancedScaling) {
    // Enhanced scaling handles orientation changes automatically
    const scalingResult = window.enhancedScaling.applyOptimalScaling(maxRows);
    if (!scalingResult.success) {
      console.warn('Enhanced scaling failed on orientation change, using fallback');
      const fallbackResult = applyOptimalScaling(maxRows);
      if (!fallbackResult) {
        fitBoardToContainer(maxRows);
      }
    }
  } else {
    // Fallback if enhanced scaling not available
    const scalingSuccess = applyOptimalScaling(maxRows);
    if (!scalingSuccess) {
      fitBoardToContainer(maxRows);
    }
  }
  
  adjustKeyboardForViewport();
  setupMobileLeaderboard(); // Handle mobile leaderboard layout on orientation change
  if (latestState) renderEmojiStamps(latestState.guesses);
  
  // Ensure keyboard visibility after orientation change
  setTimeout(() => ensureKeyboardVisibility(), 200);
  // Double check that input field is not covered by digital keyboard
  setTimeout(() => ensureInputFieldVisibility(), 250);
});

// Add a timeout for orientation change to handle delayed layout updates
let orientationTimeout;
window.addEventListener('orientationchange', () => {
  clearTimeout(orientationTimeout);
  orientationTimeout = setTimeout(() => {
    updateVH();
    updateInputVisibility(); // Update input visibility on delayed orientation change
    
    // Use enhanced scaling system on delayed orientation change
    if (window.enhancedScaling) {
      const scalingResult = window.enhancedScaling.applyOptimalScaling(maxRows);
      if (!scalingResult.success) {
        console.warn('Enhanced scaling failed on delayed orientation change, using fallback');
        const fallbackResult = applyOptimalScaling(maxRows);
        if (!fallbackResult) {
          fitBoardToContainer(maxRows);
        }
      }
    } else {
      // Fallback if enhanced scaling not available
      const scalingSuccess = applyOptimalScaling(maxRows);
      if (!scalingSuccess) {
        fitBoardToContainer(maxRows);
      }
    }
    
    adjustKeyboardForViewport();
    setupMobileLeaderboard(); // Handle mobile leaderboard layout on delayed orientation change
    
    // Final keyboard visibility check after all delayed adjustments
    ensureKeyboardVisibility();
    // Final check for input field visibility
    ensureInputFieldVisibility();
  }, 300);
});



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
    // Update badge to show normal state
    const hasUnusedHint = dailyDoubleRow !== null && dailyDoubleHint === null;
    updateHintBadge(titleHintBadge, dailyDoubleAvailable || hasUnusedHint, false);
  }
});

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  
  // Spam control: Check cooldown
  const now = Date.now();
  if (now - lastChatTime < CHAT_COOLDOWN_MS) {
    shakeInput(chatInput);
    showMessage(`Please wait ${Math.ceil((CHAT_COOLDOWN_MS - (now - lastChatTime)) / 1000)} second(s) before sending another message.`, { messageEl, messagePopup });
    return;
  }
  
  // Check message length
  if (text.length > MAX_CHAT_LENGTH) {
    shakeInput(chatInput);
    showMessage(`Message too long. Maximum ${MAX_CHAT_LENGTH} characters allowed.`, { messageEl, messagePopup });
    return;
  }
  
  lastChatTime = now;
  chatInput.value = '';
  await sendChatMessage(text, myEmoji, myPlayerId, LOBBY_CODE);
  fetchState();
});

// Add specific focus management for chat input
let chatInputFocusProtection = false;
let userIntentionallyLeftChat = false;

chatInput.addEventListener('click', (e) => {
  e.stopPropagation(); // Prevent bubbling to document click handler
  chatInputFocusProtection = true;
  userIntentionallyLeftChat = false; // Reset when user clicks on chat input
  setTimeout(() => {
    chatInput.focus();
    console.log('Chat input refocused after click');
  }, 50);
});

chatInput.addEventListener('focus', () => {
  console.log('Chat input received focus');
  chatInputFocusProtection = true;
  userIntentionallyLeftChat = false; // Reset when chat input gets focus
});

chatInput.addEventListener('blur', (e) => {
  console.log('Chat input lost focus to:', e.relatedTarget);
  
  // Only reclaim focus if:
  // 1. Protection is active
  // 2. Chat is open
  // 3. User didn't intentionally leave (ESC or click on game input)
  // 4. Focus didn't go to game input or related game elements
  if (chatInputFocusProtection && 
      document.body.classList.contains('chat-open') && 
      !userIntentionallyLeftChat) {
    
    const relatedTarget = e.relatedTarget;
    const isGameElement = relatedTarget && (
      relatedTarget.id === 'guessInput' ||
      relatedTarget.closest('#board') ||
      relatedTarget.closest('#keyboard') ||
      relatedTarget.closest('#submitGuess')
    );
    
    // Don't reclaim focus if user clicked on a game element
    if (!isGameElement) {
      setTimeout(() => {
        if (document.body.classList.contains('chat-open') && 
            document.activeElement !== chatInput && 
            !userIntentionallyLeftChat) {
          console.log('Reclaiming focus for chat input');
          chatInput.focus();
        }
      }, 50);
    }
  }
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // User pressed ESC - they want to leave chat input
    e.preventDefault();
    userIntentionallyLeftChat = true;
    chatInputFocusProtection = false;
    guessInput.focus(); // Transfer focus to game input
    console.log('User pressed ESC in chat - transferring focus to game input');
  } else {
    // Reset protection flag when user starts typing
    chatInputFocusProtection = true;
    userIntentionallyLeftChat = false;
  }
});

// Prevent the global document click handler from stealing focus during chat interaction
chatBox.addEventListener('click', (e) => {
  e.stopPropagation();
});

// Stop protection when chat is closed
chatClose.addEventListener('click', () => {
  chatInputFocusProtection = false;
  userIntentionallyLeftChat = false;
  setManualPanelToggle('chat', false);
  document.body.classList.remove('chat-open');
  positionSidePanels(boardArea, historyBox, definitionBoxEl, chatBox);
});

// Allow users to intentionally transfer focus to game input by clicking on it
guessInput.addEventListener('click', () => {
  if (document.body.classList.contains('chat-open')) {
    userIntentionallyLeftChat = true;
    chatInputFocusProtection = false;
    console.log('User clicked on game input - disabling chat focus protection');
  }
});

// Also handle focus events on game input in case it gets focus through other means
guessInput.addEventListener('focus', () => {
  if (document.body.classList.contains('chat-open')) {
    userIntentionallyLeftChat = true;
    chatInputFocusProtection = false;
    console.log('Game input received focus - disabling chat focus protection');
  }
});

window.addEventListener('beforeunload', () => {
  if (eventSource) {
    try { eventSource.close(); } catch {}
    eventSource = null;
  }
  stopAllSounds();
});
