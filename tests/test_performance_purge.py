"""Test to demonstrate and validate purge_lobbies performance optimization."""

import time
import pytest
from unittest.mock import patch

# Import the server module
try:
    import backend.server as server
except ImportError:
    import server


def test_purge_lobbies_performance_issue():
    """Demonstrate the performance issue with purge_lobbies being called too frequently."""
    # Clear existing lobbies and setup test environment
    server.LOBBIES.clear()
    server.LOBBIES[server.DEFAULT_LOBBY] = server.GameState()
    
    # Create many lobbies to simulate load
    num_lobbies = 100
    lobby_codes = []
    
    # Create test lobbies
    for i in range(num_lobbies):
        code = f"TEST{i:02d}"
        state = server.GameState()
        state.last_activity = time.time()
        server.LOBBIES[code] = state
        lobby_codes.append(code)
    
    # Count purge_lobbies calls
    purge_count = [0]
    original_purge = server.purge_lobbies
    
    def counting_purge():
        purge_count[0] += 1
        return original_purge()
    
    with patch.object(server, 'purge_lobbies', side_effect=counting_purge):
        # Simulate multiple operations on different lobbies
        operations = 10
        start_time = time.time()
        
        for i in range(operations):
            code = lobby_codes[i % len(lobby_codes)]
            # This should trigger _with_lobby -> purge_lobbies
            try:
                server._with_lobby(code, lambda: {"status": "ok"})
            except:
                pass  # We're just testing the purge call frequency
        
        end_time = time.time()
    
    # With the current implementation, purge should be called once per operation
    assert purge_count[0] == operations, f"Expected {operations} purge calls, got {purge_count[0]}"
    
    # This demonstrates the performance issue - purge is called too frequently
    total_time = end_time - start_time
    print(f"Performance test: {operations} operations with {num_lobbies} lobbies took {total_time:.4f}s")
    print(f"Purge was called {purge_count[0]} times (should be much less)")
    
    # Clean up
    server.LOBBIES.clear()
    server.LOBBIES[server.DEFAULT_LOBBY] = server.GameState()


def test_purge_lobbies_performance_optimization():
    """Test the performance optimization - purge should be rate-limited."""
    # Reset purge timer to ensure clean state
    server._last_purge_time = 0.0
    
    # Clear existing lobbies and setup test environment
    server.LOBBIES.clear()
    server.LOBBIES[server.DEFAULT_LOBBY] = server.GameState()
    
    # Create many lobbies to simulate load
    num_lobbies = 100
    lobby_codes = []
    
    # Create test lobbies
    for i in range(num_lobbies):
        code = f"TEST{i:02d}"
        state = server.GameState()
        state.last_activity = time.time()
        server.LOBBIES[code] = state
        lobby_codes.append(code)
    
    # Count actual purge operations (not just calls to purge_lobbies)
    actual_purge_count = [0]
    original_do_purge = server._do_purge_lobbies
    
    def counting_do_purge():
        actual_purge_count[0] += 1
        return original_do_purge()
    
    with patch.object(server, '_do_purge_lobbies', side_effect=counting_do_purge):
        # Simulate rapid operations on different lobbies
        operations = 50  # More operations to test rate limiting
        start_time = time.time()
        
        for i in range(operations):
            code = lobby_codes[i % len(lobby_codes)]
            # This should trigger _with_lobby -> purge_lobbies
            try:
                server._with_lobby(code, lambda: {"status": "ok"})
            except:
                pass  # We're just testing the purge call frequency
        
        end_time = time.time()
    
    # With rate limiting, actual purges should be much less than operations
    # Since all operations happen quickly, should be at most 1 actual purge
    assert actual_purge_count[0] <= 2, f"Expected at most 2 actual purges due to rate limiting, got {actual_purge_count[0]}"
    
    total_time = end_time - start_time
    print(f"Optimized test: {operations} operations with {num_lobbies} lobbies took {total_time:.4f}s")
    print(f"Actual purges: {actual_purge_count[0]} (rate limited - much better!)")
    
    # Clean up
    server.LOBBIES.clear()
    server.LOBBIES[server.DEFAULT_LOBBY] = server.GameState()


def test_purge_lobbies_actual_cleanup():
    """Test that purge_lobbies actually removes expired lobbies."""
    # Clear existing lobbies and setup test environment
    server.LOBBIES.clear()
    server.LOBBIES[server.DEFAULT_LOBBY] = server.GameState()
    
    now = time.time()
    
    # Create some fresh lobbies
    server.LOBBIES["FRESH1"] = server.GameState()
    server.LOBBIES["FRESH1"].last_activity = now
    
    # Create some expired lobbies
    server.LOBBIES["OLD001"] = server.GameState()
    server.LOBBIES["OLD001"].last_activity = now - server.LOBBY_TTL - 100
    server.LOBBIES["OLD001"].phase = "finished"
    
    server.LOBBIES["OLD002"] = server.GameState()
    server.LOBBIES["OLD002"].last_activity = now - server.LOBBY_TTL - 100
    server.LOBBIES["OLD002"].leaderboard = {}  # Empty leaderboard
    
    # Verify setup
    assert len(server.LOBBIES) == 4  # DEFAULT + FRESH1 + OLD001 + OLD002
    
    # Run purge (use force_purge to bypass rate limiting)
    server.force_purge_lobbies()
    
    # Verify cleanup
    assert "FRESH1" in server.LOBBIES, "Fresh lobby should remain"
    assert "OLD001" not in server.LOBBIES, "Finished expired lobby should be removed"
    assert "OLD002" not in server.LOBBIES, "Empty expired lobby should be removed"
    assert server.DEFAULT_LOBBY in server.LOBBIES, "Default lobby should never be removed"
    
    # Clean up
    server.LOBBIES.clear()
    server.LOBBIES[server.DEFAULT_LOBBY] = server.GameState()


def test_force_purge_bypasses_rate_limiting():
    """Test that force_purge_lobbies bypasses rate limiting."""
    # Reset purge timer
    server._last_purge_time = time.time()  # Set recent purge time
    
    # Count actual purge operations
    purge_count = [0]
    original_do_purge = server._do_purge_lobbies
    
    def counting_do_purge():
        purge_count[0] += 1
        return original_do_purge()
    
    with patch.object(server, '_do_purge_lobbies', side_effect=counting_do_purge):
        # Regular purge should be rate limited
        server.purge_lobbies()
        assert purge_count[0] == 0, "Regular purge should be rate limited"
        
        # Force purge should bypass rate limiting
        server.force_purge_lobbies()
        assert purge_count[0] == 1, "Force purge should bypass rate limiting"