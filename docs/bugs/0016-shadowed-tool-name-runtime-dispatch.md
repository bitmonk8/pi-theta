# Bug 0016 — A call to a lexically shadowed Pi-tool name dispatches the tool at runtime; the object-literal form executes it silently

- **Status:** fixed (0.22.0). Option 1 adopted — a call whose callee is
  lexically shadowed by a local that collides with a callable-set name is
  rejected at parse (`theta/parse/shadowed-callable-call`), the bare-object
  carve-out is lexical per §Object construction, and both runtime lowerings
  defect-throw (`ShadowedCalleeDispatchDefectError`) instead of dispatching
  a shadowed callee.
- **Kind:** defect — parse-time call resolution is lexical (per
  expressions.md §Identifier resolution), runtime call classification is
  callable-set-membership only. A parse-clean call site whose callee the spec
  resolves to a local binding executes the Pi tool with real arguments
  (object-literal and zero-argument forms) or crashes on the
  `theta/runtime/internal-error` surface (all other argument forms). Bug 0003's
  fixed doc recorded only the crashing half as a residual and called it
  "fail-loud"; the silently-executing half was not recorded.
- **Affected:** the two resolution layers —
  parse: `src/parser/theta-document.ts` (`checkPiToolArgShapes` lexical skip,
  :4195–4438, the shadowed-callee test `!shadows.has(e.callee)` at :4351; the
  callee-blind bare-object carve-out in `walkExpr` `case "call"`, :4865–4877);
  runtime dispatch — two sibling executor sites of the same shape:
  `src/runtime/statement-executor.ts` `evalExpr` call routing (:597–608) and
  `evalAsResult`, the `?`/`match`-operand path every postfix-`?` call takes
  (:922; gate :935, `checkpointFor` :963, `preEvaluateToolArgs` :972) — both
  via `resolveUserFn` (:352) → `src/runtime/effectful-statement-host.ts`
  `checkpointFor` (`case "call"` → `tool-call`, :453) →
  `src/extension/production-theta-producer.ts` `#classifyCall` (:2539) /
  `#resolveToolCall` (:2556). `src/runtime/lexical-environment.ts` `resolve`
  (:336) implements the spec's four-arm precedence correctly but is never
  consulted for call classification.
- **Observed at:** `0.20.0` (30492948), Windows.

## Fix (0.22.0)

Option 1, adopted at all three layers the Options section names.

**Parse (primary).** The bug-0003 shape walk (`checkPiToolArgShapes`) is
generalised into a single lexical call-site walk — `checkLexicalCallSites` /
`walkCallSite*` in `src/parser/theta-document.ts` — that resolves every
callee once per expressions.md §Identifier resolution and emits three codes
from that one judgement: (1) the new registered
`theta/parse/shadowed-callable-call` (error; range on the call node; message
names the shadowing binder kind and its line plus the collided callable) for
any call whose callee is an arm-1 local — `let`, `fn` parameter, `for` /
`par for` variable, `match`-arm binding, or `params:` field — colliding with
a callable-set entry, covering both callable kinds (bare Pi-tool names and
post-rename `.theta`-callable names); (2) the bug-0003 shape code, unchanged
for unshadowed callees; (3) `theta/parse/bare-object-literal` for a sole
bare-object argument whose callee is not an unshadowed Pi tool — the
§Object construction carve-out made lexical (the structural walk keeps
suppressing in sole-call-argument position; the lexical walk owns the
callee-sensitive emission; a shared builder guarantees byte-identity, so the
two walks partition by position and never double-emit). Two refinements the
spec forces: whole-file `fn`/import shadowers do NOT emit the new code (they
win resolution on arms 2/3 — a legal user-`fn` call; the `tools:` collision
is separately load-rejected), and `schema`/`enum` names no longer suppress
the shape check or the carve-out (they are not resolution arms; no legal
call-position use exists). Binding the shadowing name without calling it
stays legal, preserving the §Identifier resolution shadowing sentence.

