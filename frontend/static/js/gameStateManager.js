/**
 * Game State Manager - Centralized game state application and management
 * Extracts the complex applyState logic and related state management from main.js
 */

import { updateBoard, updateKeyboardFromGuesses, updateHardModeConstraints, getRevealDuration, getTileRevealMoment } from './board.js';
import { renderHistory } from './history.js';
import { renderChat } from './chat.js';
import { updateLeaderboard, renderPlayerSidebar, renderEmojiStamps } from './leaderboardManager.js';
import { updateHintBadge } from './hintBadge.js';
import { saveHintState } from './hintState.js';
import { showMessage, setGameInputDisabled } from './utils.js';
import { showChatNotify, showChatMessagePopup, moveHintTooltip, showHintTooltip } from './uiNotifications.js';
import { syncHintSelection } from './hintManager.js';
import { updateResetButton } from './resetManager.js';
import { renderResetVote } from './resetVote.js';
import { hasHistoryContent, hasDefinitionContent, updatePanelVisibility } from './panelManager.js';
import { OVERLAYS, isOverlayOpen } from './overlayState.js';
import { STATES } from './stateManager.js';
import { playClick } from './audioManager.js';
import { sendEmoji } from './api.js';
import { getMyPlayerId } from './emoji.js';

class GameStateManager {
  constructor() {
    // State tracking variables
    this.activeEmojis = [];
    this.prevActiveEmojis = [];
    this.leaderboard = [];
    this.prevLeaderboard = {};
    this.latestState = null;
    
    // Game configuration
    this.maxRows = 6;
    this.requiredLetters = new Set();
    this.greenPositions = {};
    this.currentGuess = '';
    
    // Daily double state
    this.dailyDoubleRow = null; // next open row a hint can be spent on, if any
    this.dailyDoubleHint = null; // the letter already revealed: { row, col, letter }
    this.dailyDoubleAvailable = false; // the server holds an unspent hint for us
    this._hintRowHiddenUntil = 0; // keep a fresh bonus secret until its tile flips
    this._hintRevealTimer = null;
    this._hintSaved = false; // holding a hint carried into the next round
    
    // Dependencies (to be injected)
    this.gameState = null;
    this.domManager = null;
    this.myEmoji = null;
    this.messageHandlers = { messageEl: null, messagePopup: null };
    
    // Race condition protection for server restart scenarios
    this.lastRemovalCheckTime = 0;
    this.removalCheckCooldown = 2000; // 2 seconds cooldown to avoid false positives
    this.lastGuessTime = 0; // Track when we last made a guess
    this.postGuessGracePeriod = 3000; // 3 seconds grace period after making a guess
    this.lastEmojiRegistrationTime = 0; // Track when we last registered an emoji
    this.postEmojiRegistrationGracePeriod = 3000; // 3 seconds grace period after emoji registration
  }

  /**
   * Initialize the game state manager
   * @param {Object} config - Configuration object
   */
  initialize(config) {
    this.gameState = config.gameState;
    this.domManager = config.domManager;
    this.myEmoji = config.myEmoji;
    this.messageHandlers = config.messageHandlers;
    
    // Optional callbacks for external operations
    this.onPlayerIdUpdate = config.onPlayerIdUpdate; // Callback to update player ID in external state
    this.onRefreshState = config.onRefreshState; // Callback to refresh state from server
    this.lobbyCode = config.lobbyCode; // Lobby code for API calls
    
    // Load saved daily double state
    if (config.dailyDoubleState) {
      this.dailyDoubleRow = config.dailyDoubleState.row;
      this.dailyDoubleHint = config.dailyDoubleState.hint;
    }
  }

