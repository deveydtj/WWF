"""
E2E test to reproduce the server restart bug using Playwright.

This test simulates the exact scenario described in the issue:
- Server restarts
- Player rejoins or creates a new game
- Player makes their first guess
- Observes "you were kicked from the game" message
"""
import pytest
import threading
import time
import uuid
import json
from wsgiref.simple_server import make_server
from importlib import reload

pytest.importorskip("flask")
playwright = pytest.importorskip("playwright.sync_api")
import backend.server as server
from playwright.sync_api import sync_playwright


@pytest.fixture(scope="function")  
def live_server_with_restart():
    """Live server that we can restart during the test."""
    reload(server)
    server.load_data(server.current_state)
    if not server.current_state.target_word:
        server.pick_new_word(server.current_state)
    
    srv = make_server("localhost", 5011, server.app)
    thread = threading.Thread(target=srv.serve_forever)
    thread.daemon = True
    thread.start()
    time.sleep(0.5)
    
    base_url = "http://localhost:5011"
    yield base_url, srv, server
    
    srv.shutdown()
    thread.join()


def test_server_restart_frontend_kick_bug(live_server_with_restart):
    """
    Test the server restart bug from the frontend perspective.
    
    Steps:
    1. Player joins game and makes a guess
    2. Simulate server restart (manipulate backend state)
    3. Player makes another guess 
    4. Check if frontend shows "kicked from game" message incorrectly
    """
    base_url, srv, server_module = live_server_with_restart
    
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        
        # Add console logging to capture any JavaScript errors
        console_messages = []
        page.on("console", lambda msg: console_messages.append(f"{msg.type}: {msg.text}"))
        
        try:
            print("🌐 Opening game page...")
            page.goto(f"{base_url}/")
            
            # Wait for the game to load
            page.wait_for_selector("#guessInput", timeout=10000)
            print("✅ Game page loaded")
            
            # Step 1: Select an emoji and make an initial guess
            print("🎮 Selecting emoji...")
            page.click("button:has-text('🎮')")  # Select game controller emoji
            
            # Wait a moment for emoji registration
            time.sleep(0.5)
            
            # Make first guess
            print("📝 Making initial guess...")
            page.fill("#guessInput", "crane")
            page.press("#guessInput", "Enter")
            
            # Wait for guess to be processed
            time.sleep(1)
            
            # Check that guess was successful (no error message)
            error_elements = page.query_selector_all(".error, .message:has-text('error')")
            for elem in error_elements:
                if elem.is_visible():
                    print(f"⚠️  Error after first guess: {elem.text_content()}")
            
            print("✅ Initial guess completed")
            
            # Step 2: Simulate server restart by manipulating the backend state
            print("🔄 Simulating server restart...")
            
            # Get current player state
            current_leaderboard = dict(server_module.current_state.leaderboard)
            player_emoji = None
            original_player_id = None
            
            # Find the player that was just registered
            for emoji, data in current_leaderboard.items():
                if '🎮' in emoji:  # Find the game controller emoji (might have variant)
                    player_emoji = emoji
                    original_player_id = data.get('player_id')
                    break
            
            if not player_emoji or not original_player_id:
                pytest.fail("Could not find registered player in leaderboard")
            
            print(f"✅ Found player: {player_emoji} with ID {original_player_id[:8]}...")
            
            # Simulate what happens during server restart:
            # Player IDs get regenerated but emoji stays in leaderboard
            new_player_id = uuid.uuid4().hex
            
            # Update the server state to simulate restart
            server_module.current_state.leaderboard[player_emoji]['player_id'] = new_player_id
            server_module.current_state.player_map.pop(original_player_id, None)
            server_module.current_state.player_map[new_player_id] = player_emoji
            
            print(f"✅ Server state updated - new player_id: {new_player_id[:8]}...")
            
            # Step 3: Make another guess (this should trigger auto-reconnection)
            print("📝 Making post-restart guess...")
            page.fill("#guessInput", "trace")
            page.press("#guessInput", "Enter")
            
            # Wait for the guess to be processed and any messages to appear
            time.sleep(2)
            
            # Step 4: Check for the "kicked from game" message
            print("🔍 Checking for kick message...")
            
            # Look for various forms of the kick/removal message
            kick_selectors = [
                "[class*='message']:has-text('kicked')",
                "[class*='message']:has-text('removed')",
                "[class*='popup']:has-text('kicked')",
                "[class*='popup']:has-text('removed')",
                ".message:has-text('kicked')",
                ".message:has-text('removed')",
            ]
            
            kick_message_found = False
            kick_message_text = ""
            
            for selector in kick_selectors:
                elements = page.query_selector_all(selector)
                for elem in elements:
                    if elem.is_visible():
                        kick_message_found = True
                        kick_message_text = elem.text_content()
                        print(f"❌ FOUND KICK MESSAGE: '{kick_message_text}'")
                        break
                if kick_message_found:
                    break
            
            # Also check console for any relevant messages
            relevant_console = [msg for msg in console_messages if 'kick' in msg.lower() or 'removed' in msg.lower()]
            if relevant_console:
                print(f"🔍 Console messages about removal: {relevant_console}")
            
            # Check if guess was actually successful despite the message
            guess_successful = False
            try:
                # Look for the guess in the board
                board_tiles = page.query_selector_all(".tile")
                for tile in board_tiles:
                    if tile.text_content() and tile.text_content().lower() in ['t', 'r', 'a', 'c', 'e']:
                        guess_successful = True
                        break
            except:
                pass
            
            print(f"✅ Guess successful: {guess_successful}")
            print(f"❌ Kick message found: {kick_message_found}")
            
            if kick_message_found and guess_successful:
                print("🐛 BUG REPRODUCED!")
                print(f"   Message: '{kick_message_text}'")
                print("   The guess was successful but frontend shows removal message")
                
                # Take a screenshot for debugging
                page.screenshot(path="/tmp/server_restart_bug.png")
                print("📸 Screenshot saved to /tmp/server_restart_bug.png")
                
                pytest.fail(f"BUG: Frontend shows kick message '{kick_message_text}' despite successful guess")
            elif kick_message_found:
                print(f"⚠️  Kick message found but guess may have failed: '{kick_message_text}'")
            elif guess_successful:
                print("✅ No bug detected - guess successful and no kick message")
            else:
                print("❓ Unclear result - need to investigate further")
            
        except Exception as e:
            print(f"❌ Test error: {e}")
            # Take screenshot on error
            try:
                page.screenshot(path="/tmp/test_error.png")
                print("📸 Error screenshot saved to /tmp/test_error.png")
            except:
                pass
            raise
        
        finally:
            # Print all console messages for debugging
            if console_messages:
                print("🔍 Console messages:")
                for msg in console_messages[-10:]:  # Last 10 messages
                    print(f"   {msg}")
            
            context.close()
            browser.close()


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])