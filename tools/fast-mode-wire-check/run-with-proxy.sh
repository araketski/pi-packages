#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <out-dir> <command> [args...]" >&2
  exit 2
fi

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
OUT_DIR=$1
shift
PORT=${MITM_PORT:-18080}
HOST=${MITM_HOST:-127.0.0.1}
CA_CERT=${MITM_CA_CERT:-$HOME/.mitmproxy/mitmproxy-ca-cert.pem}
PROXY_URL="http://${HOST}:${PORT}"

if [[ -n ${MITMDUMP_BIN:-} ]]; then
  MITMDUMP_CMD=("$MITMDUMP_BIN")
elif command -v mitmdump >/dev/null; then
  MITMDUMP_CMD=(mitmdump)
elif command -v uv >/dev/null; then
  MITMDUMP_CMD=(uvx --from mitmproxy mitmdump)
else
  echo "mitmdump not found. Install mitmproxy first, e.g. 'uv tool install mitmproxy' or 'python -m pip install mitmproxy'." >&2
  exit 127
fi

mkdir -p "$OUT_DIR"
: >"$OUT_DIR/flows.jsonl"

MITM_LOG_JSONL="$OUT_DIR/flows.jsonl" "${MITMDUMP_CMD[@]}" \
  --listen-host "$HOST" \
  --listen-port "$PORT" \
  --set block_global=false \
  -s "$SCRIPT_DIR/mitm-log.py" \
  >"$OUT_DIR/mitmdump.stdout.log" \
  2>"$OUT_DIR/mitmdump.stderr.log" &
MITM_PID=$!

cleanup() {
  if kill -0 "$MITM_PID" 2>/dev/null; then
    kill "$MITM_PID" 2>/dev/null || true
    wait "$MITM_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

python - "$HOST" "$PORT" <<'PY'
import socket, sys, time
host, port = sys.argv[1], int(sys.argv[2])
deadline = time.time() + 10
while time.time() < deadline:
    try:
        with socket.create_connection((host, port), timeout=0.2):
            raise SystemExit(0)
    except OSError:
        time.sleep(0.1)
print(f"proxy did not open on {host}:{port}", file=sys.stderr)
raise SystemExit(1)
PY

if [[ ! -f "$CA_CERT" ]]; then
  echo "warning: mitmproxy CA cert not found at $CA_CERT" >&2
  echo "         run mitmproxy/mitmdump once, or set MITM_CA_CERT." >&2
fi

set +e
env \
  HTTP_PROXY="$PROXY_URL" \
  HTTPS_PROXY="$PROXY_URL" \
  ALL_PROXY="$PROXY_URL" \
  http_proxy="$PROXY_URL" \
  https_proxy="$PROXY_URL" \
  all_proxy="$PROXY_URL" \
  NO_PROXY="127.0.0.1,localhost" \
  no_proxy="127.0.0.1,localhost" \
  NODE_EXTRA_CA_CERTS="$CA_CERT" \
  SSL_CERT_FILE="$CA_CERT" \
  REQUESTS_CA_BUNDLE="$CA_CERT" \
  CURL_CA_BUNDLE="$CA_CERT" \
  "$@" >"$OUT_DIR/stdout.txt" 2>"$OUT_DIR/stderr.txt"
STATUS=$?
set -e

# Let mitmproxy flush streamed responses.
sleep 1
printf '%s\n' "$STATUS" >"$OUT_DIR/status.txt"
exit "$STATUS"
