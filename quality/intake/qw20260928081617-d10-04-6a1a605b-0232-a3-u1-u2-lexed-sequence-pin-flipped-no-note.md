---
id: pending
title: "Bug 0232's 0.188.0 fix record says rows A1–A8 \"keep their exact ordered code sequences, asserted per column in the witness\", with A3 U1/U2 as `literal-newline-in-string` alone, but 6a1a605b (bug 0245) re-pinned both A3 U1/U2 cells to lead with `schema-body-unclosed` and 0232 carries no note"
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0232-unterminated-literal-params-type-drops-inline-fields.md:564-565
  - docs/bugs/0232-unterminated-literal-params-type-drops-inline-fields.md:616-617
  - docs/bugs/0232-unterminated-literal-params-type-drops-inline-fields.md:189-197
  - tests/unterminated-literal-params-type-refusal.test.ts:275
  - tests/unterminated-literal-params-type-refusal.test.ts:320-339
  - docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md:560-564
sites: 2
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0232's 0.188.0 fix record says rows A1–A8 "keep their exact ordered code sequences, asserted per column in the witness", with A3 U1/U2 as `literal-newline-in-string` alone, but 6a1a605b (bug 0245) re-pinned both A3 U1/U2 cells to lead with `schema-body-unclosed` and 0232 carries no note

## Observation
Bug 0232's `## Fix (0.188.0)` discharges Constraint 3 with this sentence: "rows A1–A8 keep their exact ordered code sequences, asserted per column in the witness and green". Its pinned-dispositions line repeats "the eight lexed positions unmoved". §Reproduction (A) gives row A3 (`schema S { p: T }`) under the `U1`/`U2` column as the single line `error theta/parse/literal-newline-in-string`.

At HEAD, `tests/unterminated-literal-params-type-refusal.test.ts` post-processes exactly the cells "A3 U1 schema body field" and "A3 U2 schema body field" to expect `[UNCLOSED(), ...c.expected]`, which puts `theta/parse/schema-body-unclosed` first, ahead of the lexer line. Commit 6a1a605b (fix(bug-0245), v0.226.0) added that change. Bug 0245's record lists it as ratified under its authority, and its commit message says "one independent line each in … 0232's A3 U1/U2". Bug 0232's record has 0 mentions of 0245, and no commit after its fix has touched it. The witness no longer asserts the ordered sequence the record says it asserts for those two cells.

## Evidence
Claim side (re-read just before filing), `docs/bugs/0232-unterminated-literal-params-type-drops-inline-fields.md:564-565`:
```
  the same change. 3 — rows A1–A8 keep their exact ordered code sequences,
  asserted per column in the witness and green. 4 — the six locks green (169
```
`:616-617`:
```
- **Pinned dispositions / non-goals:** §Reproduction E2 admitted, unmoved; the
  raw-key law unmoved; the eight lexed positions unmoved;
```
`:189-197` (the sequences being pinned):
```
`U1` is `{a as "w\": integer}` (0229 residual 1's spelling); `U2` is
`{a as "w: integer}`; `CTL` is `{a as "w\"x": integer}`, the spelling 0229's fix
closed. `U1` and `U2` measure identically at every row.

| # | position | source | `U1` / `U2` diagnostics | `CTL` diagnostics |
|---|---|---|---|---|
| A1 | query annotation | `let r = @<T>` + `` `hi` `` | `error theta/parse/literal-newline-in-string` | `error theta/parse/renamed-inline-field-name` |
| A2 | `let` annotation | `let x: T = 1` | `error theta/parse/let-without-initialiser`, `error theta/parse/literal-newline-in-string` | `error theta/parse/renamed-inline-field-name` |
| A3 | `schema` body field | `schema S { p: T }` | `error theta/parse/literal-newline-in-string` | same one line |
```

Evidence side, the witness at HEAD, `tests/unterminated-literal-params-type-refusal.test.ts`:
- `:275`: `{ cell: \`A3 ${label} schema body field\`, src: body(\`schema S { p: ${type} }\`), expected: lexed },`
- `:326-337`:
```
  // A3 U1/U2 (`schema S { p: ${type} }`) spells only the INNER unterminated
  // literal's own escape trouble — the run-on string swallows the OUTER
  // schema body's own closing `}` too (visible in the field's retained
  // `typeSource`, src/parser/theta-document.ts), so the declaration reaches
  // EOF unclosed and bug 0245's row fires FIRST, ahead of the lexer's own
  // `literal-newline-in-string`. The A3 CTL row (a properly-escaped literal)
  // keeps its own `}` and is unmoved; this is a fault of U1/U2's OWN unescaped
  // spelling, not a widening of what this route touches.
  return cells.map((c) =>
    c.cell === "A3 U1 schema body field" || c.cell === "A3 U2 schema body field"
      ? { ...c, expected: [UNCLOSED(), ...c.expected] }
      : c,
```
At 0232's fix commit, `git show c4dd92c2:tests/unterminated-literal-params-type-refusal.test.ts | grep -n 'A3 \${label}\|label === "CTL" ? \[\] : lexed\|UNCLOSED'` shows A3 at `:331` with `expected: lexed` and no schema-body-unclosed post-processing. The only `UNCLOSED` hits are the `FN_PARAMS_UNCLOSED`/`FNUNCLOSED` A4 helper.

