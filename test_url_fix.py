#!/usr/bin/env python3
"""
Simple test to verify the URL hash clearing fix in the leave lobby functionality.
"""

import re
from pathlib import Path

def test_leave_lobby_handles_parent_window():
    """Test that the leave lobby handler properly handles parent window navigation when in iframe."""
    main_js_path = Path('frontend/static/js/main.js')
    content = main_js_path.read_text(encoding='utf-8')
    
    # Extract the leaveLobby event listener
    pattern = r"leaveLobby\.addEventListener\('click',\s*async\s*\(\)\s*=>\s*\{(.*?)\}\);"
    match = re.search(pattern, content, re.DOTALL)
    
    assert match, "Could not find leaveLobby event listener"
    
    event_handler_body = match.group(1)
    
    # Check that it checks for iframe context
    assert "window.parent !== window" in event_handler_body, "Missing iframe detection"
    
    # Check that it clears the parent window hash
    assert "window.parent.location.hash = ''" in event_handler_body, "Missing parent window hash clearing"
    
    # Check that it navigates the parent window
    assert "window.parent.location.href = '/'" in event_handler_body, "Missing parent window navigation"
    
    # Check that it has fallback for non-iframe case
    assert "window.location.href = '/'" in event_handler_body, "Missing fallback navigation"
    
    print("✓ Leave lobby handler properly handles parent window URL and hash clearing")

def test_leave_lobby_preserves_existing_functionality():
    """Test that the leave lobby handler still has all the existing functionality."""
    main_js_path = Path('frontend/static/js/main.js')
    content = main_js_path.read_text(encoding='utf-8')
    
    # Extract the leaveLobby event listener
    pattern = r"leaveLobby\.addEventListener\('click',\s*async\s*\(\)\s*=>\s*\{(.*?)\}\);"
    match = re.search(pattern, content, re.DOTALL)
    
    assert match, "Could not find leaveLobby event listener"
    
    event_handler_body = match.group(1)
    
    # Check that it still calls the API
    assert "leaveLobbyRequest" in event_handler_body, "Missing API call to leave lobby"
    
    # Check that it still clears localStorage
    assert "localStorage.removeItem('lastLobby')" in event_handler_body, "Missing localStorage clearing"
    
    # Check that it still closes event source
    assert "eventSource.close()" in event_handler_body, "Missing event source closing"
    
    # Check that it still stops sounds
    assert "stopAllSounds()" in event_handler_body, "Missing stopAllSounds call"
    
    print("✓ Leave lobby handler preserves all existing functionality")

if __name__ == "__main__":
    test_leave_lobby_handles_parent_window()
    test_leave_lobby_preserves_existing_functionality()
    print("All tests passed! 🎉")