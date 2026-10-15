# Landing Page / Home Screen Requirements

This document outlines the specifications for the planned landing page at `/`. It expands upon the notes in `README.md` and should guide future development and testing.

## 1. Purpose

The landing page introduces new and returning players to WordSquad. It directs visitors into a lobby quickly while highlighting the game's features. The page must remember dark‑mode preference, chosen emoji, and the last lobby code using `localStorage`.

## 2. Information Architecture

1. **Header** – a compact charcoal neumorphic bar displaying the game wordmark, paired emoji/theme controls, **How to Play**, and **GitHub**. On mobile, the wordmark and controls share a row with navigation below. Controls retain 44px touch targets. It scrolls with the page so it does not cover lobby controls or donation content.
2. **Hero card** – a sculpted charcoal panel matching the server fund card, with a green primary-action glow, a recessed lobby-code field, and decorative word tiles. Copy and controls sit side by side on desktop and stack on mobile. It contains:
   - **Create Lobby** button (primary action)
   - **Join Lobby** form with a six‑character code field
   - **Re‑join** chip that appears when a previous lobby code exists
3. **Feature highlight row** – three pill‑shaped cards summarising emoji avatars, the Daily Double bonus, and real‑time chat.
4. **How to Play dialog** – the header button opens a charcoal panel explaining the rules and scoring. Native modal behavior confines keyboard focus, supports Escape and a close button, and returns focus to the trigger when dismissed. The panel scrolls on small screens while the background remains still.
5. **Local Lobbies** – nearby games appear between the hero and server fund in a matching sculpted card when discovery returns eligible lobbies. Each row shows the lobby code, player count, any saved emoji, and a Join button. The section offers Find local lobbies, which completes the age check when needed, and shows an empty state when no lobbies are available. Discovery refreshes every ten seconds while the landing page is visible and when returning to the window. Localhost players and private LAN clients can discover each other.
6. **Server fund** – a dark neumorphic donation card with a glowing goal ring, raised/goal totals, and a link to the donation provider. It sits after the lobby controls. The hero’s ✦ glow finishes before the SQUAD tiles flip. The Local Lobbies card waits for the hero sequence to finish and its entire frame to enter the viewport, then glows its ✦ once. Its content scrolls internally if the list would exceed the screen height. The donation card waits for the Local Lobbies glow to finish and for the entire card to enter the viewport, then glows its ✦ before filling the goal ring. The hero starts once its copy is visible. When the donation card is taller than the viewport, its goal meter must be fully visible instead. Reduced motion shows the final state immediately.
7. **Footer** – project disclaimer ("Not affiliated with Wordle") and open‑source licence link.

## 3. Functional Requirements

- **Create Lobby** – POST to `/lobby`, store the returned lobby ID, then redirect the browser to that lobby URL.
- **Join Lobby** – validate the code in real time and confirm the lobby exists before redirecting. Show inline errors for bad codes.
- **Re‑join** – clicking the stored lobby chip jumps directly back into the last visited lobby.
- **State persistence** – dark mode, emoji selection, and most recent lobby code are stored in `localStorage` and applied on load.
- **Server fund setup** – set `donationSettings` in `frontend/landing.js` with the provider's HTTPS `url`, a positive `goal`, and nonnegative `raised` amount in USD. Monthly totals are maintained manually, not fetched from a payment provider; update/reset them for each month. Unknown amounts remain `null` and display as unavailable; without a valid link, the card shows a disabled "Donations opening soon" button. The ring caps at 100% while preserving the actual total raised.
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

