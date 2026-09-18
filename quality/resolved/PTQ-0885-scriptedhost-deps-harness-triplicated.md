---
id: PTQ-0885
title: ScriptedHost (StatementEvalHost double) and its deps() assembler are declared byte-identically in three query-effect bug-witness files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0307-value-position-query-err-binds.test.ts:125-176
  - tests/b0351-value-position-query-success-binds-ok.test.ts:152-203
  - tests/b0387-block-expr-tail-query-consumption.test.ts:167-218
sites: 3                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# ScriptedHost (StatementEvalHost double) and its deps() assembler are declared byte-identically in three query-effect bug-witness files

## Observation
tests/b0307-value-position-query-err-binds.test.ts declares a module-scope
`class ScriptedHost implements StatementEvalHost` (a double whose
`runEffect` returns a scripted `OperationResult` keyed by the effect
expression's kind/callee, and whose `evaluatePure` evaluates bounded
literal/ident forms against a real environment) plus a `deps(host)` function
assembling `ExecuteBodyDeps` around it. The identical class and function —
same doc comments, same method bodies, same field/parameter names — are
separately declared in tests/b0351-value-position-query-success-binds-ok.test.ts
and tests/b0387-block-expr-tail-query-consumption.test.ts. No file under
tests/helpers/ exports either declaration; each file's own `deps()`
references its own file-local `realEnv()`/`NOOP_CHECKPOINT`/`RecordingMutator`
symbols, which the prior finding quality/issues/PTQ-0536 already tracks as a
duplicated bundle between exactly two of these three files (b0307 and b0387)
without covering `ScriptedHost` or `deps()` — those two declarations are not
named anywhere in PTQ-0536's Evidence section.

## Evidence

tests/b0307-value-position-query-err-binds.test.ts:125-176 (re-read
immediately before filing):
```ts
/**
 * A `StatementEvalHost` double whose `runEffect` returns a scripted
 * `OperationResult` keyed by the effect expression's `kind` (a `query` keys on
 * `"query"`) / a call's callee, and whose `evaluatePure` evaluates the bounded
 * literal / ident forms the witnesses need against the real environment. The
 * failing query is modelled as `{ ok:false, error: <tool_loop_exhausted> }` —
 * exactly what `runQueryEffect` feeds `evalExpr`'s effect arm for that variant.
 */
class ScriptedHost implements StatementEvalHost {
  readonly results = new Map<string, OperationResult>();

  evaluatePure(expr: Expr, env: LexicalEnvironment): ThetaValue {
    switch (expr.kind) {
      case "string":
      case "bool":
        return expr.value;
      case "number":
        return Number(expr.text);
      case "null":
        return null;
      case "ident":
        return env.resolve(expr.name).value ?? null;
      default:
        return null;
    }
  }

  checkpointFor(expr: Expr): CheckpointDescriptor | null {
    if (expr.kind === "call" || expr.kind === "query" || expr.kind === "invoke") {
      return { kind: "tool-call", site: SITE };
    }
    return null;
  }

  runEffect(expr: Expr): Promise<OperationResult> {
    const key = expr.kind === "call" ? expr.callee : expr.kind;
    return Promise.resolve(this.results.get(key) ?? { ok: true, value: null });
  }
}

/** Assemble `ExecuteBodyDeps` from a host. */
function deps(host: StatementEvalHost): ExecuteBodyDeps {
  return {
    env: realEnv(),
    host,
    checkpoint: NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    mutator: new RecordingMutator(),
    mode: "prompt" as DrivenConversationMode,
    file: "test.theta",
  };
}
```

tests/b0351-value-position-query-success-binds-ok.test.ts:152-203 and
tests/b0387-block-expr-tail-query-consumption.test.ts:167-218 reproduce this
same class and function byte-for-byte. Direct diffs, re-run immediately
before filing:
`diff <(sed -n '133,163p' tests/b0307-value-position-query-err-binds.test.ts) <(sed -n '160,190p' tests/b0351-value-position-query-success-binds-ok.test.ts)`
(the `class ScriptedHost` body) → empty.
`diff <(sed -n '133,163p' tests/b0307-value-position-query-err-binds.test.ts) <(sed -n '175,205p' tests/b0387-block-expr-tail-query-consumption.test.ts)`
(the same class body against the third file) → empty.
`diff <(sed -n '166,176p' tests/b0307-value-position-query-err-binds.test.ts) <(sed -n '193,203p' tests/b0351-value-position-query-success-binds-ok.test.ts)`
(the `deps()` function) → empty.
`diff <(sed -n '166,176p' tests/b0307-value-position-query-err-binds.test.ts) <(sed -n '208,218p' tests/b0387-block-expr-tail-query-consumption.test.ts)`
(the same function against the third file) → empty.
Exact search: `grep -rln "^class ScriptedHost" tests/*.test.ts` → exactly
these three files, no others.

