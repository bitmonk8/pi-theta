---
id: PTQ-1022
title: binder-forced-tool-dispatch.test.ts retypes ajv()/rootDouble()/producerWithCapture() from the exact helper module it already imports four other exports from
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/binder-forced-tool-dispatch.test.ts:150-156
  - tests/binder-forced-tool-dispatch.test.ts:251-258
  - tests/binder-forced-tool-dispatch.test.ts:268-280
  - tests/binder-forced-tool-dispatch.test.ts:290-306
  - tests/helpers/scripted-live-session-harness.ts:111-113
  - tests/helpers/scripted-live-session-harness.ts:116-122
  - tests/helpers/scripted-live-session-harness.ts:142-156
sites: 3
fix_scope: localized
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# binder-forced-tool-dispatch.test.ts retypes ajv()/rootDouble()/producerWithCapture() from the exact helper module it already imports four other exports from

## Observation
`tests/binder-forced-tool-dispatch.test.ts` imports `CapturedNote`,
`noteChannelEntries`, `parse`, and `TWO_PARAM_THETA` from
`./helpers/scripted-live-session-harness` (its own import block). That same
module also exports `ajv()` (a real `AjvSchemaValidator` builder),
`rootDouble(overrides)` (an AJV-backed `RuntimeRoot` double that already
accepts a `fileSystem` override), and `producerWithCapture(input)` (a
capturing-`pi.sendMessage` producer factory returning `{ deps, notes }`). The
in-scope file does not import any of those three; instead it declares its own
`realAjvValidator()`, `rootDouble()`, and `producerWithCapture()` at module
scope, each rebuilding the same construction the imported module already
exports under the same names/shapes.

## Evidence
`tests/binder-forced-tool-dispatch.test.ts:150-156` — the existing import from
the module under discussion (four of its exports, not the other three):
```ts
import {
  type CapturedNote,
  noteChannelEntries,
  parse,
  TWO_PARAM_THETA,
} from "./helpers/scripted-live-session-harness";
```

`tests/binder-forced-tool-dispatch.test.ts:251-258` — the local AJV builder:
```ts
function realAjvValidator(): AjvSchemaValidator {
  return new AjvSchemaValidator({
    emit: (): void => {},
    slugOf: (schema: LoweredSchema): SchemaSlug => {
      const canonicalBytes = JSON.stringify(schema);
      return { slug: canonicalBytes, canonicalBytes };
    },
  });
}
```
vs `tests/helpers/scripted-live-session-harness.ts:111-113` (already exported,
same construction, same `emit`/`slugOf` shape):
```ts
export function ajv(): AjvSchemaValidator {
  return new AjvSchemaValidator({ emit: () => {}, slugOf: jsonSlug });
}
```

`tests/binder-forced-tool-dispatch.test.ts:268-280` — the local root double:
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: { wallNow: (): number => 0 },
    schemaValidator: realAjvValidator(),
    fileSystem: {
      readBytes: (path: string): Promise<Uint8Array> => {
        const src = FIXTURE_SOURCES.get(path);
        return src !== undefined
          ? Promise.resolve(new TextEncoder().encode(src))
          : Promise.reject(new Error(`fixture fs: no source registered for ${path}`));
      },
    },
  } as unknown as RuntimeRoot;
}
```
vs `tests/helpers/scripted-live-session-harness.ts:116-122` (already exported
with the same `clock`/`fileSystem` override points and the same AJV wiring):
```ts
export function rootDouble(overrides: {
  readonly clock?: Partial<RuntimeRoot["clock"]>;
  readonly tokenEstimator?: RuntimeRoot["tokenEstimator"];
  readonly fileSystem?: Pick<RuntimeRoot["fileSystem"], "readBytes">;
} = {}): RuntimeRoot {
  return { ...fixedClockRoot(), schemaValidator: ajv(), ...overrides } as unknown as RuntimeRoot;
}
```

`tests/binder-forced-tool-dispatch.test.ts:290-306` — the local capturing
producer factory:
```ts
function producerWithCapture(model: BinderModelDouble = ANTHROPIC_BINDER_MODEL): {
  readonly deps: ReturnType<typeof createProductionProducerDeps>;
  readonly notes: CapturedNote[];
} {
  const notes: CapturedNote[] = [];
  const pi = {
    sendMessage: (message: CapturedNote): void => {
      notes.push(message);
    },
  } as unknown as ExtensionAPI;
  const modelRegistry = {
    getAvailable: (): readonly unknown[] => [model],
    getApiKeyAndHeaders: async (): Promise<{ ok: boolean }> => ({ ok: true }),
  } as unknown as ModelRegistry;
  const deps = createProductionProducerDeps({ pi, root: rootDouble(), modelRegistry });
  return { deps, notes };
}
```
vs `tests/helpers/scripted-live-session-harness.ts:142-156` (already exported,
same `notes`-array-plus-`pi.sendMessage`-push body, same return shape):
```ts
export function producerWithCapture<TDetails = unknown>(
  input: Omit<ProductionProducerInput, "pi">,
): {
  readonly deps: ReturnType<typeof createProductionProducerDeps>;
  readonly notes: CapturedNote<TDetails>[];
} {
  const notes: CapturedNote<TDetails>[] = [];
  const pi = {
    sendMessage: (message: CapturedNote<TDetails>): void => {
      notes.push(message);
    },
  } as unknown as ExtensionAPI;
  const deps = createProductionProducerDeps({ pi, ...input });
  return { deps, notes };
}
```

## Why this is a problem
The in-scope file's own import statement (lines 150-156) proves it already
resolves against `tests/helpers/scripted-live-session-harness.ts` for four
of the seven pieces this same double/producer cluster needs, yet three
further pieces from the identical module — the AJV builder, the AJV-backed
`RuntimeRoot` double (which already parameterises the exact `fileSystem`
override this file needs), and the capturing-producer factory — are retyped
locally under the same names instead of imported. A change to any of the
three (e.g. the `AjvSchemaValidator` constructor shape, or the `RuntimeRoot`
fields the double must carry) has to be applied by hand in this file as well
as in the module it already partially imports from.

## Suggested direction (non-binding, optional)
Extending the existing import block at :150-156 to also pull `ajv`,
`rootDouble`, and `producerWithCapture` from `./helpers/scripted-live-session-harness`
(passing the model-registry override and the `fileSystem` map through
`rootDouble`'s existing `overrides` parameter) is the natural next step,
since the module already exposes exactly the override points this file's
local copies hand-add.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; the cited code is harness/fixture declaration, not a pinned count or
  inventory assertion.
- Recording-double check: `producerWithCapture`'s `notes` sink is a positive
  read-back mechanism (the suite asserts what WAS captured via
  `noteChannelEntries`/content equality), not a "never called" MUST-NOT
  witness; the recording-double carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "binder-forced-tool-dispatch"
  docs/bugs/*.md` finds docs/bugs/0011, 0064, 0198, 0417, 0099 citing the
  file as a witness by name, but none of them names `rootDouble`,
  `realAjvValidator`, or `producerWithCapture` as a pinned failure signature
  (`grep -n "rootDouble\|realAjvValidator\|producerWithCapture"
  docs/bugs/0011-*.md docs/bugs/0198-*.md` → 0 hits); this finding is about
  harness declaration, not the documented RED pins.
