---
format_version: 1
id: '7b1cafa242e44607bbca8d0bfa40f3ed'
title: 'Coordinate three parallel native Pi compatibility repairs'
completion: manual
state: open
priority: 2
labels: ['repair', 'role:coordinator']
model: 'gpt-6-astra'
thinking: 'high'
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

The sole merge conflict was the statusline contract's implementation-state paragraph. Mara updates retained both completed slices, removed their mutually stale gap claims and preserved IDs/MIDs/relationships. Implementation/test files are unchanged from reviewed worker trees. Full combined review remains required.

Coordinator evidence directory: `/home/araketski/.cache/repair-integration-7b1cafa2/`. Initial fast-only check failed with TS2307 while its typecheck raced the fresh protocol declaration build; fast-checks.log retains this failure. A coordinator script failed to gate the first merge commit on that command's status. This was not a passing checkpoint: subsequent usage-fast-checks.log and combined-checks.log explicitly reran all four targets successfully after protocol build. The latter passed 51 statusline plus 45 fast-mode tests; the earlier one passed 33 plus 45. Protocol build ordering must be explicit for fresh checkouts; no task-configuration fix or dependency change is claimed here. Complete Mara validation and scoped format/diff checks passed at the combined implementation checkpoint `fab471dae79b5ce2a7ff07a235213ca60f099e3e`.

Combined review, fresh final archives and additional npm/pnpm consumer checks are pending. Repair items remain open until final integration checks and review are complete. The workflow campaign remains paused; no final merge into rework, publication or resource cleanup is authorized by this checkpoint.
