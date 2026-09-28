---
id: pending
title: The parser's Stmt/Expr walks guard their closed-union switches two ways — a never-typed exhaustiveness backstop in local-binders.ts (and theta-document.ts, type-layer-walk.ts) versus a silent prose default arm in lexical-call-sites.ts and par-for-body-checks.ts — and the silent form has already let two walks skip the par-for node (bugs 0224, 0240)
lens: D1
status: intake
verdict: pending
locations:
  - src/parser/lexical-call-sites.ts:482-486
  - src/parser/lexical-call-sites.ts:590-594
  - src/parser/par-for-body-checks.ts:179-182
  - src/parser/par-for-body-checks.ts:265-267
  - src/parser/local-binders.ts:111-118
  - src/parser/local-binders.ts:197-204
  - src/parser/theta-document.ts:1947-1953
  - src/parser/type-layer-walk.ts:259-265
sites: 4
fix_scope: module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# The parser's Stmt/Expr walks guard their closed-union switches two ways — a never-typed exhaustiveness backstop in local-binders.ts (and theta-document.ts, type-layer-walk.ts) versus a silent prose default arm in lexical-call-sites.ts and par-for-body-checks.ts — and the silent form has already let two walks skip the par-for node (bugs 0224, 0240)

## Observation

`Stmt` (18 members, src/parser/theta-ast.ts:829-847) and `Expr` (20 members,
:339-359) are closed discriminated unions that several parser passes switch
over. Every such switch has to decide what happens when a union member gains
no arm. Two in-scope walks — `walkStmtForLocalBinders` /
`walkExprForLocalBinders` (src/parser/local-binders.ts) — enumerate the
no-descent kinds explicitly and end in a `default` that assigns the
discriminant to `never`, so a member with no arm is a `tsc` error. The other
two in-scope walks — `walkCallSiteStmt` / `walkCallSiteExpr`
(src/parser/lexical-call-sites.ts) and `scanParForStmt` / `scanParForExpr`
(src/parser/par-for-body-checks.ts) — end in a `default` that lists the
intentionally skipped kinds in a comment and returns, so a member with no arm
is skipped with no signal. Both mechanisms cover all 18 / 20 members today.

## Evidence

Way A — compile-time backstop. src/parser/local-binders.ts:111-118:

```ts
    default: {
      // Compile-time exhaustiveness backstop: a future `Stmt` union member
      // trips a `tsc` error here rather than being silently skipped by this
      // pass while the type layer's `walkStmt` (type-layer-walk.ts) handles
      // it — the two walks must classify the same statement kinds in lockstep.
      const _exhaustive: never = stmt;
      return void _exhaustive;
    }
```

src/parser/local-binders.ts:197-204:

```ts
    default: {
      // Compile-time exhaustiveness backstop: a future `Expr` union member
      // trips a `tsc` error here rather than being silently skipped by this
      // pass while the type layer's `walkExpr` (type-layer-walk.ts) handles
      // it — the two walks must classify the same expression kinds in lockstep.
      const _exhaustive: never = expr;
      return void _exhaustive;
    }
```

The same form at src/parser/theta-document.ts:1947-1953 and
src/parser/type-layer-walk.ts:259-265 (the walk local-binders.ts names as its
lockstep partner):

```ts
    default: {
      // Compile-time exhaustiveness backstop: a future `Stmt` union member
      // trips a `tsc` error here rather than being silently dropped from the
      // launch allowlist (the silent gap this collector's header warns of).
      const _exhaustive: never = stmt;
      return void _exhaustive;
    }
```

Search: `grep -rn "_exhaustive: never" src/parser/*.ts` — 7 hits (all pasted;
query-schema-inference.ts:275 is over a `SchemaSinkFrame`, not the AST, and is
not counted):

```
src/parser/local-binders.ts:116:      const _exhaustive: never = stmt;
src/parser/local-binders.ts:202:      const _exhaustive: never = expr;
src/parser/query-schema-inference.ts:275:        const _exhaustive: never = frame;
src/parser/theta-document.ts:1951:      const _exhaustive: never = stmt;
src/parser/theta-document.ts:2041:      const _exhaustive: never = expr;
src/parser/type-layer-walk.ts:263:        const _exhaustive: never = stmt;
src/parser/type-layer-walk.ts:1574:        const _exhaustive: never = e;
```

