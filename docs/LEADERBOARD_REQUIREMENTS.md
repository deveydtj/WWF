# Leaderboard Requirements

## Overview
The leaderboard displays player scores and status in real-time during gameplay. It replaces the player count display and provides an interactive, scrollable interface for tracking game progress.

## Functional Requirements

### FR-1: Display Position
- **Requirement**: The leaderboard MUST be positioned where the player count was previously displayed in the lobby header
- **Location**: Replace `#playerCount` span in `#lobbyHeader` 
- **Justification**: Removes redundant player count and provides more valuable score information

### FR-2: Scrolling Behavior
- **Requirement**: The leaderboard MUST be horizontally scrollable when there are more players than can fit in the available space
- **Implementation**: Use `overflow-x: auto` with smooth scrolling behavior
- **Touch Support**: Support touch/swipe scrolling on mobile devices

### FR-3: Auto-Scroll Back Feature
- **Requirement**: The leaderboard MUST automatically scroll back to show the current user's position
- **Trigger**: After 5 seconds of user inactivity (no scrolling)
- **Behavior**: Smooth scroll animation to center the user's emoji in the visible area
- **User Override**: Reset the 5-second timer if user manually scrolls

### FR-4: Non-Intrusive Layout
- **Requirement**: The leaderboard MUST NOT cover or interfere with other UI elements
- **Constraints**: 
  - Must not overlap with control buttons (🔗, 🚪, 👥)
  - Must not interfere with the game board
  - Must not block input controls
- **Max Height**: Limited to prevent vertical space conflicts

### FR-5: Player Identification
- **Requirement**: The current user's entry MUST be clearly highlighted
- **Visual Treatment**: Special styling (border, background, or other distinguishing features)
- **Always Visible**: When auto-scrolling, center on current user's position

## Technical Requirements

### TR-1: Responsive Design
- **Mobile Support**: Horizontal scrolling with touch gestures
- **Tablet Support**: Appropriate sizing for medium screen layouts  
- **Desktop Support**: Full functionality with mouse scrolling

### TR-2: Performance
- **Smooth Scrolling**: Use `scroll-behavior: smooth` for animations
- **Efficient Updates**: Only re-render when leaderboard data changes
- **Memory Management**: Proper cleanup of scroll event listeners

### TR-3: Accessibility
- **ARIA Labels**: Proper semantic markup for screen readers
- **Keyboard Navigation**: Support for keyboard-only users where applicable
- **Focus Management**: Maintain focus states during interactions

## Existing Features to Preserve

### EF-1: Score Display
- Show player emoji and current score
- Highlight score changes with animation
- Sort by score (highest to lowest)

### EF-2: Player Status
- Mark inactive players with reduced opacity/grayscale
- Show hint badges for players with available hints
- Real-time updates via Server-Sent Events

### EF-3: Emoji Styling
- Support for emoji variants and base emoji display
- Apply proper styling for different emoji types
- Consistent sizing and positioning

## Implementation Notes

### Files Modified
- `frontend/game.html` - **COMPLETED**: Moved leaderboard div to lobby header, removed playerCount
- `frontend/static/css/components/leaderboard.css` - **COMPLETED**: Updated positioning and scrolling styles
- `frontend/static/js/leaderboardManager.js` - **COMPLETED**: Added 5-second auto-scroll functionality
- `frontend/static/js/domManager.js` - **COMPLETED**: Removed player count functionality

### Key Functions
- `renderLeaderboard()` - Update leaderboard display in header position
- `centerLeaderboardOnMe()` - Scroll to current user's position
- `setupLeaderboardScrolling()` - Initialize auto-scroll functionality (5-second delay)
- `setupMobileLeaderboard()` - Configure leaderboard for all screen sizes

### CSS Classes
- `.leaderboard-entry` - Individual player entries
- `.leaderboard-entry.current-player` - Highlight current user
- `.leaderboard-container` - Container for proper positioning

## Testing Requirements

### Manual Testing
1. Create lobby with multiple players
2. Verify leaderboard appears in header area
3. Test horizontal scrolling behavior
4. Verify 5-second auto-scroll back to user
5. Confirm no UI overlap or button blocking
6. Test on mobile, tablet, and desktop viewports

### Edge Cases
- Single player (leaderboard with one entry)
- Many players (10+ entries requiring scroll)
- Long player names or high scores
- Rapid score updates during gameplay
- Window resize during gameplay

## Success Criteria
- [ ] Leaderboard replaces player count in lobby header
- [ ] Horizontal scrolling works smoothly
- [ ] 5-second auto-scroll back to user position functions correctly
- [ ] No UI elements are covered or blocked
- [ ] All existing leaderboard features continue to work
- [ ] Responsive design works across all device types
- [ ] Performance remains smooth during real-time updates