---
format_version: 1
id: '89bd325c4ba843edafcb3dab351fc9ef'
title: 'Implement multi-session generic gate and Pi activity observation'
completion: manual
state: open
priority: 2
parent: 'deda392fbc0d4e51a69ed0b41152957b'
depends_on: ['ef446e1edf2f42a489c474708fce76dc']
labels: ['role:worker', 'package:caffeinate']
model: 'gpt-6.1-sol'
thinking: 'high'
---

## Scope

Connect actual Pi activity/messages and all tracked session gate views to inhibition policy through a fake driver, without any jobs API dependency.

## Canonical contracts

- ADR-WORKFLOW-MINIMAL-PROFILE
- REQ-CAFFEINATE-AUTO-HOLD
- REQ-CAFFEINATE-MANUAL-CONTROLS
- REQ-WORKFLOW-PRODUCER-INDEPENDENCE
- VER-CAFFEINATE-GATES-AND-CONTROLS

## Observable acceptance

Test session A pending while B is current/idle, switching/reload without forgetting holds, multiple independent reasons, unknown versus confirmed-empty owners, explicit overrides/rearming and final owner clearance. Include active classifier work inside and outside assistant turns under REQ-CAFFEINATE-AUTO-HOLD, through public activity or generic gates and with equivalent independent-producer fixtures. No historical-session scan, producer inspection, gate mutation, delivery or turn scheduling. If a generic protocol seam needs repair, coordinate it centrally and keep job-specific state outside the consumer.
