"""Ensure telemetry cannot keep identifying data supplied by event callers."""
import json

from backend import analytics


def test_analytics_discards_all_caller_fields(tmp_path, monkeypatch):
    log = tmp_path / 'analytics.log'
    monkeypatch.setattr(analytics, 'ANALYTICS_FILE', log)
    analytics.log_game_event('guess', 'ABC123', '😀', ip='192.0.2.1',
                             player_id='private-id', text='private message')
    analytics.log_daily_double_used('😀', '192.0.2.1')
    analytics.log_lobby_created('ABC123', '192.0.2.1')
    analytics.log_lobby_joined('ABC123', '😀', '192.0.2.1')
    analytics.log_lobby_finished('ABC123', '192.0.2.1')
    analytics.log_player_kicked('ABC123', '😀')
    entries = [json.loads(line) for line in log.read_text().splitlines()]
    assert len(entries) == 6
    assert all(set(entry) == {'event', 'timestamp'} for entry in entries)


def test_analytics_disabled_without_file(tmp_path, monkeypatch):
    monkeypatch.setattr(analytics, 'ANALYTICS_FILE', None)
    analytics.log_lobby_created('ABC123', '192.0.2.1')
    assert not list(tmp_path.iterdir())
