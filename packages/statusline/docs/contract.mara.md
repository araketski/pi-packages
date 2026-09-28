:::mara requirement REQ-STATUSLINE-OVERRIDES
:mid: 01M3KZM4VJ895WKPMRMK7N9MH3
:title: Permit central presentation overrides
:status: accepted
:kind: functional
:contributes_to: GOAL-STATUSLINE-COMPAT

The custom footer shall use producer-supplied prefix and color definition unless its own configuration overrides them for a status key or state. Per-key appearance overrides use the same exported prefix/color type as producer registration, including theme roles, six-digit hex, 256-color indices, and terminal-default values. When config supplies a state-specific color, other producer state colors remain available; the override replaces only matching state entries. Changing footer configuration and reloading Pi, or changing the theme, must re-render the current structured status without asking producers to publish again. Native fallback uses producer defaults, not custom-footer configuration. The footer shall load user overrides from <agent-dir>/statusline.json (Pi’s configured agent directory, normally ~/.pi/agent), then project overrides from <cwd>/.pi/statusline.json only when the project is trusted. It reads configuration at session startup or Pi reload, not on every render or through a file watcher. A missing or invalid config uses valid lower-priority settings and defaults; invalid JSON or values elicit a warning without preventing the footer from rendering. A missing user file is not created. The JSON layout, appearance precedence and invalid-value behavior are specified by [[DES-STATUSLINE-CONFIG]].
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

In a real Pi 0.87.1 session, start two producers with different active statuses before the custom footer. Load the footer, request snapshots, and confirm complete current text, state, source, prefix and resolved state color appear without duplicating their native fallback while unrelated native-only statuses remain visible. Update and clear producers and observe one correct entry per key. Override a prefix or one state color in <agent-dir>/statusline.json; verify current structured statuses re-render after Pi reload or theme change without another producer event, and that other producer state colors still apply while native fallback retains producer defaults. Check that <cwd>/.pi/statusline.json overrides the user file only for a trusted project, that an alternate configured agent directory is used, and that starting without either file uses defaults without writing a config file. Test malformed JSON and invalid values at either layer: warn, retain valid lower-priority settings and keep the footer usable. Exercise footer unload/reload and producer disposal. The mocked footer lifecycle and Pi resource-loader tests run in packages/statusline/tests/. The specified real interactive Pi session remains planned; fixture checks are not evidence of interactive behavior.
:::

:::mara design DES-STATUSLINE-BUILTIN-SOURCES
:mid: 01M3M7MXRQ6K0X56RHA5V4T32Y
:title: Collect built-in statuses through internal modular providers
:status: accepted
:kind: structure
:satisfies: REQ-STATUSLINE-FOOTER
:satisfies: REQ-STATUSLINE-BUILTINS

Built-in status sources are modular providers inside the statusline extension. They produce the same status data shape used by external producers for footer collection, state and appearance handling, but they do not register with statusline-protocol or publish native Pi statuses solely for footer display. This keeps one presentation path without turning footer-owned data into independent protocol producers. The accepted built-in keys and observable values are in [[REQ-STATUSLINE-BUILTINS]] and [[DES-STATUSLINE-BUILTIN-VALUES]]; this design does not claim they are implemented.
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

The TUI footer shall render ordered layout tokens in one or more lines. A `spacer` token divides a line into independently separated segments and distributes leftover width between visible segments; a configurable separator appears only between visible tokens in the same segment. Missing or empty items do not leave stray separators, and lines without visible items are omitted. When a configured line cannot fit, the entire footer falls back to one visible token per line in configured order, omitting spacers and segment separators. Every output line is limited to its available terminal-column width, including narrow widths and wide Unicode or styled text. If no visible item exists, the footer produces no visible lines. Without config, the default layout has four rows: `branch changes pr spacer project`; `context cache cost spacer model thinking caffeinate`; `title`; `cwd`. An absent `caffeinate` producer does not create an empty placeholder.
:::

:::mara verification VER-STATUSLINE-LAYOUT
:mid: 01M3M86WSEJVWEWWTSYJ3V6HAK
:title: Check layout, omission and narrow-terminal fallback
:status: accepted
:method: test
:level: unit
:verifies: REQ-STATUSLINE-LAYOUT

