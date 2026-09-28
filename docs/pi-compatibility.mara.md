:::mara goal GOAL-PI-RELEASE-COMPAT
:mid: 01M3M1DB5ZH71MYKWF2CA4B4F8
:title: Honest Pi version support for released integrations
:status: accepted

Consumers can identify which Pi version each release of a repository-owned Pi integration was built and checked against, without inferring support for untested Pi versions.
:::

:::mara requirement REQ-PI-RELEASE-COMPAT
:mid: 01M3M1DDAWF4W71E9ZMB3EFVB9
:title: Support only the latest verified Pi version at each integration release
:status: accepted
:kind: constraint
:contributes_to: GOAL-PI-RELEASE-COMPAT

For each release of a Pi resource package or Pi-facing shared library, select the then-current latest @earendil-works/pi-coding-agent version, run relevant integration checks against that version, and state support only for that selected version. A later Pi release does not retroactively extend support for an older package release; a new package release selects and verifies the latest version then available. Do not imply support for earlier or future Pi versions without separate verification. This policy does not impose a Pi runtime dependency on a shared library that does not import Pi, nor does it govern the standalone nx-pi development plugin. Dependency declaration and peer-range details must be decided for packages that actually import Pi.
:::

:::mara decision ADR-PI-RELEASE-COMPAT
:mid: 01M3M1DFHXYXGGS9W2P9K38SV1
:title: Use release-time latest Pi instead of a rolling compatibility range
:status: accepted
:justifies: REQ-PI-RELEASE-COMPAT

Choose one validated Pi version at the time of each integration release rather than advertise an open-ended lower bound or maintain a cross-version support matrix. Pi evolves quickly, so newer releases require a new compatibility check and package release before support is claimed. The current workspace catalog and installed Pi are 0.87.1 as of this decision; that fact does not pin future package releases. This decision covers the advertised compatibility promise, not an exact peer-dependency syntax for every package kind.
:::

:::mara verification VER-PI-RELEASE-COMPAT
:mid: 01M3M1DHSWCDN2KGHWJG75DNSZ
:title: Confirm release-time Pi selection and support claim
:status: accepted
:method: inspection
:verifies: REQ-PI-RELEASE-COMPAT

Before releasing each Pi integration, check the current npm latest tag for @earendil-works/pi-coding-agent, the version selected by the release, its consumer-facing compatibility statement, and the actual runtime and loading checks performed with that version. Fail the release check if the selected version differs from latest or if support for other untested Pi versions is advertised. This is a repeatable release check, not an assertion that a release or its end-to-end integration has occurred. For this development increment, installed Pi and the workspace catalog are 0.87.1; statusline-protocol has type compatibility and mocked behavioral checks but not a real custom-footer integration.
:::
