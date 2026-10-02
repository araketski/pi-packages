# @araketski/pi-session-activity

A standalone Pi extension that publishes short current-work phrases through
`@araketski/pi-statusline-protocol` under key `activity` in main Pi TUI sessions.
When Herdr caller context is available, it also publishes the same phrase as
Herdr's standard `$activity` token. It leaves session names, terminal titles and
lifecycle status alone. No particular renderer is required.

Try the source package from this workspace:

```sh
pi -e ./packages/session-activity
```

This package is implemented but not yet published to npm. The optional
`session-activity.json` uses Pi's configured agent directory. See the canonical
[configuration, contract and observed verification](docs/contract.mara.md)
(repository-only documentation, intentionally excluded from the tarball).
