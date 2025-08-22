/**
 * UI notifications and popup management for WordSquad.
 * Handles points delta, tooltips, confetti, and various notification popups.
 */

import { playClick } from './audioManager.js';
import { isMobileView } from './utils.js';
import { getMyEmoji } from './emoji.js';

function updateInputVisibility() {
  const guessInput = document.getElementById('guessInput');
  const resetButton = document.getElementById('resetButton');
  
  if (!guessInput || !resetButton) return;
  
  // Hide input and reset button when keyboard is showing to save space
  const keyboardVisible = document.body.classList.contains('keyboard-showing');
  
  if (keyboardVisible) {
    guessInput.style.display = 'none';
    resetButton.style.display = 'none';
  } else {
    guessInput.style.display = '';
    resetButton.style.display = '';
  }
}

function showPointsDelta(delta) {
  if (delta === 0) return;
  
  const popup = document.getElementById('pointsPopup');
  if (!popup) return;
  
  // Check if we're in mobile view
  const isMobile = isMobileView();
  
  let anchorElement, anchorRect;
  
  if (isMobile) {
    // On mobile, use the current player's leaderboard entry as anchor
    const myEmoji = getMyEmoji();
    if (myEmoji) {
      const leaderboardDiv = document.getElementById('leaderboard');
      const myEntry = leaderboardDiv?.querySelector(`[data-emoji="${myEmoji}"]`);
      if (myEntry) {
        anchorElement = myEntry;
        anchorRect = myEntry.getBoundingClientRect();
      }
    }
    
    // Fallback to reset button if leaderboard entry not found
    if (!anchorElement) {
      anchorElement = document.getElementById('holdReset') || document.getElementById('resetWrapper');
      anchorRect = anchorElement?.getBoundingClientRect();
    }
  } else {
    // Desktop: use reset button as before
    anchorElement = document.getElementById('holdReset') || document.getElementById('resetWrapper');
    anchorRect = anchorElement?.getBoundingClientRect();
  }
  
  if (!anchorElement || !anchorRect) return;
  
  // Position popup based on device type
  if (isMobile) {
    // Position popup to start under the leaderboard tile (hidden)
    popup.style.top = `${anchorRect.top + anchorRect.height / 2 - 10}px`;
    popup.style.left = `${anchorRect.left + anchorRect.width / 2}px`;
    popup.style.transform = 'translateX(-50%) scale(0.8)';
    // Set z-index one below leaderboard tile
    popup.style.zIndex = 'var(--z-points-popup-mobile)';
  } else {
    // Desktop: position next to reset button as before
    popup.style.top = `${anchorRect.top + anchorRect.height / 2 - 20}px`;
    popup.style.left = `${anchorRect.right}px`;
    popup.style.transform = 'translateX(0) scale(0.8)';
    popup.style.zIndex = '150';
  }
  
  const sign = delta > 0 ? '+' : '';
  popup.textContent = `${sign}${delta}`;
  popup.className = delta > 0 ? 'points-positive' : 'points-negative';
  popup.style.display = 'block';
  
  // Reset any existing animation
  popup.style.animation = '';
  
  // Animate the popup based on device type
  if (isMobile) {
    // Mobile: slide out from under leaderboard tile with quick ease-in at start
    popup.style.animation = 'scoreSlideFromLeaderboard 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards';
    
    setTimeout(() => {
      // Animate the popup sliding back under leaderboard tile with bounce effect
      popup.style.animation = 'scoreSlideToLeaderboard 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
      setTimeout(() => {
        popup.style.display = 'none';
      }, 400);
    }, 1500);
  } else {
    // Desktop: slide from reset button as before
    popup.style.animation = 'scoreSlideFromReset 0.4s ease-out forwards';
    
    setTimeout(() => {
      // Animate the popup sliding back to reset button
      popup.style.animation = 'scoreSlideToReset 0.4s ease-in forwards';
      setTimeout(() => {
        popup.style.display = 'none';
      }, 400);
    }, 1500);
  }
}

function showHintTooltip(text) {
  const tooltip = document.getElementById('hintTooltip');
  if (tooltip && text) {
    tooltip.textContent = text;
    tooltip.style.display = 'block';
  }
}

