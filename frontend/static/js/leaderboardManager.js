/**
 * Leaderboard rendering and management for WordSquad.
 * Handles player list, emoji rendering, and leaderboard interactions.
 */

import { getMyEmoji, applyEmojiVariantStyling, getBaseEmoji } from './emoji.js';
import { updateHintBadge } from './hintBadge.js';

let leaderboard = [];
let prevLeaderboard = {};
let leaderboardScrolling = false;
let leaderboardScrollTimeout = null;

function centerLeaderboardOnMe() {
  const myEmoji = getMyEmoji();
  if (!myEmoji) return;
  
  const leaderboardDiv = document.getElementById('leaderboard');
  if (!leaderboardDiv) return;
  
  const myEntry = leaderboardDiv.querySelector(`[data-emoji="${myEmoji}"]`);
  if (!myEntry) return;
  
  myEntry.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function setupMobileLeaderboard() {
  const leaderboardDiv = document.getElementById('leaderboard');
  if (!leaderboardDiv) return;
  
  // Add scroll detection for mobile
  leaderboardDiv.addEventListener('scroll', () => {
    leaderboardScrolling = true;
    
    clearTimeout(leaderboardScrollTimeout);
    leaderboardScrollTimeout = setTimeout(() => {
      leaderboardScrolling = false;
    }, 1000);
  });
  
  // Auto-center on me button for mobile
  const centerBtn = document.createElement('button');
  centerBtn.textContent = '📍 Find Me';
  centerBtn.className = 'center-me-btn';
  centerBtn.onclick = centerLeaderboardOnMe;
  centerBtn.setAttribute('aria-label', 'Scroll to my position in leaderboard');
  
  // Only show on mobile
  if (window.innerWidth <= 600) {
    const leaderboardContainer = leaderboardDiv.parentElement;
    if (leaderboardContainer) {
      leaderboardContainer.appendChild(centerBtn);
    }
  }
}

function renderLeaderboard() {
  const leaderboardDiv = document.getElementById('leaderboard');
  if (!leaderboardDiv) return;
  
  const myEmoji = getMyEmoji();
  const sortedEntries = leaderboard
    .map(([emoji, data]) => ({ emoji, ...data }))
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  
  leaderboardDiv.innerHTML = '';
  
  sortedEntries.forEach(({ emoji, score = 0, last_active, hint_count = 0, player_id }) => {
    const entry = document.createElement('div');
    entry.className = 'leaderboard-entry';
    entry.setAttribute('data-emoji', emoji);
    entry.setAttribute('data-player-id', player_id);
    
    // Highlight current player
    if (emoji === myEmoji) {
      entry.classList.add('current-player');
    }
    
    // Mark inactive players
    const now = Date.now() / 1000;
    const inactiveCutoff = 5 * 60; // 5 minutes
    const isInactive = last_active && (now - last_active > inactiveCutoff);
    
    if (isInactive) {
      entry.classList.add('inactive');
    }
    
    // Create emoji display with variant styling
    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'player-emoji';
    emojiSpan.textContent = getBaseEmoji(emoji);
    applyEmojiVariantStyling(emojiSpan, emoji);
    
    // Add hint badge if player has unused hints
    if (hint_count > 0) {
      updateHintBadge(emojiSpan, hint_count);
    }
    
    // Create score display
    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'player-score';
    scoreSpan.textContent = score;
    
    // Check for score changes and animate
    const prevScore = prevLeaderboard[emoji]?.score || 0;
    if (score > prevScore) {
      scoreSpan.classList.add('score-increase');
      setTimeout(() => {
        scoreSpan.classList.remove('score-increase');
      }, 1000);
    }
    
    entry.appendChild(emojiSpan);
    entry.appendChild(scoreSpan);
    
    // Add click handler for admin actions (if applicable)
    entry.addEventListener('click', () => {
      if (entry.getAttribute('data-player-id') !== getMyPlayerId()) {
        // Could add admin/host functionality here
      }
    });
    
    leaderboardDiv.appendChild(entry);
  });
  
  // Update previous leaderboard state
  prevLeaderboard = Object.fromEntries(
    leaderboard.map(([emoji, data]) => [emoji, { ...data }])
  );
  
  // Auto-scroll to current player on mobile (but not if user is manually scrolling)
  if (window.innerWidth <= 600 && !leaderboardScrolling && myEmoji) {
    setTimeout(() => {
      if (!leaderboardScrolling) {
        centerLeaderboardOnMe();
      }
    }, 100);
  }
}

function renderPlayerSidebar() {
  const sidebarDiv = document.getElementById('playerSidebar');
  if (!sidebarDiv) return;
  
  const myEmoji = getMyEmoji();
  
  // Find current player's data
  const myData = leaderboard.find(([emoji]) => emoji === myEmoji);
  if (!myData) {
    sidebarDiv.innerHTML = '<div class="no-player">No player data</div>';
    return;
  }
  
  const [, { score = 0, hint_count = 0, last_active }] = myData;
  
  // Create player info display
  const playerInfo = document.createElement('div');
  playerInfo.className = 'player-info';
  
  const emojiEl = document.createElement('div');
  emojiEl.className = 'sidebar-emoji';
  emojiEl.textContent = getBaseEmoji(myEmoji);
  applyEmojiVariantStyling(emojiEl, myEmoji);
  
  if (hint_count > 0) {
    updateHintBadge(emojiEl, hint_count);
  }
  
  const scoreEl = document.createElement('div');
  scoreEl.className = 'sidebar-score';
  scoreEl.innerHTML = `<strong>Score:</strong> ${score}`;
  
  const hintsEl = document.createElement('div');
  hintsEl.className = 'sidebar-hints';
  hintsEl.innerHTML = `<strong>Hints:</strong> ${hint_count}`;
  
  playerInfo.appendChild(emojiEl);
  playerInfo.appendChild(scoreEl);
  playerInfo.appendChild(hintsEl);
  
  sidebarDiv.innerHTML = '';
  sidebarDiv.appendChild(playerInfo);
}

function renderEmojiStamps(guesses) {
  const stampsDiv = document.getElementById('stampContainer');
  if (!stampsDiv) return;
  
  stampsDiv.innerHTML = '';
  
  guesses.forEach((guess, index) => {
    if (!guess.emoji) return;
    
    const stamp = document.createElement('div');
    stamp.className = 'emoji-stamp';
    stamp.setAttribute('data-guess-index', index);
    // Position stamp to center on the corresponding row
    // Each row is: tile height + gap, centered on the tile
    stamp.style.top = `calc(${index} * (var(--tile-size) + var(--tile-gap)) + var(--tile-size) / 2)`;
    stamp.style.transform = 'translateY(-50%)';
    
    const emojiSpan = document.createElement('span');
    emojiSpan.textContent = getBaseEmoji(guess.emoji);
    applyEmojiVariantStyling(emojiSpan, guess.emoji);
    
    // No word labels - just the emoji
    stamp.appendChild(emojiSpan);
    
    stampsDiv.appendChild(stamp);
  });
}

function updateLeaderboard(newLeaderboard) {
  leaderboard = newLeaderboard || [];
  renderLeaderboard();
  renderPlayerSidebar();
}

function getLeaderboard() {
  return leaderboard;
}

function getPlayerRank(emoji) {
  const sortedEntries = leaderboard
    .map(([e, data]) => ({ emoji: e, score: data.score || 0 }))
    .sort((a, b) => b.score - a.score);
  
  return sortedEntries.findIndex(entry => entry.emoji === emoji) + 1;
}

export {
  centerLeaderboardOnMe,
  setupMobileLeaderboard,
  renderLeaderboard,
  renderPlayerSidebar,
  renderEmojiStamps,
  updateLeaderboard,
  getLeaderboard,
  getPlayerRank
};