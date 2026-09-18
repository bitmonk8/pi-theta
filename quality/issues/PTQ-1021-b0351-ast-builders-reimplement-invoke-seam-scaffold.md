---
id: PTQ-1021
title: b0351 hand-rolls span/identExpr/queryExpr/matchExpr/letStmt/body already exported by invoke-seam-scaffold.ts it partially imports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0351-value-position-query-success-binds-ok.test.ts:1-1
  - tests/b0351-value-position-query-success-binds-ok.test.ts:60-113
  - tests/helpers/invoke-seam-scaffold.ts:180-202
sites: 6                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0351 hand-rolls span/identExpr/queryExpr/matchExpr/letStmt/body already exported by invoke-seam-scaffold.ts it partially imports

## Observation
tests/b0351-value-position-query-success-binds-ok.test.ts imports only
`{ ScriptedHost, deps }` from `./helpers/invoke-seam-scaffold` (line 1), then
declares its own module-scope `span`, `stringExpr`, `identExpr`, `arrayExpr`,
`objectExpr`, `callExpr`, `queryExpr`, `tryExpr`, `matchExpr`, `letStmt`,
`returnStmt`, and `body` AST-builder functions (lines 60-113). Six of these
(`span`, `identExpr`, `queryExpr`, `matchExpr`, `letStmt`, `body`) are
byte-identical in body to functions the SAME helper module
(`tests/helpers/invoke-seam-scaffold.ts:180-202`) already exports. The sibling
file in this same review scope, tests/b0387-block-expr-tail-query-consumption.test.ts,
imports exactly these names (`body, identExpr, letStmt, matchExpr, queryExpr,
span`) from that module rather than redeclaring them (its own line 1-9
import block). b0351's git commit (2026-09-18 20:40) postdates the commit
that added these exports to invoke-seam-scaffold.ts (2026-09-18 17:05).

## Evidence

tests/b0351-value-position-query-success-binds-ok.test.ts:60-113 (re-read
immediately before filing):
```ts
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function stringExpr(value: string): Expr {
  return { kind: "string", value, range: span() };
}

function identExpr(name: string): Expr {
  return { kind: "ident", name, range: span() };
}
...
function queryExpr(template: string): Expr {
  return { kind: "query", schema: null, template, range: span() };
}
...
function matchExpr(scrutinee: Expr, arms: readonly MatchArmNode[]): MatchExpr {
  return { kind: "match", scrutinee, arms, range: span() };
}

function letStmt(name: string, init: Expr): Stmt {
  return { kind: "let", name, mutable: false, annotation: null, init, range: span() };
}
...
function body(statements: readonly Stmt[], tail: Expr | null = null): ThetaBody {
  return { statements, tail };
}
```

tests/helpers/invoke-seam-scaffold.ts:180-202 (the exported originals,
byte-identical bodies apart from the added `export` keyword and `queryExpr`'s
return type being the narrower `QueryExpr`):
```ts
export function identExpr(name: string): Expr {
  return { kind: "ident", name, range: span() };
}

export function queryExpr(template: string): QueryExpr {
  return { kind: "query", schema: null, template, range: span() };
}

export function matchExpr(scrutinee: Expr, arms: readonly MatchArmNode[]): MatchExpr {
  return { kind: "match", scrutinee, arms, range: span() };
}

export function letStmt(name: string, init: Expr): Stmt {
  return { kind: "let", name, mutable: false, annotation: null, init, range: span() };
}

export function body(statements: readonly Stmt[], tail: Expr | null = null): ThetaBody {
  return { statements, tail };
}
```
(`span` itself is exported at invoke-seam-scaffold.ts:71-73 with the identical
one-line body.)

tests/b0387-block-expr-tail-query-consumption.test.ts:1-9 (the sibling file in
this same scope, importing the identical names from the identical module
instead of redeclaring them):
```ts
import { strExpr as stringExpr } from "./helpers/tool-call-dispatch-harness";
import {
  ScriptedHost,
  deps,
  body,
  identExpr,
  letStmt,
  matchExpr,
  queryExpr,
  span,
} from "./helpers/invoke-seam-scaffold";
```

Search run: `grep -n "^export function \(span\|identExpr\|queryExpr\|matchExpr\|letStmt\|body\)\b" tests/helpers/invoke-seam-scaffold.ts` → 6 hits (span:71, identExpr:181, queryExpr:186, matchExpr:191, letStmt:196, body:201). `grep -n "^function \(span\|identExpr\|queryExpr\|matchExpr\|letStmt\|body\)\b" tests/b0351-value-position-query-success-binds-ok.test.ts` → 6 hits (60, 68, 87, 97, 102, 111), each matching the exported body verbatim.

