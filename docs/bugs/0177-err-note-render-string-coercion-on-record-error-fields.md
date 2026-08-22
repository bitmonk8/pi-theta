# Bug 0177 — The SLSH-3 `Err`-note renderer and the XMODE-1 invoke wrap embed a `QueryError` field in a template string with no stringification rule: `renderLeafKindNote`'s seven interpolating SNK rows (`${leaf.kind}`, `${e.message}`, `${e.tool_name}`, `${e.cause}`, `${e.callee_path}`, `${e.attempts}`, `${e.rounds}`) and `String(innerKind)` at `effectful-statement-host.ts:401` all assume a string, where the type layer admits a schema-typed record at every one of those positions with zero diagnostics — a plain-prototype record renders the user-facing note `theta /<name> returned Err: [object Object] — m`, the exact default QRY-18 forbids for the same class one page over, and since bug 0173 null-prototyped the inbound rebuild a typed-`invoke<T>`-bound record raises `TypeError: Cannot convert object to primitive value` from inside the renderer, replacing the SLSH-3 note with the `theta/runtime/internal-error` framing `theta /<name> aborted with internal error: …`

- **Status:** fixed (0.186.0). The rendering rule §Fix (b) left undecided is
  settled by the fix record below (**§Fix (0.186.0) — the 0177 field-rendering
  law**), which is the citable authority for any later report that renders a
  non-string value into a user-facing note. The original constraint-pinned
  statement follows: the fix surface is
  fixed (the seven interpolating SNK rows in `src/runtime/err-note-render.ts`
  and the one `String(…)` in `src/runtime/effectful-statement-host.ts` — eight
  sites), but *what* a
  non-string field renders as is undecided, and the corpus carries two
  precedented answers that disagree — the descriptor summary
  `summariseNonResultOperand` produces (`src/runtime/runtime-panics.ts:440`) and
  the compact `JSON.stringify` that QRY-18
  (`docs/spec_topics/query/query-escapes-stringification.md:16`, `:27`) and
  `summariseScrutinee` (`src/runtime/match-result.ts:58`) produce. Choosing
  between them decides whether SLSH-4's verbatim-template rule
  (`docs/spec_topics/slash-invocation.md:33`) needs a spec edit, so the choice
  is made in-run against the evidence in §Fix (b).
  Residual **R1** of the bug 0173 fix (0.96.0, commit `21988875`), recorded in
  that run's report (`.pi/tmp/fixes/0173-report.md` §*Residuals / notes* R1) and
  not filed there — a fix run creates no bug docs.
  Ordering: nothing blocks this report from starting, and it blocks nothing.
  [0173](./0173-inbound-rebuild-record-not-null-prototyped.md) is **fixed
  (0.96.0)** and is what turned this defect's second observable from
  `[object Object]` into a throw; its §Fix constraint 3 owes exactly this
  enumeration and its constraint 4 forbade extending scope to these two files,
  which is why the enumeration arrives as a report rather than as code.
- **Sev/Diff estimate:** S2/D3 — S2 because both observables are *wrong or
  misleading failure*, not silent corruption. The `[object Object]` half emits a
  user-facing note whose one informative placeholder carries no information; the
  throwing half replaces the SLSH-3 note the spec requires
  (`slash-invocation.md:31`) with a `theta/runtime/internal-error` framing
  (`theta /<name> aborted with internal error: Cannot convert object to
  primitive value`), i.e. the wrong registered code and a message naming a JS
  coercion, for a theta that returned an `Err` **value** and did not abort.
  Nothing is mis-valued in silence, which is what keeps it out of S1; it is not
  a verification gap (S3) either — a shipped production render path is what
  breaks, and its committed witness (`tests/err-note-render.test.ts`, 16 cells,
  green) is correct as far as it goes, every cell supplying string fields.
  Reachability is weighed honestly and it is not uniform: the `[object Object]`
  half needs only author-written theta source and no `invoke` at all
  (§Reproduction (c), row 1, `[]` diagnostics), while the throwing half
  additionally needs a record minted by `translateInbound`, i.e. a typed
  `invoke<T>` return that AJV passed (§Reproduction (d)); no committed
  `.theta` / `.thetalib` constructs either (census: 5 of 34 files use `Err(`,
  all with string-literal `kind`), and the chain from the bound record to the
  render site is traced in source, not driven end to end (§Reproduction (e)).
  D3 because §Fix needs in-run adjudication of the rendering rule against two
  disagreeing corpus precedents and against SLSH-4's verbatim-template MUST, and
  because the change spans two modules whose one committed witness pins all ten
  SNK templates by string equality.
- **Kind:** defect — a user-facing render path embeds a value in a template
  string without applying any stringification rule, where the corpus has decided
  that class three times and decided it against JavaScript's default. Four
  elements, each measured at HEAD `21988875` (v0.96.0).
  1. *Seven of the ten SNK rows interpolate a payload field with bare template
     substitution.* `renderLeafKindNote` (`src/runtime/err-note-render.ts:105`)
     switches on `leaf.kind` (`:111`) and returns a template literal per row.
     The interpolating rows are SNK-a `${e.attempts}` (`:121`), SNK-c
     `${e.message}` (`:126`), SNK-d `${e.tool_name}` / `${e.message}` (`:131`),
     SNK-g `${e.tool_name}` / `${e.cause}` / `${e.message}` (`:145`), SNK-h
     `${e.rounds}` / `${lastTool}` (`:152`, over `e.last_tool_name ?? "respond"`
     at `:151`), SNK-i `${e.callee_path}` / `${e.cause}` (`:157`), and the SNK-k
     catch-all `${leaf.kind}` / `${leaf.message}` (`:161`, in the `default:` arm
     opened at `:159`). Three rows interpolate nothing and are unaffected: SNK-b
     (`:118`), SNK-e (`:136`), SNK-f (`:140`). A template substitution is
     `ToString(value)`; for a plain-prototype record that is `[object Object]`
     and for a null-prototype record it throws (§Reproduction (a), (b)).
  2. *`String(innerKind)` at the invoke wrap has the same shape and fires
     first.* `runInvokeEffect`
     (`src/runtime/effectful-statement-host.ts:354`) reads
     `const innerKind = (result.error as { readonly kind?: unknown } | null)?.kind`
     (`:394`) — typed `unknown`, so the code already states the field is not
     statically known — tests it against two literals (`:395`), and on every
     other value builds the XMODE-1 wrapper message
     `invoke of ${child.calleePath} callee returned Err(${String(innerKind)})`
     (`:401`, into `surfaceThetaCallableCalleeFailure`, `:398`,
     `src/runtime/tool-call.ts:796`). This site is reached whenever a callee
     returns its own `Err`, before any note is rendered, so on the invoke route
     it is the first coercion, not the renderer.
  3. *The type layer admits a record at those positions with zero diagnostics.*
     ERR-15 (`docs/spec_topics/errors-and-results/queryerror-variants.md:23`)
     types `kind` as `string` rather than a closed enum, and the TS mirror
     carries `kind: string` on every variant (`src/runtime/query-error.ts:52`
     and eight siblings). But a theta author's `Err(…)` payload is any theta
     value: measured, `schema E { kind: I, message: string }` over
     `schema I { n: string }` parses with `[]` diagnostics in three forms —
     object literal, schema-typed binding, and typed-`invoke<T>`-bound binding
     (§Reproduction (c)). The declared-`string` form *is* refused
     (`theta/parse/object-field-type-mismatch`), so the admission is through the
     author's own error schema, not through a gap in field-type checking. The
     boundary that hands that value to the renderer asserts the TS type by
     unchecked cast and checks nothing:
     `deps.emitTopLevelErrNote(theta.slashName, terminal.error as unknown as QueryError)`
     (`src/extension/theta-composition-producer.ts:431`).
  4. *The corpus has decided this exact class three times, against
     `String(…)`.* QRY-18 (`query-escapes-stringification.md:16`) states the
     rule and the reason in one sentence: interpolation renders "*not* by
     JavaScript's default `String(...)`, whose `[object Object]` and
     comma-joined-array defaults would silently corrupt prompts without any
     diagnostic for the author", and its table renders a schema-typed object as
     compact `JSON.stringify` (`:27`). `summariseScrutinee`
     (`src/runtime/match-result.ts:58`) implements that posture for the `match`
     panic message (`:88–89`), and `summariseNonResultOperand`
     (`src/runtime/runtime-panics.ts:440`) implements a stricter descriptor-only
     posture for the `?`-operand defect message, explicitly rejecting
     `JSON.stringify` for cycles and unbounded size (`:429–439`). None of the
     eight positions in element 1 or 2 consults any of them.
