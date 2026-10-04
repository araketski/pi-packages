# Parallel workflow-package implementation

This records the agreed development campaign, not an implemented orchestrator or
runtime dependency of any published package. Mara remains canonical for product
contracts; Work tracks implementation scope, dependencies, and completion. Neither
Work items nor a clean reviewer response prove runtime conformance.

## Campaign baseline

Pi 0.99.1 is the user-selected campaign baseline. An upgraded installed CLI does
not establish SDK or consumer compatibility: reconcile native capabilities,
repository dependencies, and required verification before dispatching implementation.
Historical Pi 0.87.1 results are not passing evidence for Pi 0.99.1. Keep the
campaign paused until that reconciliation and launch preflight are complete.
Follow the [native-capability reconciliation](pi-0991-reconciliation.mara.md) and
complete its coordinator-owned baseline Work prerequisite before the first
scaffold. This preparation item is a direct child of the root, alongside the six
package aggregates; readiness does not override the campaign pause.

## Selected packages and hierarchy

Implement `pi-jobs-core`, `pi-jobs`, `pi-herdr`, `pi-goal`, `pi-caffeinate`, and
`pi-gates`, using the existing gates and statusline protocols where applicable.

Use one root coordinator Work item with manual completion, child items per package
with children-derived completion, and small independently verifiable implementation
items under each package. Cross-package `depends_on` edges point to the actual
prerequisite increments, not indiscriminately to whole packages. Bootstrap the
coordinator explicitly with the root item ID; do not wait for `item ready` to return
that parent. The inspected Work CLI reports a manual parent as non-executable while
children remain unresolved. This is expected completion/readiness behavior, not an
agent-start mechanism. Use readiness for implementation-leaf dispatch and keep the
root reserved for the existing coordinator's final integration/review obligation.

## Roles and authority

| Role | Harness | Model | Thinking | Concurrency |
| --- | --- | --- | --- | --- |
| Coordinator | Pi in Herdr | `gpt-6-astra` | high | One |
| Workers | Pi in Herdr | `gpt-6.1-sol` | high | At most five active workers |
| Reviewers | Fresh Pi process | `openai/gpt-6.1-sol` | xhigh, fast | Excluded from worker count |

The coordinator and all implementation workers are **Pi agents**, started with
Herdr's `--kind pi`. Independent local reviews use
[pi-review-loop](../.pi/skills/pi-review-loop/SKILL.md), not Codex CLI. Its launcher
owns the fresh reviewer process and required model/settings; worker settings are
not reviewer settings. Work metadata is a dispatch instruction, not enforcement
by Work. Verify actual harness/model/settings and report unavailable prerequisites
rather than substituting another profile or claiming review completion.

The coordinator may resolve implementation details, shared API designs, dependency
sequencing, and integration conflicts within accepted contracts. It must escalate
product-policy changes, consequential ambiguities, or impossible acceptance criteria
rather than silently weakening scope. Do not publish, tag, rewrite shared history,
or merge the completed integration branch back into `rework` without user approval.

Create a dedicated coordinator integration branch/worktree. Workers use separate
branches/worktrees based on its integrated prerequisites. These must be Herdr
worktree workspaces, visibly grouped with the repository, not standalone workspaces
merely pointed at Git worktrees. Use `herdr worktree create` for new checkouts and
`herdr worktree open` to attach existing ones without duplicating their agents.
Discover the repository's primary (non-linked) workspace and explicitly select it
as `--workspace`: Herdr 0.9.1 rejects create/open from a linked child workspace.
Always supply the assigned immutable integration SHA as `--base` when creating a
worker branch; the repo parent's HEAD is not the campaign integration baseline.
Preserve focus with `--no-focus`, parse returned IDs, and verify workspace worktree
provenance/group membership before dispatch. The live user checkout is not a
worker sandbox. Preserve existing uncommitted/unrelated work.

## Herdr labels and inspectability

Every campaign-created workspace, tab, pane, and live agent must have a meaningful
name. This includes automatically created root tabs/panes, split panes, review
attempts, and auxiliary check terminals. Use the campaign prefix `wf`, a package
or coordinator role, and the short Work ID. Review labels also include the attempt
number; check labels identify the check. For example:

| Resource/purpose | Display label or live agent name |
| --- | --- |
| Integration workspace | `wf / integration / w-836650d2` |
| Coordinator tab/pane/Pi session | `wf / coord / w-836650d2` |
| Coordinator live agent | `wf-pi-coord-836650d2` |
| Worker tab/pane/Pi session | `wf / jobs-core / impl / w-36824905` |
| Worker live agent | `wf-pi-jobs-core-36824905` |
| Reviewer tab/pane | `wf / jobs-core / review 1 / w-36824905` |
| Reviewer live agent, when recognized | `wf-pi-jobs-core-36824905-r1` |
| Auxiliary check tab/pane | `wf / jobs-core / test / w-36824905` |

Use the actual assignment, not these example IDs. Agent names must be unique in
the selected server and satisfy Herdr's `[a-z][a-z0-9_-]{0,31}` constraint. Resolve
collisions without taking another agent's name. Display labels can be more readable
than the compact agent names. Labels aid inspection; they are not authority or
completion evidence.

