# Bug 0384 — Seven field-name diagnostic interpolations render an author-controlled break raw into `message`: the four `params:`-key sites (`params-type-not-expression` ×2, `non-trailing-default`, `default-without-literal`) interpolate the cooked YAML key and the three inline-object rows (`duplicate-inline-field-name`, `quoted-inline-field-name`, `inline-field-name-not-identifier`) interpolate the raw pre-colon source slice, so an explicit-key block-scalar `params:` key cooking to `a\nb` (RHS `[1, 2]`) and `{ a<LF>b: string }` each render a two-physical-line `message` where `diagnostic-shape.md:34` says single-line summary — the 0105/0250/0300/0348 class at the `<param>`/`<field>` rows the `<value>` normalisation list never covered, including the exact `frontmatter.ts` params-name candidate 0348 §Non-goals named and did not sweep

- **Status:** fixed (0.366.0).
- **Sev/Diff estimate:** S3/D1–D2 — the class's established letter
  (0250/0300/0348 precedent: wrong rendered shape on the diagnostics channel;
  an author-chosen name forges the serialised content format's reserved
  continuation / blank-line shapes; every carrier already refuses the theta,
  so the blast radius is the diagnostics display). D1–D2 because the remedy
  at each site is the existing exported `normaliseLiteralValueLineBreaks`
  wrap, plus the DIAG-2 same-commit spec sentence — the 0250/0348 fix shape —
  but the transform must be imported into two NEW files (`params.ts`,
  `type-grammar.ts`), a wider blast radius than 0348's single-file fix, and
  the `type-grammar.ts` spec amendment needs its own clause (see §Fix).
- **Kind:** defect, with the same spec omission underneath as 0348: the
  category-5 `<param>` rule and the three-row inline `<field>` carve-out
  (`placeholder-rendering-b.md:10`) prescribe verbatim/bare rendering with no
  break handling — drafted over identifier-shaped names — and the `:75`
  normalisation list enumerates `<value>` rows plus (since 0348) the
  `unknown-frontmatter-field` `<field>`, not these seven.
- **Related:**
  - 0348 (fixed 0.340.0) — the immediate parent. Its §Non-goals names the
    params-name carrier explicitly: "The error-severity params-field-name
    interpolations (`frontmatter.ts:1053` `params-type-not-expression`, …) —
    a different surface (a `params:` key, not a frontmatter key). Only `:1053`
    fires on a non-identifier name and so may carry a break; it is a separate
    candidate, not swept here." Its fix record's no-widening bound
    ("Do NOT widen to other placeholders or other codes … a corpus-wide sweep
    is hunt territory") is why this arrives as a report.
  - 0105 (fixed 0.217.0) — established the class and the shared transform;
    0250 / 0300 — the chain discipline (each newly-measured carrier gets its
    own filing, one report may cover several same-mechanism sites, as 0105
    itself covered three codes).
  - Report 01 in this folder ([bug 0380](./0380-nonidentifier-params-key-registers-and-forges-binder-prompt-and-echo.md)) — the same
    break-carrying `params:` key on the *clean-load* path (valid RHS).
    Disjoint observable: here the RHS/ordering is separately faulty and the
    KEY reaches a refusing diagnostic's message. Ordering: if 01 lands first
    and its adjudication picks refuse-and-skip, the break carrier dies at
    three of the four params sites and this report's fixer re-witnesses them
    via the space/punctuation carrier plus a pre-01-baseline red; the sites
    themselves stay live and un-normalised, and the three `type-grammar.ts`
    rows are theta body source outside 01's reach entirely — no merge.
- **Affected** (verified at `9474dfa8`, v0.347.0):
  - `src/parser/frontmatter.ts:1058` —
    `` `'params:' field '${name}' right-hand side is not a theta type expression` ``,
    `name = String(item.key.value)` (`:969`, cooked YAML key), no transform.
    Fires when the value node's shape carries no type (flow sequence, block
    mapping, alias …).
  - `src/parser/params.ts:316` — the same message template at the recovered-
    text stage (`field.name`, same cooked key), no transform.
  - `src/parser/params.ts:354` —
    `` `non-defaulted param '${field.name}' follows a defaulted param; …` ``,
    no transform (`theta/parse/non-trailing-default`).
  - `src/parser/params.ts:418` —
    `` `params default for '${field.name}' is empty; …` `` no transform
    (`theta/parse/default-without-literal`).
  - `src/parser/type-grammar.ts:1655` (`duplicate-inline-field-name`), `:1673`
    (`quoted-inline-field-name`), `:1733` (`inline-field-name-not-identifier`)
    — `${key}` is the inline object entry's raw pre-colon source slice
    (verbatim after `trim()`); a literal newline inside the slice survives.
  - `src/diagnostics/diagnostic.ts:78–115` — `renderDiagnosticLine` /
    `renderDiagnosticBatch`, the line-oriented rendering whose `  hint:` /
    related-site / blank-line shapes a break forges (0105's measured
    mechanism, unchanged).
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:34` (`message` —
    single-line summary), `:63` (serialised content format).
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md:10` — the
    `<field>` three-row inline carve-out ("renders that text as written") and
    the `<param>`/`<name>` identifier-shaped rule; `:75` — the normalisation
    list that omits all seven rows.
