from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import random
import json
import os
import time
import urllib.request
import urllib.error
import logging

app = Flask(__name__)
app.secret_key = "a_wordle_secret"
CORS(app)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s:%(message)s")

WORDS_FILE = "sgb-words.txt"
GAME_FILE = "game_persist.json"
MAX_ROWS = 6

# ---- Globals ----
WORDS = []
target_word = ""
guesses = []
is_over = False
winner_emoji = None

leaderboard = {}      # emoji: {ip, score, used_yellow, used_green, last_active}
ip_to_emoji = {}      # ip: emoji
found_greens = set()  # all letters found as green by anyone this game
found_yellows = set() # all letters found as yellow by anyone this game
past_games = []       # list of finished games’ guess lists
definition = None     # definition for the last solved word
last_word = None      # last completed word
last_definition = None  # definition of last completed word


def save_data():
    data = {
        "leaderboard": leaderboard,
        "ip_to_emoji": ip_to_emoji,
        "winner_emoji": winner_emoji,
        "target_word": target_word,
        "guesses": guesses,
        "is_over": is_over,
        "found_greens": list(found_greens),
        "found_yellows": list(found_yellows),
        "past_games": past_games,
        "definition": definition,
        "last_word": last_word,
        "last_definition": last_definition
    }
    with open(GAME_FILE, "w") as f:
        json.dump(data, f)


def load_data():
    global WORDS, leaderboard, ip_to_emoji, winner_emoji
    global target_word, guesses, is_over, found_greens, found_yellows, past_games, definition
    global last_word, last_definition

    # Load word list
    with open(WORDS_FILE) as f:
        WORDS = [line.strip().lower() for line in f if len(line.strip()) == 5]

    if os.path.exists(GAME_FILE):
        with open(GAME_FILE) as f:
            try:
                data = json.load(f)
                leaderboard   = data.get("leaderboard", {})
                ip_to_emoji   = data.get("ip_to_emoji", {})
                winner_emoji  = data.get("winner_emoji")
                target_word   = data.get("target_word", "")
                guesses[:]    = data.get("guesses", [])
                is_over       = data.get("is_over", False)
                found_greens  = set(data.get("found_greens", []))
                found_yellows = set(data.get("found_yellows", []))
                past_games[:] = data.get("past_games", [])
                definition    = data.get("definition")
                last_word     = data.get("last_word")
                last_definition = data.get("last_definition")
            except Exception:
                leaderboard.clear()
                ip_to_emoji.clear()
                winner_emoji = None
                target_word  = ""
                guesses.clear()
                is_over = False
                found_greens.clear()
                found_yellows.clear()
                past_games.clear()
                definition = None
                last_word = None
                last_definition = None
    else:
        leaderboard.clear()
        ip_to_emoji.clear()
        winner_emoji = None
        target_word  = ""
        guesses.clear()
        is_over = False
        found_greens.clear()
        found_yellows.clear()
        past_games.clear()
        definition = None
        last_word = None
        last_definition = None

# ---- Game Logic ----
def pick_new_word():
    global target_word, guesses, is_over, winner_emoji, found_greens, found_yellows, definition
    target_word = random.choice(WORDS)
    guesses.clear()
    is_over = False
    winner_emoji = None
    found_greens = set()
    found_yellows = set()
    definition = None

def fetch_definition(word):
    url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{word}"
    logging.info(f"Fetching definition for '{word}'")
    try:
        logging.info(f"Trying online dictionary API for '{word}'")
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) "
                    "Gecko/20100101 Firefox/109.0"
                )
            },
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if isinstance(data, list) and data:
                meanings = data[0].get("meanings")
                if meanings:
                    defs = meanings[0].get("definitions")
                    if defs:
                        definition = defs[0].get("definition")
                        logging.info(f"Online definition for '{word}': {definition}")
                        return definition
    except urllib.error.URLError as e:
        logging.info(f"Online lookup failed for '{word}': {e}. Trying offline cache.")
        try:
            with open("offline_definitions.json") as f:
                offline = json.load(f)
            definition = offline.get(word)
            if definition:
                logging.info(f"Offline definition for '{word}': {definition}")
            else:
                logging.info(f"No offline definition found for '{word}'")
            return definition
        except Exception as e2:
            logging.info(f"Offline lookup failed for '{word}': {e2}")
    except Exception as e:
        logging.info(f"Unexpected error fetching definition for '{word}': {e}")
    logging.info(f"No definition found for '{word}'")
    return None

