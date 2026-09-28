# Release workflow notes

## Preparing and approving a release

Use a release-labelled PR targeting `main`. [Regular CI](./testing.mara.md)
checks that PR and main pushes; the separate release workflow starts only for a
merged changelog change. Choose the version for that PR; do not encode a
permanent next-version value here. In a clean branch, preview Nx's
version and root changelog without publication, then generate both for the PR:

```sh
pnpm nx release <chosen-version> --dry-run --skip-publish
pnpm nx release version <chosen-version> --no-stage-changes --no-git-commit --no-git-tag
pnpm nx release changelog <chosen-version> --no-stage-changes --no-git-commit --no-git-tag
pnpm install
```

Review the resulting manifests, lockfile and `CHANGELOG.md`, including the
previous `v*` tag used as the changelog boundary. Run the workspace checks and
Mara validation, and review the package archives and required license and
attribution material. Commit those release artifacts in the PR. **Neither the
PR label nor GitHub's environment protection is created or enforced by Nx.**
The release label is a review convention, not an automated workflow gate.

Before merging a release PR, a repository administrator must configure the
GitHub `release` environment with required reviewers (and access limited to
`main`) and register `.github/workflows/release.yml` as an npm trusted
publisher for _each_ package under `packages/`. Without protected reviewers,
GitHub may create the environment automatically without an approval gate. Do
not merge a release PR until these external protections have been checked.

A merged push to `main` that changes the root changelog runs the workflow at
the captured SHA. Its verification jobs do not publish: they check shared
identity, frozen install, source tests, packed resources, and the latest npm Pi
version used by integration tests. The job behind the protected environment
rechecks the same commit and latest Pi version, creates or verifies the one
Git tag, then uses `pnpm nx release publish` via Nx's inferred publish targets
with npm OIDC. It waits for all selected packages to appear on npm, installs
them in a fresh external directory, and only then publishes the draft GitHub
release. The versioned package files are rebuilt from the verified commit
after approval; this workflow does not prove byte-for-byte equivalence with
the earlier packed previews. Pi compatibility claims, license obligations,
and npm trusted-publisher settings still require author review. Local dry runs
do not prove protected-environment behavior or public publication.

## Deferred retry safeguard

A future release workflow may compare a prepared package tarball's digest with the
registry tarball when the same package version already exists. Matching bytes
would allow a partial publication to resume; different bytes would stop the
retry. Mara uses this safeguard, but Nx Release's default publish executor does
not provide the same digest comparison when it skips an existing version.

This is a **nice-to-have, deferred** option, not a requirement for the next
release or a claim that it is implemented. Decide whether it is worth adding
when specifying retry behavior for this workspace's Nx Release workflow. The
configured workflow does not perform this digest comparison.

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

:::mara requirement REQ-RELEASE-IDENTITY
:mid: 01M3MJH8GX81JS9N0NG2VC2V3J
:title: Reject inconsistent release candidates before approval
:status: accepted
:kind: constraint
:contributes_to: GOAL-RELEASE-COORDINATION

Before a merged release candidate can reach protected publication, check out the captured main-branch commit and require that every publishable project under `packages/` has the same valid version, the Nx-generated root changelog has an entry for that version, and an existing `v{version}` tag (if any) points to that exact commit. Reject a missing or inconsistent identity without creating or moving a tag, modifying artifacts, or publishing. A release-labelled preparation PR is merged only after review; a changelog change on main starts candidate verification, not public publication.
:::

:::mara verification VER-RELEASE-IDENTITY
:mid: 01M3MJHBBWY8K8J0SZQ85V10SV
:title: Test candidate identity checks with disposable Git fixtures
:status: accepted
:method: test
:level: integration
:verifies: REQ-RELEASE-IDENTITY

Exercise a matching multi-package commit and changelog, plus mismatched package versions, missing changelog heading, wrong captured commit, and an existing tag pointing to another commit. Observe rejection before any public operation or mutation. Recheck against the merged commit in the workflow before and after approval.
:::

:::mara requirement REQ-RELEASE-PROTECTED-PUBLICATION
:mid: 01M3MJVQH609Y7CSW92K1NE337
:title: Gate Nx publication behind verified merged release commit and approval
:status: accepted
:kind: constraint
:contributes_to: GOAL-RELEASE-COORDINATION

A release-labelled preparation PR carries Nx-generated shared versions and root changelog. After it is merged into main, a changelog-changing push verifies the captured commit, current sources and packed packages without public side effects. Only after those checks and approval through a protected release environment may Nx publish the selected packages to npm, create a single v{version} tag on the verified commit, and confirm installability from the public registry. Recheck the commit after approval; a failed check must not proceed to publication. Keep public credentials out of verification jobs. Registry digest equivalence on retries remains deferred; never assert it has been verified.
:::

:::mara verification VER-RELEASE-PROTECTED-PUBLICATION
:mid: 01M3MJVT9QQ0EKZEKFG800WTGV
:title: Inspect release workflow gating and exercise non-publishing Nx path
:status: accepted
:method: test
:level: integration
:verifies: REQ-RELEASE-PROTECTED-PUBLICATION

Assert that the release workflow only starts for a main push changing the root changelog, verifies the captured SHA before publication, includes source and packed checks, and declares an approved release environment before any tag push or Nx publish. Preview Nx publication for the resolved group with --dry-run and confirm no registry write or new tag. Remote GitHub environment approval, OIDC authentication, and actual public installation are not proven by a local dry run.
:::
