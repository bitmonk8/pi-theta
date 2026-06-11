# `V15c-T` — Imports (`.warp` library files) (tests)

**Spec.** [`../spec_topics/imports.md`](../spec_topics/imports.md).

**Adds.** Failing tests for the paired `V15c` implementation leaf.

**Tests.**
- `IMP-1`: the `Resolver` signals an unresolvable `.warp` path by throwing → `loom/load/unresolvable-warp-path`, and the file is not registered (unresolvable = non-relative, no byte-exact final-segment entry, or unreadable).
- `loom/parse/warp-top-level-statement`: a non-permitted top-level form fires.
- `loom/load/import-cycle`: a `.warp` static-graph cycle fires with its path; `import-unknown-symbol` / `import-name-collision` fire.
- Auto-export visibility: a top-level `schema`, `enum`, and `fn` declared in a `.warp` file are each resolvable from an importing file with no `export` keyword on the declaration (Visibility rule in `imports.md`).
- Re-export with alias: `export { A as B } from "./x.warp"` is visible to a downstream importer as `B`, and the re-exporting file holds no local binding for `A` (Re-exports rule).
- Plain `import` is not re-exported: a plain `import { A } from "./x.warp"` leaves `A` invisible to a further downstream `import { A } from "<re-importing file>"` (negative half of the Re-exports rule).
- Resolver success path: a resolvable relative `.warp` import binds its symbols successfully (complements the `IMP-1` throw test).

**Deps.** `V1a`, `V15a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
