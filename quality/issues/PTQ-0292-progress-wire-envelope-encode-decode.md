---
id: PTQ-0292
title: The `theta_progress` wire envelope's field set is written by a typed object spread in progress-tool.ts but re-declared by hand in child-tap.ts's decoder
lens: D4
status: open
verdict: confirmed
locations:
  - src/extension/execution-status/progress-tool.ts:249-278
  - src/extension/execution-status/child-tap.ts:98-178
sites: 2
fix_scope: module
d4_class: parallel
wave: qw20260912204251
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-12
---

# The `theta_progress` wire envelope's field set is written by a typed object spread in progress-tool.ts but re-declared by hand in child-tap.ts's decoder

## Observation
`progress-tool.ts`'s `emitWireLine` (child regime) and `child-tap.ts`'s `attachChildActivityTap` (parent regime) are the one encoder and one decoder for the same `PROGRESS_WIRE_KEY`-keyed stdout envelope (`{ v, invocation_id, seq, event: {message, scope, done, total, dropped} }`, PIC-74). The encoder builds its wire line from a value already typed `ProgressAuthorMessage` (`src/extension/execution-status/types.ts`), so a change to that type's field set is compiler-checked on the write side. The decoder does not read the wire through that type: it re-declares the same field names in its own hand-written anonymous cast (`env`, then `fields`), disconnected from `ProgressAuthorMessage`.

## Evidence
Not in the clone map (an encoder and a defensive, validating decoder are not clone-shaped — no contiguous token run matches — this is the brief's own named parallel-class example, "a wire encoder and its decoder," found by reading).

Encoder — `src/extension/execution-status/progress-tool.ts:249-278` (`emitWireLine`):
```ts
function emitWireLine(
  payload: ProgressAuthorMessage,
  registry: ActiveInvocationRegistry,
  deps: ProgressToolDeps,
  state: ProgressToolState,
): void {
  const root = registry.snapshot()[0];
  if (root === undefined) {
    return;
  }
  const seq = state.wireSeq + 1;
  const line = `${JSON.stringify({
    [PROGRESS_WIRE_KEY]: {
      v: PROGRESS_WIRE_VERSION,
      invocation_id: root.invocationId,
      seq,
      event: payload,
    },
  })}\n`;
  // …
}
```
`payload` is the whole `ProgressAuthorMessage` object — the encoder never lists `message`/`scope`/`done`/`total`/`dropped` by name; whatever fields the type carries at compile time are what gets serialised.

Decoder — `src/extension/execution-status/child-tap.ts:98-178` (the `theta_progress` branch of the stdout-line listener; envelope- and event-shape declarations shown, validation body elided at `//…`):
```ts
if (Object.prototype.hasOwnProperty.call(record as Record<string, unknown>, PROGRESS_WIRE_KEY)) {
  const envelope = (record as Record<string, unknown>)[PROGRESS_WIRE_KEY];
  // …
  const env = envelope as {
    readonly v?: unknown;
    readonly seq?: unknown;
    readonly invocation_id?: unknown;
    readonly event?: unknown;
  };
  // … v / seq / invocation_id acceptance guards …
  const fields = ev as {
    readonly message?: unknown;
    readonly scope?: unknown;
    readonly done?: unknown;
    readonly total?: unknown;
    readonly dropped?: unknown;
  };
  // … per-field validation, then: publish({ type: "theta_progress", payload });
}
```
Diff verdict: not clone-shaped (the encoder is a template-literal write of a typed value; the decoder is a multi-guard untrusted-input parse) — filed as parallel. Counted mechanism: today the decoder's hand-cast `fields` type names all 5 of the 5 fields `ProgressAuthorMessage` currently declares (`message`, `scope`, `done`, `total`, `dropped`) — full 5-of-5 coverage, no live gap.

## Why this is a problem
The two sides must agree on the envelope's field set for the whole `theta_progress` cross-process reporting feature (EXST-15/PIC-74) to work: a field the encoder starts sending that the decoder does not also start reading is silently dropped on the wire (child-tap.ts drops unrecognised data with no diagnostic by design), and a field the decoder expects that the encoder does not send fails its `typeof` guard and drops the whole line. The encoder's field set is anchored to the shared `ProgressAuthorMessage` type and so is compiler-checked wherever `payload` is built or consumed as that type; the decoder's `env`/`fields` casts are two fresh anonymous types with no structural relationship to `ProgressAuthorMessage`, so nothing forces `child-tap.ts` to be revisited when that type's field set changes — a future field addition to `ProgressAuthorMessage` (e.g. for a new EXST-14 payload attribute) would compile cleanly on both sides while the decoder silently never reads the new field off the wire.

## Suggested direction (non-binding, optional)
Typing the decoder's inner `fields` cast against `Partial<Record<keyof ProgressAuthorMessage, unknown>>` (or an equivalent derived-from-the-shared-type shape) rather than a free-standing anonymous type is the natural way to give the compiler the same field-set anchor on the read side that the write side already has — named here as a hypothesis, not a design.

## False-positive check
Re-read both cited ranges immediately before filing. Confirmed `PROGRESS_WIRE_KEY`/`PROGRESS_WIRE_VERSION` are the one shared, imported pair of constants both sides already use (not duplicated). Confirmed the decoder's `fields` type currently names exactly the 5 fields `ProgressAuthorMessage` (`types.ts`) declares — counted, no gap today. Confirmed this is genuinely two different mechanisms (a trusted-object serialiser vs. an untrusted-input validator), not a copy-paste pair, so it is filed as `parallel`, not `clone`, per the brief's own carve-out for a wire encoder and its decoder.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting verified: ProgressAuthorMessage (types.ts:88-94) declares exactly the 5 fields (message, scope, done, total, dropped) that the decoder's hand-cast `fields` type (child-tap.ts:130-136) names, both excerpts byte-match their cited ranges, and no other PTQ or clone-map entry covers this pair, but whether to anchor the decoder's cast to the shared type (vs. keep the untrusted-input parse independent) is a design decision for a human ruling, not a mechanical dedupe (triage: claude-opus-5)
verdict: questionable — re-verified independently (progress-tool.ts:249-278 and child-tap.ts:98-178 byte-match; types.ts:88-94's ProgressAuthorMessage names exactly the 5 fields child-tap.ts:130-136's hand-cast names, full coverage today; clone-scan.mjs shows no clone group, confirming parallel over clone; no PTQ or REVIEW_LOG entry covers this pair): the D4 design brief itself caps parallel-class findings with accurate accounting at questionable, ratified by a human, never confirmed (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-13): anchor the decoder to the shared type, do not merge encoder and decoder. In src/extension/execution-status/child-tap.ts type the inner cast as Partial<Record<keyof ProgressAuthorMessage, unknown>> (or an equivalent mapped type over keyof ProgressAuthorMessage) and add a compile-time handled-fields ledger (an object literal naming every field the decoder reads, declared `satisfies Record<keyof ProgressAuthorMessage, true>`) so a field added to ProgressAuthorMessage fails tsc in child-tap.ts until the decoder handles it. Validation logic, PIC-74 field-wise discard, the envelope cast (v / seq / invocation_id / event) and progress-tool.ts are unchanged; no behaviour change, no spec change.