Render a single-line and a nested multi-line layout with two visible segments separated by `spacer`; assert configured order, separators only within segments, space allocation, and empty-line omission. With missing items, repeated spacers and an all-empty layout, assert no stray separators or visible blank lines. Render the same layout just below its content width and assert one visible token per line in order, without spacers or segment separators. Exercise widths 0 and 1, styled strings, combining characters and wide Unicode; assert no rendered line exceeds available visible terminal columns and no text from one token leaks into another. With no config assert the four default rows and that missing title or caffeinate statuses omit only their visible content. Planned test, not execution evidence.
:::

:::mara requirement REQ-STATUSLINE-BUILTINS
:mid: 01M3M86XN3SJZ6HC7XXNBB774N
:title: Provide modular built-in status tokens
:status: accepted
:kind: functional
:contributes_to: GOAL-STATUSLINE-PRESENTATION

The footer shall offer direct layout tokens `cwd`, `project`, `title`, `model`, `thinking`, `branch`, `changes`, `pr`, `context`, `tokens`, `cache`, and `cost`. Each built-in is collected only when its token is requested, exposes text and applicable state to the same rendering path as external statuses, and is omitted when its data is unavailable unless a specified fallback exists. Collecting git or pull-request data must not block footer rendering; unavailable git or `gh` data does not prevent other tokens from displaying. The accepted value and failure-case baseline is [[DES-STATUSLINE-BUILTIN-VALUES]]. Built-ins are footer-owned and do not create native setStatus publications.
:::

:::mara verification VER-STATUSLINE-BUILTINS
:mid: 01M3M86YJ1BHDV7J70TMCGVT33
:title: Check built-in values, states and unavailable data
:status: accepted
:method: test
:level: integration
:verifies: REQ-STATUSLINE-BUILTINS
:verifies: DES-STATUSLINE-BUILTIN-VALUES

Using a Pi context fixture and controllable git/gh results, render each built-in token independently and together. Assert built-in prefix and state color defaults (without assigning the external caffeinate key a built-in appearance), then path, project, session, model and thinking values; context threshold boundaries; branch cleanliness, change-count ordering and PR number; branch-scoped token, cache and cost totals. Exercise missing session name, no model, absent context usage, non-repository, missing gh command and transient git/gh failures. Assert unrelated tokens still display and the footer does not wait for subprocesses during render. Confirm built-in collection does not publish native statuses. Planned verification, not execution evidence.
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

:::mara design DES-STATUSLINE-CONFIG
:mid: 01M3M8AAFGSF3PHEDG0XWA10J1
:title: Layered JSON configuration using shared status appearance
:status: accepted
:kind: data
:satisfies: REQ-STATUSLINE-OVERRIDES
:satisfies: REQ-STATUSLINE-LAYOUT

At session start or Pi reload, read `<agent-dir>/statusline.json` from Pi's configured agent directory and `<cwd>/.pi/statusline.json` only for a trusted project. Overlay trusted-project settings on user settings on built-in defaults. Missing files leave defaults in place and are not created; neither a file watcher nor per-render rereads are required. The former global `~/.pi/statusline.json` is not an automatic fallback. On Pi reload, read the files again and render current structured statuses from the fresh footer snapshot without asking a producer to republish its status.

The JSON root is an object with optional `layout`, `separator`, `separatorColor` and `appearance` fields. `layout` replaces the entire layout when set and is either a flat string array (one line) or an array of string arrays (multiple lines), with `spacer` a reserved layout token. Arbitrary other strings are direct external keys even when no producer is active. `separator` is text within visible line segments and defaults to ` • `; `separatorColor` is one scalar `StatusColorValue` and defaults to `dim`. The default layout is specified by [[REQ-STATUSLINE-LAYOUT]]. `appearance` maps any status key to the protocol-exported `StatusAppearance`: `{ prefix?: string, color?: StatusColor }`. The shared `StatusColor` is a single `StatusColorValue` or `{ default?: StatusColorValue, byState: Record<string, StatusColorValue> }`. A scalar color value is a Pi theme role, six-digit `#RRGGBB`, integer ANSI 256-color index 0–255, or `''` for terminal-default foreground; `#RGB`, invalid indices and unknown Pi theme roles are invalid config values. `byState` is required on the object form; unknown state *names* are allowed, since producers can publish new states. Built-in status appearance defaults are in [[DES-STATUSLINE-BUILTIN-VALUES]]; external statuses, including the default-layout `caffeinate` slot, initially use producer appearance instead of a hard-coded footer prefix/color.

