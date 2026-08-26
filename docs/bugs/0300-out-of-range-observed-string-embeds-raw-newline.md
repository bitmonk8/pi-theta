# Bug 0300 — `theta/load/frontmatter-value-out-of-range` interpolates a string-valued `<observed>` with no line-break transform, so a `tool_loop.max_rounds` / `respond_repair.attempts` block scalar or `\n`-escaped string renders a `message` of two or more physical lines where `diagnostic-shape.md:34` says single-line summary — the carrier class bugs 0105 and 0250 closed at the `<value>` rows, left open on the `<observed>` carve-out, whose settings-side twin already escapes via `JSON.stringify`

- **Status:** open.
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

## Provenance

Fresh find, discovered by sweeping `parseFrontmatter`'s message
interpolations for `normaliseLiteralValueLineBreaks` coverage (one absence).
Probed at bc52da38 with a scratch vitest over `parseDoc` (four rows above
plus controls; deleted). Spec read: `diagnostic-shape.md:34` +
§Serialised content format; `placeholder-rendering-b.md:74`, `:97`, `:137`;
`code-registry-load.md:21`. Prior-bug sweep: 0105 (class + six-site fix
scope), 0250 (the "one carrier left" claim this report post-dates), 0087 /
0091 (the system-note-side line disciplines — different channel).
