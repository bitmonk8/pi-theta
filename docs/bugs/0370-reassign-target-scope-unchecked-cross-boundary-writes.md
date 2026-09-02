# Bug 0370 — A reassignment's TARGET is never resolved against the scope model: inside a `fn` body a write to an undeclared name or an immutable parameter parses clean and is silently discarded, a write to a caller-scope `let mut` parses clean and LANDS across the no-closures activation boundary, and through that channel `x += f()` computes a different value than its normative desugar `x = x + f()` (12 vs 3)

- **Status:** open.
- **Sev/Diff estimate:** S1/D2 — S1 twice over: (a) silent no-op writes — an
  author's mutation statement (`a = 3` on a parameter, `z = 10` on a typo'd
  name, `i = 9` on a loop variable) is parse-clean and dropped at runtime with
  zero diagnostics, the exact "author intent dropped" class; (b) silent action
  at a distance — a `fn` body write to a top-level `let mut` lands on the
  caller's binding despite FN-1's no-closures model, and makes the
  compound-assignment desugar rule observably false. D2 because the fix spans
  the parse ident-walk (targets are never walked), the parse mutability check's
  scope model (a flat whole-file map with no fn boundary), the runtime
  `writeBinding` walk (ignores the activation boundary), the discarded
  `WriteResult` at the reassign arm, and the compound arm's operand order —
  but every piece is small and the spec sentences already exist.
- **Kind:** defect cluster at one seam (reassignment-target resolution),
  against three spec rules. `docs/spec_topics/functions.md:20` (FN-1):
  "closures and first-class function values are not part of theta 1.0" — a
  `fn` body's names resolve against the whole-file declarations plus its own
  parameters, which the identifier walk implements for READS
  (`theta-document.ts:6188-6196`: "A `fn` body is closure-free") but no layer
  implements for write targets. `docs/spec_topics/bindings.md:29`
  (§"Immutable contexts"): function parameters and `for` iteration variables
  are always immutable — yet reassigning them draws nothing where the
  identical write to an immutable top-level `let` draws
  `theta/parse/immutable-rebinding` (heading at `:29`; the two list items
  are `:31` — function parameters — and `:32` — `for` iteration
  variables). `docs/spec_topics/bindings.md:14`
  (`#compound-assignment-desugar`): "`x <op>= e` computes the same as
  `x = x <op> e`" — falsified by the reachable mutating-RHS case.
- **Related:**
  - [0115](./0115-reassignment-type-compat-unchecked-no-registry-row.md)
    (fixed 0.138.0) / 0341 (fixed 0.309.0) — the reassign RHS-vs-target
    TYPE checks; neither touches target *resolution* (scope membership,
    boundary, unknown-ness). 0115 §Residuals 3 measures exactly facet (a)'s
    shapes — `for x in [1,2] { x = "b" }` and `fn g(s: integer) { s = "a" }`
    drawing no `immutable-rebinding` (witness cells f2/f3 pin the silence)
    — and its §Pinned dispositions leave "a runtime check at
    `writeBinding`" and the two non-firing shapes out of scope: facet (a)
    is a recorded-but-unowned gap, deferred to
    [0126](./0126-plain-for-binds-no-loop-variable.md) §Fix witness
    row e2, which likewise never owned it.
  - 0016 (fixed 0.22.0) — established the runtime/parse scope-model parity
    obligation across the fn activation boundary for CALL sites
    (`localShadowsCallable` stops at `fnActivationBoundary`); `writeBinding`,
    the write-side walk in the same class, has no such stop.
  - 0314 (fixed 0.293.0) — defined the compound desugar this report's facet
    (d) falsifies, and noted (§Non-goals) the discarded `writeBinding`
    `WriteResult` as "unreachable while the parse gate holds" — rows
    G7/G10/G11 prove it reachable (input classes for which no parse gate
    exists), so that non-goal is legitimately reopened and the discard is
    load-bearing after all.
  - [0303](./0303-imported-fn-body-resolves-in-caller-scope.md) (fixed
    0.291.0) — threaded `moduleEnv` for imported lib fns only; same-file
    fns keep bug 0016's `childFnActivation` boundary (which 0303 records
    as "an activation boundary over locals only"). `writeBinding` never
    consults that boundary — a distinct mechanism from 0303's.
