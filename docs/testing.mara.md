# Repository test runner

Vitest is this repository's approved test runner, integrated through the
`@nx/vitest` inference plugin in `nx.json`. This is repository-local tooling, not
infrastructure added by `nx-pi` to consumer workspaces.

The catalog pins `@nx/vitest` to the workspace's Nx version, Vitest 4 to a version
supported by that integration, and Vite to a compatible version. Vitest 5 is not
adopted because the installed Nx integration declares support for Vitest 3/4.
Tests use explicit imports rather than global test APIs. Coverage tooling and
thresholds are not configured in this increment.

## Pi extension package load checks

For every completed extension package in this development workspace, keep
package-owned automated checks reachable through its Nx `test` target:

- Load the source package with Pi's pinned `DefaultResourceLoader` in an isolated
  agent directory. Require no loader errors and confirm every declared extension
  entrypoint is discovered; when useful, also assert its registered command or
  flag. This tests execution of the extension factory, not just manifest paths.
- Pack the extension and its workspace runtime dependencies, install their
  tarballs plus the pinned Pi SDK into a temporary consumer **outside** the
  development workspace, and load that installed package with Pi's resource
  loader. Require no loader errors and confirm each discovered entrypoint comes
  from the installed artifact, not a workspace source path or symlink. Clean up
  the consumer. A package with several extensions must check each entrypoint.
- Run the eligible project's `pi-check` source target and explicitly pack and
  supply its archive to `pi-check-package --tarball=<path>` separately. These
  static checks do not load an extension or prove dependency resolution. Load
  checks do not replace behavioral tests, and SDK/loader checks do not exercise
  TUI-only APIs such as `setFooter()`; use a real Pi pseudo-terminal check for
  those interactions. RPC can provide additional process-level checks but its
  `setFooter()` is a no-op.

Here `packages/fast-mode/tests/load.spec.ts` and `distribution.spec.ts` cover
source and isolated packed loading, respectively; `packages/statusline/tests/load.spec.ts`
and `packed-check.spec.ts` cover the same baseline. The latter loads an installed
archive in addition to running the static packed checker. Shared libraries
such as `statusline-protocol` are not extensions; verify their compiled runtime
exports and declarations from an isolated consumer instead. This is a
repository-maintainer testing rule, not tooling or dependencies injected by
`nx-pi` into independent consumer workspaces. Pin a supported Pi version for
these checks and update the reference version intentionally at release time.

```sh
pnpm nx test nx-pi
pnpm nx lint nx-pi
pnpm nx typecheck nx-pi
```

`nx-pi:test` depends on its build and runs source tests plus packed-plugin tests
in temporary independent npm and pnpm workspaces. A separate direct local Nx
CLI dry-run covers `init` and `package` from this workspace's TypeScript source
without modifying root configuration or creating a package. The repository-only
`@swc-node/register` and `@swc/core` development dependencies enable Nx's
fallback from Node's native TypeScript stripping for the CommonJS plugin;
`@swc/core`'s postinstall script is denied because its installed native binary
works without it. No SWC dependency is required of packed-plugin consumers.
Each package manager covers:

- A minimal hand-authored fixture for focused failures, metadata additions,
  dry-run, unchanged reruns, and lockfile/configuration preservation. Its packed
  CLI also runs in a pseudo-terminal to exercise prompt cancellation, invalid-name
  correction, successful answers, interactive dry-run, and prompt-free reruns.
  After initialization, these fixtures also check Nx inference and execution of
  the packed `pi-check` target, selected projects, missing-resource diagnostics,
  configured target names, authored collisions, and unchanged authored files.
  The resource-pattern extension also exercises a recursive glob, exclusion,
  unmatched positive pattern, and unchanged authored state in the packed CLI.
  The minimal `package` generator is exercised from the packed CLI for both
  managers: explicit version, metadata inheritance, invalid inputs, dry-run,
  collision failure, and unchanged unrelated files. The compiled `library`
  generator is also checked for Nx-owned build setup and release targets,
  explicit opt-in lint/test/format options, Nx Release version/publish dry-runs,
  and packed JS/declaration resolution in isolated npm/pnpm installs. The four
  resource generators are exercised together; completed fixture resources are
  packed, installed in a separate consumer with Pi 0.99.1, and discovered
  through Pi's SDK. The extension loads a helper from the installed archive,
  while test-only source files are excluded by the fixture's `files` allowlist.
  For resource projects, inferred `pi-check-package` checks an explicitly
  supplied tarball and fails for the same fixture repacked without a required
  extension helper, while source `pi-check` still passes and authored files
  remain unchanged.
  The same packed target checks the built shared library's declared JS and
  declaration files, failing for separate npm/pnpm repacks with either file
  omitted while library source `pi-check` stays green. Separate archive unit
  fixtures cover missing declarations, skill entrypoints, nested static imports,
  library export conditions and subpaths, invalid archives, name mismatch,
  unsafe links, and duplicate members. Separate npm/pnpm repacks that include
  a resource test file or a compiled library test file fail with archive paths;
  fixture unit tests cover test suffixes, test config, tsbuildinfo and Mara
  knowledge while permitting normal documentation and source files. The checker
  never installs or runs the packed package.
