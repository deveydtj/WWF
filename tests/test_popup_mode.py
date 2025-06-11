import subprocess
import json
import textwrap

NODE_SCRIPT = textwrap.dedent("""
class ClassList {
  constructor(){ this.set = new Set(); }
  add(c){ this.set.add(c); }
  remove(c){ this.set.delete(c); }
  contains(c){ return this.set.has(c); }
}

global.document = {body:{classList:new ClassList()}, documentElement:{style:{setProperty(){}}}};
global.window = {innerWidth:800, scrollX:0, scrollY:0};

import('./src/utils.js').then(({positionSidePanels, updatePopupMode}) => {
  const boardArea = {offsetWidth:300, getBoundingClientRect(){return {top:100, left:200, right:500}}};
  const historyBox = {offsetWidth:100, style:{}};
  const definitionBox = {offsetWidth:100, style:{}};
  positionSidePanels(boardArea, historyBox, definitionBox);
  window.innerWidth = 500;
  updatePopupMode(boardArea, historyBox, definitionBox);
  console.log(JSON.stringify({
    historyTop: historyBox.style.top,
    historyLeft: historyBox.style.left,
    defTop: definitionBox.style.top,
    defLeft: definitionBox.style.left
  }));
});
""")

def test_popup_mode_resets_inline_styles():
    result = subprocess.run(['node', '-e', NODE_SCRIPT], capture_output=True, text=True, check=True)
    data = json.loads(result.stdout.strip())
    assert data['historyTop'] == ''
    assert data['historyLeft'] == ''
    assert data['defTop'] == ''
    assert data['defLeft'] == ''
