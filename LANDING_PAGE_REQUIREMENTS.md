# Landing Page / Home Screen Requirements

This document outlines the specifications for the planned landing page at `/`. It expands upon the notes in `README.md` and should guide future development and testing.

## 1. Purpose

The landing page introduces new and returning players to Wordle With Friends. It directs visitors into a lobby quickly while highlighting the game's features. The page must remember dark‑mode preference, chosen emoji, and the last lobby code using `localStorage`.

## 2. Information Architecture

1. **Sticky header** – displays the game logo or wordmark, a theme‑toggle switch, and small links for **Help** and **GitHub**.
2. **Hero card** – a raised neumorphic panel with:
   - **Create Lobby** button (primary action)
   - **Join Lobby** form with a six‑character code field
   - **Quick Play** button for one‑tap entry
   - **Re‑join** chip that appears when a previous lobby code exists
3. **Feature highlight row** – three pill‑shaped cards summarising emoji avatars, the Daily Double bonus, and real‑time chat.
4. **How‑to‑Play accordion** – collapsible explanations of basic rules and scoring with a link to full documentation.
5. **Footer** – project disclaimer ("Not affiliated with Wordle") and open‑source licence link.

## 3. Functional Requirements

- **Create Lobby** – POST to `/lobby`, store the returned lobby ID, then redirect the browser to that lobby URL.
- **Join Lobby** – validate the code in real time and confirm the lobby exists before redirecting. Show inline errors for bad codes.
- **Quick Play** – quietly create a new lobby and navigate there immediately.
- **Re‑join** – clicking the stored lobby chip jumps directly back into the last visited lobby.
- **State persistence** – dark mode, emoji selection, and most recent lobby code are stored in `localStorage` and applied on load.
- **Optional analytics hook** – send lightweight events for page views and button clicks using the existing analytics tool.

## 4. Accessibility & Performance

- All interactive elements must be reachable with the keyboard and have visible focus outlines.
- Error messages are announced via a polite live region for screen‑reader users.
- Colour contrast must meet WCAG AA in both light and dark themes.
- The hero card should appear within one second on a typical mobile connection and aim for Largest Contentful Paint under 2.5 seconds.

## 5. Neumorphic Visual Style

- Raised elements use dual soft shadows to appear extruded from the background.
- Inputs use inset shadows so fields look carved inward.
- Corner radii around 10‑14 px keep the design friendly.
- Colours match the existing light grey and deep charcoal themes with accent greens, yellows, and blues.
- Buttons shrink slightly and swap to inset shadows on press.
- Initial animations slide elements upward while fading in, respecting the user's reduced‑motion preference.

## 6. File & Folder Notes

- `frontend/index.html` – markup for the landing page, referencing shared styles.
- `frontend/landing.js` – handles button clicks, form validation, fetch calls, and local storage.
- `frontend/landing.css` – imports theme variables then defines layout rules and animations specific to the landing page.
- Flask must serve the page from the `/` route with no new frameworks.
- Jest DOM tests verify rendering, join‑code validation, and dark‑mode persistence.

## 7. Non‑Goals

- User accounts or passwords
- Marketing experiments or A/B testing
- Translations or internationalisation

## 8. Acceptance Criteria

1. Visiting `/` shows the hero panel quickly on mobile and desktop.
2. Creating, joining, or re‑joining a lobby routes the player into the existing game view without reload errors.
3. The dark‑mode toggle remembers its setting across sessions.
4. Automated accessibility checks score at least 95% and keyboard testing confirms full usability.
5. Visual appearance matches the in‑game neumorphic style in light and dark themes.

