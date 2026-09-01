# Bug 0309 — expressions.md's own normative `match` example interpolates `${e.message}` inside a REGULAR string literal (`reason: "unrated: ${e.message}"`), which lexical.md pins as plain text ("No interpolation — the sequence `${` inside a regular string is plain text"), and the committed H9a acceptance fixture `acc-match-queryerror.theta` ships the same inert shape — so the corpus itself models an error-reporting idiom that silently emits the literal bytes `${e.message}`

- **Status:** fixed (0.341.0) (candidate found in bug-hunt at HEAD `bc52da38`, v0.287.0).
- **Sev/Diff estimate:** S4/D1 — S4 because no runtime behaviour is wrong
  (the implementation follows lexical.md:26: `${` in a regular string is
  plain text, live-verified), but the spec's own example and a committed live
  fixture teach the broken idiom, and the failure mode it teaches is a silent
  wrong-bytes one (an error report carrying `${e.message}` instead of the
  message). D1 because the fix is two example edits (or, if interpolation in
  regular strings is wanted, a language change that needs its own RFC — not
  an example fix).
- **Kind:** spec defect (example contradicts a normative rule) + committed
  fixture carrying the contradicted idiom.

## Symptom

The runtime treats `${…}` inside a regular (quoted) string literal as plain
text. Live at HEAD `bc52da38` (probe harness, prompt mode): a theta computing
`o["V=${bound.a}"]` panics with

```
theta /tvalue aborted: missing object key: "V=${bound.a}"
```

— the lookup key is the raw fourteen bytes, not an interpolation. This is
CONFORMANT: lexical.md:26 says "**No interpolation** — the sequence `${`
inside a regular string is plain text. Multi-line text and interpolation
belong inside `@`...`` query templates; for non-query multi-line text, build
via `+` concatenation …".

## Expected

Spec examples and committed fixtures model only spec-legal-AND-working
idioms.

## Actual

- docs/spec_topics/expressions.md:155–158 — the `match` example the pattern
  grammar section leads with:

  ```theta
  let score = match @<ReviewScore>`Rate the critique 1-5: ${critique}` {
    Ok(s)  => s,
    Err(e) => ReviewScore { value: 0, reason: "unrated: ${e.message}" }
  }
  ```

  The query-template interpolation (line 155) is legal (QRY-18); the `Err`
  arm's `"unrated: ${e.message}"` (line 157) is a regular double-quoted
  string, so under lexical.md:26 the constructed `ReviewScore.reason` is the
  literal text `unrated: ${e.message}` — the example's evident intent (carry
  the error message) is not what the spelled program does, and no diagnostic
  fires (the bytes are legal string content).

- tests/live/acceptance/fixtures/acc-match-queryerror.theta:9 — the committed
  H9a area-(h) fixture:

  ```theta
  Err(e) => "handled query error: ${e.message}"
  ```

  Same inert shape: on the error path the fixture's outcome is the literal
  `handled query error: ${e.message}`. The fixture's assertions do not pin
  those bytes (the run merely "exits cleanly either way"), so nothing reds —
  but the corpus is teaching the idiom.

No diagnostic exists for the shape (an author cannot be warned), and the two
documents cannot both be followed: either lexical.md:26's rule is the
contract and the examples must be rewritten (query-template rendering or `+`
concatenation — noting `+` is string-only, so a non-string field like
ERR-19's `rounds` has NO in-language path into a regular string at all), or
interpolation in regular strings is intended and lexical.md:26 plus the
implementation are behind — which is a language-surface decision, not an
example fix.

## Impact

Authors copying the spec's own `match`-recovery example (the canonical
QueryError-handling idiom) produce error reports, schema fields, and prompt
fragments carrying literal `${…}` bytes with zero diagnostics. Where the
value flows onward (constructed schema values, tool-call args, follow-up
query text via a later template) the corruption is silent.

## Reproduction

Offline: `parseThetaDocument` over a body containing
`let s = "x ${1+1}"` — loads clean, no diagnostic; evaluate: `s` is the
9-byte literal. Live: the probe fixture above (observed
`missing object key: "V=${bound.a}"` / `"${d}"` verbatim in the panic note,
two independent drives).

Live-confirmed: yes (the plain-text behaviour observed live; the defect
itself is in the docs corpus + fixture).

## Related

- lexical.md:26 — the normative rule (correct, implemented).
- QRY-18 (query-escapes-stringification.md) — the blessed interpolation
  surface the examples should route through.
- expressions.md:230 — the `+`-operator note ("interpolate inside a string"),
  which reads as if regular strings interpolate; same sweep should reword it
  to name query templates.
- Bug 0243 — unrelated mechanism, but the same lesson that fixture prose
  drifts from what models/runtimes actually do.

## Fix (0.341.0)

