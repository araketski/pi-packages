#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
export OUT_ROOT=${OUT_ROOT:-$SCRIPT_DIR/runs/$STAMP}
export PROMPT=${PROMPT:-Reply exactly: pong}

mkdir -p "$OUT_ROOT"

# 1. Pi through the fast-mode extension with fast mode disabled.
LABEL=pi-off FAST=0 "$SCRIPT_DIR/run-pi.sh" || true

# 2. Pi through the fast-mode extension with --fast enabled.
LABEL=pi-fast FAST=1 "$SCRIPT_DIR/run-pi.sh" || true

# 3. Codex CLI direct run, for comparison with its native request shape.
LABEL=codex "$SCRIPT_DIR/run-codex.sh" || true

node "$SCRIPT_DIR/compare.mjs" \
  "$OUT_ROOT/pi-off" \
  "$OUT_ROOT/pi-fast" \
  "$OUT_ROOT/codex" \
  >"$OUT_ROOT/comparison.md"

printf 'Wrote run directory: %s\n' "$OUT_ROOT"
printf 'Comparison: %s\n' "$OUT_ROOT/comparison.md"
