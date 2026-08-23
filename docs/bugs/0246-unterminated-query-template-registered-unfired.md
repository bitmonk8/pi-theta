# Bug 0246 — `theta/parse/unterminated-template` is registered (`code-registry-parse.md:80`, phase `lex`) with no emission site reachable from `parseDoc`: the sole push lives in `lexQueryTemplate` (`src/render/query-render.ts:258–264`), whose three callers read `.parts` and drop `.diagnostics`, and the lexer's template-prose region (`src/lexer/lexer.ts:358–392`) returns at EOF with no diagnostic — so an unterminated `` @` `` template loads with zero diagnostics, swallows every remaining statement in the body into a template it then mints as `template: ""`, and the swallowed statements' own diagnostics vanish with them

- **Status:** fixed (0.224.0).
- **Sev/Diff estimate:** S3/D2 — S3 because the primary consequence is a
  missing registered diagnostic on an input QRY-17
  (`docs/spec_topics/query/query-escapes-stringification.md:12`) names
  explicitly, and no *wrong value* is computed: the theta loads, the minted
  empty template hits QRY-6's runtime short-circuit, and the failure surfaces
  at run time as an `Err` rather than silently succeeding. The aggravating
  measurement that keeps it off S4 is the swallow: `let z = notdefined` after
  an unterminated template draws `theta/parse/unknown-identifier` in the closed
  control and **nothing** when the template above it is unterminated
  (§Reproduction (B)), so the silence is not confined to the one missing row.
  D2 because the owed site is a single lexer-side EOF branch with a
  ready-made sibling to copy (`theta/parse/unterminated-string`,
  `src/lexer/lexer.ts:522–542`), but the fix must also decide the *phase* the
  registry row already fixes as `lex`, must not route the existing
  `lexQueryTemplate` array (all three callers pass the interior slice, so
  `terminated` is `false` on every well-formed call — bug 0122 §Non-goals),
  and adds a newly-reachable code to a DIAG-2-gated corpus.
- **Kind:** defect — implementation. A registered row with an implemented,
  unit-tested emitter and no reachable production caller: the 0050 class.
  The registry fixes the row's phase as `lex`; the only lexer-side scan that
  can observe the condition (`inTemplateProse`, `src/lexer/lexer.ts:330`)
  falls out of its loop at EOF and returns `{ tokens, diagnostics }`
  (`:729`) without inspecting the flag.
