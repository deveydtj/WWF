# Button Layout Diagram

## Mobile Layout (≤768px)

This diagram shows the button positioning on mobile devices:

```
┌─────────────────────────────────────┐
│         Lobby Header                │ ← Fixed at top
│  [Lobby Code]  [Leaderboard] [Host] │
└─────────────────────────────────────┘
           ↓ 72px padding
┌─────────────────────────────────────┐
│        Main Content Area            │
│  (Scrollable)                       │
│                                     │
│  ┌────────────────────────────┐    │
│  │  Title Bar                 │    │
│  │  [Game Title] [Hint Badge] │    │
│  └────────────────────────────┘    │
│                                     │
│  ┌────────────────────────────┐    │
│  │      Board Area            │    │
│  │  ┌──────────────────────┐  │    │
│  │  │ [☰]            [⚙️]  │  │    │ ← Buttons overlay board
│  │  │ Mobile         Options│  │    │
│  │  │ Menu           Toggle │  │    │
│  │  │                       │  │    │
│  │  │   ┌─┬─┬─┬─┬─┐        │  │    │
│  │  │   │ │ │ │ │ │        │  │    │ ← Game board (5x6 tiles)
│  │  │   ├─┼─┼─┼─┼─┤        │  │    │
│  │  │   │ │ │ │ │ │        │  │    │
│  │  │   ├─┼─┼─┼─┼─┤        │  │    │
│  │  │   │ │ │ │ │ │        │  │    │
│  │  │   ├─┼─┼─┼─┼─┤        │  │    │
│  │  │   │ │ │ │ │ │        │  │    │
│  │  │   ├─┼─┼─┼─┼─┤        │  │    │
│  │  │   │ │ │ │ │ │        │  │    │
│  │  │   ├─┼─┼─┼─┼─┤        │  │    │
│  │  │   │ │ │ │ │ │        │  │    │
│  │  │   └─┴─┴─┴─┴─┘        │  │    │
│  │  │                       │  │    │
│  │  │                 [💬]  │  │    │ ← Chat notification
│  │  │                 Chat  │  │    │
│  │  └──────────────────────┘  │    │
│  └────────────────────────────┘    │
│                                     │
│  ┌────────────────────────────┐    │
│  │   Input Area               │    │
│  │  [Input] [Guess] [Reset]   │    │
│  └────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
           ↓ 180px padding
┌─────────────────────────────────────┐
│      On-Screen Keyboard             │ ← Fixed at bottom
│  Q W E R T Y U I O P               │
│   A S D F G H J K L                │
│ [Guess] Z X C V B N M [Bksp]       │
└─────────────────────────────────────┘
```

### Current Spacing (Mobile)

- **Mobile Menu Button**: 
  - Position: `top: 8px`, `left: 8px` (--mobile-board-padding)
  - Size: 44px × 44px
  - Issue: May overlap with top-left tile at very small screens

- **Options Button**:
  - Position: `top: 8px`, `right: 8px`
  - Size: 44px × 44px
  - Issue: May overlap with top-right tile

- **Chat Button**:
  - Position: `bottom: 8px`, `right: 8px`
  - Size: 44px × 44px
  - Issue: May overlap with bottom-right tile

---

## Desktop Layout (>768px)

This diagram shows the button positioning on desktop devices:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Lobby Header (Fixed)                         │
│  [Lobby Code]     [Leaderboard ──────────────]    [🔗] [🚪] [👥] │
└─────────────────────────────────────────────────────────────────┘
           ↓ Header height + gap
