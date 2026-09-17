---
id: PTQ-0435
title: b0314 re-derives runtime-belt-probe-harness.ts's Probe/rootDouble/producer/render/assertValue/probeSource and e2e-s1.ts's parseDeps/parseDoc instead of importing either
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0314-compound-assign-non-numeric.test.ts:103-116
  - tests/b0314-compound-assign-non-numeric.test.ts:137-233
  - tests/helpers/e2e-s1.ts:27-45
  - tests/helpers/runtime-belt-probe-harness.ts:50-113
  - tests/helpers/runtime-belt-probe-harness.ts:174-192
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0314 re-derives runtime-belt-probe-harness.ts's Probe/rootDouble/producer/render/assertValue/probeSource and e2e-s1.ts's parseDeps/parseDoc instead of importing either

## Observation
tests/b0314-compound-assign-non-numeric.test.ts declares six module-scope pieces — `parseDeps()`/`parseOnly()` (lines 103-116), `NOOP_CHECKPOINT`/`rootDouble()`/`producer()` (lines 137-159), the `Probe` union type, `render()`, `probeSource()`, and `assertValue()` (lines 176-233) — that reproduce, near field-for-field, functions already exported from two files under tests/helpers/: `parseDeps`/`parseDoc` from `tests/helpers/e2e-s1.ts`, and `Probe`/`rootDouble`/`producer`(internal)/`render`/`assertValue`/the `probeSource` shape `makeBeltProbes` returns, all from `tests/helpers/runtime-belt-probe-harness.ts` — a module built specifically to centralise this exact trio of pieces after quality/resolved/PTQ-0397 found them duplicated between tests/b0368-plus-ordering-laundered-belt.test.ts and tests/b0369-control-flow-kind-belts.test.ts.

## Evidence
tests/b0314-compound-assign-non-numeric.test.ts:176-233 — the `Probe` type, `render()`, `probeSource()`, and `assertValue()`:
```ts
type Probe =
  | { readonly kind: "value"; readonly execution: BodyExecution }
  | { readonly kind: "threw"; readonly thrown: unknown };

async function probeSource(src: string): Promise<Probe> {
  const doc = parseTheta("b0314.theta", FM + src);
  const theta: ThetaCompositionInput = {
    slashName: "b0314",
    sourcePath: "/proj/b0314.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer().bindPromptConversation(bindInput);
  try {
    return { kind: "value", execution: await executeBody(theta.body, binding.executeDeps) };
  } catch (thrown) {
    return { kind: "threw", thrown };
  }
}

function render(value: ThetaValue | undefined): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}
...
function assertValue(probe: Probe, expected: ThetaValue, what: string): void {
  if (probe.kind === "threw") {
    expect(
      `threw ${String(probe.thrown)}`,
      `${what}: the ratified table says success value ${render(expected)}, but the runtime threw`,
    ).toBe(`success value ${render(expected)}`);
    return;
  }
  expect(probe.execution.outcome, `${what}: the body must succeed`).toBe("success");
  expect(
    probe.execution.result.value,
    `${what}: the ratified fixed value`,
  ).toEqual(expected);
}
```

tests/helpers/runtime-belt-probe-harness.ts:50-113 — the canonical `Probe`/`render`/`assertValue`, already exported:
```ts
export type Probe =
  | { readonly kind: "value"; readonly execution: BodyExecution }
  | { readonly kind: "threw"; readonly thrown: unknown };
...
function render(value: ThetaValue | undefined): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

/**
 * Assert a value row: the body succeeded and its final value equals `expected`.
 * When the runtime threw instead, the first `expect` reds cleanly naming the
 * throw, rather than letting an uncaught throw escape the test.
 */
export function assertValue(probe: Probe, expected: ThetaValue, what: string): void {
  if (probe.kind === "threw") {
    expect(
      `threw ${String(probe.thrown)}`,
      `${what}: the witness table says success value ${render(expected)}, but the runtime threw`,
    ).toBe(`success value ${render(expected)}`);
    return;
  }
  expect(probe.execution.outcome, `${what}: the body must succeed`).toBe("success");
  expect(
    probe.execution.result.value,
    `${what}: the control value (byte-identical guard)`,
  ).toEqual(expected);
}
```
`Probe`, `render`, and the two-`expect`-branch body of `assertValue` are structurally identical between the two files; only the two message strings ("ratified table"/"ratified fixed value" vs "witness table"/"control value") differ.

