"""Messaging crawlers can read public previews without a game session."""
from html.parser import HTMLParser
from pathlib import Path
import struct

import pytest

from backend import server


class Metadata(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.tags = {}
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta':
            self.tags[attrs.get('property', attrs.get('name'))] = attrs.get('content')


@pytest.mark.parametrize(('path', 'image'), [
    ('/', 'share'), ('/invite.html', 'invite'), ('/join', 'invite'),
    ('/age-check?next=/lobby/ABC123', 'invite'),
])
def test_crawler_gets_metadata_and_png_without_eligibility(path, image, tmp_path, monkeypatch):
    monkeypatch.setattr(server, 'STATIC_DIR', tmp_path)
    client = server.app.test_client()
    response = client.get(path, headers={'User-Agent': 'facebookexternalhit/1.1'})
    assert response.status_code == 200
    assert 'Set-Cookie' not in response.headers
    tags = Metadata(response.text).tags
    assert tags['og:type'] == 'website'
    assert tags['og:site_name'] == 'WordSquad'
    assert tags['og:title'] and tags['og:description'] and tags['og:image:alt']
    assert tags['og:image'] == f'https://wordsquad.io/assets/wordsquad-{image}-v1.png'
    assert tags['twitter:card'] == 'summary_large_image'
    assert tags['twitter:image'] == tags['og:image']
    png = client.get(tags['og:image'].removeprefix('https://wordsquad.io'))
    assert png.status_code == 200
    assert png.mimetype == 'image/png'
    assert png.data[:8] == b'\x89PNG\r\n\x1a\n'
    assert struct.unpack('>II', png.data[16:24]) == (1200, 630)
    assert len(png.data) < 1_000_000
    # Preview requests do not register a player or grant game access.
    assert client.get('/lobby/ABC123/state').status_code == 403


def test_built_invitation_is_a_static_preview():
    """The S3-served document retains metadata and its redirect module."""
    built = Path(server.BASE_DIR) / 'frontend/dist/invite.html'
    if not built.exists():
        pytest.skip('Build the frontend to check the production HTML')
    html = built.read_text()
    assert Metadata(html).tags['og:image'].endswith('/wordsquad-invite-v1.png')
    assert 'src="/assets/invite-' in html
    assert (built.parent / 'assets/wordsquad-invite-v1.png').is_file()
