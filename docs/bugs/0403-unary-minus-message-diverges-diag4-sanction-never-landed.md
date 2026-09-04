# Bug 0403 — The unary-`-` parse refusal emits `unary '-' requires a numeric operand; got <type>` under a code whose normative *Message* column pins `'<op>' requires two numeric operands; got <left> and <right>`, violating DIAG-4's character-for-character rule — and the Trigger-column documentation bug 0392's pinned disposition claims sanctions the divergence never landed in the registry

- **Status:** fixed (0.413.0).
- **Kind:** defect — a shipped diagnostic message diverges from the DIAG-4
  normative *Message* template (the bug-0261 class), plus a fix-record
  fidelity gap: 0392's §Pinned dispositions states the divergence is
  "documented in the Trigger column", and no commit ever wrote it there.
- **Sev/Diff estimate:** S4/D2 — S4: a diagnostic whose rendered bytes no
  registry cell predicts (diagnostics that lie against their own registry;
  a DIAG-4-conformant test oracle sourcing the *Message* column cannot
  witness the unary emission without going red against shipped bytes —
  0261's exact hazard). D2: the honest fixes all have friction — the
  registry-extraction tooling (`registryMessage` spans first-to-last
  backtick) rejects a second backticked template in the *Message* cell, so
  the fix is a Trigger-column template note (delivering 0392's own stated
  compensation), a tooling change, or a separate row.
- **Related:**
  - 0392 (fixed 0.387.0) — the parent fix; its review finding F1 raised this
    divergence, and the §Pinned dispositions adjudicated it as "a sanctioned
    divergence documented in the Trigger column". The adjudication's
    compensating documentation is absent at pin (see below), so the shipped
    state fails the adjudication's own terms.
  - 0261 (fixed 0.249.0) — precedent: a message prefix diverging from its
    registry *Message* template, filed and fixed as a DIAG-4 violation.
  - 0142 / 0152 — the `registryMessage`-sourcing test family that constrains
    the *Message* cell to a single backticked template.
- **Affected** (verified at `c2c25d81`, v0.398.0):
  - `src/parser/type-layer-checks.ts:3906` — the unary emission:
    `` message: `unary '-' requires a numeric operand; got ${displayType(rightType)}` ``.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:43` — the
    `theta/parse/non-numeric-arithmetic-operands` row. Trigger: "also fires
    on unary `-`'s single operand … (bug 0392)" — the firing is documented,
    the divergent template is NOT. *Message*:
    `'<op>' requires two numeric operands; got <left> and <right>`.
  - `docs/reference/diagnostics.md:91` — the reference-page mirror of the
    same row, carrying only the two-operand template
    `'<op>' requires two numeric operands; got <left> and <right>` — a
    second normative surface mispredicting the unary bytes.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:74` — DIAG-4: "The
    *Message* column is normative. … renderers MUST emit it
    character-for-character with placeholders interpolated. Tests asserting
    a diagnostic's rendered message MUST source the string from this
    column…".
- **Observed at:** v0.398.0 (`c2c25d81`), offline — `parseThetaDocument`
  over `let s = "5"` / `let y = -s`; plus
  `git log --all -S "unary '-' requires a numeric operand" --
  docs/spec_topics/diagnostics/code-registry-parse.md` → empty (the template
  was never in the registry file in any commit).

## Summary

Bug 0392 gave unary `-` a parse gate that REUSES
`theta/parse/non-numeric-arithmetic-operands` (0326 anti-fork: no new
registry row). The reused row's *Message* column carries only the binary
two-operand template. The unary emission renders a different sentence with a
different placeholder set (`<type>` vs `<left> and <right>`). DIAG-4 makes
the *Message* column normative character-for-character with no
divergence-escape mechanism; the 0392 adjudication's chosen escape —
recording the unary template in the Trigger column — was stated in the fix
record but never performed: the Trigger cell at pin names the unary firing
and cites "(bug 0392)" without carrying any message template, and a
whole-history `git -S` for the unary template over the registry file matches
nothing. The only place the unary template exists is `type-layer-checks.ts`
and the 0392 bug doc — neither is a normative registry surface.

## Reproduction

```theta
let s = "5"
let y = -s
```

Parse (offline, `parseThetaDocument`): one error-severity diagnostic, code
`theta/parse/non-numeric-arithmetic-operands`, message observed verbatim:

```
unary '-' requires a numeric operand; got string
```

Registry *Message* for that code (code-registry-parse.md:43):

```
'<op>' requires two numeric operands; got <left> and <right>
```

No interpolation of the registered template yields the observed bytes (the
registered template contains `two numeric operands` and two operand
placeholders; the emission contains neither).

Documentation absence: `grep -rn "unary '-' requires" docs/spec_topics/` →
no match; `git log --all -S "unary '-' requires a numeric operand" --
docs/spec_topics/diagnostics/code-registry-parse.md` → no commit.

## Expected behaviour

DIAG-4 (`diagnostic-shape.md:74`): every row's *Message* is the rendered
author-facing string, emitted character-for-character with placeholders
interpolated; message-asserting tests MUST source it from the column.
Either the unary emission renders an interpolation of the registered
template, or the registry documents the unary template on a normative
surface (which DIAG-4 as written does not currently allow for a second
template in the *Message* cell — that conflict is the substance of this
report). At minimum, the state 0392's adjudication itself pinned — the
divergence "documented in the Trigger column" — must exist.

## Actual behaviour / root cause

`checkUnaryArithmeticOperand` (`type-layer-checks.ts:3906`) formats its own
sentence. The 0392 review flagged it (F1); the adjudication kept the
*Message* cell single-template because `registryMessage` / `extractMessage`
(`tools/code-registry/index.js`) extract the span between the first and last
backtick of the cell, so adding a second backticked template corrupts the
extraction and reds 13 bug-0142/0152 tests. The compensating Trigger-column
note was recorded in the fix record's prose only. Net: a normative-surface
violation (DIAG-4) with no normative-surface sanction, held in place by a
tooling limitation.

## Why it matters

- A DIAG-4-conformant oracle (`messagePrefixOf` / `registryMessage`-sourced
  assertion, the house pattern) is structurally unable to witness the unary
  emission — the same test-infrastructure hazard 0261 was filed for.
- Authors and tooling reading the registry (the documented purpose of the
  *Message* column) predict wrong bytes for every unary refusal.
- The 0392 record's pinned disposition misstates the shipped documentation
  state, so future fixers auditing "is this divergence sanctioned?" are
  pointed at a Trigger cell that does not contain the sanction.

## Non-goals

- The unary gate's existence, code reuse, or firing conditions (0392-settled,
  correct).