- **Related:**
  - **0173** —
    [`0173-inbound-rebuild-record-not-null-prototyped.md`](./0173-inbound-rebuild-record-not-null-prototyped.md),
    **fixed (0.96.0)**, the parent. Its fix built `rebuildInbound`'s record with
    `Object.create(null)` (`src/runtime/wire-translation.ts:299`) and
    `lowerOutbound`'s the same way (`:366`), which is what turns this report's
    second observable from a bad string into a throw. Its §Fix **constraint 3**
    inherits from bug 0119 route (a) the obligation to enumerate the
    string-coercion consumers of the values it produces, bounded to three named
    surfaces; its §Fix **constraint 4** fixes scope at "the two record builds in
    `src/runtime/wire-translation.ts` and nothing else". The two sites here fall
    inside constraint 3's obligation and outside constraint 4's scope, so the
    0.96.0 run recorded them and filed nothing. **This report does not reopen
    0173.** Its `## Fix (0.96.0)` record and its witness
    (`tests/wire-translation-inbound-retag.test.ts`, 17 cells) stay as they are.
  - **0119** —
    [`0119-proto-named-field-silently-dropped.md`](./0119-proto-named-field-silently-dropped.md),
    **open**, where the coercion cost was first measured and where the sweep
    this report performs was first owed. Its §Fix route (a) records
    `String(record)`, `"x" + record` and a JS template embedding of a
    null-prototype record all raising
    `TypeError: Cannot convert object to primitive value`, notes that the theta
    `+` route is parse-closed (`theta/parse/mixed-plus-operands`) and that
    QRY-18 renders through `JSON.stringify`, and closes with the sentence this
    report discharges for the inbound value: "No other coercion site was
    enumerated, so a null-prototype route owes that sweep." **Boundary.** 0119
    owns the theta-side *construction* sites that would mint null-prototype
    records if its route (a) landed; this report owns two *consumers*, and its
    first observable does not depend on 0119's route being taken at all.
  - **0172** —
    [`0172-inbound-translation-pass-unperformed-at-three-boundaries.md`](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md),
    **open at the time of writing** (§Status line read at `21988875`; the report
    is in flight in the same session, so read its own Status rather than this
    line). It owns the three inbound boundaries `runtime-value-model.md:34`
    names and the runtime does not perform — typed query results, typed
    tool-call return decoding, binder `args`. **It widens this report's
    reachability and is not a prerequisite in either direction.** Every boundary
    it wires calls `translateInbound`, and every record that walk rebuilds is
    null-prototyped since 0173, so each newly wired boundary adds a route by
    which a theta binding holds a record that throws on coercion — and, unlike
    the typed-`invoke<T>` route, those payloads are model-produced. Neither fix
    changes the other's verdicts and the two touch no common file.
  - **0134** —
    [`0134-params-shift-induced-stale-citations.md`](./0134-params-shift-induced-stale-citations.md),
    **open**, the adjudicated do-not-chase class for positional drift.
    `src/extension/production-theta-producer.ts` is 6165 lines at this HEAD and
    `src/runtime/err-note-render.ts` is a 207-line file whose SNK rows shift by
    one comment line, which is why every position below is named by symbol and
    by SNK label beside its line number.
