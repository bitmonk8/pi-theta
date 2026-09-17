---
id: PTQ-0422
title: Binder envelope kind tokens are enumerated separately in schema and system prompt
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/binder/binder-envelope.ts:31-33
  - src/binder/binder-system-prompt.ts:376-380
sites: 2
fix_scope: module
d4_class: parallel
wave: qw20260917095931
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-17
---

# Binder envelope kind tokens are enumerated separately in schema and system prompt

## Observation
`binder-envelope.ts` keeps a single constant for the envelope discriminator
values: `BINDER_ENVELOPE_KINDS = ["ok", "needs_info", "ambiguous"]`. The binder
system prompt in `binder-system-prompt.ts` item 7 prints the same three tokens
as example envelope lines, but it hardcodes them and never references
`BINDER_ENVELOPE_KINDS`. The structural contract says all three kind tokens
must be listed; the prompt wording is otherwise non-normative.

## Evidence

### `src/binder/binder-envelope.ts:31-33`
```ts
/** The three envelope arms' `kind` discriminator tokens, in schema order (BNDR-1). */
export const BINDER_ENVELOPE_KINDS = ["ok", "needs_info", "ambiguous"] as const;
```

### `src/binder/binder-system-prompt.ts:376-380`
```ts
  line("Return one of three envelopes:");
  line('- { "kind": "ok", "args": { ... } } when every required parameter can be confidently extracted.');
  line('- { "kind": "needs_info", "message": "<one sentence>" } when a required parameter cannot be determined.');
  line('- { "kind": "ambiguous", "message": "<one sentence>", "candidates": [...] | null } when multiple bindings are plausible.');
```

## Why this is a problem
This is load-bearing parallel truth: the envelope schema and the system prompt
must agree on the exact set of `kind` tokens the model may return. If a new
arm is added to the schema constant but the prompt is not updated, the model
will not be instructed to produce that kind and the binder may receive values
it did not prepare for. If the prompt gains a kind that the schema constant
omits, the schema validator will reject valid model output. The two
enumerations are not mechanically coupled.

## Suggested direction (non-binding, optional)
The system prompt could import `BINDER_ENVELOPE_KINDS` and generate the item-7
enumeration from it, or a unit test could assert that every token in
`BINDER_ENVELOPE_KINDS` appears in the rendered prompt.

## False-positive check
- `clone-scan.mjs` map shows no clone groups in `binder-envelope.ts` or
  `binder-system-prompt.ts`.
- Both copies are live: the constant drives schema construction and the prompt
  lines are emitted on every binder attempt.
- The system prompt header says wording is non-normative, but item 7 is a
  structural obligation ("the three `kind` tokens ... all listed"), not merely
  illustrative prose.
- Not generated code and not in `tests/`.

## Triage
verdict: questionable — accounting verified: BINDER_ENVELOPE_KINDS (binder-envelope.ts:32) has 3 tokens and prompt item 7 (binder-system-prompt.ts:376-380) lists the same 3, uncoupled; but the filing's "constant drives schema construction" is false (buildBinderEnvelopeSchema hardcodes const "ok"/"needs_info"/"ambiguous" at :88/:97/:106; the constant's only reader is tests/binder-bypass-envelope.test.ts:95), and both enumerations are spec-pinned to their own clause (BNDR-1; structure item 7 "the three kind-name tokens are normative") with a pinning test each (binder-bypass-envelope.test.ts:95, binder-system-prompt.test.ts:338) — whether a spec-closed 3-set across two clauses warrants a shared source of truth is a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified: BINDER_ENVELOPE_KINDS (binder-envelope.ts:32) = 3 tokens, prompt item 7 (binder-system-prompt.ts:376-380) hardcodes the same 3, no import between them and clone-scan lists no group; filing overstates coupling ("constant drives schema construction" is false — buildBinderEnvelopeSchema hardcodes const "ok"/"needs_info"/"ambiguous" at :88/:97/:106, so there are actually three uncoupled enumerations and the constant's sole reader is tests/binder-bypass-envelope.test.ts:9,95), and each side is spec-pinned (BNDR-1 at binder-bypass-and-envelope.md:27; structure item 7 at :126 "the three kind-name tokens are normative") with its own pinning test (binder-bypass-envelope.test.ts:95, binder-system-prompt.test.ts:338) — whether a spec-closed 3-set needs a shared source of truth is a human ruling; not a dup of PTQ-0063 (type unreferenced) or PTQ-0089 (header count) (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-17) with direction: do NOT generate prompt item 7 from the constant (the V11d prompt structure is normative, byte-pinned bytes; the kind set is spec-closed). Add the drift witness instead: a unit test asserting every BINDER_ENVELOPE_KINDS token appears in the rendered binder system prompt. Test-only change.
