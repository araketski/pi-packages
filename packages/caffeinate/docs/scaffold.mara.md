# Caffeinate scaffold boundary

## Implemented and intended

Work `a58eefcc858a488b8aaf479919c597eb` generates only the Pi resource package
and typed no-op extension using the local nx-pi package/extension generators,
after source/help inspection and dry runs. Initial version is `0.1.0`, not a
release or a change to jobs compatibility markers. The generated factory keeps
its honest implementation TODO and does not access the Pi API.

The [contract](./contract.mara.md) and [jobs integration](./jobs-integration.mara.md)
retain accepted intended runtime behavior. No settings location/schema is selected
here. No controls, gate observation, holding, backend, sleep/display/process
management, Goal/Herdr integration, tools, hooks, UI, startup flags or skill are
implemented. [[ADR-WORKFLOW-MINIMAL-PROFILE]] applies to future runtime work;
this scaffold does not verify Linux inhibition or any future runtime method.

## Distribution

Pi loads `extensions/caffeinate/index.ts` as original TypeScript. The only npm
export is `./package.json`; there is no compiled library API or resource build.
The explicit publication allowlist selects the extension directory, README and
MIT license. Repository-only Mara docs, tests and tooling are excluded.
Pi is a host peer through existing `catalog:pi-host` (`*`); development uses the
unchanged Pi 0.99.1 catalog. No runtime or internal workspace dependency is needed.
No reference-branch source/dependencies/architecture were copied. The license
text follows existing repository package material. Applicable license/NOTICE
provenance and release review remain author-owned; technical checks do not
approve legal compliance, publication or use of the unfinished scaffold.

## Canonical knowledge relocation

The 11 staged items move into these two documents through Mara item moves,
with IDs, MIDs, fields, bodies and relations preserved. Supporting narrative and
relative/incoming links move with them; obsolete staging copies are removed
only after complete validation. Workspace-wide knowledge stays in root `docs/`.

## Repeatable scaffold checks

Package-owned Nx tests check an untouched Pi API and actual package-source
loading, binding and reload through Pi 0.99.1 in isolated agent/session fixtures.
Fresh pnpm archives pass an explicit `pi-check-package --tarball` and install
independently through npm and pnpm. Tests check exact members, resolved metadata
exports, installed source bytes, package provenance, empty registrations,
no gate/inhibitor/backend/network activity and no attributable session-history
changes. These are no-op scaffold observations, not runtime conformance.

Strict typecheck, lint, source pi-check, frozen installation, formatting, Nx sync,
complete Mara schema/project validation, empty Work diagnostics and independent
review are separate gates. Actual revisions, archive hashes, commands, consumer
receipts and review results belong to the Work item and retained evidence.
