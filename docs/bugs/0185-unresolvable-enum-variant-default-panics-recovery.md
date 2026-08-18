# Bug 0185 — A `params:` default naming a variant the enum does not declare — `sev: 'Sev = Sev.Missing'` against `enum Sev { High = "high", Low = "low" }` — loads with zero diagnostics where the byte-identical body expression is `theta/parse/unknown-variant`, and then THROWS out of the binder's defaults recovery on EVERY invocation, supplied argument or not: `resolveEnumVariant` answers `undefined`, `evaluatePureExpression`'s `member` arm falls through to `evaluateMemberAccess(null, "Missing")` and raises `NullMemberAccessPanic`, so the run ends `theta /<name> aborted: null member access: .Missing` with the binder model call already spent — against the recovery's own doc-comment contract that it "never throws", under a code whose registered trigger is `expr.field` on a `null` the author never wrote, at the zero body range rather than the `params:` line, and byte-identical to what a misspelled ENUM name (`Sev = Nope.Missing`) produces

- **Status:** fixed (0.109.0). §Fix was constraint-pinned, not settled: three
  remedy points
  are enumerated with their measured end states, and the run adjudicates which
  code the refusal carries (`theta/parse/unknown-variant`, already registered
  and already fired by the body position, versus
  `theta/parse/default-not-literal`, which `frontmatter-fields-a.md:60` assigns
  to a violated `Literal` production) and at which boundary it fires. Ordering:
  nothing blocks this report from starting and it blocks nothing.
  [0181](./0181-enum-access-params-default-boxed-string-refused-at-merge.md) is
  **fixed (0.103.0)**, commit `e73c1aca` — the provenance, and the tree this
  report measures.
- **Sev/Diff estimate:** S2/D3 — S2 because the failure class is wrong and the
  message misdirects: the theta loads clean and registers, then every
  invocation aborts under `theta/runtime/null-member-access`, a code whose
  registered *Trigger* (`code-registry-runtime.md:15`) is "`expr.field` where
  `expr` evaluated to `null`" and whose message (`null member access: .Missing`)
  names neither the enum, the param, nor the `params:` line, while the
  byte-identical sub-expression in the body draws `theta/parse/unknown-variant:
  unknown variant 'Missing' on enum 'Sev'` at load (§Reproduction (a), (c)). A
  binder model call is spent on every attempt, and the abort fires even when the
  caller SUPPLIES the argument, because recovery runs over `defaultedFields`
  before the fill-if-absent test (§Reproduction (b) row m10). Not S1: nothing
  binds, no value is corrupted, the body never runs and the session survives.
  D3 because §Fix needs in-run adjudication on three axes — which of two
  registered codes, which of three boundaries, and whether the fix reaches the
  literal sublanguage's node model, which discards both identifiers
  (`literal-sublanguage.ts:103`) and so cannot test `grammar.md:26`'s two side
  conditions as written — and because the shared pure-evaluator arm it may touch
  (`production-theta-producer.ts:6085–6096`) is the body's own, with pinned-byte
  coordination owed to 0181's 10-cell witness, 0163's deferral row c6, and bug
  0140's open disposition of the same panic.
- **Kind:** defect, two elements, each measured at HEAD `d470996e`, v0.103.0.
  1. *A registered load-time diagnostic is not reached at this position.*
     `docs/spec_topics/schemas.md:97` — "Unknown-variant references
     (`Severity.Critical` when no such variant exists) are
     `theta/parse/unknown-variant`" — and the registry row
     `docs/spec_topics/diagnostics/code-registry-parse.md:93` (E, parse,
     Trigger "`Enum.Variant` reference where `Variant` is not a declared variant
     of `Enum`", message `unknown variant '<variant>' on enum '<enum>'`).
     `docs/spec_topics/grammar.md:26` makes the two names side conditions of the
     production itself: `NamedValueLit ::= Ident "." Ident // Enum.Variant
     access; head is an enum name in scope, tail a declared variant`. The check
     exists and runs (`checkVariantAccess`,
     `src/parser/schema-declarations.ts:315`, called from
     `src/parser/theta-document.ts:6641`), but only over the body AST. Measured:
     `let x = Sev.Missing` in the body draws the diagnostic;
     `sev: 'Sev = Sev.Missing'` in `params:` draws none.
  2. *The recovery throws where its own contract says it does not.*
     `#mergeDeclaredDefaults`'s doc-comment
     (`src/extension/production-theta-producer.ts:1244–1246`) reads verbatim:
     "Recovery is best-effort — a theta with no on-disk `sourcePath` (an
     in-memory fixture), an unreadable file, or a default that does not parse
     simply leaves that field unfilled (the prior behaviour for it), never
     throws." A default that PARSES and then fails to resolve is outside the
     three enumerated cases and is the one that throws. The throw is a
     `NullMemberAccessPanic` (`src/runtime/runtime-panics.ts:99`) raised by
     `evaluateMemberAccess` (`:331`, the throw at `:333`) from a position where
     no `null` appears in the author's source: `resolveEnumVariant`
     (`src/runtime/lexical-environment.ts:526`) returns `undefined` at `:529`,
     the `member` arm's guard (`production-theta-producer.ts:6091–6093`) does
     not take, and `:6096` evaluates the `ident` target `Sev` — which
     `evaluatePureExpression`'s `ident` arm answers `null` for a non-local
     resolution (`:6063–6066`) — and passes it to `evaluateMemberAccess`.