- **Affected** (every citation re-verified against the tree at HEAD `21988875`,
  v0.96.0, by `rg` and by reading the file; symbols and SNK labels named beside
  lines):
  - **The renderer.** `renderLeafKindNote`
    (`src/runtime/err-note-render.ts:105`), its ERR-15 doc-comment (`:107–110`)
    and the `switch (leaf.kind)` (`:111`). The seven interpolating rows: SNK-a
    (`:121`), SNK-c (`:126`), SNK-d (`:131`), SNK-g (`:145`), SNK-h (`:151–152`),
    SNK-i (`:157`), SNK-k (`:159–162`, the return at `:161`). The three
    non-interpolating rows: SNK-b (`:118`), SNK-e (`:136`), SNK-f (`:140`).
    `renderTopLevelErrNote` (`:175`), its `invoke_callee` walk to the leaf
    (`:178–181`) and its call into the per-kind row (`:182`);
    `isInvokeCalleeError` (`:205`).
  - **The invoke wrap.** `runInvokeEffect`
    (`src/runtime/effectful-statement-host.ts:354`), the child resolve (`:359`),
    the trampoline call (`:360`, `runInvokeChild`,
    `src/runtime/invoke-cancellation.ts:91`), the `innerKind` read (`:394`), the
    two-literal passthrough (`:395`), the wrapper construction (`:398`,
    `surfaceThetaCallableCalleeFailure`, `src/runtime/tool-call.ts:796`) and the
    coercion (`:401`).
  - **The boundary that hands the value over unchecked.**
    `emitTopLevelErrNote` (`src/extension/production-theta-producer.ts:1323`,
    its `renderTopLevelErrNote` call at `:1327`, its interface member at
    `src/extension/theta-composition-producer.ts:301`), reached from the
    slash-dispatch terminal-`Err` gate (`:430–431`) whose cast is
    `terminal.error as unknown as QueryError`.
  - **The framing a throw lands in.** The slash-dispatch outer catch
    (`src/extension/theta-composition-producer.ts:443`), `surfaceUnexpectedThrow`
    (`src/runtime/runtime-panics.ts:496`, the generic arm at `:528–543`,
    `INTERNAL_ERROR_CODE` at `:48`, the `internal error: <message>` template at
    `:540`), the prefix strip (`theta-composition-producer.ts:72`, `:488–489`)
    and the emitted note
    `theta /${theta.slashName} aborted with internal error: ${detail}` (`:492`).
    At an `invoke` parent the same throw is re-wrapped by `runInvokeChild`'s
    boundary catch (`invoke-cancellation.ts:125–145`, over the `child.drive()`
    at `:123`) as `Err(InvokeInfraError { cause: "internal_error" })`.
  - **The record's mint.** `translateInbound`
    (`src/runtime/wire-translation.ts:130`), `rebuildUnder` (`:198`) and
    `rebuildInbound` (`:223`); the fresh-record guard (`:266–279`) and the
    `Object.create(null)` build bug 0173 landed (`:299`), plus the outbound twin
    (`:366`). Its one wired production caller `#validateInvokeReturn`
    (`src/extension/production-theta-producer.ts:3436`), whose `!result.ok`
    passthrough (`:3442–3443`) is why a callee-returned `Err` reaches element 2
    unexamined, whose `verdict.ok` gate (`:3463`) and `translateInbound` call
    (`:3472–3477`) are why a passing typed return reaches theta code
    null-prototyped, and whose two call sites are the prompt→prompt attach cell
    (`:3332`) and the subagent spawn cell (`:3370`).
  - **The carriage from a bound record into an `Err` payload.**
    `buildObjectSchemaValue` (`src/runtime/value.ts:385`), which stores field
    values by reference (`:402`) into a plain-prototype container and brands it
    through `brandSchemaValue` (`:277`) — an `Object.defineProperty` on a symbol
    key, which installs no `toString` and no `Symbol.toPrimitive`, so the brand
    does not change any coercion here.
  - **The three coercion-safe postures the corpus already ships.**
    `summariseNonResultOperand` (`src/runtime/runtime-panics.ts:440`, its
    doc-comment at `:429–439`, its `typeof` dispatch at `:444`, its capped
    own-key list at `:461`), called from `QuestionOperandDefectError` (`:420`,
    the message at `:423`); `summariseScrutinee`
    (`src/runtime/match-result.ts:58`, the boxed-`String` arm at `:74`, the
    array arm at `:77`, the compact-`JSON.stringify` fallthrough at `:88–89`),
    called from the `match` panic (`:160`); and QRY-18's interpolation rule
    (`docs/spec_topics/query/query-escapes-stringification.md:16`, the
    schema-typed-object row at `:27`).
  - **Spec.** `docs/spec_topics/slash-invocation.md:31` (SLSH-3 — the one-line
    note at the slash-dispatch boundary, and "For a directly-slash-invoked
    subagent-mode theta this note is the only user-facing surface for the
    failure"), `:33` (SLSH-4 — "Renderers MUST emit the surrounding template
    text verbatim; only the `<…>` placeholders are interpolated"), `:37–48` (the
    SNK-a … SNK-k table, the catch-all row at `:48`);
    `docs/spec_topics/errors-and-results/queryerror-variants.md:21` (the
    discriminator-openness paragraph), `:23` (ERR-15);
    `docs/spec_topics/query/query-escapes-stringification.md:16` (QRY-18), `:27`
    (the schema-typed-object row);
    `docs/spec_topics/diagnostics/code-registry-runtime.md:22`
    (`theta/runtime/internal-error` — its trigger names "a host-function
    `TypeError`" and its slash surface is
    `"theta /<name> aborted with internal error: <message>"`);
    `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15
    observable (c), byte-identical `theta-system-note` content strings);
    `docs/spec_topics/diagnostics/placeholder-rendering-a.md:7` (the
    placeholder-rendering closure — scoped to the four Code-registry pages'
    *Message* columns, so it does **not** govern the SNK rows, which is why
    SLSH-4 is the only rule in force on them).
  - **The committed cells a fix must not red.**
    `tests/err-note-render.test.ts` — 16 cells, green at this HEAD, asserting
    every SNK template by string equality through both entry points; its SNK-k
    cell (`:245–258`) pins totality over an unlisted `kind` and asserts
    `not.toThrow()`, but every fixture it builds supplies string fields
    (`:45–128`). `tests/e2e-s5-slsh-chain-suffix.test.ts` — 5 cells, the SLSH-5
    suffix over the same renderer. `tests/question-operand-defect.test.ts` — 10
    cells, the sibling posture's own witness. All three green at this HEAD (31
    tests).
  - **Corpus census, re-run at HEAD.** 34 committed `.theta` / `.thetalib`
    files; five use `Err(` (`docs/examples/handle-error.theta`,
    `docs/examples/fan-out-reviews.theta`,
    `docs/examples/configure-tool-loop.theta`,
    `docs/examples/prompt-extension-tool.theta`,
    `tests/live/acceptance/fixtures/acc-match-queryerror.theta`), and every
    `kind:` occurrence among them is a string literal in a `match` pattern. No
    committed fixture constructs an `Err` payload with a record-valued field, so
    the committed-fixture parse gate never meets one and no committed cell
    reaches either site with a non-string.
- **Observed at:** v0.96.0 (`21988875`). Offline, deterministic, provider-free:
  one scratch vitest probe over the shipped `renderLeafKindNote` /
  `renderTopLevelErrNote` / `translateInbound` / `QuestionOperandDefectError`
  entry points and the real `parseThetaDocument` (through the `parseDoc` harness
  of `tests/helpers/e2e-s1.ts:39`); written, run, deleted. Every value in
  §Reproduction is that run's output verbatim over a tree `git status --short`
  reported clean at `21988875` both when the probe ran and when it was swept.
  Every `path:line` below was additionally re-resolved against `git show HEAD:`
  rather than the working tree, so no citation depends on tree state.

## Summary

SLSH-3 (`slash-invocation.md:31`) requires one system note when a
slash-dispatched theta terminates with `Err(QueryError)`, and for a
subagent-mode theta it is the only user-facing surface for the failure. SLSH-4
(`:33`) fixes the ten note templates and requires renderers to emit them
verbatim with the `<…>` placeholders interpolated. It says nothing about what a
placeholder renders as when the value in that field is not a string, and
`renderLeafKindNote` answers with JavaScript's default: seven of the ten rows
substitute the field directly into a template literal.

The value in that field is whatever the theta put there. `Err(…)`'s payload is
any theta value, and an author's own error schema may declare a field with a
schema type. Measured, all three of these parse with `[]` diagnostics over
`schema I { n: string }` and `schema E { kind: I, message: string }`: a literal
`Err(E { kind: I { n: "x" }, message: "m" })`, the same over a bound `let i`,
and the same over `let i = invoke<I>("./kid.theta")?`. The declared-`string`
form is refused (`theta/parse/object-field-type-mismatch`), so this is the
author's schema being honoured, not a field-type check missing.

Two observables follow, with different reachability:

| the record at the field | `renderLeafKindNote("t", { kind: <rec>, message: "m" })` | route |
| --- | --- | --- |
| plain-prototype (author-constructed) | `theta /t returned Err: [object Object] — m` | author source alone |
| null-prototype (`translateInbound`-rebuilt) | throws `TypeError: Cannot convert object to primitive value` | typed `invoke<T>` return |

The first is the exact default QRY-18 forbids one page over, in a sentence that
names the reason: rendering by "JavaScript's default `String(...)`, whose
`[object Object]` … would silently corrupt prompts without any diagnostic for
the author". The second exists because bug 0173's 0.96.0 fix built
`rebuildInbound`'s record with `Object.create(null)`
(`wire-translation.ts:299`), and a null-prototype record has no
`Symbol.toPrimitive`, no `toString` and no `valueOf` to find.

The throw does not escape the host. Traced in source: it unwinds out of
`emitTopLevelErrNote` into the slash-dispatch outer catch
(`theta-composition-producer.ts:443`), is classified by `surfaceUnexpectedThrow`
(`runtime-panics.ts:496`) as `theta/runtime/internal-error`, and is emitted as
`theta /<name> aborted with internal error: Cannot convert object to primitive
value` (`:492`). So the SLSH-3 note the spec requires is replaced by a
runtime-defect framing carrying a different registered code, and the user is
told the theta *aborted* when it returned an `Err` value and terminated
normally.

A second site has the same shape and fires earlier on the invoke route.
`runInvokeEffect` (`effectful-statement-host.ts:354`) builds the XMODE-1 wrapper
message with `String(innerKind)` (`:401`) for every callee-returned `Err` that
is not `invoke_infra` or `cancelled` — and `#validateInvokeReturn` returns a
non-`ok` result unchanged (`production-theta-producer.ts:3442–3443`), so no gate
inspects the payload's shape between the callee and that coercion.

The corpus has already decided this class three times and never with bare
`String(…)`: QRY-18's rule, `summariseScrutinee`'s compact `JSON.stringify`
(`match-result.ts:88–89`), and `summariseNonResultOperand`'s `typeof`-plus-key-
list descriptor (`runtime-panics.ts:440`). The two rules disagree with each
other, which is what §Fix must adjudicate.

## Reproduction

Offline, deterministic, provider-free, at HEAD `21988875`. One scratch vitest
probe over the shipped entry points; written, run, deleted.

### (a) The coercion semantics

```
String(nullProtoRecord)              THROWS TypeError: Cannot convert object to primitive value
String(plainRecord)                  "[object Object]"
`${nullProtoRecord}` (template)      THROWS TypeError: Cannot convert object to primitive value
JSON.stringify(nullProtoRecord)      {"a":1}
```

`JSON.stringify` is prototype-independent and is the control: the difference is
confined to primitive coercion, which is the only operation the render sites
perform on these fields.

### (b) The render path, per row

`renderLeafKindNote(thetaName, leaf)` over the shipped module. `rec` is a record
with one own key; `np` is its null-prototype twin.

| leaf | result |
| --- | --- |
| `{ kind: rec, message: "m" }` (SNK-k) | `theta /t returned Err: [object Object] — m` |
| `{ kind: np, message: "m" }` (SNK-k) | **throws** `TypeError` |
| `{ kind: "weird", message: np }` (SNK-k) | **throws** `TypeError` |
| `{ kind: "transport", message: np }` (SNK-c) | **throws** `TypeError` |
| `{ kind: "model_tool", tool_name: np, message: "m" }` (SNK-d) | **throws** `TypeError` |
| `{ kind: "code_tool", tool_name: "x", cause: np, message: "m" }` (SNK-g) | **throws** `TypeError` |
| `{ kind: "invoke_infra", callee_path: np, cause: "c" }` (SNK-i) | **throws** `TypeError` |
| `{ kind: "validation", cause: "schema_validation", attempts: np }` (SNK-a) | **throws** `TypeError` |
| `{ kind: "tool_loop_exhausted", rounds: np, last_tool_name: null }` (SNK-h) | **throws** `TypeError` |
| `{ kind: "context_overflow", message: np }` (SNK-e) | `theta /t returned Err: context overflow` |
| `{ kind: "cancelled", message: np }` (SNK-f) | `theta /t cancelled` |

Seven fields measured directly (`kind`, `message`, `tool_name`, `cause`,
`callee_path`, `attempts`, `rounds`). The one remaining interpolated field,
`last_tool_name` (`:151–152`), is not measured here — it reaches the same
template through `e.last_tool_name ?? "respond"`, where `??` passes a record
through unchanged. The last two rows are the controls: SNK-e and SNK-f
interpolate no payload field and are unaffected by any value in one.

Through the top-level entry point, including the wrapper walk:

```
renderTopLevelErrNote({ thetaName: "t", error: { kind: np, message: "m" }, chain: [] })
  THROWS TypeError: Cannot convert object to primitive value

renderTopLevelErrNote({ thetaName: "t", chain: [],
  error: { kind: "invoke_callee", callee_path: "./k.theta", message: "w",
           inner: { kind: np, message: "m" } } })
  THROWS TypeError: Cannot convert object to primitive value
```

The second row confirms the wrapper walk (`:178–181`) reaches the leaf before
the row renders, so an `invoke_callee` wrapper is not a shield.

### (c) Parse legality of a record at an error field

Real `parseThetaDocument` through the `parseDoc` harness.

| source | diagnostics |
| --- | --- |
| `schema I { n: string }` / `schema E { kind: I, message: string }` / `Err(E { kind: I { n: "x" }, message: "m" })` | `[]` |
| same, over `let i = I { n: "x" }` then `Err(E { kind: i, message: "m" })` | `[]` |
| same, over `let r = invoke<I>("./kid.theta")` / `let i = r?` / `Err(E { kind: i, message: "m" })` | `[]` |
| `schema E { kind: string, message: string }` / `Err(E { kind: I { n: "x" }, message: "m" })` | `["theta/parse/object-field-type-mismatch"]` |
| `schema E { kind: string, message: string }` / `Err(E { kind: "weird", message: "m" })` | `[]` (baseline) |

The fourth row is the one that matters for scoping: the type layer **does**
refuse an object where the author declared `string`. What it admits — and must,
under the language as specified — is an author's error schema that declares the
field with a schema type. ERR-15's openness (`queryerror-variants.md:23`) is why
the SNK-k catch-all exists at all; it is not what admits the record.

### (d) Where a null-prototype record comes from at HEAD

```
translateInbound({ validated: JSON.parse('{"kindish":"v","ok2":"w"}'),
                   sidecars: {Pr: {wireNames:[],namedEnumPositions:[],refTargets:[]}},
                   rootDef: "Pr", schemaNames: {"Pr"} })

Object.getPrototypeOf(out) === null    true
String(out)                            THROWS TypeError: Cannot convert object to primitive value
```

`rebuildInbound` builds the record with `Object.create(null)`
(`wire-translation.ts:299`, bug 0173's §Fix (a)) at every position where the
sidecar describes the object's own fields (`:266–279`), and re-enters at the
empty pointer through the `$ref`-target and name-match arms, so nested described
objects are null-prototyped too. Its one wired production caller is
`#validateInvokeReturn`'s `verdict.ok` arm
(`production-theta-producer.ts:3463`, the call at `:3472–3477`), i.e. a typed
`invoke<T>` return that AJV passed.

### (e) The reachability chain — traced in source, not driven end to end

Stated as a source trace, because that is what it is. Each hop is a citation
above, re-read at this HEAD; no probe drove the whole chain.

1. A typed `invoke<T>` return validates, and `#validateInvokeReturn` binds the
   `translateInbound`-rebuilt, null-prototyped record
   (`production-theta-producer.ts:3463`, `:3472–3477`).
2. Theta code places that binding in a constructed error payload's field.
   `buildObjectSchemaValue` (`value.ts:385`) copies field values **by
   reference** (`:402`), so the record itself — not a copy — sits at the field.
   The container is plain-prototype and branded through a symbol (`:277`), which
   changes no coercion.
3. **Route A — the theta returns that `Err` to the slash-dispatch boundary.**
   `theta-composition-producer.ts:430–431` casts and calls
   `emitTopLevelErrNote` (`production-theta-producer.ts:1323`), which calls
   `renderTopLevelErrNote` (`:1327`) → `renderLeafKindNote` → the matching SNK
   row → the coercion. The throw is caught at `:443`, classified
   `theta/runtime/internal-error` by `surfaceUnexpectedThrow`
   (`runtime-panics.ts:496`, message template `:540`) and emitted as
   `theta /<name> aborted with internal error: Cannot convert object to
   primitive value` (`:492`).
4. **Route B — a parent `invoke`s that theta.** `#validateInvokeReturn` returns
   a non-`ok` result unchanged (`:3442–3443`), so the payload reaches
   `runInvokeEffect`'s wrap unexamined; `innerKind` is the record, it matches
   neither literal (`:395`), and `String(innerKind)` (`:401`) throws. That throw
   is outside `runInvokeChild`'s boundary catch (`invoke-cancellation.ts:125`,
   which covers `child.drive()` at `:123`), so it unwinds into the *caller's*
   frame — reaching either step 3's outer catch at a slash boundary, or a
   grandparent's `runInvokeChild` catch, which yields
   `Err(InvokeInfraError { cause: "internal_error" })`.

The `[object Object]` observable needs none of this: step 2 with an
author-constructed record and step 3 suffice, and §Reproduction (c) row 1 shows
that source loads clean.

### (f) The three postures the corpus already ships

Measured on the same two records:

```
QuestionOperandDefectError(nullProtoRecord).message
  internal defect: '?' operand evaluated to a non-Result value (an object with keys a); …
QuestionOperandDefectError(plainRecord).message
  internal defect: '?' operand evaluated to a non-Result value (an object with keys a); …
```

Identical on both prototypes and total: `summariseNonResultOperand`
(`runtime-panics.ts:440`) dispatches on `typeof` (`:444`) and ends at a capped
own-key list (`:461`), never coercing the object. `summariseScrutinee`
(`match-result.ts:58`) reaches compact `JSON.stringify` for the same input
(`:88–89`), which §Reproduction (a) shows is prototype-independent. QRY-18
(`query-escapes-stringification.md:16`, `:27`) specifies the second of those two
answers for the interpolation surface.

### (g) Controls

- `tests/err-note-render.test.ts` (16), `tests/e2e-s5-slsh-chain-suffix.test.ts`
  (5) and `tests/question-operand-defect.test.ts` (10) are green at this HEAD —
  31 tests. Every fixture in the first two supplies string fields (`:47–127`),
  which is why none of them reaches either observable.
- SNK-e and SNK-f render identically whatever the payload's other fields hold
  (§Reproduction (b), last two rows): the defect is the interpolation, not the
  dispatch.

## Expected behaviour

- **`docs/spec_topics/slash-invocation.md:31` (SLSH-3)** — "Pi appends a
  one-line system note to the user's session formatted from the error", and
  "For a directly-slash-invoked subagent-mode theta this note is the only
  user-facing surface for the failure: the subagent's intermediate transcript
  stays private". A note that is not emitted, and is replaced by a
  `theta/runtime/internal-error` framing claiming the theta aborted, is not that
  note. On the subagent-mode arm it is the whole of the failure surface.
- **`docs/spec_topics/slash-invocation.md:33` (SLSH-4)** — "The shapes below are
  normative templates. Renderers MUST emit the surrounding template text
  verbatim; only the `<…>` placeholders are interpolated." A render that throws
  emits no template text at all. The same sentence is also the *limit* of what
  the spec fixes here: it states how the surrounding text and the placeholders
  relate, and — for `<message>` — only that model-sourced content is
  non-deterministic. It states no stringification rule for a non-string
  placeholder value, which is the gap §Fix names.
- **`docs/spec_topics/slash-invocation.md:48` (SNK-k)** — the catch-all row,
  `"theta /<name> returned Err: <kind> — <message>"`, whose purpose the
  surrounding prose gives as making "the renderer's contract total against any
  future variant added to the union, so a renderer never has 'no defined output'
  for a well-formed `QueryError`". Totality is the row's stated job, and the
  committed witness asserts it (`tests/err-note-render.test.ts:245–258`,
  including `not.toThrow()`). Both are discharged only over string `kind`s.
- **`docs/spec_topics/query/query-escapes-stringification.md:16` (QRY-18)** —
  the corpus's decision on this exact class, verbatim: a `${expr}`
  interpolation renders "by the **Theta static type** of the expression — *not*
  by JavaScript's default `String(...)`, whose `[object Object]` and
  comma-joined-array defaults would silently corrupt prompts without any
  diagnostic for the author". The table (`:27`) renders a schema-typed object as
  compact `JSON.stringify`. QRY-18 governs prompt text, not system notes, so it
  does not *bind* the SNK rows — but its reasoning is about embedding a theta
  value in a string a human reads, which is what SNK-a … SNK-k do.
- **`src/runtime/runtime-panics.ts:429–439`** — the posture stated in the code
  it governs, for a value that is by construction outside the expected contract:
  "Defensive by construction … so no `JSON.stringify` (cycles, unbounded size),
  only `typeof` plus, for objects, a shallow descriptor … Never throws or
  mutates on any plain-data `ThetaValue`." A `QueryError` field the type layer
  admitted but the runtime did not produce is the same category of value, and
  this is the same runtime's own answer for it.
- **`src/runtime/match-result.ts:88–89`** — the third answer, for a theta value
  embedded in a runtime message: "Any other schema-typed object: compact
  `JSON.stringify`." Its rendering is pinned in the spec's own worked example
  (`docs/spec_topics/diagnostics/placeholder-rendering-a.md:39`:
  `MatchError: no arm matched {"name":"fluffy"}`).
- **`docs/spec_topics/diagnostics/code-registry-runtime.md:22`** — the code
  actually emitted today. Its trigger is "The interpreter or an adapter it
  called threw an exception outside the closed theta 1.0.0 panic-source list (a
  host-function `TypeError`, an internal invariant violation …)". A `TypeError`
  raised by the runtime's own note renderer over a value the type layer admitted
  is an internal defect that this code correctly *describes* and that SLSH-3
  should never have reached.
- **`docs/spec_topics/governance/source-language-stability.md:5` (GOV-15,
  observable (c))** — `theta-system-note` content strings are expected
  byte-identical across theta 1.x releases after normalising the permitted
  placeholder categories. Any change to what a non-string field renders as
  moves observable (c) for the inputs that reach it, which is why §Fix's
  rendering choice is a stated, enumerated change rather than an incidental one.

## Actual behaviour / root cause

**1. The renderer is written against a type it is handed by cast, not by
check.** `QueryError` and its nine variants declare `kind: string`,
`message: string`, `tool_name: string`, `attempts: number`
(`src/runtime/query-error.ts:52` and siblings), and `renderLeafKindNote` reads
those fields on that basis. The value it receives is a theta runtime value cast
through `unknown` at the boundary
(`theta-composition-producer.ts:431`), and nothing between the theta's `Err(…)`
and the renderer inspects the payload. The TS types are therefore an assertion
about a value the runtime does not own, and the renderer's `${…}` is the point
where the assertion is cashed.

**2. Template substitution is `ToString`, and `ToString` on an object is a
protocol lookup.** `` `…${v}…` `` performs `ToString(v)`, which for an object
runs `OrdinaryToPrimitive` — `Symbol.toPrimitive`, then `toString`, then
`valueOf`. A plain-prototype record finds `Object.prototype.toString` and yields
`[object Object]`. A null-prototype record finds none of the three and the
abstract operation raises `TypeError: Cannot convert object to primitive
value`. Both branches are the *same* defect: the render path has no
stringification rule, and JavaScript's default supplies two different wrong
answers depending on a prototype the renderer never looks at.

**3. `String(innerKind)` is the same expression written a second time, on a
value the code has already typed `unknown`.** `effectful-statement-host.ts:394`
reads the field as `{ readonly kind?: unknown }` — the code states that it does
not know the field's type — then tests it against two string literals (`:395`)
and coerces whatever survives (`:401`). The two literal comparisons are safe on
any value; the coercion is not. Nothing upstream narrows it:
`#validateInvokeReturn` returns a non-`ok` result unchanged before the depth
walk, the lowering, the compile and the validate
(`production-theta-producer.ts:3442–3443`), which is correct for its own job —
AJV validates the `Ok` payload against the return annotation, and an `Err` has
no return annotation to validate against — and leaves the `Err` payload
unexamined by construction.

**4. Bug 0173's fix changed which wrong answer appears, not whether one
appears.** Before 0.96.0 the inbound rebuild produced plain-prototype records
and every route above rendered `[object Object]`. After it
(`wire-translation.ts:299`) the same route raises. The 0.96.0 run measured this,
recorded it under its §Fix constraint 3, and could not act on it: constraint 4
fixes that fix's scope at "the two record builds in
`src/runtime/wire-translation.ts` and nothing else". The pre-0.96.0 behaviour is
not a baseline to restore — `[object Object]` in a user-facing note is the
failure QRY-18 names.

**5. The corpus's three existing answers disagree, and no rule selects among
them.** `summariseNonResultOperand` (`runtime-panics.ts:440`) refuses
`JSON.stringify` on cycle and size grounds and emits a capped descriptor;
`summariseScrutinee` (`match-result.ts:58`) emits compact `JSON.stringify`;
QRY-18 (`query-escapes-stringification.md:16`) specifies compact
`JSON.stringify` for the interpolation surface and is explicit that the choice
exists to avoid `String(…)`. The placeholder-rendering closure that would
otherwise adjudicate a placeholder's rendering
(`placeholder-rendering-a.md:7`) is scoped to the four Code-registry pages'
*Message* columns and does not reach the SNK table, so SLSH-4 is the only rule
in force on these ten rows, and SLSH-4 does not answer the question. That is why
§Fix is constraint-pinned rather than settled.

**6. Nothing reports the substitution as such.** On the `[object Object]` route
there is no diagnostic at all — the note is emitted, well-formed, and empty of
information at the one placeholder that was supposed to carry it. On the
throwing route the emitted code is `theta/runtime/internal-error` with the
message `Cannot convert object to primitive value`, which names a JS coercion
and neither the theta, the field, nor the note that was being rendered.

## Why it matters

- **The failure surface for a whole mode is replaced by a different one.** For a
  directly-slash-invoked subagent-mode theta, SLSH-3's note is the only
  user-facing surface for the failure (`slash-invocation.md:31`); the transcript
  stays private. On the throwing route the user gets
  `theta /<name> aborted with internal error: Cannot convert object to primitive
  value` instead, on a different registered code, for a theta that returned an
  `Err` value and terminated normally.
- **On the reachable-today route the note is well-formed and carries no
  information.** `theta /<name> returned Err: [object Object] — m` satisfies
  SLSH-4's template rule and tells the reader nothing about the failure. This
  needs only author-written theta source that loads with zero diagnostics
  (§Reproduction (c), row 1) — no `invoke`, no model, and no dependency on bug
  0173's fix.
- **Eight positions across two modules share the defect, and one of them fires
  before any note is rendered.** Seven SNK rows plus the XMODE-1 wrap. A fix that
  hardens the renderer and leaves `effectful-statement-host.ts:401` alone leaves
  the invoke route throwing.
- **The corpus decided this class three times and none of the three decisions
  reaches here.** QRY-18 states the rule and the reason; `summariseScrutinee`
  and `summariseNonResultOperand` implement two versions of it. The renderer
  that owns the spec's only single-line failure surface consults none of them.
- **Reachability widens with 0172, and widens toward model-produced input.**
  [0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md)
  wires three further inbound boundaries; every record `translateInbound`
  rebuilds is null-prototyped since 0173, and at those boundaries the payload is
  chosen by a model rather than produced by a theta child.
- **The one committed witness cannot see it.** `tests/err-note-render.test.ts`
  asserts all ten templates by string equality and asserts SNK-k does not throw
  (`:245–258`), but every fixture supplies string fields (`:45–128`). The census
  says the same for the theta corpus: 5 of 34 committed files use `Err(`, all
  with string-literal `kind`.
- **The rendering choice is a GOV-15 observable-(c) change, so it is cheaper to
  decide once here than to discover twice.** Whatever a non-string field renders
  as becomes the byte-identical content string for every input that reaches it
  (`source-language-stability.md:5`).

## Fix

Not settled. The surface is fixed and the constraints are pinned; the rendering
rule is chosen in-run from the two corpus-precedented candidates in (b), with
the evidence that decided it recorded.

### (a) The surface

Every position that embeds a `QueryError` field in a string routes through one
coercion-safe summariser instead of bare substitution:

- `src/runtime/err-note-render.ts` — the seven interpolating rows: SNK-a
  (`:121`, `attempts`), SNK-c (`:126`, `message`), SNK-d (`:131`, `tool_name`,
  `message`), SNK-g (`:145`, `tool_name`, `cause`, `message`), SNK-h
  (`:151–152`, `rounds`, `last_tool_name`), SNK-i (`:157`, `callee_path`,
  `cause`), SNK-k (`:161`, `kind`, `message`). SNK-b (`:118`), SNK-e (`:136`)
  and SNK-f (`:140`) interpolate nothing and are not edited.
- `src/runtime/effectful-statement-host.ts:401` — `String(innerKind)` in the
  XMODE-1 wrapper message, over a value the same function already types
  `unknown` (`:394`).

The summariser is total over every `ThetaValue` and never coerces an object,
whatever its prototype — the property `summariseNonResultOperand`'s doc-comment
states for its own input (`runtime-panics.ts:429–439`) and that
§Reproduction (f) measures.

### (b) The undecided part: what a non-string field renders as

Two candidates, both already shipped in this runtime for the same class. The run
selects one and states the evidence.

1. **Compact `JSON.stringify`** — `summariseScrutinee`'s answer
   (`match-result.ts:88–89`) and QRY-18's (`query-escapes-stringification.md:16`,
   `:27`). Renders `theta /t returned Err: {"n":"x"} — m`. It preserves the
   information the author put in the field, it is what the spec already fixes
   for a theta value embedded in a human-read string, and it is
   prototype-independent (§Reproduction (a)). Costs: unbounded output length,
   and `JSON.stringify` throws on a cycle — which the summariser must then
   handle, or the fix reintroduces the throw it removes on a different input.