- The runtime belts (`UnaryNonNumericError`) and their messages — not
  registry-templated surfaces.
- Rewording the binary template (spec-versioned breaking change per DIAG-4).

## Fix

Options:
1. Deliver 0392's own compensation: add the unary template to the Trigger
   column as prose-with-inline-code (e.g. "…renders
   `unary '-' requires a numeric operand; got <type>` at that position"),
   placed so `registryMessage`'s first-to-last-backtick extraction over the
   *Message* CELL is unaffected. The extraction IS cell-scoped:
   `extractMessage` (`tools/code-registry/index.js:74-79`) takes a single
   `cell` argument and is applied only to the row's last cell
   (`index.js:50`), so a backticked template in the Trigger cell cannot
   corrupt Message extraction or red the 0142/0152 tests. Amend DIAG-4 with
   one sentence
   admitting a Trigger-documented position-specific template (GOV-governed
   additive clause).
2. Make the emission conform: render
   `'-' requires two numeric operands; got <left> and <right>` with a
   synthesized left — rejected by 0392's own reasoning (the 0367 marker
   discipline forbids judging/naming the synthetic null left; the message
   would lie about arity).
3. Mint a dedicated `theta/parse/non-numeric-unary-operand` row — clean
   DIAG-4 state but forks the concept 0392's anti-fork adjudication
   deliberately kept unified.

Recommendation: option 1 — it is what the 0392 adjudication already
promised, and it repairs both the normative gap and the record/reality
mismatch without disturbing the anti-fork settlement. Any fix must keep the
13 `registryMessage`-sourcing tests green.

## Provenance

fix-residuals-4 sweep over bugs 0386–0401: 0392 §Pinned dispositions claims
verified against the shipped registry at `c2c25d81`. Probe D1
(`tests/scratch-fr4-residuals.test.ts`, deleted) captured the emitted
message; `git -S` established the template never existed in the registry
file. Dup check: README index — 0261 is the fixed sibling (different row);
no open report covers this row's message divergence; 0392 read in full.

## Fix (0.413.0)

- What shipped: option 1 (the doc-recommended fix), docs-only. `docs/spec_topics/diagnostics/code-registry-parse.md` — the `theta/parse/non-numeric-arithmetic-operands` row's *Trigger* cell now documents the shipped position-specific unary template `unary '-' requires a numeric operand; got <type>` as prose-with-inline-code, cross-referenced to DIAG-4 (the *Message* cell is byte-unchanged). `docs/spec_topics/diagnostics/diagnostic-shape.md` — DIAG-4 gains one additive sentence admitting a *Trigger*-column-documented position-specific template for a code reused across emission positions, without relaxing the *Message* column's character-for-character normativity. Delivers 0392's own pinned compensation, which had never landed in the registry.
- Gates: witness `tests/b0403-unary-minus-message-registry-divergence.test.ts` 5/5 (RED at fork on cells A/B, green after); full default suite 571 files / 10436 tests green (baseline 570/10431 + the new witness's 5 tests; all per-run reds were parallel-interference, green on isolated re-run); `npm run typecheck` clean; `npm run lint` clean.
- Review: 2 rounds. Round 1 (bug-fix-reviewer) — 1 blocking spec finding F1 (DIAG-4 mis-attributed an "anti-fork discipline" to GOV-15; it is the 0326 anti-fork law) + prose R1 (*Message* column→cell) + test R2 (tighten cell A to bind `<type>`); all resolved by a bug-fix-fixer round. Round 2 (bug-fix-reviewer-fast) — 1 consistency finding (the sibling Trigger clause still said *Message* column) resolved by a bug-fix-fixer-light round; that hunk was doc-prose only with green gate-diff, so per the post-polish rule the confirmation review round was skipped (polish verified by gate-diff).
- Verification: bug-fix-verifier verdict SOLID. Revert-witness — removing the Trigger clause reds cell A, removing the DIAG-4 sentence reds cell B, both restore to 5/5 byte-exact (numstat 1/1 per file, 0 EOL churn). Full suite green (4 load-noise flakes green isolated). Typecheck + lint clean. Live: the orchestrator ran the adjacent registration-only live cell `tests/live/b0367live-null-left-minus-refusal-live-cell.test.ts` green (WHY: docs-only, emission byte-unchanged, no drive/registration outcome changes; the cell witnesses the `theta/parse/non-numeric-arithmetic-operands` refusal path is unaffected).
- Residuals: 1. `docs/reference/diagnostics.md` still carries only the binary *Message* template for this row and no *Trigger* column, so it remains a second surface that under-predicts the unary bytes; the reference mirror transcribes only Code/Sev/Phase/Message verbatim by design, so there is no *Trigger*-column home for the note there — §Fix option 1 deliberately scopes the normative repair to the spec-topic Trigger cell + DIAG-4 and does not target the reference mirror.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: honoured 0392 (the unary gate, code reuse, firing conditions, and the belt messages are untouched), the 0326 anti-fork settlement (no new registry row), and DIAG-4's *Message*-column normativity (the binary template and the 13 registryMessage-sourcing 0142/0152 tests stay green). The reference-mirror residual above is the only surface left unaddressed.
