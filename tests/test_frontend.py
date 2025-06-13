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
