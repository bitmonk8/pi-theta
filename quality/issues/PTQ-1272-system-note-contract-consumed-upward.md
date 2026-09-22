---
id: PTQ-1272
title: The theta-system-note wire/contract declarations live in src/extension/system-note-channel.ts while 8 modules across the lexer, parser, binder, and runtime layers import them upward
lens: D9
status: open
verdict: confirmed
locations:
  - src/extension/system-note-channel.ts:115
  - src/extension/system-note-channel.ts:130-143
  - src/extension/system-note-channel.ts:154-158
  - src/extension/system-note-channel.ts:285-338
  - src/extension/system-note-channel.ts:349-355
  - src/extension/system-note-channel.ts:390-535
  - src/extension/system-note-channel.ts:543-560
sites: 7
fix_scope: cross-module
d9_class: misplacement
wave: qw20260922150013
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# The theta-system-note wire/contract declarations live in src/extension/system-note-channel.ts while 8 modules across the lexer, parser, binder, and runtime layers import them upward

## Observation
src/extension/system-note-channel.ts (560 LOC, exempt band — placement review) is "V7d — the `theta-system-note` delivery channel" per its header: it owns the wire envelope, batching, the producer-facing emission seam, and the best-effort fallback chain. The emission-seam contract cluster — `SYSTEM_NOTE_CHANNEL` (:115), `SystemNoteDetails` (:130-143), `SystemNote` (:154-158), `SystemNoteChannelDeps` (:285-338), `inertSystemNoteChannel` (:349-355), `sendSystemNote` (:390-535), `emitDiagnosticBatch` (:543-560) — is imported by 8 modules in four layers BELOW extension/: src/lexer (2), src/parser (2), src/binder (1), src/runtime (3). Extension is the top composition layer; every other layer in this list depends upward on it for the ability to emit a diagnostic note.

## Evidence
The 8 lower-layer importers and the members each touches (grep `system-note-channel` across src/, extension/ excluded — exactly these hits):
- src/lexer/encoding.ts:7 — `emitDiagnosticBatch`, `SystemNoteChannelDeps`
- src/lexer/lexer.ts:19 — `emitDiagnosticBatch`, `SystemNoteChannelDeps`
- src/parser/theta-ast.ts:4 — `SystemNoteChannelDeps`
- src/parser/theta-document.ts:26 — `inertSystemNoteChannel`
- src/binder/binder-model.ts:54 — `SystemNote`
- src/runtime/query-discard.ts:37 — `SystemNoteChannelDeps`
- src/runtime/runtime-event-channel.ts:20 — `sendSystemNote`, `SystemNote`, `SystemNoteChannelDeps`
- src/runtime/slash-dispatch.ts:21 — `SYSTEM_NOTE_CHANNEL`, `SystemNoteDetails`

Map importer counts (quoted): `SystemNoteChannelDeps` 13 src / 34 tests; `sendSystemNote` 7/6; `SystemNote` 4/8; `emitDiagnosticBatch` 4/3; `SYSTEM_NOTE_CHANNEL` 3/23; `inertSystemNoteChannel` 2/0; `SystemNoteDetails` 1/4 — 6 of `SystemNoteChannelDeps`'s 13 src importers are lower-layer.

Counted the other way, the contract cluster's own dependencies are diagnostics-layer, not extension-layer: the module imports 3 members of src/diagnostics/diagnostic (`renderDiagnosticBatch`, `toPosixFileSpelling`, `Diagnostic`) against 2 members of its own layer (`isStaleCtxError` from ./stale-ctx, used only inside `sendSystemNote` at :428/:464; `EntryChannelHandle` from ./execution-status/entry-channel, used only by the optional `SystemNoteChannelDeps.entryChannel` field :337 and `deliverOperatorNotePreferringEntry`). `SystemNoteDetails` (:130-143) is built from `Diagnostic[]` and plain records:
```ts
export type SystemNoteDetails =
  | { readonly diagnostics: readonly Diagnostic[] }
  | { readonly event: Record<string, unknown> }
  | {
      readonly structural: {
        readonly added: readonly string[];
        readonly removed: readonly string[];
      };
    }
```
Sibling pattern: the cross-layer diagnostic vocabulary already lives in src/diagnostics/diagnostic.ts, whose own doc comment (:58-61) names this pairing — "so both presentational seams (`renderDiagnosticLine` here and `sendSystemNote` in system-note-channel.ts) can share it without a shared mutable dependency" — i.e. the shared-by-all-layers half of this machinery was deliberately homed in diagnostics/, while the note contract that the same layers consume stayed in extension/.

## Why this is a problem
Layer crossing with the counts: 8 modules in 4 layers below extension/ import upward from it, including the bottom-most layer (src/lexer — encoding.ts and lexer.ts cannot emit their own `theta/load/invalid-encoding` gate without reaching into extension/). The declarations they touch reference only src/diagnostics vocabulary (plus one optional extension type, `EntryChannelHandle`), so their affinity is with the diagnostics layer that every layer already imports; the extension-specific delivery mechanics (`isStaleCtxError`, `RendererGate` degradation, the entry channel) are confined to the implementation half. The inverted edges make every lexer/parser/binder/runtime module transitively depend on ./stale-ctx and ./execution-status/entry-channel.

