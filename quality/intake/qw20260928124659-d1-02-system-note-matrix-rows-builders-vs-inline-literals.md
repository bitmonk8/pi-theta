---
id: pending
title: The five-row theta-system-note details matrix is realised two ways — the event and recovery rows through runtime-event-channel.ts's row builders, the diagnostics-batch, panic, and structural rows as inline object literals at eight production sites while their builders have no production caller
lens: D1
status: intake
verdict: pending
locations:
  - src/runtime/runtime-event-channel.ts:1-6
  - src/runtime/runtime-event-channel.ts:248-283
  - src/runtime/runtime-event-channel.ts:318-333
  - src/extension/binder-run.ts:853
  - src/extension/production-theta-producer.ts:434
  - src/runtime/query-discard.ts:130
  - src/binder/binder-model.ts:337
  - src/extension/production-theta-producer.ts:455-460
  - src/extension/system-note-channel.ts:436-442
  - src/extension/reload-wiring.ts:489-493
  - src/extension/watcher-recovery.ts:160-167
  - src/extension/binder-run.ts:803-810
  - src/extension/production-composition.ts:2710-2717
  - src/extension/production-composition.ts:5077-5085
  - src/extension/subagent-spawn-regime.ts:645-651
sites: 15
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# The five-row theta-system-note details matrix is realised two ways — the event and recovery rows through runtime-event-channel.ts's row builders, the diagnostics-batch, panic, and structural rows as inline object literals at eight production sites while their builders have no production caller

## Observation
`runtime-event-channel.ts` declares itself the owner of "the `display`/`content` matrix across the five `details` variants" (header, :3-4) and exports one builder per row: `buildRuntimeEventNote`, `buildDiagnosticsBatchNote`, `buildPanicNote`, `buildStructuralNote`, `buildRecoveryNote`, plus the emitters `emitRuntimeEvent` / `emitPanic`. Production constructs the event row through `buildRuntimeEventNote` / `emitRuntimeEvent` (3 sites) and the recovery row through `buildRecoveryNote` (1 site). Production constructs the diagnostics-batch row (6 sites), the panic row (1 site, `emitPanicNote`), and the structural row (1 site) as inline `{ content, display: true, details: { … } }` literals; `buildDiagnosticsBatchNote`, `buildPanicNote`, `buildStructuralNote`, and `emitPanic` have zero callers outside `tests/runtime-event-channel.test.ts`.

## Evidence

The ownership claim, src/runtime/runtime-event-channel.ts:1-6:
```ts
// V9d / V9d-T — the runtime-event channel and `masked` hard-ceiling co-fire.
//
// This module owns the group-A `details: { event: RuntimeEvent }` runtime-event
// shape, the `display`/`content` matrix across the five `details` variants, the
// always-log set with its success-side null-policy, the group-A/B single-shape
// routing, the dedup tuple, and the PIC-1 `masked` co-fire field
```

Way A — the row builders (three with no production caller), src/runtime/runtime-event-channel.ts:252-283:
```ts
export function buildDiagnosticsBatchNote(
  diagnostics: readonly Diagnostic[],
  content: string,
): SystemNote {
  return { content, display: true, details: { diagnostics } };
}
...
export function buildPanicNote(
  diagnostic: Diagnostic,
  framing: string,
): SystemNote {
  return {
    content: framing,
    display: true,
    details: { diagnostics: [diagnostic] },
  };
}
```
and :322-333:
```ts
export function emitPanic(
  diagnostic: Diagnostic,
  framing: string,
  deps: SystemNoteChannelDeps,
): void {
  // Exactly one `theta-system-note` per top-level panic, routed through the
  // single-element `details: { diagnostics: [Diagnostic] }` group-B shape. The
  // cascade-twin dedup key does not apply to group B.
  sendSystemNote(buildPanicNote(diagnostic, framing), deps);
}
```

