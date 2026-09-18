---
id: PTQ-1023
title: let-arm-withhold-binding-scoped.test.ts redeclares tests/helpers/e2e-s1.ts's exported binderSites walker instead of importing it
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/helpers/e2e-s1.ts:747-856
  - tests/let-arm-withhold-binding-scoped.test.ts:280-402
sites: 1
fix_scope: localized
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# let-arm-withhold-binding-scoped.test.ts redeclares tests/helpers/e2e-s1.ts's exported binderSites walker instead of importing it

## Observation
`tests/helpers/e2e-s1.ts` exports `binderSites(doc: ThetaDocument, subject:
string): string[]` — a 110-line recursive `Stmt`/`Expr`/`Block` walker that
records every loop-variable and `let` binder site in source order, taking a
`subject` string so callers can name what the walk is checking for in its
own thrown precondition message. `tests/let-arm-withhold-binding-scoped.test.ts`
imports only `parseDoc` from that module (its sole import from
`./helpers/e2e-s1`) and separately declares its own module-scope `at`,
`render`, and `binderSites` functions. The local `binderSites` is a 123-line
near-byte-copy of the exported one: every `walkExpr`/`walkBlock`/`walkStmt`
case for `match`, `invoke`, `method-call`, `member`, `index`, `binary`,
`ternary`, `array`, `object`, `try`, `result-ctor`, `let`, `for`, `fn`,
`while`, `if`, `expr`, `reassign`, and `return` is reproduced unchanged; the
only differences are the dropped `subject` parameter (replaced by a
hard-coded "the `let` arm under test" in the thrown message), an added `arg`
sub-case recording call-argument sites under `case "call"`, and two added
`walkStmt` cases (`tool-call`, `invoke`).

## Evidence
tests/helpers/e2e-s1.ts:747-750 (canonical export, re-read immediately
before filing):
```ts
export function binderSites(doc: ThetaDocument, subject: string): string[] {
  const out: string[] = [];
  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
```
tests/helpers/e2e-s1.ts:850-856 (the same function's closing precondition
throw, parameterised on `subject`):
```ts
    throw new Error(
      `harness: the fixture produced no parsed body, so its diagnostic set is about a parse failure rather than ${subject}. Diagnostics: ${render(doc)}`,
    );
  }
  walkBlock(body);
  return out;
}
```

tests/let-arm-withhold-binding-scoped.test.ts:280-283 (local redeclaration,
same signature shape minus `subject`):
```ts
function binderSites(doc: ThetaDocument): string[] {
  const out: string[] = [];
  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
```
tests/let-arm-withhold-binding-scoped.test.ts:396-402 (the same closing
throw, `subject` replaced by a literal):
```ts
  const body = doc.body;
  if (body === null) {
    throw new Error(
      `harness: the fixture produced no parsed body, so its diagnostic set is about a parse failure rather than the \`let\` arm under test. Diagnostics: ${render(doc)}`,
    );
  }
```

`diff` of the two functions extracted with `sed -n '747,856p' tests/helpers/e2e-s1.ts`
against `sed -n '280,402p' tests/let-arm-withhold-binding-scoped.test.ts`
(110 lines vs 123 lines) shows exactly four points of divergence: (1) the
signature/`subject` line, (2) an added block under `case "call"` in
`walkExpr`:
```ts
      case "call":
        e.args.forEach((a: Expr, i: number) => {
          out.push(`arg ${e.callee}#${i}@${at(a.range)}`);
        });
        for (const a of e.args) walkExpr(a);
        return;
```
(3) two added `walkStmt` cases:
```ts
      case "tool-call":
        walkExpr(s.call);
        return;
      case "invoke":
        walkExpr(s.invoke);
        return;
