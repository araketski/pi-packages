# @araketski/pi-judgments

On-demand advisory judgments: discover saved scenarios, evaluate one with context,
or submit generic typed questions. Includes one generic skill and a
schema-aware knowledge-representation scenario. No automatic hooks or writes.

Try the source from the repository root:

```sh
pi -e ./packages/judgments
```

The classifier defaults to `openrouter/~typesafe/jev-latest`, using Pi's existing
credentials. Override with `--judgments-provider=<provider>` and
`--judgments-model=<model-id>`. Supplied context goes to that classifier and may
incur charges; no silent provider/model fallback occurs.

See the canonical [contract and interface](https://github.com/araketski/pi-packages/blob/main/packages/judgments/docs/contract.mara.md)
(repository: `docs/contract.mara.md`) and bundled `skills/judgments/SKILL.md`
for agent guidance. Scenario-specific instructions are exposed by
`judgments_list_scenarios`.

The [approved declarative JSON scenario design](https://github.com/araketski/pi-packages/blob/main/packages/judgments/docs/declarative-scenarios.mara.md)
(repository: `docs/declarative-scenarios.mara.md`) is the next increment, not yet
implemented.

This package is not published. Development checks target Pi **0.99.1**.
Judgments do not authorize actions or prove correctness; quality and token
savings remain unproven.
