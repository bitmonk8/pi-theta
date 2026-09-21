---
id: PTQ-1238
title: collectRecognisedFields spells its 33-field result record four times over (interface, let-block, return literal, destructures) — ~140 LOC of name plumbing to move 14 YAML keys' parse results to one caller
lens: D8
status: open
verdict: confirmed
locations:
  - src/parser/frontmatter.ts:350-384
  - src/parser/frontmatter.ts:396-428
  - src/parser/frontmatter.ts:652-686
  - src/parser/frontmatter.ts:703-729
  - src/parser/frontmatter.ts:1082-1094
sites: 5
fix_scope: module
d8_class: overbuilt
d8_host: src/parser/frontmatter.ts#collectRecognisedFields
wave: qw20260921195520
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-21
---

# collectRecognisedFields spells its 33-field result record four times over (interface, let-block, return literal, destructures) — ~140 LOC of name plumbing to move 14 YAML keys' parse results to one caller

## Observation
`collectRecognisedFields` (frontmatter.ts:387-687, private, importers 0/0 per the structural map) walks the recognised frontmatter keys once and hands the per-key values/presence-flags/ranges to `checkRecognisedFields` and `parseFrontmatter`. The hand-off is a 33-field record whose field roster is written out in full four times: the `RecognisedFields` interface, a 33-line `let` block, a 33-key return literal, and per-consumer destructuring lists. Every field addition touches all four rosters.

## Evidence
The counted inventory — 33 fields (modeValue, modeRange, modePresent, modeValueKind, modelPresent, modelRaw, modelRange, bindContextValue, bindContextRange, bindContextPresent, bindContextValueKind, descriptionValue, bindModelValue, bindModelUnresolvable, bindEchoValue, bindEchoRange, bindEchoPresent, bindEchoScalar, bindEchoValueKind, bindEchoValueRange, argumentHintPresent, argumentHintRange, argumentHintValue, toolLoopNode, respondRepairNode, paramsNode, paramsPresent, paramsRange, systemPresent, systemValue, systemRange, toolsValue, toolsMalformedRange) — each spelled at:
- interface `RecognisedFields`, frontmatter.ts:350-384 (35 lines);
- the let-block, :396-428 (33 lines), excerpt:
```ts
  // The recognised fields the contract pins behaviour for.
  let modeValue: string | undefined;
  let modeRange: SourceRange | undefined;
  let modePresent = false;
```
- the return literal, :652-686 (35 lines), excerpt:
```ts
  return {
    modeValue,
    modeRange,
    modePresent,
    modeValueKind,
```
- consumer destructures: `checkRecognisedFields` :703-729 (27 names), `buildSystemTemplate` :958 (4 names), `parseFrontmatter` :1082-1094 (11 names).

The job statement: inputs — one parsed `YAMLMap` of a theta's frontmatter (~14 recognised keys per the field loop's arms at :439-641); outputs — the same keys' scalar values, presence flags, kind tokens, and ranges; data scale — one frontmatter block per theta file; live call sites — exactly one caller (`parseFrontmatter`, :1082), both `collectRecognisedFields` and `checkRecognisedFields` are file-private (map: importers 0/0). Roster total: 35 + 33 + 35 + 27 + 4 + 11 ≈ 145 LOC of pure field-name repetition against a ~250-LOC field loop that does the actual work.

## Why this is a problem
The LOC-to-outcome ratio: nearly half the declaration's non-loop body is the same 33 identifiers restated, and the four rosters must be kept in lock-step by hand — a new recognised field (e.g. the bug-0297/0332 additions visible in the bindEcho six-field cluster) costs four mechanical edits before any behaviour is written. The 33 locals exist only to be copied verbatim into the return literal; no local is transformed between declaration and return.

## Suggested direction (non-binding, optional)
Unproven hypothesis: declare one mutable record initialized once (`const fields: { -readonly [K in keyof RecognisedFields]: RecognisedFields[K] } = { …defaults }`) and assign `fields.x = …` inside the loop arms, returning `fields` — deleting the let-block and return literal (~68 LOC) with no behaviour change; consumers could then read `fields.x` instead of re-destructuring. No simpler shape for the interface itself identified (the field set is real).

