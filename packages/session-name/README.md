# @araketski/pi-session-name

Automatically name Pi sessions with an LLM and optionally show only that name in
the terminal title. No extra commands or interface; native `/name` and `/resume`
remain available. This package is not yet published.

Try the source from the repository root:

```sh
pi -e ./packages/session-name
```

An optional `<agent-dir>/session-name.json` selects a provider/model/thinking
level and controls title mirroring. See the canonical
[usage, defaults, failure behavior and contract](https://github.com/araketski/pi-packages/blob/main/packages/session-name/docs/contract.mara.md).
For repository development, that same document is in `docs/contract.mara.md`.

Development checks target Pi **0.99.1**, not other versions or a released artifact.
Title generation can incur model charges that Pi 0.99.1 does not automatically
include in session totals. Terminal mirroring requires title-sequence support.