Way A in production use (event and recovery rows). Command: `grep -rn "buildRuntimeEventNote(\|emitRuntimeEvent(\|buildRecoveryNote(" src/ --include=*.ts | grep -v "^src/runtime/runtime-event-channel.ts" | grep -v "^\S*:[0-9]*:\s*[/*]"` — 5 hits:
```
src/binder/binder-model.ts:337:  return buildRecoveryNote(
src/extension/binder-run.ts:853:      buildRuntimeEventNote(event, { topLevelCascade: true, userFacingTemplate: content }),
src/extension/production-theta-producer.ts:434:      buildRuntimeEventNote(resolvedEvent, { topLevelCascade: true, userFacingTemplate: content }),
src/runtime/query-discard.ts:130:  emitRuntimeEvent(event, { topLevelCascade: false, userFacingTemplate: "" }, deps);
src/runtime/tool-call-off-surface.ts:415:  emitRuntimeEvent(event: RuntimeEvent): void;
```
(the fifth is an interface member, not a call).

Way B — the panic row inline, src/extension/production-theta-producer.ts:455-460 (the production top-level-panic emitter; byte-equivalent to `buildPanicNote(diagnostic, framing)`):
```ts
  emitPanicNote(framing: string, diagnostic: Diagnostic): void {
    sendSystemNote(
      { content: framing, display: true, details: { diagnostics: [diagnostic] } },
      this.#systemNoteChannel(),
    );
  }
```

Way B — the diagnostics-batch row inline, src/extension/system-note-channel.ts:436-442 (the shared batch emitter):
```ts
  deliverOperatorNotePreferringEntry(
    {
      content: renderDiagnosticBatch(diagnostics),
      display: true,
      details: { diagnostics },
    },
    deps,
```
and src/extension/watcher-recovery.ts:160-167:
```ts
        sendSystemNote(
          {
            content: renderDiagnosticLine(diagnostic),
            display: true,
            details: { diagnostics: [diagnostic] },
          },
          deps.channel,
        );
```

Way B — the structural row inline, src/extension/reload-wiring.ts:489-493:
```ts
  return {
    content: `theta watcher: ${count} file(s) added or removed; run /reload to refresh the slash command list`,
    display: true,
    details: { structural: { added, removed } },
  };
```

Every inline diagnostics-row site. Command: `grep -rn "details: { diagnostics" src/ --include=*.ts | grep -v "^\S*:[0-9]*:\s*[/*]"` — 9 hits:
```
src/extension/binder-run.ts:807:        details: { diagnostics: [customTypeUnsafeDiagnostic(value)] },
src/extension/production-composition.ts:2714:          details: { diagnostics: [diagnostic] },
src/extension/production-composition.ts:5082:          details: { diagnostics: [diagnostic] },
src/extension/production-theta-producer.ts:457:      { content: framing, display: true, details: { diagnostics: [diagnostic] } },
src/extension/subagent-spawn-regime.ts:648:            details: { diagnostics: [rendered.diagnostic] },
src/extension/system-note-channel.ts:440:      details: { diagnostics },
src/extension/watcher-recovery.ts:164:            details: { diagnostics: [diagnostic] },
src/runtime/runtime-event-channel.ts:256:  return { content, display: true, details: { diagnostics } };
src/runtime/runtime-event-channel.ts:270:    details: { diagnostics: [diagnostic] },
```
(7 production literals + the 2 builders). Command: `grep -rn "details: { structural" src/ --include=*.ts | grep -v "^\S*:[0-9]*:\s*[/*]"` — 2 hits:
```
src/extension/reload-wiring.ts:492:    details: { structural: { added, removed } },
src/runtime/runtime-event-channel.ts:282:  return { content, display: true, details: { structural } };
```

