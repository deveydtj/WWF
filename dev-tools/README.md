# WordSquad Development Tools

This directory contains development utilities and tools for WordSquad that are not part of the main test suite.

## Files

### `run_test_lobby.py`
A Python script that creates a predefined test lobby and starts the Flask server for local network testing. Useful for:
- Testing multiplayer functionality across devices on the same network
- Manual testing and demonstration
- Development and debugging

### `test_lobby.sh`
A shell script wrapper for `run_test_lobby.py` that:
- Checks system requirements (Python 3.12+, dependencies)
- Provides user-friendly output and instructions
- Handles setup and error checking

## Usage

```bash
# From the repository root:
./dev-tools/test_lobby.sh

# Or run the Python script directly:
python3 dev-tools/run_test_lobby.py
```

## Requirements

- Python 3.12+
- Flask and other dependencies from `backend/requirements.txt`
- Required game data files (`data/sgb-words.txt`, etc.)

These tools are for development use only and are not included in the main test suite.