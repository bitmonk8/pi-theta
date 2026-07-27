# Bug 0016 — A call to a lexically shadowed Pi-tool name dispatches the tool at runtime; the object-literal form executes it silently

- **Status:** open
- **Kind:** defect — parse-time call resolution is lexical (per
  expressions.md §Identifier resolution), runtime call classification is
  callable-set-membership only. A parse-clean call site whose callee the spec
  resolves to a local binding executes the Pi tool with real arguments
  (object-literal and zero-argument forms) or crashes on the
  `theta/runtime/internal-error` surface (all other argument forms). Bug 0003's
  fixed doc recorded only the crashing half as a residual and called it
  "fail-loud"; the silently-executing half was not recorded.
- **Affected:** the two resolution sites —
  parse: `src/parser/theta-document.ts` (`checkPiToolArgShapes` lexical skip,
  ~4195–4360; the callee-blind bare-object carve-out in `walkExpr`
  `case "call"`, ~4865–4877);
  runtime dispatch: `src/runtime/statement-executor.ts` `evalExpr` call routing
  (~597–608, via `resolveUserFn` ~352) → `src/runtime/effectful-statement-host.ts`
  `checkpointFor` (`case "call"` → `tool-call`, ~453) →
  `src/extension/production-theta-producer.ts` `#classifyCall` (~2539) /
  `#resolveToolCall` (~2547). `src/runtime/lexical-environment.ts` `resolve`
  (~336) implements the spec's four-arm precedence correctly but is never
  consulted for call classification.
- **Observed at:** `0.20.0` (30492948), Windows.

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
  (`theta-document.ts` ~4867–4875), which is laxer than the §Object
  construction rule and is what admits R1/R3.
- Runtime: `evalExpr` routes a call through `resolveUserFn`, which accepts only
  arms `"fn"`/`"import"`; an arm-`"local"` resolution falls through as if the
  name were unbound. The call is then unconditionally classified a checkpointed
  tool-call effect (`checkpointFor` `case "call"`), classified `pi-tool` by
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
not represented in the dispatch decision. The parse walks model the lexical
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
  claims shadowed calls "land on the defect throw — fail-loud, strictly
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
   also closes the recorded gap. Belt-and-braces: teach `evalExpr` /
   `#classifyCall` to treat an arm-`"local"` callee as a defect throw (never a
   dispatch), mirroring 0003's structure.
2. **Align runtime resolution with lexical scope only.** Consult
   `env.resolve(callee).arm` before classification; an arm-`"local"` callee
   raises a defined runtime error instead of dispatching. Honours the spec's
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
  `resolveUserFn`, `preEvaluateToolArgs`),
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
