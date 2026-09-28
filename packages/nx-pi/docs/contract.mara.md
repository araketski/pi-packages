# Nx Pi tooling contract

Structured requirements and verification definitions for a publicly reusable Nx
plugin for Pi package development.
The [scope document](./scope.mara.md) provides context and deferred maintenance
ideas. This contract records intended behavior, not implementation or execution
results. Draft items capture the agreed direction while detailed CLI behavior
and acceptance cases are being settled.

Verification items describe repeatable checks to implement. No passing execution
evidence is asserted by their presence. Statusline protocol behavior is outside
this contract; use neutral packages when verifying tooling.

:::mara goal GOAL-NXPI-MAINTENANCE
:mid: 01M3H8502V5PC9J3NPQB9GF45A
:title: Consistent package creation and dependable distribution
:status: accepted

Maintainers of independent Nx workspaces can quickly create consistent Pi resource packages and shared libraries, and determine whether distributed artifacts are usable without relying on the development workspace. nx-pi is intended to be a publicly reusable npm plugin, with this repository as its first consumer. Initial work covers initialization, scaffolding, and validation without imposing this repository's infrastructure. A new-workspace preset follows initialization; reconciliation, migrations, and optional infrastructure integrations are deferred.
:::

:::mara requirement REQ-NXPI-IDENTITY
:mid: 01M3H850FGBPT4PACE66DK571H
:title: Derive package identity from the workspace
:status: draft
:kind: functional
:contributes_to: GOAL-NXPI-MAINTENANCE

Scaffolding shall accept an unprefixed lowercase kebab-case package name such as statusline-protocol and create packages/<name> with npm name <root-scope>/pi-<name>. The root package.json name must be a valid scoped npm name of the form @scope/workspace-name. Derive <root-scope> from that name, not from a separate scope setting. For example, root @acme/workspace and package name example produce @acme/pi-example. This applies to Pi resource packages and shared libraries.

Reject scoped names, pi-prefixed names, uppercase names, whitespace, and path separators with actionable errors rather than silently normalizing identity. A missing required root scope is a configuration error. Exact length limits and the complete accepted character grammar remain to be specified.
:::

:::mara requirement REQ-NXPI-PRESERVE
:mid: 01M3H850W30HX2ZG70N6XP1J13
:title: Preserve existing work during scaffolding
:status: draft
:kind: quality
:contributes_to: GOAL-NXPI-MAINTENANCE

Creation generators shall preserve unrelated authored files and manifest fields. Creating a package or library at an existing destination shall fail without changes. Adding a resource to an existing Pi package is supported, but a collision with an existing resource destination shall fail without changes, including a repeated invocation with identical inputs.

The initial creation generators shall not provide an overwrite mode or silently replace resource implementations. Collision checks must complete before writing changes. The precise destination boundary for each resource type remains to be specified. Initialization is a separate operation with a safely repeatable existing-workspace contract under [[REQ-NXPI-INIT]].
:::

:::mara requirement REQ-NXPI-CATALOGS
:mid: 01M3H8518RREP84Y2T4FGY82BB
:title: Preserve centralized dependency versions
:status: retired
:kind: constraint
:contributes_to: GOAL-NXPI-MAINTENANCE

When scaffolding introduces external runtime or development dependencies, their version choices shall live in pnpm catalogs and generated manifests shall use catalog references. Internal workspace dependencies shall use workspace references.

The policy for absent catalog entries, version conflicts, and host peer compatibility ranges remains to be agreed; this item does not authorize automatic upgrades.
:::

:::mara requirement REQ-NXPI-RESOURCE-SOURCE
:mid: 01M3H851NDJTVCNGEVD4VD2C00
:title: Distribute Pi resources without compilation
:status: draft
:kind: constraint
:contributes_to: GOAL-NXPI-MAINTENANCE

Pi resource packages shall distribute original resource files, including TypeScript extension source and required runtime helpers and assets, without requiring compilation of those resources. A package may contain multiple resources of multiple supported types: extensions, skills, prompts, and themes.
:::

:::mara requirement REQ-NXPI-LIBRARY-EXPORTS
:mid: 01M3H852240E0JAQWKJ4CJG00B
:title: Distribute shared libraries through standard npm exports
:status: draft
:kind: constraint
:contributes_to: GOAL-NXPI-MAINTENANCE

Shared runtime libraries shall distribute compiled JavaScript and TypeScript declarations reachable through their npm exports. Their runtime imports shall not require access to workspace source or a Pi-specific TypeScript loader. Being consumed by a Pi resource package does not make a library a Pi resource package.

The supported runtime versions and exact export layout remain to be specified.
:::

:::mara requirement REQ-NXPI-PACKED-VALIDATION
:mid: 01M3H852EWE9JC5A442NA58XDB
:title: Validate actual distributed artifacts
:status: draft
:kind: functional
:contributes_to: GOAL-NXPI-MAINTENANCE

Validation shall inspect actual packed artifacts rather than trusting source presence: declared Pi resources and local static extension helpers, plus declared shared-library JavaScript exports and declaration files, must be included in the supplied archive. Validation must not use workspace links to mask missing distributed files. The static checker is a convenience against missing package members; it does not need to execute package code, load Pi, typecheck a consumer, resolve external dependencies or establish that the artifact is fresh.

Automatic artifact preparation, deeper runtime checks, publication policy and the broader supported consumer-version matrix remain separate choices.
:::

:::mara verification VER-NXPI-SCAFFOLD
:mid: 01M3H852VM7XCJMKR1DWDQC5TN
:title: Exercise scaffolding in disposable workspaces
:status: draft
:method: test
:level: integration
:verifies: REQ-NXPI-IDENTITY
:verifies: REQ-NXPI-PRESERVE
:verifies: REQ-NXPI-METADATA-SOURCE
:verifies: REQ-NXPI-INFRASTRUCTURE-NEUTRAL
:verifies: DES-NXPI-PACKAGE-CONTRACT
:verifies: DES-NXPI-LIBRARY-CONTRACT
:verifies: DES-NXPI-SKILL-CONTRACT
:verifies: DES-NXPI-PROMPT-CONTRACT
:verifies: DES-NXPI-THEME-CONTRACT
:verifies: DES-NXPI-EXTENSION-CONTRACT

Invoke the real Nx generator CLI in disposable independent workspace fixtures using the declared supported toolchain and package-manager matrix. Include a workspace without pnpm configuration or catalogs. Verify package and library destinations and names derived from the consumer root scope. Confirm invalid prefixed, scoped, uppercase, whitespace-containing, and path-like package names fail rather than normalize. Missing required root configuration must produce actionable failure.

Compare authored files and metadata before and after generation: unrelated content must be preserved. Repeat creation with identical inputs and exercise existing package and resource destinations; require failure with no changes. Confirm no overwrite option is offered, while adding a distinct resource to an existing Pi package succeeds. Test init separately under its repeatable initialization contract.

Check metadata comes from explicit consumer configuration without invoking GitHub CLI, reading SSH configuration, or making network metadata lookups. Confirm generators do not install or configure catalogs or unrelated lint, test, formatting, CI, release, editor, documentation, or agent tools. Check declared dependencies can be resolved and packed using each supported consumer package manager, preserving existing references and configuration. The initial package-generator source tests and packed npm/pnpm CLI tests cover its agreed boundary in [[DES-NXPI-PACKAGE-CONTRACT]]: explicit version, root metadata, names, dry-run, collision, and infrastructure preservation. The first library-generator slice covers Nx JS scaffold composition, metadata, collisions, and packed npm/pnpm compiler and opt-in examples under [[DES-NXPI-LIBRARY-CONTRACT]]. The skill scaffold slice covers generated frontmatter and TODO instructions, per-skill declarations, existing files allowlists, dry-run, collision, and second-skill creation in packed npm/pnpm CLI fixtures under [[DES-NXPI-SKILL-CONTRACT]]. The prompt scaffold slice covers generated TODO content, per-file declarations, existing files allowlists, dry-run, collision, and second-prompt creation in packed npm/pnpm CLI fixtures under [[DES-NXPI-PROMPT-CONTRACT]]. The theme scaffold slice covers valid terminal-default roles, declarations, existing files allowlists, dry-run, collision, and second-theme creation in packed npm/pnpm CLI fixtures under [[DES-NXPI-THEME-CONTRACT]]. The extension scaffold slice covers typed source, Pi peer declaration, helper-file inclusion, existing files allowlists, dry-run, collision, and multiple extensions in packed npm/pnpm CLI fixtures under [[DES-NXPI-EXTENSION-CONTRACT]]. Other tooling-combination cases remain planned; this method is not an execution result.
:::

:::mara verification VER-NXPI-DISTRIBUTION
:mid: 01M3H8538HTMQA34J4ST661D2T
:title: Exercise isolated consumers of packed packages
:status: draft
:method: test
:level: acceptance
:verifies: REQ-NXPI-RESOURCE-SOURCE
:verifies: REQ-NXPI-LIBRARY-EXPORTS
:verifies: REQ-NXPI-PACKED-VALIDATION
:verifies: REQ-NXPI-ARTIFACT-CONTENTS
:verifies: REQ-NXPI-VALIDATION-READONLY
:verifies: REQ-NXPI-PUBLIC-PLUGIN
:verifies: DES-NXPI-LIBRARY-CONTRACT

