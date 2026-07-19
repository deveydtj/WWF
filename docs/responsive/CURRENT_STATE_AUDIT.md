# WordSquad Responsive Current-State Audit

**Captured:** July 18, 2026

**Browser:** Playwright Chromium 149, device scale factor 1

**Scope:** Phase 0.1 baseline before responsive layout and input refactoring

## Method

The audit harness loads the current `game.html`, waits for the six-row board, and captures every scenario in the required test matrix. It records the layout and visual viewports, capability queries, body layout state, element bounds, fit, board/keyboard overlap, page overflow, panel bounds and semantics, and the focus result after activating the `Q` virtual key.

The deterministic lobby fixture is Phase 0.2 and does not exist yet. To make the current production CSS measurable without implementing that later task, the harness:

- dismisses only incidental no-lobby overlays;
- reveals the existing lobby header and inserts audit-only leaderboard text;
- inserts long audit-only content into History, Definition, Chat, and Players;
- opens each existing panel in isolation to record its bounds; and
- leaves all production layout and input code unchanged.

The screenshots are full-page captures. A screenshot can therefore show content below the visual viewport; the JSON and the fit columns below are authoritative for viewport fit.

### Native-keyboard observation

Headless Chromium cannot display or measure the operating system's native keyboard. The reliable trigger proxy is focus: activating any in-game key focuses `#guessInput` in all 17 scenarios. Therefore the audit records **Yes — expected to open** for all coarse or mixed touch scenarios. This follows the browser's normal editable-input behavior and confirms the current native-keyboard risk. Fine-pointer desktop scenarios also move focus to the guess field, but do not have an on-screen device keyboard to summon.

## Result legend

- `✓` — the measured bounds fit inside the visual viewport.
- `✗ R12`, `✗ T317`, or `✗ B105` — clipped 12 px to the right, 317 px above the top, or 105 px below the bottom.
- `overlap` — the board and in-game keyboard rectangles intersect.
- Bounds use `width×height @ x,y`, in CSS pixels.
- `H`, `D`, `C`, and `P` mean History, Definition, Chat, and Players.

## Surface measurements