def get_client_ip():
    if request.headers.getlist("X-Forwarded-For"):
        return request.headers.getlist("X-Forwarded-For")[0].split(',')[0]
    return request.remote_addr or "unknown"

def result_for_guess(guess, target):
    result = ["absent"] * 5
    target_letters = list(target)
    for i in range(5):
        if guess[i] == target[i]:
            result[i] = "correct"
            target_letters[i] = None
    for i in range(5):
        if result[i] == "correct":
            continue
        if guess[i] in target_letters:
            result[i] = "present"
            target_letters[target_letters.index(guess[i])] = None
    return result

def get_required_letters_and_positions():
    required_letters = set()
    green_positions = {}
    for g in guesses:
        for i, res in enumerate(g["result"]):
            if res == "correct":
                required_letters.add(g["guess"][i])
                green_positions[i] = g["guess"][i]
            elif res == "present":
                required_letters.add(g["guess"][i])
    return required_letters, green_positions

def validate_hard_mode(guess):
    required_letters, green_positions = get_required_letters_and_positions()
    for idx, ch in green_positions.items():
        if guess[idx] != ch:
            return False, f"Letter {ch.upper()} must be in position {idx+1}."
    if required_letters:
        if not all(l in guess for l in required_letters):
            missing = [l for l in required_letters if l not in guess]
            return False, f"Guess must contain letter(s): {', '.join(m.upper() for m in missing)}."
    return True, ""

# ---- API Routes ----

@app.route("/state", methods=["GET", "POST"])
def state():
    # ——— Heartbeat: bump AFK timestamp on every client poll ———
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        e = data.get("emoji")
        if e and e in leaderboard:
            leaderboard[e]["last_active"] = time.time()
            save_data()

    # ——— Build leaderboard payload exactly as before ———
    lb = [
        {
            "emoji": emoji,
            "score": leaderboard[emoji]["score"],
            "last_active": leaderboard[emoji].get("last_active", 0)
        }
        for emoji in leaderboard
    ]
    lb.sort(key=lambda e: e["score"], reverse=True)

    # ——— Return full game state exactly as before ———
    return jsonify({
        "guesses":      guesses,
        "target_word":  target_word if is_over else None,
        "is_over":      is_over,
        "leaderboard":  lb,
        "active_emojis": list(leaderboard.keys()),
        "winner_emoji":  winner_emoji,
        "max_rows":      MAX_ROWS,
        "past_games":    past_games,
        "definition":    definition if is_over else None,
        "last_word":     last_word,
        "last_definition": last_definition
    })

@app.route("/emoji", methods=["POST"])
def set_emoji():
    data = request.json or {}
    emoji = data.get("emoji")
    ip = get_client_ip()
    now = time.time()

    if not emoji or not isinstance(emoji, str):
        return jsonify({"status": "error", "msg": "Invalid emoji."}), 400

    if emoji in leaderboard and leaderboard[emoji]["ip"] != ip:
        return jsonify({"status": "error", "msg": "That emoji is taken!"}), 409

    prev_emoji = ip_to_emoji.get(ip)
    if prev_emoji and prev_emoji != emoji:
        leaderboard.pop(prev_emoji, None)

    leaderboard[emoji] = leaderboard.get(emoji, {
        "ip": ip,
        "score": 0,
        "used_yellow": [],
        "used_green": [],
        "last_active": now
    })
    leaderboard[emoji]["ip"] = ip
    leaderboard[emoji]["last_active"] = now
    ip_to_emoji[ip] = emoji
    save_data()
    return jsonify({"status": "ok"})

