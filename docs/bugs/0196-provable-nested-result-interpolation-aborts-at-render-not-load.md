# Bug 0196 — A `Result` nested in an interpolated array or object **literal** is provable at parse time and is still refused only at render: `${[Ok(1)]}`, `${[Ok(1), Err(2)]}`, `${[1, Ok(2), "s"]}`, `${ {r: Ok(1)} }` and — with the `resultBindings` channel extended — `let xs = [Ok(1)]` / `${xs}` and `let xs = [[Ok(1)]]` / `${xs}` load with `diagnostics []` and abort mid-drive with `InterpolatedResultPanic`; that is six of bug 0114's twelve rows, not the two its residual (i) records

- **Status:** wontfix (not a defect) — closed by operator ruling, fifteenth set; see the closure note at the end.
  a route bug [0114](./0114-nested-result-in-interpolated-object-leaks-carrier.md)
  declined on five recorded grounds, so answering those grounds with
  measurements — not restating them — is in-run adjudication work, and two
  normative sentences that currently foreclose the upgrade take same-commit
  edits. No ordering dependency: 0114 is **fixed (0.108.0)**, commit
  `b123206f`, and owns both arms this report would extend; nothing blocks this
  report from starting and it blocks nothing.
- **Sev/Diff estimate:** S4/D3 — S4 because behaviour at HEAD is
  spec-conformant: 0114's own new QRY-18 note
  (`docs/spec_topics/query/query-escapes-stringification.md:33`) makes
  containment the **runtime** arm, and the widened registry *Trigger*
  (`docs/spec_topics/diagnostics/code-registry-parse.md:74`) states the
  container sub-case "is reached only at runtime, never at parse", so the
  observable — the registered code, the registered *Message*, an aborted drive,
  nothing on the wire — is the one the corpus prescribes. S2 was weighed and
  rejected: the failure is late, not wrong. S3 was weighed and rejected: S3 is
  the verification band (gates that cannot red, rows no input can fire), and
  this row fires, with 49 cells pinning it. What remains is the tension between
  QRY-18 `:32`'s "static where possible, runtime where not" posture and a
  sub-class that *is* statically provable, plus the per-invocation cost measured
  in §Why it matters. D3 because the §Fix is unsettled, extends the parse
  surface bug 0079's nine false-positive controls exist to guard, re-authors the
  direction-0 pin of six cells in a sibling witness whose route-2 assumption is
  written into its helper (`tests/interpolated-result-gate.test.ts:1280`), must
  leave one live H8a cell's registration precondition (`:1421–1435` of
  `tests/live/live-production-acceptance.test.ts`) green, and lands DIAG-2 spec
  edits in the same commit.
- **Kind:** quality-of-failure defect, plus the spec-posture question it
  carries. No wrong value reaches any boundary and no diagnostic is
  mis-coded — the defect is that six measured sources whose `Result`-ness the
  parse layer can decide from the AST alone are dispositioned by the runtime
  arm, so the refusal arrives after registration, after the binder call for a
  params-bearing theta that takes a genuine binder pass, and once per invocation
  instead of once at load. The
  applicable sentence is QRY-18's
  `docs/spec_topics/query/query-escapes-stringification.md:32` — "the same
  'static where possible, runtime where not' posture used elsewhere for
  tool-call argument typing" — which the note added directly beneath it (`:33`)
  exempts the whole containment class from, by container-ness rather than by
  provability.
- **Related:**
  - [0114](./0114-nested-result-in-interpolated-object-leaks-carrier.md) —
    **fixed (0.108.0)**, commit `b123206f`; the origin. Its §Fix settled
    Reading A, took route 2 (the runtime disposition at the nested position),
    declined route 1's static descent on five grounds, and filed the decline as
    §Residuals (i) — "the load-refusal upgrade for the provable subset was
    declined, not overlooked". This report is that decline's own adjudication.
    Its five grounds are reproduced in §Fix as the bar, and one of them (the
    2-of-12 benefit arithmetic) is corrected against measurement here.
  - [0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md) —
    **fixed (0.69.0)**; the parse-gate ancestor. It built
    `interpolationIsResult`, the `resultBindings` identity channel, the sole
    static emission site, and the nine false-positive controls (a4)–(a7)
    (`tests/interpolated-result-gate.test.ts:615`, `:628`, `:641`, `:655`) and
    (a11)–(a15) (`:727`, `:738`, `:748`, `:761`, `:774`) that any descent must
    keep silent. The gate's three provenances are what make the literal class
    decidable: the descent proposed here reuses `isCertainResultNode` (`:2252`)
    unchanged rather than adding a type-name test.
  - [0117](./0117-error-model-omits-parse-coded-interpolation-panic.md) —
    **open**; the closed panic-source enumeration
    (`docs/spec_topics/errors-and-results/error-model.md:65–74`) does not list
    QRY-18's parse-coded interpolation panic. Adjacent: a load-refusal upgrade
    *narrows* the input set reaching that panic and neither creates nor closes
    the silence. §Non-goals.
  - [0116](./0116-question-unwrapped-interpolation-renders-null.md) — **open**;
    `${r?}` renders `null` rather than the unwrapped payload. Measured here at
    the nested position too: `let r = Ok(1)` / `${[r?]}` renders `x[null]`
    (§Reproduction row N). Adjacent, and the same row is a control the descent
    must not fire on. §Non-goals.
