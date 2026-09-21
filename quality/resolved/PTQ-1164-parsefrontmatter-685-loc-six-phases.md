---
id: PTQ-1164
title: parseFrontmatter runs six sequential phases in one 685-LOC body coupled by ~30 field-state locals
lens: D9
status: fixed
verdict: confirmed
locations:
  - src/parser/frontmatter.ts:1701-2385
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/frontmatter.ts#parseFrontmatter
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# parseFrontmatter runs six sequential phases in one 685-LOC body coupled by ~30 field-state locals

## Observation
`parseFrontmatter` (src/parser/frontmatter.ts:1701-2385) is 685 LOC — strong band
(threshold 200). It parses the YAML block, runs a per-key recognition loop over
fourteen field arms, then a cross-field diagnostics pass, then params lowering plus
`system:` interpolation, and finally assembles the `ParsedFrontmatter` record. The
phases communicate exclusively through ~30 function-scope `let` locals declared at
lines 1766-1780.

## Evidence
Step inventory (phases, ranges, LOC, and the locals each reads/writes):

| phase | lines | LOC | locals read/written |
|---|---|---|---|
| fence extraction + YAML parse + malformed-YAML report | 1705-1763 | 59 | writes block, doc, yamlErrored, map, lineOffset, diagnostics |
| recognised-field local declarations | 1765-1780 | 16 | declares ~30 `let` locals (modeValue..toolsMalformedRange) |
| per-key field loop (14 key arms + deferred/unknown fallback) | 1781-2001 | 221 | writes all ~30 locals; reads map, lineCounter, lineOffset |
| cross-field diagnostics (missing-mode, bind-context, argument-hint, model resolution, tool_loop/respond_repair blocks, unknown-mode/bind-context/bind-echo values, params-null, malformed-tools, methodology) | 2004-2226 | 223 | reads ~20 of the locals; writes resolvedModel, toolLoopResult, respondRepairResult, diagnostics |
| params lowering + bind-echo bypass + `system:` interpolation | 2227-2339 | 113 | writes bodyTypeDecls, params, fieldInputs, systemTemplate; reads bindEchoValue, systemPresent, systemValue, systemRange, modeValue |
| registration gate + ParsedFrontmatter assembly | 2340-2385 | 46 | reads modeValue, resolvedModel, bindModelValue, bindModelUnresolvable, bindEchoValue, params, toolLoopResult, respondRepairResult, toolsValue, systemTemplate, systemRange, bindContextValue, descriptionValue, argumentHintValue |

The seam cost is the field-state record, src/parser/frontmatter.ts:1766-1772
(excerpt of the ~30 locals):

```ts
  let modeValue: string | undefined;
  let modeRange: SourceRange | undefined;
  let modePresent = false;
  let modeValueKind: string | undefined;
  let modelPresent = false;
  let modelRaw: unknown;
  let modelRange: SourceRange | undefined;
```

## Why this is a problem
Strong band: presumption of breakdown; a strong concrete reason is required.
Reasons considered and defeated:
- Closed-enumeration dispatch: the field loop's arms do mirror the
  frontmatter-fields-a.md §Field contract vocabulary, but the loop is 221 of 685
  LOC — the enumeration does not account for the cross-field, lowering, and
  assembly phases (382 LOC).
- Single algorithm with shared local state: concrete (the ~30 locals above are the
  threading cost), but the state object that would have to be invented is directly
  nameable — a RecognisedFields record whose members are exactly the locals the
  field loop writes — and that reason class is sufficient only in the justify
  band, not at 685 LOC in the strong band.
- Data-only / grammar-production-family / generated: not applicable (imperative
  multi-phase body, hand-written).
- Strong reasons: no spec clause pins the six phases as one critical section — the
  phases are sequential diagnostic accumulation over an already-parsed map; no
  measured cost; no reverted split in history; no quality/exemptions.json entry.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: the per-key field loop -> a
`collectRecognisedFields(map, lineCounter, lineOffset, file, diagnostics)` helper
returning the RecognisedFields record (hypothesis) — ~237 LOC, no exported symbols
move, cross-references back into the host: renderNonScalarModeKind,
renderNonScalarBindContextKind, extractToolsList, DEFERRED_FRONTMATTER_FIELDS.
Seam B: the cross-field diagnostics phase -> a `checkRecognisedFields(fields, ...)`
helper (hypothesis) — ~223 LOC, no exported symbols move, cross-references:
resolveNonNegIntBlock, checkBlockShape, unknownSubKeyDiagnostics, checkMethodology.
Seam C: the `system:` phase (lines 2290-2339) -> a `buildSystemTemplate(...)`
helper (hypothesis) — ~50 LOC, no exported symbols move, cross-reference:
toSystemParamType.