Example (producer color has default `muted` and a `waiting` state; this changes only its `active` state):

```json
{
  "layout": [["branch", "changes", "spacer", "project"], ["context", "model", "caffeinate"]],
  "separator": " • ",
  "separatorColor": "dim",
  "appearance": { "caffeinate": { "color": { "byState": { "active": "accent" } } } }
}
```

For each structured key, start with its producer appearance (or its internal built-in appearance). Apply the user `appearance` entry and then the trusted-project entry, field by field: omitted fields inherit; `prefix: ''` removes a prefix; `color: ''` explicitly removes coloring. A scalar color (including `0`) replaces the entire earlier color definition for every state. A color object overlays only a supplied `default` and supplied `byState` entries, retaining all other inherited states. If the previous color is scalar, use it as the inherited default for an object containing only states. If no inherited or specified default exists, an unmatched state is uncolored. A project color scalar replaces any user/producer state map; a later object can patch that scalar. Resolve the effective color for the current state at render time, then apply the *current* theme or the corresponding hex/ANSI foreground escape. The native Pi fallback remains producer-owned and does not take footer overrides. Native-only statuses remain available as Pi supplies them; do not infer their structured source, state or producer defaults from styled native text.

Bad input is localized: malformed JSON discards only that file layer and warns; a non-object root or an invalid top-level field discards that field/layer with a warning, retaining valid sibling fields and lower-priority values. A malformed `appearance` key entry or color-state value is ignored with a warning while valid siblings still apply. Unknown top-level fields warn and are ignored; an arbitrary string layout token or appearance key is *not* invalid simply because its producer is not running yet. In all cases the footer remains usable. Text safety and width rules are in [[REQ-STATUSLINE-SAFE-RENDER]] and [[REQ-STATUSLINE-LAYOUT]]. Implementation state: `loadStatuslineConfig` now reads trusted layers, validates and merges appearance values, and returns diagnostics; its fixture tests pass. The extension loads config on TUI session start, reports warnings and applies overrides in mocked footer tests. Real interactive Pi reload and UI warnings remain unverified.
:::

:::mara design DES-STATUSLINE-BUILTIN-VALUES
:mid: 01M3M8ABAWA6SZXCX074H45YCW
:title: Built-in status values and availability
:status: accepted
:kind: behavior
:satisfies: REQ-STATUSLINE-BUILTINS
:refines: DES-STATUSLINE-BUILTIN-SOURCES

Built-in modules produce the same structured `{ source, key, text, state?, prefix?, color? }` shape as external protocol statuses for requested layout keys, with statusline-owned source identity. They are internal to the footer; none is a protocol producer or a native `setStatus` publisher. Observable behavior derived from `main` and accepted as the rewrite baseline:

- `cwd`: use `~` for the home directory, `~/...` for paths within home, otherwise the current directory's basename. `project`: the current directory's `package.json` name if it is a nonempty string, otherwise its basename, including when package metadata cannot be read or parsed. `title`: the current session name, omitted when absent.
- `model`: current model ID, `unknown` if there is no model. `thinking`: Pi's current thinking level as text and state (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`).
- `branch`: current Git branch if available, with `clean` or `dirty` state. Stage/unstage/untracked/conflict and ahead/behind counts all mark it dirty; absent branch omits the token. `changes`: list only nonzero counts in the order `!<conflicts> +<staged> ~<unstaged> ?<untracked> ↑<ahead> ↓<behind>` separated by spaces; untracked files count individually. Omit it for zero changes or absent Git data. `pr`: `PR #<positive number>` when an open PR number for the branch is available; omit otherwise.
- `context`: from Pi's context usage as `<percent>%/<contextWindow>`, omit if tokens or percent are unavailable. `normal` below 70%, `warning` from 70% up to but excluding 90%, `full` from 90% upward. Remove a trailing `.0` in percentage formatting; abbreviate context window in k/M units.
- `tokens`: total branch-history assistant input/output usage as `<input>↑ <output>↓`. `cache`: branch-history assistant cache read/write usage as `<cacheRead>/<cacheWrite> <rounded cache-hit percent>%`; 0% with no cache usage. `cost`: total assistant cost as `$<value>` with two decimals. Usage amounts have rounded integer form below 1000 and one decimal k/M above that threshold; absent usage contributes zero. Only the active session branch is counted.

