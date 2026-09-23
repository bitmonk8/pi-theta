---
id: PTQ-1283
title: collectRecognisedFields is a 271-LOC single function (strong band) whose 14 field arms and unknown-key fallback all live inline around one mutable record
lens: D9
status: fixed
verdict: confirmed
locations:
  - src/parser/frontmatter.ts:386-656
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/frontmatter.ts#collectRecognisedFields
d9_band: strong
wave: qw20260922164435
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# collectRecognisedFields is a 271-LOC single function (strong band) whose 14 field arms and unknown-key fallback all live inline around one mutable record

## Observation
`collectRecognisedFields` (src/parser/frontmatter.ts:386-656, 271 LOC per the structural map, private, importers 0/0) is the recognised-frontmatter field loop: it walks the YAML map's items once and assigns each recognised key's value/presence/range into a single mutable `RecognisedFields` record. It was minted by the PTQ-1164 fix (commit 4d18f5cf, Seam A of that ratified split) and reshaped by the PTQ-1238 fix (commit edfc6689, the one-mutable-record accumulator). It lands in the strong band (>= 200), and quality/exemptions.json carries no row for this host.

## Evidence
Step inventory (phases, line ranges, LOC; every arm writes only the shared `fields` record and the `diagnostics` sink):

| phase | lines | LOC | locals read/written |
|---|---|---|---|
| 33-field mutable record init | 396-431 | 36 | writes fields |
| loop scaffold: scalar-key gate, key/keyRange/rawValue/valueRange | 433-448 | 16 | reads map; writes key, keyRange, rawValue, valueRange |
| `mode` arm | 449-463 | 15 | fields |
| `model` arm | 464-469 | 6 | fields |
| `bind_model` arm | 470-483 | 14 | fields |
| `description` arm | 484-498 | 15 | fields |
| `argument-hint` arm | 499-514 | 16 | fields |
| `bind_echo` arm | 515-533 | 19 | fields |
| `params` arm | 534-539 | 6 | fields |
| `bind_context` arm | 540-554 | 15 | fields |
| `tools` arm (scalar/sequence/refusal split, bug 0104/0206) | 555-588 | 34 | fields |
| `system` arm (null-scalar mapping, bug 0299) | 589-610 | 22 | fields |
| `tool_loop` / `respond_repair` node capture | 611-618 | 8 | fields |
| `timeout` rejection (NOCEIL-1) | 619-629 | 11 | diagnostics |
| deferred-field / unknown-key fallback | 630-653 | 24 | diagnostics |

Representative arm shape, src/parser/frontmatter.ts:464-469:

```ts
      if (key === "model") {
        fields.modelPresent = true;
        fields.modelRaw = rawValue;
        fields.modelRange = valueRange;
        continue;
      }
```

Importer counts from the map: `collectRecognisedFields` 0/0 (file-private, one caller — `parseFrontmatter` at :1082).

## Why this is a problem
Strong-band presumption of breakdown: 271 LOC >= 200 with no strong concrete reason on record. Reasons considered and why each fails:
- Closed-enumeration dispatch: the arms mirror the theta 1.0 field vocabulary (docs/spec_topics/frontmatter/frontmatter-fields-a.md §Field contract; the fallback comment at :641-643 cites it by name), and the longest arm (`tools`, 34 LOC) is bounded — this concrete reason would suffice in the justify band, but the host is strong-band and the same triage reasoning that confirmed PTQ-1164 ("concrete-only, strong band requires a strong reason") applies here.
- Single algorithm with shared local state: the arms share exactly two carriers — the `fields` record and the `diagnostics` sink — not 6+ locals; each arm reads only the loop's four per-item locals (key, keyRange, rawValue, valueRange). Fails as a reason and simultaneously shows the seam is cheap.
- Data-only: the init record is 36 of 271 LOC (~13%), far under 80%. Fails.
- Grammar production / generated code: hand-written, bug-numbered (0104, 0206, 0297, 0299), no generator marker. Fails.
Strong reasons: no spec clause pins the loop as one critical section — the doc comment's contract (":391 emit per-key diagnostics in YAML source order") is preserved by dispatching to per-arm helpers in loop order; no measured cost cited; no prior split reverted (git log --follow: 4d18f5cf minted this helper as the PTQ-1164 fix, edfc6689 collapsed the roster per PTQ-1238 — both landed and stuck); no human ruling in quality/exemptions.json.

