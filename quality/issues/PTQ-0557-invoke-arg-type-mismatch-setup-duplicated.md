---
id: PTQ-0557
title: Two RFC 0009 static-checks tests rebuild the identical invoke-node + checkInvokeStaticResolution deps block across two files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/call-with-clause-failure-arms.test.ts:204-233
  - tests/call-with-clause-static-checks.test.ts:160-191
sites: 2
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# Two RFC 0009 static-checks tests rebuild the identical invoke-node + checkInvokeStaticResolution deps block across two files

## Observation
tests/call-with-clause-failure-arms.test.ts's V4 "invoke(...) surface" test and tests/call-with-clause-static-checks.test.ts's row-6 test each build a hand-cast `InvokeExpr` wrapped in a single-statement `ThetaBody`, wrap that in a `ThetaCompositionInput`, and call `checkInvokeStaticResolution` against a `FakeFileSystem` constructed with the same `homedir`/`cwd` literals and the same `RESOLVED_CALLEE`/`RESOLVED_THETA_ROOT` files/dirs shape and the same `activeRoots: [RESOLVED_THETA_ROOT]`. The only differences are the clause value (`numberValue` vs `strExpr("a")`), the arity-resolving function's returned `mode`, and the `graph` literal spelling (an inline object vs the file's own `EMPTY_GRAPH` constant, which is structurally identical to the inline literal).

## Evidence
tests/call-with-clause-failure-arms.test.ts:204-233:
```ts
  it("invoke(...) surface: `with { cwd: 42 }` draws theta/parse/invoke-arg-type-mismatch (RED)", async () => {
    const invoke = {
      kind: "invoke",
      path: "./callee.theta",
      returnSchema: null,
      args: [],
      range: R(),
      withClause: withClause(numberValue),
    } as unknown as InvokeExpr;
    const body: ThetaBody = {
      statements: [{ kind: "invoke", invoke, range: R() } as unknown as ThetaBody["statements"][number]],
      tail: null,
    };
    const input: ThetaCompositionInput = {
      slashName: "caller",
      sourcePath: "/thetadir/caller.theta",
      frontmatter: {} as unknown as ParsedFrontmatter,
      body,
    };
    const diags = await checkInvokeStaticResolution(input, {
      fs: new FakeFileSystem({
        homedir: "/home/u",
        cwd: "/theta",
        files: { [RESOLVED_CALLEE]: "theta", [RESOLVED_THETA_ROOT]: "" },
        dirs: { [RESOLVED_THETA_ROOT]: [] },
      }),
      activeRoots: [RESOLVED_THETA_ROOT],
      graph: { edges: new Map([["caller", []]]), unresolvable: new Set<string>() },
      resolveCalleeArity: subagentArity,
    });
    expect(
      diags.map((d) => d.code),
      `expected theta/parse/invoke-arg-type-mismatch among ${JSON.stringify(diags.map((d) => d.code))}`,
```

tests/call-with-clause-static-checks.test.ts:160-191:
```ts
  it("draws theta/parse/with-clause-prompt-mode-callee (RED)", async () => {
    const invoke = {
      kind: "invoke",
      path: "./callee.theta",
      returnSchema: null,
      args: [],
      range: R(),
      withClause: withClause(strExpr("a")),
    } as unknown as InvokeExpr;
    const body: ThetaBody = {
      statements: [{ kind: "invoke", invoke, range: R() } as unknown as ThetaBody["statements"][number]],
      tail: null,
    };
    const promptArity = (): Promise<CalleeArity | undefined> =>
      Promise.resolve({ requiredCount: 0, totalCount: 0, fields: [], mode: "prompt" } as unknown as CalleeArity);
    const input: ThetaCompositionInput = {
      slashName: "caller",
      sourcePath: "/thetadir/caller.theta",
      frontmatter: {} as unknown as ParsedFrontmatter,
      body,
    };
    const diags = await checkInvokeStaticResolution(input, {
      fs: new FakeFileSystem({
        homedir: "/home/u",
        cwd: "/theta",
        files: { [RESOLVED_CALLEE]: "theta", [RESOLVED_THETA_ROOT]: "" },
        dirs: { [RESOLVED_THETA_ROOT]: [] },
      }),
      activeRoots: [RESOLVED_THETA_ROOT],
      graph: EMPTY_GRAPH,
      resolveCalleeArity: promptArity,
    });
```

