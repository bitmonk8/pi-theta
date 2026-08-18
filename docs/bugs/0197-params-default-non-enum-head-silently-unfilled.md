# Bug 0197 — A `params:` default whose member-access head RESOLVES but names no enum — `sev: 'Sev = Box.sev'` against a declared `schema Box` — loads with zero diagnostics, and every invocation that omits the field binds WITHOUT it: `checkParamsDefaultNames` (`theta-document.ts:5934–5959`) refuses only an undeclared variant of a declared enum and a head that resolves to nothing, the recovery's `isThetaPanic` catch (`production-theta-producer.ts:1364–1371`) absorbs the panic, a defaulted field is never in the lowered schema's `required` set (`params.ts:277–278`) so the post-merge AJV check admits the absence, and the operator's success echo tags the field `(default)` while rendering `null` — a declared default admitted at load and never bound, after which a `string`-annotated param reaches the body as `null` (measured `"hi null"`) or the first field read aborts the theta at `theta/runtime/null-member-access`

- **Status:** open. §Fix is constraint-pinned, not settled: three remedy points
  are enumerated with their measured end states, and the run adjudicates the
  code identity (`theta/parse/default-not-literal`,
  `theta/parse/unknown-identifier`, or a DIAG-2 mint) against the sentences
  §Expected behaviour quotes. Ordering: nothing blocks this report
  from starting and it blocks nothing, but two open reports meet it and neither
  may be assumed —
  [0140](./0140-bare-schema-reference-value-position-silent.md) owns the
  identifier root set this position's gate consumes, so a 0140 fix that stops
  folding declaration names into the value scope changes this position's verdict
  without deciding it (§Fix (e1), mechanism verified); and
  [0191](./0191-enum-name-shadowed-by-schema-fabricates-member-type.md) owns the
  enum-name question at the head, which this gate and the type layer answer
  differently today (§Reproduction (f)). A fix here also **flips cell C** of
  `tests/params-default-unresolvable-enum-variant.test.ts:1157–1200`, which pins
  the current end state as a fence for exactly this input; the flip is this
  report's to authorise, because
  [0185](./0185-unresolvable-enum-variant-default-panics-recovery.md)'s
  `## Fix (0.109.0)` installed the cell for that purpose.
- **Sev/Diff estimate:** S1/D3 — S1 because the theta loads with zero
  diagnostics, registers, binds, and runs while the declared default is never
  applied: the invocation's `args` omit the field (`{"topic":"hello"}`
  measured), the body reads `null` out of a `string`-annotated param and renders
  `"hi null"` through `+`, an `==` against a variant answers `false`, and no
  diagnostic reaches any surface — the observable class
  [0165](./0165-empty-params-default-literal-admitted-and-never-bound.md) was
  filed S1 for and fixed at 0.92.0, at a spelling 0165's fix does not reach.
  The one loud row (`box.who` on the unfilled field aborts at
  `theta/runtime/null-member-access` with the zero body range, §Reproduction
  (c5)) is a consequence of the same absence and names the field, not the
  default. D3 because §Fix needs in-run adjudication on the code identity and on
  which boundary refuses, because the load-gate arm it edits shares its root set
  with 0140's fix surface and its head classification with 0191's open subject,
  and because the change flips a committed witness cell and must leave 0163's
  DEFERRED table, 0181's ten cells and live cells 41 / 47 byte-identical.
- **Kind:** defect, three elements, each measured at HEAD `0a80c706`, v0.109.0.
  1. *No load-time refusal, and no registered code claims the spelling.*
     `docs/spec_topics/grammar.md:26` makes both identifiers side conditions of
     the production — `NamedValueLit ::= Ident "." Ident // Enum.Variant access;
     head is an enum name in scope, tail a declared variant`. `Box` is a
     declared `schema`, not an enum name, so `Box.sev` fails the head condition
     and derives no arm of `Literal`.
     `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60` carries two
     clauses that answer this spelling differently and neither is emitted: its
     shape clause refuses "identifier references other than `Enum.Variant`" with
     `theta/parse/default-not-literal`, and its 0185 clause removes
     `NamedValueLit`'s side conditions from that code's reach while enumerating
     only "`theta/parse/unknown-identifier` for a head that resolves to
     nothing". Measured: `[]` at every admitted depth (§Reproduction (a)).
  2. *A declared default is never bound, on a theta that loaded clean.*
     `frontmatter-fields-a.md:60` — "When a slash-command invocation omits the
     corresponding positional argument, the default is filled in before AJV
     validation" — and
     `docs/spec_topics/binder/defaulting-system-note-echo.md:9` — "when the wire
     name is absent, the field takes its declared default". Measured: the
     recovery absorbs the evaluation panic and `continue`s
     (`src/extension/production-theta-producer.ts:1364–1371`), so the field is
     absent from `defaults`; `fillDefaultsAndRevalidate` fills nothing for it
     (`src/binder/defaulting.ts:134–139`); the field is not in `required`
     (`src/parser/params.ts:277–278`), so the post-default-merge AJV check
     admits the absence; `bound` is `true` and `args` is `{"topic":"hello"}`.
  3. *The success echo asserts the fill that did not happen.*
     `defaulting-system-note-echo.md:9` — "Only a field that took its declared
     default this way is tagged `(default)`". Measured note:
     `Running /b1: topic=hello, sev=null (default)`. The tag is recomputed from
     the binder args rather than read from the fill step's own report:
     `production-theta-producer.ts:968–970` tests
     `defaulted.has(wireName) && !hasOwnProperty(binderArgs, wireName)`, while
     `fillDefaultsAndRevalidate` returns `defaultedWireNames` for the fields
     that actually took a default (`defaulting.ts:132–139`), whose doc-comment
     (`:70–74`) and the render layer's own contract
     (`src/render/argument-echo.ts:67–74`) both name that list as the tag's
     source. Nothing in `src/` reads it. The `null` comes from the absent key's
     `?? null` coalesce (`production-theta-producer.ts:964`).
