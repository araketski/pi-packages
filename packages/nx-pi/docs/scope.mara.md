# Nx Pi tooling scope

This document records the agreed scope for a publicly reusable Nx plugin for Pi package development.
It is a scope baseline, not a completed CLI design or evidence of implementation.
The [structured tooling contract](./contract.mara.md) holds the requirements,
decision rationale, and verification definitions; this document supplies context
and deferred maintenance ideas. Its goal is [[GOAL-NXPI-MAINTENANCE]].
The current development slice concerns tooling, not statusline protocol behavior.

## Current implementation state

`packages/nx-pi` was scaffolded with `@nx/plugin:plugin` and compiles to CommonJS.
`init` supports explicit missing metadata and an interactive prompt for an absent
required scoped root name. It preserves safe registration, unchanged reruns,
actionable conflicts, runtime guards, and no dependency installation. Cancellation
leaves authored files unchanged; optional metadata is never prompted for. Exact
rules are in [[DES-NXPI-INIT-CONTRACT]]. The registered plugin now infers a
source-only `pi-check` for projects with a `pi` manifest or the `nx-pi:library`
tag. Its executor checks literal paths and package-relative glob selections,
applies exclusions, and reports malformed manifests and unmatched positive
patterns without running package code. The minimal `package` generator creates
only `packages/<name>/package.json` from root metadata with an explicit version,
without configuring TypeScript, linting, or other consumer tools. The first
`library` generator uses Nx JS for a compiled `tsc` scaffold with consumer-owned
metadata and optional checked Nx integrations; see [[DES-NXPI-LIBRARY-CONTRACT]].
The first `skill` and `prompt` generators add visibly unfinished source
scaffolds to Pi packages; see [[DES-NXPI-SKILL-CONTRACT]] and
[[DES-NXPI-PROMPT-CONTRACT]]. The first `theme` generator adds a valid,
terminal-default palette scaffold under [[DES-NXPI-THEME-CONTRACT]]. The first
`extension` generator adds a typed no-op extension and an explicit Pi peer
declaration under [[DES-NXPI-EXTENSION-CONTRACT]]. An isolated positive test
now checks Pi 0.87.1 SDK discovery from packed, installed resource fixtures
under [[VER-NXPI-PACKED-RESOURCE-DISCOVERY]]. The inferred `pi-check-package`
checks caller-supplied tarballs for declared resources, missing static extension
helpers, and tagged-library JS/declaration export files under
[[DES-NXPI-PACKED-INPUT-CONTRACT]], [[VER-NXPI-PACKED-STATIC]] and
[[DES-NXPI-PACKED-LIBRARY]]. A narrowly scoped artifact-hygiene rule now
rejects obvious packed tests, test configuration, compiler state and Mara
repository knowledge under [[DES-NXPI-PACKED-HYGIENE]]. Actual library
runtime/type resolution, license obligations and full Pi loading parity are
not implied by these static checks.

Repository-local Vitest tests run through the inferred Nx `test` target. Source
checks cover initialization and runtime guards. Isolated npm/pnpm consumers use
both minimal hand-authored fixtures and real `create-nx-workspace`-generated
workspaces. They exercise packed installation, automatic initialization through
`nx add`, explicit CLI invocation, dry-run, reruns, conflict failures, and
authored-file preservation. Minimal fixtures also exercise real terminal answers,
invalid-name correction, Ctrl-C cancellation, and interactive dry-run. These checks
do not establish completion of the broader [[VER-NXPI-INIT]] or
[[VER-NXPI-FIRST-INCREMENT]].

The project documentation was relocated here after scaffolding, preserving all
structured identities. `package.json.files` excludes this knowledge, tests, and
test configuration from the npm artifact. No repository-wide release workflow or
registry publication is implemented; generated libraries use Nx Release's
existing consumer configuration.
Repository test infrastructure is not added to consumer workspaces.

## Observed verification of interactive initialization

The interactive-init increment passed 80 tests on each of Node 24.19.0 and
26.7.0 locally: 76 source cases and four packed-consumer cases covering npm and
pnpm, including real generated workspaces. Six new source cases first failed
against the non-interactive implementation before the prompt was added.

