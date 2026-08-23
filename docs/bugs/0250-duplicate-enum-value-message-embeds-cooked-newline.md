# Bug 0250 — `theta/parse/duplicate-enum-value` interpolates the COOKED value of an enum variant's string literal with no line-break transform, so a `\n` escape in the shared value renders a `message` of two physical lines where `diagnostic-shape.md:34` says single-line summary, and an author-chosen value forges the `  hint: <hint>` continuation line, the `  <file>:<line>:<col>: <message>` related-site line, or a second batch block — the one carrier of bug 0105's defect class left unwired when 0.217.0 closed the six load-time sites

- **Status:** open.
- **Sev/Diff estimate:** S3/D1 — S3 because a registered diagnostic renders text
  that breaks its own stated shape and forges the structural lines of the
  serialised content format consumers parse, but only on input that already
  fails to load (the enum is refused either way) and only when the author writes
  a `\n` escape inside a duplicated enum value; zero committed corpus files
  declare an `enum` at all. D1 because the remedy is one call to an existing
  exported function (`normaliseLiteralValueLineBreaks`,
  `src/diagnostics/diagnostic.ts:152`) at one interpolation
  (`src/parser/schema-declarations.ts:269`), plus the one-sentence spec edit
  DIAG-2 requires and a witness; no route is open and no existing assertion
  moves.
- **Kind:** defect — implementation, with one spec sentence to re-take. The
  emission site interpolates the cooked literal value into the *Message*
  template with no transform of any kind
  (`src/parser/schema-declarations.ts:269`), and
  `docs/spec_topics/diagnostics/placeholder-rendering-b.md:74` states that this
  row's rendering "is not governed by the normalisation above" without stating
  what governs it instead.
