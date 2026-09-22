---
id: PTQ-1267
title: src/parser/frontmatter.ts still co-hosts the exported contract-type family with the field-contract parse machinery (1215 LOC, justify) after the PTQ-1146 fix
lens: D9
status: open
verdict: confirmed
locations:
  - src/parser/frontmatter.ts:1-1215
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/parser/frontmatter.ts
d9_band: justify
wave: qw20260922150013
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# src/parser/frontmatter.ts still co-hosts the exported contract-type family with the field-contract parse machinery (1215 LOC, justify) after the PTQ-1146 fix

## Observation
The file is 1215 LOC (justify band, presumption of breakdown). PTQ-1146 (confirmed,
ratified 2026-09-21) inventoried seven concerns at 2385 LOC; the fix (commit
4d18f5cf) extracted the sidecar/classifier, params-extraction, and YAML-utility
rows into system-param-types.ts, frontmatter-params.ts, and frontmatter-yaml.ts
(re-exported at lines 65-67). The ratified inventory's first row — the exported
frontmatter contract types (196 LOC) — was not moved and still lives beside the
field-contract parse machinery, keeping the file above the justify threshold.

## Evidence
Fresh distinct-concern inventory (line ranges and LOC from this wave's structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| exported frontmatter contract types | ThetaMode, ModelMatchOutcome, ModelReferenceMatcher, ParsedToolLoop, ParsedRespondRepair, ParsedParams, ParsedFrontmatter, FrontmatterParseResult, FrontmatterSchemaField, FrontmatterBodyTypes, ParseFrontmatterOptions | 70-328 | 196 |
| field-contract parse machinery | DEFERRED_FRONTMATTER_FIELDS, RecognisedFields, collectRecognisedFields, checkRecognisedFields, buildSystemTemplate, readParamFieldNames, parseFrontmatter | 344-1215 | 824 |

The types row is pure declaration, src/parser/frontmatter.ts:138-141:

```ts
/** The recognised, defaulted frontmatter a successfully-loaded theta exposes. */
export interface ParsedFrontmatter {
  /** The required `mode:` field. */
  readonly mode: ThetaMode;
```

Importer counts from the map: ParsedFrontmatter 5/80 (src/tests), ThetaMode 8/2,
ModelReferenceMatcher 4/25, FrontmatterParseResult 2/6, FrontmatterBodyTypes 4/0 —
a fan-in an order of magnitude wider than the parse entry point's (parseFrontmatter
1/3). The machinery row shares no locals with the types row: collectRecognisedFields/
checkRecognisedFields communicate through the private RecognisedFields record
(350-384), and the types row appears in the machinery only as return/parameter
annotations.

## Why this is a problem
Justify band: presumption of breakdown unless a concrete reason to keep whole is
found. Reasons considered and defeated:
- Data-only module: type declarations are 196 of 1215 LOC (~16%), far below 80% —
  the reason fails for the file even though it would hold for the types row alone.
- Single algorithm with shared local state: holds only within the machinery row
  (RecognisedFields threads ~33 fields between collect/check/parseFrontmatter);
  the types row touches none of that state.
- Closed-enumeration dispatch: only collectRecognisedFields' 13 key arms mirror the
  frontmatter-fields-a.md field contract — 271 of 1215 LOC.
- One grammar production family / generated code: not applicable (two families;
  hand-written with bug-numbered commentary).
- Exemptions: quality/exemptions.json has no key for src/parser/frontmatter.ts.
PTQ-1146's triage confirmed the contract-types row as a distinct concern three
times; the fix left it in place. Moving the 196-LOC row would put the file at
~1019 -> with its header/import share also trimmed, at or below the justify
boundary, and would let the 80-test-file ParsedFrontmatter fan-in stop importing
the parser machinery's module.

## Suggested direction (non-binding, optional)
Hypothesis, unproven. Seam A: the contract-type family (rows above, 70-328) ->
`frontmatter-contract.ts` (hypothesis) — 196 LOC; exported symbols moved: ThetaMode
(8/2), ModelMatchOutcome (1/1), ModelReferenceMatcher (4/25), ParsedToolLoop (2/0),
ParsedRespondRepair (2/0), ParsedParams (1/0), ParsedFrontmatter (5/80),
FrontmatterParseResult (2/6), FrontmatterSchemaField (0/0), FrontmatterBodyTypes
(4/0), ParseFrontmatterOptions (2/2); a re-export from frontmatter.ts (the file
already maintains three such facades at 65-67) keeps every importer unchanged;
cross-references back into the host: none (types reference only params/
schema-validator/binder-envelope imports).

## False-positive check
Band check: 1215 LOC in [1000, 2000) — justify. Reasons-considered list above with
defeating evidence per reason. Exemptions check: no frontmatter.ts key in
quality/exemptions.json. Generated-code check: hand-authored (V6a header, bug
commentary). Spec-mirror check: the field contract mirror covers only the field
loop, not the type family. Prior-filing check: PTQ-1146 is status fixed (commit
4d18f5cf landed its Seams A/B/C); this filing supplies the fresh ≥2-concern
inventory of the post-fix residual (precedent: PTQ-0351 seams-remain filing).
PTQ-1164 (parseFrontmatter) is fixed and its host is now 178 LOC — not re-filed.
Barrel check: lines 65-67 are a deliberate re-export facade, cited as the pattern
the hypothesis reuses, not as a husk.