## False-positive check
Band check: 685 LOC ≥ 200 (strong). Reasons-considered list above with defeating
evidence per reason. Exemptions check: no `src/parser/frontmatter.ts#parseFrontmatter`
key in quality/exemptions.json. Generated-code check: hand-written (bug-numbered
inline commentary throughout). Spec-mirror check: the field-loop arms mirror the
field contract but cover only 221 of 685 LOC; the diagnostic ordering constraints
cited in-body (bug 0059, bug 0263) constrain intra-phase ordering, not a
single-body requirement. Prior-filing check: no existing finding targets this
function.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces src/parser/frontmatter.ts#parseFrontmatter at 1701-2385 / 685 LOC / band strong with no quality/exemptions.json key; the six sequential phases exist at the cited boundaries (YAML block 1705-1763, locals, field loop ending 2002, cross-field 2004-2220, params lowering + bind-echo bypass + system: 2222-2338, gate + assembly 2340-2384) with minor drift — the field-state block is 33 `let` locals at 1766-1798 (not 16 LOC at 1765-1780), so the loop starts at 1800 (203 LOC) and has 13 `key ===` arms plus the deferred/unknown fallback (not 14); the excerpt matches verbatim; reasons-considered holds: the ≥6-shared-locals reason is present but concrete-only, and size-scan's own strong-band rule requires a strong reason — none found (no spec clause in docs/spec_topics/frontmatter/* pins cross-phase ordering or a single pass; bug 0263 constrains only the missing-mode arm's gate; 42 --follow commits show no reverted split — 5de65c65 "split" is the tools: comma short-form); sibling intake d9-01 targets the file-level key src/parser/frontmatter.ts, a different host — not a duplicate; target shape (RecognisedFields record vs other seams) needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified on independent re-run: size-scan map --files gives src/parser/frontmatter.ts#parseFrontmatter 1701-2385 / 685 LOC / band strong, no quality/exemptions.json key (0 frontmatter rows); all six phases exist as sequential blocks at slightly drifted boundaries — YAML block 1705-1744, 33 `let` field-state locals 1747-1779 (excerpt byte-exact there, not at 1766-1772; the row's "16 LOC" is really 34), field loop 1782-2002 (221 LOC, 13 `key ===` arms at 1797-1967 plus DEFERRED/unknown fallback, not 14), cross-field 2004-2220, bodyTypeDecls + extractParsedParams + bind-echo bypass + `system:` 2222-2338, gate + assembly 2340-2384 — and the later phases read ≥ 20 of the loop's locals as claimed; reasons-considered holds: the ≥ 6-shared-locals reason is present but concrete-only and the tool's strong-band rule demands a strong reason — none exists (docs/spec_topics/frontmatter/* pins per-field/intra-field diagnostic ordering only, bug 0263 gates just the missing-mode arm on yamlErrored, 42 --follow commits contain no reverted split, 5de65c65 "split" is the tools: comma short-form); not a duplicate — d9-01 keys the file-level host and lists parseFrontmatter as one row, d9-03 keys #toSystemParamType; breakdown shape (RecognisedFields record vs seams B/C) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified on a third independent run: size-scan map --files reproduces src/parser/frontmatter.ts#parseFrontmatter at 1701-2385 / 685 LOC / band strong with no quality/exemptions.json frontmatter row; the six phases are real sequential blocks at drifted boundaries — YAML block to 1744, 33 `let` field-state locals 1747-1779 (excerpt byte-exact there, not 1766-1772), field loop 1782-2002 with 13 `key ===` arms at 1797-1967 plus the DEFERRED_FRONTMATTER_FIELDS fallback at 1978 (not 14), cross-field diagnostics 2004-2220, bodyTypeDecls/extractParsedParams/system: 2228-2338, registered gate 2340 + assembly to 2385 — and all 33 locals are read at least once in 2004-2385, so the cross-phase coupling claim holds; reasons-considered is complete: the ≥ 6-shared-locals reason is present but is a concrete reason and the strong band demands a strong one — docs/spec_topics/frontmatter/* pins only per-field behaviour and system:-codes-before-AJV ordering, bug 0263 (lines 1720, 2007) gates only the missing-mode arm, none of the 42 --follow commits is a reverted helper extraction, no measured cost; not a duplicate — no quality/issues row cites parseFrontmatter and sibling d9-01 keys the file-level host src/parser/frontmatter.ts; the breakdown shape (RecognisedFields record vs seams A/B/C) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