Pass `--label` to workspace/tab creation and preserve focus with `--no-focus`.
Parse returned IDs, then immediately name any auto-created tab and root/split pane
with `tab rename` and `pane rename` before starting work. Start Pi with both a
meaningful Herdr agent name and native `--name` session label. Verify names and
harness through the returned state and read-only get/list operations before sending
the assignment; do not rely on shell or application-generated default titles.

When review execution uses Herdr, use named tabs/panes. If Herdr recognizes a
live Pi reviewer during the non-interactive command, give it the corresponding
unique name with `agent rename`; do not force an interactive startup handshake or fabricate
agent reports just to attach a name. A command not exposed as a live agent remains
inspectable through its named pane and saved review report. Record names and IDs
in the dispatch ledger and review evidence. On reassignment, update labels/session
names and the ledger before new work; a naming failure blocks further dispatch
until corrected or reported. Never rename unrelated resources.

## Work coordination boundary

Load the installed Work skill and inspect the selected CLI version/help. The
inspected CLI was `work 0.1.0-alpha.1`: it has durable manual/aggregate items,
relations, readiness, and diagnostics, but no claims, running state, agent execution,
worktree management, or handoff operations. Do not advertise invented Work commands.
A disposable CLI probe confirmed that a fresh checkout needs real `.work/items/`
directories before the first create; create the directories, then author items with
Work rather than fabricating headers. The probe also confirmed parent blocking and
ready-leaf selection, not any runtime orchestration capability. Track canonical
`.work/items/*.md`, not the CLI's observed local operation files and lock; those
are narrowly ignored. Preserve reported recovery material and inspect diagnostics
rather than deleting it or staging the whole store indiscriminately.

The coordinator's integration checkout is the authoritative Work view. A linked
worktree can contain stale copies of the same item IDs; `item ready` is eligibility,
not a reservation. Only the coordinator dispatches work and changes authoritative
completion/relationships. Workers receive explicit item IDs, worktrees, file scope,
and base commits; they do not self-dispatch every locally ready item.

Maintain a dispatch ledger in the coordinator item body: item ID, worker identity,
verified harness/model/thinking, Herdr workspace/tab/pane IDs and labels, live agent
name, Pi session name, branch/worktree, assigned base SHA, latest candidate commit,
and current handoff/blocker. Record reviewer names, IDs and attempt numbers too.
This is project-owned narrative, not a native claim or lease. With the inspected
CLI, healthy body edits use precise file edits under the
Work file convention, followed by `work item diagnose`; `item repair` is not a
normal body-edit API. Preserve item headers and opaque IDs.

Close an implementation item only after its reviewed commits are integrated and
its required checks have passed on that integration. Then dependent work can start
from available code, rather than from an unmerged promise. Do not close the root
merely because worker processes appear idle or all package aggregates appear done.

## Project-local MCP access

The tracked `.pi/mcp.json` registers the installed `mara mcp` and `work mcp`
stdio servers for Pi 0.99.1. Both use `cwd: "."`, relative to the Pi session's
working directory, rather than a fixed checkout path. Worktrees inherit this
configuration through Git; start campaign sessions from their assigned worktree
roots and still select the intended project/worktree explicitly in tool calls.
The `mara` and `work` executables must be available on PATH; this configuration
does not install them or add requirements to published packages or generated
consumer workspaces.

Both use native `codemode` exposure, allowing structured calls without declaring
the entire tool catalog. `pi mcp list --json` verified both project servers connected
with no errors during setup. After reload, explicit-checkout MCP calls completed
Mara project validation and Work inspection/diagnostics; connection alone was not
treated as domain-operation evidence.
Project trust is required. Run `/reload` or start a new Pi session after changes,
and use the MCP tools when available, retaining the skills' CLI fallback otherwise.
Do not change global MCP settings or hardcode the coordinator checkout into this
shared file.

## Foundation and ownership

Read `AGENTS.md`, the Work/Mara skills, and applicable Nx/generator guidance before
work. Use the local `nx-pi` generators, inspect help and dry-runs, and resolve target
configuration with `pnpm nx show project ... --json`. Scaffolding is not behavior.
Move staged package knowledge with Mara in the same increment as successful
scaffolding, preserving IDs/MIDs and repairing links.

Serialize generator/dependency/root-configuration edits through the coordinator.
It owns root manifests/catalogs/lockfile, release configuration, shared public
exports, and cross-package integration. Delegate scoped edits explicitly rather
than having five branches independently change the same infrastructure. Internal
workspace dependencies use `workspace:` and external versions use the catalog.

Jobs adapter, owner/observer, storage, and receipt interfaces need a small reviewed
checkpoint before their dependent implementation slices. Do not make goal,
caffeinate, or gate inspection wait for a complete jobs implementation: they use
the existing generic gates contract, not jobs-core or producer-specific inspection.
The Herdr transport/layout work is also independent of a completed local runner.

