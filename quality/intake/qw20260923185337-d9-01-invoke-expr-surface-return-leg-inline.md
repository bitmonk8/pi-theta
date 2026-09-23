---
id: pending
title: checkInvokeExprCallSurface is a 209-LOC strong-band per-site loop that has absorbed the bug-0473 typed-return leg inline after the PTQ-0413 seam landed
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/invoke-expr-call-surface.ts:151-359
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/invoke-expr-call-surface.ts#checkInvokeExprCallSurface
d9_band: strong
wave: qw20260923185337
reported_by: lens-d9-placement (anthropic/claude-opus-5-5)
date: 2026-09-23
---

# checkInvokeExprCallSurface is a 209-LOC strong-band per-site loop that has absorbed the bug-0473 typed-return leg inline after the PTQ-0413 seam landed

## Observation
The structural map gives `src/extension/invoke-expr-call-surface.ts#checkInvokeExprCallSurface` at 151-359, 209 LOC, band strong (FN strong ≥ 200), importers 1 src / 0 tests. The file itself is 359 LOC, exempt band. The host's role, from the file header (:1-2), is "Load-time invoke-expression call-surface checks and shared callable argument type checking/collection/rendering for the compose-pass call surfaces." The function was created by PTQ-0413's ratified move (commit f7aae3fc, 2026-09-17), and at that point it spanned 252-435 (184 raw lines, per `git show f7aae3fc:src/extension/invoke-expr-call-surface.ts`). Commit 4dff8e49 (bug 0473, 2026-09-20) then added a cross-file `invoke<Schema>` return-type leg inline, at 353-571 (219 raw lines). Today one `for` loop body holds five phases. Each phase has its own spec anchor and its own diagnostic row.

## Evidence
Step inventory (line ranges re-read at HEAD with `nl -ba`):

| phase | lines | LOC | reads | writes |
|---|---|---|---|---|
| P0 signature + restated injected-deps type | 151-182 | 32 | — | — |
| P1 setup | 183-184 | 2 | `deps` | `diagnostics`, `resolveCalleeAbsolute`/`checkWithClause`/`buildInvokeArgSlot` |
| P2 site guard + path resolve | 185-192 | 8 | `invoke`, `callerPath` | `site`, `resolvedPath` |
| P3 INV-1 containment / `callee-has-errors` | 194-233 | 40 | `invoke`, `resolvedPath`, `site`, `deps.fs`, `deps.activeRoots` | `diagnostics`; `continue` |
| P4 bug-0473 typed-return leg (`invoke-return-type-mismatch`) | 235-265 | 31 | `invoke`, `resolvedPath`, `site`, `typeEnv`, `deps.resolveCalleeReturnType` | `diagnostics` |
| P5 INV-3 arity resolve + INV-8/INV-6 with-clause | 267-299 | 33 | `invoke`, `resolvedPath`, `site`, `typeEnv`, `typePass`, `checkWithClause`, `deps.resolveCalleeArity` | `providedCount`, `arity`, `diagnostics` |
| P6 bug-0137 arg slots + `checkInvokeCall` | 300-356 | 57 | `invoke`, `arity`, `providedCount`, `site`, `typeEnv`, `typePass`, `buildInvokeArgSlot` | `diagnostics` |
| tail | 357-359 | 3 | `diagnostics` | — |

(206 LOC plus the blank separators at 193/234/266 = 209.)

The P4 leg describes itself as independent of the rest of the loop, and its only exits are pushes to `diagnostics` (src/extension/invoke-expr-call-surface.ts:241-253):
```
    // (bug 0473). Independent of the arity/type block below: an arity or
    // per-slot mismatch does not withhold a genuine return-type mismatch,
    // and vice versa. Self-deferring: `resolveCalleeReturnType` answers
    // `undefined` for an unreadable/unparseable callee, or a payload this
    // layer cannot decide without callee-namespace resolution (named /
    // withheld / no-common-type) — the runtime AJV net is the fallback
    // exactly as it is for the in-file path's own unresolvable operands.
    if (invoke.returnSchema !== null && invoke.returnSchemaAbsorbed !== true) {
      const schema = annotationToCompatType(invoke.returnSchema);
      if (schema !== undefined) {
        const calleeReturn = await deps.resolveCalleeReturnType(resolvedPath);
        if (calleeReturn !== undefined) {
          diagnostics.push(
```

The function's own doc comment still lists only the pre-bug-0473 sequence (src/extension/invoke-expr-call-surface.ts:146-147):
```
 * Check the `invoke(...)` expression surface: INV-1 containment, INV-8 clause
 * mode, INV-6 cwd type, then INV-3 arity and per-slot argument types, in order.
```

Seam cost per phase. P4 reads 5 inputs (`invoke`, `resolvedPath`, `site`, `typeEnv`, `resolveCalleeReturnType`) and writes only `diagnostics`, which it can return. P6 reads 6 to 7 inputs (`providedCount` can be derived from `invoke`). P3 reads 5 but also exits with `continue`, so a helper would have to return a proceed/stop discriminant.

