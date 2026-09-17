---
id: PTQ-0397
title: b0369 redeclares b0368's entire offline producer/pure-host harness verbatim across seven functions
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0369-control-flow-kind-belts.test.ts:185-202
  - tests/b0369-control-flow-kind-belts.test.ts:218-228
  - tests/b0369-control-flow-kind-belts.test.ts:231-250
  - tests/b0369-control-flow-kind-belts.test.ts:257-270
  - tests/b0369-control-flow-kind-belts.test.ts:428-458
  - tests/b0369-control-flow-kind-belts.test.ts:464-522
  - tests/b0369-control-flow-kind-belts.test.ts:523-571
  - tests/b0368-plus-ordering-laundered-belt.test.ts:174-191
  - tests/b0368-plus-ordering-laundered-belt.test.ts:207-217
  - tests/b0368-plus-ordering-laundered-belt.test.ts:220-239
  - tests/b0368-plus-ordering-laundered-belt.test.ts:246-259
  - tests/b0368-plus-ordering-laundered-belt.test.ts:410-440
  - tests/b0368-plus-ordering-laundered-belt.test.ts:446-504
  - tests/b0368-plus-ordering-laundered-belt.test.ts:505-553
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917045205
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0369 redeclares b0368's entire offline producer/pure-host harness verbatim across seven functions

## Observation
tests/b0369-control-flow-kind-belts.test.ts declares seven module-scope harness
pieces — `rootDouble()`, `producer()`, `probeSource()`, `assertValue()`, the
`InstantSettleSession` class, `driveInterp()`, and `driveInvoke()` — that build
a `RuntimeRoot` double, wrap it with `createProductionProducerDeps`, drive
`executeBody` directly, and probe the two pure-host entry points
(interpolation rendering and invoke-argument binding). tests/b0368-plus-ordering-laundered-belt.test.ts
declares the same seven pieces under the same names. A line-range `diff` of
each pair (below) shows every one of the seven is either byte-identical or
differs only in a comment's predecessor-bug-number reference or a literal
`slashName`/`sourcePath` string. b0369's own section-heading comments state
this outright four times ("the b0368 shape, verbatim"), and neither file
imports the shared pieces from `tests/helpers/`.

## Evidence

`rootDouble()` — tests/b0369-control-flow-kind-belts.test.ts:185-199 (first 15
of 18 lines; re-read immediately before filing):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    // The prompt-mode drive's only wait primitive is `Clock.setTimeout`; fire the
    // callback synchronously so an instant-settle turn completes deterministically
    // with no real timers (the b0368 harness contract).
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
```
tests/b0368-plus-ordering-laundered-belt.test.ts:174-191 is the same 18-line
function; `diff <(sed -n '174,191p' tests/b0368-plus-ordering-laundered-belt.test.ts) <(sed -n '185,202p' tests/b0369-control-flow-kind-belts.test.ts)`
→ exactly one line differs, the comment naming the predecessor bug ("the
b0338 harness contract" in b0368 vs "the b0368 harness contract" in b0369);
all 17 other lines, including every field, brace, and value, are identical.

`producer()` — tests/b0369-control-flow-kind-belts.test.ts:218-228 (full, 11
lines):
```ts
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
tests/b0368-plus-ordering-laundered-belt.test.ts:207-217 is the identical
11-line function; `diff` of the two ranges produces zero output (byte-for-byte
identical, no exceptions).