Work in red-green-refactor increments. Each handoff identifies implemented scope,
remaining scope, commits, checks actually executed, and limitations. Fakes do not
prove real Pi, native inhibition, Herdr, or end-to-end consumer behavior.

## Worker-owned Pi review loop

Each worker runs the
[local Pi review loop](../.pi/skills/pi-review-loop/SKILL.md) for each independently
integrated increment after scoped implementation, checks, Mara updates, self-review,
and a green candidate commit. That skill owns launch, evidence validation, fresh
iterations, and cleanup; [triage-findings](../.pi/skills/triage-findings/SKILL.md)
owns finding dispositions and the single backlog policy. Reviewers report only;
workers fix and verify required defects. Reviewers must not invoke the loop.

The coordinator assigns and records the local review base before dispatch. Resolve
that supplied logical base immediately before each iteration and pass its full SHA
to the launcher; record both supplied SHA and actual merge base. An assigned
immutable SHA stays fixed unless the coordinator explains a prerequisite-driven
baseline change. Do not guess a base, substitute `origin/main`, or advance it to
hide findings. Normal advancement of an assigned logical ref is not itself a
reason to restart or rebase.

Capture relevant accepted backlog context outside the checkout before each review
as the triage skill directs. Freeze checkout and backlog during review. Run the
launcher directly unless the user requests Herdr execution; then use a dedicated
named tab/pane in the assigned checkout, preserve focus, and capture its IDs.
Keep one review attempt active at a time, verify it has stopped before retrying,
and preserve evidence before closing only worker-owned review resources.

Triage every completed review. Fix, check, and commit required findings, then run
a fresh independent review. Stop when no required fix or clarification remains,
every finding has a supported disposition, authorized backlog recording succeeds,
and applicable verification passes. Do not rerun solely to eliminate supported
backlog or dismissed findings. Unavailable, failed, or inconclusive reviews remain
blocked; no arbitrary iteration cap or working happy path waives acceptance.

Handoff the actual reviewed HEAD, dirty state, logical base, supplied/actual
baseline SHAs, iterations, dispositions, checks, and evidence paths. Distinguish
**clean review** from **accepted after triage** under the skills' rules; preserve
raw verdicts and identify backlog references and dismissal reasons. Neither
status authorizes integration or closure. Changed implementation or integration
inputs need their own checks and review; worker acceptance does not prove the
combined tree. Reviewers remain outside the five-worker ceiling.

## Inspected launch syntax and preflight boundary

For Pi 0.99.1 and Herdr 0.9.1, set these variables from the actual assignment and
creation responses. `PI_MODEL` is `openai-codex/gpt-6-astra` for the coordinator or
`openai-codex/gpt-6.1-sol` for a worker; the pane must already have the assigned
worktree as cwd. These are launch templates, not commands to run during planning:

```sh
herdr tab rename "$TAB_ID" "$DISPLAY_LABEL"
herdr pane rename "$PANE_ID" "$DISPLAY_LABEL"
herdr agent start "$AGENT_NAME" --kind pi --pane "$PANE_ID" -- \
  --model "$PI_MODEL" --thinking high --name "$DISPLAY_LABEL"
```

For local review launch and preflight, follow
[pi-review-loop](../.pi/skills/pi-review-loop/SKILL.md) rather than maintaining a
second command template here. It requires a fresh Pi process using
`openai/gpt-6.1-sol`, `xhigh`, fast mode, and its explicit reviewer instructions.
Codex CLI authentication/configuration is no longer a review prerequisite.

Earlier baseline reconciliation inspected Pi 0.99.1 and the compatible Herdr 0.9.1
server without launching agents. Those historical checks do not establish current
reviewer availability, effective settings, or a successful model request. Recheck
actual prerequisites and resource names at launch; unavailable verification is a
blocker, not permission to substitute a model or claim a completed review.

## Integration and completion

The coordinator verifies provenance and scope, integrates candidates, runs relevant
checks, and closes the corresponding Work increments. It may split or add items
for newly discovered work while preserving dependencies and accepted requirements.

Before closing the root, perform combined real Pi lifecycle/consumer checks,
isolated real Herdr checks, actual supported Linux inhibition checks, source Pi
checks, explicit fresh builds/packs and tarball checks, and independent npm/pnpm
consumer checks as applicable. Run the local Pi review loop on the combined
integration against the campaign's recorded starting SHA, with the same evidence
and triage rules. Resolve required cross-package findings and record supported
deferrals/dismissals rather than assuming separately reviewed packages compose
correctly.

Validate Mara completely, diagnose Work, inspect final diffs, and report commits,
reviewed baselines, executed checks, artifacts, and remaining limitations. Unavailable
required verification leaves work open/blocked; it is not a successful completion.
Keep acceptance, implementation, observed verification, and publication distinct.

Herdr test mutations belong in isolated sessions. Never stop/update the live user
server or infer permission to mutate unrelated panes/worktrees. Explicit product
resource operations have no invented approval policy under
[[REQ-HERDR-NO-APPROVAL-LAYER]]; development agents still obey their harness/tool
instructions. Final integration remains on its dedicated branch for user review.
