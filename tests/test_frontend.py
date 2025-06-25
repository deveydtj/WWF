import re
from pathlib import Path
import subprocess, json

INDEX = Path('index.html')
CSS_FILE = Path('layout.css')
SRC_DIR = Path('src')

EXPECTED_MODULES = [
    'api.js',
    'board.js',
    'emoji.js',
    'history.js',
    'keyboard.js',
    'main.js',
    'utils.js'
]

def test_modules_exist_and_export():
    for name in EXPECTED_MODULES:
        path = SRC_DIR / name
        assert path.exists(), f"{name} should exist"
        text = path.read_text(encoding='utf-8')
        if name != 'main.js':
            assert 'export' in text, f"{name} should contain export statements"

def test_index_html_uses_module_script():
    text = INDEX.read_text(encoding='utf-8')
    assert '<link rel="stylesheet" href="layout.css"' in text
    assert '<link rel="stylesheet" href="neumorphic.css"' in text
    scripts = re.findall(r'<script[^>]*>.*?</script>', text, flags=re.DOTALL)
    assert len(scripts) == 1, "index.html should contain exactly one script tag"
    script = scripts[0]
    assert 'type="module"' in script
    assert 'src="src/main.js"' in script
    # ensure no inline script content
    inside = re.sub(r'<script[^>]*>|</script>', '', script, flags=re.DOTALL).strip()
    assert inside == ''

def test_main_js_imports_modules():
    text = (SRC_DIR / 'main.js').read_text(encoding='utf-8')
    for mod in ['board.js', 'history.js', 'emoji.js', 'api.js', 'keyboard.js', 'utils.js']:
        assert f"./{mod}" in text, f"main.js should import {mod}"


def test_definition_panel_elements_exist():
    text = INDEX.read_text(encoding='utf-8')
    assert '<div id="definitionBox"' in text
    assert '<div id="definitionText"' in text


def test_definition_panel_css_rules():
    css = CSS_FILE.read_text(encoding='utf-8')
    assert 'body:not(.definition-open) #definitionBox' in css
    assert 'body.definition-open #definitionBox' in css


def test_toggle_definition_function():
    text = (SRC_DIR / 'main.js').read_text(encoding='utf-8')
    assert 'function toggleDefinition()' in text
    assert "togglePanel('definition-open')" in text
    assert 'definitionClose.addEventListener' in text

def test_toggle_glass_function():
    text = (SRC_DIR / 'main.js').read_text(encoding='utf-8')
    assert 'function toggleGlassTheme()' in text
    assert 'applyGlassPreference' in text


def test_apply_state_updates_definition_text():
    text = (SRC_DIR / 'main.js').read_text(encoding='utf-8')
    assert 'definitionText.textContent' in text
    assert 'state.definition' in text or 'state.last_definition' in text


def test_side_panels_centered_and_limited_in_medium_mode():
    css = CSS_FILE.read_text(encoding='utf-8')
    for panel in ['#historyBox', '#definitionBox', '#chatBox']:
        assert f"body[data-mode='medium'] {panel}" in css
    assert 'position: fixed;' in css
    assert 'transform: translate(-50%, -50%);' in css
    assert 'max-width: 90%;' in css
    assert 'max-height: 80vh;' in css


def test_popups_fill_viewport():
    css = CSS_FILE.read_text(encoding='utf-8')
    for popup_id in ['#emojiModal', '#closeCallPopup', '#infoPopup']:
        assert f'{popup_id} {{' in css
        assert 'position: fixed;' in css
        for edge in ['top: 0', 'left: 0', 'right: 0', 'bottom: 0']:
            assert edge in css


def test_options_menu_clamped_to_viewport():
    main_text = (SRC_DIR / 'main.js').read_text(encoding='utf-8')
    utils_text = (SRC_DIR / 'utils.js').read_text(encoding='utf-8')
    assert 'showPopup(optionsMenu, optionsToggle)' in main_text
    assert 'export function positionPopup' in utils_text


def test_side_panels_fixed_to_bottom_in_light_mode():
    css = CSS_FILE.read_text(encoding='utf-8')
    patterns = [
        r"@media \(max-width: 600px\)[\s\S]*?#historyBox\s*{[^}]*position: fixed;[^}]*bottom: 0;[^{]*left: 0",
        r"@media \(max-width: 600px\)[\s\S]*?#definitionBox\s*{[^}]*position: fixed;[^}]*bottom: 0;[^{]*right: 0",
        r"@media \(max-width: 600px\)[\s\S]*?#chatBox\s*{[^}]*position: fixed;[^}]*bottom: 0;[^{]*right: 0",
    ]
    for pattern in patterns:
        assert re.search(pattern, css, flags=re.DOTALL)