- **Related:**
  - [0185](./0185-unresolvable-enum-variant-default-panics-recovery.md) —
    **fixed (0.109.0)**, commit `ce9c1090`, the filing origin. This report is
    that fix's residual **2** in the bug document's `## Fix (0.109.0)`
    (item **3** of `.pi/tmp/fixes/0185-report.md` §*Residuals / notes*), which
    recorded the spelling, named it not-re-filed, and pinned its end state as a
    fence. 0185 refused the two spellings whose names do not resolve and
    converted the former per-invocation abort into the unfilled field measured
    here; both halves are its settled surface and neither is reopened. The
    residual's own disposition — "Deciding it at load is bug 0140's open subject
    at the body position and §Non-goals scopes it out here … Not re-filed" — is
    what this filing overrides, on the parent's authority (§Provenance).
  - [0165](./0165-empty-params-default-literal-admitted-and-never-bound.md) —
    **fixed (0.92.0)**, the observable-class precedent and the reason element 2
    is not a novel judgement: a `params:` default admitted at load whose field is
    then never bound, measured there as `p = null` for a non-nullable declared
    param with no diagnostic on any surface, filed S1 and fixed in the
    load-time admission rather than in the recovery. The two classes are
    disjoint on the measured input: 0165's default does not parse at all
    (`p: 'string = '`), so `parseExpressionSource` answers `null` and the
    recovery's third best-effort arm takes; this report's default parses,
    evaluates, and panics. 0165's fix does not reach this spelling and this
    report does not reopen it.
  - [0140](./0140-bare-schema-reference-value-position-silent.md) — **open**,
    the same cause at the **body** value position, and **not the owner of this
    defect**. Its subject is a bare `schema` / `enum` name reaching an
    identifier position through `collectIdentRoots`'s fold
    (`src/parser/theta-document.ts:4746`, the arm at `:4753–4757`); its rows c7
    and e4 measure `let out = P.a` loading clean and aborting at the first field
    read, which is the body-position half of the same mechanism and is
    re-measured unchanged at this HEAD (§Reproduction (d)). It claims no `params:`
    position: its §Reproduction is body sources only, its two `params:` mentions
    are quotations of `collectIdentRoots`'s comment, and its §Fix edits the
    identifier walk. **The two do meet, and mechanically:**
    `checkParamsDefaultNames` is handed `identRoots`
    (`theta-document.ts:899–905`), so a 0140 route-1 fix that stops folding
    declaration names into the value scope makes this position's third arm start
    emitting `theta/parse/unknown-identifier: unknown identifier 'Box'` for a
    name the author declared — the verdict changes with no decision taken here
    (§Fix (e1)). Whichever lands second states the other's disposition; a fix
    here must agree with 0140 on the code, not pre-empt it silently.
  - [0191](./0191-enum-name-shadowed-by-schema-fabricates-member-type.md) —
    **open**, and binding on the head classification any route needs. Its
    subject is `#typeExpr`'s `member` arm adopting the shadowing `schema` when a
    same-file `schema X` shadows `enum X`
    (`src/parser/static-type-inference.ts`). This gate answers the same question
    the other way: `hoistEnumVariants` (`theta-document.ts:5830`) is consulted
    FIRST (`:5939`), so under a shadow the head is an enum here and a schema
    there — measured (§Reproduction (f)): `Color = Color.Red` loads clean and
    `Color = Color.a` draws `unknown variant 'a' on enum 'Color'` although `a`
    is a declared field of the shadowing schema. A route that classifies the
    head by declaration kind states which declaration wins, and must not adopt
    the type layer's shadow-preferring answer, or a shadowed `X.Variant`
    default that loads today starts refusing.
  - [0163](./0163-params-default-type-compat-unchecked-at-load.md) — **fixed
    (0.88.0)**, the owner of the load-time compatibility gate and of the
    deferral table this input sits beside, and the licence boundary this report
    must not cross. Row **c6** (`tests/params-default-type-compat.test.ts:452`,
    `"Sev = Sev.A"`) asserts load silence under
    `docs/spec_topics/type-system.md:48`. **Boundary:** that paragraph governs a
    compatibility check "past the parser's static view" and promises "the
    runtime AJV check is the safety net". Whether a member-access head names an
    enum is not a compatibility question, the operand is not past the static
    view (the same call site holds the hoisted variant sets and the whole-file
    roots, `theta-document.ts:899–905`), and the promised net does not exist for
    this input — a defaulted field is never in `required` (`params.ts:277–278`),
    so AJV cannot see the absence. c6 stays silent and binds (§Fix (c1)).
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    adjudicated do-not-chase class for positional drift.
    `src/parser/theta-document.ts` is **7184** lines and
    `src/extension/production-theta-producer.ts` **6422** at this HEAD (0185's
    fix grew them by 183 and 29), so every volatile position below is named by
    symbol beside its line and every line was re-resolved at `0a80c706` rather
    than copied from 0185's or 0140's document.