Pack nx-pi itself and install that artifact in an independent supported Nx workspace without links to the plugin development checkout. Confirm Nx resolves its initialization, generators, schemas, templates, and validation functionality using declared dependencies only. Run initialization and use the installed plugin to create the consumer fixtures below.

Generate neutral Pi resource and shared-library fixtures, build only where applicable, and pack them using the selected publication workflow. Inspect tarball contents, then install the artifacts and their runtime dependency closure into an isolated consumer without workspace links. Check Pi discovery of each supported resource type, a runtime import of the library, and a TypeScript consumer resolving its declarations.

Introduce a missing declared resource, missing exported artifact, or excluded required helper and require validation to report failure. Compare authored workspace files before and after validation to detect unintended repairs. Verify that development-only files are absent and required attribution is present. Fix the supported Pi/Node/TypeScript versions and exact commands before executing this method. The positive Pi discovery portion is exercised separately under [[VER-NXPI-PACKED-RESOURCE-DISCOVERY]], and static omission negatives are exercised under [[VER-NXPI-PACKED-STATIC]] and [[VER-NXPI-PACKED-LIBRARY]]. A narrow development-only archive exclusion is separately exercised under [[VER-NXPI-PACKED-HYGIENE]]. Attribution, comprehensive artifact selection, full runtime/declaration resolution and actual publication remain to be verified by this broader method. No passing result for the broader method is claimed.
:::

:::mara decision ADR-NXPI-PACKAGE-KINDS
:mid: 01M3H853NAMB339N23TY6ZV5S2
:title: Separate Pi resource and shared-library distribution
:status: draft
:justifies: REQ-NXPI-RESOURCE-SOURCE
:justifies: REQ-NXPI-LIBRARY-EXPORTS

Use source distribution for Pi resources and conventional compiled npm exports for shared runtime libraries. Pi loads TypeScript extensions, whereas an imported library should not depend on that special loading path. This preserves ordinary npm runtime and declaration resolution at the cost of a build step for shared libraries. Compilation does not imply bundling; runtime dependencies remain explicit.

This is the agreed direction. The item remains draft while the linked distribution contracts and verification definitions are completed. It does not decide the API or behavior of the statusline library.
:::

:::mara requirement REQ-NXPI-ARTIFACT-CONTENTS
:mid: 01M3H85QGDSXVFGTJQY2ZFBA46
:title: Publish only consumer-facing package contents
:status: draft
:kind: constraint
:contributes_to: GOAL-NXPI-MAINTENANCE

Distributed packages shall contain required runtime resources, helpers, assets, and applicable license and attribution material, and shall exclude tests, test configuration, caches, and development-only files.

A deliberately narrow first hygiene slice covers only obvious archive members under [[DES-NXPI-PACKED-HYGIENE]]. Complete file selection, license attribution and intentional consumer documentation policies remain to be specified.
:::

:::mara requirement REQ-NXPI-VALIDATION-READONLY
:mid: 01M3H85QX7CD0B4WJ9VRE74SY4
:title: Report validation failures without repairing authored content
:status: draft
:kind: constraint
:contributes_to: GOAL-NXPI-MAINTENANCE

Validation shall report violations without repairing authored files or package metadata. Repair is not an implicit side effect of checking a package.

This does not prohibit temporary artifacts, caches, or build output; their permitted locations and lifecycle remain to be agreed.
:::

:::mara requirement REQ-NXPI-METADATA-SOURCE
:mid: 01M3H8GMQ83CF8A9KHMSZ64RTT
:title: Use explicit repository-owned metadata sources
:status: draft
:kind: constraint
:contributes_to: GOAL-NXPI-MAINTENANCE

Scaffolding shall use the root package.json as authority for npm scope, repository URL, and license. Npm and Pi publication metadata shall be carried in package.json, with root metadata used as the workspace-level authority and generated package manifests containing package-specific fields. Do not introduce project.json as an alternative publication metadata store. Additional repository-wide settings, when needed, shall be explicitly configured. Missing required configuration shall produce an actionable error; genuinely optional metadata shall be omitted. Init shall prepare root package.json as the shared metadata source by reusing existing values and filling missing fields only from explicit options or interactive answers. Existing values must not be silently overwritten. Non-interactive initialization must fail actionably when required values are neither present nor supplied. A scoped root name must be available by completion, but repository links and a complete license declaration are not initialization prerequisites. License completeness is checked at package creation/publication; missing values must not be invented.

The initial root metadata field set is name, license, repository, homepage, and bugs. Name is required and must include a valid npm scope so generators can derive generated-package scope. License is optional during init and checked at creation/publication; repository, homepage, and bugs URLs are optional. Expose explicit inputs for these fields and prompt only for missing required values, not optional metadata. Reject a present unscoped root name with an actionable error rather than automatically renaming the workspace.

Metadata generation shall not consult GitHub CLI, SSH configuration, or network services. Do not invent author information, branch URLs, or publication defaults. The current init option names, field representations, validation rules, and interactive behavior are specified in [[DES-NXPI-INIT-CONTRACT]]. The initial `package` generator's metadata derivation is specified in [[DES-NXPI-PACKAGE-CONTRACT]]; the initial `library` derivation is specified in [[DES-NXPI-LIBRARY-CONTRACT]]; broader publication policy remains to be specified.
:::

:::mara design DES-NXPI-GENERATOR-INTERFACE
:mid: 01M3H8GN43S4KH2JTSMFX7RZ23
:title: Separate package, library, and resource generators
:status: draft
:kind: interface
:satisfies: REQ-NXPI-RESOURCE-SOURCE
:satisfies: REQ-NXPI-LIBRARY-EXPORTS
:satisfies: REQ-NXPI-INIT

Expose init for an existing supported Nx workspace; package for Pi resource containers; library for compiled shared libraries; and extension, skill, prompt, and theme for adding resources to an existing Pi package. Package and library generators apply common consumer-owned naming and metadata policy. Initialization is safely repeatable, whereas creation generators reject existing destinations.

A new-workspace preset is a later composition of workspace creation and init, not a second implementation of initialization policy. Infrastructure-specific integrations are optional future work, not initial prerequisites. The plugin identity and initial compatibility boundary are recorded in [[DES-NXPI-IMPLEMENTATION-BASELINE]], and target selection is outlined in [[DES-NXPI-VALIDATION-TARGETS]]. The initial library opt-in marker is described in [[DES-NXPI-VALIDATION-TARGETS]]. The initial `package` generator's option schema and manifest are in [[DES-NXPI-PACKAGE-CONTRACT]]. The initial `library` generator composes Nx JS under [[DES-NXPI-LIBRARY-CONTRACT]]. The first skill, prompt, and theme scaffolds are specified in [[DES-NXPI-SKILL-CONTRACT]], [[DES-NXPI-PROMPT-CONTRACT]], and [[DES-NXPI-THEME-CONTRACT]]. The first extension scaffold is specified in [[DES-NXPI-EXTENSION-CONTRACT]]. The interface remains draft while broader publication and packed validation contracts are incomplete.
:::

:::mara requirement REQ-NXPI-INFRASTRUCTURE-NEUTRAL
:mid: 01M3HA4T5NQJXKW71EZDHSGFMR
:title: Avoid imposing consumer infrastructure
:status: draft
:kind: constraint
:contributes_to: GOAL-NXPI-MAINTENANCE
:supersedes: REQ-NXPI-CATALOGS

Core initialization, scaffolding, and validation shall not require consumers to adopt pnpm, catalogs, a particular linter or test runner, a formatter, a CI or release service, an editor, Mara, or agent instructions. Nx and the runtime/compiler facilities required by the selected package kind remain technical prerequisites. Catalog creation and conversion are outside initial scope.

Use supported Nx integration facilities for the consumer workspace rather than introducing a pnpm-specific workflow. Preserve existing dependency references and infrastructure configuration; do not silently migrate them to another policy. Optional integrations may be added later when justified. Specify and verify the supported package-manager and toolchain matrix before claiming support; infrastructure neutrality does not claim every combination works. This requirement concerns consuming workspaces, not this repository's own development choices.
:::

:::mara requirement REQ-NXPI-PUBLIC-PLUGIN
:mid: 01M3HA4TKEC62Y5XNF3V5JW2GV
:title: Distribute nx-pi as a standalone npm plugin
:status: draft
:kind: constraint
:contributes_to: GOAL-NXPI-MAINTENANCE

nx-pi shall be publishable as a conventional compiled npm Nx plugin. Its packed artifact shall contain the runtime entrypoints, generator schemas, templates, and other runtime assets needed to initialize an independent supported Nx workspace and run its generators and validation. It shall not depend on source paths or undeclared development dependencies from this repository.

