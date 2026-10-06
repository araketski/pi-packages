# @araketski/pi-goal

**Internal state slice only. Not a complete Goal workflow or goal-writing skill.**

The extension registers four Pi state lifecycle observers and supplies an internal
fresh-namespace state/ledger seam. Startup/reload pauses restored active goals by
default. No Goal tools, commands, startup flag, classifier calls, budget runtime,
scheduling, or Herdr integration are implemented. The discoverable `goal-writer`
skill retains its explicit TODOs; replace them before use or publication.

The package distributes extension TypeScript source and skill Markdown, not a
compiled library. Pi supplies the host API through a peer dependency. There is
no JavaScript library export or build step.

Repository-only intended behavior and historical evidence:

- [Goal contract](docs/contract.mara.md)
- [Classifier policy and historical synthetic pilot](docs/classifiers.mara.md)
- [Retained synthetic records](docs/classifier-evaluation-data.mara.md)
- [Jobs consumer integration contract](docs/jobs-integration.mara.md)
- [Fresh state and evidence design](docs/state.mara.md)
- [Scaffold/implementation boundary and verification](docs/scaffold.mara.md)

The publication allowlist selects the extension, skill, README, and MIT license.
Mara specifications, synthetic datasets, tests, and tooling configuration stay
in the repository. Technical checks are not license compliance or publication
approval; the publishing author owns any applicable notices and release review.

## Development

```sh
pnpm nx test @araketski/pi-goal
pnpm nx lint @araketski/pi-goal
pnpm nx typecheck @araketski/pi-goal
pnpm nx run @araketski/pi-goal:pi-check
pnpm -C packages/goal pack --pack-destination=<archive-directory>
pnpm nx run @araketski/pi-goal:pi-check-package --tarball=<archive-path>
```

The test target checks source loading and fresh packed npm/pnpm consumers with
Pi 0.99.1 in isolated agent directories, without model inference. These checks
verify discovery and the internal state/lifecycle seam, not the full Goal contract.
Stored evidence remains supplied claims/references; these checks do not prove its
contents satisfy an objective or establish classifier accuracy.
