/**
 * Game State Manager - Centralized game state application and management
 * Extracts the complex applyState logic and related state management from main.js
 */

import { updateBoard, updateKeyboardFromGuesses, updateHardModeConstraints } from './board.js';
import { renderHistory } from './history.js';
import { renderChat } from './chat.js';
import { updateLeaderboard, renderPlayerSidebar, renderEmojiStamps } from './leaderboardManager.js';
import { updateHintBadge } from './hintBadge.js';
import { saveHintState } from './hintState.js';
import { showMessage, setGameInputDisabled } from './utils.js';
import { showChatNotify, showChatMessagePopup } from './uiNotifications.js';
import { updateResetButton } from './resetManager.js';
import { hasHistoryContent, hasDefinitionContent, updatePanelVisibility } from './panelManager.js';
import { updateChatPanelPosition, positionSidePanels } from './utils.js';
import { STATES } from './stateManager.js';
import { playClick } from './audioManager.js';

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
    
    // Daily double state
    this.dailyDoubleRow = null;
    this.dailyDoubleHint = null;
    this.dailyDoubleAvailable = false;
    
    // Dependencies (to be injected)
    this.gameState = null;
    this.domManager = null;
    this.myEmoji = null;
    this.messageHandlers = { messageEl: null, messagePopup: null };
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
    const prevGuessCount = this.latestState ? this.latestState.guesses.length : 0;
    const prevChatCount = this.latestState && this.latestState.chat_messages ? this.latestState.chat_messages.length : 0;
    
    // Update state tracking
    this.latestState = state;
    this.prevActiveEmojis = this.activeEmojis.slice();
    this.prevLeaderboard = Object.fromEntries(this.leaderboard.map(e => [e.emoji, e.score]));
    this.activeEmojis = state.active_emojis || [];
    this.leaderboard = state.leaderboard || [];
    
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
    this._handleDailyDoubleState(state);
    
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
    updateChatPanelPosition();
    updatePanelVisibility();
  }

  /**
   * Handle daily double state logic
   * @private
   */
  _handleDailyDoubleState(state) {
    if (this.dailyDoubleAvailable && state.guesses.length === 0) {
      this.dailyDoubleRow = 0;
      this.dailyDoubleHint = null;
      saveHintState(this.myEmoji, this.dailyDoubleRow, this.dailyDoubleHint);
    } else if (!this.dailyDoubleAvailable && (this.dailyDoubleRow !== null || this.dailyDoubleHint !== null)) {
      // Clear hint state if server says no daily double available
      this.dailyDoubleRow = null;
      this.dailyDoubleHint = null;
      saveHintState(this.myEmoji, this.dailyDoubleRow, this.dailyDoubleHint);
    }
  }

  /**
   * Check if current player was removed from lobby
   * @private
   */
  _checkPlayerRemoval() {
    if (this.myEmoji && 
        this.prevActiveEmojis.includes(this.myEmoji) && 
        !this.activeEmojis.includes(this.myEmoji)) {
      showMessage('You were removed from the lobby.', this.messageHandlers);
    }
  }

  /**
   * Update hint badge display
   * @private
   */
  _updateHintBadge() {
    const titleHintBadge = this.domManager ? this.domManager.get('titleHintBadge') : null;
    if (!titleHintBadge) return;
    
    const hasUnusedHint = this.dailyDoubleRow !== null && this.dailyDoubleHint === null;
    const isSelecting = document.body.classList.contains('hint-selecting');
    updateHintBadge(titleHintBadge, this.dailyDoubleAvailable || hasUnusedHint, isSelecting);
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
        !document.body.classList.contains('chat-open')) {
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
    const guessInput = this.domManager ? this.domManager.get('guessInput') : null;
    const keyboard = this.domManager ? this.domManager.get('keyboard') : null;
    
    if (!board || !guessInput || !keyboard) return;
    
    this.maxRows = state.max_rows || 6;
    const animateRow = state.guesses && state.guesses.length > prevGuessCount ? 
                      state.guesses.length - 1 : -1;
    
    updateBoard(board, state, guessInput, this.maxRows, 
               this.gameState.is(STATES.GAME_OVER), animateRow, 
               this.dailyDoubleHint, this.dailyDoubleRow);
    
    // Handle daily double row progression
    this._handleDailyDoubleProgression(state);
    
    // Play click sounds for new guesses
    if (animateRow >= 0) {
      for (let i = 0; i < 5; i++) {
        setTimeout(playClick, i * 150);
      }
    }
    
    renderEmojiStamps(state.guesses);
    updateKeyboardFromGuesses(keyboard, state.guesses);
    
    // Update hard mode constraints
    const constraints = updateHardModeConstraints(state.guesses);
    this.requiredLetters = constraints.requiredLetters;
    this.greenPositions = constraints.greenPositions;
    
    // Update game over state
    const prevGameOver = this.gameState.is(STATES.GAME_OVER);
    if (state.is_over) {
      this.gameState.transition(STATES.GAME_OVER);
    } else if (this.gameState.is(STATES.GAME_OVER)) {
      this.gameState.transition(STATES.PLAYING);
    }
    
    setGameInputDisabled(this.gameState.is(STATES.GAME_OVER));
    updateResetButton();
  }

  /**
   * Handle daily double row progression
   * @private
   */
  _handleDailyDoubleProgression(state) {
    if (this.dailyDoubleRow !== null && state.guesses.length > this.dailyDoubleRow) {
      this.dailyDoubleRow = null;
      this.dailyDoubleHint = null;
      // hideHintTooltip(); // Would need to import this
      setGameInputDisabled(this.gameState.is(STATES.GAME_OVER));
      saveHintState(this.myEmoji, this.dailyDoubleRow, this.dailyDoubleHint);
    }
    
    if (this.dailyDoubleHint && state.guesses.length > this.dailyDoubleHint.row) {
      this.dailyDoubleHint = null;
      saveHintState(this.myEmoji, this.dailyDoubleRow, this.dailyDoubleHint);
    }
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
  getDailyDoubleRow() { return this.dailyDoubleRow; }
  getDailyDoubleHint() { return this.dailyDoubleHint; }
  getDailyDoubleAvailable() { return this.dailyDoubleAvailable; }
  
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