Way B — silent prose default. src/parser/lexical-call-sites.ts:482-486:

```ts
    default:
      // schema / enum / import / export / break / continue / doc-comment carry
      // no call sites (fn / import names were pre-collected as whole-file
      // declarations; schema / enum names are not resolution arms).
      return;
```

src/parser/lexical-call-sites.ts:590-594:

```ts
    default:
      // number / string / bool / null / ident / query — no call sites (a
      // query's `${…}` interpolations live in its raw template text, not as
      // AST children).
      return;
```

src/parser/par-for-body-checks.ts:179-182:

```ts
    default:
      // fn / schema / enum / import / export / doc-comment carry no
      // enclosing-conversation body restriction to check.
      return;
```

src/parser/par-for-body-checks.ts:265-267:

```ts
    default:
      // ident / number / string / bool / null — no query / nested par-for.
      return;
```

Arm counts at HEAD (explicit cases + kinds left to `default`):
lexical-call-sites.ts `walkCallSiteStmt` 11 + 7 = 18, `walkCallSiteExpr`
14 + 6 = 20; par-for-body-checks.ts `scanParForStmt` 12 + 6 = 18,
`scanParForExpr` 15 + 5 = 20 — so both walks are complete today; the
divergence is only in what happens on the day they are not. Out of scope
but the same class, for the count: `grep -n -A2 "^\s*default:"` over
ident-resolution.ts, structural-checks.ts, query-schema-resolve.ts,
static-type-inference.ts returns silent-return defaults at
ident-resolution.ts:344 and :460, structural-checks.ts:579 and :948,
query-schema-resolve.ts:291 and :538, static-type-inference.ts:229 (7 arms).
Way A: 3 files / 6 arms; Way B: 6 files / 11 arms (4 of them in scope).

Drift that already happened — the silent form is exactly what let two walks
skip `par-for` when that member joined `Expr`. Bug record heads:

docs/bugs/0224-identifier-walk-never-descends-par-for.md:1 — "`checkUnknownIdentifiers`' scope-tracking walk carries no `par-for` arm, so every identifier a `par for` spells — its iterand, its `max` operand and everything in its body — is judged by nothing"

docs/bugs/0240-query-schema-resolve-never-descends-par-for.md:1 — "`rewriteExpr` in the Option-B query-schema-resolve pass carries no `par-for` arm, so the whole `par for` subtree is returned unrewritten"

Both pre-fix walks ended in a Way-B arm. Search:
`git show 844d6533^:src/parser/theta-document.ts | awk '/^function walkIdentExpr/,0' | grep -n "default:" -A 2 | head -3` — 1 hit:

```
85:    default:
86-      // number / string / bool / null / query — no identifier sites.
87-      return;
```

`git show 1bb58604^:src/parser/query-schema-resolve.ts | awk '/private rewriteExpr\(/,0' | grep -n "default:" -A 2 | head -3` — 1 hit:

```
118:      default:
119-        // ident / number / string / bool / null — no nested query.
120-        return expr;
```

The fixes added the missing arm: `git show 844d6533 -- src/parser/theta-document.ts | grep -c '^+.*case "par-for"'` → 2; `git show 1bb58604 -- src/parser/query-schema-resolve.ts | grep -c '^+.*case "par-for"'` → 1. lexical-call-sites.ts:569-570 records the same history from the other side ("Reached explicitly (unlike the ident walk, which predates RFC 0003)").

Self-inconsistency statement: no written rule exists for how a parser walk
guards a closed AST union; the anchor is self-inconsistency between sibling
walks in one directory — three of which say in their own comments that walks
"must classify the same … kinds in lockstep" and enforce it with `never`,
while the two in-scope walks here rely on a comment — plus the cost cited
below.

## Why this is a problem