**Parent adjudication (verbatim).** "Example-fix route ONLY: lexical.md:26 is
the contract — it is normative, implemented, and live-verified; the
language-change alternative (interpolation in regular strings) is RFC territory
and REJECTED here. Rewrite the three sites to spec-legal-AND-working idioms: the
expressions.md match example's Err arm and the fixture's Err arm route the
message via `+` concatenation (e.message IS a string, so `+` is legal there —
e.g. "unrated: " + e.message) or an equivalently legal shape the corpus already
models; the :230 note is reworded to name query templates as the interpolation
surface (or the sentence otherwise reconciled to lexical.md:26). Semantics of the
example must remain the SAME teaching (match recovery constructing a fallback
with the error message carried); the fixture's observable contract must remain
the SAME (loads clean, drives to completion, exits cleanly either way — its
assertions must not change unless they pin the old literal bytes, which the doc
says they do not; verify at premeasure). Do NOT touch lexical.md (the rule is
correct); do NOT add a diagnostic for ${ in regular strings (language-surface
change, out of scope; the doc records no diagnostic exists — that stays true);
do NOT sweep the corpus for other instances beyond the three enumerated sites
(if premeasure finds MORE instances of the inert idiom in NORMATIVE spec examples
or COMMITTED fixtures, enumerate them in the report as residual-filing material
but fix only the enumerated three)."

- **What shipped:**
  - docs/spec_topics/expressions.md:157 — the `match` example's `Err` arm now
    carries the error message via `+` concatenation
    (`reason: "unrated: " + e.message`) instead of the inert regular-string
    `"unrated: ${e.message}"`; the teaching (match recovery constructing a
    fallback that carries the message) is unchanged (§Fix site 1).
  - docs/spec_topics/expressions.md:232 — the `+`-operator note now names the
    `@`...`` query template as the interpolation surface ("regular strings do
    not interpolate; see [Lexical Structure](../spec_topics/lexical.md#string-literals)"),
    reconciling it to lexical.md:26, instead of "interpolate inside a string"
    (§Fix site 3; the note sat at :230 at the bc52da38 filing, re-derived to
    :232 at the fork).
  - tests/live/acceptance/fixtures/acc-match-queryerror.theta:9 — the H9a
    area-(h) fixture's `Err` arm now uses `"handled query error: " + e.message`;
    the fixture's observable contract (loads clean, drives to completion, exits
    cleanly either way) is unchanged — its invariants (`noErrorExit`,
    `permittedCodesSubset`) never pinned the Err-arm bytes (§Fix site 2).
  - lexical.md untouched (the rule is correct); no diagnostic added; no corpus
    sweep beyond the three enumerated sites.
- **Gates:**
  - Witness (parse gate): `npx vitest run tests/committed-fixture-parse-gate.test.ts`
    → 36 passed. The rewritten fixture parses clean; this is the standing parse
    witness. No runtime red exists — the inert `${` idiom is spec-conformant
    plain text (lexical.md:26), so reverting the fix reds nothing (docs+fixture
    witness posture).
  - Full suite: `npm test` → 523 files / 9901 tests passed (baseline at fork and
    post-fix, unchanged).
  - Typecheck: `npm run typecheck` (`tsc --noEmit`) → clean.
  - Lint: `npm run lint` (`eslint src/**/*.ts`) → clean.
  - Rewritten example parses (obligation C): scratch probe through
    `parseThetaDocument` → zero error-severity diagnostics (probe deleted, swept).
  - Live: H9a cell (h) "surfaces a QueryError through a result `match` without an
    errored exit" under `config/vitest/vitest.live.config.ts`, run under the
    campaign live-lock → 1 passed (the changed fixture drives green).
- **Review:** 1 round — `bug-fix-reviewer`, CLEAN (no correctness/fidelity/spec/
  house-rule/test blockers; two non-blocking prose residuals filed, R1/R2 below).
- **Verification:** VERIFIED (`bug-fix-verifier`) — full suite green; parse witness
  green over the rewritten fixture; rewritten example parses (zero error
  diagnostics); lint + typecheck clean. Verifier did not run live per protocol;
  the orchestrator ran the H9a cell under the lock.
- **Residuals:**
  1. docs/spec_topics/diagnostics/code-registry-parse.md:40 — the
     `mixed-plus-operands` remedy column keeps the same misleading "interpolate
     inside a string" phrasing (a fourth site, advisory column only, no code or
     message drift). Outside the parent-enumerated three sites and the corpus
     sweep is explicitly rejected — residual-filing material, NOT fixed here.
  2. Bug-doc drift (this document, left as-filed): §Reproduction says the inert
     `"x ${1+1}"` yields a "9-byte literal" — measured 8 bytes
     (x, space, $, {, 1, +, 1, } = 8); §Related cites ":230" for the `+`-note,
     which sat at :232 at the fork (stale at filing, not moved by this diff). The
     bug doc is a dated record; the §Reproduction / §Related evidence is left
     as-filed and the drift is recorded here only.
- **Discharge notes appended:** none.
- **Pinned dispositions / non-goals:** the language-change alternative
  (interpolation in regular strings) is REJECTED — RFC territory (parent
  adjudication); no diagnostic added for `${` in a regular string (out of scope;
  the doc records no diagnostic exists — that stays true); no corpus sweep beyond
  the three enumerated sites.