Visible default appearance for built-ins, based on `main` and using the shared status shape: `cwd` prefix `⌂`, color `muted`; `branch` prefix `↳`, clean `success`, dirty `muted`, other states `accent`; `project` prefix `◯`, uncolored; `title` prefix `✎`, color `muted`; `model` prefix `◉`, color `toolTitle`; `thinking` prefix `◐`, use Pi theme roles `thinkingOff`, `thinkingMinimal`, `thinkingLow`, `thinkingMedium`, `thinkingHigh`, `thinkingXhigh`, `thinkingMax` for matching states, otherwise `accent`; `changes` unprefixed `dim`; `pr` unprefixed `muted`; `context` prefix `◔`, normal `muted`, warning `warning`, full `error`, otherwise `muted`; `tokens` prefix `◈` `muted`; `cache` prefix `↻` `muted`; `cost` unprefixed `muted`. A nonempty prefix is separated from text by one space. These built-in defaults do not override structured external producer prefix or color: `caffeinate` in the default layout is an external key, and absent a user/project appearance override it uses the defaults from that producer. The aggregate `statuses` key remains separately defined by [[REQ-STATUSLINE-EXTERNAL-TOKENS]].

Git status and PR queries happen asynchronously outside `render`; start/refresh only when the relevant tokens are configured. Update on branch changes and periodic refresh, rerender on changed results, and stop work on footer disposal. If Git is unavailable or cwd is not a repository, omit Git-dependent entries; if `gh` is unavailable or has no PR, omit `pr` while keeping other tokens. A transient lookup failure must not crash or block the footer. Exact subprocess command flags, cache cadence and timeout lengths are implementation choices, not promises. See [[DES-STATUSLINE-BUILTIN-SOURCES]] for provider structure. Implementation state: the core, usage and Git presentation providers now return built-in structured items and pass fixture checks for values, states, default appearance and absent data. An asynchronous Git/PR cache now parses per-file status, refreshes when active, discards stale results after disposal or branch invalidation and has fixture tests for errors and branch changes. The footer uses these providers and the Git cache in mocked TUI sessions; interactive Pi integration remains unverified.
:::

:::mara design DES-STATUSLINE-REGISTRY
:mid: 01M3M9VJ429KX3FKKTV4VTTEVE
:title: Merge per-producer snapshots with live footer statuses
:status: accepted
:kind: behavior
:satisfies: REQ-STATUSLINE-FOOTER
:satisfies: REQ-STATUSLINE-EXTERNAL-TOKENS

For an active TUI footer, register handlers for the current protocol's set, clear and snapshot events before emitting its snapshot request. Keep raw, unstyled structured statuses separate from native Pi footer data; a set event carries the complete current `{ source, key, text, state?, prefix?, color? }` value and may initialize a key without a prior snapshot. Snapshots are per producer registration, not authoritative replacements for an entire `source`: incorporate each supplied status by `(source, key)` and never remove another registration merely because one producer responds with an empty list. A matching clear removes only that producer's entry. Disposal of a producer emits a clear; footer disposal unsubscribes all handlers and discards its registry. A later footer startup builds a new registry via another request.

For distinct active producer keys, render one structured value per key. If Pi's `footerData.getExtensionStatuses()` also contains that key, suppress only its native duplicate, leaving native-only keys available for direct or aggregate rendering. Never parse native styled text to reconstruct structured state. Preserve raw status values so a theme change or reloaded configuration can resolve effective prefix and color on render without a producer update. Ignore malformed event payloads rather than destroying previously valid state. If an update or clear for a key arrives after requesting a snapshot but before a delayed snapshot response for that same key, the later snapshot cannot resurrect or roll back that observed event; the protocol currently provides no sequence numbers, so no broader conflict-order guarantee is claimed. Arbitration between two simultaneously active producers using the same key is outside this design.