- **Related:**
  - [0105](./0105-malformed-tool-entry-message-embeds-raw-newline.md) —
    **fixed (0.217.0)**, the parent and the filing origin. Its `## Fix
    (0.217.0)` §Residuals item 1 names this report's subject exactly:
    "`theta/parse/duplicate-enum-value` remains an open carrier. Measured during
    review: an enum whose two variants share the cooked value of a string
    literal written with a `\n` escape emits a `message` of two physical lines.
    Its emission site is in `src/parser/schema-declarations.ts`, outside this
    fix's region, so the transform is not wired there and §7 is silent about
    that row's break rendering rather than blessing it. A sibling filing is
    warranted." This report is that filing. 0105 shipped
    `normaliseLiteralValueLineBreaks` and wired it at six `theta/load/*` sites;
    this is the seventh site in the same §7 enumeration.
  - `theta/parse/duplicate-discriminator-value` — **not a carrier**, re-measured
    below. It binds the RAW source slice of the discriminator's literal
    annotation through `renderParseLiteralValue`
    (`src/parser/schema-declarations.ts:459–461`, called at `:733`), in which a
    `\n` escape stays the two characters `\` `n`. It needs no change and is not
    in this report's scope.
  - [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md)
    — **fixed (0.61.0)** and
    [0087](./0087-echo-note-newline-unsanitised.md) — **fixed (0.56.0)**, the
    two landed precedents 0105 drew its render-seam vocabulary from. Both hold
    that an author-controlled break reaching a line-oriented rendering forges
    that rendering's structural lines, and both fixed it by transforming the
    interpolated value at the render seam.
  - **Ordering:** no report blocks this one, and this one blocks none. 0105 is
    shipped; its exported transform is the fix's only new dependency and is
    already in the tree.
- **Affected** (every citation verified at HEAD `b9cf2f26`, 0.219.0):
  - `src/parser/schema-declarations.ts:243–272` — **the emission site.** The
    value-duplication check of `checkEnumDeclaration` (`:190`). `:247–254` is
    the grouping of explicit string values by the distinct variant names
    carrying them. `:266` is the `code`, `:268` the `range` (so the diagnostic
    is a **located** site and renders through `renderDiagnosticLine`'s
    full-triple form), and `:269` is the whole of the rendering:
    ``message: `duplicate enum value '${value}' across variants of enum
    '${decl.name}'` ``. `value` is `variant.value.text` (`:260`), interpolated
    with no quoting, escaping, collapsing or truncation step.
  - `src/parser/schema-declarations.ts:30` — the import line,
    `import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";`.
    The module imports no value binding from `diagnostic.ts` today, which is why
    0105's transform is not reachable here without an import edit.
  - `src/parser/schema-declarations.ts:459–461` — `renderParseLiteralValue`,
    the category-5 quoting renderer that lives in this same file
    (`/^[A-Za-z_][A-Za-z0-9_]*$/` bare, `JSON.stringify` otherwise). The enum
    row does not call it; the discriminator row does (`:733`).
  - `src/parser/theta-document.ts:5590–5606` — `classifyEnumValueToken`, which
    is where the value becomes cooked: `:5594` returns
    `{ kind: "string", text: tok.value ?? tok.text }` for a string token, and
    `tok.value` is the escape-processed value, not the source slice. The capture
    site is `parseEnumVariants`' `=` arm (`:3289–3296`).
  - `src/parser/theta-document.ts:7953–7965` — the `case "enum"` arm of the
    whole-file declaration walk; `:7960` calls `checkEnumDeclaration` with
    `{ file, range: s.range }`, so every enum diagnostic ranges the whole
    declaration.
  - `src/diagnostics/diagnostic.ts:64–91` — `renderDiagnosticLine`. `:72` is the
    located form this diagnostic takes; `:80` appends `\n  hint: <hint>`; `:86`
    appends `\n  <file>:<line>:<col>: <message>` per related site. Both
    continuation lines are two-space-indented and both are forgeable by a
    message carrying a break followed by two spaces (measured).
  - `src/diagnostics/diagnostic.ts:93–99` — `renderDiagnosticBatch`, which joins
    per-diagnostic blocks with `"\n\n"` (`:98`). A message containing `\n\n`
    renders as two blank-line-separated blocks from one `Diagnostic` (measured).
  - `src/diagnostics/diagnostic.ts:129–151`, `:152` —
    `normaliseLiteralValueLineBreaks`, bug 0105's shipped transform and its doc
    comment. Byte identity on text carrying neither U+000D nor U+000A; every
    maximal run of U+0020 / U+0009 / U+000D / U+000A containing at least one
    break collapses to one U+0020; a break-free whitespace run is preserved;
    leading and trailing U+0020 are trimmed. Its six wired call sites are
    `src/parser/callable-set.ts:198`, `:252` and
    `src/parser/frontmatter.ts:589`, `:1163`, `:1210`, `:1226`
    (`rg -n 'normaliseLiteralValueLineBreaks' src/`). None is in
    `schema-declarations.ts`.
  - `src/extension/production-composition.ts:754` — the shipped delivery of a
    parse-phase rejection: `sink.emitGroup(parsed.dropped)` for a theta that
    un-registers. `:1282` is what the group's error arm sends —
    `content: renderDiagnosticBatch([diagnostic])` through
    `preEvalRouter.routePreEvalFailure`, with
    `details: { diagnostics: [diagnostic] }` (`:1284`). The note content is
    therefore the line-oriented render measured below.
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md:74` — the
    parse-time literal-value `<value>` sub-rule and its eight rows. Its closing
    sentences, added by the 0105 fix, state: "The two `theta/parse/*` rows in
    this list bind theta source rather than YAML:
    `theta/parse/duplicate-enum-value` binds the cooked value of a string
    literal, whose source grammar admits no raw U+000A but whose `\n` escape
    cooks to one, and `theta/parse/duplicate-discriminator-value` binds the raw
    source slice of the discriminator's literal annotation, in which a `\n`
    escape stays two characters. Neither row's rendering is governed by the
    normalisation above." The page names the cooking mechanism and excludes the
    row from the transform; it states no rule the resulting break must satisfy,
    so it neither blesses the two-line rendering nor forbids it.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:34` — `message: string,
    // single-line summary`, inside the normative internal diagnostic shape
    block. `:63` — **Serialised content format**, which fixes the three main
    line forms, reserves `"\n  hint: <hint>"` for a `hint` field, reserves the
    two-space-indented `"  <file>:<line>:<col>: <message>"` form for one element
    of `Diagnostic.related`, and makes a single blank line the batch block
    separator. `:72` — DIAG-2 and its same-commit rule. `:74` — DIAG-4, the
    *Message* column normative character-for-character with placeholders
    interpolated.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:111` — the
    `theta/parse/duplicate-enum-value` row (E, parse). *Message*: `duplicate
    enum value '<value>' across variants of enum '<enum>'`. `:13` — the
    `theta/parse/literal-newline-in-string` row, which is what refuses a RAW
    newline inside the literal and is why the escape is the only carrier.
  - `docs/spec_topics/schemas.md:93` — §Enum declarations: string values only,
    the name-before-value check ordering, and "`theta/parse/duplicate-enum-value`
    remains reserved for the orthogonal case of distinct names sharing one
    explicit value (`enum X { Low = "x", High = "x" }`)".
  - `docs/reference/diagnostics.md:19` — the `message` / "single-line summary"
    mirror; `:157` — the *Message* mirror row for this code.
    `docs/reference/schema-subset.md:85` — the user-facing enum-rules mirror.
  - `tests/schema-declarations.test.ts:230–248` — the one cell asserting this
    code's rendered message, `expect(d?.message).toBe("duplicate enum value 'x'
    across variants of enum 'X'")` (`:247`). Its value is single-line, so a
    transform that is identity on break-free text leaves it green. `:207`,
    `:225–226` are the name-before-value ordering cells and assert no message.
  - **No invariant test.** No cell in `tests/` asserts that a `Diagnostic`'s
    `message` carries no line break (`rg -n 'single-line' tests/` returns only
    `theta/parse/single-line-if` cells and prose comments), and no cell in the
    tree feeds an enum value containing an escape.
  - `tests/live/acceptance/harness.ts:570–575` — `acceptanceStderrOffenders`,
    the H9a stderr gate's splitter (`stderr.split(/\r?\n/)`, blank lines
    filtered, then the allowlist filter). `ACCEPTANCE_STDERR_ALLOWLIST` is empty
    (`:560`). A multi-line diagnostic reaching stderr yields one offender per
    physical line.
  - `tests/fixtures/h7a/permitted-codes.json` — 11 codes;
    `theta/parse/duplicate-enum-value` is not among them, and no H9a fixture
    declares an enum.
  - **The corpus.** 35 committed `.theta` / `.thetalib` files
    (`find . \( -name "*.theta" -o -name "*.thetalib" \) -not -path
    "./node_modules/*" -not -path "./.git/*"`). Zero declare an `enum`
    (`rg -l '\benum\b' --glob '*.theta' --glob '*.thetalib' .` returns nothing,
    exit 1), so zero committed files change their rendered diagnostic under any
    fix.
- **Observed at:** `0.219.0` (HEAD `b9cf2f26`). Offline, deterministic; no live
  model, no provider. Two scratch vitest probes over `parseThetaDocument`
  (`src/parser/theta-document.ts:868`) with the real `renderDiagnosticLine` /
  `renderDiagnosticBatch` applied to the diagnostics each parse produced;
  written, run, deleted.

## Summary

`checkEnumDeclaration`'s value-duplication arm names the shared value verbatim
through the `<value>` placeholder:

```ts
message: `duplicate enum value '${value}' across variants of enum '${decl.name}'`,
```

`src/parser/schema-declarations.ts:269`. `value` is `variant.value.text`, which
`classifyEnumValueToken` (`src/parser/theta-document.ts:5594`) takes from the
string token's `value` field — the COOKED literal, with escapes already
processed. A `\n` escape in the source therefore arrives at the interpolation as
one U+000A:

```theta
enum E { Low = "a\nb", High = "a\nb" }
```

renders `duplicate enum value 'a` / `b' across variants of enum 'E'` — a
`message` of two physical lines where
`docs/spec_topics/diagnostics/diagnostic-shape.md:34` says single-line summary.
A raw newline written into the literal is not the carrier: it draws
`theta/parse/literal-newline-in-string` (`code-registry-parse.md:13`) and the
duplicate-value check never runs (measured). The escape is the whole of the
input class.

The break reaches the structural lines of the serialised rendering.
`diagnostic-shape.md:63` makes the content format line-oriented and reserves
two-space-indented continuation lines. Measured forgeries:

- `"x\n  hint: forged"` renders a second physical line matching `^ {2}hint: ` —
  the shape `src/diagnostics/diagnostic.ts:80` emits for a `hint` field, on a
  diagnostic that carries none.
- `"x\n  /p/o.theta:9:9: forged"` renders a second physical line matching
  `^ {2}\S+:\d+:\d+: ` — the related-site shape
  `src/diagnostics/diagnostic.ts:86` emits, on a diagnostic whose `related` is
  absent.
- `"x\n\ny"` puts `\n\n` in the message, so `renderDiagnosticBatch([d])` — one
  `Diagnostic` — renders as two blank-line-separated blocks.
- `"x\r\ny"` cooks to U+000D U+000A and renders two lines through the same
  splitter the H9a stderr gate uses.

This is the defect bug 0105 closed at six `theta/load/*` sites in 0.217.0 with
the exported `normaliseLiteralValueLineBreaks`
(`src/diagnostics/diagnostic.ts:152`). That fix's region did not include
`src/parser/schema-declarations.ts`, and the transform is not wired at this
site. `placeholder-rendering-b.md:74` records that this row binds a cooked value
whose `\n` escape cooks to a break, and excludes the row from the normalisation
without stating any rule in its place.

`theta/parse/duplicate-discriminator-value`, the other `theta/parse/*` row in
the same sub-rule, is not a carrier: it renders the RAW source slice of the
literal annotation through `renderParseLiteralValue`
(`src/parser/schema-declarations.ts:459–461`, called at `:733`), where a `\n`
escape stays two characters. Re-measured below, confirming 0105's residual.

## Reproduction

Offline, at `b9cf2f26`. Scratch vitest calling `parseThetaDocument` on an
in-memory source, frontmatter `mode: prompt` / `model: sonnet`, body `` @`hi` ``,
with a no-op `systemNote` deps object and a `modelMatcher` that resolves.
`msg` is the emitted `Diagnostic.message`, JSON-escaped; `msgLines` is
`msg.split("\n").length`; `renderedLines`, `hintForged`, `relForged` and
`batchBlocks` are computed from the real `renderDiagnosticLine` /
`renderDiagnosticBatch`. Every declaration below is written with `\n` as a
two-character source escape inside the string literal.

```
@@ enum E { Low = "a\nb", High = "a\nb" }
   code  theta/parse/duplicate-enum-value
   msg   "duplicate enum value 'a\nb' across variants of enum 'E'"
   msgLines 2   renderedLines 2   hintForged 0   relForged 0   batchBlocks 1

@@ enum E { Low = "x\n  hint: forged", High = "x\n  hint: forged" }
   msg   "duplicate enum value 'x\n  hint: forged' across variants of enum 'E'"
   msgLines 2   renderedLines 2   hintForged 1   relForged 0   batchBlocks 1

@@ enum E { Low = "x\n  /p/o.theta:9:9: forged", High = "x\n  /p/o.theta:9:9: forged" }
   msg   "duplicate enum value 'x\n  /p/o.theta:9:9: forged' across variants of enum 'E'"
   msgLines 2   renderedLines 2   hintForged 0   relForged 1   batchBlocks 1

@@ enum E { Low = "x\n\ny", High = "x\n\ny" }
   msg   "duplicate enum value 'x\n\ny' across variants of enum 'E'"
   msgLines 3   renderedLines 3   hintForged 0   relForged 0   batchBlocks 2

@@ enum E { Low = "x\r\ny", High = "x\r\ny" }
   msg   "duplicate enum value 'x\r\ny' across variants of enum 'E'"
   msgLines 2   renderedLines 2   batchBlocks 1

@@ enum E { Low = "x", High = "x" }                      [control]
   msg   "duplicate enum value 'x' across variants of enum 'E'"
   msgLines 1   renderedLines 1   hintForged 0   relForged 0   batchBlocks 1

@@ enum E { Low = "a\tb", High = "a\tb" }                [tab escape, control]
   msg   "duplicate enum value 'a\tb' across variants of enum 'E'"
   msgLines 1
```

The `hintForged` and `relForged` counts are the number of rendered physical
lines matching `^ {2}hint: ` and `^ {2}\S+:\d+:\d+: ` respectively. The
diagnostic carries neither a `hint` nor a `related` array, so each non-zero
count is a forged line.

### The raw newline is not the carrier

```
@@ enum E { Low = "a<LF>b", High = "a<LF>b" }            [literal newline in source]
   code  theta/parse/literal-newline-in-string   ×2
   msg   "literal newline in string literal"
   msgLines 1
```

The lexer refuses the literal (`code-registry-parse.md:13`), the enum captures
no explicit value, and `theta/parse/duplicate-enum-value` does not fire. Only
the escape reaches the interpolation.

### The discriminator row is not a carrier

```
@@ schema A { k: "p\nq" }  schema B { k: "p\nq" }  schema U = A | B
   code  theta/parse/duplicate-discriminator-value
   msg   "duplicate discriminator value '\"p\\nq\"' across variants of U"
   msgLines 1   renderedLines 1
```

The value is the raw annotation slice, and `renderParseLiteralValue`'s
`JSON.stringify` arm quotes it; the escape survives as two characters. 0105's
residual is confirmed.

### The shipped transform closes every measured row

`normaliseLiteralValueLineBreaks` (`src/diagnostics/diagnostic.ts:152`) applied
directly to the cooked values above:

```
"a\nb"             -> "a b"
"x\n  hint: forged"-> "x hint: forged"
"x\n\ny"           -> "x y"
"x\r\ny"           -> "x y"
"x"                -> "x"          [byte identity]
```

### Not measured

No H9a spawn was driven and no on-disk discovery workspace was composed. The
delivery claim rests on reading the shipped route
(`src/extension/production-composition.ts:754` → `:1282`), not on an end-to-end
capture. Nothing is claimed about the operator's rendered transcript:
`pi.registerMessageRenderer` returns a `pi-tui` component, and the strings
measured here are the `content` input that `diagnostic-shape.md:63` governs.

## Expected behaviour

- **`message` is one line.** `diagnostic-shape.md:34` states the field as
  `message: string, // single-line summary`, mirrored at
  `docs/reference/diagnostics.md:19`. No page qualifies the claim by code,
  phase or value provenance, so a parse-phase row is bound by it exactly as the
  six load-phase rows bug 0105 fixed are.
- **The structural lines of the serialised format are the renderer's, not the
  author's.** `diagnostic-shape.md:63` reserves `"\n  hint: <hint>"` for a
  `hint` field, the two-space-indented `"  <file>:<line>:<col>: <message>"` form
  for a `related` element, and a single blank line for a batch block boundary. A
  `message` that reproduces any of those shapes makes the rendered block
  describe a diagnostic that was not emitted.
- **The `<value>` sub-rule states what this row renders.**
  `placeholder-rendering-b.md:74` names the cooking mechanism and then excludes
  the row from the normalisation, leaving the break's rendering unstated. A
  reader asking what `duplicate enum value '<value>'` prints for a value
  carrying U+000A finds no answer on the one page that governs `<value>`.
- **The diagnostic still identifies the offending value.** The value text is
  what distinguishes this row from `theta/parse/duplicate-enum-variant-name`
  (`schemas.md:93`), and the range covers the whole declaration
  (`src/parser/theta-document.ts:7960`) rather than the offending variant, so
  the interpolated value is the only thing that names which value collided.
  Whatever transform lands leaves it recognisable.
- **One rule over one field admits no per-site exemption.** 0105 wired the
  transform at six sites answering one sentence. A seventh site in the same
  enumeration rendering a two-line `message` leaves the rule half-enforced.

## Why it matters

- **A registered diagnostic renders text that breaks its own stated shape.**
  `diagnostic-shape.md:34` is normative and mirrored to users at
  `docs/reference/diagnostics.md:19`. Five measured inputs produce a multi-line
  `message` at HEAD, and nothing in `tests/` asserts the property.
- **The forgeries are the 0060 / 0087 / 0105 class, unclosed on one row.** An
  enum value spelled `x\n  hint: …` produces a rendered block carrying a
  `  hint: …` line for a diagnostic with no hint; a value spelled like a
  `path:line:col` triple produces a related-site line for a diagnostic with no
  related array; a value carrying `\n\n` makes one `Diagnostic` render as two
  batch blocks (all measured). Every precedent treated that capability as the
  defect, independently of a known misparsing consumer.
- **The value is author-controlled and reaches the rendering with no
  intermediary.** The lexer cooks the escape
  (`src/parser/theta-document.ts:5594`), the parser stores the cooked text
  (`:3289–3296`), the checker groups by it (`schema-declarations.ts:247–254`)
  and interpolates it (`:269`). No step inspects the text.
- **The fix's own dependency already shipped.** 0105 landed the shared transform
  and the spec sentence it answers; leaving one enumerated row unwired makes the
  next reader of `placeholder-rendering-b.md:74` conclude the exclusion is
  intentional.
- **The gate that would notice on the live axis counts lines.**
  `acceptanceStderrOffenders` splits on `/\r?\n/`
  (`tests/live/acceptance/harness.ts:571`) with an empty allowlist (`:560`), so
  one such diagnostic reaching stderr reports as two or three offenders. No H9a
  fixture declares an enum, so this is a latent count change, not a current red.
- **The input class is reached first by an author writing it for the first
  time.** Zero committed `.theta` / `.thetalib` files declare an enum, so the
  only reader of this message is someone hitting the collision while writing the
  declaration — the moment the diagnostic has to be readable.

## Non-goals

- **The `<value>` quoting divergence.** This site renders the value bare where
  `placeholder-rendering-b.md:74`'s category-5 `<key>` arm would double-quote a
  non-identifier-shaped value, and `renderParseLiteralValue`
  (`src/parser/schema-declarations.ts:459–461`) — the function that applies that
  arm — sits in the same file and is not called here. 0105 §Non-goals scoped the
  quoting axis out; this report holds that scoping. Only the newline axis moves.
- **`theta/parse/duplicate-discriminator-value`.** Measured non-carrier
  (§Reproduction). It needs no wiring, and wiring it anyway would be a no-op on
  every input this report measured.
- **The enum check's ordering, grouping or range.** The name-before-value
  ordering (`schemas.md:93`), the distinct-names-sharing-one-value grouping
  (`src/parser/schema-declarations.ts:247–254`) and the whole-declaration range
  (`src/parser/theta-document.ts:7960`) are settled and untouched. Narrowing the
  range to the offending variant is a separate change and is not a substitute:
  it would not make the message single-line.
- **Reworking the serialised content format.** `diagnostic-shape.md:63`'s
  continuation-line and block-separator shapes are the contract the forgery
  exploits; making them unforgeable by changing them is a separate adjudication.
  The transform belongs on the interpolated value, as in 0060, 0087 and 0105.
- **Any other `theta/parse/*` message.** Only the rows in
  `placeholder-rendering-b.md:74`'s enumeration bind a `<value>` under this
  sub-rule. A sweep of other parse messages for break carriers is not this
  report's subject.

## Fix

Wire the site through bug 0105's shared transform.
`src/parser/schema-declarations.ts:269` interpolates
`normaliseLiteralValueLineBreaks(value)` instead of `value`, with the binding
added to the existing `../diagnostics/diagnostic` import at `:30`. The transform
is the one exported at `src/diagnostics/diagnostic.ts:152` and already wired at
the six `theta/load/*` sites; this is the seventh site in the same §7
enumeration, answering the same sentence with the same function rather than a
local rule.

Constraints:

1. **The import is folded onto the existing line.** `:30` is
   `import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";`
   and gains the value binding in place, so `src/parser/schema-declarations.ts`
   has a net line shift of ZERO and every line-form citation into it — in this
   report, in `tests/schema-declarations.test.ts`, and in the bug docs citing
   `checkObjectSchema` / `checkEnumDeclaration` / the discriminator helpers —
   stays valid. This mirrors 0105 §Fix residual 4, which pinned the same
   property for `callable-set.ts` and `frontmatter.ts`.
2. **The spec sentence is re-taken in the same commit.**
   `docs/spec_topics/diagnostics/placeholder-rendering-b.md:74` currently ends
   "Neither row's rendering is governed by the normalisation above." That
   becomes: `theta/parse/duplicate-enum-value` binds a cooked string-literal
   value and DOES pass the normalisation (naming the `\n` escape as the reachable
   break and the raw newline's refusal by
   `theta/parse/literal-newline-in-string` as why it is the only one);
   `theta/parse/duplicate-discriminator-value` binds a raw source slice in which
   a `\n` escape stays two characters and is unaffected. DIAG-2's same-commit
   rule (`diagnostic-shape.md:72`) governs the pairing. One normative test
   vector is added for the cooked-escape value, alongside the two 0105 added.
3. **The registry *Message* template does not move.** DIAG-4
   (`diagnostic-shape.md:74`) makes `duplicate enum value '<value>' across
   variants of enum '<enum>'` normative character-for-character with wording
   changes deferred to theta 2.0. What changes is what `<value>` interpolates.
   `docs/spec_topics/diagnostics/code-registry-parse.md:111` and its mirror
   `docs/reference/diagnostics.md:157` are therefore unedited, as is
   `docs/reference/schema-subset.md:85`. No placeholder is introduced, retired
   or moved (`placeholder-rendering-a.md` §Closure, GOV-7 / GOV-8).
4. **The existing assertion stays green untouched.**
   `tests/schema-declarations.test.ts:247` asserts the rendered message for the
   single-line value `x`; the transform is byte identity on text carrying
   neither U+000D nor U+000A, so that cell is unaffected. Verify that first —
   the alternative is a file rewrite.
5. **The witness pins the new rows in both directions.** Required: the `\n`
   escape row asserted on the message's physical-line count; the blank-line
   value asserted on `renderDiagnosticBatch([d])` producing ONE block; the
   `hint`-shaped and `path:line:col`-shaped values asserted to produce no
   rendered line matching `^ {2}hint: ` and none matching `^ {2}\S+:\d+:\d+: `;
   the `\r\n` escape row; the tab-escape and plain single-line values asserted
   byte-identical to today, which is the identity half; the raw-newline input
   asserted to draw `theta/parse/literal-newline-in-string` and no duplicate
   row; and the discriminator input asserted to keep its two-character `\n`.
   Each cell must red against the pre-fix bytes on the line count or the forged
   line match, never on a compile error.
6. **GOV-15 is not engaged, and that is confirmed rather than assumed.** No code
   is added or removed and no input's diagnostic-code sequence moves: every row
   in §Reproduction emits the same code with the same severity and un-registers
   the same theta before and after.
   `docs/spec_topics/governance/source-language-stability.md`'s
   diagnostic-registry carve-out is not reached, and
   `tests/fixtures/h7a/permitted-codes.json` needs no entry (the code is absent
   today and no H9a fixture declares an enum — re-confirm at the fix baseline).
7. **The corpus census is re-run at the fix baseline.** Measured here: 35
   committed `.theta` / `.thetalib` files, zero declaring an `enum`, so zero
   committed files change their rendered diagnostic. The census must also reach
   fixtures that are TypeScript string literals; `tests/schema-declarations.test.ts`
   is the one such fixture set carrying this code.

## Provenance

- Origin: the bug 0105 fix (0.217.0), `## Fix (0.217.0)` §Residuals item 1,
  which names the carrier, the emission file, the cooking mechanism, the
  measured two-line rendering, the discriminator row's non-carrier status, and
  the warranted sibling filing. This report is that filing, and adds what the
  residual does not state: the exact interpolation and cooking sites with their
  line forms; the physical-line counts for the `\n`, `\r\n` and blank-line
  values; the forged `  hint: ` and `  <file>:<line>:<col>: ` continuation lines
  and the forged batch block boundary, measured through the real
  `renderDiagnosticLine` / `renderDiagnosticBatch`; the raw-newline control
  showing `theta/parse/literal-newline-in-string` pre-empts the row; the
  discriminator re-measurement; the transform's output on each measured value;
  the shipped delivery route; the corpus census; and the single-approach fix
  with its constraints.
- Spec: `docs/spec_topics/diagnostics/diagnostic-shape.md:34` (the `message`
  single-line summary), `:63` (the serialised content format — the `hint`
  continuation, the related-site line, the blank-line block separator), `:72`
  (DIAG-2), `:74` (DIAG-4);
  `docs/spec_topics/diagnostics/placeholder-rendering-b.md:74` (the parse-time
  literal-value `<value>` sub-rule, its eight rows, and the two `theta/parse/*`
  exclusion sentences);
  `docs/spec_topics/diagnostics/placeholder-rendering-a.md:7` (§Closure, GOV-7 /
  GOV-8);
  `docs/spec_topics/diagnostics/code-registry-parse.md:111` (the
  `theta/parse/duplicate-enum-value` row), `:13` (the
  `theta/parse/literal-newline-in-string` row), `:112` (the
  `duplicate-enum-variant-name` row and the check ordering);
  `docs/spec_topics/schemas.md:93` (§Enum declarations — string values only, the
  ordering, and the reserved orthogonal case). User-facing:
  `docs/reference/diagnostics.md:19` (the `message` line), `:157` (the *Message*
  mirror row); `docs/reference/schema-subset.md:83–87` (the enum-rules mirror).
- Implementation evidence at `b9cf2f26`:
  `src/parser/schema-declarations.ts:17`, `:184–188` (the two doc comments
  enumerating the enum checks), `:30` (the `../diagnostics/diagnostic` import),
  `:190` (`checkEnumDeclaration`), `:243–272` (the value-duplication check;
  `:247–254` the grouping; `:260` the cooked value; `:266` the code; `:268` the
  range; `:269` the interpolation), `:459–461` (`renderParseLiteralValue`),
  `:722–734` (`duplicateValueDiagnostic`; `:733` the discriminator
  interpolation);
  `src/parser/theta-document.ts:868` (`parseThetaDocument`), `:3227`
  (`parseEnumVariants`), `:3289–3296` (the `= <value>` capture),
  `:5590–5606` (`classifyEnumValueToken`; `:5594` the cooked string arm),
  `:7953–7965` (the `case "enum"` walk arm; `:7960` the `checkEnumDeclaration`
  call with `range: s.range`);
  `src/diagnostics/diagnostic.ts:64–91` (`renderDiagnosticLine`; `:72` the
  located form; `:80` the hint continuation; `:86` the related-site line),
  `:93–99` (`renderDiagnosticBatch`; `:98` the `"\n\n"` join), `:129–151` (the
  transform's doc comment), `:152` (`normaliseLiteralValueLineBreaks`);
  `src/parser/callable-set.ts:198`, `:252` and `src/parser/frontmatter.ts:589`,
  `:1163`, `:1210`, `:1226` (0105's six wired call sites);
  `src/extension/production-composition.ts:754` (the dropped-theta group emit),
  `:1276–1286` (the pre-eval router arm; `:1282` the rendered content, `:1284`
  the structured array).
- Test and corpus evidence at `b9cf2f26`:
  `tests/schema-declarations.test.ts:207`, `:225–226` (the ordering cells),
  `:230–248` (the one message-asserting cell; `:247` the assertion);
  `tests/live/acceptance/harness.ts:560` (the empty
  `ACCEPTANCE_STDERR_ALLOWLIST`), `:570–575` (`acceptanceStderrOffenders`);
  `tests/fixtures/h7a/permitted-codes.json` (11 codes, this one absent);
  the corpus census — `find . \( -name "*.theta" -o -name "*.thetalib" \) -not
  -path "./node_modules/*" -not -path "./.git/*"` (35 files),
  `rg -l '\benum\b' --glob '*.theta' --glob '*.thetalib' .` (no match, exit 1);
  `rg -n 'normaliseLiteralValueLineBreaks' src/` (the transform plus its six
  wired sites, none in `schema-declarations.ts`);
  `rg -n 'duplicate-enum-value' docs/bugs/` (only
  `0105-malformed-tool-entry-message-embeds-raw-newline.md`, which is fixed —
  no open report owns this subject);
  `rg -n 'single-line' tests/` (no `Diagnostic.message` invariant cell).
- Reproduction: two scratch vitest probes at `b9cf2f26` over `parseThetaDocument`
  — the seven-input enum-value matrix with its codes, messages, physical-line
  counts, forged-line counts and batch-block counts through the real
  `renderDiagnosticLine` / `renderDiagnosticBatch`, and the raw-newline control,
  the tab-escape control, the discriminator row and the transform's output on
  each measured value. Run on the outputs quoted above, then deleted per scratch
  policy. No file in the tree was written by the probes; `src/`, `tests/`,
  `docs/bugs/README.md` and every other bug doc are unmodified by this filing.