- **Affected** (every citation re-verified against the tree at HEAD `0a80c706`,
  v0.109.0 (`package.json:3`), by `rg` and by reading the file; symbols named
  beside lines. `git status --short` was empty when the measurement began, so
  every cited byte is the committed byte; a parallel sibling session's
  uncommitted work (`tests/off-session-transport-classification.test.ts` and its
  own scratch probe) appeared afterwards and no file this report cites is among
  them):
  - **The load gate that does not claim the spelling.**
    `checkParamsDefaultNames` (`src/parser/theta-document.ts:5883`), its
    doc-comment `:5847–5882` — which states the exemption in terms at
    `:5871–5875` ("A head that DOES resolve but names no enum … is neither arm:
    the body admits that spelling silently too, so refusing it here would break
    the subset relation in the other direction and would pre-empt an open
    question about the body position. It stays deferred to the invocation
    boundary") — the per-field loop `:5891–5905`, the already-refused skip
    `:5893–5895`, the re-parse `:5900` (`parseExpressionSource`,
    `theta-document.ts:1169`); `walkParamsDefaultNames` (`:5916`), its array and
    object descents `:5924–5933`, and **the `member` arm this report is about,
    `:5934–5959`**: the enum-head arm `:5939–5949` (`enums.get(head)` then the
    body's own `checkVariantAccess`), the unresolved-head arm `:5950–5958`
    (`!roots.has(head)`), and the silent `return` `:5959` that both fall through
    to. `hoistEnumVariants` (`:5830`) and the call site `:899–905`, which passes
    `identRoots` and `frontmatterRefusedRanges` beside the hoisted sets.
  - **The root set the gate calls "resolves".** `collectIdentRoots` (`:4746`):
    builtins `:4750`, the `fn` / `schema` / `enum` fold `:4753–4757`, imported
    symbols `:4758–4766`, `params:` field names `:4772–4774`, resolved `tools:`
    callable names `:4775–4780`. Every member of that set except a declared
    `enum` is a head this report's class covers; §Reproduction (a) measures
    three of the kinds.
  - **The environment the default is actually evaluated in, which binds fewer
    names.** `#recoverDeclaredDefaults`
    (`src/extension/production-theta-producer.ts:1301`) builds it at
    `:1321–1326` — `buildBoundEnvironment(theta.body, undefined, theta.imports,
    presentedCallableNames(theta))` — with `paramBindings` **`undefined`**, so no
    `params:` field is a `local` binding while a default evaluates.
    `buildBoundEnvironment` (`:4008`) registers the body's enums `:4018–4027`
    and defines param slots only when the map is present `:4034–4043`. The two
    notions of "resolves" therefore differ: the gate's root scope holds names
    the evaluator answers `null` for.
  - **The evaluation that produces the panic.** `evaluatePureExpression`'s
    `member` arm (`:6173–6186`): the enum-access guard `:6177`, the
    `resolveEnumVariant` call `:6179`, the `variant !== undefined` return
    `:6180–6182`, the comment `:6184` and the fall-through call `:6185`; the
    `ident` arm that supplies the `null` target `:6152–6155`
    (`resolution.arm === "local" ? resolution.value ?? null : null`).
    `LexicalEnvironment.resolveEnumVariant`
    (`src/runtime/lexical-environment.ts:526`) answers `undefined` at `:528–530`
    for a head that registers no enum. `evaluateMemberAccess`
    (`src/runtime/runtime-panics.ts:331`) throws `NullMemberAccessPanic` at
    `:333`.
  - **The absorption that makes the field disappear** — `:1350–1371`, added by
    0185 route 3: the WHY comment `:1350–1362`, `try` `:1364`, the
    `isThetaPanic` test and re-raise `:1367–1369`, and **the `continue` at
    `:1370`** that leaves the field out of `defaults` `:1372–1375`.
    `#mergeDeclaredDefaults` (`:1257`), its doc-comment's four-case
    best-effort passage `:1246–1256`, the recovery call `:1275`, the compile
    `:1279` and `fillDefaultsAndRevalidate` `:1280`.
  - **The boundary that admits the absence.** `fillDefaultsAndRevalidate`
    (`src/binder/defaulting.ts:124`), the fill-if-absent loop `:134–139` (which
    iterates `input.defaults` and so never sees the skipped field), the depth
    walk `:146` and the AJV step `:158`; `FillDefaultsResult.defaultedWireNames`
    (`:73`) and its doc-comment `:70–74`. `parseParams`
    (`src/parser/params.ts`) writes `required.push(field.name)` only under
    `field.defaultSource === undefined` (`:277–278`), which is why the lowered
    document for `sev: 'Sev = Box.sev'` is
    `required: ["topic"]`, `properties.sev: {"$ref":"#/$defs/Sev"}`
    (§Reproduction (e)).
  - **The echo that mis-tags it.** `#emitBinderEchoNote` (`:947`), its
    doc-comment `:936–946`, the value read `:964` (`mergedArgs[field.wireName]
    ?? null`), the `tookDefault` recomputation `:968–970` under a comment
    claiming fill-if-absent `:965–967`, the delivery `:981–989`
    (`details: { event: {} }`, `display: true`, `triggerTurn: false`).
    `EchoParam.tookDefault` (`src/render/argument-echo.ts:74`) and its
    doc-comment `:67–73`, which names `defaultedWireNames` as the source.
  - **The system prompt that instructs the omission.** The per-field requirement
    token is rendered `default=<literal>` at
    `src/binder/binder-system-prompt.ts:173`, and `:345` instructs the model
    "Do not invent values for defaulted parameters that the user did not
    specify; omit them." Measured line for the reported fixture:
    `sev (Sev) default=Box.sev` (§Reproduction (b1)). The omission the prompt
    asks for is the input that loses the default.
  - **Why the five load-time default checks cannot decide it as written.**
    `src/parser/params.ts`: the type-half skip `:349`, the empty-RHS refusal
    `:369`, the raw-newline refusal `:380`, `checkLiteralSublanguage` `:390`,
    `defaultLiteralStaticType` `:408` and `checkParamsDefaultCompat` `:413`.
    The is-literal arm admits the form on shape alone —
    `src/parser/literal-sublanguage.ts:520–522`, `return node.objectIsIdent ?
    undefined : node;` over a node that keeps only `objectIsIdent` (`:103`) —
    and `defaultLiteralStaticType` (`:673`) answers `undefined` for a `member`
    node, so the compat check `continue`s. None of the five is a
    name-resolution check; that is what `checkParamsDefaultNames` was added for,
    and it is the arm at `:5959` that declines.
  - **Registration.** `hasLoadParseError`
    (`src/extension/production-composition.ts:2214–2221`) denies registration
    only for an `error`-severity `theta/load/*` or `theta/parse/*` diagnostic;
    every row of §Reproduction (a1)–(a6) carries none, so the theta registers
    (`:1727`, "the theta registers iff no error-severity …").
  - **Existing coverage: the end state is pinned, as a fence.**
    `tests/params-default-unresolvable-enum-variant.test.ts` (1219 lines,
    14 cells, green at this HEAD — `npx vitest run` gives
    `Tests 14 passed (14)`): the m11 fixture `:405`, the header rows `:41–46`,
    `:63` and `:79–85`, and **cell C** `:1157–1200`, whose assertions pin the
    load silence (`:1160–1163`), `panics = []` (`:1173–1176`), no `Err` note
    (`:1177–1180`), `bound = true` (`:1182–1185`),
    `args = {"topic":"hello"}` (`:1186–1189`), the note
    `Running /m11: topic=hello, sev=null (default)` (`:1190–1193`) and one
    binder call (`:1194`). It is the only
    live assertion in the tree on this input class.
    `tests/binder-post-merge-ajv-enforcement.test.ts:85–93` describes the same
    `(default)`-tag-on-no-value rendering for the recovery's unreadable-file arm
    in a comment; its cell (5) asserts no success echo at all (`:836–839`),
    because that fixture's merge is refused on a depth breach.
    `tests/params-default-type-compat.test.ts:452` (row c6) and
    `tests/params-default-enum-access-merge.test.ts` (1039 lines, 0181's ten
    cells) cover resolvable variants only.
  - **Corpus census, run at HEAD.** 34 tracked `.theta` / `.thetalib` files;
    none declares a named `enum` (`git ls-files | grep -E '\.(theta|thetalib)$'
    | xargs rg -l '^\s*enum '` returns no match) and none carries a
    member-access `params:` default (the same file list under
    `rg -n "^\s+\w+: *'[^']*= *[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_]"` returns no
    match), so `tests/committed-fixture-parse-gate.test.ts` never meets the
    input.
  - **Spec.** `docs/spec_topics/grammar.md:26` (`NamedValueLit`'s two side
    conditions); `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60`
    (§Defaults — the admitted production set, the
    `theta/parse/default-not-literal` clause, the 0185 name-resolution clause,
    and the fill-before-AJV sentence), `:71` (the subset claim);
    `docs/spec_topics/binder/defaulting-system-note-echo.md:9` (fill-if-absent
    and the `(default)` tag rule), `:11` (the post-default-merge AJV hook);
    `docs/spec_topics/type-system.md:48` (§Unresolvable operands — row c6's
    licence); `docs/spec_topics/schemas.md:97` (variant access; the
    unknown-variant rule); `docs/spec_topics/expressions.md:44`, `:46–49`,
    `:51` (the four-arm resolution list and the disposition for no match);
    `docs/spec_topics/diagnostics/code-registry-parse.md:63`
    (`theta/parse/unknown-identifier`), `:93` (`theta/parse/unknown-variant`),
    `:48` (`theta/parse/default-not-literal`);
    `docs/spec_topics/diagnostics/code-registry-runtime.md:15`
    (`theta/runtime/null-member-access` and its Trigger);
    `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
    (DIAG-4); `docs/spec_topics/errors-and-results/error-model.md:69` (the
    `.field`-on-`null` row), `:74` (the closed list and the runtime-defect
    surface), `:91` (the slash-command panic surface);
    `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
    (the loads-cleanly predicate), `:25` (the diagnostic-registry carve-out).
- **Observed at:** v0.109.0 (`0a80c706`, `package.json:3`). One measurement
  layer, offline, deterministic and provider-free: a scratch vitest probe on the
  0181 / 0185 witness harness — real `parseThetaDocument`, real
  `createProductionProducerDeps`, the real `AjvSchemaValidator` with the shipped
  content-addressing, an in-memory `FileSystem` seam resolving each fixture's
  `sourcePath` so the real `#recoverDeclaredDefaults` re-reads the bytes the
  parser saw, the off-session pi-ai `complete()` mocked to return one scripted
  `ok` envelope, and the dispatch driven through the shipped
  `composeThetaFixture(...).run(...)` entry. The rows that measure what the BODY
  sees additionally delegate the prompt-mode bind to the production
  `bindPromptConversation`, so `executeBody` runs against the environment
  `buildBoundEnvironment` built from the merged `args`; their `surface` captures
  the `BodyExecution` instead of injecting a turn. Ten driven fixtures and ten
  parsed fixtures, then deleted. `src/`, `tests/`, `docs/bugs/README.md` and
  every other bug document are unmodified by this filing.

## Summary

`sev: 'Sev = Box.sev'` — against a body declaring `enum Sev { High = "high", Low
= "low" }` and `schema Box { sev: Sev, who: string }` — parses with zero
diagnostics, lowers `properties.sev: {"$ref":"#/$defs/Sev"}` with
`required: ["topic"]`, and registers. `grammar.md:26` states the production's
head side condition ("head is an enum name in scope"); `Box` is a schema, so the
RHS is not a `NamedValueLit` and derives no arm of `Literal`.

The gate that 0185 added for exactly this production declines the spelling by
design. `checkParamsDefaultNames`'s `member` arm
(`src/parser/theta-document.ts:5934–5959`) tests two conditions — the head names
a declared `enum` and the tail is not one of its variants
(`theta/parse/unknown-variant`), or the head resolves to nothing in the
whole-file root scope (`theta/parse/unknown-identifier`) — and falls through
silently for a head that resolves and names no enum (`:5959`). The class
is every name `collectIdentRoots` (`:4746`) folds except a declared enum:
measured silent for a `schema` head, a `params:`-field head, and a `fn` head, at
the bare field, the array element and the schema-constructor field.

Every invocation that omits the field binds without it. The recovery evaluates
the default through the body's pure evaluator, `resolveEnumVariant` answers
`undefined`, the `member` arm falls through to `evaluateMemberAccess(null,
"sev")`, and the `NullMemberAccessPanic` is absorbed by the `isThetaPanic` catch
0185 installed (`production-theta-producer.ts:1364–1371`), which `continue`s.
The field is then absent from `defaults`, so `fillDefaultsAndRevalidate` fills
nothing for it, and because a defaulted field is never written into `required`
(`params.ts:277–278`) the post-default-merge AJV check admits the absence.
Measured: `bound=true`, `args={"topic":"hello"}`, one binder model call, no
panic note, no `Err` note, no diagnostic on any surface.

The operator is told the opposite. The success echo reads
`Running /b1: topic=hello, sev=null (default)` — the `(default)` tag on a field
that took no default, because `#emitBinderEchoNote` recomputes the tag from the
binder args (`:968–970`) instead of reading `fillDefaultsAndRevalidate`'s
`defaultedWireNames`, the list `defaulting.ts:70–74` and
`src/render/argument-echo.ts:67–73` both name as its source and which nothing in
`src/` reads. The `null` is the absent key's `?? null` coalesce (`:964`).

The binder system prompt asks for the omission that loses the value: the field's
requirement token renders `sev (Sev) default=Box.sev`
(`binder-system-prompt.ts:173`) and the instruction at `:345` is "Do not invent
values for defaulted parameters that the user did not specify; omit them."

What the body then reads is `null`, in every shape that does not touch a field.
`sev` at the tail is `null`; `who: 'string = Box.who'` reaches a
`string`-annotated param as `null` and `"hi " + who` returns `"hi null"`;
`sev == Sev.High` returns `false`. A field read on the unfilled value aborts the
theta: `box: 'Box = Box.who'` with `box.who` at the tail delivers
`theta /c5 aborted: null member access: .who` under
`theta/runtime/null-member-access` at the zero body range — a code whose
registered Trigger is `expr.field` on an expression that evaluated to `null`,
where the author's `null` is the absence of their own default.

The same bytes at a body value position are 0140's open subject and behave
differently: `let x = Box.sev` in the body also loads clean, but it aborts on
the read rather than evaporating (re-measured at this HEAD, §Reproduction (d)).
0140's document reports that position and claims no `params:` position; this
report's observable — a declared default admitted at load and never bound — is
0165's class, at a spelling 0165's fix does not reach.

## Reproduction

Offline, deterministic, provider-free, at HEAD `0a80c706` (v0.109.0). One
scratch vitest file on the harness of
`tests/params-default-unresolvable-enum-variant.test.ts`. Every fixture is
`mode: prompt`, `bind_model: binder-model`, two params (`topic: string` plus the
field under test), and the body

```
enum Sev { High = "high", Low = "low" }
schema Box { sev: Sev, who: string }
schema Plain { who: string }
```

except where a row names its own. `diags` is the whole aggregated diagnostic
list, unfiltered. Each driven row scripts one `ok` envelope that OMITS the
defaulted field, exactly as the binder system prompt instructs
(`binder-system-prompt.ts:345`), unless the row says otherwise.

### (a) Load — the head class, and the two controls that refuse

```
@@ a1  sev: 'Sev = Box.sev'                          diags []   [head: declared schema]
@@ a2  sev: 'Sev = Plain.who'                        diags []   [head: another declared schema]
@@ a3  sev: 'Sev = topic.foo'                        diags []   [head: a `params:` field name]
@@ a4  sev: 'Sev = f.foo'   (+ fn f(): number { 1 }) diags []   [head: a declared `fn`]
@@ a5  sevs: 'array<Sev> = [Box.sev]'                diags []   [array element]
@@ a6  box: 'Box = Box { sev: Box.sev, who: "w" }'   diags []   [constructor field]
@@ a7  [control] sev: 'Sev = Nope.foo'
   diags ["error theta/parse/unknown-identifier: unknown identifier 'Nope'"]
@@ a8  [control] sev: 'Sev = Sev.Missing'
   diags ["error theta/parse/unknown-variant: unknown variant 'Missing' on enum 'Sev'"]
```

a1–a4 differ from a7 only in whether the head is declared, and from a8 only in
whether the head is the enum. The declared non-enum head is the silent one. a3's
head can never be bound while a default evaluates (`paramBindings` is
`undefined` at `production-theta-producer.ts:1323`), and a4's names a `fn`,
which has no first-class value at all; both are in the gate's root scope.

### (b) Invocation — the field evaporates

`bound` / `args` are the `runBinder` verdict, `note` the delivered
`theta-system-note` content, `panics` the `emitPanicNote` deliveries, `prompt`
the binder system prompt's per-field line.

```
@@ b1  sev: 'Sev = Box.sev'          envelope {"topic":"hello"}
   bound true   args {"topic":"hello"}   paramBindings ["topic=\"hello\""]
   note   Running /b1: topic=hello, sev=null (default)
   panics []    errNotes []    binderCalls 1
   prompt sev (Sev) default=Box.sev
@@ b2  sev: 'Sev = Box.sev'          envelope {"topic":"hello","sev":"low"}   [SUPPLIED]
   bound true   args {"topic":"hello","sev":"low"}
   note   Running /b2: topic=hello, sev=low          [no `(default)` tag]
@@ b3  sevs: 'array<Sev> = [Box.sev]'                envelope {"topic":"hello"}
   bound true   args {"topic":"hello"}
   note   Running /b3: topic=hello, sevs=null (default)
```

b1 is the reported shape end to end. b2 is the one shape that works: a supplied
argument is preserved by fill-if-absent, so the defect is conditional on the
omission the system prompt asks for — the opposite of 0185's pre-fix abort,
which fired even when the caller supplied the value. b3 shows the whole
container default evaporating, not only its element.

### (c) What the body sees

The same fixtures with a tail that reads the field, driven through the
production `bindPromptConversation` so `executeBody` runs against the real bound
environment.

```
@@ c1  sev: 'Sev = Box.sev'      tail `sev`
   outcome success   result {"present":true,"value":null}
@@ c2  who: 'string = Box.who'   tail `who`
   outcome success   result {"present":true,"value":null}
@@ c3  who: 'string = Box.who'   tail `"hi " + who`
   outcome success   result {"present":true,"value":"hi null"}
@@ c4  sev: 'Sev = Box.sev'      tail `sev == Sev.High`
   outcome success   result {"present":true,"value":false}
@@ c5  box: 'Box = Box.who'      tail `box.who`
   THREW panic   theta /c5 aborted: null member access: .who
   details {"diagnostics":[{"severity":"error","code":"theta/runtime/null-member-access",
            "file":"/theta/c5.theta","range":{"start":{"line":0,"column":0},
            "end":{"line":0,"column":0}},"message":"null member access: .who"}]}
   note   Running /c5: topic=hello, box=null (default)   [emitted BEFORE the abort]
```

c2 and c3 are the 0165 observable at this spelling: a `string`-annotated param
holding `null`, coerced into a returned string. c4 answers a comparison against
the declared variant with `false` rather than with the declared default's own
value. c5 is the loud row — and the echo has already claimed the fill on the
line above it.

### (d) The same member expression at a BODY value position (bug 0140)

Two fixtures with no default at all, the field supplied by the envelope, the
member access in the body:

```
@@ d1  body `let x = Box.sev` / `x`   load []   run THREW theta/runtime/null-member-access
                                               "null member access: .sev"
@@ d2  body `let x = Box.who` / `x`   load []   run THREW theta/runtime/null-member-access
                                               "null member access: .who"
```

0140's rows c7 and e4 measured the same shape (`let out = P.a`, load `[]` then
`theta/runtime/null-member-access`) at 0.77.0; the disposition holds for these
bytes at this HEAD. The body position aborts on the read; the `params:` position
(b1) does not abort at all.

### (e) The lowered `params:` document

```
sev: 'Sev = Box.sev'          required ["topic"]  defaultedFields ["sev"]
                              properties {"topic":{"type":"string"},"sev":{"$ref":"#/$defs/Sev"}}
who: 'string = Box.who'       required ["topic"]  defaultedFields ["who"]
                              properties {"topic":{"type":"string"},"who":{"type":"string"}}
sevs: 'array<Sev> = [Box.sev]' required ["topic"] defaultedFields ["sevs"]
                              properties {"topic":{"type":"string"},
                                          "sevs":{"type":"array","items":{"$ref":"#/$defs/Sev"}}}
```

The defaulted field is absent from `required` in every row (`params.ts:277–278`),
which is what makes the absence AJV-invisible. This is the arrangement 0185's
fix report forbids changing (its residual 1: making defaulted fields `required`
reds 0163's DEFERRED table and 0181's ten cells).

### (f) Which declaration this gate prefers for the head (bug 0191)

Body `enum Color { Red }` beside `schema Color { a: string }`:

```
@@ f1  sev: 'Color = Color.Red'   diags []
@@ f2  sev: 'Color = Color.Nope'  diags ["error theta/parse/unknown-variant: unknown variant 'Nope' on enum 'Color'"]
@@ f3  sev: 'Color = Color.a'     diags ["error theta/parse/unknown-variant: unknown variant 'a' on enum 'Color'"]
```

The head is the enum here, at every row — `hoistEnumVariants` is consulted
before the root scope (`theta-document.ts:5939`). f3's tail `a` is a declared
field of the shadowing `schema` and is still reported as a missing variant. The
type layer answers the same shadow the other way (0191 element 1), so a route
that classifies the head by declaration kind must state which source it reads.

### (g) The committed corpus — the GOV-15 baseline

```
@@ CORPUS FILES :: 34
@@ FILES DECLARING AN `enum` :: 0
@@ MEMBER-ACCESS `params:` DEFAULTS :: 0
```

No shipped `.theta` or `.thetalib` reaches this input, so
`tests/committed-fixture-parse-gate.test.ts` never meets it. The only occurrence
in the repository is cell C's fixture
(`tests/params-default-unresolvable-enum-variant.test.ts:405`).

## Expected behaviour

**The production's head side condition is not met, so the RHS is not a
`Literal`.** `docs/spec_topics/grammar.md:26`:

> `NamedValueLit ::= Ident "." Ident // Enum.Variant access; head is an enum
> name in scope, tail a declared variant`

`Box` is a `schema`. `docs/spec_topics/schemas.md:3` calls a `schema`
declaration a named type, and `expressions.md:46–49`'s four resolution arms name
no declaration form, so `Box` is not "an enum name in scope" under any reading.
The RHS therefore derives no arm of `Literal`, exactly as `Sev.Missing` and
`Nope.Missing` derive none — the two spellings 0185 refused.

**The `params:` position is required to refuse what the body refuses, and here
neither refuses.** `frontmatter-fields-a.md:71`: "the literal sublanguage *is* a
subset of the body expression grammar". At the body position this expression is
admitted and then aborts on the read (§Reproduction (d)), which is bug 0140's
open subject; at the `params:` position it is admitted and then silently drops
the field. The subset relation is not what fails here — both positions admit —
so this report's claim rests on the two sentences below rather than on the
subset clause 0185 used.

**A declared default is filled, or the declaration is refused.**
`frontmatter-fields-a.md:60`: "When a slash-command invocation omits the
corresponding positional argument, the default is filled in before AJV
validation." `defaulting-system-note-echo.md:9`: "when the wire name is absent,
the field takes its declared default." Measured: the wire name is absent and the
field takes nothing (§Reproduction (b1)). Neither sentence admits a third
outcome, and no diagnostic marks the divergence.

**The `(default)` tag is defined by what happened, not by what was declared.**
`defaulting-system-note-echo.md:9`: "Only a field that took its declared default
this way is tagged `(default)` … a binder-supplied value for a defaulted field
is untagged." The rule partitions on the fill, and `fillDefaultsAndRevalidate`
reports the fill (`defaultedWireNames`, `defaulting.ts:73`). The echo tags a
field that took nothing.

**`type-system.md:48` does not license the silence.** Three reasons, none of
which depends on a missing sentence:

1. It governs "either side of a compatibility check … past the parser's static
   view". Whether a member-access head names an enum is not a compatibility
   question, and the operand is not past the static view: the gate that would
   decide it already holds the hoisted variant sets and the whole-file root
   scope in the same call (`theta-document.ts:899–905`).
2. The net it promises is "the runtime AJV check". For a defaulted field there
   is no such net — the field is not in `required` (`params.ts:277–278`), so AJV
   admits the absence (§Reproduction (e)). A promise of a downstream check that
   structurally cannot fire is not a deferral.
3. The paragraph's own deferral row keeps working after a refusal here: row c6
   (`Sev = Sev.A`, `tests/params-default-type-compat.test.ts:452`) names a
   variant that resolves and is silent for the compat reason, not for a
   name-resolution reason.

**What the corpus does not state.** No sentence assigns a code to a default RHS
whose member-access head resolves and names no enum. `frontmatter-fields-a.md:60`
carries both halves of the gap: its shape clause refuses "identifier references
other than `Enum.Variant`" with `theta/parse/default-not-literal`, and its 0185
clause removes `NamedValueLit`'s side conditions from that code's reach while
enumerating only "`theta/parse/unknown-identifier` for a head that resolves to
nothing". Under the first half the spelling is a shape violation (it is not an
`Enum.Variant` access, because its head is not an enum name); under the second
it is a name-resolution failure with no code named. Closing that is part of this
report's deliverable, and §Fix (b) states the candidates.