The plugin is development tooling, not a Pi resource package. Its approved npm identity is @araketski/nx-pi, implemented under packages/nx-pi. The initial compatibility boundary is recorded in [[DES-NXPI-IMPLEMENTATION-BASELINE]]; release policy and expansion beyond the current compatibility slice remain to be specified separately from generated Pi package names.
:::

:::mara requirement REQ-NXPI-INIT
:mid: 01M3HA4V0Y9HZCW8Z1GDBEVR4C
:title: Initialize existing workspaces safely and repeatably
:status: draft
:kind: functional
:contributes_to: GOAL-NXPI-MAINTENANCE

An init generator shall establish the Pi package conventions and nx-pi configuration required in an existing supported Nx workspace, obtaining metadata from explicit consumer-owned inputs. It shall preserve unrelated configuration, report incompatible or missing required inputs actionably, and leave a successfully initialized workspace unchanged on a repeated invocation with the same inputs and plugin version.

Initialization shall obey the infrastructure-neutral contract. It must not silently replace existing package-manager, lint, test, formatting, CI, or release choices. Unlike creation generators, init is intended to operate on an existing workspace and be safe to rerun. Init shall not install or upgrade dependencies, including Pi. Plugin installation precedes initialization as a separate operation. Init owns its plugin registration in nx.json and filling missing shared metadata in root package.json from explicit options or interactive answers. It shall reuse existing metadata, never invent values or silently overwrite existing ones, and fail actionably in non-interactive mode when required values remain missing. The field/option definitions, interactive prompt rules, conflict diagnostics, and current workspace baseline are specified in [[DES-NXPI-INIT-CONTRACT]]. Initialization supports explicit inputs and interactive missing-name collection; source and static packed-target inference are implemented for eligible projects under [[DES-NXPI-VALIDATION-TARGETS]], [[DES-NXPI-PACKED-INPUT-CONTRACT]] and [[DES-NXPI-PACKED-LIBRARY]].
:::

:::mara verification VER-NXPI-INIT
:mid: 01M3HA50S18A0R1CHG9SZ2ESZ1
:title: Check initialization preservation and repeatability
:status: draft
:method: test
:level: integration
:verifies: REQ-NXPI-INIT
:verifies: REQ-NXPI-INFRASTRUCTURE-NEUTRAL
:verifies: DES-NXPI-INIT-CONTRACT

Install the packed plugin into disposable fresh and already-configured Nx workspace fixtures for each declared supported baseline. Include both minimal hand-authored fixtures and real workspaces generated by the pinned create-nx-workspace CLI using the apps preset, separately with npm and pnpm. In generated workspaces, exercise nx add with the local tarball to verify the init convention, then test explicit generator calls. Do not modify generated metadata merely to make initialization succeed. Record authored manifest, lockfile, and configuration state after installation but before init, so installation side effects are not attributed to initialization.

Exercise existing complete metadata, missing required metadata supplied through explicit options, and missing metadata supplied through interactive answers. The authored diff may contain only the nx-pi registration in nx.json and supplied additions to missing shared metadata fields in root package.json. Preserve existing metadata and unrelated fields, including scripts, dependencies, package-manager configuration, and private/publication state. Confirm that later generators read the persisted values as their metadata authority. Verify root @acme/workspace yields @acme/pi-example for a generated example package, and an existing unscoped root name is rejected without renaming. Cover each approved root field: name, license, repository, homepage, and bugs. Interactive initialization prompts only for missing required metadata; omitted optional metadata causes no prompt and remains absent. Confirm no author information, branch URLs, or publication defaults are invented.

Run init twice with identical inputs and plugin version; require no authored changes or scheduled installation on the second invocation. Include an already-registered plugin with missing metadata to verify initialization still fills explicitly supplied missing fields. Exercise supported shorthand and object registrations without rewriting consumer options.

Exercise malformed configuration, missing required values without explicit inputs in non-interactive mode, conflicting supplied metadata, duplicate registrations, and incompatible options. Require actionable failure before either authored file changes. Simulate canceled interactive input and verify that neither partial root metadata nor a plugin registration is left behind. The non-interactive invocation must not attempt to prompt or hang.

Run dry-run with supplied missing metadata and no plugin registration. Verify the reported changes include both files while neither is written and no install is scheduled. Compare package manifests and lockfiles and inspect scheduled callbacks, not only generated nx.json.

Include fixtures without Pi, catalogs, or lint/test/format/CI/release configuration, plus fixtures with differing existing infrastructure. Confirm init does not introduce dependencies, migrate infrastructure, create projects, or add a marker file. Repository metadata and complete license declarations may be absent when not explicitly supplied; they must not be invented. A missing scoped root name must be supplied through an option or an eligible interactive prompt, or produce actionable failure. Verify registration enables validation for eligible fixture projects without rewriting their configuration.

Source tests in src/generators/init and packed-consumer tests in tests/init.consumer.spec.mts implement the current non-interactive and interactive initialization subset. The consumer suite creates and cleans independent generated and minimal fixtures, compares authored files after installation, and exercises real CLI dry-run and reruns. Minimal fixtures also drive the packed CLI through a pseudo-terminal, checking Ctrl-C cancellation, invalid-answer correction, successful answers, dry-run, explicit non-interactive mode, and prompt-free reruns. Terminal fixtures set analytics: false before taking snapshots to avoid Nx-owned analytics onboarding and configure terminal dimensions for stable rendering. Runtime guards have source tests; the consumer matrix runs on the pinned Node versions. Package identity derivation is now covered by the source and packed package-generator tests; the generated-library identity is also now covered by source and packed library-generator checks. Static packed-target inference has separate checks under [[VER-NXPI-PACKED-STATIC]] and [[VER-NXPI-PACKED-LIBRARY]]; initial source-target inference has separate checks in [[VER-NXPI-FIRST-INCREMENT]]. This verification definition does not establish full Pi loading parity, comprehensive publication policy, or actual registry publication.
:::

:::mara decision ADR-NXPI-PUBLIC-CORE
:mid: 01M3HA516PPFKFK3CGD4TCYNS9
:title: Separate reusable plugin behavior from repository infrastructure
:status: draft
:justifies: REQ-NXPI-PUBLIC-PLUGIN
:justifies: REQ-NXPI-INFRASTRUCTURE-NEUTRAL
:justifies: REQ-NXPI-INIT

Target a publicly reusable Nx plugin and use this repository as its first consumer. Limit core behavior to Pi package concerns and compatible Nx integration rather than exporting our pnpm catalogs or preferred quality, CI, release, editor, documentation, and agent tools as mandatory consumer conventions. This keeps adoption independent of those choices, at the cost of specifying and testing an explicit compatibility matrix.

Implement initialization before a new-workspace preset and reuse that initialization contract in the future preset. Add optional infrastructure integrations only when a concrete need justifies them. This repository may retain its own pnpm catalogs and quality tools for developing the plugin. The direction is agreed; detailed compatibility and initialization contracts remain draft.
:::

:::mara design DES-NXPI-INIT-CONTRACT
:mid: 01M3HC40FHAVDV037RX97K3NQ7
:title: Minimal initialization ownership and boundaries
:status: draft
:kind: behavior
:satisfies: REQ-NXPI-INIT
:satisfies: REQ-NXPI-INFRASTRUCTURE-NEUTRAL
:satisfies: REQ-NXPI-METADATA-SOURCE

The initialization boundary, inferred-target registration, explicit filling of missing root metadata, and absence of dependency installation are agreed. The non-interactive and interactive slices below are implemented. Inference options are specified under [[DES-NXPI-VALIDATION-TARGETS]] and [[DES-NXPI-PACKED-INPUT-CONTRACT]]. This broader item remains draft: the implemented slices do not claim completion of all future initialization policy.

## Boundary

The caller supplies an existing Nx workspace with readable root package.json and nx.json. Workspace creation belongs to the later preset. Installing nx-pi is a separate package-manager operation; init assumes the plugin is already installed and does not install or upgrade unrelated tools. Supported Nx and Node versions must be declared and checked before changes. The approved initial boundary is Nx 23 with Node 24 and 26, and npm/pnpm consumer fixtures, as recorded in [[DES-NXPI-IMPLEMENTATION-BASELINE]]; the current fixtures use Nx 23.2.1, Node 24.19.0 or 26.7.0, and pnpm 12.6.0 or the npm bundled with those Node releases. Runtime Node support starts at 24.15.0 or 26.0.0, reflecting the npm-name validator dependency; the package peer currently pins Nx 23.2.1.

## Ownership

Prepare root package.json as the source of shared metadata for later generators. Reuse existing values. Fill missing metadata fields only from explicit options or answers to interactive prompts. Prompt only for missing required metadata; optional fields are supplied through options without mandatory questions. Do not duplicate those values into another configuration file, invent them, or silently overwrite existing metadata. Preserve all unrelated fields, including package-manager selection, scripts, dependency declarations, and private/publication state. Root package.json.name must be a valid scoped npm name by completion because generated packages derive their scope from it. Preserve a valid existing name, accept an explicitly supplied missing name, and report an existing unscoped name without automatically renaming it. License completeness is checked at package creation/publication rather than initialization; repository links remain optional. Supplied optional metadata may be persisted without making it mandatory.

