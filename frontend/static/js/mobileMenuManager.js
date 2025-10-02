/**
 * Mobile Menu Manager - Handles mobile popup menu functionality
 * Consolidates Door, Share Lobby, Number of Users, and Settings into one menu
 */

import { closeDialog, openDialog, showMessage, announce } from './utils.js';
import { setManualPanelToggle, togglePanel, toggleHistory, toggleDefinition, updatePanelVisibility } from './panelManager.js';
import { hideChatNotify } from './uiNotifications.js';
import { showInfo, toggleDarkMode } from './optionsManager.js';
import { toggleSound } from './audioManager.js';

class MobileMenuManager {
  constructor() {
    this.mobileMenuPopup = null;
    this.mobileMenuToggle = null;
    this.isOpen = false;
    this.domManager = null;
    this.lobbyCode = null;
    this.messageHandlers = null;
  }

  /**
   * Initialize the mobile menu manager
   * @param {Object} config - Configuration object
   */
  initialize(config) {
    this.domManager = config.domManager;
    this.lobbyCode = config.lobbyCode;
    this.messageHandlers = config.messageHandlers;
    
    this.mobileMenuPopup = this.domManager.get('mobileMenuPopup');
    this.mobileMenuToggle = this.domManager.get('mobileMenuToggle');
    
    if (!this.mobileMenuPopup || !this.mobileMenuToggle) {
      console.warn('Mobile menu elements not found');
      return false;
    }
    
    this._setupEventListeners();
    this._updatePlayerCount();
    
    return true;
  }