Production callers of the three bypassed builders and `emitPanic`. Command: `grep -rn "buildPanicNote\|buildDiagnosticsBatchNote\|buildStructuralNote\|emitPanic\b" src/ extensions/ tools/ --include=*.ts --include=*.mjs | grep -v "^src/runtime/runtime-event-channel.ts"` — 0 hits. Command: `grep -rln "buildPanicNote\|buildDiagnosticsBatchNote\|buildStructuralNote\|emitPanic\b" tests/` — 1 hit:
```
tests/runtime-event-channel.test.ts
```

Drift that already happened on a sibling row (docs/bugs/0383-slsh4-note-details-event-empty.md, "Kind" and "Affected" paragraphs):
```
- **Kind:** defect — implementation diverges from a stated wire-shape rule
  (`slash-invocation.md:63`), with an adjacent doc/impl inconsistency: the
  conformant builder exists in-tree (`buildRuntimeEventNote`) and the SLSH-3
  emitter does not use it.
...
  - `src/runtime/runtime-event-channel.ts:236–247` — `buildRuntimeEventNote`,
    the conformant `details: { event }` builder (real event, cascade-driven
    `display`). Its only production caller is the query-discard path
```
and its fix constraint 2 (same file, "Constraints any fix must satisfy"):
```
2. The seven sibling `{ event: {} }` sites must not be blanket-"fixed" into
   fabricated events; each note's correct `details` arm comes from PIC's
   System-notes matrix (`buildDiagnosticsBatchNote` / structural / recovery /
   event), and notes with no matrix row need a spec decision first (DIAG-2
   discipline).
```
Command: `git log --oneline -S"buildRuntimeEventNote(" -- src/` — 5 hits:
```
f1b77776 quality: qw20260923023517 fix d9/src__extension__production-theta-producer.ts
ec2a8ac2 fix(bug-0397, bug-0399): binder-failure notes carry sourced RuntimeEvents; boundary event completes — v0.392.0 / v0.393.0
094f1dc2 fix(bug-0383): SLSH-4 note details carry a real RuntimeEvent — v0.360.0
86d7bfbf V9d — runtime-event channel and masked co-fire implementation
66feddf6 V9d-T — runtime-event channel and masked co-fire failing tests + seam
```
Command: `git log --oneline -S"buildPanicNote(" -- src/` — 2 hits (`86d7bfbf`, `66feddf6`), both the seam's own commits; `-S"buildDiagnosticsBatchNote("` — 1 hit (`66feddf6`); `-S"buildStructuralNote("` — 1 hit (`66feddf6`). The event row was migrated onto its builder by the bug-0383 fix; no later commit migrated the other three rows.

Self-inconsistency statement: no written rule exists requiring notes to be built through `runtime-event-channel.ts`; the anchor is self-inconsistency (two of five rows go through the module that declares ownership of the matrix, three do not) plus the cost cited below.

## Why this is a problem
Two mechanisms build one wire shape. Bug 0383 is the recorded cost of the inline mechanism on the event row: the conformant builder existed, the emitter hand-built the literal instead, and the literal drifted from the matrix (`details: { event: {} }`) until an operator-tooling consumer could not read it. The fix migrated that one row onto `buildRuntimeEventNote` and, in its constraint 2, named the sibling builders as "PIC's System-notes matrix" — yet the diagnostics-batch, panic, and structural rows are still built by hand at eight production sites, each re-deciding `display: true` and the `details` key locally, while the builders that pin those decisions are exercised only by `tests/runtime-event-channel.test.ts`. The concrete misread is in the module's own text: `emitPanic`'s comment says "Exactly one `theta-system-note` per top-level panic" (:328), but the production top-level panic emitter is `emitPanicNote` in `production-theta-producer.ts:455-460`, which never calls it — a maintainer changing the panic row's `display`/`content` policy in the owning module changes nothing production emits, and the test that goes green witnesses a path production does not run.

