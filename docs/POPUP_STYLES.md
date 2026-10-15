# WordSquad popup styles

Every popup belongs to a purpose-based category. Landing and gameplay use the
same palette and surface rules in `frontend/static/css/components/modals.css`.
Theme tokens live in `frontend/static/css/theme.css`; the responsive layout still
owns viewport bounds and the decision to show a utility panel as a desktop rail.

| Category | Surfaces | Treatment and purpose | Motion |
| --- | --- | --- | --- |
| Identity picker | Landing and game emoji pickers | Raised card, identity explanation, equal touch-sized emoji tiles. Dashed amber tiles retain the indication that an emoji will receive a variant. | Short card entrance. |
| Focused task | Invite link | Raised card, selectable inset field, one green primary action, neutral Close action. The hierarchy makes the next step obvious. | Short card entrance. |
| Help and reference | Landing How to Play, game information | The same raised surface, clear sections and relaxed reading spacing. The game's heading and Close control remain visible while the text scrolls. | Short card entrance. |
| Round notice | Close-call result | Compact centered card with amber accent and a single acknowledgement. Amber highlights a timing result without presenting it as a game error. | Short card entrance; no shake. |
| Utilities | Options, History, Definition, Chat, Players | Quieter cards with consistent headers. Options groups game tools, preferences, and help. Content scrolls beneath controls. History, Definition, and Chat use lighter shadows when shown as desktop rails. | Brief opacity entrance for modal panels; rails do not animate. |
| Transient feedback | Mobile guess/status message, desktop message line, chat preview, point change | Compact nonblocking messages. Chat previews identify their sender and truncate long text visually. Signed point badges use theme-aware green/red plus `+`/`−` text rather than color alone. | Brief fades; points move from and back toward their score anchor. |
| Contextual guidance | Daily Double hint tooltip | Compact bounded text near the board, with an amber outline and pointer. It stays visible while hint selection is active. | No repeated motion. |

## Shared interaction rules

- Colors, borders and shadows follow the saved light/dark theme.
- Dialogs dim the game; transient feedback never captures pointer events or focus.
- Headers give each surface an explicit purpose. Close and primary controls have
  at least 44px targets and visible keyboard focus.
- Dialogs use the existing Escape, focus restoration and click-away behavior.
  The landing emoji picker also traps Tab and provides an explicit Close button.
- Reduced motion removes popup travel, scaling and entry effects. Timed feedback
  remains fully visible for its normal lifetime, then dismisses normally.
- New chat/point feedback replaces the previous instance and resets its timer,
  so an older timeout cannot hide a newer message.

Inline landing join errors and emoji-selection errors stay beside the action
that needs correction. Browser-provided `title` tooltips and the emergency native
server-update alert fallback retain platform styling; they are not CSS surfaces.
There is no standalone connection-error popup in the current HTML: connection
and server-update notices use the transient status-message path.

## Verification

`tests/playwright/popup-styles.spec.js` covers category surfaces, viewport fit,
text contrast, chat preview rendering and timer replacement, reduced motion and
notification dismissal. Existing modal metrics, mobile panel, landing theme and
theme transition tests cover scrolling, close controls, layout and theme changes.
