# @araketski/pi-gates-protocol

Scaffolded shared library; **gate coordination is not implemented yet**. A
unit-tested, internal session projection exists, but it has no Pi event transport
or journal and is not exposed as a consumer API. No consumer should depend on
this package for pending-work detection until the integration is implemented. The intended behavior and open
questions are in [the Mara contract](docs/contract.mara.md).

This library is not a Pi extension. The planned `pi-gates` visibility extension
is specified separately in [its staged contract](../../docs/planned/gates/contract.mara.md).
