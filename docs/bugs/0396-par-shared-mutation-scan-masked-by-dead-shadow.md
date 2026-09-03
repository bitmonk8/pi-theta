# Bug 0396 — The CTRL-4 `par-shared-mutation` scan's `bodyLocals` set leaks out of nested `if`/`while`/`for` blocks, so a dead block-scoped `let mut x` masks the refusal for every later body statement: `par for i in [1,2] { if true { let mut x = 9 } x = 5 }` loads clean and the write LANDS on the outer `let mut x` from concurrent workers — the block-EXPRESSION arm copies the set precisely to prevent this

- **Status:** open.
- **Kind:** defect against CTRL-4. `docs/spec_topics/control-flow.md:76`
  (CTRL-4): "assignment to a `let mut` declared outside the body is
  `theta/parse/par-shared-mutation`." The masked spelling assigns to exactly
  such a binding, draws nothing, and the runtime write crosses the iteration
  boundary onto the shared outer slot under concurrent scheduling — the
  hazard the code exists to refuse.
- **Related:**
  - 0370 (fixed 0.370.0) — the reassign-target scope model. Its `writeBinding`
    boundary stop is `fnActivationBoundary` only; a `par for` iteration scope
    is a plain `child()`/`bindIterationVariable` env with no boundary, so the
    statically-admitted write lands (the mechanism its facet (b) closed for
    `fn` bodies, open here for `par for` bodies). Its residual 2 records the
    FLAT mutability map's dead-shadow leak — a different map (this report's
    subject is the CTRL-4 scan's own `bodyLocals` set), same failure grammar:
    dead block-scoped `let`s leaking scope facts.
  - [0082](./0082-blockexpr-production-unimplemented.md) (fixed 0.191.0) —
    ORIGIN of the asymmetry: its §Fix added the block-EXPRESSION arm to
    `scanParForExpr` "with a copied `bodyLocals` set mirroring the runtime
    child scope" — the copy exists only in that arm because that fix minted
    it there and never revisited the pre-existing statement-block arms.
  - 0224 (fixed 0.164.0) / 0240 (fixed 0.200.0) — the corpus's prior
    `par for` walk-coverage defects (identifier walk / schema-resolve pass
    never descending); this is the shared-mutation scan's own coverage seam.
  - 0223 (fixed 0.170.0) — CTRL-4's `return` restriction; establishes the
    per-statement scan as the enforcement surface this report measures.
- **Affected** (verified at d63c5148, v0.382.0):
  - `src/parser/theta-document.ts:5667-5674` — `scanParForStmt`'s `let` arm:
    `bodyLocals.add(s.name)` unconditionally — no record of which BLOCK the
    `let` belongs to, and nothing ever removes it.
  - `src/parser/theta-document.ts:5702-5711` (`if` arm: `scanParForBlock(s.then,
    …, bodyLocals, …)` and the `otherwise` legs), `:5715` (`while`), `:5719`
    (`for`) — nested statement blocks are scanned with the SAME mutable
    `bodyLocals` set, so their `let`s persist into sibling statements after
    the block ends.
  - `src/parser/theta-document.ts:5775-5781` — the block-EXPRESSION arm passes
    `new Set(bodyLocals)` with the comment naming the exact hazard: "Its
    `let`s bind in a child scope … so a COPY of `bodyLocals` keeps them from
    masking a sibling's shared-mutation refusal." The statement-block arms
    lack the copy.
  - `src/parser/theta-document.ts:5675-5686` — the reassign arm's predicate
    `outerMutables.has(s.target) && !bodyLocals.has(s.target)`: the leaked
    name defeats the second conjunct.
  - `src/runtime/statement-executor.ts:1662` (`runParForIteration`:
    `env.bindIterationVariable(…)` — a plain child scope) and
    `src/runtime/lexical-environment.ts` `writeBinding` (stops only at
    `fnActivationBoundary`, bug 0370) — the admitted write walks out of the
    iteration scope and mutates the top-level slot; `:2086` (`executeIf` runs
    the then-block in `env.child()`) is why the shadowing `let mut` is dead by
    the time the write executes.
- **Observed at:** 0.382.0 (d63c5148), offline — production executor harness
  (`parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`).

## Summary

The CTRL-4 shared-mutation scan tracks body-local declarations in one mutable
set threaded through the whole body walk. Block expressions get a copied set —
the comment on that arm states it is precisely to keep a child block's `let`s
"from masking a sibling's shared-mutation refusal" — but the `if`/`while`/`for`
statement arms pass the original set, so a `let mut x` declared inside any
nested statement block stays in `bodyLocals` after the block closes. Every
subsequent write to the outer `let mut x` anywhere in the body is then treated
as a write to a body-local and admitted. At runtime the shadow is genuinely
block-scoped (the executor runs nested blocks in child envs), so the admitted
write resolves the OUTER binding and lands on it — from up to 64 concurrent
workers. Zero diagnostics at parse, none at runtime; after the loop the outer
binding holds the written value.

## Reproduction

Offline, deterministic; sources prefixed `---\nmode: prompt\n---\n`, driven
through `executeBody` on the production prompt-mode binding.