| Scenario and artifacts | Viewport, capability, current profile | Header | Board | Input row | In-game keyboard | No document horizontal overflow | Virtual-key result |
|---|---|---|---|---|---|---|---|
| [Minimum supported phone](audit-artifacts/minimum-phone-320x568.png) ([JSON](audit-artifacts/minimum-phone-320x568.json)) | 320×568; coarse / no hover; phone | 320×56 @ 0,0 ✓ | 280×336 @ 28,121 ✓ **overlap** | 296×44 @ 24,473 ✓ | 332×156 @ 0,407 ✗ R12 **overlap** | ✓ | `#guessInput` focused; native keyboard expected |
| [Small Android phone](audit-artifacts/small-android-360x640.png) ([JSON](audit-artifacts/small-android-360x640.json)) | 360×640; coarse / no hover; phone | 360×56 @ 0,0 ✓ | 320×384 @ 28,122 ✓ **overlap** | 336×44 @ 24,522 ✓ | 372×156 @ 0,484 ✗ R12 **overlap** | ✓ | `#guessInput` focused; native keyboard expected |
| [Modern iPhone](audit-artifacts/modern-iphone-390x844.png) ([JSON](audit-artifacts/modern-iphone-390x844.json)) | 390×844; coarse / no hover; phone | 390×60 @ 0,0 ✓ | 342×447 @ 36,134 ✓ | 370×44 @ 28,601 ✗ R8 | 402×183 @ 0,661 ✗ R12 | ✓ | `#guessInput` focused; native keyboard expected |
| [Large phone](audit-artifacts/large-phone-430x932.png) ([JSON](audit-artifacts/large-phone-430x932.json)) | 430×932; coarse / no hover; phone | 430×60 @ 0,0 ✓ | 382×458 @ 36,137 ✓ | 372×44 @ 41,615 ✓ | 442×183 @ 0,749 ✗ R12 | ✓ | `#guessInput` focused; native keyboard expected |
| [Phone landscape short](audit-artifacts/phone-landscape-short-667x375.png) ([JSON](audit-artifacts/phone-landscape-short-667x375.json)) | 667×375; coarse / no hover; tablet + `historyPopup` | 667×60 @ 0,0 ✓ | 384×461 @ 154,-317 ✗ T317 | 372×44 @ 160,165 ✓ | 475×88 @ 102,282 ✓ | ✓ | `#guessInput` focused; native keyboard expected |
| [Phone landscape wide](audit-artifacts/phone-landscape-wide-844x390.png) ([JSON](audit-artifacts/phone-landscape-wide-844x390.json)) | 844×390; coarse / no hover; tablet | 844×60 @ 0,0 ✓ | 384×461 @ 245,-312 ✗ T312 | 372×44 @ 251,173 ✓ | 599×88 @ 128,297 ✓ | ✓ | `#guessInput` focused; native keyboard expected |
| [Small tablet portrait](audit-artifacts/small-tablet-portrait-744x1133.png) ([JSON](audit-artifacts/small-tablet-portrait-744x1133.json)) | 744×1133; coarse / no hover; tablet | 744×60 @ 0,0 ✓ | 384×461 @ 193,142 ✓ | 374×44 @ 198,626 ✓ | 758×187 @ 0,946 ✗ R14 | ✓ | `#guessInput` focused; native keyboard expected |
| [Tablet portrait](audit-artifacts/tablet-portrait-768x1024.png) ([JSON](audit-artifacts/tablet-portrait-768x1024.json)) | 768×1024; coarse / no hover; tablet | 768×60 @ 0,0 ✓ | 384×461 @ 206,142 ✓ | 376×44 @ 210,627 ✓ | 784×191 @ 0,833 ✗ R16 | ✓ | `#guessInput` focused; native keyboard expected |
| [Large tablet portrait](audit-artifacts/large-tablet-portrait-820x1180.png) ([JSON](audit-artifacts/large-tablet-portrait-820x1180.json)) | 820×1180; coarse / no hover; tablet | 820×60 @ 0,0 ✓ | 384×461 @ 233,143 ✓ | 376×44 @ 237,628 ✓ | 836×191 @ 0,989 ✗ R16 | ✓ | `#guessInput` focused; native keyboard expected |
| [Tablet landscape](audit-artifacts/tablet-landscape-1024x768.png) ([JSON](audit-artifacts/tablet-landscape-1024x768.json)) | 1024×768; coarse / no hover; desktop + `historyPopup` | 1024×60 @ 0,0 ✓ | 366×449 @ 329,185 ✓ | 366×48 @ 329,650 ✓ | 366×191 @ 329,682 ✗ B105 | ✓ | `#guessInput` focused; native keyboard expected |
| [Small laptop](audit-artifacts/small-laptop-1024x768.png) ([JSON](audit-artifacts/small-laptop-1024x768.json)) | 1024×768; fine / hover; desktop + `historyPopup` | 1024×60 @ 0,0 ✓ | 366×449 @ 329,185 ✓ | 366×48 @ 329,650 ✓ | 366×191 @ 329,682 ✗ B105 | ✓ | `#guessInput` focused |
| [Common laptop](audit-artifacts/common-laptop-1366x768.png) ([JSON](audit-artifacts/common-laptop-1366x768.json)) | 1366×768; fine / hover; desktop | 1366×60 @ 0,0 ✓ | 366×453 @ 500,189 ✓ | 366×48 @ 500,658 ✓ | 366×195 @ 500,770 ✗ B197 | ✓ | `#guessInput` focused |
| [Short wide desktop](audit-artifacts/short-wide-desktop-1600x650.png) ([JSON](audit-artifacts/short-wide-desktop-1600x650.json)) | 1600×650; fine / hover; desktop | 1600×60 @ 0,0 ✓ | 357×442 @ 622,144 ✓ | 357×48 @ 622,602 ✓ | 357×190 @ 622,713 ✗ B253 | ✓ | `#guessInput` focused |
| [Full HD desktop](audit-artifacts/full-hd-desktop-1920x1080.png) ([JSON](audit-artifacts/full-hd-desktop-1920x1080.json)) | 1920×1080; fine / hover; desktop | 1920×60 @ 0,0 ✓ | 378×468 @ 771,199 ✓ | 378×48 @ 771,683 ✓ | 378×199 @ 771,797 ✓ | ✓ | `#guessInput` focused |
| [Ultra-wide](audit-artifacts/ultra-wide-2560x1440.png) ([JSON](audit-artifacts/ultra-wide-2560x1440.json)) | 2560×1440; fine / hover; desktop | 2560×60 @ 0,0 ✓ | 378×468 @ 1091,199 ✓ | 378×48 @ 1091,683 ✓ | 378×199 @ 1091,797 ✓ | ✓ | `#guessInput` focused |
| [Touch Windows laptop](audit-artifacts/touch-windows-laptop-1366x768.png) ([JSON](audit-artifacts/touch-windows-laptop-1366x768.json)) | 1366×768; mixed / hover; desktop | 1366×60 @ 0,0 ✓ | 366×453 @ 500,189 ✓ | 366×48 @ 500,658 ✓ | 366×195 @ 500,770 ✗ B197 | ✓ | `#guessInput` focused; native keyboard expected |
| [Zoomed desktop (effective 200%)](audit-artifacts/zoomed-desktop-960x540.png) ([JSON](audit-artifacts/zoomed-desktop-960x540.json)) | 960×540; fine / hover; desktop + `historyPopup` | 960×60 @ 0,0 ✓ | 294×366 @ 333,90 ✓ | 294×48 @ 333,472 ✓ | 294×153 @ 333,582 ✗ B195 | ✓ | `#guessInput` focused |

