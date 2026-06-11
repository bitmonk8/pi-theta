# `V15c` — Imports (`.warp` library files)

**Spec.** [`../spec_topics/imports.md`](../spec_topics/imports.md).

**Adds.** The `.warp` import system: the permitted top-level forms (`import`/`export`/`schema`/`enum`/`fn`), relative `.warp`-only resolution via the `Resolver` seam, auto-export, re-exports, and the import-cycle / unknown-symbol / name-collision diagnostics.

**Tests.**
- `IMP-1`: the `Resolver` signals an unresolvable `.warp` path by throwing → `loom/load/unresolvable-warp-path`, and the file is not registered (unresolvable = non-relative, no byte-exact final-segment entry, or unreadable).
- `loom/parse/warp-top-level-statement`: a non-permitted top-level form fires.
- `loom/load/import-cycle`: a `.warp` static-graph cycle fires with its path; `import-unknown-symbol` / `import-name-collision` fire.
- Auto-export visibility: a top-level `schema`, `enum`, and `fn` declared in a `.warp` file are each resolvable from an importing file with no `export` keyword on the declaration (Visibility rule in `imports.md`).
- Re-export with alias: `export { A as B } from "./x.warp"` is visible to a downstream importer as `B`, and the re-exporting file holds no local binding for `A` (Re-exports rule).
- Plain `import` is not re-exported: a plain `import { A } from "./x.warp"` leaves `A` invisible to a further downstream `import { A } from "<re-importing file>"` (negative half of the Re-exports rule).
- Resolver success path: a resolvable relative `.warp` import binds its symbols successfully (complements the `IMP-1` throw test).

**Deps.** `V15c-T`, `V1a`, `V15a`

**Ships when.** `npm test` resolves an auto-exported symbol from a `.warp` file in a downstream importer, makes an `export … from` re-export visible while a plain `import` is not re-exported, rejects a non-permitted top-level form, and fires `import-cycle`.
