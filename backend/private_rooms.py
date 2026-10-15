"""Private admission and shared, atomic room state. No credentials in public lobbies."""
import copy
import hashlib
import json
import os
import secrets
import tempfile
import time
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import fields
from functools import wraps
from pathlib import Path

from flask import Response, g, jsonify, request, session

COOKIE = "__Host-wordsquad_room_session" if os.environ.get("FLASK_ENV") == "production" else "wordsquad_room_session"
SET_FIELDS = {"found_greens", "found_yellows", "daily_double_winners"}


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def safe(method):
    @wraps(method)
    def wrapped(*args, **kwargs):
        try:
            return method(*args, **kwargs)
        except (OSError, ValueError, KeyError, TypeError, RuntimeError):
            return jsonify(status="error", msg="Private rooms temporarily unavailable"), 503
    return wrapped


class PrivateRooms:
    def __init__(self, server):
        self.s = server
        self.context = ContextVar("private_room", default=None)
        self.file = Path(os.environ.get("PRIVATE_ROOMS_FILE", server.BASE_DIR / "runtime/private-rooms.json"))
        self.session_ttl = int(os.environ.get("ROOM_SESSION_TTL", 12 * 3600))
        self.invite_ttl = int(os.environ.get("ROOM_INVITE_TTL", 3600))
        self.pending_ttl = int(os.environ.get("ROOM_PENDING_TTL", 600))
        self.max_pending = int(os.environ.get("ROOM_MAX_PENDING", 20))
        self.max_members = int(os.environ.get("ROOM_MAX_MEMBERS", 20))
        self.max_rooms = int(os.environ.get("ROOM_MAX_COUNT", 100))
        self.max_chat = int(os.environ.get('ROOM_MAX_CHAT_MESSAGES', 100))
        self.max_history = int(os.environ.get('ROOM_MAX_PAST_GAMES', 20))
        self.max_streams = int(os.environ.get("ROOM_MAX_STREAMS", 32))
        self.streams_per_member = int(os.environ.get("ROOM_STREAMS_PER_MEMBER", 3))
        app = server.app
        app.config['MAX_CONTENT_LENGTH'] = 16 * 1024
        for path, name, method, verbs in [
            ('/private/exchange', 'exchange', self.exchange, ['POST']),
            ('/private/request', 'pending', self.pending, ['GET']),
            ('/private/context', 'room_context', self.room_context, ['GET']),
            ('/lobby/<code>/admission', 'admission', self.admission, ['GET', 'POST']),
        ]:
            app.add_url_rule(path, 'private_' + name, safe(method), methods=verbs)
        app.add_url_rule('/join', 'private_join', self.join_page)
        server.PUBLIC_ENDPOINTS.add('private_join')
        app.after_request(self.headers)
        app.before_request(self.protect_mutations)

    def protect_mutations(self):
        if request.method != 'POST':
            return None
        body = request.get_json(silent=True)
        private_create = request.path == '/lobby' and isinstance(body, dict) and body.get('private')
        if request.path.startswith('/private/') or private_create:
            if request.headers.get('X-WordSquad-Request') != '1' or not self.origin_ok():
                return jsonify(status='error', msg='Invalid request origin'), 403

    def join_page(self):
        root = self.s.STATIC_DIR if (self.s.STATIC_DIR / 'join.html').exists() else self.s.DEV_FRONTEND_DIR
        return self.s.send_from_directory(str(root), 'join.html')

    def headers(self, response):
        if request.path.startswith(('/private/', '/lobby/')) or request.path in ('/join', '/game'):
            response.headers['Cache-Control'] = 'no-store'
        if request.path == '/join':
            response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'"
        token = getattr(g, 'new_room_session', None)
        if token:
            response.set_cookie(COOKIE, token, httponly=True, samesite='Strict',
                                secure=self.s.app.config['SESSION_COOKIE_SECURE'], path='/')
        return response

    def identity(self, create=False):
        token = request.cookies.get(COOKIE, '')
        if len(token) != 43:
            if not create:
                return None
            token = secrets.token_urlsafe(32)
            g.new_room_session = token
        return digest(token)

    @contextmanager
    def store(self):
        # ponytail: one transaction lock for at most ROOM_MAX_COUNT rooms. Move
        # to per-room Redis records if contention warrants a larger deployment.
        if os.environ.get('FLASK_ENV') == 'production':
            if not os.environ.get('PUBLIC_ORIGIN', '').startswith('https://') or not (self.s.REDIS_URL or '').startswith('rediss://'):
                raise RuntimeError('HTTPS origin and TLS Redis required')
        redis = self.s.redis_client
        if redis is not None:
            lock = redis.lock('wwf:private:lock', timeout=60, blocking_timeout=5)
            try:
                if not lock.acquire():
                    raise RuntimeError('busy')
                raw = redis.get('wwf:private:v1')
                data = json.loads(raw) if raw else {'version': 1, 'rooms': {}, 'rates': {}}
                self.validate_store(data)
                self.prune(data)
                yield data
                # Watching the lease prevents a delayed worker from committing
                # after its lock expired or another worker acquired it.
                with redis.pipeline() as pipe:
                    pipe.watch(lock.name)
                    if not lock.owned():
                        raise RuntimeError('expired lease')
                    pipe.multi()
                    pipe.set('wwf:private:v1', json.dumps(data))
                    pipe.execute()
            except Exception as exc:
                raise RuntimeError('private storage unavailable') from exc
            finally:
                try:
                    if lock.owned():
                        lock.release()
                except Exception:
                    pass
            return
        if os.environ.get('FLASK_ENV') == 'production' or self.s.REDIS_URL:
            raise RuntimeError('shared storage required')
        # Local development: cross-process file lock and atomic, owner-only file.
        import fcntl
        self.file.parent.mkdir(parents=True, exist_ok=True)
        with open(str(self.file) + '.lock', 'a') as lock_file:
            os.chmod(lock_file.name, 0o600)
            fcntl.flock(lock_file, fcntl.LOCK_EX)
            data = json.loads(self.file.read_text()) if self.file.exists() else {'version': 1, 'rooms': {}, 'rates': {}}
            self.validate_store(data)
            self.prune(data)
            yield data
            fd, name = tempfile.mkstemp(dir=self.file.parent)
            try:
                with os.fdopen(fd, 'w') as output:
                    json.dump(data, output)
                    output.flush()
                    os.fsync(output.fileno())
                os.replace(name, self.file)
            finally:
                if os.path.exists(name):
                    os.unlink(name)

    def validate_store(self, data):
        if data['version'] != 1 or not isinstance(data['rooms'], dict) or not isinstance(data['rates'], dict):
            raise ValueError('incompatible private storage')

    def prune(self, data):
        now = time.time()
        for code, room in list(data['rooms'].items()):
            if room['expires'] <= now or now - room['game']['last_activity'] > self.s.LOBBY_TTL:
                del data['rooms'][code]
                continue
            for sid, member in list(room['members'].items()):
                if member['expires'] <= now:
                    self.remove_member(room, sid)
            room['pending'] = {key: item for key, item in room['pending'].items() if item['expires'] > now}
            room['streams'] = {key: item for key, item in room['streams'].items() if item['expires'] > now}
        data['rates'] = {key: value for key, value in data['rates'].items() if value['until'] > now}

    def limited(self, data, action, sid, limit=30):
        now = time.time()
        # The peer IP cannot be spoofed with X-Forwarded-For. A generous network
        # allowance keeps shared LANs usable; the session limit is stricter.
        keys = [(action + ':session:' + (sid or ''), limit),
                (action + ':network:' + digest(self.s.get_client_ip()), limit * 30)]
        for key, cap in keys:
            if key not in data['rates'] and len(data['rates']) >= 4096:
                return True
            record = data['rates'].setdefault(key, {'count': 0, 'until': now + 60})
            record['count'] += 1
            if record['count'] > cap:
                return True
        return False

    def unavailable(self):
        return jsonify(status='error', msg='Room unavailable'), 404

    def member(self, room, sid):
        if not room or room['expires'] <= time.time():
            return None
        member = room['members'].get(sid)
        return member if member and member['expires'] > time.time() else None

    def pack(self, state):
        return {field.name: (list(getattr(state, field.name)) if field.name in SET_FIELDS else getattr(state, field.name))
                for field in fields(state) if field.name not in ('listeners', 'host_token')}

    def unpack(self, room):
        values = copy.deepcopy(room['game'])
        for key in SET_FIELDS:
            values[key] = set(values[key])
        if values.get('private') is not True:
            raise ValueError('invalid private state')
        return self.s.GameState(**values)

    @safe
    def create(self):
        sid = self.identity(create=True)
        with self.store() as data:
            if self.limited(data, 'create', sid, 5) or len(data['rooms']) >= self.max_rooms:
                return jsonify(status='error', msg='Please try again later'), 429
            code = 'p' + secrets.token_hex(3)[:5]
            while code in data['rooms']:
                code = 'p' + secrets.token_hex(3)[:5]
            state = self.s.GameState(private=True)
            self.s.pick_new_word(state)
            now = time.time()
            data['rooms'][code] = {
                'host': sid, 'expires': now + self.session_ttl, 'locked': False,
                'invite': None, 'invite_expires': 0, 'pending': {}, 'streams': {},
                'members': {sid: {'player_id': secrets.token_hex(16), 'expires': now + self.session_ttl}},
                'game': self.pack(state),
            }
            return jsonify(id=code, private=True)

    def exchange(self):
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return self.unavailable()
        invite, name = body.get('invitation'), body.get('name')
        if not isinstance(invite, str) or len(invite) > 100 or not isinstance(name, str) or not 1 <= len(name.strip()) <= 40:
            return self.unavailable()
        sid = self.identity(create=True)
        with self.store() as data:
            if self.limited(data, 'exchange', sid):
                return jsonify(status='error', msg='Please try again later'), 429
            code = invite.split('.', 1)[0]
            room = data['rooms'].get(code)
            if not room or room['locked'] or room['invite_expires'] <= time.time() or not secrets.compare_digest(room['invite'] or '', digest(invite)):
                return self.unavailable()
            if self.member(room, sid):
                return jsonify(status='approved', room=code)
            previous = next((key for key, item in room['pending'].items() if item['sid'] == sid), None)
            if previous:
                return jsonify(status='pending', room=code)
            if len(room['pending']) >= self.max_pending:
                return jsonify(status='error', msg='Please try again later'), 429
            room['pending'][secrets.token_urlsafe(16)] = {
                'sid': sid, 'name': name.strip(), 'expires': min(time.time() + self.pending_ttl, room['invite_expires'])}
            return jsonify(status='pending', room=code)

    def pending(self):
        sid = self.identity()
        with self.store() as data:
            if self.limited(data, 'poll', sid, 120):
                return jsonify(status='error', msg='Please try again later'), 429
            code = request.args.get('room', '')
            room = data['rooms'].get(code)
            if self.member(room, sid):
                return jsonify(status='approved', room=code)
            if room and any(item['sid'] == sid for item in room['pending'].values()):
                return jsonify(status='pending')
            return self.unavailable()

    def room_context(self):
        return self.run(request.args.get('room', ''), self.context_response)

    def context_response(self):
        room, sid, member = self.context.get()
        return jsonify(private=True, host=sid == room['host'], player_id=member['player_id'],
                       emoji=room['game']['player_map'].get(member['player_id']))

    def player_data(self, body):
        room, sid, member = self.context.get()
        result = dict(body)
        result['player_id'] = member['player_id']
        if request.endpoint != 'lobby_emoji':
            result['emoji'] = self.s._state().player_map.get(member['player_id'])
        return result

    @safe
    def run(self, code, func):
        sid = self.identity()
        with self.store() as data:
            if self.limited(data, 'access', sid, 240):
                return jsonify(status='error', msg='Please try again later'), 429
            room = data['rooms'].get(code)
            member = self.member(room, sid)
            if not member:
                return self.unavailable()
            if func == self.s.guess_word and self.limited(data, 'guess', sid, self.s.GUESS_RATE_LIMIT):
                return jsonify(status='error', msg='Please try again later'), 429
            host_only = func in (self.s.reset_game, self.s.kick_player, self.controls)
            if host_only and room['host'] != sid:
                return self.unavailable()
            if request.method == 'POST':
                # A non-simple header plus an exact Origin is mandatory for
                # browser session mutations (including direct HTTP clients).
                if request.headers.get('X-WordSquad-Request') != '1' or not self.origin_ok():
                    return jsonify(status='error', msg='Invalid request origin'), 403
                body = request.get_json(silent=True)
                if not isinstance(body, dict):
                    return jsonify(status='error', msg='Invalid request'), 400
                if func not in (self.s.kick_player, self.controls):
                    emoji = room['game']['player_map'].get(member['player_id'])
                    if (body.get('player_id') not in (None, member['player_id']) or
                        (func != self.s.set_emoji and body.get('emoji') not in (None, emoji))):
                        return jsonify(status='error', msg='Invalid player credentials'), 403
                if func == self.s.chat and not isinstance(body.get('text'), str):
                    return jsonify(status='error', msg='Invalid message'), 400
                if func == self.s.guess_word and not isinstance(body.get('guess'), str):
                    return jsonify(status='error', msg='Invalid guess'), 400
                if func == self.s.set_emoji and (not isinstance(body.get('emoji'), str) or not 1 <= len(body['emoji']) <= 32):
                    return jsonify(status='error', msg='Invalid emoji'), 400
            if func == self.s.stream:
                return self.open_stream(data, room, code, sid)
            if func in (self.s.kick_player, self.s.leave_lobby):
                if func == self.s.leave_lobby:
                    target = sid
                else:
                    pid = room['game']['leaderboard'].get(request.json.get('emoji'), {}).get('player_id')
                    target = next((key for key, item in room['members'].items() if item['player_id'] == pid), None)
                    if not target or target == room['host']:
                        return self.unavailable()
                if target == room['host']:
                    del data['rooms'][code]
                else:
                    self.remove_member(room, target)
                return jsonify(status='ok', lobby_removed=target == room['host'])
            state = self.unpack(room)
            context_token = self.context.set((room, sid, member))
            state_token = self.s._lobby_context.set(state)
            try:
                response = func()
                state.chat_messages[:] = state.chat_messages[-self.max_chat:]
                state.past_games[:] = state.past_games[-self.max_history:]
                room['game'] = self.pack(state)
                return response
            finally:
                self.s._lobby_context.reset(state_token)
                self.context.reset(context_token)

    def remove_member(self, room, sid):
        member = room['members'].pop(sid, None)
        if not member:
            return
        game = room['game']
        emoji = game['player_map'].pop(member['player_id'], None)
        game['leaderboard'].pop(emoji, None)
        game['chat_rate_limits'].pop(member['player_id'], None)
        game['daily_double_pending'].pop(emoji, None)
        game['ip_to_emoji'] = {key: value for key, value in game['ip_to_emoji'].items() if value != emoji}
        room['streams'] = {key: value for key, value in room['streams'].items() if value['sid'] != sid}
        room['pending'] = {key: value for key, value in room['pending'].items() if value['sid'] != sid}

    def origin_ok(self):
        allowed = os.environ.get('PUBLIC_ORIGIN', request.host_url.rstrip('/'))
        return request.headers.get('Origin') == allowed and request.headers.get('Sec-Fetch-Site') != 'cross-site'

    def admission(self, code):
        return self.run(code, self.controls)

    def controls(self):
        room, sid, member = self.context.get()
        if request.method == 'GET':
            return jsonify(locked=room['locked'], pending=[{'id': key, 'name': value['name']}
                           for key, value in room['pending'].items()])
        body = request.json
        action = body.get('action')
        if action == 'rotate':
            if room['locked']:
                return jsonify(status='error', msg='Unlock admission first'), 409
            # Return raw invitation only once, in the explicit host action.
            code = request.view_args['code']
            invitation = code + '.' + secrets.token_urlsafe(32)
            room['invite'] = digest(invitation)
            room['invite_expires'] = time.time() + self.invite_ttl
            room['pending'].clear()
            return jsonify(invitation=invitation)
        if action == 'lock' and type(body.get('locked')) is bool:
            room['locked'] = body['locked']
            return jsonify(status='ok')
        if action in ('approve', 'reject'):
            pending = room['pending'].get(body.get('id'))
            if not pending:
                return self.unavailable()
            if action == 'approve':
                if room['locked'] or room['invite_expires'] <= time.time():
                    return jsonify(status='error', msg='Admission unavailable'), 409
                if len(room['members']) >= self.max_members:
                    return jsonify(status='error', msg='Room is full'), 409
                room['members'][pending['sid']] = {'player_id': secrets.token_hex(16),
                                                   'expires': min(time.time() + self.session_ttl, room['expires'])}
            del room['pending'][body['id']]
            return jsonify(status='ok')
        return jsonify(status='error', msg='Invalid action'), 400

    def open_stream(self, data, room, code, sid):
        if (len(room['streams']) >= self.max_streams or
            sum(value['sid'] == sid for value in room['streams'].values()) >= self.streams_per_member):
            return jsonify(status='error', msg='Too many connections'), 429
        stream_id = secrets.token_hex(16)
        room['streams'][stream_id] = {'sid': sid, 'expires': time.time() + 10}
        age_expires = session.get('age_checked_at', 0) + self.s.AGE_SESSION_TTL

        def generate():
            previous = None
            try:
                while time.time() < age_expires:
                    with self.store() as shared:
                        active = shared['rooms'].get(code)
                        if not self.member(active, sid) or stream_id not in active['streams']:
                            return
                        active['streams'][stream_id]['expires'] = time.time() + 10
                        payload = json.dumps(self.s.build_state_payload(s=self.unpack(active)))
                    if payload != previous:
                        yield 'data: ' + payload + '\n\n'
                        previous = payload
                    else:
                        yield ': keepalive\n\n'
                    time.sleep(1)
            except (OSError, ValueError, KeyError, TypeError, RuntimeError):
                return  # Storage failure terminates the stream, never serves cached data.
            finally:
                try:
                    with self.store() as shared:
                        active = shared['rooms'].get(code)
                        if active:
                            active['streams'].pop(stream_id, None)
                except (OSError, ValueError, KeyError, TypeError, RuntimeError):
                    pass
        return Response(generate(), mimetype='text/event-stream', headers={'Cache-Control': 'no-store'})
