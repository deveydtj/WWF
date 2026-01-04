/**
 * DOM Manager - Centralized DOM element references and utilities
 * Extracts DOM element selection and management from main.js
 */

class DOMManager {
  constructor() {
    this.elements = {};
    this._initializeElements();
  }

  /**
   * Initialize all DOM element references
   */
  _initializeElements() {
    // Game elements
    this.elements.board = document.getElementById('board');
    this.elements.guessInput = document.getElementById('guessInput');
    this.elements.submitButton = document.getElementById('submitGuess');
    this.elements.keyboard = document.getElementById('keyboard');
    this.elements.boardArea = document.getElementById('boardArea');
    
    // Message and popup elements
    this.elements.messageEl = document.getElementById('message');
    this.elements.messagePopup = document.getElementById('messagePopup');
    this.elements.waitingOverlay = document.getElementById('waitingOverlay');
    this.elements.waitingDismiss = document.getElementById('waitingDismiss');
    
    // Panel elements
    this.elements.historyBox = document.getElementById('historyBox');
    this.elements.historyList = document.getElementById('historyList');
    this.elements.historyClose = document.getElementById('historyClose');
    
    this.elements.definitionBox = document.getElementById('definitionBox');
    this.elements.definitionText = document.getElementById('definitionText');
    this.elements.definitionClose = document.getElementById('definitionClose');
    
    this.elements.chatBox = document.getElementById('chatBox');
    this.elements.chatMessagesEl = document.getElementById('chatMessages');
    this.elements.chatForm = document.getElementById('chatForm');
    this.elements.chatInput = document.getElementById('chatInput');
    this.elements.chatClose = document.getElementById('chatClose');
    this.elements.chatNotify = document.getElementById('chatNotify');
    this.elements.chatMessagePopup = document.getElementById('chatMessagePopup');
    
    // Menu and options elements
    this.elements.optionsToggle = document.getElementById('optionsToggle');
    this.elements.optionsMenu = document.getElementById('optionsMenu');
    this.elements.optionsClose = document.getElementById('optionsClose');
    this.elements.menuHistory = document.getElementById('menuHistory');
    this.elements.menuDefinition = document.getElementById('menuDefinition');
    this.elements.menuChat = document.getElementById('menuChat');
    this.elements.menuDarkMode = document.getElementById('menuDarkMode');
    this.elements.menuSound = document.getElementById('menuSound');
    this.elements.menuInfo = document.getElementById('menuInfo');
    
    // Mobile menu elements
    this.elements.mobileMenuToggle = document.getElementById('mobileMenuToggle');
    this.elements.mobileMenuPopup = document.getElementById('mobileMenuPopup');
    this.elements.mobileMenuClose = document.getElementById('mobileMenuClose');
    this.elements.mobileMenuLeaveLobby = document.getElementById('mobileMenuLeaveLobby');
    this.elements.mobileMenuShareLobby = document.getElementById('mobileMenuShareLobby');
    this.elements.mobileMenuPlayers = document.getElementById('mobileMenuPlayers');
    this.elements.mobileMenuPlayerCount = document.getElementById('mobileMenuPlayerCount');
    this.elements.mobileMenuHistory = document.getElementById('mobileMenuHistory');
    this.elements.mobileMenuDefinition = document.getElementById('mobileMenuDefinition');
    this.elements.mobileMenuChat = document.getElementById('mobileMenuChat');
    this.elements.mobileMenuDarkMode = document.getElementById('mobileMenuDarkMode');
    this.elements.mobileMenuSound = document.getElementById('mobileMenuSound');
    this.elements.mobileMenuInfo = document.getElementById('mobileMenuInfo');
    
    // Reset button elements
    this.elements.holdReset = document.getElementById('holdReset');
    this.elements.holdResetProgress = document.getElementById('holdResetProgress');
    this.elements.holdResetText = document.getElementById('holdResetText');
    
    // Game title and header elements
    this.elements.gameTitle = document.getElementById('gameTitle');
    this.elements.lobbyCodeEl = document.getElementById('lobbyCode');
    this.elements.lobbyHeader = document.getElementById('lobbyHeader');
    this.elements.copyLobbyLink = document.getElementById('copyLobbyLink');
    this.elements.leaveLobby = document.getElementById('leaveLobby');
    
    // Modal and popup elements
    this.elements.closeCallPopup = document.getElementById('closeCallPopup');
    this.elements.closeCallText = document.getElementById('closeCallText');
    this.elements.closeCallOk = document.getElementById('closeCallOk');
    this.elements.infoPopup = document.getElementById('infoPopup');
    this.elements.infoClose = document.getElementById('infoClose');
    this.elements.shareModal = document.getElementById('shareModal');
    this.elements.shareLink = document.getElementById('shareLink');
    this.elements.shareCopy = document.getElementById('shareCopy');
    this.elements.shareClose = document.getElementById('shareClose');
    
    // Player and leaderboard elements
    this.elements.playerSidebar = document.getElementById('playerSidebar');
    this.elements.playerList = document.getElementById('playerList');
    this.elements.playerToggleBtn = document.getElementById('playerToggle');
    this.elements.playerCloseBtn = document.getElementById('playerClose');
    
    // Hint and tooltip elements
    this.elements.titleHintBadge = document.getElementById('titleHintBadge');
    this.elements.hintTooltip = document.getElementById('hintTooltip');
    this.elements.stampContainer = document.getElementById('stampContainer');
  }

  /**
   * Get a DOM element by key
   * @param {string} key - The element key
   * @returns {Element|null} The DOM element or null if not found
   */
  get(key) {
    return this.elements[key] || null;
  }

  /**
   * Get multiple DOM elements by keys
   * @param {string[]} keys - Array of element keys
   * @returns {Object} Object with requested elements
   */
  getMultiple(keys) {
    const result = {};
    keys.forEach(key => {
      result[key] = this.get(key);
    });
    return result;
  }

  /**
   * Check if an element exists and is valid
   * @param {string} key - The element key
   * @returns {boolean} True if element exists and is in DOM
   */
  exists(key) {
    const element = this.get(key);
    return element && document.contains(element);
  }

  /**
   * Set game title if element exists
   * @param {string} title - The title to set
   */
  setGameTitle(title) {
    const gameTitle = this.get('gameTitle');
    if (gameTitle) {
      gameTitle.textContent = title;
    }
  }

  /**
   * Set lobby code if element exists
   * @param {string} code - The lobby code to display
   */
  setLobbyCode(code) {
    const lobbyCodeEl = this.get('lobbyCodeEl');
    if (lobbyCodeEl && code) {
      lobbyCodeEl.textContent = code;
    }
  }

  /**
   * Hide lobby header if no code is available
   */
  hideLobbyHeader() {
    const lobbyHeader = this.get('lobbyHeader');
    if (lobbyHeader) {
      lobbyHeader.style.display = 'none';
    }
  }

  /**
   * Hide close call popup initially
   */
  hideCloseCallPopup() {
    const closeCallPopup = this.get('closeCallPopup');
    if (closeCallPopup) {
      closeCallPopup.style.display = 'none';
    }
  }
}

// Create and export singleton instance
const domManager = new DOMManager();
export default domManager;
