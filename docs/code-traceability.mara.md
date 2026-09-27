# TypeScript code traceability

Mara loads the project-owned TypeScript grammar and query from `.mara/code/`
using the language entry in `.mara/project.toml`. The pack includes its MIT
license and supports `.ts`, `.mts`, and `.cts` files.

Reference a file with `code:packages/example/src/service.ts`, or a named
method with `code:packages/example/src/service.ts::Service.run`. The fixed
`::` separates the file from the selector; `.` separates nested symbol names.
The current query selects named functions, classes, and methods. Interfaces,
type aliases, arrow-function variables, and TSX are not supported symbol targets
by this pack. A selector must resolve uniquely; missing or ambiguous targets
fail validation.

Use `mara get '<code-reference>'` to inspect a target and
`mara project validate` to check the project. Code associations identify
implementation or checks; they do not establish a passing execution result.
