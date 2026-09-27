# @araketski/nx-pi

An Nx plugin for Pi package development. Implements `init`, a minimal `package`
generator, an Nx JS-backed compiled `library` generator, `skill`, `prompt`,
`theme`, and `extension` scaffolds, and inferred `pi-check`. Packed validation
is not implemented yet. This package has not been released by this change.

## Initialization

Once the plugin is installed in an existing Nx workspace:

```sh
pnpm nx g @araketski/nx-pi:init --no-interactive
```

When root metadata is missing, supply it explicitly:

```sh
pnpm nx g @araketski/nx-pi:init --name=@acme/workspace --license=MIT --no-interactive
```

Use `--help` for available metadata options and `--dry-run` to preview changes.
`init` preserves existing metadata and does not install dependencies. A scoped
root package name is required. In an interactive terminal, omitting
`--no-interactive` allows `init` to ask for an absent name. Optional metadata is
never prompted for, and cancellation leaves authored files unchanged.
Once registered in `nx.json.plugins`, the plugin infers `pi-check` for packages
with a `package.json.pi` property (including malformed declarations) and projects
with the `nx-pi:library` tag. Configure a different target name with
`{ "plugin": "@araketski/nx-pi", "options": { "sourceTargetName": "validate-pi" } }`.
An explicitly authored target of the same name fails before Nx merges it.
Other plugins’ inferred targets are outside this collision check.

`pi-check` validates package-relative literals and filesystem globs in the
`extensions`, `skills`, `prompts`, and `themes` arrays, then applies `!`-prefixed
exclusions. Positive declarations must each match a path; exclusion-only arrays
fail, while `[]` and explicitly excluding all positive matches succeed. A
directly named hidden or symlinked root is supported if its selected paths stay
inside the package. This validates source presence, not Pi resource loading or
contents. It needs no Pi installation, build output, network access, or
package-code execution. No `pi-check-package` target is inferred yet.

Nx conventionally calls `init` after `nx add` installs a plugin. A plain
package-manager install does not run initialization.

## Create a Pi package

With a valid scoped root `package.json.name` and nonblank root `license`:

```sh
pnpm nx g @araketski/nx-pi:package example --packageVersion=1.0.0 --no-interactive
```

Creates only `packages/example/package.json`, named `@<root-scope>/pi-example`,
with the explicit version, root license, optional root repository/homepage/bugs
metadata when present, and `pi: {}`. Existing destinations and invalid or
missing inputs fail without authored changes; `--dry-run` previews the creation.
`--packageVersion` is used because Nx reserves `--version`. This generator does
not create resources, a license file, tooling configuration, dependencies, or
publication defaults. A license declaration alone does not establish publication
readiness; packed resource validation remains future work.

## Scaffold a Pi skill

```sh
pnpm nx g @araketski/nx-pi:skill code-review --project=@acme/pi-example --no-interactive
```

This adds `skills/code-review/SKILL.md` to an existing Pi resource package and
registers `./skills/code-review` in `package.json.pi.skills`. The name must be
lowercase kebab-case (at most 64 characters); `--description` optionally sets
frontmatter text. Without it, the description is an explicit TODO. The body is
also an explicit TODO: **the actor must write the real description and workflow
before using or publishing the skill**. No example scripts or dependencies are
created. Existing resource directories fail unchanged. An existing `files`
allowlist gains `skills/code-review`; absent allowlists remain absent. Source
validation checks presence only, not that the scaffold is ready for Pi to use.

## Scaffold a Pi prompt template

```sh
pnpm nx g @araketski/nx-pi:prompt review --project=@acme/pi-example --no-interactive
```

Creates `prompts/review.md` (the `/review` command) in an existing Pi resource
package and registers `./prompts/review.md` in `package.json.pi.prompts`.
`--description` optionally sets the command-completion description. Without
it, the frontmatter description is a TODO; the prompt body is always a TODO.
**The actor must replace the TODOs before using or publishing the template.**
The name must be exact lowercase kebab-case (at most 64 characters), and
existing destinations fail unchanged. A present `files` allowlist gains only
`prompts/review.md`; an absent allowlist remains absent. No dependencies,
scripts, or other tooling are added. Source validation checks presence, not
that the prompt is ready to use.

