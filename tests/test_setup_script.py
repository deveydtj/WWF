import subprocess


def test_setup_script_runs():
    proc = subprocess.run(["./setup.sh"], capture_output=True, text=True)
    assert proc.returncode == 0
    assert "Environment looks good." in proc.stdout
