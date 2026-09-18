---
id: PTQ-0863
title: interpolation-parse-diagnostics.test.ts redeclares the show/queryNodes/soleQueryRange query-walk harness already declared in tests/b0345-interpolation-operand-checks-at-parse.test.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/interpolation-parse-diagnostics.test.ts:283-335
  - tests/b0345-interpolation-operand-checks-at-parse.test.ts:157-209
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# interpolation-parse-diagnostics.test.ts redeclares the show/queryNodes/soleQueryRange query-walk harness already declared in tests/b0345-interpolation-operand-checks-at-parse.test.ts

## Observation
`tests/interpolation-parse-diagnostics.test.ts` (bug 0122) and
`tests/b0345-interpolation-operand-checks-at-parse.test.ts` (bug 0345, the
successor report the first file's own header names as extending the same
route) each declare, at module scope, three functions with the same names,
the same doc comments, and the same bodies: `show(doc)` (a compact
diagnostics-list renderer), `queryNodes(node, out)` (a recursive AST walk
collecting every `kind: "query"` node), and `soleQueryRange(doc)` (asserting
exactly one query node exists and returning its range, throwing loudly
otherwise). No `tests/helpers/` module exports this trio.

## Evidence
tests/interpolation-parse-diagnostics.test.ts:283-317 (re-read immediately before filing):
```ts
/** A compact rendering of a document's diagnostics for failure messages. */
function show(doc: ThetaDocument): string {
  return doc.diagnostics.length === 0
    ? "[] (no diagnostic of ANY severity)"
    : doc.diagnostics
        .map(
          (d) =>
            `${d.severity} ${d.code}: ${d.message} @ ${
              d.range === undefined
                ? "<unlocated>"
                : `${d.range.start.line}:${d.range.start.column}`
            }`,
        )
        .join("; ");
}

/** Every `kind: "query"` node in a parsed document, in traversal order. */
function queryNodes(node: unknown, out: { template: string; range: SourceRange }[]): void {
  if (node === null || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const v of node) {
      queryNodes(v, out);
    }
    return;
  }
  const rec = node as Record<string, unknown>;
  if (rec["kind"] === "query" && typeof rec["template"] === "string") {
    out.push({ template: rec["template"], range: rec["range"] as SourceRange });
  }
  for (const v of Object.values(rec)) {
    queryNodes(v, out);
  }
}
```
tests/interpolation-parse-diagnostics.test.ts:326-335:
```ts
function soleQueryRange(doc: ThetaDocument): SourceRange {
  const found: { template: string; range: SourceRange }[] = [];
  queryNodes(doc.body, found);
  if (found.length !== 1) {
    throw new Error(
      `harness: this fixture must carry exactly ONE @\`-query expression whose range locates the relocated diagnostics; found ${found.length} (${found.map((f) => JSON.stringify(f.template)).join(", ")})`,
    );
  }
  return (found[0] as { range: SourceRange }).range;
}
```

tests/b0345-interpolation-operand-checks-at-parse.test.ts:157-191 (re-read immediately before filing — the same `show`/`queryNodes` bodies, `queryNodes`'s collected-record shape narrowed to drop the unused `template` field the sibling file keeps only for its error message):
```ts
/** A compact rendering of a document's diagnostics for failure messages. */
function show(doc: ThetaDocument): string {
  return doc.diagnostics.length === 0
    ? "[] (no diagnostic of ANY severity)"
    : doc.diagnostics
        .map(
          (d) =>
            `${d.severity} ${d.code}: ${d.message} @ ${
              d.range === undefined
                ? "<unlocated>"
                : `${d.range.start.line}:${d.range.start.column}`
            }`,
        )
        .join("; ");
}

