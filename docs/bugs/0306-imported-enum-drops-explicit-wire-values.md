# Bug 0306 — An imported `.thetalib` enum loses its explicit `= "..."` wire values: `materializeSymbol` carries variant NAMES only and `buildEnvironment` rebuilds the wire map with `values: undefined`, so imported `Sev.Low` against `enum Sev { Low = "low" }` evaluates to `"Low"` where the same-file declaration evaluates to `"low"` — a silent wrong wire value the code comment states outright ("imported explicit values are not threaded through the materialisation seam")

- **Status:** open.
- **Sev/Diff estimate:** S1/D2 — S1 by the letter: a value the author pinned
  with an explicit wire string reaches every consumer — `JSON.stringify`,
  interpolation, `==` against wire-string data, tool/query payload positions —
  as the variant NAME instead, with zero diagnostics, and only for the
  imported spelling of the declaration (moving the enum into the importing
  file silently changes the program's output). D2: the fix is one field on
  `MaterializedImport` (the values record), one line in `materializeSymbol`
  to copy `stmt.variantValues`, and one line in `buildEnvironment` to thread it into
  the existing `buildVariantWireMap`; the seam's own comment marks the spot.
- **Kind:** defect — schemas.md `:97`: "The expression evaluates to the
  variant's underlying string value (the explicit RHS, or the variant name
  verbatim when no RHS is given)", with no imported-vs-local qualifier;
  imports.md `:27` exports the declaration, not a renamed value set.
- **Related:**
  - Candidate 04 of this hunt (enum tag minted from alias) — independent
    defect in the same materialisation seam; fixing either does not fix the
    other (this one is the WIRE half of the pair `:29` compares, that one the
    TAG half).
  - [0181](./0181-enum-access-params-default-boxed-string-refused-at-merge.md) /
    [0185](./0185-unresolvable-enum-variant-default-panics-recovery.md) —
    fixed; the params-default enum seams. Their fixtures declare enums in the
    SAME file, so neither witnesses the imported wire map.
  - [0055](./0055-literal-union-lowering-omits-type-string-vs-subs1.md) —
    fixed (0.59.0); precedent that one declared value set must lower/evaluate
    to one set of bytes regardless of spelling route.
- **Affected** (citations verified at `bc52da38`, v0.287.0):
  - `src/extension/import-static-checks.ts:209–211` — `materializeSymbol`'s
    enum arm: `return { name: local, kind: "enum", variants: stmt.variants ??
    [] }` — `stmt.variantValues` (the explicit-RHS record the parser carries on
    `EnumDecl`, `src/parser/theta-document.ts:787–791`) is not copied.
  - `src/runtime/lexical-environment.ts:117–125` — `MaterializedImport`:
    `variants?: readonly string[]` is the only enum payload; no values field
    exists to thread.
  - `src/runtime/lexical-environment.ts:307–315` — `buildEnvironment`'s
    import arm: `this.enums.set(imp.name, buildVariantWireMap(imp.variants ??
    [], undefined))`, with the comment "Imported enums carry variant names
    only; each name is its own wire value (imported explicit values are not
    threaded through the materialisation seam)". Contrast `:301`, the
    same-file arm: `buildVariantWireMap(reg.variants, reg.values)`.
  - `src/runtime/lexical-environment.ts:188–193` — `buildVariantWireMap`:
    `values?.[name] ?? name` — the `undefined` second argument is what turns
    every imported variant's wire into its name.
  - `docs/spec_topics/schemas.md:93` (explicit string values;
    `theta/parse/duplicate-enum-value` exists because explicit values are
    semantically load-bearing), `:97` (the evaluation rule).
  - `docs/spec_topics/runtime-value-model.md:13, :29` (the wire string is one
    of the two halves equality compares).
  - `docs/spec_topics/imports.md:27` (§Visibility — the declaration is what
    is exported).
- **Observed at:** `0.287.0` (`bc52da38`). Offline, deterministic; no live
  model. Scratch vitest: real `parseThetaDocument` + `checkThetaImports` +
  `executeBody` via `createProductionProducerDeps` (the
  `tests/reexport-chain-resolution.test.ts` harness shape); written, run,
  deleted.

## Reproduction

Offline at `bc52da38`. `/proj/app.theta` (frontmatter `model: "sonnet"`,
`mode: prompt`).

```
@@ /proj/lib.thetalib   enum Sev { Low = "low", High = "high" }
   app   import { Sev } from "./lib.thetalib"
         let x = Sev.Low
         x
   app parse :: []   diags :: []   imports :: ["enum Sev"]
   runtime   :: value="Low"                      ← declared wire is "low"

@@ same-file control
   app   enum Sev { Low = "low", High = "high" }
         let x = Sev.Low
         x
   runtime   :: value="low"
```

