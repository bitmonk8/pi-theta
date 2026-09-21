---
id: pending
title: TypeLayerWalk.checkMethodCall is 91 LOC in the zone band, bundling three separately spec-anchored diagnostic families
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/type-layer-checks.ts:3476-3566
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/type-layer-checks.ts#TypeLayerWalk.checkMethodCall
d9_band: zone
wave: qw20260921001431
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-21
---

# TypeLayerWalk.checkMethodCall is 91 LOC in the zone band, bundling three separately spec-anchored diagnostic families

## Observation
`checkMethodCall` (src/parser/type-layer-checks.ts:3476-3566, 91 LOC, band zone per the wave's structural map) runs every type-layer check on a `method-call` expression. Its own doc comment (3471-3475) names two checks — "the `array.join` element-type precondition (owned V3g) and the A2 `unknown-method` stdlib allow-list" — and the body carries a third, the bug-0315 stdlib arity/type signature check, appended after the allow-list.

## Evidence
Distinct-concern inventory (all ranges inside 3476-3566):

| concern | members | line ranges | LOC |
|---|---|---|---|
| receiver typing (shared prologue) | `targetType`, `unfoldedTarget` via `typeOf`/`unfoldAlias` | 3476-3486 | 11 |
| `array.join` element precondition (V3g; expressions.md §"array<T>" `join` row) | `joinElement`, `checkArrayJoin`, `containsWithheldBinderType` | 3487-3514 | 28 |
| A2 `unknown-method` allow-list (expressions.md §"Built-in methods and properties") | `classifyReceiver`, `builtinMembers`, `pushUnknownMethod` | 3515-3530 | 16 |
| stdlib arity/type signature check (bug 0315; `theta/parse/stdlib-arity-mismatch`, `theta/parse/stdlib-arg-type-mismatch`) | `stdlibSignatureFor`, `elementType`, `checkStdlibMethodCall`, `provableArgType` | 3531-3566 | 36 |

Excerpt at the allow-list -> signature-check boundary (3517-3531):
```ts
    const kind = classifyReceiver(unfoldedTarget, this.env);
    if (kind === "unknown") {
      return;
    }
    if (!builtinMembers(kind).has(e.method)) {
      // The RAW `targetType`, not the unfolded copy above: the message names
      // the receiver's declared type, and an alias the author wrote must
      // still read back as itself here, whatever it unfolds to for the
      // checks above.
      this.pushUnknownMethod(e.method, targetType, e.range);
      return;
    }
    // Bug 0315 — the member NAME is known (the allow-list above passed), so
    // check its argument list against the shared arity/type signature table:
```
The three families emit disjoint diagnostic codes (`non-string-array-join` vs `unknown-method` vs `stdlib-arity-mismatch`/`stdlib-arg-type-mismatch`), are anchored to different spec/bug owners (V3g, A2, bug 0315), and share only the two prologue locals `targetType`/`unfoldedTarget`.

## Why this is a problem
Zone band: no presumption, but the ≥ 2-concern bar is met with three diagnostic-family rows (28/16/36 LOC) beyond the shared 11-LOC prologue. The sibling checks the enclosing walk already delegates to are one-family-per-method (`checkIndex` = index receiver + object index, split from `checkMemberAccess`; `checkArrayLiteral`; `checkObjectField`), so this host is the one member of that group carrying three families behind one name; the third family (bug 0315) was appended after the doc comment was written, which still names only two. Shared state defeating a seam is 2 locals (`targetType`, `unfoldedTarget`), not 6.

## Suggested direction (non-binding, optional)
Seam A (hypothesis, unproven): the join element precondition (3487-3514) -> private `checkJoinElement` — 28 LOC, 0 exports moved, 0 external importers, cross-references back into the host: `this.env`, `this.file`, `this.diagnostics`. Seam B (hypothesis, unproven): the bug-0315 signature check (3531-3566) -> private `checkStdlibSignature` — 36 LOC, 0 exports moved, cross-references: `this.provableArgType`, `this.env`, `this.diagnostics`. Both mirror the existing one-family-per-`check*` delegation shape of the sibling methods.

## False-positive check
Band: 91 LOC, zone (map-quoted). Two-or-more-concern evidence: the three-row inventory above, concern names taken from the code's own doc comment and diagnostic codes. Reasons considered: closed-enumeration dispatch (no — three sequential families, not a switch over a spec set); shared-local-state (2 locals, under the bar); data-only/grammar/generated (none apply; hand-written per file header). Exemptions check: no `#TypeLayerWalk.checkMethodCall` key in quality/exemptions.json. Duplicate check: prior-wave D9 filings on this file target the file, walkStmt, provableArgType, walkExpr — not this host; PTQ-1119 (stdlib-member-dispatcher-cloned, resolved) targets the runtime stdlib dispatchers at src/runtime/stdlib-{array,string,object}.ts, a D4 clone class, not this parser-side host's size. Spec-mirror check: each family cites its own spec/bug anchor; no single closed enumeration owns the 91 LOC.

## Triage
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map reproduces TypeLayerWalk.checkMethodCall 3476-3566 / 91 LOC / band zone (FN zone ≥ 60), no D9 exemption key for the host or file in quality/exemptions.json; excerpt byte-exact at 3517-3531; the three inventory rows are real distinct concerns, each emitting a disjoint code through its own helper (`checkArrayJoin` → theta/parse/non-string-array-join at stdlib-array.ts:184, `pushUnknownMethod` → theta/parse/unknown-method at 3614, `checkStdlibMethodCall` → STDLIB_ARITY/ARG_TYPE_MISMATCH_CODE at stdlib-arg-diagnostics.ts:41/44); one accounting correction that does not change the outcome — the bug-0315 row also reads the A2 row's `kind` (`stdlibSignatureFor(kind, e.method)`) and is reached only after the allow-list passes, so cross-row locals are 3 (targetType, unfoldedTarget, kind), still under the ≥ 6 bar; no closed-enumeration dispatch, no ≥ 80 % data, not a grammar production, not generated, no spec clause pins the three in one body, and git shows only 3 additive commits touching the method (aff1cb3f, 52712fb3, d224287a) — no reverted split; not a duplicate: no issue/resolved file targets this host, and intake qw20260920202922-d9-04 cites checkMethodCall only as the sibling delegation shape for walkExpr (triage: claude-fable-5-1)
