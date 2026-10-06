# Development contract

## Dependency management

- Use pnpm for this repository's package management.
- Declare external dependency versions centrally in `pnpm-workspace.yaml` catalogs. Reference them with `catalog:` or the appropriate named catalog in package manifests; do not duplicate version ranges there.
- Use `workspace:` references for internal workspace dependencies.
- Preserve current version choices unless a dependency change is required and intentional. Do not restore dependencies from the original branch merely because they existed there.
- Regenerate `pnpm-lock.yaml` through pnpm when dependencies or catalog entries change. Verify that a frozen-lockfile install succeeds.

## Commit discipline

- Commit each small, independently verified increment before starting the next. Keep each commit atomic: one coherent change with its relevant tests and Mara documentation. Do not commit every intermediate edit or a failing red-phase test as a completed increment.
- Use scoped Conventional Commit messages: `<type>(<scope>): <description>`, for example `feat(nx-pi): initialize existing workspaces` or `docs(agents): clarify commit discipline`.
- Review the staged diff and stage only changes belonging to the increment. Do not sweep in pre-existing or unrelated work; ask before including it in a baseline commit. Never discard another contributor's changes to obtain a clean worktree.
- Use commits as normal checkpoints rather than making routine backup copies before edits. A commit does not protect remaining uncommitted work; preserve that work when recovering or revising changes.
- Run the increment's relevant checks before committing, and report the commit ID, checks actually run, and any remaining limitations. Do not amend published commits or rewrite shared history unless explicitly requested.

## Canonical project knowledge: Mara

- Maintain requirements, specifications, designs, decisions, and project documentation in Git-tracked `*.mara.md` files managed through Mara.
- Load the `mara` skill before discovering, authoring, or validating project knowledge, and follow its tool and authoring guidance.
- Use the current repository root as the Mara project. Inspect its schema before choosing item flavours, fields, or relationships; do not assume a vocabulary.
- Keep `AGENTS.md` focused on agent instructions and `README.md` focused on orientation and links to canonical documentation. Do not maintain competing copies of specifications.
- Give knowledge structured identity when it needs independent references or traceability. Keep supporting explanations as narrative in `.mara.md` files; avoid placeholder items and unnecessary trace chains.
- Update affected knowledge alongside implementation changes. Preserve stable identities and meaningful links between requirements, designs, and verification.
- Validate changed knowledge with Mara. Require a complete, valid result; unavailable evaluation is not a pass.
- An accepted specification does not imply implementation or passing tests. Distinguish intended behavior, implementation state, and observed verification results.

## Documentation ownership and lifecycle

- Keep workspace-wide knowledge in root `docs/` and project-specific knowledge in `<project-root>/docs/`.
- Before a project is scaffolded, keep its documentation in Git-tracked `docs/planned/<project>/`. This is durable specification work, not disposable temporary content. Do not create the target project directory just to hold draft documentation.
- After successful scaffolding, relocate the staged documentation into the project's `docs/` in the same change. Use Mara's item-move operations for structured items, preserving IDs, MIDs, and relationships; relocate supporting narrative and repair relative and incoming links.
- Validate the project after relocation and remove obsolete staging files once their content and references have been accounted for. Keep one canonical copy rather than synchronized duplicates.
- Documentation location does not determine its status: draft and accepted items may exist in either location.
- Package-local documentation is not automatically part of the published artifact. Select consumer-facing documentation explicitly and keep repository-only specifications out of publication unless deliberately included.

## Test-driven development

- For behavioral changes, follow red–green–refactor: write a test, observe it fail for the intended reason, implement the smallest change that passes, then refactor with tests green.
- For bug fixes, first add a regression test that demonstrates the defect.
- Derive tests from requirements and observable outcomes, including relevant failure cases. Prefer behavioral assertions over implementation details.
- For documentation-only or non-executable changes, use appropriate validation instead of artificial tests. If a behavioral change cannot be tested first, explain the constraint and agree on an alternative before proceeding.

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools
