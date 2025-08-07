# GitHub Copilot Instructions for WordSquad

WordSquad is a multiplayer word guessing game inspired by Wordle, built with Flask backend and vanilla JavaScript frontend. The project emphasizes responsive design, real-time multiplayer interaction, and social gameplay features.

## Project Overview

- **Backend**: Python 3.12, Flask, Flask-Cors, Redis (optional)
- **Frontend**: Vanilla JavaScript (ES6 modules), CSS Grid/Flexbox, Vite bundling
- **Real-time Communication**: Server-Sent Events (SSE) for live updates
- **Testing**: pytest, Cypress for E2E
- **Deployment**: Docker, AWS (ECS, CloudFront, ALB)

## Key Technologies and Architecture

### Backend Structure
- `backend/server.py` - Flask application and route definitions
- `backend/game_logic.py` - Core game rules and word processing  
- `backend/models.py` - Data structures and game state
- `backend/data_persistence.py` - State management (JSON/Redis)
- `backend/lobby.py` - Lobby management logic
- `backend/analytics.py` - Game analytics and logging
- `backend/config.py` - Environment configuration

### Frontend Structure
- `frontend/static/js/main.js` - Application entry point
- `frontend/static/js/api.js` - Server communication
- `frontend/static/js/board.js` - Game board rendering
- `frontend/static/js/*Manager.js` - Modular manager classes
- `frontend/static/css/` - Responsive CSS with hybrid approach

## Development Standards

### Required Before Each Commit
- Run `python -m pytest` to ensure all backend tests pass
- Run `cd frontend && npm run build` to verify frontend builds successfully
- Follow the hybrid responsive design patterns documented in the codebase

### Development Flow
- **Start development**: `python backend/server.py` or `npm run dev`
- **Build**: `npm run build` (builds frontend to backend/static/)
- **Test**: `python -m pytest -v` for backend, `cd frontend && npx cypress run` for E2E
- **Docker**: `docker compose up --build` for full environment

## Key Guidelines

### Backend Development
1. Follow RESTful API patterns for endpoints under `/lobby/<id>/`
2. Use environment variables for configuration (REDIS_URL, GAME_FILE, etc.)
3. Implement proper error handling and validation for all API requests
4. Use Server-Sent Events (`/lobby/<id>/stream`) for real-time updates
5. Maintain thread safety for concurrent lobby access

### Frontend Development
1. Use semantic HTML with accessibility considerations
2. Implement **hybrid responsive design** combining:
   - Traditional media queries (600px, 900px breakpoints)
   - Modern container queries for component responsiveness
   - Modern viewport units (dvh, svh, lvh) for better mobile support
   - Fluid scaling with clamp() functions
3. Use CSS custom properties for theming and consistency
4. Organize JavaScript into ES6 modules with clear separation of concerns
5. Handle both touch and keyboard input for cross-platform compatibility

### Game Logic
1. Each lobby maintains independent state (guesses, chat, scoreboard, game history)
2. Point system based on Scrabble tile values with bonuses/penalties
3. Support "Hard Mode" requiring discovered letters in future guesses
4. Daily Double feature for hint mechanics with letter revelation
5. Real-time chat system with emoji integration
6. Network-based lobby discovery for local play
7. **Leaderboard positioned in lobby header** with horizontal scrolling and auto-scroll to user

## Common Patterns

### API Requests
```javascript
const response = await fetch(`/lobby/${lobbyId}/endpoint`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ player_id: playerId, ...data })
});
```

### State Management
```javascript
// Real-time state handling via SSE
eventSource.onmessage = (event) => {
  const state = JSON.parse(event.data);
  applyStateUpdate(state);
};
```

### Responsive Scaling
```css
/* Hybrid approach - traditional + modern */
@media (max-width: 600px) {
  :root { --tile-size: min(8vmin, 32px); }
}

.game-container {
  container-type: inline-size;
  --tile-size: clamp(32px, 8vw, 70px);
}

@container (min-width: 400px) {
  .game-container { --tile-size: clamp(48px, 6vw, 60px); }
}
```

## Testing Strategy
- Unit tests for game logic and utility functions
- Integration tests for API endpoints and lobby management
- Frontend tests for UI components and user interactions
- E2E tests with Cypress for complete user workflows

## Security and Performance
- Rate limiting on guess submissions and API endpoints
- Input validation and sanitization for all user data
- CORS configuration for production deployment
- Minimize DOM manipulations with efficient state updates
- Use CSS transforms for animations to leverage GPU acceleration

## Common Tasks
When working on this project, focus on:
1. Adding game features while maintaining lobby independence
2. Implementing real-time features using SSE streams
3. Following the RESTful `/lobby/<id>/` API pattern
4. Updating responsive layouts using both traditional and modern CSS techniques
5. Maintaining modular JavaScript architecture
6. Ensuring cross-platform compatibility
7. Managing game state persistence and history

## Repository Structure
```
backend/          # Flask API with game logic
frontend/         # HTML, CSS, JS client
├── static/js/    # ES6 modules
├── static/css/   # Responsive stylesheets
└── cypress/      # E2E tests
docs/            # Architecture and deployment guides
data/            # Word lists and definitions
tests/           # Backend test suite
infra/           # AWS Terraform infrastructure
```

For detailed technical information, refer to the comprehensive documentation in the `.copilot/` directory.