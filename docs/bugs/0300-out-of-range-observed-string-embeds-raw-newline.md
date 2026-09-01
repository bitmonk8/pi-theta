# Bug 0300 — `theta/load/frontmatter-value-out-of-range` interpolates a string-valued `<observed>` with no line-break transform, so a `tool_loop.max_rounds` / `respond_repair.attempts` block scalar or `\n`-escaped string renders a `message` of two or more physical lines where `diagnostic-shape.md:34` says single-line summary — the carrier class bugs 0105 and 0250 closed at the `<value>` rows, left open on the `<observed>` carve-out, whose settings-side twin already escapes via `JSON.stringify`

- **Status:** fixed (0.334.0).
- **Sev/Diff estimate:** S3/D1 — same severity letter as bug 0250 (wrong
  rendered shape on the diagnostics channel; an author-chosen value forges
  the serialised content format's reserved continuation shapes), and the
  refusal itself is correct and fail-closed — only the message's shape is
  wrong. D1 because the sibling implementation
  (`src/discovery/settings.ts:121–139`) already ships the single-line-safe
  rendering and the fix is one arm of one function, plus the spec sentence
  reconciling `placeholder-rendering-b.md:97` with the single-line rule.
- **Kind:** defect, with a spec self-contradiction underneath.
  `docs/spec_topics/diagnostics/diagnostic-shape.md:34` fixes `message` as a
  "single-line summary".
  `docs/spec_topics/diagnostics/placeholder-rendering-b.md:97` (the
  "`<observed>` on the parsed-scalar out-of-range codes" carve-out)
  prescribes a string per category 5's `<key>` rule — "double-quoted",
  byte-identical, with NO line-break normalisation — and `:74`'s
  normalisation sentence ("Before that rendering, the bound text of every
  `theta/load/*` row in this list passes a line-break normalisation, because
  `message` is a single-line summary") enumerates its eight rows explicitly
  and `frontmatter-value-out-of-range` is not among them. For a string value
  carrying U+000A the two spec sentences cannot both hold; the
  implementation follows `:97` and violates `:34`.
- **Related:**
  - [0105](./0105-malformed-tool-entry-message-embeds-raw-newline.md)
    — fixed (0.217.0). Established the class (raw U+000A in `message`
    forges the serialised content format's `  hint: <hint>` continuation
    line, the `  <file>:<line>:<col>: <message>` related-site line, and the
    blank-line batch separator) and wired the normalisation at the six
    `theta/load/*` `<value>` sites.
  - [0250](./0250-duplicate-enum-value-message-embeds-cooked-newline.md)
    — fixed (0.221.0). Titled itself "the one carrier of bug 0105's defect
    class left unwired"; this report is a second carrier outside both
    scopes — the `<observed>` carve-out was never in the `<value>` list
    either fix swept.
- **Affected** (verified at bc52da38, v0.287.0):
  - `src/parser/frontmatter.ts:586–589` — `renderObserved`: the string arm (`:588`)
    returns `` `"${value}"` `` verbatim — no break transform, no escape.
  - `src/parser/frontmatter.ts:628–639` — the emission:
    `` message: `frontmatter field '${dottedKey}' must be a non-negative
    integer; got ${renderObserved(raw)}` `` — the only diagnostic message in
    the file interpolating author text without
    `normaliseLiteralValueLineBreaks` (every neighbour — model-unresolved
    `:1276`, unknown-mode-value `:1323`, unknown-bind-context-value `:1339`,
    unknown-methodology-value `:682`, malformed-frontmatter-yaml `:433` —
    passes it).
  - `src/discovery/settings.ts:121–139` — the settings-side twin
    (`theta/load/settings-value-out-of-range`) renders its string arm via
    `JSON.stringify(value)` (`:132–135`), which escapes U+000A to the
    two-character `\n` — single-line-safe, and diverging from the
    frontmatter renderer over the same spec carve-out.
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md:74`, `:97` —
    the two sentences in tension; `:97`'s "tests MAY assert on their full
    *Message* strings by byte-identical equality" is written on the premise
    the rendering is bounded, which the raw-break string arm defeats.
- **Observed at:** 0.287.0 (bc52da38). Offline, deterministic: scratch
  vitest over `parseThetaDocument` via `tests/helpers/e2e-s1.ts` `parseDoc`
  (run and deleted).

## Reproduction

Each row one file (`---` fences, body `let x = 1`), production parse deps.
The message strings are shown JSON-escaped; the stored `message` contains
the RAW break.

| frontmatter | emitted diagnostic `message` |
|---|---|
| `tool_loop:` over `  max_rounds: "a\nb"` (YAML `\n` escape) | `"frontmatter field 'tool_loop.max_rounds' must be a non-negative integer; got \"a\nb\""` — two physical lines |
| `tool_loop:` over `  max_rounds: \|` block scalar `a` / `b` | `"… got \"a\nb\n\""` — three physical lines |
| `respond_repair:` over `  attempts: "x\n  hint: evil\ny"` | `message` whose middle physical line is exactly `  hint: evil` — the serialised content format's reserved continuation shape |
| `tool_loop:` over `  max_rounds: "a\n\nb"` | `message` containing a blank line — the batch-block separator |

Controls: `max_rounds: "25"` renders `got "25"` on one line (the registry's
own worked example); `max_rounds: -1` renders `got -1`; the settings twin
over a `theta.thetas.*` string with a break renders the `\n` as two
characters (JSON-escaped) and stays one line.

## Expected behaviour

- `diagnostic-shape.md:34`: `message` is a single-line summary. The
  serialised content format reserves the `  hint:` continuation, the
  related-site line, and the blank-line block separator (same file,
  §Serialised content format) — the shapes rows 3–4 forge.
- `placeholder-rendering-b.md:74` states the class rule and its reason
  ("because `message` is a single-line summary … must not reproduce the
  serialised content format's `hint` / related-site / blank-line-block
  shapes"); the rule's reason applies to every `theta/load/*` message
  interpolating author-controlled text, and the out-of-range rows fell
  outside its enumerated list only because the `<observed>` carve-out at
  `:97` was written for `"25"`-shaped strings.
- Bugs 0105 §Fix and 0250 §Fix are the adjudicated dispositions for the
  identical shape at sibling rows: normalise (or escape) at message
  construction.

## Actual behaviour / root cause

`renderObserved`'s string arm (`frontmatter.ts:588`) wraps the parsed value
in double quotes verbatim, faithfully implementing
`placeholder-rendering-b.md:97`'s letter — which prescribes no break
handling because its category-5 `<key>` reference was drafted over
identifier-ish keys. YAML delivers break-carrying strings into this position
through the `\n` escape in a double-quoted scalar and through block scalars
(both probed). The settings-side twin implemented the same carve-out with
`JSON.stringify` and is immune, so the corpus currently ships two renderings
of one spec sentence, one of which violates the shape contract.

## Why it matters

- The forged `  hint:` / related-site / blank-line shapes are exactly the
  operator-deception vectors 0105 documented: a `.theta` file is
  author-controlled input, and the diagnostics channel is the operator's
  trust surface for it.
- `:97` explicitly invites byte-identical full-message assertions; a
  conformance test written against a break-carrying string would pin the
  malformed rendering as correct.
- Two shipped renderers disagree over one spec sentence
  (`frontmatter.ts:588` raw vs `settings.ts:132–135` escaped), so whichever
  is right, one is wrong.

## Non-goals

- The refusal itself — correct, fail-closed, and the registry row's
  *Trigger* (`code-registry-load.md:21`) accurately covers the inputs; only
  the rendered message shape is in scope.
- Non-scalar `max_rounds:` values (a sequence/mapping sub-value renders via
  `String(node)` → the yaml library's `toJSON` path) — bounded single-line
  by observation; not probed exhaustively, recorded in the hunt log.
- The silent non-mapping `tool_loop:` / `respond_repair:` BLOCK values
  (`tool_loop: 5`) — a different defect class (silent defaulting), filed as
  candidate 06.
- `theta/load/settings-value-out-of-range`'s `JSON.stringify` rendering —
  single-line-safe; whether its escaping is the byte-exact rendering `:97`
  intends is a spec-wording question for the fix commit, not a defect here.

## Fix

Route `renderObserved`'s string arm through the same line-break
normalisation every sibling message uses (`normaliseLiteralValueLineBreaks`)
or through `JSON.stringify` (the settings twin's choice — escapes rather
than collapses, preserving the value's identity in the message). In the same
commit, amend `placeholder-rendering-b.md:97` (and the
`docs/reference/diagnostics.md` mirror row if it restates the rendering) to
state the break handling, choosing one rendering for BOTH out-of-range rows
so the two implementations converge. The `"25"` worked example and every
break-free string stay byte-identical either way.

## Fix (0.334.0)

- **What shipped:**
  - `src/parser/frontmatter.ts` — `renderObserved`'s string arm: the
    non-identifier branch changed from `` `"${value}"` `` to
    `JSON.stringify(value)`, so a break-carrying (or `"`/`\`/control-carrying)
    parsed string renders JSON-escaped on a single line instead of embedding a
    raw U+000A/U+000D. This is byte-identical to the already-conformant
    settings twin (`src/discovery/settings.ts:132-135`), so the two renderers
    of the one `<observed>` parsed-scalar carve-out now converge. The
    identifier-shaped bare branch, the numeric / boolean / null arms, and the
    out-of-range refusal itself are untouched; the doc-comment above
    `renderObserved` was reworded to state the JSON-escape rendering (WHY:
    single-line contract + settings-twin convergence).
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md:98` — the
    `<observed>` parsed-scalar out-of-range carve-out sentence amended to
    prescribe the JSON-escape rendering for BOTH `frontmatter-value-out-of-range`
    and `settings-value-out-of-range`: the string arm follows category 5's
    `<key>` identifier-shape split, but — unlike `<key>`'s plain
    double-quoting — the non-identifier arm renders via `JSON.stringify`
    (breaks / interior `"` / `\` / control chars escaped to their two-character
    JSON forms), so `message` stays single-line and cannot forge the serialised
    content format's reserved shapes. This resolves the `diagnostic-shape.md:34`
    (single-line) vs `:97` (byte-identical double-quoted) self-contradiction the
    report identified. The byte-identical-full-message-assertion licence at the
    paragraph's end stays true (the rendering is fully deterministic and
    bounded); the stability claim was scoped precisely to strings carrying no
    JSON-escaped character (e.g. `"25"`), which stay byte-identical.
  - `docs/reference/diagnostics.md:214` — NOT amended: it is a bare template
    row carrying the `<observed>` placeholder token, not a restatement of the
    rendering (confirmed: no `JSON.stringify` / `double-quoted` prose there), so
    per §Fix's "if it restates the rendering" condition no amendment is owed.

- **Parent adjudication (verbatim, settled):** "JSON.stringify for BOTH
  out-of-range rows — the settings twin's shipped choice: escapes rather than
  collapses, preserving the value's identity in the message (the
  byte-exact-assertion premise of :97). renderObserved's string arm adopts
  JSON.stringify(value); the settings side is ALREADY conformant and stays
  byte-identical. The collapse alternative (normaliseLiteralValueLineBreaks) was
  REJECTED: it would force changing the shipped settings renderer for
  convergence and loses value identity. In the same commit, amend
  placeholder-rendering-b.md:97 (and the docs/reference/diagnostics.md mirror
  row if it restates the rendering) to state the JSON-escape handling for the
  two out-of-range rows, resolving the :34/:97 tension."

- **Recorded delta (within the adjudication):** `JSON.stringify` also escapes
  `\` and `"` and control chars, so a previously-raw non-identifier observed
  string containing those now renders escaped (e.g. `a\b"c` was `"a\b"c"`, now
  `"a\\b\"c"`). The `"25"` worked example and every string carrying no
  JSON-escaped character stay byte-identical. Premeasure enumerated every
  committed cell pinning a `frontmatter-value-out-of-range` /
  `settings-value-out-of-range` message (`-1`, `25.5`, `"25"`, `true`, `null`,
  `42`, `array`); none pins a quote/backslash/break-carrying observed string, so
  no existing cell reds.

- **Tests that lock it:**
  `tests/b0300-out-of-range-observed-string-single-line.test.ts` (offline, stem
  b0300, `parseDoc` harness, 9 cells): A `max_rounds: "a\nb"` → single-line,
  JSON-escaped; B block scalar → single-line, escaped; C `hint:`-injection row →
  no forged continuation line; D blank-line-forgery row → no blank physical
  line; CR U+000D carrier → escaped `\r` (totality over CR, not only LF); E
  control `"25"` → byte-identical `got "25"`; F control `-1` → byte-identical
  `got -1` (numeric arm); G settings-twin convergence target (structural,
  JSON.stringify); H single-line sweep over A–F. Neighbours
  `tests/frontmatter-tool-loop-respond-repair.test.ts` and
  `tests/b0301-bind-echo-tool-loop-respond-repair-holes.test.ts` stay green
  byte-identically.

- **Gates:** witness 9/9 green; full default suite 516 files / 9857 tests
  green (515/9848 batch-lane baseline with bug 0292's fix in-tree, +1 file / +9
  cells for this witness); `npm run typecheck` clean; `npm run lint` clean;
  `tests/fixtures/h7a/permitted-codes.json` byte-unchanged
  (`a4a8da04209f90e13d815edd92c1fc682e2a2236` — no code added).

- **Review:** 2 rounds. Round 1 (`bug-fix-reviewer`) — one blocking `spec`
  finding (F1: the amended `:98` sentence over-attributed the escaping to
  category 5's plain-quote rule and over-generalised the break-free
  byte-identical claim) plus non-blocking residuals; applied via `bug-fix-fixer`
  (F1 reword + a CR totality cell + a post-fix citation refresh). Round 2
  (`bug-fix-reviewer-fast`) — CLEAN. A subsequent orchestrator-authorized
  comment-only refresh of the witness header's stale pre-fix citations (bounded,
  no assertion/behaviour touched, witness stayed green) needed no confirmation
  round per the post-polish gate-diff rule.

- **Verification (`bug-fix-verifier`, SOLID):** witness reversibility — the one
  executable line reverted to `` `"${value}"` `` reds cells A/B/C/D/CR/H,
  restored byte-exact, re-runs 9/9 green; full suite green; typecheck + lint
  clean. Live obligation (orchestrator-owned; verifiers never run live) — the
  change is message-shape-only with the refusal outcome unchanged, so no
  bespoke live cell is owed; satisfied by running the existing
  `tests/live/acceptance/b0301live-bind-echo-nonboolean-load-refusal.test.ts`
  under the live lock (1/1 green), which exercises the identical
  `parseFrontmatter` refusal → not-registered → `invoke` Err registration-flip
  channel that `resolveNonNegIntBlock`'s `frontmatter-value-out-of-range` message
  rides end-to-end through the real `pi -p` host.

- **Residuals:**
  1. The settings-side string arm has no end-to-end pin; cell G asserts the
     `JSON.stringify` convergence target structurally rather than driving
     `settings.ts`. Convergence is enforced by code identity (both arms: same
     `isIdentifierShaped` regex + same `JSON.stringify`) plus review, not by a
     settings-suite cell. Pre-existing follow-up material for the settings
     suite; out of this fix's scope (settings was already conformant).
  2. Sibling carriers of the 0105 line-break class in the unknown/deferred
     frontmatter-field emissions (`src/parser/frontmatter.ts` unknown-sub-key
     path and the top-level `unknown-frontmatter-field` emissions) interpolate
     an author-chosen YAML key without a line-break normalisation and are absent
     from `placeholder-rendering-b.md:75`'s list — the same spec-drafted-over
     -identifier-ish-keys pattern. Not probed end-to-end here; per the
     0105→0250→0300 chain discipline a new carrier gets its own report rather
     than widening this fix. Recommend filing as a candidate.

- **Discharge notes appended:** none.

- **Pinned dispositions / non-goals:** non-scalar `max_rounds:` values; the
  non-mapping `tool_loop:` / `respond_repair:` block values (bug 0301, fixed —
  now a distinct `malformed-*-field` code, verified still routing the doc's
  SUB-FIELD reproduction rows through `frontmatter-value-out-of-range`); the
  `settings-value-out-of-range` rendering (already conformant — stays
  byte-identical). The refusal itself and the registry `Trigger` are unchanged.

## Provenance

Fresh find, discovered by sweeping `parseFrontmatter`'s message
interpolations for `normaliseLiteralValueLineBreaks` coverage (one absence).
Probed at bc52da38 with a scratch vitest over `parseDoc` (four rows above
plus controls; deleted). Spec read: `diagnostic-shape.md:34` +
§Serialised content format; `placeholder-rendering-b.md:74`, `:97`, `:137`;
`code-registry-load.md:21`. Prior-bug sweep: 0105 (class + six-site fix
scope), 0250 (the "one carrier left" claim this report post-dates), 0087 /
0091 (the system-note-side line disciplines — different channel).
