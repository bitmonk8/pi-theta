# `V15c-T` — Imports (`.warp` library files) (tests)

**Spec.** [`../spec_topics/imports.md`](../spec_topics/imports.md).

**Adds.** Failing tests for the paired `V15c` implementation leaf.

**Tests.**
- `IMP-1`: the `Resolver` signals an unresolvable `.warp` path by throwing → `loom/load/unresolvable-warp-path`, and the file is not registered (unresolvable = non-relative, no byte-exact final-segment entry, or unreadable).
- `loom/parse/warp-top-level-statement`: a non-permitted top-level form fires.
- `loom/load/import-cycle`: a `.warp` static-graph cycle fires with its path; `import-unknown-symbol` / `import-name-collision` fire.

**Deps.** `V1a`, `V15a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
