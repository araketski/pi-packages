# @araketski/pi-questions

An independently authored Pi extension for interactive user questions, custom
answers and optional, visibly marked recommendations. Registers the model-only
`ask_questions` tool; there is no slash command. Recommendations still require
explicit user confirmation. Cancellation submits no answers.

Not published. From this repository, install the checkout with:

```sh
pi install ./packages/questions
```

Source, packed-consumer and controlled native TUI checks use Pi 0.99.1. Wildcard
host peers do not promise compatibility with other Pi versions. Actual Herdr
hook/server and Goal composition remain unverified.

Canonical contract, design, verification and Herdr-attention documentation lives
in `packages/questions/docs/` in the
[repository](https://github.com/araketski/pi-packages), not in the published
artifact. Optional Herdr reporting uses its existing Pi event hook, without a
backend client or dependency. Questions and submitted answers enter ordinary Pi
tool history; this is not a confidential-input channel.
