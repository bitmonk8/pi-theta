# Discovery

Loom files are discovered from five sources. The global, project, and package-conventional roots mirror the leaf-directory layout Pi uses for its own prompt templates, but the loom extension owns the discovery walk end-to-end: Pi has no `loomPaths` slot in `resources_discover` (the event carries `skillPaths`, `promptPaths`, `themePaths` only — see `@earendil-works/pi-coding-agent/docs/extensions.md` §`resources_discover`), and the `pi` manifest namespace recognises only `extensions`, `skills`, `prompts`, `themes`, `video`, and `image` (see `packages.md` §"Creating a Pi Package"). The package-manifest entry (`pi.looms`), the settings array (`loomPaths`), and the CLI flag (`--loom`) are therefore conventions defined by **this extension**; Pi does not enumerate them and does not pass them to the extension. The loom extension reads them itself — settings via the injected `FileSystem` seam (see [Settings file reads](./discovery/package-and-settings.md#settings-file-reads)), `pi.looms` and the conventional `looms/` directory by walking installed package roots (see [Package discovery](./discovery/package-and-settings.md#package-discovery)), and `--loom` via a flag the extension registers itself in its factory (see [Pi Integration Contract](./pi-integration-contract.md)). The five sources are:

## Contents

- [Discovery sources](./discovery/discovery-sources.md)
- [Package and settings](./discovery/package-and-settings.md)
