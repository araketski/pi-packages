# @araketski/pi-jobs-core

Compiled shared library for the jobs packages. Not a Pi extension.
The root exports shared job, adapter, storage, result/receipt, control and delivery
coordination types, participant discovery, and generic lifecycle/control/wait policy.
Lifecycle policy uses explicit settings, an injected clock, and adapter observation
and stop ports; it does not launch processes or load configuration files.
`./testing` exports explicit in-memory bus, unknown-job and fake-adapter fixtures.
Native execution, storage, concrete delivery and gate integration are not
implemented; fake-adapter tests are not real-process or native-workflow proof.

- [Shared interface checkpoint](docs/interface.mara.md)
- [Scaffold boundary and package checks](docs/scaffold.mara.md)
- [Package boundary and compatibility contract](docs/contract.mara.md)
- [Lifecycle](docs/lifecycle.mara.md), [delivery](docs/delivery.mara.md), and
  [storage](docs/storage.mara.md) plans

Repository-only Mara documents are not included in the archive. This README is
included for orientation; its canonical-document links refer to the repository,
not files promised in the installed package. This checkpoint is not released or
publication-ready. Release-time Pi compatibility and license/attribution review
remain separate author-owned gates.
