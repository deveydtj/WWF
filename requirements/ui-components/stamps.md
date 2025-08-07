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
- **Horizontal**: Positioned just to the left of the corresponding game board row with a 10px gap between stamps and board
- **Vertical**: Centered in the Y position of the row it represents
- **Container**: Stamp container should have calculated height matching board dimensions: `calc(6 * (var(--tile-size) + var(--tile-gap)) - var(--tile-gap))`
- **Layout**: Board remains centered on screen with stamps positioned using board-relative calculations
- **Distance**: Exactly 10px gap between the rightmost edge of stamps and the leftmost edge of the board

### Interaction
- **Selectable**: Not selectable by user (`pointer-events: none`)
- **Focus**: No focus states or interactive behavior required

## Technical Implementation

### CSS Classes
- Stamps should use simple CSS without complex styling
- Stroke effects achieved through text-shadow or -webkit-text-stroke
- Absolute positioning within stamp container for precise placement
- Container positioned relative to board center using `calc(50% - var(--board-width) / 2 - 50px)`
- Individual stamps positioned with 10px gap from board edge

### Theme Support
- Must support both light and dark mode themes
- Stroke colors must automatically adjust based on current theme
- No hardcoded colors that don't respect theme variables

## Acceptance Criteria
- [ ] Stamps display only emoji symbols with no labels or backgrounds
- [ ] Stroke outline color changes appropriately between light/dark modes
- [ ] Stamps are positioned exactly 10px to the left of the board edge
- [ ] Stamps are vertically centered on each row
- [ ] Stamps are not selectable or interactive
- [ ] Stamp container has proper calculated height for positioning accuracy
- [ ] Board remains centered on screen regardless of stamp positioning
- [ ] Design works consistently across all supported screen sizes
- [ ] Positioning uses board-relative calculations for accuracy

## Related Issues
- Referenced in PR discussions about UI positioning bugs
- Part of emoji stamp system redesign based on user feedback
- Board centering issue resolved by removing padding-based layout approach
- Stamp-to-board distance standardized to 10px gap for optimal visual balance