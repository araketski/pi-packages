# Planned jobs core: package boundary and compatibility

This records the agreed package split and compatibility promise. It is not an
implemented library, a complete wire/API specification, or evidence of runtime
verification. The initial consumers are developed in this repository and released
together. Keep this staged knowledge here until the jobs-core project is scaffolded.

## Concrete consumers

- `@araketski/pi-jobs`: Pi extension providing the replacement bash tool, local
  execution, and unified job tools/UI. Every command can use the local execution
  path without a command-name whitelist. A command that outlasts its foreground
  wait budget can continue as the same background job and deliver its eventual
  result; backgrounding is not a hard timeout, restart, or move into Herdr.
- `@araketski/pi-herdr`: full Herdr integration for worktrees, workspace/tab/pane
  management, and explicitly visible or interactive command/agent execution.
  Visible execution need not block the model's tool call. Herdr can use the core
  without requiring the jobs UI extension to be enabled. See the
  [Herdr scope](../herdr/scope.mara.md).
- `@araketski/pi-jobs-core`: shared library for lifecycle/tracking, reconciliation
  policy, waiting, output/result bookkeeping, completion delivery, and integration
  with [gates](../../../packages/gates-protocol/docs/contract.mara.md). Local and
  Herdr adapters supply backend execution and ownership/liveness evidence.

The core also exports the explicit owner/observer contract needed for the unified
jobs view. It must not depend on independently installed extensions resolving one
shared library singleton. This is coordination inside a Pi runtime, not an
agent-to-agent messaging service. No fourth `pi-jobs-protocol` package is required.

## Compatibility boundary

Two distinct versions have different purposes:

- **Package release:** repository consumers follow the
  [fixed-version release policy](../../release.mara.md). The end-to-end integration
  guarantee covers our extensions released together, not every third-party or
  mixed-release combination.
- **Jobs contract version:** a hardcoded release stamp supplied and reported by
  the imported core implementation. Its value is the first core package release
  shipping that contract revision. It changes for incompatible public-contract
  changes, not automatically with ordinary package releases; extensions do not
  manually report their own versions as the protocol compatibility marker.

External extensions can import the core and speak the same contract language.
Different package releases with the same contract version do not cause a mismatch
warning. Different contract versions do cause a warning. A matching contract
version is not itself proof of a tested end-to-end integration.

Cross-release compatibility remains best-effort. No automatic downgrade,
negotiation framework, or compatibility shim is required. This does not expand the
separately specified [Pi runtime support policy](../../pi-compatibility.mara.md).

### Release-stamped revision example

If the first shipping release is `0.4.0`, and the first incompatible change ships
in `0.4.12`, the markers are:

| Core package release | Jobs contract version |
| --- | --- |
| `0.4.0` through compatible `0.4.11` | `0.4.0` |
| `0.4.12` with the incompatible change | `0.4.12` |
| Later releases compatible with that revision | Still `0.4.12` |

This is an illustrative sequence, not a claim those releases exist. Compare
markers by exact equality, never a version range or newer-than test. Even a small
incompatible change requires a new stamp; safely ignorable optional additions do
not. Ordinary Nx package-version bumps leave the contract stamp unchanged.

## Still to specify

The [lifecycle policy](./lifecycle.mara.md) records the agreed foreground budget,
cancellation boundary, session continuity, normal-exit/best-effort crash cleanup,
and awaited-work default. The [delivery policy](./delivery.mara.md) defines modes,
receipts/retries, and separate goal/sleep-inhibition decisions. Exact APIs and wire
envelopes, storage mechanisms and upgrade handling, warning presentation, and
lifecycle event/race mechanisms still need designs and tests before implementation.
Persistent interactive agents remain executions rather than inferred delegated
tasks; agent messaging and parent-child orchestration are not prerequisites.

## Agreed knowledge

:::mara design DES-JOBS-PACKAGE-BOUNDARY
:mid: 01M3PJNZS0XR3EMHKSHP2WJRGD
:title: Share job behavior between local bash and Herdr extensions
:status: accepted
:kind: structure
:satisfies: REQ-HERDR-JOBS-MODULE

Use three packages: pi-jobs owns the replacement bash tool, local execution adapter, and unified job tools/UI; pi-herdr owns Herdr execution and full workspace, worktree, tab, and pane integration; pi-jobs-core supplies reusable job policy and an explicit owner/observer contract. Keep backend execution and ownership/liveness evidence in adapters, and lifecycle, reconciliation policy, waiting, output/result bookkeeping, completion delivery, and gate integration in the core. The observer UI does not independently redeliver owner results or take ownership of observed work. Independently loaded copies of the core must communicate through the explicit contract rather than an assumed package singleton. Herdr job tracking must not require pi-jobs UI registration. No separate jobs-protocol package or agent messaging system is required.
:::

