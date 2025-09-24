"""
Test to reproduce the server restart bug where players get "kicked from game" message
after their first guess post-restart due to race condition in frontend state management.
"""
import uuid
from .test_server import load_server


def test_server_restart_race_condition_active_emojis(tmp_path):
    """
    Test that reproduces the race condition bug:
    1. Player makes a guess after server restart
    2. Auto-reconnection happens 
    3. State is broadcast with active_emojis
    4. Frontend thinks player was removed due to timing issue in active_emojis list
    """
    print("🔍 Testing server restart race condition bug...")
    
    # Load server environment (similar to existing test fixtures)
    server, request = load_server()
    server.LOBBIES_FILE = tmp_path / 'lobbies.json'
    # basic game state
    server.WORDS = ['apple', 'enter', 'crane', 'crate', 'trace']
    server.current_state.target_word = 'apple'
    server.current_state.guesses.clear()
    server.current_state.is_over = False
    server.current_state.found_greens = set()
    server.current_state.found_yellows = set()
    server.current_state.leaderboard.clear()
    server.current_state.player_map = {}
    server.current_state.host_token = 'HOSTTOKEN'
    
    print("✅ Server loaded")
    
    # Step 1: Register a player normally
    request.json = {'emoji': '🎮', 'player_id': None}
    request.remote_addr = '1'  # IP address
    reg_resp = server.set_emoji()
    original_player_id = reg_resp['player_id']
    print(f"✅ Player registered with ID: {original_player_id[:8]}...")
    
    # Step 2: Make an initial guess to establish baseline
    request.json = {'guess': 'crane', 'emoji': '🎮', 'player_id': original_player_id}
    request.remote_addr = '1'
    first_guess = server.guess_word()
    assert first_guess['status'] == 'ok'
    print("✅ Initial guess successful")
    
    # Get the current state to check active_emojis
    initial_state = first_guess['state']
    initial_active_emojis = initial_state['active_emojis']
    print(f"✅ Initial active_emojis: {initial_active_emojis}")
    assert '🎮' in initial_active_emojis, "Player should be in initial active_emojis"
    
    # Step 3: Simulate server restart scenario
    # This simulates what happens when server restarts and loads state from persistence,
    # but the client still has the old player_id
    restart_player_id = uuid.uuid4().hex
    
    # Update leaderboard to have the new player_id (as would happen after restart)
    server.current_state.leaderboard['🎮']['player_id'] = restart_player_id
    server.current_state.player_map.pop(original_player_id, None)  
    server.current_state.player_map[restart_player_id] = '🎮'
    print(f"✅ Simulated server restart - new player_id: {restart_player_id[:8]}...")
    
    # Step 4: Client makes a guess with the old player_id (triggering auto-reconnection)
    request.json = {'guess': 'trace', 'emoji': '🎮', 'player_id': original_player_id}
    request.remote_addr = '1'  # Same IP as original registration
    second_guess = server.guess_word()
    
    print(f"✅ Second guess response status: {second_guess.get('status', 'Unknown')}")
    
    # The guess should succeed due to auto-reconnection
    assert second_guess['status'] == 'ok', f"Second guess should succeed but got: {second_guess}"
    
    # Get the state from the successful guess
    post_reconnect_state = second_guess['state']
    post_reconnect_active_emojis = post_reconnect_state['active_emojis']
    print(f"✅ Post-reconnect active_emojis: {post_reconnect_active_emojis}")
    
    # This is what would happen in the frontend gameStateManager._checkPlayerRemoval():
    # prevActiveEmojis.includes(myEmoji) && !activeEmojis.includes(myEmoji)
    player_was_in_previous = '🎮' in initial_active_emojis
    player_is_in_current = '🎮' in post_reconnect_active_emojis
    
    print(f"Player was in previous active_emojis: {player_was_in_previous}")
    print(f"Player is in current active_emojis: {player_is_in_current}")
    
    # The bug would manifest if the player appears to be removed
    if player_was_in_previous and not player_is_in_current:
        print("❌ BUG REPRODUCED: Player appears to be removed from active_emojis!")
        print("   This would trigger 'You were removed from the lobby.' message in frontend")
        
        # Additional debugging info
        print(f"Leaderboard keys: {list(server.current_state.leaderboard.keys())}")
        print(f"Player map: {server.current_state.player_map}")
        
        assert False, "BUG: Player incorrectly appears to be removed from active_emojis"
    else:
        print("✅ No bug: Player correctly remains in active_emojis")
        assert player_is_in_current, "Player should remain in active_emojis after auto-reconnection"
        
    print("✅ Test passed - no race condition detected")