- coverage-matrix/bug-doc citation search: `grep -n
  "binder-forced-tool-dispatch" docs/reference/coverage-matrix.md` → 0 hits.
  This finding proposes no merge, rename, or deletion of the file or any
  `it()`/`describe()` — only that three local functions be imported instead
  of retyped.
- Prior-finding check: `grep -rl "binder-forced-tool-dispatch"
  quality/issues/*.md quality/resolved/*.md` shows PTQ-0628 (fixed) covered a
  disjoint sextet (`CapturedNote`/`parseDeps`/`parse`/`ctxDouble`/
  `noteChannelEntries`/`TWO_PARAM_THETA` vs `tests/e2e-s5-binder-echo-emission.test.ts`,
  and its own triage note records that `scripted-live-session-harness.ts`
  and `tool-call-dispatch-harness.ts` already carried canonical homes for
  those six pieces, none of which is `rootDouble`/`ajv`/`producerWithCapture`);
  PTQ-0971 (open) covers only the `realAjvValidator()` body across 13 files
  compared to each other, not against this specific canonical module's
  `ajv()` export; PTQ-0542 (fixed) compares the same `checkpoint`/`idSource`/
  `clock`/`schemaValidator`/`fileSystem` root-double skeleton across three
  OTHER files (`binder-param-type-projection.test.ts`,
  `e2e-s5-binder-echo-emission.test.ts`, `binder-post-merge-ajv-enforcement.test.ts`)
  and does not cite `tests/binder-forced-tool-dispatch.test.ts` or
  `scripted-live-session-harness.ts` at all. No open or resolved ticket cites
  this file's `rootDouble`/`producerWithCapture` against
  `scripted-live-session-harness.ts`'s exports of the same names.

## Triage
verdict: confirmed — independently re-verified: all seven excerpts reproduce verbatim at the cited lines (import block :150-156; local `realAjvValidator` :251-258, `rootDouble` :268-280, `producerWithCapture` :290-306; helper `ajv` :111-113, `rootDouble(overrides)` :116-122, `producerWithCapture` :142-156); the helper genuinely covers every load-bearing need — `rootDouble()` builds on runtime-belt-probe-harness `fixedClockRoot()` → fixture-dispatch-harness `rootWith(SEAM_NOOP_CHECKPOINT, "inv-1", clock)` giving the same `newToolCallId → "tc-1"` (the id the test's `toolCallReply` :388 hard-codes), a clock superset carrying `wallNow → 0`, `schemaValidator: ajv()` whose `jsonSlug` (proto-named-harness.ts:8-11) is field-identical to the local `slugOf`, and the exact `fileSystem: Pick<…,"readBytes">` override the file needs; the helper's `producerWithCapture(input)` takes `modelRegistry`, so the file's per-api model doubles (ANTHROPIC/OPENAI/MISTRAL at 30 call sites :472-:1193) pass straight through; all three local copies are live, the file is green (24/24, no skips), not a gate, `notes` is a positive read-back sink, docs/bugs and coverage-matrix greps as stated; one chronology caveat (not refuting): the local copies predate the helper exports (b027a524 2026-07-28 vs 3957ef84/7771e5df 2026-09-18), so "retypes instead of importing" is loose — the accurate class is copy-paste double left unmigrated when the shared home landed; dedupe: the `realAjvValidator` leg alone is already tracked by open PTQ-0971 (its location list names tests/binder-forced-tool-dispatch.test.ts and cites this helper's `ajv()`), so at ticketing that leg should cross-reference PTQ-0971 rather than be double-counted, but the `rootDouble`/`producerWithCapture` residue is untracked — PTQ-0535 (fixed) and PTQ-0628 (fixed) never listed this file's copies of either, PTQ-0542 (fixed) cites three other files, and the earlier intake qw20260918050411-d7-02 on this file's `producerWithCapture` was ruled duplicate of those two, which have since closed without migrating it (TRIAGE_LOG:115); PTQ-0925/0926/0795 cover disjoint helpers in this file; D7 boilerplate/copy-paste double with a mechanical import fix (triage: claude-fable-5-1)
