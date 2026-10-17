/**
 * Event Listeners Manager - Centralized event listener setup and management
 * Extracts event listener setup logic from main.js for better organization
 */

import { closeDialog, openDialog, showMessage, focusFirstElement, shakeInput, announce } from './utils.js';
import { togglePanel, setManualPanelToggle, toggleHistory, toggleDefinition, updatePanelVisibility } from './panelManager.js';
import { hideChatNotify } from './uiNotifications.js';
import { closeOptionsMenu, showInfo, toggleDarkMode } from './optionsManager.js';
import { toggleSound } from './audioManager.js';
import { toggleHintSelection } from './hintManager.js';
import { sendChatMessage } from './api.js';
import { hapticFeedback } from './haptics.js';
import { LAYOUT_MODES } from './layoutModes.js';
import { getCurrentLayoutState } from './layoutManager.js';
import {
  OVERLAYS,
  closeOverlay,
  isOverlayOpen,
  toggleOverlay
} from './overlayState.js';

class EventListenersManager {
  constructor() {
    this.domManager = null;
    this.networkManager = null;
    this.gameStateManager = null;
    this.lobbyCode = null;
    this.myEmoji = null;
    this.myPlayerId = null;
    
    // Chat spam control
    this.lastChatTime = 0;
    this.CHAT_COOLDOWN_MS = 1000;
    this.MAX_CHAT_LENGTH = 140;
    
    // Chat focus management
    this.chatInputFocusProtection = false;
    this.userIntentionallyLeftChat = false;
  }

  /**
   * Initialize the event listeners manager
   * @param {Object} config - Configuration object
   */
  initialize(config) {
    this.domManager = config.domManager;
    this.networkManager = config.networkManager;
    this.gameStateManager = config.gameStateManager;
    this.lobbyCode = config.lobbyCode;
    this.myEmoji = config.myEmoji;
    this.myPlayerId = config.myPlayerId;
    this.messageHandlers = config.messageHandlers;
    
    this._setupPanelEventListeners();
    this._setupPanelBackdropListener();
    this._setupOptionsEventListeners();
    this._setupModalEventListeners();
    this._setupPlayerSidebarEventListeners();
    this._setupChatEventListeners();
    this._setupLobbyEventListeners();
    this._setupActivityListeners();
    this._setupWindowEventListeners();
  }