- A fixture actually generated by the catalog-pinned `create-nx-workspace` CLI
  with its `apps` preset. The packed plugin is installed through `nx add` to
  exercise automatic initialization, followed by explicit init calls. The
  generated scoped root name and unrelated configuration are retained. The
  packed package generator is also invoked in these real workspaces, supplying
  missing license through `init` rather than modifying fixture metadata directly.
  The skill, prompt, theme, and extension generators also run in these real
  workspaces. The library generator runs too, then builds with Nx; for that
  step, only compiler/project setup and package-manager lockfiles are expected
  to change.

Tests are uncached: each invocation must actually check external consumer
resolution. Workspace creation and package installation may use the registry or
package-manager cache; initialization itself must not install anything. Fixtures
compare authored state after installation, excluding ordinary `node_modules` and
`.nx` state. Each consumer and Nx sandbox is removed after its test, and the
remaining tarball is removed after the suite. Pi 0.99.1 is pinned as a
repository test dependency in the pnpm catalog and installed explicitly into
isolated npm/pnpm resource consumers. No model, credentials, global Pi binary,
or Pi dependency is required of workspaces using `init` or `pi-check`.
Third-party install scripts from Pi's transitive `@google/genai`, `esbuild`, and
`protobufjs` packages are denied in this development workspace; the exercised
SDK resource-loader path works without them. The positive Pi SDK discovery
fixture and the static archive checker are separate checks: passing either is
not evidence of full Pi loading parity, library runtime/type resolution, or
actual registry publication. Existing independent library runtime-import and
TypeScript-consumer smoke tests are separate evidence, not actions performed
by `pi-check-package`.

The default location is the operating system's temporary directory. On machines
with a constrained `/tmp` quota, select a disk-backed directory outside the
repository; the suite rejects paths inside the development workspace:

```sh
NX_PI_TEST_TMPDIR="$HOME/.cache/nx-pi-fixtures" pnpm nx test nx-pi
```

This changes fixture storage only, not assertions or coverage. If the runner
itself also encounters a temporary-storage quota error, set `TMPDIR`, `TMP`, and
`TEMP` to a separate owned disk-backed directory for the invocation; the fixture
setting alone does not relocate third-party runner caches.

Interactive fixture tests require Linux's util-linux `script`, `stty`, and
`/bin/sh` (available on the Ubuntu CI runner). They set terminal dimensions and
opt out of Nx analytics in fixture configuration before snapshotting, so Nx's
own onboarding question cannot interfere. CI is overridden only for these child
processes to exercise interactive input. Source tests separately verify CI and
redirected-stream prompt suppression. These tools/settings are test prerequisites,
not dependencies or configuration installed in consumer workspaces.

Regular CI runs for every pull request and every push to the default branch
`main`, without a path filter; publication is reserved for the separately gated
release workflow. CI is configured for Node 24.19.0 and 26.7.0, with pnpm
12.6.0. On each version it performs a frozen-lockfile install and Nx formatting
and sync checks. Nx `run-many` runs every available build, test, lint and
typecheck target across all workspace projects, followed by all eligible
`pi-check` source targets.
This includes current extension load suites and future packages that declare
an Nx test target; merely declaring an extension does not generate a test for
it. Each package maintainer must add the load checks above when adding an
extension and ensure the project participates in the workspace test target.
Packed `pi-check-package` runs within current package distribution tests after
an explicit pack, not as an implicit CI target without a tarball. CI does not
run the real interactive Pi pseudo-terminal smoke. It does not require Nx
Cloud; Mara validation remains a separate repository check, not a CI step.
These Node releases bundle npm 11.17.0 and 11.19.0 respectively. Consumer tests
record the actual tool versions on every run; changing the pins requires
deliberate compatibility verification. Configuring the matrix is not evidence
that remote CI has run.

See [[DES-NXPI-INIT-CONTRACT]] for current initialization rules and
[[VER-NXPI-INIT]] for the broader verification method, portions of which remain
planned. Passing initialization and initial source-check tests are not evidence
for actual library runtime/type resolution by the checker, dynamic helper
discovery, full Pi resource-loading parity, actual registry publication, or fully
implemented Pi resources beyond the completed disposable fixtures.

:::mara requirement REQ-CI-MAIN-COVERAGE
:mid: 01M3MKDJ82NATK3HZA1NH1CJ5Q
:title: Run regular checks on pull requests and main pushes
:status: accepted
:kind: constraint
:contributes_to: GOAL-RELEASE-COORDINATION

Regular CI checks every pull request and every push to the repository default branch `main`, regardless of whether the root changelog changes. It retains the supported Node matrix, frozen-lockfile installation, Nx formatting and sync checks, and all available workspace build, test, lint, typecheck and source pi-check targets. This workflow neither publishes packages nor requests release credentials or environment approval; the separately gated release workflow owns publication.
:::

:::mara verification VER-CI-MAIN-COVERAGE
:mid: 01M3MKDMWY56JANB4HG6MWY59Z
:title: Inspect regular CI triggers, checks and publication boundary
:status: accepted
:method: test
:level: integration
:verifies: REQ-CI-MAIN-COVERAGE

Parse and lint the regular GitHub Actions workflow; assert unfiltered pull requests, pushes to main without path restriction, both supported Node versions, a frozen install and every required Nx check. Assert no release environment, write or OIDC permission, tag operation, or publication command. Execute the Nx checks locally and report remote Actions execution separately; local results do not establish remote CI success.
:::