One declaration, two spellings of reaching it, two different wire strings on
the final value (`JSON.stringify` projection — the enum row of
runtime-value-model.md `:13` makes that projection the wire observable).

## Expected behaviour

- `docs/spec_topics/schemas.md:97`: `Enum.Variant` "evaluates to the
  variant's underlying string value (the explicit RHS, or the variant name
  verbatim when no RHS is given)". `Sev.Low`'s explicit RHS is `"low"`;
  `"Low"` is the no-RHS fallback applied to a declaration that has an RHS.
- `docs/spec_topics/imports.md:27`: what a `.thetalib` exports is the
  declaration. Nothing in imports.md licenses an imported declaration
  evaluating differently from the same declaration in-file — the section's
  premise is that libraries factor shared code out without changing it.
- schemas.md `:93` gives explicit values their own duplicate-value diagnostic
  (`theta/parse/duplicate-enum-value`) precisely because the value set is the
  semantic payload (the worked example is `ErrorCode { NotFound = "ERR_404" }`
  — wire codes, not display names).

## Actual behaviour / root cause

The materialisation seam narrows the declaration to
`{ name, kind: "enum", variants }` (`materializeSymbol`,
`import-static-checks.ts:207–209`); `MaterializedImport` has no field for the
values record, so `buildEnvironment` cannot do better than
`buildVariantWireMap(imp.variants ?? [], undefined)`
(`lexical-environment.ts:314`), whose `values?.[name] ?? name` fallback then
substitutes the name for every variant. The same-file arm one branch up
(`:301`) threads `reg.values` and is correct. The in-code comment
(`:311–313`) records the gap as a known narrowing rather than a decision with
a spec anchor.

Downstream, every consumer of the wire map inherits the wrong string: the
executor and pure-evaluator variant reads (`Sev.Low` → boxed `"Low"`),
`JSON.stringify`/interpolation of the value, and the wire half of `==`
(`value.ts:503` — `String(a) === String(b)`), so an imported `Sev.Low`
compares false against an inbound value AJV-validated as `"low"` against the
declaration's own lowered schema (`{"enum":["low","high"]}` per schemas.md
`:93` lowering) — the lowering reads the declaration, the runtime read reads
the stripped map, and the two disagree about the same enum.

## Why it matters

- **Wrong bytes on user-visible output** with zero diagnostics: any theta
  that factors a wire-code enum (`ErrorCode`, severity scales, status
  strings) into a shared lib emits variant NAMES where the author pinned wire
  codes. Moving a declaration between files is supposed to be
  meaning-preserving; here it silently rewrites every value.
- **Constantly-false comparisons against correctly-wired data:** inbound
  query/binder values are validated and retagged against the DECLARED value
  set (`"low"`), while locally-read imported variants carry `"Low"`; the
  equality's wire half (`value.ts:503`) then never matches, in both tag
  regimes (with or without candidate 04's fix).
- The committed corpus contains no imported enum with explicit values, so no
  shipped gate can witness the class.

## Non-goals

- The tag half of enum identity under aliases (candidate 04).
- Schema-lowering behaviour of imported enums at query positions — the
  divergence asserted here is between the runtime wire map and the
  declaration; a full lowering-vs-runtime witness is for the fix to add.
- The `EnumRegistration.values` shape for same-file enums — correct today.

## Fix

Thread the values through the seam: add `values?: Readonly<Record<string,
string>>` to `MaterializedImport` (`lexical-environment.ts:117–125`), copy
`stmt.variantValues` in `materializeSymbol`'s enum arm
(`import-static-checks.ts:209–211`), and pass it at `buildEnvironment:314`
(`buildVariantWireMap(imp.variants ?? [], imp.values)`), deleting the
narrowing comment. Witnesses: the pair above, plus an `as`-aliased import
(alias must not change the wire), a re-export-chain import (0101's
`materializeChain` leaf must carry the same record), and an equality row
against an inbound-shaped `"low"`.

## Provenance

- Hunt seed: imports-graph area brief, hypothesis 5 (cross-module value
  identity); found by reading `buildEnvironment`'s import arm while tracing
  candidate 04's tag mint — the comment at
  `src/runtime/lexical-environment.ts:311–313` states the narrowing.
- Spec: `docs/spec_topics/schemas.md:93, :97`;
  `docs/spec_topics/runtime-value-model.md:13, :29`;
  `docs/spec_topics/imports.md:27`.
- Implementation evidence at `bc52da38`:
  `src/extension/import-static-checks.ts:209–211`;
  `src/parser/theta-document.ts:787–791` (`EnumDecl.values`);
  `src/runtime/lexical-environment.ts:117–125, :188–193, :301, :307–315`;
  `src/runtime/value.ts:497–503`.
- Probes: scratch vitest cells G1, G1b at `bc52da38`, outputs quoted
  verbatim; file deleted per scratch policy. No non-scratch file modified.
