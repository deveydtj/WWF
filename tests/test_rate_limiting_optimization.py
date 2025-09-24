"""Test the rate limiting optimization to ensure O(1) performance."""

import collections
import time
import pytest
from backend.server import check_api_rate_limit, check_guess_rate_limit, API_REQUEST_TIMES, GUESS_REQUEST_TIMES
from backend.server import API_RATE_LIMIT, API_RATE_WINDOW, GUESS_RATE_LIMIT, GUESS_RATE_WINDOW


class TestRateLimitingOptimization:
    """Test that rate limiting functions use efficient deque-based cleanup."""
    
    def setup_method(self):
        """Clear rate limiting state before each test."""
        API_REQUEST_TIMES.clear()
        GUESS_REQUEST_TIMES.clear()
    
    def test_api_rate_limit_uses_deque(self):
        """Test that API rate limiting uses deque data structure."""
        ip = "192.168.1.1"
        
        # Make a request to initialize the deque
        assert check_api_rate_limit(ip) is True
        
        # Verify the data structure is a deque
        assert isinstance(API_REQUEST_TIMES[ip], collections.deque)
        assert len(API_REQUEST_TIMES[ip]) == 1
    
    def test_guess_rate_limit_uses_deque(self):
        """Test that guess rate limiting uses deque data structure."""
        player_id = "test_player_123"
        
        # Make a request to initialize the deque
        assert check_guess_rate_limit(player_id) is True
        
        # Verify the data structure is a deque
        assert isinstance(GUESS_REQUEST_TIMES[player_id], collections.deque)
        assert len(GUESS_REQUEST_TIMES[player_id]) == 1
    
    def test_api_rate_limit_cleanup_efficiency(self):
        """Test that old timestamps are efficiently removed from the front."""
        ip = "192.168.1.2"
        now = time.time()
        
        # Add some old timestamps manually to simulate previous requests
        old_times = collections.deque()
        for i in range(5):
            old_times.append(now - API_RATE_WINDOW - 10 - i)  # All older than window
        old_times.append(now - 5)  # This should remain
        API_REQUEST_TIMES[ip] = old_times
        
        # Make a new request - should clean up old timestamps
        result = check_api_rate_limit(ip)
        assert result is True
        
        # Should only have the recent timestamp and the new one
        assert len(API_REQUEST_TIMES[ip]) == 2
        # Verify the old timestamps were removed
        remaining_times = list(API_REQUEST_TIMES[ip])
        assert all(now - t < API_RATE_WINDOW for t in remaining_times)
    
    def test_guess_rate_limit_cleanup_efficiency(self):
        """Test that old guess timestamps are efficiently removed from the front."""
        player_id = "test_player_456"
        now = time.time()
        
        # Add some old timestamps manually to simulate previous guesses
        old_times = collections.deque()
        for i in range(3):
            old_times.append(now - GUESS_RATE_WINDOW - 10 - i)  # All older than window
        old_times.append(now - 5)  # This should remain
        GUESS_REQUEST_TIMES[player_id] = old_times
        
        # Make a new guess - should clean up old timestamps
        result = check_guess_rate_limit(player_id)
        assert result is True
        
        # Should only have the recent timestamp and the new one
        assert len(GUESS_REQUEST_TIMES[player_id]) == 2
        # Verify the old timestamps were removed
        remaining_times = list(GUESS_REQUEST_TIMES[player_id])
        assert all(now - t < GUESS_RATE_WINDOW for t in remaining_times)
    
    def test_api_rate_limit_enforcement_still_works(self):
        """Test that rate limiting still correctly enforces limits."""
        ip = "192.168.1.3"
        
        # Fill up the rate limit
        for i in range(API_RATE_LIMIT):
            result = check_api_rate_limit(ip)
            assert result is True
        
        # Next request should be rate limited
        result = check_api_rate_limit(ip)
        assert result is False
        
        # Verify we have exactly the limit number of timestamps
        assert len(API_REQUEST_TIMES[ip]) == API_RATE_LIMIT
    
    def test_guess_rate_limit_enforcement_still_works(self):
        """Test that guess rate limiting still correctly enforces limits."""
        player_id = "test_player_789"
        
        # Fill up the rate limit
        for i in range(GUESS_RATE_LIMIT):
            result = check_guess_rate_limit(player_id)
            assert result is True
        
        # Next request should be rate limited
        result = check_guess_rate_limit(player_id)
        assert result is False
        
        # Verify we have exactly the limit number of timestamps
        assert len(GUESS_REQUEST_TIMES[player_id]) == GUESS_RATE_LIMIT
    
    def test_time_window_expiration(self):
        """Test that requests become allowed again after the time window expires."""
        ip = "192.168.1.4"
        now = time.time()
        
        # Manually add timestamps that are just at the edge of expiring
        times = collections.deque()
        for i in range(API_RATE_LIMIT):
            times.append(now - API_RATE_WINDOW + 0.1)  # Just within window
        API_REQUEST_TIMES[ip] = times
        
        # Should be rate limited
        result = check_api_rate_limit(ip)
        assert result is False
        
        # Simulate time passing by adding old timestamps
        API_REQUEST_TIMES[ip].clear()
        for i in range(API_RATE_LIMIT):
            times.append(now - API_RATE_WINDOW - 1)  # Now outside window
        API_REQUEST_TIMES[ip] = times
        
        # Should be allowed again (old timestamps get cleaned up)
        result = check_api_rate_limit(ip)
        assert result is True
        
        # Should only have the new timestamp
        assert len(API_REQUEST_TIMES[ip]) == 1