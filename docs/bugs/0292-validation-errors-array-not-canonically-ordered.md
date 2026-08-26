# Bug 0292 — `ValidationError.validation_errors` is emitted in AJV's native error order, not the ERR-14 canonical (path, schema_keyword, message) sort: `validateAgainst` maps `result.errors` positionally (`typed-query-validation.ts:328–332`) and no site on the typed-query path calls `orderValidationIssues`, so a `{ b, a }` schema failing on both fields surfaces `validation_errors[0]` naming `'b'` where ERR-14 defines the canonically-first issue as `'a'` — while the sibling `<ajv-summary>` renderer orders the same issues canonically, so the follow-up turn and the terminal error disagree on order for one failure

- **Status:** open.
- **Sev/Diff estimate:** S3/D1 — S3 because the divergence is order-only on an
  author-visible array whose content is otherwise correct: no issue is lost,
  no value corrupted, and the failure is loud. What breaks is the
  spec-defined determinism contract — ERR-14 makes `validation_errors[0]`
  "well-defined (the canonically-first issue)" so authors and conformance
  tests can key on it; at this HEAD `[0]` is whatever AJV emitted first,
  which is schema-declaration/`required`-array order, an
  implementation-defined sequence ERR-14 exists to erase. Weighed against S2
  and rejected: an author matching on `validation_errors[0].message` gets a
  *different valid issue*, not a wrong fact. D1 because the remedy is one
  `orderValidationIssues(...)` wrap at one mapping site the module could
  already import, with the sibling `<ajv-summary>` renderer as the in-file
  precedent; no committed cell pins the raw order (all existing cells use
  single-issue failures or assert membership).
- **Kind:** defect — implementation omits a normative transform at exactly
  the site the spec assigns it. ERR-14
  (`docs/spec_topics/errors-and-results/queryerror-variants.md:56`): "the
  runtime applies this canonical order **when mapping those errors into
  `ValidationIssue` entries**, so the array is reproducible across conforming
  validators." The mapping site is `validateAgainst`
  (`src/runtime/typed-query-validation.ts:322–334`): it maps
  `result.errors.map((e) => ({ path: e.instancePath, message: e.message,
  schema_keyword: e.keyword }))` in AJV emission order and returns it; the
  terminal `ValidationError` copies it verbatim
  (`terminalValidationError`, `src/runtime/query-respond-repair.ts:301`:
  `validation_errors: [...failure.issues]`). `orderValidationIssues`
  (`src/runtime/query-error.ts:197`) exists, implements the ERR-14 sort, and
  is called by exactly two production sites — the binder's post-merge
  classification (`src/binder/defaulting.ts:109`) and the QRY-12 follow-up
  `<ajv-summary>` renderer (`src/runtime/query-followup-render.ts:121`) —
  neither of which is the author-visible array.
- **Related:**
  - **0066** (fixed) — its fix round made `<ajv-summary>` canonical "by
    ERR-14's own contract" on the binder path; the query-path array was not
    carried along.
  - **0212** (fixed) — relied on ERR-14 ordering keying on
    `(instancePath, keyword, message)` only; unaffected by this report.
- **Affected** (verified at `bc52da38`, v0.287.0):
  - `src/runtime/typed-query-validation.ts:328–332` — the AJV→`ValidationIssue`
    mapping, positional, no sort.
  - `src/runtime/query-respond-repair.ts:292`, `:301` —
    `terminalValidationError` spreads the final failure's issues verbatim
    into `validation_errors` (the `:292` non-compliance arm is single-issue
    and trivially ordered; `:301` is the AJV arm this report is about).
  - `src/runtime/query-error.ts:197` — `orderValidationIssues`, the shipped
    ERR-14 sort, not reachable from the typed-query array path.
  - `src/runtime/query-followup-render.ts:121` — the contrast site: the SAME
    issues are canonically ordered for the `validator_error` template's
    `<ajv-summary>`, so within one failed typed query the follow-up turn
    lists issues in one order and the terminal `Err` carries them in another.
  - Spec: `docs/spec_topics/errors-and-results/queryerror-variants.md:56`
    (ERR-14, quoted above).
- **Observed at:** v0.287.0 (`bc52da38`). Offline, deterministic,
  provider-free: one scratch vitest probe driving the shipped
  `runTypedQueryLoop` + `buildTypedQueryValidation` + real `AjvSchemaValidator`
  over a parsed `schema Pair { b: string, a: string }` with a scripted
  forced-respond payload (the `tests/e2e-s3-typed-query-conformance.test.ts`
  harness pattern); written, run, deleted.

## Summary

ERR-14 fixes the order of `validation_errors`: "a stable ascending sort keyed
on the tuple (`path`, `schema_keyword`, `message`), comparing each field by
Unicode code point", applied "when mapping those errors into
`ValidationIssue` entries", making `validation_errors[0]` "well-defined (the
canonically-first issue)". The runtime ships that sort
(`orderValidationIssues`) and applies it to the binder's issue list and to
the respond-repair follow-up's `<ajv-summary>` — but not to the
`ValidationError.validation_errors` array itself, the one surface theta code
can `match` on. `validateAgainst` maps AJV's `errors` array positionally and
`terminalValidationError` spreads it unchanged.

