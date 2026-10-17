#!/bin/bash
# Idempotent same-server Redis setup, invoked by the Terraform SSM association.
set -euo pipefail
set +x
umask 077

cloud-init status --wait
source /etc/wwf/wwf.conf
command -v openssl > /dev/null || dnf -y install openssl

docker network inspect wwf-private > /dev/null 2>&1 || docker network create wwf-private
docker pull "$WWF_REDIS_IMAGE"
id wwf-redis > /dev/null 2>&1 || useradd --system --no-create-home --shell /sbin/nologin wwf-redis
redis_uid=$(id -u wwf-redis)
redis_gid=$(id -g wwf-redis)
install -d -m 755 /etc/wwf/redis
install -d -m 700 -o "$redis_uid" -g "$redis_gid" /opt/wwf/redis

# This private certificate is trusted only by the app, never by public browsers.
if [ ! -f /etc/wwf/redis/server.crt ]; then
  openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
    -subj '/CN=wwf-redis' -addext 'subjectAltName=DNS:wwf-redis' \
    -keyout /etc/wwf/redis/server.key -out /etc/wwf/redis/server.crt > /dev/null 2>&1
fi
chown "$redis_uid:$redis_gid" /etc/wwf/redis/server.key
chmod 600 /etc/wwf/redis/server.key
chmod 644 /etc/wwf/redis/server.crt

export WWF_REDIS_URL
WWF_REDIS_URL=$(wwf-secret "$WWF_REDIS_SECRET_ARN")
python3 - <<'PY'
import json, os, pathlib, re, urllib.parse
url = urllib.parse.urlparse(os.environ['WWF_REDIS_URL'])
options = urllib.parse.parse_qs(url.query)
password = urllib.parse.unquote(url.password or '')
if (url.scheme != 'rediss' or url.hostname != 'wwf-redis' or url.port != 6379
        or not re.fullmatch(r'[a-f0-9]{64}', password)
        or options.get('ssl_ca_certs') != ['/etc/wwf/redis-ca.crt']
        or options.get('ssl_check_hostname') != ['true']):
    raise SystemExit('Invalid local Redis URL: authenticated TLS, pinned CA and hostname verification required')
pathlib.Path('/etc/wwf/redis/redis.conf').write_text('\n'.join([
    'bind 0.0.0.0', 'port 0', 'tls-port 6379',
    'tls-cert-file /tls/server.crt', 'tls-key-file /tls/server.key',
    'tls-ca-cert-file /tls/server.crt', 'tls-auth-clients no',
    'protected-mode yes', 'requirepass ' + password,
    'maxmemory 64mb', 'maxmemory-policy noeviction',
    'appendonly yes', 'appendfsync always', 'no-appendfsync-on-rewrite no',
    'auto-aof-rewrite-percentage 100', 'auto-aof-rewrite-min-size 16mb',
    'aof-load-truncated no', 'save ""', 'dir /data', 'logfile ""',
]) + '\n')
PY
chown "$redis_uid:$redis_gid" /etc/wwf/redis/redis.conf
chmod 600 /etc/wwf/redis/redis.conf

cat > /usr/local/bin/wwf-redis-ready <<'EOF'
#!/bin/bash
set -euo pipefail
for attempt in {1..30}; do
  if docker exec wwf-redis sh -c 'export REDISCLI_AUTH="$(sed -n "s/^requirepass //p" /etc/redis/redis.conf)"; exec redis-cli --tls --cacert /tls/server.crt -h wwf-redis ping' 2>/dev/null | grep -qx PONG; then
    exit 0
  fi
  sleep 1
done
echo 'Redis did not become ready' >&2
exit 1
EOF
chmod 755 /usr/local/bin/wwf-redis-ready

cat > /etc/systemd/system/wwf-redis.service <<EOF
[Unit]
Description=WordSquad private-room Redis
Requires=docker.service
After=docker.service
Before=wwf-app.service
[Service]
ExecStartPre=-/usr/bin/docker rm wwf-redis
ExecStart=/usr/bin/docker run --rm --name wwf-redis --network wwf-private \\
  --user $redis_uid:$redis_gid --memory=192m --memory-swap=192m --pids-limit=64 \\
  -v /etc/wwf/redis/redis.conf:/etc/redis/redis.conf:ro \\
  -v /etc/wwf/redis/server.crt:/tls/server.crt:ro \\
  -v /etc/wwf/redis/server.key:/tls/server.key:ro \\
  -v /opt/wwf/redis:/data --log-opt max-size=5m --log-opt max-file=2 \\
  $WWF_REDIS_IMAGE redis-server /etc/redis/redis.conf
ExecStartPost=/usr/local/bin/wwf-redis-ready
ExecStop=/usr/bin/docker stop -t 60 wwf-redis
Restart=always
RestartSec=5
TimeoutStartSec=120
TimeoutStopSec=75
[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable wwf-redis.service
systemctl restart wwf-redis.service

# Verify the app image can authenticate and verify TLS before restarting it.
docker run --rm --network wwf-private --env WWF_REDIS_URL \
  -v /etc/wwf/redis/server.crt:/etc/wwf/redis-ca.crt:ro \
  --entrypoint python "$API_IMAGE" -c \
  'import os, redis; assert redis.Redis.from_url(os.environ["WWF_REDIS_URL"]).ping(); print("Redis TLS and authentication verified")'
unset WWF_REDIS_URL

# Keep a root-only copy of the old runtime configuration for rollback.
cp -p /etc/wwf/wwf.conf /etc/wwf/wwf.conf.before-redis
chmod 600 /etc/wwf/wwf.conf.before-redis
python3 - <<'PY'
import os, pathlib
path = pathlib.Path('/etc/wwf/wwf.conf')
values = {'REDIS_SECRET_ARN': os.environ['WWF_REDIS_SECRET_ARN'],
          'OPERATOR_SECRET_ARN': os.environ['WWF_OPERATOR_SECRET_ARN']}
path.write_text('\n'.join(key + '=' + values[key] if key in values else line
                          for line in path.read_text().splitlines()
                          for key in [line.split('=', 1)[0]]) + '\n')
PY

install -d -m 755 /etc/systemd/system/wwf-app.service.d
cat > /etc/systemd/system/wwf-app.service.d/redis.conf <<'EOF'
[Unit]
Wants=wwf-redis.service
After=wwf-redis.service
[Service]
ExecStart=
ExecStart=/usr/bin/docker run --rm --name wwf-api --network wwf-private -p 127.0.0.1:5001:5001 \
  --env-file /run/wwf/app.env -v /opt/wwf/data:/app/runtime \
  -v /etc/wwf/redis/server.crt:/etc/wwf/redis-ca.crt:ro \
  --log-opt max-size=10m --log-opt max-file=3 $API_IMAGE
EOF
systemctl daemon-reload
systemctl restart wwf-app.service

for attempt in {1..60}; do
  if curl --fail --silent --show-error --max-time 5 http://127.0.0.1:5001/health 2>/dev/null \
      | python3 -c 'import json,sys; data=json.load(sys.stdin); sys.exit(0 if data["status"] == "ok" and data["redis_enabled"] and not data["warnings"] else 1)' 2>/dev/null; then
    echo 'WordSquad is healthy with Redis enabled'
    exit 0
  fi
  sleep 1
done
echo 'WordSquad did not become healthy with Redis enabled' >&2
exit 1
