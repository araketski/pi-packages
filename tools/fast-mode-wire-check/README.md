# Fast-mode wire check

This is an isolated, manual test-run harness for comparing real provider traffic:

1. Pi + `@araketski/pi-fast-mode` with fast mode disabled.
2. Pi + `@araketski/pi-fast-mode` with `--fast` enabled.
3. Codex CLI direct run.

It is not a Vitest suite. It starts `mitmdump`, routes one command through it, records redacted HTTP flows, and writes a Markdown comparison.

## Prerequisites

- `pi` on `PATH`.
- `codex` on `PATH`.
- mitmproxy available either as `mitmdump` on `PATH`, or `uv` on `PATH` so the scripts can run `uvx --from mitmproxy mitmdump`.
- Existing OpenAI Codex/Pi auth.
- The mitmproxy CA trusted by the client.

Install mitmproxy with uv if needed:

```sh
uv tool install mitmproxy
mitmdump --version
```

Or avoid installing the executable persistently; `run-with-proxy.sh` falls back to this when `mitmdump` is absent and `uv` exists:

```sh
uvx --from mitmproxy mitmdump --version
```

If you do not use uv, pip also works:

```sh
python -m pip install mitmproxy
mitmdump --version
```

Run mitmproxy once to create the CA certificate:

```sh
# if installed as a uv tool or through pip
mitmdump --listen-port 18080

# or without persistent install
uvx --from mitmproxy mitmdump --listen-port 18080

# Ctrl-C after it starts
ls ~/.mitmproxy/mitmproxy-ca-cert.pem
```

The scripts pass these trust variables to child processes:

- `NODE_EXTRA_CA_CERTS` for Pi/Node.
- `SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE`, and `CURL_CA_BUNDLE` for other clients.

If Codex still rejects the proxy certificate, install the mitmproxy CA into the OS trust store or point `MITM_CA_CERT` at a CA bundle that includes the mitmproxy CA.

## Full run

From repository root:

```sh
tools/fast-mode-wire-check/run-suite.sh
```

The suite creates a timestamped directory under:

```text
tools/fast-mode-wire-check/runs/<timestamp>/
```

`runs/` is ignored by Git because it contains prompts, outputs, and redacted-but-sensitive traffic captures.

Open:

```text
comparison.md
```

## Important knobs

```sh
# Defaults shown
PI_PROVIDER_NAME=openai-codex
PI_MODEL_NAME=gpt-5.5
CODEX_MODEL_NAME=gpt-5.5
PROMPT='Reply exactly: pong'
MITM_PORT=18080
MITM_CA_CERT="$HOME/.mitmproxy/mitmproxy-ca-cert.pem"
```

Example:

```sh
PI_MODEL_NAME=gpt-5.6-sol CODEX_MODEL_NAME=gpt-5.6-sol \
  tools/fast-mode-wire-check/run-suite.sh
```

## Authentication behavior

`run-pi.sh` creates an isolated Pi agent directory inside the run output and copies `auth.json` from `~/.pi/agent` by default. Override the source if needed:

```sh
PI_SOURCE_AGENT_DIR=/path/to/agent tools/fast-mode-wire-check/run-suite.sh
```

Or provide a prebuilt isolated agent dir:

```sh
PI_TEST_AGENT_DIR=/path/to/test-agent tools/fast-mode-wire-check/run-pi.sh
```

The generated Pi settings force:

```json
{
  "transport": "sse",
  "retry": { "enabled": false, "provider": { "maxRetries": 0 } }
}
```

SSE is used so the HTTP request is easy to inspect.

## Individual runs

```sh
# Pi without fast-mode request injection
LABEL=pi-off FAST=0 tools/fast-mode-wire-check/run-pi.sh

# Pi with --fast
LABEL=pi-fast FAST=1 tools/fast-mode-wire-check/run-pi.sh

# Codex CLI direct request
LABEL=codex tools/fast-mode-wire-check/run-codex.sh

# Compare existing run dirs
node tools/fast-mode-wire-check/compare.mjs \
  tools/fast-mode-wire-check/runs/<timestamp>/pi-off \
  tools/fast-mode-wire-check/runs/<timestamp>/pi-fast \
  tools/fast-mode-wire-check/runs/<timestamp>/codex
```

Each run directory contains:

- `flows.jsonl` — redacted mitmproxy HTTP and WebSocket flow records. Codex CLI commonly uses WebSocket (`101 Switching Protocols`) for `/backend-api/codex/responses`; Pi is forced to SSE for easier HTTP-body inspection.
- `stdout.txt` / `stderr.txt` — command output.
- `status.txt` — command exit code.
- `selected-request.full.json` — selected provider request body, if parseable.
- `selected-request.normalized.json` — stable fields for comparison.

## What to check

For Pi off vs Pi fast, expected OpenAI/Codex Responses diff:

```diff
+ "service_tier": "priority"
```

For provider acceptance, check:

- selected Pi response HTTP status is `200`;
- selected Codex reference response may be `101 Switching Protocols` when it uses WebSocket;
- response errors are empty in `comparison.md`;
- command exit code is `0`;
- response stream/WebSocket has normal OpenAI/Codex response events.

This proves the client sent the priority tier and the provider accepted the request. It does not prove the provider internally scheduled it faster unless provider-side logs expose that tier.

## Security notes

The logger redacts common credential headers, but request/response bodies can contain prompt and model output. Treat `runs/` as sensitive and do not commit it.
