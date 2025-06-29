import pytest, threading, time
from wsgiref.simple_server import make_server
from importlib import reload

pytest.importorskip("flask")
playwright = pytest.importorskip("playwright.sync_api")
import backend.server as server
from playwright.sync_api import sync_playwright


@pytest.fixture(scope="module")
def live_server():
    reload(server)
    server.load_data(server.current_state)
    if not server.current_state.target_word:
        server.pick_new_word(server.current_state)
    srv = make_server("localhost", 5010, server.app)
    thread = threading.Thread(target=srv.serve_forever)
    thread.daemon = True
    thread.start()
    time.sleep(0.5)
    yield "http://localhost:5010"
    srv.shutdown()
    thread.join()


def test_create_lobby_and_auto_expire(live_server):
    url = live_server
    with sync_playwright() as pw:
        request = pw.request.new_context(base_url=url)
        resp = request.post("/lobby")
        data = resp.json()
        code = data["id"]
        assert code in server.LOBBIES
        # simulate activity so lobby becomes finished
        state = server.LOBBIES[code]
        state.phase = "finished"
        state.last_activity -= server.LOBBY_TTL + 1
        server.purge_lobbies()
        assert code not in server.LOBBIES