- **Affected** (every citation verified at HEAD `a8d95853`, 0.108.0):
  - `interpolationIsResult` (`src/parser/type-layer-checks.ts:2218`) — **the
    defect site.** It switches on the interpolated expression's top-level node
    kind (`:2222`): `result-ctor` / `call` (`:2223–2225`), `ident`
    (`:2226–2229`), `index` (`:2230–2233`). An `ArrayExpr`
    (`src/parser/theta-document.ts:153–156`) and an `ObjectExpr` (`:236–240`)
    fall to `default: return false` (`:2234–2242`), whose comment scopes the
    default to expressions that "type as a `named` reference built from an
    author-chosen identifier". The elements of a literal are never visited, so
    an element that *is* a `result-ctor` is never classified.
  - `checkQueryInterpolationResults` (`:2164`), driven from `walkExpr`'s `query`
    arm (`:2085`). It lexes the template (`:2168`), skips non-interpolation
    parts (`:2169–2171`), parses each interpolation source (`:2172`), skips an
    unparseable source and a top-level `try` (`:2173–2180`, the `?`-unwrap
    exclusion), and pushes the **sole** static emission at `:2182–2188` —
    severity `error` (`:2183`), `INTERPOLATED_RESULT_CODE` (`:2184`), the
    enclosing `@`-query's own range (`:2186`).
  - `resultBindings` (`:891`) — the ident provenance channel, a
    `Set<CompatType>` keyed by object identity, written at the `let` arm
    (`:1041`) under the guard `annotation === undefined &&
    this.isCertainResultNode(stmt.init)` (`:1025`). `isCertainResultNode`
    (`:2252`) answers true for a `result-ctor` node and for a `call` to a `fn`
    whose **written** return annotation names a `Result`; an `array` or
    `object` literal initialiser is neither, so `let xs = [Ok(1)]` records
    nothing and the `ident` arm's `resultBindings.has(type)` (`:2228`) answers
    false for `${xs}`.
  - The identity keying the channel depends on, and which an extension inherits:
    `StaticTypeInferencePass`'s `ident` arm returns the very object `bindings`
    holds (`src/parser/static-type-inference.ts:211–216`), and its `array` arm
    mints a fresh `{ kind: "array", element }` per initialiser (`:217–223`), so
    a recorded array type is unique to the `let` that recorded it.
  - `isResultGenericType` (`:2269`) — why a written container annotation does
    not help either. It requires `type.kind === "named"`; the recorded type of
    `let xs: array<Result<integer, QueryError>> = [Ok(1)]` is an `array`, so the
    test is false and the row loads clean (§Reproduction row J).
  - `stringifyInterpolation` (`src/extension/production-theta-producer.ts:5934`)
    — where the refusal happens instead. It evaluates the interpolation
    (`:5941`), derives the QRY-18 discriminator (`:5942`), threads bug 0114's
    `NestedResultReach` accumulator (`:5943`, the interface at `:5987`) through
    `translateInterpolationOutbound` (`:5951`, defined `:6010`), returns the
    lowered JSON only when nothing was reached (`:5952–5953`), and otherwise
    routes the value through the `result` arm (`:5960`) to the **sole** runtime
    raise (`:5967`). `renderQueryText` (`:5903`) is its only caller.
  - `InterpolatedResultPanic` (`src/render/query-render.ts:110`), a `ThetaPanic`
    subclass carrying `INTERPOLATED_RESULT_CODE` (`:80`) and
    `INTERPOLATED_RESULT_MESSAGE` (`:95`).
  - The dispatch ordering that fixes the cost of the late refusal:
    `src/extension/theta-composition-producer.ts:410` awaits `deps.runBinder`
    **first**, projects the bound args at `:417`, binds the conversation at
    `:422`, and only then drives `executeBody(theta.body,
    binding.executeDeps)` at `:440`; a `ThetaPanic` escaping that drive is
    framed as one `theta-system-note` at `:489`
    (`theta /<name> aborted: <message>`). `runBinder`
    (`src/extension/production-theta-producer.ts:723`) issues a model call only
    for a genuine binder pass: a theta with no `params:` returns at `:729–735`
    and both load-time bypasses return at `:741–753` without one.
  - The registration gate a load refusal would use instead:
    `hasLoadParseError` (`src/extension/production-composition.ts:2214`) treats
    any error-severity `theta/parse/*` diagnostic as a drop, consulted at
    `:1496`, `:2102` and `:2261`; the callable-set path re-states the same rule
    as `const registered = !diagnostics.some((d) => d.severity === "error")`
    (`:1729`). A refused theta never registers, so no invocation and no model
    turn can occur.
  - `docs/spec_topics/query/query-escapes-stringification.md:16` (QRY-18's
    rule), `:26` (`array<T>`), `:27` (Schema-typed object), `:28`
    (`Result<T, E>`), `:32` (the static/runtime posture), `:33` (0114's
    containment note: "A container's own static type is never `Result<T, E>`,
    so this is the **runtime** arm of the previous note"), `:34` (recursive
    outbound translation).
  - `docs/spec_topics/diagnostics/code-registry-parse.md:74` — the
    `theta/parse/interpolated-result` row after 0114's widening. Its *Trigger*
    now reads, in the added clause, "the runtime renderer **also** raises it
    when `expr`'s static type is `array<T>` or a Schema-typed object and the
    evaluated value holds a `Result` at any depth — a container's own static
    type is never `Result<T, E>`, so this sub-case is reached only at runtime,
    never at parse". **As written it does not admit a load-time emission for the
    literal sub-class; it excludes one.** A second *Trigger* touch is therefore
    owed by any fix, per DIAG-2
    (`docs/spec_topics/diagnostics/diagnostic-shape.md:72`). DIAG-4 (`:74`) is
    untouched: the *Message* does not change.
  - `docs/reference/frontmatter.md:283–287` — the user-facing mirror, which
    states both arms: "`Result<T, E>` interpolands are rejected at parse time
    (`theta/parse/interpolated-result`). A `Result` held at a nested position
    inside an interpolated array or object raises the same code as a runtime
    panic, because a container's own static type is never `Result<T, E>`." The
    second sentence is what a load-refusal for the provable sub-class
    contradicts.
  - `tests/interpolated-result-gate.test.ts` (1679 lines at HEAD) — the 49-cell
    witness. `assertNestedCarrierRefused` (`:1280`) opens with a
    **direction-0** assertion that the row's `diagnostics` array is exactly `[]`
    (`:1281–1285`), justified in its own docstring as "§Fix (a) route 2's own
    pin". Six of the twelve rows it guards are in this report's provable class:
    (e3 / L02) `:1408`, (e4 / L03) `:1412`, (e7 / L06) `:1434`, (e8 / L07)
    `:1438`, (e10 / L09) `:1449`, (e11 / L10) `:1457`. The row table is at
    `:1173–1246`. Bug 0079's protected block (lines 1–990) contains none of
    them.
  - `tests/live/live-production-acceptance.test.ts:1413` — the H8a cell 0114
    added. Its fixture is the `par for` composite (`:1399–1411`) and its first
    assertion is a **registration precondition** (`:1421–1435`): "A regression
    that widened the static gate to refuse this shape at load (route 1,
    deliberately declined) would red HERE first." A descent confined to literals
    leaves it green; a descent that reaches a `par for` value does not.
  - `tests/fixtures/h7a/permitted-codes.json` — eleven codes, none of them
    `theta/parse/interpolated-result`.
  - **Test coverage of this report's subject: partial and in the opposite
    direction.** The six rows are covered — as *runtime* dispositions, with
    their empty parse-diagnostics array asserted. No cell anywhere asserts that
    a provable literal is refused at load.
- **Observed at:** `0.108.0` (HEAD `a8d95853`). Offline, deterministic; no
  provider, no model dispatch. One scratch vitest file reusing bug 0079's drive
  harness verbatim in shape (`tests/interpolated-result-gate.test.ts:521–552`):
  the real `parseThetaDocument`, then `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody` against that file's live-session
  double, with the prompt text read at `pi.sendUserMessage` and the throw
  captured. Run in a **detached worktree checked out at `a8d95853`**, because a
  sibling session held uncommitted edits to `src/parser/theta-document.ts` and
  `src/parser/frontmatter.ts` in the main tree while these measurements ran; the
  worktree and the probe were deleted afterwards.

## Summary

Bug 0114's fix (0.108.0) made containment take QRY-18's `Result` row: a
`Result` reached at any depth inside an interpolated container aborts the drive
with `theta/parse/interpolated-result` instead of serialising its carrier. The
disposition it chose is the **runtime** one, uniformly, for every containment
shape — route 1's static descent was declined on five grounds and filed as
residual (i).

Part of that class is decidable at parse time from the AST alone. When the
container is a **literal written at the interpolation** and one of its elements
or field values is a `Result` by construction, `interpolationIsResult`
(`src/parser/type-layer-checks.ts:2218`) has every fact it needs — it holds the
parsed expression, and `isCertainResultNode` (`:2252`) already answers for the
element node — but it switches on the top-level node kind and returns `false`
for `array` and `object` at `:2234–2242` without descending. When the container
is the unannotated initialiser of a `let`, the same fact is one write away: the
`resultBindings` identity channel (`:891`, written at `:1041`) records only an
initialiser that is *itself* a `result-ctor` or an annotated-`Result` call.