  /**
   * Setup panel-related event listeners
   * @private
   */
  _setupPanelEventListeners() {
    const historyClose = this.domManager.get('historyClose');
    const definitionClose = this.domManager.get('definitionClose');
    const chatClose = this.domManager.get('chatClose');
    const chatNotify = this.domManager.get('chatNotify');
    const boardArea = this.domManager.get('boardArea');
    const historyBox = this.domManager.get('historyBox');
    const definitionBox = this.domManager.get('definitionBox');
    const chatBox = this.domManager.get('chatBox');

    if (historyClose) {
      historyClose.addEventListener('click', () => {
        setManualPanelToggle('history', false);
        closeOverlay(OVERLAYS.HISTORY);
        // Delay position update until after close animation completes
        // Use shorter delay for users with reduced motion preferences
        const animationDelay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 50 : 320;
        setTimeout(() => {
          // Return focus to a logical element after panel closes
          const mainElement = document.getElementById('wordInput') || document.getElementById('guessInput');
          if (mainElement && !document.activeElement?.closest('#chatBox, #historyBox, #definitionBox')) {
            mainElement.focus();
          }
          
        }, animationDelay);
      });
    }

    if (definitionClose) {
      definitionClose.addEventListener('click', () => {
        setManualPanelToggle('definition', false);
        closeOverlay(OVERLAYS.DEFINITION);
        // Delay position updates until after close animation completes
        // Use shorter delay for users with reduced motion preferences
        const animationDelay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 50 : 320;
        setTimeout(() => {
          // Return focus to a logical element after panel closes
          const mainElement = document.getElementById('wordInput') || document.getElementById('guessInput');
          if (mainElement && !document.activeElement?.closest('#chatBox, #historyBox, #definitionBox')) {
            mainElement.focus();
          }
          
        }, animationDelay);
      });
    }

    if (chatClose) {
      chatClose.addEventListener('click', () => {
        this._cleanupChatState();
        setManualPanelToggle('chat', false);
        closeOverlay(OVERLAYS.CHAT);
        
        // Delay notification display until after close animation completes
        // Use shorter delay for users with reduced motion preferences
        const animationDelay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 50 : 320;
        setTimeout(() => {
          // Show the chat notification icon after animation is complete
          if (chatNotify) {
            chatNotify.style.display = 'block';
          }
        }, animationDelay);
      });
    }

    if (chatNotify) {
      chatNotify.addEventListener('click', () => {
        setManualPanelToggle('chat', !isOverlayOpen(OVERLAYS.CHAT));
        const willBeOpen = !isOverlayOpen(OVERLAYS.CHAT);
        togglePanel('chat-open');
        
        // Only hide the notification when opening chat, show it when closing
        if (willBeOpen) {
          hideChatNotify();
        } else {
          // Show the chat notify icon when closing the chat panel
          chatNotify.style.display = 'block';
        }
        
        if (isOverlayOpen(OVERLAYS.CHAT)) {
          this._focusChatInput();
        }
        
        // Restore history panel if it should remain visible in tablet mode with grid layout
        const { mode, historyPopup } = getCurrentLayoutState();
        if (mode === LAYOUT_MODES.TABLET && !historyPopup) {
          updatePanelVisibility();
        }
      });
    }
  }

  /**
   * Reset chat focus protection state when the chat panel is closed.
   * Called from both the close button handler and the backdrop click handler
   * to keep cleanup logic in one place.
   * @private
   */
  _cleanupChatState() {
    this.chatInputFocusProtection = false;
    this.userIntentionallyLeftChat = false;
  }

  /**
   * Setup panel backdrop click-off dismissal for phone/tablet card modals.
   * Clicking the backdrop closes any open secondary panel.
   * @private
   */
  _setupPanelBackdropListener() {
    const panelBackdrop = document.getElementById('panelBackdrop');
    if (!panelBackdrop) return;

    panelBackdrop.addEventListener('click', () => {
      if (isOverlayOpen(OVERLAYS.OPTIONS)) {
        closeDialog(document.getElementById('optionsMenu'));
      } else if (isOverlayOpen(OVERLAYS.HISTORY)) {
        setManualPanelToggle(OVERLAYS.HISTORY, false);
        closeOverlay(OVERLAYS.HISTORY);
      } else if (isOverlayOpen(OVERLAYS.DEFINITION)) {
        setManualPanelToggle(OVERLAYS.DEFINITION, false);
        closeOverlay(OVERLAYS.DEFINITION);
      } else if (isOverlayOpen(OVERLAYS.CHAT)) {
        this._cleanupChatState();
        setManualPanelToggle(OVERLAYS.CHAT, false);
        closeOverlay(OVERLAYS.CHAT);
        const chatNotify = document.getElementById('chatNotify');
        if (chatNotify) {
          chatNotify.style.display = 'block';
        }
      } else if (isOverlayOpen(OVERLAYS.PLAYERS)) {
        closeOverlay(OVERLAYS.PLAYERS);
      }
    });
  }

