---
id: PTQ-0257
title: letStmtOf (find the sole `let` statement by name, throw naming what is missing) is redefined near-verbatim in a sibling bug-witness file
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/annotation-nontype-text-refusal.test.ts:373-386
  - tests/qry4-refused-annotation-withhold.test.ts:250-262
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# letStmtOf (find the sole `let` statement by name, throw naming what is missing) is redefined near-verbatim in a sibling bug-witness file

## Observation
tests/annotation-nontype-text-refusal.test.ts declares a module-private helper
`letStmtOf(label, doc, name)`: it finds the sole top-level `let` statement bound
to `name` in a parsed `ThetaDocument`, and throws a harness error naming the
missing binding when none is found. tests/qry4-refused-annotation-withhold.test.ts
— a sibling witness file for bug 0222, added one day after this file and
reading the same `ThetaDocument`/`LetStmt` shape — declares a function of the
same name, the same three-parameter signature, and the same body.

## Evidence
tests/annotation-nontype-text-refusal.test.ts:373-386
```ts
/** The sole `let` statement bound to `name`, loud when the body declares none. */
function letStmtOf(label: string, doc: ThetaDocument, name: string): LetStmt {
  const hit = doc.body.statements.find(
    (s): s is LetStmt => s.kind === "let" && (s as LetStmt).name === name,
  );
  if (hit === undefined) {
    throw new Error(
      `${label}: the body declares no \`let ${name}\`, so no annotation reached the position ` +
        `under test; statement kinds ${JSON.stringify(stmtKinds(doc))}, diagnostics ` +
        `${JSON.stringify(diagLines(doc))}`,
    );
  }
  return hit;
}
```

tests/qry4-refused-annotation-withhold.test.ts:250-262
```ts
/** The sole top-level `let` named `name`, loud when the body declares none. */
function letStmtOf(label: string, doc: ThetaDocument, name: string): LetStmt {
  const hit = doc.body.statements.find(
    (s): s is LetStmt => s.kind === "let" && (s as LetStmt).name === name,
  );
  if (hit === undefined) {
    throw new Error(
      `${label}: the body declares no top-level \`let ${name}\`, so no annotation reached the ` +
        `position under test; diagnostics ${JSON.stringify(diagLines(label, doc))}`,
    );
  }
  return hit;
}
```

Pattern-wide search: `grep -rn 's\.kind === "let" && (s as LetStmt)\.name === name' tests --include="*.test.ts"`
→ exactly 2 hits, the two lines quoted above (one per file); `grep -rl "function letStmtOf" tests --include="*.test.ts"` → the same 2 files, no others.

## Why this is a problem
The `.find` predicate line is byte-for-byte identical in both files. Both doc
comments open with the same "The sole ... `let` ... loud when the body
declares none" phrasing, and both thrown messages share the verbatim clause
"so no annotation reached the position under test" — the only differences are
the word "top-level", the label wrap point, and the diagnostics argument shape
(this file's `diagLines(doc)` versus the sibling's `diagLines(label, doc)`,
which reflects that file's own range-carrying renderer, not a different
lookup). Both files already import `ThetaDocument`/`LetStmt`-typed helpers from
tests/helpers/e2e-s1.ts (`parseDoc`, and this file's `diagLines`/`diagCodes`
too), so both are already positioned to draw a lookup-or-throw helper of this
exact shape from the same module; no such export exists there today, so the
identical logic is authored twice.

## Suggested direction (non-binding, optional)
tests/helpers/e2e-s1.ts already hosts the `ThetaDocument`/`Diagnostic`-shaped
helpers (`parseDoc`, `diagLines`, `diagCodes`, `loadCleanly`) both files
import; a `letStmtOf`-shaped export would sit naturally beside them.

## False-positive check
- Gate-pin: neither tests/annotation-nontype-text-refusal.test.ts nor
  tests/qry4-refused-annotation-withhold.test.ts matches `*gate*.test.ts` or
  the named kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double: `letStmtOf` reads an already-parsed, static `ThetaDocument`;
  it records no calls and backs no "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "letStmtOf" docs/bugs` → 0 files.
  docs/bugs/0222-qry4-let-mismatch-reads-refused-annotation.md does direct its
  own fix to add "tests/qry4-refused-annotation-withhold.test.ts ... beside its
  two siblings" (§Fix (c)) and repeatedly cites this reviewed file's group (o)
  as the pin its own witness settles — establishing the two FILES as
  deliberate siblings — but it never names `letStmtOf`, and gives no rationale
  for reimplementing this specific lookup rather than importing one.
- coverage-matrix/bug-doc citation search: `grep -n "letStmtOf"
  docs/reference/coverage-matrix.md` → 0 hits. Both files are cited by bug
  docs (0124, 0222) by file name and cell/group id, never by this helper's
  name; this finding proposes no change to any `it()`/`describe()` name,
  count, range or assertion in either file, only to where the lookup helper
  is defined.
- Coverage check: the claim is about a repeated helper DEFINITION, not a
  missing test path; both copies are exercised by the tests that call them (3
  call sites in the reviewed file, confirmed via `grep -c "letStmtOf("
  tests/annotation-nontype-text-refusal.test.ts` → 3).

## Triage
verdict: confirmed — excerpts, line ranges, and both exact searches (predicate and `function letStmtOf`, 2 hits each, same 2 files) reproduce verbatim; git blame/log shows the first copy predates the second by one day (9eb1290d, 2026-08-20) with the sibling authored in the very same bug-0222 commit (af108d2f) that also touched the first file, so this is authored duplication, not convergent evolution; unlike the widely-cited-convention rejections, the pattern occurs in exactly these 2 files (no `mirrors`/`verbatim` comment, no dozens-of-files convention) and no gate-pin, recording-double, docs/bugs, or coverage-matrix carve-out applies; no existing PTQ or rejection covers this pair (triage: claude-opus-5)
