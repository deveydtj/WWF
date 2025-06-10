import re
from pathlib import Path

INDEX = Path('index.html')
SRC_DIR = Path('src')

EXPECTED_MODULES = ['api.js', 'board.js', 'emoji.js', 'history.js', 'keyboard.js', 'main.js', 'utils.js']

def test_modules_exist_and_export():
    for name in EXPECTED_MODULES:
        path = SRC_DIR / name
        assert path.exists(), f"{name} should exist"
        text = path.read_text(encoding='utf-8')
        if name != 'main.js':
            assert 'export' in text, f"{name} should contain export statements"

def test_index_html_uses_module_script():
    text = INDEX.read_text(encoding='utf-8')
    scripts = re.findall(r'<script[^>]*>', text)
    assert len(scripts) == 1, "index.html should contain exactly one script tag"
    assert 'type="module"' in scripts[0]
    assert 'src="src/main.js"' in scripts[0]
