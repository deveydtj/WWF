/**
 * App Initializer - Centralized application initialization and setup
 * Extracts the initialization sequence from main.js for better organization
 */

import { createBoard } from './board.js';
import { getMyEmoji, setMyEmoji, showEmojiModal, getMyPlayerId, setMyPlayerId } from './emoji.js';
import { sendEmoji } from './api.js';
import { loadHintState } from './hintState.js';
import { GAME_NAME } from './config.js';
import { StateManager, STATES } from './stateManager.js';
import { initAudio, stopAllSounds, isSoundEnabled } from './audioManager.js';
import { setupMobileLeaderboard, setupLeaderboardScrolling, renderEmojiStamps } from './leaderboardManager.js';
import { initResetManager } from './resetManager.js';
import { updatePanelVisibility } from './panelManager.js';
import { initHintManager, updateHintState } from './hintManager.js';
import { initializeEnhancedScaling } from './enhancedScaling.js';
import { 
  applyDarkModePreference, 
  repositionResetButton,
  positionSidePanels, 
  updateChatPanelPosition,
  updateVH,
  applyLayoutMode, 
  fitBoardToContainer,
  applyOptimalScaling,
  verifyElementsFitInViewport,
  adjustKeyboardForViewport,
  ensureKeyboardVisibility,
  ensureInputFieldVisibility,
  enableClickOffDismiss
} from './utils.js';

// Expose repositionResetButton to global scope for debugging and manual calls
window.repositionResetButton = repositionResetButton;
import { updateInputVisibility } from './uiNotifications.js';
import { updateHintBadge } from './hintBadge.js';
import { setupTypingListeners, updateBoardFromTyping } from './keyboard.js';

class AppInitializer {
  constructor() {
    this.gameState = null;
    this.domManager = null;
    this.networkManager = null;
    this.gameStateManager = null;
    this.eventListenersManager = null;
    this.mobileMenuManager = null;
    
    // App state
    this.myEmoji = null;
    this.myPlayerId = null;
    this.lobbyCode = null;
    this.maxRows = 6;
    this.dailyDoubleRow = null;
    this.dailyDoubleHint = null;
    
    // Configuration
    this.HOST_TOKEN = localStorage.getItem('hostToken');
  }

  /**
   * Initialize the application with required managers
   * @param {Object} managers - Manager instances
   */
  initialize(managers) {
    this.domManager = managers.domManager;
    this.networkManager = managers.networkManager;
    this.gameStateManager = managers.gameStateManager;
    this.eventListenersManager = managers.eventListenersManager;
    this.mobileMenuManager = managers.mobileMenuManager;
    
    // Initialize game state
    this.gameState = new StateManager();
    
    // Extract lobby code from URL
    this.lobbyCode = this._extractLobbyCode();
    window.LOBBY_CODE = this.lobbyCode;
    
    // Get player information
    this.myEmoji = getMyEmoji();
    this.myPlayerId = getMyPlayerId();
    
    // Load saved hint state
    ({ row: this.dailyDoubleRow, hint: this.dailyDoubleHint } = loadHintState(this.myEmoji));
    
    return this._initializeApp();
  }

  /**
   * Main application initialization sequence
   * @private
   */
  async _initializeApp() {
    try {
      // 1. Initialize basic UI elements
      this._initializeBasicUI();
      
      // 2. Setup audio system
      initAudio();
      
      // 3. Apply user preferences
      this._applyUserPreferences();
      
      // 4. Initialize managers
      this._initializeManagers();
      
      // 5. Setup keyboard and input handling
      this._setupKeyboardHandling();
      
      // 6. Initialize board and scaling
      this._initializeBoardAndScaling();
      
      // 7. Setup event listeners
      this._setupEventListeners();
      
      // 8. Setup window event handlers
      this._setupWindowEvents();
      
      // 9. Initialize panels and layout
      this._initializePanelsAndLayout();
      
      // 11. Initialize network and game state
      await this._initializeNetworkAndGameState();
      
      console.log('✅ App initialization complete');
      return true;
      
    } catch (error) {
      console.error('❌ App initialization failed:', error);
      return false;
    }
  }

  /**
   * Extract lobby code from URL
   * @private
   */
  _extractLobbyCode() {
    const match = window.location.pathname.match(/\/lobby\/([A-Za-z0-9]{6})/);
    return match ? match[1] : null;
  }