- **Affected** (verified at af476df2, v0.347.0):
  - `src/parser/theta-document.ts:6162-6164` — `walkIdentStmt`'s
    `case "reassign"`: walks `s.value` only; the TARGET identifier is never
    checked against the scope, in any scope. (The fn-body arm at `:6188-6196`
    builds the closure-free scope for reads; targets never consult it.)
  - `src/parser/theta-document.ts:2428-2446` — `buildReassign`: the one
    target-side check, `this.bindings.get(target) === false` →
    `immutable-rebinding`. `this.bindings` is a flat, file-linear map with no
    fn/loop scoping, so (i) an undeclared target is `undefined` → silent
    ("undeclared targets are another leaf's binding-resolution concern" — no
    leaf owns it), (ii) a top-level `let mut` resolves as writable INSIDE a fn
    body, (iii) parameters and `for` variables are absent from the map →
    writes to them are silent.
  - `src/runtime/lexical-environment.ts:501-513` — `writeBinding`: walks the
    full parent chain with no `fnActivationBoundary` stop (contrast
    `localShadowsCallable` at `:609-625`, which stops), so a fn-body write
    finds and mutates the caller's slot; a rejected/unknown write returns
    `{ accepted: false }`.
  - `src/runtime/statement-executor.ts:1752-1760` — the reassign arm: (i)
    discards `writeBinding`'s `WriteResult`, so every rejected write is a
    silent no-op; (ii) for compound ops evaluates the RHS FIRST
    (`await evalExpr(stmt.value…)` at `:1753`) and reads the target SECOND
    (`env.resolve(stmt.target).value` at `:1758`) — the reverse of the
    desugar's left-to-right order (`evalBinary` reads the left operand before
    the right, `:1028-1031`).
- **Observed at:** 0.347.0 (af476df2), offline — production executor harness
  (`parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`).

## Summary

No layer resolves a reassignment's target against the scope model. The parse
identifier walk — which enforces the closure-free fn-body scope for every
READ — skips targets entirely; the only target-side parse check is a
mutability lookup in a flat whole-file map. Four reachable consequences, all
probed:

(a) **Silent no-op writes.** `fn f(a) { a = 3` / `a }` parses clean, the
runtime write is rejected on the parameter's immutable slot, the `WriteResult`
is discarded, and `f(1)` returns `1` — the author's mutation vanished. Same
for a `for` variable (`i = 9`) and for a name declared NOWHERE
(`fn f() { z = 10 … }` — where the top-level spelling of the same undeclared
write is caught, if at all, only by a coincidental later READ of the name).

(b) **Cross-boundary writes land.** `let mut x = 0` / `fn f() { x = 10 … }`
parses clean (the flat map sees a writable `x`) and the runtime walk crosses
the activation boundary and mutates the top-level binding — lexical capture
the spec's no-closures model excludes, and the exact walk the 0016 fix stopped
for call-site shadowing one method over.

(c) **Read/write asymmetry.** The same fn body that may WRITE `x` may not
READ it: `fn f() { count = count + 1 }` is refused
(`theta/parse/unknown-identifier` on the RHS read) while
`fn f() { count = 10 }` is admitted — one binding, one body, two scope models.

(d) **The compound desugar is observably false.** Through channel (b), an RHS
can mutate the target mid-statement: with `fn f() { x = 10` / `2 }`,
`x += f()` yields **12** (RHS evaluated first: f() writes 10, returns 2; the
target is read after → 10 + 2) while the normative equivalent `x = x + f()`
yields **3** (left operand `x` read first → 1; then f(); 1 + 2, overwriting
the 10). bindings.md's "computes the same as" does not hold.

## Reproduction

Offline, deterministic; sources prefixed `---\nmode: prompt\n---\n`, driven
through `executeBody` on the production prompt-mode binding.

| # | Source (body) | Parse | Runtime |
|---|---|---|---|
| G10 | `fn f(a) { a = 3` / `a }` / `f(1)` | `[]` | `value=1` — the write silently no-ops |
| G11 | `for i in [1, 2] { i = 9 }` / `null` | `[]` | success — loop-variable write silently no-ops |
| G7 | `fn f() { z = 10` / `2 }` / `f()` | `[]` | `value=2` — undeclared-target write silently discarded |
| G2 | `let mut count = 0` / `fn bump() { count = count + 1` / `null }` / … | `["theta/parse/unknown-identifier"]` (the READ) | — |
| G9 | `let mut x = 1` / `fn f() { x += 5` / `2 }` / `f()` / `x` | `[]` | `value=6` — the write LANDED on the top-level binding |
| G6 | `let x = 1` / `fn f() { x = 10` / `2 }` / … | `["theta/parse/immutable-rebinding"]` | — (proves the flat map resolves outer bindings inside fn bodies) |
| G3 | `let mut x = 1` / `fn f() { x = 10` / `2 }` / `x += f()` / `x` | `[]` | `value=12` |
| G4 | same fn / `x = x + f()` / `x` | `[]` | `value=3` — **12 ≠ 3**, the desugar diverges |
| G8 (control) | `let x = 1` / `x = 2` | `["theta/parse/immutable-rebinding"]` | — |

