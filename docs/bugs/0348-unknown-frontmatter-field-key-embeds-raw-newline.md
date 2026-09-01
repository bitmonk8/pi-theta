# Bug 0348 — `theta/load/unknown-frontmatter-field` interpolates the unrecognised key into its message with no line-break transform, so a YAML double-quoted top-level key carrying an escaped `\n` (`"a\nb": 1`) and — since 0.332.0 (bug 0301 face (c)) — the analogous quoted sub-key inside `tool_loop:` / `respond_repair:` each render a `message` of two or more physical lines where `diagnostic-shape.md:34` says single-line summary, the carrier class bugs 0105 / 0250 / 0300 closed at their own rows, on a `<field>` row that was never in `placeholder-rendering-b.md:75`'s normalisation list

- **Status:** fixed (0.340.0).
- **Sev/Diff estimate:** S3/D1 — the same class letter bugs 0250 and 0300
  carry (wrong rendered shape on the diagnostics channel; an author-chosen key
  forges the serialised content format's reserved continuation / related-site
  / blank-line shapes), and the code, severity and forward-compat registration
  are all correct — only the message's physical shape is wrong, and the row is
  a tolerated warning that leaves the theta registered. Reads as S2 under the
  literal "wrong diagnostic text" clause; filed at the class's established S3
  because the diagnostic's meaning, code and severity are right and the blast
  radius is the diagnostics display alone. D1 because the fix is one file — the
  same `normaliseLiteralValueLineBreaks` wrap every sibling message in the file
  already carries, at two interpolation sites — plus one spec sentence.
- **Kind:** defect, with a spec omission underneath.
  `docs/spec_topics/diagnostics/diagnostic-shape.md:34` fixes `message` as a
  "single-line summary".
  `docs/spec_topics/diagnostics/placeholder-rendering-b.md:10` (the category-5
  `<field>` rule, which `theta/load/unknown-frontmatter-field` renders through
  per the registry row at `code-registry-load.md:15`) prescribes the key
  "identifier-shaped per [Lexical — Identifiers] … rendered unquoted", and its
  dotted nested-key extension "rendered verbatim" — neither clause states a
  line-break normalisation. `:75`'s normalisation sentence ("Before that
  rendering, the bound text of every `theta/load/*` row in this list passes a
  line-break normalisation, because `message` is a single-line summary")
  enumerates the `<value>` rows only, and `unknown-frontmatter-field` — a
  `<field>` row — is not among them. YAML admits a break-carrying key through
  the `\n` escape in a double-quoted key scalar, so the spec's own prescribed
  rendering and the implementation both defeat `:34`.
- **Related:**
  - [0105](./0105-malformed-tool-entry-message-embeds-raw-newline.md)
    — fixed (0.217.0). Established the class (raw U+000A in `message` forges
    the serialised content format's `  hint: <hint>` continuation line, the
    `  <file>:<line>:<col>: <message>` related-site line, and the blank-line
    batch separator) and wired the normalisation at the six `theta/load/*`
    `<value>` sites.
  - [0250](./0250-duplicate-enum-value-message-embeds-cooked-newline.md)
    — fixed (0.221.0). A second carrier of the class at a `<value>` row.
  - [0300](./0300-out-of-range-observed-string-embeds-raw-newline.md)
    — the immediate parent. Its §Fix (0.332.0 lane) named this row explicitly
    as a residual: "the `unknown-frontmatter-field` … emissions in
    `frontmatter.ts` interpolate an author-chosen YAML key without a line-break
    normalisation and sit outside `placeholder-rendering-b.md:75`'s list — the
    same 0105 class … Recommend filing." This report discharges that
    recommendation.
  - [0301](./0301-bind-echo-tool-loop-respond-repair-silent-default-holes.md)
    — fixed (0.332.0). Its face (c) added the dotted nested-sub-key form of
    `unknown-frontmatter-field` (`unknownSubKeyDiagnostics`), which created the
    second carrier of this hole probed below.
