# Bug 0412 — Every malformed `\u` escape FORM (`\u{00000041}` overlong, `\u{}`, braceless `\u1234`, unclosed `\u{41`) draws `theta/parse/invalid-unicode-escape` with the message "value is not a Unicode scalar value", though the registered Trigger requires "a recognised `\u{...}` escape whose value" is out of range — for `\u{00000041}` the value U+0041 IS a scalar value, and the unconsumed residue leaks into the token's decoded value (`"41}"`, `"1234"`)

- **Status:** open.
- **Sev/Diff estimate:** S3/D2 — every arm is a refused load, so the harm is a lying diagnostic (false predicate + wrong Hint) on a narrow input class; fix re-scopes emission in one lexer arm with a same-commit one-phrase registry Trigger widening and a GOV-15 stability note.
- **Kind:** defect (code fired outside its registered Trigger, message asserts
  a falsehood) for the overlong-digits case; spec gap for the braceless /
  empty / unclosed forms, which no registered code's Trigger covers.
- **Related:**
  - [0121](./0121-integer-like-wire-rename-escapes-order-guarantee.md)
    (fixed 0.245.0) — prior sighting, never filed: its §wire-name escape probe
    at `0121:419` printed the braceless arm's residue as incidental data
    (`E1 as \u0030 :: codes ["error theta/parse/invalid-unicode-escape"] ::
    fields [["b","0030"]]`) and glossed it "rejected for being the wrong
    escape form, not for their content".
  - [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md)
    (fixed 0.54.0) — class precedent: a code fired outside its registered
    Trigger; different code and mechanism.
  - 0250 / 0384 (fixed) — the message-content discipline family; different
    axis (those embed breaks, this asserts a false predicate).
- **Affected** (verified at c2c25d81, v0.398.0):
  - `src/lexer/lexer.ts:483-512` — the `\u` arm of the string-literal scan:
    `hex` consumption caps at 6 digits (`hex.length < 6`, `:490`), so a 7th
    digit leaves `text[i] !== "}"` and `wellFormed` stays false; `wellFormed`
    is also false for `\u{}` (`hex.length >= 1` fails), for braceless `\u1234`
    (`text[i] === "{"` fails), and for unclosed `\u{41` at line end. All four
    fall to `isScalar === false` and push
    `theta/parse/invalid-unicode-escape` with the registry's fixed message
    (`:504-511`). The unconsumed characters then re-enter the string loop as
    ordinary content (`value += ch`, `:525`).
  - `src/lexer/lexer.ts:491` — second face, same arm: the hex digits are
    consumed via `hex += advance()` with no `raw +=`, so EVERY `\u{...}`
    token's `text` loses its hex digits — well-formed escapes included:
    `"\u{41}"` lexes with `text` `"\u{}"`, the overlong `"\u{00000041}"`
    with `text` `"\u{41}"`. This contradicts the arm's own contract comment
    "`text` keeps the verbatim source slice" (`:436`) and corrupts any
    range/quote consumer of the token text.
- **Observed at:** 0.398.0 (c2c25d81), offline — `lexSrc` over the shipped
  `lexTheta` (`tests/helpers/e2e-s1.ts`).

## Summary

lexical.md recognises the escape form `\u{XXXX}` with "1–6 hex digits" and
assigns `theta/parse/invalid-unicode-escape` to "a recognised `\u{...}` form
whose value is out of range or names a surrogate"; the catch-all "a backslash
followed by any other character" is `theta/parse/illegal-escape`
(`lexical.md:26` §String literals). The registry row narrows the first code
identically: "A recognised `\u{...}` escape whose value exceeds `U+10FFFF` or
lies in the UTF-16 surrogate range" (`code-registry-parse.md:12`). Malformed
FORMS — where there is no in-form value to judge — sit between the two
Triggers: `illegal-escape`'s row reads "Backslash followed by an unrecognised
character", and `u` is a recognised escape head. The implementation folds all
of them onto `invalid-unicode-escape`, whose fixed message then asserts a
value predicate about a value that either does not exist (`\u{}`, `\u{41`,
`\u1234`) or is plainly a valid scalar (`\u{00000041}` = U+0041).

Second face, same arm: `hex += advance()` (`lexer.ts:491`) never appends the
consumed digits to `raw`, so every `\u{...}` token's `text` — including
well-formed, diagnostic-free escapes — drops the hex digits, against the
lexer's verbatim-source-slice contract (`:436`).

