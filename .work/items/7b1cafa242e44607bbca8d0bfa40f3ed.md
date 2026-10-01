---
format_version: 1
id: '7b1cafa242e44607bbca8d0bfa40f3ed'
title: 'Coordinate three parallel native Pi compatibility repairs'
completion: manual
state: done
priority: 2
labels: ['repair', 'role:coordinator']
model: 'gpt-6-astra'
thinking: 'high'
close_reason: 'Three repairs integrated and verified on repair/native-pi-integration; combined Sol 6.1 xhigh review clean, 109 tests and fresh npm/pnpm checks passed. Retain limitations and separate w-4021e096; awaiting user approval for rework merge.'
---

## Scope and authority

Coordinate the user-authorized parallel repairs for statusline usage, statusline observed-model display, and conservative fast-mode eligibility. Canonical behavior lives in the package Mara contracts and docs/pi-0991-reconciliation.mara.md; do not copy product specifications into this ledger. Workflow-package campaign remains paused.

Create a dedicated repair integration branch/worktree and three isolated worker worktrees through Herdr, grouped beneath the discovered primary repository workspace with explicit immutable base SHAs. Preserve focus and name all created workspaces/tabs/panes/Pi sessions/agents/reviews. Use Pi Sol 6.1 high workers and worker-owned Codex Sol 6.1 xhigh fresh-tab iterative reviews, following docs/parallel-implementation.mara.md. The current coordinator performs coordination; do not launch a fourth implementation worker.

After bootstrap, the repair integration checkout is authoritative for these four repair Work items. Existing campaign items are not dispatched or closed. Only this coordinator integrates and closes reviewed repair items. Integrate verified candidates, rerun affected checks and fresh combined review after conflicts or behavioral interactions. Preserve unrelated work, dependencies and release history. Keep final integration on its dedicated branch for user review; do not publish/tag or merge the final integration into rework without approval.

## Dispatch ledger

Preparation begins from rework commit 01282e3a91c101a7105c37699db0b3564e853fa4. The user paused before any repair resource creation, then explicitly resumed. Preflight after resume observes installed Pi CLI 0.99.2, Codex CLI 0.159.3, and compatible Herdr 0.9.1; repository SDK dependencies remain 0.99.1 and are not upgraded by these repairs. Use the repair label prefix to distinguish this effort from the paused workflow campaign. Repair resources created from the primary repository workspace wB with preserved focus. Integration workspace wH, check tab wH:t1/pane wH:p1, branch `repair/native-pi-integration`, checkout `/home/araketski/Work/github.com/araketski/pi-packages--repair-integration`. This checkout is now authoritative for repair Work tracking. The coordinator remains in the existing user conversation (wC:p1); no fourth worker was launched.

Assigned immutable implementation/review base for all three workers: `4a8cc2fb42b3748494d73cda0c64adcdd95e185d`. This is also the repair integration starting SHA. All three assignment prompts were submitted once after verifying the worker harness/model/high thinking. Subsequent Herdr reads show all three working, with actual assistant/tool activity and native footers still showing openai-codex gpt-6.1-sol/high. This establishes launch and initial work, not completed repairs or successful reviews. No prompt was blindly retried.

| Repair | Work item  | Branch                | Workspace / tab / pane | Pi agent                 |
| ------ | ---------- | --------------------- | ---------------------- | ------------------------ |
| usage  | w-e0cb2715 | repair/usage-e0cb2715 | wJ / wJ:t1 / wJ:p1     | repair-pi-usage-e0cb2715 |
| model  | w-d64cbf4d | repair/model-d64cbf4d | wK / wK:t1 / wK:p1     | repair-pi-model-d64cbf4d |
| fast   | w-c96f1b68 | repair/fast-c96f1b68  | wM / wM:t1 / wM:p1     | repair-pi-fast-c96f1b68  |

- usage: checkout `/home/araketski/Work/github.com/araketski/pi-packages--repair-usage`; Pi session `repair / usage / impl / w-e0cb2715`; session record `/home/araketski/.pi/agent/sessions/--home-araketski-Work-github.com-araketski-pi-packages--repair-usage--/2026-10-01T03-48-03-926Z_01a0f593-90d6-75ae-8ba9-5e3b25ea0f84.jsonl`. Herdr reports kind pi/ready; native footer shows openai-codex gpt-6.1-sol/high.
- model: checkout `/home/araketski/Work/github.com/araketski/pi-packages--repair-model`; Pi session `repair / model / impl / w-d64cbf4d`; session record `/home/araketski/.pi/agent/sessions/--home-araketski-Work-github.com-araketski-pi-packages--repair-model--/2026-10-01T03-48-03-900Z_01a0f593-90bc-7586-b8e9-4b0f42cba27f.jsonl`. Herdr reports kind pi/ready; native footer shows openai-codex gpt-6.1-sol/high.
- fast: checkout `/home/araketski/Work/github.com/araketski/pi-packages--repair-fast`; Pi session `repair / fast / impl / w-c96f1b68`; session record `/home/araketski/.pi/agent/sessions/--home-araketski-Work-github.com-araketski-pi-packages--repair-fast--/2026-10-01T03-48-03-908Z_01a0f593-90c4-73cb-8704-c6b572b1ced9.jsonl`. Herdr reports kind pi/ready; native footer shows openai-codex gpt-6.1-sol/high.