- **Affected** (verified at 1c55492e, v0.332.0):
  - `src/parser/frontmatter.ts:1401` — the top-level emission:
    `` message: `unknown frontmatter field '${key}'` `` where
    `key = String(item.key.value)` (`:1193`) is the YAML key scalar's cooked
    value — no break transform, no escape.
  - `src/parser/frontmatter.ts:712` — the dotted nested-sub-key emission inside
    `unknownSubKeyDiagnostics` (bug 0301 face (c)):
    `` message: `unknown frontmatter field '${dottedPrefix}.${sub}'` `` where
    `sub = String(it.key.value)` (`:704`) is the sub-key scalar's cooked value
    — same absence.
  - `src/parser/frontmatter.ts:21` — `normaliseLiteralValueLineBreaks` is
    imported and applied by every neighbouring author-text message
    (`malformed-frontmatter-yaml` `:456`, `respond_repair.methodology`
    value `:804`, `model:` value `:1467`, `mode:` `:1528`, `bind_context:`
    `:1553`, `bind_echo:` `:1570`); these two `unknown-frontmatter-field`
    sites and the `deferred-frontmatter-field` site (`:1392`) are the only
    author-key interpolations in the file that omit it.
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md:10`, `:75` — the
    `<field>` category-5 rule states no break handling, and the `:75`
    normalisation list (whose reason, "because `message` is a single-line
    summary", applies to every author-controlled `theta/load/*` message)
    omits this `<field>` row.
- **Observed at:** 0.332.0 (1c55492e). Offline, deterministic: scratch vitest
  over `parseThetaDocument` via `tests/helpers/e2e-s1.ts` `parseDoc` (run and
  deleted).

## Reproduction

Each row one file (`---` fences, `mode: ask`, body `let x = 1`), production
parse deps. The messages are shown JSON-escaped; the stored `message` contains
the RAW break.

| frontmatter | emitted `unknown-frontmatter-field` `message` |
|---|---|
| top-level `"a\nb": 1` (YAML `\n` escape) | `"unknown frontmatter field 'a\nb'"` — two physical lines |
| top-level `"a\n  hint: evil\nb": 1` | middle physical line is exactly `  hint: evil` — the serialised content format's reserved continuation shape |
| top-level `"a\n\nb": 1` | `message` contains a blank line — the batch-block separator |
| top-level `"a\rb": 1` | `"unknown frontmatter field 'a\rb'"` — bare U+000D carried through |
| `tool_loop:` over `  "a\nb": 1` (dotted, bug 0301 face (c)) | `"unknown frontmatter field 'tool_loop.a\nb'"` — two physical lines |
| `tool_loop:` over `  "x\n  hint: evil": 1` | last physical line is exactly `  hint: evil'` — forged continuation |

Control: an unquoted `bogus_field: 1` renders `unknown frontmatter field
'bogus_field'` on one physical line.

## Expected behaviour

- `diagnostic-shape.md:34`: `message` is a single-line summary. The serialised
  content format (`diagnostic-shape.md:63`, §Serialised content format)
  reserves the `\n  hint: <hint>` continuation, the `  <file>:<line>:<col>:
  <message>` related-site line, and the single-blank-line batch separator — the
  shapes rows 2, 3, 5 and 6 forge.
- `placeholder-rendering-b.md:75` states the class rule and its reason ("passes
  a line-break normalisation, because `message` is a single-line summary … and
  must not reproduce the serialised content format's `hint` / related-site /
  blank-line-block-separator shapes"); the reason applies to every
  `theta/load/*` message interpolating author-controlled text. The `<field>`
  key of `unknown-frontmatter-field` is author-controlled — YAML admits a
  break through a double-quoted key's `\n` escape — and fell outside the
  enumerated list only because that list was drawn over the `<value>` rows.
- Bugs 0105 §Fix and 0250 §Fix are the adjudicated dispositions for the
  identical shape at sibling rows: normalise at message construction.

## Actual behaviour / root cause

Both emission sites interpolate the cooked YAML key scalar (`String(item.key.value)`
at the top level, `String(it.key.value)` for the sub-key) directly into the
template, faithfully implementing `placeholder-rendering-b.md:10`'s `<field>`
rule — which prescribes no break handling because it was drafted over
identifier-shaped keys. A double-quoted YAML key carrying a `\n` escape cooks to
a break-bearing string that is not identifier-shaped, and the forward-compat
warning renders it verbatim across two or more physical lines. The
neighbouring frontmatter messages (`mode:`, `model:`, `bind_context:`,
`bind_echo:`, `respond_repair.methodology`, `malformed-frontmatter-yaml`) all
pass their author text through `normaliseLiteralValueLineBreaks`, so this row
is the sole author-key interpolation on this channel that the class fix never
reached — and the spec's own `<field>` rendering rule shares the omission.

## Why it matters

- The forged `  hint:` / related-site / blank-line shapes are the
  operator-deception vectors 0105 documented. A `.theta` file is
  author-controlled input; the diagnostics channel is the operator's trust
  surface for it. The warning leaves the theta registered, so the forged lines
  ship on a load that succeeds.
- Two carriers exist: the top-level key (all releases) and the dotted
  nested-sub-key form 0301 face (c) added in 0.332.0. A fix that misses either
  leaves the class open.
- The spec prescribes the malformed rendering, not just the implementation, so
  a conformance test written against `placeholder-rendering-b.md:10` would pin
  the break-carrying `<field>` as correct.

## Non-goals

- The forward-compat warning itself — correct, fail-open (the theta registers),
  and the registry *Trigger* (`code-registry-load.md:15`) accurately covers the
  input; only the rendered message shape is in scope.
- `theta/load/deferred-frontmatter-field` (`frontmatter.ts:1392`) — a third
  `<field>` interpolation with the same missing normalisation, but its key must
  be a member of `DEFERRED_FRONTMATTER_FIELDS` (`binder_temperature`,
  `bind_temperature`), both identifier-shaped, so no break-carrying key reaches
  it. The fix MAY normalise it for uniformity; it is not independently
  exploitable.
- The error-severity params-field-name interpolations (`frontmatter.ts:1053`
  `params-type-not-expression`, and the reserved-keyword / case-mismatch rows
  at `:1018` / `:1027`) — a different surface (a `params:` key, not a
  frontmatter key). Only `:1053` fires on a non-identifier name and so may
  carry a break; it is a separate candidate, not swept here.

## Fix

Route both `unknown-frontmatter-field` interpolations through
`normaliseLiteralValueLineBreaks` — the top-level `${key}` (`frontmatter.ts:1401`)
and the dotted `${dottedPrefix}.${sub}` (`:712`, normalising `sub`; the prefix
is a fixed literal) — converging this row with every sibling message in the
file. Normalisation (collapse), not `JSON.stringify` (escape), is the settled
remedy here: the `<field>` / `<key>` category-5 rules
(`placeholder-rendering-b.md:10`–`:11`) prescribe verbatim / bare-or-double-quoted
rendering, not JSON-escaping, and this row carries no byte-identical-assertion
carve-out — the escape path 0300 chose applied only because its `<observed>`
carve-out (`:98`) invites full-message equality and its settings twin already
escaped, neither of which holds for `<field>`. In the same commit, amend the
category-5 `<field>` rule (`placeholder-rendering-b.md:10`) to state that the
bound key passes the `theta/load/*` line-break normalisation `:75` pins — the
key is author-controlled and admits a break — and, if the `deferred-frontmatter-field`
site is normalised too, note that its `<field>` shares the rule. The
control `bogus_field` and every break-free key stay byte-identical.

## Fix (0.340.0)

- **Parent adjudication (verbatim, settled):** "Implement the doc's seeded
  §Fix: normalise line breaks in the unknown-frontmatter-field key
  interpolation at its message-mint site (BOTH carriers — the plain key and the
  0301 dotted-key variant flow through the same mint; verify singularity at
  premeasure, and if the dotted path mints separately, transform both), using
  the EXISTING corpus transform the doc seeds (re-derive its name/location;
  0300's fix record is the sibling precedent — read it). Add the spec sentence
  at the placeholder-rendering-b.md site the doc names, matching the surrounding
  except-clause style 0296/0297/0301 landed. Do NOT widen to other placeholders
  or other codes — the enumerated placeholder only (a corpus-wide sweep is hunt
  territory, not this fix). The warning's code, severity, still-registered
  semantics, and every other message byte stay identical."

- **What shipped:**
  - `src/parser/frontmatter.ts` — both `theta/load/unknown-frontmatter-field`
    message-mint sites now route their author-chosen YAML key through the
    existing `normaliseLiteralValueLineBreaks` transform (imported at `:21`,
    unchanged). The two carriers mint SEPARATELY, so both were transformed: the
    top-level emission (`:1406`) wraps `${key}`, and the dotted nested-sub-key
    emission inside `unknownSubKeyDiagnostics` (`:717`, bug 0301 face (c)) wraps
    only `${sub}` — the `${dottedPrefix}` is a fixed literal (`tool_loop` /
    `respond_repair`) that cannot carry a break. A break-carrying key
    (`"a\nb"`, a bare `\r`, a CRLF pair, a blank-line- or `hint:`-forging key)
    now collapses to a single-line summary; every break-free key is returned
    byte-identically (the transform's fast path), so the control `bogus_field`
    and the existing 0301 dotted cells stay byte-identical. COLLAPSE (not
    `JSON.stringify` / escape) is the settled remedy: the category-5 `<field>` /
    `<key>` rules render verbatim with no byte-identical carve-out, unlike bug
    0300's `<observed>` escape path. The `deferred-frontmatter-field` site
    (`:1397`, a different code with an identifier-shaped key set) was left
    byte-identical per the adjudication's no-widening bound.
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md:10` — the
    category-5 `<field>` bullet gained one integrated except-clause stating that
    on `theta/load/unknown-frontmatter-field` (both the top-level key and the
    dotted sub-key) the bound key first passes the `theta/load/*` line-break
    normalisation the *Parse-time literal-value* rule (`:75`) prescribes —
    because the key is author-controlled and a double-quoted YAML key's `\n`
    escape admits a break that `message` (a single-line summary) must not carry —
    with a `(bug 0348)` cite matching the 0296/0297/0301 except-clause style.
    The clause RECONCILES the pre-existing "rendered verbatim" sentence: the
    verbatim rendering now applies to the normalised key, which by construction
    carries no break. The `:75` rule is named by its heading ("the *Parse-time
    literal-value* rule below") rather than a bare `:75` line number, which
    keeps the bug-0134 citation-symbol-form gate green and is line-shift-proof
    (the heading phrase occurs exactly twice in the doc — the reference and the
    rule — so it is unambiguous).

- **Gates (verbatim):**
  - Witness `npx vitest run tests/b0348-unknown-frontmatter-field-key-single-line.test.ts`
    → `Test Files 1 passed (1) / Tests 11 passed (11)`.
  - Full default suite `npm test` → `Test Files 523 passed (523) / Tests 9901
    passed (9901)` (fork baseline 522 / 9890 + the new 11-cell witness file).
  - `npm run typecheck` → clean (no output).
  - `npm run lint` → clean (no output).
  - `tests/fixtures/h7a/permitted-codes.json` byte-unchanged
    (`a4a8da04209f90e13d815edd92c1fc682e2a2236` — no code added).

- **Review:** 1 round. Round 1 (`bug-fix-reviewer`) — CLEAN across all six
  categories (correctness / fidelity / spec / test / house-rule / prose), with
  quoted evidence of having read both hunks, `normaliseLiteralValueLineBreaks`
  in full, and the `:10` / `:75` spec rules. It corroborated scope completeness
  by surfacing a third mint site of the code (`theta-document.ts:2837`, the
  FN-7 with-clause) and verifying it non-exploitable — it binds the raw lexer
  slice `keyTok.text` (not a cooked value) and uses a different message
  template (`unknown 'with' session-config key '…'`), so no cooked break can
  reach it (parallel to `duplicate-discriminator-value`'s raw-slice exemption).
  No fixer round was needed.

- **Verification (`bug-fix-verifier`, SOLID):** witness reversibility — the two
  transform insertions reverted byte-exact (hash `f394433e…` identical
  before-revert / after-restore) reds exactly the 8 break-carrying cells (A /
  A-hint / A-blank / CR / CRLF / B / B-hint / H) with the raw-U+000A / U+000D
  symptom, controls stay green, and a partial revert proved BOTH sites are
  independently required (reverting only `:1406` leaves B / B-hint / H red on
  `:717`); restored → 11/11 green. Full suite 523 / 9901 green. Live obligation
  (orchestrator-owned; verifiers never run live) — discharged by reasoning: the
  change is message-SHAPE-only with the registration outcome unchanged (warning
  stays warning, theta still registers — cell D pins this offline) and the delta
  is fully offline-observable through `parseThetaDocument`; the premeasure
  census found ZERO live cells (`tests/live/**`) pinning this code's message
  bytes (grep confirmed zero hits), so no bespoke live cell is owed and no
  existing live cell exercises these bytes. Lint + typecheck clean.

- **Residuals:**
  1. `theta/load/unknown-frontmatter-field`'s third mint site
     (`src/parser/theta-document.ts:2837`, the FN-7 `with`-clause session-config
     key) is a distinct message template (`unknown 'with' session-config key
     '<key>'; expected one of …`) on a distinct surface that binds the raw
     lexer token slice `keyTok.text` rather than a cooked YAML value — a theta
     `\n` escape stays two characters in the raw slice and a literal newline
     aborts the string with `theta/parse/literal-newline-in-string`, so no raw
     break can reach it. Non-exploitable, out of 0348's enumerated scope, and
     left untouched (same raw-slice disposition as
     `placeholder-rendering-b.md:75`'s `duplicate-discriminator-value`
     exemption). Recorded, not filed.
  2. `theta/load/deferred-frontmatter-field` (`frontmatter.ts:1397`) and the
     `params:`-field error rows (`:1018` / `:1027` / `:1053`) remain the doc's
     Non-goals — a different code / a different surface, non-exploitable or
     out of scope; left byte-identical per the no-widening bound.

- **Discharge notes appended:** none.

- **Pinned dispositions / non-goals:** the forward-compat warning itself
  (correct, fail-open, registry *Trigger* accurate — unchanged); the
  `deferred-frontmatter-field` site (identifier-shaped key set, non-exploitable —
  left byte-identical); the `params:` error-severity interpolations (a different
  surface — not swept). Code, severity, and still-registered semantics of
  `unknown-frontmatter-field` are unchanged; only the rendered message shape moved.

## Provenance

This report discharges bug 0300 §Fix's named residual ("the
`unknown-frontmatter-field` … emissions … the same 0105 class … Recommend
filing"). Verified independently at 1c55492e by sweeping `parseFrontmatter`'s
thirteen `message:` interpolations for `normaliseLiteralValueLineBreaks`
coverage: two absences on this row (top-level `:1401`, dotted `:712`), one
non-exploitable absence (`deferred-frontmatter-field` `:1392`, fixed key set),
one adjacent error-severity params candidate (`:1053`), and the remaining nine
either normalised or rendering a bounded kind token. Probed with a scratch
vitest over `parseDoc` (six break rows above plus a control; run and deleted).
Spec read: `diagnostic-shape.md:34` + §Serialised content format (`:63`);
`placeholder-rendering-b.md:10`, `:11`, `:75`; `code-registry-load.md:15`.
Prior-bug sweep: 0105 (class + six-site scope), 0250 and 0300 (the two carriers
closed at their own rows), 0301 (the origin of the dotted variant).