The cost is mechanical and has already been paid twice. When a member is
added to `Stmt` or `Expr`, `tsc` reports every Way-A switch that lacks an arm
(local-binders.ts, theta-document.ts, type-layer-walk.ts) and reports nothing
for a Way-B switch, whose `default` accepts the new member and returns. The
comment that lists the skipped kinds does not update itself, so it becomes
wrong at the same moment — the pre-fix arm for bug 0224 said "number / string
/ bool / null / query — no identifier sites" while also swallowing `par-for`,
and the pre-fix arm for bug 0240 said "ident / number / string / bool / null —
no nested query" while returning a `par for` subtree unrewritten. The two
in-scope walks are precisely the kind of pass those bugs hit: both descend
`par-for` bodies for scope-sensitive judgements (shadowed callee, isolated-body
tool, shared mutation, break/continue depth), so a member skipped by them is a
missing refusal, not a missing lowering. A maintainer reading
local-binders.ts's "the two walks must classify the same statement kinds in
lockstep" has a compiler behind the sentence; a maintainer reading
lexical-call-sites.ts:483-485 has only the sentence.

## Suggested direction (non-binding, optional)

Unification hypothesis, unproven: the four in-scope `default` arms take the
`never`-assignment form local-binders.ts already uses, with the currently
skipped kinds listed as explicit fall-through cases (as local-binders.ts:102-
110 and :188-196 do) so the prose inventory becomes checked cases. Behaviour
is unchanged today because both walks are complete. This is the same shape
PTQ-1605's ratified verdict prescribes for type-layer-walk.ts /
static-type-inference.ts and does not propose merging any walks (the
qw20260922211400 structural-ident-ast-walkers human-keep-whole ruling).

## False-positive check

- Injected clone map: G005 covers par-for-body-checks.ts:211-222 vs :230-241
  (the `call`/`invoke` and `method-call` argument loops), not the `default`
  arms; lexical-call-sites.ts and local-binders.ts have no groups. Not
  re-derivable from the map — a `default: return` is not a token clone of a
  `never` assignment.
- D9-affinity check: no home claim; every cited walk stays where it is, and
  the finding does not propose merging walks (see the human-keep-whole ruling
  named above).
- D2-deadness check: all four Way-B arms are reachable today for the kinds
  their comments list (e.g. a `schema` statement inside a body reaches
  lexical-call-sites.ts:482; an `ident` expression reaches
  par-for-body-checks.ts:265); the Way-A arms are compile-time only by design.
- D4 check: the divergence is mechanism-shaped (type-checked vs prose), not
  copy-shaped.
- Prior filings: PTQ-1605 (open, D4, ratified "Add a `never` exhaustiveness
  check … to both switches") covers type-layer-walk.ts:170-265 / :1418-1577
  and static-type-inference.ts:180-232 / :341-467 only — its fix scope does
  not reach lexical-call-sites.ts or par-for-body-checks.ts, so it does not
  suppress this filing; it is cited as the precedent that the silent-default
  gap is a recognised cost. PTQ-1606 (open, D4) concerns `PatternNode`
  switches, a different union. `grep -rli "exhaustive" quality/intake | grep qw20260928124659` — 1 hit,
  this file only.
- Bugs: no behaviour change is claimed; both in-scope walks are complete at
  HEAD (arm counts above).
- Self-inconsistency: no written rule exists; the anchor is
  self-inconsistency plus the cost cited above (bugs 0224 and 0240, each a
  Way-B arm swallowing a new member).

## Triage
verdict: questionable — accounting verified: reported_by matches the pinned identity. `grep -rn "_exhaustive: never" src/parser/*.ts` gives the same 7 lines as pasted. All 8 excerpts match at the cited lines. Case counts at HEAD: walkCallSiteStmt 11, walkCallSiteExpr 14, scanParForStmt 12, scanParForExpr 15, all ending in a silent prose `default`; local-binders has `never` backstops at :116/:202. clone-scan on lexical-call-sites.ts finds no groups, so this is not a D4 clone. The cost is real: bugs 0224 and 0240 exist, the pre-fix `default` arms from `git show 844d6533^` and `1bb58604^` reproduce exactly (:85-87 and :118-120), and the fixes add 2 and 1 `case "par-for"` lines. The intake `exhaustive` grep now returns 2 hits, but the extra one (d1-01-generic-arity, mtime 15:59) was written after this file (15:25), so the count was true when filed. Not a duplicate: PTQ-1605 prescribes `never` only for type-layer-walk/static-type-inference, and the human-keep-whole ruling on qw20260923145222-d4-01 declined a shared fold of these two walks, not a backstop. Whether to add the backstop is a design decision for a human ruling (triage: claude-opus-5-5)
