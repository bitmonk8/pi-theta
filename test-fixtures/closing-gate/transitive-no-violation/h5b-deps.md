# H5b `Deps.` snapshot (fixture)

This file mirrors the shape of the live H5b leaf's `Deps.` field so the H5d
transitive-completeness arm parses it with the same `parseH5bDeps` reader it
uses against the live page. Only the `**Deps.**` paragraph is read; the leaf IDs
named in this surrounding prose (`V99z`, `H7a`) are deliberately NOT admitted.

**Deps.** `H1a`, `H5a`, `M`, `V1a`, `V2a`–`V2e`, `V3b`, `V8d`, `V9m`
