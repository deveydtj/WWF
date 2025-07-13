"""Tests for duplicate emoji handling functionality."""

import json
import sys
import types
import importlib
import importlib.util
from pathlib import Path


def create_mock_flask():
    """Create a mock Flask module for testing."""
    flask_stub = types.ModuleType('flask')
    
    class DummyRequest:
        def __init__(self):
            self.headers = {}
            self.remote_addr = "127.0.0.1"
            self.json = None
        
        def get_json(self, silent=False):
            return self.json
    
    def jsonify(*args, **kwargs):
        if args:
            d = dict(args[0])
            d.update(kwargs)
            return d
        return kwargs
    
    class Flask:
        def __init__(self, name, **kwargs):
            self.name = name
            self.static_folder = kwargs.get('static_folder')
            self.static_url_path = kwargs.get('static_url_path')
        
        def route(self, *a, **kw):
            def decorator(func):
                return func
            return decorator
        
        def before_request(self, func):
            return func
    
    class CORS:
        def __init__(self, app):
            self.app = app
    
    flask_stub.request = DummyRequest()
    flask_stub.jsonify = jsonify
    flask_stub.Flask = Flask
    flask_stub.send_from_directory = lambda *a, **kw: ""
    
    # Mock Flask-Cors
    flask_cors_stub = types.ModuleType('flask_cors')
    flask_cors_stub.CORS = CORS
    
    return flask_stub, flask_cors_stub


def test_duplicate_emoji_rejection():
    """Test current behavior - duplicate emoji selection is rejected."""
    # Mock flask before importing server
    flask_stub, flask_cors_stub = create_mock_flask()
    sys.modules['flask'] = flask_stub
    sys.modules['flask_cors'] = flask_cors_stub
    
    try:
        # Import server module after mocking
        spec = importlib.util.spec_from_file_location(
            "server", 
            Path(__file__).parent.parent / "backend" / "server.py"
        )
        server_module = importlib.util.module_from_spec(spec)
        
        # Set up the request for first player
        flask_stub.request.json = {'emoji': '🐶', 'player_id': 'player1'}
        
        # Import and execute the server module to set up initial state
        spec.loader.exec_module(server_module)
        
        # Call set_emoji for first player
        result1 = server_module.set_emoji()
        
        # Verify first player succeeded
        assert result1['status'] == 'ok'
        
        # Set up request for second player with same emoji
        flask_stub.request.json = {'emoji': '🐶', 'player_id': 'player2'}
        
        # Call set_emoji for second player
        result2 = server_module.set_emoji()
        
        # Verify second player was rejected
        assert result2[0]['status'] == 'error'
        assert 'taken' in result2[0]['msg'].lower()
        assert result2[1] == 409  # Conflict status code
        
    finally:
        # Clean up modules
        if 'flask' in sys.modules:
            del sys.modules['flask']
        if 'flask_cors' in sys.modules:
            del sys.modules['flask_cors']