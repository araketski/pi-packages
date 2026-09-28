:::mara requirement REQ-STATUSLINE-OVERRIDES
:mid: 01M3KZM4VJ895WKPMRMK7N9MH3
:title: Permit central presentation overrides
:status: accepted
:kind: functional
:contributes_to: GOAL-STATUSLINE-COMPAT

The custom footer shall use producer-supplied prefix and color definition unless its own configuration overrides them for a status key or state. Per-key appearance overrides use the same exported prefix/color type as producer registration, including theme roles, six-digit hex, 256-color indices, and terminal-default values. When config supplies only one state color, other producer state colors remain available; the override replaces only the matching state. Changing footer configuration and reloading Pi, or changing the theme, must re-render the current structured status without asking producers to publish again. Native fallback uses producer defaults, not custom-footer configuration. The footer shall load user overrides from <agent-dir>/statusline.json (Pi's configured agent directory, normally ~/.pi/agent), then project overrides from <cwd>/.pi/statusline.json only when the project is trusted. It reads configuration at session startup or Pi reload, not on every render or through a file watcher. If no user file exists, built-in defaults apply without creating one. The remaining JSON layout and color precedence details belong to the future statusline extension contract.
:::

:::mara requirement REQ-STATUSLINE-FOOTER
:mid: 01M3M208ZB518PNDNJQ9FJP6FQ
:title: Consume current structured statuses without duplicate native fallback
:status: accepted
:kind: functional
:contributes_to: GOAL-STATUSLINE-COMPAT

When the custom footer starts, it shall subscribe to structured status updates and clears before requesting producer snapshots, merge each active producer’s snapshot with subsequent events, and display the current statuses including late-started producers. For a key present in both structured and native Pi status data, render the structured version once; native-only statuses remain visible. A cleared or disposed producer no longer appears. This is a custom-footer responsibility; the protocol library does not render or install a subscriber.
:::

:::mara verification VER-STATUSLINE-FOOTER
:mid: 01M3M20B5XY1SG3ADQVHRDKGPB
:title: Exercise late footer startup, duplicate suppression, and overrides
:status: accepted
:method: test
:level: integration
:verifies: REQ-STATUSLINE-OVERRIDES
:verifies: REQ-STATUSLINE-FOOTER

In a real Pi 0.87.1 session, start two producers with different active statuses before the custom footer. Load the footer, request snapshots, and confirm complete current text, state, source, prefix and resolved state color appear without duplicating their native fallback while unrelated native-only statuses remain visible. Update and clear producers and observe one correct entry per key. Override a prefix or one state color in <agent-dir>/statusline.json; verify current structured statuses re-render after Pi reload or theme change without another producer event, and that other producer state colors still apply while native fallback retains producer defaults. Check that <cwd>/.pi/statusline.json overrides the user file only for a trusted project, that an alternate configured agent directory is used, and that starting without either file uses defaults without writing a config file. Exercise footer unload/reload and producer disposal. This verification is planned; the footer package has not been scaffolded.
:::

:::mara design DES-STATUSLINE-BUILTIN-SOURCES
:mid: 01M3M7MXRQ6K0X56RHA5V4T32Y
:title: Collect built-in statuses through internal modular providers
:status: accepted
:kind: structure
:satisfies: REQ-STATUSLINE-FOOTER
:satisfies: REQ-STATUSLINE-BUILTINS

Built-in status sources are modular providers inside the statusline extension. They produce the same status data shape used by external producers for footer collection, state and appearance handling, but they do not register with statusline-protocol or publish native Pi statuses solely for footer display. This keeps one presentation path without turning footer-owned data into independent protocol producers. Built-in keys and their observable values will be specified in subsequent statusline contract increments; this design does not claim they are implemented.
:::

:::mara goal GOAL-STATUSLINE-PRESENTATION
:mid: 01M3M86V1R3S4WBSMRJ2CM048S
:title: Readable configurable footer with built-in and extension status
:status: accepted

In an interactive Pi session, the user can arrange current built-in and extension statuses into a readable footer that adapts to available terminal width and respects user and trusted-project presentation preferences.
:::

:::mara requirement REQ-STATUSLINE-LAYOUT
:mid: 01M3M86VXDKCKX6FVHK1TCJ31D
:title: Render a configurable multi-line footer within terminal width
:status: accepted
:kind: functional
:contributes_to: GOAL-STATUSLINE-PRESENTATION

The TUI footer shall render ordered layout tokens in one or more lines. A `spacer` token divides a line into independently separated segments and distributes leftover width between visible segments; a configurable separator appears only between visible tokens in the same segment. Missing or empty items do not leave stray separators, and lines without visible items are omitted. When a configured line cannot fit, the entire footer falls back to one visible token per line in configured order, omitting spacers and segment separators. Every output line is limited to its available terminal-column width, including narrow widths and wide Unicode or styled text. If no visible item exists, the footer produces no visible lines. Built-in defaults provide a usable layout without a config file. This is a rendering contract; the exact default ordering is not yet fixed.
:::

:::mara verification VER-STATUSLINE-LAYOUT
:mid: 01M3M86WSEJVWEWWTSYJ3V6HAK
:title: Check layout, omission and narrow-terminal fallback
:status: accepted
:method: test
:level: unit
:verifies: REQ-STATUSLINE-LAYOUT

Render a single-line and a nested multi-line layout with two visible segments separated by `spacer`; assert configured order, separators only within segments, space allocation, and empty-line omission. With missing items, repeated spacers and an all-empty layout, assert no stray separators or visible blank lines. Render the same layout just below its content width and assert one visible token per line in order, without spacers or segment separators. Exercise widths 0 and 1, styled strings, combining characters and wide Unicode; assert no rendered line exceeds available visible terminal columns and no text from one token leaks into another. Check that a missing config produces a useful default layout. Planned test, not execution evidence.
:::

:::mara requirement REQ-STATUSLINE-BUILTINS
:mid: 01M3M86XN3SJZ6HC7XXNBB774N
:title: Provide modular built-in status tokens
:status: accepted
:kind: functional
:contributes_to: GOAL-STATUSLINE-PRESENTATION

The footer shall offer direct layout tokens `cwd`, `project`, `title`, `model`, `thinking`, `branch`, `changes`, `pr`, `context`, `tokens`, `cache`, and `cost`. Each built-in is collected only when its token is requested, exposes text and applicable state to the same rendering path as external statuses, and is omitted when its data is unavailable unless a specified fallback exists. Collecting git or pull-request data must not block footer rendering; unavailable git or `gh` data does not prevent other tokens from displaying. Specific values and failure behavior remain to be confirmed in the built-in value proposal. Built-ins are footer-owned and do not create native setStatus publications.
:::

:::mara verification VER-STATUSLINE-BUILTINS
:mid: 01M3M86YJ1BHDV7J70TMCGVT33
:title: Check built-in values, states and unavailable data
:status: accepted
:method: test
:level: integration
:verifies: REQ-STATUSLINE-BUILTINS

Using a Pi context fixture and controllable git/gh results, render each built-in token independently and together. Assert path, project, session, model and thinking values; context threshold boundaries; branch cleanliness, change-count ordering and PR number; branch-scoped token, cache and cost totals. Exercise missing session name, no model, absent context usage, non-repository, missing gh command and transient git/gh failures. Assert unrelated tokens still display and the footer does not wait for subprocesses during render. Confirm built-in collection does not publish native statuses. Planned verification, not execution evidence.
:::

:::mara requirement REQ-STATUSLINE-EXTERNAL-TOKENS
:mid: 01M3M87QZJT219QVJNJKZD6QMQ
:title: Present direct and aggregate extension statuses
:status: accepted
:kind: functional
:contributes_to: GOAL-STATUSLINE-PRESENTATION
:depends_on: REQ-STATUSLINE-FOOTER

A configured token matching an active external status key shall render that status alone with its effective prefix and state color. A `statuses` aggregate token shall show each active external status once as `key: text`, separated from the next by ` • `, without repeating a structured status’s native fallback. Native-only statuses remain included. Empty statuses are omitted. A key appearing both as a direct layout token and within the aggregate follows the user’s explicit layout; aggregate de-duplication only concerns multiple publications of the same key within the aggregate. External producer keys must be distinct; arbitration between two active structured sources sharing a key remains out of scope. Built-in statuses are not automatically included in the aggregate.
:::

:::mara verification VER-STATUSLINE-EXTERNAL-TOKENS
:mid: 01M3M87RVQ2N0281M52B8DTZTC
:title: Exercise direct and aggregate extension status presentation
:status: accepted
:method: test
:level: integration
:verifies: REQ-STATUSLINE-EXTERNAL-TOKENS

Configure direct external-key and aggregate `statuses` tokens with two distinct structured keys, one matching native fallback and one native-only key. Assert the direct structured item uses effective prefix and state color, the aggregate contains `key: text` once for each active key with ` • ` delimiters and not the native duplicate, and no built-ins are included. Remove, clear or dispose statuses and assert stale entries disappear; absent keys and empty aggregate leave no placeholder separator. Check an explicit layout containing both direct and aggregate preserves both slots. Planned test, not execution evidence.
:::

:::mara requirement REQ-STATUSLINE-SAFE-RENDER
:mid: 01M3M8A8S01FSWD1WNMS6VQ7SZ
:title: Keep untrusted footer data from controlling the terminal
:status: accepted
:kind: quality
:contributes_to: GOAL-STATUSLINE-PRESENTATION

The custom footer shall prevent values read from the working directory, session metadata, native status text, structured status text or prefix, and config text or prefix from injecting terminal controls or changing text direction. It strips terminal escape/control sequences and bidi format controls from these inputs before composing the footer, then applies only footer-owned presentation styling. Rendering of ordinary printable Unicode, including wide and combining characters, remains usable and width-safe. This includes malformed ANSI sequences, OSC and other control strings; do not treat a producer's pre-rendered ANSI as trusted color metadata.
:::

:::mara verification VER-STATUSLINE-SAFE-RENDER
:mid: 01M3M8A9MMX0WKRNS3DYYZ72H6
:title: Inject terminal controls through each footer input
:status: accepted
:method: test
:level: integration
:verifies: REQ-STATUSLINE-SAFE-RENDER

Supply ANSI CSI, OSC clipboard, DCS, C0/C1, newlines and bidi format controls through native/structured status text, structured/configured prefixes, separator, cwd, package name and session title. Render with and without a theme color at narrow and wide terminal widths; assert payloads cannot issue terminal commands or alter display direction, printable suffixes survive, user-facing content stays within width, and footer-owned theme styling still applies. Include a producer value with pre-rendered ANSI and ordinary wide/combining Unicode. Planned test; no passing execution is asserted.
:::

:::mara design DES-STATUSLINE-CONFIG-PROPOSAL
:mid: 01M3M8AAFGSF3PHEDG0XWA10J1
:title: Draft JSON configuration and presentation defaults
:status: draft
:kind: data
:satisfies: REQ-STATUSLINE-OVERRIDES
:satisfies: REQ-STATUSLINE-LAYOUT

Proposal for confirmation, not an accepted schema. At startup or Pi reload, overlay trusted project JSON on user JSON on built-in defaults. Main uses `layout` (array of tokens or nested arrays), `separator` (text), `separatorColor` (color), `prefix` (key-to-string map), and `colors` (key-to-color/state map), with diagnostics and fallback for invalid values. Retain `layout`, `separator` and `separatorColor` conceptually; for per-key appearance choose either main's separate `prefix`/`colors` maps or a single key-to-`StatusAppearance` map using the protocol's exported `{ prefix?, color? }` shape. The latter would not read main's old config shape without an explicit compatibility rule. Single semantic colors and state maps already use the protocol's `StatusColor = string | { default: string; byState: Record<string, string> }`; determine whether main's hex and 0–255 palette options remain supported and how they fit a shared producer type before acceptance. Keep invalid-file handling, unknown keys, replacement vs merging at each config layer, empty prefix/color semantics and default layout/palette as open until the schema is agreed. No default config file is written; no automatic legacy `~/.pi/statusline.json` fallback is specified. This item must not be used as an implementation contract while draft.
:::

:::mara design DES-STATUSLINE-BUILTIN-VALUES-PROPOSAL
:mid: 01M3M8ABAWA6SZXCX074H45YCW
:title: Draft values and refresh behavior for built-in tokens
:status: draft
:kind: behavior
:satisfies: REQ-STATUSLINE-BUILTINS

Reference proposal from `main`, for confirmation rather than accepted behavior: `cwd` displays a home-relative path (`~` at home), otherwise the current directory name; `project` uses `package.json` name or directory name; `title` uses an assigned session name or is absent; `model` shows model id or `unknown`; `thinking` shows the current Pi thinking level as text and state. `branch` shows the current Git branch and clean/dirty state; `changes` shows only nonzero `!conflicts +staged ~unstaged ?untracked ↑ahead ↓behind` counts in that order (untracked counts files); `pr` shows `PR #N` when a PR number is available. `context` uses usage percent and context window with normal (<70%), warning (70–<90%) and full (>=90%) states; it is absent when usage is unavailable. `tokens` shows cumulative input/output as `<input>↑ <output>↓`; `cache` shows `<cacheRead>/<cacheWrite> <cacheHitPercent>%`; `cost` shows `$<total>` from assistant usage on the active session branch. Main formats quantities in k/M notation and cost with two decimals. Main polls git/gh asynchronously while the requested tokens are active and suppresses absent results. Confirm details such as non-home cwd display, divergence's effect on dirty state, rounding, refresh cadence, no-Git/no-gh fallback and exact default layout before accepting this design. Built-ins remain internal providers, not protocol registrations.
:::
