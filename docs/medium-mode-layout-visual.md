# Medium Mode History Panel - Visual Layout Guide

## Narrow Medium Mode (601-724px)
```
┌─────────────────────────────────────┐
│         Browser Window              │
│  ┌───────────────────────────────┐  │
│  │      Title & Leaderboard      │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌───────────────────────────────┐  │
│  │                               │  │
│  │         Game Board            │  │
│  │    (5x6 tile grid)           │  │
│  │                               │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌───────────────────────────────┐  │
│  │   Virtual Keyboard            │  │
│  └───────────────────────────────┘  │
│                                     │
│     ╔════════════════════╗          │  <- History Panel
│     ║  History Panel     ║          │     (Centered Popup)
│     ║  (Popup Overlay)   ║          │
│     ╚════════════════════╝          │
└─────────────────────────────────────┘
```

## Wide Medium Mode (725-900px)
```
┌───────────────────────────────────────────────┐
│           Browser Window                      │
│  ┌─────────────────────────────────────────┐  │
│  │        Title & Leaderboard              │  │
│  └─────────────────────────────────────────┘  │
│                                               │
│  ┌─────┐  ┌───┐  ┌─────────────────────┐    │
│  │ H   │  │ S │  │                     │    │
│  │ i   │  │ t │  │    Game Board       │    │
│  │ s   │  │ a │  │   (5x6 tile grid)   │    │
│  │ t   │  │ m │  │                     │    │
│  │ o   │  │ p │  │                     │    │
│  │ r   │  │ s │  │                     │    │
│  │ y   │  │   │  └─────────────────────┘    │
│  │     │  │   │                              │
│  │ P   │  │   │  ┌─────────────────────┐    │
│  │ a   │  │   │  │  Virtual Keyboard   │    │
│  │ n   │  │   │  └─────────────────────┘    │
│  │ e   │  │   │                              │
│  │ l   │  │   │                              │
│  └─────┘  └───┘                              │
│           ^Grid Layout                       │
└───────────────────────────────────────────────┘
```

## Layout Components

### Narrow Mode (< 725px)
- **Center Column**: Full width for board and keyboard
- **History Panel**: Floating overlay (z-index: 30)
- **Definition Panel**: Floating overlay (z-index: 30)
- **Chat Panel**: Floating overlay (z-index: 30)

### Wide Mode (≥ 725px)
- **Left Column**: History panel (240px fixed width)
- **Stamps Column**: Stamp container (60px fixed width)
- **Center Column**: Board and keyboard (minmax auto to --board-width)
- **Definition Panel**: Floating overlay (z-index: 30)
- **Chat Panel**: Floating overlay (z-index: 30)

## Grid Template

### Wide Medium Mode Grid
```css
grid-template-columns: 1fr 240px 60px minmax(auto, var(--board-width)) 1fr;
grid-template-areas: 
  ". history stamp center ."
  ". history stamp center .";
gap: 15px;
```

### Column Breakdown
- **Column 1**: Flexible spacer (pushes content to center)
- **Column 2**: History panel (240px)
- **Column 3**: Stamps (60px)
- **Column 4**: Board (flexible, constrained by --board-width)
- **Column 5**: Flexible spacer (balances layout)

## Transition Between Modes

When resizing from narrow to wide:
1. History panel transitions from fixed overlay to grid position
2. CSS removes `position: fixed` and applies grid positioning
3. Transform property is reset from `translate(-50%, -50%)` to `none`
4. Panel width adjusts from overlay constraints to grid column width

When resizing from wide to narrow:
1. History panel transitions from grid to fixed overlay
2. CSS applies `position: fixed` with centering transform
3. Panel becomes dismissible overlay with close button
4. Max-width and max-height constraints applied (90% / 80vh)

## Advantages of Dynamic Layout

### Narrow Mode Benefits
- Maximizes board and keyboard space
- Prevents layout crowding
- Maintains clear focus on gameplay
- Consistent with other panel behaviors

### Wide Mode Benefits
- Persistent history visibility
- No overlay interference
- Natural left-to-right information flow
- Better use of horizontal space
- Reduces need for panel toggling
