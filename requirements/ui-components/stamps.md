# Stamp Requirements

## Overview
Stamps are visual indicators that appear next to game board rows to represent achievements or special states for completed words.

## Visual Requirements

### Design
- **Content**: Display only the emoji symbol, no text labels or additional content
- **Background**: No background, borders, shadows, or 3D stamp effects
- **Stroke Outline**: 
  - Black outline in light mode
  - White outline in dark mode
- **Style**: Simple, clean appearance without any stamp-like styling elements

### Positioning
- **Horizontal**: Positioned just to the left of the corresponding game board row
- **Vertical**: Centered in the Y position of the row it represents
- **Container**: Stamp container should have calculated height matching board dimensions: `calc(6 * (var(--tile-size) + var(--tile-gap)) - var(--tile-gap))`

### Interaction
- **Selectable**: Not selectable by user (`pointer-events: none`)
- **Focus**: No focus states or interactive behavior required

## Technical Implementation

### CSS Classes
- Stamps should use simple CSS without complex styling
- Stroke effects achieved through text-shadow or -webkit-text-stroke
- Absolute positioning within stamp container for precise placement

### Theme Support
- Must support both light and dark mode themes
- Stroke colors must automatically adjust based on current theme
- No hardcoded colors that don't respect theme variables

## Acceptance Criteria
- [ ] Stamps display only emoji symbols with no labels or backgrounds
- [ ] Stroke outline color changes appropriately between light/dark modes
- [ ] Stamps are positioned to the left of their corresponding rows
- [ ] Stamps are vertically centered on each row
- [ ] Stamps are not selectable or interactive
- [ ] Stamp container has proper calculated height for positioning accuracy
- [ ] Design works consistently across all supported screen sizes

## Related Issues
- Referenced in PR discussions about UI positioning bugs
- Part of emoji stamp system redesign based on user feedback