## Why this is a problem
The strong band presumes a breakdown. Keeping the function whole needs a concrete reason plus a strong one. The reasons considered, and why each fails:
- Closed-enumeration dispatch: the body has no switch or if-chain over a spec-named set. The five phases are sequential checks, not arms.
- Single algorithm with shared local state (≥ 6 locals through every helper): the whole loop shares `invoke`/`site`/`resolvedPath`/`arity`/`providedCount`/`typeEnv`/`typePass`, but the seam that matters most does not. P4 needs 5 inputs and no mutable shared state. It never reads `arity`/`providedCount`/`typePass`, and it writes nothing that P5/P6 read. That is under the 6-local bar.
- Spec-cited ordered step sequence where a seam would interleave observable steps: the only observable output is the order of pushes into `diagnostics`. A helper called at P4's current position and spread into `diagnostics` keeps that order byte-for-byte. Nothing is interleaved, and P4's own comment declares it independent of the ordered arity/type block. The ordered sequence the doc comment cites (:146-147, INV-1 → INV-8 → INV-6 → INV-3) does not even include P4.
- Measured cost: none cited in the file or in bug 0473.
- Prior split reverted: none. `git log --follow` shows PTQ-0413's move (f7aae3fc) stuck, and later commits (4dff8e49, 7c3f9eb2, 343c417d) only added or removed content.
- Human ruling in quality/exemptions.json: none for this file or host (4 entries, none match).
- PTQ-0413's 2026-09-17 ratification is a seam ruling on the old host (`invoke-static-checks.ts#checkInvokeStaticResolution`), not an exemption for this function. It also predates the bug-0473 leg: a distinct concern with its own spec clause (invocation.md:28-32 §"Typed return" / Empty-tail callee compatibility), its own diagnostic row (`theta/parse/invoke-return-type-mismatch`) and its own dep (`resolveCalleeReturnType`). It was added three days later. The qw20260921001431 D9 keep-whole for this host (REVIEW_LOG.md:562) explicitly asked for a re-check "once the post-ratification bug-0473 typed-return leg (~30 LOC, self-declared independent) or further growth exceeds the ratified shape".

## Suggested direction (non-binding, optional)
Hypotheses, all unproven. The human ratifies one.
- Seam A: move P4 (235-265) into a module-local helper, perhaps `checkInvokeReturnTypeLeg` (hypothesis). 31 LOC, 0 exported symbols moved, 0 external importers (0 src / 0 tests). Cross-references back into the host: none (it takes `invoke`, `resolvedPath`, `site`, `typeEnv`, `resolveCalleeReturnType` and returns `Diagnostic[]`). The function would drop to about 178 LOC (justify).
- Seam B: move P6 (300-356) into a module-local helper, perhaps `checkInvokeArgSlots` (hypothesis). 57 LOC, 0 exported symbols moved, 0 external importers. Cross-references back: none (it takes `invoke`, `arity`, `site`, `typeEnv`, `typePass`, `buildInvokeArgSlot`).
- Seam C: none identified yet for P3, whose `continue` exits would need a returned proceed/stop discriminant.

## False-positive check
- Band: strong (209 ≥ 200) per the map. The host key is a `#function`, so the file's exempt band does not shield it.
- Reasons-considered list: the 5 concrete and 4 strong reasons are each addressed above, with the evidence that defeats them.
- Exemptions check: `quality/exemptions.json` has 4 keys (2 D8, 2 D9). None names `invoke-expr-call-surface.ts`.
- Generated-code check: no generator marker in the file header (:1-2) and no generator in `git log --follow` for the file (all commits are hand-authored quality/bug fixes).
- Spec-mirror check: no spec table enumerates these five phases. They come from four separate invocation.md anchors (INV-1 :14, §"Typed return" :28-32, INV-3 :44, INV-6/INV-8 :59/:63) plus bug 0137.
- Dedupe: PTQ-0321/0351/0413 are resolved and keyed to `invoke-static-checks.ts#checkInvokeStaticResolution`, a different host. The same-wave D8 intake `qw20260923185337-d8-01-invoke-expr-surface-deps-thread-module-functions` is about the injected-deps type (P0), not the loop's phase count. No open or intake D9 item keys this host.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map confirms checkInvokeExprCallSurface 151-359/209 LOC/band strong (1 src/0 tests) inside a 359-LOC exempt file whose map states function bands are independent burdens; the phase table sums correctly (206 + 3 blanks) and every excerpt matches (doc comment :146-147 lists only INV-1→8→6→3, the bug-0473 leg :235-265 self-declares independence and reads only invoke/resolvedPath/site/typeEnv/deps.resolveCalleeReturnType, pushing only to diagnostics — 5 inputs, under the ≥6 bar, never touching arity/providedCount/typePass); history reproduces (f7aae3fc 252-435=184, 4dff8e49 353-571=219, 7c3f9eb2/343c417d trims only); no quality/exemptions.json entry (4 keys, none match), no measured cost, no reverted split; PTQ-0413's ratification is a move ruling on the old host rather than an exemption, and the qw20260921001431 keep-whole (8 shared locals + ordered sequence) explicitly asked for this re-check; not a duplicate (the same-wave D8 intake addresses the deps type, not phase count) (triage: claude-opus-5-5)
