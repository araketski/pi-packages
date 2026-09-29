#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/../.." && pwd)
OUT_ROOT=${OUT_ROOT:-$SCRIPT_DIR/runs}
LABEL=${LABEL:-pi-fast}
OUT_DIR=${OUT_DIR:-$OUT_ROOT/$LABEL}
PI_PROVIDER_NAME=${PI_PROVIDER_NAME:-openai-codex}
PI_MODEL_NAME=${PI_MODEL_NAME:-gpt-5.5}
PROMPT=${PROMPT:-Reply exactly: pong}
FAST=${FAST:-1}
PI_BIN=${PI_BIN:-pi}
SOURCE_AGENT_DIR=${PI_SOURCE_AGENT_DIR:-$HOME/.pi/agent}
TEST_AGENT_DIR=${PI_TEST_AGENT_DIR:-$OUT_DIR/agent}

mkdir -p "$TEST_AGENT_DIR"
chmod 700 "$TEST_AGENT_DIR" || true

if [[ -f "$SOURCE_AGENT_DIR/auth.json" && ! -f "$TEST_AGENT_DIR/auth.json" ]]; then
  cp "$SOURCE_AGENT_DIR/auth.json" "$TEST_AGENT_DIR/auth.json"
  chmod 600 "$TEST_AGENT_DIR/auth.json" || true
fi

cat >"$TEST_AGENT_DIR/settings.json" <<'JSON'
{
  "transport": "sse",
  "retry": {
    "enabled": false,
    "provider": {
      "maxRetries": 0
    }
  }
}
JSON

if [[ ${SKIP_BUILD:-0} != 1 ]]; then
  pnpm -C "$REPO_ROOT" nx run @araketski/pi-statusline-protocol:build >/dev/null
fi

cmd=(
  "$PI_BIN"
  -e "$REPO_ROOT/packages/fast-mode"
)
if [[ "$FAST" == 1 || "$FAST" == true ]]; then
  cmd+=(--fast)
fi
cmd+=(
  --provider "$PI_PROVIDER_NAME"
  --model "$PI_MODEL_NAME"
  --no-session
  --no-tools
  --no-context-files
  --print
  -- "$PROMPT"
)

printf 'Running Pi: %q ' "${cmd[@]}" >"$OUT_DIR.command.txt"
printf '\n' >>"$OUT_DIR.command.txt"

PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" \
PI_SKIP_VERSION_CHECK=1 \
"$SCRIPT_DIR/run-with-proxy.sh" "$OUT_DIR" "${cmd[@]}"