  /**
   * Setup options menu event listeners
   * @private
   */
  _setupOptionsEventListeners() {
    const optionsToggle = this.domManager.get('optionsToggle');
    const optionsClose = this.domManager.get('optionsClose');
    const optionsMenu = this.domManager.get('optionsMenu');
    const menuHistory = this.domManager.get('menuHistory');
    const menuDefinition = this.domManager.get('menuDefinition');
    const menuChat = this.domManager.get('menuChat');
    const menuInfo = this.domManager.get('menuInfo');
    const menuDarkMode = this.domManager.get('menuDarkMode');
    const menuSound = this.domManager.get('menuSound');

    if (optionsToggle && optionsMenu) {
      optionsToggle.addEventListener('click', () => {
        if (isOverlayOpen(OVERLAYS.OPTIONS)) {
          closeOptionsMenu();
          return;
        }
        
        openDialog(optionsMenu, optionsToggle);
      });
    }

    if (optionsClose) {
      optionsClose.addEventListener('click', () => { closeOptionsMenu(); });
    }

    if (menuHistory) {
      menuHistory.addEventListener('click', () => { 
        closeOptionsMenu();
        toggleHistory();
      });
    }

    if (menuDefinition) {
      menuDefinition.addEventListener('click', () => { 
        closeOptionsMenu();
        toggleDefinition();
      });
    }

    if (menuChat) {
      menuChat.addEventListener('click', () => {
        closeOptionsMenu();
        setManualPanelToggle('chat', !isOverlayOpen(OVERLAYS.CHAT));
        const willBeOpen = !isOverlayOpen(OVERLAYS.CHAT);
        togglePanel('chat-open');
        
        // Only hide the notification when opening chat, show it when closing
        if (willBeOpen) {
          hideChatNotify();
        } else {
          // Show the chat notify icon when closing the chat panel
          const chatNotify = document.getElementById('chatNotify');
          if (chatNotify) {
            chatNotify.style.display = 'block';
          }
        }
        
        if (isOverlayOpen(OVERLAYS.CHAT)) {
          this._focusChatInput();
        }
        
        // Restore history panel if it should remain visible in tablet mode with grid layout
        const { mode, historyPopup } = getCurrentLayoutState();
        if (mode === LAYOUT_MODES.TABLET && !historyPopup) {
          updatePanelVisibility();
        }

      });
    }

    if (menuInfo) {
      menuInfo.addEventListener('click', () => { 
        closeOptionsMenu();
        showInfo();
      });
    }

    if (menuDarkMode) {
      menuDarkMode.addEventListener('click', toggleDarkMode);
    }

    if (menuSound) {
      menuSound.addEventListener('click', toggleSound);
    }
  }

