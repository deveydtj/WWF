/**
 * Event Listeners Manager - Centralized event listener setup and management
 * Extracts event listener setup logic from main.js for better organization
 */

import { closeDialog, openDialog, showMessage, focusFirstElement, shakeInput, announce } from './utils.js';
import { togglePanel, setManualPanelToggle, toggleHistory, toggleDefinition } from './panelManager.js';
import { positionSidePanels, updateChatPanelPosition } from './utils.js';
import { positionContextMenu } from './popupPositioning.js';
import { hideChatNotify } from './uiNotifications.js';
import { closeOptionsMenu, showInfo, toggleDarkMode } from './optionsManager.js';
import { toggleSound } from './audioManager.js';
import { toggleHintSelection } from './hintManager.js';
import { sendChatMessage } from './api.js';

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

    // Debounce flag to prevent rapid clicking issues during animations
    let isAnimating = false;

    if (historyClose) {
      historyClose.addEventListener('click', () => {
        if (isAnimating) return;
        isAnimating = true;
        
        setManualPanelToggle('history', false);
        document.body.classList.remove('history-open');
        // Delay position update until after close animation completes
        // Use shorter delay for users with reduced motion preferences
        const animationDelay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 50 : 320;
        setTimeout(() => {
          positionSidePanels(boardArea, historyBox, definitionBox, chatBox);
          
          // Return focus to a logical element after panel closes
          const mainElement = document.getElementById('wordInput') || document.getElementById('guessInput');
          if (mainElement && !document.activeElement?.closest('#chatBox, #historyBox, #definitionBox')) {
            mainElement.focus();
          }
          
          isAnimating = false;
        }, animationDelay);
      });
    }

    if (definitionClose) {
      definitionClose.addEventListener('click', () => {
        if (isAnimating) return;
        isAnimating = true;
        
        setManualPanelToggle('definition', false);
        document.body.classList.remove('definition-open');
        // Delay position updates until after close animation completes
        // Use shorter delay for users with reduced motion preferences
        const animationDelay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 50 : 320;
        setTimeout(() => {
          positionSidePanels(boardArea, historyBox, definitionBox, chatBox);
          updateChatPanelPosition();
          
          // Return focus to a logical element after panel closes
          const mainElement = document.getElementById('wordInput') || document.getElementById('guessInput');
          if (mainElement && !document.activeElement?.closest('#chatBox, #historyBox, #definitionBox')) {
            mainElement.focus();
          }
          
          isAnimating = false;
        }, animationDelay);
      });
    }

    if (chatClose) {
      chatClose.addEventListener('click', () => {
        if (isAnimating) return;
        isAnimating = true;
        
        this.chatInputFocusProtection = false;
        this.userIntentionallyLeftChat = false;
        setManualPanelToggle('chat', false);
        document.body.classList.remove('chat-open');
        
        // Delay both position update and notification display until after close animation completes
        // Use shorter delay for users with reduced motion preferences
        const animationDelay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 50 : 320;
        setTimeout(() => {
          positionSidePanels(boardArea, historyBox, definitionBox, chatBox);
          
          // Show the chat notification icon after positioning is complete
          if (chatNotify) {
            chatNotify.style.display = 'block';
          }
          isAnimating = false;
        }, animationDelay);
      });
    }

    if (chatNotify) {
      chatNotify.addEventListener('click', () => {
        setManualPanelToggle('chat', !document.body.classList.contains('chat-open'));
        const willBeOpen = !document.body.classList.contains('chat-open');
        togglePanel('chat-open');
        
        // Only hide the notification when opening chat, show it when closing
        if (willBeOpen) {
          hideChatNotify();
        } else {
          // Show the chat notify icon when closing the chat panel
          chatNotify.style.display = 'block';
        }
        
        if (document.body.classList.contains('chat-open')) {
          this._focusChatInput();
        }
      });
    }
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

    // Debug logging to track event listener setup
    console.log('🔧 Setting up options event listeners:', {
      optionsToggle: !!optionsToggle,
      optionsMenu: !!optionsMenu,
      optionsToggleId: optionsToggle?.id
    });

    if (optionsToggle && optionsMenu) {
      // Remove any existing listeners to avoid duplicates
      optionsToggle.removeEventListener('click', this._optionsToggleHandler);
      
      // Define the handler as a class method for proper removal
      this._optionsToggleHandler = () => {
        console.log('🔧 Options toggle clicked - executing handler');
        
        if (optionsMenu.style.display === 'flex' || optionsMenu.style.display === 'block' || optionsMenu.classList.contains('show')) {
          console.log('🔧 Options menu is open, closing it');
          closeOptionsMenu();
          return;
        }
        
        console.log('🔧 Opening options menu');
        
        // Add the "show" class required by ModalAccessibilityManager
        optionsMenu.classList.add('show');
        
        const currentMode = document.body.dataset.mode;
        if (currentMode === 'medium') {
          // In medium mode, center the options menu on screen
          optionsMenu.style.display = 'flex';
          optionsMenu.style.position = 'fixed';
          optionsMenu.style.top = '50%';
          optionsMenu.style.left = '50%';
          optionsMenu.style.transform = 'translate(-50%, -50%)';
          optionsMenu.style.zIndex = '80';
        } else {
          optionsMenu.style.display = 'block';
          positionContextMenu(optionsMenu, optionsToggle);
        }
        
        // Call modalAccessibilityManager to set modal as visible
        if (window.modalAccessibilityManager) {
          window.modalAccessibilityManager.setModalVisible(optionsMenu);
        }
        
        openDialog(optionsMenu);
        console.log('🔧 Options menu opened successfully');
      };
      
      optionsToggle.addEventListener('click', this._optionsToggleHandler);
      console.log('✅ Options toggle event listener attached successfully');
    } else {
      console.error('❌ Failed to setup options event listener - missing elements:', {
        optionsToggle: !!optionsToggle,
        optionsMenu: !!optionsMenu
      });
    }

    if (optionsClose) {
      optionsClose.addEventListener('click', () => { closeOptionsMenu(); });
    }

    if (menuHistory) {
      menuHistory.addEventListener('click', () => { 
        toggleHistory(); 
        closeOptionsMenu(); 
      });
    }

    if (menuDefinition) {
      menuDefinition.addEventListener('click', () => { 
        toggleDefinition(); 
        closeOptionsMenu(); 
      });
    }

    if (menuChat) {
      menuChat.addEventListener('click', () => {
        setManualPanelToggle('chat', !document.body.classList.contains('chat-open'));
        const willBeOpen = !document.body.classList.contains('chat-open');
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
        
        if (document.body.classList.contains('chat-open')) {
          this._focusChatInput();
        }
        closeOptionsMenu();
      });
    }

    if (menuInfo) {
      menuInfo.addEventListener('click', () => { 
        showInfo(); 
        closeOptionsMenu(); 
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
      shareCopy.addEventListener('click', () => {
        if (!shareLink.value) {
          showMessage('No link to copy!', this.messageHandlers);
          return;
        }
        navigator.clipboard.writeText(shareLink.value).then(() => {
          showMessage('Link copied!', this.messageHandlers);
          announce('Lobby link copied');
        }).catch((err) => {
          console.error('Failed to copy:', err);
          showMessage('Failed to copy link. Try selecting and copying manually.', this.messageHandlers);
        });
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
          document.body.classList.contains('chat-open') && 
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
            if (document.body.classList.contains('chat-open') && 
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
        if (document.body.classList.contains('chat-open')) {
          this.userIntentionallyLeftChat = true;
          this.chatInputFocusProtection = false;
          console.log('User clicked on game input - disabling chat focus protection');
        }
      });

      guessInput.addEventListener('focus', () => {
        if (document.body.classList.contains('chat-open')) {
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
    const leaveLobby = this.domManager.get('leaveLobby');
    const shareModal = this.domManager.get('shareModal');
    const shareLink = this.domManager.get('shareLink');
    
    if (copyLobbyLink && this.lobbyCode) {
      copyLobbyLink.addEventListener('click', () => {
        const url = window.location.href;
        
        if (navigator.share) {
          navigator.share({
            title: 'Join my WordSquad game',
            text: 'Come play WordSquad with me!',
            url: url
          }).catch(() => {
            if (shareLink) {
              shareLink.value = url;
              openDialog(shareModal);
              shareLink.focus();
              shareLink.select();
            }
          });
        } else {
          if (shareLink) {
            shareLink.value = url;
            openDialog(shareModal);
            shareLink.focus();
            shareLink.select();
          }
        }
      });
    }

    if (leaveLobby && this.lobbyCode) {
      leaveLobby.addEventListener('click', async () => {
        // Lobby leaving logic would be handled here
        // For now, just redirect
        window.location.href = '/';
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
    // Enhanced resize handling to prevent animation conflicts
    let resizeTimeout;
    window.addEventListener('resize', () => {
      // Clear any pending timeouts to prevent animation conflicts during resize
      clearTimeout(resizeTimeout);
      
      // Debounce resize events to prevent excessive position calculations
      resizeTimeout = setTimeout(() => {
        const boardArea = this.domManager.get('boardArea');
        const historyBox = this.domManager.get('historyBox');
        const definitionBox = this.domManager.get('definitionBox');
        const chatBox = this.domManager.get('chatBox');
        
        if (boardArea && historyBox && definitionBox && chatBox) {
          positionSidePanels(boardArea, historyBox, definitionBox, chatBox);
          updateChatPanelPosition();
        }
      }, 150);
    });

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