# Bug 0014 — An empty typed-query annotation (`@<>`) parses with no diagnostic and binds its payload unvalidated through the retired fused mechanism

- **Status:** fixed (0.23.0). Option 1 adopted — an explicit `@<…>` query
  annotation whose interior trims to empty is rejected at parse with the new
  registered `theta/parse/empty-query-annotation` (E, parse); the degraded
  arm is kept as seam-level totality (unreachable from parsed source) and
  `lowerQueryResponseSchema`'s `undefined` contract is unchanged as defence
  in depth.
- **Kind:** defect — parse-acceptance gap plus a QRY-22 violation on the arm it
  opens. The type grammar derives no empty type (`Type ::=` has no empty
  alternative, and type-system.md pins that same grammar for the `@<T>`
  annotation position), yet the parser accepts `@<>` / `@<  >` and mints
  `schema: ""` with zero diagnostics. That empty string is the SOLE input for
  which `lowerQueryResponseSchema` returns `undefined`, so both query drivers
  take the deliberately-kept degraded arm: the entire retired pre-0010 fused
  mechanism (user-visible JSON-in-text turn on the live path / one fused
  `complete()` off-session, `maxRounds: 0` collapse, ungoverned native loop, no
  respond tool, no `toolChoice`, no provider gate) AND — because no lowered
  schema exists — the text-parsed payload binds with **no AJV**. QRY-22's "MUST
  NOT bind, as a typed query's value, a response that has not been validated
  against its declared schema" is silently void for a query the runtime itself
  marks typed (`expr.schema !== null` — `""` is non-null).
- **Affected:** the `@<…>` capture in `parseQuery`
  (`src/parser/theta-document.ts:3663`, `schema = parts.join("").trim()`
  :3686 — no emptiness check; contrast `parseInvoke` :3526, which normalises
  an empty `invoke<>` capture to `null`). Consumers of the minted `""`:
  `const typed = expr.schema !== null`
  (`src/extension/production-theta-producer.ts:2138`), the degraded
  `forcedRespondTurn` arms (live :3681, off-session :4255), the `maxRounds:
  typed && respond === undefined ? 0 : maxRounds` collapse (:2300), the fused
  text renderer (`renderTypedAwareQueryText` :4692 — inlines the empty shape),
  and the typed-detection walk (:5173) — so the load-time provider gate counts
  the theta as typed while the runtime arm it lands on applies no gate.
  Shadowing: the direct-let propagation (:1726) and the QRY-2 sink resolve
  (`resolveQuery`, `src/parser/query-schema-resolve.ts:451–455`; the
  empty-`let`-annotation sink guard is :134–136) both fire only on
  `schema === null`, so `let x: Triage = @<>`…`?` keeps `""` — the real
  declared annotation is silently ignored (no QRY-4 mismatch warning either:
  `checkLetMismatch` :470–482 reads the non-null `""`, but
  `annotationToCompatType("")` is `undefined` —
  `src/parser/type-layer-checks.ts:250–253` — so the check skips in silence).
  No parse-phase check validates `QueryExpr.schema` as type-grammar text: the
  structural walk's `case "query"` inspects only interpolations (:4936–4941),
  the `parseTypeExpression` call sites are the `let` / `fn` / schema-field
  walks (:4585, :4660, :4666, :4745), and the one check that reads the field —
  QRY-4's `checkLetMismatch` — skips silently on `""` (above).
- **Observed at:** `0.20.0`, host Pi `0.82.1` (repo-local SDK pins
  `@earendil-works/pi-ai` / `pi-coding-agent` 0.80.10). Recorded as a residual
  by the bug-0010 fix (Fix §Residuals, first bullet; fix review F5), which
  confined the fused mechanism to this arm and pinned it.

## Fix (0.23.0)

Option 1, adopted as prescribed.

**Parse (the fix).** `parseQuery`'s angle-bracket arm
(`src/parser/theta-document.ts`) — the single place the empty capture is
manufactured — emits the new registered `theta/parse/empty-query-annotation`
(severity error; range spanning the annotation from the `@` sigil through the
last consumed token, which covers the unterminated-at-EOF spelling; message
byte-equal to the registry row) whenever the captured interior trims to
empty: `@<>`, `@<  >`, tab- or newline-only, unterminated `@<` at EOF. The
node still carries the minted `""` so the AST reflects the source; load
refuses error thetas (`parseDiscoveredTheta`'s `hasLoadParseError` gate drops
the theta before registration, `loadCalleeComposition` refuses callees), so
no runtime path consumes it. The emission fires only in this arm: an empty
`let` annotation stays guarded-untyped and `invoke<>` keeps its
normalise-to-`null` contract — both pinned by controls.

