# @araketski/pi-fast-mode

Opt-in fast service for supported **directly selected** Claude and OpenAI models. This repository version has not been published.

After publication, install with:

```sh
pi install npm:@araketski/pi-fast-mode
# or load workspace source after installing dependencies and building statusline-protocol
pi -e ./packages/fast-mode
```

- `--fast` enables fast mode on session/branch restoration. In print mode, separate the prompt: `pi --print --fast -- "your prompt"`.
- `/fast` or F3 toggles it. `/fast on`, `/fast off`, and `/fast status` set or report it.
- Eligible Claude Messages requests receive `speed: "fast"` and the fast beta header. Eligible OpenAI Responses requests receive `service_tier: "priority"`; Codex Responses requires configured OAuth.
- The footer shows `fast off`, `fast on` for an eligible direct selection, or `fast n/a` for unsupported selections. It reports eligibility, not server acceptance or measured speedup.
- Your choice follows the active session branch. A `--fast` launch overrides saved off state on restoration, but `/fast off` works until the next restoration. Unsupported models do not erase your preference or rewrite settings.
- Existing request options, native/authored beta tokens and stored model headers are preserved. Claude beta tokens are merged after Pi generates its defaults, then serialized by the SDK into the HTTP header; no early header override is installed. Payload injection requires an exact model ID and compatible Messages/Responses shape.

The existing explicit model allowlist is unchanged; see [the contract](docs/contract.mara.md). Virtual/routed selections remain unsupported. Pi's hooks do not expose immutable physical request identity: direct-mode compatibility uses the live selected model and configured authentication. Same-ID provider/authentication races, request overrides and unrelated nested requests are not comprehensively isolated. This restoration does not claim routing-aware safety or add a router/private API workaround.

The extension ships as TypeScript source. Its statusline-protocol runtime dependency must be compiled and available at load time; Nx typecheck builds that prerequisite automatically. Source and fresh packed SDK 0.99.1 tests use synthetic loopback transport to assert **positive wire mutations**, completed responses, off behavior, authored-field preservation and the incompatible-API regression. An optional installed CLI replay covers Pi 0.99.2. No paid/live fast-service or latency experiment was performed. Repository-only specifications in `docs/` are excluded from the npm artifact.
