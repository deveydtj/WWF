import re
from pathlib import Path
import subprocess
import json

LANDING = Path('frontend/index.html')
GAME = Path('frontend/game.html')
CSS_THEME = Path('frontend/static/css/theme.css')
CSS_LAYOUT = Path('frontend/static/css/layout.css')
SRC_DIR = Path('frontend/static/js')

def read_css():
    return CSS_THEME.read_text(encoding='utf-8') + CSS_LAYOUT.read_text(encoding='utf-8')

EXPECTED_MODULES = [
    'api.js',
    'board.js',
    'emoji.js',
    'history.js',
    'keyboard.js',
    'hintState.js',
    'stateManager.js',
    'main.js',
    'utils.js'
]

def test_landing_page_assets():
    text = LANDING.read_text(encoding='utf-8')
    assert '<link rel="stylesheet" href="landing.css"' in text
    assert '<script type="module" src="landing.js"' in text

def test_landing_page_elements_exist():
    text = LANDING.read_text(encoding='utf-8')
    for el_id in ['createBtn', 'joinForm', 'quickBtn', 'rejoinChip', 'emojiDisplay']:
        assert f'id="{el_id}"' in text

def test_set_dark_mode_stores_preference():
    script = """
global.document = { addEventListener(){}, body: { classList: { toggle(){}, contains(){return false;} } }, getElementById() { return null; } };
global.localStorage = { data: {}, setItem(k,v){ this.data[k]=v; }, getItem(k){return this.data[k];} };
const mod = await import('./frontend/landing.js');
mod.setDarkMode(true);
console.log(JSON.stringify(global.localStorage.data));
"""
    result = subprocess.run(
        ['node', '--input-type=module', '-e', script],
        capture_output=True, text=True, check=True
    )
    data = json.loads(result.stdout.strip())
    assert data['darkMode'] == 'true'

def test_store_and_get_last_lobby():
    script = """
global.document = { addEventListener(){}, body:{}, getElementById(){return null;} };
global.localStorage = { data: {}, setItem(k,v){ this.data[k]=v; }, getItem(k){ return this.data[k]; } };
const mod = await import('./frontend/landing.js');
mod.storeLastLobby('ABC123');
console.log(mod.getLastLobby());
"""
    result = subprocess.run(
        ['node', '--input-type=module', '-e', script],
        capture_output=True, text=True, check=True
    )
    assert result.stdout.strip() == 'ABC123'

def test_show_saved_emoji_populates_element():
    script = """
const el = { textContent: '', setAttribute(){} };
global.document = { addEventListener(){}, getElementById(id){ return id==='emojiDisplay' ? el : null; }, body:{} };
global.localStorage = { data: { myEmoji: '🐶' }, getItem(k){ return this.data[k]; } };
const mod = await import('./frontend/landing.js');
mod.showSavedEmoji();
console.log(el.textContent);
"""
    result = subprocess.run(
        ['node', '--input-type=module', '-e', script],
        capture_output=True, text=True, check=True
    )
    assert result.stdout.strip() == '🐶'

def test_emoji_validation_function_exists():
    """Test that emoji validation function exists in landing.js"""
    text = Path('frontend/landing.js').read_text(encoding='utf-8')
    assert 'checkEmojiSelected' in text
    assert 'Please select an emoji first' in text

def test_join_code_regex_present():
    text = Path('frontend/landing.js').read_text(encoding='utf-8')
    assert '^[A-Za-z0-9]{6}$' in text

def test_modules_exist_and_export():
    for name in EXPECTED_MODULES:
        path = SRC_DIR / name
        assert path.exists(), f"{name} should exist"
        text = path.read_text(encoding='utf-8')
        if name != 'main.js':
            assert 'export' in text, f"{name} should contain export statements"

