---
format_version: 1
id: "89bd325c4ba843edafcb3dab351fc9ef"
title: "Implement multi-session generic gate and Pi activity observation"
completion: manual
state: open
priority: 2
parent: "deda392fbc0d4e51a69ed0b41152957b"
depends_on: ["ef446e1edf2f42a489c474708fce76dc"]
labels: ["role:worker", "package:caffeinate"]
model: "gpt-6-sol"
thinking: "high"
---
## Scope
Connect actual Pi activity/messages and all tracked session gate views to inhibition policy through a fake driver, without any jobs API dependency.

## Canonical contracts
- REQ-CAFFEINATE-AUTO-HOLD
- REQ-CAFFEINATE-MANUAL-CONTROLS
- REQ-WORKFLOW-PRODUCER-INDEPENDENCE
- VER-CAFFEINATE-GATES-AND-CONTROLS

## Observable acceptance
Test session A pending while B is current/idle, switching/reload without forgetting holds, multiple independent reasons, unknown versus confirmed-empty owners, explicit overrides/rearming and final owner clearance. No historical-session scan, producer inspection, gate mutation, delivery or turn scheduling. If a generic protocol seam needs repair, coordinate it centrally and keep job-specific state outside the consumer.

## Execution and handoff
Read AGENTS.md and docs/parallel-implementation.mara.md. Resolve the listed Mara IDs in this checkout; IDs remain stable after documentation relocation. Use red-green-refactor for behavior and appropriate validation for non-executable changes. Define/update the slice design before implementation where the accepted contract delegates mechanisms. Do not claim a whole multi-package verification from partial fixtures.

Run applicable resolved Nx checks and source pi-check after eligible package changes; validate affected Mara completely and inspect the diff. Follow the worker-owned Codex gpt-6-sol/x-high fresh-tab review/fix/review loop against the coordinator-assigned immutable integration base. Handoff green commits, reviewed base/HEAD, clean-review evidence, executed checks and limitations. Only the coordinator integrates and closes this item. Root configuration/shared public contract changes need explicit coordinator ownership or delegation.
