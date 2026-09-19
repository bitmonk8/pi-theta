---
id: PTQ-0848
title: ctor-declaration-order.test.ts and ctor-proto-named-field.test.ts redeclare the identical NOOP_CHECKPOINT/livePi/rootLive/registryDouble/ctxLive/drive/finalValue/renderedTurn/ownKeys production-composition drive harness
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/ctor-declaration-order.test.ts:188-192
  - tests/ctor-declaration-order.test.ts:223-276
  - tests/ctor-declaration-order.test.ts:335-380
  - tests/ctor-proto-named-field.test.ts:248-252
  - tests/ctor-proto-named-field.test.ts:312-365
  - tests/ctor-proto-named-field.test.ts:425-491
sites: 2
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# ctor-declaration-order.test.ts and ctor-proto-named-field.test.ts redeclare the identical NOOP_CHECKPOINT/livePi/rootLive/registryDouble/ctxLive/drive/finalValue/renderedTurn/ownKeys production-composition drive harness

## Observation
`tests/ctor-declaration-order.test.ts` and `tests/ctor-proto-named-field.test.ts`
each declare, at module scope, a `NOOP_CHECKPOINT` constant and the functions
`livePi`, `rootLive`, `registryDouble`, `ctxLive`, `finalValue`,
`renderedTurn` and `ownKeys` that drive the real
`createProductionProducerDeps` → `bindPromptConversation` → `executeBody`
pipeline against a `LiveSessionDouble`. `livePi`, `rootLive`,
`registryDouble`, `ctxLive` and `ownKeys` are byte-identical between the two
files (bar one doc-comment wording difference in `registryDouble`'s trailing
comment and `ctxLive`'s doc comment); `finalValue` and `renderedTurn` are
identical in body, differing only in their own doc comments. No
`tests/helpers/` module exports any of these functions; each file's own
header states the shape was copied from the other ("the shape … established",
"tests/interpolated-result-gate.test.ts's `producer(resolvePiTool)` threads
it", "the shape tests/ctor-declaration-order.test.ts established for bug
0080").

## Evidence
`tests/ctor-declaration-order.test.ts:223-233` (`livePi`):
```ts
function livePi(session: LiveSessionDouble): ExtensionAPI {
  return {
    sendUserMessage: (content: string): void => session.sendUserMessage(content),
    sendMessage: (): void => {},
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
    registerTool: (): void => {},
    on: (): void => {},
  } as unknown as ExtensionAPI;
}
```

`tests/ctor-proto-named-field.test.ts:312-320` (identical body):
```ts
function livePi(session: LiveSessionDouble): ExtensionAPI {
  return {
    sendUserMessage: (content: string): void => session.sendUserMessage(content),
    sendMessage: (): void => {},
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
    registerTool: (): void => {},
    on: (): void => {},
  } as unknown as ExtensionAPI;
}
```

`tests/ctor-declaration-order.test.ts:234-250` (`rootLive`) and
`tests/ctor-proto-named-field.test.ts:323-339` (byte-identical body):
```ts
function rootLive(session: LiveSessionDouble): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        session.tick();
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
  } as unknown as RuntimeRoot;
}
```

`tests/ctor-declaration-order.test.ts:251-256` (`registryDouble`) and
`tests/ctor-proto-named-field.test.ts:340-345` (byte-identical body):
```ts
function registryDouble(): ModelRegistry {
  return {
    getAvailable: () => [ANTHROPIC_MODEL],
    getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k-test" }),
  } as unknown as ModelRegistry;
}
```

`tests/ctor-declaration-order.test.ts:263-273` (`ctxLive`) and
`tests/ctor-proto-named-field.test.ts:352-362` (byte-identical body, doc
comment above it reworded only):
```ts
function ctxLive(session: LiveSessionDouble): ExtensionCommandContext {
  return {
    model: ANTHROPIC_MODEL,
    signal: undefined,
    isIdle: (): boolean => session.isIdle(),
    waitForIdle: (): Promise<void> => Promise.resolve(),
    sessionManager: {
      getEntries: (): readonly SessionEntryDouble[] => [],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
}
```

`tests/ctor-declaration-order.test.ts:335-346` (`finalValue`) and
`tests/ctor-proto-named-field.test.ts:425-436` (byte-identical body):
```ts
async function finalValue(src: string, what: string): Promise<ThetaValue> {
  const outcome = await drive(src);
  if (outcome.kind === "threw") {
    throw new Error(
      `harness: ${what} must produce a final value; the drive threw ${String(outcome.thrown)}`,
    );
  }
  if (outcome.execution.outcome !== "success") {
    throw new Error(
      `harness: ${what} must succeed; the drive ended ${String(outcome.execution.outcome)}`,
    );
  }
  return outcome.execution.result.value as ThetaValue;
}
```

`tests/ctor-declaration-order.test.ts:354-368` (`renderedTurn`) and
`tests/ctor-proto-named-field.test.ts:467-481` (byte-identical body):
```ts
async function renderedTurn(src: string, what: string): Promise<string> {
  const outcome = await drive(src);
  if (outcome.kind === "threw") {
    throw new Error(
      `harness: ${what} must render a turn; the drive threw ${String(outcome.thrown)}`,
    );
  }
  if (outcome.session.sendUserMessageCalls !== 1) {
    throw new Error(
      `harness: ${what} must drive exactly one streamed user turn; observed ${outcome.session.sendUserMessageCalls} (sent: ${JSON.stringify(outcome.session.sentQueryTexts)})`,
    );
  }
  return outcome.session.sentQueryTexts[0] as string;
}
```

`tests/ctor-declaration-order.test.ts:374-379` (`ownKeys`) and
`tests/ctor-proto-named-field.test.ts:487-492` (byte-identical body):
```ts
function ownKeys(value: ThetaValue, what: string): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`harness: ${what} must be an object-schema value; got ${JSON.stringify(value)}`);
  }
  return Object.keys(value);
}
```

`tests/ctor-declaration-order.test.ts:188-192` and
`tests/ctor-proto-named-field.test.ts:248-252` (`NOOP_CHECKPOINT`, byte-identical):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

Direct diff performed: `diff <(sed -n '223,276p' ctor-declaration-order.test.ts) <(sed -n '312,365p' ctor-proto-named-field.test.ts)` and the equivalent for `finalValue`/`renderedTurn`/`ownKeys` show only doc-comment wording differences and the additional `readOutcome` helper `ctor-proto-named-field.test.ts` inserts between `finalValue` and `renderedTurn`; every function body quoted above is character-for-character identical between the two files. `grep -rn "function livePi\|function rootLive(session\|registryDouble()" tests/` finds these two declarations only.

## Why this is a problem
Seven functions and one constant that together implement the entire
production-composition drive path (`ExtensionAPI` double, `RuntimeRoot`
double, `ModelRegistry` double, `ExtensionCommandContext` double, and the
three drive-outcome readers) are declared with identical bodies in two files
that sit in the same bug-witness lineage and that each name the other as the
source of the shape ("the shape … established", "the same drive as rows
A-O"). Neither file imports the other's declarations, and no `tests/helpers/`
module holds this cluster. A change to any one piece of the drive plumbing —
the fake clock's `setTimeout` behaviour, the `ModelRegistry` double's shape,
or the non-success/threw disposition handling in `finalValue`/`renderedTurn`
— has two hand-synchronised copies to keep in step.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module analogous to the existing
`scripted-live-session-harness.ts` (which already centralises the
`LiveSessionDouble`'s fixture-model half for this same lineage) is the kind of
home the repository already uses for exactly this shape; `livePi`, `rootLive`,
`registryDouble`, `ctxLive`, `finalValue`, `renderedTurn` and `ownKeys` carry
no bug-specific content and could sit alongside it, parameterised only by the
`LiveSessionDouble` instance and the fixture path each already takes as an
argument.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; the cited lines are drive-harness plumbing functions, not a pinned
  count or inventory assertion.
- Recording-double check: `LiveSessionDouble` (built by these functions) does
  record calls for later positive assertions about what was sent, not a
  "never called" witness; this finding is about the duplicated
  plumbing/reader functions around the double, not the double's own recording
  behaviour (already the subject of a separate not-migrated finding for
  `ctor-proto-named-field.test.ts`).
- docs/bugs/ signature search: `docs/bugs/0080-keys-values-construction-order-not-declaration-order.md`
  and `docs/bugs/0119-proto-named-field-silently-dropped.md` are both fixed;
  each names the file's own cell letters in its RED-pin prose, not this
  shared-plumbing shape; neither doc states a rationale for keeping the drive
  harness local to each file rather than sharing it.
- coverage-matrix/bug-doc citation search: `grep -n
  "ctor-declaration-order\|ctor-proto-named-field"
  docs/reference/coverage-matrix.md` → 0 hits. Both files are cited by name in
  several docs/bugs/ documents, each pinning specific `it()` cell ranges well
  beyond the cited harness-preamble lines (e.g. bug 0119's own cited
  `describe` blocks all begin after line 310 of `ctor-proto-named-field.test.ts`).
  This finding proposes no merge, rename or deletion of any cited cell — only
  that the shared plumbing functions be defined once.
- Prior-finding search: `grep -rn "function livePi\|function rootLive(session\|registryDouble()"
  quality/issues quality/resolved quality/intake` → 0 hits; the resolved
  `PTQ-0459` finding for this same file pair covers only the
  `ANTHROPIC_MODEL`/`SessionEntryDouble`/`parseDeps`/`LiveSessionDouble`
  append-shape cluster (already fixed in `ctor-declaration-order.test.ts`,
  which now imports those four from `tests/helpers/scripted-live-session-harness.ts`
  while still redeclaring the seven functions and constant cited here), a
  disjoint root cause from the drive-plumbing functions cited in this filing.
- Coverage check: the claim is about duplicated helper-function DEFINITIONS,
  not a missing test path; every cell in both files that calls these
  functions continues to pass under the current per-file definitions.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: sed-extracted tests/ctor-declaration-order.test.ts:223-276 vs tests/ctor-proto-named-field.test.ts:312-365 (livePi/rootLive/registryDouble/ctxLive) diff to a two-line ctxLive doc-comment reword only; finalValue :335-346 vs :425-436, renderedTurn :354-368 vs :467-481, ownKeys :374-379 vs :487-492 and NOOP_CHECKPOINT :188-192 vs :248-252 diff empty; drive :286-333 vs :375-423 differs only in the `slashName` literal (bug0080/bug0119) and doc prose; the proto-named header (:150-159) states the shape was copied from ctor-declaration-order; tests/helpers/ exports none of these (scripted-live-session-harness exports only ANTHROPIC_MODEL/SessionEntryDouble/append*/parseDeps/parse/ajv/rootDouble/capturingAjv; NOOP_CHECKPOINT exists only under other helper names), both locations under tests/, D7 boilerplate/copy-paste-double class; carve-outs: neither is a *gate* file, LiveSessionDouble is a positive recording witness, bugs 0080/0119 are fixed, docs/bugs line-cites into ctor-declaration-order (:451/:540/:679) are cells outside the harness preamble, coverage-matrix → 0 hits, no cell merge/rename/delete proposed; not a duplicate — resolved PTQ-0459/0464/0556/0564/0726/0728 cover only the ANTHROPIC_MODEL/SessionEntryDouble/parseDeps/append cluster, PTQ-0729/0738 cover the rootDouble/ctxDouble typed-query lineage, PTQ-0481 merely notes the trio is local relative to the belt-probe helper, and grep of livePi/rootLive/ctxLive/renderedTurn/ownKeys across quality/issues+resolved names no tracker for this cluster. One correction for the record: the filing's `grep -rn "function livePi\|function rootLive(session\|registryDouble()" tests/` → "these two declarations only" is wrong — 8 files match (also empty-query-annotation, enum-schema-tag-privacy, interpolated-result-gate, interpolation-parse-diagnostics, non-object-receiver-gate, schema-brand-symbol-migration), with interpolated-result-gate.test.ts:389-475 byte-identical to the ctor pair and the others differing only by `schemaValidator: ajv()` / `getEntries` body; finalValue/renderedTurn/ownKeys are genuinely two-file. This widens rather than refutes the root cause (no shared home for the livePi/rootLive/registryDouble/ctxLive drive quartet); per REVIEW_LOG shard-37 fold interpolated-result-gate.test.ts:389-475 into the location list at acceptance and let the fixer consider the near-identical siblings (triage: claude-fable-5-1)