tests/helpers/runtime-belt-probe-harness.ts:174-192 — `makeBeltProbes`'s internal `probeSource`, the same construction b0314's copy performs:
```ts
  async function probeSource(src: string): Promise<Probe> {
    const doc = parseTheta(src);
    const theta: ThetaCompositionInput = {
      slashName: bugTag,
      sourcePath,
      frontmatter: doc.frontmatter as ParsedFrontmatter,
      body: doc.body,
    };
    const bindInput: ConversationBindInput = {
      theta,
      args: "",
      ctx: {} as unknown as ExtensionCommandContext,
    };
    const binding = producer().bindPromptConversation(bindInput);
    try {
      return { kind: "value", execution: await executeBody(theta.body, binding.executeDeps) };
    } catch (thrown) {
      return { kind: "threw", thrown };
    }
  }
```
This is b0314's `probeSource` with `bugTag`/`sourcePath` in place of the literals `"b0314"`/`"/proj/b0314.theta"`, and with `parseTheta` taking `src` alone (path supplied by the module's `bugTag` closure) versus b0314's `parseTheta(path, src)` two-argument form — the same construction, parameterised instead of hard-coded.

tests/b0314-compound-assign-non-numeric.test.ts:103-116 — `parseDeps`/`parseOnly`:
```ts
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}

function parseOnly(path: string, src: string): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}
```

tests/helpers/e2e-s1.ts:27-45 — the canonical `parseDeps`/`parseDoc`, already exported:
```ts
function inertSystemNote(): SystemNoteChannelDeps {
  const pi: SystemNoteSender = { sendMessage: (): void => {} };
  return { pi, ui: { notify: (): void => {} }, emitDiagnostic: (): void => {} };
}

const resolvingMatcher: ModelReferenceMatcher = {
  resolve: (): "resolved" => "resolved",
};

export function parseDeps(): ParseThetaDocumentDeps {
  return { systemNote: inertSystemNote(), modelMatcher: resolvingMatcher };
}

export function parseDoc(src: string, path = "test.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}
```
Both pairs build the identical `{ systemNote, modelMatcher }` shape and wrap `parseThetaDocument` over the identical `ThetaSource`-from-`TextEncoder` construction; only the exported names and parameter order differ.

tests/b0314-compound-assign-non-numeric.test.ts:137-159 — `NOOP_CHECKPOINT`/`rootDouble`/`producer`:
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
This trio matches the internal (non-exported) `rootDouble`/`producer` in runtime-belt-probe-harness.ts:64-94 field-for-field (`checkpoint`/`idSource` shape, the same `pi` object with `sendMessage`/`getActiveTools`/`setActiveTools`, the same `createProductionProducerDeps` call) apart from that module's `clock` field, added there to make its own `InterpProbe`/`InvokeProbe` drives settle synchronously — a feature b0314 does not use.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: b0314 rebuilds, statement for statement, the exact `Probe` type, `render` helper, `assertValue` two-branch check, and parse-driven `probeSource` construction that `tests/helpers/runtime-belt-probe-harness.ts` already exports for this purpose — a module that PTQ-0397 created precisely because two other bug-witness files (b0368, b0369) had independently written the same pieces. b0314 repeats the pattern PTQ-0397 already diagnosed and fixed elsewhere, in a file neither that fix nor the earlier PTQ-0209 fix (which migrated tests/b0315-stdlib-arg-runtime-belt.test.ts, this review's sibling file, onto `tests/helpers/call-with-clause-harness.ts`) reached. A change to any of these six pieces — a new `Probe` variant, a different `assertValue` failure-message convention, a change to how the executor probe threads `ctx`/`bindInput` — landing in the canonical module without a matching edit here (or vice versa) would leave this file's five RED-witness rows checking a different probe contract than the one the canonical helper's callers check, with nothing in either file surfacing the drift.