- **Related:**
  - [0181](./0181-enum-access-params-default-boxed-string-refused-at-merge.md) —
    **fixed (0.103.0)**, commit `e73c1aca`, the provenance. This report is that
    fix's residual **1** (`.pi/tmp/fixes/0181-report.md` §*Residuals / notes*
    item 1), which recorded the panic as "measured identically at HEAD before
    the fix and under the route-a1 prototype — neither caused nor changed here".
    Re-measured at `d470996e` (§Reproduction): the panic is unchanged by that
    fix and independent of its mechanism. 0181 projects the evaluation's RESULT
    (`projectForValidation(evaluatePureExpression(parsed, env))`,
    `production-theta-producer.ts:1343`); this defect raises INSIDE
    `evaluatePureExpression`, so the wrap is never entered. 0181's §Fix
    (0.103.0) also discharged its operator rider's `Sev = Sev.C` value-mismatch
    control against the wire-string spelling (`Sev = "nope"`, its cell 9)
    precisely because the enum-access spelling of a non-member never reaches the
    merge — that displacement is this report's subject. **One correction to the
    residual's wording:** the "never throws" sentence is in
    `#mergeDeclaredDefaults`'s doc-comment (`:1223–1247`), not
    `#recoverDeclaredDefaults`'s (`:1275–1291`); the sentence describes the
    recovery step the merge performs, and the merge restates it in-body at
    `:1259–1262`.
  - [0163](./0163-params-default-type-compat-unchecked-at-load.md) — **fixed
    (0.88.0)**, the owner of the load-time companion gate and of the deferral
    table this shape sits beside. Its table (`tests/params-default-type-compat.test.ts:437–468`)
    carries **no row for an unresolvable variant**; row **c6** (`:452`) is
    `"Sev = Sev.A"` against `enum Sev { A, B }` — a variant that RESOLVES — and
    asserts load silence licensed by `docs/spec_topics/type-system.md:48` ("the
    parse-time check is skipped and the runtime AJV check is the safety net").
    **Boundary:** that licence covers a compatibility check whose operands are
    past the parser's static view. Whether an enum declares a variant is not a
    compatibility question and the operand is not past the static view — the
    variant set is in hand at load, and `checkStructural`
    (`src/parser/theta-document.ts:5800`) builds it (`:5809–5818`) for the body
    walk in the same pass. A safety net that panics is also not the net the
    sentence promises. A load-time route here must keep c6 loading silently
    (§Fix constraint 1); 0181's `## Coordination note — bug 0181 (0.103.0)` on
    that document already records that c6 now terminates in an admission.
  - [0165](./0165-empty-params-default-literal-admitted-and-never-bound.md)
    (**fixed 0.92.0**) and
    [0166](./0166-unary-minus-default-admits-non-numeric-literal.md) (**fixed
    0.91.0**) — the spelling-admission family against this same recovery path.
    Both are about which literal spellings the sublanguage admits and what
    `#recoverDeclaredDefaults` then makes of them; both were fixed in the
    is-literal check rather than in the recovery. This report is the same shape
    one step further: a spelling the sublanguage admits on its FORM whose two
    identifiers it never resolves. Their fixes are the precedent for a
    load-time route and neither is reopened.
  - [0140](./0140-bare-schema-reference-value-position-silent.md) — **open**,
    the closest match on the panic half and the reason a code-identity
    adjudication is owed here. Same panic (`theta/runtime/null-member-access`)
    arrived at the same way — a resolution that answers nothing, a position
    handed `null`, and the first read on it aborting the theta — but at a body
    value position with a bare `schema` / `enum` name, and 0140's §Fix must
    already choose between reusing `theta/parse/unknown-identifier` and minting
    a sibling code. The two reports do not share a fix surface: 0140 edits
    `collectIdentRoots` (`theta-document.ts:4611–4614`) and the identifier walk;
    this report edits the `params:` default half, the evaluator's `member` arm,
    or the recovery. They meet on the question of whether an unresolvable name
    should ever reach the evaluator at all. Whichever lands second states the
    other's disposition rather than assuming it.
  - [0177](./0177-err-note-render-string-coercion-on-record-error-fields.md) —
    **open**, and **measured NOT reached**. Its subject is the SLSH-3
    `Err`-note renderer (`renderTopLevelErrNote`, reached from
    `emitTopLevelErrNote`, `production-theta-producer.ts:1387`). This panic
    routes through the other arm of the same outer catch:
    `isThetaPanic(thrown)` holds (`theta-composition-producer.ts:478`), so
    `emitPanicNote` (`:489`, the producer's own at `:1414`) delivers the group-B
    `details: { diagnostics: [Diagnostic] }` shape and the SLSH-3 renderer is
    never entered. Measured on the production emitter (§Reproduction (b)): the
    delivered note carries `details.diagnostics`, not the `Err` render path.
    The two reports share the `theta-system-note` channel and nothing else.
  - [0066](./0066-ajv-verdict-discarded-unreachable-enforcement.md) — **fixed
    (0.88.0)**, the owner of the post-default-merge AJV hook this defect never
    reaches. The refusal an unresolvable variant SHOULD produce, if it is
    deferred to invocation at all, is that hook's
    `theta /<name>: argument binding produced invalid args — <ajv-summary>` row.
    Measured: the panic fires inside the recovery
    (`production-theta-producer.ts:1266`), before the compile (`:1270`) and
    before `fillDefaultsAndRevalidate` (`:1271`), so the hook is not reached and
    its witness `tests/binder-post-merge-ajv-enforcement.test.ts` cannot see the
    shape.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    adjudicated do-not-chase class for positional drift.
    `src/extension/production-theta-producer.ts` is **6333** lines at this HEAD
    (6311 before `e73c1aca`, 6288 at 0181's own v0.98.0 measurement), so every
    volatile position below is named by symbol beside its line and every line
    was re-resolved at `d470996e` rather than copied.
- **Affected** (every citation re-verified against the tree at HEAD
  `d470996e`, v0.103.0 (`package.json:3`), by `rg` and by reading the file;
  symbols named beside lines. `git status --short` was empty at the start and at
  the end of the measurement, so every cited byte is the committed byte; a
  sibling session's uncommitted work on `src/parser/type-compat.ts` had not
  appeared, and no file this report cites is that file):
  - **The throwing evaluation.** `evaluatePureExpression`
    (`src/extension/production-theta-producer.ts:6054`) and its `member` arm
    (`:6085–6096`): the enum-access guard `:6089` (`expr.target.kind ===
    "ident" && env.resolve(expr.target.name).arm !== "local"`), the
    `resolveEnumVariant` call `:6090`, the `variant !== undefined` return
    `:6091–6093`, the fallthrough comment `:6095` ("`.field` access — a `null`
    target raises `NullMemberAccessPanic` (V4b)") and **the call this report is
    about, `:6096`** — `evaluateMemberAccess(evaluatePureExpression(expr.target,
    env), expr.field)`. The `ident` arm that supplies the `null` target is
    `:6063–6066` (`resolution.arm === "local" ? resolution.value ?? null :
    null`).
  - **The resolver that answers nothing.** `LexicalEnvironment.resolveEnumVariant`
    (`src/runtime/lexical-environment.ts:526`), its doc-comment `:521–525`
    ("Returns `undefined` for an unregistered enum or an unknown variant"), the
    lookup `:527`, the `undefined` return `:528–530` and the `makeEnumValue`
    return `:533`. The module header states the same rule at `:44`. One
    `undefined` covers both an unknown variant and an unregistered enum, which
    is why the two spellings are indistinguishable downstream
    (§Reproduction (b)).
  - **The panic.** `evaluateMemberAccess`
    (`src/runtime/runtime-panics.ts:331`, doc-comment from `:326`), the throw
    `:333` (`throw new NullMemberAccessPanic(\`null member access:
    .${field}\`)`); `NullMemberAccessPanic` (`:99`) and its `code` (`:100`);
    `NULL_MEMBER_ACCESS_CODE` (`:44`).
  - **The recovery and its contract.** `#recoverDeclaredDefaults`
    (`src/extension/production-theta-producer.ts:1292`), its doc-comment
    `:1275–1291`, the `sourcePath` guard `:1296–1299`, the `readBytes` guard
    `:1300–1306`, the frontmatter-YAML guard `:1307–1310`, the environment build
    `:1312–1317`, the per-field loop `:1319–1345`, `splitParamDefaultSource`
    (`:1324`, defined at `:5841`), `parseExpressionSource` (`:1328`,
    `src/parser/theta-document.ts:1169`) and **the push whose argument throws,
    `:1341–1344`** — `defaultValue: projectForValidation(evaluatePureExpression(parsed,
    env))` at `:1343`. Each of the four guards `continue`s or returns; none of
    them is an evaluation failure. `#mergeDeclaredDefaults` (`:1248`), its
    doc-comment `:1223–1247` carrying the never-throws sentence at `:1244–1246`,
    its in-body restatement `:1259–1262`, the recovery call `:1266`, the compile
    `:1270` and the `fillDefaultsAndRevalidate` call `:1271` — the last two
    unreachable when the recovery throws.
  - **The one path that reaches it.** `#recoverDeclaredDefaults` has exactly one
    caller (`:1266`); `#mergeDeclaredDefaults` has exactly one (`:915`, inside
    `runBinder`, `:722`), reached only on a slash invocation. The merge sits
    AFTER the binder call, so the model call at `:871`
    (`runBinderCallWithCancellation`) is already spent. The verdict routing
    `:922–925` and the BND-1 echo `:930` are downstream of the throw and never
    run. The subagent-root leg does not fill declared defaults —
    `#intakeSubagentRootParams` (`:2083`) validates marshalled params and binds
    them directly — so it never constructs a default value and never meets this
    position.
  - **Where the throw lands.** `src/extension/theta-composition-producer.ts`
    (519 lines): the outer top-level runtime-defect try `:405` (its WHY
    `:394–404`), the `runBinder` call `:410`, the catch `:464`, the `HostFatal`
    re-raise `:472–476`, the synthesized site `:477` (`theta.sourcePath ??
    theta.slashName` with `ZERO_BODY_RANGE`, `:81`), the `isThetaPanic` branch
    `:478–491` and the framing `:489` — `deps.emitPanicNote(\`theta
    /${theta.slashName} aborted: ${thrown.message}\`, diagnostic)`. The producer's
    emitter is `emitPanicNote` (`production-theta-producer.ts:1414`), one
    `pi.sendMessage` on `theta-system-note` with `display: true`, `details: {
    diagnostics: [diagnostic] }` and `{ triggerTurn: false }`. `paramBindingsFrom`
    (`theta-composition-producer.ts:417`) is downstream of the binder
    short-circuit and never runs.
  - **The load-time half that admits the spelling.** `src/parser/params.ts`
    (1514 lines): the default-half guard `:349`, the empty-RHS refusal `:369`,
    the raw-newline refusal `:380`, the is-literal check `:390`
    (`checkLiteralSublanguage`), the static type read `:408`
    (`defaultLiteralStaticType`) and the compat check `:413`
    (`checkParamsDefaultCompat`, `src/parser/type-compat.ts:782`) over the
    deliberately empty `defaultCompatEnv` (`:337`, its WHY `:328–336`). None of
    the five is a name-resolution check. `defaultLiteralStaticType`
    (`src/parser/literal-sublanguage.ts:673`) returns `undefined` for a `member`
    node, so the compat check `continue`s before it runs.
  - **Why the is-literal check cannot see the names.**
    `src/parser/literal-sublanguage.ts:520–522` — `firstNonLiteral`'s `member`
    arm is `return node.objectIsIdent ? undefined : node;`, with the comment
    "`Enum.Variant` only — the head must be a bare identifier (one level)". The
    node it judges (`:103`) is `{ kind: "member"; objectIsIdent: boolean }`: the
    two identifier TEXTS are not retained, so `grammar.md:26`'s "head is an enum
    name in scope, tail a declared variant" cannot be tested at this position
    without changing the node.
  - **The check that exists and the walk it is confined to.**
    `checkVariantAccess` (`src/parser/schema-declarations.ts:315`, the
    diagnostic at `:326`); its one call site
    `src/parser/theta-document.ts:6641`, inside `walkExpr`'s `member` arm
    (`:6632–6652`); `checkStructural` (`:5800`), which hoists the variant sets
    at `:5809–5818` into `StructuralRefs.enums` (`:5744–5746`). Its call site is
    `:857`, which runs AFTER `parseFrontmatter` (`:841`) — so the parsed
    `params:` fields, including each `defaultSource`, are in hand at the one
    position that also holds the variant sets.
  - **The merge boundary the value would have reached.**
    `fillDefaultsAndRevalidate` (`src/binder/defaulting.ts:124`, 169 lines), its
    fill-if-absent loop `:134–139` (the write `:136`) and the AJV step `:158`;
    `DefaultedField` (`:34`) and `defaultValue` (`:45`), whose doc-comment
    `:37–44` names `#recoverDeclaredDefaults` as "this field's one producer".
  - **The committed cells a fix must not red.**
    `tests/params-default-enum-access-merge.test.ts` — 0181's 10-cell witness
    (1039 lines); its cell table is `:292–317`, its enum-access fixtures are
    `s1` / `s3` / `s4` / `s5` / `s6` / `s13` (`:294–314`) and `s14` (`:316`,
    deferral row c6's fixture driven), every one a RESOLVABLE variant, and its
    value-mismatch control `s11` is at `:306`.
    `tests/params-default-type-compat.test.ts:437–468` — the deferral table,
    row c6 at `:452` and the shared body's `enum Sev { A, B }` at `:209`.
    `tests/live/live-production-acceptance.test.ts:6556` — cell 41's live
    fixture `sev: 'Sev = Sev.High'`.
    `tests/binder-post-merge-ajv-enforcement.test.ts`,
    `tests/defaulting-post-merge-classification.test.ts` and
    `tests/e2e-s5-binder-echo-emission.test.ts` — the merge, leaf and echo
    witnesses, none of which declares an enum.
  - **Corpus census, re-run at HEAD.** 34 committed `.theta` / `.thetalib`
    files; none declares a named `enum` (`git ls-files | grep -E
    '\.(theta|thetalib)$' | xargs rg -l '^\s*enum '` returns nothing), and none
    carries an `Enum.Variant` default, so
    `tests/committed-fixture-parse-gate.test.ts` never meets the input. Across
    `tests/`, every enum-access `params:` default in the tree names a variant
    that resolves — the three sites listed above and no other.
  - **Spec.** `docs/spec_topics/schemas.md:97` (variant access, and the
    unknown-variant rule); `docs/spec_topics/grammar.md:26` (`NamedValueLit`'s
    two side conditions);
    `docs/spec_topics/diagnostics/code-registry-parse.md:93`
    (`theta/parse/unknown-variant`) and `:63`
    (`theta/parse/unknown-identifier`);
    `docs/spec_topics/frontmatter/frontmatter-fields-a.md:57` (`params` are
    AJV-validated at invocation time), `:60` (§Defaults — the admitted
    production set including "`Enum.Variant` access", the
    `theta/parse/default-not-literal` clause, and "the default is filled in
    before AJV validation"), `:67` (the worked example `severity: Severity =
    Severity.Medium`), `:71` ("the literal sublanguage *is* a subset of the body
    expression grammar");
    `docs/spec_topics/type-system.md:48` (§Unresolvable operands);
    `docs/spec_topics/errors-and-results/error-model.md:65` (the closed V1
    panic-source list), `:69` (the `.field`-on-`null` row), `:74` (the list is
    closed; the runtime-defect surface), `:76` (the normative panic-message
    rule) and `:91` (the slash-command surface — one `theta-system-note` with
    `details: { diagnostics: [Diagnostic] }`);
    `docs/spec_topics/diagnostics/code-registry-runtime.md:15` (the
    `theta/runtime/null-member-access` row and its Trigger);
    `docs/spec_topics/expressions.md:9` (member access and its panic set);
    `docs/spec_topics/binder/defaulting-system-note-echo.md:9` (fill-if-absent),
    `:11` (the post-default-merge AJV hook). Reference mirrors:
    `docs/reference/errors-and-results.md:86`, `:108`;
    `docs/reference/diagnostics.md:244`.
- **Observed at:** v0.103.0 (`d470996e`, `package.json:3`). One measurement
  layer, offline, deterministic and provider-free: a scratch vitest probe built
  on `tests/params-default-enum-access-merge.test.ts`'s harness — real
  `parseThetaDocument`, real `createProductionProducerDeps`, the real
  `AjvSchemaValidator` with the shipped content-addressing, an in-memory
  `FileSystem` seam resolving each fixture's `sourcePath` so the real
  `#recoverDeclaredDefaults` re-reads the bytes the parser saw, the off-session
  pi-ai `complete()` mocked to return one scripted `ok` envelope, and the
  dispatch driven through the shipped `composeThetaFixture(...).run(...)` entry
  with the production `emitPanicNote` delivering the note. Ten driven fixtures
  and five parsed body fixtures; then deleted. No tracked file was modified for
  the whole run (`git status --short` empty before and after).

## Summary

`sev: 'Sev = Sev.Missing'` against `enum Sev { High = "high", Low = "low" }`
parses with zero diagnostics, lowers `{"$ref":"#/$defs/Sev"}` over
`$defs.Sev = {"type":"string","enum":["high","low"]}`, and registers. The same
sub-expression written in the body — `let x = Sev.Missing` — draws
`theta/parse/unknown-variant: unknown variant 'Missing' on enum 'Sev'`, the
diagnostic `docs/spec_topics/schemas.md:97` registers for exactly this
reference.

Every invocation of the registered theta aborts. `runBinder` issues its binder
model call, receives a valid `ok` envelope, and enters
`#mergeDeclaredDefaults`, whose recovery step re-reads the frontmatter and
evaluates each default through the body's pure evaluator.
`LexicalEnvironment.resolveEnumVariant` answers `undefined` for the missing
variant, `evaluatePureExpression`'s `member` arm falls through to
`evaluateMemberAccess(null, "Missing")`, and that raises
`NullMemberAccessPanic: null member access: .Missing`. The throw leaves
`runBinder` as a rejected promise, the slash dispatch's outer runtime-defect
catch frames it, and the operator receives one `theta-system-note`:

```
theta /s1 aborted: null member access: .Missing
details.diagnostics[0] = { code: "theta/runtime/null-member-access",
                           file: "/theta/s1.theta",
                           range: {0,0}-{0,0},
                           message: "null member access: .Missing" }
```

Nothing in that output names the enum, the variant, the param, or the
`params:` line. The range is the synthesized zero body range, so the note points
at the top of the file rather than at the declaration. The code's registered
trigger is a member access on an expression that evaluated to `null`, and the
author wrote no such expression — the `null` is manufactured two frames down by
the evaluator's own `ident` arm.

The abort does not depend on the default being used. Recovery iterates
`params.defaultedFields` before `fillDefaultsAndRevalidate` applies
fill-if-absent, so a caller who supplies the argument explicitly gets the
identical panic. The theta is unusable in every invocation shape it has.

A misspelled ENUM name produces byte-identical output.
`sev: 'Sev = Nope.Missing'` reaches the same `evaluateMemberAccess(null,
"Missing")` — `resolveEnumVariant` returns `undefined` for an unregistered enum
and for an unknown variant alike — so `theta /s1 aborted: null member access:
.Missing` is what the operator sees whichever of the two names is wrong. The
body position distinguishes them: `Sev.Missing` is
`theta/parse/unknown-variant`, `Nope.Missing` is
`theta/parse/unknown-identifier`.

The recovery states the opposite contract about itself.
`#mergeDeclaredDefaults`'s doc-comment enumerates three best-effort outcomes —
no `sourcePath`, an unreadable file, a default that does not parse — and closes
"never throws". A default that parses and then fails to resolve is a fourth
case, and it is the throwing one.

## Reproduction

Offline, deterministic, provider-free, at HEAD `d470996e` (v0.103.0). One
scratch vitest file on the harness of
`tests/params-default-enum-access-merge.test.ts`: real `parseThetaDocument`
with production-shaped deps, real `createProductionProducerDeps`, real
`AjvSchemaValidator`, an in-memory `FileSystem` keyed by `sourcePath`, one
scripted `ok` envelope, and the shipped `composeThetaFixture(...).run(...)`
dispatch with the production `emitPanicNote` performing the delivery. Every
fixture is `mode: prompt`, `bind_model: binder-model`, two params (`topic:
string` plus the field under test), and the body

```
enum Sev { High = "high", Low = "low" }
schema Box { sev: Sev, who: string }
schema Plain { who: string }
```

except row m4, which uses deferral row c6's body `enum Sev { A, B }`.

### (a) Load

Every fixture below parses with **zero diagnostics** and produces a lowered
`params:` document. The enum lowers to its wire values, which carry no variant
names, so nothing in the lowered form records what was misspelled:

```
sev: 'Sev = Sev.Missing'      diags []   properties.sev {"$ref":"#/$defs/Sev"}
sev: 'Sev = Nope.Missing'     diags []   properties.sev {"$ref":"#/$defs/Sev"}
sev: 'Sev = Sev.high'         diags []   properties.sev {"$ref":"#/$defs/Sev"}
box: 'Box = Box { sev: Sev.Missing, who: "w" }'
                              diags []   properties.box {"$ref":"#/$defs/Box"}
sevs: 'array<Sev> = [Sev.Missing]'
                              diags []   properties.sevs {"type":"array","items":{"$ref":"#/$defs/Sev"}}
sev: 'Sev | null = Sev.Missing'
                              diags []   properties.sev {"anyOf":[{"$ref":"#/$defs/Sev"},{"type":"null"}]}
$defs.Sev                     {"type":"string","enum":["high","low"]}
```

### (b) Invocation

Ten fixtures driven end to end. `bound` is the `runBinder` verdict, `throw` the
rejection observed at the `runBinder` call site, `note` the single delivered
`theta-system-note` content. Every row issues exactly **one** binder model call
before its outcome.

```
m1  sev: 'Sev = Sev.Missing'
    throw NullMemberAccessPanic  theta/runtime/null-member-access  "null member access: .Missing"
    note  theta /m1 aborted: null member access: .Missing
    details {"diagnostics":[{"severity":"error","code":"theta/runtime/null-member-access",
             "file":"/theta/m1.theta","range":{"start":{"line":0,"column":0},
             "end":{"line":0,"column":0}},"message":"null member access: .Missing"}]}
    display true   triggerTurn false   bound (none)   paramBindings (none)

m2  sev: 'Sev = Nope.Missing'        identical throw, identical message ".Missing"
m6  box: 'Box = Box { sev: Sev.Missing, who: "w" }'   identical throw
m7  sevs: 'array<Sev> = [Sev.Missing]'                identical throw
m8  sev: 'Sev | null = Sev.Missing'                   identical throw
m9  sev: 'Sev = Sev.high'            identical throw, message ".high"
m10 sev: 'Sev = Sev.Missing', envelope SUPPLIES {"sev":"low"}
    identical throw — recovery runs over `defaultedFields` before fill-if-absent

m3  sev: 'Sev = Sev.High'      bound true  {"topic":"hello","sev":"high"}
    note  Running /m3: topic=hello, sev=high (default)   details {"event":{}}
m4  p: 'Sev = Sev.A' (row c6)  bound true  {"topic":"hello","p":"A"}
    note  Running /m4: topic=hello, p=A (default)
m5  sev: 'Sev = "nope"'        bound false
    note  theta /m5: argument binding produced invalid args — /sev must be equal to one of the allowed values
    details {"event":{}}
```

m3, m4 and m5 are the fences. m3 and m4 are 0181's cells 1 and 10, green at
this HEAD. m5 is 0181's cell 9, the VALUE-mismatch control: a wire string
outside the variant set reaches the merge and is refused there, on the
post-default-merge AJV hook, with `details: { event: {} }`. The enum-access
spelling of the same mistake never reaches that hook and carries
`details: { diagnostics }` instead.

### (c) The same sub-expression in the body

Five bodies parsed through the same front end, no frontmatter default:

```
let x = Sev.Missing                        error theta/parse/unknown-variant: unknown variant 'Missing' on enum 'Sev'
let x = Sev.High                           (no diagnostics)
let x = Nope.Missing                       error theta/parse/unknown-identifier: unknown identifier 'Nope'
let x = Box { sev: Sev.Missing, who: "w" } error theta/parse/unknown-variant: unknown variant 'Missing' on enum 'Sev'
let x = [Sev.Missing]                      error theta/parse/unknown-variant: unknown variant 'Missing' on enum 'Sev'
```

The body refuses at every depth the `params:` default admits — a bare value, a
schema-constructor field, an array element. `frontmatter-fields-a.md:71` states
that "the literal sublanguage *is* a subset of the body expression grammar";
the two positions disagree on the same bytes.

### (d) Where the throw originates

`evaluatePureExpression`'s `member` arm, `production-theta-producer.ts:6085–6096`:

```ts
    case "member": {
      // `Enum.Variant` access: a member on an identifier that names a registered
      // enum (not a local binding) is a pure enum-value read, NOT a generic
      // member access on a null target (runtime-value-model.md, enum row).
      if (expr.target.kind === "ident" && env.resolve(expr.target.name).arm !== "local") {
        const variant = env.resolveEnumVariant(expr.target.name, expr.field);
        if (variant !== undefined) {
          return variant;
        }
      }
      // `.field` access — a `null` target raises `NullMemberAccessPanic` (V4b).
      return evaluateMemberAccess(evaluatePureExpression(expr.target, env), expr.field);
    }
```

The guard at `:6089` takes (`Sev` is not a local binding), `:6090` answers
`undefined`, `:6091` does not return, and `:6096` evaluates `Sev` as an
identifier. The `ident` arm (`:6063–6066`) answers `null` for a non-local
resolution, so `evaluateMemberAccess(null, "Missing")` throws at
`runtime-panics.ts:333`.

### (e) The four best-effort exits, and the fifth path

`#recoverDeclaredDefaults` returns early or `continue`s on each documented
best-effort case, all of which were exercised for contrast:

```
no `sourcePath`            :1296–1299  return []            (no throw)
unreadable file            :1300–1306  return []            (no throw)
no frontmatter YAML        :1307–1310  return []            (no throw)
default does not parse     :1328–1331  continue             (no throw)
default parses, does not resolve  :1343  evaluatePureExpression THROWS
```

The fifth row is not in the doc-comment's enumeration and is the only path out
of the function that is not a value.

## Expected behaviour

- **`docs/spec_topics/schemas.md:97`** — "Unknown-variant references
  (`Severity.Critical` when no such variant exists) are
  `theta/parse/unknown-variant`." The sentence scopes the rule to no position.
  `sev: 'Sev = Sev.Missing'` is an unknown-variant reference.
- **`docs/spec_topics/diagnostics/code-registry-parse.md:93`** registers the
  row: severity E, phase parse, Trigger "`Enum.Variant` reference where
  `Variant` is not a declared variant of `Enum`", message
  `unknown variant '<variant>' on enum '<enum>'`. A registered parse-phase row
  whose trigger is met and which does not fire is a row the input cannot reach
  at this position.
- **`docs/spec_topics/grammar.md:26`** — `NamedValueLit ::= Ident "." Ident //
  Enum.Variant access; head is an enum name in scope, tail a declared variant`.
  The two side conditions are part of the production. `Sev.Missing` fails the
  tail condition and `Nope.Missing` fails the head condition, so neither is a
  `NamedValueLit`, so neither is a `Literal`.
- **`docs/spec_topics/frontmatter/frontmatter-fields-a.md:60`** — the default
  RHS "is parsed by the **Theta literal sublanguage** … restricted to the
  production set normatively defined in [Grammar Appendix — Theta literal
  sublanguage]", and "violations are `theta/parse/default-not-literal` and the
  diagnostic names the offending sub-expression". Read with `grammar.md:26`,
  the RHS is a violation and the offending sub-expression is nameable.
- **`docs/spec_topics/frontmatter/frontmatter-fields-a.md:71`** — "the literal
  sublanguage *is* a subset of the body expression grammar". A subset relation
  admits no spelling the superset refuses. Today the `params:` position admits
  two the body refuses.
- **`docs/spec_topics/type-system.md:48`** (§Unresolvable operands) — "When
  either side of a compatibility check is past the parser's static view … the
  parse-time check is skipped and the runtime AJV check is the safety net."
  Three reasons this does not license the current behaviour: the sentence
  governs a compatibility check and variant existence is not one; the operand is
  not past the static view (the variant set is built in the same pass, at
  `theta-document.ts:5809–5818`); and the promised net is the runtime AJV check,
  which this input never reaches.
- **`docs/spec_topics/errors-and-results/error-model.md:65`, `:74`** — panics
  "abort the theta immediately", and the six V1 panic sources are a closed list
  of things a theta expression does. `:74` adds that unexpected interpreter
  exceptions "are not a new authoring concept (no theta expression 'causes'
  one)". A `params:` default whose variant does not exist causes a panic
  attributed to a source the author's expression does not contain.
- **`docs/spec_topics/diagnostics/code-registry-runtime.md:15`** — the
  `theta/runtime/null-member-access` row's Trigger is "`expr.field` where
  `expr` evaluated to `null`". `Sev` evaluated to `null` only because the
  evaluator has no other answer for an unresolved enum head; the source contains
  no `null`.
- **`docs/spec_topics/errors-and-results/error-model.md:76`** — the panic
  message templates are normative and a conformant runtime "MUST emit the
  registered string (with template placeholders filled from the offending
  value)". `null member access: .Missing` is the registered string; the
  offending value is not the one the author needs named.
- **The recovery's own contract**
  (`src/extension/production-theta-producer.ts:1244–1246`) — "Recovery is
  best-effort … never throws." Either the recovery does not throw, or the
  sentence is wrong. §Fix must make one of the two true.

Concretely, one of these two outcomes, chosen in §Fix:

```
LOAD REFUSAL    theta/parse/unknown-variant: unknown variant 'Missing' on enum 'Sev'
                at the `params:` field's own range; the theta does not register.

MERGE REFUSAL   theta /<name>: argument binding produced invalid args — <ajv-summary>
                naming `/sev`, on the post-default-merge hook, `details: {event:{}}`.
```

A panic is neither.

## Actual behaviour / root cause

### One check, one walk, and the position it does not cover

`checkVariantAccess` (`src/parser/schema-declarations.ts:315`) is the
implementation of `schemas.md:97`. It has exactly one call site:
`src/parser/theta-document.ts:6641`, inside `walkExpr`'s `member` arm
(`:6632–6652`), reached from `checkStructural` (`:5800`). `checkStructural`
takes the body block and hoists the declared variant sets from it
(`:5809–5818`) into `StructuralRefs.enums` (`:5744–5746`). It walks
`{ statements, tail }` and nothing else.

A `params:` default RHS is not in the body AST. It lives on
`ParsedParams.fields[].defaultSource` as source text, and is parsed for the
first time either by the load-time literal check (`params.ts:390`) or, much
later, by the recovery (`production-theta-producer.ts:1328`). Neither parse
consults an environment.

The position is not out of reach: `parseThetaDocument` calls `parseFrontmatter`
at `:841` and `checkStructural` at `:857`, so the parsed `params:` fields and
the body statements are both in hand at `:857`.

### Why the load-time default half cannot decide it as written

Five checks run over a default RHS (`src/parser/params.ts`):

| line | check | verdict on `Sev.Missing` |
| --- | --- | --- |
| `:349` | skip if the type half was refused | not skipped |
| `:369` | empty / whitespace-only RHS | not empty |
| `:380` | raw newline in a string literal | none |
| `:390` | `checkLiteralSublanguage` — is-literal | **admits** |
| `:413` | `checkParamsDefaultCompat` | **not reached** |

The is-literal check admits it at `literal-sublanguage.ts:520–522`:

```ts
    case "member":
      // `Enum.Variant` only — the head must be a bare identifier (one level).
      return node.objectIsIdent ? undefined : node;
```

The node under test (`:103`) is `{ kind: "member"; objectIsIdent: boolean }`.
The two identifiers are consumed during parsing (`:336–350`) and not retained,
so the check tests the SHAPE of `Ident "." Ident` and cannot test either of
`grammar.md:26`'s side conditions. Making it test them requires the node to
carry the names.

The compat check never runs: `defaultLiteralStaticType`
(`literal-sublanguage.ts:673`) handles a primitive literal and a flat array of
primitive literals and returns `undefined` for a `member` node, so
`params.ts:409` `continue`s. This is the same reason deferral row c6
(`Sev = Sev.A`) is silent — and c6 is silent *correctly*, because its variant
resolves. One `undefined` covers both.

The environment the compat check would consult is empty by design
(`params.ts:337`, its WHY at `:328–336`): the `params:` position holds only the
LOWERED JSON Schema for a declared `NamedType`, never the `CompatType`
declarations. The lowered enum is `{"type":"string","enum":["high","low"]}` —
wire values, no variant names — so even a non-empty compat environment built
from it could not answer whether `Missing` is declared.

### The evaluation, and where the `null` comes from

`#mergeDeclaredDefaults` (`:1248`) calls `#recoverDeclaredDefaults` (`:1266`)
before compiling the validator (`:1270`). The recovery loops the theta's
`defaultedFields` (`:1319`), re-reads each field's scalar from the frontmatter
YAML, splits the `= <literal>` RHS (`:1324`), parses it (`:1328`), and
evaluates it against an environment built from the theta's own body (`:1312`):

```ts
    defaults.push({
      wireName,
      defaultValue: projectForValidation(evaluatePureExpression(parsed, env)),
    });
```

`evaluatePureExpression`'s `member` arm (`:6085–6096`) is written for exactly
this input and handles the resolving case. Its guard (`:6089`) confirms the
target is a bare identifier that is not a local binding, and `:6090` asks
`env.resolveEnumVariant`. `LexicalEnvironment.resolveEnumVariant`
(`lexical-environment.ts:526`) looks the enum up (`:527`) and returns
`undefined` when the enum is unregistered OR the variant is not in its set
(`:528–530`) — one answer for two distinct authoring mistakes, which its own
doc-comment states (`:523–524`).

With `undefined` in hand the arm has no branch, so control reaches the
fallthrough at `:6096`. That line evaluates the target `Sev` through the
`ident` arm (`:6063–6066`), which answers `null` for any resolution that is not
`local`, and hands the `null` to `evaluateMemberAccess`
(`runtime-panics.ts:331`), whose first statement throws (`:333`).

The `null` is not in the author's program. It is the `ident` arm's
representation of an unresolved name — the same substitution bug 0140 reports
at a body value position — and the panic is the correct behaviour of
`evaluateMemberAccess` given a `null` it should never have been handed.

The comment at `:6095` states the intended reading — "`.field` access — a
`null` target raises `NullMemberAccessPanic` (V4b)" — which is true for a
genuine `a.b` on a null value. `Sev.Missing` is not that expression; the arm's
own comment three lines up says so ("a pure enum-value read, NOT a generic
member access on a null target"). The arm handles the classification correctly
when the variant resolves and abandons it when it does not.

### 0181's projection is not implicated

`projectForValidation` (`src/runtime/wire-translation.ts`) wraps the
evaluation's RESULT. The throw happens while computing its argument, so the
wrap is never entered. Measured identically at `9209f996` (before the 0181
fix), under that fix's route-a1 prototype, and at `d470996e` — the 0181 run
recorded all three, and this report re-measured the third.

### Where the throw surfaces

`runBinder` (`:722`) does not catch. `#mergeDeclaredDefaults` does not catch.
The rejected promise reaches `deps.runBinder(...)` at
`theta-composition-producer.ts:410`, inside the top-level runtime-defect try
(`:405`). The catch (`:464–516`) re-raises `HostFatal` (`:472–476`), synthesizes a
site from `theta.sourcePath` and `ZERO_BODY_RANGE` (`:477`, `:81`), takes the
`isThetaPanic` branch (`:478`) and calls `emitPanicNote` (`:489`) with
`` `theta /${theta.slashName} aborted: ${thrown.message}` ``.

That routing is correct for a panic. `error-model.md:91` specifies exactly this
surface — one `theta-system-note`, `details: { diagnostics: [Diagnostic] }`,
session not torn down — and the producer's emitter
(`production-theta-producer.ts:1414`) delivers it. The defect is upstream: a
panic is being routed, and there is no panic source in the author's program.

Three consequences follow from the framing rather than from the throw:

- The diagnostic's `range` is `ZERO_BODY_RANGE` (`{0,0}-{0,0}`) because a bare
  panic carries no `SourceRange`. The offending text is on the `params:` line,
  whose range the parser holds (`field.range`, used by all five load-time
  default checks).
- The `file` is the theta's `sourcePath`, so an editor surface following the
  diagnostic opens the right file at the wrong place.
- The binder model call at `:871` has already completed. The failure costs one
  model round trip per invocation and is not retried (the throw bypasses the
  retry taxonomy entirely).

### The contradicted contract

`#mergeDeclaredDefaults`'s doc-comment (`:1244–1246`) reads:

> Recovery is best-effort — a theta with no on-disk `sourcePath` (an in-memory
> fixture), an unreadable file, or a default that does not parse simply leaves
> that field unfilled (the prior behaviour for it), never throws.

The three enumerated cases are the three guarded exits (`:1296–1299`,
`:1300–1306` with `:1307–1310`, and `:1328–1331`). Evaluation failure is a
fourth case the sentence does not admit and does not handle. The in-body
restatement (`:1259–1262`) makes the same claim in the merge's own terms
("Recovery is best-effort and may yield nothing … That leaves the field
unfilled — it does NOT excuse the boundary: what did arrive is still validated
below"), and the "validated below" step is unreachable when the recovery
throws.

### Coverage

No committed `.theta` or `.thetalib` declares an enum, so the
committed-fixture parse gate never meets the input. Every enum-access `params:`
default across `tests/` names a variant that resolves: 0181's witness
(`tests/params-default-enum-access-merge.test.ts:292–317`, seven fixtures),
deferral row c6 (`tests/params-default-type-compat.test.ts:452`), and live cell
41 (`tests/live/live-production-acceptance.test.ts:6556`). Nothing in the tree
drives an unresolvable one, and `npm test` is green with the defect in place.

## Why it matters

- **An authoring typo produces a theta that loads, registers, and cannot run.**
  There is no invocation shape that works: the recovery iterates
  `defaultedFields` before fill-if-absent, so supplying the argument explicitly
  panics identically (§Reproduction (b) row m10).
- **The message names nothing the author can act on.** `null member access:
  .Missing` carries no enum name, no param name, no file position beyond the
  zero body range. The information needed — that `Sev` declares `High` and `Low`
  and not `Missing` — is available at load, in the same pass that already
  builds the variant set for the body walk.
- **Two different mistakes produce one output.** A misspelled variant
  (`Sev.Missing`) and a misspelled enum (`Nope.Missing`) both render
  `.Missing`. The body position separates them into
  `theta/parse/unknown-variant` and `theta/parse/unknown-identifier`.
- **The failure class is wrong, and the class is what a reader routes on.** A
  `theta/runtime/*` panic tells the operator the theta ran and hit a defect in
  its own code. Nothing ran: the body never started, no statement executed. A
  reader who takes the code at face value looks for a `null` dereference in a
  body that contains none.
- **The registered code's trigger is not met.** `code-registry-runtime.md:15`
  scopes `theta/runtime/null-member-access` to "`expr.field` where `expr`
  evaluated to `null`", and `error-model.md:74` states that the runtime-defect
  surface is "not a new authoring concept (no theta expression 'causes' one)".
  This panic is caused by an authoring expression, under a code whose trigger
  that expression does not match.
- **A documented contract is false.** `#recoverDeclaredDefaults` is the sole
  producer of `DefaultedField.defaultValue` (`defaulting.ts:37–44`), and its
  caller's doc-comment promises the recovery never throws. A future caller
  written against that promise inherits the same abort.
- **A model call is spent per attempt.** The binder runs to completion before
  the merge, so each invocation costs one real round trip and then aborts. The
  class carries no retry, because the throw never reaches the retry taxonomy.
- **The spec's own subset claim is falsified at this position.**
  `frontmatter-fields-a.md:71` states that the literal sublanguage is a subset
  of the body expression grammar. Two spellings the body refuses are admitted
  here (§Reproduction (c)).
- **No gate scores it.** No committed fixture declares an enum; every
  enum-access default in `tests/` resolves. The three positions that could red
  are all green and all correct.

## Fix

Make an unresolvable `Enum.Variant` in a `params:` default a refusal that names
the variant, and make the recovery's never-throws contract true. The evaluation
must not be handed a name that resolves to nothing.

### (a) Three candidate remedy points, with their measured end states

Each is reachable and each ends somewhere different. The run picks one (or a
pair) and records why.

1. **Load-time variant-existence check, beside the body's own.** The variant
   sets are built at `src/parser/theta-document.ts:5809–5818` for
   `checkStructural`'s walk, and `parseFrontmatter` has already produced the
   `params:` fields when `checkStructural` is called (`:841` then `:857`). A
   check over each field's `defaultSource` at that point reaches the same
   `checkVariantAccess` (`schema-declarations.ts:315`) the body position uses
   and refuses before registration. End state: the theta does not register, the
   diagnostic carries the field's own range, no binder call is ever made.
   Cost: the check needs the two identifier texts, which the literal
   sublanguage's `member` node (`literal-sublanguage.ts:103`) discards — either
   the node grows them, or the check re-parses the RHS with
   `parseExpressionSource` (`theta-document.ts:1169`), which retains them.
2. **A guard in the evaluator's `member` arm**
   (`production-theta-producer.ts:6091–6093`). When the target names a
   registered enum and `resolveEnumVariant` answers `undefined`, answer
   something other than the null-target fallthrough. End state depends on what
   it answers, and this is a decision the run must make explicitly, because
   **this arm is the body's evaluator too**: `evaluatePureExpression` has
   eight call sites outside its own recursion (`:1343`, `:1565`, `:1831`,
   `:2381`, `:3222`, `:3259`, `:3905`, `:5924`), and the body
   position is already protected by the parse gate, so any change here alters
   behaviour only for inputs the parse gate does not see — which is exactly this
   report's input, and is also bug 0140's.
3. **A catch inside the recovery** (`production-theta-producer.ts:1319–1345`),
   honouring the doc-comment by treating an evaluation throw as a fourth
   best-effort case. End state: the field is left unfilled, the merge proceeds,
   and AJV refuses the now-absent required field with
   `theta /<name>: argument binding produced invalid args — <ajv-summary>`
   naming `/sev` (`must have required property 'sev'` under the relaxed
   envelope's required set — the exact summary is measured in-run, not assumed).
   Cost: the refusal names the field but not the variant, and the theta still
   registers and still spends a binder call per invocation. This route makes the
   contract true without making the diagnosis good, so it is a floor rather than
   an answer — worth taking IN ADDITION to (1) so the contract holds for any
   future evaluation failure the parse gate does not pre-empt.

Route (1) is the only one that reaches the operator before a model call is
spent, and the only one that can name both the variant and the enum. Route (3)
is the only one that repairs the stated contract. They compose.

### (b) The code identity is an in-run adjudication

Two registered codes both fit, and the choice changes which spec sentence is
the authority:

- **`theta/parse/unknown-variant`** (`code-registry-parse.md:93`) — Trigger
  "`Enum.Variant` reference where `Variant` is not a declared variant of
  `Enum`", message `unknown variant '<variant>' on enum '<enum>'`. Already
  fires for the byte-identical body expression, so the corpus gains no new code
  and the two positions converge. Does not cover `Nope.Missing`, whose head
  names no enum — the body answers that with
  `theta/parse/unknown-identifier` (`:63`), and a fix taking this route decides
  whether the `params:` position mints the same pair or folds both.
- **`theta/parse/default-not-literal`**
  (`frontmatter-fields-a.md:60`) — the code that section assigns to a default
  RHS outside the `Literal` production set, with "the diagnostic names the
  offending sub-expression". Under `grammar.md:26` an unresolvable
  `Enum.Variant` is outside `NamedValueLit` and therefore outside `Literal`, so
  this code applies by construction and covers both spellings with one row.
  Costs a spec reading that the section's own sentence about which violations
  it names (operators, calls, non-`Enum.Variant` identifier references,
  interpolation, query templates) is a list of examples rather than the closed
  set.

Whichever is chosen, the choice is stated against both sentences and the
loser's sentence is left standing or corrected in the same commit. Minting a
third code is a DIAG-2 question and needs its registry row and spec edit in the
same commit.

### (c) Constraints on any implementation

1. **Deferral row c6 keeps loading silently.**
   `tests/params-default-type-compat.test.ts:452` (`"Sev = Sev.A"` against
   `enum Sev { A, B }`, body at `:209`) asserts zero diagnostics, and its
   variant RESOLVES. A load-time check must distinguish "the compat relation
   cannot decide this default's type" (c6's licence,
   `type-system.md:48`) from "this default names a variant the enum does not
   declare". The whole DEFERRED table (`:437–468`) stays green; no other row
   carries an `Enum.Variant`.
2. **0181's witness stays green, all ten cells.**
   `tests/params-default-enum-access-merge.test.ts` (1039 lines) drives seven
   enum-access fixtures (`:294–314`) plus row c6 (`:316`), every variant
   resolvable, and pins the merged `args`, the echo row and the projected
   body-scope binding for each. Nothing in this fix may change what a
   RESOLVABLE variant does at any of the five positions that file covers — the
   annotated field, both object spellings, the array element, the union arm.
3. **The value-mismatch fence stays at the merge.** `sev: 'Sev = "nope"'`
   (0181 cell 9, fixture `s11` at `:306`) refuses on the post-default-merge AJV
   hook with
   `theta /<name>: argument binding produced invalid args — /sev must be equal
   to one of the allowed values` and `details: { event: {} }`. A wire string
   outside the variant set is a VALUE question and stays deferred to
   invocation; this report moves only the case where the SPELLING resolves to
   nothing. A load-time check that also refused `"nope"` would over-refuse
   `type-system.md:48`'s deferral and red c6's neighbours c1–c5.
4. **No enum-representation change.** `makeEnumValue`
   (`src/runtime/value.ts`), the `ENUM_TAG` install, `projectForValidation`
   (`src/runtime/wire-translation.ts`) and `DefaultedField.defaultValue`'s
   wire-form contract (`src/binder/defaulting.ts:37–45`) are 0174's and 0181's
   settled surface and are byte-untouched. `tests/invoke-return-enum-carrier-projection.test.ts`
   and `tests/wire-translation-inbound-retag.test.ts` stay green.
5. **Live cell 41 stays green.**
   `tests/live/live-production-acceptance.test.ts:6556` drives
   `sev: 'Sev = Sev.High'` against a real binder model. A resolvable variant
   must keep binding through the live path.
6. **The recovery's doc-comment ends up true.** Whichever route lands, the
   sentence at `production-theta-producer.ts:1244–1246` and its in-body
   restatement at `:1259–1262` are re-derived so they describe what the function
   does. If route (3) is not taken, the sentence enumerates the evaluation-throw
   case and says where it is pre-empted.
7. **Both spellings are dispositioned.** `Sev = Sev.Missing` (unknown variant)
   and `Sev = Nope.Missing` (unregistered enum head) are indistinguishable
   today. The fix states what each produces, and the witness carries both.
   `Sev = Sev.high` (a case-mismatched spelling of a declared variant) is the
   third row: enum variant names are case-sensitive, so it belongs with the
   first.
8. **Bug 0140's disposition is stated, not assumed.**
   [0140](./0140-bare-schema-reference-value-position-silent.md) is open over
   the same panic reached the same way at a body value position, and its §Fix
   must choose between reusing `theta/parse/unknown-identifier` and minting a
   sibling. A fix here that touches `evaluatePureExpression`'s `member` arm
   (route 2) or that mints a new parse code re-derives 0140's rows rather than
   leaving two answers for one question. Neither report blocks the other from
   starting.

### (d) Witness

Offline, deterministic, provider-free, on the harness of
`tests/params-default-enum-access-merge.test.ts`. Rows: the four unresolvable
positions (bare field, schema-constructor field, array element, union arm), the
unregistered-enum head, the case-mismatched variant, the supplied-argument row
(m10 — the one that proves the abort is not conditional on the default being
used), and the three fences from §Reproduction (b) (`Sev.High`, row c6's
`Sev.A`, and the wire-string `"nope"`) asserted byte-identical on both sides.
The load half asserts the diagnostic's code, message and range against the
`params:` field; the invocation half asserts that `runBinder` settles on a value
rather than rejecting.

## Non-goals

- **0181's representation fix.** The projection of a recovered default to wire
  form landed at 0.103.0 (`production-theta-producer.ts:1343`) and is not
  reopened. This report's throw happens while computing that call's argument.
- **The resolvable-value paths.** Every position where the variant resolves —
  the annotated field, both object spellings, the array element, the union arm,
  row c6, live cell 41 — keeps its current bytes end to end. §Fix constraints 2
  and 5 pin them.
- **The value-mismatch fence.** `Sev = "nope"` is refused at the merge and
  stays refused there (§Fix constraint 3). Moving a VALUE question to load time
  would over-refuse `type-system.md:48`'s deferral.
- **Bug 0140's body-position subject.** A bare `schema` / `enum` name at a body
  value position resolving to `null` is 0140's, including its choice of code.
  This report cites it and coordinates (§Fix constraint 8); it does not decide
  it.
- **The `theta/runtime/null-member-access` panic itself.**
  `evaluateMemberAccess` (`runtime-panics.ts:331`) is correct given a `null`
  target, and `error-model.md:69` keeps the source on the closed V1 list. This
  report removes an input that should never reach it; it does not change the
  panic.
- **The panic routing.** The outer catch
  (`theta-composition-producer.ts:464–516`) implements `error-model.md:91`
  faithfully — one note, `details: { diagnostics }`, session preserved. Nothing
  about the surface is at issue.
- **`runtime-value-model.md`'s `params:`-defaults bypass sentence.** 0181's
  residual 2, unfiled at the time of writing and unchanged here.
- **Positional-citation drift into `production-theta-producer.ts`.** 0134's
  adjudicated do-not-chase class; every citation in this document was
  re-resolved at `d470996e` and none elsewhere is swept.

## Provenance

- Filing origin:
  [0181](./0181-enum-access-params-default-boxed-string-refused-at-merge.md)'s
  fix run (0.103.0, commit `e73c1aca`), residual **1** in
  `.pi/tmp/fixes/0181-report.md` §*Residuals / notes* — "An unresolvable
  `Enum.Variant` default THROWS out of the recovery … **Candidate for filing**".
  What this report adds beyond the residual: the end-to-end invocation
  observable measured on the production emitter (framing, code, range, file,
  `details` shape, `triggerTurn`, binder-call count); the load half measured at
  every depth; the body-position comparison that shows the same bytes drawing
  `theta/parse/unknown-variant`; the adjacent unregistered-enum and
  case-mismatch spellings; the supplied-argument row proving the abort is
  unconditional; the location correction on the never-throws sentence
  (`#mergeDeclaredDefaults`, not `#recoverDeclaredDefaults`); the mechanism for
  why the load-time half cannot decide it as written (the `member` node discards
  both identifiers); the confirmation that `theta-document.ts:857` holds both
  the variant sets and the parsed `params:` fields; and the measured
  non-involvement of 0177's renderer.
- Tree measured: HEAD `d470996e`, v0.103.0 (`package.json:3`).
  `git status --short` was empty before and after the measurement, so every
  cited byte is the committed byte.
- Implementation read: `src/extension/production-theta-producer.ts` (`:221`,
  `:246`, `:283`, `:722`, `:871`, `:915`, `:922–925`, `:930–931`, `:1223–1247`,
  `:1248`, `:1259–1262`, `:1266`, `:1270–1271`, `:1275–1291`, `:1292`,
  `:1296–1310`, `:1312–1317`, `:1319–1345`, `:1414`, `:2083`, `:5841`,
  `:6054`, `:6063–6066`, `:6085–6096`);
  `src/extension/theta-composition-producer.ts` (`:81`, `:275`, `:327`,
  `:394–404`, `:405`, `:410`, `:417`, `:464–516`);
  `src/runtime/lexical-environment.ts` (`:44`, `:521–533`);
  `src/runtime/runtime-panics.ts` (`:44`, `:99–105`, `:326`, `:331–333`);
  `src/binder/defaulting.ts` (`:34–46`, `:124`, `:134–139`, `:158`);
  `src/parser/params.ts` (`:328–337`, `:349`, `:369`, `:380`, `:390`, `:408`,
  `:413`); `src/parser/literal-sublanguage.ts` (`:103`, `:336–350`,
  `:520–522`, `:673`); `src/parser/theta-document.ts` (`:841`, `:857`,
  `:1169`, `:5744–5746`, `:5800`, `:5809–5818`, `:6632–6652`);
  `src/parser/schema-declarations.ts` (`:311–330`).
- Tests read (not modified): `tests/params-default-enum-access-merge.test.ts`
  (the harness and cell table `:1–317`, cell 1 at `:714`);
  `tests/params-default-type-compat.test.ts` (`:200–215`, `:430–468`, `:469–476`);
  `tests/live/live-production-acceptance.test.ts` (`:6548–6560`).
- Spec read: `docs/spec_topics/schemas.md:93`, `:97`;
  `docs/spec_topics/grammar.md:15`, `:26`;
  `docs/spec_topics/diagnostics/code-registry-parse.md:63`, `:93`, `:96`;
  `docs/spec_topics/diagnostics/code-registry-runtime.md:15`, `:23`;
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:57`, `:58`, `:60`,
  `:62–69`, `:71`; `docs/spec_topics/type-system.md:48`;
  `docs/spec_topics/errors-and-results/error-model.md:65`, `:69`, `:74`,
  `:76`, `:82`, `:91`; `docs/spec_topics/expressions.md:9`;
  `docs/spec_topics/binder/defaulting-system-note-echo.md:9`, `:11`.
- Bug corpus read:
  `docs/bugs/0181-enum-access-params-default-boxed-string-refused-at-merge.md`,
  `docs/bugs/0140-bare-schema-reference-value-position-silent.md`,
  `docs/bugs/0177-err-note-render-string-coercion-on-record-error-fields.md`,
  `docs/bugs/0183-production-conformance-comment-misnames-composition-root.md`,
  `docs/bugs/0184-union-arm-literal-lowers-empty-schema.md`.
- Measurement: one scratch vitest file on
  `tests/params-default-enum-access-merge.test.ts`'s harness — ten driven
  fixtures through `composeThetaFixture(...).run(...)` with the production
  `emitPanicNote`, and five body fixtures through `parseThetaDocument` — then
  deleted. Sweep after deletion: `git status --short` empty,
  `git status --short | grep -i scratch` empty, `ls -a tests tests/live | grep
  -i scratch` empty.
- Style authority: `docs/STYLE.md`.


## Fix (0.109.0)

- **Route settlement:** routes **(1) + (3)** of §Fix (a), composed as that
  section recommends. Route **(2) rejected** — the guard would sit in
  `evaluatePureExpression`'s `member` arm, which is the body's own evaluator
  with eight external call sites, so §Fix constraint 8 would make it re-derive
  bug [0140](./0140-bare-schema-reference-value-position-silent.md)'s rows.
  (1)+(3) touch no evaluator arm, so 0140's body-position subject is
  **untouched** and its code choice **stays open**; no note was appended to its
  document. Route (1) is the only route reaching the operator before a model
  call is spent and the only one that names both the variant and the enum;
  route (3) is the only one that repairs the recovery's stated contract, and it
  is the floor for the one input class the parse gate deliberately does not
  pre-empt (measured: `sev: 'Sev = Box.sev'`, a head that resolves but names no
  enum).

- **Code-identity adjudication (§Fix (b)):** the refusal carries
  **`theta/parse/unknown-variant`**, and the unregistered-enum head carries
  **`theta/parse/unknown-identifier`** — the SAME PAIR the body position mints
  for the byte-identical sub-expression. No new code, no registry row edited.
  Stated against both sentences:
  - *Winner* — `code-registry-parse.md`'s `theta/parse/unknown-variant` row and
    `schemas.md`'s "Unknown-variant references … are
    `theta/parse/unknown-variant`", which scopes the rule to no position. The
    two positions now converge, which is what `frontmatter-fields-a.md`
    §Defaults' "the literal sublanguage *is* a subset of the body expression
    grammar" requires.
  - *Loser, and its sentence corrected in this commit* —
    `frontmatter-fields-a.md` §Defaults' "violations are
    `theta/parse/default-not-literal`". The sentence **stands**, with one added
    clause: `default-not-literal` owns exactly the SHAPE violations that
    paragraph enumerates (operators, calls, identifier references other than
    `Enum.Variant`, `${…}` interpolation, `@`-templates), while
    `NamedValueLit`'s two side conditions are NAME-RESOLUTION conditions and
    draw the body's own codes here. `grammar.md` is untouched — its side
    conditions stay as written and are now enforced at both positions.
  - *Trigger determination* — **no widening, neither row edited.**
    `theta/parse/unknown-variant`'s Trigger ("`Enum.Variant` reference where
    `Variant` is not a declared variant of `Enum`") carries no position
    qualifier at all; `theta/parse/unknown-identifier`'s ("Bare identifier in
    call or value position resolves to nothing in scope") admits a default RHS,
    which is a value position. The `docs/reference/` mirrors need nothing:
    `diagnostics.md` carries no Trigger column (verified — code / severity /
    phase / message only) and `errors-and-results.md` names neither code.

- **Three-spelling disposition (§Fix constraint 7):**

  | `params:` default | load, post-fix | why |
  | --- | --- | --- |
  | `sev: 'Sev = Sev.Missing'` | `theta/parse/unknown-variant: unknown variant 'Missing' on enum 'Sev'` at the field's own range; not registered | head names a declared enum, tail undeclared |
  | `sev: 'Sev = Sev.high'` | `theta/parse/unknown-variant: unknown variant 'high' on enum 'Sev'`; not registered | variant names are case-sensitive, so it belongs with the first |
  | `sev: 'Sev = Nope.Missing'` | `theta/parse/unknown-identifier: unknown identifier 'Nope'`; not registered | head resolves to nothing in the whole-file root scope, exactly as in the body |
  | `sev: 'Sev = Box.sev'` (not one of the three — the route-3 subject) | silent at load; the invocation leaves the field unfilled and binds without it | head DOES resolve but names no enum; the body is silent for the same bytes, which is 0140's open subject, so refusing it here would decide 0140 |

- **What shipped:**
  - `src/parser/theta-document.ts` — route 1. `hoistEnumVariants` extracted so
    the body walk and the new check decide `Enum.Variant` against one set;
    `checkParamsDefaultNames` / `walkParamsDefaultNames` re-parse each field's
    `defaultSource` with `parseExpressionSource` (the literal sublanguage's
    `member` node retains neither identifier text), descend the sublanguage's
    two container productions, and emit the body's own `checkVariantAccess`
    diagnostic or `theta/parse/unknown-identifier` at the field's own range;
    wired after `checkUnknownIdentifiers`. A field the frontmatter parse already
    refused is skipped, keeping the one-diagnostic-per-offending-field
    precedence the `params:` default checks hold among themselves.
  - `src/parser/frontmatter.ts` — `FrontmatterParseResult` gains the required
    `paramFields`, the located fields the new check points its diagnostics at
    (`ParsedFrontmatter.params.fields` is the binder's bypass projection and
    carries no range).
  - `src/extension/production-theta-producer.ts` — route 3.
    `#recoverDeclaredDefaults` absorbs ONLY `isThetaPanic(thrown)` (`continue`,
    leaving the field unfilled) and re-raises every other throw unchanged, so
    `HostFatal`'s NOCEIL-3 propagation and the runtime-defect surface are
    unaffected. `CLAUDE.md`'s no-broad-catch rule is honoured through the house
    same-line `allow-broad-catch` token plus the immediate re-raise, the shape
    `theta-composition-producer.ts`'s own outer catch already uses; the
    AcceleratorClient carve-out does not apply.
  - `docs/spec_topics/frontmatter/frontmatter-fields-a.md` — the §Defaults
    clause recording the adjudication above.
  - `tests/binder-model-resolution.test.ts`,
    `tests/registration-reload-wiring.test.ts` — `paramFields: []` on two
    hand-built `FrontmatterParseResult` literals; mechanical, no assertion
    touched.

- **The contract re-derivation (§Fix constraint 6), and one place this document
  was wrong.** §Fix (a) route 3 predicts the unfilled field is then refused by
  the post-default-merge AJV hook with `must have required property 'sev'`. It
  is **not**: a DEFAULTED field is never written into the lowered schema's
  `required` set (`parseParams` guards `required.push(field.name)` on
  `field.defaultSource === undefined`), so the absence is ADMITTED and the
  invocation binds without the field — the same end state the three
  already-documented best-effort cases reach. That is precisely what makes the
  never-throws sentence TRUE, so `#mergeDeclaredDefaults`'s doc-comment (the
  location this document itself corrected) and its in-body restatement now
  enumerate the fourth case and describe that measured end state rather than a
  refusal. Round-1 review caught a first draft of those comments asserting the
  predicted refusal and it was rewritten.

- **GOV-15 enumeration.** A load-time refusal makes a currently-loading theta
  refuse. The flip class is exactly: a `params:` default whose `Enum.Variant`
  head names a declared body `enum` with an undeclared or case-mismatched
  variant, or whose head resolves to no name in the whole-file root scope.
  Census re-verified at HEAD `a8d95853`: 34 committed `.theta` / `.thetalib`
  files, none declaring a named `enum` (`git ls-files | grep -E
  '\.(theta|thetalib)$' | xargs rg -l '^\s*enum '` returns no match), so
  `tests/committed-fixture-parse-gate.test.ts` never meets the input; and every
  enum-access `params:` default across `tests/` names a resolvable variant. The
  flip class is therefore empty in this repository and consists only of
  authoring mistakes that registered and then aborted every invocation.

- **Gates** (verbatim, at the final tree, re-run by the orchestrator):
  - witness — `npx vitest run tests/params-default-unresolvable-enum-variant.test.ts`
    gives `Test Files  1 passed (1)` / `Tests  14 passed (14)`
  - default suite — `npm test` gives `Test Files  313 passed (313)` /
    `Tests  5249 passed (5249)`
  - typecheck — `npx tsc --noEmit -p tsconfig.json` clean, no output
  - lint — `npm run lint` clean, exit 0
  - live H8a — `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/live-production-acceptance.test.ts` gives
    `Tests  47 passed (47)` (46 to 47 cells, pure append, zero deletions)
  - live H9a — `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/acceptance/` gives `Test Files  2 passed (2)` /
    `Tests  11 passed (11)`

- **Tests that lock it:**
  - `tests/params-default-unresolvable-enum-variant.test.ts` — the §Fix (d)
    witness, 14 cells: the four unresolvable positions plus the bare-object
    spelling, the case-mismatched variant, the unregistered-enum head, the
    supplied-argument row (proving the abort was unconditional), the route-3
    invocation row, the one-diagnostic-per-field precedence row, a range oracle
    calibrated against a range the shipped parser emitted, and the three
    fences. The load half asserts code, message and RANGE against the `params:`
    field's own range; the message half is read from the committed registry
    pages (DIAG-4), not restated.
  - H8a cell 47 in `tests/live/live-production-acceptance.test.ts` — the live
    load-refusal cell: through the real discovery-to-registration path, the
    refusing theta does not register and the `theta-system-note` channel names
    the variant and the enum, while a precondition control and a same-shape
    RESOLVABLE sibling both register. Registration-only, so it spends **zero
    model turns** and spawns no subagent child.

- **Review:** 2 rounds, plus one pre-review correction round (not a review
  round).
  - *Pre-review correction* — the implementer had swept `path:line` citations
    across 14 unrelated test files, the class
    [0134](./0134-params-shift-induced-stale-citations.md) adjudicates as
    do-not-chase and which §Non-goals excludes, one of them inside a protected
    witness. All 14 restored byte-exact (`git hash-object` verified against
    `git rev-parse HEAD:<path>` for each); gates re-run green afterwards.
  - *Round 1* (deep) — DEFECTS, one blocker: the two new recovery comments
    asserted an AJV refusal of the unfilled field that does not occur
    (`fidelity`, §Fix constraint 6). Categories correctness, spec, test and
    house-rule declared clean with quoted evidence. One non-blocking residual
    (a witness-header citation off by seven lines, 0134's class, not chased).
  - *Round 1 fixer* — both comments rewritten to the measured end state; zero
    executable lines changed, proven by emitting both versions with
    `removeComments: true` (byte-identical, 109852 bytes each).
  - *Round 2* (fast) — CLEAN, no findings, no escalation.

- **Verification:** SOLID, four obligations discharged.
  1. *Both directions.* Route 1 neutralised (the new diagnostics dropped from
     `assembleDiagnostics`) gives `Tests  8 failed | 6 passed (14)`, exactly the
     eight load rows, fences green; restored byte-exact gives 14/14. Route 3
     neutralised (the uncaught call restored) gives `Tests  1 failed | 13 passed
     (14)`, the route-3 cell red on `theta /m11 aborted: null member access:
     .sev`; restored byte-exact gives 14/14. H8a cell 47 red-proved under the
     route-1 neutralisation ("the theta … registered anyway"), then restored. No
     `git stash`, no `git checkout`, no `git restore`.
  2. *Default suite* — 313 files / 5249 tests green.
  3. *Live* — H8a 47/47 for real; H9a 11/11 for real. **Permitted-codes
     decision: NO APPEND** — decided by the run
     (`assertCodesSubsetOfPermitted` passed in all nine feature cells, so no
     H9a fixture emitted either code), corroborated by the static
     no-`enum`-fixture census.
  4. *Typecheck and lint* — both clean.

- **Residuals:**
  1. **One `undefined` still covers two mistakes inside `resolveEnumVariant`.**
     `LexicalEnvironment.resolveEnumVariant` answers `undefined` for an
     unregistered enum and for an unknown variant alike, as its own doc-comment
     states. This fix separates the two spellings at the `params:` position by
     resolving the head against the whole-file root scope BEFORE consulting the
     variant set, so the resolver was not split. Disposition: recorded, not
     changed — splitting it would be a runtime-seam change with no observable
     this fix needs.
  2. **A head that resolves but names no enum stays silent at load.**
     `sev: 'Sev = Box.sev'` loads, and route 3 turns its abort into an unfilled
     field. Deciding it at load is
     [0140](./0140-bare-schema-reference-value-position-silent.md)'s open
     subject at the body position, and §Non-goals scopes it out here. The
     witness's route-3 cell pins the non-aborting end state so a later 0140 fix
     has a fence to move against. Not re-filed.
  3. **Positional-citation drift.** `theta-document.ts` grew 183 lines,
     `production-theta-producer.ts` 29 and `frontmatter.ts` 9, so citations into
     them from other documents shifted. 0134's adjudicated do-not-chase class;
     disclosed, not chased — and a sweep begun in error was reverted (see the
     pre-review correction round above). One self-citation INSIDE an edited file
     (`theta-document.ts`'s `StructuralRefs` doc-comment citing
     `frontmatter.ts`, a file this fix itself grew) was re-derived.
  4. **`docs/reference/errors-and-results.md` and `docs/reference/diagnostics.md`
     were verified, not edited.** `diagnostics.md` carries no Trigger column, so
     there was nothing to widen; `errors-and-results.md` names neither code.
     Recorded so a later reader does not re-derive the check.

- **Discharge notes appended:** one.
  [0181](./0181-enum-access-params-default-boxed-string-refused-at-merge.md) —
  its `## Fix (0.103.0)` residual **1** (this report's origin) is discharged:
  the recovery no longer throws on an unresolvable `Enum.Variant`, and the
  spelling is refused at load before the recovery is reached.

- **Pinned dispositions / non-goals:** the evaluator's `member` arm in
  `evaluatePureExpression` is byte-untouched (route 2 rejected), and so are
  `makeEnumValue`, the `ENUM_TAG` install, `projectForValidation` and
  `DefaultedField`'s wire-form contract (§Fix constraint 4); bug 0177's SLSH-3
  `Err`-note renderer is untouched and was re-measured non-involved at HEAD
  (`emitTopLevelErrNote` was never called in any reproduction row — the panic
  routes through `emitPanicNote`, the other arm of the same outer catch); the
  value-mismatch fence stays at the merge (`Sev = "nope"` still refuses there
  with `details: { event: {} }`, §Fix constraint 3); deferral row c6 still loads
  silently and the whole DEFERRED table is green (§Fix constraint 1); 0181's ten
  cells are green and byte-untouched (§Fix constraint 2); live cell 41 is
  byte-identical (§Fix constraint 5); `runtime-value-model.md`'s
  `params:`-defaults bypass sentence (bug 0186) and the placeholder registry
  (bug 0189) are untouched; no new diagnostic code was minted and no registry
  row was edited.
