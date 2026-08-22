# Bug 0105 — `theta/load/malformed-tool-entry` interpolates the offending `tools:` entry into its message with no line-break transform, so a block-mapping sequence item of two or more keys — whose verbatim YAML source slice the bug 0069 fix recovers instead of dropping — yields a diagnostic `message` carrying a raw U+000A where `diagnostic-shape.md:34` says single-line summary: the shipped renderings then span two or three physical lines, an author-chosen second key forges the `  hint: <hint>` continuation line or the `  <file>:<line>:<col>: <message>` related-site line that the serialised content format reserves, and a blank line inside the item forges a second batch block

- **Status:** fixed (0.217.0). Route B was the in-run adjudication (see §Fix
  (0.217.0)): the line-break transform lives in one shared renderer every
  parse-time literal-value `<value>` interpolation on the load path calls. No
  ordering dependency:
  [0069](./0069-tools-entry-residue-silently-dropped.md) shipped in 0.62.0 and
  is what makes the multi-line slice reachable at all.
- **Sev/Diff estimate:** S2/D3 — a registered diagnostic renders text that
  breaks its own stated shape and forges the structural lines of the format its
  consumers parse, on input the resolver otherwise rejects correctly; D3 because
  the seam choice is adjudicated in-run, the rendering rule is a same-commit
  spec edit, and 0069's message-asserting witness cells re-pin.
- **Kind:** defect at the render seam, with one spec silence over the remedy.
  1. *The rendering breaks a stated shape.*
     `docs/spec_topics/diagnostics/diagnostic-shape.md:34` declares `message` a
     "single-line summary", mirrored at `docs/reference/diagnostics.md:19`. The
     emission site (`src/parser/callable-set.ts:194`) interpolates the entry
     text into a template string with no transform of any kind, and
     `extractToolsList` (`src/parser/frontmatter.ts:434`) now hands it a
     verbatim YAML source slice that spans lines. Nothing rejects, escapes,
     collapses or truncates the break.
  2. *No page says what the renderer does instead.*
     `docs/spec_topics/diagnostics/placeholder-rendering-b.md:74` is the
     parse-time literal-value `<value>` sub-rule the 0069 fix added this code
     to. It states quoting (bare when identifier-shaped, double-quoted
     otherwise, with a carve-out for unquoted YAML scalars) and says nothing
     about a value whose source text spans lines — nor about a value that is not
     a YAML scalar at all, which is what a recovered slice is. The fix needs
     spec text, not only code.
