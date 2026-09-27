# Workspace layout

Use `packages/` for publishable packages, including Pi resource packages, shared
runtime libraries, and the public Nx plugin. Use `tools/` for private
repository-only utilities when needed; do not create placeholder utilities.

Directory placement does not determine package kind, Pi discovery, or compilation.
A publishable Nx plugin belongs under `packages/` even though its purpose is tooling.
This is this repository's organizational convention, not an Nx requirement.

The approved plugin identity and destination are defined in
[[DES-NXPI-IMPLEMENTATION-BASELINE]]. Planned project documentation remains under
`docs/planned/<project>/` until successful scaffolding, then moves into the
project's `docs/` in the same change, preserving Mara identities and links.