  /**
   * Setup event listeners for mobile menu
   * @private
   */
  _setupEventListeners() {
    // Toggle menu
    this.mobileMenuToggle.addEventListener('click', () => {
      this.toggle();
    });

    // Close menu
    const closeBtn = this.domManager.get('mobileMenuClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.close();
      });
    }

    // Close menu when clicking backdrop
    this.mobileMenuPopup.addEventListener('click', (e) => {
      if (e.target === this.mobileMenuPopup) {
        this.close();
      }
    });

    // Menu item handlers
    this._setupMenuItemHandlers();

    // Update player count when players change
    document.addEventListener('playersUpdated', () => {
      this._updatePlayerCount();
    });

    // ESC key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  /**
   * Setup individual menu item handlers
   * @private
   */
  _setupMenuItemHandlers() {
    // Leave Lobby
    const leaveLobbyBtn = this.domManager.get('mobileMenuLeaveLobby');
    if (leaveLobbyBtn) {
      leaveLobbyBtn.addEventListener('click', () => {
        this.close();
        // Immediately update URL to prevent refresh back into lobby
        window.history.replaceState(null, '', '/');
        window.location.href = '/';
      });
    }

    // Share Lobby
    const shareLobbyBtn = this.domManager.get('mobileMenuShareLobby');
    if (shareLobbyBtn) {
      shareLobbyBtn.addEventListener('click', () => {
        this._handleShareLobby();
      });
    }

    // Players
    const playersBtn = this.domManager.get('mobileMenuPlayers');
    if (playersBtn) {
      playersBtn.addEventListener('click', () => {
        this.close();
        document.body.classList.toggle('players-open');
        const playerSidebar = this.domManager.get('playerSidebar');
        if (document.body.classList.contains('players-open') && playerSidebar) {
          this._focusFirstElement(playerSidebar);
        }
      });
    }

    // History
    const historyBtn = this.domManager.get('mobileMenuHistory');
    if (historyBtn) {
      historyBtn.addEventListener('click', () => {
        this.close();
        toggleHistory();
      });
    }

    // Definition
    const definitionBtn = this.domManager.get('mobileMenuDefinition');
    if (definitionBtn) {
      definitionBtn.addEventListener('click', () => {
        this.close();
        toggleDefinition();
      });
    }

    // Chat
    const chatBtn = this.domManager.get('mobileMenuChat');
    if (chatBtn) {
      chatBtn.addEventListener('click', () => {
        this.close();
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
        
        // Restore history panel if it should remain visible in medium mode with grid layout
        const mode = document.body.dataset.mode;
        const isHistoryPopup = document.body.dataset.historyPopup === 'true';
        if (mode === 'medium' && !isHistoryPopup) {
          updatePanelVisibility();
        }
      });
    }

    // Dark Mode
    const darkModeBtn = this.domManager.get('mobileMenuDarkMode');
    if (darkModeBtn) {
      darkModeBtn.addEventListener('click', () => {
        toggleDarkMode();
        this._updateDarkModeText();
      });
    }

    // Sound
    const soundBtn = this.domManager.get('mobileMenuSound');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        toggleSound();
        this._updateSoundText();
      });
    }

    // Info
    const infoBtn = this.domManager.get('mobileMenuInfo');
    if (infoBtn) {
      infoBtn.addEventListener('click', () => {
        this.close();
        showInfo();
      });
    }
  }

  /**
   * Handle share lobby action
   * @private
   */
  _handleShareLobby() {
    const url = window.location.href;
    
    if (navigator.share) {
      navigator.share({
        title: 'Join my WordSquad game',
        text: 'Come play WordSquad with me!',
        url: url
      }).then(() => {
        this.close();
        showMessage('Lobby shared!', this.messageHandlers);
      }).catch(() => {
        this._fallbackShare(url);
      });
    } else {
      this._fallbackShare(url);
    }
  }

  /**
   * Fallback share method using share modal
   * @private
   */
  _fallbackShare(url) {
    const shareModal = this.domManager.get('shareModal');
    const shareLink = this.domManager.get('shareLink');
    
    if (shareLink && shareModal) {
      this.close();
      shareLink.value = url;
      openDialog(shareModal);
      shareLink.focus();
      shareLink.select();
    }
  }

  /**
   * Update player count badge
   * @private
   */
  _updatePlayerCount() {
    const badge = this.domManager.get('mobileMenuPlayerCount');
    const playerList = this.domManager.get('playerList');
    
    if (badge && playerList) {
      const count = playerList.children.length;
      badge.textContent = count > 0 ? count.toString() : '';
      badge.style.display = count > 0 ? 'inline-block' : 'none';
    }
  }

  /**
   * Update dark mode text based on current state
   * @private
   */
  _updateDarkModeText() {
    const darkModeBtn = this.domManager.get('mobileMenuDarkMode');
    if (darkModeBtn) {
      const isDark = document.body.classList.contains('dark-mode');
      const textEl = darkModeBtn.querySelector('.menu-text');
      if (textEl) {
        textEl.textContent = isDark ? 'Light Mode' : 'Dark Mode';
      }
    }
  }

  /**
   * Update sound text based on current state
   * @private
   */
  _updateSoundText() {
    const soundBtn = this.domManager.get('mobileMenuSound');
    if (soundBtn) {
      const isMuted = localStorage.getItem('soundOff') === 'true';
      const textEl = soundBtn.querySelector('.menu-text');
      const iconEl = soundBtn.querySelector('.menu-icon');
      if (textEl && iconEl) {
        textEl.textContent = isMuted ? 'Sound On' : 'Sound Off';
        iconEl.textContent = isMuted ? '🔇' : '🔈';
      }
    }
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
      }
    }, 100);
  }

  /**
   * Focus first focusable element
   * @private
   */
  _focusFirstElement(container) {
    const focusable = container.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable) {
      focusable.focus();
    }
  }

  /**
   * Open the mobile menu
   */
  open() {
    if (!this.mobileMenuPopup || this.isOpen) return;
    
    this.mobileMenuPopup.style.display = 'flex';
    this.isOpen = true;
    
    // Update dynamic content
    this._updatePlayerCount();
    this._updateDarkModeText();
    this._updateSoundText();
    
    // Animate in
    requestAnimationFrame(() => {
      this.mobileMenuPopup.classList.add('show');
    });
    
    // Lock body scroll
    document.body.style.overflow = 'hidden';
    
    announce('Mobile menu opened');
  }

  /**
   * Close the mobile menu
   */
  close() {
    if (!this.mobileMenuPopup || !this.isOpen) return;
    
    this.mobileMenuPopup.classList.remove('show');
    this.isOpen = false;
    
    setTimeout(() => {
      this.mobileMenuPopup.style.display = 'none';
      document.body.style.overflow = '';
    }, 300);
    
    announce('Mobile menu closed');
  }

  /**
   * Toggle the mobile menu
   */
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Check if menu is currently open
   */
  isMenuOpen() {
    return this.isOpen;
  }
}

// Create and export singleton instance
const mobileMenuManager = new MobileMenuManager();
export default mobileMenuManager;