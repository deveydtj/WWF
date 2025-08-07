# Frontend JavaScript Architecture

This document describes the refactored modular architecture of the frontend JavaScript codebase.

## Overview

The main.js file has been refactored from a single 1060-line file into a modular architecture with 5 focused modules, reducing the main.js to just 299 lines (72% reduction). This improves maintainability, testability, and code organization.

## Module Structure

### 1. DOM Manager (`domManager.js`) - 179 lines
**Purpose**: Centralized DOM element references and utilities

**Key Features**:
- Single point of access for all DOM elements
- Element existence checking
- Helper methods for common DOM operations (setGameTitle, setLobbyCode, etc.)
- Eliminates scattered `document.getElementById` calls

**Usage**:
```javascript
import domManager from './domManager.js';

const board = domManager.get('board');
domManager.setGameTitle('My Game');
```

### 2. Network Manager (`networkManager.js`) - 240 lines
**Purpose**: Centralized network operations and state synchronization

**Key Features**:
- State fetching with error handling
- Polling management (fast/slow intervals)
- Event source management for real-time updates
- Activity tracking and inactivity detection
- Server update notification handling

**Usage**:
```javascript
networkManager.initialize({
  onStateUpdate: (state) => gameStateManager.applyState(state),
  messageHandlers: { messageEl, messagePopup }
});
```

### 3. Game State Manager (`gameStateManager.js`) - 340 lines
**Purpose**: Centralized game state application and management

**Key Features**:
- Complex `applyState` logic extracted from main.js
- State tracking (activeEmojis, leaderboard, latestState)
- Daily double state management
- UI component rendering coordination
- Game configuration management

**Usage**:
```javascript
gameStateManager.initialize({
  gameState,
  domManager,
  myEmoji,
  messageHandlers
});
gameStateManager.applyState(serverState);
```

### 4. Event Listeners Manager (`eventListenersManager.js`) - 526 lines
**Purpose**: Centralized event listener setup and management

**Key Features**:
- Panel event listeners (history, definition, chat)
- Options menu event listeners
- Modal and popup event listeners
- Complex chat focus management
- Activity monitoring
- Lobby-specific event handling

**Usage**:
```javascript
eventListenersManager.initialize({
  domManager,
  networkManager,
  gameStateManager,
  lobbyCode,
  messageHandlers
});
```

### 5. App Initializer (`appInitializer.js`) - 607 lines
**Purpose**: Centralized application initialization and setup

**Key Features**:
- Complete initialization sequence
- Manager initialization and coordination
- Board and scaling system setup
- Window event handlers
- User preference application
- Network and game state initialization

**Usage**:
```javascript
const success = await appInitializer.initialize({
  domManager,
  networkManager,
  gameStateManager,
  eventListenersManager
});
```

### 6. Main.js (`main.js`) - 299 lines (72% reduction!)
**Purpose**: Application entry point and high-level coordination

**Key Features**:
- Minimal imports focused on core functionality
- Guess submission handling
- Emoji modal logic
- Board hint listeners
- App startup coordination

## Benefits of the Refactoring

### 1. **Maintainability**
- Each module has a single responsibility
- Clear boundaries between different concerns
- Easier to locate and modify specific functionality

### 2. **Testability**
- Modules can be tested in isolation
- Dependencies are clearly defined through constructor injection
- Easier to mock dependencies for unit testing

### 3. **Readability**
- Much smaller files that are easier to understand
- Clear naming conventions
- Well-organized functionality

### 4. **Scalability**
- New features can be added to appropriate modules
- Easy to extend existing functionality
- Clear patterns for future development

### 5. **Debugging**
- Easier to trace issues to specific modules
- Better separation of concerns
- Clearer stack traces

## Module Dependencies

```
main.js
├── domManager.js (no dependencies)
├── networkManager.js
│   └── depends on: api.js, utils.js
├── gameStateManager.js
│   └── depends on: board.js, history.js, chat.js, leaderboardManager.js, etc.
├── eventListenersManager.js
│   └── depends on: utils.js, panelManager.js, optionsManager.js, etc.
└── appInitializer.js
    └── depends on: all above modules + board.js, emoji.js, etc.
```

## Migration Notes

The refactoring maintains full backward compatibility with the existing API and functionality. All existing features work exactly as before, but the code is now much more organized and maintainable.

### Files Created
- `frontend/static/js/domManager.js`
- `frontend/static/js/networkManager.js`
- `frontend/static/js/gameStateManager.js`
- `frontend/static/js/eventListenersManager.js`
- `frontend/static/js/appInitializer.js`

### Files Modified
- `frontend/static/js/main.js` (significantly reduced)

### Files Preserved
- `frontend/static/js/main_old.js` (backup of original main.js)
- `frontend/static/js/main.js.backup` (additional backup)

## Future Improvements

1. **Add comprehensive unit tests** for each module
2. **Create integration tests** to verify module interactions
3. **Add JSDoc documentation** for all public methods
4. **Consider TypeScript migration** for better type safety
5. **Add performance monitoring** for each module
6. **Create development tools** for debugging module interactions

This refactoring significantly improves the codebase quality while maintaining all existing functionality.