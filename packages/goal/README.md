# @araketski/pi-goal

**Scaffold only. Not a working Goal extension or goal-writing skill.**

The typed extension loads but does nothing. The generated `goal-writer` skill
is discoverable and retains its explicit TODOs; replace them before use or
publication. No Goal tools, commands, hooks, startup flag, persistence,
classifiers, budgets, scheduling, or Herdr integration are implemented.

The package distributes extension TypeScript source and skill Markdown, not a
compiled library. Pi supplies the host API through a peer dependency. There is
no JavaScript library export or build step.

Repository-only intended behavior and historical evidence:

- [Goal contract](docs/contract.mara.md)
- [Classifier policy and historical synthetic pilot](docs/classifiers.mara.md)
- [Retained synthetic records](docs/classifier-evaluation-data.mara.md)
- [Jobs consumer integration contract](docs/jobs-integration.mara.md)
- [Scaffold boundary and verification](docs/scaffold.mara.md)

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
verify discovery and the no-op boundary, not the future Goal contract.
