"""Tests to verify AWS optimization changes are working correctly."""

import json
from unittest.mock import patch, MagicMock
import pytest

from backend.server import app, WORDS, WORDS_LOADED, redis_client, load_data, fetch_definition


class TestAWSOptimizations:
    """Test suite for AWS efficiency optimizations."""

    def test_words_loaded_in_memory_cache(self):
        """Test that WORDS list is loaded and cached in memory."""
        assert len(WORDS) > 0, "WORDS list should be loaded"
        assert WORDS_LOADED is True, "WORDS_LOADED flag should be True"
        # Verify we have the expected number of words from the file
        assert len(WORDS) > 2000, "Should have loaded substantial word list"

    def test_load_data_does_not_reload_words_when_cached(self):
        """Test that load_data doesn't reload words when already cached."""
        original_words_count = len(WORDS)
        
        # Call load_data when words are already loaded
        load_data()
        
        # Verify words count hasn't changed (indicating no reload from file)
        assert len(WORDS) == original_words_count, "WORDS should not be reloaded when cached"
        assert WORDS_LOADED is True, "WORDS_LOADED should remain True"

    def test_redis_connection_pooling_configured(self):
        """Test that Redis connection pooling is properly configured."""
        if redis_client:
            # Verify that connection pool is being used
            assert hasattr(redis_client, 'connection_pool'), "Redis client should use connection pool"
            pool = redis_client.connection_pool
            assert pool.max_connections == 20, "Connection pool should have max_connections=20"

    def test_external_api_timeout_optimized(self):
        """Test that external API calls use optimized timeout."""
        with patch('backend.server.requests.get') as mock_get:
            mock_response = MagicMock()
            mock_response.json.return_value = []
            mock_get.return_value = mock_response
            
            # Call function that makes external API call
            fetch_definition("test")
            
            # Verify timeout is set to 3 seconds (optimized from 5)
            mock_get.assert_called()
            call_args = mock_get.call_args
            assert call_args[1]['timeout'] == 3, "API timeout should be optimized to 3 seconds"

    def test_health_endpoint_exists(self):
        """Test that the health endpoint exists for ALB health checks."""
        from backend.server import health, app
        with app.app_context():
            response = health()
            # Health function returns Flask response or tuple
            if isinstance(response, tuple):
                data, status_code = response
                assert status_code == 200
            else:
                # Response object
                assert '"status":"ok"' in str(response.data) or '"status": "ok"' in str(response)

    def test_health_endpoint_reports_missing_assets(self):
        """Test that health endpoint properly reports missing assets."""
        from backend.server import health, app
        with app.app_context():
            # Mock missing WORDS to test unhealthy state
            with patch('backend.server.WORDS', []):
                response = health()
                # Should return tuple (response, status_code) for error cases
                if isinstance(response, tuple):
                    data, status_code = response
                    assert status_code == 503
                else:
                    # Check response contains unhealthy status
                    assert 'unhealthy' in str(response.data)