## Suggested direction (non-binding, optional)
Unproven hypothesis: the unification is the one bug 0383 applied to the event row — route each matrix-row construction through its `runtime-event-channel.ts` builder (or, if the builders are judged the wrong shape for the eight sites, retire them so the module's header stops claiming the matrix). Which side wins is the fix stage's decision; the finding is only that the two currently coexist with the owning module on the unused side for three of five rows.

## False-positive check
- Clone-map check: the injected clone map lists no group for `src/runtime/runtime-event-channel.ts`; the eight inline literals are one-object literals at eight distinct files/hosts and no injected group covers any of them. This is builder-vs-bypass (mechanism-shaped), not a token-level copy claim.
- D9-affinity check: no wrong-home claim — the filing accepts `runtime-event-channel.ts` as the builders' home and the eight emitters' homes as theirs; the divergence is that production bypasses the builders, not where anything lives.
- D2-deadness check: both sides live. The bypassed builders are called from `tests/runtime-event-channel.test.ts` (search pasted above), so they are not dead; the eight inline sites are production emitters reached from load, watcher, panic, spawn, and binder paths.
- Export-style exemption: not a wide-surface filing; no export-without-importer claim is made.
- Prior-filing check: PTQ-1121 (details serialization in factory/production channels), PTQ-1443 (fallback-channel construction cloned), PTQ-1272 (system-note contract home) — read their `locations:`; none names `buildPanicNote` / `buildDiagnosticsBatchNote` / `buildStructuralNote` / `emitPanic` or the builder-vs-literal split. `grep -rln "buildPanicNote\|buildStructuralNote\|buildDiagnosticsBatchNote\|emitPanic" quality/intake quality/issues quality/resolved` — 1 prior hit, `quality/resolved/PTQ-0071-runtime-modules-stub-narration-stale.md` (D2, fixed): it rewrote the stale tests-task stub narration in `runtime-event-channel.ts:10-15` and names these builders only while quoting that narration; its scope was header prose, not which construction path production takes. Bugs 0383 and 0401 are resolved bug records, not quality filings, and their fixes touched the event row and the matrix-less informational notes respectively (0401 §Related: "the four matrix rows are implementable and implemented"), not the three bypassed builders.
- Spec check: runtime-event-channel.md §"system-note-details-shapes" pins the five shapes and the per-variant `display`/`content` table; it does not prescribe a construction site, so this is not a spec-conformance claim and no `challenges_spec` applies.
- Exemption check: `grep -n "runtime-event-channel" quality/exemptions.json` — 0 hits.
- Self-inconsistency: no written rule exists; the anchor is self-inconsistency plus the cost cited above (bug 0383's recorded drift on the sibling row and `emitPanic`'s falsified "exactly one … per top-level panic" claim).

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. All five stated searches reproduce line for line: 5 builder/emitter hits (the tool-call-off-surface.ts:415 hit is an interface member), 9 `details: { diagnostics` hits, 2 `details: { structural` hits, 0 production callers of buildPanicNote/buildDiagnosticsBatchNote/buildStructuralNote/emitPanic, and only tests/runtime-event-channel.test.ts as a test caller. The git -S histories match (buildRuntimeEventNote 5 commits including 094f1dc2 bug-0383; the other three only 66feddf6/86d7bfbf). All eight inline literals are at the cited lines and are conformant today (display: true, correct key). They go out through three sinks (sendSystemNote, deliverOperatorNotePreferringEntry, raw pi.sendMessage at production-composition.ts:5077), but the builders only construct the object, so they would still apply. clone-scan map on runtime-event-channel.ts shows no clone groups. The cost is real: bug 0383 records the conformant builder being bypassed and the literal drifting (:13-15, :108, and constraint 2 at :153-155), and emitPanic's comment "Exactly one theta-system-note per top-level panic" (:328) describes a path production never runs, since emitPanicNote at production-theta-producer.ts:455-460 hand-builds the literal. There is no duplicate: PTQ-1121, PTQ-1443 and PTQ-1272 are resolved with other scopes, PTQ-1608 is D9 placement only, and no intake sibling covers the builder bypass (triage: claude-opus-5-5)