- **Observed at:** v0.347.0 (`9474dfa8`). Offline, deterministic: scratch
  vitest over `parseThetaDocument` (`tests/helpers/e2e-s1.ts` `parseDoc`).
  Probes run and deleted.

## Reproduction

Each row one in-memory theta (`mode: prompt`, `model: sonnet`); messages shown
JSON-escaped, stored `message` carries the raw break.

| input | code | emitted `message` | lines |
|---|---|---|---|
| params block-scalar key `? \|-` cooking to `a\nb`, RHS `[1, 2]` | `theta/load/params-type-not-expression` | `"'params:' field 'a\nb' right-hand side is not a theta type expression"` | 2 |
| params block-scalar key cooking to `x\n  hint: forged`, RHS `[1, 2]` | same | `"'params:' field 'x\n  hint: forged' right-hand side …"` — second physical line begins `  hint: ` (the reserved continuation shape, on a diagnostic with no `hint`) | 2 |
| params block-scalar key cooking to `a\nb`, RHS `zzz9 qq` (scalar, non-type text) | same (via `params.ts:316`) | `"'params:' field 'a\nb' right-hand side …"` | 2 |
| params `first: string = "x"` then block-scalar key cooking to `a\nb`, RHS `string` | `theta/parse/non-trailing-default` | `"non-defaulted param 'a\nb' follows a defaulted param; …"` | 2 |
| params block-scalar key cooking to `a\nb`, RHS `string =` | `theta/parse/default-without-literal` | `"params default for 'a\nb' is empty; …"` | 2 |
| body `let v: { a<LF>b: string } = …` | `theta/parse/inline-field-name-not-identifier` | `"field name 'a\nb' within one inline object type is not an identifier"` | 2 |
| body `let v: { "a<LF>b": string } = …` | `theta/parse/quoted-inline-field-name` | `"quoted field name '\"a\nb\"' within one inline object type; field names are identifiers"` (measured live; collateral `let-without-initialiser` + two `literal-newline-in-string` diags land in the same batch, worsening the forged-shape exposure) | 2 |
| body `let v: { a<LF>b: string, a<LF>b: integer } = …` | `theta/parse/duplicate-inline-field-name` | `"duplicate field name 'a\nb' within one inline object type"` | 2 |

Controls: `"a b"` (space, no break) renders one line at every site; the
inline-object slice with no interior break renders one line.

The params-key carrier is the explicit-key block scalar (`? |-`), whose
cooked value carries a real U+000A. The implicit double-quoted spelling
(`"a\nb": …`) is refused by the yaml lib as `malformed-frontmatter-yaml`
(the escape never cooks), as is a raw newline in an implicit key. The
inline-object carrier is a raw newline in the pre-colon source slice (theta
source; the slice is taken verbatim, `trim()` only strips ends).

## Expected behaviour

