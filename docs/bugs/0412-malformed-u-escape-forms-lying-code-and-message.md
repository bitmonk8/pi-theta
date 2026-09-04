# Bug 0412 — Every malformed `\u` escape FORM (`\u{00000041}` overlong, `\u{}`, braceless `\u1234`, unclosed `\u{41`) draws `theta/parse/invalid-unicode-escape` with the message "value is not a Unicode scalar value", though the registered Trigger requires "a recognised `\u{...}` escape whose value" is out of range — for `\u{00000041}` the value U+0041 IS a scalar value, and the unconsumed residue leaks into the token's decoded value (`"41}"`, `"1234"`)

- **Status:** fixed (0.412.0).
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

## Fix (0.412.0)

- What shipped:
  - `src/lexer/lexer.ts` (the `\u` escape arm of the string-literal scan) —
    implement option 1 (the only 1.x-admissible route): consume the whole
    braced/braceless hex run (removed the 6-digit cap) into BOTH `hex` and
    `raw`; `wellFormed = braced && braceClosed && hex.length >= 1 && hex.length <= 6`;
    three-way verdict — well-formed+in-range decodes; well-formed but
    out-of-range/surrogate draws `theta/parse/invalid-unicode-escape` (its
    EXISTING message, unchanged, kept exactly on its registered value trigger);
    every MALFORMED FORM (missing `{`, empty `{}`, > 6 digits, or missing `}`)
    draws `theta/parse/illegal-escape` with the EXISTING registered message
    template rendered for `u` (`illegal escape sequence: \u`), range
    `{start: escStart, end: pos()}`. This also fixes the second face: appending
    the consumed hex digits to `raw` restores the verbatim-source-slice contract
    (token `text`) for well-formed and malformed inputs alike, and stops the
    residue leak into `value`.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` (same commit, DIAG-2) —
    widened the `theta/parse/illegal-escape` row's Trigger from "unrecognised
    character" to "unrecognised or malformed escape" (that one cell only). No
    Message/Severity/Phase/Hint change; the `invalid-unicode-escape` and
    `illegal-template-escape` rows are byte-untouched. DIAG-4 respected — the
    illegal-escape message is the pre-existing `illegal escape sequence: \<char>`
    template with `<char>` = `u`; no new wording.
- Gates:
  - Witness `tests/b0412-malformed-u-escape.test.ts`: RED at fork (forms 1-4 drew
    `invalid-unicode-escape`; residue "41}"/"1234" in `value`; second-face token
    `text` was `"\u{}"`); GREEN after fix (10 passed); controls (`\u{110000}`,
    `\u{D800}` keep `invalid-unicode-escape`; `\u{41}` decodes "A") green both
    directions. Revert-witness: byte-exact restore (`git hash-object` matched),
    RED<->GREEN reversible.
  - Full default suite: 573 files / 10448 tests green; `committed-fixture-parse-gate`
    green (discharges the no-shipped-source-moves claim).
  - `npx tsc -p tsconfig.json --noEmit`: clean. `npm run lint`: clean.
- Review: 2 rounds. Round 1 `bug-fix-reviewer` — CLEAN on correctness/fidelity/spec;
  governance verdict DIAG-2/DIAG-4/GOV-15 all SATISFIED; three non-blocking
  residuals (R1 shadowed inner `closed`, R2 `\u{GG}` non-hex-interior residue,
  R3 pre-widening "unrecognised" prose). Round-1 fixer (`bug-fix-fixer`) resolved
  R1 (rename inner flag -> `braceClosed`, 3 sites) and the R3 lexer-comment
  alignment (lexical.md left untouched — out of the settled §Fix scope). Round 2
  `bug-fix-reviewer-fast` — CLEAN, confirmed the rename+comment carried no logic
  change. No correctness/fidelity/spec findings in either round.
- Verification: `bug-fix-verifier` — obligations 1/2/4 solidly met (witness
  reverses byte-exact RED->GREEN; full suite + committed-fixture-parse-gate green;
  tsc+lint clean). Obligation 3 (live): the malformed-`\u` class is a refused load
  whose registration outcome is UNCHANGED (refused before and after — only the
  diagnostic code re-scopes), so no new live cell is owed; ran ONE adjacent
  existing load-refusal cell,
  `tests/live/acceptance/escaped-quote-inline-rename-load-refusal.test.ts` (a
  string-escape parse-refusal through the real `pi -p` with a registering
  escape-free neighbour — the same real-host refusal channel), GREEN under the
  global live lock (5.5s).
- Residuals:
  1. **Bug 0121 example-table staleness (era-pinned; FOR THE PARENT).** Braceless
     `\u0030` now draws `theta/parse/illegal-escape` (one of the malformed FORMS
     §Fix routes there), whereas the CLOSED bug
     `0121-integer-like-wire-rename-escapes-order-guarantee.md`'s §example table
     (row `E1 as \u0030`) records the pre-0412 `invalid-unicode-escape`. This is
     the correct, settled behaviour and flips NO test (the full suite is green;
     `tests/ctor-declaration-order.test.ts`'s bug-0121 row exercises only braced
     `\u{30}`). Per the era-pinning standing adjudication a closed bug doc's body
     is history and is NOT rewritten here; a dated note would need parent
     ratification. Flagged for the parent to disposition.
  2. `\u{GG}` (non-hex braced interior) correctly draws `illegal-escape` but leaves
     an inert "GG}" residue in `value` (load refused, so inert). Not in
     §Reproduction's four filed forms; scanning arbitrarily far to a later `}`
     would be worse. Follow-up material, not a blocker; no witness added (out of
     the settled §Fix scope).
- Discharge notes appended: none (bug 0121 note deferred to parent per residual 1).
- Pinned dispositions / non-goals: GOV-15 standing — all four malformed `\u`
  inputs emit error-severity diagnostics under BOTH theta 1.0.0 and the fix (they
  never load cleanly), so they sit OUTSIDE GOV-15's loads-cleanly equivalence input
  set; the DIAG-2 Trigger widening is a carve-out-covered, 1.x-admissible
  re-scoping (in-scope as a removal from `invalid-unicode-escape` and an addition
  to `illegal-escape`), reusing an existing registered code rather than minting
  (0326 anti-fork / 0393 precedent). No cleanly-loading input changes its observed
  code (controls prove the value-trigger inputs unchanged). permitted-codes fixture
  NOT touched (holds no parse codes). Option 2 (new message arm) correctly NOT
  taken (DIAG-4). Non-goals (in-range/surrogate rejection, well-formed decode,
  unterminated-string handling) untouched.
