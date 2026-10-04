# Development Contract

## Spec-driven, incremental development

- Work in small, independently verifiable increments. Avoid speculative infrastructure and unrelated changes.
- Before changing behavior, discover and read the relevant Mara requirements, scenarios, and decisions. Define observable acceptance criteria before implementation.
- Clarify consequential ambiguities with the user rather than silently inventing requirements. Distinguish proposed behavior from agreed requirements.
- Treat the original branch as reference material, not an implicit specification. Do not copy its behavior, dependencies, or architecture without confirming they serve the current requirements.

## Canonical project knowledge: Mara

- Maintain requirements, specifications, designs, decisions, and project documentation in Git-tracked `*.mara.md` files managed through Mara.
- Load the `mara` skill before discovering, authoring, or validating project knowledge, and follow its tool and authoring guidance.
- Use the current repository root as the Mara project. Inspect its schema before choosing item flavours, fields, or relationships; do not assume a vocabulary.
- Keep `AGENTS.md` focused on agent instructions and `README.md` focused on orientation and links to canonical documentation. Do not maintain competing copies of specifications.
- Give knowledge structured identity when it needs independent references or traceability. Keep supporting explanations as narrative in `.mara.md` files; avoid placeholder items and unnecessary trace chains.
- Update affected knowledge alongside implementation changes. Preserve stable identities and meaningful links between requirements, designs, and verification.
- Validate changed knowledge with Mara. Require a complete, valid result; unavailable evaluation is not a pass.
- An accepted specification does not imply implementation or passing tests. Distinguish intended behavior, implementation state, and observed verification results.

## Durable execution tracking: Work

- Use Work for durable implementation items and dependencies; keep product contracts and project documentation in Mara rather than copying specifications into task bodies.
- Load the `work` skill before operating on items. Select the intended checkout explicitly, inspect CLI capabilities, and do not treat readiness as a claim or invent unsupported agent-management commands.
- During the workflow-package campaign, follow [parallel implementation guidance](docs/parallel-implementation.mara.md) for coordinator authority, isolated worktrees, review loops, and completion evidence.
- Follow the **Backlog policy** section of [triage-findings](.pi/skills/triage-findings/SKILL.md) for intake, organization, and scheduling. It is the single shared policy; priority scales and existing topic labels remain project configuration.
- `backlog this` requests recording the referenced outcome under that policy, not code changes. If Work is unavailable, state that no item was created.
- Keep acceptance checklists and delivery evidence in item bodies. Use Work tools for metadata and relations, canonical full IDs in durable references, and narrow opaque-body edits that preserve headers; run Work diagnostics afterward. Use `depends_on` for lifecycle prerequisites, not grouping or informational links.
- Check an acceptance box only after producing evidence that its criterion passes. Close a manual implementation item only after verified integration into its declared delivery target, with acceptance criteria passing and required review complete. Use manual completion for acceptance-gated deliverables; a `children` aggregate derives completion from its children and is not a separate acceptance approval.

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

## Nx workspace practices

- Load the `nx-workspace` skill before exploring workspace projects, targets, or dependencies. Use resolved configuration from `pnpm nx show project <name> --json` when inspecting targets.
- Run workspace tasks through `pnpm nx ...` rather than invoking underlying tools directly when a suitable target exists.
- Do not use globally installed Nx or insert `--` after `nx`. Package scripts may invoke `nx` directly because they resolve local binaries.
- For scaffolding, load the `nx-generate` skill first. Prefer applicable installed generators, inspect their options, and use a dry run before applying changes when supported.
- Consult CLI help instead of guessing flags. For unfamiliar Nx configuration, use the `nx-docs` skill; consult a plugin's `PLUGIN.md` when available.
- If a referenced skill or helper is unavailable, report that limitation and use installed CLI help and available documentation. Do not assume deleted repository tools still exist.

## Pi package tooling

- Use the local `@araketski/nx-pi` generators for supported new Pi resource packages, shared libraries, and extension/skill/prompt/theme scaffolds rather than recreating their boilerplate by hand. Consult [plugin usage](packages/nx-pi/README.md) and its linked Mara contract for capabilities and limitations; inspect generator help and dry-run before writing.
- Do not assume a generator migrates an existing package. The user decides when migration starts and which package is next; preserve authored code and specifications and agree on a package-specific plan before moving or adapting them.
- After changing an eligible package, run its inferred source `pi-check` target. For distribution checks, explicitly build where needed, pack using the chosen package workflow, and supply that archive to `pi-check-package --tarball=<path>`. Neither check proves Pi loading, license compliance, publication readiness, or artifact freshness; use the relevant consumer tests and author review as appropriate.

## Dependency management

