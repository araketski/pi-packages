# Workspace linting

## Scope and acceptance criteria

- JavaScript and TypeScript source is linted with Oxlint, independently of formatting with Oxfmt and compiler checks through Nx typecheck targets.
- Packages with lintable source receive cached Nx `lint` targets without hand-written per-package lint commands. Documentation-only packages need no lint target.
- Correctness violations, unhandled promises in TypeScript, warnings, and unused suppression directives fail lint. Valid source passes.
- Dependencies remain catalog-managed. The Nx plugin version matches the workspace's Nx version; tool versions are selected deliberately and recorded in the catalog and lockfile.
- Lint ignores dependency directories, Nx state, build output, and coverage output.

## Configuration

The root `.oxlintrc.json` defines the shared baseline. It enables the TypeScript,
Unicorn, and Oxc plugins, correctness errors, type-aware linting through
`oxlint-tsgolint`, and an explicit `typescript/no-floating-promises` rule.
Warnings and unused disable directives fail the check. Stylistic lint rules are
not enabled wholesale; formatting belongs to Oxfmt.

The `@nx/oxlint` inference plugin in `nx.json` supplies project lint targets.
The shared `lint` target inputs conservatively include the project, its dependency
projects, shared lint and TypeScript configuration, ignore files, catalogs, and
both lint engines. Changes to imported types must invalidate type-aware lint results.
Keep TypeScript files included in their package's TypeScript configuration so
type-aware checks can analyze them. Oxlint's experimental compiler diagnostic
mode is not enabled; type-aware linting does not replace typechecking.

A package-specific Oxlint config replaces ancestor configuration unless it
explicitly extends it. Extend the shared root config when adding local rules.
Add framework or test-specific plugins only when corresponding code is introduced.

## Usage

```sh
pnpm nx run-many -t lint
pnpm nx run <project>:lint
pnpm nx run <project>:lint --fix
```

The existing CI workflow already includes `lint` in its Nx `run-many` command.
The `nx-pi` scaffold now receives a lint target. Checking its initial empty
entrypoint does not establish that future generator behavior has been verified.

## Verifying the setup

Use a disposable package under `packages/`, with its own package manifest,
TypeScript config including its source, and a TypeScript file. Confirm that
`pnpm nx show project <project> --json` reports a cached `lint` target. Then run
that target with `--skipNxCache` and check these cases independently:

1. Valid exported code passes.
2. An unused local variable fails with a correctness diagnostic.
3. A bare `Promise.resolve(...)` fails with `typescript/no-floating-promises`;
   explicitly handling or discarding the promise passes.
4. An unused `oxlint-disable-next-line` fails.
5. Invalid source placed only in ignored build output is not linted.
6. A package config extending the root and downgrading a rule to a warning still
   fails when that warning is triggered.

Remove the disposable package afterward. A frozen-lockfile install and Mara
project validation must also succeed. These are verification instructions,
not a claim that checks passed on any particular revision.
