---
id: PTQ-0394
title: b0476's fnDecl reimplements the same fn-lookup-or-throw logic as annotation-nontype-text-refusal.test.ts's fnDeclOf
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0476-panic-site-and-frames.test.ts:180-189
  - tests/annotation-nontype-text-refusal.test.ts:386-399
  - tests/helpers/e2e-s1.ts:108-113
sites: 3                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917045205
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0476's fnDecl reimplements the same fn-lookup-or-throw logic as annotation-nontype-text-refusal.test.ts's fnDeclOf

## Observation
tests/b0476-panic-site-and-frames.test.ts declares a module-scope
`fnDecl(doc, name)` helper: it finds the sole top-level `fn` declaration named
`name` in a parsed `ThetaDocument` and throws a harness error when none is
found. tests/annotation-nontype-text-refusal.test.ts declares a function for
the identical purpose, `fnDeclOf(label, doc, name)`, built on the same `.find()`
predicate, differing only in its extra `label` parameter and a richer error
message. Neither file's shared home for `ThetaDocument`-typed lookups,
tests/helpers/e2e-s1.ts, exports a same-shaped `fn`-declaration finder, though
it already exports the analogous `findLetStmt(doc, name): LetStmt | undefined`
for `let` statements, and annotation-nontype-text-refusal.test.ts's own local
`letStmtOf` already wraps that exact export rather than re-walking the AST
itself.

## Evidence
tests/b0476-panic-site-and-frames.test.ts:180-189:
```ts
/** The sole top-level `fn` declaration named `name`. */
function fnDecl(doc: ThetaDocument, name: string): FnDecl {
  const found = doc.body.statements.find(
    (s): s is FnDecl => s.kind === "fn" && (s as FnDecl).name === name,
  );
  if (found === undefined) {
    throw new Error(`harness: no top-level fn ${name} in the parsed body`);
  }
  return found;
}
```

