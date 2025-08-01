# Test Lobby Scripts

This directory contains simple scripts to run a single WordSquad lobby locally for testing on your network.

## Quick Start

### Option 1: Bash Script (Simplest)
```bash
./test_lobby.sh
```

### Option 2: Python Script (Direct)
```bash
python3 run_test_lobby.py
```

## What These Scripts Do

1. **Create a predefined test lobby** with code `TEST01`
2. **Start the WordSquad server** on port 5001
3. **Display connection URLs** for local and network access
4. **Handle cleanup** when you press Ctrl+C

## Usage

1. Run one of the scripts above
2. Share the **Network URL** with others on your local network
3. Everyone opens the same URL in their browser
4. Choose emojis and start playing Wordle together!
5. Press **Ctrl+C** to stop the server

## Example Output

```
=== WordSquad Test Lobby ===
Setting up single lobby for local network testing...

✅ Test lobby created!
   Lobby Code: TEST01
   Host Token: xyz123...

🌐 Access URLs:
   Local:   http://localhost:5001/lobby/TEST01
   Network: http://192.168.1.100:5001/lobby/TEST01

📝 Instructions:
   1. Share the Network URL with others on your network
   2. Everyone can join using the same URL
   3. Choose emojis and start playing!
   4. Press Ctrl+C to stop the server
```

## Requirements

- Python 3.12+
- Flask and Flask-Cors (installed automatically by test_lobby.sh)

## Notes

- The test lobby code is always `TEST01` for consistency
- The server runs on all network interfaces (0.0.0.0) so others can connect
- No Docker required - this is a native Python solution
- Uses the same game engine as the full WordSquad application