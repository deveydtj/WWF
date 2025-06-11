import subprocess
import json
import textwrap
import shutil
import pytest

NODE_SCRIPT = textwrap.dedent("""
class ClassList {
  constructor(){ this.set = new Set(); }
  add(c){ this.set.add(c); }
  remove(c){ this.set.delete(c); }
  contains(c){ return this.set.has(c); }
}

global.document = {body:{classList:new ClassList()}, documentElement:{style:{setProperty(){}}}};
global.window = {innerWidth:800, scrollX:0, scrollY:0};

import('./src/utils.js').then(({positionSidePanels, updateOverlayMode}) => {
  const boardArea = {offsetWidth:300, getBoundingClientRect(){return {top:100, left:200, right:500}}};
  const historyBox = {offsetWidth:100, style:{}};
  const definitionBox = {offsetWidth:100, style:{}};
  positionSidePanels(boardArea, historyBox, definitionBox);
  window.innerWidth = 500;
  updateOverlayMode(boardArea, historyBox, definitionBox);
  console.log(JSON.stringify({
    historyTop: historyBox.style.top,
    historyLeft: historyBox.style.left,
    defTop: definitionBox.style.top,
    defLeft: definitionBox.style.left
  }));
});
""")

NODE_SCRIPT_WIDE = textwrap.dedent("""
class ClassList {
  constructor(){ this.set = new Set(); }
  add(c){ this.set.add(c); }
  remove(c){ this.set.delete(c); }
  contains(c){ return this.set.has(c); }
}

global.document = {body:{classList:new ClassList()}, documentElement:{style:{setProperty(){}}}};
global.window = {innerWidth:800, scrollX:0, scrollY:0};

import('./src/utils.js').then(({positionSidePanels, updateOverlayMode}) => {
  const boardArea = {offsetWidth:300, getBoundingClientRect(){return {top:100, left:200, right:500}}};
  const historyBox = {offsetWidth:100, style:{}};
  const definitionBox = {offsetWidth:100, style:{}};
  positionSidePanels(boardArea, historyBox, definitionBox);
  window.innerWidth = 610;
  updateOverlayMode(boardArea, historyBox, definitionBox);
  console.log(JSON.stringify({
    historyTop: historyBox.style.top,
    historyLeft: historyBox.style.left,
    defTop: definitionBox.style.top,
    defLeft: definitionBox.style.left
  }));
});
""")


def run_node(script):
    if not shutil.which('node'):
        pytest.skip('Node.js is not installed')
    result = subprocess.run(
        ['node', '-e', script], capture_output=True, text=True
    )
    if result.returncode != 0:
        pytest.skip(result.stderr.strip())
    return json.loads(result.stdout.strip())

def test_overlay_mode_resets_inline_styles():
    data = run_node(NODE_SCRIPT)
    assert data['historyTop'] == ''
    assert data['historyLeft'] == ''
    assert data['defTop'] == ''
    assert data['defLeft'] == ''

def test_overlay_mode_resets_styles_when_wide():
    data = run_node(NODE_SCRIPT_WIDE)
    assert data['historyTop'] == ''
    assert data['historyLeft'] == ''
    assert data['defTop'] == ''
    assert data['defLeft'] == ''
