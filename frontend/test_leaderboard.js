// Test leaderboard data injection
console.log("Adding test leaderboard data...");

// Mock leaderboard data with current player in the middle
window.leaderboard = [
  { emoji: '🐱', score: 45, last_active: Date.now() / 1000 },
  { emoji: '🐶', score: 38, last_active: Date.now() / 1000 },
  { emoji: '🦊', score: 52, last_active: Date.now() / 1000 },
  { emoji: '👤', score: 41, last_active: Date.now() / 1000 }, // Current player
  { emoji: '🐼', score: 39, last_active: Date.now() / 1000 },
  { emoji: '🦀', score: 47, last_active: Date.now() / 1000 },
  { emoji: '🐸', score: 33, last_active: Date.now() / 1000 },
  { emoji: '🦋', score: 56, last_active: Date.now() / 1000 }
];

// Set current player emoji
window.myEmoji = '👤';

// Call renderLeaderboard to update the display
if (window.renderLeaderboard) {
  window.renderLeaderboard();
  console.log("Leaderboard rendered with test data");
} else {
  console.log("renderLeaderboard function not found");
}
