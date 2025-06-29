import os
import urllib.request

API_URL = os.environ.get("API_URL")


def lambda_handler(event, context):
    if not API_URL:
        return {"status": "error", "msg": "Missing API_URL"}

    url = f"{API_URL}/internal/purge"
    req = urllib.request.Request(url, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return {"status": resp.status}
    except Exception as e:
        return {"status": "error", "msg": str(e)}