## Suggested direction (non-binding, optional)
Hypotheses, unproven, in confidence order. Seam A: the 12 recognised-key arms (:449-618) -> per-field handler functions (or a handler table keyed by field name) each taking (item, keyRange, valueRange, rawValue, fields, diagnostics) — ~180 LOC, no exported symbols move, 0 external importers, cross-references back into the host: renderNonScalarModeKind, renderNonScalarBindContextKind, extractToolsList. Seam B: the timeout/deferred/unknown fallback diagnostics (:619-653) -> a `reportUnrecognisedKey(key, keyRange, file, diagnostics)` helper — ~35 LOC, nothing exported, back-reference: DEFERRED_FRONTMATTER_FIELDS. Seam C: none identified yet.

## False-positive check
- Band: 271 LOC per the structural map (386-656), strong (>= 200); not recounted by hand.
- Exemptions check: quality/exemptions.json has no row for src/parser/frontmatter.ts or this function host (four rows total, none on this path).
- Reasons-considered list recorded above with the evidence defeating each.
- Generated-code check: hand-written with bug-numbered inline rationale; no generator.
- Spec-mirror check: the arms mirror frontmatter-fields-a.md's field contract, but the init record (36 LOC), loop scaffold (16 LOC), and fallback (35 LOC) are not enumeration arms, and the spec-mirror defence is a concrete reason only — insufficient at strong per the PTQ-1164 triage precedent.
- Duplicate check: PTQ-1164 (fixed) keyed #parseFrontmatter and its fix minted this helper; PTQ-1146 (resolved) keyed the file-level host at its pre-split 2385-LOC shape; PTQ-1238 (fixed, D8) filed the roster spelling, not the function's size — no existing filing keys this host.

## Triage
verdict: questionable — accounting verified: independent size-scan map --files re-run gives src/parser/frontmatter.ts#collectRecognisedFields 386-656 / 271 LOC / band strong with no quality/exemptions.json row for the file or function key; the inventory rows sit at the cited lines (record init 396-431, scaffold 433-448, arms 449-618, timeout 619-629, deferred/unknown fallback 630-653) and the `model` excerpt is byte-exact at 464-469; the rows are distinct carriers — the arms write only `fields`, the last three rows write only `diagnostics`, and each arm reads only the four per-item locals — so field capture vs unrecognised-key diagnostics is a real ≥ 2-concern inventory; one slip: 13 `key ===` arms by grep (mode, model, bind_model, description, argument-hint, bind_echo, params, bind_context, tools, system, tool_loop, respond_repair, timeout), not 14; reasons-considered holds — the closed-enumeration mirror of frontmatter-fields-a.md §Field contract (line 28) is present and is why two prior shards KEEP-WHOLE'd this host (REVIEW_LOG 595/622), but it is a concrete reason and size-scan.mjs:60/70's strong-band rule demands a strong one, the same reasoning the human ratified on PTQ-1164; no spec clause pins a single pass, no measured cost, no reverted split (4d18f5cf minted it, edfc6689 reshaped it, both stuck); single live caller at :1082 (grep src/ tests/ extensions/ tools/); not a duplicate — PTQ-1164 keyed #parseFrontmatter and is resolved, PTQ-1238 is D8 on the roster spelling, the sibling qw20260922150013-d9-02 intake keys the file-level host, so this is the post-fix residual with a fresh inventory (PTQ-0351 precedent); the target shape (per-field handlers/table vs keep the spec-mirror loop whole) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified on an independent re-run: size-scan map --files gives src/parser/frontmatter.ts#collectRecognisedFields 386-656 / 271 LOC / band strong, importers 0/0, sole live caller parseFrontmatter at :1082 (grep src/ tests/ extensions/ tools/), no frontmatter key in quality/exemptions.json; the inventory rows sit at the cited lines (33-field record init 396-431, scaffold 433-448, arms 449-618, timeout 619-629, deferred/unknown fallback 630-653) and the `model` excerpt is byte-exact at 464-469; rows are distinct carriers — the key arms write only `fields` from the four per-item locals while the last three rows write only `diagnostics`, so field capture vs unrecognised-key diagnostics is a real ≥ 2-concern inventory; one slip: 13 `key ===` arms by grep, not 14; reasons-considered holds — the closed-enumeration mirror of frontmatter-fields-a.md §Field contract (line 28) is real and is why REVIEW_LOG 595/622 KEEP-WHOLE'd this host, but it is a concrete reason and the strong band requires a strong one (the reasoning the human ratified on PTQ-1164 for this same file), no spec clause pins a single pass, no measured cost, no reverted split (4d18f5cf minted, edfc6689 reshaped, both stuck); not a duplicate — PTQ-1164/1146/1238 sit in quality/resolved and key #parseFrontmatter, the pre-split file host, and the D8 roster spelling respectively, sibling qw20260922150013-d9-02 keys the file-level host, so this is the post-fix residual with a fresh inventory (PTQ-0351 precedent); the target shape (per-field handlers/table vs keep the spec-mirror loop whole) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-22): confirmed - batch ruling over the RFC-0015-era review wave; triage verification trusted.