The Node 24 runner initially encountered the local temporary-storage quota
error (`-122`) before loading tests. Re-running with runner temporary storage as
well as consumer fixtures outside `/tmp` passed without skipping assertions.
Terminal fixture setup also required disabling Nx-owned analytics prompts and
setting terminal dimensions. These are local execution observations for this
increment, not evidence for unimplemented portions of [[VER-NXPI-INIT]], remote
CI, other operating systems, or every allowed Node/Nx release.

The subsequent source-inference slice adds 16 source tests and packed npm/pnpm
checks for Nx target selection, execution, authored collision errors, and unchanged
configuration. Cross-plugin inferred target collisions are deliberately outside
its guarantee because Nx does not expose other plugins' targets to `createNodes`
before merging. That slice checked literal paths; the subsequent
resource-pattern increment adds globs and exclusions. The earlier 80-test count
above describes the interactive-init commit, not these later slices.

The resource-pattern increment passed 114 tests on each of Node 24.19.0 and
26.7.0 locally (110 source cases and four packed-consumer cases using npm and
pnpm). New source cases were first observed failing on unsupported patterns;
additional regressions exposed overly broad parent-path rejection and native
Node glob traversal through wildcard-discovered symlinked directories. The
latter now uses public Node filesystem glob exclusion before traversal. An
intermediate runner failed with the local `/tmp` quota error (`-122`) before
loading tests; isolated runner temporary storage outside `/tmp` restored full
runs without skipping assertions. These observations do not establish complete
Pi discovery parity, content validation, network isolation, or remote CI.

The minimal package-generator increment passed 144 tests on each of Node
24.19.0 and 26.7.0 locally (140 source cases and four packed npm/pnpm consumer
cases). The package source tests first failed against the Nx generator scaffold;
additional malformed-optional-metadata tests also failed before validation was
added. Packed CLI checks cover dry-run, no default version, explicit root metadata,
repeated creation, empty-directory collision, and real generated workspaces.
The CLI exposed Nx's reserved `--version` option, so the generator uses
`--packageVersion`. These checks do not establish license-file completeness,
usable packed resource packages, resource generators, or remote CI.

The first library-generator increment passed 160 tests on each of Node 24.19.0
and 26.7.0 locally (156 source cases and four packed npm/pnpm consumer cases).
Source tests initially failed against the Nx generator scaffold; packed tests
exposed missing Nx-owned compiler dependencies and the classic Nx JS output
path being outside the new package. The generator now returns Nx's dependency
installation task and locates compiled output inside the published package.
Packed independent npm/pnpm consumers build, pack, import the JS, resolve its
TypeScript declarations, and exercise Nx Release version/publish dry-runs. Nx
Oxlint and Vitest/Oxfmt opt-ins were exercised in the minimal consumers, and
library builds were checked in actual `create-nx-workspace` apps fixtures. These
checks do not establish actual registry publication, all optional integrations,
resource-specific content validation, or remote CI.

## Purpose and initial scope

Make package creation quick and consistent, and validate that packages can be
consumed as distributed. Initial work covers initialization of existing supported
Nx workspaces, scaffolding, and validation. A new-workspace preset follows
initialization; reconciliation and migration are future capabilities.

The plugin is intended for independent Nx workspaces, with this repository as
its first consumer. Conventions come from consumer-owned configuration, not
hard-coded owner names or this repository's infrastructure preferences.

## Infrastructure boundary

Core behavior concerns Pi packages and compatible Nx integration. It does not
require pnpm, catalogs, a particular linter, formatter, test runner, CI or release
service, editor, Mara, or agent instructions. Catalog creation and conversion
are outside initial scope. Preserve existing infrastructure choices rather than
silently migrating them. Optional integrations may follow demonstrated needs.

Nx and the runtime/compiler facilities required by the selected package kind
remain technical prerequisites. Define and test a supported package-manager and
toolchain matrix; infrastructure neutrality is not a claim of universal support.
The approved initial boundary is Nx 23, with Node 24 and 26 and npm/pnpm consumer
fixtures. Current initialization pins and runtime ranges are
recorded in [[DES-NXPI-IMPLEMENTATION-BASELINE]]; broader compatibility must be
verified before it is advertised.

