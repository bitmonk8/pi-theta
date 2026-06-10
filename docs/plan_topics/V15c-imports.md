# `V15c` — Imports (`.warp` library files)

**Spec.** [`../spec_topics/imports.md`](../spec_topics/imports.md).

**Adds.** The `.warp` import system: the permitted top-level forms (`import`/`export`/`schema`/`enum`/`fn`), relative `.warp`-only resolution via the `Resolver` seam, auto-export, re-exports, and the import-cycle / unknown-symbol / name-collision diagnostics.

**Tests.**
- `IMP-1`: the `Resolver` signals an unresolvable `.warp` path by throwing → `loom/load/unresolvable-warp-path`, and the file is not registered (unresolvable = non-relative, no byte-exact final-segment entry, or unreadable).
- `loom/parse/warp-top-level-statement`: a non-permitted top-level form fires.
- `loom/load/import-cycle`: a `.warp` static-graph cycle fires with its path; `import-unknown-symbol` / `import-name-collision` fire.

**Deps.** `V15c-T`, `V1a`, `V15a`

**Ships when.** `npm test` resolves a `.warp` import, rejects a non-permitted top-level form, and fires `import-cycle`.