- **Related:**
  - [0085](./0085-empty-template-warning-dead.md) — **fixed (0.210.0)**, the
    origin. Its §Fix record's residual 1 (`:410–415`) states this gap in the
    words "`theta/parse/unterminated-template` does not fire for an
    unterminated `` @` `` reached through `parseDoc` — `UNTERMINATED_TEMPLATE_CODE`
    has no emission site in `src/parser/` or `src/lexer/` on that path …
    unfiled, out of scope here". 0085 also owns the guard that makes the
    capture silent: `parseQuery` gates the QRY-6 warning on **both** tick
    tokens being present (`src/parser/theta-document.ts:5554`), so the `""`
    template an unterminated capture mints draws no `theta/parse/empty-template`
    either. That guard is correct for its own subject and is not what this
    report asks to change.
  - [0122](./0122-template-interpolation-diagnostics-discarded.md) — **fixed
    (0.149.0)**. Its §Non-goals (`:708–715`) fences this row and
    `theta/parse/illegal-template-escape` out explicitly and records the trap a
    fix must avoid: the three callers pass `e.template`, the slice *between*
    the backticks, so `lexQueryTemplate` never sees a closing backtick and
    `terminated` is `false` for every well-formed template. Forwarding the
    array wholesale would fire this code on every `@`-query in the corpus.
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **fixed (0.77.0)**, the class template: a registered parse code whose sole
    emitter has no `src/` caller.
  - [0151](./0151-unclosed-fn-parameter-list-accepted.md) — **fixed
    (0.163.0)**. Its registry sweep classifies this row as one of the corpus's
    two "EOF-during-scan lexical rows … over a literal" and declines it as
    coverage for an unclosed bracketed production. That reading is
    unchallenged here: this report claims the row for exactly the input its
    own *Trigger* names.
  - [0230](./0230-diag-2-closed-set-not-gated-corpus-wide.md) — **fixed
    (0.184.0)**, the DIAG-2 closed-set gate whose carve-out table this row is
    absent from (§Reproduction (D)).
- **Affected** (every citation verified at HEAD `b9cf2f26`, 0.219.0):
  - `src/render/query-render.ts:258–264` — **the only emission site in
    `src/`.** `if (!terminated)` pushes `{ severity: "error", code:
    UNTERMINATED_TEMPLATE_CODE, message: UNTERMINATED_TEMPLATE_MESSAGE }` into
    the local array `lexQueryTemplate` (`:157`) returns at `:266`. The code
    constant is `:76`, the registry-anchored message constant `:90`.
  - `src/parser/theta-document.ts:8446`,
    `src/parser/type-layer-checks.ts:3145`,
    `src/extension/production-theta-producer.ts:6211` — the three callers.
    Each reads `.parts` only; `.diagnostics` is read by no caller in `src/`.
  - `src/lexer/lexer.ts:330` (`inTemplateProse` declaration), `:358–392` (the
    template-prose region: a closing backtick clears the flag `:363`, `${`
    clears it `:387`, and "any other prose character … consume it with no
    token and no diagnostic" `:390–392`), `:719` (the flag is set on the
    opening backtick punct), `:729` (`return { tokens, diagnostics }`). The
    `while (i < n)` loop ends at EOF with `inTemplateProse` still `true` and
    nothing tests it.
  - `src/lexer/lexer.ts:522–542` — the sibling that does discharge the same
    shape: the string scan's `if (!closed)` branch splits EOF from a literal
    newline and pushes `theta/parse/unterminated-string`. This is the
    structure the owed site copies.
  - `src/parser/theta-document.ts:5525–5534` — `parseQuery`'s backtick walk:
    `openTick` is taken, then `while (!this.isPunct("\`") && !this.atEnd())`
    consumes tokens; `closeTick` stays `null` at EOF. `:5541–5547` — the
    `rawTemplate` recovery, which requires **both** ticks and otherwise falls
    back to `parts.join(" ")`; the prose region emits no interior tokens, so
    that fallback is `""`. `:5554–5560` — 0085's two-tick guard on the QRY-6
    warning. `:5567` — the minted node's `template: rawTemplate`.
  - `docs/spec_topics/query/query-escapes-stringification.md:12` — QRY-17:
    "EOF inside an unterminated template body surfaces as
    `theta/parse/unterminated-template`."
  - `docs/spec_topics/diagnostics/code-registry-parse.md:80` — the row. `E`,
    phase `lex`, *Trigger* "EOF reached while scanning a `@`...`` query
    template.", no *Hint*, *Message* `` unterminated @`...` query template ``.
    `docs/reference/diagnostics.md:126` — the mirror row (four columns, no
    *Trigger*), so no *Trigger* work is owed there.
  - `tests/query-render.test.ts:128–136` — the row's entire emission coverage:
    a unit cell calling `lexQueryTemplate("\`no closing backtick")`, i.e. a
    source that **includes** the opening backtick. No production caller passes
    that shape, so the cell is green against an input the product never
    constructs.
  - `tests/pre-evaluation-failures.test.ts:104–107` and `:216–218` — two
    router cells that pass the literal `"theta/parse/unterminated-template"`
    to `diagNote(...)` as a synthetic payload for the `lex-parse-type`
    pre-eval cause. Neither parses a theta. They are why the DIAG-2 arm counts
    the row as asserted (§Reproduction (D)).
  - `tools/closing-gate/index.js:701–710` — arm (3),
    `registry-code-no-asserting-test`, which fires only when no test text
    contains the code literal. `tests/registry-closed-set-corpus-gate.test.ts:124–148`
    — the `CARVE_OUT` table of registry rows with no asserting test; four
    entries, none of them this row.
  - `tools/closing-gate/live-corpus.js:51–59` — `CANARY_GAP_KINDS`, seven
    kinds, all REQ-ID / MUST-anchoring kinds; `registry-code-no-asserting-test`
    is not among them.

## Reproduction

At HEAD `b9cf2f26` (0.219.0). Every row is `parseDoc` over
`tests/helpers/e2e-s1.ts` with the frontmatter `---\nmode: prompt\n---`
prepended, reading `doc.diagnostics` and `doc.body`.

### (A) No emission site exists on the `parseDoc` path

```
rg -n 'unterminated-template|UNTERMINATED_TEMPLATE_CODE' src/
  src/render/query-render.ts:12    (module docstring)
  src/render/query-render.ts:75    (doc comment on the constant)
  src/render/query-render.ts:76    export const UNTERMINATED_TEMPLATE_CODE = …
  src/render/query-render.ts:89    (doc comment on the message constant)
  src/render/query-render.ts:139   (docstring)
  src/render/query-render.ts:154   (docstring)
  src/render/query-render.ts:261   the push
```

One push, inside `lexQueryTemplate`. `rg -n 'lexQueryTemplate' src/` returns
three call sites outside the defining file — `theta-document.ts:8446`,
`type-layer-checks.ts:3145`, `production-theta-producer.ts:6211` — and each is
a `for (const part of lexQueryTemplate(…).parts)` or a `.parts` loop over the
result. `src/lexer/` and `src/parser/` contain no occurrence of the string.

### (B) The input the registry *Trigger* names draws nothing

| Source (after the frontmatter) | `doc.diagnostics` | `doc.body.statements` |
| --- | --- | --- |
| `` let _ = @`abc `` (EOF) | `[]` | 1 (`let _`) |
| `` let _ = @`abc `` + `let y = 1` + `let z = y` | `[]` | 1 (`let _`) |
| `` let _ = @`abc ${x `` (EOF) | `[]` | 1 |
| `` let _ = @`a \q b `` (EOF) | `[]` | 1 |
| `` let _ = @`abc` `` **[closed control]** | `[]` | 1 |

The minted node for every unterminated row is
`{ kind: "query", schema: null, ascriptionWritten: false, template: "" }` —
an empty template, because `rawTemplate` falls back to the space-joined
interior tokens and the prose region emits none. The closed control mints
`template: "abc"`.

Direct call, for contrast — the emitter works when handed a source that starts
with the opening backtick:

```
lexQueryTemplate("`abc")
  → { parts: [{kind:"text",value:"abc"}],
      diagnostics: [{severity:"error",
                     code:"theta/parse/unterminated-template",
                     message:"unterminated @`...` query template"}],
      terminated: false }
```

### (C) The swallow takes the following statements and their diagnostics

| Source | `doc.diagnostics` | statements parsed |
| --- | --- | --- |
| `` let _ = @`abc `` ⏎ `let z = notdefined` | `[]` | 1 — `let _` only |
| `` let _ = @`abc` `` ⏎ `let z = notdefined` **[control]** | `theta/parse/unknown-identifier` | 2 |
| `fn f() {` ⏎ `` let _ = @`abc `` ⏎ `}` ⏎ `let q = notdefined` | `[]` | 1 — `fn f` only, `tail` `null` |
| `fn f() {` ⏎ `` let _ = @`abc` `` ⏎ `}` ⏎ `let q = notdefined` **[control]** | `theta/parse/unknown-identifier` | 2 — `fn f`, `let q` |

The lexer's prose region consumes the rest of the file verbatim, including the
`fn` body's closing `}`. The unbalanced brace draws no diagnostic either: the
`}` is never tokenised, so the parser's bracket accounting never sees an
imbalance.

### (D) The canary / DIAG-2 answer: the row is **not** enumerated

`CANARY_GAP_KINDS` (`tools/closing-gate/live-corpus.js:51–59`) is a set of
seven gap *kinds* — `unmapped-executable-req-id`,
`mapped-req-id-no-citing-test`, `per-facet-citing-test-missing`, the three
`un-anchored-must-*` kinds, and `un-rowed-page-residue`. It contains no
registry-code kind and therefore cannot enumerate this row. The registry-side
arm is `registry-code-no-asserting-test` (`tools/closing-gate/index.js:701–710`),
gated to an exact table in `tests/registry-closed-set-corpus-gate.test.ts:124–148`
(`CARVE_OUT`), whose four entries are `theta/load/cross-source-shadow`,
`theta/runtime/subagent-wire-parse-failed`,
`theta/runtime/subagent-envelope-parse-failed` and
`theta/runtime/subagent-envelope-schema-skew`. This row is absent from both.

It is absent because the arm's predicate is "no test text contains the code
literal", and three test files contain it: the unit cell of
`tests/query-render.test.ts:128–136` (which asserts a direct
`lexQueryTemplate` call, not an emission through `parseDoc`) and the two
router cells of `tests/pre-evaluation-failures.test.ts:104–107` / `:216–218`
(which pass the literal as a synthetic `diagNote` payload and parse no theta).
The gate is therefore not wrong about its own subject — it does not claim
emission reachability — but the row's coverage is textual only, and no
existing gate would notice if the emitter were deleted from `src/` entirely.

### (E) Ownership

`rg -l 'unterminated-template' docs/bugs/` returns three reports —
[0085](./0085-empty-template-warning-dead.md) (**fixed**, 0.210.0),
[0122](./0122-template-interpolation-diagnostics-discarded.md) (**fixed**,
0.149.0) and [0151](./0151-unclosed-fn-parameter-list-accepted.md)
(**fixed**, 0.163.0). No open report owns the row. 0085 recorded it as an
unfiled residual and 0122 fenced it into §Non-goals; this report is that
filing.

## Expected behaviour

An unterminated `` @` `` query template reaching `parseDoc` draws
`theta/parse/unterminated-template` — severity `E`, phase `lex`, message
`` unterminated @`...` query template `` — exactly as
`code-registry-parse.md:80` and QRY-17 state, or the row is retired from the
registry under DIAG-2 and QRY-17's sentence is struck. A registered row whose
*Trigger* describes a constructible input, and which that input does not draw,
is the state DIAG-2 (`docs/spec_topics/diagnostics/diagnostic-shape.md`)
closes off.

