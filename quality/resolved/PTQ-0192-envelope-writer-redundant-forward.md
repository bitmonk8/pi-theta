---
id: PTQ-0192
title: createProductionEnvelopeWriter returns a new closure whose only statement calls the writeToFd parameter it already received
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/production-subagent-host.ts:276-287
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260910133034
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-10
---

# createProductionEnvelopeWriter returns a new closure whose only statement calls the writeToFd parameter it already received

## Observation
`createProductionEnvelopeWriter` takes one parameter, `writeToFd` (defaulted
to `defaultStdoutFdWrite`), and returns a new arrow function whose entire body
is a single call to that same parameter with the same argument, unchanged.
The returned closure's declared type, `(line: string) => void`, is identical
to `writeToFd`'s own declared type.

## Evidence
src/extension/production-subagent-host.ts:276-287:

```ts
export function createProductionEnvelopeWriter(
  writeToFd: (line: string) => void = defaultStdoutFdWrite,
): (line: string) => void {
  return (line: string): void => {
    writeToFd(line);
  };
}

/** The default fd-1 envelope write (see `createProductionEnvelopeWriter`'s WHY). */
function defaultStdoutFdWrite(line: string): void {
  writeSync(1, line); // allow-sync: RFC-0006 PIC-59 one-shot return-envelope write to fd 1, not event-loop I/O
}
```

The function's three call sites, all passing straight through to the
returned value with no intervening use of the wrapping layer itself:

```
src/extension/production-composition.ts:844:  const emitResultEnvelope = passEnvelopeWriter ?? createProductionEnvelopeWriter();
tests/production-envelope-writer.test.ts:26:    const writer = createProductionEnvelopeWriter((line) => written.push(line));
tests/production-envelope-writer.test.ts:41:      const writer = createProductionEnvelopeWriter();
```

The test at `tests/production-envelope-writer.test.ts:22-28` names the
property under test as exactly this pass-through, in its own words:

```ts
  it("forwards the envelope line VERBATIM to the injected fd writer", () => {
    const written: string[] = [];
    const writer = createProductionEnvelopeWriter((line) => written.push(line));
    const line = `${JSON.stringify({ theta_result: { v: 1, ok: "x" } })}\n`;
    writer(line);
    expect(written).toEqual([line]);
  });
```

## Why this is a problem
This is a redundant pass-through layer: the wrapping arrow function adds no
behaviour beyond what returning `writeToFd` directly would produce, since its
one statement is an unmodified call to that same parameter with the same
argument and no branching, transformation, error handling, or logging in
between. `return writeToFd;` in place of the wrapping closure would be
observably identical at all three call sites above, including the test that
already names the behaviour "VERBATIM" forwarding. The file's three sibling
`createProduction*` factories are the contrast: `createProductionExecutableHost`
(:94-131) builds an object whose methods perform real existence/runtime
probing; `createProductionParamsFs` (:227-252) returns methods that do real
temp-file I/O (`mkdtempSync`/`writeFileSync`/`unlinkSync`/`readFileSync`); and
`createProductionSpawnFn` (:458-468) returns a closure that calls
`child_process.spawn` and adapts the result. Each of those three does
something inside the closure it returns; this is the only one of the four
whose returned function's body is nothing but its own parameter, invoked.

## Suggested direction (non-binding, optional)
Return `writeToFd` (with its existing default) directly instead of wrapping
it in a new arrow function; the test-injection purpose the doc-comment states
("`writeToFd` is injected … so a test can pin the mechanism over a fake") is
unaffected, since callers still substitute the same parameter.

## False-positive check
- `grep -rl "\bcreateProductionEnvelopeWriter\b" src/ tests/ extensions/
  tools/` → 5 files. Reading every occurrence: the declaration
  (production-subagent-host.ts:276); one production CALL site with no
  argument (production-composition.ts:844 — the other three
  production-composition.ts hits at :210/:467/:580 are prose mentions in
  doc comments, not calls); two test CALL sites
  (tests/production-envelope-writer.test.ts:26 with a custom `writeToFd`,
  :41 with none); and two further test files
  (tests/execution-status-progress-wire.test.ts:191,
  tests/subagent-root-registration-refusal-envelope.test.ts:23) that only
  name the function in a comment, calling it nowhere. No call site anywhere
  supplies more than the one `writeToFd` argument the signature already
  declares, and none observes any difference between the wrapper and its
  parameter.
- Read the returned closure's full body (lines 279-281): one statement,
  `writeToFd(line);`, with no other logic.
- Compared the returned closure's declared type, `(line: string) => void`,
  against `writeToFd`'s own parameter type on line 277: byte-identical, so no
  widening/narrowing coercion is being performed by the wrapper.
- Read the file's other three `createProduction*` factories in full
  (`createProductionExecutableHost` :94-131, `createProductionParamsFs`
  :227-252, `createProductionSpawnFn` :458-468): each contains real logic
  inside its returned closure/object; none is a bare forward like this one.
- Not a deadness claim: the function, its parameter, and both call sites are
  live and reached from both production and tests; the finding is that the
  wrapping layer inside the function's body adds nothing, not that anything
  is unreached.
- Duplicate check: this is not the already-listed
  `qw20260907202646-d2-03-subagent-host-header-two-collaborators-stale.md`
  (about the module's top-of-file header, lines 1-19) — this finding is about
  this function's own body, a different location and a different claim.

## Triage
verdict: confirmed — every excerpt reproduces byte-for-byte (the function at :276-287, both call-site types at :844/tests, and all three sibling factories doing real work at :94-131/:227-252/:458-468), the wrapper's declared type is byte-identical to `writeToFd`'s and no call site or test observes name/arity/identity of the returned closure, so `return writeToFd;` is provably behavior-identical; not the header-inventory duplicate (qw20260907202646-d2-03), which is a different claim about the same file (triage: claude-opus-5)