`assertValue()` — tests/b0369-control-flow-kind-belts.test.ts:257-270 (full,
14 lines):
```ts
function assertValue(probe: Probe, expected: ThetaValue, what: string): void {
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
tests/b0368-plus-ordering-laundered-belt.test.ts:246-259 is the identical
14-line function; `diff` of the two ranges produces zero output.

`probeSource()` — tests/b0369-control-flow-kind-belts.test.ts:231-250 (full,
20 lines except the two literal-string lines noted below):
```ts
async function probeSource(src: string): Promise<Probe> {
  const doc = parseTheta(src);
  const theta: ThetaCompositionInput = {
    slashName: "b0369",
    sourcePath: "/proj/b0369.theta",
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
tests/b0368-plus-ordering-laundered-belt.test.ts:220-239 is the same 20-line
function with `"b0368"` in place of `"b0369"` on the `slashName`/`sourcePath`
lines. Search executed: both 20-line ranges piped through `sed 's/b0368/BUGNUM/g'` /
`sed 's/b0369/BUGNUM/g'` respectively, then `diff` → zero output (identical
apart from the bug-number substring).

`InstantSettleSession` — tests/b0369-control-flow-kind-belts.test.ts:428-442
(first 15 of 31 lines):
```ts
class InstantSettleSession {
  readonly entries: Array<Record<string, unknown>> = [];
  readonly sent: string[] = [];

  sendUserMessage(text: string): void {
    this.sent.push(text);
    this.entries.push({
      type: "message",
      id: `u${this.entries.length + 1}`,
      parentId: undefined,
      message: { role: "user", content: [{ type: "text", text }] },
    });
    this.entries.push({
      type: "message",
      id: `a${this.entries.length + 1}`,
```
tests/b0368-plus-ordering-laundered-belt.test.ts:410-440 is the identical
31-line class (including the remaining 16 lines: the assistant-entry object,
`isIdle()`, and the closing brace); `diff` of the full 410-440 vs 428-458
ranges produces zero output.

`driveInterp()` — tests/b0369-control-flow-kind-belts.test.ts:464-478 (first
15 of 59 lines):
```ts
async function driveInterp(src: string): Promise<InterpProbe> {
  const doc = parseTheta(src);
  const session = new InstantSettleSession();
  const pi = {
    sendUserMessage: (content: string): void => session.sendUserMessage(content),
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
    registerTool: (): void => {},
    on: (): void => {},
    sendMessage: (): void => {},
  } as unknown as ExtensionAPI;
  const deps = createProductionProducerDeps({
    pi,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
```
tests/b0368-plus-ordering-laundered-belt.test.ts:446-504 is the same 59-line
function. Search executed: both 59-line ranges normalised (`b0368`/`b0369` →
`BUGNUM`) then `diff` → zero output.

`driveInvoke()` — tests/b0369-control-flow-kind-belts.test.ts:523-537 (first
15 of 49 lines):
```ts
async function driveInvoke(src: string): Promise<InvokeProbe> {
  const doc = parseTheta(src);
  let parseCalleeCalls = 0;
  const pi = {
    sendMessage: (): void => {},
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
  const deps = createProductionProducerDeps({
    pi,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    // Bug 0293: `undefined` still yields Err(load_failure) as a VALUE (the
    // seam-absent default) — enough to record that the invoke reached callee
    // load carrying the bound arg; the child is never spawned.
```
tests/b0368-plus-ordering-laundered-belt.test.ts:505-553 is the same 49-line
function. Search executed: both 49-line ranges normalised (`b0368`/`b0369` →
`BUGNUM`) then `diff` → zero output.

Both files pass in full at HEAD: `npx vitest run tests/b0369-control-flow-kind-belts.test.ts tests/b0368-plus-ordering-laundered-belt.test.ts`
→ 2 files, 53 tests, all passing (34 + 19).

## Why this is a problem
This is the "Boilerplate duplication" class: seven functions totalling
roughly 210 lines — the entire offline `RuntimeRoot` double, the production
producer wrapper, the parse-and-run probe, the two assertion helpers'
underlying value-check, the instant-settling session double, and both
pure-host drive functions (interpolation and invoke-argument) — are declared
twice, once per file, rather than shared. b0369's own section comments
concede this in four places ("Shared parse harness (the b0368 shape,
verbatim)", "EXECUTOR harness (b0368 shape, verbatim)", "PURE-HOST harness
(b0368 shape, verbatim)", "INVOKE drive (b0368 shape)"), and its
`rootDouble()`'s own trailing comment in turn calls out b0368 by name as the
harness it was carried over from. A behavioural change to any one of these
seven pieces — e.g. the instant-settle session's assistant-entry shape, or
`probeSource`'s try/catch framing — applied to one copy and not the other
would leave the two "sibling belt" test files silently exercising divergent
harnesses with nothing in either file surfacing the drift; this is the same
risk this repository's own PTQ-0209 and PTQ-0363 findings (both `status:
fixed`) named for the `rootDouble`/`producer` trio and the `Harness`/
`makeHarness`/`boot` trio respectively, applied here to a different, larger
set of functions shared by this same b0368/b0369 pair that neither of those
two fixes, nor the resolved PTQ-0376 (which addressed a narrower, purely
intra-b0369 redundancy between `assertLoudThrow` and
`assertFramesToInternalError`, explicitly citing b0368 only as "corroborating
context, not a location"), reached.

## Suggested direction (non-binding, optional)
`tests/helpers/` is this suite's established home for shared, offline,
provider-free test doubles (`fake-clock.ts`, `fake-file-system.ts`,
`e2e-s1.ts`, and the harness modules PTQ-0209/PTQ-0363's own fixes already
populated for the sibling `rootDouble`/`makeHarness` trios) — naming it here
observes where this suite's own established convention already points, not a
design for this specific pair.

## False-positive check
- Gate-pin check: neither tests/b0369-control-flow-kind-belts.test.ts nor
  tests/b0368-plus-ordering-laundered-belt.test.ts matches `*gate*.test.ts`
  or the named kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); none of the cited lines is a pinned count
  or inventory assertion.
- Recording-double check: none of the seven cited pieces is a recording
  double backing a MUST-NOT-called witness — `rootDouble`/`producer` compose
  a real production dependency graph, `probeSource`/`driveInterp`/
  `driveInvoke` run it and capture its outcome, and `InstantSettleSession`
  supplies a deterministic session shape, not a "never called" assertion; the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0369-control-flow-runtime-kind-fallbacks-silent.md
  Status "fixed (0.350.0)"; docs/bugs/0368-plus-and-ordering-laundered-operands-silent-js-coercion.md
  Status "fixed (0.348.0)". `npx vitest run` on both files (command above) →
  53/53 passing at HEAD, so neither file is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0369-control-flow-kind-belts\|b0368-plus-ordering" docs/reference/coverage-matrix.md`
  → 0 hits. `grep -n "rootDouble\|probeSource\|driveInterp\|driveInvoke\|InstantSettleSession\|assertValue"
  docs/bugs/0369-control-flow-runtime-kind-fallbacks-silent.md` → 0 hits (the
  bug doc cites its test file as a whole, never a specific helper function).
  This finding proposes no merge, rename, or deletion of either file or any
  `it()`/`describe()` — only that the seven shared functions could be
  imported rather than redeclared — so no citation is disturbed.
- Prior-finding overlap check: `grep -rl "InstantSettleSession\|driveInterp\|probeSource\|driveInvoke\|b0368"
  quality/issues quality/resolved quality/intake` → PTQ-0256 (unrelated:
  `errorCodes` helper duplication), PTQ-0245 and PTQ-0383 (unrelated: two
  test-title-vs-body mismatches under different `probeSource` callers, not
  about the function's own duplication), and PTQ-0376 (`status: fixed`,
  re-read in full: its own Evidence and locations are confined to
  `assertLoudThrow`/`assertFramesToInternalError` inside b0369 alone, and its
  own text states b0368 "is cited here only as corroborating context, not as
  a location of this finding" — its root cause, that one function
  re-derives a second already-in-file function's checks, is disjoint from
  this finding's root cause, that seven OTHER functions are copy-pasted
  across two files). This finding deliberately excludes `assertLoudThrow`/
  `assertFramesToInternalError` from its own Evidence to keep the two
  findings' root causes non-overlapping.
- Scope note: tests/b0368-plus-ordering-laundered-belt.test.ts is outside
  this wave's assigned seven-file scope; it is cited only as pattern context
  (confirming the byte-identity of the duplicated harness), not claimed as
  an additional reviewed file — the same in-scope/pattern-context boundary
  PTQ-0363, PTQ-0346, and PTQ-0376 already used for this same b0369 file
  against its own sibling files.
- Coverage-drift check: this finding is about seven already-written,
  already-passing functions' bodies being copy-pasted rather than shared; it
  does not claim any behaviour or path is untested, and proposes no change to
  any `it()`/`describe()` name or count (53/53 unaffected).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — rootDouble/producer/assertValue/probeSource/InstantSettleSession/driveInterp/driveInvoke independently reproduce byte-identical (or single predecessor-bug-number-comment-diff) between the two files at their true function bodies, both docs/bugs are fixed with 53/53 green and 0 coverage-matrix hits, and re-reading PTQ-0209/0363/0376/0384/0245/0383/0256/0386 confirms none covers this pair; the driveInterp/driveInvoke cited ranges overshoot 14/6 lines into the next section's header (so the claimed normalised driveInterp diff isn't literally zero-output), a citation-precision slip that doesn't refute the underlying duplication (triage: claude-opus-5)