  /**
   * Apply server state to the UI and update all related variables
   * @param {Object} state - Server state object
   */
  applyState(state) {
    // Error replies (rate limits, expired sessions) are not game states.
    if (!state || !Array.isArray(state.guesses)) return;
    const prevGuessCount = this.latestState ? this.latestState.guesses.length : 0;
    // Initial chat history belongs in the panel; previews announce only new messages.
    const prevChatCount = this.latestState?.chat_messages?.length ?? state.chat_messages?.length ?? 0;
    
    // Update state tracking
    this.latestState = state;
    this.prevActiveEmojis = this.activeEmojis.slice();
    this.prevLeaderboard = Object.fromEntries(this.leaderboard.map(e => [e.emoji, e.score]));
    this.activeEmojis = state.active_emojis || [];
    this.leaderboard = state.leaderboard || [];
    
    const wasAvailable = this.dailyDoubleAvailable;
    // Handle daily double availability - check both old format (player-specific) and new format (all players)
    if ('daily_double_available' in state) {
      // Player-specific response (from /state endpoint with emoji parameter)
      this.dailyDoubleAvailable = !!state.daily_double_available;
    } else if (state.daily_double_status && this.myEmoji) {
      // Broadcast response (from SSE) - check status for our emoji
      this.dailyDoubleAvailable = !!state.daily_double_status[this.myEmoji];
    } else {
      // Fallback - assume false if no information available
      this.dailyDoubleAvailable = false;
    }
    
    // Handle daily double state
    this._handleDailyDoubleState(state, prevGuessCount, wasAvailable);
    
    // Check if player was removed
    this._checkPlayerRemoval();
    
    // Render UI components
    updateLeaderboard(this.leaderboard);
    renderPlayerSidebar();
    
    // Update hint badge
    this._updateHintBadge();
    
    // Handle chat updates
    this._handleChatUpdates(state, prevChatCount);
    
    // Handle history updates
    this._handleHistoryUpdates(state);
    
    // Update board and game state
    this._updateBoardAndGameState(state, prevGuessCount);
    
    // Handle definition updates
    this._handleDefinitionUpdates(state);
    
    // Update panels
    updatePanelVisibility();
  }

  /**
   * Handle daily double state logic
   * @private
   */
  _handleDailyDoubleState(state, prevGuessCount = 0, wasAvailable = false) {
    const guessCount = state.guesses ? state.guesses.length : 0;
    const maxRows = state.max_rows || this.maxRows || 6;

    // An unspent hint targets the next open row while the round is in play.
    // When the round is over it is saved for the next one, with no row yet.
    this.dailyDoubleRow = this.dailyDoubleAvailable && !state.is_over && guessCount < maxRows
      ? guessCount
      : null;

    // The revealed letter comes from our own state; live updates only say
    // whether we still hold one, never the letter itself.
    if ('daily_double_hint' in state) {
      this.dailyDoubleHint = state.daily_double_hint || null;
    } else if (Array.isArray(state.daily_double_hint_holders)) {
      if (!this.myEmoji || !state.daily_double_hint_holders.includes(this.myEmoji)) {
        this.dailyDoubleHint = null;
      }
    } else if (this.dailyDoubleHint && guessCount > this.dailyDoubleHint.row) {
      this.dailyDoubleHint = null; // older servers: the row has been played
    }
    if (state.is_over || guessCount < prevGuessCount) {
      this.dailyDoubleHint = null;
    }

    // A bonus just earned by a row that is still flipping stays hidden
    // until the tile shows its colour, so the highlight cannot spoil it.
    const freshlyEarned = this.dailyDoubleAvailable && !wasAvailable && guessCount > prevGuessCount;
    const revealMs = freshlyEarned ? getRevealDuration() : 0;
    if (revealMs) {
      this._hintRowHiddenUntil = Date.now() + revealMs;
      clearTimeout(this._hintRevealTimer);
      this._hintRevealTimer = setTimeout(() => {
        this.renderCurrentGuess();
        this._updateHintBadge();
      }, revealMs);
    }

    // A hint saved from the last round becomes usable when the next starts.
    const saved = this.dailyDoubleAvailable && this.dailyDoubleRow === null && !!state.is_over;
    if (this._hintSaved && this.dailyDoubleRow !== null) {
      showHintTooltip('Your saved 🔍 hint is ready – tap a tile in this row', this.dailyDoubleRow);
    }
    this._hintSaved = saved;

    saveHintState(this.myEmoji, this.dailyDoubleRow, this.dailyDoubleHint);
    syncHintSelection(this.dailyDoubleRow);
    moveHintTooltip(this.dailyDoubleRow);
  }

  /** The row to highlight for hint selection, once it may be shown. */
  _visibleHintRow() {
    return Date.now() < this._hintRowHiddenUntil ? null : this.dailyDoubleRow;
  }

  /** The revealed letter, drawn on whichever row is open for our next guess. */
  _hintForBoard(state) {
    if (!this.dailyDoubleHint || !state || state.is_over) return null;
    return { ...this.dailyDoubleHint, row: state.guesses.length };
  }

