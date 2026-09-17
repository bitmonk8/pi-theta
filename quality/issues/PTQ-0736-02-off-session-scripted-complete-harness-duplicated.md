---
id: PTQ-0736
title: The off-session scripted complete() mock scaffold, reply builder and tool reader are hand-copied across eight test files with no tests/helpers/ home
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/unresolved-annotation-lowering.test.ts:106-133
  - tests/unresolved-annotation-lowering.test.ts:794-799
  - tests/unresolved-annotation-lowering.test.ts:828-856
  - tests/unresolved-annotation-lowering.test.ts:859-864
  - tests/empty-query-annotation.test.ts:83-113
  - tests/inbound-boundary-typed-query.test.ts:63-85
  - tests/inbound-union-arm-dispatch.test.ts:10-32
  - tests/respond-tool-wire.test.ts:57-81
  - tests/typed-query-provider-gate.test.ts:91-120
  - tests/typed-repair-two-phase.test.ts:77-109
  - tests/typed-two-phase-live.test.ts:65-97
sites: 8
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The off-session scripted complete() mock scaffold, reply builder and tool reader are hand-copied across eight test files with no tests/helpers/ home

## Observation
`tests/unresolved-annotation-lowering.test.ts` (in this review's scope)
declares, module-scope: (1) a `vi.hoisted` `{queue, calls}` holder plus a
`vi.mock("@earendil-works/pi-ai/compat", ...)` factory whose `complete`
implementation records the call, throws loudly on an empty queue, and
consumes the queue sticky-last; (2) a local `ANTHROPIC_MODEL` fixture object;
(3) an `assistantReply(fields)` builder that assembles an
`AssistantMessage`-shaped reply from optional text/toolCalls; and (4) a
`contextToolsOf(call)` reader that duck-types `call.context.tools`. The same
four pieces, byte-identical or near-identical, recur independently declared
in seven further files. No `tests/helpers/` module exports this mock
scaffold or these two builder/reader functions, though
`tests/helpers/scripted-live-session-harness.ts` already exports the
byte-identical `ANTHROPIC_MODEL` fixture these files re-declare locally
instead of importing.

## Evidence

Exact search and hit count for the mock scaffold: `grep -l "queue: \[\] as
Array" tests/*.test.ts` → 8 files: `tests/empty-query-annotation.test.ts`,
`tests/inbound-boundary-typed-query.test.ts`,
`tests/inbound-union-arm-dispatch.test.ts`, `tests/respond-tool-wire.test.ts`,
`tests/typed-query-provider-gate.test.ts`,
`tests/typed-repair-two-phase.test.ts`, `tests/typed-two-phase-live.test.ts`,
and `tests/unresolved-annotation-lowering.test.ts` (in scope).

tests/unresolved-annotation-lowering.test.ts:106-133:
```ts
const scripted = vi.hoisted(() => ({
  queue: [] as Array<
    (call: { model: unknown; context: unknown; options: unknown }) => unknown
  >,
  calls: [] as Array<{ model: unknown; context: unknown; options: unknown }>,
}));

vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (model: unknown, context: unknown, options: unknown) => {
      const call = { model, context, options };
      const index = scripted.calls.length;
      scripted.calls.push(call);
      if (scripted.queue.length === 0) {
        // No silent skipping: an unscripted dispatch fails loudly.
        throw new Error(
          `scripted complete() called with an EMPTY reply queue (call #${index + 1})`,
        );
      }
      // Sticky-last consumption: over-driving stays observable as a call-count
      // assertion instead of a mid-flight harness throw.
      const factory = scripted.queue[Math.min(index, scripted.queue.length - 1)]!;
      return factory(call);
    }),
  };
});
```

tests/inbound-union-arm-dispatch.test.ts:10-32 — the same scaffold, comments
stripped, line-wrapping collapsed, otherwise identical logic:
```ts
const scripted = vi.hoisted(() => ({
  queue: [] as Array<(call: { model: unknown; context: unknown; options: unknown }) => unknown>,
  calls: [] as Array<{ model: unknown; context: unknown; options: unknown }>,
}));

vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (model: unknown, context: unknown, options: unknown) => {
      const call = { model, context, options };
      const index = scripted.calls.length;
      scripted.calls.push(call);
      if (scripted.queue.length === 0) {
        throw new Error(
          `scripted complete() called with an EMPTY reply queue (call #${index + 1})`,
        );
      }
      const factory = scripted.queue[Math.min(index, scripted.queue.length - 1)]!;
      return factory(call);
    }),
  };
});
```

tests/empty-query-annotation.test.ts:83-113 — same shape again, only the
in-line comment wording differs from either of the above two excerpts (the
throw message, the sticky-last comment, and the header comment text are
reworded but the control flow and every literal — the error message template,
the `Math.min` sticky-last expression — are unchanged).

The model fixture and reply builder, hand-copied rather than imported:

tests/unresolved-annotation-lowering.test.ts:794-799:
```ts
const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};
```
Compare `tests/helpers/scripted-live-session-harness.ts:35-40`, the exported,
already-shared fixture:
```ts
export const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};
```
Byte-identical to the local declaration above; the in-scope file imports
nothing from `tests/helpers/scripted-live-session-harness.ts` and declares
its own copy instead.

`grep -l "function assistantReply" tests/*.test.ts` → the same 8 files.
tests/unresolved-annotation-lowering.test.ts:828-856:
```ts
function assistantReply(fields: {
  readonly stopReason: string;
  readonly text?: string;
  readonly toolCalls?: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly arguments: unknown;
  }>;
}): Record<string, unknown> {
  const content: Record<string, unknown>[] = [];
  if (fields.text !== undefined) {
    content.push({ type: "text", text: fields.text });
  }
  for (const call of fields.toolCalls ?? []) {
    content.push({
      type: "toolCall",
      id: call.id,
      name: call.name,
      arguments: call.arguments,
    });
  }
  return {
    role: "assistant",
    content,
    api: "anthropic-messages",
    stopReason: fields.stopReason,
    timestamp: 0,
  };
}
```
tests/typed-query-provider-gate.test.ts:288-318 — the same builder, widened
by one optional `errorMessage` field and one conditional spread, otherwise
the same field-name literals, the same `content` assembly loop, and the same
returned envelope shape.

`grep -l "function contextToolsOf" tests/*.test.ts` → 4 of the 8 files
(`tests/inbound-boundary-typed-query.test.ts:189-194`,
`tests/inbound-union-arm-dispatch.test.ts:912-917`,
`tests/respond-tool-wire.test.ts:544-549`,
`tests/unresolved-annotation-lowering.test.ts:859-864`):
```ts
function contextToolsOf(call: { readonly context: unknown }):
  | readonly Record<string, unknown>[]
  | undefined {
  const tools = (call.context as { readonly tools?: unknown }).tools;
  return tools === undefined ? undefined : (tools as readonly Record<string, unknown>[]);
}
```

## Why this is a problem
Every one of the eight files needs the identical "replace only the
off-session `complete()` free function, record every call, throw loudly on
an empty queue, consume sticky-last" mock discipline to drive
`dispatchForcedRespondTurn`/`runBinder` without a live provider, and several
of the files' own comments name this as a shared discipline ("the
tests/off-session-two-phase.test.ts harness discipline", "the
tests/respond-tool-wire.test.ts harness discipline") rather than an
independently-invented one. Despite that acknowledged shared discipline, no
`tests/helpers/` module holds the mock scaffold, the reply builder or the
tool reader, so a change to the throw wording, the sticky-last policy, or the
reply envelope's field set needs the identical edit made in up to eight
places. The `ANTHROPIC_MODEL` fixture specifically already has a canonical
home the in-scope file does not use.

## Suggested direction (non-binding, optional)
A shared module (e.g. beside `tests/helpers/scripted-live-session-harness.ts`,
which already exports the identical `ANTHROPIC_MODEL` these files
re-declare) could hold the `vi.hoisted` queue/calls holder factory, the
`complete()` mock body, `assistantReply` and `contextToolsOf` once, leaving
each file's own scripted reply content and drive sequence local.

## False-positive check
- Gate-pin check: none of the 8 files matches `*gate*.test.ts` or the named
  gate kin.
- Recording-double check: `scripted.calls` is a legitimate recording double
  used both for positive call-count assertions ("exactly one complete()
  call") and is not itself the subject of this finding — the finding is about
  the mock/builder/reader *declaration* being repeatedly hand-copied, not
  about the recording technique or any MUST-NOT witness it backs.
- docs/bugs/ signature search: `grep -rl "assistantReply\|contextToolsOf"
  docs/bugs/` → 0 hits; no bug document states a rationale for declaring this
  scaffold locally in each file rather than sharing it.
- coverage-matrix/bug-doc citation search: `grep -n
  "unresolved-annotation-lowering\|empty-query-annotation\|inbound-boundary-typed-query\|inbound-union-arm-dispatch\|respond-tool-wire\|typed-query-provider-gate\|typed-repair-two-phase\|typed-two-phase-live"
  docs/reference/coverage-matrix.md` → 0 hits for any of the 8 file names.
  This finding proposes no change to any `it()`/`describe()` name, count, or
  assertion in any of the 8 files, only to where the mock/builder/reader
  functions are defined.
- Coverage check: the claim is entirely about repeated harness
  *declarations*, not about a missing test path; every copy is exercised by
  the tests in its own file.
- Confirmed prior-filing non-overlap: `grep -ril "pi-ai/compat"
  quality/intake/*.md quality/resolved/*.md` finds no existing finding citing
  this mock target; the one hit for "scripted"+"complete" mock language
  (`qw20260917154546-d7-116-03-runbinder-drive-harness-duplicated.md`)
  concerns a distinct `RuntimeRoot`/`rootDouble` runtime-tier harness in two
  unrelated files, not this off-session `pi-ai/compat` mock scaffold.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified D7 copy-paste double: `grep -l 'queue: \[\] as Array' tests/*.test.ts` and `grep -l "function assistantReply"` each return exactly the 8 named files and all 8 `vi.hoisted`/`vi.mock("@earendil-works/pi-ai/compat")` excerpts match at the cited lines with identical control flow, error template and `Math.min` sticky-last expression (comments only differ); `contextToolsOf` is byte-identical in the 4 cited files; local `ANTHROPIC_MODEL` is byte-identical to the exported `tests/helpers/scripted-live-session-harness.ts:42-47` fixture (small drift from the cited 35-40) and the in-scope file imports only `./helpers/e2e-s1`; no `tests/helpers/` module holds any of the scaffold/builder/reader (0 hits); the candidate's "none matches *gate*.test.ts" claim is wrong for `typed-query-provider-gate.test.ts`, but that is a bug-0010 behavioural provider-gate suite, not a census/pin gate, and no assertion is proposed for change, so the carve-out is inapplicable; docs/bugs and coverage-matrix greps → 0 hits; sibling intake d7-157-01 overlaps only on the gate file's `ANTHROPIC_MODEL` under a different root cause (LiveSessionDouble harness not migrated to PTQ-0328's helper) and no PTQ cites this `pi-ai/compat` scripted-`complete()` scaffold (triage: claude-fable-5-1)
