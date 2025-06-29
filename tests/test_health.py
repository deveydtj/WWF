from tests.test_server import load_server


def test_index_route_serves_file():
    server, _ = load_server()
    result = server.index()
    assert 'index.html' in result