## Panel measurements

Every panel retains `role="dialog" aria-modal="true"`, including panels rendered as persistent rail-like regions. Presentation below is inferred from the current computed position: fixed surfaces are modal-like and in-flow surfaces are rail-like.

| Scenario | Open-panel fit with long content |
|---|---|
| [Minimum supported phone](audit-artifacts/minimum-phone-320x568.json) | H modal ✓; D modal ✓; C modal ✓; P modal ✗ R120 |
| [Small Android phone](audit-artifacts/small-android-360x640.json) | H modal ✓; D modal ✓; C modal ✓; P modal ✗ R140 |
| [Modern iPhone](audit-artifacts/modern-iphone-390x844.json) | H modal ✓; D modal ✓; C modal ✓; P modal ✗ R155 |
| [Large phone](audit-artifacts/large-phone-430x932.json) | H modal ✓; D modal ✓; C modal ✓; P modal ✗ R175 |
| [Phone landscape short](audit-artifacts/phone-landscape-short-667x375.json) | H modal ✓; D modal ✓; C modal ✓; P modal ✗ R147 |
| [Phone landscape wide](audit-artifacts/phone-landscape-wide-844x390.json) | H modal ✓; D modal ✓; C modal ✓; P modal ✗ R58 |
| [Small tablet portrait](audit-artifacts/small-tablet-portrait-744x1133.json) | H modal ✓; D modal ✓; C modal ✓; P modal ✗ R108 |
| [Tablet portrait](audit-artifacts/tablet-portrait-768x1024.json) | H modal ✓; D modal ✓; C modal ✓; P modal ✗ R96 |
| [Large tablet portrait](audit-artifacts/large-tablet-portrait-820x1180.json) | H modal ✓; D modal ✓; C modal ✓; P modal ✗ R70 |
| [Tablet landscape](audit-artifacts/tablet-landscape-1024x768.json) | H rail ✗ B28; D rail ✗ R12/B28; C rail ✗ R12/B28; P modal ✓ |
| [Small laptop](audit-artifacts/small-laptop-1024x768.json) | H rail ✗ B28; D rail ✗ R12/B28; C rail ✗ R12/B28; P modal ✓ |
| [Common laptop](audit-artifacts/common-laptop-1366x768.json) | H rail ✗ B32; D rail ✗ R8/B32; C rail ✗ R8/B32; P modal ✓ |
| [Short wide desktop](audit-artifacts/short-wide-desktop-1600x650.json) | H rail ✓; D rail ✓; C rail ✓; P modal ✓ |
| [Full HD desktop](audit-artifacts/full-hd-desktop-1920x1080.json) | H rail ✗ B40; D rail ✗ B40; C rail ✗ B40; P modal ✓ |
| [Ultra-wide](audit-artifacts/ultra-wide-2560x1440.json) | H rail ✗ B40; D rail ✗ B40; C rail ✗ B40; P modal ✓ |
| [Touch Windows laptop](audit-artifacts/touch-windows-laptop-1366x768.json) | H rail ✗ B32; D rail ✗ R8/B32; C rail ✗ R8/B32; P modal ✓ |
| [Zoomed desktop (effective 200%)](audit-artifacts/zoomed-desktop-960x540.json) | H rail ✓; D rail ✗ R12; C rail ✗ R12; P modal ✓ |