The agreed configuration integration is an nx-pi entry in nx.json.plugins for per-project validation-target inference. The permitted authored changes are this plugin registration and missing root metadata supplied through options or prompt answers. Init performs no dependency installation or upgrades, including Pi. Preserve all other entries, their order, unknown fields, and existing consumer-owned nx-pi options. Add a registration only if absent. Do not create a separate initialized marker, eagerly populate defaults, or add root scripts. The agreed validation split, default target names, project-selection policy, and first-increment boundary are recorded in [[DES-NXPI-VALIDATION-TARGETS]]. Source-target options and library eligibility are specified in [[DES-NXPI-VALIDATION-TARGETS]]; the explicit-tarball packed-target option and eligibility are specified in [[DES-NXPI-PACKED-INPUT-CONTRACT]] and [[DES-NXPI-PACKED-LIBRARY]].

Do not create packages/, change workspace globs, alter TypeScript projects, or create starter packages. A creation generator can establish its own required project registration and files when invoked. Do not install or configure a linter, formatter, test runner, CI, release system, catalogs, editor settings, Mara, or agent instructions.

## Repeatability and failure behavior

A compatible existing registration needs no change, including either supported shorthand or object syntax; init may still fill explicitly supplied missing root metadata. Preserve explicit supported options rather than replacing them with current defaults. Report duplicate or incompatible registrations and malformed configuration with actionable diagnostics; do not silently choose, merge, or overwrite conflicting entries. If supplied metadata conflicts with existing values, report the conflict rather than replacing values. In non-interactive mode, do not prompt or hang: missing required metadata without an explicit supplied value is an actionable error. In interactive mode, missing required values may be requested; cancellation must not leave partial metadata or plugin registration behind. Validate all collected inputs and conflicts before writing either file. The repeated operation with the same inputs and version makes no authored changes and schedules no installation.

Dry-run shows both the intended metadata additions and plugin registration without writing them or performing an install. This guarantee is scoped to init itself: a preceding nx add installation may already have changed a manifest or lockfile, and init must not claim to roll back that separate operation. Nx's ordinary cache and diagnostic output are not authored project configuration.

## Deferred dependency support

Keep Pi out of init. Introduce Pi development support when generating an extension or enabling runtime-level Pi validation that needs it. Pure skills, prompts, and themes do not inherently require a Pi npm dependency; helper scripts may declare their own dependencies. Imported host-provided Pi packages use peer declarations in distributed extension packages, not a bundled host. The relevant later contracts must specify tested versions, dependency placement, and conflict handling.

## Metadata and remaining details

Npm and Pi publication fields belong in package.json. Root package.json remains their workspace-level authority; generated package manifests carry their package-specific metadata. Do not create project.json to store or duplicate publication metadata. Nx-only project configuration is a separate concern. The agreed initial root field set is name (required scoped npm name), license (optional at init, checked at creation/publication), repository (optional URL), homepage (optional URL), and bugs (optional issue-tracker URL). Do not author other publication metadata or defaults as part of init. Non-interactive option names and field representations are specified below. Interactive prompt details are specified below; target eligibility and source-target options are specified in [[DES-NXPI-VALIDATION-TARGETS]]; packed-target options are specified in [[DES-NXPI-PACKED-INPUT-CONTRACT]].

## First non-interactive slice

Expose optional string options named name, license, repository, homepage, and bugs. They fill only absent properties in root package.json; null, empty, or malformed existing values are not silently treated as absent. Name must resolve to a scoped npm name valid for new packages. In non-interactive mode without a supplied missing name, report an actionable error referring to root package.json and --name. The interactive extension is specified below. No positional name or default metadata is synthesized.

Supplied values must be nonblank strings without leading/trailing whitespace. License is persisted as supplied; license completeness remains a creation/publication concern. Homepage and bugs inputs must be absolute HTTP(S) URLs. Repository accepts absolute HTTP(S), git, SSH, git+https, and git+ssh URLs. Existing npm repository/bugs objects are preserved: an explicit option matching their url property is compatible, with no rewriting of their type, directory, email, or other properties. No equivalence between distinct URL spellings is inferred. Optional metadata not supplied is left untouched, including representations that a later creation/publication check may reject.

Register @araketski/nx-pi as a shorthand entry only when absent. Preserve a single existing shorthand/object registration byte-for-byte when no additions are needed; preserve its options, include/exclude filters, and unknown fields. Diagnose a non-array plugins field, malformed plugin entries, non-object own options, or duplicate own registrations before writing either file. Object-valued options are preserved without implementing target-option semantics in this slice; those checks follow the inference contract.

Check the installed Nx major (23) and Node versions (24.15+ within major 24, or major 26) before changes. Dependency/peer ranges constrain the concrete install further; major guards are not evidence that every minor/patch combination has been tested. No installation callback is returned. Nx handles dry-run through its Tree transaction; test this through the packed generator's CLI, not by simulating a separate dryRun implementation.

The observable acceptance criteria are registration and supplied missing-field additions only, exact authored-state preservation on identical reruns or validation failure, no consumer dependency/tool changes, and an independently installed packed generator that Nx can discover and invoke. The interactive extension below adds prompting; validation-target inference remains a subsequent increment. The root plugin entrypoint does not expose placeholder targets in this slice.

## Interactive slice

When root package.json has no name property and --name was not supplied, prompt only if Nx permits interactive input and stdin is also a terminal. Respect Nx's NX_INTERACTIVE/CI/stdout-terminal checks; redirected input/output and --no-interactive must produce the existing actionable missing-name error instead of waiting for input. This condition is evaluated at invocation time, not at module import.

Use Nx's text prompt helper with an illustrative placeholder, not a default answer. Require the same scoped npm-name validation as explicit inputs; invalid or empty answers stay in the prompt until corrected or canceled. Existing root names, including invalid/unscoped ones, and explicitly supplied values never trigger a replacement prompt. Optional metadata is never prompted for.

Validate supplied options and plugin-registration conflicts before asking. Keep collected metadata and registration changes in memory until a valid answer has passed validation. Cancellation or prompt failure must reject without writing either file or returning an installation task. Interactive dry-run may collect the answer, but only Nx's preview is produced; authored files remain unchanged. Identical reruns with a valid persisted root name do not prompt.

Verification combines source tests of prompt eligibility, validation, bypass, and cancellation with packed-CLI tests in a pseudo-terminal. Exercise canceled, corrected-invalid, successful, and dry-run answers, and compare authored state, including pending optional metadata and plugin registration. Pseudo-terminal tooling is repository-only test infrastructure and is not a consumer dependency.
:::

:::mara requirement REQ-NXPI-SOURCE-VALIDATION
:mid: 01M3HDEB72Z64G33MXMKSCPHVN
:title: Check package source without executing or preparing it
:status: draft
:kind: functional
:contributes_to: GOAL-NXPI-MAINTENANCE

Provide a fast workspace check of package metadata, resource declarations, paths, and package conventions. It shall not require a Pi installation, access the network, install dependencies, compile packages, or execute extensions or other package code. For shared libraries, absent not-yet-built output is not a source-validation failure.

The first implementation must accept a valid minimal fixture and reject a declared resource that is missing, with an actionable diagnostic identifying the project and offending declaration/path. The earlier literal-only slice checked paths listed in `package.json.pi.extensions`, `skills`, `prompts`, and `themes`; missing paths fail with the project, field, and declaration. It rejects unsupported glob/exclusion patterns and escaping paths rather than treating them as valid resources. Empty arrays and absent resource fields are permitted; other Pi fields are retained without validation in this slice. Shared libraries with the opted-in tag and no `pi` manifest pass without checking unbuilt output. The resource-pattern increment below implements filesystem glob expansion and exclusions on the tested Node 24/26 baselines. Additional metadata rules and Pi resource-loading/content semantics remain to be specified incrementally.

## Declared resource-pattern increment

For each manifest resource array (`extensions`, `skills`, `prompts`, `themes`), expand relative literal paths and filesystem glob patterns from the package root, then apply `!`-prefixed exclusion patterns to that type’s selected paths. Exclusions are order-independent and only subtract from selected paths; an empty array is an intentional selection of none. A positive literal or glob with no filesystem match is an actionable error naming the project, field and declaration. If all positive matches are explicitly excluded, accept the empty result. An exclusion-only array has no positive selection and is invalid; an unmatched exclusion is a no-op. Keep `pi.image`/`pi.video` and unknown metadata outside this slice.

Reject absolute paths, parent traversal (including glob segments), invalid/empty entries and selected symlink paths that resolve outside the package root. Do not traverse hidden or symlinked directories through wildcard recursion; directly named hidden/symlinked roots are permitted if their resolved matches remain inside the package root. Preserve the previous checks for missing literal paths and malformed `pi`; inspect only paths, never execute or import their contents. Use Node’s built-in filesystem glob matching on supported Node 24/26, with no additional dependency or Pi installation. This check validates source presence, not Pi resource structure, resource loading, or packed contents.
:::