@app.route("/guess", methods=["POST"])
def guess_word():
    global is_over, winner_emoji, found_greens, found_yellows, definition
    global last_word, last_definition
    data = request.json or {}
    guess = (data.get("guess") or "").strip().lower()
    # ▶ Prevent duplicates
    existing = [g["guess"] for g in guesses]
    if guess in existing:
        return jsonify(status="error", msg="You’ve already guessed that word.")
 
    emoji = data.get("emoji")
    ip = get_client_ip()
    points_delta = 0
    now = time.time()

    if is_over:
        return jsonify({"status": "error", "msg": "Game is over. Please reset."}), 403
    if not guess or len(guess) != 5 or guess not in WORDS:
        return jsonify({"status": "error", "msg": "Not a valid 5-letter word."}), 400
    if emoji not in leaderboard or leaderboard[emoji]["ip"] != ip:
        return jsonify({"status": "error", "msg": "Please pick an emoji before playing."}), 403

    leaderboard[emoji]["last_active"] = now

    ok, msg = validate_hard_mode(guess)
    if not ok:
        return jsonify({"status": "error", "msg": msg}), 400

    result = result_for_guess(guess, target_word)
    new_entry = {"guess": guess, "result": result, "emoji": emoji}
    already_guessed = any(g["guess"] == guess for g in guesses)
    guesses.append(new_entry)

    # Points logic: Only award for globally new discoveries!
    global_found_this_turn = set()
    for i, r in enumerate(result):
        letter = guess[i]
        if r == "correct":
            # if we've never scored this letter as green *this game*:
            if letter not in found_greens and letter not in global_found_this_turn:
                if letter in found_yellows:
                    # it was yellow before, now green → +1
                    points_delta += 1
                    found_yellows.remove(letter)
                else:
                    # brand-new green → +2
                    points_delta += 2
                found_greens.add(letter)
                global_found_this_turn.add(letter)
        elif r == "present":
            if letter not in found_greens and letter not in found_yellows and letter not in global_found_this_turn:
                points_delta += 1
                found_yellows.add(letter)
                global_found_this_turn.add(letter)

    # Bonus for win, penalty for wrong final guess
    won = guess == target_word
    over = False

    if won:
        points_delta += 3
        winner_emoji = emoji
        is_over = True
        over = True
    elif len(guesses) == MAX_ROWS:
        is_over = True
        over = True
        if not won:
            points_delta -= 3  # Last guess, failed

    if over:
        definition = fetch_definition(target_word)
        logging.info(
            f"Definition lookup complete for '{target_word}': {definition or 'None'}"
        )
        last_word = target_word
        last_definition = definition

    # -1 penalty for duplicate guesses with no new yellows/greens
    if points_delta == 0 and not won and not over:
        points_delta -= 1

    leaderboard[emoji]["score"] += points_delta
    save_data()
    # — attach this turn’s points so client can render a history
    new_entry["points"] = points_delta

    resp_state = {
        "guesses": guesses,
        "target_word": target_word if is_over else None,
        "is_over": is_over,
        "leaderboard": sorted([
            {
                "emoji": e,
                "score": leaderboard[e]["score"],
                "last_active": leaderboard[e].get("last_active", 0)
            } for e in leaderboard
        ], key=lambda x: x["score"], reverse=True),
        "active_emojis": list(leaderboard.keys()),
        "winner_emoji": winner_emoji,
        "max_rows": MAX_ROWS,
        "definition": definition if is_over else None,
        "last_word": last_word,
        "last_definition": last_definition
    }

    return jsonify({
        "status": "ok",
        "pointsDelta": points_delta,
        "state": resp_state,
        "won": won,
        "over": over
    })

@app.route("/reset", methods=["POST"])
def reset_game():
    # Save the just-finished game into history
    past_games.append(list(guesses))
    pick_new_word()
    save_data()
    return jsonify({"status": "ok"})

@app.route("/")
def index():
    return send_from_directory(".", "index.html")

# Serve JavaScript modules from the src directory
@app.route('/src/<path:filename>')
def src_files(filename):
    return send_from_directory('src', filename)

if __name__ == "__main__":
    load_data()
    if not target_word:
        pick_new_word()
        save_data()
    app.run(host='0.0.0.0', port=5001)
