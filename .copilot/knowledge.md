# Technical Knowledge Base

## API Endpoints Reference

### Lobby Management
- `GET /lobby/<id>/state` - Get current lobby state
- `POST /lobby/<id>/state` - Heartbeat to mark player active
- `POST /lobby/<id>/emoji` - Claim or change player emoji
- `POST /lobby/<id>/guess` - Submit a word guess
- `POST /lobby/<id>/reset` - Start new round (requires host token)
- `POST /lobby/<id>/kick` - Remove player (requires host token)
- `POST /lobby/<id>/leave` - Leave the current lobby
- `GET /lobby/<id>/stream` - Server-Sent Events stream
- `GET /lobby/<id>/chat` - Get chat messages
- `POST /lobby/<id>/chat` - Send chat message

### Lobby Discovery and Creation
- `POST /lobby` - Create new lobby
- `GET /lobbies` - List all active lobbies
- `GET /lobbies/network` - List lobbies from same network

### Game Features
- `POST /hint` - Daily Double hint selection (global endpoint)
- `POST /lobby/<id>/hint` - Daily Double hint selection (lobby-specific)

### System Endpoints
- `GET /health` - Health check for monitoring
- `POST /internal/purge` - Cleanup idle lobbies (maintenance)
- `POST /admin/notify-update` - Notify clients of server updates

### Request/Response Patterns
All POST requests should include `player_id` in the JSON body. The server responds with updated game state or error messages.

## Frontend Module Architecture

### Core Modules
- `board.js` - Game board rendering and validation
- `emoji.js` - Player emoji management and modal
- `api.js` - Server communication and API calls  
- `utils.js` - UI utilities and helper functions
- `chat.js` - Chat functionality and UI
- `keyboard.js` - Virtual keyboard implementation
- `history.js` - Game history management
- `config.js` - Configuration constants
- `hintState.js` - Daily Double hint persistence
- `uiNotifications.js` - Visual feedback and animations

### Manager Classes
- `domManager.js` - Centralized DOM element access
- `networkManager.js` - Network state and reconnection
- `gameStateManager.js` - Game state transitions
- `stateManager.js` - Application state management
- `eventListenersManager.js` - Event handling coordination
- `appInitializer.js` - Application bootstrap
- `leaderboardManager.js` - Leaderboard state and display
- `optionsManager.js` - Game options and settings
- `panelManager.js` - Side panel state management
- `resetManager.js` - Game reset functionality
- `audioManager.js` - Sound effects and jingles
- `hintManager.js` - Hint selection and logic

### Specialized Modules
- `boardContainer.js` - Board container and scaling
- `boardScalingTests.js` - Scaling test utilities for debugging
- `enhancedScaling.js` - Advanced responsive scaling logic
- `popupPositioning.js` - Dynamic popup positioning
- `hintBadge.js` - Hint badge UI component

## CSS Architecture

### Hybrid Responsive Design System
The project uses a **hybrid approach** combining traditional media queries with modern responsive techniques:

#### Traditional Media Query System (`responsive.css`)
- **Mobile**: ≤600px with comprehensive mobile optimizations
- **Medium**: 601-900px (tablet/medium screens)  
- **Large**: 901-1199px (desktop)
- **Extra Large**: 1200px+ with scaling limits

#### Modern Responsive System (`modern-responsive.css`)
- **Container queries**: Component-based responsiveness
- **Modern viewport units**: dvh, svh, lvh for better mobile viewport handling
- **Fluid scaling**: clamp() functions for adaptive sizing
- **Dynamic CSS properties**: Responsive tile and component sizing
- **Intrinsic design patterns**: aspect-ratio and intrinsic sizing

#### CSS Architecture Files
- `base.css` - Core styles and CSS custom properties
- `theme.css` - Color themes and design tokens  
- `layout.css` - Panel positioning and core layout
- `responsive.css` - Traditional breakpoint-based responsive design
- `modern-responsive.css` - Container queries and modern responsive patterns
- `animations.css` - Transitions and animation effects
- `components/board.css` - Game board styling
- `components/keyboard.css` - Virtual keyboard styling
- `components/modals.css` - Modal dialog styling
- `components/panels.css` - Side panel styling
- `components/leaderboard.css` - Player leaderboard styling
- `components/buttons.css` - Button component styling

### Key CSS Classes
- `.game-container` - Main game wrapper with container queries
- `.board` - Game board grid
- `.tile` - Individual letter tiles
- `.side-panel` - Chat and leaderboard panels
- `.emoji-modal` - Player selection modal
- `.message-popup` - Notification overlay
- `.keyboard` - Virtual keyboard container
- `.key` - Individual keyboard keys
- `.chat-container` - Chat message container
- `.chat-message` - Individual chat messages
- `.leaderboard-entry` - Player score entries
- `.hint-badge` - Daily Double hint indicators

## Game State Structure

```javascript
{
  lobby_id: "ABC123",
  word: "APPLE",
  guesses: ["ABOUT", "APRIL"],
  players: {
    "player1": {
      emoji: "😀",
      score: 15,
      last_active: "2023-01-01T00:00:00Z"
    }
  },
  leaderboard: [
    { emoji: "😀", score: 15, player_id: "player1" }
  ],
  game_over: false,
  winner: null,
  board_full: false,
  chat: [
    {
      emoji: "😀", 
      text: "Good game!", 
      timestamp: "2023-01-01T00:00:00Z",
      player_id: "player1"
    }
  ],
  past_games: [
    ["ABOUT", "APRIL", "APPLE"]  // Previous completed games
  ],
  definition: "A fruit...",
  daily_double: {
    active: false,
    hint_used: false,
    winner_emoji: null,
    revealed_letters: []
  },
  metadata: {
    created_at: "2023-01-01T00:00:00Z",
    last_activity: "2023-01-01T00:00:00Z",
    host_token: "unique-host-identifier"
  }
}
```

## Environment Variables

### Backend Configuration
- `REDIS_URL` - Redis connection string (optional)
- `GAME_FILE` - Path to game state persistence file
- `WORD_LIST_PATH` - Path to allowed words file
- `DEFN_CACHE_PATH` - Path to offline definitions
- `FLASK_ENV` - Flask environment (development/production)

### Frontend Build
- `VITE_API_URL` - Backend API base URL for builds

## Testing Patterns

### Backend Tests (pytest)
```python
def test_lobby_endpoint(client):
    response = client.post('/lobby/TEST01/guess', 
                          json={'player_id': 'test', 'word': 'APPLE'})
    assert response.status_code == 200
```

### Frontend Tests (Node.js)
Tests use jsdom for DOM simulation and check module exports, function behavior, and UI interactions.

## Common Debugging

### Server Issues
- Check logs for word list loading errors
- Verify Redis connection if using external state
- Monitor SSE connection health

### Frontend Issues  
- Verify module imports are correctly referenced
- Check container query and fluid scaling behavior in DevTools
- Monitor network requests in browser console

## Performance Considerations

### Backend
- Use Redis for multi-instance deployments
- Implement connection pooling for database access
- Cache word definitions to reduce API calls

### Frontend
- Minimize DOM updates with efficient state diffing
- Use CSS transforms for smooth animations
- Implement efficient board scaling calculations
- Lazy load non-critical modules

## Security Notes

### Input Validation
All user input (guesses, emoji, player names) should be validated and sanitized on the server.

### Rate Limiting
API endpoints are rate-limited to prevent abuse, with stricter limits on guess submissions.

### CORS Configuration
Production deployments use specific origin whitelisting rather than wildcards.