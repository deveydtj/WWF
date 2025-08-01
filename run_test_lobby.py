#!/usr/bin/env python3
"""
Single lobby test script for WordSquad
Creates a predefined lobby and starts the server for local network testing.
"""

import os
import sys
import json
import time
import signal
import socket
import subprocess
from pathlib import Path

# Add backend to path so we can import modules
sys.path.insert(0, str(Path(__file__).parent / "backend"))

def get_local_ip():
    """Get the local IP address for network access."""
    try:
        # Connect to a remote address to determine the local IP
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            # Don't return localhost - try to get a real network IP
            if local_ip != "127.0.0.1":
                return local_ip
    except Exception:
        pass
    
    # Fallback: try to get hostname IP
    try:
        hostname = socket.gethostname()
        return socket.gethostbyname(hostname)
    except Exception:
        return "127.0.0.1"

def create_test_lobby():
    """Create a predefined test lobby."""
    from server import LOBBIES, GameState, _reset_state, pick_new_word, save_data
    import random
    import string
    
    # Use a fixed test lobby code for easy access
    test_code = "TEST01"
    
    print(f"Creating test lobby: {test_code}")
    
    # Create the lobby state
    state = _reset_state(GameState())
    pick_new_word(state)
    
    # Generate a host token
    token = "".join(random.choices(string.ascii_letters + string.digits, k=32))
    state.host_token = token
    
    # Add to lobbies
    LOBBIES[test_code] = state
    save_data(state)
    
    return test_code, token

def main():
    """Run the test lobby server."""
    print("=== WordSquad Test Lobby ===")
    print("Setting up single lobby for local network testing...\n")
    
    # Change to the repository directory
    repo_dir = Path(__file__).parent
    os.chdir(repo_dir)
    
    # Check if dependencies are installed
    try:
        import flask
        import flask_cors
    except ImportError as e:
        print(f"Error: Missing dependencies. Please run:")
        print(f"  pip install -r backend/requirements.txt")
        sys.exit(1)
    
    # Check if required files exist
    required_files = [
        "backend/server.py",
        "data/sgb-words.txt",
        "data/offline_definitions.json"
    ]
    
    for file_path in required_files:
        if not Path(file_path).exists():
            print(f"Error: Required file not found: {file_path}")
            sys.exit(1)
    
    try:
        # Create the test lobby
        test_code, host_token = create_test_lobby()
        
        # Get network information
        local_ip = get_local_ip()
        port = 5001
        
        print(f"✅ Test lobby created!")
        print(f"   Lobby Code: {test_code}")
        print(f"   Host Token: {host_token}")
        print()
        print("🌐 Access URLs:")
        print(f"   Local:   http://localhost:{port}/lobby/{test_code}")
        print(f"   Network: http://{local_ip}:{port}/lobby/{test_code}")
        print()
        print("📝 Instructions:")
        print("   1. Share the Network URL with others on your network")
        print("   2. Everyone can join using the same URL")
        print("   3. Choose emojis and start playing!")
        print("   4. Press Ctrl+C to stop the server")
        print()
        print("Starting server...")
        print("=" * 50)
        
        # Start the Flask server
        from server import app, load_data
        
        # Load existing data
        load_data()
        
        # Start the server
        app.run(host="0.0.0.0", port=port, debug=False)
        
    except KeyboardInterrupt:
        print("\n\n🛑 Server stopped by user")
        print("Thanks for testing WordSquad!")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()