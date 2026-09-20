---
id: pending
title: subagent-envelope.ts bundles serialization, parsing, failure mapping, and wire-form walks at 989 LOC (zone band)
lens: D9
status: intake
verdict: pending
locations:
  - src/runtime/subagent-envelope.ts:1-989
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/runtime/subagent-envelope.ts
d9_band: zone
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# subagent-envelope.ts bundles serialization, parsing, failure mapping, and wire-form walks at 989 LOC (zone band)

## Observation
`src/runtime/subagent-envelope.ts` is 989 LOC (zone band). Its header (lines 1-30) states the module owns the reserved-key constant and pinned schema, child-side serialisation, parent-side line classification/parsing/scanning, versioning + skew detection, the advisory wire-parse diagnostic, and the fail-closed mappings for five failure classes. Beyond that roster it also hosts the wire-form representability walks (`WireNode`, `classifyWireNode`, `firstNonFiniteNumber`, `wireFormExceedsDepthCap`), which are pre-serialization return-value validation, not envelope encode/decode.

## Evidence
Distinct-concern inventory (line ranges and per-declaration LOC from the structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| envelope schema and child-side serialization | THETA_RESULT_KEY, THETA_ENVELOPE_VERSION, EnumTagEntry, EnvelopeOk, FnTail, ErrProvenance, EnvelopeErr, serializeOkEnvelope, NEGATIVE_ZERO_SENTINEL_SEED, mintNegativeZeroSentinel, stringifyPreservingNegativeZero, serializeErrEnvelope | 62-294 | 79 |
| parent-side line classification and parsing | EnvelopeParse, ChildStdoutLineClass, classifyChildStdoutLine, lineCarriesReservedKey, parseEnumTagsSidecar, parseErrProvenance, parseFnTail, parseEnvelopeLine, EnvelopeScan, scanStreamForEnvelope, summarizeLine | 301-515 | 133 |
| failure-class diagnostic mappings | SUBAGENT_ENVELOPE_PARSE_FAILED_CODE, SUBAGENT_WIRE_PARSE_FAILED_CODE, SUBAGENT_ENVELOPE_SCHEMA_SKEW_CODE, SUBAGENT_EXIT_WITHOUT_ENVELOPE_CODE, SUBAGENT_RETURN_VALUE_NOT_REPRESENTABLE_CODE, EnvelopeFailureMapping, mapEnvelopeParseFailure, mapWireParseFailure, mapEnvelopeSchemaSkew, mapExitWithoutEnvelope | 134-153, 518-628 | 84 |
| wire-form representability walks | WireNode, SCALAR_WIRE_NODE, classifyWireNode, NonFiniteHit, escapePointerToken, firstNonFiniteNumber, wireFormExceedsDepthCap, mapTooDeepReturnValue, mapNonRepresentableReturnValue | 644-989 | 117 |

The fourth cluster's own comment marks the boundary (lines 630-634): "The shared wire-form node classifier both bounded walks below consult (bug 0201 §Fix (a))"; its consumers include an external module the comment names, `wireFormDepthWalk` (`./wire-form-depth-walk.ts`). `serializeOkEnvelope`'s doc (lines 160-174) states the dependency is caller-ordered, not code-coupled: "The caller establishes `value`'s representability AND depth before calling this". Importer counts (map): classifyWireNode 1/4, mapTooDeepReturnValue 1/5, mapNonRepresentableReturnValue 1/4 — one production importer each, distinct from serializeOkEnvelope's (1/14) and parseEnvelopeLine's (1/13) consumers.

## Why this is a problem
Zone band: a breakdown finding needs a distinct-concern inventory with ≥ 2 concerns — the table above has four. The wire-form walk cluster (644-989, 117 declaration LOC, ~346 physical lines) shares no state or calls with serialization or parsing: `firstNonFiniteNumber` and `wireFormExceedsDepthCap` are consulted by `driveSubagentRootRegime` (per mapTooDeepReturnValue/mapNonRepresentableReturnValue docs) before `serializeOkEnvelope` runs, never by any function in the first two clusters. Reasons considered and defeated: data-only module — no (function bodies dominate: parseEnvelopeLine 47 LOC, firstNonFiniteNumber 32, wireFormExceedsDepthCap 23); single algorithm with shared local state — no (module-level clusters, no shared locals); closed-enumeration dispatch — the five failure classes are a closed set but cover only the mapping cluster (84 LOC), not the file; generated code — hand-written.

## Suggested direction (non-binding, optional)
Hypotheses, unproven: Seam A: wire-form representability walks (644-989) -> `subagent-wire-form.ts` (hypothesis) - ~346 lines, exported symbols moved: WireNode (0/3), classifyWireNode (1/4), mapTooDeepReturnValue (1/5), mapNonRepresentableReturnValue (1/4); cross-references back into the host: SUBAGENT_RETURN_VALUE_NOT_REPRESENTABLE_CODE and the InvokeInfraError shape (both re-importable). Seam B: failure-class mappings (518-628 plus codes 134-153) -> `subagent-envelope-failures.ts` (hypothesis) - ~130 lines, exports moved: mapEnvelopeParseFailure (1/6), mapWireParseFailure (1/4), mapEnvelopeSchemaSkew (1/4), mapExitWithoutEnvelope (1/4); cross-references back: summarizeLine, THETA_ENVELOPE_VERSION.

## False-positive check
Band: 989 LOC, zone per the structural map — filing rests on the 4-row concern inventory above, not a presumption. Reasons-considered list: all five concrete reason classes checked and defeated above. Exemptions check: `grep -n "subagent" quality/exemptions.json` — no hit. Generated-code check: hand-authored (bug/RFC commentary throughout). Spec-mirror check: the failure-class mappings mirror PIC-59's fail-closed classes, but that spec set bounds only the 84-LOC mapping cluster. Duplicate check: qw20260920183643-d4-22-subagent-envelope-failure-mappings-cloned is a D4 clone claim about the mapping bodies, not a file-breakdown claim; no D9 filing targets this file.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 989 LOC / zone; all four inventory rows' line ranges, members and LOC sums (79/133/84/117) match the map, importer counts (1/4, 1/5, 1/4, 1/14, 1/13) match; the wire-form walk cluster (644-989) shares no state with serialization/parsing (imports depth-walk, not the schema constants) so ≥ 2 distinct concerns hold even if rows 1+2 (shared THETA_RESULT_KEY/VERSION/sidecar types) and rows 3+4 (shared EnvelopeFailureMapping/NOT_REPRESENTABLE code) each collapse; no exemption (quality/exemptions.json has no subagent-envelope row), no spec clause names the file, no reverted prior split in git log, hand-written and function-dominated — nit: the header's five-class roster does already claim the depth/non-finite refusals, so the walks are that roster's machinery rather than "beyond" it, which does not change the count; target shape (Seam A/B) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: size-scan map reproduces 989 LOC / zone with no exemption row; all four inventory rows' members, ranges and LOC sums (79/133/84/117) and the importer counts match the map; the walk cluster (644-989) is never called by any serialisation/parsing function (line 86 is doc-only) and leans on depth-walk plus only EnvelopeFailureMapping/NOT_REPRESENTABLE_CODE from row 3, so ≥ 2 distinct concerns hold even collapsing rows 1+2 and 3+4; type/const LOC ≈ 61/413 (~15 %), the closed five-class set bounds only the 84-LOC mapping cluster, spec names codes/PIC-59 not the module, and git history shows no prior split of the hypothesised files — nit: header lines 22-34 already roster the depth/non-finite refusals, so the Observation's "beyond that roster" framing is inaccurate without changing the count; the Seam A/B target shape is a design decision for a human ruling (triage: claude-fable-5-1)