**Runtime belt (mirroring 0003's structure).** Both lowerings —
`preEvaluateToolArgs` (`src/runtime/statement-executor.ts`, the seam shared
by the `evalExpr` call arm and the `?`/`match`-operand `evalAsResult` path)
and `lowerToolCallParams` (`src/extension/production-theta-producer.ts`) —
throw a new `ShadowedCalleeDispatchDefectError` (`src/runtime/tool-call.ts`,
`theta/runtime/internal-error` surface) ahead of dispatch, before the
theta-callable skip and the zero-arg lowering, when
`LexicalEnvironment.localShadowsCallable` answers that the callee is a
callable-set name shadowed by a local. The resolution is
fn-activation-bounded (`childFnActivation`) so the no-closures model holds —
a caller-frame `let` cannot leak into an `fn` body — while `params:`-field
shadows stay visible inside plain `fn` bodies via a root-frame marker
(`defineParamsFieldLocal`, populated by `buildBoundEnvironment`, which now
also threads the presented callable names into the environment's arm-4
registry). `PiToolArgShapeDefectError`'s message and contract are
reconciled: the shadowed-callee cause is unreachable (this guard precedes
the shape test in both lowerings), so the 0003 defect now names only a
genuine gate gap. Known residual, recorded at the guard: a `params:`-field
shadow inside a `subagent fn` body is gate-only covered — the isolated
scope genuinely carries no `params:` locals, so a belt throw there would
assert a gap the runtime scope model does not support.

**Spec.** The registry row for `theta/parse/shadowed-callable-call` is added
to `docs/spec_topics/diagnostics/code-registry-parse.md` (trigger, hint,
message template — closing the gap §Expected behaviour records), the rule is
recorded in expressions.md §Identifier resolution, and
`docs/reference/diagnostics.md` transcribes the new row.

**Tests.** `tests/shadowed-callable-call.test.ts`: the full §Reproduction
matrix at both layers and both dispatch sites (12 red at 1d24bca6, written
first), extended through review to 29 green cells — all six binder kinds,
both callable kinds, both dispatch sites, the three argument forms, the
carve-out tightening (`f({…})` on a user `fn`), the schema/enum
tightening pins, the misattribution pin (the crashing arm rejects with the
new defect, not `PiToolArgShapeDefectError`), and controls pinning what must
keep working (unshadowed 0003 behaviour, binding-without-call, fn-decl
shadowers, the no-closures boundary from both sides, `R-params` belt
coverage). Bug-0003's residual record ("lands on the defect throw —
fail-loud") is corrected by this report and fully closed by this fix.

**Verification.** Full default suite 211 files / 2414 tests green; typecheck
and lint clean; three review rounds (7 findings → 2 comment-only → clean);
live e2e: the RFC 0002 computed-tool-args hardening drive (real extension
discovery → live `AgentSession` → production `read` dispatch through the
guarded lowerings) reads its planted sentinel — unshadowed dispatch through
the real stack intact.

## Summary

expressions.md §Identifier resolution defines call-position resolution:
"A bare identifier in call position (`name(args)`) resolves in this order,
first match wins: 1. A local `let` binding or function parameter currently in
scope. … 4. A name registered in the theta's callable set." and "Local bindings
(1) shadow everything else lexically, the same as in Rust or TypeScript."
Shadowing a tool name with a local is legal — only cross-collisions among arms
(2)–(4) are load-rejected (`theta/load/tool-name-collision`).

The parse layer honours this: the bug-0003 shape walk (`checkPiToolArgShapes`)
skips call sites whose callee is lexically shadowed, and the unknown-identifier
walk accepts them. The runtime does not: call classification never consults the
lexical environment, so every `read(...)` call dispatches against the callable
set regardless of an in-scope local named `read`. The two layers disagree about
which callee a parse-clean program has, and the runtime executes the arm the
spec ranks last.

## Reproduction

Mechanical, via the production binding harness (the
`tests/tool-arg-shape-enforcement.test.ts` producer-level pattern:
`parseThetaDocument` on real fenced source → `createProductionProducerDeps` →
`bindPromptConversation` with a recording `pi-tool` snapshot entry for `read` →
`executeBody(parsed.body, binding.executeDeps)`). All sources carry frontmatter
`mode: prompt` / `tools: [read]`.

| Cell | Source (body) | Parse diagnostics | Runtime |
|---|---|---|---|
| P1/R1 | `let read = "x"` · `let r = read({ path: "p" })?` · `r` | **none** | **tool `read` executes** with `{ path: "p" }`; outcome success |
| P2/R2 | `let read = "x"` · `let r = read("y")?` · `r` | **none** | throws `PiToolArgShapeDefectError` (→ `theta/runtime/internal-error`); tool not executed |
| P3/R3 | `fn f(read: string) { read({ path: "p" })? }` · `let r = f("v")` · `r` | **none** | **tool `read` executes** with `{ path: "p" }`; the param value is ignored |
| P6/R6 | `let read = "x"` · `let r = read()?` · `r` | **none** | **tool `read` executes** with `{}` |
| P4 (control) | `let r = read("y")?` (unshadowed) | `theta/parse/tool-arg-not-object-literal` | — |
| P5/R5 (control) | `let r = read({ path: "p" })?` (unshadowed) | none | tool executes with `{ path: "p" }` (correct) |

`for`/`par for` variables and `match`-arm bindings shadow through the same
mechanism (`defineLocal` into a child scope; the parse walks treat them
identically), so they sit in the same class as R1–R3; not separately executed.

## Expected behaviour (what the spec says)

- **Resolution precedence is defined, and it is lexical-first.**
  expressions.md §Identifier resolution (quoted above) is explicitly about
  call position and ranks the callable set last. At every shadowed cell the
  callee denotes the local binding, not the tool. There is no spec text making
  runtime dispatch callable-set-first; the precedence is not a gap.
- **The object-literal form should not even parse.** expressions.md §Object
  construction: "The exception applies only when the callee is a Pi tool —
  `f({ ... })` for a `let`-bound name or a `.theta` callable remains
  `theta/parse/bare-object-literal`." Under the spec's own resolution, R1/R3's
  callee is a let-bound name / parameter, so the bare `{ path: "p" }` argument
  is outside the carve-out and should be rejected at parse.
- **Spec gap (recorded honestly):** no page defines what a call whose callee
  resolves to a non-callable local *does*. Functions are not first-class
  (`theta/parse/function-as-value`, grammar.md §`fn` declarations), so a local
  can never hold a callable and every such call is erroneous — but no
  diagnostic is registered for it (`theta/parse/unknown-identifier` requires
  *no* match; here the local matches). The shadowed zero-arg and non-object-arg
  forms therefore have no spec-defined surface. Fixing this bug requires
  closing that gap; see Options.

## Actual behaviour

- Parse: all shadowed cells produce zero diagnostics. Two independent
  causes: (a) the shape walk deliberately skips shadowed callees (correct
  under its "never misfire on a local" model); (b) the bare-object-literal
  carve-out is callee-blind — `walkExpr` suppresses the check for the sole
  bare-object argument of *any* call, tool or not, shadowed or not
  (`theta-document.ts` :4865–4877), which is laxer than the §Object
  construction rule and is what admits R1/R3.
- Runtime: both dispatch sites (`evalExpr` for a bare call, `evalAsResult` for
  the `?`/`match`-wrapped form) route the callee through `resolveUserFn`, which
  accepts only arms `"fn"`/`"import"`; an arm-`"local"` resolution falls
  through as if the name were unbound. The call is then unconditionally
  classified a checkpointed tool-call effect (`checkpointFor` `case "call"`),
  classified `pi-tool` by
  callable-set membership alone (`#classifyCall`:
  `thetaCalleePath(...) !== undefined ? "theta-callable" : "pi-tool"`), and
  resolved by name against the frozen snapshot (`#resolveToolCall`). The
  environment's spec-conformant four-arm `resolve` — whose local-shadows-callable
  precedence is pinned by `tests/lexical-environment.test.ts` (cka-3) — is never
  asked.
- The argument shape then selects the failure mode: an object-literal first
  argument pre-evaluates and **dispatches the tool**; a missing argument lowers
  to `{}` and **dispatches the tool**; any other node kind hits the bug-0003
  belt (`PiToolArgShapeDefectError`), whose message text already names this
  cause ("a lexically shadowed callee that still dispatches as the Pi tool, or
  a gate gap (bug 0003)") — the implementation ships the mismatch knowingly.

No test pins dispatch behaviour under shadowing (repo-wide `shadow` hits cover
only environment resolution, discovery-source shadowing, and an unrelated
string fixture).

## Root cause

Call classification and callee resolution at runtime key on the callee *name*
against the callable set (`checkpointFor` / `#classifyCall` /
`#resolveToolCall`), not on the lexical resolution of the call site. The
executor consults the environment only to detect user `fn`s (arms
`"fn"`/`"import"`); the `"local"` arm — the spec's highest-precedence arm — is
not represented in the dispatch decision. Both executor dispatch sites share
the blindness, and the `.theta`-callable half of the callable set sits in the
same class — `#classifyCall` is equally lexical-blind for a shadowed
`.theta`-callable name, which would route the invoke path (not separately
executed; the matrix here is Pi-tool-scoped). The parse walks model the lexical
rule, producing the parse/runtime disagreement; the shape walk's own doc
comment states "Under-reporting on a shadowed name is safe: the runtime
lowerings back-stop with a loud `PiToolArgShapeDefectError`" — true only for
non-object argument nodes, which is how the silent-execution half escaped
bug 0003's residual record.

## Why it matters

- **An effectful host tool executes at a call site that does not denote it.**
  R1/R3/R6 execute the tool with author-supplied arguments and report success.
  `read` is benign; a `write`-, `bash`-, or store-mutating tool in the same
  position performs real effects. The likeliest trigger is accidental: a
  `let`, parameter, loop variable, or `match` binding that happens to collide
  with one of the theta's `tools:` names silently converts every subsequent
  call of that name into spec-illegal behaviour that nevertheless "works".
- **Programs that work today break under any conformant fix.** Whichever way
  the misalignment is closed (parse rejection or lexical runtime resolution),
  R1/R3/R6-shaped code stops executing the tool. The longer this ships, the
  more such code exists.
- **The crash half misattributes authored programs as internal defects.** R2
  is a diagnostic-free program whose failure surfaces as
  `theta/runtime/internal-error` blaming a parse gate that deliberately
  admitted the site. ERR-model surfaces treat internal errors as
  runtime bugs, not author errors.
- **Bug 0003's residual record is inaccurate as shipped documentation.** It
  claims a shadowed call "lands on the defect throw — fail-loud, strictly
  better"; the object-literal and zero-argument forms never reach the throw.

## Options

1. **Reject call sites whose callee resolves to a local (parse), and align the
   carve-out** — recommended. A call of a non-callable local is provably
   erroneous in a language without first-class functions, so a parse-time
   rejection has zero false positives: extend the existing lexical walk to
   emit a new registered code (e.g. `theta/parse/shadowed-callable-call`,
   naming both the local binding site and the collided tool) for any call whose
   callee is shadowed, and make the bare-object-literal carve-out lexical so it
   matches §Object construction. Binding the name without calling it stays
   legal, preserving expressions.md's "local bindings shadow everything"
   sentence. Requires a spec addition (the new code's registry row) — which
   also closes the recorded gap. The carve-out fix has a wiring cost:
   `checkStructural`'s walk receives neither the frontmatter tool set nor any
   scope tracking today, so the fix threads both in or hoists the carve-out
   into the shape walk, which already has both. Belt-and-braces: treat an
   arm-`"local"` callee as a defect throw (never a dispatch), mirroring 0003's
   structure — placed at the shared seam (`preEvaluateToolArgs` or the
   classification step), since a guard on the `evalExpr` call arm alone misses
   every `?`/`match`-wrapped call (`evalAsResult` is the dispatch site for
   those).
2. **Align runtime resolution with lexical scope only.** Consult
   `env.resolve(callee).arm` before classification, at both dispatch sites; an
   arm-`"local"` callee raises a defined runtime error instead of dispatching.
   Honours the spec's
   resolution order directly but still needs the same spec addition to name
   the surface, leaves the §Object construction carve-out violation in place
   unless also fixed, and converts the accident into a runtime failure the
   author could have been told about at parse.
3. **Load-reject local shadowing of tool names outright** (extend
   `tool-name-collision` to `let`/params/loop/match/param binders). Simplest
   mental model, but contradicts expressions.md's explicit legality of local
   shadowing and rejects harmless never-called bindings; a spec change in the
   opposite direction of the current text.

The spec as written supports option 1: resolution stays lexical, the
object-literal form was already supposed to fail parse, and the remaining
forms get a code whose absence is the recorded gap.

## Non-goals

- Making shadowed names callable (first-class functions) — RFC territory.
- Relitigating bug 0003's argument-shape rule or its parse gate, both correct
  for unshadowed callees.
- The load-time collision rules for `fn`/import vs `tools:` names
  (`theta/load/tool-name-collision`) — already enforced.
- Discovery-level slash-name shadowing (`theta/load/cross-source-shadow`) —
  unrelated.

## Provenance

- Origin: the reviewer-accepted residual in bug 0003's fixed doc
  (`docs/bugs/0003-tool-arg-shape-rule-not-enforced.md` §Fix, "Known residual"
  paragraph; fix commit `111834a5`). This report corrects that record: the
  residual's "lands on the defect throw" holds only for non-object argument
  nodes.
- Spec measured against: `docs/spec_topics/expressions.md` §Identifier
  resolution (the four-arm call-position order and the local-shadowing
  sentence), §Object construction / the Pi-tool bare-object carve-out
  paragraph; `docs/reference/grammar.md` §`fn` declarations (not first-class;
  top-level only); `docs/spec_topics/diagnostics/code-registry-parse.md`
  (`unknown-identifier` requires no match; no call-of-non-callable code
  exists).
- Implementation: `src/runtime/statement-executor.ts` (`evalExpr` call arm,
  `evalAsResult` operand arm, `resolveUserFn`, `preEvaluateToolArgs`),
  `src/runtime/effectful-statement-host.ts` (`checkpointFor`),
  `src/extension/production-theta-producer.ts` (`#classifyCall`,
  `#resolveToolCall`, `lowerToolCallParams`),
  `src/runtime/lexical-environment.ts` (`resolve`),
  `src/parser/theta-document.ts` (`checkPiToolArgShapes`, `walkExpr`
  `case "call"` carve-out), `src/runtime/tool-call.ts`
  (`PiToolArgShapeDefectError` message).
- Evidence: mechanical parse+runtime matrix (this report §Reproduction) run
  against 30492948 via a scratch vitest using the
  `tests/tool-arg-shape-enforcement.test.ts` producer-level harness pattern
  (real `bindPromptConversation` host; scratch deleted). Environment-precedence
  pin: `tests/lexical-environment.test.ts` (cka-3).
- Triage re-verification (independent): the six-cell matrix re-reproduced
  mechanically at c15809cb (`src/` byte-identical to 30492948) via a fresh
  scratch vitest on the same harness — R1/R3 execute the tool with
  `{ path: "p" }`, R6 with `{}`, R2 throws the defect without executing, P4
  rejects at parse, P5 executes; scratch deleted. `tests/lexical-environment.test.ts`
  (10 tests) and `tests/tool-arg-shape-enforcement.test.ts` (18 cells) green.