This repository's pnpm catalogs, Oxfmt, Oxlint, Vitest, and Mara workflow are
local development choices, not requirements imposed by the published plugin.
See [[REQ-NXPI-INFRASTRUCTURE-NEUTRAL]] and [[ADR-NXPI-PUBLIC-CORE]].

## Package kinds

| Kind                    | Purpose                                                                       | Distribution                                                                            |
| ----------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Pi resource package     | Provides extensions, skills, prompts, themes, or a mixture of these resources | Original resource files, including TypeScript extension source; no compilation required |
| Shared runtime library  | Provides imports used by Pi packages or other libraries                       | Compiled JavaScript and TypeScript declarations through normal npm exports              |
| Nx plugin               | Initializes workspaces and provides scaffolding and validation                | Compiled npm plugin, including generator schemas, templates, and runtime assets         |
| Repository-only tooling | Supports local development and maintenance                                    | May remain private when not required by consumers                                       |

Publishable Pi resource packages, shared runtime libraries, and the Nx plugin
belong under `packages/`; private repository utilities belong under `tools/`.
See the [workspace layout](../../../docs/workspace-layout.mara.md).
A shared library is not a Pi resource package merely because its name starts
with `pi-`, or because Pi extensions import it. It does not need a Pi resource
manifest or the `pi-package` discovery keyword when it exposes no Pi resources.

Shared runtime dependencies of published packages must also be available to
consumers through npm. Local workspace links are not a distribution mechanism;
the publication workflow must produce usable dependency references using the
supported consumer package manager. nx-pi itself must work from its installed
npm artifact without this repository's source or undeclared dependencies.
Repository-only tooling can remain private when consumers do not depend on it.

Compilation and bundling are separate: shared libraries may compile TypeScript
without bundling dependencies. Pi resource packages continue to ship source.

## Naming and metadata

- Place a package named `<name>` in `packages/<name>` and name it
  `<root-scope>/pi-<name>`. Derive the scope from the root package name; the current
  root in this repository gives `@araketski/pi-<name>`. This generated-package
  convention does not determine the Nx plugin's own npm identity: the approved
  plugin is `@araketski/nx-pi` under `packages/nx-pi`.
- Allow one Pi package to contain multiple resources of multiple types.
- Maintain the metadata needed for npm publication and Pi discovery, plus agreed
  repository conventions. Distinguish platform requirements from repository
  choices when specifying individual fields.
- Use root `package.json` as authority for scope, repository URL, and license;
  configure additional repository-wide settings explicitly. Do not embed an
  owner, repository URL, or default branch in generator implementation. Missing
  required configuration is an actionable error; optional metadata is omitted.
  Do not consult GitHub CLI, SSH configuration, or network services for metadata.
- Include applicable license and attribution material in distributed packages.
- Do not introduce a separate provenance-tracking system, import history, or
  vendoring workflow. Adapters and original implementations are the intended
  approaches; reused material still carries applicable licensing obligations.

Exact metadata fields, their authoritative inputs, and missing-input behavior
remain to be specified before implementing metadata generation.

## Scaffolding and validation guarantees

- Preserve unrelated files and metadata. Fail without changes when a package,
  library, or new resource destination already exists, including identical reruns.
  The initial generators have no overwrite mode. Adding a distinct resource to an
  existing Pi package remains supported.
- Integrate dependency declarations with the supported consumer workspace and
  package manager without imposing catalogs or silently rewriting its policy.
  Specify host peer compatibility separately from development installation versions.
- Integrate applicable Nx checks and library compilation with the supported
  consumer toolchain without mandating this repository's formatter, linter, or
  test runner. Concrete integration choices remain to be specified. Do not add
  compilation or unit-test targets without corresponding code; resource validation
  still applies.
- Include runtime helpers, assets, and attribution in distribution. Exclude tests,
  test configuration, caches, and development-only files.
- Validate actual packed artifacts outside the development workspace, not only
  generated files or workspace-linked packages. Check Pi discovery for resource
  packages and runtime exports and declarations for shared libraries.