- Use pnpm for this repository's package management. The conventions in this section govern this development workspace, not consumer workspaces generated by `nx-pi`; consumer behavior and integration fixtures must follow the plugin's Mara contract rather than inherit our infrastructure choices.
- Declare external dependency versions centrally in `pnpm-workspace.yaml` catalogs. Reference them with `catalog:` or the appropriate named catalog in package manifests; do not duplicate version ranges there.
- Use `workspace:` references for internal workspace dependencies.
- Preserve current version choices unless a dependency change is required and intentional. Do not restore dependencies from the original branch merely because they existed there.
- Regenerate `pnpm-lock.yaml` through pnpm when dependencies or catalog entries change. Verify that a frozen-lockfile install succeeds.

## Code review and finding triage

- Review against the current task, applicable Mara contracts, and the actual end-to-end workflow. Report actionable, consequential defects with concrete impact; leave deterministic style and formatting checks to automated checks.
- In ordinary reviews, a finding requires a fix in the current change when it violates accepted requirements or task acceptance, or is critical: it blocks the primary workflow, makes the delivered outcome unusable, risks unrecoverable user data, or creates a directly exploitable vulnerability in the intended deployment. Valid non-critical improvements outside current acceptance go to the backlog without expanding the change; duplicates, resolved findings, speculative hardening, and non-actionable preferences are dismissed with evidence.
- Load [triage-findings](.pi/skills/triage-findings/SKILL.md) for local, cloud, and combined-state findings. The implementer or integration coordinator owns triage; the independent reviewer remains read-only and does not change code or tracking. Give every finding a supported disposition: fix now, backlog, dismiss, or ask the user. Preserve raw findings/verdicts and record source/revision, rationale, actual fix/checks or backlog destination. A backlog label or working happy path never waives current acceptance or critical safeguards.
- When a user request or delegated task explicitly requires the [local Pi review loop](.pi/skills/pi-review-loop/SKILL.md), load and run it after implementation and before handoff. Inspect relevant accepted backlog entries before each review and supply a captured known-findings snapshot as the skill directs, not previous raw reviews, fix instructions, or a desired verdict. Freeze the reviewed checkout during each independent review and verify completion and unchanged inputs; exit zero or silence alone is not a pass. A reviewer must not recursively invoke the loop.
- Triage each completed review, fix and verify all required findings within authorized scope, commit fixes, then review fresh until no required fix or clarification remains. Do not repeat solely to eliminate supported backlog or dismissed findings. Follow stricter explicit task or campaign gates, including their assigned harness and baseline; this guidance does not replace the workflow-package campaign's Codex review requirement. Unresolved product choices, authorization, remedies, or evidence remain blocked.
- Claim **clean review** only from a completed unchanged independent review with no findings and a correct verdict. Otherwise report **accepted after triage** only when no required fix or clarification remains, applicable verification passes, every finding and relevant known deferral is accounted for, and authorized backlog recording succeeds. Include actual backlog references, dismissal reasons, and a supported assessment of any contrary raw verdict; retain the raw verdict unchanged.
- Apply the same triage policy to combined integration trees; worker acceptance does not prove the combination. Triage does not authorize integration/publication, work closure, or bypass required verification, CI, cloud review, or delivery-target gates.

## Completion criteria

- The increment satisfies its agreed acceptance criteria.
- Relevant tests and available Nx checks pass; affected Mara knowledge is current and validates successfully.
- Required review is complete, every finding has a supported disposition, and no required fix or clarification remains. Report clean review versus accepted after triage accurately under the review guidance above; stricter explicit gates still apply.
- Review the diff for unrelated changes, stale documentation, and unintended dependency updates.
- Report what changed, which checks actually ran, and any remaining limitations. Never claim unrun checks passed.

## Commit discipline

- Commit each small, independently verified increment before starting the next. Keep each commit atomic: one coherent change with its relevant tests and Mara documentation. Do not commit every intermediate edit or a failing red-phase test as a completed increment.
- Use scoped Conventional Commit messages: `<type>(<scope>): <description>`, for example `feat(nx-pi): initialize existing workspaces` or `docs(agents): clarify commit discipline`.
- Review the staged diff and stage only changes belonging to the increment. Do not sweep in pre-existing or unrelated work; ask before including it in a baseline commit. Never discard another contributor's changes to obtain a clean worktree.
- Use commits as normal checkpoints rather than making routine backup copies before edits. A commit does not protect remaining uncommitted work; preserve that work when recovering or revising changes.
- Run the increment's relevant checks before committing, and report the commit ID, checks actually run, and any remaining limitations. Do not amend published commits or rewrite shared history unless explicitly requested.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax


<!-- nx configuration end-->
