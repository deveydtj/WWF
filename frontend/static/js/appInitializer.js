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
import {
  alignStampsWithBoardRows,
  setupMobileLeaderboard,
  renderEmojiStamps
} from './leaderboardManager.js';
import { initResetManager } from './resetManager.js';
import { updatePanelVisibility } from './panelManager.js';
import { refreshOverlayStateForLayout } from './overlayState.js';
import { initHintManager, updateHintState } from './hintManager.js';
import { updateGlobalPlayerId } from './main.js';
import { LayoutManager } from './layoutManager.js';
import { installLayoutDiagnostics } from './layoutDiagnostics.js';
import { 
  applyDarkModePreference, 
  repositionResetButton,
  updateVH,
  enableClickOffDismiss
} from './utils.js';
import { initializeResponsiveScaling, recalculateScaling } from './responsiveScaling.js';

// Expose repositionResetButton to global scope for debugging and manual calls
window.repositionResetButton = repositionResetButton;
import { updateHintBadge } from './hintBadge.js';
import { setupTypingListeners, updateBoardFromTyping } from './keyboard.js';
import { InputController } from './inputController.js';
import { applyGuessFieldPresentation } from './guessFieldPresentation.js';

class AppInitializer {
  constructor() {
    this.gameState = null;
    this.domManager = null;
    this.networkManager = null;
    this.gameStateManager = null;
    this.eventListenersManager = null;
    this.mobileMenuManager = null;
    this.layoutManager = null;
    this.inputController = null;
    this.unsubscribeViewportUpdates = null;
    
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
    
    // Initialize layout manager (new deterministic layout system)
    this.layoutManager = new LayoutManager();
    this._applyGuessFieldPresentation(this.layoutManager.getCurrentLayoutProfile());
    installLayoutDiagnostics(() => this.layoutManager.getCurrentLayoutState());
    console.log('[AppInitializer] Layout manager initialized:', this.layoutManager.getCurrentLayout());
    
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
      
      // 10. Phase 7: Best-effort portrait lock for phone mode
      this._lockPortraitOrientation();
      
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
    // Use layoutManager if available, fallback to the phone/tablet contract
    const isSmallLayout = this.layoutManager ? this.layoutManager.isMobile() : window.innerWidth <= 900;
    let title = GAME_NAME;
    
    // On smaller layouts, include lobby code in the title if available
    if (isSmallLayout && this.lobbyCode) {
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
    
    // Layout is automatically managed by LayoutManager now
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
      },
      // Callbacks for auto-reconnection functionality
      onPlayerIdUpdate: (newPlayerId) => {
        this.myPlayerId = newPlayerId;
        setMyPlayerId(newPlayerId);
        // Update the global myPlayerId in main.js so it uses the new ID immediately
        updateGlobalPlayerId(newPlayerId);
        // Update the event listeners manager with new player ID
        if (this.eventListenersManager) {
          this.eventListenersManager.updatePlayerInfo(this.myEmoji, newPlayerId);
        }
      },
      onRefreshState: () => {
        // Refresh state from server after successful reconnection
        if (this.networkManager) {
          this.networkManager.fetchState(this.myEmoji, this.lobbyCode);
        }
      },
      lobbyCode: this.lobbyCode
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
      this.inputController = new InputController({
        getCurrentGuess: () => this.gameStateManager.getCurrentGuess(),
        setCurrentGuess: (value) => this.gameStateManager.setCurrentGuess(value, { render: false }),
        submitGuess: this._getSubmitGuessHandler(),
        onGuessChanged: () => this._updateBoardFromTyping(),
        isBlocked: () => guessInput.disabled
      });

      setupTypingListeners({
        keyboardEl: keyboard,
        guessInput,
        submitButton,
        inputController: this.inputController
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

    // Initialize modern responsive scaling system
    // This performs one-time initialization that calculates optimal tile and
    // keyboard sizes based on the current viewport, and sets up resize event
    // listeners so scaling is recalculated when the viewport changes.
    initializeResponsiveScaling();
    
    console.log('✅ Board and responsive scaling initialized');

    // Verify elements fit in viewport
    const layoutType = this.layoutManager ? this.layoutManager.getCurrentLayout() : 'unknown';
    console.log('Board dimensions verification:', {
      boardArea: document.getElementById('boardArea')?.getBoundingClientRect(),
      viewport: { 
        width: window.innerWidth, 
        height: window.innerHeight 
      },
      layout: layoutType
    });
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
    // LayoutManager subscribes first, so its state/profile are current before
    // application layout effects run in this same scheduled update cycle.
    this.unsubscribeViewportUpdates?.();
    this.unsubscribeViewportUpdates = this.layoutManager.subscribeToViewport(
      () => this._handleViewportUpdate()
    );

    document.addEventListener('layoutprofilechange', (e) => {
      this._applyGuessFieldPresentation(e.detail.profile);
    });
  }

  /**
   * Apply all viewport-dependent UI effects from the shared scheduler.
   * @private
   */
  _handleViewportUpdate() {
    const layoutState = this.layoutManager.getCurrentLayoutState();

    refreshOverlayStateForLayout(layoutState);
    this._updateGameTitle();
    updateVH();
    repositionResetButton();
    updatePanelVisibility();
    recalculateScaling();
    alignStampsWithBoardRows();
  }

  /**
   * Keep the optional text field aligned with the capability profile. The
   * InputController remains its only mutation path when the field is visible.
   * @private
   */
  _applyGuessFieldPresentation(profile) {
    applyGuessFieldPresentation(profile, this.domManager.get('guessInput'));
  }

  /**
   * Phase 7: Best-effort portrait orientation lock for phone-sized viewports.
   * Uses the Screen Orientation API where supported; silently ignores errors
   * on browsers that do not support locking (e.g., iOS Safari).
   * @private
   */
  _lockPortraitOrientation() {
    try {
      if (
        typeof screen !== 'undefined' &&
        screen.orientation &&
        typeof screen.orientation.lock === 'function'
      ) {
        screen.orientation.lock('portrait').catch(() => {
          // Silently ignore – locking is best-effort and may be denied
          // by the browser (e.g., desktop, or browsers that don't support it).
        });
      }
    } catch (_) {
      // Ignore any synchronous errors from older browsers
    }
  }

  /**
   * Initialize panels and layout
   * @private
   */
  _initializePanelsAndLayout() {
    console.log('🔧 Calling repositionResetButton from _initializePanelsAndLayout');
    repositionResetButton();
    renderEmojiStamps([]);
    setupMobileLeaderboard();
    
    // Show panels if screen is large enough and they have content
    updatePanelVisibility();
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
    const latestState = this.gameStateManager.getLatestState();
    const maxRows = this.gameStateManager.getMaxRows();
    const dailyDoubleHint = this.gameStateManager.getDailyDoubleHint();
    const dailyDoubleRow = this.gameStateManager.getDailyDoubleRow();
    const currentGuess = this.gameStateManager.getCurrentGuess();
    
    if (board && latestState) {
      updateBoardFromTyping(
        board, 
        latestState, 
        currentGuess, 
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
