# @araketski/pi-judgments

On-demand advisory judgments: discover saved JSON scenarios, evaluate one with
evidence, validate a saved definition, or submit generic typed questions. Includes
one generic skill and a schema-aware knowledge-representation scenario. No
automatic hooks or writes.

Try the source from the repository root:

```sh
pi -e ./packages/judgments
```

The classifier defaults to `openrouter/~typesafe/jev-latest`, using Pi's existing
credentials. Optional `<agent-dir>/judgments/config.json` and
`<cwd>/.pi/judgments/config.json` each select a complete `provider`/`model` pair.
Explicit CLI flags override the host-trusted project pair, global pair and
defaults; changing provider via `--judgments-provider=<provider>` also requires
`--judgments-model=<model-id>`. Credentials stay in Pi. Supplied context goes to
that classifier and may incur charges; no silent provider/model fallback occurs.

See the canonical [contract and interface](https://github.com/araketski/pi-packages/blob/main/packages/judgments/docs/contract.mara.md)
(repository: `docs/contract.mara.md`) and bundled `skills/judgments/SKILL.md`
for agent guidance. Scenario-specific instructions are exposed by
`judgments_list_scenarios`.

Saved definitions live in `judgments/scenarios/*.json` under the agent directory
or project `.pi/`, with bundled defaults in this package's `scenarios/`. Discovery
exposes invocation and input/dynamic-criteria guidance; definitions refresh on
calls. Project data follows Pi's reported trust state.

See the [declarative JSON scenario contract and verification](https://github.com/araketski/pi-packages/blob/main/packages/judgments/docs/declarative-scenarios.mara.md)
(repository: `docs/declarative-scenarios.mara.md`). The bundled skill includes a
minimal authoring example; validate intentional changes with
`judgments_validate_scenario` before reuse.

This package is not published. Development checks target Pi **0.99.1**.
Judgments do not authorize actions or prove correctness; quality and token
savings remain unproven.