At dispatch, reviewers were required to use Codex gpt-6.1-sol/xhigh with the fresh-tab review/fix/review loop; no candidate commits, repair check results, or review verdicts were then claimed. Coordinator preparation passed Mara project validation, Work diagnostics, scoped Nx formatting/diff checks, and a frozen-lockfile install in this integration checkout (repository SDK still 0.99.1, no dependency changes). Rework bootstrap commit is 4a8cc2fb42b3748494d73cda0c64adcdd95e185d. Workers were instructed to preserve complete review reports and return immutable base/HEAD, checks, verdicts, and limitations. Work does not provide claims/running states.

## Reviewed candidates and integration checkpoint

All three workers supplied committed, clean candidates and completed Codex review reports against immutable base `4a8cc2fb42b3748494d73cda0c64adcdd95e185d`. Coordinator verified current Git HEADs/scope, effective reviewer headers (Codex 0.159.3, gpt-6.1-sol, xhigh, read-only), saved actual exit status 0, explicit clean verdicts and final check-log summaries; idle status alone was not accepted.

- Usage: `eb994760150cc275171deae1a7a1162d1919e917` (commits 26bb903, eb99476), 33 worker tests. Review 1 found null accounting incorrectly treated as zero; regression/fix followed by clean review 2 (wJ:t3/wJ:p3; session 01a0f5a1-69af-7e20-894d-c62cbfccf153). Evidence: `/home/araketski/.cache/repair-usage-e0cb2715/`, including handoff.md, both full review logs/meta/status/verdicts and final-checks.log. Integrated by 6a0e9e5.
- Model: `4929ad0d033b4daa2cbd8c6b2ad127e54b35616f` (commits 30078a0, 4929ad0), 40 worker tests. Review 1 found in-flight selection attribution; regression/fix followed by clean review 2 (wK:t3/wK:p3; session 01a0f5a5-dd42-7b50-81e2-7fcbe6b463fb). Evidence: `/home/araketski/.cache/repair-model-d64cbf4d/`, including HANDOFF.md, both full review logs/meta/status/reports and checks-fix-final.log. Integrated by fab471d.
- Fast: `32950925eb307dbcb18ddd803bcab5a3f3084919`, 45 worker tests. Clean review 1 (wM:t2/wM:p2; session 01a0f5a0-fde7-7122-a656-98b54f7823f2). Evidence: `/home/araketski/.cache/repair-fast-c96f1b68/`, including handoff.md, full review-1.log/meta/exit/report and checks-final.log plus independent npm/pnpm replay logs. Integrated by b071676. No native fast-service mutation is claimed.

The sole merge conflict was the statusline contract's implementation-state paragraph. Mara updates retained both completed slices, removed their mutually stale gap claims and preserved IDs/MIDs/relationships. Implementation/test files are unchanged from reviewed worker trees. A fresh combined review was required and is recorded below.

Coordinator evidence directory: `/home/araketski/.cache/repair-integration-7b1cafa2/`. Initial fast-only check failed with TS2307 while its typecheck raced the fresh protocol declaration build; fast-checks.log retains this failure. A coordinator script failed to gate the first merge commit on that command's status. This was not a passing checkpoint: subsequent usage-fast-checks.log and combined-checks.log explicitly reran all four targets successfully after protocol build. The latter passed 51 statusline plus 45 fast-mode tests; the earlier one passed 33 plus 45. Protocol build ordering must be explicit for fresh checkouts; no task-configuration fix or dependency change is claimed here. Complete Mara validation and scoped format/diff checks passed at the combined implementation checkpoint `fab471dae79b5ce2a7ff07a235213ca60f099e3e`.

## Completed integration evidence

Combined implementation/reviewed HEAD: `7df7f6963c7ecddd9e9db645ae6f4413514b1fc2`. Immutable review base remains `4a8cc2fb42b3748494d73cda0c64adcdd95e185d`. Fresh review resource wH:t2/wH:p2, label `repair / integration / review 1 / w-7b1cafa2`, recognized reviewer `repair-cx-integ-7b1cafa2-r1`; Codex session `01a0f5c7-4359-71f0-8afa-905044a5a845`. Effective header confirms Codex 0.159.3, gpt-6.1-sol/xhigh/read-only; both model overrides supplied. Actual review and log capture exits were 0. Explicit completed verdict: “No actionable regressions were found. In-memory behavioral probes and diff checks passed; full Nx checks and Mara validation were blocked by the read-only environment.” No review fix was requested. Coordinator checks below independently satisfy verification, not the reviewer's unavailable Nx execution.