- `diagnostic-shape.md:34`: `message` is a single-line summary; `:63` reserves
  the two-space `  hint:` continuation, the related-site line, and the
  blank-line batch separator — shapes the second row above forges (measured).
- `placeholder-rendering-b.md:75` states the class rule and its reason
  ("passes a line-break normalisation, because `message` is a single-line
  summary … must not reproduce the serialised content format's … shapes");
  0348's fix extended it to a `<field>` row on identical grounds. The reason
  covers every author-controlled name interpolation; these seven fell outside
  only because the list was drawn over `<value>` rows.
- 0105 §Fix / 0250 §Fix / 0348 §Fix are the adjudicated dispositions for the
  identical shape at sibling rows: normalise at message construction
  (collapse, not escape — the category-5 rules prescribe verbatim/bare
  rendering with no byte-identical-assertion carve-out, per 0348's reasoning).

## Actual behaviour / root cause

All seven interpolations bind the name text with no transform.
`normaliseLiteralValueLineBreaks` is imported and applied by the neighbouring
messages in `frontmatter.ts` (eight sites: `:443`, `:717`, `:809`, `:1406`,
`:1472`, `:1526`, `:1551`, `:1568`) and exported for the rest; neither
`params.ts` nor `type-grammar.ts` imports it. The spec's `<param>`/`<field>`
rules were drafted over identifier-shaped names, so the spec prescribes the
break-carrying rendering rather than forbidding it — the same
spec-drafted-over-identifiers pattern 0348 recorded.

## Why it matters

- The forged `  hint:` / blank-line shapes are the operator-deception vectors
  0105 documented; the diagnostics channel is the operator's trust surface for
  author-controlled files.
- The `hint:` forge row is measured, not hypothetical.
- Leaving enumerable same-class carriers unwired makes
  `placeholder-rendering-b.md:75` read as deliberately excluding them (0250's
  argument, verbatim).

## Non-goals

- The clean-load half of the break-carrying params key (report 01; the two
  fixes compose — refusal at load would make three of the seven rows
  unreachable for the *break* carrier but the space/punctuation carriers keep
  the sites live and un-normalised).
- The `<key>` quoting divergence (report 06).
- `theta/parse/reserved-keyword-as-identifier` / `binding-case-mismatch` at
  the params face — their names are reserved-keyword/identifier-shaped by
  construction, no break reaches them (0348's `deferred-frontmatter-field`
  disposition).
- The FN-7 `with`-clause key site (`theta-document.ts:2837`) — raw lexer
  slice, measured non-exploitable by 0348's review; unchanged.

## Fix

Wire all seven interpolations through `normaliseLiteralValueLineBreaks`
(imported into `params.ts` and `type-grammar.ts`; already imported in
`frontmatter.ts`), and in the same commit extend
`placeholder-rendering-b.md:10`/`:75` with the 0348-style except-clauses: the
`<param>` of the four params rows binds a cooked YAML key and passes the
normalisation; the three-row inline `<field>` carve-out's "as written"
rendering applies to the normalised slice (raw newline named as the reachable
break). Fixer caveat: `type-grammar.ts` binds a RAW source slice — the same
property `placeholder-rendering-b.md:75` uses to *exempt*
`duplicate-discriminator-value` from the normalisation list — but unlike that
row a raw U+000A does reach these three sites (measured), so the exemption's
premise fails here and the spec amendment must say so explicitly, or a future
auditor will read the exemption as covering them. Registry *Message*
templates do not move (DIAG-4). Witness per 0250's
pattern: physical-line counts, the forged-`hint:` row, batch-block count,
break-free controls byte-identical; red direction against pre-fix bytes.

## Provenance

Origin: 0348 §Non-goals' named-unswept candidate (`frontmatter.ts:1053` at its
baseline; `:1058` at this HEAD) — this report is that filing, widened by
measurement to the three sibling params-name rows and the three inline-object
rows the same sweep surfaced. Spec read: `diagnostic-shape.md:34,63`;
`placeholder-rendering-b.md:10,75`; `code-registry-load.md:20`
(params-type-not-expression row). Implementation read:
`src/parser/frontmatter.ts:966–1060`, `src/parser/params.ts:240–420`,
`src/parser/type-grammar.ts:1640–1740`, `src/diagnostics/diagnostic.ts:78–115`.
Prior bugs read in full: 0105, 0250, 0300, 0348. Probes: two scratch vitest
files over `parseDoc` (the seven-row matrix plus controls), run at `9474dfa8`,
deleted.

## Fix (0.366.0)

- What shipped:
  - `src/parser/params.ts` — the three `params:`-key message interpolations (`params-type-not-expression` recovered-text stage, `non-trailing-default`, `default-without-literal`) wrapped through `normaliseLiteralValueLineBreaks`; new value import with a WHY comment.
  - `src/parser/type-grammar.ts` — the three inline-object row messages (`duplicate-inline-field-name`, `quoted-inline-field-name`, `inline-field-name-not-identifier`) wrapped; new value import with a WHY comment. `renamed-inline-field-name` left untouched (its subject is a theta-side identifier, no raw break reaches it).
  - `src/parser/frontmatter.ts` — the `params-type-not-expression` value-shape-refusal message wrapped (transform already imported).
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md` — category-5: the three-inline-object `<field>` carve-out now names the raw U+000A as reachable and applies to the normalised slice; a cooked-`params:`-key `<field>` clause added for `non-trailing-default` / `default-without-literal` (the registry spells `<field>` there, not `<param>`); a `<param>` clause added for `params-type-not-expression` (both sites). Category-7: the `<value>` bullet clarified that the `duplicate-discriminator-value` raw-source-slice exemption does NOT cover the three inline rows, where a raw U+000A does reach the site.
  - Detection/comparison keys and registered/wire names untouched; registry *Message* templates unmoved (DIAG-4).
- Gates: witness `tests/b0384-field-name-diagnostic-single-line.test.ts` 14/14 green (RED before: 9 cells failed on raw U+000A under a temporary code revert, restored byte-exact); full default suite `npm test` 531 files / 10034 tests green (two real-spawn/timing files flaked under parallel load, both green isolated and off-surface); `npm run typecheck` clean; `npm run lint` clean; live `tests/live/inline-field-name-not-identifier-live-cell.test.ts` green under the live lock (renders a fixed code with a break-free name — byte-identical); `tests/fixtures/h7a/permitted-codes.json` byte-identical at blob a4a8da04.
- Review: 2 rounds. Round 1 (deep, `bug-fix-reviewer`) — one spec-fidelity defect F1: the `<param>` amendment misattributed `<param>` to `non-trailing-default` / `default-without-literal`, which the normative registry spells `<field>`; fixed spec-prose-only. Round 2 (fast, `bug-fix-reviewer-fast`) — clean.
- Verification: PASS (`bug-fix-verifier`). Witness genuinely reds under a code revert on the raw-U+000A symptom and restores byte-exact to green; full suite green; typecheck + lint clean; detection semantics confirmed unmoved by diff read; live obligation discharged by the orchestrator.
- Residuals:
  1. `theta/parse/params-default-type-mismatch` (`src/parser/type-compat.ts`, fed the cooked `params:` key via `src/parser/params.ts`) interpolates the same cooked key un-normalised and renders a two-physical-line message for a break-carrying key — a same-class carrier that is NOT among this bug’s seven sites nor named in its §Non-goals. Out of scope per 0348’s no-widening bound and 0250’s chain discipline; a new-filing candidate, not a defect of this fix.
  2. The witness header retains the pinned 0348 witness convention “THE FIX (seeded, NOT implemented here)” (“here” = in this test file); convention-consistent, not stale.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: DIAG-4 honoured (registry Message templates unmoved; only placeholder rendering changed, governed by placeholder-rendering-b.md); 0105-chain break-discipline honoured (collapse via `normaliseLiteralValueLineBreaks`, not JSON-escape). Not widened to: report 01 (0380) clean-load half, report 06 `<key>` quoting, the reserved-keyword / binding-case params faces, or the FN-7 `with`-clause key site.