## Suggested direction (non-binding, optional)
Importing `parseDeps`/`parseDoc` from `tests/helpers/e2e-s1.ts`, and `Probe`/`assertValue` (and the `makeBeltProbes`-shaped `probeSource` construction, parameterised by a local `parseTheta` and the `"b0314"` bug tag) from `tests/helpers/runtime-belt-probe-harness.ts`, is the path the module's existing two callers (and, for the parse half, this review's own sibling file) already take; this observation names that existing, already-adopted home rather than proposing a new one.

## False-positive check
- Gate-pin check: tests/b0314-compound-assign-non-numeric.test.ts does not match `*gate*.test.ts` or its named kin; no pinned count or inventory is touched.
- Recording-double check: `rootDouble()`/`producer()` are inert doubles that let the production executor run; neither records calls to back a "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0314-compound-assign-non-numeric-silent-zero.md backs this file's non-CONTROL rows as documented RED-at-HEAD by design; that governs the file's *assertions*, not the harness-setup functions this finding is about, which compile and run correctly today (the harness itself is not red).
- coverage-matrix/bug-doc citation search: `grep -n "b0314" docs/reference/coverage-matrix.md` — no hits found; this finding does not propose merging, renaming, or deleting the file or any of its `it()` cells, only that its harness-setup functions could import already-existing helpers.
- Prior-finding overlap check: quality/resolved/PTQ-0397-b0369-duplicates-b0368-producer-harness.md (fixed) created tests/helpers/runtime-belt-probe-harness.ts for exactly the `Probe`/`rootDouble`/`producer`/`assertValue`/probe-construction pieces cited here, but its own scope was b0368/b0369 only — it does not name or touch tests/b0314-compound-assign-non-numeric.test.ts. quality/resolved/PTQ-0209 (rootDouble/producer trio, general) likewise does not cite this file among its four sites. Neither ticket's fix reached b0314; this is a fresh, unmigrated instance of an already-diagnosed pattern, not a re-file of either ticket.
- Coverage-drift check: this finding is about test-support code that exists and runs; it makes no claim that any path or behaviour is untested.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-verified independently: every excerpt reproduces verbatim at the cited lines (b0314:103-116 parseDeps/parseOnly ≡ e2e-s1.ts:27-45 parseDeps/parseDoc with args swapped; b0314:137-159 NOOP_CHECKPOINT/rootDouble/producer ≡ runtime-belt-probe-harness.ts:64-94 minus the clock field; b0314:176-233 Probe/probeSource/render/assertValue ≡ harness :50-113 and :174-192 differing only in the two message strings and the hard-coded "b0314" tag), `Probe`/`assertValue`/`makeBeltProbes` are exported and imported by b0368/b0369 while b0314 imports nothing from ./helpers/ (grep), sibling b0315-stdlib-arg-runtime-belt.test.ts:15-16 already takes the call-with-clause-harness + e2e-s1 route as claimed, coverage-matrix.md has 0 b0314 hits, no PTQ names b0314 (PTQ-0209/0214/0314/0386/0397/0405 are the same class at other files — the established per-file filing convention), and the file is not a gate/recording-double/live case; one peripheral inaccuracy: docs/bugs/0314 is Status fixed (0.293.0) and the file is 7/7 green at HEAD, not the RED-at-HEAD the FP-check asserts, which removes rather than invokes the documented-red carve-out (triage: claude-fable-5-1)