| # | Source (body) | Parse | Runtime |
|---|---|---|---|
| E1 | `let mut x = 0` / `par for i in [1, 2] { if true { let mut x = 9 }` / `x = 5 }` / `x` | `[]` | `outcome=success value=5` — the body write LANDED on the outer binding |
| E3 | `let mut x = 0` / `par for i in [1, 2] { for j in [1] { let mut x = 9 }` / `x = 5 }` / `x` | `[]` | `value=5` — same mask via a nested plain-`for` block |
| E2 (control) | `let mut x = 0` / `par for i in [1, 2] { x = 5 }` / `x` | `["theta/parse/par-shared-mutation"]` | — |
| E4 (control) | `let mut x = 0` / `par for i in [1, 2] { x = 5` / `if true { let mut x = 9 } }` / `x` | `["theta/parse/par-shared-mutation"]` | — (write BEFORE the shadow: the leak is strictly file-linear) |
| E5 | `let mut x = 0` / `par for i in [1, 2] { while false { let mut x = 9 }` / `x = 5 }` / `x` | `[]` | `value=5` — a nested `while` block masks identically |
| E6 (control) | `let mut x = 0` / `par for i in [1, 2] { let d = { let mut x = 9` / `1 }` / `x = 5 }` / `x` | `["theta/parse/par-shared-mutation"]` | — a `let`-initialiser BLOCK EXPRESSION with the same dead shadow still refuses: the copied set in that one arm is the whole difference |

E4 shows the admit is not a deliberate whole-body shadowing rule: the same
body with the statements swapped is refused, so the disposition of one
statement depends on where a DEAD sibling block sits relative to it.

## Expected behaviour

- control-flow.md:76 (CTRL-4): the E1/E3 writes assign to a `let mut` declared
  outside the body — `theta/parse/par-shared-mutation`, as E2/E4 draw. A
  block-scoped `let` that is out of scope at the write site cannot make the
  write body-local under any scoping reading (the runtime itself proves the
  point by landing the write on the outer binding).
- Failing the parse gate, no layer may let a `par for` body write an outer
  binding silently: outer bindings are "readable" and writes are refused
  (CTRL-4's exact split) — under concurrent workers a landed write is a data
  race on the theta's own state.

## Actual behaviour / root cause

`bodyLocals` is a scope-less accumulator over the body's statement tree. The
block-expression arm's copy (`:5780`) shows the masking hazard was understood;
the three statement-block arms were left sharing the set — presumably because
their `let`s "look like" body statements — but the executor gives those blocks
child scopes (`executeIf` → `env.child()`, `executeFor`/`executeWhile`
likewise), so the parse-side set and the runtime scope model disagree, and the
disagreement admits exactly the writes CTRL-4 refuses. At runtime nothing
re-checks: `writeBinding`'s only boundary is `fnActivationBoundary` (bug
0370), which a `par for` iteration scope does not carry, so the walk exits the
iteration and mutates the shared slot. Workers observe and race on it
(unobservable in the two-element probe, but the landed final value proves the
cross-boundary write; with per-iteration values the interleaving is
scheduler-dependent).

## Why it matters

Silent shared mutable state across concurrently-scheduled iterations is the
hazard class CTRL-4 exists to exclude — the same isolation contract
`par-query-in-body` and `par-return-in-body` protect. An accumulator idiom
(`let mut total = 0` + a nested scratch block that happens to redeclare the
name) compiles clean and produces a racy, last-writer-wins value that varies
with worker scheduling; nothing on any channel distinguishes it from a correct
sequential reduction. Impact class 1 (silent author-visible corruption) with a
concurrency-nondeterminism multiplier (class 3).

## Non-goals

- The flat `this.bindings` mutability map's own dead-shadow leaks — bug 0370
  residual 2's recorded follow-up (a different map; its false-refusal
  direction is pinned there).
- A runtime write-boundary for `par for` iteration scopes (a
  `writeBinding` stop at the iteration env) — a defensible belt-layer
  hardening, listed under §Fix as the belt option, but the primary defect is
  the scan.
- The loop VARIABLE's shadowing of an outer `let mut` — handled correctly
  (`:5651-5658`, bug 0370 F1: writes to it draw `immutable-rebinding`).

## Fix

1. **Parse (primary):** scope the set — pass `new Set(bodyLocals)` into the
   nested statement-block recursions (`if` then/else, `while`, `for`) exactly
   as the block-expression arm already does. Three call sites, one line each.
   A body-level `let` before the write (the genuinely-shadowing case) still
   masks correctly because it lands in the shared set at body depth.
2. **Runtime belt (per the 0332/0338/0369/0370 discipline):** mark the
   `par for` iteration scope as a write boundary (a `parIterationBoundary`
   stop in `writeBinding`, mirroring the 0370 `fnActivationBoundary` stop) so
   any future parse-side miss surfaces as the loud `RejectedWriteDefectError`
   instead of a landed racy write. Reads must keep crossing (outer bindings
   are readable by CTRL-4).

Constraints: E2/E4's refusals byte-identical; genuine body-locals (a body-level
`let mut` written later in the body) stay admitted; plain `for`/`while` bodies
outside `par for` are unaffected (their outer writes are legal and must keep
landing).

## Provenance

Found by reading `scanParForBlock`'s set threading against the
block-expression arm's own copy-comment during the runtime-belts-3 sweep at
d63c5148, then confirming the runtime landing through the 0370-fixed
`writeBinding` walk (no boundary at iteration scopes). All four rows probed
offline through the production executor harness before filing. Scratch probes
deleted.
