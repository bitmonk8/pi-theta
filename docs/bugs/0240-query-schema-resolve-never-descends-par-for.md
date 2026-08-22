# Bug 0240 — `rewriteExpr` in the Option-B query-schema-resolve pass carries no `par-for` arm, so the whole `par for` subtree is returned unrewritten: an `@`-query at an INDIRECT sink position inside the body keeps `schema: null` where the plain-`for` spelling of the same body resolves it, and the QRY-4 `theta/parse/explicit-schema-mismatch` warning is withheld beside CTRL-4's refusal — where two sibling query verdicts do co-fire at that same position

- **Status:** fixed (0.200.0).
- **Sev/Diff estimate:** S2/D1 — S2 because one written mistake loses a
  registered verdict: `let o: Owner = @<integer>`who`` draws
  `theta/parse/explicit-schema-mismatch` (W) inside a plain `for` body and
  draws only `theta/parse/par-query-in-body` (E) inside a `par for` body
  (§Reproduction D6), while the two nearest sibling verdicts at that exact
  position — QRY-19's `discarded-query-result` and the ascription's
  `unresolved-named-type` — are pinned to co-fire there
  (`tests/par-for.test.ts:855`, `:926`). Not S1: every `@`-query in a `par for`
  body draws the error-severity CTRL-4 refusal at any depth, so the unresolved
  schema (§Reproduction D2–D5, D7, D8) never reaches a provider — no theta
  carrying it registers. D1 because the change is one `case "par-for"` in one
  file mirroring the `case "for"` two arms above it, minting no diagnostic code
  and adding no registry row; a prototype arm run against the full default
  suite flipped nothing (§Fix (d)).
- **Kind:** defect — implementation, one traversal, measured at HEAD
  `30c0cb67` (v0.197.0, `package.json:3`).

  `resolveQuerySchemas` (`src/parser/query-schema-resolve.ts:81`) is the
  Option-B tree-rebuild pass `parseThetaDocument` runs at
  `src/parser/theta-document.ts:898` to fill QRY-2's inferred response schema
  and collect QRY-4's mismatch warnings. Its expression recursion `rewriteExpr`
  (`:323`) dispatches on `expr.kind` and has no `case "par-for"`, so a
  `ParForExpr` (`src/parser/theta-document.ts:374`, an `Expr` union member at
  `:421`) falls into the `default` arm (`:440–:442`), whose comment enumerates
  "ident / number / string / bool / null". The node is returned by identity:
  its iterand, its `max` operand and its whole body are never rewritten and
  never checked.
