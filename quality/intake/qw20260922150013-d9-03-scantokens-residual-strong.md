---
id: pending
title: scanTokens remains a 262-LOC single function after the PTQ-1167 extraction, with the template-prose arm, identifier arm, and EOF template check still inline around six shared mutable locals
lens: D9
status: intake
verdict: pending
locations:
  - src/lexer/lexer.ts:471-732
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/lexer/lexer.ts#scanTokens
d9_band: strong
wave: qw20260922150013
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# scanTokens remains a 262-LOC single function after the PTQ-1167 extraction, with the template-prose arm, identifier arm, and EOF template check still inline around six shared mutable locals

## Observation
`scanTokens` (src/lexer/lexer.ts:471-732, 262 LOC per the structural map) is the character-dispatch tokeniser for the normalised source stream. PTQ-1167 (fixed 2026-09-20) extracted the two longest arms into `scanStringLiteral` (:213-362) and `scanNumberLiteral` (:365-462) behind the `ScannerCursor`/`ScannerSinks` seams (:191-203), taking the function from 497 to 262 LOC. The residual is still in the strong band (>= 200), and no exemptions.json entry covers the host (the file's only D8 entry names a different host).

## Evidence
Step inventory (phases, line ranges, LOC, locals read/written):

| phase | lines | LOC | locals read/written |
|---|---|---|---|
| setup: sinks, keyword/operator tables, cursor+pos/advance closures | 471-523 | 53 | writes tokens, diagnostics, reserved, twoChar, i, line, column, inTemplateProse, interpDepth, templateOpenStart |
| template-prose region arm (backtick close, `\` escape pair, `${` entry, prose skip) | 537-575 | 39 | reads/writes i (advance), inTemplateProse, interpDepth, templateOpenStart; writes tokens |
| newline + whitespace | 577-590 | 14 | i, line, column; tokens |
| line/block comments (block comment aborts scan) | 592-609 | 18 | i; diagnostics; early return |
| string-literal dispatch (extracted callee) | 611-614 | 4 | cursor, sinks |
| stray backslash | 618-629 | 12 | i; diagnostics |
| number-literal dispatch (extracted callee) | 631-634 | 4 | cursor, sinks |
| identifier / keyword arm | 636-658 | 23 | i; reserved; tokens |
| semicolon reject | 660-673 | 14 | i; diagnostics |
| two-char / one-char punct + template-state transitions | 675-699 | 25 | i; twoChar; tokens; writes inTemplateProse, interpDepth, templateOpenStart |
| EOF unterminated-template check (QRY-17) | 702-731 | 30 | reads inTemplateProse, interpDepth, templateOpenStart; diagnostics; invariant throw |

Seam cost: the cursor triple (`i`, `line`, `column`) is already objectified as `ScannerCursor` (:516-522) and the sinks as `ScannerSinks` (:523) — the two extracted scanners prove arms can leave through them. The remaining shared state is the three template-machine locals (`inTemplateProse` :495, `interpDepth`, `templateOpenStart`), written by two arms (prose region :542/:567; punct transitions :685-698) and read by the EOF check (:711-731).

Reasons considered and why each fails at this band:
- Closed-enumeration dispatch mirroring the lexical grammar (docs/reference/grammar.md §Lexical; lexical.md token roster): partially holds for the middle arms, but the setup block (53 LOC), the template-prose arm (39 LOC), and the EOF check (30 LOC) are not enumeration arms, so the length is not the enumeration's; and this is a concrete (justify-band) reason, insufficient alone in the strong band.
- Single algorithm with shared local state: six named mutable locals (`i`, `line`, `column`, `inTemplateProse`, `interpDepth`, `templateOpenStart`) — but the state object for the first three already exists (`ScannerCursor`), leaving a 3-field template-state object as the only invention. Concrete, not strong.
- Strong reasons: no spec clause pins the loop as one critical section (each iteration's arm is independent; token/diagnostic emission order is preserved by any in-order extraction through the existing sinks); no measured cost cited anywhere in the file; no prior split reverted (the PTQ-1167 split landed and stuck); no human ruling in quality/exemptions.json for this host.

## Why this is a problem
Strong-band presumption of breakdown: 262 LOC >= 200 with no strong concrete reason on record. The host itself demonstrates the viable seam shape — `scanStringLiteral` and `scanNumberLiteral` already exited through `ScannerCursor`/`ScannerSinks` under PTQ-1167 — and the residual's three largest non-dispatch blocks (template-prose arm, EOF template check, identifier arm) communicate only through those seams plus a three-field template state that no other arm shares.

## Suggested direction (non-binding, optional)
Hypotheses, unproven, in confidence order. Seam A: the template machine — the prose arm (:537-575), the punct-arm transitions (:685-698), and the EOF check (:711-731) → a `TemplateState`-carrying helper pair (e.g. `scanTemplateProse`, `emitUnterminatedTemplate`) — ~85 LOC, no exported symbols move, 0 external importers, cross-references back: cursor + sinks + the 3-field state object. Seam B: the identifier/keyword arm (:636-658) → `scanIdentifier(cursor, sinks, reserved)` — 23 LOC, nothing exported, no back-references beyond the seams. Seam C: none identified yet.

## False-positive check
- Band: 262 LOC per the map (471-732), strong (>= 200); not recounted by hand.
- Exemptions check: quality/exemptions.json contains one entry (`D8:src/extension/production-theta-producer.ts#firstAdmittingArmProperties`) — no ruling on this host, so the growth/new-concern re-file gate for exempted hosts does not apply; PTQ-1167 was a fixed finding, not an exemption, and its fix left the host in the strong band.
- Generated-code check: hand-written scanner with bug-numbered comments (bug 0412, QRY-17), no generator marker.
- Spec-mirror check: the middle arms mirror the lexical token roster, but the setup/prose/EOF blocks (122 LOC combined) are not spec-table arms, so the spec-mirror defence does not cover the length.
- Reasons-considered list recorded above with the evidence defeating each.
- Duplicate check: PTQ-1167 (fixed) covered the pre-split 497-LOC shape and its two long literal arms — this filing cites the post-fix residual with a fresh step inventory; PTQ-1148 (fixed) covered the file-level concern split, also landed.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces `src/lexer/lexer.ts#scanTokens — 471-732 — 262 LOC — band strong` (FN strong ≥ 200; file itself 732 LOC zone); every inventory row opens at its cited lines (setup 471-523 incl. ScannerCursor/ScannerSinks objectification 516-523, template-prose arm 537-575, newline/ws 577-590, comments 592-609, string dispatch 611-614, stray backslash 618-629, number dispatch 631-634, ident/keyword 636-658, semicolon 660-673, punct + template transitions 675-699, EOF unterminated-template 702-731) and the three template-machine locals (inTemplateProse/interpDepth/templateOpenStart, declared 495-501) are written only by the prose arm and punct transitions and read by the EOF check, so the template machine, the identifier arm, and the core dispatch are real distinct concerns; reasons-considered not overlooked — the applicable concrete reasons (lexical.md closed-enumeration dispatch, six shared mutable locals) are acknowledged and only strong reasons hold a strong-band host, none exists: exemptions.json has four entries but none keyed to lexer.ts or #scanTokens (the filing's 'one entry' count is wrong but the operative no-ruling claim holds), `git log -S scanTemplateProse` is empty and the PTQ-1167 split (eed3cf39) landed and stuck with a fix note stating only '497 → 262' and no residual-acceptable ruling, no measured-cost note in the file, no spec single-body clause; not a duplicate — PTQ-1167 is resolved on the pre-split shape and PTQ-1148 is the file-level host, and residual re-files after a landed split are established practice (PTQ-1209, PTQ-1213); per D9 policy the seam shape (TemplateState helper pair vs. scanIdentifier vs. keep-whole) is a design decision for a human ruling (triage: claude-fable-5-1)
