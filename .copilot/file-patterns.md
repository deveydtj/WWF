# File Patterns and Architecture

## Directory Structure

```
backend/                    # Flask API server
├── server.py              # Main Flask application entry point
├── models.py              # Data models and game state structures  
├── game_logic.py          # Core game rules and word processing
├── data_persistence.py    # State saving/loading (JSON/Redis)
├── analytics.py           # Game analytics and logging
├── config.py              # Environment configuration
└── static/                # Built frontend assets (generated)

frontend/                   # Client-side application
├── index.html             # Landing page template
├── game.html              # Main game interface template
├── landing.js             # Landing page functionality
├── landing.css            # Landing page styles
├── static/
│   ├── css/
│   │   ├── theme.css      # Color themes and CSS variables
│   │   └── layout.css     # Responsive layout rules
│   └── js/
│       ├── main.js        # Application entry point
│       ├── api.js         # Server communication
│       ├── board.js       # Game board rendering
│       ├── emoji.js       # Player emoji management
│       ├── utils.js       # Common utilities
│       └── [managers/]    # Modular architecture
└── cypress/               # End-to-end tests

docs/                      # Project documentation
├── ARCHITECTURE.md        # System design overview
├── DEPLOY_GUIDE.md       # Deployment instructions
└── [guides/]             # Various setup guides

data/                      # Game data files
├── sgb-words.txt         # Allowed 5-letter words
└── offline_definitions.json # Fallback word definitions

infra/                     # Infrastructure as code
└── terraform/            # AWS deployment templates

tests/                     # Test suites
├── test_server.py        # Backend API tests
├── test_frontend.js      # Frontend unit tests
└── [domain_tests/]       # Feature-specific tests
```

## File Naming Conventions

### Backend Python Files
- `server.py` - Flask application and route definitions
- `*_logic.py` - Business logic (game_logic.py, etc.)  
- `*_persistence.py` - Data layer (data_persistence.py, etc.)
- `models.py` - Data structures and type definitions
- `config.py` - Environment and configuration management

### Frontend JavaScript Files
- `main.js` - Application entry point and coordination
- `*Manager.js` - Singleton manager classes (domManager.js, etc.)
- `*.js` - Feature modules (board.js, emoji.js, etc.)
- `*Tests.js` - Test utilities and helpers

### CSS Files  
- `theme.css` - Colors, fonts, and design tokens
- `layout.css` - Grid, flexbox, and responsive rules
- `[feature].css` - Component-specific styles

## File Relationships

### Core Dependencies
```
main.js
├── appInitializer.js      # App bootstrap
├── domManager.js          # DOM access
├── networkManager.js      # Server communication  
├── gameStateManager.js    # State transitions
└── eventListenersManager.js # Event coordination

board.js
├── utils.js               # Helper functions
└── domManager.js          # DOM manipulation

api.js
├── utils.js               # Error handling
└── config.js              # API endpoints
```

### Backend Dependencies
```
server.py
├── models.py              # Data structures
├── game_logic.py          # Business rules
├── data_persistence.py    # State management
├── analytics.py           # Logging
└── config.py              # Environment

game_logic.py
├── models.py              # GameState class
└── data/ files            # Word lists and definitions
```

## Import Patterns

### Frontend ES6 Modules
```javascript
// Manager imports (singletons)
import domManager from './domManager.js';
import networkManager from './networkManager.js';

// Function imports (utilities)
import { showMessage, closeDialog } from './utils.js';
import { sendGuess, sendEmoji } from './api.js';

// Constant imports
import { STATES } from './stateManager.js';
```

### Backend Python Modules
```python
# Local module imports with fallback
try:
    from .models import GameState
    from .game_logic import pick_new_word
except ImportError:
    from models import GameState
    from game_logic import pick_new_word
```

## Configuration Files

- `vite.config.js` - Frontend build configuration
- `cypress.config.cjs` - E2E test configuration  
- `docker-compose.yml` - Development environment
- `Dockerfile` - Container configuration
- `.codex.yaml` - CI/CD pipeline definition
- `requirements.txt` - Python dependencies
- `package.json` - Node.js dependencies (frontend)
- `.copilot/` - GitHub Copilot configuration

## Testing Files

- `tests/test_*.py` - Python unit/integration tests
- `tests/*_test.js` - JavaScript unit tests  
- `cypress/e2e/*.cy.js` - End-to-end test specs
- `infra/terraform/*_test.go` - Infrastructure tests