## Triage
verdict: questionable — accounting verified: independent size-scan map --files re-run gives src/parser/frontmatter.ts 1215 LOC / band justify with no quality/exemptions.json key; all 18 declarations sit at the cited ranges and both inventory rows sum exactly from the map (types 1+1+4+4+4+8+101+21+12+27+13 = 196 at 70-328; machinery 4+35+271+259+60+17+178 = 824 at 344-1215), the 138-141 excerpt is byte-exact, importer counts (ParsedFrontmatter 5/80, ThetaMode 8/2, ModelReferenceMatcher 4/25, FrontmatterParseResult 2/6, FrontmatterBodyTypes 4/0, parseFrontmatter 1/3) match the map; the rows are distinct concerns — zero module-level let/mutable state, and the type family appears in the machinery only as 11 annotation/cast sites (options: ParseFrontmatterOptions at 924/1040, return FrontmatterParseResult at 1041, `as ThetaMode` at 1186, etc.), never as shared locals; no overlooked reason (types ~16 % of LOC, the 13-arm spec-mirror covers only collectRecognisedFields, no single-module clause in docs/spec_topics/frontmatter*, the only add/delete in frontmatter-* history is 4d18f5cf itself with no reverted split, and the ModelReferenceMatcher "declared in-leaf" note guards against a forward edge onto binder-model, which a sibling parser module preserves); not a duplicate — PTQ-1146 is resolved/fixed by 4d18f5cf (Seams A/B/C landed, types row untouched) and PTQ-1164/1231/1238 target function-level or D8 root causes, so this is the post-fix residual with a fresh ≥ 2-concern inventory per the PTQ-0351 precedent; the target shape (move vs keep) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: fresh size-scan map --files re-run gives src/parser/frontmatter.ts 1214 LOC (one-line drift from the cited 1215) / band justify, no frontmatter key in quality/exemptions.json; all 18 declarations sit within one line of the cited ranges and both rows sum exactly from the map (types 1+1+4+4+4+8+101+21+12+27+13 = 196 at 69-327; machinery 4+35+271+259+60+17+178 = 824 at 343-1214), the ParsedFrontmatter excerpt is byte-exact at 137-140, importer counts (ParsedFrontmatter 5/80, ThetaMode 8/2, ModelReferenceMatcher 4/25, FrontmatterParseResult 2/6, FrontmatterBodyTypes 4/0, parseFrontmatter 1/3) match; rows are distinct — zero module-level let/mutable state and the type family reaches the machinery only as annotations/casts (663, 923, 1039-1040, 1184-1185); no overlooked reason (types ~16 % < 80 %, the 13-arm field-contract mirror covers only collectRecognisedFields, 4d18f5cf is the only frontmatter-* split with no revert); minor slip: the re-export facade is two lines (65-66), not three; not a duplicate — PTQ-1146 sits in quality/resolved as status fixed and no open quality/issues row cites src/parser/frontmatter.ts, so this is the post-fix residual with a fresh ≥ 2-concern inventory (PTQ-0351 precedent); the target shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified on a third independent run: size-scan map --files gives src/parser/frontmatter.ts 1214 LOC / band justify (one-line drift from 1215), no frontmatter key in quality/exemptions.json; all 18 declarations sit within one line of the cited ranges and both rows sum exactly from the map (types 196 at 69-327, machinery 4+35+271+259+60+17+178 = 824 at 343-1214), the ParsedFrontmatter excerpt is byte-exact at 137-140; the rows are distinct concerns — zero module-level let/var, and grep of the 11 type names below line 343 hits only parameter/return annotations and casts (663, 923, 1039-1040, 1178, 1181, 1184-1185), never shared locals or fields; no overlooked reason — types are ~16 % of LOC (< 80 %), the 13-arm field-contract spec mirror covers only collectRecognisedFields, the header's V6a-T/V6a origin note and the ModelReferenceMatcher "declared in-leaf" comment guard only against a forward edge onto binder-model (a sibling parser module preserves that), no single-module clause in docs/spec_topics/frontmatter*, and --follow history shows no reverted split (5de65c65 "split" is the tools: comma short-form; 4d18f5cf is the only extraction); minor slip: the re-export facade is two lines (65-66), not three; not a duplicate — PTQ-1146/1164/1238/1240 are all status fixed in quality/resolved and no open quality/issues row cites src/parser/frontmatter.ts, so this is the post-fix residual with a fresh ≥ 2-concern inventory (PTQ-0351 precedent); D9 never confirms — whether to move the 196-LOC type family or keep the file whole is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-22): confirmed - batch ruling over the RFC-0015-era review wave; triage verification trusted.