- **Affected** (every citation verified against the tree at HEAD `30c0cb67`;
  symbols named beside line numbers under bug
  [0134](./0134-params-shift-induced-stale-citations.md)'s do-not-chase
  adjudication):
  - **The recursion with the missing arm** — `rewriteExpr`
    (`src/parser/query-schema-resolve.ts:323`), whose `default` arm
    (`:440–:442`) absorbs a `par-for` node. Its thirteen present arms end at
    `case "block"` (`:433`), bug 0082's landed addition.
  - **The shape to mirror** — `rewriteStmt`'s `case "for"` (`:163`), three
    lines: an iterand rewritten under a `{ kind: "stop", label: "for-iterand" }`
    frame and a body rewritten through `rewriteBlock` (`:125`) with an empty
    (sink-less) tail-frame list. Its return-aware twin is
    `rewriteReturnAware`'s `case "for"` (`:273`), which routes the body through
    `rewriteLoopBody` (`:294`); `rewriteStmt`'s `default` (`:211`) and
    `rewriteReturnAware`'s (`:283`) are the two statement-side fallthroughs,
    and neither is reached by a `par for`, which is an expression.
  - **The two sinks the missing arm starves** — `resolveQuery` (`:477`), which
    fills a null `QueryExpr.schema` from the enclosing frame chain, and
    `checkLetMismatch` (`:507`), which pushes
    `theta/parse/explicit-schema-mismatch`. Both are unreachable inside a
    `par for` body; no new emitter is needed by the fix.
  - **The refusal that masks the schema half** — `scanParForExpr`'s `query` arm
    (`src/parser/theta-document.ts:5127`), driven by
    `emitParForBodyDiagnostics` (`:4983`, called at `:4962`). The scan is
    exhaustive over the `Expr` kinds that can carry a query and descends a
    nested block, a nested plain `for` / `while`, a `match` arm and every
    operand position, so every `@`-query in the body is refused at any depth.
  - **The registered rows** — `theta/parse/explicit-schema-mismatch`
    (`docs/spec_topics/diagnostics/code-registry-parse.md:84`; Sev `W`, Phase
    `parse`), whose *Trigger* is stated positionally ("Both a binding
    annotation and an explicit `@<Schema>` ascription are present, and the
    ascription is not compatible with the annotation") and names no exempt
    construct; and `theta/parse/par-query-in-body` (`:75`), whose *Trigger*
    describes only its own refusal and claims no suppression of neighbouring
    codes. `docs/reference/diagnostics.md:121` mirrors the latter's Message
    column.
  - **The normative source** — `docs/spec_topics/query/query-forms.md:15`
    (QRY-2), `:29–:33` (the three sink positions), `:35` (the untyped
    fallback), `:39–:44` (the outward walk and its crossed / stopped sets, the
    text `rewriteExpr`'s arms implement one-for-one), `:57` (QRY-4) and `:66`
    (the mismatch warning's one-directional rule). None of them names `par for`
    as an exempt enclosure. `docs/spec_topics/control-flow.md:70` (`par for` is
    an expression reusing the `for` iterand contract), `:74` (CTRL-3 — the
    value is `array<Result<T, QueryError>>`, `T` the body tail type) and `:76`
    (CTRL-4's body restrictions).
  - **The LOCKS this report's fix must leave standing** — bug 0082's 30-cell
    `tests/blockexpr-production.test.ts` (measured 30/30 at HEAD), whose cell
    (i) (`:557`) pins CTRL-4's refusals reaching into a block nested in a
    `par for` body and whose cell (l) (`:770`) pins Option-B reaching a query
    in a block tail; bug 0220's `tests/fn-return-void-query-sink.test.ts`
    (7/7), the `fn`-return sink's disposition; bug 0222's
    `tests/qry4-refused-annotation-withhold.test.ts` (14/14), which owns
    `checkLetMismatch`'s withhold; `tests/query-schema-resolve.test.ts` (34/34),
    the Option-B witness for the four sink positions; and bug 0224's par-for
    cells in `tests/par-for.test.ts` (95/95) — (r3) (`:558`), whose PRIMARY
    subject is that CTRL-4's refusal stays SINGLE, plus (r18) (`:855`) and
    (r20) (`:926`), the two cells that pin a second verdict co-firing beside
    it.
  - **The corpus datum** — exactly one committed fixture spells a `par for`:
    `docs/examples/fan-out-reviews.theta:19–:21`, whose body is
    `review_lens(path)?`, a `.theta` callable call with no query and no local
    `fn` parameter sink. The fix cannot move it; the claim is discharged by
    `tests/committed-fixture-parse-gate.test.ts`, not by a scratch probe.
- **Observed at:** v0.197.0 (`30c0cb67`, `package.json:3`). Offline,
  deterministic, provider-free, zero model turns: one scratch vitest file
  (written, run, deleted) driving the real `parseThetaDocument` and reading
  `QueryExpr.schema` off the returned AST beside the unfiltered
  `doc.diagnostics`. Every value below is that run's output verbatim. No file
  in `src/`, `tests/`, `docs/bugs/README.md` or any other bug document was
  modified by this filing; the one prototype edit of §Fix (d) was reverted and
  proved byte-exact by `git hash-object`.

## Summary

Bug 0082's round-1 walker sweep found four sibling `Expr` walkers whose
`default` arm swallowed the new `"block"` node, and fixed all four. The same
sweep recorded a fifth gap it did not touch, in a walker the same fix edited:
`rewriteExpr` in `src/parser/query-schema-resolve.ts` has no `"par-for"` arm.
That gap is pre-existing, unrelated to the block node, and still present at
HEAD — the arm list ends at `case "block"` (`:433`) and a `ParForExpr` reaches
the `default` (`:440`).

The consequence is total for the subtree, not partial: the node is returned by
identity, so nothing under it is rewritten and nothing under it is checked. Two
things follow.

**QRY-2 inference does not run.** A query at an INDIRECT sink position inside
the body — an array-literal element, a ternary branch, a local `fn`
call-argument, any of them behind a postfix `?`, at any depth including a
nested plain `for` and a nested block expression — keeps `schema: null` where
the plain-`for` spelling of the identical body resolves it to the named schema
(§Reproduction D2–D5, D7, D8). The DIRECT `let x: T = @` spelling is unaffected
(D1): `parseLet` propagates that one before this pass runs.

**QRY-4's check does not run.** `checkLetMismatch` (`:507`) is called from
`rewriteStmt`'s `let` arm, which the body's statements never reach, so
`let o: Owner = @<integer>`who`` draws `theta/parse/explicit-schema-mismatch`
in a plain `for` body and does not draw it in a `par for` body (D6).

The first consequence is masked at HEAD and the second is not. CTRL-4
(`control-flow.md:76`) refuses every `@`-query in a `par for` body with
error-severity `theta/parse/par-query-in-body`, at any depth, so no theta
carrying an unresolved body query registers and no wrong schema reaches a
provider. The masking is CTRL-4's, not this pass's. The withheld warning is
outside it: two other query verdicts at that exact position are pinned to
co-fire beside the refusal — QRY-19's `theta/parse/discarded-query-result`
(`tests/par-for.test.ts:855`) and the ascription's
`theta/parse/unresolved-named-type` (`:926`) — because their checks live in
traversals that descend the construct. QRY-4's lives in the one that does not.

## Reproduction

Offline at `30c0cb67`, zero model turns. Every fixture is a whole prompt-mode
theta (`---\nmode: prompt\n---\n`, three lines) prefixed by
`schema Owner {\n  name: string\n}\n`, so the ranges below are absolute source
lines. Each row runs the SAME inner body twice: once inside
`for i in [1, 2] { … }` (CONTROL) and once inside `par for i in [1, 2] { … }`
(IN-CLASS). `schemas` is every `QueryExpr.schema` on the returned body in
source order; `diags` is the whole unfiltered `doc.diagnostics`. `PQIB` is
`error theta/parse/par-query-in-body`; `MISMATCH` is
`warning theta/parse/explicit-schema-mismatch`.

| row | inner body | CONTROL `schemas` / `diags` | IN-CLASS `schemas` / `diags` |
| --- | --- | --- | --- |
| D1 CONTROL-FOR-THE-CLASS, direct `let` | `let o: Owner = @`who`` | `["Owner"]` / `[]` | `["Owner"]` / PQIB `8:18-8:24` |
| D2 **IN-CLASS**, array-literal sink | `let o: array<Owner> = [@`who`]` | `["Owner"]` / `[]` | `[null]` / PQIB `8:26-8:32` |
| D3 **IN-CLASS**, ternary sink | `let o: Owner = c ? @`a` : @`b`` | `["Owner", "Owner"]` / `[]` | `[null, null]` / PQIB ×2 |
| D4 **IN-CLASS**, call-arg sink | `let s = f(@`who`)`, `f(x: Owner)` declared | `["Owner"]` / `[]` | `[null]` / PQIB `11:13-11:19` |
| D5 **IN-CLASS**, postfix `?` into an array sink | `let o: array<Owner> = [@`who`?]` | `["Owner"]` / `[]` | `[null]` / PQIB `8:26-8:32` |
| D6 **IN-CLASS**, QRY-4 mismatch | `let o: Owner = @<integer>`who`` | `["integer"]` / MISMATCH `8:18-8:33` | `["integer"]` / PQIB `8:18-8:33` |
| D7 **IN-CLASS**, nested plain `for` | `for j in [1] { let o: array<Owner> = [@`w`] }` | `["Owner"]` / `[]` | `[null]` / PQIB `9:28-9:32` |
| D8 **IN-CLASS**, nested block expression | `let o: array<Owner> = { let z = 1` … `[@`w`] }` | `["Owner"]` / `[]` | `[null]` / PQIB `9:3-9:7` |

D1 is the control that locates the fault in this pass rather than in the
parser: the direct `let x: T = @` spelling is propagated by `parseLet` before
`resolveQuerySchemas` runs, so it resolves under both spellings. Every INDIRECT
spelling beside it diverges.

D6 is the only row whose divergence is visible on a channel the author reads.
Verbatim, CONTROL then IN-CLASS:

```
warning theta/parse/explicit-schema-mismatch @ 8:18-8:33
```

```
error theta/parse/par-query-in-body @ 8:18-8:33
```

Two further rows bound the subject:

| row | source under test | schemas / diags |
| --- | --- | --- |
| E1 | `let xs: array<Owner> = par for i in [1, 2] {` … `@`who`` … `}` (body TAIL under an annotated `let`) | `[null]` / PQIB `8:3-8:9` |
| F2 CONTROL | `par for i in [1, 2] max 2 { let z = 1 }` | `[]` / `[]` |

E1 is NOT in class and is recorded so the fix does not overreach: CTRL-3
(`control-flow.md:74`) makes the construct's value `array<Result<T,
QueryError>>` where `T` is the body tail type, so the enclosing annotation is
not a sink for the tail and `null` is the correct disposition (§Fix (b)).

## Expected behaviour

QRY-2's sink positions (`query-forms.md:29–:33`) and its outward walk
(`:39–:44`) are stated over expression context and name no enclosure that is
exempt; `theta/parse/explicit-schema-mismatch`'s registered *Trigger*
(`code-registry-parse.md:84`) is stated over the presence of a binding
annotation and an ascription, and names none either.

On the rows §Reproduction reports as divergent:

- D2, D3, D4, D5, D7 and D8 resolve to `"Owner"` — the same value, from the
  same sink, that the plain-`for` control already produces. The walk is the
  one this pass already implements; only its reach changes.
- D6 draws `theta/parse/explicit-schema-mismatch` at the query's range BESIDE
  `theta/parse/par-query-in-body`, in the shape (r18) and (r20) already pin for
  their codes: two different rules, two different codes, one diagnostic each,
  CTRL-4's refusal still SINGLE.
- D1's disposition is unchanged, and so is F2's and every row's
  `par-query-in-body` count, code and range.
- E1 stays `null`: a `par for` body's tail is not the enclosing binding's sink
  under CTRL-3.

## Actual behaviour / root cause

**One switch, one missing case.** `rewriteExpr`
(`src/parser/query-schema-resolve.ts:323`) handles `query`, `try`, `ternary`,
`array`, `binary`, `member`, `index`, `match`, `call`, `invoke`, `object`,
`result-ctor`, `method-call` and `block` (`:433`). There is no `par-for` case,
so the node reaches the `default` (`:440–:442`) and is returned unchanged — the
arm's own comment lists the leaves, "ident / number / string / bool / null",
and a `par for` is not one.

**The drop is at the node, so it is total.** No deeper mechanism of this pass
runs anywhere under the construct. That is why D7 (a plain `for` nested in the
body) and D8 (a block expression in the body) diverge too: their own arms —
`rewriteStmt`'s `case "for"` (`:163`) and `rewriteExpr`'s `case "block"`
(`:433`), the latter bug 0082's landed addition — are never entered, because
the outer `par for` is never entered.

**Both of the pass's outputs are affected, from the same absence.** The pass
returns a rebuilt body and a diagnostic list. `resolveQuery` (`:477`) writes
the first and `checkLetMismatch` (`:507`) writes the second; the body's
statements reach neither, so the subtree contributes no resolved schema and no
warning.

**The construct arrives at `rewriteExpr` by three routes, and all three drop
it.** `par for` is an expression (`control-flow.md:70`;
`src/parser/theta-document.ts:374`, union member at `:421`), so it reaches this
pass as a `let` initialiser, as an expression statement (`rewriteStmt`'s
`case "expr"`, `:209`) or as a block tail (`rewriteBlock`, `:125`).

**CTRL-4 masks one half and not the other.** `scanParForExpr`'s `query` arm
(`src/parser/theta-document.ts:5127`) refuses every `@`-query in the body at
every depth, and an error-severity parse diagnostic denies registration, so the
unresolved schema of D2–D5, D7 and D8 is never handed to a provider. The
withheld warning of D6 has no such cover: the author's mismatch is real, the
row that judges it is registered, and the position it sits at already carries
other verdicts beside the refusal.

## Why it matters

- **A registered verdict is unreachable inside a whole construct.**
  `theta/parse/explicit-schema-mismatch` (`code-registry-parse.md:84`) cannot
  fire anywhere in a `par for` body, and its *Trigger* states no such
  exemption. An author who removes the query's CTRL-4 fault re-learns the
  mismatch only on the next parse.
- **The diagnostic set is inconsistent with its own neighbours at the same
  position.** (r18) and (r20) pin `discarded-query-result` and
  `unresolved-named-type` co-firing beside `par-query-in-body` because their
  checks descend the construct. QRY-4's is withheld for a reason that is
  mechanical, not adjudicated — an omitted `switch` arm — so nothing in the
  spec or in the registry predicts which query verdicts survive inside a
  `par for` body.
- **The masking is another rule's, and it is load-bearing.** The wrong wire
  shape of D2–D8 is unreachable only because CTRL-4 refuses body queries
  outright. Nothing in this pass records that dependency, and the pass's own
  comments (`:41`'s crossed/stopped commentary and the `block` arm's note at
  `:434–:438`) read as an exhaustive implementation of `query-forms.md:39–:44`.
- **It is the last member of a measured family.** Bug 0082 found five walkers
  that drop a node they should descend and fixed four
  (`scanParForExpr`, `extension-tool-reachability.ts`,
  `subagent-fn-static-checks.ts`, this file's `block` arm); bug 0224 closed the
  identifier walk's `par-for` hole; bug 0118 closed the structural walk's. This
  is the remaining one, in the same file bug 0082 edited.

## Fix

**Route: add the `par-for` arm to `rewriteExpr`, mirroring `rewriteStmt`'s
`case "for"`.** No other route is admitted — the divergence is a reach gap in
one recursion, no diagnostic code is minted, and no registry row is added or
removed.

### (a) `rewriteExpr` gains a `case "par-for"`

The arm rewrites the iterand under a `{ kind: "stop", label: "for-iterand" }`
frame, the `max` operand (when non-null) under its own `stop` frame, and the
body through `rewriteBlock` with an empty tail-frame list — the exact three
components of `rewriteStmt`'s `case "for"` (`:163`), extended by the `max`
operand the statement form does not have. Traversal order is iterand, then
`max`, then body, matching the landed `par-for` arms in the sibling walks
(`scanParForExpr` at `src/parser/theta-document.ts:5137`, and bug 0224's fix
record for `walkIdentExpr`). Constraint: the iterand and `max` sit in the
ENCLOSING scope and the body does not, so the arm passes no enclosing frames
into either position — a `stop` frame is what the plain-`for` iterand already
gets, and §Reproduction F2 pins that both stay `[]` today.

### (b) The body's tail-frame list is EMPTY, and that is a decision

`rewriteBlock(expr.body, [])` — the enclosing sink does not cross the
construct's boundary. CTRL-3 (`control-flow.md:74`) makes the value
`array<Result<T, QueryError>>` where `T` is the body tail type, so an enclosing
`let xs: array<Owner> = par for …` annotation is not a sink for a tail query
and must not become one. §Reproduction E1 is the pin: it stays `[null]` after
the fix, and a cell must assert it, because passing `frames` through (the shape
`case "block"` at `:433` uses, where the block's value IS its tail) is the
plausible wrong reading. There is no plain-`for` control for this row —
`for` is a statement — so the assertion stands on CTRL-3 alone.

### (c) Witness

`tests/par-for.test.ts` owns the rows, beside bug 0118's and bug 0224's (r)
group: D2, D3, D4, D5, D7 and D8 asserting the resolved `QueryExpr.schema` AND
the unchanged single `par-query-in-body` per query; D6 asserting the exact
pass-wide unfiltered `doc.diagnostics` as CTRL-4's refusal followed by the
QRY-4 warning, with the warning's message read from the registry at runtime
(DIAG-4) — `theta/parse/par-query-in-body` has no row under
`docs/spec_topics/diagnostics/`, so only its count is pinnable, as (r18)'s and
(r20)'s comments already record; D1 and F2 as unchanged controls; E1 per (b).
Each row carries its plain-`for` control in the same cell. Red-prove in both
directions: with the new arm neutralised to `return expr;`, every positive cell
reds and every control stays green.

### (d) Blast radius, premeasured

A prototype arm in the §Fix (a) shape was applied at HEAD and the FULL default
suite was run against it: one red, `tests/scratch-0238-stray-close-probe2.test.ts`,
an untracked scratch file belonging to a concurrent session that is red at
baseline too. No tracked test flipped in either direction, so no pinned cell
depends on the current silence — in particular bug 0082's 30 cells, bug 0220's
7, bug 0222's 14, `tests/query-schema-resolve.test.ts`'s 34 and
`tests/par-for.test.ts`'s 95 all stay green unedited. The prototype edit was
reverted and the file proved byte-exact
(`git hash-object` → `3cc5b342faa89eac4ed5d5e6121c2d89a98ebf37` before and
after). The corpus's one committed `par for`
(`docs/examples/fan-out-reviews.theta:19–:21`) carries no query and no local
`fn` call, and stays clean; that claim is discharged by
`tests/committed-fixture-parse-gate.test.ts`.

### (e) No spec or registry edit

`query-forms.md:29–:44` already states the rule this fix implements and names
no exempt enclosure; `theta/parse/explicit-schema-mismatch`
(`code-registry-parse.md:84`) and `theta/parse/par-query-in-body` (`:75`) both
keep their *Trigger*, Sev, Phase and Message byte-unchanged, so DIAG-2 and
DIAG-4 are not engaged and `docs/reference/diagnostics.md` is byte-untouched.
No ordering dependency: nothing blocks this and it blocks nothing.

## Non-goals

- **CTRL-4's refusal of body queries.** `theta/parse/par-query-in-body` keeps
  its trigger, its count and its range on every row; this report adds no
  licence for a query in a `par for` body and removes none. (r3)'s PRIMARY
  subject — the refusal stays SINGLE — is preserved.
- **Whether an unresolved body query could reach a provider.** It cannot at
  HEAD, and §Fix changes nothing about that: the schema half of the divergence
  is repaired behind a refusal that still fires.
- **The `par for` body tail as a sink.** Ruled out by CTRL-3 in §Fix (b), not
  left open.
- **`checkLetMismatch`'s withhold behaviour** — bug
  [0222](./0222-qry4-let-mismatch-reads-refused-annotation.md)'s settled
  posture. The fix changes which statements reach the check, never what the
  check decides.
- **The `fn`-return sink's `void` disposition** — bug
  [0220](./0220-fn-return-void-sink-false-void-diagnostic.md)'s settled
  posture, untouched; a `fn` cannot be declared in a `par for` body
  (`theta/parse/nested-fn`, FN-1), so the two surfaces do not meet.
- **The labelled-frame nicety** on the `block` arm's tail rewrite — bug 0082's
  *Residuals* item 2, a separate subject in the same file.
- **Line-number drift in citations outside the file this fix touches** — bug
  0134's adjudicated do-not-chase class.

## Related

- [0082](./0082-blockexpr-production-unimplemented.md) — **fixed (0.191.0)**,
  the origin. Its round-1 walker sweep produced finding F4, which added this
  file's `case "block"` arm (`:433`), and its fix record's *Residuals* item 1
  records this gap UNFILED: "`rewriteExpr` in
  `src/parser/query-schema-resolve.ts` has no `"par-for"` arm, so an `@`-query
  inside a `par for` body skips Option-B schema resolution. Pre-existing and
  unrelated to the block node; surfaced by the round-1 walker sweep,
  deliberately not touched." Re-measured at HEAD for this filing, not copied:
  the residual records the schema half only; the QRY-4 withhold, the CTRL-4
  masking of the schema half, the six divergent sink positions and the E1
  boundary are measured here for the first time. Its 30-cell witness
  (`tests/blockexpr-production.test.ts`, cells (i) and (l)) is this fix's
  substrate and a lock.
- [0224](./0224-identifier-walk-never-descends-par-for.md) — **fixed
  (0.164.0)**, the same defect class in the identifier walk, and the model for
  the arm's shape and for the blast-radius premeasurement. Its cells in
  `tests/par-for.test.ts` are locks: (r3) (`:558`), (r18) (`:855`) and (r20)
  (`:926`), the last two being this report's evidence that a second query
  verdict is owed beside CTRL-4's refusal.
- [0220](./0220-fn-return-void-sink-false-void-diagnostic.md) — **fixed
  (0.169.0)**, the owner of the `fn`-return sink adapter in this file
  (`rewriteStmt`'s `case "fn"`, `:169`). Its 7-cell
  `tests/fn-return-void-query-sink.test.ts` is a lock; disjoint subject — it
  governs which annotation becomes a sink, this report governs which subtree is
  visited.
- [0222](./0222-qry4-let-mismatch-reads-refused-annotation.md) — **fixed
  (0.166.0)**, the owner of `checkLetMismatch`'s refused-annotation withhold
  (`:507`, and the guard at `:511`). Its 14-cell witness is a lock; the fix
  widens the check's reach without touching its rule.
- [0223](./0223-par-for-body-return-folds-unenumerated.md) — **fixed
  (0.170.0)**, CTRL-4's `return` restriction, cited for the co-firing pattern:
  a body restriction refusal does not withhold neighbouring verdicts.
- [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
  do-not-chase class under which every citation here is symbol-named beside its
  line number and re-verified at HEAD.

## Provenance

- Origin: bug 0082's fix report (`.pi/tmp/fixes/0082-report.md`) *Residuals*
  item 1, which names the gap, scopes it out of that fix, and states "A sibling
  orchestrator or a future triage pass may want this filed."
- Re-verified at HEAD `30c0cb67` for this filing, not copied. Bug 0082's fix
  edited this same file (adding `case "block"` at `:433`), so the first
  measurement taken was whether the arm had since appeared: it has not — the
  `default` arm at `:440–:442` still absorbs a `par-for` node, and
  §Reproduction D2–D8 witness the consequence.
- What the measurement adds to the residual's sentence:
  - **The QRY-4 half.** The residual names the schema resolution only. The same
    absence withholds `theta/parse/explicit-schema-mismatch` (D6), which is the
    one consequence CTRL-4 does not mask and the reason this is filed at S2
    rather than as a latent reach gap.
  - **The CTRL-4 masking, measured rather than assumed.** Every §Reproduction
    row that keeps `schema: null` also carries `theta/parse/par-query-in-body`,
    so the unresolved schema reaches no provider; `scanParForExpr` was read arm
    by arm to confirm the refusal has no escape at any depth.
  - **The extent**: six INDIRECT sink positions diverge (array element, ternary
    branch, local-`fn` call argument, postfix `?`, nested plain `for`, nested
    block expression) and the DIRECT `let x: T = @` spelling does not, because
    `parseLet` propagates it before this pass runs (D1).
  - **The boundary**: E1, the body tail under an annotated `let`, is correct as
    it stands under CTRL-3 and constrains the fix (§Fix (b)).
  - **The lock and corpus inventory**: five witness files green and unedited at
    HEAD (30/30, 7/7, 14/14, 34/34, 95/95), one committed `par for` in the
    corpus with no query in it, and a full-suite prototype run showing zero
    tracked flips.
- Reproduction: one scratch vitest file at `30c0cb67` driving the real
  `parseThetaDocument` over whole prompt-mode sources and printing every
  `QueryExpr.schema` beside the unfiltered `doc.diagnostics`. Run on the outputs
  quoted above, then deleted.

## Fix (0.200.0)

- What shipped:
  - **§Fix (a)/(b) — `src/parser/query-schema-resolve.ts`:** `rewriteExpr` gains
    `case "par-for"` (one 19-line insertion, plus the `ParForExpr` type import).
    It rewrites `iterand` under its own `{ kind: "stop", label: "for-iterand" }`
    frame, `max` (when non-null) under its own `stop` frame, and the body through
    `rewriteBlock` with an EMPTY tail-frame list — the three components of
    `rewriteStmt`'s `case "for"` extended by the `max` operand the statement form
    does not have, in traversal order iterand → `max` → body. The enclosing
    `frames` are DROPPED at the construct's boundary per §Fix (b): under CTRL-3
    (`docs/spec_topics/control-flow.md:74`) the value is
    `array<Result<T, QueryError>>`, so an enclosing annotation never describes
    the body tail. No emitter added, no diagnostic code minted, no registry row
    added or removed; `resolveQuery` and `checkLetMismatch` are reached by the
    widened traversal, unchanged.
  - **§Fix (c) — `tests/par-for.test.ts`:** an additive block of 10 cells
    (s1)–(s10), 377 inserted lines, 0 deletions. (s2)(s3)(s4)(s5)(s7)(s8) assert
    the resolved `QueryExpr.schema` for rows D2, D3, D4, D5, D7, D8 beside the
    unchanged SINGLE `par-query-in-body` per query; (s6) asserts row D6's exact
    pass-wide unfiltered `doc.diagnostics` as CTRL-4's refusal followed by QRY-4's
    warning, with BOTH messages read from the registry at runtime (DIAG-4);
    (s1) and (s10) are rows D1 and F2 as unchanged controls; (s9) pins row E1 per
    §Fix (b). Every row owing a plain-`for` control carries it in the same cell.
  - **Live witness — `tests/live/par-for-body-qry4-mismatch-live-cell-.test.ts`
    (new):** an H8a cell carrying row D6 to the shipped load path, where the
    withheld verdict is actually felt: the subject's `theta-system-note` channel
    must carry BOTH `theta/parse/par-query-in-body` and
    `theta/parse/explicit-schema-mismatch`, both message-pinned from the
    registry. Sibling controls: the plain-`for` spelling registers and warns
    (detector liveness), and a query-free `par for` registers silent
    (§Reproduction F2). Zero model turns.
- Gates:
  - Witness, red before / green after, src neutralised to HEAD byte-exact
    (`git hash-object` = `3cc5b342faa89eac4ed5d5e6121c2d89a98ebf37` =
    `git rev-parse HEAD:src/parser/query-schema-resolve.ts`):
    `tests/par-for.test.ts` `Tests  7 failed | 98 passed (105)` — reds exactly
    (s2)(s3)(s4)(s5)(s7)(s8) on `[null]` / `[null, null]` where `["Owner"]` /
    `["Owner", "Owner"]` is expected, and (s6) on the diagnostics array missing
    `warning theta/parse/explicit-schema-mismatch`; controls (s1)(s9)(s10) green
    unfixed. With the arm restored: `Tests  105 passed (105)`.
  - Full default suite: `Test Files  387 passed (387)` /
    `Tests  8018 passed (8018)`, zero reds. Baseline at HEAD unfixed was
    `387` / `8008`, so the delta is exactly the 10 new cells — ZERO tracked
    flips in either direction, confirming §Fix (d)'s premeasured prototype
    rather than re-deriving it. Bug 0082's 30, bug 0220's 7, bug 0222's 14,
    `tests/query-schema-resolve.test.ts`'s 34 and this file's pre-existing 95
    all green and unedited.
  - `npm run typecheck` (`tsc -p tsconfig.json --noEmit`): clean. `npm run lint`
    (`eslint "src/**/*.ts"`): clean.
  - Live, run for real under the shared lock, both directions: arm neutralised ⇒
    RED on the note-channel assertion itself (`no
    theta/parse/explicit-schema-mismatch note fired beside CTRL-4's refusal…`,
    the observed channel carrying only `par-query-in-body`); arm restored
    (hash `65108f6baf183d646cfe8ca5a18c4dfdd6f83cd2`) ⇒
    `Test Files  1 passed (1)`.
- Review: 2 rounds plus one comment-only polish.
  - Round 1 (deep): `src/` arm ruled CLEAN on fidelity to §Fix (a)/(b) and on
    correctness (no reach outside a `par for` subtree; frames correctly dropped);
    (s1)–(s10) ruled non-vacuous. Three blockers, all in the new test artifacts:
    F1 the live cell asserted CTRL-4's registry row was ABSENT (false — see
    Residual 1) and so shipped red; F2 the same false claim in the new (s)-block
    prose; F3 the new live cell's own line-form citations into
    `query-schema-resolve.ts` were staled by this fix's own insertion. Remedy:
    guard replaced by a registry-read message pin, prose corrected, citations
    converted to symbol form per `docs/STYLE.md` §Citations.
  - Round 2 (fast): CLEAN. One non-blocking house-rule residual — a
    "post-fix disposition" comment narrating history rather than stating a
    property — fixed comment-only; polish verified by gate-diff (no executable
    line touched), confirmation round skipped.
- Verification: VERIFIED. Suite re-run independently 387/8018 zero reds;
  typecheck and lint independently clean; the revert/restore witness cycle
  re-done independently with both hashes quoted, every red matching the doc's
  signature; the live cell run for real. §Fix (e) discharged —
  `git diff docs/reference/diagnostics.md
  docs/spec_topics/diagnostics/code-registry-parse.md` is EMPTY, so both rows
  keep their Trigger, Sev, Phase and Message byte-unchanged and no code is
  minted. §Fix (d)'s corpus claim discharged by
  `tests/committed-fixture-parse-gate.test.ts` (36/36) inside that suite run,
  not by a scratch probe. §Non-goals confirmed: CTRL-4's refusal stays SINGLE
  per query on every row, E1 stays `[null]`, and the body tail is not a sink.
  Verification raised one finding — the subject's offline attribution guard
  preceded the live note-channel assertion, so neutralising the arm reded the
  guard first and the live assertion's own falsifiability was never witnessed.
  Remedied by sequencing that guard last (statement reorder, no assertion
  content changed), after which the neutralised run reds on THE FIXED OBSERVABLE
  itself, quoted above.
- Residuals:
  1. **This document's §Fix (c) is wrong on one point.** It states that
     `theta/parse/par-query-in-body` "has no row under
     `docs/spec_topics/diagnostics/`". The row EXISTS at
     `docs/spec_topics/diagnostics/code-registry-parse.md:75` (Sev `E`, Phase
     `parse`, with a Message), which this document's own §Affected cites
     correctly — the two halves contradict each other and §Affected is the right
     one. Evidence: a real live run reded on a guard built from the §Fix (c)
     claim, and `docs/reference/diagnostics.md:320` records that all four CTRL-4
     `par-*` codes are registered there and mirrored. Consequence taken: the code's
     Message IS a DIAG-4 oracle, and both new test artifacts pin it from the
     registry rather than pinning only its count. §Fix (c)'s sentence is left
     as-filed; this record is the correction.
  2. **The same false claim survives in protected cells.** Bug 0224's (r18)
     (`:855`) and (r20) (`:926`) comments and bug 0118's `registryMessageFor`
     helper comment (`:456`–`:464`) in `tests/par-for.test.ts` repeat it. They
     are comment-only (no assertion depends on it — the file is 105/105 green)
     and belong to other bugs, so they were left byte-unchanged. A sibling pass
     owning 0224/0118 should correct the prose.
  3. **This fix stales line-form citations into the file it edits.** The arm
     inserts 19 lines after old `:439`, so every citation at `>= :440` shifts by
     +19: `0014:35` (`:451`), `0093` (`:518`, `:523`), `0097` (`:523`),
     `0124` (`:470`), `0130` (`:470`, `:478`, `:518`), `0220` (`:450`, `:509`,
     `:544`), `0222` (`:470`). Not chased: those are six other bug documents,
     editing them here is out of scope, and this is precisely bug
     [0134](./0134-params-shift-induced-stale-citations.md)'s adjudicated
     do-not-chase class, which §Non-goals pins by name. Every one of them names
     its symbol beside the line, so each remains resolvable.
  4. **The iterand and `max` positions are newly traversed but only witnessed
     query-free.** Post-fix an annotated `let` inside a `match`-arm block
     expression in the iterand can reach `checkLetMismatch`, exactly as the
     plain-`for` iterand already does through `rewriteStmt`'s `case "for"`. That
     is spec-correct (QRY-4's Trigger names no exempt construct) and parallels
     the control spelling, but only the query-free (s10) exercises those
     positions. Contrived to construct; follow-up cell material.
  5. **One stochastic suite red observed once, not reproducible.**
     `tests/extension-tool-unreachable-load-refusal-e2e.test.ts` ("PIC-64 …")
     failed once with `Test timed out in 5000ms` under machine load and passed
     on every clean re-run, including three independent full-suite runs at
     387/8018 zero reds. Load-timeout class, unrelated to this surface.
- Discharge notes appended: none. No sibling bug document was modified.
- Pinned dispositions / non-goals: CTRL-4's refusal of body queries keeps its
  trigger, count and range on every row — (r3)'s PRIMARY subject, the refusal
  staying SINGLE, is preserved and re-asserted by every new positive cell. The
  `par for` body tail is NOT a sink, ruled out by CTRL-3 in §Fix (b) and pinned
  by (s9), not left open. `checkLetMismatch`'s withhold rule (bug 0222) and the
  `fn`-return `void` disposition (bug 0220) are untouched: this fix changes
  which statements reach a check, never what a check decides. No spec or
  registry edit (§Fix (e)). `src/parser/type-layer-checks.ts` was not touched.
