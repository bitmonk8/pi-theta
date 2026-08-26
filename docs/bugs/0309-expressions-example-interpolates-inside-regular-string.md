# Bug 0309 — expressions.md's own normative `match` example interpolates `${e.message}` inside a REGULAR string literal (`reason: "unrated: ${e.message}"`), which lexical.md pins as plain text ("No interpolation — the sequence `${` inside a regular string is plain text"), and the committed H9a acceptance fixture `acc-match-queryerror.theta` ships the same inert shape — so the corpus itself models an error-reporting idiom that silently emits the literal bytes `${e.message}`

- **Status:** open (candidate; found in bug-hunt at HEAD `bc52da38`, v0.287.0).
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