:::mara requirement REQ-NXPI-VALIDATION-ELIGIBILITY
:mid: 01M3HDEBNH707RSD2NE8QKP4JC
:title: Infer validation only for eligible projects
:status: draft
:kind: constraint
:contributes_to: GOAL-NXPI-MAINTENANCE

Infer validation targets for Pi resource packages identified by an explicit pi manifest and for shared libraries explicitly opted in by the library generator. Do not classify a project from its pi- name prefix alone. Leave unrelated Nx projects without nx-pi validation targets.

Shared libraries opt in through the Nx project tag `nx-pi:library`, authored by the library generator. The presence of a `pi` property in package.json identifies a Pi resource package even when the property is malformed; validation must report the malformed declaration instead of silently omitting the project. The detailed shape of valid manifests and diagnostic rules follow the source-validation increment.
:::

:::mara requirement REQ-NXPI-VALIDATION-TARGET-NAMES
:mid: 01M3HDEC3TPB8KAJHM27WC52TB
:title: Allow validation target names without overwriting existing targets
:status: draft
:kind: constraint
:contributes_to: GOAL-NXPI-MAINTENANCE

Validation target names shall be configurable, defaulting to pi-check for source validation and pi-check-package for packed-artifact validation. Target inference must not silently overwrite an explicitly authored target of the chosen name.

The Nx plugin registration accepts `options.sourceTargetName` for the source target; omitted means `pi-check`. The resource-only packed increment accepts `options.packageTargetName`, defaulting to `pi-check-package`, distinct from the source name; it initially inferred the packed checker only for manifested resource packages. The subsequent shared-library slice also infers this target for explicitly tagged libraries, using the same collision policy. An eligible project with an explicitly authored target of the chosen name (project.json, package.json Nx targets or scripts) must receive an actionable collision failure, not a silent merge, replacement, or skip. Other plugins’ inferred targets are outside this collision guarantee: Nx provides no public pre-merge view of them to createNodes. Do not inspect undocumented plugin internals to predict their output.
:::

:::mara design DES-NXPI-VALIDATION-TARGETS
:mid: 01M3HDECHSWTYPPP1Z6KBD488K
:title: Separate source checks from packed-artifact checks
:status: draft
:kind: behavior
:satisfies: REQ-NXPI-SOURCE-VALIDATION
:satisfies: REQ-NXPI-VALIDATION-ELIGIBILITY
:satisfies: REQ-NXPI-VALIDATION-TARGET-NAMES
:satisfies: REQ-NXPI-PACKED-VALIDATION

Use pi-check for fast, non-executing workspace validation and pi-check-package for validation of actual distributed artifacts in isolated consumers. These are configurable default target names, not mandatory infrastructure choices.

Infer targets only for explicitly manifested Pi packages and explicitly opted-in shared libraries. Inference discovers eligible projects; it does not rewrite their configuration. Never infer kind from npm name alone or silently replace an explicitly authored target.

Source validation must work before a library build and without Pi, networking, or executing package code. Packed validation is intended to cover distributed-artifact concerns. The implemented explicit-tarball subset checks included resources, static helpers and declared library output without executing packages; runtime-dependency closure and full Pi compatibility remain deferred.

The agreed first implementation increment consists of init, target inference, and a minimal pi-check that distinguishes a valid fixture from a missing declared resource. Packed validation, broader rule coverage, and resource scaffolding follow in subsequent increments. Do not infer a nonfunctional packed-validation target in the first increment. Statusline behavior remains out of scope.

The initial Nx/Node and package-manager boundary is recorded in [[DES-NXPI-IMPLEMENTATION-BASELINE]]. Use the Nx project tag `nx-pi:library` as the explicit shared-library opt-in, not a Pi resource manifest or a naming prefix. Resource packages are recognized by the presence of `package.json.pi`, even if malformed; the source check must surface errors for malformed declarations. The plugin option `sourceTargetName` customizes the source target, defaulting to `pi-check`. The implemented `packageTargetName` customizes the static packed target, defaulting to `pi-check-package` and distinct from `sourceTargetName`. An explicitly authored target of the chosen name is a failure with an actionable diagnostic; never silently merge, overwrite, or skip it. Check authored project.json targets, package.json Nx targets and scripts. Inferred targets from other plugins are outside this check because Nx 23 createNodes has no public view of them before target merging. Do not inspect plugin internals to predict them. The initial source inference and executor now implement these choices for authored targets. They inspect package.json and project.json without rewriting them; `nx-pi:library` identifies the opted-in shared library, and the presence of a `pi` property triggers the source check even when malformed. The executor checks resource declarations without Pi, network, compilation, or running package code. The subsequent resource-pattern increment supports package-relative filesystem globs and `!` exclusions. Pi resource-loading parity remains broader future work; the explicit-tarball resource packed target is implemented under [[DES-NXPI-PACKED-INPUT-CONTRACT]], and tagged libraries now use the same target for static exports/declarations checks under [[DES-NXPI-PACKED-LIBRARY]]. The first shared-library generator now authors the `nx-pi:library` tag under [[DES-NXPI-LIBRARY-CONTRACT]].

The implemented resource-pattern source-only increment replaces literal-only declaration checking with package-relative filesystem glob expansion and `!`-prefixed exclusions in each Pi resource array. Check positive patterns for at least one match before exclusions, allow an empty final selection when explicitly excluded, and fail exclusion-only lists. Keep the same no-execution/no-network boundary; resource-specific content and full packed-runtime behavior remain deferred.
:::

:::mara verification VER-NXPI-FIRST-INCREMENT
:mid: 01M3HDED08J7546KCC9NWS9GVB
:title: Verify initialization and inferred source validation together
:status: draft
:method: test
:level: acceptance
:verifies: REQ-NXPI-SOURCE-VALIDATION
:verifies: REQ-NXPI-VALIDATION-ELIGIBILITY
:verifies: REQ-NXPI-VALIDATION-TARGET-NAMES
:verifies: DES-NXPI-VALIDATION-TARGETS
:verifies: DES-NXPI-IMPLEMENTATION-BASELINE

Pack @araketski/nx-pi from packages/nx-pi and install it into isolated Nx 23 workspaces. Run npm and pnpm consumer fixtures on each of Node 24 and Node 26, without requiring catalogs, according to [[DES-NXPI-IMPLEMENTATION-BASELINE]]. Record exact tool versions and results for each combination; an unavailable combination is not a passing result. Execute the initialization checks in [[VER-NXPI-INIT]]. Use neutral Pi-resource, opted-in shared-library, unrelated-library, and pi-prefixed-but-unmarked fixtures. Inspect resolved Nx configuration: only eligible projects must receive the implemented source-validation target. Confirm source-validation inference does not rewrite project configuration.

Run the target against a minimal valid Pi fixture and require success. Change an explicit resource declaration to a missing path and require failure with a diagnostic identifying the project and declaration/path. Restore the resource and require success. Run with no Pi installation, without build output, and with networking and package-code execution disallowed; source validation must not introduce any of these activities. A shared-library fixture with absent build output must not fail solely for that absence.

Exercise configured target names and an existing colliding target; verify the prior target is never silently overwritten. Compare authored files before and after checks. Verify the first increment does not expose a placeholder packed-artifact target or claim broader checks are implemented.

The initial source subset is implemented with source tests and packed npm/pnpm consumer fixtures on Node 24.19.0 and 26.7.0, using Nx 23.2.1. At that increment, the packed suite checked resolved target selection, missing-resource diagnostics, configured names, authored collision failure, unchanged files, and the absence of a packed-validation placeholder; generated-workspace fixtures continue to cover `nx add` initialization. The resource-pattern extension below covers glob/exclusion matching; additional source metadata checks are deferred. Passing the original source subset is not evidence of packed validation, generated library authorship, network isolation, or future scaffolding.

The resource-pattern extension now has source tests for literal paths, wildcard/recursive/brace matches, directory and directly named dot-prefixed roots, exclusions before/after positives, all matches excluded, and a missing positive match. They check exclusion-only declarations, parent/absolute paths, wildcard-discovered symlinked directories, selected symlink escapes, and broken symlink diagnostics. Packed-consumer npm/pnpm fixtures exercise recursive globs, exclusions, unmatched positive patterns, and unchanged authored state through the installed Nx executor. Locally, 114 tests passed on each of Node 24.19.0 and 26.7.0 with Nx 23.2.1, using npm 11.17.0/11.19.0 respectively and pnpm 12.6.0. This verifies source-presence matching on the selected cases, not complete Pi discovery equivalence, content validation, network isolation, or remote CI.
:::

:::mara design DES-NXPI-IMPLEMENTATION-BASELINE
:mid: 01M3HDQZDV8GAEV9YZ2SQSKEWX
:title: Plugin identity and initial compatibility boundary
:status: draft
:kind: deployment
:satisfies: REQ-NXPI-PUBLIC-PLUGIN
:satisfies: REQ-NXPI-INFRASTRUCTURE-NEUTRAL

The approved npm identity is @araketski/nx-pi, implemented under packages/nx-pi. It is a publishable compiled Nx plugin, not a Pi resource package; the generated-package pi- naming convention does not apply to this tooling package. Repository-only utilities belong under tools/ when needed. Directory placement does not determine Pi resource classification or compilation policy.