## Suggested direction (non-binding, optional)
Hypothesis, unproven: re-home the wire/contract half — `SYSTEM_NOTE_CHANNEL`, `SystemNoteDetails`, `SystemNote`, `SystemNoteSender`, `UiNotifier`, `serializeSystemNote`, `SystemNoteChannelDeps`, `inertSystemNoteChannel` (~120 LOC of declarations) — into src/diagnostics (e.g. diagnostics/system-note.ts), leaving the delivery/fallback implementation (`sendSystemNote`, `RendererGate`, `SystemNoteChannelHealth`, `deliverOperatorNotePreferringEntry`, `emitDiagnosticBatch`) in extension/ with a re-export facade for current importers. The one cross-reference back into extension is `SystemNoteChannelDeps.entryChannel: EntryChannelHandle` (:337), which would need a structural interface or to move with the cluster — that edge is the blocker a ratified move must resolve.

## False-positive check
- Layer-crossing counts verified by grep: exactly 8 non-extension src importers (listed above with line numbers and member names); 10 extension-layer modules also import it, so the filing targets the contract declarations the lower layers touch, not the whole module.
- Affinity counted both ways: module imports 3 diagnostics members vs 2 extension members; the extension members are used only by the implementation half (`sendSystemNote` :428/:464; `entryChannel` :337), verified by grep for `isStaleCtxError`/`EntryChannelHandle` inside the file.
- Barrel/facade check: the module is not a re-export barrel (18 substantive declarations, header claims ownership of the channel, no re-exports).
- Duplicate check: PTQ-1121 (D4, details-serialization clone), PTQ-0643/PTQ-0326 (test harness dupes), PTQ-1156 (theta-document concerns) touch this module's neighbourhood but no PTQ or intake candidate files a placement claim on the system-note contract; the exemptions file has no entry for this host.
- Deliberateness check: header (:1-19) documents delivery behaviour and PIC clauses, not a chosen layering; diagnostic.ts:58-61 shows the shared-vocabulary sibling pattern already pointing at diagnostics/.

## Triage
verdict: questionable — accounting verified: exactly 8 non-extension src importers reproduce with the cited members/lines (lexer 2, parser 2, binder 1, runtime 3); size-scan map confirms 560 LOC exempt band and the quoted importer counts (SystemNoteChannelDeps 13/34, SystemNote 4/8, SYSTEM_NOTE_CHANNEL 3/23, SystemNoteDetails 1/4, inertSystemNoteChannel 2/0); own-imports are 3 diagnostics members vs 2 extension members with isStaleCtxError confined to sendSystemNote and EntryChannelHandle to :337/deliverOperatorNotePreferringEntry; diagnostic.ts:58-61 sibling quote is real; no exemption, not a barrel (18 declarations), no existing PTQ files a placement claim (PTQ-1121/0643/0326 are D4/D7) — the target home for the contract half (and the entryChannel edge) is a design decision needing a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: grep reproduces exactly 8 non-extension src importers at the cited lines with the cited members (lexer/encoding.ts:7 + lexer.ts:19 emitDiagnosticBatch+SystemNoteChannelDeps, parser/theta-ast.ts:4, theta-document.ts:26, binder/binder-model.ts:54, runtime/query-discard.ts:37, runtime-event-channel.ts:20, slash-dispatch.ts:21) plus 14 extension-layer import lines; size-scan map confirms 560 LOC exempt band, 18 declarations (not a barrel), and every quoted importer count (3/23, 1/4, 4/8, 13/34, 2/0, 7/6, 4/3); own-imports are 3 diagnostics members vs 2 extension members, isStaleCtxError used only at :428/:464 inside sendSystemNote and EntryChannelHandle only at :337; diagnostic.ts:58-61 sibling quote is verbatim; header :1-19 documents delivery/PIC behaviour, not a layering choice; no exemptions.json row, no PTQ files a placement claim on this contract (PTQ-1121 is D4 serialization clone, PTQ-1196 is the evaluator family) — whether the contract half moves to diagnostics/ and how the entryChannel edge is resolved is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified a third time against current code: grep of `system-note-channel` outside src/extension/ yields exactly the 8 cited importers (lexer/encoding.ts:7 + lexer.ts:19 → emitDiagnosticBatch+SystemNoteChannelDeps, parser/theta-ast.ts:4 → SystemNoteChannelDeps, theta-document.ts:26 → inertSystemNoteChannel, binder/binder-model.ts:54 → SystemNote, runtime/query-discard.ts:37 → SystemNoteChannelDeps, runtime-event-channel.ts:20 → sendSystemNote+SystemNote+SystemNoteChannelDeps, slash-dispatch.ts:21 → SYSTEM_NOTE_CHANNEL+SystemNoteDetails) plus a doc-comment mention in diagnostics/diagnostic.ts:60; size-scan map: 560 LOC band exempt (placement review applies), 18 declarations at the cited ranges with importer counts 3/23, 1/4, 4/8, 13/34, 2/0, 7/6, 4/3 exactly as quoted; own imports are 3 diagnostics members vs isStaleCtxError (:428/:464, inside sendSystemNote only) and EntryChannelHandle (:337 only); diagnostic.ts:58-61 sibling quote verbatim; header :1-19 states ownership/PIC-54/PIC-67 behaviour, not a layering rationale (the earlier wave's "documented V7d seam — counts defeat misplacement" at REVIEW_LOG.md:564 is a reviewer keep note, not a human ruling, and two later waves explicitly queued this question); no exemptions.json row; no D9 PTQ files a placement claim (PTQ-0424/PTQ-1156 mention the module only incidentally, PTQ-1121/0643/0326 are D4/D7) — the target home for the contract half and the entryChannel back-edge are a design decision needing a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-22): confirmed - batch ruling over the RFC-0015-era review wave; triage verification trusted.