  /**
   * Check if current player was removed from lobby
   * @private
   */
  async _checkPlayerRemoval() {
    // Defensive check to avoid false positives during server restart scenarios
    if (!this.myEmoji || !this.prevActiveEmojis || !this.activeEmojis) {
      return;
    }
    
    const now = Date.now();
    const wasActive = this.prevActiveEmojis.includes(this.myEmoji);
    const isActive = this.activeEmojis.includes(this.myEmoji);
    
    // Don't check for removal if we recently made a guess or registered an emoji (grace period for auto-reconnection)
    if ((now - this.lastGuessTime) < this.postGuessGracePeriod) {
      console.log('🔧 Skipping removal check - within post-guess grace period');
      return;
    }
    
    if ((now - this.lastEmojiRegistrationTime) < this.postEmojiRegistrationGracePeriod) {
      console.log('🔧 Skipping removal check - within post-emoji-registration grace period');
      return;
    }
    
    // Only show removal message if all conditions are met:
    // 1. Player was previously active
    // 2. Player is no longer active
    // 3. Enough time has passed since last check (avoid race conditions)
    // 4. We have a substantial previous state (not initial load)
    if (wasActive && 
        !isActive && 
        (now - this.lastRemovalCheckTime) > this.removalCheckCooldown &&
        this.prevActiveEmojis.length > 0) {
      
      // Additional validation: check if this might be a temporary state during auto-reconnection
      // If the leaderboard still contains our emoji, this might be a race condition
      const stillInLeaderboard = this.leaderboard.some(entry => entry.emoji === this.myEmoji);
      
      if (stillInLeaderboard) {
        console.log('🔧 Player appears removed from active_emojis but still in leaderboard - attempting auto-reconnection');
        
        // Attempt to re-register the emoji with the server
        const reconnectionSuccessful = await this._attemptEmojiReconnection();
        if (reconnectionSuccessful) {
          // Don't show the removal message - reconnection was successful
          console.log('🔧 Auto-reconnection successful - player restored');
          return;
        }
        
        // If reconnection failed, fall through to show removal message
        console.log('🔧 Auto-reconnection failed - showing removal message');
      }
      
      console.log('🚪 Player confirmed removed from lobby');
      showMessage('You were removed from the lobby.', this.messageHandlers);
      this.lastRemovalCheckTime = now;
    }
  }
  
  /**
   * Record that a guess was just made (used for race condition protection)
   */
  recordGuessAttempt() {
    this.lastGuessTime = Date.now();
  }

  /**
   * Record that an emoji registration was just made (used for race condition protection)
   */
  recordEmojiRegistration() {
    this.lastEmojiRegistrationTime = Date.now();
  }

  /**
   * Normalize any guess-like value into the canonical in-progress guess state.
   * The visible desktop input mirrors this state, but the board and submission
   * flow read from here.
   * @param {string} value
   * @returns {string}
   */
  normalizeCurrentGuess(value) {
    return String(value || '').replace(/[^a-zA-Z]/g, '').toLowerCase().slice(0, 5);
  }

  /**
   * Set the in-progress guess and refresh dependent UI.
   * @param {string} value
   * @param {{render?: boolean}} [options]
   * @returns {string}
   */
  setCurrentGuess(value, options = {}) {
    const { render = true } = options;
    const nextGuess = this.normalizeCurrentGuess(value);
    const changed = nextGuess !== this.currentGuess;

    this.currentGuess = nextGuess;
    this._syncGuessInput();

    if (render && changed) {
      this.renderCurrentGuess();
    }

    return this.currentGuess;
  }

  /**
   * Append one letter to the in-progress guess.
   * @param {string} letter
   * @returns {string}
   */
  appendCurrentGuessLetter(letter) {
    if (this.currentGuess.length >= 5 || !/^[a-z]$/i.test(letter)) {
      return this.currentGuess;
    }

    return this.setCurrentGuess(this.currentGuess + letter);
  }

  /**
   * Remove the final letter from the in-progress guess.
   * @returns {string}
   */
  deleteCurrentGuessLetter() {
    return this.setCurrentGuess(this.currentGuess.slice(0, -1));
  }

  /**
   * Clear the in-progress guess.
   * @param {{render?: boolean}} [options]
   * @returns {string}
   */
  clearCurrentGuess(options = {}) {
    return this.setCurrentGuess('', options);
  }