The approved initial compatibility boundary is Nx major 23, with Node majors 24 and 26 as test environments. Consumer fixtures initially cover npm and pnpm, without requiring catalogs. Cover both package managers on both Node majors. This is an intended compatibility boundary, not a claim that any combination already passes. Broader compatibility must be demonstrated before it is advertised; the repository's pnpm development policy is not a requirement on plugin consumers.

The init fixtures use Nx and create-nx-workspace 23.2.1. CI is configured for Node 24.19.0 (bundled npm 11.17.0) and Node 26.7.0 (bundled npm 11.19.0), with pnpm 12.6.0 on both. Tests record the actual tool versions. The package peer pins Nx 23.2.1; its Node engine permits >=24.15.0 <25 or >=26.0.0 <27, matching the runtime guard and dependency floor. Tested reference versions are not a claim that every allowed minor/patch was individually exercised. The broader plugin-wide compatibility contract remains draft until later Pi/runtime and generated-library contracts are specified.

The initial package scaffold now exists under packages/nx-pi, generated with @nx/plugin:plugin and configured for compiled CommonJS output. Its planned documentation was relocated from docs/planned/nx-pi to packages/nx-pi/docs using Mara item moves, preserving all 26 item IDs and MIDs and repairing document links. Repository-only specifications are excluded from publication through the package file allowlist. Non-interactive and interactive init slices and repository-local Vitest/Nx tests are implemented. Consumer fixtures install the packed plugin in both minimal and create-nx-workspace-generated npm/pnpm workspaces and exercise explicit init plus nx add initialization. Packed CLI terminal tests also cover prompt completion, cancellation, validation, and dry-run. Initial source-target inference and source-presence validation with package-relative globs and exclusions are implemented. The minimal `package` generator is implemented under [[DES-NXPI-PACKAGE-CONTRACT]]. The first `library` generator is implemented under [[DES-NXPI-LIBRARY-CONTRACT]] and uses Nx JS for compiler setup. The first `skill` and `prompt` generators create unfinished scaffolds under [[DES-NXPI-SKILL-CONTRACT]] and [[DES-NXPI-PROMPT-CONTRACT]]. The first `theme` generator creates a valid terminal-default scaffold under [[DES-NXPI-THEME-CONTRACT]]. The first `extension` generator creates a typed no-op scaffold with a Pi peer declaration under [[DES-NXPI-EXTENSION-CONTRACT]]. Packed npm/pnpm resource fixtures now install the generated tarball outside the checkout, replace TODO scaffolds with complete resources, and verify package-sourced skill, prompt, theme, and extension discovery through a pinned Pi 0.87.1 SDK without prompting a model. The imported extension helper is loaded from the installed artifact and test-only files are excluded in the exercised allowlisted fixture. A separate resource-only static checker now infers `pi-check-package` and reports missing declared resources and statically imported local helpers in explicitly supplied npm archives under [[DES-NXPI-PACKED-INPUT-CONTRACT]]. A subsequent static library archive check under [[DES-NXPI-PACKED-LIBRARY]] also reports missing compiled JS exports or declarations. A limited archive hygiene rule now reports obvious packed test, cache and repository-spec files under [[DES-NXPI-PACKED-HYGIENE]]. None of these checks establishes full Pi loading parity, runtime/declaration resolution, complete artifact selection, artifact freshness, licensing completeness, or actual publication. Verification of this slice does not establish completion of those features or publication readiness.
:::

:::mara design DES-NXPI-PACKAGE-CONTRACT
:mid: 01M3HQT2QA7XEQ7793S9N38G9B
:title: Create minimal Pi package manifests from consumer metadata
:status: draft
:kind: interface
:satisfies: REQ-NXPI-IDENTITY
:satisfies: REQ-NXPI-PRESERVE
:satisfies: REQ-NXPI-METADATA-SOURCE
:satisfies: REQ-NXPI-INFRASTRUCTURE-NEUTRAL

The first `package` generator takes a required positional `name` and required `--packageVersion` (Nx reserves `--version`). Accept lowercase kebab-case names with single hyphens and alphanumeric endpoints, excluding names starting `pi-`; do not normalize scoped, uppercase, whitespace, path-like, or prefixed inputs. Read a valid scoped root package.json name to derive `packages/<name>/package.json` with npm name `@<scope>/pi-<name>`; reject invalid derived npm names. Require a nonblank root license declaration and explicit semantic package version before writing. Root repository, homepage, and bugs are optional; validate present values as supported absolute URLs (repository and bugs may be objects with url) and copy their original representations unchanged. Do not consult git, SSH configuration, GitHub CLI, or network metadata services.

Create only a package.json containing name, version, license, present optional metadata, and `pi: {}`. Do not create resources, README, TypeScript/lint/test configurations, keywords, publication defaults, dependencies, or install tasks. `pi: {}` makes the package eligible for source validation; it is not evidence of a valid packed resource package. Do not write root metadata or unrelated files. Reject an existing package destination, including a directory containing unrelated files, without changes. Dry-run is owned by Nx and leaves authored files unchanged. License file inclusion, attribution, publication completeness, resource generators except the first skill, prompt, theme, and extension scaffolds, and packed checks remain later contracts; a root license string alone does not establish those guarantees.
:::

:::mara design DES-NXPI-LIBRARY-CONTRACT
:mid: 01M3HWV43VVWABN110778585NH
:title: Compose Nx JS for compiled shared libraries
:status: draft
:kind: interface
:satisfies: REQ-NXPI-LIBRARY-EXPORTS
:satisfies: REQ-NXPI-IDENTITY
:satisfies: REQ-NXPI-PRESERVE
:satisfies: REQ-NXPI-METADATA-SOURCE
:satisfies: REQ-NXPI-INFRASTRUCTURE-NEUTRAL

The first `library` generator requires the same positional unprefixed `name`, explicit `--packageVersion`, scoped root name, nonblank root license, optional validated root URLs, and destination-collision preflight as the `package` generator in [[DES-NXPI-PACKAGE-CONTRACT]]. It creates `packages/<name>` as `@<scope>/pi-<name>` and marks the Nx project `nx-pi:library`, without a `pi` manifest. It takes responsibility for metadata identity and published entries while delegating the buildable TypeScript scaffold and compiler dependencies to the public `@nx/js:library` generator. The plugin declares `@nx/js` as a runtime dependency; the actual consumer Nx/TypeScript versions and package manager remain consumer-owned. This generator (unlike init and the manifest-only package generator) may schedule Nx-owned dependency installation for its compiler and explicitly selected integrations.

Use `tsc` in the first slice; allow checked pass-through of Nx JS `strict`, `linter` (none/eslint/oxlint), `unitTestRunner` (none/jest/vitest), and `formatter` (none/prettier/oxfmt), defaulting to strict TypeScript and none for unrelated tooling. Fix project directory, import path, and library marker; disallow overriding those invariants, unsupported bundlers, and Nx JS `--publishable` in this slice because that option also sets up Verdaccio and changes workspace release configuration. Keep Nx JS project and TypeScript setup and its selected integrations; do not introduce a second compiler or replace consumer lint/test/format settings silently. Adapt Nx JS output to publish compiled `dist/index.js` and `dist/index.d.ts` from the new package root, while preserving Nx-authored exports where present (including package.json and workspace conditions). Preserve root publication metadata and other authored files except Nx-owned compiler/project setup, dependencies, and lockfile changes. Return Nx installation tasks to link its declared compiler dependencies.

Publish the generated npm package without a `private: true` field; include built output, not development-only files. Do not author global release settings, Verdaccio configuration, a registry, or a release workflow. Rely on Nx Release target inference and existing consumer release settings. Source validation runs before build via the tag; packed runtime and declaration resolution and Nx release version/publish dry-runs must be checked in independent npm/pnpm consumers. A passing dry-run is not evidence that an actual registry publication, untested bundlers, or all optional tooling combinations work. Static packed-export/declaration presence is checked under [[DES-NXPI-PACKED-LIBRARY]]. License material, publication policy, and any deeper packed validation remain later work.
:::

:::mara design DES-NXPI-SKILL-CONTRACT
:mid: 01M3J0ZPWW9F3AXK6NW0J4MF66
:title: Scaffold an unfinished Pi skill in an existing resource package
:status: draft
:kind: interface
:satisfies: REQ-NXPI-PRESERVE
:satisfies: REQ-NXPI-RESOURCE-SOURCE
:satisfies: REQ-NXPI-INFRASTRUCTURE-NEUTRAL

The first `skill` generator takes a required exact lowercase kebab-case positional name (1–64 characters, no repeated hyphens), an explicit `--project` naming an existing Pi resource package, and optional nonblank `--description` (at most 1024 characters). It does not normalize names or prompt for implementation content. For package-only projects created by `package`, resolve the Nx project by matching its npm name under `packages/*`; also accept existing explicit Nx project configurations. Require an object `pi` manifest and reject malformed `pi.skills` and `files` fields before writing.

