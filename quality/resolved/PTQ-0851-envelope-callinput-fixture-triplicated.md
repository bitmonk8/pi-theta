---
id: PTQ-0851
title: The BinderCompleteCallInput fixture pair (a single-arm envelope constant plus a callInput builder) is declared independently in three sibling binder-inference test files
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/binder-inference-provider-mapping.test.ts:367-390
  - tests/b0417-responses-binder-toolchoice-gate.test.ts:102-120
  - tests/binder-system-note-determinism.test.ts:155-177
sites: 3
fix_scope: cross-module
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# The BinderCompleteCallInput fixture pair (a single-arm envelope constant plus a callInput builder) is declared independently in three sibling binder-inference test files

## Observation
Three test files that all import `buildBinderCompleteCall` / `BinderCompleteCallInput`
from `src/binder/binder-inference` each independently declare (1) a
module-scope `const envelope: BinderEnvelopeSchema` holding the identical
single-arm object schema (`anyOf: [{ type: "object", properties: { kind: {
const: "ok" } }, required: ["kind"] }]`), and (2) a local `callInput(...)`
function that builds a `BinderCompleteCallInput` from it with the same fixed
`systemPrompt`, `slug`, `AbortController().signal`, and no-op `onResponse`.
Only the varying parameter (`api`, `api`+`seed`, or `seed` alone) and the
model's shape differ between the three copies.

## Evidence
`tests/binder-inference-provider-mapping.test.ts:367-390` (re-read
immediately before filing):
```ts
describe("V9j-T — complete() binder envelope (cka-34)", () => {
  const envelope: BinderEnvelopeSchema = {
    anyOf: [
      {
        type: "object",
        properties: { kind: { const: "ok" } },
        required: ["kind"],
      },
    ],
  };

  function callInput(
    api: string,
    seed: number,
  ): BinderCompleteCallInput {
    return {
      model: modelOf(api),
      systemPrompt: "You are the binder.",
      envelopeSchema: envelope,
      slug: "triage",
      seed,
      signal: new AbortController().signal,
      onResponse: (_response: ProviderResponse, _model: Model<Api>) => {},
    };
  }
```

`tests/b0417-responses-binder-toolchoice-gate.test.ts:102-119`:
```ts
describe("bug 0417 Face A — openai-responses / openai-codex-responses spell the FLAT {type:'function',name}", () => {
  const envelope: BinderEnvelopeSchema = {
    anyOf: [
      {
        type: "object",
        properties: { kind: { const: "ok" } },
        required: ["kind"],
      },
    ],
  };
  function callInput(api: string): BinderCompleteCallInput {
    return {
      model: { api } as unknown as Model<Api>,
      systemPrompt: "You are the binder.",
      envelopeSchema: envelope,
      slug: "triage",
      seed: 7,
      signal: new AbortController().signal,
      onResponse: (_r: ProviderResponse, _m: Model<Api>) => {},
    };
  }
```

`tests/binder-system-note-determinism.test.ts:155-177`:
```ts
describe("V11e-T — Binder determinism (determinism-cancellation-failure.md §Determinism)", () => {
  const envelope: BinderEnvelopeSchema = {
    anyOf: [
      {
        type: "object",
        properties: { kind: { const: "ok" } },
        required: ["kind"],
      },
    ],
  };

  function callInput(seed: number): BinderCompleteCallInput {
    return {
      // `openai-completions` carries a `seed` field, so the FNV-derived seed
      // surfaces on `options.seed` (the provider seed-field mapping is V9j's).
      model: { api: "openai-completions" } as unknown as Model<Api>,
      systemPrompt: "You are the binder.",
      envelopeSchema: envelope,
      slug: "triage",
      seed,
      signal: new AbortController().signal,
      onResponse: (_response: ProviderResponse, _model: Model<Api>) => {},
    };
  }
```

Exact search: `grep -rln "envelope: BinderEnvelopeSchema" tests/*.ts` → exactly
these three files. All three `envelope` bodies are byte-identical
(`anyOf`/`type`/`properties.kind.const`/`required`); all three `callInput`
bodies build the same six-key `BinderCompleteCallInput` record with the same
literal `systemPrompt`, `slug: "triage"`, `new AbortController().signal`, and
an `onResponse` no-op, differing only in which of `api`/`seed` is
parameterised and how `model` is constructed.

## Why this is a problem
The same one-arm envelope fixture and the same six-field call-input builder
are typed out independently in three files rather than shared, so a change to
`BinderCompleteCallInput`'s required shape, or to the fixed `systemPrompt`/`slug`
values every one of the three currently agrees on, requires editing three
declarations to stay in sync rather than one.

## Suggested direction (non-binding, optional)
A `tests/helpers/` export for the single-arm `envelope` fixture and a
parameterised `callInput`-style builder (accepting `api`, `seed`, and an
optional model-shape override) is the natural home the three byte-identical
declarations point at.

## False-positive check
- Gate-pin check: none of the three files match `*gate*.test.ts` or the named
  gate kin; the cited declarations are a fixture object and a builder
  function, not a pinned count or inventory.
- Recording-double check: not applicable — `callInput` constructs a plain
  input record for a fail-closed call under test; it records no calls and
  backs no "never called" witness.
- docs/bugs/ signature search: `grep -rl "BinderCompleteCallInput" docs/bugs/*.md`
  → 0 hits; no documented correct-reason red cites this fixture pair.
- coverage-matrix/bug-doc citation search: `grep -n "binder-inference-provider-mapping\|b0417-responses-binder-toolchoice-gate\|binder-system-note-determinism" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of any
  `it()`/`describe()` — only that the shared fixture/builder pair could be
  imported from one place — so no citation is disturbed.
- Coverage check: the claim is about a repeated fixture/builder DEFINITION;
  every copy is exercised by its own file's tests, and no behaviour path is
  claimed untested.
- Overlap check: `grep -rl "BinderCompleteCallInput" quality/` → 0 hits before
  this filing; no existing PTQ or intake candidate names this triplication.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at tests/binder-inference-provider-mapping.test.ts:367-390, tests/b0417-responses-binder-toolchoice-gate.test.ts:102-120 and tests/binder-system-note-determinism.test.ts:155-177; the `envelope` bodies are byte-identical and the six-field `BinderCompleteCallInput` records agree on systemPrompt/slug/signal/no-op onResponse, with `modelOf(api)` (provider-mapping:63-65) being the same `{ api } as unknown as Model<Api>` cast the other two inline; every copy is live (each file's it()s call callInput → buildBinderCompleteCall); no tests/helpers module exports a binder envelope/call-input fixture; stated searches reproduce (docs/bugs BinderCompleteCallInput → 0, coverage-matrix file cites → 0, quality/ overlap → 0) and no existing PTQ names these files (PTQ-0628/0454/0542/0661 are different binder harnesses); D7 copy-paste-fixture class, tests/ only — two corrections for the record: the filing's `tests/*.ts` glob is non-recursive and misses a fourth byte-identical copy (envelope + same six-field record inlined) at tests/live/b0417live-responses-binder-toolchoice-live-cell.test.ts:117-134, to be folded into the location list at acceptance; and the "none match *gate*.test.ts" claim is false (b0417-...-toolchoice-gate.test.ts matches) but immaterial since the cited declaration is a fixture/builder, not a pinned count, so the gate carve-out does not apply (triage: claude-fable-5-1)