## Why this is a problem
The same `StatementEvalHost` double and its dependency assembler are written
out three separate times across the query-effect (bug 0307/0351/0387)
family, with matching doc comments word-for-word, and no `tests/helpers/`
module holds either. quality/issues/PTQ-0536 already established that two of
these same three files (b0307 and b0387) independently redeclare a
different, disjoint bundle of AST-builder helpers (`span`, `stringExpr`,
`realEnv`, `NOOP_CHECKPOINT`, etc.); this finding is the residual
`ScriptedHost`/`deps()` pair that bundle's own Evidence section does not
name, now shown to recur across all three sibling files rather than just the
two PTQ-0536 cites.

## Suggested direction (non-binding, optional)
A shared tests/helpers/ module exporting `ScriptedHost` and `deps()` — the
same natural home PTQ-0536 already names for this family's AST-builder
bundle — is where these three files' identical copies point; this observes
where the duplicate already sits, not a design for the extraction.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the
  named kin; the cited lines are a scripted execution double and its
  dependency assembler, not a pinned count or inventory.
- Recording-double check: `ScriptedHost` is a scripted stand-in whose
  `results` map is set by each test before driving; it is not a
  MUST-NOT-call negative witness, so the carve-out does not apply. This
  finding does not claim any assertion built on it cannot fail — only that
  the double's own DEFINITION is triplicated.
- docs/bugs/ signature search: docs/bugs/0307-value-position-query-err-aborts-body-instead-of-binding.md
  Status "fixed (0.298.0)"; docs/bugs/0351-value-position-query-success-binds-raw-payload.md
  Status "fixed (0.351.0)"; docs/bugs/0387-block-expr-tail-query-raw-payload-and-err-abort.md
  Status "fixed (0.383.0)" — none is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0307-value-position-query-err-binds\|b0351-value-position-query-success-binds-ok\|b0387-block-expr-tail-query-consumption" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of any file
  or `it()`/`describe()` block — only that the `ScriptedHost`/`deps()` pair
  could be imported from a shared module instead of redeclared a third
  time — so no citation is affected.
- Overlap check against already-filed/resolved topics: quality/issues/PTQ-0536
  (open, confirmed) covers a disjoint bundle (`span`/`stringExpr`/`identExpr`/
  `arrayExpr`/`queryExpr`/`matchExpr`/`letStmt`/`returnStmt`/`body`/`realEnv`/
  `SITE`/`NOOP_CHECKPOINT`) between b0307 and b0387 only, and its Evidence
  text does not name `ScriptedHost` or `deps()` anywhere; quality/issues/PTQ-0529
  covers a different pair of b0307 files
  (b0307-empty-template-parity.test.ts, which uses a different
  `EffectfulStatementHostDeps`-based harness with no `ScriptedHost` at all,
  confirmed by `grep -n "ScriptedHost" tests/b0307-empty-template-parity.test.ts`
  → 0 hits). This finding's three locations and two named declarations are
  not restated by either.
- Coverage check: the claim is about a triplicated helper-class/function
  DEFINITION, not a missing test path; every cited declaration is exercised
  by its own file's currently-passing tests.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `class ScriptedHost implements StatementEvalHost` and `function deps(host: StatementEvalHost)` reproduce at b0307:133-176, b0351:160-203, b0387:175-218; all four stated sed-range diffs (class body 31 lines, deps() 11 lines, against both siblings) are exactly empty; `grep -rln "^class ScriptedHost" tests/` → exactly the three cited files and `grep -rln ScriptedHost tests/ src/ extensions/ tools/` finds no other declaration or import; tests/helpers/ has zero `StatementEvalHost` hits (no shared double exists; the 13 other `implements StatementEvalHost` doubles in tests/ are differently-named par-for/recording hosts, not this shape); both cited symbols are live in every file's passing witnesses; D7 copy-paste-double/boilerplate-duplication class under tests/, no gate file, docs/bugs 0307/0351/0387 all `fixed`, coverage-matrix 0 hits, and the bug docs' citations of these files (0307/0351/0387/0421) are immaterial since no merge/rename/delete is proposed. One prose overclaim corrected on record, non-blocking: the class doc comments are NOT word-for-word identical — b0307:129-131 describes the failing `{ ok:false, error }` variant while b0351:156-158/b0387:171-173 describe the success `{ ok:true, value }` variant (the filing's own diffs correctly start at the `class` line). Not a duplicate: PTQ-0529 and PTQ-0536 (both open, confirmed) inventory the span/stringExpr/…/realEnv/SITE/NOOP_CHECKPOINT/RecordingMutator bundle and neither names `ScriptedHost` or `deps()` (grep → 0 hits in both); PTQ-0701 (resolved) extracted only RecordingMutator; same-wave sibling d7-01-b0351 was ruled duplicate of PTQ-0529 with its triage note explicitly deferring the ScriptedHost+deps() component to this filing as the more complete three-site canonical. Fix is a mechanical extraction to a tests/helpers module imported by all three files (triage: claude-fable-5-1)