Measured at HEAD, six sources in that class load with `diagnostics []` and abort
at the first render: `${[Ok(1)]}`, `${[Ok(1), Err(2)]}`, `${[1, Ok(2), "s"]}`,
`${ {r: Ok(1)} }`, `let xs = [Ok(1)]` / `${xs}`, and `let xs = [[Ok(1)]]` /
`${xs}`. Each throws `InterpolatedResultPanic` carrying the registered code and
the registry's *Message*, and each sends nothing — the carrier leak 0114 closed
stays closed. The two-character contrast with the top level is unchanged:
`${Ok(1)}` draws the diagnostic at load (§Reproduction row E).

Behaviour at HEAD is spec-conformant. QRY-18's containment note
(`query-escapes-stringification.md:33`) assigns the class the runtime arm, and
the registry *Trigger* (`code-registry-parse.md:74`) states the sub-case is
"reached only at runtime, never at parse". The report's subject is the quality
of the failure against QRY-18 `:32`'s "static where possible" posture, and the
cost that follows from refusing after registration rather than before it: a
refused load names the site once, pre-registration, at zero model turns; the
render panic recurs per invocation and, for a params-bearing theta taking a
genuine binder pass, lands after the binder's off-session model call has already
been spent.

## Reproduction

Offline, at `a8d95853`, in a detached worktree at that commit. Every row parses
through the real `parseThetaDocument` and then drives through the production
composition; `diagnostics` is the whole parse array, unfiltered; `sent` is every
text handed to `pi.sendUserMessage`; `thrown` is the value escaping
`executeBody`. Frontmatter is `mode: prompt` throughout.

### The provable class — six sources, `diagnostics []`, panic at render

```
@@ A  @`x${[Ok(1)]}`                        [0114 row L02]
   diagnostics :: []       sent :: []
   thrown      :: ThetaPanic InterpolatedResultPanic theta/parse/interpolated-result
                  "Result value cannot be interpolated; unwrap with ? or match first"
@@ G  @`x${[Ok(1), Err(2)]}`                [0114 row L06]
   diagnostics :: []       sent :: []       thrown :: same panic
@@ Q  @`x${[1, Ok(2), "s"]}`                [0114 row L07]
   diagnostics :: []       sent :: []       thrown :: same panic
@@ B  @`x${ {r: Ok(1)} }`                   [0114 row L09]
   diagnostics :: []       sent :: []       thrown :: same panic
@@ C  let xs = [Ok(1)] / @`x${xs}`          [0114 row L03]
   diagnostics :: []       sent :: []       thrown :: same panic
@@ D  let xs = [[Ok(1)]] / @`x${xs}`        [0114 row L10]
   diagnostics :: []       sent :: []       thrown :: same panic
```

Rows A, G, Q and B are literals written at the interpolation: the parsed
expression the gate already holds is an `ArrayExpr` / `ObjectExpr` whose element
or field value is a `result-ctor`. Rows C and D are the `resultBindings`
candidates: the initialiser is such a literal, the binding is unannotated, and
the interpolation is a bare `ident`.

The panic is the observable, not a carrier leak — 0114 closed the leak, and
`sent :: []` on every row re-measures that here. The framing a top-level slash
dispatch composes from the throw is
`theta /<name> aborted: Result value cannot be interpolated; unwrap with ? or
match first` (`src/extension/theta-composition-producer.ts:489`).

### The contrast that is already static

```
@@ E  @`x${Ok(1)}`                          the top-level constructor
   diagnostics :: [error theta/parse/interpolated-result:
                   "Result value cannot be interpolated; unwrap with ? or match first"]
   sent        :: []       (driven anyway: the same panic also fires)
```

Two characters — a pair of brackets — separate a load refusal from a mid-drive
abort, on one fixture at one HEAD.

### Provable by the same predicate, outside 0114's twelve rows

```
@@ K  fn mk(): Result<integer, QueryError> { Ok(1) } / @`x${[mk()]}`
   diagnostics :: []       sent :: []       thrown :: same panic
@@ R  @`x${ {a: 1, r: Err(2)} }`
   diagnostics :: []       sent :: []       thrown :: same panic
```

Row K is the QRY-18 `:32` shape the note singles out — an annotated `fn` return
— one container inside. `isCertainResultNode` (`:2252`) already answers true for
that `call` node; only the descent is missing.

### Not reachable by the descent described in §Fix — the runtime arm stays load-bearing

```
@@ I  let xs: array<integer> = [Ok(1)] / @`x${xs}`          [L04]
   diagnostics :: []       sent :: []       thrown :: same panic
@@ J  let xs: array<Result<integer, QueryError>> = [Ok(1)] / @`x${xs}`   [L05]
   diagnostics :: []       sent :: []       thrown :: same panic
@@ H  schema S { xs: array<integer> } / let s = S { xs: [Ok(1)] } / @`x${s}`   [L08]
   diagnostics :: []       sent :: []       thrown :: same panic
```

Rows I and J are annotated `let`s, which the `resultBindings` write excludes by
its `annotation === undefined` guard (`:1025`); row H hides the literal in a
constructor field. All three are AST-decidable in principle and are §Fix's
open scope question, not part of its pinned core. Bug 0114's rows L01, L11 and
L12 — the `par for` composite and its two containments — are decidable by no
descent at all: their `Result`-ness comes from CTRL-3's element type, and the
runtime arm is the only arm that reaches them.

### Controls a descent must keep silent — all measured silent at HEAD

```
@@ L  enum St { Ok, Bad } / @`x${[St.Ok]}`
   diagnostics :: []       sent :: ["x[\"Ok\"]"]                 no throw
@@ M  schema F { ok: boolean, label: string } / @`x${[F { ok: true, label: "x" }]}`
   diagnostics :: []       sent :: ["x[{\"ok\":true,\"label\":\"x\"}]"]   no throw
@@ N  let r = Ok(1) / @`x${[r?]}`
   diagnostics :: []       sent :: ["x[null]"]                   no throw
@@ P  @`x${[[1, 2], [3]]}`
   diagnostics :: []       sent :: ["x[[1,2],[3]]"]              no throw
@@ F  @`x${[1, 2]}`
   diagnostics :: []       sent :: ["x[1,2]"]                    no throw
```

Row L is bug 0079's enum-variant-named-`Ok` control at the nested position: a
descent keyed on the name `Ok` rather than on the node kind refuses it. Row M is
bug 0017's shape inside a literal — the object whose own declared fields are
`ok` / `label`. Row N is the `?`-unwrap inside a literal: the descent must skip
a `try` element the way `checkQueryInterpolationResults` already skips a
top-level `try` (`:2173–2180`), or the row is refused at load. Its `x[null]`
render is bug [0116](./0116-question-unwrapped-interpolation-renders-null.md)'s
subject at the nested position and is not this report's.

### The object literal in statement position, unchanged

```
@@ O  let o = { r: Ok(1) } / @`x${o}`
   diagnostics :: [error theta/parse/bare-object-literal:
                   "bare object literal not permitted in this position; name the schema (Schema { ... })"]
   sent        :: []       (driven anyway: the same panic fires)
```

Re-measured for the object-literal descent's scope: the spelling is refused as a
statement, so the only load-clean route to QRY-18's object row through a bare
literal is inside the interpolation (row B). Whether
`theta/parse/bare-object-literal` should reach an interpolation source is bug
0114's §Non-goal and stays one here.

## Expected behaviour

