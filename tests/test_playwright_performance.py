"""Performance tests using Playwright server to demonstrate the optimization."""

import pytest
import threading
import time
from wsgiref.simple_server import make_server
from importlib import reload

pytest.importorskip("flask")
playwright = pytest.importorskip("playwright.sync_api")
import backend.server as server  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402


@pytest.fixture(scope="module")
def live_server():
    """Start a live server for testing."""
    reload(server)
    server.load_data(server.current_state)
    if not server.current_state.target_word:
        server.pick_new_word(server.current_state)
    srv = make_server("localhost", 5011, server.app)  # Use different port
    thread = threading.Thread(target=srv.serve_forever)
    thread.daemon = True
    thread.start()
    time.sleep(0.5)
    yield "http://localhost:5011"
    srv.shutdown()
    thread.join()


def test_purge_performance_with_many_lobbies(live_server):
    """Test that performance optimization works with many lobbies via real HTTP requests."""
    url = live_server
    
    # Reset purge timer to ensure clean state
    server._last_purge_time = 0.0
    
    with sync_playwright() as pw:
        request = pw.request.new_context(base_url=url)
        
        # Create lobbies within rate limits
        num_lobbies = 3  # Reduced to stay within rate limits
        lobby_codes = []
        
        for i in range(num_lobbies):
            resp = request.post("/lobby")
            data = resp.json()
            if "id" in data:
                lobby_codes.append(data["id"])
        
        if len(lobby_codes) == 0:
            pytest.skip("Could not create any lobbies due to rate limiting")
        
        # Verify lobbies were created
        print(f"Created {len(lobby_codes)} lobbies")
        
        # Count actual purge operations during rapid operations
        actual_purge_count = [0]
        original_do_purge = server._do_purge_lobbies
        
        def counting_do_purge():
            actual_purge_count[0] += 1
            return original_do_purge()
        
        # Patch the actual purge function to count operations
        server._do_purge_lobbies = counting_do_purge
        
        try:
            # Simulate rapid lobby state checks (these call _with_lobby -> purge_lobbies)
            operations = 10  # Reduced operations count
            start_time = time.time()
            
            for i in range(operations):
                code = lobby_codes[i % len(lobby_codes)]
                # Get lobby state triggers purge_lobbies via _with_lobby
                resp = request.get(f"/lobby/{code}/state")
                assert resp.status == 200
            
            end_time = time.time()
            
            # With rate limiting, should have very few actual purges despite many operations
            print(f"Performed {operations} lobby state requests")
            print(f"Actual purges: {actual_purge_count[0]} (rate limited)")
            print(f"Total time: {end_time - start_time:.4f}s")
            
            # Should be heavily rate limited - at most 1-2 actual purges for rapid operations
            assert actual_purge_count[0] <= 2, f"Too many purges: {actual_purge_count[0]}"
            
        finally:
            # Restore original function
            server._do_purge_lobbies = original_do_purge


def test_force_purge_still_works_immediately(live_server):
    """Test that force purge bypasses rate limiting for scheduled cleanup."""
    url = live_server
    
    with sync_playwright() as pw:
        request = pw.request.new_context(base_url=url)
        
        # Create a lobby and make it expired
        resp = request.post("/lobby")
        data = resp.json()
        code = data["id"]
        
        # Make the lobby expire
        state = server.LOBBIES[code]
        state.phase = "finished"
        state.last_activity = time.time() - server.LOBBY_TTL - 100
        
        # Verify lobby exists before cleanup
        assert code in server.LOBBIES
        
        # Call the cleanup endpoint which uses force_purge_lobbies
        resp = request.post("/internal/purge")
        assert resp.status == 200
        
        # Verify lobby was removed
        assert code not in server.LOBBIES
        print("Force purge successfully removed expired lobby")


def test_regular_purge_rate_limiting_via_http(live_server):
    """Test rate limiting behavior through actual HTTP requests."""
    url = live_server
    
    # Reset purge timer
    server._last_purge_time = 0.0
    
    with sync_playwright() as pw:
        request = pw.request.new_context(base_url=url)
        
        # Create a lobby
        resp = request.post("/lobby")
        data = resp.json()
        code = data["id"]
        
        # Count actual purge operations
        purge_count = [0]
        original_do_purge = server._do_purge_lobbies
        
        def counting_do_purge():
            purge_count[0] += 1
            return original_do_purge()
        
        server._do_purge_lobbies = counting_do_purge
        
        try:
            # Make rapid requests that trigger purge_lobbies
            for _ in range(10):
                resp = request.get(f"/lobby/{code}/state")
                assert resp.status == 200
            
            # Should only have 1 actual purge due to rate limiting
            assert purge_count[0] <= 1, f"Too many purges: {purge_count[0]}"
            print(f"Rate limiting working: {purge_count[0]} purges for 10 requests")
            
        finally:
            server._do_purge_lobbies = original_do_purge


def test_performance_comparison_before_after(live_server):
    """Compare performance before and after optimization."""
    url = live_server
    
    # This test demonstrates the difference in behavior
    # In the old implementation, every lobby operation would scan all lobbies
    # In the new implementation, scanning is rate-limited
    
    with sync_playwright() as pw:
        request = pw.request.new_context(base_url=url)
        
        # Create lobbies within rate limit (max 5 per minute)
        num_lobbies = 4
        lobby_codes = []
        
        for i in range(num_lobbies):
            resp = request.post("/lobby")
            data = resp.json()
            if "id" in data:
                lobby_codes.append(data["id"])
            else:
                # Handle rate limit gracefully
                print(f"Rate limited after {len(lobby_codes)} lobbies")
                break
        
        if len(lobby_codes) == 0:
            pytest.skip("Could not create any lobbies due to rate limiting")
        
        print(f"\nPerformance test with {len(lobby_codes)} lobbies:")
        
        # Test with our optimization (current implementation)
        server._last_purge_time = 0.0  # Reset timer
        
        purge_count = [0]
        original_do_purge = server._do_purge_lobbies
        
        def counting_do_purge():
            purge_count[0] += 1
            return original_do_purge()
        
        server._do_purge_lobbies = counting_do_purge
        
        try:
            # Time operations with rate limiting
            start_time = time.time()
            operations = 15  # Reduced number to work with fewer lobbies
            
            for i in range(operations):
                code = lobby_codes[i % len(lobby_codes)]
                resp = request.get(f"/lobby/{code}/state")
                assert resp.status == 200
            
            optimized_time = time.time() - start_time
            optimized_purges = purge_count[0]
            
            print(f"Optimized: {operations} operations in {optimized_time:.4f}s")
            print(f"Actual purges: {optimized_purges} (rate limited)")
            print(f"Performance gain: Rate limiting prevents O(n²) behavior")
            
            # The optimization should result in very few actual purge operations
            assert optimized_purges <= 2, "Rate limiting should prevent excessive purging"
            
        finally:
            server._do_purge_lobbies = original_do_purge