  /**
   * Mirror the canonical guess state into the desktop input.
   * @private
   */
  _syncGuessInput() {
    const guessInput = this.domManager ? this.domManager.get('guessInput') : null;
    if (guessInput && guessInput.value !== this.currentGuess.toUpperCase()) {
      guessInput.value = this.currentGuess.toUpperCase();
    }
  }

  /**
   * Re-render the active board row from the canonical current guess.
   */
  renderCurrentGuess() {
    const board = this.domManager ? this.domManager.get('board') : null;
    const latestState = this.getLatestState();
    if (!board || !latestState) return;

    updateBoard(
      board,
      latestState,
      this.currentGuess,
      this.maxRows,
      this.gameState.is(STATES.GAME_OVER),
      -1,
      this._hintForBoard(latestState),
      this._visibleHintRow()
    );
  }

  /**
   * Attempt to re-register the player's emoji with the server for auto-reconnection
   * @private
   * @returns {Promise<boolean>} True if reconnection was successful, false otherwise
   */
  async _attemptEmojiReconnection() {
    if (!this.myEmoji || !this.lobbyCode) {
      console.warn('🔧 Cannot attempt reconnection - missing emoji or lobby code');
      return false;
    }

    try {
      console.log('🔧 Attempting to re-register emoji for auto-reconnection:', this.myEmoji);
      
      // Record the registration attempt before making the call to provide grace period
      this.recordEmojiRegistration();
      
      // Re-register under our existing player ID; a null ID would make the
      // server treat us as a newcomer and add a duplicate variant entry.
      const emojiResp = await sendEmoji(this.myEmoji, getMyPlayerId(), this.lobbyCode);
      
      if (emojiResp && emojiResp.status === 'ok') {
        console.log('🔧 Emoji re-registration successful:', emojiResp);
        
        // Update our local state with the corrected information
        if (emojiResp.player_id && this.onPlayerIdUpdate) {
          this.onPlayerIdUpdate(emojiResp.player_id);
        }
        
        // Refresh the state from the server to get updated active_emojis
        if (this.onRefreshState) {
          this.onRefreshState();
        }
        
        return true;
      } else {
        console.warn('🔧 Emoji re-registration failed:', emojiResp);
        return false;
      }
    } catch (error) {
      console.error('🔧 Error during emoji re-registration:', error);
      return false;
    }
  }

  /**
   * Update hint badge display
   * @private
   */
  _updateHintBadge() {
    const titleHintBadge = this.domManager ? this.domManager.get('titleHintBadge') : null;
    if (!titleHintBadge) return;
    
    const isSelecting = document.body.classList.contains('hint-selecting');
    const hidden = Date.now() < this._hintRowHiddenUntil;
    const saved = this.dailyDoubleAvailable && this.dailyDoubleRow === null;
    updateHintBadge(titleHintBadge, this.dailyDoubleAvailable && !hidden, isSelecting, saved);
  }

  /**
   * Handle chat message updates
   * @private
   */
  _handleChatUpdates(state, prevChatCount) {
    const chatMessagesEl = this.domManager ? this.domManager.get('chatMessagesEl') : null;
    if (!chatMessagesEl || !state.chat_messages) return;
    
    renderChat(chatMessagesEl, state.chat_messages);
    
    if (state.chat_messages.length > prevChatCount && 
        !isOverlayOpen(OVERLAYS.CHAT)) {
      showChatNotify();
      
      // Show popup with the latest message
      const latestMessage = state.chat_messages[state.chat_messages.length - 1];
      if (latestMessage) {
        showChatMessagePopup(latestMessage);
      }
    }
  }

  /**
   * Handle history updates
   * @private
   */
  _handleHistoryUpdates(state) {
    const historyList = this.domManager ? this.domManager.get('historyList') : null;
    if (!historyList) return;
    
    const historyEntries = [];
    if (state.past_games) {
      state.past_games.forEach(game => game.forEach(e => historyEntries.push(e)));
    }
    if (state.guesses) {
      historyEntries.push(...state.guesses);
    }
    renderHistory(historyList, historyEntries);
  }