2. **A capped descriptor** — `summariseNonResultOperand`'s answer
   (`runtime-panics.ts:440`), whose doc-comment rejects `JSON.stringify`
   explicitly, on cycles and unbounded size, for a value outside the expected
   contract. Renders `theta /t returned Err: an object with keys n — m`. It is
   bounded and cannot throw. Costs: it discards the field's content, on a note
   that exists to report a failure to a human.

The choice turns on one question the run must answer from the spec, not from
preference: whether SLSH-4's "emit the surrounding template text verbatim; only
the `<…>` placeholders are interpolated" (`slash-invocation.md:33`) admits
either rendering without a spec edit, given that the SNK table is outside the
placeholder-rendering closure (`placeholder-rendering-a.md:7`) and no sentence
states a stringification rule for these placeholders. If it does not, the fix
carries the same-commit spec edit that states one, in the GOV-15-observable-(c)
form.

Whichever is chosen applies at all eight positions, including
`effectful-statement-host.ts:401`, so the two sites do not diverge.

### (c) Constraints

1. **No change for any string-valued field.** Every existing rendering stays
   byte-identical: the summariser returns a string unchanged (up to whatever
   cap (b)(2) would impose, which must not apply to strings that render today),
   a number through its existing rendering, and `null` as `last_tool_name`
   still resolves to the literal `respond` through `??` at `:151`. GOV-15
   observable (c) moves only for inputs that render `[object Object]` or throw
   at HEAD. The fix asserts this rather than assuming it.