The footer is installed only in interactive TUI mode and releases its subscriptions on footer/session teardown. Snapshot recovery is not inferred from native status values. Implementation state: `createStatusRegistry` now subscribes, merges distinct keys and per-producer snapshots, ignores malformed payloads (including invalid theme roles and colors) and stale snapshots following a set or clear, and releases subscriptions on disposal; its fixture tests pass. It is wired to Pi setFooter with fixture tests for recovery, duplicate suppression, reload and teardown. A real interactive Pi TUI session remains unverified.
:::

:::mara verification VER-STATUSLINE-REGISTRY
:mid: 01M3M9VK0B0AR9SJRPS6MN3R0V
:title: Check snapshot merging, event ordering and cleanup
:status: accepted
:method: test
:level: integration
:verifies: DES-STATUSLINE-REGISTRY
:verifies: REQ-STATUSLINE-FOOTER

In a Pi event/UI fixture, start two producers with distinct keys but the same source before creating the footer; after subscribing and requesting snapshots, both must appear with their complete current text, state, prefix and color. Give each a matching native setStatus entry plus an unrelated native-only key; only the two native duplicates are suppressed. Confirm that one empty per-producer snapshot does not erase a sibling, and that clearing/disposal removes only the matching registration. Exercise a live set without a preceding snapshot, a malformed payload, a changed theme and footer reload without republishing. Delay a snapshot until after a set or clear for its key and assert that it cannot overwrite or resurrect the newer event. Tear down and recreate the footer; assert no stale entries, leaked listeners or duplicate callbacks. Verify no footer is installed for non-TUI modes. This is a planned verification, not passing execution evidence.
:::

:::mara verification VER-STATUSLINE-CONFIG
:mid: 01M3MBSSNEEWAV8S2Y2AM37QY0
:title: Test layered config, color merges and invalid inputs
:status: accepted
:method: test
:level: integration
:verifies: DES-STATUSLINE-CONFIG
:verifies: REQ-STATUSLINE-OVERRIDES

In a temp agent directory and cwd, exercise no files (no writes, default layout/appearance), user-only and trusted/untrusted project configs, alternative agent directory and Pi reload. Check project-over-user replacement of layout/separator/separatorColor and field-wise status appearance merge against producer defaults; with producer default `muted` and states `active: success`, `waiting: warning`, override just `active` with `{ byState: { active: 'accent' } }` and assert waiting and fallback remain. Apply a scalar color after a map and a map after a scalar, including numeric `0` and empty string; assert clear-prefix and clear-color semantics. Confirm native fallback is unaffected, and changing theme or config re-renders without producer republish. Test accepted theme role, `#RRGGBB`, index 0 and 255 and empty color in the custom footer. With malformed JSON, wrong root/fields, invalid state value, invalid hex/index/theme role and unknown root fields, check warnings, valid sibling retention and lower-layer fallback. Confirm arbitrary not-yet-active keys are valid. This is a planned verification, not a test execution record.
:::

:::mara design DES-STATUSLINE-RENDER
:mid: 01M3MCVNYHPVAEERHGAQSFH6MG
:title: Sanitize, resolve appearance and fit the footer layout
:status: accepted
:kind: behavior
:satisfies: REQ-STATUSLINE-LAYOUT
:satisfies: REQ-STATUSLINE-SAFE-RENDER
:satisfies: REQ-STATUSLINE-OVERRIDES

Sanitize producer, native and config text before composing status items; merge status appearance with per-key config, resolve its color for the current state on each render, and apply footer-owned styling. Measure rendered columns with Pi TUI helpers, distribute spacers only between visible segments, and fall back to one token per line when a configured line cannot fit. The built-in and external status collectors supply the same structured item shape. Implementation state: pure rendering, color and safety helpers have fixture tests; the extension now installs the footer in mocked TUI sessions, but interactive Pi rendering and terminal resize behavior remain unverified.
:::
