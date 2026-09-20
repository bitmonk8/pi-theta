---
id: pending
title: parseFrontmatter runs six sequential phases in one 685-LOC body coupled by ~30 field-state locals
lens: D9
status: intake
verdict: pending
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
