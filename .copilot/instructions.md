# GitHub Copilot Instructions for WordSquad

## Project Overview
WordSquad is a multiplayer word guessing game inspired by Wordle, built with Flask backend and vanilla JavaScript frontend. The project emphasizes responsive design, real-time multiplayer interaction, and social gameplay features.

## Repository Structure
- `backend/` - Flask API server with game logic
- `frontend/` - HTML, CSS, JS client with responsive design
- `docs/` - Comprehensive documentation and deployment guides
- `data/` - Word lists and offline definitions
- `tests/` - Test suite with pytest and frontend tests
- `infra/` - AWS Terraform infrastructure

## Architecture Principles
- **Modular Design**: Separate UI, game logic, and server components
- **Real-time Communication**: Server-Sent Events (SSE) for live updates
- **Responsive Layout**: Mobile-first design with breakpoint-based scaling
- **State Management**: Centralized game state with persistence options

## Key Technologies
- **Backend**: Python 3.12, Flask, Flask-Cors, Redis (optional)
- **Frontend**: Vanilla JavaScript (ES6 modules), CSS Grid/Flexbox
- **Build**: Vite for frontend bundling
- **Testing**: pytest, Cypress for E2E
- **Deployment**: Docker, AWS (ECS, CloudFront, ALB)

## Coding Guidelines

### Backend Development
- Follow RESTful API patterns for endpoints under `/lobby/<id>/`
- Use environment variables for configuration (REDIS_URL, GAME_FILE, etc.)
- Implement proper error handling and validation for all API requests
- Use Server-Sent Events (`/lobby/<id>/stream`) for real-time updates
- Maintain thread safety for concurrent lobby access

### Frontend Development
- Use semantic HTML with accessibility considerations
- Implement responsive design with three breakpoints:
  - Light Mode: ≤600px (mobile)
  - Medium Mode: 601-900px (tablet)
  - Full Mode: >900px (desktop)
- Use CSS custom properties for theming and consistency
- Organize JavaScript into ES6 modules with clear separation of concerns
- Handle both touch and keyboard input for cross-platform compatibility

### Game Logic
- Each lobby maintains independent state (guesses, chat, scoreboard)
- Point system based on Scrabble tile values with bonuses/penalties
- Support for "Hard Mode" requiring discovered letters in future guesses
- Daily Double feature for hint mechanics
- Player activity tracking with auto-fade for inactive users

## Common Patterns

### API Endpoints
```javascript
// Standard lobby API pattern
const response = await fetch(`/lobby/${lobbyId}/endpoint`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ player_id: playerId, ...data })
});
```

### State Updates
```javascript
// Real-time state handling
eventSource.onmessage = (event) => {
  const state = JSON.parse(event.data);
  applyStateUpdate(state);
};
```

### Responsive Scaling
```css
/* Mobile-first responsive pattern */
.game-container {
  /* Mobile styles */
}

@media (min-width: 601px) {
  /* Medium mode styles */
}

@media (min-width: 901px) {
  /* Full mode styles */
}
```

## Testing Strategy
- Unit tests for game logic and utility functions
- Integration tests for API endpoints and lobby management
- Frontend tests for UI components and user interactions
- E2E tests with Cypress for complete user workflows

## Security Considerations
- Rate limiting on guess submissions and API endpoints
- Input validation and sanitization for all user data
- CORS configuration for production deployment
- Environment-based configuration for sensitive data

## Performance Guidelines
- Minimize DOM manipulations with efficient state updates
- Use CSS transforms for animations to leverage GPU acceleration
- Implement efficient board scaling calculations
- Cache static assets and enable compression in production

## Deployment Context
- Containerized with Docker for consistent environments
- AWS infrastructure with Terraform for production
- CI/CD pipeline with GitHub Actions
- Health checks and monitoring for production stability

## Common Tasks
When working on this project, you'll often need to:
1. Add new game features while maintaining lobby independence
2. Update responsive layouts across all three breakpoint modes
3. Implement real-time features using the SSE stream
4. Add new API endpoints following the RESTful lobby pattern
5. Update tests to cover new functionality
6. Ensure accessibility and cross-platform compatibility