  /**
   * Update board and game state
   * @private
   */
  _updateBoardAndGameState(state, prevGuessCount) {
    const board = this.domManager ? this.domManager.get('board') : null;
    const keyboard = this.domManager ? this.domManager.get('keyboard') : null;
    
    if (!board || !keyboard) return;
    
    this.maxRows = state.max_rows || 6;
    // Server snapshots are authoritative, including reloads and new rounds.
    this.gameState.set(state.is_over ? STATES.GAME_OVER : STATES.PLAYING);
    // Letters typed but never submitted belong to the round they were typed
    // in. Drop them when that round ends (or a new one starts without us
    // seeing the end), so they are not carried onto the next board.
    const roundRestarted = (state.guesses?.length ?? 0) < prevGuessCount;
    if (state.is_over || roundRestarted) {
      this.clearCurrentGuess({ render: false });
    }
    this._syncGuessInput();
    const animateRow = state.guesses && state.guesses.length > prevGuessCount ? 
                      state.guesses.length - 1 : -1;
    
    updateBoard(board, state, this.currentGuess, this.maxRows, 
               this.gameState.is(STATES.GAME_OVER), animateRow, 
               this._hintForBoard(state), this._visibleHintRow());
    
    // Click as each tile turns over, in step with the flip.
    const revealMs = animateRow >= 0 ? getRevealDuration() : 0;
    if (animateRow >= 0) {
      for (let i = 0; i < 5; i++) {
        setTimeout(playClick, getTileRevealMoment(i));
      }
    }
    
    renderEmojiStamps(state.guesses, revealMs ? { animateIndex: animateRow, delay: revealMs } : {});
    this._updateKeyboardAfterReveal(keyboard, state.guesses, revealMs);
    
    // Update hard mode constraints
    const constraints = updateHardModeConstraints(state.guesses);
    this.requiredLetters = constraints.requiredLetters;
    this.greenPositions = constraints.greenPositions;
    
    setGameInputDisabled(this.gameState.is(STATES.GAME_OVER));
    updateResetButton(state);
    renderResetVote(state);
  }

  /**
   * Colour the on-screen keyboard once the newest row has finished flipping,
   * so the keys never give away a result before the tiles do.
   * @private
   */
  _updateKeyboardAfterReveal(keyboard, guesses, revealMs) {
    const time = Date.now();
    if (revealMs) this._keyboardRevealUntil = time + revealMs;
    clearTimeout(this._keyboardRevealTimer);
    const wait = guesses.length ? Math.max(0, (this._keyboardRevealUntil || 0) - time) : 0;
    if (!wait) {
      updateKeyboardFromGuesses(keyboard, guesses);
      return;
    }
    this._keyboardRevealTimer = setTimeout(() => updateKeyboardFromGuesses(keyboard, guesses), wait);
  }

  /**
   * Handle definition text updates
   * @private
   */
  _handleDefinitionUpdates(state) {
    const definitionText = this.domManager ? this.domManager.get('definitionText') : null;
    if (!definitionText) return;
    
    if (state.is_over) {
      const def = state.definition || 'Definition not found.';
      definitionText.textContent = `${state.target_word.toUpperCase()} – ${def}`;
    } else if (state.last_word) {
      const def = state.last_definition || 'Definition not found.';
      definitionText.textContent = `${state.last_word.toUpperCase()} – ${def}`;
    } else {
      definitionText.textContent = '';
    }
  }

  // Getters for external access
  getLatestState() { return this.latestState; }
  getActiveEmojis() { return this.activeEmojis; }
  getLeaderboard() { return this.leaderboard; }
  getMaxRows() { return this.maxRows; }
  getRequiredLetters() { return this.requiredLetters; }
  getGreenPositions() { return this.greenPositions; }
  getCurrentGuess() { return this.currentGuess; }
  getDailyDoubleRow() { return this.dailyDoubleRow; }
  getDailyDoubleHint() { return this.dailyDoubleHint; }
  getDailyDoubleAvailable() { return this.dailyDoubleAvailable; }
  
  /** Redraw the 🔍 badge after selection mode changes. */
  refreshHintBadge() { this._updateHintBadge(); }

  // Setters for external modification
  setDailyDoubleState(row, hint) {
    this.dailyDoubleRow = row;
    this.dailyDoubleHint = hint;
  }
  
  setMyEmoji(emoji) {
    this.myEmoji = emoji;
  }
}

// Create and export singleton instance
const gameStateManager = new GameStateManager();
export default gameStateManager;