## Reproduction

`lexSrc` on each line (results verbatim):

| Source | Diagnostics | Token `value` |
|---|---|---|
| `let s = "\u{00000041}"` | `invalid-unicode-escape` — "value is not a Unicode scalar value" | `"41}"` |
| `let s = "\u{}"` | same | `""` |
| `let s = "\u1234"` | same | `"1234"` |
| `let s = "\u{41"` | same (the closing `"` then terminates the string normally — no second diagnostic) | `""` |

Second face (token `text`, no diagnostic): `"\u{41}"` lexes clean but with
`text` `"\u{}"`; `"\u{00000041}"` lexes with `text` `"\u{41}"` — the consumed
hex digits are absent from the verbatim slice in every case.

All four refuse the load (error severity), so the leaked residue in `value`
is inert today; it becomes live if any future consumer reads the token stream
of a refused document.

## Expected behaviour

- `lexical.md:26`: the `\u{XXXX}` form is "1–6 hex digits"; `invalid-unicode-escape`
  is for "a recognised `\u{...}` form whose value is out of range or names a
  surrogate"; other backslash sequences are `illegal-escape`.
- `code-registry-parse.md:12`: Trigger = "A recognised `\u{...}` escape whose
  value exceeds `U+10FFFF` or lies in the UTF-16 surrogate range" — none of
  the four inputs satisfies it.
- For `\u{00000041}` specifically, any conformant disposition must not state
  that U+0041 "is not a Unicode scalar value".

## Actual behaviour / root cause

One boolean (`wellFormed && in-range`) folds two distinct fault classes —
malformed form vs out-of-range value — onto the single registered
out-of-range code and its fixed message. The 6-digit cap silently stops
mid-form instead of consuming the full bracketed digit run, which both
mis-frames the diagnostic range and spills the residual digits into content.
Independently, the digit consumption bypasses `raw`, so the token `text`
contract is broken even on the conformant path.

Column-normativity adjudication: `diagnostic-shape.md:80` makes the *Trigger*
column "the canonical condition", so the emission SCOPE is the wrong
artefact here, not the row wording; and DIAG-4 (`diagnostic-shape.md:74`)
defers *Message* wording changes to theta 2.0, outside the GOV-15 carve-out.

## Why it matters

Diagnostics that lie (impact class 4): the author of `\u{00000041}` is told
their valid scalar is not a scalar; the registry's Hint ("Use a Unicode
scalar value: ≤ U+10FFFF …") sends them to fix the wrong thing (the value is
fine; the digit count is not). Narrow input class, always a refused load —
no silent corruption arm.

## Non-goals

- In-range/surrogate rejection (`\u{110000}`, `\u{D800}`) — conformant.
- The escape table's decode for well-formed inputs — conformant.
- Raw-newline / unterminated-string handling (probed conformant separately).

## Fix

Options:

1. Consume the whole bracketed digit run (no 6 cap) and split the verdict:
   `> 6` digits, zero digits, missing `{`, or missing `}` →
   `theta/parse/illegal-escape` with its registered `illegal escape sequence:
   \…` message (widen that row's Trigger wording from "unrecognised
   character" to "unrecognised or malformed escape"); keep
   `invalid-unicode-escape` exactly on its registered value trigger.
   Registry edit is one row's Trigger phrase. Recommended — and the only
   1.x-admissible route (see option 2).
2. Keep the code but add a second message arm for malformed forms ("malformed
   `\u{...}` escape: expected 1–6 hex digits …"). NOT 1.x-admissible:
   DIAG-4 (`diagnostic-shape.md:74`) makes *Message* wording changes
   spec-versioned breaking changes deferred to theta 2.0, outside the GOV-15
   carve-out; it also leaves the code firing outside its Trigger unless the
   Trigger is widened too.

Either option must stop the residue leak (consume through the closing `}`
when present on the line; otherwise stop at quote/newline boundary as the
other escape arms do) — and must fix the second face: append the consumed
hex digits to `raw`, restoring the verbatim-source-slice contract for
well-formed and malformed inputs alike.

## Provenance

- Hunt area: lexer-input-edges.
- Probe: throwaway `tests/scratch-uesc.test.ts` (deleted); outputs quoted in
  §Reproduction.
- Spec read: lexical.md §String literals; code-registry-parse.md rows 11-12.
