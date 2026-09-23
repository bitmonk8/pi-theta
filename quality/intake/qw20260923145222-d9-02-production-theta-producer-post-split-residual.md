---
id: pending
title: production-theta-producer.ts still bundles the typed-query/respond-tool cluster with note emission, invocation lifecycle, and prompt binding at 1441 LOC after the PTQ-1285 split landed
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:1-1441
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/extension/production-theta-producer.ts
d9_band: justify
wave: qw20260923145222
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# production-theta-producer.ts still bundles the typed-query/respond-tool cluster with note emission, invocation lifecycle, and prompt binding at 1441 LOC after the PTQ-1285 split landed

## Observation
src/extension/production-theta-producer.ts is 1441 LOC (structural map; justify band, file threshold 1000). PTQ-1285 (confirmed, fixed) filed the pre-split file at 6474 LOC with a ratified ten-concern inventory; the fix extracted the binder run (binder-run.ts), the subagent spawn & child-side regime (subagent-spawn-regime.ts), the invoke machinery (invoke-machinery.ts), the tool-call ladder (tool-call-ladder.ts), callable lowering (callable-lowering.ts), query wire-text rendering (query-text-render.ts), and the deps surface (production-producer-deps.ts) — the module header (lines 16-24) names each landed seam. One ratified concern row from PTQ-1285's confirmed inventory — "typed-query resolution & respond tool" (~440 LOC then) — was not extracted and remains in-file at ~478 LOC (958-1437), alongside three other residual clusters.