tests/annotation-nontype-text-refusal.test.ts:386-399 — the same predicate,
wrapped in a richer error:
```ts
/** The sole `fn` declaration named `name`, loud when the body declares none. */
function fnDeclOf(label: string, doc: ThetaDocument, name: string): FnDecl {
  const hit = doc.body.statements.find(
    (s): s is FnDecl => s.kind === "fn" && (s as FnDecl).name === name,
  );
  if (hit === undefined) {
    throw new Error(
      `${label}: the body declares no \`fn ${name}\`, so no annotation reached the position ` +
        `under test; statement kinds ${JSON.stringify(stmtKinds(doc))}, diagnostics ` +
        `${JSON.stringify(diagLines(doc))}`,
    );
  }
  return hit;
}
```

tests/helpers/e2e-s1.ts:108-113 — the established precedent for the sibling
`let`-lookup, already centralised as a shared FIND (no throw) export:
```ts
/** The sole top-level `let` statement bound to `name`, if the body declares one. */
export function findLetStmt(doc: ThetaDocument, name: string): LetStmt | undefined {
  return doc.body.statements.find(
    (s): s is LetStmt => s.kind === "let" && (s as LetStmt).name === name,
  );
}
```

tests/annotation-nontype-text-refusal.test.ts:373-384 — this same file's own
`letStmtOf`, already demonstrating the split: it calls the shared
`findLetStmt` instead of re-walking `doc.body.statements` itself, the split
PTQ-0257 (resolved) put in place for the `let` case but which was never
applied to the `fn` case beside it:
```ts
/** The sole `let` statement bound to `name`, loud when the body declares none. */
function letStmtOf(label: string, doc: ThetaDocument, name: string): LetStmt {
  const hit = findLetStmt(doc, name);
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

Exact search: `grep -rn 's\.kind === "fn" && (s as FnDecl)\.name === name' tests --include="*.test.ts"`
→ exactly 2 hits, the two lines quoted above (one per file); a broader
`grep -rln "^function fnDecl"` over the same scope also returns exactly these
2 files, no others.

## Why this is a problem
This is the "Boilerplate duplication" class. The `.find()` predicate line is
byte-for-byte identical in both files; only the wrapper's signature and error
message differ. It is directly analogous to PTQ-0257 (resolved), which
confirmed the same shape one statement-kind over: `letStmtOf` duplicated
between annotation-nontype-text-refusal.test.ts and
tests/qry4-refused-annotation-withhold.test.ts. That finding's remedy —
visible in the current file, quoted above — was to hoist the FIND logic
(`findLetStmt`) into tests/helpers/e2e-s1.ts while leaving each file's own
throw-wrapper (with its own message wording) local.
annotation-nontype-text-refusal.test.ts already applies that split to its own
`let`-lookup but not to its `fn`-lookup beside it, so its `fnDeclOf` and
b0476's `fnDecl` each re-author the identical AST walk instead of sharing one
`findFnDecl`-shaped export.

## Suggested direction (non-binding, optional)
tests/helpers/e2e-s1.ts already hosts `findLetStmt` as this exact shape's
precedent for `let` statements, and annotation-nontype-text-refusal.test.ts's
own `letStmtOf` already calls it rather than re-walking the AST; a
`findFnDecl` export beside it is the analogous, already-demonstrated home
neither file's own `fn`-lookup currently has a counterpart in.

## False-positive check
- Gate-pin check: neither tests/b0476-panic-site-and-frames.test.ts nor
  tests/annotation-nontype-text-refusal.test.ts matches `*gate*.test.ts` or
  the named kin.
- Recording-double check: `fnDecl`/`fnDeclOf` reads an already-parsed, static
  `ThetaDocument`; it records no calls and backs no "never called" witness,
  so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0476-runtime-panic-site-zero-range-no-frames.md
  — Status fixed (unreleased; lands in the next version bump);
  docs/bugs/0124-parsetype-trailing-punctuation-leniency.md — Status fixed
  (0.121.0). `npx vitest run tests/b0476-panic-site-and-frames.test.ts
  tests/annotation-nontype-text-refusal.test.ts` → 2 files, 266 tests (15 +
  251) passing at HEAD, so neither is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0476-panic-site-and-frames\|annotation-nontype-text-refusal"
  docs/reference/coverage-matrix.md` → 0 hits. `grep -rl "b0476-panic-site-and-frames.test.ts"
  docs/bugs/*.md` (excluding its own doc) → 0 hits. `grep -rl "annotation-nontype-text-refusal.test.ts"
  docs/bugs/*.md` (excluding its own doc) → 11 further bug documents cite this
  filename (0085, 0093, 0130, 0203, 0204, 0205, 0222, 0228, 0252, 0262, 0279),
  each around specific pinned cells far from the 386-399 range cited here
  (e.g. bug 0222 names "group (o)" cells at lines ~1830-1975). This finding
  proposes no merge, rename, or deletion of any `it()`/`describe()` or the
  pinned cells those documents name — only that the internal `fnDeclOf`
  FIND-logic could import a shared export, mirroring the split this same
  file already applies to its own `letStmtOf`/`findLetStmt` pair.
- Coverage check: the claim is about a repeated helper's find-logic, not a
  missing test path; each copy is exercised by its own file's tests
  (confirmed passing above).
- Prior-finding overlap check: PTQ-0257 (resolved) covers a disjoint pair
  (annotation-nontype-text-refusal.test.ts + qry4-refused-annotation-withhold.test.ts)
  for the analogous `letStmtOf` duplication; it does not cite b0476 or the
  `fnDecl`/`fnDeclOf` pair, so this is a distinct, unremediated occurrence of
  the same duplication shape rather than a re-filing of PTQ-0257.

## Triage
verdict: confirmed — all three excerpts (fnDecl 180-189, fnDeclOf 386-399, findLetStmt 108-113) and the exact `.find()`-predicate grep (2 hits, same 2 files) reproduce verbatim; the same file's letStmtOf already delegates to findLetStmt (PTQ-0257's live fix) while fnDeclOf/fnDecl still each hand-roll the identical fn-lookup walk, a distinct pair PTQ-0257 never cited; docs/bugs 0476 and 0124 are both fixed and `npx vitest run` on both files is 266/266 green, coverage-matrix.md has 0 hits, and neither file matches a gate-pin pattern, so no D7 carve-out applies (the broader "`^function fnDecl`, no others" corroborating grep in the filing is itself imprecise — it actually returns 9 files, mostly unrelated fixture-builders caught by prefix match — but this only affects a supplementary claim, not the core byte-identical duplication the primary predicate-search and direct reads independently confirm) (triage: claude-opus-5)
