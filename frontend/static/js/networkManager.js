/**
 * Network Manager - Centralized network operations and state synchronization
 * Extracts network polling, event source, and state fetching logic from main.js
 */

import { getState, sendHeartbeat, subscribeToUpdates } from './api.js';
import { showMessage, announce } from './utils.js';

class NetworkManager {
  constructor() {
    // Polling configuration
    this.FAST_INTERVAL = 2000;
    this.SLOW_INTERVAL = 15000;
    this.INACTIVE_DELAY = 60000; // 1 minute
    
    // State tracking
    this.lastActivity = Date.now();
    this.pollTimer = null;
    this.currentInterval = this.FAST_INTERVAL;
    this.eventSource = null;
    this.hadNetworkError = false;
    
    // Callbacks
    this.onStateUpdate = null;
    this.onServerUpdate = null;
    this.messageHandlers = { messageEl: null, messagePopup: null };
  }

  /**
   * Initialize the network manager
   * @param {Object} config - Configuration object
   * @param {Function} config.onStateUpdate - Callback for state updates
   * @param {Function} config.onServerUpdate - Callback for server updates
   * @param {Object} config.messageHandlers - Message display handlers
   */
  initialize(config) {
    this.onStateUpdate = config.onStateUpdate;
    this.onServerUpdate = config.onServerUpdate;
    this.messageHandlers = config.messageHandlers;
  }

  /**
   * Fetch current game state from server
   * @param {string} myEmoji - Current player's emoji
   * @param {string} lobbyCode - Lobby code
   */
  async fetchState(myEmoji, lobbyCode) {
    try {
      const state = await getState(myEmoji, lobbyCode);
      
      if (this.hadNetworkError) {
        showMessage('Reconnected to server.', this.messageHandlers);
      }
      this.hadNetworkError = false;
      
      if (this.onStateUpdate) {
        this.onStateUpdate(state);
      }
    } catch (err) {
      console.error('fetchState error:', err);
      
      if (err && err.status === 404) {
        showMessage('This lobby has expired or was closed.', this.messageHandlers);
        setTimeout(() => { window.location.href = '/'; }, 3000);
        return;
      }
      
      if (!this.hadNetworkError) {
        showMessage('Connection lost. Retrying...', this.messageHandlers);
        this.hadNetworkError = true;
      }
    }
  }

  /**
   * Record user activity and potentially speed up polling
   */
  onActivity(myEmoji, myPlayerId, lobbyCode) {
    this.lastActivity = Date.now();
    
    if (!this.eventSource && this.currentInterval !== this.FAST_INTERVAL) {
      this.startPolling(this.FAST_INTERVAL, myEmoji, lobbyCode);
    }
    
    sendHeartbeat(myEmoji, myPlayerId, lobbyCode);
    this.fetchState(myEmoji, lobbyCode);
  }

  /**
   * Begin polling the server at the given interval for state updates
   * @param {number} interval - Polling interval in milliseconds
   * @param {string} myEmoji - Current player's emoji
   * @param {string} lobbyCode - Lobby code
   */
  startPolling(interval, myEmoji, lobbyCode) {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    
    this.pollTimer = setInterval(() => {
      this.fetchState(myEmoji, lobbyCode);
    }, interval);
    
    this.currentInterval = interval;
  }

  /**
   * Slow down polling when the user has been inactive for a while
   * @param {string} myEmoji - Current player's emoji
   * @param {string} lobbyCode - Lobby code
   */
  checkInactivity(myEmoji, lobbyCode) {
    if (!this.eventSource && 
        Date.now() - this.lastActivity > this.INACTIVE_DELAY && 
        this.currentInterval !== this.SLOW_INTERVAL) {
      this.startPolling(this.SLOW_INTERVAL, myEmoji, lobbyCode);
    }
  }

  /**
   * Handle server update notifications
   * @param {Object} data - Server update notification data
   */
  handleServerUpdateNotification(data) {
    const { message, delay_seconds } = data;
    
    console.log('Server update notification received:', data);
    
    // Show the server update message to the user
    try {
      showMessage(message, this.messageHandlers);
      announce(message);
      console.log('Server update message displayed:', message);
    } catch (error) {
      console.error('Error displaying server update message:', error);
      alert(message); // Fallback
    }
    
    // Close event source to prevent additional messages
    if (this.eventSource) {
      try { 
        this.eventSource.close(); 
        console.log('EventSource closed');
      } catch (error) {
        console.error('Error closing EventSource:', error);
      }
      this.eventSource = null;
    }
    
    // Set a timeout to refresh the page after the specified delay
    const refreshDelayMs = (delay_seconds || 5) * 1000;
    console.log(`Scheduling page refresh in ${refreshDelayMs}ms`);
    
    const refreshTimeout = setTimeout(() => {
      console.log('About to refresh page...');
      
      try {
        showMessage('Refreshing page...', this.messageHandlers);
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
          window.location.href = window.location.href; // Fallback
        }
      }, 1000);
    }, refreshDelayMs);
    
    console.log('Refresh timeout set with ID:', refreshTimeout);
  }

  /**
   * Initialize event stream for real-time updates
   * @param {string} lobbyCode - Lobby code
   * @param {string} myEmoji - Current player's emoji
   */
  initEventStream(lobbyCode, myEmoji) {
    this.eventSource = subscribeToUpdates((data) => {
      // Check if this is a server update notification
      if (data.type === 'server_update') {
        this.handleServerUpdateNotification(data);
        return;
      }
      
      // Normal game state update
      if (this.onStateUpdate) {
        this.onStateUpdate(data);
      }
    }, lobbyCode);
    
    if (this.eventSource) {
      this.eventSource.onerror = () => {
        this.eventSource.close();
        this.eventSource = null;
        this.startPolling(this.FAST_INTERVAL, myEmoji, lobbyCode);
      };
    } else {
      this.startPolling(this.FAST_INTERVAL, myEmoji, lobbyCode);
    }
  }

  /**
   * Setup inactivity checking
   * @param {string} myEmoji - Current player's emoji
   * @param {string} lobbyCode - Lobby code
   */
  setupInactivityCheck(myEmoji, lobbyCode) {
    setInterval(() => {
      this.checkInactivity(myEmoji, lobbyCode);
    }, 5000);
  }

  /**
   * Cleanup network resources
   */
  cleanup() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    
    if (this.eventSource) {
      try { 
        this.eventSource.close(); 
      } catch (error) {
        console.error('Error closing EventSource during cleanup:', error);
      }
      this.eventSource = null;
    }
  }
}

// Create and export singleton instance
const networkManager = new NetworkManager();
export default networkManager;