Create only `<project-root>/skills/<name>/SKILL.md` with Agent Skills name/description frontmatter, a heading, and an unmistakable TODO instruction to replace before use or publication. An omitted description is a visible TODO, not invented routing metadata. The actor supplies the real description and instructions after scaffolding; a scaffold is not evidence of a usable skill. Register the individual `./skills/<name>` directory in `package.json.pi.skills`, preserving existing entries and other manifest fields. If the manifest already has a `files` allowlist, append `skills/<name>` to include the original source in the package; do not introduce an allowlist when absent. Do not create helper scripts, dependencies, build steps, or unrelated tools.

Reject an existing skill directory (including one containing only unrelated files), malformed inputs, and missing or non-Pi projects before writes. Repeat creation fails unchanged. Nx handles dry-run. Test the source generator and packed plugin CLI in independent npm/pnpm workspaces; pack generated resource packages and check that scaffold files are present. This tests selection in the exercised fixtures, not Pi discovery, a completed skill, general exclusion-pattern parity, license-file inclusion, or full publication readiness; those remain future checks under [[VER-NXPI-DISTRIBUTION]].
:::

:::mara design DES-NXPI-PROMPT-CONTRACT
:mid: 01M3J1V2SMT0RZ8SNMEJPBGS3J
:title: Scaffold an unfinished Pi prompt template in an existing resource package
:status: draft
:kind: interface
:satisfies: REQ-NXPI-PRESERVE
:satisfies: REQ-NXPI-RESOURCE-SOURCE
:satisfies: REQ-NXPI-INFRASTRUCTURE-NEUTRAL

The first `prompt` generator requires an exact lowercase kebab-case positional name (1–64 characters, with no consecutive hyphens) and explicit `--project` naming an existing Pi resource package. The name determines Pi's `/name` command. Optional nonblank `--description` (at most 1024 characters) supplies the completion description. Like [[DES-NXPI-SKILL-CONTRACT]], package-only projects from `package` resolve by matching the npm name under `packages/*`, and explicitly configured Nx projects may live elsewhere. Reject malformed `pi.prompts` or `files` declarations before writing. Do not normalize names or prompt for implementation content.

Create only `<project-root>/prompts/<name>.md` with frontmatter `description` and a conspicuous TODO body. If omitted, the description is also a conspicuous TODO. The actor must replace the TODOs before using or publishing this prompt. Register just `./prompts/<name>.md` in `package.json.pi.prompts`, preserving other entries and manifest fields. Append `prompts/<name>.md` to a present `files` allowlist, or leave an absent allowlist absent. Add no dependencies, scripts, build steps, configuration, or agent instructions.

Reject an existing prompt destination, whether a file or directory, and missing, malformed, or non-Pi projects without changes. A repeated invocation fails; a different prompt or skill in the same package remains supported. Nx owns dry-run. Test source preconditions and artifact contents using the packed plugin in independent npm/pnpm workspaces, including real create-nx-workspace fixtures. This verifies source selection in those fixtures, not a usable completed template, Pi command expansion, authored negative patterns, license-file inclusion, or publication readiness; these remain future checks under [[VER-NXPI-DISTRIBUTION]].
:::

:::mara design DES-NXPI-THEME-CONTRACT
:mid: 01M3J2ND7ETGTBH0WFZPFH0NQA
:title: Scaffold a minimal valid Pi theme for later palette customization
:status: draft
:kind: interface
:satisfies: REQ-NXPI-PRESERVE
:satisfies: REQ-NXPI-RESOURCE-SOURCE
:satisfies: REQ-NXPI-INFRASTRUCTURE-NEUTRAL

The first `theme` generator takes a required exact lowercase kebab-case positional name (1–64 characters; no consecutive hyphens) and required `--project` naming an existing Pi resource package. The name becomes both `themes/<name>.json` and the Pi theme name (which must not contain `/`). As with [[DES-NXPI-SKILL-CONTRACT]], resolve package-only projects by matching the npm name under `packages/*` and accept configured Nx projects elsewhere. Validate the object `pi` manifest and any existing `pi.themes` and `files` arrays of strings before writing. Do not normalize names or offer overwrite.

Create only `<project-root>/themes/<name>.json` containing `name` and the 51 required `colors` roles of the Pi 0.87.1 theme schema. Use `""` (the documented terminal-default color form) for every required role; omit optional roles, `vars`, `export`, and `$schema`. The result is structurally loadable but visually plain, with no invented palette, network schema fetch, or JSON comments/invalid TODO fields. The actor customizes the colors before publishing an intentional theme. Register `./themes/<name>.json` in the target `package.json.pi.themes`, appending `themes/<name>.json` to an existing `files` allowlist and leaving an absent allowlist absent. Preserve other fields, resources, and authored files. Add no scripts, tooling, dependencies, or build steps.

Reject collisions with an existing file or directory, invalid names, and missing, malformed, or non-Pi projects before any writes; repeated creation fails unchanged. Nx owns dry-run. Test required keys and default values against the pinned Pi theme schema contract, validation preconditions, and packed plugin/resource artifacts in independent npm/pnpm workspaces (including create-nx-workspace fixtures). A valid scaffold and presence check do not establish intentional palette quality, Pi discovery parity, arbitrary authored exclusion-pattern behavior, licensing material, or full publication readiness under [[VER-NXPI-DISTRIBUTION]].
:::

:::mara design DES-NXPI-EXTENSION-CONTRACT
:mid: 01M3J4AX6SBEXMKJ4177JRSWKQ
:title: Scaffold a typed Pi extension with an explicit Pi peer dependency
:status: draft
:kind: interface
:satisfies: REQ-NXPI-PRESERVE
:satisfies: REQ-NXPI-RESOURCE-SOURCE
:satisfies: REQ-NXPI-INFRASTRUCTURE-NEUTRAL

The first `extension` generator takes a required exact lowercase kebab-case positional name (1–64 characters, no consecutive hyphens) and explicit `--project` naming an existing Pi resource package. Match package-only projects by npm name under `packages/*` and accept explicitly configured Nx projects elsewhere as in [[DES-NXPI-SKILL-CONTRACT]]. Reject malformed `pi.extensions` and `files` arrays, non-object `peerDependencies`, and a malformed present Pi peer entry before writes; retain unrelated manifest entries and fields. Do not normalize names or offer overwrite.

Create `<project-root>/extensions/<name>/index.ts` with a type-only import of `ExtensionAPI` from `@earendil-works/pi-coding-agent` and a default typed factory that has no runtime behavior and an explicit TODO for the actor to implement. Pi runs source TypeScript via jiti, so do not compile or bundle the resource. Register `./extensions/<name>/index.ts` in `package.json.pi.extensions` and append `extensions/<name>` to a present `files` allowlist (including future helpers/assets); leave an absent allowlist absent. Pi's package guidance requires imported Pi packages in `peerDependencies` with `"*"` rather than bundled runtime dependencies. Add `@earendil-works/pi-coding-agent: "*"` if missing; preserve an existing nonblank string version/range instead of silently overriding consumer compatibility policy. Reject malformed present entries and avoid any dependency installation, TypeScript compiler setup, or tooling configuration. A peer declaration does not guarantee type availability in a consumer's uninstalled workspace; typecheck and release integration remain consumer-owned or later slices.

Reject an existing extension directory (including unrelated files), missing or non-Pi projects, and malformed inputs before writes. Repeated creation fails unchanged, while adding a distinct extension or other resource to the same package succeeds. Nx owns dry-run. Test source preservation, declaration and peer policies, collision preflight, and packed plugin/resource artifacts in independent npm/pnpm workspaces including create-nx-workspace fixtures. The scaffold is not a functional extension; source checks validate presence only. Pi SDK discovery now has a positive packed fixture and static relative-import helper checks under [[VER-NXPI-PACKED-STATIC]]; complete Pi loading, dynamic helper dependency closure, authored exclusion-pattern parity, and actual publication remain later verification under [[VER-NXPI-DISTRIBUTION]].
:::

:::mara design DES-NXPI-PACKED-INPUT-CONTRACT
:mid: 01M3J59VY6VRA50E17RHXT7BRN
:title: Inspect explicit packed artifacts before automating preparation
:status: draft
:kind: interface
:satisfies: REQ-NXPI-PACKED-VALIDATION
:satisfies: REQ-NXPI-VALIDATION-READONLY
:satisfies: REQ-NXPI-INFRASTRUCTURE-NEUTRAL

The first packed-validation interface takes an explicitly supplied npm tarball produced by the consumer's chosen build and pack workflow. The checker does not silently run a build, pack command, package manager, Nx Release operation, or dependency installation. It inspects the supplied artifact and reports failures without repairing authored sources. Automatically choosing a pack workflow is a later, separate integration. An artifact-path input does not establish that the artifact is fresh, was generated from the current sources, or was published. The first resource-only subset below fixes archive validation and identity checks; a later static shared-library subset uses the same target under [[DES-NXPI-PACKED-LIBRARY]]. Pi execution, full runtime-dependency closure and consumer typechecking are outside this checker. A subsequent limited exclusion of obvious development-only archive members is specified separately under [[DES-NXPI-PACKED-HYGIENE]]. The source-only `pi-check` continues to be separate under [[DES-NXPI-VALIDATION-TARGETS]].