  /**
   * Update game title based on screen size and lobby code
   * @private
   */
  _updateGameTitle() {
    const isMobile = window.innerWidth <= 600;
    let title = GAME_NAME;
    
    // On mobile, include lobby code in the title if available
    if (isMobile && this.lobbyCode) {
      title = `${GAME_NAME} - ${this.lobbyCode}`;
    }
    
    this.domManager.setGameTitle(title);
  }

  /**
   * Initialize basic UI elements
   * @private
   */
  _initializeBasicUI() {
    // Set game title based on screen size
    this._updateGameTitle();
    
    // Setup lobby header
    if (this.lobbyCode) {
      this.domManager.setLobbyCode(this.lobbyCode);
    } else {
      this.domManager.hideLobbyHeader();
    }
    
    // Hide close call popup initially
    this.domManager.hideCloseCallPopup();
    
    // Enable click-off dismiss for modals
    const closeCallPopup = this.domManager.get('closeCallPopup');
    const infoPopup = this.domManager.get('infoPopup');
    const shareModal = this.domManager.get('shareModal');
    
    if (closeCallPopup) enableClickOffDismiss(closeCallPopup);
    if (infoPopup) enableClickOffDismiss(infoPopup);
    if (shareModal) enableClickOffDismiss(shareModal);
  }

  /**
   * Apply user preferences
   * @private
   */
  _applyUserPreferences() {
    const menuDarkMode = this.domManager.get('menuDarkMode');
    const menuSound = this.domManager.get('menuSound');
    
    if (menuDarkMode) {
      applyDarkModePreference(menuDarkMode);
    }
    
    if (menuSound) {
      menuSound.textContent = isSoundEnabled() ? '🔊 Sound On' : '🔈 Sound Off';
    }
    
    applyLayoutMode();
  }

  /**
   * Initialize all manager instances
   * @private
   */
  _initializeManagers() {
    const messageHandlers = {
      messageEl: this.domManager.get('messageEl'),
      messagePopup: this.domManager.get('messagePopup')
    };

    // Initialize network manager
    this.networkManager.initialize({
      onStateUpdate: (state) => this.gameStateManager.applyState(state),
      onServerUpdate: (data) => this.networkManager.handleServerUpdateNotification(data),
      messageHandlers
    });

    // Initialize game state manager
    this.gameStateManager.initialize({
      gameState: this.gameState,
      domManager: this.domManager,
      myEmoji: this.myEmoji,
      messageHandlers,
      dailyDoubleState: {
        row: this.dailyDoubleRow,
        hint: this.dailyDoubleHint
      }
    });

    // Initialize event listeners manager
    this.eventListenersManager.initialize({
      domManager: this.domManager,
      networkManager: this.networkManager,
      gameStateManager: this.gameStateManager,
      lobbyCode: this.lobbyCode,
      myEmoji: this.myEmoji,
      myPlayerId: this.myPlayerId,
      messageHandlers
    });

    // Initialize reset manager
    initResetManager({
      gameState: this.gameState,
      fetchState: () => this.networkManager.fetchState(this.myEmoji, this.lobbyCode),
      LOBBY_CODE: this.lobbyCode,
      HOST_TOKEN: this.HOST_TOKEN,
      board: this.domManager.get('board'),
      messageEl: this.domManager.get('messageEl'),
      messagePopup: this.domManager.get('messagePopup')
    });

    // Initialize hint manager
    initHintManager({
      board: this.domManager.get('board'),
      gameState: this.gameState,
      fetchState: () => this.networkManager.fetchState(this.myEmoji, this.lobbyCode),
      myEmoji: this.myEmoji,
      myPlayerId: this.myPlayerId,
      LOBBY_CODE: this.lobbyCode,
      messageEl: this.domManager.get('messageEl'),
      messagePopup: this.domManager.get('messagePopup'),
      getDailyDoubleState: () => ({
        dailyDoubleRow: this.gameStateManager.getDailyDoubleRow(),
        dailyDoubleHint: this.gameStateManager.getDailyDoubleHint()
      }),
      setDailyDoubleState: (row, hint) => this.gameStateManager.setDailyDoubleState(row, hint),
      updateHintBadge: updateHintBadge,
      titleHintBadge: this.domManager.get('titleHintBadge')
    });

    // Initialize mobile menu manager
    if (this.mobileMenuManager) {
      this.mobileMenuManager.initialize({
        domManager: this.domManager,
        lobbyCode: this.lobbyCode,
        messageHandlers
      });
    }
  }

