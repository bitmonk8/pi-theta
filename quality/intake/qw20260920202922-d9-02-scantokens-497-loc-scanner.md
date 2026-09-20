---
id: pending
title: scanTokens is a 497-LOC single function whose string-literal and number-literal arms are 151 and 97 LOC inline
lens: D9
status: intake
verdict: pending
locations:
  - src/lexer/lexer.ts:310-806
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/lexer/lexer.ts#scanTokens
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# scanTokens is a 497-LOC single function whose string-literal and number-literal arms are 151 and 97 LOC inline

## Observation
`scanTokens` (src/lexer/lexer.ts:310-806, 497 LOC per the structural map, strong band) is the whole tokeniser: one while-loop over the character stream with every token-class arm inlined, including the full string-escape decoder with the `\u{...}` scalar-value judgement and the full number-literal recogniser with range checks, plus the `@`...`` template-prose state machine and its EOF diagnostic.

## Evidence
Step inventory (line anchors verified in the current file; locals each phase reads/writes shown):

| phase | lines | LOC | locals read/written |
|---|---|---|---|
| cursor/table setup, `pos`/`advance` closures | 310-354 | 45 | writes tokens, diagnostics, reserved, twoChar, i, line, column, inTemplateProse, interpDepth, templateOpenStart |
| template-prose region (verbatim consume, `\` escape, `${` entry) | 367-406 | 40 | r/w inTemplateProse, interpDepth, templateOpenStart, tokens; cursor via advance |
| newline & whitespace | 407-420 | 14 | tokens; cursor |
| line/block comments | 421-441 | 21 | diagnostics (early return); cursor |
| string literal + escape table + `\u{...}` | 447-597 | 151 | tokens, diagnostics; cursor; arm-local raw/value/closed/hex |
| stray backslash | 599-610 | 12 | diagnostics; cursor |
| number literal (int/frac/exp, abutting tail, range checks) | 612-708 | 97 | tokens, diagnostics; cursor; arm-local value/isFractional |
| identifier/keyword | 710-726 | 17 | tokens, reserved; cursor |
| semicolon rejection | 734-747 | 14 | diagnostics; cursor |
| operators/punct + template-state transitions | 748-773 | 26 | tokens, twoChar; r/w inTemplateProse, interpDepth, templateOpenStart |
| EOF unterminated-template | 775-805 | 31 | reads inTemplateProse, interpDepth, templateOpenStart; writes diagnostics |

Cross-phase shared state is the cursor triple plus the template triple and the two sinks — 8 locals: `i`, `line`, `column`, `inTemplateProse`, `interpDepth`, `templateOpenStart`, `tokens`, `diagnostics` (declared 314-341). The two big arms touch only the cursor and the sinks; their loop state (`raw`, `value`, `closed`, `hex`, `isFractional`) is arm-local (e.g. lines 449-452, 614-616).

## Why this is a problem
Strong band (497 LOC ≥ 200): presumption of breakdown unless a strong concrete reason exists. Reasons considered and defeated: (a) closed-enumeration dispatch — the arms do mirror lexical.md's token classes, but the reason requires each arm short; the longest arm (string literal, 447-597) is 151 LOC and the number arm 97 LOC, themselves justify-band-sized; (b) single algorithm with shared local state — concrete (8 locals named above), but the shared state is exactly the cursor + template state + two sinks, i.e. a scanner-state object that the code has already half-invented as the `pos`/`advance` closures (325-341); this concrete reason alone does not satisfy the strong band; (c) spec-cited critical section — no clause requires the arms to be one body: each arm consumes its own character run and the escape/number sub-state is arm-local, so a helper seam interleaves no observable steps; (d) measured cost — none cited anywhere in the file; (e) prior split reverted — `git log --follow` shows none; (f) human ruling — no exemptions.json entry for this host.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: string-literal arm (447-597) -> scanStringLiteral(cursor, sinks) helper in the same file (hypothesis) - 151 LOC, 0 exported symbols moved, 0 external importers, cross-references back only through a scanner-state parameter. Seam B: number-literal arm (612-708) -> scanNumberLiteral(cursor, sinks) (hypothesis) - 97 LOC, 0 exported symbols moved, 0 external importers, same state parameter. Seam C: template-prose arm plus the punct-arm state transitions (367-406, 764-773) -> a template-state helper (hypothesis) - ~50 LOC, 0 exported symbols moved; more entangled with the main loop than A/B.

## False-positive check
Band: 497 LOC, strong (function threshold 200, quoted in the wave brief). Reasons-considered list above names the evidence defeating each, including the longest-arm LOC for the closed-enumeration reason. Exemptions check: quality/exemptions.json has no entry keyed src/lexer/lexer.ts#scanTokens. Generated-code check: hand-written (V1a commit 9021a627 plus per-bug edits 0242/0246/0249/0410-0412). Spec-mirror check: lexical.md names the token classes but no clause binds them into one function body; the file's own `collapseContinuations` already demonstrates the phase-per-function shape. Every cited range re-read immediately before filing.

## Triage
verdict: questionable — accounting verified: size-scan confirms scanTokens 310-806 = 497 LOC strong band (FN threshold 200), cited arm ranges/LOC (string 447-597 = 151, number 612-708 = 97) and the 8 shared locals match the current file, no exemptions.json key for lexer.ts, no reverted split in git log --follow; concrete reasons (spec-mirroring dispatch, shared locals) are acknowledged and no strong reason exists — target shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: size-scan map reproduces `src/lexer/lexer.ts#scanTokens — 310-806 — 497 LOC — band strong` (FN strong threshold 200); every inventory row opens at its cited lines (template prose 367-406, string arm 447-597 = 151 LOC with arm-local raw/value/closed/hex/braced, number arm 612-708 = 97 LOC with arm-local value/isFractional/extra, punct state transitions 764-773, EOF template diagnostic 775-805) and the 8 cross-phase locals (i/line/column, inTemplateProse/interpDepth/templateOpenStart, tokens/diagnostics) are exactly those declared 314-341; the two big arms touch only cursor+sinks so the rows are real distinct concerns; concrete reasons (closed-enumeration over lexical.md token classes, ≥ 6 shared locals) apply but only strong reasons keep a strong-band host whole and none exists — lexical.md has no single-body clause, no measured-cost note in the file, `git log --follow` + `-S scanStringLiteral/scanNumber` show no prior split, `size-scan exemptions --lens D9` lists no lexer key; not a duplicate of sibling d9-01 (different d9_host, file-level `src/lexer/lexer.ts`); the seam shape is a design decision for a human ruling (triage: claude-fable-5-1)