- Validation reports violations without repairing authored files or metadata.

Detailed acceptance cases and CLI contracts will be specified incrementally
before implementation. The baseline is not a claim that these guarantees are
already implemented or verified.

## Validation targets and first increment

The agreed target split is `pi-check` for fast source checks and
`pi-check-package` for packed-artifact and isolated-consumer checks. Names are
configurable; inference must not silently overwrite an existing target.

Pi packages qualify through their explicit `pi` manifest; shared libraries
qualify through explicit opt-in from the library generator. A `pi-` name alone
is not classification. Leave unrelated Nx projects alone.

The first implementation increment is `init`, inference, and a minimal
`pi-check`: a valid fixture passes, and a missing declared resource fails with an
actionable diagnostic. It requires no Pi installation, networking, compilation,
or package-code execution and does not reject an unbuilt library solely because
its output is absent. Packed-artifact validation and additional checks follow;
do not expose a placeholder target before it works.

See [[DES-NXPI-VALIDATION-TARGETS]] and [[VER-NXPI-FIRST-INCREMENT]] for the
contract and verification plan. A resource and tagged-library static packed target
is now implemented without implicit pack/build/install, under
[[DES-NXPI-PACKED-INPUT-CONTRACT]] and [[DES-NXPI-PACKED-LIBRARY]]. The initial source-target option and
shared-library marker are recorded in [[DES-NXPI-VALIDATION-TARGETS]]. Broader
option contracts and compatibility remain
to be specified; the approved initial boundary is
[[DES-NXPI-IMPLEMENTATION-BASELINE]].

## Generator interface

Provide `init` for an existing supported Nx workspace. Initialization registers
the plugin for inferred validation targets and prepares root `package.json` as
the metadata source for later generators. Reuse existing metadata and fill missing
fields only from explicit options or interactive answers. Preserve existing values
and unrelated configuration; do not invent metadata or silently overwrite it.
Non-interactive invocation fails actionably when required values remain missing.

Init installs no dependencies, including Pi, and is unchanged on identical reruns.
Dry-run reports metadata additions and registration without writes or installation.
Exact fields, options, diagnostics, and the supported baseline remain to be
specified in [[REQ-NXPI-INIT]] and [[DES-NXPI-INIT-CONTRACT]]. A later new-workspace
preset composes workspace creation and initialization rather than duplicating policy.

Use separate `package` and `library` generators for Pi resource containers and
compiled shared libraries, plus `extension`, `skill`, `prompt`, and `theme`
generators for adding resources. Unlike initialization, creation fails on an
existing destination. Accept strict unprefixed lowercase kebab-case package names
rather than normalizing alternative spellings.

Prefer composing the appropriate `@nx/js` generator for libraries and applying
common metadata and dependency policies, rather than writing another
compiler/build integration. Full option schemas and implementation details
remain to be specified in [[DES-NXPI-GENERATOR-INTERFACE]].

This repository is the first consumer workspace; its first intended generated
shared library is a statusline protocol library. Tooling acceptance checks install
the packed plugin into independent workspaces and use neutral fixtures. Its API, runtime helpers, state ownership, and
rendering responsibilities belong to a separate development slice.

## Future maintenance operations

### Reconciliation

Explicitly align an existing package with current declared repository policy.
For example, after changing repository metadata, update derived package links;
after adding a resource, reconcile its manifest registration and publication
allowlist. Preserve unrelated authored fields and expose proposed changes for
review. Reconciliation is not permission to silently repair packages during
validation or ordinary scaffolding.

### Migration

Apply a deliberate transition between conventions, such as changing generated
test discovery, moving a resource layout, or updating TypeScript/Nx configuration
for a new supported toolchain. A future migration would identify applicable
packages, check prerequisites, produce a reviewable diff, and define safe rerun
and failure behavior. It is distinct from filling in current-policy metadata.

These examples preserve the intended direction without requiring an extensibility
framework or implementing either operation in the initial slice.

## Related documentation

The following describe this repository's development environment, not consumer
requirements:

- [Workspace linting](../../../docs/tooling.mara.md)
- [TypeScript code traceability](../../../docs/code-traceability.mara.md)