Both files also separately re-derive the same two-line `RESOLVED_CALLEE`/`RESOLVED_THETA_ROOT` constants (tests/call-with-clause-failure-arms.test.ts:192-193; tests/call-with-clause-static-checks.test.ts:43-44), each computed as `resolvePath("/thetadir", ...).replace(/\\/g, "/")`.

## Why this is a problem
This is the "Boilerplate duplication" class: the same 25-30-line block — construct a hand-cast `InvokeExpr` under a fixed `./callee.theta` path, wrap it in a one-statement body and a `ThetaCompositionInput`, and drive `checkInvokeStaticResolution` against a `FakeFileSystem` seeded with the identical resolved-callee/resolved-root file/dir shape — is written out twice rather than shared, even though both files already import shared fixtures (`R`, `strExpr`, `withClause`, `FakeFileSystem`) from `tests/helpers/`. The two call sites differ only in the clause value, the arity function's `mode`, and an inert `graph` literal versus an equivalent named constant — none of which requires re-deriving the surrounding block from scratch in the second file.

## Suggested direction (non-binding, optional)
A small helper (e.g. one function building the `invoke`/`body`/`input` triple from a clause and a `sourcePath`, and one building the standard `FakeFileSystem`+`activeRoots` deps pair from `RESOLVED_CALLEE`/`RESOLVED_THETA_ROOT`) would live naturally beside `withClause`/`strExpr`/`R` in `tests/helpers/call-with-clause-harness.ts`, which both files already import from — this names the existing shared-helper home the duplicated block already points at, not a design for the extraction.

## False-positive check
- Gate-pin: neither file matches `*gate*.test.ts` or the named kin; not applicable.
- Recording-double: no recording double or negative witness is involved in either cited block; not applicable.
- docs/bugs/ signature search: both blocks are RFC 0009 RED-at-HEAD cells whose own file headers state the exact red signature (`checkInvokeStaticResolution reads no withClause field anywhere`); neither file's status is disputed here and this finding does not touch the red/green disposition of either test, only the shared setup code around it.
- coverage-matrix/bug-doc citation search: `grep -n "call-with-clause-failure-arms\|call-with-clause-static-checks" docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no merge, rename or deletion of either test, only that the shared block could be imported rather than re-derived, so no citation is affected.
- Duplicate-finding check: `grep -rl "RESOLVED_CALLEE\|checkInvokeStaticResolution" quality/intake quality/resolved` surfaces PTQ-0364 (a D4 finding about production-code duplication of the mode gate inside `src/extension/invoke-static-checks.ts`) and several D2/D9 findings about that same production file's header/phase claims — none names this pair of TEST-file setup blocks; not a re-file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts match verbatim at failure-arms:204-233 and static-checks:160-191, the RESOLVED_CALLEE/RESOLVED_THETA_ROOT pair is re-derived at :192-193 / :43-44, and `grep -rn 'RESOLVED_CALLEE\]: "theta"' tests/` hits exactly these two sites; the anchor is stronger than filed — tests/helpers/call-with-clause-harness.ts:127-142 already exports `invokeStmtWithClause`/`bodyWithInvoke` producing exactly the hand-cast invoke + one-statement body both cells rebuild, and failure-arms already imports `bodyWithInvoke` (V9/V10), so the invoke/body half reimplements an imported helper and the FakeFileSystem+activeRoots deps half is a same-commit (96303cc3) sibling clone; coverage-matrix grep → 0 hits, no gate/recording-double/red-signature carve-out applies, and no resolved or intake finding names this pair (PTQ-0273/0278 cover other failure-arms blocks, PTQ-0364 is the src-side gate, sibling d7-140-04 covers the checkBody/EMPTY_GRAPH quartet at :52-78) (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
