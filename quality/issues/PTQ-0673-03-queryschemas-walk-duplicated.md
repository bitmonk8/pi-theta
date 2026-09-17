---
id: PTQ-0673
title: querySchemas' generic query.schema tree-walk is redeclared byte-identical in qry4-refused-annotation-withhold.test.ts and let-annotation-query-double-emission.test.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/qry4-refused-annotation-withhold.test.ts:262-282
  - tests/let-annotation-query-double-emission.test.ts:173-189
  - tests/fn-return-void-query-sink.test.ts:225-253
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# querySchemas' generic query.schema tree-walk is redeclared byte-identical in qry4-refused-annotation-withhold.test.ts and let-annotation-query-double-emission.test.ts

## Observation
`tests/qry4-refused-annotation-withhold.test.ts` declares a module-private
`querySchemas(src)` that parses `src`, walks the returned `body` with a
generic seen-set tree walk, and collects every `record.schema` where
`record.kind === "query"`, in traversal order.
`tests/let-annotation-query-double-emission.test.ts` declares a function of
the same name with a byte-identical body — the walk predicate, the seen-set
guard, the `Object.values(record)` recursion, and the collection line are
character-for-character the same — differing only in the fixture label
string passed to `parseDoc` (`"bug0222.theta"` vs `"bug0093.theta"`).
`tests/fn-return-void-query-sink.test.ts` carries a third, generalised
cousin, `queryFacts(src)`, whose walk body is the same shape widened to
collect two extra fields per query (`schemaFromLetAnnotation`,
`ascriptionWritten`) alongside `schema`, with its own file's `querySchemas`
defined as a one-line projection of `queryFacts`.

## Evidence
`tests/qry4-refused-annotation-withhold.test.ts:262-282`:
```ts
/**
 * Every `QueryExpr.schema` in the parsed body, in traversal order — read after
 * `resolveQuerySchemas` has run, the way §Reproduction (C) and (D) read it.
 */
function querySchemas(src: string): unknown[] {
  const found: unknown[] = [];
  const seen = new Set<object>();
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    if (seen.has(node as object)) return;
    seen.add(node as object);
    const record = node as Record<string, unknown>;
    if (record.kind === "query") found.push(record.schema);
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) value.forEach(walk);
      else walk(value);
    }
  };
  walk(parseDoc(src, "bug0222.theta").body as unknown);
  return found;
}
```

`tests/let-annotation-query-double-emission.test.ts:173-189` (identical walk body):
```ts
function querySchemas(src: string): unknown[] {
  const found: unknown[] = [];
  const seen = new Set<object>();
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    if (seen.has(node as object)) return;
    seen.add(node as object);
    const record = node as Record<string, unknown>;
    if (record.kind === "query") found.push(record.schema);
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) value.forEach(walk);
      else walk(value);
    }
  };
  walk(parseDoc(src, "bug0093.theta").body as unknown);
  return found;
}
```

`tests/fn-return-void-query-sink.test.ts:225-253` (the generalised cousin,
same walk shape widened to a three-field record, plus a `querySchemas`
one-liner over it):
```ts
function queryFacts(src: string): QueryFacts[] {
  const found: QueryFacts[] = [];
  const seen = new Set<object>();
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    if (seen.has(node as object)) return;
    seen.add(node as object);
    const record = node as Record<string, unknown>;
    if (record.kind === "query") {
      found.push({
        schema: record.schema ?? null,
        marker: record.schemaFromLetAnnotation ?? null,
        asc: record.ascriptionWritten ?? null,
      });
    }
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) value.forEach(walk);
      else walk(value);
    }
  };
  walk(parseDoc(src, "bug0220.theta").body as unknown);
  return found;
}

/** Only the resolved response schemas, in traversal order. */
function querySchemas(src: string): unknown[] {
  return queryFacts(src).map((q) => q.schema);
}
```