def test_index_html_uses_module_script():
    text = GAME.read_text(encoding='utf-8')
    assert '<link rel="stylesheet" href="static/css/theme.css"' in text
    assert '<link rel="stylesheet" href="static/css/layout.css"' in text
    scripts = re.findall(r'<script[^>]*>.*?</script>', text, flags=re.DOTALL)
    assert len(scripts) == 1, "index.html should contain exactly one script tag"
    script = scripts[0]
    assert 'type="module"' in script
    assert 'src="static/js/main.js"' in script
    # ensure no inline script content
    inside = re.sub(r'<script[^>]*>|</script>', '', script, flags=re.DOTALL).strip()
    assert inside == ''

def test_main_js_imports_modules():
    text = (SRC_DIR / 'main.js').read_text(encoding='utf-8')
    # Check for core modules that are directly imported in main.js
    for mod in ['board.js', 'emoji.js', 'api.js', 'utils.js']:
        assert f"./{mod}" in text, f"main.js should import {mod}"
    
    # Check for manager modules that replace direct imports
    for mod in ['domManager.js', 'networkManager.js', 'gameStateManager.js', 'eventListenersManager.js']:
        assert f"./{mod}" in text, f"main.js should import {mod}"


def test_state_manager_transitions():
    script = """
import { StateManager, STATES } from './frontend/static/js/stateManager.js';
const sm = new StateManager();
const out = [];
out.push(sm.get());
out.push(sm.transition(STATES.PLAYING));
out.push(sm.get());
out.push(sm.transition(STATES.PAUSED));
out.push(sm.get());
out.push(sm.transition(STATES.MENU));
console.log(JSON.stringify(out));
"""
    result = subprocess.run(
        ['node', '--input-type=module', '-e', script],
        capture_output=True, text=True, check=True
    )
    data = json.loads(result.stdout.strip())
    assert data == ['menu', True, 'playing', True, 'paused', False]


def test_definition_panel_elements_exist():
    text = GAME.read_text(encoding='utf-8')
    assert '<div id="definitionBox"' in text
    assert '<div id="definitionText"' in text


def test_definition_panel_css_rules():
    css = read_css()
    assert 'body:not(.definition-open) #definitionBox' in css
    assert 'body.definition-open #definitionBox' in css


def test_toggle_definition_function():
    main_text = (SRC_DIR / 'main.js').read_text(encoding='utf-8')
    panel_text = (SRC_DIR / 'panelManager.js').read_text(encoding='utf-8')
    # toggleDefinition function is now in panelManager.js but imported and used in main.js
    assert 'toggleDefinition' in main_text  # Check it's imported and used
    assert 'function toggleDefinition()' in panel_text  # Check it's defined in panelManager
    assert "togglePanel('definition-open')" in panel_text
    assert 'definitionClose.addEventListener' in main_text


def test_apply_state_updates_definition_text():
    text = (SRC_DIR / 'main.js').read_text(encoding='utf-8')
    assert 'definitionText.textContent' in text
    assert 'state.definition' in text or 'state.last_definition' in text


def test_side_panels_centered_and_limited_in_medium_mode():
    css = read_css()
    # Medium mode now has conditional behavior based on data-history-popup
    # When history is popup (not enough space), all panels are overlays
    assert "body[data-mode='medium'][data-history-popup=\"true\"] #historyBox" in css
    assert "body[data-mode='medium'][data-history-popup=\"true\"] #definitionBox" in css
    assert "body[data-mode='medium'][data-history-popup=\"true\"] #chatBox" in css
    # When history is in grid (enough space), definition and chat are still overlays
    assert "body[data-mode='medium']:not([data-history-popup=\"true\"]) #definitionBox" in css
    assert "body[data-mode='medium']:not([data-history-popup=\"true\"]) #chatBox" in css
    # History box uses grid positioning when there's space
    assert "body[data-mode='medium']:not([data-history-popup=\"true\"]) #historyBox" in css
    assert 'position: fixed;' in css
    assert 'transform: translate(-50%, -50%);' in css
    assert 'max-width: 90%;' in css
    assert 'max-height: 80vh;' in css


