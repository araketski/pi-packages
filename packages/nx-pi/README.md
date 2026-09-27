# @araketski/nx-pi

An Nx plugin for Pi package development, currently at the compiled-scaffold stage.
No generators, inferred validation targets, or executors are implemented yet.

## Repository development

```sh
pnpm nx build nx-pi
pnpm nx lint nx-pi
pnpm nx typecheck nx-pi
```

Builds produce CommonJS JavaScript and TypeScript declarations in `dist/`.
Publication is limited to compiled output and this README; repository-only
specifications, source, maps, and build state are excluded.

Canonical scope and contracts are in `docs/*.mara.md` in the repository. Those
files describe intended behavior and are not included in the package artifact.
