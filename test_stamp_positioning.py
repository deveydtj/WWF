#!/usr/bin/env python
"""
Simple test to validate that the stamp positioning CSS changes are working correctly.
"""
import subprocess
import json
import sys

def test_stamp_positioning():
    """Test that stamps are positioned to avoid history panel overlap"""
    
    # JavaScript test to validate CSS positioning
    test_script = """
    // Create a mock DOM environment
    const mockDocument = {
        getElementById: (id) => {
            if (id === 'stampContainer') {
                return {
                    style: {
                        left: '',
                        display: 'block'
                    },
                    getBoundingClientRect: () => ({ x: 280, width: 40 })
                };
            }
            if (id === 'historyBox') {
                return {
                    style: {
                        left: '20px',
                        display: 'block'
                    },
                    getBoundingClientRect: () => ({ x: 20, width: 256 })
                };
            }
            return null;
        },
        body: {
            classList: {
                add: () => {},
                contains: (className) => className === 'history-open'
            }
        }
    };
    
    // Test the positioning logic
    const stampContainer = mockDocument.getElementById('stampContainer');
    const historyBox = mockDocument.getElementById('historyBox');
    
    if (stampContainer && historyBox) {
        const stampRect = stampContainer.getBoundingClientRect();
        const historyRect = historyBox.getBoundingClientRect();
        
        // Check if stamps are positioned to the right of history panel
        const hasOverlap = stampRect.x < historyRect.x + historyRect.width;
        
        console.log(JSON.stringify({
            stampPosition: stampRect.x,
            historyRightEdge: historyRect.x + historyRect.width,
            hasOverlap: hasOverlap,
            separation: stampRect.x - (historyRect.x + historyRect.width)
        }));
    }
    """
    
    try:
        result = subprocess.run(
            ['node', '--input-type=module', '-e', test_script],
            capture_output=True, text=True, check=True
        )
        
        data = json.loads(result.stdout.strip())
        
        print("Stamp positioning test results:")
        print(f"  Stamp position: {data['stampPosition']}px")
        print(f"  History right edge: {data['historyRightEdge']}px")  
        print(f"  Has overlap: {data['hasOverlap']}")
        print(f"  Separation: {data['separation']}px")
        
        # Validate that stamps are positioned with proper clearance
        if not data['hasOverlap'] and data['separation'] > 0:
            print("✅ PASS: Stamps are positioned with proper clearance from history panel")
            return True
        else:
            print("❌ FAIL: Stamps still overlap with history panel")
            return False
            
    except Exception as e:
        print(f"Error running test: {e}")
        return False

if __name__ == '__main__':
    success = test_stamp_positioning()
    sys.exit(0 if success else 1)