def test_chat_box_and_controls_exist():
    text = INDEX.read_text(encoding='utf-8')
    assert '<div id="chatBox"' in text
    assert '<div id="chatMessages"' in text
    assert '<form id="chatForm"' in text
    assert '<input id="chatInput"' in text
    assert '<button id="chatSend"' in text

def test_chat_notify_icon_present_and_styled():
    text = INDEX.read_text(encoding='utf-8')
    css = CSS_FILE.read_text(encoding='utf-8')
    assert '<button id="chatNotify"' in text
    assert '#chatNotify {' in css
    assert '@keyframes wiggle' in css


def test_hold_to_reset_elements_exist():
    text = INDEX.read_text(encoding='utf-8')
    assert '<button id="holdReset"' in text
    assert '<span id="holdResetText"' in text
    assert '<span id="holdResetProgress"' in text


def test_options_menu_has_dark_and_sound_buttons():
    text = INDEX.read_text(encoding='utf-8')
    assert '<button id="menuDarkMode"' in text
    assert '<button id="menuGlass"' in text
    assert '<button id="menuSound"' in text
    assert '<button id="menuInfo"' in text

def test_particle_layer_exists():
    text = INDEX.read_text(encoding='utf-8')
    assert '<div id="particleLayer"' in text


def test_info_popup_elements_exist():
    text = INDEX.read_text(encoding='utf-8')
    assert '<div id="infoPopup"' in text
    assert '<div id="infoBox"' in text


def test_message_containers_exist():
    text = INDEX.read_text(encoding='utf-8')
    assert '<p id="message"' in text
    assert '<div id="messagePopup"' in text


def test_show_message_desktop_behavior():
    script = """
import { showMessage } from './src/utils.js';
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
import { showMessage } from './src/utils.js';
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

def test_position_side_panels_full_mode():
    script = """
import { positionSidePanels } from './src/utils.js';

const boardArea = {
  getBoundingClientRect() { return { top: 100, left: 200, right: 400 }; }
};
const historyBox = { offsetWidth: 120, style: {} };
const definitionBox = { offsetHeight: 150, style: {} };
const chatBox = { style: {} };

global.window = { innerWidth: 1024, scrollX: 0, scrollY: 0 };
positionSidePanels(boardArea, historyBox, definitionBox, chatBox);
console.log(JSON.stringify({
  history: historyBox.style,
  definition: definitionBox.style,
  chat: chatBox.style
}));
"""
    result = subprocess.run(
        ['node', '--input-type=module', '-e', script],
        capture_output=True, text=True, check=True
    )
    data = json.loads(result.stdout.strip())
    assert data['history']['position'] == 'absolute'
    assert data['history']['top'] == '100px'
    assert data['history']['left'] == '20px'
    assert data['definition']['position'] == 'absolute'
    assert data['definition']['top'] == '100px'
    assert data['definition']['left'] == '460px'
    assert data['chat']['position'] == 'absolute'
    assert data['chat']['left'] == '460px'
    assert data['chat']['top'] == '270px'

def test_position_side_panels_reset_small_mode():
    script = """
import { positionSidePanels } from './src/utils.js';

const boardArea = { getBoundingClientRect() { return { top: 0, left: 0, right: 0 }; } };
const historyBox = { style: { position: 'absolute', top: '10px', left: '20px' } };
const definitionBox = { style: { position: 'absolute', top: '10px', left: '40px' } };
const chatBox = { style: { position: 'absolute', top: '30px', left: '40px' } };

historyBox.offsetWidth = 100;
definitionBox.offsetHeight = 50;

global.window = { innerWidth: 800, scrollX: 0, scrollY: 0 };
positionSidePanels(boardArea, historyBox, definitionBox, chatBox);
console.log(JSON.stringify({
  history: historyBox.style,
  definition: definitionBox.style,
  chat: chatBox.style
}));
"""
    result = subprocess.run(
        ['node', '--input-type=module', '-e', script],
        capture_output=True, text=True, check=True
    )
    data = json.loads(result.stdout.strip())
    assert data['history']['position'] == ''
    assert data['history']['top'] == ''
    assert data['history']['left'] == ''
    assert data['definition']['position'] == ''
    assert data['definition']['top'] == ''
    assert data['definition']['left'] == ''
    assert data['chat']['position'] == ''
    assert data['chat']['left'] == ''
    assert data['chat']['top'] == ''