  /**
   * Setup keyboard and input handling
   * @private
   */
  _setupKeyboardHandling() {
    const keyboard = this.domManager.get('keyboard');
    const guessInput = this.domManager.get('guessInput');
    const submitButton = this.domManager.get('submitButton');
    
    if (keyboard && guessInput && submitButton) {
      setupTypingListeners({
        keyboardEl: keyboard,
        guessInput,
        submitButton,
        submitGuessHandler: this._getSubmitGuessHandler(),
        updateBoardFromTyping: () => this._updateBoardFromTyping(),
        isAnimating: () => false
      });
    }
  }

  /**
   * Initialize board and scaling system
   * @private
   */
  _initializeBoardAndScaling() {
    const board = this.domManager.get('board');
    if (!board) return;

    // Create board structure
    createBoard(board, this.maxRows);

    // Initialize enhanced scaling system
    const enhancedScaling = initializeEnhancedScaling();
    const scalingResult = enhancedScaling.applyOptimalScaling(this.maxRows);

    if (!scalingResult.success) {
      console.warn('Enhanced scaling failed, using fallback:', scalingResult.error);
      const fallbackResult = applyOptimalScaling(this.maxRows);
      if (!fallbackResult) {
        fitBoardToContainer(this.maxRows);
      }
    } else {
      console.log('✅ Enhanced scaling applied successfully');
    }

    // Verify scaling
    const verification = verifyElementsFitInViewport(this.maxRows);
    if (!verification.success) {
      console.warn('Board scaling verification failed:', verification);
      if (verification.recommendations?.length > 0) {
        console.info('Scaling recommendations:', verification.recommendations);
      }
    }
  }

  /**
   * Setup event listeners
   * @private
   */
  _setupEventListeners() {
    // Event listeners are handled by the EventListenersManager
    // Additional board-specific listeners
    this._setupBoardEventListeners();
  }