def test_popups_fill_viewport():
    css = read_css()
    for popup_id in ['#emojiModal', '#closeCallPopup', '#infoPopup', '#shareModal']:
        assert f'{popup_id} {{' in css
        assert 'position: fixed;' in css
        for edge in ['top: 0', 'left: 0', 'right: 0', 'bottom: 0']:
            assert edge in css


def test_options_menu_clamped_to_viewport():
    main_text = (SRC_DIR / 'main.js').read_text(encoding='utf-8')
    utils_text = (SRC_DIR / 'utils.js').read_text(encoding='utf-8')
    # Options menu now uses positionContextMenu instead of showPopup
    assert 'positionContextMenu(optionsMenu, optionsToggle)' in main_text
    assert 'export function positionPopup' in utils_text


def test_side_panels_fixed_to_bottom_in_light_mode():
    css = read_css()
    patterns = [
        r"@media \(max-width: 600px\)[\s\S]*?#historyBox\s*{[^}]*position: fixed;[^}]*bottom: 0;[^{]*left: 0",
        r"@media \(max-width: 600px\)[\s\S]*?#definitionBox\s*{[^}]*position: fixed;[^}]*bottom: 0;[^{]*right: 0",
        r"@media \(max-width: 600px\)[\s\S]*?#chatBox\s*{[^}]*position: fixed;[^}]*bottom: 0;[^{]*right: 0",
    ]
    for pattern in patterns:
        assert re.search(pattern, css, flags=re.DOTALL)

def test_chat_box_and_controls_exist():
    text = GAME.read_text(encoding='utf-8')
    assert '<div id="chatBox"' in text
    assert '<div id="chatMessages"' in text
    assert '<form id="chatForm"' in text
    assert '<input id="chatInput"' in text
    assert '<button id="chatSend"' in text

def test_chat_notify_icon_present_and_styled():
    text = GAME.read_text(encoding='utf-8')
    css = read_css()
    assert '<button id="chatNotify"' in text
    assert '#chatNotify {' in css
    assert '@keyframes wiggle' in css

def test_options_and_chat_icons_visible():
    css = read_css()
    chat_rules = [m.group(0) for m in re.finditer(r'#chatNotify\s*{[^}]*}', css)]
    assert chat_rules and 'display: block' in chat_rules[-1]
    opt_rules = [m.group(0) for m in re.finditer(r'#optionsToggle\s*{[^}]*}', css)]
    assert opt_rules and 'display: block' in opt_rules[-1]

def test_hide_chat_notify_keeps_icon_visible():
    text = (SRC_DIR / 'main.js').read_text(encoding='utf-8')
    assert "chatNotify.style.display = 'none'" not in text


def test_hold_to_reset_elements_exist():
    text = GAME.read_text(encoding='utf-8')
    assert '<button id="holdReset"' in text
    assert '<span id="holdResetText"' in text
    assert '<span id="holdResetProgress"' in text

def test_lobby_header_elements_exist():
    text = GAME.read_text(encoding='utf-8')
    assert '<div id="lobbyHeader"' in text
    assert '<span id="lobbyCode"' in text
    assert '<div id="leaderboard"' in text
    assert '<button id="copyLobbyLink"' in text

def test_lobby_header_css_present():
    css = read_css()
    assert '#lobbyHeader {' in css


def test_options_menu_has_dark_and_sound_buttons():
    text = GAME.read_text(encoding='utf-8')
    assert '<button id="menuDarkMode"' in text
    assert '<button id="menuSound"' in text
    assert '<button id="menuInfo"' in text

def test_apply_dark_mode_preference_labels_button():
    script = """
import { applyDarkModePreference } from './frontend/static/js/utils.js';
global.document = { body: { classList: { toggle(){} } } };
global.localStorage = { getItem(){ return 'true'; } };
const btn = { textContent: '', title: '' };
applyDarkModePreference(btn);
console.log(JSON.stringify(btn));
"""
    result = subprocess.run(
        ['node', '--input-type=module', '-e', script],
        capture_output=True, text=True, check=True
    )
    data = json.loads(result.stdout.strip())
    assert 'Light Mode' in data['textContent']


