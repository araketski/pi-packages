---
name: codex-review-loop
description: Run Codex review against a supplied base branch, fix findings, and repeat until no findings remain. Use when a worker is asked to review and fix its changes before handoff.
---

# Codex review loop

Required input: the base branch/ref to review against. Never guess it; ask if it was not supplied.

Pi invocation:

```text
/skill:codex-review-loop <base-branch>
```

## Loop

1. In the worker's checkout, set `BASE_BRANCH` to the supplied base branch/ref.
2. Run:

   ```sh
   codex review -c 'model="gpt-6.1-sol"' -c 'review_model="gpt-6.1-sol"' -c 'model_reasoning_effort="xhigh"' --base "$BASE_BRANCH"
   ```

3. Read the completed review. Fix every finding and run the relevant checks, following the repository's commit rules.
4. Run the same review again with the same base and settings. Repeat fixes and reviews until a completed review explicitly reports **no findings**. Do not stop after making fixes without reviewing them again.
5. Report the base, fixes, checks actually run, and final clean review result.

A failed, interrupted, or unavailable review is not a clean review. If a finding cannot be resolved, report the blocker rather than claiming completion.
