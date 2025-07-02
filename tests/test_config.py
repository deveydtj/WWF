import shutil
import subprocess
import time
import pytest
from tests.test_server import load_server


def test_invalid_word_list_path(monkeypatch):
    monkeypatch.setenv("WORD_LIST_PATH", "/tmp/missing.txt")
    with pytest.raises(SystemExit):
        load_server()


@pytest.mark.skipif(shutil.which("docker") is None, reason="docker not available")
def test_container_bad_word_list(tmp_path):
    tag = "wwf-test"
    subprocess.run(["docker", "build", "-t", tag, "-f", "docker/Dockerfile", "."], check=True)
    start = time.time()
    proc = subprocess.run(
        ["docker", "run", "--rm", "-e", "WORD_LIST_PATH=/tmp/empty.txt", tag],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=30,
    )
    duration = time.time() - start
    assert proc.returncode != 0
    assert "Startup abort" in proc.stdout
    assert duration < 10
