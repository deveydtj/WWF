import os
import urllib.request

API_URL = os.environ.get("API_URL")


def lambda_handler(event, context):
    if not API_URL:
        return {"status": "error", "msg": "Missing API_URL"}

    url = f"{API_URL}/internal/purge"
    secret_arn = os.environ.get("OPERATOR_SECRET_ARN")
    if not secret_arn:
        return {"status": "error", "msg": "Missing operator secret"}
    import boto3
    token = boto3.client("secretsmanager").get_secret_value(SecretId=secret_arn)["SecretString"]
    req = urllib.request.Request(url, method="POST", headers={"Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(req) as resp:
            return {"status": resp.status}
    except Exception as e:
        return {"status": "error", "msg": str(e)}
