#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
OUT_ROOT=${OUT_ROOT:-$SCRIPT_DIR/runs}
LABEL=${LABEL:-codex}
OUT_DIR=${OUT_DIR:-$OUT_ROOT/$LABEL}
CODEX_BIN=${CODEX_BIN:-codex}
CODEX_MODEL_NAME=${CODEX_MODEL_NAME:-gpt-5.5}
PROMPT=${PROMPT:-Reply exactly: pong}
WORK_DIR=${WORK_DIR:-$OUT_DIR/work}

mkdir -p "$WORK_DIR"

cmd=(
  "$CODEX_BIN"
  exec
  --ephemeral
  --skip-git-repo-check
  --ignore-rules
  --sandbox read-only
  --model "$CODEX_MODEL_NAME"
  --cd "$WORK_DIR"
  -- "$PROMPT"
)

printf 'Running Codex: %q ' "${cmd[@]}" >"$OUT_DIR.command.txt"
printf '\n' >>"$OUT_DIR.command.txt"

"$SCRIPT_DIR/run-with-proxy.sh" "$OUT_DIR" "${cmd[@]}"
