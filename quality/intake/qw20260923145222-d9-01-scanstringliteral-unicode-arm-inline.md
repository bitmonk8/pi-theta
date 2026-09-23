---
id: pending
title: scanStringLiteral is a 147-LOC justify-band function whose \u{...} unicode-escape sub-recogniser is a 57-LOC inline arm dominating an otherwise short escape table
lens: D9
status: intake
verdict: pending
locations:
  - src/lexer/lexer.ts:234-380
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/lexer/lexer.ts#scanStringLiteral
d9_band: justify
wave: qw20260923145222
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# scanStringLiteral is a 147-LOC justify-band function whose \u{...} unicode-escape sub-recogniser is a 57-LOC inline arm dominating an otherwise short escape table

## Observation
`scanStringLiteral` (src/lexer/lexer.ts:234-380, 147 LOC per the structural map, justify band) is the string-literal recogniser extracted from `scanTokens` by the PTQ-1167 fix, behind the `ScannerCursor`/`ScannerSinks` seams (:189-201). Its escape table (lexical.md §"String literals": `\"`, `\'`, `\\`, `\n`, `\t`, `\r`, `\u{XXXX}`) is decoded in a per-arm if-chain in which every simple-escape arm is 2-3 lines, but the `\u` arm (:280-336) is a 57-LOC sub-recogniser of its own: brace/braceless digit-run consumption, well-formedness judgement, scalar-value/surrogate judgement, and a three-way split across two diagnostic codes (bug 0412 §Fix). No exemptions.json key names this host (4 entries, none lexer), and no PTQ issue keys `#scanStringLiteral` (PTQ-1167 keyed `#scanTokens`; PTQ-1292 was the D8 `raw` accumulator, since fixed — the token text is now the slice at :376).

## Evidence
Step inventory (phases, line ranges, LOC, locals read/written):

| phase | lines | LOC | locals read/written |
|---|---|---|---|
| prologue: quote/start/startIndex capture, value/closed init | 234-242 | 9 | writes quote, start, startIndex, value, closed |
| loop shell: close-quote arm, plain-content accumulate | 243-259, 345-349 | ~20 | reads quote; writes value, closed; cursor via advance |
| simple escape arms + dangling-backslash diagnostic | 260-279 | 20 | writes value, diagnostics; escStart |
| `\u{...}` sub-recogniser (digit run, form judgement, scalar judgement, 2 codes) | 280-336 | 57 | arm-local hex/braced/braceClosed/wellFormed/cp/isScalar; writes value, diagnostics; reads escStart, cursor |
| unrecognised-escape arm | 337-344 | 8 | writes diagnostics |
| unterminated tail (literal-newline vs EOF split) | 350-373 | 24 | reads closed, start; writes diagnostics |
| token push (verbatim slice) | 374-380 | 7 | reads startIndex, value, start |

The `\u` arm's cross-phase surface is small — it reads `escStart` and the cursor and writes only `value` and `sinks.diagnostics`; its six other locals (`hex`, `braced`, `braceClosed`, `wellFormed`, `cp`, `isScalar`) are arm-local. Excerpt at the arm head (src/lexer/lexer.ts:280-287):

```ts
      } else if (e === "u") {
        advance(); // the `u`
        // `\u{XXXX}` — 1–6 hex digits between braces, a Unicode scalar
        // value (lexical.md §"String literals"). Consume the whole
        // bracketed (or braceless) digit run before judging the form, so
        // no unconsumed digit ever re-enters the loop as string content.
        let hex = "";
        let braced = false;
```

## Why this is a problem
Justify band carries a presumption of breakdown; the concrete keep-whole reasons were considered and fail on this body. Closed-enumeration dispatch: the escape table is spec-named and closed (lexical.md §"String literals"), but the reason requires every arm short — the longest arm is 57 LOC, roughly 39% of the whole function, so the length is the sub-recogniser's, not the enumeration's. One grammar production family: the string-literal production would qualify only if the routine "calls out for every sub-production already" — its unicode-escape sub-production is fully inline while every sibling long arm of the tokeniser (`scanStringLiteral` itself, `scanNumberLiteral`, `scanTemplateProse`, `scanIdentifier`) has been extracted behind the same `ScannerCursor`/`ScannerSinks` seams. Shared local state: the arm's cross-phase surface is 4 names (cursor, escStart, value, diagnostics/file), below the 6-local threshold, so the seam cost is low. Not generated; no measured cost, no reverted split (`git log -S scanStringLiteral` shows only the PTQ-1167 extraction, which landed and stuck).

