# @araketski/pi-fast-mode

Pi extension for preserving an opt-in fast-service preference. **On the inspected Pi 0.99.1 public hook surface, fast-service mutation is unavailable:** requests and headers are left unchanged, including direct physical selections. This repository version has not been published.

The pre-dispatch hooks expose only payload or headers, without verified request provider/API/authentication. The live selected model and a payload model ID cannot safely identify an in-flight request. Virtual routes and earlier responses do not fill that gap. Installed CLI 0.99.2 alone does not establish a different SDK capability; no future host API or upgrade is required by this package.

After publication, install with:

```sh
pi install npm:@araketski/pi-fast-mode
# or load workspace source after installing dependencies and building statusline-protocol
pi -e ./packages/fast-mode
```

- `--fast` enables the preference on session/branch restoration.
- `/fast` or F3 toggles it. `/fast on`, `/fast off`, and `/fast status` set or report it.
- The native footer shows `fast off`, or `fast n/a` when enabled but request applicability cannot be established. `/fast status` explains the hook limitation. Selecting an allowlisted model does not turn this into `fast on`.
- Your choice follows the active session branch; a `--fast` launch overrides saved off state on restoration, but `/fast off` works until the next restoration. Unsupported applicability does not erase your preference or rewrite settings.
- Existing request options and headers are preserved.

The existing Claude/OpenAI allowlist and pure transformations are retained for explicitly verified request facts; their isolated tests do not prove native fast-service support. Sol 6.1 is not added to the allowlist. No live fast-service experiment was performed.

The extension is shipped as TypeScript source. Its statusline-protocol runtime dependency must be compiled and available at load time. Repository-only requirements, designs, limitations and verification methods are in [docs/contract.mara.md](docs/contract.mara.md), excluded from the npm artifact. Source and fresh packed SDK tests use Pi 0.99.1 and a credential-free loopback transport to verify safe no-mutation behavior.
