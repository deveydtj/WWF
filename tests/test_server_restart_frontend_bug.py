"""
Test to reproduce the exact server restart bug with frontend interaction simulation.

The bug: After server restart, when a player makes their first guess, they see "You were kicked from the game"
even though the guess was successful and they get auto-reconnected.
"""
import uuid
import json
from .test_server import load_server


def test_server_restart_frontend_interaction_bug(tmp_path):
    """
    Simulate the exact scenario:
    1. Player plays normally before server restart
    2. Server restarts and loads state from persistence 
    3. Player makes a guess with old player_id
    4. Server auto-reconnects player
    5. Frontend receives state update via SSE
    6. Frontend incorrectly detects player removal due to timing/state issues
    """
    print("🔍 Testing server restart frontend interaction bug...")
    
    # Load server environment
    server, request = load_server()
    server.LOBBIES_FILE = tmp_path / 'lobbies.json'
    server.WORDS = ['apple', 'enter', 'crane', 'crate', 'trace']
    server.current_state.target_word = 'apple'
    server.current_state.guesses.clear()
    server.current_state.is_over = False
    server.current_state.found_greens = set()
    server.current_state.found_yellows = set()
    server.current_state.leaderboard.clear()
    server.current_state.player_map = {}
    server.current_state.host_token = 'HOSTTOKEN'
    
    # Step 1: Player registers and plays normally
    request.json = {'emoji': '🎮', 'player_id': None}
    request.remote_addr = '192.168.1.100'
    reg_resp = server.set_emoji()
    original_player_id = reg_resp['player_id']
    print(f"✅ Player registered with ID: {original_player_id[:8]}...")
    
    # Make a guess to establish game state
    request.json = {'guess': 'crane', 'emoji': '🎮', 'player_id': original_player_id}
    request.remote_addr = '192.168.1.100'
    first_guess = server.guess_word()
    assert first_guess['status'] == 'ok'
    print("✅ Initial guess successful")
    
    # Save the game state (simulating persistence before restart)
    pre_restart_state = {
        "leaderboard": dict(server.current_state.leaderboard),
        "ip_to_emoji": dict(server.current_state.ip_to_emoji), 
        "player_map": dict(server.current_state.player_map),
        "winner_emoji": server.current_state.winner_emoji,
        "target_word": server.current_state.target_word,
        "guesses": list(server.current_state.guesses),
        "is_over": server.current_state.is_over,
        "found_greens": list(server.current_state.found_greens),
        "found_yellows": list(server.current_state.found_yellows),
        "past_games": list(server.current_state.past_games),
        "definition": server.current_state.definition,
        "last_word": server.current_state.last_word,
        "last_definition": server.current_state.last_definition,
        "chat_messages": list(server.current_state.chat_messages),
        "daily_double_winners": list(server.current_state.daily_double_winners),
        "daily_double_pending": dict(server.current_state.daily_double_pending),
    }
    print("✅ Pre-restart state saved")
    
    # Step 2: Simulate server restart - clear state and reload
    print("🔄 Simulating server restart...")
    
    # Clear current state
    server.current_state.leaderboard.clear()
    server.current_state.ip_to_emoji.clear()
    server.current_state.player_map.clear()
    server.current_state.guesses.clear()
    server.current_state.found_greens.clear()
    server.current_state.found_yellows.clear()
    server.current_state.past_games.clear()
    server.current_state.chat_messages.clear()
    server.current_state.daily_double_winners.clear()
    server.current_state.daily_double_pending.clear()
    
    # Reload state from persistence, but with NEW player_ids (simulating restart)
    # This is what happens during actual server restart - UUIDs get regenerated
    new_player_id = uuid.uuid4().hex
    reloaded_leaderboard = {}
    for emoji, data in pre_restart_state["leaderboard"].items():
        new_data = dict(data)
        new_data["player_id"] = new_player_id  # This is the key issue!
        reloaded_leaderboard[emoji] = new_data
    
    server.current_state.leaderboard = reloaded_leaderboard
    server.current_state.ip_to_emoji = pre_restart_state["ip_to_emoji"]
    server.current_state.player_map = {new_player_id: '🎮'}  # Updated with new player_id
    server.current_state.winner_emoji = pre_restart_state["winner_emoji"]
    server.current_state.target_word = pre_restart_state["target_word"]
    server.current_state.guesses[:] = pre_restart_state["guesses"]
    server.current_state.is_over = pre_restart_state["is_over"]
    server.current_state.found_greens = set(pre_restart_state["found_greens"])
    server.current_state.found_yellows = set(pre_restart_state["found_yellows"])
    server.current_state.past_games[:] = pre_restart_state["past_games"]
    
    print(f"✅ Server restarted - player_id changed from {original_player_id[:8]} to {new_player_id[:8]}")
    
    # Step 3: Get state BEFORE making the guess (this is what frontend would see initially)
    # This simulates the state the frontend has via SSE or polling before making the guess
    pre_guess_state_payload = server.build_state_payload()
    pre_guess_active_emojis = pre_guess_state_payload['active_emojis']
    print(f"✅ Pre-guess active_emojis: {pre_guess_active_emojis}")
    
    # Step 4: Player tries to make a guess with their OLD player_id from before restart
    # This triggers the auto-reconnection logic
    request.json = {'guess': 'trace', 'emoji': '🎮', 'player_id': original_player_id}
    request.remote_addr = '192.168.1.100'
    second_guess = server.guess_word()
    
    print(f"✅ Second guess response status: {second_guess.get('status', 'Unknown')}")
    assert second_guess['status'] == 'ok', f"Second guess should succeed but got: {second_guess}"
    
    # Step 5: Get the state from the successful guess (this is broadcast via SSE)
    post_guess_state = second_guess['state'] 
    post_guess_active_emojis = post_guess_state['active_emojis']
    print(f"✅ Post-guess active_emojis: {post_guess_active_emojis}")
    
    # Step 6: Simulate frontend state management logic 
    # This is what happens in gameStateManager._checkPlayerRemoval()
    print("🎯 Simulating frontend state management...")
    my_emoji = '🎮'
    
    # Frontend logic: prevActiveEmojis.includes(myEmoji) && !activeEmojis.includes(myEmoji)
    player_was_in_previous = my_emoji in pre_guess_active_emojis
    player_is_in_current = my_emoji in post_guess_active_emojis
    
    print(f"   Player was in previous active_emojis: {player_was_in_previous}")
    print(f"   Player is in current active_emojis: {player_is_in_current}")
    
    # The bug manifests if player appears to be removed
    bug_detected = player_was_in_previous and not player_is_in_current
    
    if bug_detected:
        print("❌ BUG REPRODUCED!")
        print("   Frontend would show: 'You were removed from the lobby.'")
        print(f"   Pre-restart player_id: {original_player_id[:8]}...")
        print(f"   Post-restart player_id: {new_player_id[:8]}...")
        print(f"   Auto-reconnected to: {server.current_state.leaderboard['🎮']['player_id'][:8]}...")
        assert False, "BUG: Frontend incorrectly detects player removal"
    else:
        print("✅ No frontend bug detected")
        assert player_is_in_current, "Player should remain in active_emojis after auto-reconnection"
    
    # Additional checks
    assert server.current_state.leaderboard['🎮']['player_id'] == original_player_id, "Player should be auto-reconnected with original ID"
    assert original_player_id in server.current_state.player_map, "Original player_id should be in player_map"
    assert new_player_id not in server.current_state.player_map, "New player_id should be removed from player_map"
    
    print("✅ Test passed - no race condition detected")