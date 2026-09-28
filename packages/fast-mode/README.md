# @araketski/pi-fast-mode

Pi extension for opting into faster service on supported Claude and OpenAI models. This repository version has not been published; after publication, install with:

```sh
pi install npm:@araketski/pi-fast-mode
# or try the workspace package locally after installing dependencies and building statusline-protocol
pi -e ./packages/fast-mode
```

- `--fast` enables fast mode on session/branch restoration.
- `/fast` or F3 toggles. `/fast on`, `/fast off`, and `/fast status` set or report it.
- The native footer shows `fast off`, `fast on`, or `fast n/a` (enabled but unavailable for the selected model).
- Your choice follows the active session branch; a `--fast` launch overrides saved off state on restoration, but `/fast off` works until the next restoration.
- Existing request `speed` or `service_tier` options are never replaced.

Supported wire APIs and model ids:

| API                                         | Models                                             | Outgoing request change                                                                              |
| ------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `anthropic-messages`                        | Claude Opus 4.6, 4.8, 5, 5.5                       | `speed: "fast"` and `anthropic-beta: fast-mode-2026-02-01` (plus Claude OAuth beta tokens for OAuth) |
| `openai-responses`                          | GPT-5.4, 5.5, 5.6 Luna/Sol/Terra, 6 Astra/Sol/Luna | `service_tier: "priority"`                                                                           |
| `openai-codex-responses` with ChatGPT OAuth | Same GPT models                                    | `service_tier: "priority"`                                                                           |

Proxy providers using these wire APIs are eligible when the model id matches (optionally prefixed with `anthropic/` or `openai/`). Codex API-key models are not eligible. Availability status reports eligibility, not confirmation that an individual request was changed.

The extension is shipped as TypeScript source. Its statusline-protocol runtime dependency is compiled before packaging and must be available to Pi at load time. Repository-only requirements and verification definitions are in [docs/contract.mara.md](docs/contract.mara.md); they are excluded from the npm artifact.
