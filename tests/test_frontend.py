import re
from pathlib import Path

INDEX = Path('index.html')
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
    text = INDEX.read_text(encoding='utf-8')
    assert 'body:not(.definition-open) #definitionBox' in text
    assert 'body.definition-open #definitionBox' in text


def test_toggle_definition_function():
    text = (SRC_DIR / 'main.js').read_text(encoding='utf-8')
    assert 'function toggleDefinition()' in text
    assert "togglePanel('definition-open')" in text
    assert 'definitionClose.addEventListener' in text


def test_apply_state_updates_definition_text():
    text = (SRC_DIR / 'main.js').read_text(encoding='utf-8')
    assert 'definitionText.textContent' in text
    assert 'state.definition' in text or 'state.last_definition' in text


def test_side_panels_centered_and_limited_in_medium_mode():
    text = INDEX.read_text(encoding='utf-8')
    for panel in ['#historyBox', '#definitionBox', '#chatBox']:
        assert f"body[data-mode='medium'] {panel}" in text
    assert 'position: fixed;' in text
    assert 'transform: translate(-50%, -50%);' in text
    assert 'max-width: 90%;' in text
    assert 'max-height: 80vh;' in text


def test_popups_fill_viewport():
    text = INDEX.read_text(encoding='utf-8')
    for popup_id in ['#emojiModal', '#closeCallPopup']:
        assert f'{popup_id} {{' in text
        assert 'position: fixed;' in text
        for edge in ['top: 0', 'left: 0', 'right: 0', 'bottom: 0']:
            assert edge in text


def test_options_menu_clamped_to_viewport():
    text = (SRC_DIR / 'main.js').read_text(encoding='utf-8')
    assert 'window.innerWidth - rect.right' in text
    assert 'Math.max(10 + window.scrollX' in text


def test_side_panels_fixed_to_bottom_in_light_mode():
    text = INDEX.read_text(encoding='utf-8')
    patterns = [
        r"@media \(max-width: 600px\)[\s\S]*?#historyBox\s*{[^}]*position: fixed;[^}]*bottom: 0;[^{]*left: 0",
        r"@media \(max-width: 600px\)[\s\S]*?#definitionBox\s*{[^}]*position: fixed;[^}]*bottom: 0;[^{]*right: 0",
        r"@media \(max-width: 600px\)[\s\S]*?#chatBox\s*{[^}]*position: fixed;[^}]*bottom: 0;[^{]*right: 0",
    ]
    for pattern in patterns:
        assert re.search(pattern, text, flags=re.DOTALL)
