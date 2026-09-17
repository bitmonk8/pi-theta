---
id: PTQ-0702
title: session-control-static-checks.test.ts's EMPTY_GRAPH/noArityResolution/checkBody/bodyOf quartet is a byte-for-byte, self-declared mirror of call-with-clause-static-checks.test.ts's
lens: D7
status: open
verdict: confirmed
locations:
  - tests/session-control-static-checks.test.ts:75-106
  - tests/call-with-clause-static-checks.test.ts:52-78
sites: 2
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# session-control-static-checks.test.ts's EMPTY_GRAPH/noArityResolution/checkBody/bodyOf quartet is a byte-for-byte, self-declared mirror of call-with-clause-static-checks.test.ts's

## Observation
`tests/session-control-static-checks.test.ts` declares its own `EMPTY_GRAPH`
constant, `noArityResolution` function, `bodyOf` function, and
`checkBody(body, callableSet)` async function for driving
`checkInvokeStaticResolution`. Its own header comment states this is
deliberate: "Driven directly at the UNIT level (`checkInvokeStaticResolution`,
hand-built `ThetaCompositionInput` + a hand-built `CallableSetSnapshot`
carrying `kind: "runtime-tool"` entries via a structural cast — mirroring
`tests/call-with-clause-static-checks.test.ts`'s `mixedCallableSet()`)".
`tests/call-with-clause-static-checks.test.ts` declares the identical
`EMPTY_GRAPH` literal, the identical `noArityResolution` body, an identical
`bodyOf`, and a `checkBody` whose full body (the `ThetaCompositionInput`
shape, the `FakeFileSystem` construction, the `deps` object literal, and the
final `diags.map((d) => d.code)` return) is byte-identical apart from
parameter-list line-wrapping. Neither file imports these from
`tests/helpers/`.

## Evidence
tests/session-control-static-checks.test.ts:75-106 (re-read immediately
before filing):
```ts
const EMPTY_GRAPH = { edges: new Map([["caller", []]]), unresolvable: new Set<string>() };
const noArityResolution = (): Promise<CalleeArity | undefined> => Promise.resolve(undefined);
```
```ts
function bodyOf(...stmts: ReturnType<typeof letCall>[]): ThetaBody {
  return { statements: stmts as unknown as ThetaBody["statements"], tail: null };
}
```
```ts
async function checkBody(body: ThetaBody, callableSet: CallableSetSnapshot | undefined): Promise<string[]> {
  const input: ThetaCompositionInput = {
    slashName: "caller",
    sourcePath: "/thetadir/caller.theta",
    frontmatter: {} as unknown as ParsedFrontmatter,
    body,
  };
  const deps = {
    fs: new FakeFileSystem({ homedir: "/home/u", cwd: "/theta", files: {}, dirs: {} }),
    activeRoots: ["/theta"],
    graph: EMPTY_GRAPH,
    resolveCalleeArity: noArityResolution,
    ...(callableSet !== undefined ? { callableSet } : {}),
  };
  const diags = await checkInvokeStaticResolution(input, deps);
  return diags.map((d) => d.code);
}
```

tests/call-with-clause-static-checks.test.ts:52-78 (the same four
declarations, byte-identical bodies):
```ts
function bodyOf(...stmts: ReturnType<typeof letCall>[]): ThetaBody {
  return { statements: stmts as unknown as ThetaBody["statements"], tail: null };
}

const EMPTY_GRAPH = { edges: new Map([["caller", []]]), unresolvable: new Set<string>() };

const noArityResolution = (): Promise<CalleeArity | undefined> => Promise.resolve(undefined);

async function checkBody(
  body: ThetaBody,
  callableSet: CallableSetSnapshot | undefined,
): Promise<string[]> {
  const input: ThetaCompositionInput = {
    slashName: "caller",
    sourcePath: "/thetadir/caller.theta",
    frontmatter: {} as unknown as ParsedFrontmatter,
    body,
  };
  const deps = {
    fs: new FakeFileSystem({ homedir: "/home/u", cwd: "/theta", files: {}, dirs: {} }),
    activeRoots: ["/theta"],
    graph: EMPTY_GRAPH,
    resolveCalleeArity: noArityResolution,
    ...(callableSet !== undefined ? { callableSet } : {}),
  };
  const diags = await checkInvokeStaticResolution(input, deps);
  return diags.map((d) => d.code);
}
```

