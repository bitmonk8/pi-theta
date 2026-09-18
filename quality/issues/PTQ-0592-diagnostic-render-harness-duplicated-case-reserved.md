---
id: PTQ-0592
title: The theta()/codesOf()/render()/range()/messageFor()/soleRange() diagnostic-rendering harness is redeclared byte-identical between fn-param-name-case.test.ts and fn-param-name-reserved-keyword.test.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/fn-param-name-case.test.ts:169-236
  - tests/fn-param-name-reserved-keyword.test.ts:272-344
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# The theta()/codesOf()/render()/range()/messageFor()/soleRange() diagnostic-rendering harness is redeclared byte-identical between fn-param-name-case.test.ts and fn-param-name-reserved-keyword.test.ts

## Observation
tests/fn-param-name-case.test.ts and tests/fn-param-name-reserved-keyword.test.ts
each declare the same six-function harness block, in the same order, with
byte-identical bodies: the `FM` frontmatter constant, `theta(body)` (parses
`FM + body`), `codesOf(doc)` (diagnostic codes in report order),
`render(doc)` (the JSON failure-payload renderer), `range(...)` (a
`SourceRange` literal builder), `messageFor(doc, code)`, and
`soleRange(doc, code)` (the uniqueness-and-locatedness-asserting range
reader). Only the two files' `RegistryRow` interface and `msg` signature
differ (covered by a separate finding); this six-function block is otherwise
identical code, not two independent authors converging on the same shape by
coincidence — it is one harness pasted into a second file.

## Evidence
tests/fn-param-name-case.test.ts:169-179 (representative opening of the
block: `FM`, `theta`, `codesOf`):
```ts
/** Frontmatter for every `.theta` row — occupies lines 1–3, body starts at 4. */
const FM = "---\nmode: prompt\n---\n";

/** Parse `body` as a `.theta` under the standard frontmatter. */
function theta(body: string): ThetaDocument {
  return parseDoc(FM + body);
}

/** The aggregated diagnostic codes, in report order. */
function codesOf(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => d.code);
}
```

tests/fn-param-name-reserved-keyword.test.ts:272-282 (byte-identical):
```ts
/** Frontmatter for every `.theta` row — occupies lines 1–3, body starts at 4. */
const FM = "---\nmode: prompt\n---\n";

/** Parse `body` as a `.theta` under the standard frontmatter. */
function theta(body: string): ThetaDocument {
  return parseDoc(FM + body);
}

/** The aggregated diagnostic codes, in report order. */
function codesOf(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => d.code);
}
```

tests/fn-param-name-case.test.ts:219-233 (the block's last member,
`soleRange`, closing brace at line 236):
```ts
function soleRange(doc: ThetaDocument, code: string): SourceRange {
  const hits = doc.diagnostics.filter((d: Diagnostic) => d.code === code);
  expect(
    hits.length,
    `exactly one ${code} is expected before its range is read; diagnostics=${render(doc)}`,
  ).toBe(1);
  const only = hits[0];
  if (only === undefined) {
    throw new Error(`no ${code} diagnostic to range; diagnostics=${render(doc)}`);
  }
  const r = only.range;
  if (r === undefined) {
    throw new Error(
      `the ${code} diagnostic must be located on the offending token; diagnostics=${render(doc)}`,
    );
  }
  return r;
```

Exact search: for each of the six functions, `diff <(sed -n
'/^function NAME(/,/^}/p' tests/fn-param-name-case.test.ts) <(sed -n
'/^function NAME(/,/^}/p' tests/fn-param-name-reserved-keyword.test.ts)` was
run for `codesOf`, `render`, `range`, `messageFor`, `theta`, and `soleRange`
— every one produced no output (byte-identical), and the `FM` constant
literal is identical by inspection at the cited lines. `grep -rln "^function
soleRange" tests --include="*.test.ts"` → exactly these 2 files, no third
site.

## Why this is a problem
This is the same "boilerplate duplication" shape resolved wave-over-wave for
sibling harness helpers in this file family: PTQ-0205 (`diagLines`/
`diagCodes`, now exported from tests/helpers/e2e-s1.ts), PTQ-0257 and
PTQ-0394 (`letStmtOf`/`fnDecl` lookups, folded onto `findLetStmt`/`findFnDecl`
in the same module), and PTQ-0268 (`expectBlocksRegistration`). In each of
those, the fix was to promote the identical, non-domain-specific rendering or
lookup logic into the shared tests/helpers/ module both files already draw
`parseDoc` from, leaving each file's own bug-specific assertions untouched.
Here, six functions — the entire diagnostic-rendering harness apart from the
registry read — are reproduced verbatim between exactly two files rather
than authored once.

## Suggested direction (non-binding, optional)
tests/helpers/e2e-s1.ts already hosts the `Diagnostic[]`-shaped precedents
(`hasCode`, `findCode`, `codes`, `errors`, `diagLines`, `diagCodes`) both
files already import `parseDoc` beside; a `codesOf`/`render`/`range`/
`messageFor`/`soleRange`-shaped set fits the same established home.

## False-positive check
- Gate-pin: neither file matches `*gate*.test.ts` or the named kin.
- Recording-double: every function in the block reads an already-completed
  parse's diagnostics; none records a call or backs a "never called"
  witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "soleRange\|messageFor(doc"
  docs/bugs/*.md` → 0 files; no open bug names this duplication.
- coverage-matrix/bug-doc citation search: `grep -n
  "fn-param-name-case.test.ts\|fn-param-name-reserved-keyword.test.ts"
  docs/reference/coverage-matrix.md` → 0 hits. docs/bugs/0139 and
  docs/bugs/0148 cite these two files by filename for their pinned `it()`
  counts and cell ids (e.g. row identifiers a1-a21, e4-e14); this finding
  proposes no change to any `it()`/`describe()` name, count, or assertion —
  only to where the six-function harness is defined — so no pinned witness
  is affected.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; every function is exercised by its own file's tests
  today.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: sed-extracted `theta`/`codesOf`/`render`/`range`/`messageFor`/`soleRange` bodies (3/3/12/11/3/18 lines) diff byte-identical between tests/fn-param-name-case.test.ts:169-236 and tests/fn-param-name-reserved-keyword.test.ts:272-344 with identical `FM` literals at :169/:272, `^function soleRange` greps to exactly these 2 files, and neither file nor helper is named by any existing PTQ (the same-wave sibling d7-02-registry-load-and-msg covers the separate REGISTRY/msg block at :115-151/:214-255); D7 boilerplate-duplication class, no carve-out applies (not gate tests, no recording double, no test rename/merge, 0 coverage-matrix hits) — two nits noted for the record, neither refuting: the reserved file's cited range interposes a file-unique `severityFor` (:317-319) before `soleRange`, and the docs/bugs signature grep hits 1 file not 0 (docs/bugs/0153:596 row e14 lists the helper NAMES its assertion goes through, not this duplication; importing the same names leaves it intact) (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