AJV's native order is schema-evaluation order — `required` entries in the
lowered `required` array order, property keywords in declaration order — so
any schema whose declaration order differs from the canonical sort surfaces a
divergent array. Measured: `schema Pair { b: string, a: string }`, forced
respond payload `{}` (both required properties missing), `attempts: 0`:

```
observed : [{"path":"","message":"must have required property 'b'","schema_keyword":"required"},
            {"path":"","message":"must have required property 'a'","schema_keyword":"required"}]
canonical: [{"path":"","message":"must have required property 'a'","schema_keyword":"required"},
            {"path":"","message":"must have required property 'b'","schema_keyword":"required"}]
```

`validation_errors[0]` names `'b'`; ERR-14's well-defined first issue is
`'a'`. The same divergence appears for two type errors (payload
`{ b: 1, a: 2 }` yields paths `/b`, `/a` observed against canonical `/a`,
`/b`). Meanwhile the follow-up renderer (`query-followup-render.ts:121`)
orders the identical issue set canonically, so the model-facing summary and
the author-facing array disagree on order for one and the same failure.

## Reproduction

Offline, deterministic, provider-free, at `bc52da38`. Scratch vitest probe
(written, run, deleted) on the `e2e-s3` harness pattern:

1. Parse `schema Pair {\n  b: string,\n  a: string\n}` via
   `parseThetaDocument`; lower via `lowerQueryResponseSchema("Pair", …)`.
2. Build the production validation via `buildTypedQueryValidation` with the
   real `AjvSchemaValidator`, `attempts: 0`, `maxRounds: 0`.
3. Drive `runTypedQueryLoop` with a scripted forced-respond payload `{}`.
4. The outcome is `validation` / `cause: "schema_validation"`; log
   `outcome.error.validation_errors` and
   `orderValidationIssues(outcome.error.validation_errors)`.

Observed output (verbatim from the run): the two arrays above;
`observed == canonical` prints `false`. A second cell with payload
`{ b: 1, a: 2 }` shows the same inversion on `path` (`/b` before `/a`).

## Expected behaviour

`queryerror-variants.md:56` (ERR-14): the entries of `validation_errors` are
emitted in the canonical deterministic order; the runtime applies this order
when mapping validator errors into `ValidationIssue` entries;
`validation_errors[0]` is the canonically-first issue; conformance tests
compare under this order "rather than under the validator's native emission
sequence". For the probe input, the array must be
`['a'-required, 'b'-required]`.

## Actual behaviour / root cause

`validateAgainst` (`typed-query-validation.ts:322–334`) performs the mapping
ERR-14 names and omits the sort; every downstream carrier
(`runRespondRepairLoop`'s `latest` failure, `terminalValidationError`'s
`[...failure.issues]`) preserves the raw order. The ERR-14 transform was
wired at the two *rendering* consumers (binder issue list, `<ajv-summary>`)
but never at the value-construction site, so the array the author matches on
is the one surface still carrying "the validator's native emission sequence".

## Why it matters

- ERR-14's whole content is reproducibility: the array must be identical
  across conforming validators and runs. AJV emission order is an
  implementation detail of the validator theta explicitly isolates itself
  from ("a future validator swap is not a breaking change",
  queryerror-variants.md §Notes) — at this HEAD a validator swap or an AJV
  option change silently reorders an author-visible array.
- `validation_errors[0]` is the documented anchor (spec: "well-defined");
  authors and conformance tests keying on it get a declaration-order-dependent
  issue instead.
- The runtime already disagrees with itself: the follow-up turn's
  `<ajv-summary>` lists `'a'` first while the terminal `Err` for the same
  failure lists `'b'` first — two orderings of one failure in one query.

## Non-goals

- The `<ajv-summary>` renderer and binder path are conformant and untouched.
- The ERR-17 synthesised-issue arm always carries exactly one issue; no
  ordering question arises there.
- AJV's own emission order is out of scope; ERR-14 exists precisely so it
  does not matter.

## Fix

Wrap the mapping site: `validateAgainst` returns
`orderValidationIssues(issues)` instead of `issues`
(`typed-query-validation.ts:333`), matching the spec's "when mapping those
errors into `ValidationIssue` entries". One line plus one import; the
follow-up renderer's own sort becomes a no-op re-sort (idempotent — the sort
is stable). Witness: a two-required-failure cell asserting the canonical
array byte-for-byte, red at this HEAD with the raw order, green with the
sort; a control asserting `<ajv-summary>` is unchanged. Alternative
(rejected): sorting in `terminalValidationError` — it leaves the
per-attempt `latestIssues` and any future consumer unordered and diverges
from the spec's named site.

## Provenance

Error-classification bug hunt, worktree `C:/UnitySrc/pi-theta-hunt` at
`bc52da38` (v0.287.0). Surfaces read: `src/runtime/typed-query-validation.ts`,
`src/runtime/query-respond-repair.ts`, `src/runtime/query-error.ts`,
`src/runtime/query-followup-render.ts`, `src/seams/schema-validator.ts`
(`#build`'s raw-order passthrough and its ERR-14 comment); spec ERR-14 in
full. Probe: scratch vitest file on the `e2e-s3` harness, run and deleted;
outputs quoted verbatim above.
