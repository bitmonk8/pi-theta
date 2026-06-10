# `H1a` — Project scaffold and toolchain

**Convention.** [`conventions.md`](./conventions.md) (phase categories; cross-cutting rules) and the *Doc updates* cross-cutting rule.

**Adds.** The TypeScript project skeleton — `package.json` (with the four `@earendil-works/pi-*` packages plus `typebox` declared as `peerDependencies`, and `ajv`/`semver`/`chokidar` declared as loom's own runtime `dependencies`), `tsconfig.json`, the test runner, and `npm test` / `npm run build` scripts — on which every later leaf builds. The four `@earendil-works/pi-*` peers pinned at the loom 1.0 Pi-SDK pin range ([`host-prerequisites.md` §`#pi-sdk-pin`](../spec_topics/pi-integration-contract/host-prerequisites.md#pi-sdk-pin)) and `typebox` pinned `"*"` separately — the two ranges MUST NOT be collapsed — all in `peerDependencies`, are host prerequisites per [`host-prerequisites.md`](../spec_topics/pi-integration-contract/host-prerequisites.md) item 1. `ajv`/`semver`/`chokidar` belong in loom's own `dependencies` per [`../spec_topics/implementation-notes.md`](../spec_topics/implementation-notes.md) §"Loom-package implementation dependencies (loom 1.0)"; `ajv` (with `ajv-formats`) is the non-normative reference validator behind the validator-neutral `SchemaValidator` seam — see that page's §"Implementation hint (non-normative)" — not a host-prerequisite contract, so it is not cited to `host-prerequisites.md`.

**Tests.**
- `Convention:` (*Doc updates*) `npm run build` and `npm test` both run green on an empty `src/**` tree.
- `Convention:` (*Doc updates*) the dependency manifest pins the Pi SDK packages at one tilde-pinned minor line; an architectural test reads `package.json` and asserts the four peer deps share that line.

**Deps.** `-`

**Ships when.** A fresh checkout runs `npm install && npm run build && npm test` green with zero production source files.
