---
id: pending
title: walkType is 163 LOC in the justify band because its object arm still carries the empty-body rule and the per-field identifier/reserved-keyword loop inline after the PTQ-1200 dup-key extraction
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/type-walk.ts:260-422
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/type-walk.ts#walkType
d9_band: justify
wave: qw20260923145222
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# walkType is 163 LOC in the justify band because its object arm still carries the empty-body rule and the per-field identifier/reserved-keyword loop inline after the PTQ-1200 dup-key extraction

## Observation
walkType (type-walk.ts:260-422) is 163 LOC, justify band. It is a switch over the TypeNode union (void / generic / object / union / default). PTQ-1200 (fixed, confirmed) filed it at 273 LOC "because its object arm carries six independent inline-field rule families inline"; the fix extracted the four raw-key rules into checkInlineFieldKeys (425-539, called at 408) but left the object arm at ~95 LOC (318-412) — larger than the other three arms combined — with two rule families still inline.

## Evidence
Step inventory of the switch arms:

| arm | lines | LOC | content |
|---|---|---|---|
| void | 269-284 | 16 | return-position gate, one diagnostic push |
| generic | 285-316 | 32 | arity gate + Result-in-schema-position gate + recursion |
| object | 318-412 | 95 | empty-body rule (321-329); per-field identifier loop: reserved-keyword refusal + binding-case-mismatch (352-384); dup-key delegation to checkInlineFieldKeys (407-409); recursion (410-412) |
| union | 413-417 | 5 | recursion |
| default | 418-419 | 2 | return |

The object arm's remaining inline families (type-walk.ts:352-357, 375-383):
```ts
      if (node.closingBraceSpelled) {
        for (const name of node.fieldNames) {
          if (RESERVED_KEYWORDS.has(name)) {
            ...
            out.push({
              severity: "error",
              code: "theta/parse/reserved-keyword-as-identifier",
              ...
          if (isTypeLikeName(name)) {
            out.push({
              severity: "error",
              code: "theta/parse/binding-case-mismatch",
```

