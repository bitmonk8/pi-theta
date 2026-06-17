# `V2d-T` — Canonical integer/number renderer (tests)

**Spec.** [`../spec_topics/binder/defaulting-system-note-echo.md`](../spec_topics/binder/defaulting-system-note-echo.md).

**Adds.** Failing tests for the paired `V2d` implementation leaf.

**Tests.**
- `BNDR-4`: integer echo is canonical base-10 — no leading zeros/separators/exponent; `-0` renders `0`.
- `BNDR-5`: number echo is shortest round-trip fixed-point — no scientific notation (including the `±1e21` and `|value| < 1e-7` switches expanded to full fixed-point, and an in-range value such as `5e-8` is likewise expanded — not only the named `1e21`/`1e-8` magnitudes); a non-integral value carries at least one fractional digit; an integral value carries no `.0`; `-0` renders `0`.

**Deps.** `V2a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
