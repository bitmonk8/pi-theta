---
id: pending
title: TypeParser.parseObject runs a 293-LOC field loop with seven per-entry state latches mutated across five arms
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/type-grammar.ts:811-1103
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/type-grammar.ts#TypeParser.parseObject
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# TypeParser.parseObject runs a 293-LOC field loop with seven per-entry state latches mutated across five arms

## Observation
`TypeParser.parseObject` (src/parser/type-grammar.ts:811-1103) is 293 LOC —
strong band. It recognises the inline-object production (grammar.md:101,
`ObjectType ::= "{" Field ("," Field)* ","? "}"`) while simultaneously running
the buffered-refusal accounting of bugs 0129/0232/0244/0256/0257: seven
per-entry latches (`entryStart`, `entryRefused`, `pending`, `pendingSlotOpen`,
`emptySlotBodyPushed`, `entryTainted`, `namesStopped`) are read and written
across five loop arms plus an epilogue flush.

## Evidence
Step inventory (line ranges from the current file; locals each phase writes):

| phase | lines | LOC | locals read/written |
|---|---|---|---|
| prologue: captures & latch init | 811-879 | 69 | writes openBrace, interiorStart, interiorHasTokens, fieldTypes, fieldNames, namesStopped, entryTainted, entryStart, entryRefused, pending, pendingSlotOpen, emptySlotBodyPushed; opens openCommaReadingConstructs |
| loop arm: non-ident field name (slot comma / keyless refusal) | 886-957 | 72 | r/w entryStart, entryRefused, pending, pendingSlotOpen, emptySlotBodyPushed, entryTainted; reads fieldTypes.length |
| loop arm: colon-gate failure (refusal + resync) | 958-995 | 38 | r/w pending, pendingSlotOpen, entryRefused, entryStart, entryTainted |
| loop arm: field derivation + `as` rename skip | 996-1024 | 29 | r/w fieldNames, fieldTypes, namesStopped, pendingSlotOpen; reads entryTainted |
| loop arm: missing-separator resync / separator reset | 1025-1063 | 39 | r/w entryTainted, entryStart, entryRefused, pendingSlotOpen |
| epilogue: brace verdicts, gated flush, interiorSource, node build | 1069-1103 | 35 | reads pending, interiorStart, openBrace; writes braceClosed, closingBraceToken, interiorSource |

The gated flush ties the loop's buffered state to the epilogue
(src/parser/type-grammar.ts:1069-1080):

```ts
    const braceClosed = this.eatPunct("}");
    const closingBraceIndex = interiorClosingBraceIndex(this.tokens, interiorStart);
    const closingBraceToken = closingBraceIndex >= 0 ? this.tokens[closingBraceIndex] : undefined;
    ...
    if (closingBraceToken !== undefined) {
      this.diagnostics.push(...pending);
    }
```

## Why this is a problem
Strong band: the presumption is breakdown unless a strong concrete reason is
found. Reasons considered:
- One grammar production family (concrete): holds — the body is grammar.md:101's
  sequential recognition and calls out to parseUnion/skipMalformedEntry — but
  concrete reasons suffice only in the justify band.
- Single algorithm with shared local state (concrete): holds — the seven latches
  above would have to travel as an invented per-entry state object through every
  extracted arm — but again justify-sufficient only.
- Strong reasons: no PIC/BNDR/EXST-cited critical section — the body's citations
  are grammar.md:101 and bug adjudications (0129, 0232, 0237, 0238, 0244, 0252,
  0256, 0257), and the SL5 pop-and-push collapse happens within a single arm, so
  an arm-boundary seam does not interleave the observable `pending` order. No
  measured cost cited anywhere in the body. git log --follow shows no prior
  split reverted (all commits are per-bug behaviour fixes). No entry in
  quality/exemptions.json.
None of the four strong classes applies, so the presumption stands.

## Suggested direction (non-binding, optional)
Seam A (hypothesis, unproven): the buffered-refusal latches
(entryStart/entryRefused/pending/pendingSlotOpen/emptySlotBodyPushed) -> a
private EntryRefusals helper (hypothesis) — ~70 LOC, 0 exported symbols moved,
cross-references back into the host: discardedEntryRefusal,
entryQualifiesForRefusal, this.site. Seam B (hypothesis, unproven): the
non-ident field-name arm (886-957) -> a private method on TypeParser — ~72 LOC,
0 exports moved, needs the invented state object from Seam A. None identified
yet for the epilogue. The human ratifies one.

## False-positive check
Band: strong (293 LOC per the authoritative map; not recounted). Reasons
considered: both applicable concrete classes named with their evidence and why
each is insufficient at this band; all four strong classes checked and absent.
Exemptions check: quality/exemptions.json has no type-grammar key (grep run,
zero hits). Generated-code check: hand-written; per-bug commit history.
Spec-mirror check: grammar.md:101 is one production, but the strong band
requires more than the production-family reason. Prior-split check: git log
--follow src/parser/type-grammar.ts — no revert commits.