First resource-only execution slice: infer `pi-check-package` only for projects with a `package.json.pi` property. Require an explicit `tarball` path (relative to the workspace root, or absolute) on every invocation; do not save or guess a pack result. Reject authored target-name collisions; permit `packageTargetName` only when distinct from `sourceTargetName`. Read the gzip npm archive without extracting into or modifying the workspace. Bound processing to 10,000 members, 8 MiB per member and 64 MiB total decoded bodies; archives beyond this first supported range fail explicitly rather than exhausting memory. Require safe, unique, regular `package/` members (directories permitted), no file-as-parent conflicts, and a parseable packed `package.json` with the same name as the source project. Apply positive and `!` exclusion Pi resource patterns to archive entries, and fail missing positive declarations or missing skill `SKILL.md` files. For selected TypeScript/JavaScript extension entries, use the TypeScript parser and module resolver against archive entries to follow statically written relative imports and re-exports; report missing local helpers. Do not execute extensions or install Pi, reject invalid archive structure, and do not claim detection of computed dynamic imports, runtime-loaded skill scripts, or library exports. The first target does not validate theme contents, dependencies, or Pi loading; the isolated Pi discovery fixture remains separate.
:::

:::mara verification VER-NXPI-PACKED-RESOURCE-DISCOVERY
:mid: 01M3J59XDVVRT9C9NG626NY42D
:title: Check Pi discovers completed resources from installed tarballs
:status: draft
:method: test
:level: acceptance
:verifies: REQ-NXPI-PACKED-VALIDATION
:verifies: REQ-NXPI-RESOURCE-SOURCE
:verifies: DES-NXPI-PACKED-INPUT-CONTRACT

In disposable Nx 23 npm and pnpm workspaces outside the development checkout, install the packed nx-pi plugin, generate a resource package and all four resource kinds, then replace scaffold placeholders with neutral, complete resources. Pack the package with the consumer package manager and install its tarball into a separate workspace with no workspace links. Use a fixed Pi 0.87.1 SDK and an isolated agent directory whose settings select only the installed package, without credentials, prompting a model, or making a network metadata lookup. Distinguish package-sourced entries from unrelated host-global resources. Require discoverable skill, prompt, theme, and TypeScript extension, and require the extension's imported helper to load from the archive. Inspect tarball members and require authored test-only files to be excluded when the fixture has an explicit publication allowlist. Compare source workspace snapshots before and after validation, and confirm that isolated Pi resource paths resolve to installed content. Report actual SDK diagnostics rather than silently skipping failed loads.

The static negative case now exists separately under [[VER-NXPI-PACKED-STATIC]]: a missing packed helper fails even though source `pi-check` passes. This Pi SDK slice establishes only positive discovery; artifact freshness, dynamic loading, library exports, general file selection, attribution and publication remain future increments under [[VER-NXPI-DISTRIBUTION]].
:::

:::mara verification VER-NXPI-PACKED-STATIC
:mid: 01M3J77ZC3QVJ76HGW4PF0G8GA
:title: Check declared resources and static extension helpers inside an explicit archive
:status: draft
:method: test
:level: integration
:verifies: DES-NXPI-PACKED-INPUT-CONTRACT
:verifies: REQ-NXPI-PACKED-VALIDATION

Pack resource fixtures after source pi-check succeeds, then supply a tarball explicitly to the inferred resource-only pi-check-package target. The original tarball passes without filesystem changes; omitting a declared resource, skill SKILL.md, or a helper imported by a selected extension fails with the member and cause even though source pi-check remains green. Check parsed import, re-export and nested helper imports; ignore type-only imports and external package imports. Verify malformed package manifest, mismatched identity, missing path, unsafe or duplicate archive entries, empty or invalid patterns and authored target collisions fail with actionable diagnostics. No Pi execution, implicit pack/build/install, or source repair. Separate packed SDK discovery checks positive Pi-loading behavior; this static check is intentionally not a complete Pi parity test.
:::

:::mara design DES-NXPI-PACKED-LIBRARY
:mid: 01M3KBTD72EHMCK7QFEB1PQMPK
:title: Statically inspect packed shared-library exports
:status: draft
:kind: behavior
:satisfies: REQ-NXPI-LIBRARY-EXPORTS
:satisfies: REQ-NXPI-PACKED-VALIDATION
:satisfies: REQ-NXPI-VALIDATION-READONLY

Infer the existing configurable `pi-check-package` target for `nx-pi:library` projects without a `pi` manifest, with the same authored-target collision guarantee and explicit `--tarball` input as resource packages under [[DES-NXPI-PACKED-INPUT-CONTRACT]]. Reuse its bounded, safe, read-only archive inspection and require the packed package name to match the source project name. Inspect the packed manifest, not source files, for declared `main`, `types`/`typings`, and explicit file targets in `exports` (including nested conditional and subpath maps). Require a public root JavaScript entry (`exports["."]` or root `exports` when `exports` exists, otherwise `main`) and a root declaration entry (`types`, `typings`, or a root `types` condition); report any missing declared files. Top-level fields present alongside `exports` are checked too. Accept only explicit package-relative file targets inside the archive; reject malformed, unsupported, wildcard, absolute, traversal or declaration-only runtime paths with actionable diagnostics rather than silently passing. A `./package.json` subpath is allowed but does not count as a JS or declaration entry. Source `pi-check` remains build-free. Do not run or typecheck the library, follow transitive imports, install dependencies, choose a package manager, assume artifact freshness, or claim actual Node/TypeScript resolution or publication.
:::

:::mara verification VER-NXPI-PACKED-LIBRARY
:mid: 01M3KBTF8NWAXB9VWF6TWRFGVE
:title: Find missing published library output without executing the package
:status: draft
:method: test
:level: integration
:verifies: DES-NXPI-PACKED-LIBRARY
:verifies: REQ-NXPI-LIBRARY-EXPORTS

Pack a built Nx JS library generated by the installed nx-pi plugin in disposable npm and pnpm workspaces. Its inferred resource-independent packed target passes for the explicitly supplied real tarball, then fails with an actionable path when a separate repack omits the compiled JS or declarations while source pi-check still passes. Compare authored files before and after. In bounded archive fixtures also exercise `main`, `types`/`typings`, root and subpath conditional exports, absent root entries, invalid targets, archive identity mismatch, and missing explicit files. An unbuilt library must remain eligible for inference but cannot pass a check on a tarball missing its build output. Do not use a runtime import, TypeScript consumer typecheck, implicit build/pack, workspace link or package-code execution to pass the static check. Broader isolated consumer behavior remains separate under [[VER-NXPI-DISTRIBUTION]].
:::

:::mara design DES-NXPI-PACKED-HYGIENE
:mid: 01M3KF5E5KE2VF93TWSB7VR1C0
:title: Reject obvious development-only members in packed artifacts
:status: draft
:kind: behavior
:satisfies: REQ-NXPI-ARTIFACT-CONTENTS
:satisfies: REQ-NXPI-VALIDATION-READONLY

The first publication-hygiene increment extends the existing explicit-tarball `pi-check-package` target for both Pi resource packages and tagged shared libraries. After shared archive safety and package-identity checks, inspect packed regular member paths, not source layout or `package.json.files`, and fail with offending archive paths when any basename is a JavaScript/TypeScript `*.spec.*` or `*.test.*` test file, `vitest.config.*` or `jest.config.*` for JS/TS, `tsconfig.spec.json` or `tsconfig.test.json`, `*.tsbuildinfo`, or `*.mara.md`. Match extensions `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.mts`, `.cjs`, and `.cts` for test source/config names. Report the violations without removing or repairing files. Check only these unambiguous shapes: do not classify entire `test/` directories, other compiler configs, ordinary TypeScript source, user-facing Markdown, or general development-only assets. Do not require a `LICENSE` filename, infer legal obligations from license strings, choose a package-manager allowlist or claim that a passing archive is publication-ready. Unsupported names and deliberate consumer documentation remain an explicit later policy decision.
:::

:::mara verification VER-NXPI-PACKED-HYGIENE
:mid: 01M3KF5G968SBV9GQN0NHPA20B
:title: Catch inadvertent packed tests, caches, and repository knowledge
:status: draft
:method: test
:level: integration
:verifies: DES-NXPI-PACKED-HYGIENE
:verifies: REQ-NXPI-ARTIFACT-CONTENTS

Create otherwise-valid resource and tagged-library npm tarball fixtures containing one or several obvious development-only files, and require the packed checker to reject their exact archive paths without altering authored workspaces. Check generated npm/pnpm consumers with packed-plugin CLI invocations: an excluded test-only file remains harmless, while a separately repacked artifact that includes it fails for both resource and library projects. Include test source suffixes, test configuration, tsbuildinfo and *.mara.md; confirm ordinary documentation, normal source and permitted resource helpers are not rejected. Keep this hygiene slice separate from unresolved attribution policy and from broader artifact selection guarantees.
:::