function hideHintTooltip() {
  const tooltip = document.getElementById('hintTooltip');
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

function burstConfetti(row, col) {
  const board = document.getElementById('board');
  if (!board) return;
  
  const tile = board.querySelector(`[data-row="${row}"][data-col="${col}"]`);
  if (!tile) return;
  
  const rect = tile.getBoundingClientRect();
  const boardRect = board.getBoundingClientRect();
  
  // Create confetti particles
  for (let i = 0; i < 8; i++) {
    const particle = document.createElement('div');
    particle.className = 'confetti-particle';
    particle.style.left = (rect.left - boardRect.left + rect.width / 2) + 'px';
    particle.style.top = (rect.top - boardRect.top + rect.height / 2) + 'px';
    
    // Random colors and animations
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3'];
    particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    
    const angle = (i / 8) * 2 * Math.PI;
    const distance = 30 + Math.random() * 20;
    const finalX = Math.cos(angle) * distance;
    const finalY = Math.sin(angle) * distance;
    
    particle.style.setProperty('--final-x', finalX + 'px');
    particle.style.setProperty('--final-y', finalY + 'px');
    
    board.appendChild(particle);
    
    // Remove particle after animation
    setTimeout(() => {
      if (particle.parentNode) {
        particle.parentNode.removeChild(particle);
      }
    }, 1000);
  }
  
  // Add CSS animation if not already present
  if (!document.getElementById('confetti-styles')) {
    const style = document.createElement('style');
    style.id = 'confetti-styles';
    style.textContent = `
      .confetti-particle {
        position: absolute;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        pointer-events: none;
        animation: confetti-burst 1s ease-out forwards;
        z-index: 1000;
      }
      @keyframes confetti-burst {
        0% {
          transform: translate(0, 0) scale(1);
          opacity: 1;
        }
        100% {
          transform: translate(var(--final-x), var(--final-y)) scale(0);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

function showChatNotify() {
  const notify = document.getElementById('chatNotify');
  if (notify) {
    notify.style.display = 'block';
    // Auto-hide after a delay
    setTimeout(() => {
      hideChatNotify();
    }, 5000);
  }
}

function showChatMessagePopup(message) {
  if (!message || !message.emoji || !message.text || !message.timestamp) return;
  
  const popup = document.getElementById('chatMessagePopup');
  if (!popup) return;
  
  // Format timestamp
  const date = new Date(message.timestamp * 1000);
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  // Update popup content
  const emojiEl = popup.querySelector('.popup-emoji');
  const textEl = popup.querySelector('.popup-text');
  const timeEl = popup.querySelector('.popup-time');
  
  if (emojiEl) emojiEl.textContent = message.emoji;
  if (textEl) textEl.textContent = message.text;
  if (timeEl) timeEl.textContent = timeStr;
  
  // Show popup with animation
  popup.style.display = 'block';
  popup.classList.add('show');
  
  // Auto-hide after delay
  setTimeout(() => {
    popup.classList.remove('show');
    setTimeout(() => {
      popup.style.display = 'none';
    }, 300);
  }, 3000);
}

function hideChatNotify() {
  const notify = document.getElementById('chatNotify');
  if (notify) {
    notify.style.display = 'none';
  }
}

// Close-call notification for near-simultaneous wins
function showCloseCallNotification() {
  const popup = document.getElementById('closeCallPopup');
  if (popup) {
    popup.style.display = 'block';
    setTimeout(() => {
      popup.style.display = 'none';
    }, 4000);
  }
}

function hideCloseCallNotification() {
  const popup = document.getElementById('closeCallPopup');
  if (popup) {
    popup.style.display = 'none';
  }
}

// Network error notification
function showNetworkError() {
  const errorDiv = document.getElementById('networkError');
  if (errorDiv) {
    errorDiv.style.display = 'block';
  }
}

function hideNetworkError() {
  const errorDiv = document.getElementById('networkError');
  if (errorDiv) {
    errorDiv.style.display = 'none';
  }
}

export {
  updateInputVisibility,
  showPointsDelta,
  showHintTooltip,
  hideHintTooltip,
  burstConfetti,
  showChatNotify,
  showChatMessagePopup,
  hideChatNotify,
  showCloseCallNotification,
  hideCloseCallNotification,
  showNetworkError,
  hideNetworkError
};