/**
 * UI notifications and popup management for WordSquad.
 * Handles points delta, tooltips, confetti, and various notification popups.
 */

import { getMyEmoji } from './emoji.js';

let pointsExitTimer;
let pointsHideTimer;
let chatHideTimer;

function showPointsDelta(delta) {
  if (delta === 0) return;
  const popup = document.getElementById('pointsPopup');
  const myEmoji = getMyEmoji();
  const entry = myEmoji && document.getElementById('leaderboard')
    ?.querySelector(`[data-emoji="${myEmoji}"]`);
  const anchor = entry || document.getElementById('holdReset');
  if (!popup || !anchor) return;

  clearTimeout(pointsExitTimer);
  clearTimeout(pointsHideTimer);
  const rect = anchor.getBoundingClientRect();
  popup.style.top = `${rect.top + rect.height / 2 - 10}px`;
  popup.style.left = `${rect.left + rect.width / 2}px`;
  popup.style.zIndex = 'var(--z-popup-message)';
  popup.textContent = `${delta > 0 ? '+' : ''}${delta}`;
  popup.className = delta > 0 ? 'points-positive' : 'points-negative';
  popup.style.display = 'block';
  popup.style.animation = 'none';
  void popup.offsetWidth;
  popup.style.animation = 'scoreSlideFromLeaderboard 180ms ease-out forwards';

  pointsExitTimer = setTimeout(() => {
    popup.style.animation = 'scoreSlideToLeaderboard 180ms ease-in forwards';
    pointsHideTimer = setTimeout(() => { popup.style.display = 'none'; }, 180);
  }, 1500);
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
  if (!message?.emoji || !message.text) return;
  const popup = document.getElementById('chatMessagePopup');
  if (!popup) return;

  clearTimeout(chatHideTimer);
  popup.querySelector('.popup-emoji').textContent = message.emoji;
  popup.querySelector('.popup-text').textContent = message.text;
  popup.style.display = 'flex';
  popup.classList.remove('show');
  void popup.offsetWidth;
  popup.classList.add('show');
  chatHideTimer = setTimeout(() => {
    popup.classList.remove('show');
    popup.style.display = 'none';
  }, 4000);
}

function hideChatNotify() {
  const notify = document.getElementById('chatNotify');
  if (notify) {
    notify.style.display = 'none';
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
  showPointsDelta,
  showHintTooltip,
  hideHintTooltip,
  burstConfetti,
  showChatNotify,
  showChatMessagePopup,
  hideChatNotify,
  showNetworkError,
  hideNetworkError
};