## Why this is a problem
Justify band: presumption of breakdown unless a concrete reason to keep whole is recorded. Reasons considered: (1) closed-enumeration dispatch — the switch does mirror the TypeNode union (grammar's Type production, docs/reference/grammar.md), but the reason requires each arm short, and the longest arm is 95 LOC, five times the union arm and three times the generic arm, so the length is the object arm's rule content, not the enumeration's; (2) single algorithm with shared local state — defeated: the field-name loop reads only `node.fieldNames`, `site`, `out` (3 values), the same signature shape checkInlineFieldKeys already takes, so no state object need be invented; the PTQ-1200 fix demonstrated the seam on this exact arm; (3) data-only / grammar-production-family / generated — none apply (0% tables, hand-written, and the function is a rule walker over an already-parsed TypeNode, not a production recogniser). Exemptions.json has no type-walk entry (grep hit 0). PTQ-1200 is fixed against the 273-LOC shape and named the old host (type-grammar.ts#walkType); this 163-LOC residual needs its own disposition.

## Suggested direction (non-binding, optional)
Unproven hypothesis. Seam A: the per-field identifier loop (352-384, reserved-keyword + binding-case-mismatch rules) -> private `checkInlineFieldNameCase(node, site, out)` beside checkInlineFieldKeys (hypothesis) - ~33 LOC, 0 exported symbols, 0 external importers, cross-references: RESERVED_KEYWORDS and isTypeLikeName module constants only. That leaves the object arm ~62 LOC and walkType ~130 LOC. None further identified yet.

## False-positive check
Band: 163 LOC per the authoritative map (justify). Reasons-considered list above with the defeating evidence per reason (arm-length count defeats closed-enumeration). Exemptions check: no type-walk entry in quality/exemptions.json. Generated-code check: hand-written with bug-doc prose. Spec-mirror check: the outer switch mirrors the Type grammar union — recorded, and defeated only by the object arm's 95-LOC dominance. Duplicate check: PTQ-1200 is status fixed and cites the pre-split host type-grammar.ts#walkType at 273 LOC; the inline reserved-keyword diagnostic reproduction is separately noted in the code as a deliberate circular-import avoidance (D4 territory, not re-filed here). Ranges re-read immediately before filing.

## Triage
verdict: questionable — accounting verified; target shape needs a human ruling: independent `size-scan map` re-run gives `#walkType — 260-422 — 163 LOC — band justify` (FN_BANDS justify=100; file itself is exempt-band at 541 but the host key is the function, listed over threshold), `grep -i 'type-walk\|walkType' quality/exemptions.json` → rc=1; arm boundaries reproduce at 269/286/318/413/419 (±1 of the table) and the 95-LOC object arm 318-412 holds four distinct steps sharing only node/site/out — empty-body rule 319-327 (interiorHasTokens/braceClosed), identifier loop 349-385 (fieldNames + RESERVED_KEYWORDS + isTypeLikeName; cited excerpts match with 2-3 line drift), checkInlineFieldKeys delegation 405-407 (interiorSource), recursion 408-410 (fieldTypes); no overlooked reason — the switch mirrors TypeNode's kinds but the longest arm is 95/163 LOC so arms are not short, shared locals across steps = 0 (< 6), no data/type LOC, rule walker not a grammar production, hand-written per-bug comments (57 of the arm's 95 lines are comments, which PTQ-1200's triage already ruled is not a listed reason), `git log --follow` shows 3 commits and no reverted split, and the PTQ-1200 fix commit 19516518 took only Seam A (checkInlineFieldKeys) with no recorded keep-inline ruling for the identifier pass (PTQ-1200's own hypothesised Seam B); not a duplicate — PTQ-1200 is resolved/fixed against the pre-split host type-grammar.ts#walkType at 273 LOC, PTQ-1198/1281 are different hosts, no open issue names walkType; D9 breakdown seam shape is a design decision for a human ruling, never confirmed (triage: claude-fable-5-1)
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map re-run gives `#walkType — 260-422 — 163 LOC — band justify` (FN justify=100; the file is exempt-band at 541 LOC but size-scan.mjs:530-532 treats function bands as an independent burden), exemptions.json has 0 type-walk/walkType hits; object arm 318-412 reproduces with distinct steps sharing only node/site/out — empty-body rule 319-327, identifier loop (RESERVED_KEYWORDS + isTypeLikeName) 349-385, checkInlineFieldKeys delegation 405-407, recursion 408-410 — and the cited excerpts match with ~3-line drift; no overlooked reason (switch mirrors TypeNode kinds but the arms are not short, 0 shared locals, no data/type LOC, rule walker not a grammar production, hand-written, no revert in the 3-commit history); not a duplicate — PTQ-1200 is fixed against the old host type-grammar.ts#walkType at 273 LOC and no open issue names this host; a D9 seam is a design decision for a human (triage: claude-opus-5-5)
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map re-run gives `#walkType — 260-422 — 163 LOC — band justify` (FN justify=100; the file is exempt-band at 541, but size-scan.mjs:530-532 treats file and function bands as independent burdens); exemptions.json has 0 type-walk/walkType hits; the object arm 318-412 reproduces as four distinct steps sharing only node/site/out: empty-body rule 319-327, identifier loop (RESERVED_KEYWORDS + isTypeLikeName) 349-385, checkInlineFieldKeys delegation 405-407, recursion 408-410; the cited excerpts match with ~3-line drift; no overlooked reason (the switch mirrors TypeNode kinds but the arms are not short, 0 shared locals, no data/type LOC, a rule walker not a grammar production, hand-written, no reverted split in the 3-commit history); not a duplicate, because PTQ-1200 is fixed against the old host type-grammar.ts#walkType at 273 LOC; a D9 seam is a design decision for a human (triage: claude-opus-5-5)