Exact search: `grep -n "^const EMPTY_GRAPH\|^const noArityResolution\|^async function checkBody\|^function bodyOf" tests/session-control-static-checks.test.ts tests/call-with-clause-static-checks.test.ts` returns exactly one hit per declaration per file, matching the locations cited above.

## Why this is a problem
Both files drive the same production entry point, `checkInvokeStaticResolution`,
against the identical inert deps shape (an empty two-key call graph, an
arity resolver that always answers `undefined`, and a `FakeFileSystem`
seeded with the same `homedir`/`cwd` pair), and the newer file's own header
names the exact older file this shape was copied from rather than imported.
A change to the deps `checkInvokeStaticResolution` requires (e.g. a new
required field, or a different empty-graph shape) must be hand-applied in
both files.

## Suggested direction (non-binding, optional)
No `tests/helpers/` module currently exports this
`EMPTY_GRAPH`/`noArityResolution`/`bodyOf`/`checkBody` quartet; the credited
"mirroring `tests/call-with-clause-static-checks.test.ts`" comment already
names the file such a shared export would be lifted from.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; not applicable.
- Recording-double check: neither `checkBody` nor its deps object is a
  recording double or MUST-NOT witness; both drive a real static-check pass
  and return the resulting diagnostic codes for positive/negative code-set
  assertions in each file. Not applicable.
- docs/bugs/ signature search: `grep -rln "checkInvokeStaticResolution\|EMPTY_GRAPH" docs/bugs/*.md` returns no hits tying this shared harness to a documented correct-reason red; `tests/session-control-static-checks.test.ts` is an RFC 0011 RED-by-design suite for the runtime-tool arity/type-check arm, but its stated RED signature concerns the missing `kind === "runtime-tool"` classification loop in production code, never this setup harness, and `tests/call-with-clause-static-checks.test.ts` passes at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n "session-control-static-checks\|call-with-clause-static-checks" docs/reference/coverage-matrix.md` returns no hits. This finding proposes no merge, rename, or deletion of either file or any `it()`/`describe()` inside them.
- Coverage check: this finding is about a repeated harness-quartet DEFINITION that exists in both files today, not a missing test path.

## Triage
verdict: confirmed — independently re-verified: all four declarations reproduce at session-control-static-checks:61-63/75-76/93-106 and call-with-clause-static-checks:57-59/61/63/65-81 (small drift past the cited 78), the declaration grep returns exactly one hit per name per file, and a whitespace-normalised scratch diff of the two checkBody bodies plus EMPTY_GRAPH/noArityResolution/bodyOf is empty apart from the parameter-list wrapping; both copies are live (checkBody called 10× / 8×), the newer file (27c267ed 2026-09-16) postdates the older (96303cc3 2026-09-09), and no tests/helpers/ module exports any of the four names (grep exit 1); no carve-out applies — neither is a *gate* file, checkBody is an inert driver not a recording double, both files' RED signatures sit in production code not this harness, coverage-matrix grep → 0 hits and no docs/bugs file names either test; not a duplicate — sibling intake d7-02 covers a different block (:160-191) and its triage note explicitly defers this quartet here, PTQ-0278/0364/0371/0372 cover other surfaces; two peripheral inaccuracies do not touch the anchor: the stated docs/bugs grep actually hits 12 files (all on the generic name checkInvokeStaticResolution, none naming these tests), and the header's "mirroring" credit is attached to mixedCallableSet() rather than the checkBody quartet; note for the fixer that the same deps literal (FakeFileSystem /home/u+/theta, activeRoots, two-key graph, noArityResolution) also recurs inline in call-with-clause-erratum-b.test.ts:77,89-93 and call-with-clause-failure-arms.test.ts:231,272-275, and bodyOf's ReturnType<typeof letCall> binds to a per-file letCall so a shared export needs a widened statement type (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