## False-positive check
- D9 boundary: PTQ-1146 (file seven concerns) and PTQ-1164 (parseFrontmatter six phases) are size/breakdown filings; this is a distinct over-built claim about the accumulator's shape, not host size — the hypothesis removes LOC without re-bundling the D9 split.
- Already-filed check: no quality/ file mentions `RecognisedFields` or `collectRecognisedFields` (grep over quality/issues, quality/intake, quality/resolved: zero hits).
- Exemption check: no D8 exemption on frontmatter.ts or this function.
- Spec check: no docs/spec_topics/ clause pins a carrier shape for parsed frontmatter fields; the field contract governs behaviour per key, untouched here.
- D2 precedent check: none of the 33 fields is claimed dead — all are read by `checkRecognisedFields`/`buildSystemTemplate`/`parseFrontmatter`; the claim is the four-fold spelling, not vestigial fields.

## Triage
verdict: questionable — accounting verified: the `RecognisedFields` interface (350-384), `let` block (396-428) and return literal (652-686) each carry exactly 33 identifiers with byte-exact excerpts, no local is assigned between the loop's end (641) and the return, and all three consumer destructures exist (`checkRecognisedFields` 703-729 = 25 names, not 27; `buildSystemTemplate` 958 = 4; `parseFrontmatter` 1082-1094 = 11); `collectRecognisedFields`/`RecognisedFields` occur only in src/parser/frontmatter.ts (grep src/ extensions/ tools/ tests/) with exactly one live caller at 1082; no frontmatter row in quality/exemptions.json; the named direction (one mutable record, assign into it) drops no behaviour and no docs/spec_topics clause pins the carrier shape; not a duplicate — resolved PTQ-1164 is the D9 breakdown whose fix (4d18f5cf) minted this record, not a filing about its four-fold spelling; the simpler shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified on independent re-run: `RecognisedFields` interface 350-384, `let` block 396-428 and return literal 652-686 each spell the same 33 identifiers (excerpts byte-exact; every local is assigned only inside the field loop and copied verbatim into the return); consumer destructures exist at `checkRecognisedFields` 703-729 (25 names — the filing's 27 is a miscount), `buildSystemTemplate` 958 (4) and `parseFrontmatter` 1082-1094 (11); grep of src/ extensions/ tools/ tests/ finds both identifiers only in src/parser/frontmatter.ts with the single live caller at 1081; no frontmatter row in quality/exemptions.json; no docs/spec_topics clause names the carrier, so the named direction (one mutable record assigned in the loop arms) drops no behaviour; not a duplicate — resolved PTQ-1164 is the D9 breakdown whose fix minted this record and open PTQ-1146 keys the file-level host, neither files the four-fold spelling; D8 never confirms — the simpler shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified on a third independent run: `RecognisedFields` interface 350-384, `let` block 396-428 and return literal 652-686 each carry exactly 33 identifiers (grep counts 33/33/33; excerpts byte-exact; the loop closes at 651 and the locals flow straight into the return with no intervening assignment), consumer destructures exist at `checkRecognisedFields` 703-729 (25 names — the filing's 27 is a miscount), `buildSystemTemplate` 958 (4) and `parseFrontmatter` 1082-1094 (11); grep of src/ extensions/ tools/ tests/ finds both identifiers only in src/parser/frontmatter.ts with the single live caller at 1081; quality/exemptions.json has no frontmatter row; no docs/spec_topics clause names the carrier, so the one-mutable-record direction drops no behaviour; not a duplicate — the only other quality/ mention is resolved PTQ-1164 (D9 breakdown whose fix minted this record) and PTQ-1146 keys the file-level host; the simpler accumulator shape is a design decision for a human ruling, D8 never confirms (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): confirmed - D8 batch ruling; triage equivalence verification trusted.
