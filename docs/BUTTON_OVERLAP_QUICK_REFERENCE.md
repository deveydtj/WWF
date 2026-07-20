# Quick Reference: Button Overlap Fix

## For Entry-Level Engineers

This is a quick reference guide to help you get started with fixing button overlap issues. For full details, see `PR_PLANNING_BUTTON_OVERLAP_FIX.md`.

---

## 🎯 What's the Problem?

Three buttons on the gameboard can overlap with game tiles:
- **Mobile Menu (☰)** - Top-left on mobile
- **Options (⚙️)** - Top-right
- **Chat (💬)** - Bottom-right

---

## 📋 PR Breakdown

| PR # | Focus | Difficulty | Files |
|------|-------|------------|-------|
| 1 | Investigation & Documentation | Easy | New docs |
| 2 | Fix Mobile Menu Button | Easy | `mobile-layout.css` |
| 3 | Fix Options & Chat (Mobile) | Medium | `mobile-layout.css` |
| 4 | Fix Desktop Buttons | Medium | `desktop-layout.css` |
| 5 | Z-Index Improvements | Easy | `z-index.css` |
| 6 | CSS Variables | Easy | Multiple files |
| 7 | Automated Tests | Medium | New test file |

---

## 🚀 Quick Start

### 1. Set Up Your Environment

```bash
# Clone and setup
git clone <repo-url>
cd WWF
git checkout -b fix/button-overlap-pr1

# Install frontend dependencies
cd frontend
npm install

# Start dev server
npm run dev
```

### 2. Open the Game

Open `http://localhost:5173/game.html` in your browser

### 3. Test Button Positioning

Use Chrome DevTools:
1. Press `F12` to open DevTools
2. Click "Toggle device toolbar" (Cmd/Ctrl + Shift + M)
3. Select different device sizes
4. Look for buttons overlapping board tiles

---

## 🔍 How to Measure Overlap

### Using Browser DevTools

1. **Right-click button** → "Inspect"
2. **Check position values** in Styles panel
3. **Look at box model** diagram
4. **Use ruler tool** (if available)

### Using Console

```javascript
// Get button bounding box
document.querySelector('#mobileMenuToggle').getBoundingClientRect()

// Get board bounding box
document.querySelector('#board').getBoundingClientRect()

// Compare positions to find overlap
```

---

## 📁 Key Files

### CSS Files (Where to Make Changes)

```
frontend/static/css/
├── mobile-layout.css       # Mobile button positioning (≤768px)
├── desktop-layout.css      # Desktop button positioning (>768px)
├── components/
│   ├── panels.css          # Button sizing and styling
│   └── mobile-menu.css     # Mobile menu button styles
├── theme.css               # CSS variables
└── z-index.css             # Z-index hierarchy
```

### HTML File (Button Structure)

```
frontend/game.html          # Button HTML elements
```

### Test Files

```
tests/playwright/
├── ui-responsiveness.spec.js    # Existing overlap tests
└── button-overlap.spec.js       # New tests (PR #7)
```

---

## 🎨 CSS Variables Reference

### Current Values

```css
/* Mobile */
--mobile-board-padding: 8px;        /* TOO SMALL - causes overlap */
--scale-md: 1;                      /* Medium scale factor */
--min-touch-target: 44px;           /* Minimum button size */

/* Desktop */
--desktop-content-padding: 16px;    /* May need adjustment */
--scale-md: 1.125;                  /* Medium scale factor */
```

### Button Sizing Formula

```css
/* Mobile - Fixed size */
width: 44px;
height: 44px;

/* Desktop - Dynamic size */
width: calc(var(--tile-size) * var(--scale-md));
height: calc(var(--tile-size) * var(--scale-md));
min-width: 44px;  /* Ensure minimum touch target */
min-height: 44px;
```

---

## 🧪 Testing Viewports

Test at these specific sizes:

| Device | Width | Height | Priority |
|--------|-------|--------|----------|
| iPhone SE | 375px | 667px | HIGH |
| Very Small | 320px | 568px | HIGH |
| Tablet | 768px | 1024px | MEDIUM |
| Desktop | 1200px | 900px | MEDIUM |
| Ultra-wide | 1920px | 1080px | LOW |

---

## ✅ Checklist for Each PR

Before submitting:

- [ ] Code changes are minimal and focused
- [ ] Tested at all required viewport sizes
- [ ] Screenshots included (before/after)
- [ ] No overlap with board tiles
- [ ] No overlap between buttons
- [ ] Buttons are fully clickable
- [ ] Existing tests pass
- [ ] Code has clear comments
- [ ] Commit message is descriptive

---

## 🛠️ Common Commands

```bash
# Run dev server
npm run dev

# Build for production
npm run build

# Run all tests
npx playwright test

# Run specific test
npx playwright test ui-responsiveness.spec.js

# Run tests in headed mode (see browser)
npx playwright test --headed

# Run tests in debug mode
npx playwright test --debug
```

---

## 💡 Tips

### Finding Button Positions

1. **Open game in browser**
2. **Right-click button** → Inspect
3. **Look at Styles panel** for position values:
   ```css
   position: absolute;
   top: 8px;      /* Current value */
   left: 8px;     /* Current value */
   ```

### Testing Overlap

1. **Reduce viewport size** to 320px
2. **Watch for buttons overlapping tiles**
3. **Measure distance** using DevTools
4. **Increase padding** incrementally (try 12px, 14px, 16px)
5. **Test again** to verify fix

### Making Changes

1. **Edit CSS file** (e.g., `mobile-layout.css`)
2. **Find button selector** (e.g., `#mobileMenuToggle`)
3. **Increase spacing**:
   ```css
   /* Before */
   top: var(--mobile-board-padding);  /* 8px */
   
   /* After */
   top: 12px;  /* or 14px, test to find best value */
   ```
4. **Save and test** - changes should reload automatically

---

## 🐛 Common Issues

### "Button still overlaps!"
- Try increasing padding more (14px, 16px)
- Check if button size is causing the issue
- Verify you're editing the correct CSS file

### "Button is too far from board"
- Reduce padding slightly
- Balance between overlap prevention and visual proximity
- Get feedback from team

### "Changes aren't showing"
- Hard refresh browser (Cmd/Ctrl + Shift + R)
- Check if you're editing the right file
- Verify dev server is running

### "Tests are failing"
- Run tests locally first
- Read error messages carefully
- Check if baseline screenshots need updating
- Verify your changes didn't break other features

---

## 📚 Additional Resources

- **Full Planning Doc**: `docs/PR_PLANNING_BUTTON_OVERLAP_FIX.md`
- **Layout Diagrams**: `docs/BUTTON_LAYOUT_DIAGRAM.md`
- **Layout Architecture**: `docs/LAYOUT_REFACTORING_PLAN.md`

---

## 🆘 Getting Help

1. **Read the full planning doc** for detailed guidance
2. **Check existing code** for similar patterns
3. **Use DevTools** to debug positioning
4. **Create draft PR** and ask for early feedback
5. **Ask team members** if stuck

---

## 🎉 Success Criteria

You're done when:

- ✅ Buttons have minimum 12px clearance from board
- ✅ No overlap at any viewport size (320px - 2000px+)
- ✅ All buttons remain fully clickable
- ✅ Tests pass
- ✅ Screenshots show improvement

---

**Good luck! Remember to work incrementally and test frequently.** 🚀