## Baseline findings

1. **Input routing opens the native-keyboard path on touch devices.** Every virtual key moves focus to `#guessInput`. The touch scenarios therefore have a native-keyboard-open risk for word guesses.
2. **The current layout is width-labelled, not capability-aware.** Touch-tablet and fine-pointer laptop runs at 1024×768 receive identical `desktop` geometry. The 1366×768 mixed/hover run also receives the same layout geometry as the fine/hover laptop.
3. **The keyboard is not fully reachable in 13 of 17 scenarios.** Phone and portrait-tablet keyboards are 12–16 px too wide. The 1024×768, 1366×768, 1600×650, and effective-zoom desktop keyboards extend 105–253 px below the visual viewport.
4. **The board and keyboard overlap on the two smallest phones.** The intersections are 50 px at 320×568 and 22 px at 360×640.
5. **Phone landscape is not playable.** Both required landscape phone widths are classified as tablet, and their boards start 312–317 px above the visual viewport. The keyboard fits, but most of the board is inaccessible.
6. **No horizontal document scrollbar appears, but content is clipped.** The app shell hides overflow, so the no-scroll result does not mean all key hit regions or controls are reachable.
7. **Players is off-screen on every phone/tablet scenario.** The right-edge clipping ranges from 58 px to 175 px. History, Definition, and Chat modal-like cards fit those same visual viewports.
8. **Desktop rail behavior is inconsistent with fit.** Rail-like panels exceed the bottom of several ordinary and large desktop viewports. At 1024×768, `historyPopup=true` is set but History still computes as an in-flow rail-like panel.
9. **Modal and rail semantics are mixed.** Every measured rail-like surface remains an ARIA modal dialog.
10. **The landscape prompt markup leaks into desktop layout flow.** Above 900 px its mobile-only hiding rules are not loaded. Although the fixed header visually covers the prompt, it consumes 76 px before `#appContainer`, contributing to below-viewport keyboard and rail bounds.

## Reproducing the audit

From the repository root, start a static server and run the gated Chromium capture:

```bash
python3 -m http.server 4173 --directory frontend
GENERATE_RESPONSIVE_AUDIT=1 AUDIT_BASE_URL=http://127.0.0.1:4173 \
  npx playwright test tests/playwright/responsive-current-state-audit.spec.js \
  --project=chromium --workers=1
```

The complete machine-readable rollup is [summary.json](audit-artifacts/summary.json). Regenerate these artifacts intentionally when establishing a new baseline; normal test runs skip the capture harness.