2. **`tests/err-note-render.test.ts`'s 16 cells and
   `tests/e2e-s5-slsh-chain-suffix.test.ts`'s 5 stay green with no assertion
   edited, re-pinned or deleted.** They pin all ten SNK templates and the SLSH-5
   suffix by string equality; the fix is additive to them.
3. **SNK-k's totality claim is strengthened, not weakened.** The witness's
   `not.toThrow()` (`tests/err-note-render.test.ts:245–258`) currently holds
   only over string `kind`s; the fix makes it hold over the values
   §Reproduction (b) enumerates, and the witness says so.
4. **The renderer stays free of the value model's internals.** It may consult
   `schemaTagOf` / `isEnumValue` (as both existing summarisers do) but does not
   acquire a dependency on the wire-translation seam or on any prototype check
   — the fix is about applying a stringification rule, not about detecting a
   null prototype. A remedy that special-cases `Object.getPrototypeOf(v) ===
   null` fixes one measured input and leaves `[object Object]` in place, and is
   out of scope by this constraint.
5. **Scope.** This fix covers the eight positions in (a) and nothing else. It
   does not change the `QueryError` TS types, does not add a shape gate at
   `theta-composition-producer.ts:431` or at
   `#validateInvokeReturn` (`production-theta-producer.ts:3442`), and does not
   change what the type layer admits at an author's error-schema field
   (§Non-goals).