Both dispositions are open on the evidence; §Fix names the one taken.

## Actual behaviour / root cause

The condition is detected in the wrong module, by a function no production
path asks about it.

`lexQueryTemplate` is the query **render** seam's escape lexer. It takes a
source, tracks a local `terminated` flag, and pushes the diagnostic when the
flag is false at the end of the scan (`query-render.ts:258–264`). It is
correct in isolation and unit-tested (`tests/query-render.test.ts:128–136`).
Two facts make it unreachable as an emitter:

1. **All three callers read `.parts` and drop `.diagnostics`.** Nothing in
   `src/` reads the returned array.
2. **All three callers pass `e.template`, the slice between the backticks.**
   The scan never sees a closing backtick, so `terminated` is `false` for
   *every* call, including every well-formed template in the corpus. The
   signal carries no information at these call sites even if the array were
   read (bug 0122 §Non-goals, measured there and unchanged here).

The whole-file lexer, which the registry's `lex` phase points at, does observe
the condition and discards it. `lexTheta` sets `inTemplateProse` on the
opening backtick punct (`lexer.ts:719`) and, while set, consumes every
character with no token and no diagnostic (`:390–392`), clearing the flag only
on a closing backtick (`:363`) or `${` (`:387`). At EOF the `while (i < n)`
loop exits and `:729` returns with the flag still `true`. The sibling case —
an unterminated string literal — is discharged by an explicit `if (!closed)`
branch in the same function (`:522–542`); the template case has no
counterpart.

