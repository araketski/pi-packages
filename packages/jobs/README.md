# @araketski/pi-jobs

A generated Pi extension scaffold. It loads a typed no-op factory; it does **not**
replace bash, register jobs tools or `/jobs`, or execute/manage background work.
User-entered `!` and `!!` remain untouched. Do not install this scaffold expecting
runtime jobs behavior.

Repository contracts and scaffold checks are linked from
[the scaffold notes](docs/scaffold.mara.md). These repository-only documents are
not shipped in the package. The package publishes extension source for Pi to load,
not a JavaScript library API. Only `./package.json` is exported for npm consumers.

Pi is host-provided. Development and isolated loading checks use Pi 0.99.1; the
wildcard peer is not a claim of compatibility with every Pi version. This scaffold
is not a release or publication-readiness statement.
