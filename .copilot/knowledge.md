# Technical Knowledge Base

## API Endpoints Reference

### Lobby Management
- `GET /lobby/<id>/state` - Get current lobby state
- `POST /lobby/<id>/state` - Heartbeat to mark player active
- `POST /lobby/<id>/emoji` - Claim or change player emoji
- `POST /lobby/<id>/guess` - Submit a word guess
- `POST /lobby/<id>/reset` - Start new round (requires host token)
- `POST /lobby/<id>/kick` - Remove player (requires host token)
- `GET /lobby/<id>/stream` - Server-Sent Events stream

### Request/Response Patterns
All POST requests should include `player_id` in the JSON body. The server responds with updated game state or error messages.

## Frontend Module Architecture

### Core Modules
- `board.js` - Game board rendering and validation
- `emoji.js` - Player emoji management and modal
- `api.js` - Server communication and API calls  
- `utils.js` - UI utilities and helper functions
- `stateManager.js` - Application state management
- `hintState.js` - Daily Double hint persistence
- `uiNotifications.js` - Visual feedback and animations
- `audioManager.js` - Sound effects and jingles
- `hintManager.js` - Hint selection and logic

### Manager Classes
- `domManager` - Centralized DOM element access
- `networkManager` - Network state and reconnection
- `gameStateManager` - Game state transitions
- `eventListenersManager` - Event handling coordination
- `appInitializer` - Application bootstrap

## CSS Architecture

### Layout Modes
- **Light Mode** (≤600px): Vertical stack, bottom panels
- **Medium Mode** (601-900px): Side panels, medium tiles  
- **Full Mode** (>900px): Full layout, large tiles

### Key CSS Classes
- `.game-container` - Main game wrapper
- `.board` - Game board grid
- `.tile` - Individual letter tiles
- `.side-panel` - Chat and leaderboard panels
- `.emoji-modal` - Player selection modal
- `.message-popup` - Notification overlay

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
  game_over: false,
  winner: null,
  board_full: false,
  chat: [],
  definition: "A fruit...",
  daily_double: {
    active: false,
    hint_used: false
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
- Check responsive breakpoint behavior in DevTools
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