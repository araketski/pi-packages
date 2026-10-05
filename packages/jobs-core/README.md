# @araketski/pi-jobs-core

Compiled shared library for the jobs packages. Not a Pi extension.
The root exports shared job, adapter, storage, result/receipt, control and delivery
coordination types, plus minimal participant discovery and contract metadata.
`./testing` exports explicit in-memory bus and unknown-job fixtures for contract
tests. `./storage` exports the bounded Linux filesystem store described in the
[storage contract](docs/storage.mara.md). Jobs execution, concrete Pi delivery
and gate integration remain separate slices; fixtures are not full-workflow proof.

- [Shared interface checkpoint](docs/interface.mara.md)
- [Scaffold boundary and package checks](docs/scaffold.mara.md)
- [Package boundary and compatibility contract](docs/contract.mara.md)
- [Lifecycle](docs/lifecycle.mara.md), [delivery](docs/delivery.mara.md), and
  [storage](docs/storage.mara.md) contracts

Repository-only Mara documents are not included in the archive. This README is
included for orientation; its canonical-document links refer to the repository,
not files promised in the installed package. This checkpoint is not released or
publication-ready. Release-time Pi compatibility and license/attribution review
remain separate author-owned gates.
