---
id: PTQ-0816
title: match-arm-scope-inference-pass.test.ts re-derives NOOP_CHECKPOINT/rootDouble/pi-double instead of importing the canonical call-with-clause-harness exports
lens: D7
status: open
verdict: confirmed
locations:
  - tests/match-arm-scope-inference-pass.test.ts:1350-1372
  - tests/helpers/call-with-clause-harness.ts:152-175
sites: 1
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# match-arm-scope-inference-pass.test.ts re-derives NOOP_CHECKPOINT/rootDouble/pi-double instead of importing the canonical call-with-clause-harness exports

## Observation
tests/match-arm-scope-inference-pass.test.ts declares its own module-scope
`NOOP_CHECKPOINT` constant, `rootDouble()` function, and an inline `pi` double
inside `producer()`. `tests/helpers/call-with-clause-harness.ts` already
exports a byte-identical `NOOP_CHECKPOINT`, a `rootDouble()` whose
`checkpoint`/`idSource` fields are identical to the reviewed file's own
`rootDouble()` (the exported one additionally carries a `clock` field the
reviewed file's runtime rows never read), and a `noopPi()` whose three fields
are field-for-field identical to the inline `pi` object the reviewed file
builds inside `producer()`. The reviewed file imports none of these three; the
file's own header comment even names this exact harness shape as coming from
`tests/non-object-receiver-gate.test.ts`'s `probeSource`, without importing a
shared helper for it.

## Evidence
tests/match-arm-scope-inference-pass.test.ts:1350-1372 (re-read immediately before filing):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}

function producer() {
  return createProductionProducerDeps({
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}
```

tests/helpers/call-with-clause-harness.ts:152-175 — the canonical exports,
`NOOP_CHECKPOINT` byte-identical and `rootDouble`'s `checkpoint`/`idSource`
fields identical to the reviewed file's own copy above, and `noopPi()`
field-for-field identical to the reviewed file's inline `pi` object:
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
}

export function noopPi(): ExtensionAPI {
  return {
    sendMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
}
```

Search performed: `grep -n "NOOP_CHECKPOINT\|function rootDouble\|function producer" tests/match-arm-scope-inference-pass.test.ts` → the three declarations at lines 1350, 1356, 1363, none imported (the file's only local import from `tests/helpers` is `parseDoc` from `./helpers/e2e-s1`, `readRegistry` from `./helpers/registry-oracle`, and `PARSE_REGISTRY_PATH` from `./helpers/load-row-harness`). `grep -n "export const NOOP_CHECKPOINT\|export function rootDouble\|export function noopPi" tests/helpers/call-with-clause-harness.ts` → the three canonical exports cited above.

## Why this is a problem
This is the copy-paste-fixtures/doubles class: an inert `Checkpoint`, a
`RuntimeRoot` double carrying `checkpoint`/`idSource`, and a no-op
`ExtensionAPI` double are all rebuilt from scratch in this file even though
every one of them already exists as an exported, reusable function under
`tests/helpers/call-with-clause-harness.ts` — `NOOP_CHECKPOINT`
(byte-identical) and `rootDouble`/`noopPi` (field-for-field identical on
every field this file's own runtime-driving group (f) reads). The file's own
comment ("Harness: … the shape of tests/non-object-receiver-gate.test.ts's
`probeSource`") shows the author was aware the shape is shared, but the
sharing stopped at citing the pattern rather than importing the helper that
already implements it.

## Suggested direction (non-binding, optional)
`tests/helpers/call-with-clause-harness.ts` already exports `rootDouble` and
`noopPi` matching this file's own shape on every field its group-(f) runtime
rows read; naming those exports is an observation about the file's own
stated scope, not a design for the change.

## False-positive check
- Gate-pin check: `match-arm-scope-inference-pass.test.ts` is not a
  `*gate*.test.ts` file and asserts no pinned count/inventory that this
  finding touches.
- Recording-double check: none of `NOOP_CHECKPOINT`, `rootDouble()`, or the
  inline `pi` double records a call for a MUST-NOT-called witness — all three
  are inert stand-ins with no call log read by any assertion in the file
  (`grep -n "rootDouble\|producer()" tests/match-arm-scope-inference-pass.test.ts`
  shows only declaration and call-site uses feeding `startRun`/`runValue`), so
  the recording-double carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "match-arm-scope-inference-pass"
  docs/bugs/*.md` hits 0145, 0369, 0395 — 0145 cites the file as its own
  regression witness and pins PIN f8's OUTCOME assertion (re-anchored to bug
  0369's runtime belt); 0369 and 0395 cite the file only as a green-suite
  witness in their fix logs. None documents a rationale for keeping the
  `NOOP_CHECKPOINT`/`rootDouble`/inline-`pi` block local, and none cites lines
  1350-1372.
- coverage-matrix/bug-doc citation search: `grep -n
  "match-arm-scope-inference-pass.test.ts" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of the file or
  any `it()` — only that three internal doubles could import the existing
  helpers instead of redeclaring them.
- Overlap check: `grep -rl "match-arm-scope-inference-pass"
  quality/issues quality/resolved quality/intake` → only
  `quality/resolved/PTQ-0468-fn-arg-single-page-registry-oracle-duplicated.md`,
  which is a distinct, already-fixed root cause (this file's registry read,
  now imported from `tests/helpers/registry-oracle.ts` at HEAD — confirmed by
  this file's own `import { readRegistry } from "./helpers/registry-oracle"`
  at its head). No PTQ names the `NOOP_CHECKPOINT`/`rootDouble`/`producer`
  block at lines 1350-1372.
- Coverage-drift check: this claim is about a harness declaration repeated
  across a file and an already-exported helper that already exist and already
  pass; it makes no claim that any behaviour or path is untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: NOOP_CHECKPOINT/rootDouble/producer reproduce verbatim at tests/match-arm-scope-inference-pass.test.ts:1350-1372 and the harness excerpt at tests/helpers/call-with-clause-harness.ts:152-175; the reviewed file's NOOP_CHECKPOINT is byte-identical, its rootDouble matches the helper's checkpoint/idSource fields (the helper's extra clock is inert behind the `as unknown as RuntimeRoot` cast and the file never reads clock), and the inline `pi` object is field-for-field noopPi(); the file imports nothing from call-with-clause-harness (14 other test files do), the header at :1329 names non-object-receiver-gate's probeSource shape as the copied lineage, the file is not a gate (0 `gate` in name, no pinned count), 48/48 green at HEAD, coverage-matrix 0 hits, docs/bugs 0145/0369/0395 cite the file only as a witness without naming the harness block, and no merge/rename/delete is proposed so no carve-out binds; in-scope D7 copy-paste double confined to tests/; not a duplicate — the only PTQ citing this file is resolved PTQ-0468 (registry oracle, different root cause), the same-wave sibling d7-01-fill-placeholder cites a different file/block, and ledger precedent (PTQ-0209 fixed for its 4 files only; PTQ-0603/PTQ-0738/PTQ-0228/PTQ-0240) treats each un-migrated residual copy of this trio as separately filable; one evidentiary correction for ticketing: the helper's NOOP_CHECKPOINT is a bare module-private `const`, NOT exported (only rootDouble/noopPi are) — immaterial since the file consumes it solely through rootDouble, which the import replaces; the file (eceeaf11, 2026-08-21) predates the helper (96303cc3, 2026-09-09), so this is the not-migrated class rather than a bypass at authoring time (triage: claude-fable-5-1)