┌─────────────────────────────────────────────────────────────────┐
│                         Main Grid (3 columns)                    │
│                                                                  │
│ ┌──────────┐  ┌─────────────────────────┐  ┌──────────────┐   │
│ │ History  │  │    Center Panel         │  │ Definition / │   │
│ │ Panel    │  │                         │  │ Chat Panel   │   │
│ │          │  │  [Reset] Title [Badge]  │  │              │   │
│ │ [Game 1] │  │                         │  │ [Definition] │   │
│ │ [Game 2] │  │  ┌───────────────────┐  │  │ or           │   │
│ │ [Game 3] │  │  │    Board Area     │  │  │ [Chat Msgs]  │   │
│ │ ...      │  │  │  ┌──────────────┐ │  │  │              │   │
│ └──────────┘  │  │  │ [⚙️]         │ │  │  │              │   │
│               │  │  │ Options      │ │  │  │              │   │
│               │  │  │              │ │  │  │              │   │
│               │  │  │  ┌─┬─┬─┬─┬─┐ │ │  │  │              │   │
│               │  │  │  │ │ │ │ │ │ │ │  │  │              │   │
│               │  │  │  ├─┼─┼─┼─┼─┤ │ │  │  │              │   │
│               │  │  │  │ │ │ │ │ │ │ │  │  │              │   │
│               │  │  │  ├─┼─┼─┼─┼─┤ │ │  │  │              │   │
│               │  │  │  │ │ │ │ │ │ │ │  │  │              │   │
│               │  │  │  ├─┼─┼─┼─┼─┤ │ │  │  │              │   │
│               │  │  │  │ │ │ │ │ │ │ │  │  │              │   │
│               │  │  │  ├─┼─┼─┼─┼─┤ │ │  │  │              │   │
│               │  │  │  │ │ │ │ │ │ │ │  │  │              │   │
│               │  │  │  ├─┼─┼─┼─┼─┤ │ │  │  │              │   │
│               │  │  │  │ │ │ │ │ │ │ │  │  │              │   │
│               │  │  │  └─┴─┴─┴─┴─┘ │ │  │  │              │   │
│               │  │  │              │ │  │  │              │   │
│               │  │  │         [💬] │ │  │  │              │   │
│               │  │  │         Chat │ │  │  └──────────────┘   │
│               │  │  └──────────────┘ │  │                     │
│               │  │                   │  │                     │
│               │  │  [Input] [Guess] [Reset]                  │
│               │  │                   │  │                     │
│               │  │  [Keyboard - Q W E R T Y...]              │
│               │  │                   │  │                     │
│               │  └─────────────────────────┘                  │
│               │                                                │
└───────────────────────────────────────────────────────────────┘
```

### Current Spacing (Desktop)

- **Options Button**:
  - Position: `top: 16px`, `right: 16px` (--desktop-content-padding)
  - Size: `calc(var(--tile-size) * 1.125)` with 44px minimum
  - Issue: May overlap on very wide displays where tiles are large

- **Chat Button**:
  - Position: `bottom: 16px`, `right: 16px`
  - Size: `calc(var(--tile-size) * 1.125)` with 44px minimum
  - Issue: May overlap on very wide displays

---

## Button Sizing Formula

### Mobile (≤768px)
```
Button Size: 44px × 44px (fixed minimum touch target)
Scaling: --scale-md = 1
Tile Size: clamp(44px, varies, 60px)
Padding: --mobile-board-padding = 8px (CURRENT - TOO SMALL)
```

### Desktop (>768px)
```
Button Size: calc(var(--tile-size) * 1.125) but minimum 44px
Scaling: --scale-md = 1.125
Tile Size: clamp(48px, 4vw, 60px)
Padding: --desktop-content-padding = 16px (may need adjustment)
```

---

## Minimum Safe Spacing

To prevent overlap, buttons need:

### Mobile
- **Top buttons**: Minimum 12-16px from board edge
- **Bottom buttons**: Minimum 12-16px from board edge
- **Between buttons**: Minimum 8px vertical gap

### Desktop
- **All buttons**: Minimum 16-20px from board edge
- **Between buttons**: Not applicable (only two buttons, well separated)

---

## Touch Target Considerations

Per accessibility guidelines (WCAG 2.1 Level AAA):
- Minimum touch target size: **44px × 44px**
- Minimum spacing between targets: **8px**

Current implementation meets size requirement but may violate spacing on small screens.

---

## Problem Areas by Viewport

### 320px (Very Small Mobile)
```
Issue: All buttons may overlap with board tiles
Priority: HIGH
Affected: Mobile menu, options, chat buttons
```

### 375px (iPhone SE)
```
Issue: Buttons close to board edge, minimal clearance
Priority: MEDIUM
Affected: All mobile buttons
```

### 768px (Tablet/Breakpoint)
```
Issue: Layout transition may cause spacing jumps
Priority: LOW
Affected: All buttons during resize
```

### 1551px+ (Ultra-Wide Desktop)
```
Issue: Buttons scale with tile size, may become too large
Priority: LOW
Affected: Options and chat buttons
```

---

## Proposed Improvements

### Short-term (PR #2-4)
1. Increase `--mobile-board-padding` from 8px to 12-14px
2. Increase `--desktop-content-padding` from 16px to 18-20px if needed
3. Add maximum button size constraint for ultra-wide displays

### Long-term (PR #5-7)
1. Create dedicated CSS variables for button spacing
2. Add comprehensive automated tests
3. Consider moving buttons outside `#boardArea` if issues persist

---

## Related Documentation

- **Main Planning Doc**: `docs/PR_PLANNING_BUTTON_OVERLAP_FIX.md`
- **Layout Architecture**: `docs/LAYOUT_REFACTORING_PLAN.md`
- **CSS Files**: 
  - Mobile: `frontend/static/css/mobile-layout.css`
  - Desktop: `frontend/static/css/desktop-layout.css`
  - Components: `frontend/static/css/components/panels.css`