## Scaffold a Pi theme

```sh
pnpm nx g @araketski/nx-pi:theme soft-dark --project=@acme/pi-example --no-interactive
```

Creates `themes/soft-dark.json` with matching theme `name` and all 51 required
Pi 0.87.1 color roles set to the valid terminal-default value (`""`). This is
an intentionally plain starting point; **the actor chooses the palette**.
It registers `./themes/soft-dark.json` in `package.json.pi.themes` and adds
`themes/soft-dark.json` to a present `files` allowlist, leaving an absent
allowlist absent. The name must be exact lowercase kebab-case (at most 64
characters), and existing destinations fail unchanged. It adds no scripts,
other tooling, or dependency on Pi. Source validation checks only the file's
presence, not theme contents or Pi loading.

## Scaffold a Pi extension

```sh
pnpm nx g @araketski/nx-pi:extension status-line --project=@acme/pi-example --no-interactive
```

Creates `extensions/status-line/index.ts`, a typed, no-op Pi extension with an
explicit TODO for the actor to implement. It registers the source file in
`package.json.pi.extensions`, adds the extension directory to a present `files`
allowlist so later helpers can be packed, and adds
`@earendil-works/pi-coding-agent: "*"` to `peerDependencies` if absent. A
consumer-authored nonblank Pi peer range is preserved. Pi supplies this API;
the scaffold does not bundle Pi, compile extension source, install dependencies,
or configure TypeScript. An actor who wants local typechecking must make Pi's
types available in the consumer workspace. Existing extension directories and
invalid inputs fail unchanged. `pi-check` verifies presence, not execution or
packed dependency closure.

## Create a shared library

```sh
pnpm nx g @araketski/nx-pi:library shared --packageVersion=1.0.0 --no-interactive
```

Nx JS scaffolds a buildable `tsc` library at `packages/shared`, with its
TypeScript project configuration and required compiler dependencies. `nx-pi`
sets `@<root-scope>/pi-shared`, reuses validated root publication metadata,
adds the `nx-pi:library` tag (not `pi`), and points npm exports and declarations
to built `dist` output. Build before packing. The generator returns Nx's install
task; unlike `init` or `package`, it may update root TypeScript/Nx setup,
compiler dependencies, and the consumer's lockfile. It does not enable a
registry, Verdaccio, or release policy. Existing Nx Release settings apply; the
Nx-inferred `nx-release-publish` target and dry-run version/publish commands
have been exercised in isolated consumers, not an actual publication.

Optional checked Nx JS settings: `--strict=false`, `--linter=oxlint` (or
`eslint`/`none`), `--unitTestRunner=vitest` (or `jest`/`none`), and
`--formatter=oxfmt` (or `prettier`/`none`). The default adds no linter,
formatter, or test runner; explicitly chosen integrations are Nx-owned. This
initial slice fixes `tsc`, project identity, directory, and tag rather than
passing through options that could defeat package invariants. Other bundlers,
actual registry publication, and all optional-tooling combinations are not yet
verified.

## Repository development

```sh
pnpm nx test nx-pi
pnpm nx lint nx-pi
pnpm nx typecheck nx-pi
pnpm nx build nx-pi
```

Vitest tests run through Nx. The test target first builds the plugin, then tests
source generators and packed artifacts in temporary npm/pnpm consumers,
including workspaces generated by `create-nx-workspace` and installed through
`nx add`. The tests also complete fixture resource scaffolds, pack and install
them in isolated npm/pnpm consumers, and check discovery with the Pi 0.87.1 SDK
without an AI model. This is test-only; no `pi-check-package` target exists yet.
Interactive CLI tests require Linux's util-linux `script`, `stty`, and `/bin/sh`.
Consumer fixture installation and Nx JS compiler setup may use the registry or
package-manager cache; `init`, `package`, and `pi-check` do not.
Tests are uncached so consumer checks actually rerun. If the system
temporary directory is space-constrained, set `NX_PI_TEST_TMPDIR` to a disk-backed
directory outside the repository.

Canonical scope, detailed input rules, and verification definitions live in
`docs/*.mara.md` in the repository. They distinguish current behavior from planned
features and are excluded from publication, along with tests and test configuration.
