---
id: PTQ-0372
title: invoke-static-checks.ts's module header still claims the with-clause default-reject loop convicts every non-theta bare-ident callee, though Erratum B now exempts two classes
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/invoke-static-checks.ts:60-68
  - src/extension/invoke-static-checks.ts:1249-1258
  - src/extension/invoke-static-checks.ts:1266-1280
  - src/extension/invoke-static-checks.ts:1352-1366
  - src/extension/invoke-static-checks.ts:1515-1521
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260916045442
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-16
---

# invoke-static-checks.ts's module header still claims the with-clause default-reject loop convicts every non-theta bare-ident callee, though Erratum B now exempts two classes

## Observation
The module-level header of `src/extension/invoke-static-checks.ts` (1-75)
describes the with-clause default-reject rule (60-68) as: "the Erratum A′
default-reject loop convicts a clause on any bare-ident callee the frozen
callable set does not classify `theta`". The function that implements this
rule, `checkWithClauseDefaultReject` (1249-1308), now takes a fourth
parameter, `statements` (1253), added together with two `continue` arms
(1273-1275, 1278-1280) that exempt a same-file `subagent fn` callee and defer
an imported-name callee — both cases where the callable set does not classify
the callee `theta`, and neither of which is convicted by this loop. A third
sibling, `checkImportedWithClauseCallees` (1346-1376), was added in the same
commit to judge the deferred import case later, once materialised.
`checkInvokeStaticResolution`'s own doc comment (1468-1528), immediately
above the function that calls both, already states this correctly (1515-1521:
"Erratum A′ / Erratum B … and that is not one of the file's own `subagent
fn`s … an imported callee's verdict is deferred to
`checkImportedWithClauseCallees`"); only the module header at the top of the
file was left with the pre-Erratum-B wording.

## Evidence
`src/extension/invoke-static-checks.ts:60-68` — the module header's
unqualified conviction claim:
```ts
//   - RFC 0009 (invocation.md INV-6 / INV-8) — the call-site `with` clause
//     checks inside `checkInvokeStaticResolution`: `checkClauseCwdType` judges
//     the clause's `cwd` value as an ordinary `string` argument slot on both
//     call surfaces (the surface's own arg-type row, no new code); the mode gate
//     refuses a clause on a statically-resolvable PROMPT-mode callee
//     (`theta/parse/with-clause-prompt-mode-callee`); and the Erratum A′
//     default-reject loop convicts a clause on any bare-ident callee the frozen
//     callable set does not classify `theta` (`theta/parse/with-clause-pi-tool`
//     / `theta/parse/with-clause-in-process-callee`).
```

`src/extension/invoke-static-checks.ts:1249-1258` — the function's current
signature, carrying the `statements` parameter the header's description
never mentions, plus the two name sets built from it:
```ts
function checkWithClauseDefaultReject(
  callerPath: string,
  callExprs: readonly CallExpr[],
  callableSet: CallableSetSnapshot | undefined,
  statements: readonly Stmt[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (callableSet !== undefined) {
    const subagentFns = topLevelSubagentFnNames(statements);
    const imported = importedLocalNames(statements);
```

`src/extension/invoke-static-checks.ts:1266-1280` — the two exemption arms:
a same-file `subagent fn` callee and an imported-name callee are both
`entry === undefined` (not classified `theta`) yet both `continue` rather
than being convicted:
```ts
      const entry = callableSet.entries.get(call.callee);
      if (entry !== undefined && entry.kind === "theta") {
        continue;
      }
      // Erratum B: a same-file `subagent fn` is a child-spawning surface.
      // expressions.md §"Identifier resolution" ranks `fn` above `callable`,
      // so a name the set ALSO binds resolves to the declaration first.
      if (entry === undefined && subagentFns.has(call.callee)) {
        continue;
      }
      // An imported name's fn kind is the declaring library's fact; judged
      // once the import materialises (`checkImportedWithClauseCallees`).
      if (entry === undefined && imported.has(call.callee)) {
        continue;
      }
```

`src/extension/invoke-static-checks.ts:1352-1366` — the deferred case is not
even convicted later by default: `checkImportedWithClauseCallees` exempts a
materialised `subagent fn` import too, mirroring the same-file exemption
above:
```ts
  const diagnostics: Diagnostic[] = [];
  const importedNames = importedLocalNames(body.statements);
  const byName = new Map(imports.map((entry) => [entry.name, entry] as const));
  for (const call of collectCallSites(body).callExprs) {
    if (call.withClause === undefined || !importedNames.has(call.callee)) {
      continue;
    }
    if (callableSet?.entries.get(call.callee) !== undefined) {
      continue;
    }
    const materialised = byName.get(call.callee);
    if (materialised?.kind === "fn" && materialised.fn?.subagent === true) {
      continue;
    }
    diagnostics.push({
```

`src/extension/invoke-static-checks.ts:1515-1521` — the ALREADY-CORRECTED
sibling description, immediately above `checkInvokeStaticResolution`, in the
very same file:
```ts
 *   - RFC 0009 Erratum A′ / Erratum B `theta/parse/with-clause-pi-tool` /
 *     `theta/parse/with-clause-in-process-callee`: the default-reject loop over
 *     the bare-ident call surface for a clause on any callee the frozen
 *     callable set does not classify `theta` and that is not one of the
 *     file's own `subagent fn`s (RFC 0012 §10); an imported callee's verdict
 *     is deferred to `checkImportedWithClauseCallees` after import
 *     materialisation;
```

## Why this is a problem
The module header states a specific, falsifiable behavioural rule for a
named loop ("convicts a clause on any bare-ident callee the frozen callable
set does not classify `theta`"). That rule is demonstrably false against the
current implementation: two callee classes the callable set does not
classify `theta` — a same-file `subagent fn` and an imported name — are not
convicted. The file's own closer doc comment for the same rule (1515-1521)
was corrected when Erratum B landed; the module header a few dozen lines
above it was not, so the two comment blocks in the same file now disagree
about what the loop they both describe does.

## Suggested direction (non-binding, optional)
Bring the module header's phrasing at 66-68 in line with the already-updated
wording at 1515-1521 (name Erratum B, the same-file `subagent fn` exemption,
and the deferral to `checkImportedWithClauseCallees`), rather than leaving
the two descriptions of one loop to disagree.

## False-positive check
- Re-read `checkWithClauseDefaultReject` (1249-1308) in full: confirmed the
  `entry === undefined && subagentFns.has(call.callee)` and
  `entry === undefined && imported.has(call.callee)` arms both `continue`
  before reaching either diagnostic push, so neither callee class is
  convicted by this loop.
- Confirmed `entry === undefined` is the correct characterisation of "the
  callable set does not classify `theta`" for both exempted classes: a
  same-file `subagent fn` and a plain imported name are declaration-site /
  import-site facts, never `tools:` entries, so `callableSet.entries.get(...)`
  returns `undefined` for both.
- Git-history intent check: `git show 89faa7c5 -- src/extension/invoke-static-checks.ts`
  is the commit that added the `statements` parameter and both exemption
  arms, and it also rewrote `checkWithClauseDefaultReject`'s own local doc
  comment and `checkInvokeStaticResolution`'s doc-comment bullet (1515-1521)
  to say "Erratum A′ + Erratum B" — but its diff hunk to this file starts at
  line 118 (`git show 89faa7c5 -- src/extension/invoke-static-checks.ts |
  grep -m1 '^@@'` → `@@ -118,6 +118,7 @@`), after the module header
  (1-75), confirming the header specifically was left unedited while the two
  closer doc comments were updated in the same commit.
- Not a deadness claim: both exemption arms and `checkImportedWithClauseCallees`
  are live, tested code (`tests/call-with-clause-erratum-b.test.ts` exercises
  exactly this admission/deferral pair) — this finding is about the header
  text describing them, not about the code itself.
- Prior-finding check: grepped `quality/issues`/`quality/resolved`/`quality/intake`
  for `Erratum B` and `checkWithClauseDefaultReject` in a D2/header-staleness
  title — no hits; this exact wording mismatch has not been filed before.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — every excerpt verified verbatim at its cited lines and `git show 89faa7c5` confirms that commit added the two exemption arms + `checkImportedWithClauseCallees` and rewrote both sibling doc comments (local + 1515-1521) while its diff to this file starts at old line 118, leaving the module header (60-68) with the pre-Erratum-B claim; not a duplicate of fixed PTQ-0176 or sibling d2-01 (triage: claude-opus-5)
