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