**Spec.** Registry row in
`docs/spec_topics/diagnostics/code-registry-parse.md`, placed in the query
cluster beside `explicit-schema-mismatch` — trigger names all four spellings
and the no-empty-derivation grammar (grammar.md §Type grammar;
type-system.md's annotation-position sentence), remedy names the two exits
(name a schema or drop the annotation), message
`` `@<>` query annotation is empty; write `@<Schema>` or drop the annotation
for an untyped query `` — with the transcription row in
`docs/reference/diagnostics.md`, per the bug-0016 precedent. DIAG-2's closed
registry is satisfied in both directions: the row's asserting tests source
their expected strings from the registry via `registryMessage` (DIAG-4). No
grammar change (the grammar already derives no empty type).

**Degraded arm.** Kept as seam-level totality, per this report's Option 1
downstream note and bug 0010's residual record: both RESIDUAL DIVERGENCE
comments (live and off-session arms,
`src/extension/production-theta-producer.ts`) now record that the parse
rejection makes a `schema: ""` `QueryExpr` unmintable from source, so the arm
survives only over `lowerQueryResponseSchema`'s unchanged `undefined`
contract. No mechanism facet changed (§Non-goals).

**Tests.** New `tests/empty-query-annotation.test.ts`, written first — 16
cells, 10 red at `bfd6f7c5` for the documented reasons (zero diagnostics,
`schema: ""` minting, the fused turn driving with the verbatim pre-0010
instruction text, the unsanctioned payload binding verbatim), 6 controls
green: the registry row (DIAG-2/DIAG-4), all five empty spellings with
exact-range pins, the shadowing case, the `@<string>` / `@<Triage>` /
bare-`@` / empty-`let`-annotation / `invoke<>` controls, the lowering's
defence-in-depth contract, and three runtime-consequence cells — live
refusal (no fused `sendUserMessage` turn), off-session refusal (no fused
`complete()`), and the real production load seam
(`discoverAndComposeFixtures` over a planted workspace: the theta is dropped
and the registry message reaches `ctx.ui.notify`). The (deg-live)/(deg-off)
residual pins re-pin to the diagnostic and KEEP the arm's original fused
single-shot assertion sets through a direct-construction seam
(`blankQuerySchema` / `blankHelperQuerySchema` blank a clean `@<string>`
twin's `QueryExpr` to `""` — the arm's only remaining entry — failing loudly
on fixture drift).

**Verification.** Full default suite 212 files / 2432 tests green (baseline
211/2414 + 16 new + 2 net-new from the residual-pin splits); typecheck and
lint clean; one review round (CLEAN, no findings). Live e2e: the hardening
prompt-transport typed cell
(`tests/hardening/session-prompt-transport.test.ts`, real extension
discovery → live `AgentSession` → typed two-phase forced respond with AJV)
binds `token=PONG` and interpolates it into the follow-up turn — well-formed
typed queries unregressed through the real stack (its untyped sibling cell
also ran via vitest's substring `-t` matching and passed).

**Residuals.** The wider absence of type-grammar checks over NON-empty
`@<…>` annotation text (§Non-goals, fourth bullet) is unchanged — the empty
form was the only spelling that voided validation entirely. The load-warning
routing gap (bug 0013) is untouched; the new code is error-severity, which
both production sinks honour.

## Summary

Every `@<…>` capture whose interior trims to empty reaches the arm — `@<>`,
`@<  >`, tab- or newline-only interiors, and an unterminated `@<` at end of
input (the capture runs to EOF and still mints `""`) — and nothing else does:
every non-empty annotation lowers (permissively for unresolved names since
bug 0004), an empty `let` annotation
(`let r: = @`…``) is guarded at both propagation sites and stays untyped, and
`invoke<>` normalises to untyped at capture. The parser is therefore the single
place that manufactures the marker, and it does so silently: `@<>` parses with
zero diagnostics, loads with zero diagnostics (the provider-gate warning it
would trigger is a dropped load warning, and fires only off-set anyway), and
runs with zero errors — the model's reply is `JSON.parse`d and bound verbatim
as the typed query's `Ok` value. The bug-0010 fix kept this arm deliberately so
typed behaviour stays total, pinned it ((deg-live)/(deg-off)), and recorded the
missing diagnostic as out of scope: "A load-time diagnostic for the
empty-annotation form would need a new registered code and is deliberately not
taken here (scope)." This report is that record's follow-up. The defect is the
silence, not the arm's existence.

## Reproduction

Code-reading plus a token-free scratch parse; a live repro is unnecessary (the
degraded drive and unvalidated bind are pinned by committed regression cells).

Scratch parse (a throwaway vitest cell driving the real `parseThetaDocument` +
`lowerQueryResponseSchema`; run at `30492948`, re-run — with the tab-only and
unterminated-`@<` rows added — at `c15809cb`, whose `src/` and `tests/` are
byte-identical to `30492948`; deleted after each run):

```
--- @<>        let r = @<>`classify this`      → schema="" lowering=undefined  diagnostics(0)
--- @<  >      let r = @<  >`classify this`    → schema="" lowering=undefined  diagnostics(0)
--- @<\n>      let r = @<\n>`classify this`    → schema="" lowering=undefined  diagnostics(0)
--- @<\t>      let r = @<\t>`classify this`    → schema="" lowering=undefined  diagnostics(0)
--- @< (EOF)   let r = @<                      → schema="" (capture runs to EOF) diagnostics(0)
--- control    let r = @<string>`classify this`→ schema="string" lowering={"type":"string"}
--- control    let r = @`classify this`        → schema=null (untyped)
--- guarded    let r: = @`classify this`       → schema=null (untyped; parseLet propagates only length > 0)
--- shadowing  schema Triage { severity: string }
               let x: Triage = @<>`Assess: ${1}`?
                                               → let annotation="Triage", query schema="", diagnostics(0)
```

`detectTypedQueryExpression` returns `true` for every `schema: ""` case — the
load gate sees a typed theta; the runtime arm never consults the gate.

The degraded drive and the unvalidated bind are pinned by the bug-0010
residual cells:

- **(deg-live)** `tests/typed-two-phase-live.test.ts:1740` — fixture
  `let v = @<>`Ping`?` (:271–277). Asserts exactly ONE user-visible
  `sendUserMessage` turn whose text is the pre-0010 fused instruction with the
  empty shape inlined ("Ping\n\nRespond with ONLY a single minified JSON
  object matching this JSON schema, and nothing else — no prose, no markdown,
  no code fences: "), ZERO `complete()` dispatches, ZERO respond-tool
  registrations, and that the reply `{"unvalidated": true, "score":
  "not-a-number"}` — JSON no schema sanctioned — binds verbatim: "the degraded
  arm binds the parsed JSON verbatim — NO AJV runs".
- **(deg-off)** `tests/off-session-two-phase.test.ts:1711` — fixture
  `subagent fn helper` with `let v = @<>`Ping`?` (:237–246). Asserts exactly
  ONE fused `complete()` carrying a single user message with the same fused
  text, `context.tools` undefined, `options.toolChoice` undefined, and the
  same unsanctioned payload bound verbatim.

## Expected behaviour (what the spec says)

- `docs/reference/grammar.md` §Type grammar: `Type ::= PrimitiveType |
  NamedType | GenericType | ObjectType | Type "|" Type | LiteralType` — every
  alternative requires at least one token; there is no empty derivation.
- `docs/reference/type-system.md` §Type expressions: "The same type grammar
  applies in every annotation position: schema fields, `params:`, `let x: T`,
  function parameters, `@<T>`...`` explicit query schemas". The grammar
  therefore does not admit `@<>`; accepting it without diagnostic is a
  parse-acceptance defect.
- `docs/spec_topics/query/query-forms.md` QRY-3: "An explicit `@<Schema>`
  ascription via the explicit form always supplies the response schema and
  overrides the inference contexts below" — an ascription that supplies
  nothing is not an ascription the spec describes, and the observed behaviour
  is worse than a missing override: it also *blocks* the inference it
  overrides (the shadowing case above).
- `docs/spec_topics/query/query-failure-and-repair.md` QRY-22: "For a query
  annotated with a declared schema — a named `schema` declaration or an inline
  object/type annotation — the runtime MUST resolve that annotation to its
  declared shape, lower it … convey that lowered shape to the model on the
  forced-respond turn … and validate the final response against the lowered
  schema. … The runtime MUST NOT bind, as a typed query's value, a response
  that has not been validated against its declared schema." The empty form is
  neither a named schema nor an inline type — it is not a QRY-22-admissible
  annotation at all, which is exactly why the right fix is rejection at parse
  rather than validation of nothing.
- `docs/reference/diagnostics.md` DIAG-1/DIAG-2: "Every author-visible
  diagnostic carries a code from this registry" and "The registry is closed.
  Adding/removing a code … is a spec change." No existing code fits:
  `theta/parse/empty-template` (W) covers the template *body*,
  `theta/parse/empty-schema-body` / `empty-enum-body` cover declarations,
  `theta/parse/unresolved-named-type` requires a name, and
  `theta/parse/unsupported-feature` denotes theta-1.0-deferred or non-Theta
  constructs, not a malformed production. This confirms the 0010 F5 finding
  that a fix needs a new registered code.

## Actual behaviour / root cause

The capture (`src/parser/theta-document.ts:3670–3686`): the `@<…>` arm
consumes tokens to the matching `>` (or to end of input when no `>` closes it)
and assigns `schema = parts.join("").trim()` unconditionally — for an empty or
whitespace-only interior the join-and-trim yields `""`. No diagnostic is
pushed in the arm and no downstream pass reads `QueryExpr.schema` for
validity. The lowering (`src/runtime/query-schema-lowering.ts:53–56`):

```ts
  const s = annotation.trim();
  if (s.length === 0) {
    return undefined;
  }
```

— its only `undefined` return. The producer then builds no respond context and
no validation collaborator (`production-theta-producer.ts:2145–2158`, "Only
the degraded arm (`lowered === undefined`) builds no context"), renders the
fused typed-aware text (:2173), collapses the free phase (:2300), and drives
the arm whose WHY comment names this exact form (live arm :3689–3700):

> RESIDUAL DIVERGENCE (bug 0010 fix review, F5 — recorded in the bug doc's Fix
> §Residuals): `lowerQueryResponseSchema` returns `undefined` ONLY for an
> empty/whitespace annotation (`@<>` / `@<  >` — an author-error form the
> parser accepts with no diagnostic; every non-empty annotation lowers,
> permissively for unresolved names, since bug 0004). On that arm the ENTIRE
> pre-0010 fused mechanism survives: user-visible JSON-in-text turn,
> `maxRounds: 0` collapse, ungoverned native loop, no respond tool, no
> provider gate, and — because no lowered schema exists — NO schema-validation
> collaborator, so the parsed payload binds UNVALIDATED (the CIO-3 depth walk
> still runs in the loop; AJV does not).

The off-session arm's comment (:4256–4268) says the same for the fused
`complete()`. In the loop, the bind path confirms it: the CIO-3 depth walk
runs unconditionally (`src/runtime/query-tool-loop.ts:618`), AJV runs only
under `if (schemaValidation !== undefined && lowered !== undefined)` (:663),
and the fall-through returns `{ kind: "value", value: forced.payload }`
(:693–699) — the parsed text is the query's `Ok`.

Author-facing form × outcome, as verified at `30492948`:

| Form | `QueryExpr.schema` | Lowering | Outcome |
|---|---|---|---|
| `@<Triage>` / `@<string>` / `@<{ a: string }>` | annotation text | lowers | typed two-phase, AJV validates |
| `@<UnknownName>` | `"UnknownName"` | lowers permissively (`{}`, bug 0004) | typed two-phase, AJV (vacuous root) |
| **`@<>` / `@<  >` / `@<`↵`>`** | **`""`** | **`undefined`** | **degraded fused arm, NO AJV — this report** |
| `let r: = @`…`` | `null` | — | untyped (propagation guarded, :1725) |
| `let x: Triage = @<>`…`` | `""` | `undefined` | degraded arm; `Triage` silently ignored |
| `invoke<>(…)` | `returnSchema: null` | — | untyped (capture normalised, :3526) |

The asymmetry in the parser's own file is the root cause in one line:
`parseInvoke` guards its identical angle-bracket capture
(`returnSchema = annotation.length > 0 ? annotation : null`); `parseQuery`
does not, and it is the one place the empty capture fabricates a typed marker.

## Why it matters

- **Fabricated type safety.** The author wrote a typed marker; the runtime
  marks the query typed, tells the model to match "this JSON schema" — with
  nothing after the colon — and then binds whatever parses. No AJV, no
  respond-repair, no `validation` `Err` is reachable; theta code downstream
  consumes an arbitrary shape as if declared.
- **The shadowing case is worse than absence.** `let x: Triage = @<>`…`?`
  declares a real schema and gets no validation against it: the empty explicit
  form blocks both the direct-let propagation and the QRY-2 inference (each
  fires only on `schema === null`) and no QRY-4 warning fires. Deleting the
  stray `@<>` would make the program strictly safer.
- **The retired mechanism stays user-reachable.** Bug 0010 removed the
  transcript noise, the `maxRounds: 0` collapse, and the ungoverned typed
  native loop from every well-formed typed query — and this one malformed
  spelling resurrects all of it on the live path, including a user-visible
  turn whose instruction inlines an empty shape.
- **Silence at every phase.** Parse: no code. Load: the theta *counts* as
  typed for the provider gate (`detectTypedQueryExpression` → true) yet the
  arm it runs on never applies the gate — and load warnings are dropped by
  both production sinks anyway (bug 0010 Fix §Residuals, second bullet).
  Runtime: `Ok` binds.
- Bounded in degree: the form is an author error with no legitimate use — the
  corpus's only `@<>` occurrences are the two residual-pin fixtures and the
  bug-0010 record itself; every non-empty annotation is unaffected; and the
  arm is deliberate, pinned, and documented. The missing increment is the
  diagnostic, not a mechanism change.

## Options

1. **Reject the empty annotation at parse with a new registered code**
   (recommended; the route the 0010 F5 investigation named). Register
   `theta/parse/empty-query-annotation` (severity E, phase parse) in the parse
   registry — home `docs/spec_topics/diagnostics/code-registry-parse.md`, as a
   sibling of the `empty-template` / `empty-schema-body` / `empty-enum-body`
   rows, transcribed into `docs/reference/diagnostics.md` (DIAG-2 makes the
   addition a spec change by definition; the grammar already forbids the form,
   so no grammar change is needed). Emit it in `parseQuery`'s `@<…>` arm when
   the trimmed capture is empty, located at the annotation span; message in
   the registry's house shape, e.g. `` `@<>` query annotation is empty; write
   `@<Schema>` or drop the annotation for an untyped query `` (the
   trimmed-capture-empty condition also covers the tab/newline-only and
   unterminated `@<` spellings; the closed-set gate —
   `tests/code-registry.test.ts` over `tools/code-registry/` — requires the
   new row and a paired asserting test whose expected string is sourced from
   the registry, DIAG-4). Legitimate-use
   assessment: none — no checked-in example, doc, or fixture uses `@<>`
   outside the two residual pins, so a load-fail error breaks nothing.
   Downstream: the degraded arm becomes unreachable from source; the
   (deg-live)/(deg-off) cells re-pin to the diagnostic (whether the arm itself
   then retires or stays as seam-level totality is the fix's decision — bug
   0010's residual record governs it); `lowerQueryResponseSchema`'s
   `undefined` contract stays unchanged as defence in depth.
2. **Normalise empty → `null` (untyped) at the capture** — the `parseInvoke`
   precedent (:3526). Rejected: it silently rewrites evident intent (a typed
   marker becomes `Result<string, …>` semantics with zero signal), and in the
   shadowing case it silently *re-enables* the inference the author's
   spelling currently blocks — the program's meaning changes with no
   diagnostic either way. It also leaves a form the grammar does not derive
   parsing clean.
3. **Lower the empty annotation permissively (`{}`)** so the full typed
   machinery runs (respond tool forced, permissive root schema). Rejected: it
   validates nothing real (AJV against `{}` accepts everything — QRY-22's
   letter at most, not its point), conveys a meaningless shape on the QRY-15
   template, costs the two-phase round-trips for it, and still gives the
   author no signal.

## Non-goals

- The degraded arm's mechanism facets (fused turn, no `toolChoice`, ungoverned
  loop, no gate, `maxRounds` collapse) — knowingly kept and normatively
  recorded in bug 0010's Fix §Residuals; not re-reported here. This report is
  about the *form* being accepted silently.
- `invoke<>`'s silent empty→untyped normalisation (:3526) — contrast only; its
  return validation is a safety net, not a declared-schema promise.
- The load-warning routing gap (both production sinks drop
  `severity !== "error"`) — bug 0010 Fix §Residuals, second bullet; reported
  separately as bug 0013.
- The wider absence of type-grammar checks over non-empty `@<…>` annotation
  text (wrong-arity generics, `void`, `Result` placement — no
  `parseTypeExpression` site reads `QueryExpr.schema`, and
  `checkSchemaFeedingType` in `src/parser/schema-subset-gate.ts` has no
  production callers — only `tests/schema-subset-gate.test.ts` drives it) — a
  neighbouring gap; the empty form is the only one that voids
  validation entirely, and option 1 does not depend on closing the rest.
- `lowerQueryResponseSchema`'s total-function contract (`undefined` for the
  unlowerable input) — correct as a seam; unchanged under option 1.

## Provenance

- Spec measured against: `docs/reference/grammar.md` (§Type grammar),
  `docs/reference/type-system.md` (§Type expressions — annotation-position
  sentence), `docs/spec_topics/query/query-forms.md` (QRY-3, QRY-4),
  `docs/spec_topics/query/query-failure-and-repair.md` (QRY-22),
  `docs/reference/diagnostics.md` (DIAG-1/2, `theta/parse/*` rows),
  `docs/spec_topics/diagnostics/code-registry-parse.md` (full parse-code
  sweep: no fitting code).
- Implementation: `src/parser/theta-document.ts` (`parseQuery` :3663, capture
  :3686, bare-ident arm :3691, `parseInvoke` guard :3526, `parseLet`
  propagation guard :1725–1735, structural query case :4936,
  `parseTypeExpression` sites :4585/:4660/:4666/:4745, typed-detection :5173),
  `src/parser/query-schema-resolve.ts` (:134–136 empty-sink guard,
  `resolveQuery` gate :451–455, `checkLetMismatch` :470–482),
  `src/parser/type-layer-checks.ts` (`annotationToCompatType` empty guard
  :250–253), `src/runtime/query-schema-lowering.ts` (:53–56),
  `src/extension/production-theta-producer.ts` (typed :2138, lowered
  :2145–2148, respond :2155–2158, queryText :2173, collapse WHY + line
  :2291–2300, live degraded arm + WHY :3681–3718, `#driveUserVisibleTurn`
  governor arming :3901–3909, off-session degraded arm + WHY :4255–4275,
  `renderTypedAwareQueryText` :4692, `#validateInvokeReturn` :3105 for the
  invoke contrast), `src/runtime/query-tool-loop.ts` (depth walk :618, AJV
  gate :663, unvalidated bind :693–699), `src/parser/schema-subset-gate.ts`
  (`checkSchemaFeedingType`, no production callers).
- Tests inspected: `tests/typed-two-phase-live.test.ts` (fixture :271–277,
  (deg-live) :1739–1788), `tests/off-session-two-phase.test.ts` (fixture
  :237–246, (deg-off) :1710–1761) — the residual pins this report cites as its
  degraded-arm evidence; corpus sweep for `@<>` (no other occurrences).
- Method: scratch vitest cell driving `parseThetaDocument` /
  `lowerQueryResponseSchema` / `detectTypedQueryExpression` at `30492948`,
  re-run at `c15809cb` (`src/` and `tests/` byte-identical between the two)
  with the tab-only and unterminated-`@<` probes added (output transcribed in
  Reproduction; file deleted after each run).
- History: the lowering's empty→`undefined` arm lands in `ecd83aed`
  (2026-07-03, "V13e (Defect B) — compose typed-query schema validation at the
  production root (QRY-22)"), where it is unreachable — that commit's
  `parseQuery` has no angle-bracket capture at all (the bare `@Ident` arm
  only, and an identifier is never empty). The unguarded `@<…>` capture with
  the trim lands the same day in the descendant `04dbb013` ("core-exec-eval —
  evaluate ?/match/member/index/object in the body executor + thread params +
  lower object args") — the empty form becomes mintable there, hours after
  the QRY-22 composition; pre-0010 the fused mechanism was every typed
  query's mechanism, so `@<>` bound unvalidated from that commit on.
  `30492948` (0.20.0, bug-0010 fix) confined the mechanism to this arm, added
  the WHY comments, pinned it, and recorded the residual (provenance chain:
  bug 0010 Fix §Residuals + fix review F5 → this report).