## Triage
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map re-run reproduces `src/parser/type-grammar.ts#TypeParser.parseObject` at 811-1103 / 293 LOC / band strong (FN_BANDS strong ≥ 200), quality/exemptions.json has zero type-grammar hits; all six inventory rows land at the cited boundaries (non-ident arm opens at the `else` on 887 and ends at `continue` 957, colon-gate 958-995, `Ident ":"` derivation 996-1024 with the name push at 1003, separator resync 1025-1063, flush excerpt byte-exact at 1069-1079, node build closes at 1102) and are real sequential steps of one loop rather than adjective splits; the seven latches are all live within the range (entryStart ×11, entryRefused ×10, pending ×11, pendingSlotOpen ×15, emptySlotBodyPushed ×4, entryTainted ×7, namesStopped ×3 word-hits); grammar.md:101 is the ObjectType production as quoted; git log --follow (25 commits) shows no revert/split commit (the only bug-0238 hit is a behaviour fix, not a reverted extraction). The reasons-considered list overlooked nothing: the two applicable concrete classes (one grammar production; single algorithm with ≥ 6 shared locals) are both named and, per quality/README.md:168, the strong band is kept whole only with a **strong** reason — none of spec-cited invariant / measured cost / reverted split / existing exemption applies — so the human's choice is precisely ratify-a-seam vs `human-keep-whole` on the shared-locals reason. Not a duplicate: same-wave sibling d9-11 files the FILE key `src/parser/type-grammar.ts` (justify), a distinct exemption key from this function-level `#TypeParser.parseObject` (triage: claude-fable-5-1)
verdict: questionable — accounting verified; target shape needs a human ruling: independently re-run `size-scan.mjs map --files <type-grammar.ts manifest>` reproduces `#TypeParser.parseObject — 811-1103 — 293 LOC — band strong` (FN_BANDS.strong = 200) and `grep -i type-grammar quality/exemptions.json` returns zero hits; all six inventory rows land at real sequential loop steps at the cited anchors (prologue ends at `openCommaReadingConstructs += 1` on 878, not 879 — one-line drift; non-ident `else` 887 → `continue` 956/957; colon-gate `!eatPunct(":")` 958 → `continue` 995; `Ident ":"` derivation with `fieldNames.push` at 1004; separator `!eatPunct(",")` 1025 → `continue` 1057 → while-close 1065; flush excerpt byte-exact at 1069/1079; `return {` 1094 → `}` 1103), none an adjective split; all seven latches live in-range (word-hits entryStart 11, entryRefused 10, pending 11, pendingSlotOpen 15, emptySlotBodyPushed 4, entryTainted 7, namesStopped 4); grammar.md:101 is `ObjectType ::= "{" Field ("," Field)* ","? "}"` as quoted; strong-reason sweep confirms none overlooked — no PIC-/BNDR-/EXST-/invariant citation anywhere in 811-1103, no measured cost, `git log --follow` (25 commits) shows only per-bug `fix:` commits with no revert/extraction, no exemption row — so per quality/README.md:168 the two concrete reasons the filing already names (one production; ≥ 6 shared locals) cannot keep a strong-band host whole without a human `human-keep-whole` ruling. Not a duplicate: d9-11 files the FILE key `src/parser/type-grammar.ts` (justify) and PTQ-1095 is a D2 header-roster item — distinct root causes (triage: claude-fable-5-1)
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map re-run on a one-line manifest reproduces `src/parser/type-grammar.ts#TypeParser.parseObject` at 293 LOC / band strong (FN_BANDS.strong = 200) — now at 821-1113, a uniform +10 drift from the filed 811-1103 caused by commit 71af3b5b adding 10 header lines above it (the body is byte-identical to every excerpt, including the `closingBraceToken !== undefined` flush at 1079-1089); `grep -i type-grammar quality/exemptions.json` = 0 hits; all six inventory rows are real sequential loop steps at the shifted anchors (prologue 821-888 ending at `openCommaReadingConstructs += 1`, non-ident `else` 897 → `continue` 966/967, colon-gate `!eatPunct(":")` 968 → `continue` 1005, `Ident ":"` derivation with `fieldNames.push` 1014, separator `!eatPunct(",")` 1035 → `continue` 1067, epilogue 1079-1113), none an adjective split; all seven latches are live in-range (word-hits entryStart 11, entryRefused 10, pending 11, pendingSlotOpen 15, emptySlotBodyPushed 4, entryTainted 7, namesStopped 4); docs/spec_topics/grammar.md:101 is `ObjectType ::= "{" Field ("," Field)* ","? "}"` as quoted; strong-reason sweep finds nothing overlooked — zero PIC-/BNDR-/EXST-/invariant/measured-cost citations in the range, `git log --follow` (26 commits) shows only per-bug `fix:` commits and two quality header edits with no reverted extraction, no exemption row — so the two concrete reasons the filing already concedes (one grammar production; single algorithm with ≥ 6 shared locals) cannot keep a strong-band host whole without an explicit human `human-keep-whole` ruling, which is the decision this leaves to the human. Not a duplicate: same-wave d9-11 files the FILE key `src/parser/type-grammar.ts` (justify) without naming parseObject as its seam, PTQ-1095 is a D2 header-roster item, and no quality/issues row names parseObject (triage: claude-fable-5-1)