:::mara requirement REQ-JOBS-RELEASE-COMPAT
:mid: 01M3PJP2R4JXXY9D0YD52WY0XK
:title: Limit integration guarantees to same-release repository packages
:status: accepted
:kind: constraint
:derives_from: REQ-RELEASE-FIXED-GROUP

The guaranteed integration configuration consists of repository-owned jobs consumers and pi-jobs-core from the same coordinated release, with relevant integration checks and the separately selected supported Pi runtime. External extensions may import the core and participate in its contract without sharing this repository or its package version numbers. Contract-version equality identifies the same protocol language; it is not a guarantee of every mixed-release or third-party integration. Preserve compatibility where practical, but do not promise a backward/forward integration matrix for different releases. Release-version differences alone are not protocol mismatch evidence and must not cause contract-mismatch warnings.
:::

:::mara requirement REQ-JOBS-VERSION-DIAGNOSTICS
:mid: 01M3PJP5PVWVM95MXCAKB41JN6
:title: Report library-owned contract versions and warn on incompatible revisions
:status: accepted
:kind: functional
:derives_from: REQ-JOBS-RELEASE-COMPAT

pi-jobs-core defines and reports a hardcoded jobs contract version through its imported owner/observer implementation. Extensions do not manually supply their package versions as the compatibility marker. The marker is the exact core package version of the first release shipping that contract revision: use 0.4.0 initially if that is the first shipping release. For any incompatible public-contract change, stamp the release introducing it; never ship an incompatible change under an existing marker. Incompatibility includes newly required data or capabilities and changed lifecycle semantics, not only large redesigns. Compatible changes, including optional additions older participants can safely ignore, retain the marker. Ordinary package/Nx release versioning must not automatically update it. Compare markers by exact equality, not semantic-version ranges or newer-than ordering.

Independently loaded copies, including those used by external extensions, can identify whether they speak the same contract language. Differing contract versions produce a warning identifying the observed revisions and relevant owners/observers, rather than silently remaining invisible to one another. Equal contract versions do not produce a mismatch warning merely because consumer or core package releases differ. Missing or unreadable contract versions are not a confirmed match. Mismatch reporting does not promise translation or negotiation; best-effort handling must still reject malformed or unrecognized data without fabricating completion, clearing waits, or overwriting valid state. Exact envelope and warning presentation remain to be specified.
:::

:::mara verification VER-JOBS-PARTICIPANT-COMPAT
:mid: 01M3PJP8HRMX62BGSJS8KT73QG
:title: Check library-owned contract compatibility independently of package versions
:status: accepted
:method: test
:level: integration
:verifies: DES-JOBS-PACKAGE-BOUNDARY
:verifies: REQ-JOBS-RELEASE-COMPAT
:verifies: REQ-JOBS-VERSION-DIAGNOSTICS

Use separately loaded core copies with local and Herdr owner fixtures and an independent observer. Confirm job visibility without a shared singleton, library-supplied contract metadata without consumer version declarations, and no duplicate result delivery from observer registration. Different consumer/core package releases with the same hardcoded contract version must not emit contract-mismatch warnings. Add an external-extension fixture importing the same contract without repository release metadata. Introduce a different hardcoded contract version, including through a late participant, and require a warning identifying the revisions rather than silent isolation. Missing version data is not classified as a confirmed match; malformed or unsupported records leave valid job/wait state intact.

Exercise an illustrative release sequence: core 0.4.0 and compatible releases through 0.4.11 report contract 0.4.0; a breaking change first shipped in 0.4.12 reports contract 0.4.12; subsequent compatible releases retain 0.4.12. Require exact marker equality: neither direction of a 0.4.0/0.4.12 comparison counts as a match. Check that adding required data/capabilities or changing lifecycle semantics requires a new release stamp, while safely ignorable optional additions retain it. A disposable ordinary package-version bump must leave the contract constant unchanged. Check that matching contract language is not advertised as broader end-to-end support beyond the same-release repository guarantee. These are future checks, not passing execution evidence.
:::

:::mara decision ADR-JOBS-SHARED-CORE
:mid: 01M3PJPBJDR06B7RVA5NS4435C
:title: Extract the jobs module for two concrete consumers with same-release support
:status: accepted
:justifies: DES-JOBS-PACKAGE-BOUNDARY
:justifies: REQ-JOBS-RELEASE-COMPAT

Local bash commands that continue in the background and explicitly visible Herdr executions now provide two concrete consumers of the same job machinery. Place that machinery and its in-runtime observation contract in pi-jobs-core instead of keeping it internal to Herdr. This supersedes the packaging choice in [[ADR-HERDR-INTERNAL-JOBS-MODULE]], while preserving separation of job policy from terminal operations and exclusion of agent messaging infrastructure. Initial repository consumers are maintained and released together, so the end-to-end support guarantee targets matching releases. Separately, the core reports a hardcoded contract revision, bumped for incompatible changes, so third-party extensions can speak the same language without matching our package versions. Warn on contract-version mismatches, not merely release differences; preserve mixed-release compatibility where practical without promising a support matrix.
:::