## Expected behaviour

- functions.md:20 / the ident walk's own fn-scope model: a `fn` body's write
  target resolves against whole-file declarations + parameters, exactly as
  reads do — G9/G3's writes are refused at parse (the name is not in the
  body's scope), G7's undeclared target likewise (bindings.md:6's
  `theta/parse/immutable-rebinding` sibling for rebinding covers declared
  names; an undeclared target has no conforming disposition other than a
  refusal — top-level, the identical statement is already effectively refused
  through the read walk whenever the name is read).
- bindings.md:29–32: parameters (`:31`), `for` variables (`:32`), and
  `match` bindings are immutable contexts — reassigning one draws `theta/parse/immutable-rebinding`
  as an immutable `let` does (G8), not a silent runtime discard (G10/G11).
- bindings.md:14: `x += e` computes as `x = x + e` — same operand order, same
  result, for every reachable `e`.
- At runtime, a write the scope layer rejects must not be silently dropped:
  per the 0314-family belt discipline, a rejected `WriteResult` reaching the
  reassign arm after the parse gates hold is a loud defect.

## Actual behaviour / root cause

Target resolution was never wired: `walkIdentStmt` walks reassign VALUES only,
and `buildReassign`'s mutability lookup consults a scope-less file map that
happens to contain top-level `let`s (hence G6 fires and G9 passes) but not
parameters or loop variables (hence G10/G11 silent) or undeclared names
(hence G7 silent). At runtime `writeBinding` predates the 0016
activation-boundary discipline and walks through it, so the statically-admitted
cross-boundary write lands; the reassign arm discards the `WriteResult`, so
the statically-admitted writes to immutable slots vanish. The compound arm's
RHS-before-target order is unobservable until channel (b) makes a
target-mutating RHS reachable — G3/G4 then witness the divergence.

## Why it matters

(a) is the highest-frequency shape: reassigning a parameter or loop variable
is idiomatic in every neighbouring language, parses clean here, and the
program silently computes with the unmutated value — dropped intent with a
plausible result. (b) is silent shared mutable state through what the spec
defines as an isolation boundary — the same hazard class `par-shared-mutation`
exists to prevent one construct over, and it also breaks the runtime/parse
scope parity the 0016 fix established as an obligation. (d) makes a normative
sentence false and the two spellings of one statement diverge by an
untraceable amount. Impact class 1.

## Non-goals

- The RHS type checks (0115/0341) — orthogonal and unchanged.
- `match` pattern bindings — bindings.md lists them as immutable contexts, but
  a reassign inside an arm body requires the block-expression form; not probed
  here and expected to share facet (a)'s mechanism; the fix's scope walk
  should cover them by construction.
- Whether a lib `fn` can write an importer's binding — `moduleEnv` roots make
  the walk land in the declaring module; not probed; the boundary fix covers
  it structurally.

## Fix

Layered, all small:

1. **Parse:** walk the reassign TARGET in `walkIdentStmt` under the same
   scope sets reads use (fn bodies get the closure-free scope), refusing an
   out-of-scope or undeclared target (`theta/parse/unknown-identifier`, or a
   dedicated row if DIAG-2 prefers); record parameters and `for`/pattern
   variables in the mutability map so `buildReassign` draws
   `immutable-rebinding` for G10/G11 exactly as for G8.
2. **Runtime belt:** honour `fnActivationBoundary` in `writeBinding` (mirror
   `localShadowsCallable`'s stop), and stop discarding the `WriteResult` at
   `statement-executor.ts:1759` — a rejected write after the gates hold throws
   a loud defect routed to `theta/runtime/internal-error` (the 0314 pattern).
3. **Order:** read the compound target before evaluating the RHS at
   `statement-executor.ts:1753-1758` (matching `evalBinary`'s left-then-right
   at `:1028-1031`),
   so the desugar holds even if any future channel reintroduces a mutating
   RHS.

Constraints: same-scope writes (`let mut` + later `x = …` / `x += …` in the
same or nested non-fn block) stay byte-identical; G6/G8's existing refusals
unchanged; bug 0303's `moduleEnv` threading unaffected (the boundary stop must
not break a lib fn writing its OWN module-level… — no such form exists;
lib bodies hold only declarations, so the stop is safe).

## Provenance

Found by asking where a reassign target is resolved during the runtime-exec-2
re-sweep at af476df2: `walkIdentStmt`'s reassign arm walks only the value, and
the executor's `writeBinding` walk has no boundary stop where the 0016 call
walk does. All nine rows probed offline through the production executor
harness before filing; the G3/G4 pair verified in both directions (compound vs
spelled) in one run. Scratch probes deleted.