  /**
   * Setup board-specific event listeners
   * @private
   */
  _setupBoardEventListeners() {
    const board = this.domManager.get('board');
    if (!board) return;

    // Board click handler for hint selection
    board.addEventListener('click', async (e) => {
      const dailyDoubleRow = this.gameStateManager.getDailyDoubleRow();
      if (dailyDoubleRow === null) return;
      
      const tile = e.target.closest('.tile');
      if (!tile) return;
      
      const tiles = Array.from(board.children);
      const index = tiles.indexOf(tile);
      if (index === -1) return;
      
      const row = Math.floor(index / 5);
      const col = index % 5;
      if (row !== dailyDoubleRow) return;
      
      // Call hint selection (would need to import selectHint)
      // await selectHint(col);
    });

    // Board keyboard navigation for hints
    board.addEventListener('keydown', async (e) => {
      if (!document.body.classList.contains('hint-selecting')) return;
      
      const dailyDoubleRow = this.gameStateManager.getDailyDoubleRow();
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
        // await selectHint(index);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        document.body.classList.remove('hint-selecting');
        tiles.forEach(t => (t.tabIndex = -1));
        // Update hint badge would go here
      }
    });
  }

  /**
   * Setup window event handlers
   * @private
   */
  _setupWindowEvents() {
    // Resize handler
    window.addEventListener('resize', () => {
      this._updateGameTitle(); // Update title for mobile/desktop
      console.log('🔧 Calling repositionResetButton from resize handler');
      repositionResetButton();
      updatePanelVisibility();
      updateChatPanelPosition();
      applyLayoutMode();
      updateInputVisibility();
      
      this._handleScalingOnResize();
      adjustKeyboardForViewport();
      setupMobileLeaderboard();
      
      const latestState = this.gameStateManager.getLatestState();
      if (latestState) {
        renderEmojiStamps(latestState.guesses);
      }
      
      setTimeout(() => ensureKeyboardVisibility(), 100);
    });

    // Viewport handlers
    updateVH();
    window.addEventListener('resize', updateVH);
    
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        updateVH();
        adjustKeyboardForViewport();
        setTimeout(() => ensureKeyboardVisibility(), 50);
        setTimeout(() => ensureInputFieldVisibility(), 100);
      });
    }

    // Orientation change handlers
    this._setupOrientationChangeHandlers();
  }

  /**
   * Setup orientation change handlers
   * @private
   */
  _setupOrientationChangeHandlers() {
    let orientationTimeout;

    const handleOrientationChange = () => {
      this._updateGameTitle(); // Update title for mobile/desktop
      updateVH();
      
      const boardArea = this.domManager.get('boardArea');
      const historyBox = this.domManager.get('historyBox');
      const definitionBox = this.domManager.get('definitionBox');
      const chatBox = this.domManager.get('chatBox');
      
      positionSidePanels(boardArea, historyBox, definitionBox, chatBox);
      applyLayoutMode();
      updateInputVisibility();
      
      this._handleScalingOnResize();
      adjustKeyboardForViewport();
      setupMobileLeaderboard();
      
      const latestState = this.gameStateManager.getLatestState();
      if (latestState) {
        renderEmojiStamps(latestState.guesses);
      }
      
      setTimeout(() => ensureKeyboardVisibility(), 200);
      setTimeout(() => ensureInputFieldVisibility(), 250);
    };

    window.addEventListener('orientationchange', handleOrientationChange);

    // Delayed orientation change handling
    window.addEventListener('orientationchange', () => {
      clearTimeout(orientationTimeout);
      orientationTimeout = setTimeout(() => {
        handleOrientationChange();
        ensureKeyboardVisibility();
        ensureInputFieldVisibility();
      }, 300);
    });
  }

  /**
   * Handle scaling on resize/orientation change
   * @private
   */
  _handleScalingOnResize() {
    const maxRows = this.gameStateManager.getMaxRows();
    
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
      const scalingSuccess = applyOptimalScaling(maxRows);
      if (!scalingSuccess) {
        fitBoardToContainer(maxRows);
      }
    }
  }

  /**
   * Initialize panels and layout
   * @private
   */
  _initializePanelsAndLayout() {
    const boardArea = this.domManager.get('boardArea');
    const historyBox = this.domManager.get('historyBox');
    const definitionBox = this.domManager.get('definitionBox');
    const chatBox = this.domManager.get('chatBox');
    
    console.log('🔧 Calling repositionResetButton from _initializePanelsAndLayout');
    repositionResetButton();
    positionSidePanels(boardArea, historyBox, definitionBox, chatBox);
    renderEmojiStamps([]);
    
    updateInputVisibility();
    
    // Show panels if screen is large enough and they have content
    if (window.innerWidth > 1550) {
      updatePanelVisibility();
    }
  }

  /**
   * Initialize network and game state
   * @private
   */
  async _initializeNetworkAndGameState() {
    // Reclaim previously selected emoji on reload
    if (this.myEmoji) {
      try {
        const result = await sendEmoji(this.myEmoji, this.myPlayerId, this.lobbyCode);
        if (result.player_id) {
          this.myPlayerId = result.player_id;
          setMyPlayerId(result.player_id);
          
          // Update managers with new player ID
          this.eventListenersManager.updatePlayerInfo(this.myEmoji, this.myPlayerId);
        }
      } catch (error) {
        console.warn('Failed to reclaim emoji:', error);
      }
    }

    // Update hint state
    updateHintState(this.myEmoji, this.myPlayerId);

    // Initial state fetch
    await this.networkManager.fetchState(this.myEmoji, this.lobbyCode);

    // Initialize event stream
    this.networkManager.initEventStream(this.lobbyCode, this.myEmoji);

    // Setup inactivity checking
    this.networkManager.setupInactivityCheck(this.myEmoji, this.lobbyCode);
  }

  /**
   * Get submit guess handler
   * @private
   */
  _getSubmitGuessHandler() {
    // Use the global submitGuessHandler if available, otherwise return a placeholder
    return window.submitGuessHandler || (() => {
      console.log('Submit guess handler not yet available');
    });
  }

  /**
   * Update board from typing
   * @private
   */
  _updateBoardFromTyping() {
    const board = this.domManager.get('board');
    const guessInput = this.domManager.get('guessInput');
    const latestState = this.gameStateManager.getLatestState();
    const maxRows = this.gameStateManager.getMaxRows();
    const dailyDoubleHint = this.gameStateManager.getDailyDoubleHint();
    const dailyDoubleRow = this.gameStateManager.getDailyDoubleRow();
    
    if (board && latestState && guessInput) {
      updateBoardFromTyping(
        board, 
        latestState, 
        guessInput, 
        maxRows, 
        this.gameState.is(STATES.GAME_OVER), 
        dailyDoubleHint, 
        dailyDoubleRow
      );
    }
  }
}

// Create and export singleton instance
const appInitializer = new AppInitializer();
export default appInitializer;