The authorising record, `docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md:560-564`:
```
  3. `tests/unterminated-literal-params-type-refusal.test.ts` — bug 0232 cell A,
     rows "A3 U1/U2 schema body field". This STRENGTHENS the cell's
     cross-position symmetry claim: the schema position now answers exactly as
     the already-green "A4 U1/U2 fn parameter" rows do with
     `theta/parse/fn-param-list-unclosed`.
```

Searches (all run in this session):
- `grep -c "0245" docs/bugs/0232-unterminated-literal-params-type-drops-inline-fields.md` → **0**.
- `git log --format="%h %s" -- docs/bugs/0232-unterminated-literal-params-type-drops-inline-fields.md` → c4dd92c2 (its fix) and 1848fb65 (filing) only.
- `git log --format="%h %s" -S "SCHEMA_BODY_UNCLOSED" -- tests/unterminated-literal-params-type-refusal.test.ts` → 6a1a605b only.
- Coverage matrix / AGENTS.md: `grep -c '0232' docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md AGENTS.md` → 0 / 0 / 0.
- CHANGELOG (corroboration): `grep -n "0232" CHANGELOG.md` → hits include :3453 (0232's own 0.188.0 entry). This check did not pursue it further, since the flip is visible directly in the witness and its commit.

## Why this is a problem
Constraint 3's discharge is a claim about the witness ("asserted per column in the witness"), and the §Reproduction table is the sequence it points at. For A3 U1/U2 the witness now asserts a two-line sequence that begins with a code the record never mentions. A reader who checks the record against its witness finds a mismatch, and nothing on 0232's side explains it. The re-pin was authorised and documented on bug 0245's side, but no discharge or correction note went back to 0232, so 0232's pin no longer resolves to what it states. The claim was true at c4dd92c2, so this is decay rather than an original overstatement.

## Suggested direction (non-binding, optional)
Append a dated note to 0232 at the Constraint 3 discharge (and/or the A3 row) recording that bug 0245 (0.226.0, 6a1a605b) prepends `theta/parse/schema-body-unclosed` to A3 U1/U2 and that the witness pins the new two-line sequence.

## False-positive check
- Representations covered: bug-doc witness lines (0232's Constraint-3 discharge and §Reproduction row, and 0245's re-pin list), test cell labels (`A3 U1/U2 schema body field` at HEAD and at c4dd92c2), history (`git log -S` over the witness, and the record's own log), coverage-matrix rows, AGENTS.md gate names, and CHANGELOG (corroboration only).
- The witness at HEAD and at c4dd92c2 was opened.
- Cluster key: flipping commit 6a1a605b. Its message also names cells in 0052's, 0227's and 0233's witnesses. Within this shard only 0233 is in scope, and its cited f3 statement ("that row therefore refuses after this fix", `docs/bugs/0233-*.md:736-740`) is still true with the added line, so 0233 is not affected. 0052 and 0227 are outside this shard.
- Separate root cause, filed separately: 0232's A7 CTL cell was re-pinned by a different commit (6184e7c3, bug 0233). The two commits differ, so these are two filings.
- Not already filed: `grep -l '6a1a605b' quality/intake/* quality/issues/*` → 0 files.

## Triage
verdict: questionable — decay verified: 0232:564-565/616-617 say the A1–A8 sequences are "asserted per column in the witness" and the lexed positions are "unmoved", and §Reproduction A3 U1/U2 is `literal-newline-in-string` alone (:195), but the witness positionRows() (tests/unterminated-literal-params-type-refusal.test.ts:320-339, describe "bug 0232 (A) — the ninth position answers as the eight lexed ones do") now prepends UNCLOSED()=schema-body-unclosed to exactly "A3 U1/U2 schema body field". That change came from 6a1a605b (the only `-S SCHEMA_BODY_UNCLOSED` hit; at c4dd92c2 A3 was plain `lexed`), and 0245:560-564 ratifies it. 0232 has 0 mentions of 0245 and no commits after c4dd92c2. The 6a1a605b hits in other intake files are incidental, not a same-sha cluster. There is nothing to re-point to, though: fixing it means adding a note or amending a claim that was true at 0.188.0, so the record's wording is a human's to change (triage: claude-opus-5-5)