Concretely, one of these two outcomes, chosen in §Fix:

```
LOAD REFUSAL     one error-severity `theta/parse/*` at the `params:` field's own
                 range naming the head and what it is; the theta does not
                 register; no binder call is ever made.

BIND REFUSAL     the field's absence is refused at the merge —
                 `theta /<name>: argument binding produced invalid args — <ajv-summary>`
                 or a sibling row naming the field — so no body runs with the
                 declared default unapplied.
```

Binding without the field, with the echo asserting the fill, is neither.

## Actual behaviour / root cause

### The gate has two arms and the input is in neither

`checkParamsDefaultNames` (`theta-document.ts:5883`) is 0185's route-1 check. For
each field with a `defaultSource` it re-parses the RHS through the body
expression parser (`:5900`) and walks the sublanguage's containers
(`:5924–5933`). The `member` arm (`:5934–5959`) asks two questions in order:

```ts
      const head = expr.target.name;
      const variants = enums.get(head);
      if (variants !== undefined) {
        …checkVariantAccess…
        return;
      }
      if (!roots.has(head)) {
        out.push({ … code: "theta/parse/unknown-identifier" … });
      }
      return;
```

`Box` is not in `enums` (it declares no enum) and IS in `roots` (a declared
`schema`), so both tests fall through to `:5959` and the field draws nothing.
The exemption is deliberate and documented at `:5871–5875`, on two stated
grounds: the body admits the same spelling silently, and refusing it here would
"pre-empt an open question about the body position" — bug 0140's. Neither ground
addresses the end state the exemption produces, which is what this report
measures.

### Two different notions of "resolves"

The gate's `roots` is `collectIdentRoots` (`:4746`): builtins, `fn` / `schema` /
`enum` names, imported symbols, `params:` field names, resolved `tools:`
callable names. The evaluator that will run the default answers `null` for every
resolution arm except `local` (`production-theta-producer.ts:6152–6155`), and
the environment the recovery builds for it binds no `params:` field at all —
`buildBoundEnvironment(theta.body, undefined, theta.imports,
presentedCallableNames(theta))` at `:1321–1326`, with `paramBindings`
`undefined`. So `topic.foo` (§Reproduction a3) passes a gate that considers
`topic` resolvable, into an environment where it can never be bound; and
`f.foo` (a4) passes on a name that has no first-class value under FN-1. The
gate's question is membership in a name set; the evaluator's question is whether
the name holds a readable value. They are not the same question, and only the
second one decides whether a default can produce a value.

### The panic, and the absorption that hides it

`evaluatePureExpression`'s `member` arm (`:6173–6186`) tests that the target is
a bare identifier that is not a local binding (`:6177`), asks
`resolveEnumVariant` (`:6179`), and gets `undefined` — the answer
`lexical-environment.ts:528–530` gives for a head that registers no enum.
Control reaches `:6185`, which evaluates the target through the `ident` arm
(`:6152–6155`, `null` for a non-`local` arm) and hands the `null` to
`evaluateMemberAccess`, whose first statement throws
(`runtime-panics.ts:333`).

0185 route 3 wrapped that call (`:1364–1371`): a `ThetaPanic` is absorbed and
the loop `continue`s, every other throw is re-raised. That is the recovery's
stated contract (`:1246–1256`) and it is honoured. The consequence for this
input is that the only surface that ever knew the default could not be evaluated
is a `continue`: the field is not pushed onto `defaults` (`:1372–1375`), and
nothing downstream is told the difference between "this default was not
recoverable" and "this theta declared no default".

### The absence is invisible at the boundary that was supposed to catch it

`fillDefaultsAndRevalidate` (`defaulting.ts:124`) iterates `input.defaults`
(`:134`), so a field the recovery skipped is never considered; `merged` is the
binder args unchanged. The post-default-merge AJV check then validates a
document that is missing a field the lowered schema does not require, because
`parseParams` writes `required.push(field.name)` only for a field with no
`defaultSource` (`params.ts:277–278`). The verdict is `ok`, `runBinder` returns
`{ bound: true, args }`, and the body runs.

This is the arrangement 0185's fix record identified as what makes the
never-throws contract true, and it explicitly forbids the naive repair: "A
sibling must not 'fix' this by making defaulted fields `required` — that reds
0163's DEFERRED table and 0181's ten cells."

### The echo re-derives the tag instead of reading the fill

`#emitBinderEchoNote` (`:947`) computes, per field
(`:968–970`):

```ts
      const tookDefault =
        defaulted.has(field.wireName) &&
        !Object.prototype.hasOwnProperty.call(binderArgs, field.wireName);
```

`defaulted` is the theta's declared `defaultedFields`, so the test asks "was
this field declared with a default and left out by the binder", not "did this
field take a default". `fillDefaultsAndRevalidate` answers the second question
in `defaultedWireNames` (`defaulting.ts:132–139`), whose own doc-comment
(`:70–74`) says it "Drives the echo's `(default)` tagging" and whose consumer
contract is restated at `src/render/argument-echo.ts:67–73`. No production code
reads it (`rg -n defaultedWireNames src/` reaches only `defaulting.ts` and that
comment). The rendered value is `mergedArgs[field.wireName] ?? null` (`:964`),
so an absent key renders `null`. The two together produce
`sev=null (default)` — a claim the merge did not make.

### The body then reads the absence

`paramBindingsFrom` (`theta-composition-producer.ts:99`, called at `:417`)
projects the merged `args`, so a field absent from `args` installs no param slot
(`buildBoundEnvironment`, `production-theta-producer.ts:4034–4043`). A body read
of the name resolves to no `local` arm and the pure evaluator answers `null`
(`:6152–6155`) — the same substitution bug 0140 reports at a body value
position, reached here through a missing binding rather than through a
declaration name. Which of the three outcomes an author gets is decided by the
body, not by the declaration: `null` returned (c1, c2), `null` coerced into a
string (c3, `"hi null"`), `false` from a comparison (c4), or the theta aborted
at the first field read (c5).

## Why it matters

- **A declared default is silently not applied.** b1 loads with zero
  diagnostics, registers, binds, and runs with the field absent. Nothing on any
  surface — parse diagnostics, the AJV hook, the panic channel, the `Err`
  channel — records that the declaration had no effect.
- **The one surface that speaks says the opposite.** The echo tags the field
  `(default)` and renders `null` (b1, b3, c5). An operator reading it is told
  the declared default was applied, and `null` is a plausible rendering of a
  value the author never wrote.
- **A `string`-annotated param reaches the body as `null`.** c2 and c3 are the
  0165 observable at a new spelling — `"hi " + who` returns `"hi null"` — for a
  field whose own lowered fragment (`{"type":"string"}`) refuses `null` and which
  AJV never sees.
- **The failure is conditional on the omission the system prompt asks for.**
  The binder is told "Do not invent values for defaulted parameters … omit them"
  (`binder-system-prompt.ts:345`) and is shown `sev (Sev) default=Box.sev`
  (`:173`). A caller who supplies the argument gets correct behaviour (b2), so
  the defect appears exactly when the default is supposed to be used.
- **Three neighbouring typos, three unrelated outcomes.** Measured on one body:
  `Sev = Sev.Missing` draws `theta/parse/unknown-variant` at load (a8),
  `Sev = Nope.foo` draws `theta/parse/unknown-identifier` (a7), and
  `Sev = Box.sev` draws nothing and drops the field (a1). The three differ in
  one identifier, and which one an author gets is decided by whether the wrong
  name happens to be declared elsewhere in the file and by what it declares.
- **The loud row's code does not describe its cause.** c5 delivers
  `theta/runtime/null-member-access` at the zero body range, whose registered
  Trigger (`code-registry-runtime.md:15`) is "`expr.field` where `expr`
  evaluated to `null`". The author's expression is `box.who`, and `box` is
  `null` because their `params:` default evaporated three frames earlier;
  `error-model.md:74` states that the runtime-defect surface is "not a new
  authoring concept (no theta expression 'causes' one)".
- **A model call is spent on every invocation that then ignores the
  declaration.** The merge runs after the binder call
  (`runBinderCallWithCancellation`, `production-theta-producer.ts:873`), so each
  attempt costs one round trip and then binds a document the declaration says
  should have been different (`binderCalls 1` on every driven row).
- **The class is wider than a `schema` head.** Every name
  `collectIdentRoots` folds except a declared `enum` is a head in this class —
  measured for a `schema` (a1, a2), a `params:` field (a3) and a `fn` (a4). Two
  of those three can never hold a value in a default's environment at all.
- **The gate that exists is one branch away from deciding it.** The arm at
  `:5934–5959` already computes both facts the classification needs (`enums` and
  `roots`) and returns silently for their conjunction. A regression that widened
  the exemption further would red nothing, because the only committed assertion
  on this input pins the current end state as a fence (cell C, `:1157–1200`).

## Fix

Make a `params:` default whose member-access head resolves to something that is
not an enum stop reaching the invocation as a silently absent field. The
declaration is refused, or its non-application is surfaced; it is not both
admitted and reported as applied.

### (a) Three candidate remedy points, with their measured end states

1. **The third arm of the load gate**
   (`src/parser/theta-document.ts:5934–5959`). The arm already holds the two
   sets: emit when `enums.get(head) === undefined && roots.has(head)`, at the
   field's own range, through the same `SchemaDeclSite` the other two arms use.
   End state: the theta does not register (`hasLoadParseError`,
   `production-composition.ts:2214–2221`), no binder call is made, and the
   diagnostic points at the `params:` line. Cost: the code identity is unsettled
   ((b) below), and the arm's own doc-comment (`:5871–5875`) states the
   exemption as intentional, so it is re-derived in the same commit.
2. **A bind-time refusal of a declared default that produced no value.** The
   recovery knows the field it skipped (`:1370`); `#mergeDeclaredDefaults` could
   route that as a non-binding verdict rather than merging silently. End state:
   the theta registers, one binder call is spent, and the invocation refuses with
   a note naming the field. Cost: a new refusal row on the binder surface, whose
   class and rendering must be placed against
   `determinism-cancellation-failure.md`'s taxonomy; and it must NOT be
   implemented by writing defaulted fields into `required` — 0185's fix report
   residual 1 forbids that, and (c1)/(c2) below are what it would red. Reaches
   the operator only after a model call, which (1) avoids.
3. **Echo honesty** (`production-theta-producer.ts:968–970`). Read
   `fillDefaultsAndRevalidate`'s `defaultedWireNames` — the list
   `defaulting.ts:70–74` and `argument-echo.ts:67–73` already name as the tag's
   source — instead of recomputing the tag from the binder args. End state: the
   unfilled field renders untagged, so the note stops asserting a fill that did
   not happen. Cost / blast radius: the recovery's three pre-existing
   best-effort arms (no `sourcePath` — every in-memory fixture, an unreadable
   file, an unparseable default) reach the same rendering today, so this route
   changes their echo too;
   `tests/binder-post-merge-ajv-enforcement.test.ts:85–93` describes that
   rendering in a comment (its cell 5 asserts no success echo, `:836–839`), and
   any harness pinning a `name=null (default)` row for an in-memory fixture
   re-pins. This route is a floor: it makes the surface stop lying without
   making the declaration hold, so it is worth taking IN ADDITION to (1) rather
   than instead of it. If the run declines it, the element is a filing
   candidate and §Kind element 3 is its statement.

Route (1) is the only one that reaches the operator before a model call is
spent, and the only one that can name the head and what it is. Route (3) is the
only one that repairs the surface for the input classes (1) cannot pre-empt.
They compose.

### (b) The code identity is an in-run adjudication

Three candidates, each resting on a different sentence:

- **`theta/parse/default-not-literal`**
  (`code-registry-parse.md:48`, `frontmatter-fields-a.md:60`) — the code
  §Defaults assigns to an RHS outside the production set, whose diagnostic
  "names the offending sub-expression". `Box.sev` is an identifier reference that
  is not an `Enum.Variant` access (its head fails `grammar.md:26`'s head
  condition), so the shape clause covers it by construction and one row covers
  every head kind. Cost: the 0185 clause in the same paragraph says the two side
  conditions are "name-resolution conditions, not shape"; taking this code means
  re-deriving that clause to distinguish a head that *fails to resolve* (a name
  question) from a head that *resolves to a non-enum* (a form question).
  Benefit: no new code, and the message names the sub-expression rather than
  mislabelling a declared name.
- **`theta/parse/unknown-identifier`** (`code-registry-parse.md:63`) — the code
  0185 assigned to the head condition's other failure mode, so the arm at
  `:5950–5958` would widen rather than gain a sibling. Cost: the message is
  `unknown identifier 'Box'` for a name declared in the same file — the exact
  misdescription 0140 §Fix route 1 weighs against, and choosing it here settles
  that question for 0140 by precedent rather than by adjudication.
- **A new registered code** naming "the head of an `Enum.Variant` default is not
  an enum". Cost: DIAG-2 (`diagnostic-shape.md:72`) — registry row with
  *Trigger* / *Rule* / *Message*, the `docs/reference/diagnostics.md` mirror
  (which carries no *Trigger* column), and the spec sentence §Expected behaviour
  names — all in the same commit. Benefit: the message can name the head's
  declaration kind, which is what an author needs, and it prejudges neither
  0140 nor the shape clause.

Whichever is chosen, the choice is stated against each of the three readings and
the losers' text is left standing or corrected in the same commit. No existing
*Message* is edited, so DIAG-4 is not engaged unless the second candidate is
taken.

### (c) Constraints on any implementation

1. **Deferral row c6 keeps loading silently and still binds.**
   `tests/params-default-type-compat.test.ts:452` (`"Sev = Sev.A"`, body `:209`)
   and the whole DEFERRED table (`:437–468`). A head that names a declared enum
   is untouched by every route; `type-system.md:48`'s licence survives verbatim.
2. **0181's witness stays green, all ten cells.**
   `tests/params-default-enum-access-merge.test.ts` (1039 lines) drives seven
   enum-access fixtures plus row c6, every variant resolvable, pinning merged
   `args`, echo row and projected body binding at five positions.
3. **The value-mismatch fence stays at the merge.** `sev: 'Sev = "nope"'`
   (0181 cell 9 / 0185 fence B3) refuses on the post-default-merge AJV hook with
   `details: { event: {} }`. A wire string outside the variant set is a VALUE
   question and stays deferred.
4. **Defaulted fields stay out of `required`** (`params.ts:277–278`). 0185's fix
   report residual 1 names this explicitly; changing it reds (1) and (2).
5. **0185's eight load rows and three fences are byte-identical.** Groups A, B,
   D and R of `tests/params-default-unresolvable-enum-variant.test.ts` are that
   fix's pinned surface; only **cell C** (`:1157–1200`) moves.
6. **Cell C is rewritten, not deleted, and under this report's authority.** It
   pins `panics = []`, `bound = true`, `args = {"topic":"hello"}` and
   `Running /m11: topic=hello, sev=null (default)` as the fence 0185 installed
   for a later fix to move against. Under route (1) the fixture stops loading
   and the cell becomes a load-refusal row; under route (2) it becomes a refusal
   row at invocation; under (3) alone its note changes. Whichever lands states
   which assertion moved and why, and the file header's group-C prose
   (`:41–46`, `:79–85`) is re-derived with it.
7. **Live cells stay green.** `tests/live/live-production-acceptance.test.ts`
   cell 41 (`sev: 'Sev = Sev.High'`) and cell 47 (0185's load-refusal cell).
   A route that adds a load refusal re-runs the H8a file and states whether a
   new cell is owed.
8. **The three pre-existing best-effort arms keep their end state.** No
   `sourcePath` (every in-memory fixture), an unreadable file, and a default
   that does not parse leave their field unfilled and bind without it; that is
   the recovery's contract (`:1246–1256`) and it is not this report's subject.
   Only route (3) touches their echo, and (a3) states that cost.

### (d) GOV-15

A load refusal makes a currently-loading theta refuse, so
`source-language-stability.md:9`'s loads-cleanly predicate is met by every
affected input and the change is inside the equivalence promise, discharged
through the diagnostic-registry carve-out (`:25`) as an addition — the
disposition 0185 applied one commit ago for the sibling spellings. The flip
class is exactly: a `params:` default whose member-access head resolves in the
whole-file identifier root scope and names no declared `enum`, at the bare
field, an array element, or an object field value. §Reproduction (g) is the
measurement — 34 committed files, zero declaring an `enum`, zero carrying a
member-access default — so the corpus reach is zero and the class consists of
authoring mistakes that currently register and then drop a declared default.
Re-run the census after the change rather than assuming it, over
`git ls-files -- '*.theta' '*.thetalib'` rather than through
`tests/committed-fixture-parse-gate.test.ts`.

### (e) Coordination

1. **Bug [0140](./0140-bare-schema-reference-value-position-silent.md) — a
   shared input, and a verified mechanical coupling.**
   `checkParamsDefaultNames` consumes `identRoots`
   (`theta-document.ts:899–905`), and 0140 §Fix route 1 stops folding `schema` /
   `enum` names into the value scope at `collectIdentRoots`. If that
   lands first, this position's `!roots.has(head)` arm (`:5950–5958`) begins
   emitting `theta/parse/unknown-identifier: unknown identifier 'Box'` for the
   input measured here — a refusal this report wants, under a message this
   report's (b) argues against, decided by a fix aimed at another position. So:
   whichever report lands second re-derives the other's rows explicitly; a fix
   here states what it does to 0140's body-position rows (nothing, if it touches
   no evaluator arm and no root set); and a 0140 fix states what its route does
   to this position's verdict and message. Neither blocks the other from
   starting.
2. **Bug [0191](./0191-enum-name-shadowed-by-schema-fabricates-member-type.md)
   — the head classification.** §Reproduction (f) measures that this gate
   prefers the declared `enum` under a same-file `schema` shadow while
   `#typeExpr`'s `member` arm prefers the `schema` (0191 element 1). A route
   whose message names the head's declaration kind needs a name→kind source and
   must state which declaration wins; adopting the type layer's answer would
   reclassify a shadowed `X.Variant` default as a non-enum head and refuse input
   that loads today (a GOV-15 flip on 0191's own admitted class). The safe
   posture is to keep this gate's enum-first precedence and to state it.
3. **Bug [0163](./0163-params-default-type-compat-unchecked-at-load.md) — the
   deferral licence.** Constraint (c1). 0163 is fixed; the boundary is prose
   only, and the argument that `type-system.md:48` does not reach this input is
   in §Expected behaviour.
4. **Bug [0185](./0185-unresolvable-enum-variant-default-panics-recovery.md) —
   the parent.** Its two shipped halves (the load gate and the recovery's
   `isThetaPanic` absorption) are settled and stay. This report edits the gate's
   third arm or the merge's verdict; it does not reopen the route choice, the
   code adjudication for the two refused spellings, or the recovery's contract.

### (f) Witness

Offline, deterministic, provider-free, on the harness of
`tests/params-default-unresolvable-enum-variant.test.ts` (which already carries
the fixture, the range oracle and the three fences). Rows owed:

- **Load**, per head kind: a declared `schema` head, a `params:`-field head, a
  `fn` head, at the bare field, an array element and an object field value —
  each asserting the whole diagnostic list, with the code, message and the
  field's own range read through the existing `paramsFieldRange` oracle.
- **The two controls beside them**, byte-identical to 0185's A1 and A2 rows
  (`Sev.Missing` → `theta/parse/unknown-variant`, `Nope.foo` →
  `theta/parse/unknown-identifier`), so the new arm is proved not to have
  displaced either.
- **The shadow rows** of §Reproduction (f), pinning which declaration the head
  resolves against.
- **Invocation**, if any route leaves the input loading: `bound`, the merged
  `args`, the note content, and the absence of a panic delivery — plus a row
  with the field SUPPLIED, which must keep binding the supplied value.
- **The body-facing rows** c2 / c3 (a `string`-annotated param) and c5 (the
  field read that aborts), driven through the production
  `bindPromptConversation` so `executeBody` runs against the real bound
  environment. These are the rows that make the severity claim testable; they
  red if a fix leaves the field absent.
- **The echo row**, if route (3) is taken: an unfilled field renders untagged,
  and a genuinely defaulted field keeps its tag (0181's ten cells are the
  fence).
- **A corpus row** re-running §Reproduction (g) over `git ls-files`.

## Non-goals

- **Bug 0140's body-position subject.** A bare `schema` / `enum` name at a body
  value position, and the code its refusal should carry, is 0140's, including
  the disposition of `let x = Box.sev` (§Reproduction (d)). This report cites it,
  measures it at HEAD, and coordinates (§Fix (e1)); it does not decide it.
- **Re-litigating 0185's routes.** The load gate's two existing arms, the
  code-identity adjudication for `Sev.Missing` / `Nope.Missing`, the rejection of
  a guard inside `evaluatePureExpression`'s `member` arm, and the recovery's
  `isThetaPanic` absorption are settled at 0.109.0 and stay. This report's
  subject is the arm that returns silently beside them.
- **The `theta/runtime/null-member-access` panic itself.**
  `evaluateMemberAccess` (`runtime-panics.ts:331–333`) is correct given a `null`
  target, and `error-model.md:69` keeps the source on the closed V1 list. c5 is
  cited as the consequence of an absent binding, not as a second defect.
- **The value-mismatch fence.** `Sev = "nope"` is refused at the merge and stays
  refused there (§Fix (c3)).
- **The recovery's three pre-existing best-effort arms.** No `sourcePath`, an
  unreadable file, and an unparseable default keep their end state (§Fix (c8)).
  Their shared echo rendering is route (3)'s blast radius, stated there.
- **Making defaulted fields `required`.** Forbidden by 0185's fix report
  residual 1 and by §Fix (c4); named here so a fixer does not re-derive it.
- **`resolveEnumVariant`'s single `undefined`.** 0185's `## Fix (0.109.0)`
  residual 1 recorded that one answer covers an unregistered enum and an
  unknown variant; this report's
  gate never consults it (it reads the hoisted sets and the root scope), so
  nothing here depends on splitting it.
- **Positional-citation drift into `theta-document.ts` and
  `production-theta-producer.ts`.** 0134's adjudicated do-not-chase class; every
  citation in this document was re-resolved at `0a80c706` and none elsewhere is
  swept.

## Provenance

- Filing origin:
  [0185](./0185-unresolvable-enum-variant-default-panics-recovery.md)'s fix run
  (0.109.0, commit `ce9c1090`) — residual **2** of its `## Fix (0.109.0)`
  ("A head that resolves but names no enum stays silent at load … Not
  re-filed"), item **3** of `.pi/tmp/fixes/0185-report.md` §*Residuals / notes*.
  That disposition is **overridden** here on the parent's authority: the
  residual's stated ground is that deciding the spelling at load would decide
  bug 0140's body-position question, which this report answers by scoping the
  code choice as a coordination obligation (§Fix (e1)) rather than as a
  pre-emption — and by measuring the end state the residual did not: the field
  is not merely unfilled, it is absent from `args`, absent from the body scope,
  reported as filled by the echo, and read as `null` (or aborted on) by the
  body.
- What this report adds beyond the residual: the head class measured across
  three declaration kinds and three depths; the load silence measured against
  both refusing controls; the invocation end state measured on the production
  emitter (`bound`, `args`, `paramBindings`, note content, panic channel, `Err`
  channel, binder-call count); the SUPPLIED-argument row showing the defect is
  conditional on the omission the binder system prompt instructs; the four
  body-facing outcomes (`null`, `"hi null"`, `false`, the abort) through the
  production `bindPromptConversation`; the lowered `required` / `defaultedFields`
  reading that explains why AJV cannot see the absence; the echo's
  `tookDefault` recomputation and the unread `defaultedWireNames` contract; the
  measured disagreement with the type layer under a same-file shadow (0191); the
  verified coupling through `identRoots` that makes a 0140 route-1 fix change
  this position's verdict; and the corpus census at HEAD.
- Tree measured: HEAD `0a80c706`, v0.109.0 (`package.json:3`).
  `git status --short` was empty before the measurement. After it, the tree
  carries this document plus a parallel sibling session's uncommitted work
  (`tests/off-session-transport-classification.test.ts` and its own
  `tests/scratch-0182-*` probe), which this report neither made, cites, nor
  touched.
- Implementation read: `src/parser/theta-document.ts` (`:899–905`, `:1169`,
  `:4746–4783`, `:5830–5840`, `:5847–5907`, `:5916–5963`);
  `src/parser/params.ts` (`:277–278`, `:349`, `:369`, `:380`, `:390`, `:408`,
  `:413`); `src/parser/literal-sublanguage.ts` (`:103`, `:520–522`, `:673`);
  `src/extension/production-theta-producer.ts` (`:873`, `:936–989`,
  `:1246–1256`, `:1257–1282`, `:1301–1375`, `:4008–4044`, `:6152–6155`,
  `:6173–6186`);
  `src/extension/theta-composition-producer.ts` (`:87–113`, `:405–420`,
  `:464–491`); `src/extension/production-composition.ts` (`:1727`,
  `:2214–2221`); `src/binder/defaulting.ts` (`:70–74`, `:124–168`);
  `src/binder/binder-system-prompt.ts` (`:173`, `:345`);
  `src/render/argument-echo.ts` (`:60–74`);
  `src/runtime/lexical-environment.ts` (`:526–533`);
  `src/runtime/runtime-panics.ts` (`:331–333`).
- Tests read (not modified):
  `tests/params-default-unresolvable-enum-variant.test.ts` (`:1–160`, `:405`,
  `:441–500`, `:1157–1200`);
  `tests/params-default-type-compat.test.ts` (`:437–468`);
  `tests/binder-post-merge-ajv-enforcement.test.ts` (`:85–93`, `:292–312`,
  `:340–365`, `:826–845`);
  `tests/params-default-enum-access-merge.test.ts` (cell table and harness).
- Spec read: `docs/spec_topics/grammar.md:26`;
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60`, `:71`;
  `docs/spec_topics/binder/defaulting-system-note-echo.md:9`, `:11`;
  `docs/spec_topics/type-system.md:48`; `docs/spec_topics/schemas.md:3`, `:97`;
  `docs/spec_topics/expressions.md:44`, `:46–49`, `:51`;
  `docs/spec_topics/diagnostics/code-registry-parse.md:48`, `:63`, `:93`;
  `docs/spec_topics/diagnostics/code-registry-runtime.md:15`;
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72`, `:74`;
  `docs/spec_topics/errors-and-results/error-model.md:69`, `:74`, `:91`;
  `docs/spec_topics/governance/source-language-stability.md:5`, `:9`, `:25`.
- Bug corpus read:
  `docs/bugs/0185-unresolvable-enum-variant-default-panics-recovery.md`,
  `docs/bugs/0165-empty-params-default-literal-admitted-and-never-bound.md`,
  `docs/bugs/0140-bare-schema-reference-value-position-silent.md`,
  `docs/bugs/0191-enum-name-shadowed-by-schema-fabricates-member-type.md`,
  `docs/bugs/0163-params-default-type-compat-unchecked-at-load.md`.
- Measurement: one scratch vitest file (`tests/scratch-0197-measure.test.ts`) on
  `tests/params-default-unresolvable-enum-variant.test.ts`'s harness — ten
  driven fixtures through `composeThetaFixture(...).run(...)`, of which seven
  delegate the prompt-mode bind to the production `bindPromptConversation` so
  `executeBody` runs, plus ten parsed fixtures — then deleted. Sweep after
  deletion: `git status --short` carrying no entry for this probe (its remaining
  entries are this document and the sibling session's uncommitted work),
  `find . -path ./node_modules -prune -o -iname "*scratch*" -print` reaching no
  artifact of this run, and `ls tests tests/live | grep -i scratch` naming no
  file of this run. The committed witness was
  re-run unchanged: `npx vitest run
  tests/params-default-unresolvable-enum-variant.test.ts` gives
  `Tests 14 passed (14)`.
- Style authority: `docs/STYLE.md`.
