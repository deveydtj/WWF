# URL Hash Clearing Fix Demonstration

## Problem
When a user clicks the door icon (🚪) to leave a lobby, they were redirected to the landing page but the URL still showed the lobby hash (e.g., `/#lobby/ABC123`).

## Root Cause
The game runs in an iframe within the landing page. When the leave lobby handler called `window.location.href = '/'`, it only navigated the iframe, not the parent window, leaving the URL hash intact.

## Solution
Modified the leave lobby event handler in `frontend/static/js/main.js` to:

1. **Detect iframe context**: Check if `window.parent !== window`
2. **Clear parent window hash**: Set `window.parent.location.hash = ''`
3. **Navigate parent window**: Set `window.parent.location.href = '/'`
4. **Fallback for non-iframe**: Keep original `window.location.href = '/'` for standalone use

## Code Changes

### Before (Lines 219):
```javascript
window.location.href = '/';
```

### After (Lines 220-228):
```javascript
// Check if we're in an iframe (lobby loaded within landing page)
if (window.parent !== window) {
  // Clear the hash in the parent window to ensure proper navigation
  window.parent.location.hash = '';
  window.parent.location.href = '/';
} else {
  // If not in iframe, navigate normally
  window.location.href = '/';
}
```

## Verification
- ✅ Existing tests still pass
- ✅ Event source still gets closed
- ✅ localStorage still gets cleared
- ✅ URL hash gets properly cleared when leaving lobby
- ✅ Non-iframe navigation still works as fallback

## Result
Users clicking the door icon now properly return to the landing page with a clean URL (`/`) instead of keeping the lobby hash (`/#lobby/ABC123`).