/** Every `kind: "query"` node in a parsed document, in traversal order. */
function queryNodes(node: unknown, out: { range: SourceRange }[]): void {
  if (node === null || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const v of node) {
      queryNodes(v, out);
    }
    return;
  }
  const rec = node as Record<string, unknown>;
  if (rec["kind"] === "query" && typeof rec["template"] === "string") {
    out.push({ range: rec["range"] as SourceRange });
  }
  for (const v of Object.values(rec)) {
    queryNodes(v, out);
  }
}
```
tests/b0345-interpolation-operand-checks-at-parse.test.ts:200-209:
```ts
function soleQueryRange(doc: ThetaDocument): SourceRange {
  const found: { range: SourceRange }[] = [];
  queryNodes(doc.body, found);
  if (found.length !== 1) {
    throw new Error(
      `harness: this fixture must carry exactly ONE @\`-query expression whose range ` +
        `locates the relocated diagnostics; found ${found.length}`,
    );
  }
  return (found[0] as { range: SourceRange }).range;
}
```

Exact search: `grep -rln "function soleQueryRange" tests/*.test.ts` → exactly
2 hits, the two files cited above; `grep -rln "class LiveSessionDouble\|class"` is
not relevant here — this is scoped to the `show`/`queryNodes`/`soleQueryRange`
trio only. `show`'s body (14 lines) is byte-identical between the two files;
`queryNodes`'s body differs only in whether the collected record carries a
`template` field alongside `range` (the sibling file's `soleQueryRange` error
message does not need the template text, so it narrows the shape); the
control-flow of both `queryNodes` and both `soleQueryRange` implementations is
identical line-for-line.

## Why this is a problem
Both files parse the same production `ThetaDocument.body` shape looking for
the same `kind: "query"` node family to locate the enclosing `@`-query
expression a relocated diagnostic must be pinned to — the two files are
explicitly linked (bug 0122's own header names bug 0345 as the report that
"lands route 3 for the operand checks specifically", and bug 0345's own file
list cites `tests/interpolation-parse-diagnostics.test.ts` as bug 0122's
witness alongside its own new file). Neither file imports from the other or
from a shared module; each re-derives the same recursive AST walk and the
same "exactly one query, or throw loudly" guard from scratch. A future change
to `ThetaDocument.body`'s node shape (e.g. renaming the `kind` discriminant,
or nesting query nodes differently) must be re-derived correctly in both
places by hand to keep both files' fixtures locatable.

## Suggested direction (non-binding, optional)
A small shared `tests/helpers/` module exporting the recursive query-node
walk and the "exactly one query" range guard — parameterised on whether the
caller also wants the matched template text — is the natural home the two
near-identical copies already point at; naming that shape is observation,
not a design for the change.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; the cited lines are an AST-walk helper trio, not a pinned count or
  corpus inventory assertion (this file's own group-(g) census gate is a
  separate, untouched mechanism).
- Recording-double check: `queryNodes`/`soleQueryRange`/`show` are inert
  AST-walk and rendering helpers, not recording doubles backing a
  "never called" witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "soleQueryRange\|queryNodes"
  docs/bugs/*.md` returns no hit — neither function is named in a documented
  correct-reason-red signature.
- coverage-matrix/bug-doc citation search: `grep -rn
  "interpolation-parse-diagnostics\|b0345-interpolation-operand-checks-at-parse"
  docs/reference/coverage-matrix.md docs/bugs/*.md` shows both files cited by
  name as whole witness files for bugs 0118/0122/0345/0368/0395/0405; none of
  those citations targets the harness lines cited above, and this finding
  proposes no merge, rename, or deletion of either file or any `it()` cell —
  only that the shared helper trio is duplicated.
- Coverage check: this finding is about a duplicated helper-function
  DEFINITION, not a missing test path; every cell in both files continues to
  pass under its own local copy today.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all four excerpts reproduce at tests/interpolation-parse-diagnostics.test.ts:283-317/326-335 and tests/b0345-interpolation-operand-checks-at-parse.test.ts:157-191/200-209; `show` sed-extracted (:284-297 vs :158-171) and diffed → zero diff, `queryNodes`/`soleQueryRange` differ only in the collected record carrying `template` and the error-message tail, control flow line-for-line identical; both copies live (`soleQueryRange(` called at :353/775/811/853 and :239/328, `show(` in both files' primary assertions); `grep -rln soleQueryRange tests/` → exactly the 2 cited files, `rec["kind"] === "query"` walk → only those 2 sites, none of the 48 tests/helpers modules exports a query-node walk; both under tests/, D7 boilerplate-duplication class; not a gate file, no recording double, docs/bugs `soleQueryRange|queryNodes` → 0, coverage-matrix → 0 hits for either file, bugs 0122/0345/0368/0395/0405 cite whole files and no cell merge/rename/delete is proposed; no open/resolved PTQ names `queryNodes`/`soleQueryRange` (PTQ-0754 and same-wave d7-01 cover disjoint `ANTHROPIC_MODEL`/registry-read sites in the same file; PTQ-0673 is the unrelated `query.schema` walk) — stray `d4_class: clone` field in a D7 filing is immaterial; fix is a mechanical extraction of the trio to a shared helper (triage: claude-fable-5-1)