- **Related:**
  - [0069](./0069-tools-entry-residue-silently-dropped.md) — **fixed (0.62.0)**,
    the parent and the filing origin. Its §Fix *Residuals* item 2 (`:177–185`)
    records this exactly: "A block-mapping sequence item of two or more keys
    (`- name: read` / `    as: file_read`) recovers a slice containing `\n`,
    which the `<value>` interpolation carries into a `message` that
    `diagnostics/diagnostic-shape.md:34` describes as a single-line summary. The
    hazard class pre-exists in the same placeholder sub-rule … this fix's
    verbatim-slice recovery widens its reachability." This report is that
    filing. 0069 did not create the class: two sibling codes in the same
    sub-rule carry an author-controlled break into a `message` at HEAD and did
    so before 0.62.0 (measured in §Reproduction). What 0069 changed is
    reachability — before it, a non-scalar sequence item was dropped in
    `extractToolsList` and produced no message at all.
  - [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md)
    — **fixed (0.61.0)**, the first landed precedent and the source of the
    transform vocabulary. An author-controlled break in a recorded declared type
    or default source reached `renderBinderParamLine` unescaped and forged the
    binder system prompt's per-field line shape and its "exactly one"
    `Theta: /<name>` line. Fixed at the RENDER seam
    (`normaliseParamLineBreaks`), not at the recording seam: a break inside a
    string literal escapes to the two-character `\n`, every other break plus
    adjoining horizontal whitespace collapses to one U+0020, and the spec rule
    landed in the same commit. Its §Fix's route reasoning is the direct template
    for route B below.
  - [0087](./0087-echo-note-newline-unsanitised.md) — **fixed (0.56.0)**, the
    second landed precedent, on the user-facing `theta-system-note` channel: a
    bound `params:` value carrying a break rendered the `Running /<name>: …`
    note across two or more physical lines and forged a second such line. Fixed
    by applying System-note rendering rule 1 (whitespace collapse) per
    interpolated value inside `renderString`, again at the render seam. Both
    reports establish that an unescaped author-controlled break reaching a
    line-oriented rendering can forge that rendering's structural lines; this
    report measures the same forgery against
    `docs/spec_topics/diagnostics/diagnostic-shape.md:63`'s serialised content
    format.
  - [0104](./0104-tools-field-nonscalar-value-loads-empty-callable-set.md) —
    open, filed in this same wave: the whole-field non-scalar `tools:` value
    (`tools: {read: bash}`), 0069 §Fix *Residuals* item 1. Disjoint input class:
    that report's subject is `extractToolsList`'s final `return undefined`
    (`src/parser/frontmatter.ts:438`), which treats a non-scalar `tools:` VALUE
    as an absent field so the theta registers with an empty callable set and no
    diagnostic. This report's subject is a non-scalar sequence ITEM, which does
    reach a diagnostic (`:434`) — the defect is what that diagnostic's message
    contains. The two touch adjacent lines of the same function and neither fix
    depends on the other. One surface interaction, not an ordering one: 0104's
    §Fix leaves open whether `theta/load/malformed-tool-entry`'s *Trigger* widens
    to the field level, and a field-level `tools:` over an indented block mapping
    is itself a multi-line recovered text, so whichever lands second inherits the
    other's surface (§Fix constraint 4).
  - [0102](./0102-params-default-string-literal-raw-newline-admitted.md) and
    [0103](./0103-binder-description-argument-hint-lines-forgeable-by-newline.md)
    — open, filed in this same wave, the other two line-break filings descending
    from 0060. Disjoint surfaces (the `params:` default RHS token scanner; the
    binder system prompt's `Description:` / `Argument hint:` lines) and disjoint
    renderings, sharing only the transform vocabulary constraint 1 draws on. No
    ordering dependency in either direction.
  - [0041](./0041-params-block-mapping-rhs-silent-permissive.md) — **fixed
    (0.51.0)**, the origin of the `paramValueSource` recovery frame that
    `extractToolsList` reuses (`src/parser/frontmatter.ts:348–366`). Its own
    residual pin (`tests/params-block-mapping-rhs-refusal.test.ts:634–656`)
    holds that a multi-line block scalar still records a declared type carrying
    the break, and 0060 closed that at the render seam rather than at the
    recording seam. Same shape of choice as route A against route B here.
- **Affected** (every citation verified at HEAD `99b65438`, 0.62.0):
  - `src/parser/callable-set.ts:189–196` — **the emission site.** The leading
    malformed-arm block of `resolveCallableSet`'s per-entry loop (`:180`,
    parse at `:181`). `:194` is the whole of the rendering:
    ``message: `malformed 'tools:' entry '${raw}'; expected a Pi tool name or a
    .theta path, optionally followed by an 'as' clause` ``. `raw` is
    interpolated with no quoting, escaping, collapsing or truncation step. The
    pushed object carries `severity`, `code`, `file` and `message` and no
    `range` (`:190–195`), so this is a **file-only** diagnostic per
    `diagnostic-shape.md`'s located-site classification: the entry text inside
    the message is the only thing that locates the offending entry for the
    author. 0069 §Fix *Residuals* item 2 cites `:191`; at HEAD `:191` is the
    `severity` field and the interpolation is `:194`.
  - `src/parser/callable-set.ts:278–289` — `splitEntries`. The list arm
    (`:288`) trims each item, so a recovered slice loses leading and trailing
    whitespace — including a block scalar's trailing newline — and keeps every
    interior break and every interior indent. This is why the measured entry
    text is `name: read\n    as: file_read` and not `name: read\n    as:
    file_read\n`.
  - `src/parser/callable-set.ts:307–316` — `parseToolsEntry`. The token split
    is `raw.split(/\s+/)` (`:308`), which treats U+000A as ordinary whitespace,
    so a two-key block mapping is two-or-more tokens and lands on `malformed`
    (`:315`). The grammar is indifferent to which whitespace separated the
    tokens; only the message carries the difference.
  - `src/parser/frontmatter.ts:418–439` — `extractToolsList`, the recovery site
    the 0069 fix changed. `:434` —
    `entries.push(isScalar(item) ? String(item.value) : paramValueSource(item,
    yamlSource))` — is both carriers: the scalar arm carries a block scalar's
    own breaks, the non-scalar arm carries the slice's. `:438` is the
    whole-field `return undefined` that is bug 0104's subject, not this one.
    The `yamlSource` parameter (`:418`) is threaded from the single call site,
    `:919` (`extractToolsList(item.value, block?.yaml ?? "")`).
  - `src/parser/frontmatter.ts:348–366` — `paramValueSource` (bug 0035 / 0041),
    which slices `yamlSource` between the node's own `[range[0], range[1])`
    offsets (`:366`). Its doc comment states the reason the slice is verbatim:
    "the type side is theta's grammar, not YAML's, and a round-trip could
    reorder or requote what the author wrote". The same property makes the
    slice a faithful carrier of the author's line breaks and indentation.
  - `src/parser/frontmatter.ts:388–396` — `renderScalarValue`, whose doc
    comment (`:384–386`) names `placeholder-rendering-b.md` category 5 as its
    authority. Its one diagnostic consumer is
    `theta/load/model-unresolved` (`:1026`); `resolvedModel` reads it too
    (`:1019`). A string is returned unchanged (`:389–390`), so a `model: |`
    block scalar's breaks pass through. 0069 §Fix *Residuals* item 2 names
    `renderScalarValue` as the function a `mode: |` value reaches; it is not —
    `modeValue` is `String(item.value.value)` at `:851–853` and reaches its
    message at `:1073` directly. Both siblings carry the break; only the
    `model:` one goes through `renderScalarValue`.
  - `src/parser/frontmatter.ts:1064–1075` — the `theta/load/unknown-mode-value`
    site. `:1073` interpolates `modeValue` with no transform. Measured
    multi-line at HEAD, and reachable without any 0069 code — the pre-existing
    half of the hazard class.
  - `src/diagnostics/diagnostic.ts:64–91` — `renderDiagnosticLine`, the
    line-oriented rendering every author-facing surface goes through. `:72` /
    `:74` / `:76` are the three located-site line forms; `:80` appends
    `\n  hint: <hint>`; `:86` appends `\n  <file>:<line>:<col>: <message>` per
    related site. Both continuation lines are two-space-indented, and both are
    forgeable by a message carrying a break followed by two spaces (measured).
  - `src/diagnostics/diagnostic.ts:93–99` — `renderDiagnosticBatch`, which
    joins per-diagnostic blocks with `"\n\n"` (`:98`). A message containing
    `\n\n` therefore renders as two blank-line-separated blocks from one
    `Diagnostic` (measured).
  - `src/extension/production-composition.ts:172–210` — `makeLoadEmit` and its
    doc comment, the toast/stderr router. `:193` passes `diagnostic.message` to `ctx.ui.notify`
    unchanged; `:208` writes `` `theta: ${renderDiagnosticLine(diagnostic)}\n` ``
    to `process.stderr` when `ctx.hasUI` is false. This is the sink
    `discoverAndComposeFixtures` (`:345`) uses, and the one §Reproduction
    measures directly. On the shipped `session_start` path it is retained only
    as the note channel's off-channel delivery-failure fallback (`:1062–1066`).
  - `src/extension/production-composition.ts:1096–1104` — the shipped
    `session_start` sink. An error-severity load diagnostic routes through
    `preEvalRouter.routePreEvalFailure` with
    `content: renderDiagnosticBatch([diagnostic])` (`:1103`) and
    `details: { diagnostics: [diagnostic] }` (`:1104`), so the note content is
    the line-oriented render and the structured array carries the raw message.
    `:2307` is the bootstrap tier-1 equivalent.
  - `src/extension/system-note-channel.ts:336–351` — `emitDiagnosticBatch`,
    which is `content: renderDiagnosticBatch(diagnostics)` (`:346`). No
    sanitisation is applied to diagnostic content on this path: the serialised
    format is deliberately multi-line (hint and related continuation lines), so
    the channel cannot distinguish a structural line from a message-embedded
    one.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:34` — `message: string,
    // single-line summary`, inside the normative internal diagnostic shape
    block (`:28–40`). `:63` — **Serialised content format**, which fixes the
    three main-line forms, the optional `"\n  hint: <hint>"` continuation, the
    related-site line ("indented by two spaces (matching the hint line) and
    following the format `"  <file>:<line>:<col>: <message>"` … **no** `<code>`
    prefix"), and the batch rule ("each `Diagnostic` becomes one such line block
    and successive blocks are separated by a single blank line"). `:65` —
    multi-error reporting, one `pi.sendMessage` per `.theta`. `:72` — DIAG-2 and
    its same-commit rule. `:74` — DIAG-4, the *Message* column normative
    character-for-character with placeholders interpolated, wording changes
    deferred to theta 2.0.
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md:74` — the
    parse-time literal-value `<value>` sub-rule, and the enumeration the 0069
    fix added `theta/load/malformed-tool-entry` to. Its rendering rule is
    "rendered as the literal source text verbatim per category 5's `<key>`
    (bare-when-identifier-shaped, double-quoted otherwise) — except that YAML
    scalars with no enclosing source quoting (e.g. `mode:` values) render
    unquoted regardless of identifier shape". No sentence covers a line break;
    no sentence covers a value that is not a YAML scalar. `:51` — the §7
    placeholder list carrying `<value>` "(in the parse-time literal-value
    position…)". `:11` — category 5's `<key>` rule the sub-rule defers to.
  - `docs/spec_topics/diagnostics/placeholder-rendering-a.md:7` — §Closure. The
    placeholder set is closed and "enforced at build time"; introducing,
    retiring or moving a placeholder is a GOV-7 / GOV-8 breaking change. No new
    placeholder is available to this fix.
  - `docs/spec_topics/diagnostics/code-registry-load.md:25` — the
    `theta/load/malformed-tool-entry` row (E, load). Its *Message* is the
    template the emission site renders, and its *Trigger* states the recovery
    this report's input class exercises: "A `tools:` sequence item that is not a
    YAML scalar is recovered as its own verbatim source text and judged by this
    same grammar rather than being dropped unexamined." Mirrored at
    `docs/reference/diagnostics.md:188`.
  - `docs/reference/diagnostics.md:19` — the `message` / "single-line summary"
    mirror; `:30–32` — the serialised `content` line-format mirror, including
    the `+ "\n  hint: <hint>"` continuation. `:7` — the DIAG-4 sentence this
    page rests on. No `docs/reference/` page mirrors
    `placeholder-rendering-b.md` §7 itself
    (`rg -ln 'placeholder' docs/reference/` returns `diagnostics.md` and
    `discovery-cli.md`, neither carrying the categories).
  - `docs/spec_topics/frontmatter/frontmatter-fields-a.md:88` — the
    closed-per-entry-grammar sentence the 0069 fix added, which states the
    disposition of "any `tools:` sequence item that is not a YAML scalar" and
    says nothing about what the resulting diagnostic renders. `:76`–`:85` — the
    two entry kinds and the `as <name>` clause. Mirrored at
    `docs/reference/frontmatter.md:134–137`.
  - `tests/tools-entry-closed-grammar.test.ts` — 0069's witness, and the file
    that re-pins under either route. `:194–344` is the group (B) harness this
    report's probes reuse. `:146–150` carries the *Message* template
    as a constant; `:158–161` is `malformed(value)`, the
    `replaceAll("<value>", value)` render every asserting cell uses; `:172–186`
    is group (A), which asserts the constant IS the registry row read through
    the DIAG-4 `registryMessage` seam (`:112–123`, `:129`). Six group (B)
    production-load cells assert the rendered message verbatim by
    `toContain(malformed(...))`: `:373–380`, `:390–396`, `:407–413`,
    `:424–430`, `:441–447`. The non-scalar-item cell `:459–470` is the
    exception — it asserts only `notifications.some(n => n.includes("{a: b}"))`,
    and its comment states why ("Which code fires is the implementation's to
    settle"). Group (C)'s `expectMalformed` (`:553–573`) asserts
    `dg?.message` `.toBe(malformed(entry))` at `:563`, reached from `:589`,
    `:594`, `:612`, `:619`, `:624` and `:652`. Every entry text in the file is
    single-line, so no cell pins the multi-line rendering in either direction.
  - `tests/tools-entry-closed-grammar-lockstep.test.ts` — 0069's other witness.
    It asserts no diagnostic message (`rg -n 'message'` returns one comment,
    `:25`), so it does not re-pin.
  - `tests/live/acceptance/harness.ts:489–494` — `acceptanceStderrOffenders`,
    the H9a stderr gate's line splitter: `stderr.split(/\r?\n/)`, blank lines
    filtered, then the allowlist filter. `ACCEPTANCE_STDERR_ALLOWLIST` is empty
    (`:479`), so the gate is the empty-capture form; `assertStderrClean`
    (`:534`) asserts the offender array equals `[]`. A multi-line diagnostic
    written to stderr yields one offender per physical line (measured).
  - `tests/fixtures/h7a/permitted-codes.json` — 11 codes, and
    `theta/load/malformed-tool-entry` is not among them. The only H9a fixture
    carrying `tools:` at all is
    `tests/live/acceptance/fixtures/acc-code-tool-loop.theta` (a single-token
    `- read`), so no live area reaches this code today.
  - **The corpus.** 35 committed `.theta` / `.thetalib` files
    (`find . \( -name "*.theta" -o -name "*.thetalib" \) -not -path
    "./node_modules/*" -not -path "./.git/*"`); 14 carry `tools:`. Every entry
    in all 14 is a plain single-token scalar or a `.theta` path.
    `rg -n '^\s*-\s*[\{\[]' --glob '*.theta' --glob '*.thetalib' .` returns
    zero non-scalar sequence items, and
    `rg -n '^(mode|model):\s*[|>]' --glob '*.theta' --glob '*.thetalib' .`
    returns zero block-scalar `mode:` / `model:` values. No committed file
    produces a multi-line message under any of the three carriers.
  - **No invariant test.** No cell in `tests/` asserts that a `Diagnostic`'s
    `message` carries no line break. `rg -n 'single-line' tests/` returns only
    `theta/parse/single-line-if` cells and prose comments.
- **Observed at:** `0.62.0` (HEAD `99b65438`). Offline, deterministic; no live
  model, no provider. Scratch vitest over a real on-disk `<workspace>/.pi/theta/`
  discovery workspace through `discoverAndComposeFixtures` with a `ctx.ui.notify`
  collector — the group (B) harness pattern of
  `tests/tools-entry-closed-grammar.test.ts:194–344` — with the real
  `renderDiagnosticLine` / `renderDiagnosticBatch` and the real
  `acceptanceStderrOffenders` applied to the messages that run produced;
  written, run, deleted.

## Summary

The bug 0069 fix (0.62.0) closed the `tools:` per-entry grammar and gave the
rejection a registered code, `theta/load/malformed-tool-entry`. Its message
names the offending entry verbatim through the `<value>` placeholder:

```ts
message: `malformed 'tools:' entry '${raw}'; expected a Pi tool name or a .theta path, optionally followed by an 'as' clause`,
```

`src/parser/callable-set.ts:194`. The same fix made `extractToolsList` recover a
non-scalar sequence item as its own verbatim YAML source slice
(`src/parser/frontmatter.ts:434`) instead of dropping it. A block-mapping
sequence item of two or more keys is therefore recovered as a slice that spans
lines, and `raw` carries the author's U+000A and interior indentation into the
message unchanged:

```
tools:
  - name: read
    as: file_read
```

renders `malformed 'tools:' entry 'name: read\n    as: file_read'; expected a Pi
tool name or a .theta path, optionally followed by an 'as' clause` — a `message`
of two physical lines where `docs/spec_topics/diagnostics/diagnostic-shape.md:34`
says single-line summary. Three keys give three lines. Every author-facing
rendering inherits the break: the headless stderr mirror writes two physical
lines with only the first carrying its `theta: ` prefix, and the shipped
`session_start` note content (`renderDiagnosticBatch([diagnostic])`) carries the
same.

The break also reaches the structural lines of that rendering.
`docs/spec_topics/diagnostics/diagnostic-shape.md:63` makes the serialised
content format line-oriented and reserves two-space-indented continuation lines.
Measured forgeries, from a `tools:` sequence written at column 0 so the mapping
keys sit at column 2:

- `- name: read` / `  hint: write 'read' instead` renders a second physical line
  matching `^ {2}hint: ` — the shape `src/diagnostics/diagnostic.ts:80` emits
  for a `hint` field, on a diagnostic that carries none.
- `- name: read` / `  /proj/other.theta:9:9: forged related site` renders a
  second physical line matching `^ {2}\S+:\d+:\d+: ` — the related-site shape
  `src/diagnostics/diagnostic.ts:86` emits, on a diagnostic whose `related` is
  absent.
- A blank line inside the item puts `\n\n` in the message, so
  `renderDiagnosticBatch([diagnostic])` — one `Diagnostic` — renders as two
  blank-line-separated blocks, and a real two-diagnostic batch renders as three.

This is the shape bugs 0060 and 0087 fixed at two other renderers.

The hazard class pre-exists 0069 and is not confined to this code. Two sibling
codes in the same `<value>` sub-rule carry an author-controlled break into a
`message` at HEAD with no 0069 code involved: `theta/load/unknown-mode-value`
for a `mode: |` block scalar (`src/parser/frontmatter.ts:1073`, value taken at
`:851–853`) and `theta/load/model-unresolved` for a `model: |` block scalar
(`:1026`, through `renderScalarValue`). Both measured multi-line below. What
0069 changed is reachability: before it, a non-scalar sequence item was dropped
in `extractToolsList` and produced no message at all, and a two-token block
scalar item was silently truncated to its first token. `placeholder-rendering-b.md:74`
is silent on both halves — it says nothing about a value whose source text spans
lines, and nothing about a value that is not a YAML scalar, which is what a
recovered slice is.

## Reproduction

Offline, at `99b65438`. Scratch vitest over a real on-disk
`<workspace>/.pi/theta/` workspace driven through `discoverAndComposeFixtures`
with a `ctx.ui.notify` collector (the group (B) harness of
`tests/tools-entry-closed-grammar.test.ts` verbatim: `ctx.cwd = <workspace>`,
`ctx.modelRegistry.getAvailable() = []`, `ctx.hasUI` absent so the stderr mirror
runs, plus a `{}` `.pi/settings.json` to suppress the bug 0013 warning surface).
Every planted body is `` @`hi` ``, so no callable is named and the only
reachable diagnostic is the frontmatter one. `msg` is the collected
`ctx.ui.notify` string, JSON-escaped; `lines` is `msg.split("\n").length`.

### The recovered slice in the message

```
@@ tools:\n  - name: read\n    as: file_read
   msg   "malformed 'tools:' entry 'name: read\n    as: file_read'; expected a Pi tool name or a .theta path, optionally followed by an 'as' clause"
   lines 2   blankLine false

@@ tools:\n  - name: read\n    as: file_read\n    extra: x
   msg   "malformed 'tools:' entry 'name: read\n    as: file_read\n    extra: x'; expected …"
   lines 3   blankLine false

@@ tools:\n  - name: read\n\n    as: file_read                      [blank line inside the item]
   msg   "malformed 'tools:' entry 'name: read\n\n    as: file_read'; expected …"
   lines 3   blankLine true

@@ tools:\n  - - read\n    - grep                                    [nested block sequence item]
   msg   "malformed 'tools:' entry '- read\n    - grep'; expected …"
   lines 2

@@ tools:\n  - |\n    read\n    grep                                 [block SCALAR item — the scalar arm]
   msg   "malformed 'tools:' entry 'read\ngrep'; expected …"
   lines 2
```

Single-line controls, including 0069's own non-scalar row:

```
@@ tools:\n  - {a: b}          [0069's row]   msg "malformed 'tools:' entry '{a: b}'; expected …"        lines 1
@@ tools:\n  - {a: b, c: d}                   msg "malformed 'tools:' entry '{a: b, c: d}'; expected …"  lines 1
@@ tools:\n  - a: b            [one key]      msg "malformed 'tools:' entry 'a: b'; expected …"          lines 1
@@ tools: read, grep           [clean]        registers; no notification
```

The registered set across the whole run was `["ctlcomma"]` — every malformed
row un-registers, which is 0069's contract and is unaffected here. The
single-key flow and block mappings recover a one-line slice and render a
one-line message; the multi-key block mapping is the shape that changes the
line count. `splitEntries`' trim (`src/parser/callable-set.ts:288`) removes the
block scalar's trailing newline and the slice's surrounding whitespace, and
keeps every interior break and indent.

Every one of these entry texts is rendered **bare** inside the template's single
quotes. For a YAML scalar entry — the block-scalar item's `read\ngrep`, and
0069's own `read grep` / `read as` rows — that matches
`placeholder-rendering-b.md:74`'s carve-out for "YAML scalars with no enclosing
source quoting". For a recovered non-scalar slice (`{a: b}`,
`name: read\n    as: file_read`) the carve-out does not apply — the value is not
a scalar — and the sub-rule's `<key>` arm would double-quote it, because none of
these slices is identifier-shaped. The emission site applies no quoting step at
all (`:194`).

### The pre-existing siblings, with no 0069 code reached

```
@@ mode: |\n  prompt\n  extra   +  model: sonnet
   msg   "unknown 'mode:' value 'prompt\nextra\n'; expected 'prompt' or 'subagent'"
   lines 3        [theta/load/unknown-mode-value; src/parser/frontmatter.ts:1073]

@@ mode: prompt  +  model: |\n  sonnet\n  extra
   msg   "theta 'model:' value 'sonnet\nextra\n' resolves to no available model, or is ambiguous across providers"
   lines 3        [theta/load/model-unresolved; :1026, through renderScalarValue]

@@ mode: prompt  +  model: sonnet                [control]
   msg   "theta 'model:' value 'sonnet' resolves to no available model, or is ambiguous across providers"
   lines 1
```

Neither carrier passes through any code the 0069 fix touched. Both retain the
block scalar's trailing newline, because neither value is trimmed the way a
`tools:` entry is — so the `mode:` message ends with a break and renders a third
line consisting of `'; expected 'prompt' or 'subagent'` alone.

### The line-oriented consumers

The messages above, fed to the real renderers. `renderDiagnosticLine` is applied
to the diagnostic the load path actually pushes: `file` present, `range` absent
for the `tools:` code (the file-only form,
`src/diagnostics/diagnostic.ts:74`). `stderrOffenders` is
`acceptanceStderrOffenders("theta: " + rendered + "\n")`, the H9a gate's own
splitter (`tests/live/acceptance/harness.ts:489–494`).

```
@@ two-key item              renderedLines 2   stderrOffenders 2   batchBlocks(one diagnostic) 1
@@ three-key item            renderedLines 3   stderrOffenders 3
@@ blank-line item           renderedLines 3   stderrOffenders 2   batchBlocks(one diagnostic) 2
                                                                  batchBlocks(two diagnostics) 3
@@ mode: | (three-line msg)  renderedLines 3   stderrOffenders 3
@@ single-line control       renderedLines 1   stderrOffenders 1   batchBlocks(one diagnostic) 1
```

The blank-line row yields two offenders rather than three because the gate drops
whitespace-only lines before the allowlist filter; the block-boundary forgery is
the same input's effect on `renderDiagnosticBatch`, which splits nothing and
merely joins with `"\n\n"`.

The stderr writes were produced by the shipped router itself
(`src/extension/production-composition.ts:208`) during the run, verbatim:

```
theta: <ws>/.pi/theta/twokey.theta: theta/load/malformed-tool-entry: malformed 'tools:' entry 'name: read
    as: file_read'; expected a Pi tool name or a .theta path, optionally followed by an 'as' clause
theta: <ws>/.pi/theta/modeblock.theta:2:7: theta/load/unknown-mode-value: unknown 'mode:' value 'prompt
extra
'; expected 'prompt' or 'subagent'
```

Only the first physical line of each carries the `theta: ` prefix and the
`<file>: <code>:` segment.

### The forged continuation lines

A `tools:` sequence at column 0 puts the item's mapping keys at column 2 — the
same indent `renderDiagnosticLine` uses for its two continuation lines.

```
@@ tools:\n- name: read\n  hint: write 'read' instead
   renderedLines
     ["<file>: theta/load/malformed-tool-entry: malformed 'tools:' entry 'name: read",
      "  hint: write 'read' instead'; expected a Pi tool name or a .theta path, optionally followed by an 'as' clause"]
   lines matching ^ {2}hint:                 1        [the diagnostic carries no hint]
   lines matching ^ {2}\S+:\d+:\d+:          0

@@ tools:\n- name: read\n  /proj/other.theta:9:9: forged related site
   renderedLines
     ["<file>: theta/load/malformed-tool-entry: malformed 'tools:' entry 'name: read",
      "  /proj/other.theta:9:9: forged related site'; expected a Pi tool name or a .theta path, optionally followed by an 'as' clause"]
   lines matching ^ {2}hint:                 0
   lines matching ^ {2}\S+:\d+:\d+:          1        [the diagnostic carries no related array]

@@ tools:\n  - name: read\n    as: file_read           [control, four-space continuation]
   lines matching ^ {2}hint:                 0
   lines matching ^ {2}\S+:\d+:\d+:          0
```

Both forged lines carry the message's own tail (`'; expected …`) after the
forged content, so a consumer parsing them recovers a hint or a related site
whose text runs into the rejection template. The structured
`details.diagnostics` array carried alongside the note
(`src/extension/production-composition.ts:1104`) holds the raw `message` and is
not affected by the split.

### Not measured

No H9a spawn was driven. The stderr gate figures above are that gate's own
splitter applied to the line the shipped router produced, not an end-to-end
`pi -p` capture; on the shipped `session_start` path `makeLoadEmit` is reached
only as the note channel's delivery-failure fallback
(`src/extension/production-composition.ts:1062–1066`), and no H9a fixture
reaches this code (`theta/load/malformed-tool-entry` is absent from
`tests/fixtures/h7a/permitted-codes.json`; the one `tools:`-bearing acceptance
fixture carries a single-token `- read`). Nothing is claimed about the operator's
rendered transcript: `pi.registerMessageRenderer` returns a `pi-tui` component
and this report measured the `content` string that feeds it, which is what
`diagnostic-shape.md:63` governs.

## Expected behaviour

- **`message` is one line.**
  `docs/spec_topics/diagnostics/diagnostic-shape.md:34` states the field as
  `message: string, // single-line summary`, inside the normative shape block,
  and `docs/reference/diagnostics.md:19` states the same to the same reader. A
  two- or three-line `message` is not that field. No page qualifies the claim by
  code, phase or value provenance.
- **The structural lines of the serialised format are the renderer's, not the
  author's.** `diagnostic-shape.md:63` reserves `"\n  hint: <hint>"` for a
  `hint` field, the two-space-indented `"  <file>:<line>:<col>: <message>"` form
  for one element of `Diagnostic.related`, and a single blank line for a block
  boundary in a multi-error batch. A `message` that reproduces any of those
  shapes makes the rendered block describe a diagnostic that was not emitted.
  This is the invariant bug 0060 (`Theta: /<name>` exactly once, one physical
  per-field line) and bug 0087 (`Running /<name>: …` exactly once) established
  at two other renderers; both were fixed by transforming the interpolated
  value at the render seam.
- **The `<value>` sub-rule states what it renders.**
  `docs/spec_topics/diagnostics/placeholder-rendering-b.md:74` fixes quoting for
  two cases — identifier-shaped and not, with an unquoted carve-out for YAML
  scalars — and the 0069 fix added
  `theta/load/malformed-tool-entry` to its enumeration. Two properties of the
  values that code now renders are outside every sentence on the page: a source
  text that spans lines, and a value that is not a YAML scalar at all. That
  silence is why the implementation's current behaviour cannot be called
  conformant or non-conformant on the quoting axis, and why the newline axis has
  no rule to conform to.
- **The diagnostic still identifies the offending entry.** The code is
  file-only — `src/parser/callable-set.ts:190–195` pushes no `range` — so the
  entry text inside the message is the only thing that tells the author which
  `tools:` item was rejected. `code-registry-load.md:25`'s *Trigger* commits to
  naming it ("recovered as its own verbatim source text and judged by this same
  grammar"), and `frontmatter-fields-a.md:88` makes the non-scalar sequence item
  a first-class member of the refused set. Whatever transform lands has to leave
  the entry recognisable.
- **A carrier's reachability does not change the rule it must satisfy.** The
  `mode: |` and `model: |` siblings violate `:34` at HEAD and violated it before
  0.62.0. The single-line requirement is one rule over one field, so a fix
  scoped to the `tools:` carrier alone leaves two known carriers open.

## Why it matters

- **A registered diagnostic renders text that breaks its own stated shape.**
  `diagnostic-shape.md:34` is normative and mirrored to users at
  `docs/reference/diagnostics.md:19`. Three codes across four carriers produce a
  multi-line `message` at HEAD (measured), and nothing anywhere in `tests/`
  asserts the property, so no gate scores it.
- **The forgeries are the 0060 / 0087 class, on the diagnostics channel.** A
  two-key `tools:` item whose second key is spelled `hint` produces a rendered
  block carrying a `  hint: …` line for a diagnostic with no hint; a key spelled
  like a `path:line:col` triple produces a related-site line for a diagnostic
  with no related array; a blank line inside the item makes one `Diagnostic`
  render as two batch blocks (all measured). Both landed precedents treated the
  same capability — an author-controlled break reaching a line-oriented
  rendering — as the defect, independently of whether a consumer was known to
  misparse it.
- **The offending value is author-controlled and reaches the rendering with no
  intermediary.** `paramValueSource` is verbatim by design
  (`src/parser/frontmatter.ts:348–366`), `splitEntries` only trims
  (`src/parser/callable-set.ts:288`), `parseToolsEntry` classifies without
  reshaping (`:308`), and the message interpolates `raw` directly (`:194`). No
  step between the author's bytes and the rendered line inspects the text.
- **The gate that would notice on the live axis counts lines.**
  `acceptanceStderrOffenders` splits on `/\r?\n/`
  (`tests/live/acceptance/harness.ts:490`) and `ACCEPTANCE_STDERR_ALLOWLIST` is
  empty, so one diagnostic reaching stderr reports as two or three offenders
  under bug 0030's empty-capture gate. That path is the note channel's
  delivery-failure fallback rather than the primary sink, so it is a latent
  count change, not a current red.
- **0069 widened reachability from zero.** Before 0.62.0 a non-scalar sequence
  item produced no diagnostic at all, so no message existed to be multi-line.
  The recovery is what makes an arbitrary author-written YAML sub-document —
  block mapping, nested sequence, any depth — the text of a diagnostic message.
  The corpus census is zero committed occurrences, so the input class is reached
  only by an author writing the shape for the first time, which is exactly the
  moment the diagnostic has to be readable.
- **The spec silence blocks the fix, not only the diagnosis.** Any transform
  changes what a `<value>` interpolation renders, and
  `placeholder-rendering-b.md:74` is the one page that states that rendering.
  Leaving the code correct and the page silent is the state 0069 §Fix
  constraint 4 declined to accept for the grammar itself ("without it the
  implementation would be enforcing a rule the spec does not state").

## Non-goals

- **Widening or narrowing the closed entry grammar.** `parseToolsEntry`'s two
  admitted token shapes, the all-or-nothing un-registration, and the ordering
  against `theta/load/invalid-tool-rename` are 0069's settled contract and are
  untouched. Every measured row here already un-registers correctly.
- **Whether a non-scalar sequence item should be recovered at all.** 0069 §Fix
  constraint 3 settled that it is, and `code-registry-load.md:25` and
  `frontmatter-fields-a.md:88` state it. This report is about what the resulting
  message renders, not about reverting the recovery.
- **The whole-field non-scalar `tools:` value.** `tools: {read: bash}` returns
  `undefined` from `extractToolsList` (`src/parser/frontmatter.ts:438`) and the
  theta registers with an empty callable set and no diagnostic. Disjoint input
  class, filed as
  [0104](./0104-tools-field-nonscalar-value-loads-empty-callable-set.md).
- **The `<value>` quoting question, as a subject of its own.** A recovered
  non-scalar slice is rendered bare where `placeholder-rendering-b.md:74`'s
  `<key>` arm would double-quote it (measured). It is recorded here because the
  same sentence has to state both dispositions, not because this report
  adjudicates the quoting.
- **Reworking the serialised content format.** `diagnostic-shape.md:63`'s
  continuation-line and block-separator shapes are the contract the forgery
  exploits; making them unforgeable by changing them (a length prefix, a
  distinct sentinel) is a separate adjudication with its own consumers. The
  transform belongs on the interpolated value, as it did in 0060 and 0087.
- **The 120-code-point cap.** System-note rendering rule 2's cap
  (`docs/spec_topics/binder/defaulting-system-note-echo.md:19`) applies to
  binder notes, not to diagnostic content, and no cap bounds a recovered slice's
  length. Bounding the length is a possible side effect of a truncating
  transform, not a requirement this report states.

## Fix

Not yet decided. Two seams close the newline; the choice is an in-run
adjudication, and they differ in how much of the hazard class they close.

**Route A — transform at the emission site.**
`resolveCallableSet`'s malformed arm (`src/parser/callable-set.ts:189–196`)
truncates or summarises `raw` before interpolating it, so only
`theta/load/malformed-tool-entry` changes. Smallest diff, and the only site that
knows the interpolated value is a `tools:` entry rather than an arbitrary
literal, so a truncation rule can be written against the entry grammar. It
leaves the `mode: |` and `model: |` siblings (`src/parser/frontmatter.ts:1073`,
`:1026`) rendering multi-line, and it puts the rule in one caller rather than in
the renderer the rule belongs to, so the next `<value>` site added is free to
regress.

**Route B — transform in the placeholder renderer.** The `<value>` rendering
gains a line-break transform that every parse-time literal-value interpolation
inherits, so the enumerated seven codes at
`docs/spec_topics/diagnostics/placeholder-rendering-b.md:74` are covered
together and the pre-existing `mode: |` / `model: |` siblings close with the
`tools:` one. `renderScalarValue` (`src/parser/frontmatter.ts:388–396`) is the
existing function whose doc comment already claims category-5 authority, but it
is module-private to `frontmatter.ts` and is not on the `callable-set.ts` path,
and `modeValue` bypasses it (`:851–853`), so route B means one shared renderer
that all three sites call rather than an edit to that function alone. This is
the structural choice and the one both precedents took: 0060 put
`normaliseParamLineBreaks` inside `renderBinderParamLine` so every caller of the
exported renderer inherited it, and 0087 put rule 1 inside `renderString` per
interpolated value.

Constraints on either route:

1. **The transform's arms are stated, not implied.** 0060's shipped vocabulary
   is the reference: a break inside a string literal escapes to the
   two-character `\n`; every other break, together with adjoining horizontal
   whitespace, collapses to one U+0020. 0087's is rule 1's whitespace collapse
   and trim. A `tools:` entry is not a theta string literal, so the escaping arm
   has no subject here and the collapse arm is the candidate — but interior
   indentation is part of what makes a recovered slice readable, so a collapse
   that folds `name: read\n    as: file_read` to `name: read as: file_read`
   changes the text an author matches against their file. Whichever arm lands,
   the rule states what happens to U+000A, to `\r\n` and bare `\r` (the lexical
   newline set; a slice's bytes are not source-normalised), to the
   whitespace adjoining a break, and to a message that would otherwise end with
   a break (the `mode: |` row does).
2. **The value stays recognisable.** The code is file-only — no `range`
   (`src/parser/callable-set.ts:190–195`) — so the entry text is the only
   locator the author gets. A transform that truncates has to say where it cuts
   and what marks the cut, and a summarising transform has to keep enough of the
   author's own bytes that the offending item is identifiable among sibling
   entries. This is the tension the route decision resolves: one-line shape
   against value preservation. Adding a `range` to the diagnostic is a separate
   change and is not a substitute — the located-site classification
   (`diagnostic-shape.md:44`) would have to admit it and the recovery would have
   to carry the item's own offsets.
3. **The rendering rule is a same-commit spec edit, and no new placeholder is
   available.** `docs/spec_topics/diagnostics/placeholder-rendering-b.md:74` is
   the sentence that must state the transform (route B) or record the
   per-code departure (route A); §7's `<value>` sub-rule is where a reader
   looks. The placeholder table is CLOSED and build-time enforced
   (`placeholder-rendering-a.md:7`), and introducing, retiring or moving a
   placeholder is a GOV-7 / GOV-8 breaking change, so no new placeholder may be
   introduced for this. DIAG-4 (`diagnostic-shape.md:74`) makes the *Message*
   template normative character-for-character and defers wording changes to
   theta 2.0, so the template at `code-registry-load.md:25` must stay
   byte-identical — what changes is what `<value>` interpolates, not the text
   around it. DIAG-2's same-commit rule (`:72`) governs the pairing. Mirror
   obligations: `docs/reference/diagnostics.md:188` (the *Message* row, unedited
   if the template is unedited) and `:19` / `:30–32` (the `message`
   "single-line summary" line and the serialised content format), which are the
   only `docs/reference/` statements this fix's subject reaches — no
   `docs/reference/` page mirrors §7's categories.
4. **The four carriers are enumerated and their disposition recorded.**
   `theta/load/malformed-tool-entry` via the non-scalar-slice arm
   (`src/parser/frontmatter.ts:434`, `src/parser/callable-set.ts:194`);
   `theta/load/malformed-tool-entry` via the block-scalar item arm (the same
   `:434`, scalar branch); `theta/load/unknown-mode-value` (`:1073`, value at
   `:851–853`); `theta/load/model-unresolved` (`:1026`, through
   `renderScalarValue`). Route A closes the first two and must state that it
   leaves the last two, with the reason. Route B closes all four and must
   confirm the other four codes in §7's enumeration
   (`unknown-methodology-value`, `unknown-bind-context-value`,
   `duplicate-enum-value`, `duplicate-discriminator-value`) either cannot carry
   a break or inherit the transform harmlessly — measured, not assumed. If
   [0104](./0104-tools-field-nonscalar-value-loads-empty-callable-set.md) lands
   first and widens this code's *Trigger* to the whole-field shape, a fifth
   carrier exists (a `tools:` field over an indented block mapping recovers a
   multi-line text of its own) and the enumeration is re-taken at this fix's
   baseline; if this fix lands first, 0104's new emission inherits whatever
   transform is in place.
5. **0069's message-asserting witness cells re-pin.**
   `tests/tools-entry-closed-grammar.test.ts` renders the expected string
   through `malformed(value)` (`:158–161`) from the registry-sourced template
   (`:146–150`, checked against the live registry at `:172–186` via the DIAG-4
   `registryMessage` seam `:112–129`). Six group (B) cells assert it verbatim
   (`:373–380`, `:390–396`, `:407–413`, `:424–430`, `:441–447`) and group (C)'s
   `expectMalformed` asserts `dg?.message` at `:563` from `:589`, `:594`,
   `:612`, `:619`, `:624`, `:652`. Every entry text in that file is single-line,
   so a transform that is identity on break-free text leaves all of them green —
   which is the property to verify first, since the alternative is a
   whole-file rewrite. The non-scalar cell `:459–470` asserts only
   `includes("{a: b}")` and stays green for a single-line slice either way.
   `tests/tools-entry-closed-grammar-lockstep.test.ts` asserts no message and is
   untouched.
6. **The witness pins the new rows in both directions, and the forgeries by
   name.** Required beyond the re-pinned cells: the two-key and three-key
   block-mapping items asserted on the rendered message with the physical-line
   count; the blank-line item asserted on `renderDiagnosticBatch([d])` producing
   ONE block; the `hint`-key and `path:line:col`-key items asserted to produce
   no line matching `^ {2}hint: ` and none matching `^ {2}\S+:\d+:\d+: `; the
   nested-sequence and block-scalar items; the single-key flow and block
   mappings asserted byte-identical to today (`'{a: b}'`, `'a: b'`), which is
   the identity half; and — under route B — the `mode: |` and `model: |` rows.
   Each cell must red against the pre-fix bytes for the bug's symptom, which
   here means the line count or the forged-line match, never a compile error.
7. **GOV-15 is not engaged by a rendering change, and that must be confirmed
   rather than assumed.** No code is added or removed and no input's
   diagnostic-code sequence moves: every row measured in §Reproduction emits the
   same code before and after, with the same severity, and un-registers the same
   theta. `docs/spec_topics/governance/source-language-stability.md`'s
   diagnostic-registry carve-out is therefore not reached, and
   `tests/fixtures/h7a/permitted-codes.json` needs no entry (the code is absent
   from it today and no H9a fixture reaches it — re-confirm at the fix
   baseline). What does move is the rendered text of an existing code, which is
   DIAG-4's subject and is why constraint 3 keeps the template byte-identical.
8. **The corpus census is re-run at the fix baseline.** Measured here: 35
   committed `.theta` / `.thetalib` files, 14 with `tools:`, zero non-scalar
   sequence items, zero block-scalar `mode:` / `model:` values, so zero
   committed files change their rendered diagnostic. The census must reach
   fixtures that are TypeScript string literals as well as committed corpus
   files — `tests/tools-entry-closed-grammar.test.ts`'s planted workspace is
   exactly such a fixture set and is the one that re-pins.

## Fix (0.217.0)

- What shipped:
  - `src/diagnostics/diagnostic.ts` — new exported
    `normaliseLiteralValueLineBreaks`, appended at the end of the file so no
    existing line in it moves. Byte identity on text carrying neither U+000D
    nor U+000A; every maximal run of U+0020 / U+0009 / U+000D / U+000A that
    contains at least one break collapses, run and all, to one U+0020; a
    break-free run is preserved verbatim; leading and trailing U+0020 are then
    trimmed. No string-literal escape arm — a `tools:` entry and a YAML scalar
    are not theta string literals, so 0060's escape arm has no subject
    (§Fix constraint 1). This is route B, the structural seam: one function
    answering one spec sentence, not one rule per caller.
  - `src/parser/callable-set.ts` — the transform wraps `raw` at
    `theta/load/malformed-tool-entry` and the derived `name` at
    `theta/load/invalid-derived-tool-name`. The companion `<path>` binding
    (`parsed.spec`) is left bare: it is a category-5 path placeholder and a
    whitespace-split token, not this sub-rule's subject.
  - `src/parser/frontmatter.ts` — the transform wraps the `<value>` binding of
    `theta/load/unknown-methodology-value`,
    `theta/load/model-unresolved` (at the message site only, outside
    `renderScalarValue`, whose result also feeds `resolvedModel` and is a
    resolution value rather than a rendering),
    `theta/load/unknown-mode-value`, and
    `theta/load/unknown-bind-context-value`.
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md` — §7's
    parse-time literal-value `<value>` sub-rule now states the transform
    normatively for every `theta/load/*` row in its enumeration (the four
    arms, the disposition of `\r\n` and bare `\r`, the adjoining horizontal
    whitespace, and the block scalar's clip-retained trailing break), and
    records that the two `theta/parse/*` rows bind theta source rather than
    YAML — a cooked string-literal value for `duplicate-enum-value`, a raw
    source slice for `duplicate-discriminator-value` — and are not governed by
    it. Two normative test vectors added (the two-key `tools:` slice, the
    `mode: |` value). The same-commit spec obligation of DIAG-2 / §Fix
    constraint 3 (`diagnostic-shape.md` §Code registry rules).
  - `tests/tools-entry-message-line-break.test.ts` — new offline witness,
    30 cells.
  - `tests/live/malformed-tool-entry-message-single-line-live-cell.test.ts` —
    new H8a cell over the real `session_start` → `theta-system-note` path.
  - No registry *Message* template moved (DIAG-4), no placeholder introduced,
    retired or moved (`placeholder-rendering-a.md` §Closure, GOV-7 / GOV-8),
    and no `docs/reference/` edit was needed: `diagnostics.md`'s
    "single-line summary" line and its serialised-content-format lines become
    TRUE under this fix, and its *Message* mirror row is unedited because the
    template is unedited.
- Gates:
  - Witness, red before: `npx vitest run tests/tools-entry-message-line-break.test.ts`
    → `Tests  26 failed | 4 passed (30)`, every red a physical-line count, a
    forged `  hint: ` / `  <file>:<line>:<col>: ` line, a batch-block count, or
    an embedded-U+000A assertion — never a compile error.
  - Witness, green after: `Test Files  1 passed (1)` / `Tests  30 passed (30)`.
  - Full default suite: `npm test` → `Test Files  404 passed (404)` /
    `Tests  8406 passed (8406)` (baseline before this fix: 403 / 8376; the
    delta is this fix's own witness file).
  - `npm run typecheck` → `tsc -p tsconfig.json --noEmit`, no diagnostics.
  - `npm run lint` → `eslint --no-error-on-unmatched-pattern "src/**/*.ts"`,
    no findings.
  - Live H8a:
    `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/malformed-tool-entry-message-single-line-live-cell.test.ts`
    → `Tests  1 passed (1)`. Red direction proved in the same session by
    reverting the `malformed-tool-entry` wrap: the cell reds with
    "the rendered note carries a line matching `^ {2}hint: ` for a diagnostic
    with no `hint` field", quoting the real two-line note off the channel;
    the file was then restored byte-exactly (`git hash-object` equal to the
    pre-mutation hash) and the cell re-run green.
  - Live neighbours, unflipped:
    `tools-field-shape-refusal-live-cell`,
    `tools-field-zero-entry-scalar-refusal-live-cell` and
    `uppercase-pi-tool-name-refusal-live-cell` → `Tests  3 passed (3)`.
  - H9a acceptance: `tests/live/acceptance` → `Test Files  14 passed (14)` /
    `Tests  24 passed (24)`. `tests/fixtures/h7a/permitted-codes.json` needs
    no entry and is untouched — no new code, and the real H9a run reaches
    none.
- Review: 3 rounds.
  - Round 1 (deep) — FINDINGS ×1 (`spec`): the spec edit's first draft claimed
    the normalisation was "the identity transform in practice" on the two
    `theta/parse/*` rows; measured false, because a string literal's `\n`
    escape cooks to U+000A and `duplicate-enum-value` interpolates the cooked
    value bare. Round 1 also verified the transform over 16 inputs, the
    witness's red path, §Fix constraints 1–8, and the corpus census.
  - Round 2 (fast) — FINDINGS ×2 (`spec`): the remedy wrongly unified the two
    `theta/parse/*` rows under one mechanism (the discriminator row binds a
    RAW source slice), and the topic sentence still scoped the normalisation
    over all eight rows while it is wired at six.
  - Round 3 (deep) — CLEAN, with clause-by-clause execution evidence for the
    landed §7 text and a sibling-interpolation sweep over both parser files.
- Verification: SOLID.
  - The witness genuinely reds: two independent sites neutralised by temporary
    local edit (the `malformed-tool-entry` wrap and the `unknown-mode-value`
    wrap), 11 of 30 cells red on the symptom, both files restored byte-exactly
    and proved by `git hash-object`, witness green again.
  - Full default suite green (404 / 8406).
  - Live: an H8a cell exercises the fixed path end to end through the real
    shipped load path, and its red direction was proved and restored.
  - Lint and typecheck clean.
  - GOV-15 not engaged (§Fix constraint 7): no code added or removed, every
    measured input emits the same code with the same severity and un-registers
    the same theta.
  - Corpus census re-run at this baseline (§Fix constraint 8): 35 committed
    `.theta` / `.thetalib`, 14 with `tools:`, zero non-scalar sequence items,
    zero block-scalar `mode:` / `model:` values — zero committed files change
    their rendered diagnostic.
- Residuals:
  1. **`theta/parse/duplicate-enum-value` remains an open carrier.** Measured
     during review: an enum whose two variants share the cooked value of a
     string literal written with a `\n` escape emits a `message` of two
     physical lines. Its emission site is in `src/parser/schema-declarations.ts`,
     outside this fix's region, so the transform is not wired there and §7 is
     silent about that row's break rendering rather than blessing it. A
     sibling filing is warranted. `theta/parse/duplicate-discriminator-value`
     is NOT a carrier: it binds the raw source slice of the discriminator's
     literal annotation, in which a `\n` escape stays two characters.
  2. **The `<value>` quoting divergence is untouched**, as §Non-goals states: a
     recovered non-scalar slice still renders bare where the sub-rule's `<key>`
     arm would double-quote it. This fix changes only the newline axis.
  3. **A `<path>` binding can still carry a break in principle** (a POSIX
     filename may contain U+000A). `<path>` is category 5's rule, a different
     sub-rule, and is outside this report's subject.
  4. **The imports in `src/parser/callable-set.ts` and
     `src/parser/frontmatter.ts` are deliberately folded onto existing lines**
     so both files' net line shift is ZERO and every line-form citation into
     them — in this fix's own witness, in sibling bug docs, and in the tests —
     stays valid. Reformatting them into a conventional multi-line import is a
     regression, not a cleanup.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the closed `tools:` entry grammar, the
  all-or-nothing un-registration and the ordering against
  `theta/load/invalid-tool-rename` are 0069's contract and are untouched;
  whether a non-scalar sequence item is recovered at all stays settled by
  0069 §Fix constraint 3; the whole-field non-scalar `tools:` value belongs to
  0104; the serialised content format is not reworked; the 120-code-point
  system-note cap does not apply to diagnostic content.

## Provenance

- Origin: the bug 0069 fix (0.62.0), §Fix *Residuals* item 2
  (`docs/bugs/0069-tools-entry-residue-silently-dropped.md:177–185`), which
  names the input shape, the `<value>` carrier, the `diagnostic-shape.md:34`
  contract, the pre-existing sibling, and the reachability widening. This report
  is that filing, and adds what the residual does not state: the measured
  physical-line counts for two-key, three-key, blank-line, nested-sequence and
  block-scalar items; the three carriers with their exact interpolation sites
  and the correction that `mode:` does not go through `renderScalarValue` while
  `model:` does; the forged `hint:` and related-site continuation lines and the
  forged batch block boundary, measured through the real
  `renderDiagnosticLine` / `renderDiagnosticBatch`; the H9a stderr-gate
  line-count effect and its bound; the `<value>` quoting divergence for a
  non-scalar slice; the corpus census; and the two routes with their
  constraints.
- Spec: `docs/spec_topics/diagnostics/diagnostic-shape.md:28–40` (the internal
  diagnostic shape; `:34` the `message` single-line summary), `:44` (the
  located-site classification), `:63` (the serialised content format — the
  `hint` continuation, the related-site line, the blank-line block separator),
  `:65` (multi-error reporting), `:72` (DIAG-2), `:74` (DIAG-4);
  `docs/spec_topics/diagnostics/placeholder-rendering-b.md:11` (category 5's
  `<key>` rule), `:51` (§7's placeholder list), `:74` (the parse-time
  literal-value `<value>` sub-rule and its seven codes);
  `docs/spec_topics/diagnostics/placeholder-rendering-a.md:7` (§Closure, GOV-7 /
  GOV-8);
  `docs/spec_topics/diagnostics/code-registry-load.md:25` (the
  `theta/load/malformed-tool-entry` row, its *Message* and its *Trigger*);
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:76`, `:85`, `:88` (the
  two entry kinds, the `as` clause, the closed per-entry grammar);
  `docs/spec_topics/binder/defaulting-system-note-echo.md:19` (rule 2's cap,
  cited only to scope it out). User-facing:
  `docs/reference/diagnostics.md:6–7` (DIAG-4), `:19` (the `message` line),
  `:30–32` (the serialised content format), `:188` (the *Message* mirror row);
  `docs/reference/frontmatter.md:134–137` (the closed-grammar mirror).
- Implementation evidence at `99b65438`: `src/parser/callable-set.ts:14` (the
  six load-time rejections), `:160` (`resolveCallableSet`'s doc comment),
  `:180–181` (the per-entry loop and the parse), `:183–188` (the ordering
  comment), `:189–196` (the malformed arm; `:190–195` the pushed object with no
  `range`; `:194` the interpolation), `:278–289` (`splitEntries`; `:288` the
  list arm's trim), `:307–316` (`parseToolsEntry`; `:308` the whitespace split;
  `:315` the malformed return);
  `src/parser/frontmatter.ts:348–366` (`paramValueSource`; `:366` the slice),
  `:384–396` (`renderScalarValue` and its category-5 doc comment),
  `:404`, `:414–416` (`extractToolsList`'s doc comment on the per-item recovery
  and the `yamlSource` parameter), `:418–439` (`extractToolsList`; `:434` the
  two carriers; `:438` the whole-field return that is bug 0104's subject),
  `:851–853` (`modeValue`), `:919` (the `extractToolsList` call site),
  `:1019`, `:1026` (`theta/load/model-unresolved` through
  `renderScalarValue`), `:1064–1075` (`theta/load/unknown-mode-value`; `:1073`
  the interpolation);
  `src/diagnostics/diagnostic.ts:43–53` (the `Diagnostic` interface),
  `:55–63` (the render-contract doc comment), `:64–91`
  (`renderDiagnosticLine`; `:72` / `:74` / `:76` the three line forms; `:80`
  the hint continuation; `:86` the related-site line), `:93–99`
  (`renderDiagnosticBatch`; `:98` the `"\n\n"` join);
  `src/extension/production-composition.ts:172–189` (`makeLoadEmit`'s doc
  comment), `:190–210` (the router; `:193` the notify, `:208` the stderr
  write), `:341–362` (`discoverAndComposeFixtures`; `:345` its sink),
  `:1062–1066` (the shipped path's off-channel fallback), `:1096–1104` (the
  `session_start` note route; `:1103` the content, `:1104` the structured
  array), `:1479–1483` (the `resolveCallableSet` call with
  `tools: { kind: "list", items: toolsList }`), `:2307` (the bootstrap tier-1
  content);
  `src/extension/system-note-channel.ts:336–351` (`emitDiagnosticBatch`; `:346`
  the content).
- Test and corpus evidence at `99b65438`:
  `tests/tools-entry-closed-grammar.test.ts:49–53` (the header's own citation of
  the `<value>` sub-rule), `:112–129` (the DIAG-4 registry read), `:146–150`
  (the template constant), `:158–161` (`malformed`), `:172–186` (group (A)),
  `:194–344` (the group (B) harness this report's probes reuse), `:373–380`,
  `:390–396`, `:407–413`, `:424–430`, `:441–447` (the five verbatim-message
  group (B) cells), `:459–470` (the non-scalar cell and its
  implementation's-to-settle comment), `:553–573` (`expectMalformed`; `:563` the
  message assertion), `:589`, `:594`, `:612`, `:619`, `:624`, `:652` (its
  callers);
  `tests/tools-entry-closed-grammar-lockstep.test.ts:25` (its one occurrence of
  the word "message", a comment);
  `tests/params-block-mapping-rhs-refusal.test.ts:634–656` (bug 0041's
  multi-line block-scalar residual pin, and 0060's render-seam precedent
  against it);
  `tests/live/acceptance/harness.ts:479` (the empty
  `ACCEPTANCE_STDERR_ALLOWLIST`), `:489–494` (`acceptanceStderrOffenders`),
  `:534` (`assertStderrClean`);
  `tests/fixtures/h7a/permitted-codes.json` (11 codes, this one absent);
  `tests/live/acceptance/fixtures/acc-code-tool-loop.theta` (the one
  `tools:`-bearing acceptance fixture, a single-token `- read`);
  the corpus census — `find . \( -name "*.theta" -o -name "*.thetalib" \) -not
  -path "./node_modules/*" -not -path "./.git/*"` (35 files),
  `rg -ln '^tools:' --glob '*.theta' --glob '*.thetalib' .` (14 files),
  `rg -n '^\s*-\s*[\{\[]' --glob '*.theta' --glob '*.thetalib' .` (zero),
  `rg -n '^(mode|model):\s*[|>]' --glob '*.theta' --glob '*.thetalib' .`
  (zero), `rg -n 'single-line' tests/` (no `Diagnostic.message` invariant cell).
- Reproduction: three scratch vitest probes at `99b65438` over a real on-disk
  `.pi/theta/` workspace through `discoverAndComposeFixtures` — the ten-input
  entry-shape matrix with its registered set and collected notifications, the
  two pre-existing sibling carriers with their single-line control, the
  line-oriented consumer measurements through the real `renderDiagnosticLine` /
  `renderDiagnosticBatch` / `acceptanceStderrOffenders`, and the two forged
  continuation lines with their control. Run on the outputs quoted above, then
  deleted per scratch policy. No file in the tree was written by the probes;
  `src/`, `tests/` and every other bug doc are unmodified by this filing.
