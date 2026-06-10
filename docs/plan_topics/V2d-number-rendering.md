# `V2d` — Canonical integer/number renderer

**Spec.** [`../spec_topics/binder/defaulting-system-note-echo.md`](../spec_topics/binder/defaulting-system-note-echo.md).

**Adds.** The canonical number-rendering pure function shared by the schema canonical-hash recipe (`V5d`) and the binder argument echo (`V11d`): rendering an `integer` value as canonical base-10 (BNDR-4) and a `number` value as shortest round-tripping fixed-point (BNDR-5), with no dependency on the runtime value model or schema declarations.

**Tests.**
- `BNDR-4`: integer echo is canonical base-10 — no leading zeros/separators/exponent; `-0` renders `0`.
- `BNDR-5`: number echo is shortest round-trip fixed-point — no scientific notation (the `1e21` → `1000000000000000000000` and `1e-8` → `0.00000001` fixed-point expansions reproduce exactly); a non-integral value carries at least one fractional digit; an integral value carries no `.0`; `-0` renders `0`.

**Deps.** `V2d-T`, `V2a`

**Ships when.** `npm test` asserts the BNDR-4 integer renderings and the BNDR-5 shortest-fixed-point renderings, including the `±1e21` / `1e-8` expansions and the `-0 → 0` pin.
