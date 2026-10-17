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

const HINT_TOOLTIP_MS = 6000;
let hintTooltipRow = null;
let hintTooltipTimer;

/**
 * Point the hint tooltip at a board row. It sits just below the row (above
 * it for the final row) so it never hides the tiles the player should tap.
 */
function positionHintTooltip(row = hintTooltipRow) {
  const tooltip = document.getElementById('hintTooltip');
  const board = document.getElementById('board');
  const area = document.getElementById('boardArea') || board?.parentElement;
  if (!tooltip || !board || !area || row === null || tooltip.style.display === 'none') return;
  const first = board.children[row * 5];
  const last = board.children[row * 5 + 4];
  if (!first || !last) return;
  const areaRect = area.getBoundingClientRect();
  const rowTop = first.getBoundingClientRect().top - areaRect.top;
  const rowBottom = first.getBoundingClientRect().bottom - areaRect.top;
  const centre = (first.getBoundingClientRect().left + last.getBoundingClientRect().right) / 2 - areaRect.left;
  const rows = Math.floor(board.children.length / 5);
  const above = row >= rows - 1;
  tooltip.dataset.placement = above ? 'above' : 'below';
  tooltip.style.left = `${centre}px`;
  tooltip.style.bottom = 'auto';
  tooltip.style.top = above ? `${rowTop - 10}px` : `${rowBottom + 10}px`;
}

function showHintTooltip(text, row = null) {
  const tooltip = document.getElementById('hintTooltip');
  if (!tooltip || !text) return;
  tooltip.textContent = text;
  tooltip.style.display = 'block';
  hintTooltipRow = row;
  positionHintTooltip(row);
  clearTimeout(hintTooltipTimer);
  // The highlighted row and the 🔍 badge remain as the lasting reminder.
  hintTooltipTimer = setTimeout(hideHintTooltip, HINT_TOOLTIP_MS);
}

function hideHintTooltip() {
  clearTimeout(hintTooltipTimer);
  hintTooltipRow = null;
  const tooltip = document.getElementById('hintTooltip');
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

/** Keep an open hint tooltip on its row as the row or the layout changes. */
function moveHintTooltip(row) {
  if (hintTooltipRow === null) return;
  if (row === null) {
    hideHintTooltip();
    return;
  }
  hintTooltipRow = row;
  positionHintTooltip(row);
}

/** Ring the Daily Double tile once it has flipped green. */
function glowDailyDoubleTile(row, col) {
  const tile = document.getElementById('board')?.children[row * 5 + col];
  if (!tile) return;
  tile.classList.remove('dd-glow');
  void tile.offsetWidth;
  tile.classList.add('dd-glow');
  const done = () => tile.classList.remove('dd-glow');
  tile.addEventListener('animationend', (e) => { if (e.pseudoElement) done(); }, { once: true });
  setTimeout(done, 2000);
}

function burstConfetti(row, col) {
  const board = document.getElementById('board');
  const area = document.getElementById('boardArea') || board?.parentElement;
  const tile = board?.children[row * 5 + col];
  if (!area || !tile) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  // Particles live beside the board so they never become board children.
  const rect = tile.getBoundingClientRect();
  const areaRect = area.getBoundingClientRect();
  const originX = rect.left - areaRect.left + rect.width / 2;
  const originY = rect.top - areaRect.top + rect.height / 2;
  const styles = getComputedStyle(document.body);
  const colors = [
    styles.getPropertyValue('--correct-bg').trim() || '#6aaa64',
    styles.getPropertyValue('--present-bg').trim() || '#c9b458',
    '#64f696'
  ];
  const count = 14;

  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'confetti-particle';
    particle.style.left = `${originX}px`;
    particle.style.top = `${originY}px`;
    particle.style.backgroundColor = colors[i % colors.length];

    const angle = (i / count) * 2 * Math.PI + Math.random() * 0.4;
    const distance = rect.width * (0.7 + Math.random() * 0.6);
    particle.style.setProperty('--final-x', `${Math.cos(angle) * distance}px`);
    particle.style.setProperty('--final-y', `${Math.sin(angle) * distance}px`);
    particle.style.setProperty('--spin', `${Math.round(Math.random() * 360 - 180)}deg`);

    area.appendChild(particle);
    particle.addEventListener('animationend', () => particle.remove(), { once: true });
    setTimeout(() => particle.remove(), 1500);
  }
}

function showChatNotify() {
  const notify = document.getElementById('chatNotify');
  if (notify) {
    notify.style.display = 'block';
    // A short wiggle draws the eye to a new message.
    notify.classList.remove('wiggle');
    void notify.offsetWidth;
    notify.classList.add('wiggle');
    notify.addEventListener('animationend', () => notify.classList.remove('wiggle'), { once: true });
    // The chat button stays put; it is hidden only while chat is open.
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
  moveHintTooltip,
  positionHintTooltip,
  glowDailyDoubleTile,
  burstConfetti,
  showChatNotify,
  showChatMessagePopup,
  hideChatNotify,
  showNetworkError,
  hideNetworkError
};
