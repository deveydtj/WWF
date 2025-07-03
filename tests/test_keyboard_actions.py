import re
from pathlib import Path

def test_no_letter_key_actions():
    js_files = [
        'frontend/static/js/main.js',
        'frontend/static/js/keyboard.js',
    ]
    pattern = re.compile(r"key\s*===\s*['\"]([A-Za-z])['\"]")
    for path in js_files:
        text = Path(path).read_text(encoding='utf-8')
        assert pattern.search(text) is None, f"Letter key action found in {path}"

def test_controls_text_present():
    text = Path('frontend/static/js/main.js').read_text(encoding='utf-8')
    assert 'Use arrow keys to choose a tile' in text