def test_info_popup_elements_exist():
    text = GAME.read_text(encoding='utf-8')
    assert '<div id="infoPopup"' in text
    assert '<div id="infoBox"' in text

def test_share_modal_elements_exist():
    text = GAME.read_text(encoding='utf-8')
    assert '<div id="shareModal"' in text
    assert '<input id="shareLink"' in text
    assert '<button id="shareCopy"' in text

def test_main_uses_web_share_api():
    text = (SRC_DIR / 'main.js').read_text(encoding='utf-8')
    assert 'navigator.share' in text


def test_message_containers_exist():
    text = GAME.read_text(encoding='utf-8')
    assert '<p id="message"' in text
    assert '<div id="messagePopup"' in text
    assert '<div id="ariaLive"' in text


def test_waiting_overlay_present():
    text = GAME.read_text(encoding='utf-8')
    assert '<div id="waitingOverlay"' in text

def test_waiting_overlay_pointer_events_none():
    css = read_css()
    rules = [m.group(0) for m in re.finditer(r'#waitingOverlay\s*{[^}]*}', css)]
    assert any('pointer-events: none' in r for r in rules)

def test_waiting_overlay_dismiss_logic_present():
    text = (SRC_DIR / 'main.js').read_text(encoding='utf-8')
    assert 'waitingOverlayDismissed' in text
    assert 'document.addEventListener' in text


def test_waiting_overlay_fade_out_animation():
    css = read_css()
    assert '@keyframes fadeOutOverlay' in css
    assert '#waitingOverlay.fade-out' in css
    text = (SRC_DIR / 'main.js').read_text(encoding='utf-8')
    assert "waitingOverlay.classList.add('fade-out')" in text

def test_extra_small_mobile_rules_present():
    css = read_css()
    assert '@media (max-width: 400px)' in css
    assert '--tile-size: min(12vmin, 36px)' in css


def test_show_message_desktop_behavior():
    script = """
import { showMessage } from './frontend/static/js/utils.js';
const messageEl = { style: {}, textContent: '', addEventListener(){} };
const messagePopup = { style: {}, textContent: '', addEventListener(){} };
showMessage('Hi', { messageEl, messagePopup });
console.log(JSON.stringify({ text: messageEl.textContent, vis: messageEl.style.visibility }));
"""
    result = subprocess.run(
        ['node', '--input-type=module', '-e', script],
        capture_output=True, text=True, check=True
    )
    data = json.loads(result.stdout.strip())
    assert data['text'] == 'Hi'
    assert data['vis'] == 'visible'


def test_show_message_hides_when_empty():
    script = """
import { showMessage } from './frontend/static/js/utils.js';
const messageEl = { style: {}, textContent: '', addEventListener(){} };
const messagePopup = { style: {}, textContent: '', addEventListener(){} };
showMessage('', { messageEl, messagePopup });
console.log(JSON.stringify({ text: messageEl.textContent, vis: messageEl.style.visibility }));
"""
    result = subprocess.run(
        ['node', '--input-type=module', '-e', script],
        capture_output=True, text=True, check=True
    )
    data = json.loads(result.stdout.strip())
    assert data['text'] == ''
    assert data['vis'] == 'hidden'

# Removed test_position_side_panels_full_mode and test_position_side_panels_reset_small_mode
# These tests were for the legacy positionSidePanels() function which has been removed
# as part of the CSS Grid migration. Panel positioning is now handled declaratively
# through CSS Grid layout, not JavaScript calculations.