  /**
   * Setup modal event listeners
   * @private
   */
  _setupModalEventListeners() {
    const closeCallOk = this.domManager.get('closeCallOk');
    const closeCallPopup = this.domManager.get('closeCallPopup');
    const infoClose = this.domManager.get('infoClose');
    const infoPopup = this.domManager.get('infoPopup');
    const shareClose = this.domManager.get('shareClose');
    const shareModal = this.domManager.get('shareModal');
    const shareCopy = this.domManager.get('shareCopy');
    const shareLink = this.domManager.get('shareLink');
    const titleHintBadge = this.domManager.get('titleHintBadge');

    if (closeCallOk && closeCallPopup) {
      closeCallOk.addEventListener('click', () => { closeDialog(closeCallPopup); });
    }

    if (infoClose && infoPopup) {
      infoClose.addEventListener('click', () => { closeDialog(infoPopup); });
    }

    if (shareClose && shareModal) {
      shareClose.addEventListener('click', () => { closeDialog(shareModal); });
    }

    if (shareCopy && shareLink) {
      shareCopy.addEventListener('click', async () => {
        if (!shareLink.value) {
          showMessage('No link to copy!', this.messageHandlers);
          return;
        }
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(shareLink.value);
          } else {
            shareLink.focus();
            shareLink.select();
            shareLink.setSelectionRange(0, shareLink.value.length);
            if (!document.execCommand('copy')) throw new Error('Copy unavailable');
          }
          showMessage('Link copied!', this.messageHandlers);
          hapticFeedback(18);
          announce('Lobby link copied');
        } catch (err) {
          console.error('Failed to copy:', err);
          shareLink.focus();
          shareLink.select();
          showMessage('Failed to copy link. Try selecting and copying manually.', this.messageHandlers);
        }
      });
    }

    if (titleHintBadge) {
      titleHintBadge.addEventListener('click', toggleHintSelection);
      titleHintBadge.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          toggleHintSelection();
        }
      });
    }
  }

  /**
   * Setup player sidebar event listeners
   * @private
   */
  _setupPlayerSidebarEventListeners() {
    const playerToggleBtn = this.domManager.get('playerToggleBtn');
    const playerCloseBtn = this.domManager.get('playerCloseBtn');
    const playerSidebar = this.domManager.get('playerSidebar');

    if (playerToggleBtn && playerSidebar) {
      playerToggleBtn.addEventListener('click', () => {
        const isOpen = toggleOverlay(OVERLAYS.PLAYERS);
        if (isOpen) {
          focusFirstElement(playerSidebar);
        }
      });
    }

    if (playerCloseBtn) {
      playerCloseBtn.addEventListener('click', () => {
        closeOverlay(OVERLAYS.PLAYERS);
      });
    }
  }

  /**
   * Setup chat-related event listeners
   * @private
   */
  _setupChatEventListeners() {
    const chatForm = this.domManager.get('chatForm');
    const chatInput = this.domManager.get('chatInput');
    const chatBox = this.domManager.get('chatBox');
    const guessInput = this.domManager.get('guessInput');

    if (chatForm && chatInput) {
      chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;
        
        // Spam control
        const now = Date.now();
        if (now - this.lastChatTime < this.CHAT_COOLDOWN_MS) {
          shakeInput(chatInput);
          showMessage(`Please wait ${Math.ceil((this.CHAT_COOLDOWN_MS - (now - this.lastChatTime)) / 1000)} second(s) before sending another message.`, this.messageHandlers);
          return;
        }
        
        // Length check
        if (text.length > this.MAX_CHAT_LENGTH) {
          shakeInput(chatInput);
          showMessage(`Message too long. Maximum ${this.MAX_CHAT_LENGTH} characters allowed.`, this.messageHandlers);
          return;
        }
        
        this.lastChatTime = now;
        chatInput.value = '';
        await sendChatMessage(text, this.myEmoji, this.myPlayerId, this.lobbyCode);
        
        if (this.networkManager) {
          this.networkManager.fetchState(this.myEmoji, this.lobbyCode);
        }
      });
    }

    // Setup complex chat focus management
    this._setupChatFocusManagement(chatInput, chatBox, guessInput);
  }

  /**
   * Setup complex chat focus management
   * @private
   */
  _setupChatFocusManagement(chatInput, chatBox, guessInput) {
    if (!chatInput) return;

    chatInput.addEventListener('click', (e) => {
      e.stopPropagation();
      this.chatInputFocusProtection = true;
      this.userIntentionallyLeftChat = false;
      setTimeout(() => {
        chatInput.focus();
        console.log('Chat input refocused after click');
      }, 50);
    });

    chatInput.addEventListener('focus', () => {
      console.log('Chat input received focus');
      this.chatInputFocusProtection = true;
      this.userIntentionallyLeftChat = false;
    });

    chatInput.addEventListener('blur', (e) => {
      console.log('Chat input lost focus to:', e.relatedTarget);
      
      if (this.chatInputFocusProtection &&
          isOverlayOpen(OVERLAYS.CHAT) &&
          !this.userIntentionallyLeftChat) {
        
        const relatedTarget = e.relatedTarget;
        const isGameElement = relatedTarget && (
          relatedTarget.id === 'guessInput' ||
          relatedTarget.closest('#board') ||
          relatedTarget.closest('#keyboard') ||
          relatedTarget.closest('#submitGuess')
        );
        
        if (!isGameElement) {
          setTimeout(() => {
            if (isOverlayOpen(OVERLAYS.CHAT) &&
                document.activeElement !== chatInput &&
                !this.userIntentionallyLeftChat) {
              console.log('Reclaiming focus for chat input');
              chatInput.focus();
            }
          }, 50);
        }
      }
    });

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.userIntentionallyLeftChat = true;
        this.chatInputFocusProtection = false;
        if (guessInput) guessInput.focus();
        console.log('User pressed ESC in chat - transferring focus to game input');
      } else {
        this.chatInputFocusProtection = true;
        this.userIntentionallyLeftChat = false;
      }
    });

    if (chatBox) {
      chatBox.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    if (guessInput) {
      guessInput.addEventListener('click', () => {
        if (isOverlayOpen(OVERLAYS.CHAT)) {
          this.userIntentionallyLeftChat = true;
          this.chatInputFocusProtection = false;
          console.log('User clicked on game input - disabling chat focus protection');
        }
      });

      guessInput.addEventListener('focus', () => {
        if (isOverlayOpen(OVERLAYS.CHAT)) {
          this.userIntentionallyLeftChat = true;
          this.chatInputFocusProtection = false;
          console.log('Game input received focus - disabling chat focus protection');
        }
      });
    }
  }

  /**
   * Setup lobby-related event listeners
   * @private
   */
  _setupLobbyEventListeners() {
    const copyLobbyLink = this.domManager.get('copyLobbyLink');
    const shareModal = this.domManager.get('shareModal');
    const shareLink = this.domManager.get('shareLink');
    
    if (copyLobbyLink && this.lobbyCode && !window.PRIVATE_ROOM) {
      copyLobbyLink.addEventListener('click', () => {
        const url = `${window.location.origin}/invite.html#lobby/${this.lobbyCode}`;
        
        if (navigator.share) {
          navigator.share({
            title: 'Join my WordSquad game',
            text: 'Come play WordSquad with me!',
            url: url
          }).catch(() => {
            if (shareLink) {
              shareLink.value = url;
              openDialog(shareModal, copyLobbyLink);
              shareLink.focus();
              shareLink.select();
            }
          });
        } else {
          if (shareLink) {
            shareLink.value = url;
            openDialog(shareModal, copyLobbyLink);
            shareLink.focus();
            shareLink.select();
          }
        }
      });
    }
  }

  /**
   * Setup activity monitoring event listeners
   * @private
   */
  _setupActivityListeners() {
    if (!this.networkManager) return;

    document.addEventListener('keydown', (e) => {
      if (e.target && e.target.id === 'chatInput') {
        return;
      }
      this.networkManager.onActivity(this.myEmoji, this.myPlayerId, this.lobbyCode);
    });

    document.addEventListener('click', (e) => {
      const chatElement = e.target.closest('#chatBox, #chatInput, #chatSend, #chatMessages, #chatForm');
      if (chatElement) {
        console.log('Preventing onActivity for chat element:', e.target, chatElement);
        
        if (e.target.id === 'chatInput' || e.target.closest('#chatInput')) {
          setTimeout(() => {
            const chatInput = this.domManager.get('chatInput');
            if (chatInput) {
              chatInput.focus();
            }
          }, 50);
        }
        return;
      }
      this.networkManager.onActivity(this.myEmoji, this.myPlayerId, this.lobbyCode);
    });
  }

  /**
   * Setup window event listeners
   * @private
   */
  _setupWindowEventListeners() {
    window.addEventListener('beforeunload', () => {
      if (this.networkManager) {
        this.networkManager.cleanup();
      }
    });
  }

  /**
   * Focus chat input with robust timing
   * @private
   */
  _focusChatInput() {
    setTimeout(() => {
      const chatInput = this.domManager.get('chatInput');
      if (chatInput) {
        chatInput.focus();
        console.log('Chat input focused via setTimeout');
      }
    }, 100);
  }

  /**
   * Update emoji and player ID references
   */
  updatePlayerInfo(emoji, playerId) {
    this.myEmoji = emoji;
    this.myPlayerId = playerId;
  }
}

// Create and export singleton instance
const eventListenersManager = new EventListenersManager();
export default eventListenersManager;