QRY-18 `:32` states the posture: static where possible, runtime where not. For
an interpolation whose expression is an array or object **literal** holding an
element or field value that is a `Result` by construction — and for a bare
`ident` bound by an unannotated `let` whose initialiser is such a literal — the
`Result`-ness is decidable from the parsed expression the gate already holds,
using the predicate the gate already owns. The expected disposition for that
sub-class is the one the top level gets:
`theta/parse/interpolated-result`, severity `error`, the registry's *Message*,
located at the enclosing `@`-query's range — the same emission the top-level
positions draw (§Reproduction row E), from the same single site (`:2182–2188`).

Under that disposition, on the measured input:

- The six rows of §Reproduction's first block report exactly one diagnostic at
  load and the theta does not register (`hasLoadParseError`,
  `src/extension/production-composition.ts:2214`, consulted at `:1496`, `:2102`
  and `:2261`). No drive occurs, so no binder call and no render occur.
- Every row that is not statically decidable — L01, L11, L12, and every shape
  laundered through an unannotated `fn` or a narrowed operand — keeps the
  runtime arm exactly as 0114 shipped it, including the panic class, the code
  and the *Message*.
- Nothing reaching `pi.sendUserMessage` carries a branded `Result`'s carrier
  keys at any depth. This report proposes no change to
  `translateInterpolationOutbound`, `NestedResultReach` or the raise at `:5967`.
- The five control rows of §Reproduction's control block still load and render
  byte-identically, and bug 0079's nine parse-layer controls stay silent.

