# Emoji Selection Requirements

## Overview
The emoji selection system allows players to choose their character representation in WordSquad. This document defines the requirements for when and how players can select or change their emoji.

## Functional Requirements

### FR-1: Landing Page Emoji Selection
- **Requirement**: Users MUST be able to select and change their emoji from the landing page
- **Location**: Landing page emoji display element with "Click to change" functionality
- **Behavior**: Clicking the emoji display opens the emoji picker modal
- **Persistence**: Selected emoji is stored in localStorage and persists across sessions

### FR-2: No In-Game Emoji Changes
- **Requirement**: Users MUST NOT be able to change their emoji while participating in an active game
- **Rationale**: 
  - Prevents confusion for other players
  - Maintains consistency during gameplay
  - Avoids potential game state conflicts
- **Implementation**: Emoji modal only appears for users who don't have an emoji selected

### FR-3: New Player Emoji Selection
- **Requirement**: Users who enter a game without a previously selected emoji MUST be prompted to choose one
- **Trigger**: User joins a lobby without an emoji in localStorage
- **Behavior**: Emoji picker modal appears automatically upon game entry
- **Mandatory**: User cannot proceed without selecting an emoji

### FR-4: Exit-to-Change Workflow  
- **Requirement**: Users who want to change their emoji during gameplay MUST exit to the landing page
- **Process**:
  1. User clicks "Leave Lobby" button
  2. User returns to landing page
  3. User clicks their emoji display to change it
  4. User rejoins lobby with new emoji
- **Justification**: Ensures clean state transitions and prevents mid-game disruption

## Technical Requirements

### TR-1: Emoji State Management
- **Storage**: Use localStorage with key 'myEmoji' for persistence
- **Validation**: Ensure selected emoji exists in the allEmojis array
- **Cleanup**: Clear emoji state when user explicitly leaves lobby

### TR-2: Modal Behavior
- **New Users Only**: `handleEmojiModal()` only shows picker if `!myEmoji`
- **Automatic Closure**: Close any existing modal if user already has an emoji
- **No Bypass**: Remove `showEmojiModalOnNextFetch` functionality

### TR-3: Landing Page Integration
- **Display Update**: Update emoji display element with proper ARIA labels
- **Click Handler**: Enable emoji changing via click event on landing page
- **Visual Feedback**: Show placeholder (👤) when no emoji is selected

## Removed Functionality

### RF-1: In-Game Emoji Changes
- **Removed**: `showEmojiModalOnNextFetch` variable and related logic
- **Removed**: Emoji modal display for users who already have an emoji
- **Removed**: Ability to change emoji if `haveMy` check fails during gameplay

### RF-2: Automatic Emoji Reassignment  
- **Removed**: Automatic emoji picker display when selected emoji is taken by another user
- **Behavior**: Users keep their selected emoji (with variant if needed)
- **Fallback**: Only prompt for selection if user has no emoji at all

## Error Handling

### EH-1: Missing Emoji Function
- **Fixed**: Added `getMyPlayerId` import to `leaderboardManager.js`
- **Error**: "ReferenceError: getMyPlayerId is not defined"
- **Resolution**: Import function from `emoji.js` module

### EH-2: Invalid Emoji Selection
- **Validation**: Ensure emoji exists in allEmojis array before setting
- **Fallback**: Show error message and require valid selection
- **Persistence**: Only store valid emoji selections

## Implementation Details

### Files Modified
- `frontend/static/js/main.js` - Modified `handleEmojiModal()` function
- `frontend/static/js/leaderboardManager.js` - Added missing `getMyPlayerId` import
- This requirements document - Created to document the behavior

### Key Functions
- `handleEmojiModal(activeEmojis)` - Now only shows picker for users without emoji
- `getMyEmoji()` - Retrieves stored emoji from localStorage  
- `setMyEmoji(emoji)` - Stores emoji selection in localStorage
- `showEmojiModal()` - Displays emoji picker with available options

### Code Changes
```javascript
// OLD: Allowed emoji changes during gameplay
if (!myEmoji || !haveMy || showEmojiModalOnNextFetch) {
  showEmojiModal(/* ... */);
}

// NEW: Only for users without any emoji
if (!myEmoji) {
  showEmojiModal(/* ... */);
}
```

## Testing Requirements

### Manual Testing
1. **New User Flow**:
   - Clear localStorage emoji data
   - Join a lobby
   - Verify emoji picker appears
   - Select an emoji and verify game proceeds

2. **Existing User Flow**:
   - Set emoji in localStorage
   - Join a lobby  
   - Verify no emoji picker appears
   - Verify selected emoji is used

3. **Change Emoji Flow**:
   - Join lobby with existing emoji
   - Leave lobby via "🚪" button
   - Return to landing page
   - Click emoji display to change
   - Rejoin lobby with new emoji

4. **Error Prevention**:
   - Verify no emoji picker during active gameplay
   - Confirm leaderboard functions without errors
   - Test build process completes successfully

### Automated Tests
- Frontend build validation: `npm run build`
- Backend test suite: `python -m pytest`
- JavaScript module loading verification

## Success Criteria
- [x] Fix "getMyPlayerId is not defined" error in leaderboard
- [x] Remove ability to change emoji during active gameplay
- [x] Preserve emoji selection for new users entering without emoji
- [x] Maintain landing page emoji changing functionality
- [x] Frontend builds successfully without errors
- [x] Document requirements in requirements directory
- [ ] Manual testing verification
- [ ] User acceptance testing with representative workflows

## Related Issues
- Original error: "Uncaught ReferenceError: getMyPlayerId is not defined at leaderboardManager.js:153"
- User request: Remove in-game emoji changing, preserve landing page functionality
- Requirement: Users must exit game to change emoji selection