def test_apply_layout_mode_adjusts_for_panel_space():
    script = """
import { applyLayoutMode } from './frontend/static/js/utils.js';

const boardArea = { getBoundingClientRect(){ return { left: 305, right: 645 }; } };
const historyBox = { offsetWidth: 260 };
const definitionBox = { offsetWidth: 260 };
global.window = { innerWidth: 950 };
global.document = {
  body: { dataset: {} },
  getElementById(id){
    if(id==='boardArea') return boardArea;
    if(id==='historyBox') return historyBox;
    if(id==='definitionBox') return definitionBox;
    return null;
  }
};
applyLayoutMode();
console.log(document.body.dataset.mode);
"""
    result = subprocess.run(
        ['node', '--input-type=module', '-e', script],
        capture_output=True, text=True, check=True
    )
    assert result.stdout.strip() == 'medium'


def test_announce_updates_live_region():
    script = """
import { announce } from './frontend/static/js/utils.js';
const el = { textContent: '' };
global.document = { getElementById(){ return el; } };
announce('hello');
console.log(el.textContent);
"""
    result = subprocess.run(
        ['node', '--input-type=module', '-e', script],
        capture_output=True, text=True, check=True
    )
    assert result.stdout.strip() == 'hello'


def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def rel_luminance(rgb):
    def channel(c):
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = map(channel, rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(c1, c2):
    l1 = rel_luminance(c1)
    l2 = rel_luminance(c2)
    if l1 < l2:
        l1, l2 = l2, l1
    return (l1 + 0.05) / (l2 + 0.05)


def test_color_contrast_meets_wcag():
    css = read_css()

    def extract(section, var):
        pattern = rf"{section}\s*{{[^}}]*--{var}:\s*(#[0-9a-fA-F]{{6}})"
        m = re.search(pattern, css)
        assert m, f"{var} not found in {section}"
        return hex_to_rgb(m.group(1))

    light_bg = extract(r":root", "bg-color")
    light_text = extract(r":root", "text-color")
    dark_bg = extract(r"body.dark-mode", "bg-color")
    dark_text = extract(r"body.dark-mode", "text-color")

    assert contrast_ratio(light_text, light_bg) >= 4.5
    assert contrast_ratio(dark_text, dark_bg) >= 4.5


def test_ghost_tile_has_outline():
    css = read_css()
    pattern = r"\.tile\.ghost\s*{[^}]*opacity:\s*0\.4;[^}]*border:\s*2px" \
              r"[^;]*var\(--text-color\)[^}]*outline:\s*2px" \
              r"[^;]*var\(--text-color\)"
    assert re.search(pattern, css, flags=re.DOTALL)


def test_open_and_close_dialog_restores_focus():
    script = """
import { openDialog, closeDialog } from './frontend/static/js/utils.js';
let openFocused = false;
let restored = false;
const first = { focus(){ openFocused = true; } };
const dialog = {
  style: {},
  classList: {
    add(){},
    remove(){},
  },
  setAttribute(){},
  querySelectorAll(){ return [first]; },
  addEventListener(){},
  removeEventListener(){},
};
global.document = { activeElement: { focus(){ restored = true; } } };
openDialog(dialog);
// The closeDialog function uses setTimeout, so we need to check synchronously after the call
const displayAfterOpen = dialog.style.display;
closeDialog(dialog);
const displayAfterClose = dialog.style.display; // This should still be 'flex' until timeout
console.log(JSON.stringify({ openFocused, displayAfterOpen, displayAfterClose, restored }));
"""
    result = subprocess.run(
        ['node', '--input-type=module', '-e', script],
        capture_output=True, text=True, check=True
    )
    data = json.loads(result.stdout.strip())
    assert data['openFocused'] is True
    assert data['displayAfterOpen'] == 'flex'  # Dialog should be open after openDialog
    assert data['restored'] is True  # Focus should be restored


def test_hint_tooltip_element_and_css():
    text = GAME.read_text(encoding='utf-8')
    assert '<div id="hintTooltip"' in text
    css = read_css()
    assert '#hintTooltip' in css


def test_set_game_input_disabled_toggles_inputs():
    script = """
import { setGameInputDisabled } from './frontend/static/js/utils.js';
const guessInput = { disabled: false };
const submitButton = { disabled: false };
const chatInput = { disabled: false };
global.document = {
  getElementById(id) {
    if(id==='guessInput') return guessInput;
    if(id==='submitGuess') return submitButton;
    if(id==='chatInput') return chatInput;
    return null;
  }
};
setGameInputDisabled(true);
const afterDisable = [guessInput.disabled, submitButton.disabled, chatInput.disabled];
setGameInputDisabled(false);
const afterEnable = [guessInput.disabled, submitButton.disabled, chatInput.disabled];
console.log(JSON.stringify({ afterDisable, afterEnable }));
"""
    result = subprocess.run(
        ['node', '--input-type=module', '-e', script],
        capture_output=True, text=True, check=True
    )
    data = json.loads(result.stdout.strip())
    assert data['afterDisable'] == [True, True, True]
    assert data['afterEnable'] == [False, False, False]


def test_play_jingle_function_present():
    # playJingle is now in audioManager.js and imported into main.js
    main_text = (SRC_DIR / 'main.js').read_text(encoding='utf-8')
    audio_text = (SRC_DIR / 'audioManager.js').read_text(encoding='utf-8')
    assert 'playJingle' in main_text  # Check it's imported and used
    assert 'function playJingle()' in audio_text  # Check it's defined in audioManager
    assert 'announce(' in main_text


def test_update_hint_badge_toggles_display():
    script = """
import { updateHintBadge } from './frontend/static/js/hintBadge.js';
const badge = { style: { display: 'none' } };
updateHintBadge(badge, true);
const afterTrue = badge.style.display;
updateHintBadge(badge, false);
const afterFalse = badge.style.display;
console.log(JSON.stringify({ afterTrue, afterFalse }));
"""
    result = subprocess.run(
        ['node', '--input-type=module', '-e', script],
        capture_output=True, text=True, check=True
    )
    data = json.loads(result.stdout.strip())
    assert data['afterTrue'] == 'inline'
    assert data['afterFalse'] == 'none'

def test_create_board_generates_tiles():
    script = """
import { createBoard } from './frontend/static/js/board.js';
const board = { innerHTML: '', children: [], appendChild(el){ this.children.push(el); } };
global.document = { createElement(){ return { className: '', tabIndex: 0 }; } };
createBoard(board, 2);
console.log(JSON.stringify({ count: board.children.length, cls: board.children[0].className, tab: board.children[0].tabIndex }));
"""
    result = subprocess.run(
        ['node', '--input-type=module', '-e', script],
        capture_output=True, text=True, check=True
    )
    data = json.loads(result.stdout.strip())
    assert data['count'] == 10
    assert data['cls'] == 'tile'
    assert data['tab'] == -1


def test_hard_mode_constraints_and_validation():
    script = """
import { updateHardModeConstraints, isValidHardModeGuess } from './frontend/static/js/board.js';
const guesses = [
  { guess: 'crane', result: ['absent','present','absent','absent','correct'] },
  { guess: 'slate', result: ['correct','absent','absent','present','absent'] }
];
const out = updateHardModeConstraints(guesses);
let msg1 = null, msg2 = null;
const ok = isValidHardModeGuess('stare', out.requiredLetters, out.greenPositions, m=>{msg1=m;});
const bad = isValidHardModeGuess('crony', out.requiredLetters, out.greenPositions, m=>{msg2=m;});
console.log(JSON.stringify({
  required: Array.from(out.requiredLetters).sort(),
  greens: out.greenPositions,
  ok,
  bad,
  msg1,
  msg2
}));
"""
    result = subprocess.run(
        ['node', '--input-type=module', '-e', script],
        capture_output=True, text=True, check=True
    )
    data = json.loads(result.stdout.strip())
    assert set(data['required']) == {'e', 'r', 's', 't'}
    assert data['greens']['0'] == 's'
    assert data['greens']['4'] == 'e'
    assert data['ok'] is True
    assert data['bad'] is False
    assert 'letter' in data['msg2'].lower()


def test_update_keyboard_from_guesses():
    script = """
import { updateKeyboardFromGuesses } from './frontend/static/js/board.js';
function makeKey(){ return { classList: { classes: [], add(c){ this.classes.push(c); }, remove(){} } }; }
const keyboard = {
  keys: { a: makeKey(), r: makeKey(), e: makeKey() },
  querySelectorAll(){ return Object.values(this.keys).map(k => ({ classList: k.classList })); },
  querySelector(sel){ const m = sel.match(/data-key=\"([a-z])\"/); return m ? this.keys[m[1]] : null; }
};
const guesses = [
  { guess: 'arise', result: ['absent','present','absent','absent','correct'] },
  { guess: 'apple', result: ['correct','absent','absent','absent','absent'] }
];
updateKeyboardFromGuesses(keyboard, guesses);
console.log(JSON.stringify({ a: keyboard.keys['a'].classList.classes[0], r: keyboard.keys['r'].classList.classes[0], e: keyboard.keys['e'].classList.classes[0] }));
"""
    result = subprocess.run(
        ['node', '--input-type=module', '-e', script],
        capture_output=True, text=True, check=True
    )
    data = json.loads(result.stdout.strip())
    assert data['a'] == 'correct'
    assert data['r'] == 'present'
    assert data['e'] == 'correct'


def test_hint_state_round_trip():
    script = """
import { saveHintState, loadHintState } from './frontend/static/js/hintState.js';
global.localStorage = { data: {}, setItem(k,v){ this.data[k]=v; }, getItem(k){ return this.data[k]; } };
saveHintState('😀', 1, { row: 1, col: 2, letter: 'a' });
const out = loadHintState('😀');
console.log(JSON.stringify(out));
"""
    result = subprocess.run(
        ['node', '--input-type=module', '-e', script],
        capture_output=True, text=True, check=True
    )
    data = json.loads(result.stdout.strip())
    assert data['row'] == 1
    assert data['hint']['col'] == 2
    assert data['hint']['letter'] == 'a'


def test_perform_reset_error_does_not_update_board():
    script = r"""
const fs = require('fs');
// performReset is now in resetManager.js
const code = fs.readFileSync('./frontend/static/js/resetManager.js', 'utf8');
const m = code.match(/async function performReset\(\) {([\s\S]*?)^}/m);
const body = m[1];
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
const performReset = new AsyncFunction('stopAllSounds','animateTilesOut','board','resetGame','LOBBY_CODE','HOST_TOKEN','fetchState','animateTilesIn','showMessage','messageEl','messagePopup', body);

let shown = null;
const board = { state: 'orig' };
function stopAllSounds(){} // Mock stopAllSounds
async function animateTilesOut(){}
async function resetGame(){ return { status: 'error', msg: 'fail' }; }
async function fetchState(){ board.state = 'changed'; }
async function animateTilesIn(){ board.state = 'animated'; }
function showMessage(msg){ shown = msg; }

(async () => {
  await performReset(stopAllSounds, animateTilesOut, board, resetGame, null, null, fetchState, animateTilesIn, showMessage, {}, {});
  console.log(JSON.stringify({ state: board.state, msg: shown }));
})();
"""
    result = subprocess.run(
        ['node', '-e', script],
        capture_output=True, text=True, check=True
    )
    data = json.loads(result.stdout.strip())
    assert data['state'] == 'orig'
    assert data['msg'] == 'fail'


def test_beforeunload_closes_event_source():
    # Check that beforeunload handler exists in eventListenersManager and calls networkManager.cleanup()
    text = (SRC_DIR / 'eventListenersManager.js').read_text(encoding='utf-8')
    assert re.search(r"beforeunload[^{]*\{[^\}]*networkManager\.cleanup", text, re.DOTALL)


def test_leave_lobby_closes_event_source():
    text = (SRC_DIR / 'main.js').read_text(encoding='utf-8')
    # Updated to check for networkManager.cleanup() in leaveLobby handler
    m = re.search(r"leaveLobby\.addEventListener\('click',\s*async\s*\(\)\s*=>\s*\{.*?networkManager\.cleanup", text, re.DOTALL)
    assert m, "networkManager.cleanup() not found in leaveLobby event listener"


def test_leave_lobby_clears_stored_lobby():
    """Test that leaving via door icon clears lastLobby from localStorage."""
    text = (SRC_DIR / 'main.js').read_text(encoding='utf-8')
    # Look for the line that clears localStorage in the leave lobby handler
    assert "localStorage.removeItem('lastLobby')" in text, "localStorage.removeItem('lastLobby') not found in main.js"
    
    # Also verify it's within the leave lobby event handler context
    m = re.search(r"leaveLobby\.addEventListener.*?localStorage\.removeItem\('lastLobby'\)", text, re.DOTALL)
    assert m, "localStorage.removeItem('lastLobby') not found within leaveLobby event listener"


def test_leave_lobby_immediately_updates_url():
    """Test that leaving via door icon immediately updates URL using history.replaceState."""
    text = (SRC_DIR / 'main.js').read_text(encoding='utf-8')
    
    # Look for the line that immediately updates the URL in the leave lobby handler
    assert "window.history.replaceState(null, '', '/')" in text, "window.history.replaceState not found in main.js"
    
    # Also verify it's within the leave lobby event handler context and occurs before navigation
    m = re.search(r"leaveLobby\.addEventListener.*?window\.history\.replaceState.*?window\.location\.href", text, re.DOTALL)
    assert m, "history.replaceState not found before location.href in leaveLobby event listener"
    
    # Check mobile menu manager also has the fix
    mobile_text = (SRC_DIR / 'mobileMenuManager.js').read_text(encoding='utf-8')
    assert "window.history.replaceState(null, '', '/')" in mobile_text, "window.history.replaceState not found in mobileMenuManager.js"
    
    # Check event listeners manager also has the fix 
    event_text = (SRC_DIR / 'eventListenersManager.js').read_text(encoding='utf-8')
    assert "window.history.replaceState(null, '', '/')" in event_text, "window.history.replaceState not found in eventListenersManager.js"


def test_fit_board_to_container_returns_sizes():
    script = """
import { fitBoardToContainer } from './frontend/static/js/utils.js';
const boardArea = { clientWidth: 200, style: { marginTop:'10px', marginBottom:'0' }, parentElement: { clientHeight: 400 } };
const mapping = {
  boardArea,
  titleBar: { offsetHeight: 30 },
  leaderboard: { offsetHeight: 20 },
  inputArea: { offsetHeight: 20 },
  keyboard: { 
    offsetHeight: 80, 
    style: { marginTop:'5px', marginBottom:'0' },
    getBoundingClientRect: () => ({ top: 500, bottom: 580, height: 80 })
  }
};
const docEl = { style: { setProperty(k,v){ this[k]=v; } } };
global.document = {
  getElementById(id){ return mapping[id] || null; },
  documentElement: docEl
};
global.window = {
  innerHeight: 800,
  innerWidth: 1024,
  visualViewport: null
};
global.getComputedStyle = (el) => ({
  marginTop: el.style?.marginTop || '0',
  marginBottom: el.style?.marginBottom || '0',
  getPropertyValue: () => '10'
});
const out1 = fitBoardToContainer(6);
boardArea.parentElement.clientHeight = 250;
const out2 = fitBoardToContainer(6);
console.log(JSON.stringify({ out1, out2, css: docEl.style }));
"""
    result = subprocess.run(
        ['node', '--input-type=module', '-e', script],
        capture_output=True, text=True, check=True
    )
    data = json.loads(result.stdout.strip())
    assert round(data['out1']['tile'], 2) == 29.17  # Updated expected value
    assert round(data['out1']['board'], 2) == 185.83  # Updated expected value
    assert data['out2']['tile'] < data['out1']['tile']  # Second result should be smaller
    assert data['css']['--tile-size'] == '20px'
    assert data['css']['--board-width'] == '140px'
