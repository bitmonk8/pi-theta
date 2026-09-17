---
id: PTQ-0574
title: schemaDeclsOf loads-cleanly-then-filter harness is a renamed-only clone across three lowering test files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/annotation-root-brace-union-lowering.test.ts:432-440
  - tests/inline-object-nested-lowering.test.ts:511-519
  - tests/params-brace-union-rhs-lowering.test.ts:434-442
sites: 3                     # count of occurrences cited in Evidence
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# schemaDeclsOf loads-cleanly-then-filter harness is a renamed-only clone across three lowering test files

## Observation
`tests/annotation-root-brace-union-lowering.test.ts` declares a module-level
`function schemaDeclsOf(body: string): readonly SchemaDecl[]` that wraps a
declaration body in the file's standard frontmatter, parses it through
`parseDoc`, throws loudly if the parse produced any diagnostic (naming the
rendered diagnostics), and otherwise filters `doc.body.statements` down to
`schema` declarations. Two sibling lowering-family files —
`tests/inline-object-nested-lowering.test.ts` and
`tests/params-brace-union-rhs-lowering.test.ts` — each declare a function of
the identical name, identical parameter and return type, and identical
three-statement body, differing only in the fixture path literal passed to
`parseDoc` (or, in the third file, in inlining the frontmatter template
instead of calling a local `bodySrc` helper that itself produces the same
bytes).

## Evidence

`tests/annotation-root-brace-union-lowering.test.ts:432-440`:
```ts
function schemaDeclsOf(body: string): readonly SchemaDecl[] {
  const doc = parseDoc(bodySrc(body), "bug0053.theta");
  if (doc.diagnostics.length > 0) {
    throw new Error(
      `harness: the decl body must load cleanly, but produced ${JSON.stringify(diagLines(doc))}`,
    );
  }
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}
```

`tests/inline-object-nested-lowering.test.ts:511-519` — `diff` against the
excerpt above shows exactly one differing token, the fixture-name string
literal:
```ts
function schemaDeclsOf(body: string): readonly SchemaDecl[] {
  const doc = parseDoc(bodySrc(body), "bug0039.theta");
  if (doc.diagnostics.length > 0) {
    throw new Error(
      `harness: the decl body must load cleanly, but produced ${JSON.stringify(diagLines(doc))}`,
    );
  }
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}
```

`tests/params-brace-union-rhs-lowering.test.ts:434-442` — the same three
statements, with the frontmatter template inlined instead of delegated to a
local `bodySrc(body)` call (that helper itself returns the identical
`` `---\nmode: prompt\n---\n${body}` `` bytes elsewhere in this file family, so
the parsed input is byte-equal for the same `body` argument):
```ts
function schemaDeclsOf(body: string): readonly SchemaDecl[] {
  const doc = parseDoc(`---\nmode: prompt\n---\n${body}`, "bug0097.theta");
  if (doc.diagnostics.length > 0) {
    throw new Error(
      `harness: the decl body must load cleanly, but produced ${JSON.stringify(diagLines(doc))}`,
    );
  }
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}
```

Exact search: `grep -rn "^function schemaDeclsOf" tests/*.test.ts` finds 19
files carrying a function of this name; of those, `tests/union-generic-arm-lowering.test.ts`
declares a structurally different version (different return shape — a
`{schemas, enums}` record — and no load-diagnostics-must-be-empty throw), so
it is not counted as a copy of this shape and is not cited as a location.
`grep -n "schemaDeclsOf" tests/helpers/*.ts` → 0 hits — no helper module
exports this name.

## Why this is a problem
The same "wrap a body in this fixture's frontmatter, parse it, fail loudly if
the fixture body itself does not load clean, then filter to `schema`
declarations" harness — three statements performing one job — is declared
three separate times across the lowering-family test files, with the only
difference being the fixture-name string literal each `parseDoc` call passes.
None of the three sites needs a file-local variant of the logic itself: the
control flow, the throw message, and the filter predicate are byte-identical.

## Suggested direction (non-binding, optional)
A `tests/helpers/` export parameterised by the frontmatter body and the
fixture-name literal (the two values that vary across the three sites) is the
natural home the byte-identical remainder of the three declarations points to.

## False-positive check
- Gate-pin check: none of the three files match `*gate*.test.ts` or the named
  kin; the cited lines are a parse-and-filter harness, not a pinned count or
  inventory.
- Recording-double check: `schemaDeclsOf` records no call and backs no
  "never called" assertion; it is a data-producing harness function, not a
  recording double.
- docs/bugs/ signature search: `grep -rl "annotation-root-brace-union-lowering\|inline-object-nested-lowering\|params-brace-union-rhs-lowering" docs/bugs/*.md`
  finds each file cited by its own numbered bug doc (0053, 0039/0095/0096/0099/0184,
  0097) for the union/inline-object lowering behaviour under test, never for
  the `schemaDeclsOf` harness's internal mechanics, so this is not a
  documented correct-reason artefact.
- coverage-matrix/bug-doc citation search: `grep -n
  "annotation-root-brace-union-lowering\|inline-object-nested-lowering\|params-brace-union-rhs-lowering"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any of the three files or any `it()`/
  `describe()` — only that the three near-identical `schemaDeclsOf`
  definitions could share a helper — so no citation is affected.
- Coverage check: the claim is about a repeated function DEFINITION, not a
  missing test path; `schemaDeclsOf` is exercised by every call site in each
  of the three files.
- Overlap check: grepped `quality/intake` and `quality/resolved` for
  `schemaDeclsOf` — the only hit,
  `qw20260917154546-d7-01-b0292-typed-query-substrate-mirrored.md` (this same
  wave, a parallel shard), covers a different, larger six-piece substrate
  (`NOOP_CHECKPOINT`/`liveSignal`/`config`/`RespondingModel`/`schemaDeclsOf`/
  `ajv`) shared between `tests/b0292-validation-errors-canonical-order.test.ts`
  and `tests/e2e-s3-typed-query-conformance.test.ts` — a structurally
  different `schemaDeclsOf` (it builds a `ParseThetaDocumentDeps` double
  directly rather than calling this file family's `parseDoc`/`bodySrc`
  helpers) and cites neither of the three files this finding names.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts match verbatim at the cited lines and a mechanical diff of the 9-line bodies shows exactly one differing line per pair (the `parseDoc` fixture-name literal; the third copy inlines the byte-identical `` `---\nmode: prompt\n---\n${body}` `` template that `bodySrc` returns at files 1/2), all three copies are live (4/2/2 refs), `grep -rn schemaDeclsOf tests/helpers/` → 0 hits; the `^function schemaDeclsOf` grep actually hits 20 files not 19, but the only other `(body: string): readonly SchemaDecl[]` copy (tests/unresolved-annotation-lowering.test.ts:281) lacks the load-diagnostics throw and calls a different `parse`, so the three-copy count stands; none of the files is a gate, coverage-matrix has 0 hits, docs/bugs 0039/0053/0097 cite the files as behaviour witnesses only and no merge/rename/delete is proposed; D7 boilerplate-duplication class, and no PTQ row or same-wave sibling covers this trio (PTQ-0212 is `loadCleanly`, d7-03 is the `(doc: ThetaDocument)` inbound variant, d7-137-02 is the adjacent `loweredAnnotation` helper) (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
