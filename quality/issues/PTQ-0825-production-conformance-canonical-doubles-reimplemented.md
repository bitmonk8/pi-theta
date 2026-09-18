---
id: PTQ-0825
title: production-conformance.test.ts re-derives NOOP_CHECKPOINT/rootDouble/ctxDouble instead of importing the canonical tests/helpers exports
lens: D7
status: open
verdict: confirmed
locations:
  - tests/conformance/production-conformance.test.ts:97-118
  - tests/helpers/tool-call-dispatch-harness.ts:81-109
  - tests/helpers/call-with-clause-harness.ts:152-166
sites: 1
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# production-conformance.test.ts re-derives NOOP_CHECKPOINT/rootDouble/ctxDouble instead of importing the canonical tests/helpers exports

## Observation
tests/conformance/production-conformance.test.ts declares its own module-scope
`NOOP_CHECKPOINT` constant, `rootDouble()` function, and `ctxDouble()`
function. `tests/helpers/tool-call-dispatch-harness.ts` already exports a
byte-identical `NOOP_CHECKPOINT` and a byte-identical `ctxDouble()`, and
`tests/helpers/call-with-clause-harness.ts` already exports a `rootDouble()`
whose `checkpoint`/`idSource`/`clock.wallNow` fields are identical to the
reviewed file's own `rootDouble()`. The reviewed file imports none of these
three.

## Evidence
tests/conformance/production-conformance.test.ts:97-118 (re-read immediately before filing):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/**
 * A runtime root double sufficient for the pure / effectful production dispatch
 * (checkpoint gate, id source, wall clock). No live session, model registry, or
 * schema validator is exercised by the drivable surface below.
 */
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: { wallNow: () => 0 },
  } as unknown as RuntimeRoot;
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}
```

tests/helpers/tool-call-dispatch-harness.ts:81-109 — the canonical exports,
`NOOP_CHECKPOINT` and `ctxDouble()` byte-identical to the reviewed file's own
copies above:
```ts
export const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/**
 * A `RuntimeRoot` double exposing the members the code-side tool-call path
 * reads. `schemaValidator` is the REAL AJV-backed seam so a snapshot entry
 * that carries a schema validates through the production validator rather
 * than a fake's.
 */
export function rootDouble(): RuntimeRoot {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return {
    checkpoint: NOOP_CHECKPOINT,
    schemaValidator: new AjvSchemaValidator({ emit: (): void => {}, slugOf }),
    idSource: {
      newInvocationId: () => "inv-1",
      newToolCallId: () => "tc-1",
    },
  } as unknown as RuntimeRoot;
}

export function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}
```

tests/helpers/call-with-clause-harness.ts:152-166 — a second exported
`rootDouble()` matching the reviewed file's `checkpoint`/`idSource`/
`clock.wallNow` fields field-for-field (this one additionally carries
`clock.setTimeout`/`clearTimeout`, which the reviewed file's drivable surface
does not use):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

export function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
  } as unknown as RuntimeRoot;
```

Search performed: `grep -n "NOOP_CHECKPOINT\|function rootDouble\|function ctxDouble" tests/conformance/production-conformance.test.ts` → the three declarations at lines 97, 108, 116, none imported. `grep -n "export const NOOP_CHECKPOINT\|export function rootDouble\|export function ctxDouble" tests/helpers/*.ts` → the two canonical exporting files cited above.

## Why this is a problem
This is the copy-paste-fixtures/doubles class: an inert `Checkpoint`, an
`ExtensionCommandContext` cast-through-`{}` double, and a `RuntimeRoot` double
carrying `checkpoint`/`idSource`/`clock` are all rebuilt from scratch in this
file even though every one of them already exists as an exported, reusable
function under `tests/helpers/` — `NOOP_CHECKPOINT`/`ctxDouble` in
`tool-call-dispatch-harness.ts` (byte-identical), and `rootDouble` in
`call-with-clause-harness.ts` (field-for-field identical on the fields the
reviewed file's surface exercises).

## Suggested direction (non-binding, optional)
`tests/helpers/tool-call-dispatch-harness.ts` already exports
`NOOP_CHECKPOINT` and `ctxDouble`, and `tests/helpers/call-with-clause-harness.ts`
already exports a `rootDouble` matching this file's own shape on every field
it reads; naming those exports is an observation about the file's own stated
scope, not a design for the change.

## False-positive check
- Gate-pin check: `tests/conformance/production-conformance.test.ts` is not a
  `*gate*.test.ts` file and asserts no pinned count/inventory that this
  finding touches.
- Recording-double check: none of `NOOP_CHECKPOINT`, `rootDouble()`, or
  `ctxDouble()` records a call for a MUST-NOT-called witness — all three are
  inert stand-ins with no call log read by any assertion in the file (`grep -n
  "rootDouble\|ctxDouble" tests/conformance/production-conformance.test.ts`
  shows only declaration and call-site uses), so the recording-double
  carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "production-conformance"
  docs/bugs/*.md` hits 0019, 0079, 0081, 0107, 0178, 0183, 0185, 0207, 0215,
  0216, 0274, 0277, 0278, 0279, 0281, 0282 — all pin this file's `runSource`
  drive harness, specific stale composition-root-naming comments, or
  type-layer/generic-application scenarios; none documents a rationale for
  keeping the `NOOP_CHECKPOINT`/`rootDouble`/`ctxDouble` block local or cites
  lines 97-118.
- coverage-matrix/bug-doc citation search: `grep -n "production-conformance"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of the file or any `it()` — only that three
  internal doubles could import the existing helpers instead of redeclaring
  them.
- Overlap check: `grep -rl "production-conformance" quality/issues quality/resolved
  quality/intake` → PTQ-0259 (fixed, the `runProductionLoad`/`LoadOutcome`
  block, now imported from `tests/helpers/production-load-harness.ts` at
  HEAD), PTQ-0312 (plant/dispose harness), PTQ-0457 (the `parseDeps`
  duplication with committed-fixture-parse-gate.test.ts), PTQ-0549
  (unrelated file). None of the three cites the `NOOP_CHECKPOINT`/
  `rootDouble`/`ctxDouble` block at lines 97-118.
- Coverage-drift check: this claim is about a harness declaration repeated
  across files that already exist and already pass; it makes no claim that
  any behaviour or path is untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: tests/conformance/production-conformance.test.ts:97-101 `NOOP_CHECKPOINT` and :116-118 `ctxDouble` sed-extracted and diffed against tests/helpers/tool-call-dispatch-harness.ts:81-85/:108-110 after stripping `export` → byte-identical; local `rootDouble` :108-114 is a strict field subset (checkpoint/idSource/clock.wallNow) of the exported tests/helpers/call-with-clause-harness.ts:158-167 `rootDouble`; the reviewed file imports none of the three (grep shows only local decls at :97/:108/:116 and inert call sites :110/:123/:162 — no recording double, not a *gate* file, 0 coverage-matrix hits, none of the 17 docs/bugs files citing this test pin lines 97-118); both locations under tests/, D7 copy-paste-double class; no existing PTQ cites this file for this block (PTQ-0259/0312/0457 cover other harness blocks here; PTQ-0521/0531 are the same pattern ruled confirmed per-file for different test files) — fix is a mechanical import swap (triage: claude-fable-5-1)