Downstream, the parser turns the miss into two further silences.
`parseQuery`'s backtick walk stops at `atEnd()` with `closeTick` `null`
(`theta-document.ts:5525–5534`); `rawTemplate` requires both ticks and
otherwise falls back to the space-joined interior tokens, of which the prose
region produced none, so the node is minted with `template: ""`
(`:5541–5547`, `:5567`). Bug 0085's guard then correctly declines to warn on
that `""` because the author never wrote a closed template (`:5554–5560`) —
which is why the *empty* template row does not fire in this position either.
And because the prose region ate the remainder of the file, every statement
after the opening backtick is absent from the AST along with any diagnostic it
would have drawn (§Reproduction (C)).

Net: one registered row unfired, one input class accepted at load, and an
arbitrary suffix of the body silently discarded.

## Why it matters

- **A registered `E` row cannot fire on a production path.** The corpus is a
  closed set under DIAG-2; a row with a constructible *Trigger* and no
  reachable emitter is either a missing emission or a stale row, and neither
  is the state the registry asserts.
- **The silence is not one diagnostic wide.** `let z = notdefined` after an
  unterminated template draws nothing where its closed control draws
  `theta/parse/unknown-identifier` (§Reproduction (C)). Every diagnostic owed
  by every swallowed statement is lost with it, and an unbalanced `fn` body
  brace goes unreported because the `}` is never tokenised.
