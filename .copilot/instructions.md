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
- Implement **hybrid responsive design** combining:
  - **Traditional media queries** (600px, 900px breakpoints) for established mobile/tablet/desktop modes
  - **Modern container queries** for component-based responsiveness  
  - **Modern viewport units** (dvh, svh, lvh) for better mobile support
  - **Fluid scaling** with clamp() functions for adaptive sizing
  - **Dynamic CSS custom properties** for tile and component sizing
- Use CSS custom properties for theming and consistency
- Organize JavaScript into ES6 modules with clear separation of concerns
- Implement modular manager classes for complex functionality (DOM, network, state)
- Handle both touch and keyboard input for cross-platform compatibility
- Include comprehensive chat system with real-time messaging

### Game Logic
- Each lobby maintains independent state (guesses, chat, scoreboard, game history)
- Point system based on Scrabble tile values with bonuses/penalties
- Support for "Hard Mode" requiring discovered letters in future guesses
- Daily Double feature for hint mechanics with letter revelation
- Player activity tracking with auto-fade for inactive users
- Real-time chat system with emoji integration
- Lobby management (create, join, leave, kick players)
- Game history preservation across multiple rounds
- Network-based lobby discovery for local play

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
/* Hybrid responsive design - traditional + modern */

/* Traditional media query approach (responsive.css) */
@media (max-width: 600px) {
  :root {
    --tile-size: min(8vmin, 32px);
  }
}

@media (min-width: 601px) and (max-width: 900px) {
  :root {
    --tile-size: min(8vmin, 42px);
  }
}

/* Modern container query approach (modern-responsive.css) */
.game-container {
  container-type: inline-size;
  --tile-size: clamp(32px, 8vw, 70px);
  --container-padding: clamp(0.5rem, 2vw, 2rem);
}

@container (min-width: 400px) {
  .game-container {
    --tile-size: clamp(48px, 6vw, 60px);
  }
}

@container (min-width: 768px) {
  .game-container {
    --tile-size: clamp(60px, 4vw, 70px);
  }
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
2. Update hybrid responsive layouts using both traditional breakpoints and modern container queries
3. Implement real-time features using the SSE stream for live updates
4. Add new API endpoints following the RESTful `/lobby/<id>/` pattern
5. Update modular JavaScript architecture with new manager classes
6. Integrate chat functionality with real-time messaging
7. Handle lobby management (creation, joining, leaving, player removal)
8. Update tests to cover new functionality across frontend and backend
9. Ensure accessibility and cross-platform compatibility
10. Manage game state persistence and history across multiple rounds