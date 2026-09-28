# Release workflow notes

## Deferred retry safeguard

A future release workflow may compare a prepared package tarball's digest with the
registry tarball when the same package version already exists. Matching bytes
would allow a partial publication to resume; different bytes would stop the
retry. Mara uses this safeguard, but Nx Release's default publish executor does
not provide the same digest comparison when it skips an existing version.

This is a **nice-to-have, deferred** option, not a requirement for the next
release or a claim that it is implemented. Decide whether it is worth adding
when specifying retry behavior for this workspace's Nx Release workflow. No
public-release workflow is implemented in this repository yet.

:::mara goal GOAL-RELEASE-COORDINATION
:mid: 01M3MJ4TD2MNJZCPA8DTRVNC43
:title: Deliver repository packages as one coordinated release
:status: accepted

Repository maintainers can prepare, verify and publish the workspace packages at one shared version, including newly added packages, without manually maintaining a separate release list for each new package.
:::

:::mara requirement REQ-RELEASE-FIXED-GROUP
:mid: 01M3MJ17YWKV9ESAR14EYDBY7X
:title: Version repository packages together with Nx Release
:status: accepted
:kind: constraint
:contributes_to: GOAL-RELEASE-COORDINATION

Every publishable workspace project under `packages/` participates in one Nx Release fixed-version group, including newly added Pi packages without a per-package release-configuration edit. The private workspace root and repository-only tooling are outside that group. A release chooses its exact version at preparation time; the shared version and `v{version}` Git tag pattern are stable policy, not a version number fixed in this contract. Configuring selection must not itself create a tag, change package versions, or publish.
:::

:::mara verification VER-RELEASE-FIXED-GROUP
:mid: 01M3MJ1AMX5650615SJK28S61D
:title: Inspect resolved release selection and dry-run versioning
:status: accepted
:method: test
:level: integration
:verifies: REQ-RELEASE-FIXED-GROUP

In the current workspace, inspect resolved Nx Release configuration through the installed CLI and require all publishable projects under `packages/` in a single fixed group with the `v{version}` tag pattern, excluding the root. Run Nx Release version with a disposable exact version and `--dry-run` and confirm every selected package is included, no package is omitted, and authored manifests, lockfiles, Git tags and workspace files remain unchanged. When adding another package, verify its inclusion without editing the release selection; a failed or unavailable dry run is not a pass.
:::