The corpus does not currently say this. Two normative sentences say the
opposite, both added by 0114 in the same commit as its code:
`query-escapes-stringification.md:33` ("this is the **runtime** arm of the
previous note") and `code-registry-parse.md:74` ("this sub-case is reached only
at runtime, never at parse"). Both are true statements about the implementation
0114 shipped, and both would need to be re-worded — in the same commit as any
code, per DIAG-2 — to distinguish the provable literal sub-class from the
containment class as a whole. The user-facing mirror
`docs/reference/frontmatter.md:283–287` states the same split and follows them.
Which way the corpus should read is the adjudication this report asks for; the
argument for changing it is QRY-18 `:32` plus §Why it matters, and the argument
against it is bug 0114's five grounds, reproduced in §Fix.

## Actual behaviour / root cause

**The static gate classifies the interpolated expression, never its parts.**
`checkQueryInterpolationResults` (`src/parser/type-layer-checks.ts:2164`) parses
each interpolation source (`:2172`) and hands the whole node to
`interpolationIsResult` (`:2218`). That function's `switch` (`:2222`) has three
accepting arms — `result-ctor` / `call` via `isCertainResultNode`
(`:2223–2225`), `ident` via `resultBindings` or the generic-name test
(`:2226–2229`), and `index` via the generic-name test (`:2230–2233`) — and a
`default: return false` (`:2234–2242`). `ArrayExpr` and `ObjectExpr` reach the
default. The comment there scopes it to expressions that "type as a `named`
reference built from an author-chosen identifier", which is a statement about
reading a *type name*; a literal's element is a different question, decided by
node kind, and no arm asks it.

**The binding channel records constructors, not containers of them.**
`resultBindings` (`:891`) is written at the `let` arm (`:1041`) only when
`annotation === undefined && this.isCertainResultNode(stmt.init)` (`:1025`), and
`isCertainResultNode` (`:2252`) answers for exactly two node kinds:
`result-ctor`, and a `call` whose callee has a written `Result` return
annotation. `[Ok(1)]` is an `ArrayExpr`, so `let xs = [Ok(1)]` writes nothing
and `${xs}`'s `ident` arm answers false. The channel's identity keying would
carry an extension unchanged: `bindings.get(name)` returns the exact object the
`let` arm stored (`src/parser/static-type-inference.ts:211–216`), and the
`array` arm mints a fresh type object per initialiser (`:217–223`).

**A written container annotation does not substitute for the descent.**
`isResultGenericType` (`:2269`) requires `type.kind === "named"`. The recorded
type of `let xs: array<Result<integer, QueryError>> = [Ok(1)]` is an `array`
whose element names the generic form, so the test is false — measured as
§Reproduction row J, which loads clean even though the author wrote the word
`Result`.

**The runtime arm then does the whole job, correctly and late.**
`stringifyInterpolation`
(`src/extension/production-theta-producer.ts:5934`) evaluates the interpolation
(`:5941`), takes the container branch (`:5944`), threads `NestedResultReach`
through `translateInterpolationOutbound` (`:5951`), finds the reach, discards
the lowered tree (`:5955–5958`), routes the value through the `result` arm
(`:5960`) and raises at `:5967`. That is bug 0114's fix behaving as designed:
one raise site, the same `ThetaPanic` subclass, the registered code, the
registered *Message*, nothing on the wire. The defect is not in that path; it is
that the path is reached by inputs the parse layer could have refused.

**Where the render sits in the dispatch, precisely.** The top-level slash `run`
(`src/extension/theta-composition-producer.ts`) awaits `deps.runBinder` at
`:410` **before** anything else, projects the bound args at `:417`, binds at
`:422`, and drives `executeBody(theta.body, binding.executeDeps)` at `:440`. The
`@`-query render — and therefore the panic — happens inside that drive. So for a
theta whose `params:` block takes a genuine binder pass, the binder's off-session
model call (`src/extension/production-theta-producer.ts:723`, reaching the
model only past the no-`params:` return at `:729–735` and the two load-time
bypasses at `:741–753`) completes before the first interpolation is rendered. A
theta with no `params:`, or one that takes either bypass, spends no model call
before the panic; statements that precede the failing query in the body have
already dispatched their own turns, since `executeBody` runs them in order.

## Why it matters

- **The refusal recurs per invocation instead of happening once.** A load
  diagnostic un-registers the theta (`hasLoadParseError`,
  `src/extension/production-composition.ts:2214`, consulted at `:1496`, `:2102`
  and `:2261`; the callable-set restatement at `:1729`), so the slash command
  does not exist and the cost is one diagnostic. The render panic is paid on
  every invocation of a theta that keeps registering.
- **For a params-bearing theta it is paid after a model call.** Dispatch order is
  `runBinder` (`theta-composition-producer.ts:410`) → bind (`:422`) →
  `executeBody` (`:440`). A genuine binder pass is a real off-session model call
  (`production-theta-producer.ts:723`, past the bypass returns at `:729–735` and
  `:741–753`), so a theta whose first `@`-query interpolates `[Ok(1)]` spends
  that call and then aborts. A no-`params:` theta spends none — the live H8a cell
  0114 added records exactly that for its own fixture.
- **The diagnostic names a site; the panic names a message.** The static
  emission carries the enclosing `@`-query's range (`:2186`); the panic carries
  no `SourceRange` and the top-level framing synthesizes the zero body range
  (`theta-composition-producer.ts:477–489`). For the same source, the author
  gets a located parse error in one arm and an unlocated abort note in the other.
- **The class is written inline.** Every measured row of the provable class is a
  literal at the interpolation or a one-line binding of one; two of them,
  `${[Ok(1), Err(2)]}` and `${[1, Ok(2), "s"]}`, are the shapes 0114's own
  §Reproduction chose to illustrate the array arm.
- **QRY-18 `:32`'s posture is stated as a rule and applied by container-ness.**
  The note added at `:33` exempts the whole containment class from the static
  arm on the ground that a container's own static type is never `Result<T, E>`.
  That ground is about *types*, and this report's class is decided by *nodes*,
  which the gate already inspects for the top-level case (`:2223–2225`).
- **The origin's benefit arithmetic understates the class.** Bug 0114 residual
  (i) records the descent as reaching "2 of 12" rows (`${[Ok(1)]}` and
  `${ {r: Ok(1)} }`), "two more with a `resultBindings` extension". Measured
  here: rows L06 (`${[Ok(1), Err(2)]}`) and L07 (`${[1, Ok(2), "s"]}`) are array
  literals written at the interpolation, the same node shape as L02, so the
  descent reaches **4 of 12** with no binding change and **6 of 12** with it.

## Non-goals

- **Reopening bug 0114's runtime disposition.** Route 2 is settled, shipped and
  specified. The runtime arm keeps every shape no descent can decide — L01, L11
  and L12, every laundering through an unannotated `fn`, every narrowed operand
  — with the same panic class, code and *Message*. This report proposes no edit
  to `translateInterpolationOutbound`, to `NestedResultReach`, or to the raise
  at `production-theta-producer.ts:5967`.
- **`checkCommonType`'s `"unknown"` skip** (`src/parser/type-compat.ts`), which
  admits an `Ok` element under a written `array<integer>` sink. Bug 0114
  §Residuals (iv) keeps it a recorded disposition; widening it touches every
  array literal in the language, and §Reproduction row I is measured here only
  to fix the boundary of the class.
- **Rendering a `Result` usefully.** QRY-18 `:28` fixes the disposition as a
  rejection; changing it is a GOV-30 spec edit.
- **The `${r?}` render.** `${[r?]}` renders `x[null]` (§Reproduction row N).
  Owned by [0116](./0116-question-unwrapped-interpolation-renders-null.md); used
  here only as a control the descent must not fire on.
- **The closed panic-source enumeration.**
  `docs/spec_topics/errors-and-results/error-model.md:65–74` omits QRY-18's
  parse-coded interpolation panic. A load refusal narrows the inputs that reach
  that panic and changes the enumeration's silence in neither direction; it is
  owned by [0117](./0117-error-model-omits-parse-coded-interpolation-panic.md).
- **Whether `theta/parse/bare-object-literal` should reach an interpolation
  source** (§Reproduction row O) — bug 0114's §Non-goal, unchanged.
- **The `system:` interpolation surface**, which carries no `Result` by
  construction.

## Fix

**Not settled.** The subject is a route bug 0114 declined with a recorded
derivation, so the first obligation is to answer that derivation with
measurement rather than to restate the case for the upgrade. What follows pins
the constraints and names the open scope decisions.

**The shape of the change.** Two touches in one file, both extending existing
mechanisms rather than adding a classifier:

1. `interpolationIsResult` (`src/parser/type-layer-checks.ts:2218`) gains an
   `array` / `object` arm that returns true when any element (or field value)
   is a node `isCertainResultNode` (`:2252`) already accepts, recursing through
   nested `array` / `object` literals and skipping `try` operands the way
   `checkQueryInterpolationResults` skips a top-level `try` (`:2173–2180`).
2. The `let` arm's `resultBindings` write (`:1041`, guarded at `:1025`) records
   an unannotated initialiser that is such a literal, so the `ident` arm
   (`:2226–2229`) answers for `let xs = [Ok(1)]` and `let xs = [[Ok(1)]]`. The
   channel's identity keying carries the extension unchanged
   (`src/parser/static-type-inference.ts:211–216`, `:217–223`).

**The bar — bug 0114's five grounds, and what each is worth against
measurement.** Reproduced from that report's §Fix (0.108.0) and
`.pi/tmp/fixes/0114-report.md` residual (i):

1. *QRY-18 keys the table on the interpolated expression's own static type, and
   `:32` already dispositions the unresolvable case, so the note records an
   existing split rather than inventing a static obligation.* Unaddressed by
   this report on the type argument, which stands: a container's static type is
   not `Result<T, E>`. The counter is that the gate's accepting arms
   `:2223–2225` decide by **node kind**, not by type, and this class is decided
   the same way.
2. *Measured benefit is 2 of 12 rows, and reaches neither the primary `par for`
   row nor either schema-field row.* Corrected: 4 of 12 without the binding
   extension (L02, L06, L07, L09) and 6 of 12 with it (+L03, L10), measured in
   §Reproduction. The rest of the ground stands unchanged — L01, L11 and L12
   are unreachable, so the runtime arm remains load-bearing and this is an
   addition to it, never a replacement.
3. *GOV-15 minimality: the static half flips registration for sources that load
   clean today, a strictly larger governed change than route 2's for the same
   wire outcome.* Stands, and is the ground a filing cannot dissolve — it can
   only bound it. Measured bound: **zero** of the 34 committed
   `.theta` / `.thetalib` files (`git ls-files`) interpolate an array or object
   literal at all, so the committed-corpus flip count is zero, gate-enforced by
   `tests/committed-fixture-parse-gate.test.ts`.
   `tests/fixtures/h7a/permitted-codes.json` does not list the code and no
   shipped H9a fixture shape emits it; the implementer decides that from the
   real H9a run, as 0079 and 0114 both did.
4. *It extends the parse-layer surface whose false-positive risk bug 0079's
   round 1 measured (the nine controls).* Stands as the principal cost. The
   descent must keep silent: 0079's (a4)–(a7) (`:615`, `:628`, `:641`, `:655`)
   and (a11)–(a15) (`:727`, `:738`, `:748`, `:761`, `:774`), and the four
   nested-position controls measured in §Reproduction (L, M, N, P). Row L is the
   discriminating one for a name-keyed implementation and row N for a
   `try`-blind one.
5. *Constraint (d): route 2 added zero raise sites and zero emission sites.* The
   descent adds zero of either — it extends the predicate behind the **existing**
   sole emission at `:2182–2188`, leaving `grep -c "code:
   INTERPOLATED_RESULT_CODE" src/parser/` at 1 and
   `grep -c "throw new InterpolatedResultPanic" src/` at 1.

**Spec edits owed in the same commit.** Verified as written at HEAD: the
widened *Trigger* at `code-registry-parse.md:74` **does not** admit a load-time
emission for this sub-class — it excludes one ("reached only at runtime, never
at parse") — so a second *Trigger* touch is owed under DIAG-2
(`diagnostic-shape.md:72`), in the addition direction the diagnostic-registry
carve-out dispositions. DIAG-4 (`:74`) is untouched: the *Message* does not
change, and the row's other eight cells do not move. QRY-18's containment note
(`query-escapes-stringification.md:33`) needs the provable literal sub-case
carved out of its "this is the **runtime** arm" sentence, and the user-facing
mirror `docs/reference/frontmatter.md:283–287` needs the same distinction.
`docs/reference/diagnostics.md:123` carries no *Trigger* column and owes
nothing.

**Witness coordination — the sibling pins this fix must re-author.**
`assertNestedCarrierRefused` (`tests/interpolated-result-gate.test.ts:1280`)
asserts, as its direction 0, that each nested row's `diagnostics` array is
exactly `[]` (`:1281–1285`), with route 2 named in the failure message. Cells
(e3 / L02) `:1408`, (e4 / L03) `:1412`, (e7 / L06) `:1434`, (e8 / L07) `:1438`,
(e10 / L09) `:1449` and (e11 / L10) `:1457` move from "loads clean, panics" to
"refused at load", so their direction-0 pin has to be re-authored rather than
deleted, and the six rows that keep the runtime arm must keep running through
the helper unchanged. Bug 0079's protected block (lines 1–990) contains none of
them. The live H8a cell at
`tests/live/live-production-acceptance.test.ts:1413` asserts its `par for`
caller **registers** (`:1421–1435`), which a literal-only descent leaves green;
that precondition is the fastest red for a descent that over-reaches.

**Open scope decisions, for in-run adjudication.**

- Whether an **annotated** `let` whose initialiser is such a literal joins the
  class (§Reproduction rows I and J). The `annotation === undefined` guard at
  `:1025` exists because the annotation *is* the recorded type; a literal
  initialiser is a separate fact about the node, and row J is the case where the
  author wrote `Result` and got nothing.
- Whether a constructor-field literal joins it (row H,
  `S { xs: [Ok(1)] }` / `${s}`), which requires following the binding to its
  constructor rather than reading the interpolated node.
- How far the binding channel follows a chain (`let a = [Ok(1)]` / `let b = a` /
  `${b}`), and whether that is worth the identity-keying complexity at all.
- Whether the descent bounds its recursion depth. It walks parsed AST nodes, not
  runtime values, so CIO-3's `MAX_JSON_DEPTH` discipline does not apply the way
  it did to 0114's reach; a source-bounded walk is finite by construction.

**Witness — offline, provider-free, zero-token.** Every row of §Reproduction
settles inside one `parseThetaDocument` plus one production-composition drive,
so the harness is `tests/interpolated-result-gate.test.ts` extended, not a new
mechanism: its drive harness (`:521–552`), its registry oracle (`:176–207`) and
its nested-row table (`:1173–1246`) are reused. Required cells: the six provable
rows refused at load with exactly one diagnostic each, at the enclosing query's
range; rows K and R as the class's other measured members; rows I, J, H, L01,
L11 and L12 keeping the runtime arm; the four nested-position controls (L, M, N,
P) and 0079's nine parse-layer controls silent; and the top-level positions bug
0079 closed — cells (g1)–(g6) of the same witness — unchanged, so a regression
of the top-level gate reds here.

## Provenance

- Filing origin: bug
  [0114](./0114-nested-result-in-interpolated-object-leaks-carrier.md)
  `## Fix (0.108.0)` §*Residuals* (i) — "**The load-refusal upgrade for the
  provable subset was declined, not overlooked**" — and the same residual in
  that run's report, `.pi/tmp/fixes/0114-report.md:279–289`, which adds "the
  parent may wish to file it" and gives the `resultBindings` cites
  (`src/parser/type-layer-checks.ts:891`, written at `:1041`). Both cites are
  correct at this HEAD and were re-verified by symbol rather than copied. The
  five declining grounds are recorded in the same report at `:24–36`.
- What this report adds beyond the residual: the HEAD re-measurement of the
  whole class through the parse-and-drive harness (eighteen rows, §Reproduction);
  the correction of the residual's 2-of-12 arithmetic to 4-of-12 and 6-of-12 by
  identifying L06 and L07 as the same node shape as L02; two further members of
  the class outside 0114's table (rows K and R); the boundary rows that no
  descent of the described shape reaches (I, J, H) and the three that no descent
  reaches at all (L01, L11, L12); four nested-position false-positive controls
  measured at HEAD (L, M, N, P), of which row N shows the `try` skip the descent
  must inherit; the determination that the widened *Trigger* at
  `code-registry-parse.md:74` forecloses rather than admits a load-time emission
  for this sub-class, so a second DIAG-2 touch is owed; the dispatch-order
  verification fixing what the late refusal costs (`runBinder` at
  `theta-composition-producer.ts:410` before `executeBody` at `:440`, with the
  model call itself reached only past the bypass returns at
  `production-theta-producer.ts:729–735` and `:741–753`); the registration-gate
  citation making the load-refusal alternative concrete
  (`production-composition.ts:2214`, `:1729`); the committed-corpus flip bound
  (zero of 34); and the sibling-witness coordination list.
- Tree measured: HEAD `a8d95853`, v0.108.0 (`package.json`); the last
  code-bearing commit in the tree is `b123206f` (bug 0114's fix, 0.108.0) —
  `a8d95853` and `5c9104ab` are docs-only.
  A sibling session held uncommitted edits to `src/parser/theta-document.ts` and
  `src/parser/frontmatter.ts` in the main tree during this work, so every
  measurement and every citation was taken in a detached worktree checked out at
  `a8d95853`; the worktree was removed afterwards.
- Implementation read at `a8d95853`: `src/parser/type-layer-checks.ts` (`:891`,
  `:1025`, `:1041`, `:2085`, `:2164`, `:2168–2180`, `:2182–2188`, `:2218`,
  `:2222–2242`, `:2252`, `:2269`); `src/parser/static-type-inference.ts`
  (`:211–216`, `:217–223`); `src/parser/theta-document.ts` (`:153–156`,
  `:236–240`); `src/extension/production-theta-producer.ts` (`:723`,
  `:729–735`, `:741–753`, `:5903`, `:5934–5970`, `:5987`, `:6010`, `:6079`);
  `src/extension/theta-composition-producer.ts` (`:410`, `:417`, `:422`,
  `:440`, `:477–489`); `src/extension/production-composition.ts` (`:1729`,
  `:2214`, `:2261`); `src/render/query-render.ts` (`:80`, `:95`, `:110`);
  `src/runtime/value.ts` (`:186`, `:300`, `:443`).
- Spec read: `docs/spec_topics/query/query-escapes-stringification.md:16`,
  `:26`, `:27`, `:28`, `:32`, `:33`, `:34`;
  `docs/spec_topics/diagnostics/code-registry-parse.md:74`;
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72`, `:74`;
  `docs/spec_topics/runtime-value-model.md:14`, `:16`;
  `docs/spec_topics/errors-and-results/error-model.md:65–74`. Mirrors:
  `docs/reference/frontmatter.md:283–287`; `docs/reference/diagnostics.md:123`.
- Tests read (none modified): `tests/interpolated-result-gate.test.ts` (`:176–207`,
  `:521–552`, `:615`, `:628`, `:641`, `:655`, `:727`, `:738`, `:748`, `:761`,
  `:774`, `:1173–1246`, `:1280–1316`, `:1408`, `:1412`, `:1434`, `:1438`,
  `:1449`, `:1457`);
  `tests/live/live-production-acceptance.test.ts` (`:1389–1411`, `:1413`,
  `:1421–1435`); `tests/fixtures/h7a/permitted-codes.json`.
- Method: one scratch vitest file in the HEAD worktree, over the real
  `parseThetaDocument` and the real production-composition drive
  (`createProductionProducerDeps` → `bindPromptConversation` → `executeBody`)
  against bug 0079's live-session double, prompt text read at
  `pi.sendUserMessage` and the throw captured; eighteen rows; deleted after
  measurement, with the worktree removed and pruned. No provider and no model
  were involved. No file under `src/`, `tests/` or `docs/` was written by this
  filing other than this document; `docs/bugs/README.md` and every other bug
  document are unmodified by it.

## Re-derivation note — 2026-08-23, at HEAD `8dd418b9` (0.246.0)

Appended by a re-derivation pass. **Note only — nothing above is altered, no
code, test or spec file is touched, and this report stays `open` with §Fix
still unsettled.** `docs/bugs/README.md` is untouched.

**Verdict: the subject face survives intact and is NOT mooted; the run STOPS
without implementing, because the route §Fix leaves open cannot be settled
without changing spec meaning and flipping a sibling witness's asserted
direction.** The question this report asks for is restated at the end of this
note, unanswered.

### Per-row probe table (re-measured at this HEAD)

One scratch vitest file, offline and provider-free, reusing this witness's own
harness verbatim in shape — `parseOnly` (`tests/interpolated-result-gate.test.ts`,
the real `parseThetaDocument` behind `parseDeps`) and `drive` (same file:
`createProductionProducerDeps` → `bindPromptConversation` → `executeBody`
against its `LiveSessionDouble`, prompt text read at `pi.sendUserMessage`).
Frontmatter `mode: prompt` throughout. Written, run, and deleted; no repository
file was written by the measurement. `P` abbreviates
`InterpolatedResultPanic / theta/parse/interpolated-result / "Result value
cannot be interpolated; unwrap with ? or match first"`.

| # | Input | `diagnostics` | `sent` | `thrown` | vs §Reproduction |
|---|---|---|---|---|---|
| A | `${[Ok(1)]}` | `[]` | `[]` | `P` | same |
| G | `${[Ok(1), Err(2)]}` | `[]` | `[]` | `P` | same |
| Q | `${[1, Ok(2), "s"]}` | `[]` | `[]` | `P` | same |
| B | `${ {r: Ok(1)} }` | `[]` | `[]` | `P` | same |
| C | `let xs = [Ok(1)]` / `${xs}` | `[]` | `[]` | `P` | same |
| D | `let xs = [[Ok(1)]]` / `${xs}` | `[]` | `[]` | `P` | same |
| E | `${Ok(1)}` | `[error theta/parse/interpolated-result]` | `[]` | `P` | same |
| K | annotated-`fn` call inside an array literal | `[]` | `[]` | `P` | same |
| R | `${ {a: 1, r: Err(2)} }` | `[]` | `[]` | `P` | same |
| I | `let xs: array<integer> = [Ok(1)]` / `${xs}` | `[]` | `[]` | `P` | same |
| J | `let xs: array<Result<integer, QueryError>> = [Ok(1)]` / `${xs}` | `[]` | `[]` | `P` | same |
| H | `S { xs: [Ok(1)] }` / `${s}` | `[]` | `[]` | `P` | same |
| **L** | `enum St { Ok, Bad }` / `${[St.Ok]}` | `[error theta/parse/reserved-keyword-as-identifier]` | `["x[\"Ok\"]"]` | none | **DRIFTED** — see below |
| M | `schema F { ok, label }` inside an array literal | `[]` | `["x[{\"ok\":true,\"label\":\"x\"}]"]` | none | same |
| **N** | `let r = Ok(1)` / `${[r?]}` | `[]` | `["x[1]"]` | none | **DRIFTED** — see below |
| P | `${[[1, 2], [3]]}` | `[]` | `["x[[1,2],[3]]"]` | none | same |
| F | `${[1, 2]}` | `[]` | `["x[1,2]"]` | none | same |
| O | `let o = { r: Ok(1) }` / `${o}` | `[error theta/parse/bare-object-literal]` | `[]` | `P` | same |
| X1 | `let a = Ok(1)` / `let b = a` / `${b}` | `[error theta/parse/interpolated-result]` | `[]` | `P` | new row |
| X2 | `let a = [Ok(1)]` / `let b = a` / `${b}` | `[]` | `[]` | `P` | new row |
| X3 | `for e in [Ok(1)]` with `${e}` in the body | `[]` | `[]` | `P` | new row |

**The six-row provable class is unmoved.** Rows A, G, Q, B, C and D each still
load with `diagnostics []`, send nothing, and abort the drive with the
registered code and the registered *Message*. So are the class's two further
members outside bug 0114's table (K, R) and the three boundary rows no descent
of the described shape reaches (I, J, H). §Summary, §Reproduction's first
block, §Expected behaviour and §Why it matters all re-measure true at this HEAD.

### The defect site is structurally unchanged

`interpolationIsResult` (`src/parser/type-layer-checks.ts:3316`, was `:2218`)
still switches on the interpolated expression's top-level node kind (`:3320`)
and still returns `false` from its `default` arm (`:3332–3339`) for an `array`
and an `object` literal, with the same three accepting arms — `result-ctor` /
`call` (`:3321–3323`), `ident` (`:3324–3327`), `index` (`:3328–3331`) — and the
same comment scoping the default to expressions that "type as a `named`
reference built from an author-chosen identifier". `checkQueryInterpolationResults`
(`:3262`, driven from `walkExpr`'s `query` arm at
`src/parser/type-layer-checks.ts:3175`) still skips a top-level `try`
(`:3271–3278`) and still holds the sole static emission (`:3279–3287`). The
`let` arm still mints a `resultBindings` (`:1423`) membership only under
`annotation === undefined && this.isCertainResultNode(stmt.init)`
(guard `:1615`, add `:1642`), and `isCertainResultNode` (`:3356`) still answers
for exactly two node kinds; `isResultGenericType` (`:3373`) still requires
`type.kind === "named"`. `ArrayExpr` is now
`src/parser/theta-document.ts:168–171` and `ObjectExpr`
`src/parser/theta-document.ts:293–297`.

Both of constraint 5's counts hold at this HEAD: one `code:
INTERPOLATED_RESULT_CODE` under `src/parser/` and one
`throw new InterpolatedResultPanic` under `src/` — the raise now sits behind a
one-line `raiseInterpolatedResult` wrapper
(`src/extension/production-theta-producer.ts:6291–6292`), still the sole
`throw`, reached from `src/extension/production-theta-producer.ts:6278` and
`src/extension/production-theta-producer.ts:6550`.

The committed-corpus flip bound is re-measured and unchanged: 34 committed
`.theta` / `.thetalib` files, **zero** of which interpolate an array or object
literal at all (`git ls-files '*.theta' '*.thetalib'`, then a scan of every
`${…}` source for a leading `[` or `{` — no match).

### The corpus still forecloses the upgrade, in both places

Re-read at this HEAD, verbatim-unchanged in text:

- `docs/spec_topics/query/query-escapes-stringification.md:33` (line unmoved) —
  "A container's own static type is never `Result<T, E>`, so this is the
  **runtime** arm of the previous note".
- The `theta/parse/interpolated-result` registry row, now
  `docs/spec_topics/diagnostics/code-registry-parse.md:83` (was `:74`; a
  file-wide shift, *Trigger* text byte-identical) — "this sub-case is reached
  only at runtime, never at parse".
- The user-facing mirror, now `docs/reference/frontmatter.md:331–334` (was
  `:283–287`), stating the same split.

QRY-18's `:32` posture sentence, its `array<T>` (`:26`), Schema-typed-object
(`:27`) and `Result<T, E>` (`:28`) rows, and DIAG-2 / DIAG-4
(`docs/spec_topics/diagnostics/diagnostic-shape.md:72`,
`docs/spec_topics/diagnostics/diagnostic-shape.md:74`) are all unmoved. So
§Fix's "spec edits owed in the same commit" paragraph is correct as written,
with the one line-number correction above.

### Dischargers checked, none of which reaches this face

| Candidate | Reaches this face? | Evidence |
|---|---|---|
| bug 0247 (v0.227.0, category-1 clause, `placeholder-rendering-a`) | **No** | Its subject is generic *Message* placeholder rendering (`<type>` / `<expected>`); it names neither `interpolationIsResult` nor `INTERPOLATED_RESULT_CODE`, and it edits neither QRY-18 `:33` nor the registry row. |
| bug 0201 (v0.118.0, envelope walk) | **No** | Its twelve mentions of interpolation all cite bug 0114's containment rule as *precedent* for the subagent-envelope writer's own bounded walks; it modifies neither `query-escapes-stringification.md:33` nor the interpolation registry row. |
| bug 0202 (v0.119.0, envelope walk) | **No** | Zero occurrences of "interpolat" in the report; its subject is carrier-vs-wire depth counting at the envelope boundary. |
| bug 0199 (`resultBindings` inherited half) | **Partly, and not into this class** | The inheritance (`src/parser/type-layer-checks.ts:1643`, add at `src/parser/type-layer-checks.ts:1655`) is live for an ident→ident chain of a *certain* `Result` — row X1 is now refused at load — but not for a literal container through an alias (X2) nor for a loop element (X3). One of §Fix's open scope decisions, "how far the binding channel follows a chain", is therefore answered for the certain-`Result` case and still open for the container case. |

### Measured drift — two of the report's control rows

1. **Row L is no longer a load-clean control.** `enum St { Ok, Bad }` now draws
   one error `theta/parse/reserved-keyword-as-identifier` ("reserved keyword
   'Ok' cannot be used as an identifier"), because `Ok` is one of
   `docs/spec_topics/lexical.md:20`'s 32 reserved spellings and bug 0153's fix
   (0.194.0) closed the enum-variant position that had been silent. The
   rendered text and the absence of a throw are unchanged (`["x[\"Ok\"]"]`, no
   throw), so nothing about the runtime arm moves — but §Fix ground 4 calls row
   L "the discriminating one for a name-keyed implementation", and that
   spelling can no longer discriminate, since it is refused at load by an
   unrelated code whether or not a descent fires. **Any implementer of §Fix
   owes a replacement discriminator for the name-keyed false positive** — an
   enum whose variant is not itself a reserved keyword, or a `fn` or field
   named after one.
2. **Row N's `null` is gone.** `let r = Ok(1)` / `${[r?]}` now renders
   `x[1]` — the unwrapped payload — rather than `x[null]`. Bug 0116 is **fixed
   (0.128.0)**, and its symptom is discharged at the nested position too. The
   row remains a valid must-stay-silent control (`diagnostics []`, no throw)
   and §Fix's `try`-skip obligation is unchanged; only the §Non-goals sentence
   describing the row's render, and §Reproduction row N's `sent` value, are
   stale.

### Sibling-witness state, re-derived by symbol

`tests/interpolated-result-gate.test.ts` is now **2555** lines (was 1679).
`assertNestedCarrierRefused` is at `tests/interpolated-result-gate.test.ts:1377`,
and its direction-0 assertion — `doc.diagnostics.map(…)` `.toEqual([])`, failure
message "bug 0114 §Fix (a) route 2 (settled): the nested disposition is
RUNTIME-only …" — is at `tests/interpolated-result-gate.test.ts:1378–1383`. The
nested-row table is `tests/interpolated-result-gate.test.ts:1268–1338`. The six
cells this fix would have to re-author are at
`tests/interpolated-result-gate.test.ts:1506` (L02),
`tests/interpolated-result-gate.test.ts:1510` (L03),
`tests/interpolated-result-gate.test.ts:1532` (L06),
`tests/interpolated-result-gate.test.ts:1536` (L07),
`tests/interpolated-result-gate.test.ts:1547` (L09) and
`tests/interpolated-result-gate.test.ts:1555` (L10).

The doc's "bug 0079's protected block (lines 1–990)" is stale as a line range
and as a phrase — no such phrase appears in the file — but the underlying claim
holds: 0079's `describe` blocks end at
`tests/interpolated-result-gate.test.ts:1028` and contain none of the six
cells, which live in the bug 0114 nested-carrier describe at
`tests/interpolated-result-gate.test.ts:1483–1600`.

The live H8a cell is now at `tests/live/live-production-acceptance.test.ts:1830`
(fixture `tests/live/live-production-acceptance.test.ts:1815–1827`), and its
registration precondition
(`tests/live/live-production-acceptance.test.ts:1837–1849`) still reads "A
regression that widened the static gate to refuse this shape at load (route 1,
deliberately declined) would red HERE first". Not run by this pass — no code
changed, so no live-exercised surface moved.
`tests/fixtures/h7a/permitted-codes.json` still lists eleven codes, none of
them `theta/parse/interpolated-result`.

### Why this pass stops rather than implements

§Fix is marked **Not settled** and leaves four open scope decisions plus the
corpus-direction question itself ("Which way the corpus should read is the
adjudication this report asks for"). Its own constraints do not force a route.
Settling it in-run would require both of the things a bounded in-run
adjudication may not do:

1. **Changing spec meaning.** Two normative sentences currently say the
   opposite of the proposed disposition —
   `docs/spec_topics/query/query-escapes-stringification.md:33` and
   `docs/spec_topics/diagnostics/code-registry-parse.md:83` — and a third
   mirrors them at `docs/reference/frontmatter.md:331–334`. Re-wording them is
   a posture change, not a citation repair; DIAG-2 makes the registry touch
   same-commit-mandatory, so the code cannot land without it.
2. **Flipping a sibling witness's asserted direction.** Six cells assert, as
   their direction 0, that these exact sources load with `diagnostics []`, with
   route 2 named as *settled* in the failure message. Re-authoring them inverts
   a pin another report deliberately placed, and the live H8a cell's
   precondition comment records route 1 as "deliberately declined".

**The question, stated and left unanswered:** *does QRY-18 `:32`'s "static
where possible" posture govern the sub-class whose `Result`-ness is provable
from the parsed node — carving the four literal rows (L02, L06, L07, L09), and
optionally the two `resultBindings` rows (L03, L10), out of `:33`'s blanket
"this is the **runtime** arm" — or does `:33`'s container-ness ground govern the
whole containment class as bug 0114 settled it, leaving this report a recorded
non-defect?* Answering it takes named doc authority to re-word
`docs/spec_topics/query/query-escapes-stringification.md:33`, the registry
*Trigger* at `docs/spec_topics/diagnostics/code-registry-parse.md:83` and the
mirror at `docs/reference/frontmatter.md:331–334`, and to re-author the six
direction-0 pins. Without that authority the correct disposition of this report
is unchanged: **open, §Fix unsettled, behaviour at HEAD spec-conformant.**

## Closure — wontfix by operator ruling (2026-08-23)

OPERATOR RULING (fifteenth set, ruling 4): 0196 = option 2 — the runtime arm
stands for the whole container class; bug 0114's settlement (container-ness
governs) is reaffirmed. The shipped behaviour matches the spec as written
(query-escapes-stringification.md line 33's blanket runtime-arm rule,
code-registry-parse.md line 83's Trigger, frontmatter.md lines 331–334's
mirror) and six direction-0 witness pins; the filed claim rests on QRY-18
line 32's posture sentence, which line 33 immediately qualifies. Option 1
(a load-refusal carve-out for the provable sub-class) was REJECTED: three
spec pages rewritten against their meaning + a DIAG-2 registry change + six
settled pins flipped, to reopen a settled design for an S4 with a
fail-closed runtime face. Closed wontfix per the bug 0068 precedent — not a
defect; the two re-derivation notes above stand as the record (21-row probe
at 0.246.0: behaviour byte-identical to 0.108.0). Sharpening the line-32
posture sentence ('static where the rules below make it static') is
optional residual-filing material, not this report's subject. No code
moved; no version taken.