## Suggested direction (non-binding, optional)
Seam A (hypothesis, unproven): the `\u` arm -> `scanUnicodeEscape(cursor, sinks, file, escStart): string | undefined` in the same file — 57 LOC, 0 exported symbols moved, 0 external importers, cross-references back into the host limited to appending the decoded scalar to `value` at the call site; leaves scanStringLiteral ≈90 LOC (zone). No further seams identified.

## False-positive check
Band: 147 LOC per the authoritative map (justify, FN 100-199). Reasons considered and defeated: closed-enumeration (longest arm 57 LOC, stated above), one-production family (sub-production inline, not called out), shared locals (4 cross-phase names, named above), generated code (hand-written, doc-comments cite bugs 0412 and lexical.md). Exemptions check: quality/exemptions.json has 4 entries, none keyed to src/lexer/lexer.ts or any #function in it. Spec-mirror check: lexical.md §"String literals" names the escape set but no single-body clause. Duplicate check: PTQ-1167 (resolved) keyed #scanTokens pre-extraction; PTQ-1278 (resolved) keyed #scanTokens residual; PTQ-1292 (resolved, D8) removed the `raw` accumulator from this body; no open or resolved filing keys #scanStringLiteral. Cited range re-read at HEAD immediately before filing.

## Triage
verdict: questionable — accounting verified: size-scan map --files re-run gives `src/lexer/lexer.ts#scanStringLiteral — 234-380 — 147 LOC — band justify` (FN justify=100), no lexer key in quality/exemptions.json; excerpt byte-exact at 280-287 and the `\u` arm spans exactly 280-336 = 57 LOC (39 %) with its six locals (hex/braced/braceClosed/wellFormed/cp/isScalar) unreferenced outside the arm (sole other `hex` hit :423 is a comment), touching only signature-borne cursor/sinks/file plus escStart/value across the seam — so the ≥6-shared-locals reason does not bite this arm (same accounting the human ratified for PTQ-1180's justify-band named-type arm); closed-enumeration fails on arm length per the PTQ-1170/1176/1195 standard; one-grammar-production is engaged, not overlooked — the design doc's reason requires the routine to "call out for every sub-production already" and lexical.md:26 gives `\u{XXXX}` its own well-formedness rule and dedicated `invalid-unicode-escape` code yet it is inline; every inventory row reproduces (immaterial drift: the dangling-backslash diagnostic starts :257 not :260); the earlier scanStringLiteral filing (TRIAGE_LOG:278, false-positive) was rejected for a 5-row escape-arm inventory that ignored these two reasons and counted the since-removed `raw` (PTQ-1292 fixed), so this single-dominating-arm claim is not the same refuted accounting; no issues/resolved PTQ keys #scanStringLiteral for breakdown (PTQ-1167/1278 key #scanTokens, PTQ-1292 is D8) and `git log -S` shows only the 1167 extraction and 1292 fix (no reverted split) — the seam shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: I re-ran size-scan map --files and it gives `#scanStringLiteral — 234-380 — 147 LOC — band justify` (FN justify=100, strong=200), and quality/exemptions.json has no lexer key; the excerpt at 280-287 matches byte for byte and the `\u` arm covers 280-336 = 57 LOC (~39 %), while every simple arm is 2-3 lines; hex/braced/braceClosed/wellFormed/cp/isScalar are used only inside the arm, which crosses the seam only through cursor/sinks/file/escStart and appends to value (4 threaded names, fewer than the ≥ 6 the shared-locals reason needs); closed-enumeration fails on arm length; the design doc (.localpi/tmp/quality-loop-d9-design.md:76-78) makes one-grammar-production conditional on the routine already calling out for every sub-production, and lexical.md §String literals gives `\u{XXXX}` its own well-formedness rule and `invalid-unicode-escape` code, yet that code sits inline, so the reason the earlier filing (TRIAGE_LOG:278, false-positive) failed to answer is now answered; the other inventory rows reproduce (small drift: the dangling-backslash row starts at :257); not a duplicate, since no issues/ or resolved/ PTQ has d9_host #scanStringLiteral (1167/1278 are #scanTokens, 1292 is D8) and `git log -S scanStringLiteral` shows no reverted split; whether a lexical escape counts as a sub-production, and the seam shape, need a human ruling (triage: claude-opus-5-5)
