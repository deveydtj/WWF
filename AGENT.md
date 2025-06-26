Purpose

This file documents recommended practices, agent instructions, and prompt guidelines for contributors using AI assistants (such as GitHub Copilot, ChatGPT, or Codex) to enhance and maintain the Wordle With Friends codebase.

Project Context
• Repo: deveydtj/WWF
• Description: Multiplayer word guessing game inspired by Wordle, with an emphasis on responsive layout, real-time interaction, and social gameplay.

⸻

AGENT INSTRUCTIONS

General Coding Guidance
• Code Structure:
• Use clear, modular code—separate UI, game logic, and server code into logical files/folders.
• The repository now stores frontend assets in `frontend/` and backend code in
  `backend/`. Update paths accordingly when adding new files.
• Maintain consistency in variable naming and function signatures across the project.
• Prefer functional, testable units over large, monolithic scripts.
• Comments & Docs:
• Write descriptive comments for non-obvious logic and public methods.
• Update README and AGENT.md with any significant architectural or flow changes.
• Refactoring:
• When prompted, suggest code organization improvements (e.g., splitting large files, isolating state management).
• Point out areas for potential optimization, especially around performance and responsiveness.

Frontend (HTML/JS/CSS)
• Prioritize accessibility and responsive design across all device sizes (mobile, tablet, desktop).
• Use semantic HTML elements and keep styles modular.
• Reference the latest Figma, design doc, or Art Style Guide (if present).

Backend (Python)
• Follow RESTful API best practices in server.py and related files.
• Use environment variables for secrets and configuration.
• Validate incoming API requests and handle errors gracefully.
• Use the `/stream` SSE endpoint to push state updates to clients and reduce polling.

Responsive Layout
• Implement breakpoints for “Light,” “Medium,” and “Full” modes, targeting mobile, tablet, and desktop, respectively.
• Make all UI panels, buttons, and game grids scale fluidly using CSS flex/grid and relative units (em/rem/%).
• Test in Chrome DevTools and report layout issues in GitHub Issues.

Testing
• Encourage writing and running tests for any new or modified logic.
• Suggest unit tests for isolated functions and integration tests for game flow.
