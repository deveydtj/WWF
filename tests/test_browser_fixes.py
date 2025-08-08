"""Test browser compatibility fixes for viewport meta tags and cache-control headers."""

import unittest
import tempfile
import os
from pathlib import Path
from unittest.mock import patch
from backend.server import app


class TestBrowserFixes(unittest.TestCase):
    """Test browser compatibility improvements."""
    
    def setUp(self):
        """Set up test environment."""
        self.app = app
        self.client = app.test_client()
        self.app.config['TESTING'] = True
        
        # Create temporary files for testing
        self.temp_dir = tempfile.mkdtemp()
        self.temp_game_file = Path(self.temp_dir) / "game.json"
        self.temp_lobbies_file = Path(self.temp_dir) / "lobbies.json"
        self.temp_analytics_file = Path(self.temp_dir) / "analytics.log"
        
    def tearDown(self):
        """Clean up test environment."""
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_viewport_meta_tag_fixed_in_index(self):
        """Test that index.html has proper viewport meta tag without maximum-scale and user-scalable."""
        # Check both the source frontend file and the built version
        frontend_dir = Path(__file__).parent.parent / "frontend"
        index_file = frontend_dir / "index.html"
        
        # Also check the built version
        backend_dir = Path(__file__).parent.parent / "backend"
        built_index_file = backend_dir / "static" / "index.html"
        
        files_to_check = [index_file]
        if built_index_file.exists():
            files_to_check.append(built_index_file)
        
        for file_to_check in files_to_check:
            self.assertTrue(file_to_check.exists(), f"{file_to_check} should exist")
            
            content = file_to_check.read_text()
            
            # Check that the viewport meta tag exists and doesn't contain the problematic attributes
            self.assertIn('name="viewport"', content, f"Viewport meta tag should exist in {file_to_check}")
            self.assertNotIn('maximum-scale', content, f"Viewport should not contain maximum-scale in {file_to_check}")
            self.assertNotIn('user-scalable', content, f"Viewport should not contain user-scalable in {file_to_check}")
            
            # Verify it contains the essential viewport attributes
            self.assertIn('width=device-width', content, f"Viewport should set width=device-width in {file_to_check}")
            self.assertIn('initial-scale=1', content, f"Viewport should set initial-scale=1 in {file_to_check}")
        
    def test_cache_control_headers_for_html_pages(self):
        """Test that HTML pages have appropriate cache-control headers."""
        # Test the cache control function directly since mocking Flask context is complex
        from backend.server import add_cache_control_headers
        from unittest.mock import Mock
        
        # Create a mock response and set up test context
        mock_response = Mock()
        mock_response.headers = {}
        
        with app.test_request_context('/', method='GET'):
            result = add_cache_control_headers(mock_response)
            
            self.assertEqual(result, mock_response)
            self.assertEqual(mock_response.headers['Cache-Control'], 'public, max-age=300, must-revalidate')
    
    def test_cache_control_headers_for_api_endpoints(self):
        """Test that API endpoints have no-cache headers."""
        response = self.client.get('/state')
        
        self.assertIn('Cache-Control', response.headers)
        cache_control = response.headers.get('Cache-Control')
        
        # API endpoints should not be cached
        self.assertIn('no-cache', cache_control)
        self.assertIn('no-store', cache_control)
        self.assertIn('must-revalidate', cache_control)
        
        # Should also have additional no-cache headers
        self.assertIn('Pragma', response.headers)
        self.assertEqual('no-cache', response.headers.get('Pragma'))
        self.assertIn('Expires', response.headers)
        self.assertEqual('0', response.headers.get('Expires'))
    
    def test_cache_control_headers_for_static_assets(self):
        """Test that static assets have long cache headers."""
        # Test the cache control function directly for static assets
        from backend.server import add_cache_control_headers
        from unittest.mock import Mock
        
        # Create a mock response for static asset request
        mock_response = Mock()
        mock_response.headers = {}
        
        with app.test_request_context('/static/js/test.js', method='GET'):
            result = add_cache_control_headers(mock_response)
            
            self.assertEqual(result, mock_response)
            self.assertEqual(mock_response.headers['Cache-Control'], 'public, max-age=86400, immutable')
    
    def test_health_endpoint_cache_control(self):
        """Test that health endpoint has no-cache headers."""
        response = self.client.get('/health')
        
        self.assertIn('Cache-Control', response.headers)
        cache_control = response.headers.get('Cache-Control')
        
        # Health endpoint should not be cached
        self.assertIn('no-cache', cache_control)
        self.assertIn('no-store', cache_control)
        self.assertIn('must-revalidate', cache_control)
    
    def test_game_html_viewport_remains_correct(self):
        """Test that game.html still has the correct viewport settings."""
        frontend_dir = Path(__file__).parent.parent / "frontend"
        game_file = frontend_dir / "game.html"
        
        self.assertTrue(game_file.exists(), "Frontend game.html should exist")
        
        content = game_file.read_text()
        
        # Check that game.html has a proper viewport meta tag
        self.assertIn('name="viewport"', content, "Game viewport meta tag should exist")
        self.assertIn('width=device-width', content, "Game viewport should set width=device-width")
        self.assertIn('initial-scale=1', content, "Game viewport should set initial-scale=1")
        
        # game.html should include viewport-fit and interactive-widget for better mobile support
        self.assertIn('viewport-fit=cover', content, "Game viewport should include viewport-fit=cover")
        self.assertIn('interactive-widget=resizes-content', content, "Game viewport should handle interactive widgets")


if __name__ == '__main__':
    unittest.main()