```
and (4) the closing throw message's literal-versus-parameter wording. Every
other line of both functions — the `par-for`, `match`, `method-call`,
`member`, `index`, `binary`, `ternary`, `array`, `object`, `try`,
`result-ctor` expression cases and the `let`, `for`, `fn`, `while`, `if`,
`expr`, `reassign`, `return` statement cases — is byte-identical.

Import check: `grep -n "^import" tests/let-arm-withhold-binding-scoped.test.ts`
shows one import from `./helpers/e2e-s1` (`parseDoc` only, line 9);
`binderSites`, `at`, and `render` are not among the names drawn from it.

## Why this is a problem
`tests/helpers/e2e-s1.ts`'s exported `binderSites` already accepts the one
axis this file customises (the `subject` wording for its own precondition
message) through a parameter, so the file's need for a differently-worded
failure message does not itself require a second copy of the walker. The
`arg`-recording and `tool-call`/`invoke` additions are the only genuinely
local content; the remaining ~100 lines of case-by-case AST traversal are
typed twice under the same function name, changeable independently of the
exported version with nothing to signal that a copy was left behind.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts` is already the home for this walker (it now
exports the exact shape this file needs apart from the `arg`/`tool-call`/
`invoke` additions); this is the same residual a prior D7 finding on the
sibling files' identical walker (now fixed) flagged in its own fixer note as
left open for this file's diverged copy.

## False-positive check
- Gate-pin check: `tests/let-arm-withhold-binding-scoped.test.ts` does not
  match `*gate*.test.ts` or a named gate kin; the cited lines are a recursive
  AST-walking helper, not a pinned count or inventory.
- Recording-double check: `binderSites`'s output backs real precondition
  assertions in the file's own tests (`expect(binderSites(doc), ...).toEqual([...])`),
  not a negative-witness recording double; this finding is about the
  walker's *declaration* being duplicated, not about any assertion built on
  its output.
- docs/bugs/ signature search: `grep -rl "let-arm-withhold-binding-scoped"
  docs/bugs/*.md` → docs/bugs/0145 and docs/bugs/0199. Bug 0199's own header
  states "Status: fixed (0.120.0)"; `npx vitest run tests/let-arm-withhold-binding-scoped.test.ts`
  reproduces 32/32 passing at HEAD. Neither bug doc discusses the
  `binderSites`/`at`/`render` helper block or states a rationale for a
  second copy of the walker, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "let-arm-withhold-binding-scoped"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any `it()`/`describe()` — only that the
  local walker could import the module's own already-exported, near-identical
  version — so no witness-list citation is disturbed.
- git history: `tests/helpers/e2e-s1.ts`'s `binderSites` export was added
  2026-09-18 (`git log -S"export function binderSites" -- tests/helpers/e2e-s1.ts`);
  the local copy in `tests/let-arm-withhold-binding-scoped.test.ts` was added
  2026-08-19, predating the export. A prior, now-fixed D7 finding
  (`quality/resolved/PTQ-0633-02-binder-sites-walker-duplicated.md`) covered
  the identical walker duplicated between two OTHER sibling files
  (`loop-element-withhold-binding-scoped.test.ts` and
  `plain-for-loop-variable-element-type.test.ts`); its own triage note
  explicitly flagged this file's `binderSites` as a further, DIVERGED
  (`arg`-recording) copy that fix left standing, without itself citing this
  file's lines or filing a location for it. `grep -rl "binderSites" quality/issues
  quality/resolved quality/intake` (re-run before filing) shows no filed or
  resolved finding whose Evidence cites `tests/helpers/e2e-s1.ts:747-856`
  against this file's lines 280-402.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: all four excerpts match at the cited lines; mktemp sed-range diff of e2e-s1.ts:747-856 (110 lines) vs test:280-402 (123 lines) shows exactly the four claimed divergences (signature/`subject`, added `call` arg-recording arm, added `tool-call`/`invoke` stmt arms, literal throw wording) with every other line byte-identical; the local copy is live (`expectRow` :446 `toEqual([...row.sites])`, a real precondition, not a recording double), the file imports only `parseDoc` from e2e-s1 (:9) while both siblings now import `{ at, binderSites, parseDoc, render }`; export landed in d7b9c00b (2026-09-18), local copy in dcff3f43 (2026-08-19); not gate-kin, 0 coverage-matrix hits, bug docs 0145/0199 state no per-file-walker rationale; not a duplicate — PTQ-0633-02 (fixed) never listed this file in `locations`, its triage note flagged this diverged copy as an undercount, and the fix recorded no decision to leave it. Fixer note: the divergence is functional (rows' `sites` include `arg …` entries and statement-position `tool-call`/`invoke` sinks), so the shared walker must be extended/parameterised for that variant — a bare import swap would break the precondition rows (triage: claude-fable-5-1)