## Evidence
Fresh distinct-concern inventory (member names and ranges from the structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| typed-query resolution & respond tool | #resolvePromptQuery, #buildLiveModelOptions, #resolveThetaModel, #buildRespondTurnContext, #registerRespondTool, #buildRespondToolDefinition, #executeRespondTool, #buildTypedValidation | 958-1437 | ~478 |
| prompt-mode conversation binding | #buildPromptHostDeps, bindPromptConversation | 688-922 | ~234 |
| system-note emission | emitTopLevelErrNote, emitPanicNote, #systemNoteChannel, #buildGroupAEventOrFallback, #emitCleanCancelNote, #trackForwardingSources | 384-583 | ~130 |
| invocation lifecycle & registry bookkeeping | #recordInvokeHop, beginInvocation, #openInvocationTicket, #deriveInvocationAbort | 323-341, 594-685 | ~94 |
| deps factory, facade accessors, subagent delegation stubs | createProductionProducerDeps, schemaValidator, runCard, runBinder, spawnSubagentConversation, isSubagentRootFor, driveSubagentRootRegime | 201-205, 348-365, 928-949 | ~30 |

The respond cluster's own state is confined to it: `#respondRegistrationCache` (236) and `#activeRespondCapture` (245) are read/written only by #registerRespondTool / #executeRespondTool / #buildRespondTurnContext; the note-emission cluster's `#ledger` (255) is shared only with #recordInvokeHop. #resolvePromptQuery (958, excerpt): "Resolve one `@`-query to its live dispatch … An untyped query drives one plain-text turn (PIC-53); a schema-typed query forces a structured respond turn" — QRY/PIC-44 respond machinery, disjoint from the note-emission cluster's SNK/SLSH-5 rendering (emitTopLevelErrNote, 384) and from the Decision-6 registry bookkeeping (#openInvocationTicket, 615).

## Why this is a problem
Justify band (1441 LOC ≥ 1000): presumption of breakdown unless a concrete reason to keep whole is recorded. Reasons considered and defeated: (a) single algorithm with shared local state — the clusters share only `#input` plus cluster-confined caches (counts above: 2 respond-only fields, 1 ledger field shared by two adjacent members); (b) closed-enumeration dispatch — no single spec table; the clusters cite disjoint families (QRY-14/PIC-44 vs SNK/SLSH-5 vs Decision 6/EXST-4 vs PIC-53/CANCEL-2); (c) data-only — executable bodies dominate, type/interface LOC is a small fraction; (d) generated — hand-authored; (e) human ruling — quality/exemptions.json holds only the D8 `#firstAdmittingArmProperties` row for this file, no D9 key. PTQ-1285 is status fixed and its confirmed inventory named the typed-query/respond cluster as a distinct concern — this is the post-fix residual with a fresh ≥2-concern inventory, the same pattern PTQ-1285 itself followed after PTQ-1150.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: the typed-query resolution & respond-tool cluster (958-1437) -> a respond-turn module beside live-prompt-query-driver.ts, which already hosts LivePromptQueryModel / RESPOND_* constants this cluster consumes (hypothesis) — ~478 LOC, exported symbols moved: none (all private members; 0 external importers), cross-references back into the host: #input, #respondRegistrationCache, #activeRespondCapture (would move with it). Seam B: the system-note emission cluster (384-583) -> a producer note-emission helper (hypothesis) — ~130 LOC, emitTopLevelErrNote/emitPanicNote consumed through ThetaProducerDeps (theta-composition-contract.ts), cross-reference back: #ledger. Seam C: none identified yet for the invocation-lifecycle cluster.

## False-positive check
Band: map-quoted 1441 LOC / justify; not recounted. Reasons-considered list above with defeating evidence. Exemptions check: only `D8:src/extension/production-theta-producer.ts#firstAdmittingArmProperties` exists. Generated-code check: hand-authored. Spec-mirror check: clusters cite disjoint spec families, no single closed enumeration. Duplicate check: PTQ-1150 and PTQ-1285 (same host key) are both status fixed in quality/resolved — this is the post-fix residual; the member-level PTQ-1188/1194 (bindPromptConversation, #resolvePromptQuery) are also resolved and their post-fix bodies are dispositioned keep-whole in this wave's notes (shared-local-state at justify), which does not conflict with the file-level inventory. Barrel check: the export/re-export block (lines 41-73) is the deliberate PTQ-1285 compatibility facade, not counted as a concern and not a husk claim.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 1441 LOC / band justify (threshold 1000) for src/extension/production-theta-producer.ts; all five inventory rows reproduce member-for-member and line-for-line against the current declaration table (respond cluster #resolvePromptQuery…#buildTypedValidation 958-1437, prompt bind 688-922, note emission 384-583, lifecycle 323-341/594-685, facade stubs 201-205/348-365/928-949); the state-confinement claims hold by grep — `this.#respondRegistrationCache` only at 1326, `this.#activeRespondCapture` only at 1301/1304/1382, `this.#ledger` only at ctor 308 + #recordInvokeHop 330/336 + emitTopLevelErrNote 388, and the unlisted `#promptToolLoopGovernor` (1027/1168) is likewise respond-cluster-only, so the typed-query/respond row is a genuinely distinct concern rather than an adjective split (one minor row slip — #trackForwardingSources at 472 is Decision-6 forwarding bookkeeping reached from bindPromptConversation:911 and the subagent regime, not note rendering — does not collapse the ≥2-concern inventory); no overlooked reason — quality/exemptions.json holds only `D8:…#firstAdmittingArmProperties` for this file (no D9 key), no generator banner, type/interface LOC is a small fraction, header cites several spec topics rather than one invariant or enumeration, and the PTQ-1150/PTQ-1285 seams landed (binder-run.ts, subagent-spawn-regime.ts, invoke-machinery.ts, tool-call-ladder.ts, callable-lowering.ts, query-text-render.ts, production-producer-deps.ts all present, commits 927b8b63/f1b77776/48b6a1b7) rather than reverted; not a duplicate — PTQ-1150 and PTQ-1285 (same host key) are both status fixed in quality/resolved and PTQ-1285's ratified inventory named this exact typed-query/respond row as an unextracted concern, so this is the post-fix residual with a fresh inventory (same pattern PTQ-1285 followed after PTQ-1150), and the only open issue touching this path (PTQ-1407) is a D7 test filing; the target shape (seam A respond module vs seam B note-emission helper, and their homes) is a design decision for a human ruling (triage: claude-fable-5-1)