Evidence under `/home/araketski/.cache/repair-integration-7b1cafa2/`:

- `review-1.log` full 8003-line completed output, SHA256 `b0fcf3450a436ada358ae35eeb14f8c9d5dadd8d918322bfb37aafcfaad7670b`; `review-1.meta`, `review-1.status`, `review-1.sh` and `review-1-report.json` retain base/HEAD/command/settings/exit/verdict.
- `final-checks.log`: uncached test/typecheck/lint/pi-check for statusline, fast-mode and statusline-protocol, **51 + 45 + 13 = 109 tests**. `final-protocol-build.log` explicitly precedes the run. No whole-workspace or interactive QA claim.
- `frozen-install.log`: pnpm frozen install passed without dependency changes. `pack-*.json` and `archive-*.log`: all three fresh packages passed explicit-tarball pi-check-package. Extensions remain source-distributed; only protocol build was required.
- `npm-consumer-runtime.log` and `pnpm-consumer-runtime.log`: both fresh consumers loaded the two installed extensions together on SDK 0.99.1, consumed a loopback response, preserved enabled intent and left the same-ID in-flight API-mismatch request untouched. `combined-runtime.mjs` reuses the tracked fast runtime replay with multiple additional extension roots/loading assertions; SHA256 `763cbb4aed691e3cc678cb36a68c5c76b1b3aae10a3f0083f4c4fdebb2cff80c`. Consumer-only protocol overrides select its unpublished fresh artifact; repository infrastructure is unchanged.
- `final-schema_validate.json` and `final-project_validate.json`: valid, complete, no continuation or diagnostics. Work diagnostics and scoped Nx formatting/Git diff checks also pass. Mara identities/relationships and non-shared worker files were checked unchanged; the sole document conflict was reconciled through Mara.
- Fresh archive SHA256: statusline `249edd3243eea0f13330594b7cf97e08b951b843f56a8790903d1fe5fdba5056`; fast-mode `b190cb8d4c97e313778ca68af640cbbdab79bcb3e7207c08a20c735f36421653`; protocol `832aa64fb1149f8c7ed5061c68ed05fbbf583c8ce4900c8b8f532a117db18b7a`. Archives retained in `artifacts/`; `final-hashes.txt` records paths.

No implementation changes followed the combined reviewed HEAD; the final checkpoint changes only execution tracking and observed-verification narrative. All three repair increments are integrated and verified. The fresh fast-mode typecheck ordering issue remains a separate, undispatched Work follow-up `w-4021e096`, not a repaired capability. Other limitations remain those in package contracts: unsupported fast mutation, omitted/unavailable usage/route attribution, no live provider service or interactive terminal QA. Remaining workflow feasibility probes did not run in this integration.

At repair completion, integration stayed on `repair/native-pi-integration` pending approval. The user subsequently explicitly approved the merge: rework was fast-forwarded from `4a8cc2f` to `d31b0875f0b34b70f1c36c7216c92a5c522fc72e`, with a clean worktree. Post-merge checks again passed all 109 tests, typecheck/lint/source Pi checks, protocol build, frozen install, formatting, and complete Mara/Work validation. Logs: `/home/araketski/.cache/repair-rework-merge-d31b087/`. The user then authorized `w-4021e096`; its tracking/integration authority moved to rework, while this completed repair checkout remains historical. That follow-up is now reviewed and integrated as `c6023bb`; its own item records the cold-output regression and renewed 109-test verification. The workflow campaign remains paused; no publication/tags or unrelated-resource changes. Worker worktrees and the final review pane were retained pending separate cleanup authorization.

## Authorized resource retirement

On 2026-10-01 the user requested removal of the completed, merged Herdr worktrees before any workflow campaign restart. Verified all four checkout HEADs were ancestors of rework `844858d7319a2a97027ac67fa5baf6ae0f30ac9e`, with no tracked changes or untracked non-ignored files. Workers were idle and review panes had returned to shells. Removed the integration (wH), usage (wJ), model (wK), and reused fast/build-order (wM) worktrees through `herdr worktree remove --workspace ID`, without force. Git and Herdr now retain only this repository's primary checkout (wB) and rework (wC); unrelated workspaces were untouched. The removed workspaces' panes and live agents are gone.

Branch refs, saved Pi sessions, review reports, handoffs, and external verification archives remain available. Before removal, preserved all five ignored Work operation/recovery files from the integration checkout outside the removed directories and verified their SHA256 hashes. Cleanup manifest, before/after inventories, removal responses, and recovery copies: `/home/araketski/.cache/repair-worktree-cleanup-20261001T054946Z/`. The manifest records exact retired paths, branches, and commits. No package implementation changed; workflow campaign remains paused.