## Why this is a problem
This is the "copy-paste fixtures/doubles" class: a fake/fixture is
re-implemented in a test file where the canonical helper already exists and
is already imported for other members from the same module. The redeclared
functions are not adapted to any b0351-specific need — their bodies are
identical to the exports — so a future change to the AST shape these helpers
encode (e.g. `QueryExpr`'s fields, or `letStmt`'s `annotation` default) landing
in `invoke-seam-scaffold.ts` would silently leave b0351's copy checking a
stale shape, with nothing in either file surfacing the drift. The sibling file
reviewed in this same wave (b0387) demonstrates the import was available and
already in ordinary use at the time b0351 was authored.

## Suggested direction (non-binding, optional)
Importing `span`, `identExpr`, `queryExpr`, `matchExpr`, `letStmt`, and `body`
from `./helpers/invoke-seam-scaffold` (as b0387 already does) in place of the
local redeclarations is the natural next step this file's own partial import
of `ScriptedHost`/`deps` from the same module already points at; this is an
observation about where the duplicate already sits, not a design for the
extraction.

## False-positive check
- Gate-pin check: the file is not `*gate*.test.ts` or a named kin; no pinned
  count or inventory is touched.
- Recording-double check: none of the six duplicated functions is a
  "never called" negative-witness double; the carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0351-value-position-query-success-binds-raw-payload.md
  exists and backs this file's RED-at-fork cells by design; that governs the
  *assertions'* correct-reason-red posture, not the AST-builder helper
  duplication claimed here (the helpers compile and run identically either
  way).
- coverage-matrix/bug-doc citation search: `grep -n
  "b0351-value-position-query-success-binds-ok" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of the file or
  any `it()`/`describe()` block, only that six local functions could be
  imported instead of retyped.
- Prior-finding overlap: `grep -rl "b0351" quality/issues/*.md
  quality/resolved/*.md` → 6 files, none of which discuss `invoke-seam-scaffold`
  AST-builder duplication (they cover ascription prose, live-host guards,
  parse-error-codes, the b0307 AST harness pair, statement-executor mutators,
  and ScriptedHost/deps triplication — a distinct root cause from the one
  filed here). PTQ-0529 (fixed) covers only tests/b0307-*.test.ts's identical
  pre-extraction duplication and is the commit that produced the
  `invoke-seam-scaffold.ts` exports cited here; it does not mention b0351.
  Not a duplicate of any listed ticket.
- Coverage-drift check: this finding is about test-support code duplicated
  across files that both exist and run; it makes no claim that any path or
  behaviour is untested.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both stated greps reproduce exactly (helper exports at invoke-seam-scaffold.ts:71/181/186/191/196/201; local declarations at b0351:60/68/87/97/102/111), and a mktemp awk-extracted per-function diff of all six bodies is empty after stripping only the `export ` keyword and the `QueryExpr`→`Expr` return-type narrowing (each 3 lines, drop-in assignable, so the import is mechanical); every local copy is live (span 11 / identExpr 10 / queryExpr 9 / matchExpr 2 / letStmt 8 / body 11 call sites); b0351:1 already imports `ScriptedHost, deps` from the same module and sibling b0387:2-11 imports exactly these six names; git confirms the sequence the candidate states — e54a42b3 (17:05, PTQ-0529 fix) added the exports and migrated b0307×2 + b0387 but did NOT touch b0351, and 7c780a28 (20:40, PTQ-0885 fix) migrated b0351's ScriptedHost/deps/realEnv/SITE/NOOP_CHECKPOINT while leaving the builders. In-scope D7 copy-paste-fixture class under tests/, not a gate file, coverage-matrix 0 hits, docs/bugs/0351:204 cites the file but no merge/rename/delete is proposed. Not a duplicate: the only prior tracking was qw20260918050411-d7-01-b0351 ruled duplicate of PTQ-0529 (TRIAGE_LOG:111) on the instruction to fold b0351 into that fix — PTQ-0529 is now fixed without having done so, PTQ-0536/PTQ-0885 are likewise fixed and cover disjoint declarations, and no open issue names these six functions in b0351; this is the residual not-migrated site (precedent PTQ-0228/0301/0594/0613/0898). Fix is a mechanical swap of six local declarations for the existing import (triage: claude-fable-5-1)
