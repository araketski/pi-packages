# @araketski/pi-session-activity

A standalone Pi extension that publishes short current-work phrases as Herdr's
standard `$activity` token using a replaceable direct-RPC adapter. It leaves
session names, terminal titles and lifecycle status alone. No particular renderer
or additional runtime helper package is required.

Try the source package from this workspace inside Herdr:

```sh
pi -e ./packages/session-activity
```

This package is implemented but not yet published to npm. The optional
`session-activity.json` uses Pi's configured agent directory. See the canonical
[configuration, contract and observed verification](docs/contract.mara.md)
(repository-only documentation, intentionally excluded from the tarball).