6. **No new registered code.** The change removes a `theta/runtime/internal-error`
   emission on one input class; it registers nothing. Whether SLSH-4 needs a
   same-commit spec edit is (b)'s question and is answered there.
7. **Bug 0173 is not reopened.** `src/runtime/wire-translation.ts` is not
   touched and that report's 17-cell witness is not edited.

### (d) Witness

Offline, provider-free, additive in `tests/err-note-render.test.ts` (the
renderer's existing home, which already owns every SNK template assertion)
plus a cell for `effectful-statement-host.ts:401` in that path's existing home.
Required cells:

- Every row of §Reproduction (b) that throws at HEAD, in both prototypes:
  asserting the rendered string under the chosen rule, not merely `not.toThrow`.
- The `[object Object]` rows: a plain-prototype record at `kind` and at
  `message` renders the chosen form, which reds on today's code without any
  null prototype in the fixture.
- The two non-interpolating controls (SNK-e, SNK-f) unchanged.
- The XMODE-1 wrap: a callee-returned `Err` whose `kind` is a record produces
  the wrapper message under the chosen rule rather than throwing, on both
  prototypes.
- A no-perturbation control over every existing fixture in the file: the ten
  templates render byte-identically for string fields (constraint 1).
- If (b)(1) is chosen, a cycle-carrying record, so the fix does not trade one
  throw for another.

Each new assertion is proved both directions once — red with the summariser
neutralised, green with it restored.

### (e) Ordering

Nothing blocks this report and it blocks nothing.
[0173](./0173-inbound-rebuild-record-not-null-prototyped.md) is already fixed
(0.96.0) and this fix does not touch its file.
[0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md)
shares no file with this fix and changes none of its verdicts; landing this
first narrows the failure surface each boundary 0172 wires would otherwise
widen, but it is not a prerequisite in either direction.
[0119](./0119-proto-named-field-silently-dropped.md)'s route (a), if taken,
would mint null-prototype records at the theta-side construction sites too and
so add routes to the same eight positions; this fix is prototype-blind by
constraint 4, so it covers those routes without rebasing on that report.

## Fix (0.186.0)

### The 0177 field-rendering law

**Every position that embeds a `QueryError` payload field in a user-facing
string renders that field through `summariseErrorField`
(`src/runtime/err-field-summary.ts`) — never by bare template substitution and
never by `String(…)`. `summariseErrorField` is total over any plain-data
`ThetaValue`, prototype-blind, and never coerces an object to a primitive:
(1) a string renders verbatim — no quoting, no truncation, no escaping;
(2) a number, boolean, bigint, `undefined` or `null` renders as `String(value)`;
(3) an enum value (a boxed `String`) renders as its bare wire string;
(4) any other object or array renders as compact `JSON.stringify` — QRY-18's
answer (`query-escapes-stringification.md:16`, `:27`) and `summariseScrutinee`'s
(`match-result.ts:88–89`); (5) except that when (4) cannot produce a bounded
finite string — a cycle, a `JSON.stringify` result of `undefined`, or output
longer than the 200-character cap — the value renders as
`summariseNonResultOperand`'s capped descriptor instead
(`runtime-panics.ts:440`).**

§Fix (b)'s two candidates are therefore not alternatives but a primary and a
bounded fallback: candidate 1 wherever it is bounded and finite, candidate 2
exactly where it is not. The evidence that decided it: QRY-18 states the rule
*and its reason* for the same class one page over and names `[object Object]`
as the failure to avoid; the spec's own worked example pins compact
`JSON.stringify` for a theta value embedded in a runtime message
(`placeholder-rendering-a.md:39`); and SLSH-3 makes this note the **only**
user-facing failure surface for a subagent-mode theta
(`slash-invocation.md:31`), so discarding the field's content is a real loss,
while candidate 2's two stated costs (cycles, unbounded size) are precisely the
cases where candidate 1 cannot render at all — so adopting candidate 2 there
costs nothing candidate 1 could have delivered.

**No spec edit was required, adjudicated against the text.** SLSH-4
(`slash-invocation.md:33`) fixes the surrounding template text and the
placeholder set; it states no stringification rule for a non-string placeholder
value. The SNK table is outside the placeholder-rendering closure
(`placeholder-rendering-a.md:7`, scoped to the four Code-registry pages'
*Message* columns). Both candidates are therefore admissible without a spec
edit, and `docs/spec_topics/**` is untouched. No registry row text changed, so
DIAG-2 / DIAG-4 are not engaged. GOV-15 observable (c) moves only for the
inputs that rendered `[object Object]` or threw at HEAD; every string- and
number-valued field renders byte-identically, asserted rather than assumed.

- What shipped:
  - `src/runtime/err-field-summary.ts` (new) — `summariseErrorField`, the law's
    one implementation; cycles are detected by an explicit ancestor-stack walk
    (`hasCycle`, with backtracking so ordinary DAG sharing is not a cycle)
    rather than by catching `JSON.stringify`, keeping the module free of a
    broad `catch` (§Fix (a): one coercion-safe summariser).
  - `src/runtime/err-note-render.ts` — the seven interpolating SNK rows (SNK-a
    `attempts`, SNK-c `message`, SNK-d `tool_name`/`message`, SNK-g
    `tool_name`/`cause`/`message`, SNK-h `rounds`/`last_tool_name`, SNK-i
    `callee_path`/`cause`, SNK-k `kind`/`message`) route through it. SNK-b,
    SNK-e and SNK-f interpolate nothing and are untouched; no surrounding
    template text changed (SLSH-4); SNK-h's `?? "respond"` still runs before
    the summariser, so `null` still renders the literal `respond`.
  - `src/runtime/effectful-statement-host.ts` — `runInvokeEffect`'s XMODE-1
    wrapper message uses `summariseErrorField(innerKind)` in place of
    `String(innerKind)`; the `invoke_infra`/`cancelled` passthrough is
    unchanged (§Fix (a), the eighth position).
  - `src/runtime/runtime-panics.ts` — `summariseNonResultOperand` is exported
    (one word; the file is otherwise byte-identical, same line count) so rule 5
    reuses the shipped descriptor instead of duplicating it.
  - Constraints 1–7 hold: no prototype check anywhere (constraint 4), no shape
    gate and no `QueryError` type change (constraint 5), no new registered code
    (constraint 6), `src/runtime/wire-translation.ts` untouched (constraint 7).
- Gates: witness run — the 24 + 3 new cells RED at HEAD with the two pinned
  signatures (`expected 'theta /t returned Err: [object Object] — m' to be
  'theta /t returned Err: {"n":"x"} — m'` and `TypeError: Cannot convert object
  to primitive value` at `err-note-render.ts:161` / `effectful-statement-host.ts`
  `runInvokeEffect`), GREEN after; full suite `npm test` → `Test Files 375
  passed (375) / Tests 7725 passed (7725)`; `npm run typecheck` (`tsc -p
  tsconfig.json --noEmit`) clean; `npm run lint` (`eslint "src/**/*.ts"`) clean.
- Review: 2 rounds, plus one pre-review citation-correction round. The
  correction round removed a 7-line doc-comment whose line shift had invalidated
  `runtime-panics.ts:496` citations elsewhere, and restored the three files the
  implementer had chased (`tests/index-element-alias-runtime-disposition.test.ts`,
  `tests/type-name-as-value-refusal.test.ts`,
  `tests/live/live-production-acceptance.test.ts`) byte-exact to HEAD
  (`git hash-object` = `git rev-parse HEAD:<path>` for each) — positional drift
  is [0134](./0134-params-shift-induced-stale-citations.md)'s do-not-chase
  class. Round 1 (deep): no correctness, fidelity or spec finding; two prose
  findings (a `wire-translation.ts:299` citation stale at this HEAD — the
  `rebuildInbound` build is `:370` — repeated in four new comments, and a
  mixed-frame entry-point citation) plus one prose residual (an over-broad
  totality claim). Round 2 (light): all three fixed, comment text only;
  polish verified by gate-diff (the module's executable body byte-identical
  before and after), confirmation round skipped.
- Verification: SOLID. (1) The witness genuinely reds — neutralising
  `summariseErrorField`'s object arm to `String(value)` reproduced both pre-fix
  signatures across all 24 cells, and restoring the file byte-exact
  (`git hash-object` `b3ab9406…` before and after) returned them green.
  (2) Full default suite green (375 / 7725). (3) A real end-to-end live H8a
  cell exercises the fixed path — `tests/live/err-note-render-record-error-field-live-cell.test.ts`,
  a `mode: subagent` kid returning `Err(E { kind: I { n: "x" }, message: "m" })`
  through a REAL spawned RFC-0006 child and a `tools:`-routed prompt-mode parent
  propagating it with `?`, asserting the settled `SessionManager`'s
  `theta-system-note` reads `theta /b0177liveparent returned Err: {"n":"x"} — m`;
  run for real under the shared live lock, green, and proved both directions
  (neutralised → the note read `theta /b0177liveparent returned Err: [object
  Object] — m`). (4) `npm run typecheck` and `npm run lint` clean.
- Residuals:
  1. **Positional drift in `src/runtime/err-note-render.ts`** — the added import
     and the SNK-h comment shift the SNK rows by four lines (SNK-i `:157` →
     `:161`, SNK-k `:161` → `:165`, `renderLeafKindNote` `:105` → `:106`). Every
     external citation of those lines is now off by four. Not chased: 0134's
     adjudicated do-not-chase class. Known citers left as they are:
     `tests/live/live-production-acceptance.test.ts` (two `:157` citations in
     comments and one `expect` message) and this document's own §Kind /
     §Affected line numbers, which stand as measured at `21988875`.
  2. **`tests/wire-translation-inbound-retag.test.ts:293` cites
     `wire-translation.ts:299`**, which is stale at this HEAD (`:370`). Outside
     this diff, so untouched — 0134 class, recorded for whoever next edits that
     file.
  3. **Two inputs outside the summariser's stated contract still throw** — an
     object with a throwing getter or proxy trap (out of the key walk) and an
     object containing a nested `bigint` (out of `JSON.stringify`). Neither is a
     plain-data `ThetaValue`, so neither is producible at a `QueryError` field;
     the carve-out is stated in `summariseErrorField`'s doc-comment, matching
     `summariseNonResultOperand`'s own fails-loud posture
     (`runtime-panics.ts:435–439`).
  4. **The bug document's `effectful-statement-host.ts` citations were stale at
     this HEAD** and were re-derived rather than trusted: the `innerKind` read is
     `:416` (doc: `:394`) and the coercion `:423` (doc: `:401`);
     `surfaceThetaCallableCalleeFailure` is `tool-call.ts:804` (doc: `:796`);
     `#validateInvokeReturn` is `production-theta-producer.ts:3816` with its
     passthrough at `:3821–3822` (doc: `:3436` / `:3442–3443`). Every
     `err-note-render.ts` citation in the document was re-verified accurate at
     HEAD before the fix.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: unchanged — no `Err`-payload shape gate, no
  change to what the type layer admits at an author's error-schema field, bug
  0173's record builds and witness untouched, the SNK template wording and the
  SLSH-5 chain suffix unchanged.

## Non-goals

- **Gating the `Err` payload's shape.** Whether the runtime should refuse, or
  diagnose, an `Err` payload that is not a conforming `QueryError` is a separate
  question about ERR-15's openness and about what
  `theta-composition-producer.ts:431`'s cast is entitled to assume. This report
  changes what the renderer does with the value it is given, not which values
  reach it.
- **The type layer's admission of a schema-typed error field.**
  §Reproduction (c) measures that `schema E { kind: I, … }` loads clean and that
  `schema E { kind: string, … }` refuses an object literal. That is the language
  behaving as specified — an author's error schema is an author's schema — and
  is recorded as the source of the input, not as a defect.
- **Bug 0173's record builds.** Fixed at 0.96.0 and out of scope by
  constraint 7. This report's first observable predates that fix and does not
  depend on it.
- **Bug 0119's constructor-side sites.** That report owns whether theta-side
  object construction null-prototypes its records. Constraint 4 makes this fix
  prototype-blind, so it neither depends on nor pre-empts that decision.
- **The other consumers of a `translateInbound`-rebuilt record.** Bug 0173's
  §Fix constraint 3 enumerated the QRY-18 render path
  (`src/render/query-render.ts:429`, `JSON.stringify`), the theta `+` route
  (parse-closed, `theta/parse/mixed-plus-operands`) and the `schemaTagOf`
  consumers, and found them safe. This report adds the two sites that
  enumeration reached past its stated bound and claims nothing about a third.
- **The wording of the SNK templates themselves.** Wording changes are
  spec-versioned breaking changes (`slash-invocation.md:33`). This fix changes
  what a placeholder renders for a non-string value, not the surrounding
  template text.
- **The SLSH-5 chain suffix.** `renderTopLevelErrNote`'s hop rendering
  (`err-note-render.ts:187–194`, the hop template at `:192`) interpolates
  `calleePath`, `parentPath` and
  `callSiteLine` from the V15g invocation record, which the runtime mints — not
  from the theta's payload. It is outside this report's input class and is not
  changed.

## Provenance

Filed as residual **R1** of the bug 0173 fix (0.96.0, commit `21988875`). That
run's report (`.pi/tmp/fixes/0173-report.md` §*Residuals / notes*, R1 — "Two
string-coercion consumers outside §Fix constraint 3's stated bound. For the
parent to file; I created no bug doc") is the source: it records the two sites,
the parse-legality measurement, the coercion semantics, and the five-point
adjudication for shipping rather than stopping — of which points 1 and 2 are why
this arrives as a report (constraint 4 foreclosed a code fix there; constraint 3
asked for an enumeration) and point 5 states the remedy direction this report's
§Fix (a) adopts.

**Re-verified at HEAD `21988875` for this filing, not copied.** R1's bundle was
treated as a set of claims to check, and three of its citations were off:

- R1 cites the SNK-k catch-all at `err-note-render.ts:161–163`. At this HEAD the
  `default:` arm is `:159–162` and the return is `:161`; `:163` is the
  `switch`'s closing brace.
- R1 cites the forged-kind rows collectively at `:126`. That line is SNK-c
  alone. The rows interpolating `tool_name` / `cause` / `callee_path` are
  `:131`, `:145` and `:157`, and two further interpolating rows R1 does not name
  are `:121` (`attempts`) and `:152` (`rounds`, `last_tool_name`) — seven
  interpolating rows in total, not two.
- R1 cites `summariseNonResultOperand` at `runtime-panics.ts:441`. The
  declaration is `:440`; `:441` is its first guard.
- `effectful-statement-host.ts:401` is correct at this HEAD, re-anchored by
  symbol (`runInvokeEffect`, `:354`) as R1 asks.

R1's substantive claims all reproduce. Its statement that the type layer "admits
an **object** there with zero diagnostics" is confirmed and **narrowed**: the
admission is through an author's error schema declaring the field with a schema
type (three forms, all `[]` — §Reproduction (c) rows 1–3), and an object at a
field the author declared `string` is refused with
`theta/parse/object-field-type-mismatch`. ERR-15's openness
(`queryerror-variants.md:23`) is why the SNK-k row exists; it is not the
admission mechanism.

**Measured independently for this filing** by one scratch vitest probe (written,
run, deleted; `git status --short` and `ls tests | grep -i scratch` both empty
immediately before the probe was written and immediately after it was removed):
§Reproduction (a)'s four coercion rows; (b)'s eleven render
rows and the two top-level rows including the `invoke_callee` wrapper walk;
(c)'s five parse rows through the real `parseThetaDocument`; (d)'s
`translateInbound` prototype and coercion; (f)'s two
`QuestionOperandDefectError` messages. R1's three headline measurements
reproduce exactly — `String(nullProtoRecord)` throws where `String(plainRecord)`
is `[object Object]`, and `renderLeafKindNote("t", { kind: nullProtoRecord,
message: "m" })` throws where the `{}`-prototyped shape renders
`theta /t returned Err: [object Object] — m`.

**Traced in source, not driven end to end, and stated as such.**
§Reproduction (e)'s four-step chain from a typed-`invoke<T>`-bound record to
either render site is a re-read of the cited code at this HEAD — R1 records that
0173's reviewer traced the same chain in source and that the 0.96.0 run did not
re-derive it either. No probe drove a theta program from `invoke` through the
note. The claims this report makes without that drive are bounded to: the parse
legality of the sources in (c), the coercion behaviour of the two shipped render
entry points in (b), the prototype of `translateInbound`'s output in (d), and
the by-reference field carriage in `buildObjectSchemaValue` (`value.ts:402`).
The downstream framing in (e) steps 3 and 4 is read off
`theta-composition-producer.ts:443–492`, `runtime-panics.ts:496–543` and
`invoke-cancellation.ts:125–145`, and is not measured.

Volatile positions are named by symbol and by SNK label beside their line
numbers per [0134](./0134-params-shift-induced-stale-citations.md);
`src/extension/production-theta-producer.ts` is 6165 lines at this HEAD and
`src/runtime/err-note-render.ts` is 207.