Search: `grep -n "record.kind === \"query\"" tests/*.test.ts` finds this
walk predicate in exactly these three files; `grep -rn "^function querySchemas("
tests/*.test.ts` finds the two byte-identical declarations quoted first, and
`grep -n "^function queryFacts(" tests/*.test.ts` finds the one generalised
cousin. `tests/helpers/e2e-s1.ts` — the module all three files already import
`parseDoc` from — exports no tree-walk of this shape
(`grep -n "^export function" tests/helpers/e2e-s1.ts` lists `parseDoc`,
`isLoadParseError`, `diagLines`, `diagCodes`, `findLetStmt`, `findFnDecl`,
`loadCleanly`, none of which walk the body for `kind === "query"` nodes).

## Why this is a problem
The seen-set guarded generic tree walk that locates every `query`-kind AST
node in a parsed body — the part doing the actual work, independent of which
field(s) get collected once a node is found — is declared three separate
times with the identical five-line walk shape, twice byte-for-byte
identical apart from a debug fixture label. None of the three files imports
another's declaration or a shared `tests/helpers/` export; the shared
`parseDoc` module both `querySchemas` copies already import stops short of
this walk. A change to the walk itself (e.g. to also traverse a field the
generic `Object.values` recursion currently misses, or to guard a different
cycle shape) has, at minimum, the two identical copies to keep in sync by
hand.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts` already hosts the `ThetaDocument`-shaped readers
(`parseDoc`, `findLetStmt`, `findFnDecl`) both `querySchemas` files import; a
generic "collect every `query`-kind node's own fields, by predicate" walker
would sit naturally beside them, with `fn-return-void-query-sink.test.ts`'s
wider `queryFacts` shape as the parameterisation the two narrower
`querySchemas` copies would specialise.

## False-positive check
- Gate-pin carve-out: none of the three files matches `*gate*.test.ts` or the
  named gate kin; not applicable.
- Recording-double carve-out: the walk reads an already-parsed, static
  `ThetaDocument`; it records no call and backs no "never called" witness;
  not applicable.
- docs/bugs/ signature search: `grep -n "querySchemas\|queryFacts" docs/bugs/0222-qry4-let-mismatch-reads-refused-annotation.md docs/bugs/0093*.md docs/bugs/0220*.md` — the 0222 bug doc names this reviewed file and its group (D) cells by id but not this helper by name, and gives no rationale for reimplementing the walk rather than importing one; the sibling bug docs likewise name no shared-helper decision.
- coverage-matrix/bug-doc citation search: `grep -n "qry4-refused-annotation-withhold\|let-annotation-query-double-emission\|fn-return-void-query-sink" docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no change to any `it()`/`describe()` name, count, range or assertion in any of the three files, only to where the walk is defined.
- Coverage check: the claim is about a repeated helper DEFINITION, not a
  missing test path; every copy is exercised by the group (C)/(D) cells (and
  their counterparts in the sibling files) that call it.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts match at the cited lines; `diff` of qry4-refused-annotation-withhold.test.ts:266-282 vs let-annotation-query-double-emission.test.ts:173-189 differs on exactly one line (the `"bug0222.theta"`/`"bug0093.theta"` parseDoc label), and fn-return-void-query-sink.test.ts:225-247's queryFacts carries the same seen-set/Object.values walk widened to three fields; `record.kind === "query"` and `seen.add(node as object)` grep to exactly these three files with nothing in tests/helpers/ (e2e-s1.ts has 17 exports, not the 7 the candidate listed, but none walks the body), all copies are live (5/6/15 querySchemas call sites), no gate/recording-double/coverage-matrix carve-out applies (0 matrix hits; docs/bugs/0220:228's `querySchemas` is a scratch repro script, not a keep-private ruling), and no store row tracks this walk (PTQ-0257/PTQ-0394 cover letStmtOf/fnDecl in the same files; sibling wave candidates cover the registry oracle, systemNoteContents and FM fixture) — D7 boilerplate-duplication, mechanical dedupe (triage: claude-fable-5-1)