- **The author's evidence is a run-time `Err`, not a load-time error.** The
  minted `template: ""` is the input QRY-6's runtime short-circuit refuses, so
  a typo one character wide surfaces per invocation as a validation failure
  rather than once at load, with no location and no code naming the tick.
- **Existing coverage would not notice a deletion.** The row's only emission
  cell drives `lexQueryTemplate` directly with a source shape no caller
  constructs, and the two other tests carrying the literal parse no theta. The
  DIAG-2 arm reads the literal and counts the row covered.

## Non-goals

- **`theta/parse/illegal-template-escape`.** The second row discarded at the
  same three call sites (`query-render.ts:207–211`), measured silent here too
  (`` let _ = @`a \q b `` → `[]`). Its *Trigger* is a backslash pair inside a
  body, not EOF, and its fix surface is the caller convention rather than an
  EOF branch. Recorded as adjacent evidence; a separate adjudication.
- **The `terminated`-is-always-false call convention.** Whether
  `lexQueryTemplate` should receive the delimited source or keep receiving the
  interior slice is bug 0122's recorded trap. A fix here must not forward the
  existing array, but re-shaping the caller contract is not required to
  discharge the row and is not claimed.
- **Bug 0085's two-tick guard.** `theta/parse/empty-template` staying silent
  on the `""` an unterminated capture mints is correct — the author wrote no
  closed template — and stays that way.
- **What a closed template renders.** Interpolation stringification and the
  QRY-6 runtime short-circuit are untouched.

## Fix

Emit the row from the whole-file lexer, where the registry already places it.

`lexTheta` (`src/lexer/lexer.ts`) exits its main loop at EOF with
`inTemplateProse` still `true` for exactly this input class. Push
`theta/parse/unterminated-template` there, mirroring the
`theta/parse/unterminated-string` branch at `:522–542`: severity `error`, the
registry *Message* verbatim, `file` set, and the range spanning the opening
backtick token to EOF (the opening backtick's position is recoverable at
`:713–719`, where the punct is pushed and the flag is set; the fix threads it
into a local alongside the flag). One push, one branch, no change to `lexQueryTemplate` and no change
to its three callers.

Constraints the fix carries:

1. **Do not route `lexQueryTemplate`'s array.** `terminated` is `false` on
   every call because the callers pass the interior slice, so forwarding it
   fires the code on every `@`-query in the corpus (bug 0122 §Non-goals,
   re-measured at HEAD: `lexQueryTemplate("abc")` → one
   `unterminated-template`, `terminated: false`).
2. **The interpolation case is in class.** `` @`abc ${x `` at EOF leaves
   `interpDepth` at 1 and `inTemplateProse` false, so the flag alone does not
   catch it. Either the EOF check reads both, or the report accepts that this
   sub-case draws a different (also currently absent) code; the choice is the
   fix's, and §Reproduction (B) row 3 pins the current observable as `[]`.
3. **Coverage must witness the emission through `parseDoc`, not through
   `lexQueryTemplate`.** The existing unit cell
   (`tests/query-render.test.ts:128–136`) stays as the render-seam unit
   witness; the new cells parse a document. Both §Reproduction (B) and (C)
   tables are the assertion source, including the controls.
4. **The swallow is repaired only as far as the diagnostic.** Recovering the
   statements after an unterminated template into the AST is a resynchronise
   decision this report does not settle; the diagnostic makes the loss
   reported rather than silent. If the fix leaves the suffix swallowed, §Fix
   records that as a stated residual with the §Reproduction (C) rows as its
   pinned observable.
5. **DIAG-2 bookkeeping.** The row is not in
   `tests/registry-closed-set-corpus-gate.test.ts`'s `CARVE_OUT` table
   (§Reproduction (D)) and must not be added: after the fix it is genuinely
   asserted. Confirm the closed-set gate stays green.

No report blocks this one. 0085, 0122, 0151, 0050 and 0230 are all fixed and
shipped. The fix edits `src/lexer/lexer.ts`, in which open bug
[0051](./0051-lowercase-named-type-reference-positions-silent.md) holds
citations; the addition is an EOF branch at the end of the main loop, so
0051's cited line ranges move only by the inserted block's length and must be
re-verified, not rewritten.

## Provenance

Found at the fix of [0085](./0085-empty-template-warning-dead.md) (0.210.0)
while pinning that fix's suppression rows: its §Fix record's residual 1
(`:410–415`) states the gap and adds that it was "measured while pinning this
fix's suppression rows (`S-7`/`S-8` therefore assert only the negative)".
Recorded there as unfiled and out of scope. Independently fenced by
[0122](./0122-template-interpolation-diagnostics-discarded.md) §Non-goals
(`:708–715`) at 0.149.0. Every measurement in this report was re-taken at HEAD
`b9cf2f26` (0.219.0) with a scratch `parseDoc` probe under `tests/`, removed
after the run; no line number is copied from either prior report.

## Fix (0.224.0)

- **What shipped:**
  - `src/lexer/lexer.ts` — `scanTokens` carries the opening backtick's position
    in a new `templateOpenStart: Pos | null` beside `inTemplateProse` /
    `interpDepth` (set on the opening-backtick punct arm, cleared on the
    genuine closing-backtick arm, deliberately not cleared on entering a
    `${…}` interpolation), and a new branch after the main `while (i < n)` loop
    pushes exactly one `theta/parse/unterminated-template` — severity `error`,
    `file` set, the registry *Message* verbatim, range spanning the opening
    backtick to EOF — when the loop exits with `inTemplateProse ||
    interpDepth > 0`. That is §Fix's one route, at the phase the registry row
    already fixes as `lex`, mirroring the `theta/parse/unterminated-string`
    sibling's `if (!closed)` shape. Touched spans: the declaration block, the
    prose closing-backtick arm, the opening-backtick arm, and the new EOF
    branch before `return { tokens, diagnostics }` — 37 inserted lines, all
    inside the template-prose / EOF region, none in `isNameSlot` or
    `contextualDiagnostics`.
  - §Fix constraint 1 — `src/render/query-render.ts` and its three callers are
    unmodified; the existing `.diagnostics` array is not routed.
  - §Fix constraint 2 — the interpolation sub-case is in class through the
    `interpDepth > 0` disjunct: `` @`abc ${x `` at EOF leaves the flag clear
    and the depth at 1, and the row's *Trigger* covers it with no rewording,
    so no spec edit is owed.
  - §Fix constraint 5 — the registry, `docs/reference/diagnostics.md` and
    QRY-17 are unedited, and the row is not added to the closed-set gate's
    `CARVE_OUT`: after the fix it is genuinely asserted by an emission witness
    rather than by three literal-carrying cells.
  - `tests/unterminated-template-lexer-emission.test.ts` — new, 18
    offline cells: `M-1` reads severity `E`, phase `lex` and the *Message*
    from the shipped registry through `registryMessage` (DIAG-4, never copied
    prose); `U-1`–`U-5` and `I-1`–`I-3` witness the emission through
    `parseDoc` (§Fix constraint 3), one occurrence each, `range.start` pinned
    at the opening backtick; `N-1`–`N-6` are the negative controls, `N-5`
    being the §Fix-constraint-1 trap (four well-formed `@`-queries drawing the
    row zero times, which the array-forwarding mis-fix reds); `R-1`–`R-3` pin
    the §Reproduction (C) residual.
  - `tests/live/unterminated-template-registration-live-cell.test.ts` — new H8a
    cell: the row reaches the author through the real `.pi/theta/` discovery
    walk and the composition root's load-diagnostic delivery, read off the
    settled in-memory `SessionManager`; the note names the offender file; an
    error-severity load diagnostic keeps the offender out of
    `registeredNames()`; the closed control draws the row zero times and
    drives for real.
- **Gates:**
  - Witness (neutralised): `if (false && (inTemplateProse || interpDepth > 0))`
    → `Tests 8 failed | 10 passed (18)`, the failing set exactly `U-1`–`U-5`
    and `I-1`–`I-3`. Restored byte-exact, `git hash-object src/lexer/lexer.ts`
    `44a8e5c15c7338fdfa0d8fa1aed5ea9fab2b30bd` before and after.
  - Witness (restored): `Test Files 1 passed (1)`, `Tests 18 passed (18)`.
  - Full default suite: `Test Files 409 passed (409)`,
    `Tests 8599 passed (8599)`, exit 0.
  - Typecheck: `tsc -p tsconfig.json --noEmit` — clean. Lint:
    `eslint --no-error-on-unmatched-pattern "src/**/*.ts"` — clean.
  - Live H8a: `✓ tests/live/unterminated-template-registration-live-cell.test.ts
    (1 test) 5611ms`.
  - Live H9a acceptance:
    `✓ tests/live/acceptance/noninteractive-acceptance.test.ts (10 tests)
    55972ms`, and `theta/parse/unterminated-template` appears nowhere in its
    captures — so the code is not reachable from an ordinary `pi -p` run and
    `tests/fixtures/h7a/permitted-codes.json` is unchanged.
- **Review:** 1 round. Round 1 (`bug-fix-reviewer`) returned one `prose`
  finding — a banned word in the new declaration comment — and cleared, with
  quoted evidence, all five §Fix constraints, the state machine's throw as
  unreachable from author input, the false-positive enumeration, DIAG-4
  compliance, range semantics and the live-suite conventions. The finding went
  to `bug-fix-fixer-light`; that round's diff is comment-only, so the polish
  was verified by gate-diff and the confirmation round skipped.
- **Verification:** VERIFIED. Obligation 1 — both directions proven by the
  targeted neutralisation above, restored byte-exact and hash-verified.
  Obligation 2 — the default suite green at 409/8599. Obligation 3 — the H8a
  cell passes for real, and the H9a acceptance run supplies the reachability
  evidence for leaving `permitted-codes.json` alone. Obligation 4 — typecheck
  and lint clean. Every lock re-run green and unmodified:
  `tests/query-render.test.ts` (including the render-seam unit cell §Fix
  constraint 3 preserves), 0085's 26-cell witness (its `S-7` / `S-8`
  unterminated cells filter for the empty-template code alone and so do not
  flip), 0122's witness, the closed-set corpus gate and its `CARVE_OUT`, the
  citation-symbol-form gate, the committed-fixture parse gate, the
  pre-evaluation-failures router cells, and both locked live surfaces.
- **Residuals:**
  1. **The swallow is not repaired** (§Fix constraint 4). The prose region
     still consumes the remainder of the file, so the statements after an
     unterminated template stay absent from the AST, their own diagnostics stay
     lost, and an unbalanced `fn` body brace stays unreported — only the loss
     is now reported. Pinned by `R-1`–`R-3`: one statement parsed, the tail
     absent, `template: ""`, and no `theta/parse/unknown-identifier` for the
     swallowed `let`. A resynchronise decision is owed elsewhere; a recovery
     change reds those cells.
  2. **Lex-phase diagnostics double-deliver on a theta that drops
     registration.** `lexTheta` calls `emitDiagnosticBatch` itself
     (`src/lexer/lexer.ts:128–132`) and the composition root re-delivers the
     same `document.diagnostics` through `parsed.dropped`
     (`src/extension/production-composition.ts:2417` → `:754`), so the
     `theta-system-note` channel carries two identical lines. Pre-existing,
     independent of this row (it applies to `theta/parse/unterminated-string`,
     `theta/parse/stray-backslash` and every other lex-phase row on a dropped
     theta), and out of §Fix's scope, which specifies the lexer-side push and
     not the delivery channel. Measured, not inferred: the live cell observed
     two identical notes for one push, and the push was confirmed single by
     instrumentation. Consequence for coverage: the live cell asserts the
     channel count as a lower bound, following
     `tests/live/params-default-unterminated-literal-live-cell.test.ts`, which
     asserts presence for the same reason; the exact-one discipline is held
     offline at `parseThetaDocument` level by `U-1`–`U-5` and `I-1`–`I-3`.
     Unfiled — a candidate report of its own.
  3. **`lexer.ts` line citations across the corpus are stale by the inserted
     block's length** and are deliberately left so. Nine files carry
     `lexer.ts:<N>` citations above the insertion points (`src/parser/params.ts`,
     `tests/fn-arg-type-mismatch-wired.test.ts`,
     `tests/fn-param-list-unclosed.test.ts`,
     `tests/fn-param-name-reserved-keyword.test.ts`,
     `tests/fn-param-not-identifier.test.ts`,
     `tests/live/fn-param-list-unclosed-live-cell.test.ts`,
     `tests/live/fn-param-not-identifier-live-cell.test.ts`,
     `tests/live/live-production-acceptance.test.ts`,
     `tests/pattern-field-literal-integer-narrowing-refusal.test.ts`). A
     mid-run correction of them was reverted byte-exact, hash-verified against
     `HEAD`, because a sibling lane is inserting into the same file's
     `contextualDiagnostics` / `isNameSlot` region: the combined offsets are
     computable only after both lanes merge. Offsets from this change alone:
     original `332`–`366` shift `+5`, `367`–`725` shift `+6`, `726`–`736`
     shift `+7`, and `≥737` shift `+37`. Open bug 0051's citations into this
     file are subject to the same re-derivation. This report also found the
     §Affected citation of the `return { tokens, diagnostics }` line one line
     stale at `f3be3b4c`: it is `:730`, not `:729`.
  4. **`theta/parse/illegal-template-escape` stays unreachable** (§Non-goals):
     the second row discarded at the same three call sites is untouched, and
     `` @`a \q b `` at EOF now draws only the EOF row.
  5. **The default suite carries a contention flake.**
     `tests/invoke-arg-type-mismatch-wired.test.ts` failed once with
     `Error: Hook timed out in 10000ms.` when the suite ran alongside a
     typecheck, and passes `40 passed (40)` in isolation and in every
     uncontended full run. Unrelated to this change.
- **Discharge notes appended:** none. 0085, 0122, 0151, 0050 and 0230 are all
  fixed and shipped, and none of their witnesses moved.
- **Pinned dispositions / non-goals:**
  - **An unterminated backtick with no `@` prefix draws this row.** The
    lexer's template model keys `inTemplateProse` off the bare backtick punct
    at `interpDepth === 0`, as the parser's own template walk keys off the
    first backtick token; the model predates this change, and the same input
    previously swallowed the remainder of the file in silence. Emitting where
    `inTemplateProse` survives to EOF is what §Fix prescribes, so the row
    covers that spelling too. Adjudicated in review round 1 and accepted.
  - **The `terminated`-is-always-false call convention is untouched**
    (§Non-goals, bug 0122's recorded trap): all three callers still pass the
    interior slice, and `N-5` plus the live cell's control both red if the
    array is ever forwarded.
  - **Bug 0085's two-tick guard is untouched** — `theta/parse/empty-template`
    stays silent on the `""` an unterminated capture mints, and its `S-7` /
    `S-8` cells still assert only the negative.
  - **`tests/fixtures/h7a/permitted-codes.json` is unchanged**, on the H9a run
    evidence above: no committed `.theta` or `.thetalib` carries an
    unterminated template (all 34 have even backtick counts), so the code is
    not reachable from an ordinary `pi -p` run and does not belong on the
    permitted list.
