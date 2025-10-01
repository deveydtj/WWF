# Medium Mode History Panel Layout

## Overview
Medium mode (601-900px viewports) now dynamically chooses between grid and popup layouts for the history panel based on available horizontal space.

## Behavior

### Narrow Medium Mode (601-724px)
- **History Panel**: Centered popup overlay
- **Definition Panel**: Centered popup overlay  
- **Chat Panel**: Centered popup overlay
- **Data Attribute**: `data-history-popup="true"`

When viewport width is below 725px, there isn't enough horizontal space to fit the history panel, stamps, and board in a grid layout. All panels use centered overlay positioning.

### Wide Medium Mode (725-900px)
- **History Panel**: Grid layout (positioned left of stamps)
- **Definition Panel**: Centered popup overlay
- **Chat Panel**: Centered popup overlay
- **Data Attribute**: `data-history-popup="false"`

When viewport width reaches 725px or above, there's enough space to position the history panel in the grid alongside the stamps and board. Definition and chat panels remain as overlays for consistency.

## Space Calculation

The minimum required width for grid layout is calculated as:

```
historyPanelWidth + stampWidth + minBoardWidth + gaps + margins
= 240px + 60px + 340px + 45px + 40px
= 725px
```

Where:
- **historyPanelWidth**: 240px (minimum width for history panel)
- **stampWidth**: 60px (fixed width for stamp container)
- **minBoardWidth**: 340px (minimum board width: 5 tiles × ~68px)
- **gaps**: 45px (3 gaps × 15px between elements)
- **margins**: 40px (side margins for comfortable spacing)

## CSS Selectors

### Grid Layout (Wide Medium Mode)
```css
body[data-mode='medium']:not([data-history-popup="true"]) #mainGrid {
  grid-template-columns: 1fr 240px 60px minmax(auto, var(--board-width)) 1fr;
  grid-template-areas: 
    ". history stamp center ."
    ". history stamp center .";
}
```

### Popup Layout (Narrow Medium Mode)
```css
body[data-mode='medium'][data-history-popup="true"] #historyBox {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
```

## Complete Breakpoint Summary

| Width Range | Mode | History Layout | Notes |
|-------------|------|---------------|-------|
| 0-600px | Light | Bottom overlay | Mobile view |
| 601-724px | Medium | Centered popup | `historyPopup=true` |
| 725-900px | Medium | Grid layout | `historyPopup=false` |
| 901-1150px | Full | Centered popup | Narrow desktop |
| 1151-1550px | Full | Grid layout | Standard desktop |
| 1551px+ | Full | Grid layout | Ultra-wide |

## Implementation Files

- **JavaScript Logic**: `frontend/static/js/utils.js` - `applyLayoutMode()` function
- **CSS Grid Layout**: `frontend/static/css/layout.css` - Medium mode grid rules
- **CSS Overlay Layout**: `frontend/static/css/responsive.css` - Medium mode overlay rules
- **Panel Management**: `frontend/static/js/panelManager.js` - Visibility and toggle logic

## Testing

Run the medium mode layout test:
```bash
python -m pytest tests/test_frontend.py::test_side_panels_centered_and_limited_in_medium_mode -v
```

Manual testing checklist:
1. Open game in browser
2. Resize viewport to 650px width - history should be popup overlay
3. Resize viewport to 800px width - history should be in grid
4. Toggle history panel open/close - should work in both layouts
5. Check definition and chat panels - should always be overlays in medium mode
