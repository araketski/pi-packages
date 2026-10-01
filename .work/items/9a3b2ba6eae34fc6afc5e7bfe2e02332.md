---
format_version: 1
id: "9a3b2ba6eae34fc6afc5e7bfe2e02332"
title: "Implement session-activity reporter and replaceable Herdr RPC publisher"
completion: manual
state: done
priority: 2
close_reason: "Implemented accepted activity contract and replaceable direct Herdr RPC publisher. Uncached Nx test/lint/typecheck/source pi-check passed: 59 tests across seven files, including native Pi 0.99.1 source and independently installed fresh-tarball runs, explicit tarball pi-check-package, and isolated actual Herdr 0.9.1/protocol-22 publication/null-clear/preservation/stale-sequence checks. Config/digest/phrase/cadence/coalescing/reset/deadline/failure tests are green; an unpaired-surrogate regression was observed red before its fix. Workspace sync and frozen pnpm install passed. Complete Mara schema/project validation passed with zero errors/warnings; canonical package contract records constants, observations and limitations. No paid provider requests, live-user-pane mutations, managed integration changes, npm publication or persistent installation."
---
Implement accepted REQ-SESSION-ACTIVITY-* and DES-SESSION-ACTIVITY-PUBLISHER under packages/session-activity. Red-green tests for config/digest/phrase/model/cadence/reset/coalescing and bounded activity-only RPC; native Pi 0.99.1 TUI lifecycle plus source and packed consumer loading; isolated actual Herdr publication/clear checks. Update package canonical knowledge with engineering constants and observed verification. Preserve unrelated user changes; no global installation or active-pane metadata mutations.