# Bug 0209 — A `description:` or `argument-hint:` whose whole value is line breaks (`"\n"`, `"  \n  "`, `"\r\n"`, `"\t\n\t"`) passes item 2's and item 3's raw non-emptiness guard, collapses to the empty string under 0.131.0's `normalisePromptTextLineBreaks`, and emits the bare labelled line `Description: ` / `Argument hint: ` — the token the spec's own omission clause forbids ("no `Description:` token with an empty value"), where an absent or empty field emits no line at all

- **Status:** open
- **Sev/Diff estimate:** S4/D1 — the prompt gains one labelled empty line and no
  structural line is forged, no diagnostic sequence moves and no corpus file
  reaches the shape (34 files, 21 recorded values, zero all-whitespace); D1
  because the whole change is the emptiness test the two `line(...)` guards
  apply, plus a spec-sentence question about whether "non-empty" is measured
  before or after the collapse.
- **Kind:** defect at the render seam left by bug 0103's fix. Items 2 and 3
  guard on the **raw** frontmatter scalar
  (`src/binder/binder-system-prompt.ts:377`, `:383`) and then interpolate the
  **collapsed** value (`:378`, `:384`). For a value that is entirely line breaks
  and horizontal whitespace the two disagree: the guard sees a non-empty string,
  the collapse-and-trim returns `""`, and the label is emitted with nothing after
  it. The transform is correct — the trim is what makes a clip-chomped
  `description: |` render one physical line without trailing whitespace (0103
  §Fix (c)) — and the guard is unchanged from before that fix, so the collapse
  created a value class the guard cannot classify.
- **Related:**
  - [0103](./0103-binder-description-argument-hint-lines-forgeable-by-newline.md)
    — **fixed (0.131.0)**, the origin. Its fix added
    `normalisePromptTextLineBreaks` at the item-2 and item-3 call sites, and its
    §Fix (0.131.0) *Residuals* (2) records this exact shape as measured and
    unfiled: "`description: \"\\n\"` passes item 2's raw
    presence-and-non-emptiness guard, collapses and trims to `\"\"`, and renders
    `Description: ` … Whether the guard should test the collapsed value is a new
    question, unfiled here." This report is that filing, and adds the
    `argument-hint:` half, the whitespace-and-break variants, the absent-field
    and empty-value controls, and the spec-clause reading.
- **Affected** (every citation verified at HEAD `03c05b85`, 0.131.0):
  - `src/binder/binder-system-prompt.ts:93–130` —
    `normalisePromptTextLineBreaks`, module-local, added by the 0103 fix.
    `:94–96` is the fast path (`/[\r\n]/`, returned unchanged); `:97–120` the
    collapse (every maximal run of U+0020 / U+0009 / U+000D / U+000A containing
    at least one CR or LF becomes one U+0020); `:121–129` the leading/trailing
    U+0020 trim. For an input consisting only of those four characters and at
    least one break, the collapse yields `" "` and the trim yields `""`. Its doc
    comment (`:65–92`) states the collapse, the trim and the fast path; it states
    nothing about a result that is empty.
  - `src/binder/binder-system-prompt.ts:372–385` — the two emission sites.
    `:377` is item 2's guard
    (`input.description !== undefined && input.description !== ""`), `:378` its
    emission (`` line(`Description: ${normalisePromptTextLineBreaks(input.description)}`) ``);
    `:383` and `:384` are item 3's. The guard tests the argument, the template
    hole receives the transform's result, and nothing tests the result.
  - `src/binder/binder-system-prompt.ts:363–365` — the `line` helper, whose whole
    body is `` out += `${value}\n` ``. It emits the labelled line unconditionally
    once either guard passes.
  - `src/binder/binder-system-prompt.ts:193–202` — the two input-field contracts:
    `description?` "When absent or empty the Description line (item 2) is omitted
    entirely", `argumentHint?` the same for item 3. Both are stated over the
    field's own value, so a caller reading them does not learn that a non-empty
    value can produce an empty line.
  - `src/binder/binder-system-prompt.ts:10–18` — the module header's items 2
    and 3, amended by the 0103 fix. Each says the line appears "iff frontmatter
    `description:` is non-empty; omitted entirely otherwise" and then states the
    collapse-and-trim, without reconciling the two.
  - `src/extension/production-theta-producer.ts:847–855` — the only production
    call of `buildBinderSystemPrompt` (`:848` the name, `:849` and `:850` the two
    verbatim `fm.description` / `fm.argumentHint` spreads, `:290` the import).
    The values arrive from the parser untransformed, so this frame is where the
    shape is decided.
  - `src/parser/frontmatter.ts:942` — where `description:` is recorded:
    `String(item.value.value)` for any scalar, so a double-quoted `"\n"` or a
    block scalar's retained break is recorded as such. `:955–958` records
    `argument-hint:` the same way for string scalars.
  - `src/parser/frontmatter.ts:1344–1353` — the two spreads onto the returned
    `ParsedFrontmatter`, each gated on `!== undefined && !== ""`. This is the
    reason the empty-value control below never reaches the builder: a
    `description: ""` and an empty block scalar are dropped here, so the builder
    receives `undefined` and omits the line. A value of `"\n"` is not `""`, so
    it passes.
  - `src/parser/frontmatter.ts:1079–1091` — the
    `theta/load/argument-hint-not-displayed` advisory, severity `warning`, fired
    when `argument-hint:` carries no non-empty `description:`. It fires on the
    argument-hint rows below and does not un-register the theta
    (`docs/spec_topics/governance/source-language-stability.md:9`).
  - `docs/spec_topics/binder/binder-bypass-and-envelope.md:115` — item 2, whose
    omission clause is "When `description:` is absent or empty, the line MUST be
    omitted entirely (no `Description:` token with an empty value)". The
    parenthetical is a shape prohibition on the rendered prompt; the collapse
    clause in the same sentence is what produces the prohibited shape. `:116` is
    item 3, which states the omission ("When absent or empty, the line MUST be
    omitted entirely") and inherits item 2's collapse-and-trim by reference.
    `:112` is the item list's preamble ("the listed tokens, line-prefixes, and
    conditional-presence rules are the contract", and conditional rules require
    both halves).
  - `docs/reference/frontmatter.md:45`, `:46` — the two user-facing rows, each
    stating the collapse and the trim and each describing the absent case as the
    line being omitted. Neither row names a value that collapses away.
  - `tests/binder-prompt-description-hint-line-forgery.test.ts` — the 0103
    witness, 479 lines. Group (a)'s `describe` at `:211`, group (b)'s at `:280`,
    group (c)'s at `:333`, group (d)'s at `:371`, group (e) the corpus census
    (`:429–478`). Every row's value carries non-whitespace content, so no
    assertion in the file can red on an all-break value. `:100–120` is the `row`
    harness (one `parseDoc`, then the shipped builder with the two spreads
    exactly as `production-theta-producer.ts:849–850` makes them) — the harness
    this report's probe reuses.
  - `tests/binder-system-prompt.test.ts:90–95`, `:97–103`, `:105–109` — item 2's
    three shipped assertions: the positive half and the two negative halves
    (absent and `""`), both of which assert `not.toContain("Description:")`.
    They pin the absent-field rendering this report's control measures and are
    blind to the all-break value.
- **Observed at:** `0.131.0` (HEAD `03c05b85`). Offline, deterministic; no live
  model, no provider. Scratch vitest driving the real `parseThetaDocument`
  through `tests/helpers/e2e-s1.ts` (`parseDoc`) and then the shipped exported
  `buildBinderSystemPrompt`, with the two frontmatter values spread exactly as
  the production caller spreads them; written, run, deleted.

## Summary

Bug 0103's fix routes items 2 and 3 through `normalisePromptTextLineBreaks`,
which collapses every whitespace run containing a line break to one U+0020 and
then trims the result's leading and trailing U+0020
(`src/binder/binder-system-prompt.ts:93–130`). A value made **only** of line
breaks and horizontal whitespace therefore collapses to the empty string. The
guards that decide whether the line is emitted at all were not changed by that
fix: they test the raw argument (`:377`, `:383`), which is non-empty. The result
is a labelled empty line:

```
---
mode: prompt
description: "\n"
params:
  p: integer
---
```

loads with **zero diagnostics**, registers, and produces

```
Theta: /t
Description: 
```

— the `Description:` token followed by one U+0020 and nothing else. Item 2
(`docs/spec_topics/binder/binder-bypass-and-envelope.md:115`) forbids that exact
shape in its omission clause: "no `Description:` token with an empty value". The
same holds for `argument-hint: "\n"` → `Argument hint: `, and for both fields at
once.

The absent-field control is the contrast: with no `description:` at all the
prompt has 16 `\n`-split lines and no `Description:` line anywhere. With
`description: "\n"` it has 17, one of them the bare label. The physical line
count is the break-free control's, so nothing 0103 fixed regressed — the extra
line is the label itself, and it is a line the binder model reads.

An empty value never reaches the builder: `src/parser/frontmatter.ts:1346` and
`:1351` drop a `""` value, and an empty block scalar records `undefined`
(measured below). The class this report is about is exactly the values that are
non-empty at the parser and empty after the collapse.

## Reproduction

Offline, at `03c05b85`. Scratch vitest: `parseDoc` (the real front end,
`tests/helpers/e2e-s1.ts`) over `---\nmode: prompt\n<fragment>params:\n  p:
integer\n---\n\nlet x = 1\n`, then the shipped `buildBinderSystemPrompt` fed
`name: "t"`, one param field
`{wireName: "p", type: "integer", requirement: required}`,
`rawArguments: "real args"`, and the parsed `description` / `argumentHint`
spread exactly as `src/extension/production-theta-producer.ts:849–850` spreads
them. One `integer` field is not the single-string bypass
(`docs/spec_topics/binder/binder-bypass-and-envelope.md:11`), so every row is on
the binder path. `desc` / `hint` are the recorded frontmatter values; `D-lines`
/ `H-lines` are the prompt's `\n`-split lines starting with the named label;
`phys` is the prompt's total `\n`-split line count.

```
@@ CTRL-absent   (no description:, no argument-hint:)
   diags   :: []
   desc    :: undefined              hint :: undefined
   D-lines :: []                     H-lines :: []
   head    :: ["You bind free-form …","","Theta: /t","","Parameters:","  p (integer) required","","User arguments: real args"]
   phys    :: 16

@@ CTRL-desc     description: plain desc
   diags   :: []          desc :: "plain desc"
   D-lines :: ["Description: plain desc"]
   phys    :: 17

@@ D-nl          description: "\n"
   diags   :: []          desc :: "\n"
   D-lines :: ["Description: "]
   head    :: ["You bind free-form …","","Theta: /t","Description: ","","Parameters:","  p (integer) required",""]
   phys    :: 17

@@ D-wsnl        description: "  \n  "
   diags   :: []          desc :: "  \n  "
   D-lines :: ["Description: "]                    phys :: 17

@@ D-crlf        description: "\r\n"
   diags   :: []          desc :: "\r\n"
   D-lines :: ["Description: "]                    phys :: 17

@@ D-tabnl       description: "\t\n\t"
   diags   :: []          desc :: "\t\n\t"
   D-lines :: ["Description: "]                    phys :: 17
```

The argument-hint half, and both fields at once:

```
@@ CTRL-hint     argument-hint: "<path>"
   diags   :: ["theta/load/argument-hint-not-displayed"]      [W — the theta registers]
   hint    :: "<path>"
   H-lines :: ["Argument hint: <path>"]             phys :: 17

@@ H-nl          argument-hint: "\n"
   diags   :: ["theta/load/argument-hint-not-displayed"]
   hint    :: "\n"
   H-lines :: ["Argument hint: "]                   phys :: 17

@@ H-wsnl        argument-hint: "  \n  "
   diags   :: ["theta/load/argument-hint-not-displayed"]
   hint    :: "  \n  "
   H-lines :: ["Argument hint: "]                   phys :: 17

@@ BOTH-nl       description: "\n" + argument-hint: "\n"
   diags   :: []          [no advisory — `description:` is present at the parser]
   desc    :: "\n"        hint :: "\n"
   head    :: ["You bind free-form …","","Theta: /t","Description: ","Argument hint: ","","Parameters:","  p (integer) required"]
   phys    :: 18
```

The emitted region of BOTH-nl:

```
Theta: /t
Description: 
Argument hint: 
```

Two labelled empty lines, and the advisory does not fire because
`description:`'s **raw** value is non-empty at the parser
(`src/parser/frontmatter.ts:1080–1081`) — the same raw test the builder's guard
makes, one layer down.

The two rows that show where the empty case is already handled, and the one
break-free row that is out of scope:

```
@@ D-empty       description: ""
   diags   :: []          desc :: undefined     [dropped at frontmatter.ts:1346]
   D-lines :: []                                phys :: 16      [= CTRL-absent]

@@ D-block       description: |   with an empty body
   diags   :: []          desc :: undefined
   D-lines :: []                                phys :: 16      [= CTRL-absent]

@@ D-spaces      description: "   "             [break-free: the transform's fast path]
   diags   :: []          desc :: "   "
   D-lines :: ["Description:    "]              phys :: 17
```

`D-empty` and `D-block` are the absent-field rendering: the parser's non-empty
gate drops the value, the builder receives `undefined`, and no line is emitted.
`D-spaces` carries no break, so `normalisePromptTextLineBreaks` returns it
unchanged by its fast path (`:94–96`) and the line renders with three trailing
spaces; that is 0103 §Fix constraint 2's byte-identity for break-free values
holding as specified, and it is a §Non-goal here.

### The corpus census

Through the real front end over `git ls-files -- "*.theta" "*.thetalib"`:

```
@@ git-tracked corpus files                 :: 34
@@ recording a description                  :: 20
@@ recording an argumentHint                ::  1
@@ recording a value carrying a line break  ::  0
@@ recording an all-whitespace value        ::  0
```

No committed theta reaches the shape. It is reachable by any author who writes
`description: "\n"`, a `description: |` whose body is a blank line with
indentation, or a value whose content YAML resolves to whitespace and a break.

## Expected behaviour

- **No labelled line with an empty value.**
  `docs/spec_topics/binder/binder-bypass-and-envelope.md:115` states the
  omission clause as "the line MUST be omitted entirely (no `Description:` token
  with an empty value)". The parenthetical constrains the rendered prompt, not
  the frontmatter value, so a prompt containing `Description: ` and nothing after
  it does not satisfy item 2 whatever the raw value was. Item 3 (`:116`) states
  the omission in the same terms.
- **The presence test and the rendered value agree.** Item 2's condition and its
  collapse rule are in one sentence: the line appears when `description:` is
  non-empty, and the value's breaks collapse and trim. For an all-break value the
  two halves of that sentence disagree about whether there is content to show.
  One reading of "non-empty" has to be normative, and the render has to follow
  it.
- **The absent-field rendering is the model for the empty-after-collapse case.**
  Measured above: absent, `""` and an empty block scalar all produce a prompt of
  16 lines with no `Description:` token anywhere, and
  `tests/binder-system-prompt.test.ts:97–109` pins that with
  `not.toContain("Description:")`. A value that conveys nothing after the
  collapse conveys exactly what an absent field conveys.
- **Break-free values stay byte-identical.** 0103 §Fix constraint 2 and the
  fast path at `src/binder/binder-system-prompt.ts:94–96` make every break-free
  value render unchanged, and the corpus census (21 recorded values, zero
  carrying a break) rests on it. Any change here holds that: `description: "   "`
  and every committed value render exactly as they do at this baseline.

## Actual behaviour / root cause

**The guard tests the argument and the template hole receives the transform's
result.**

```ts
  if (input.description !== undefined && input.description !== "") {
    line(`Description: ${normalisePromptTextLineBreaks(input.description)}`);
  }
```

`src/binder/binder-system-prompt.ts:377–379`, and `:383–385` for item 3. The two
expressions are evaluated over different strings. For every value the 0103 fix
measured they agree, because those values carried non-whitespace content; for a
value made only of the four characters the collapse consumes they do not.

**The collapse-and-trim maps the whole class to `""`.** `:97–120` replaces each
break-bearing whitespace run with one U+0020, so `"\n"`, `"  \n  "`, `"\r\n"`
and `"\t\n\t"` all become `" "`; `:121–129` then trims leading and trailing
U+0020, yielding `""`. Both steps are what 0103 §Fix (c) requires — without the
trim a clip-chomped `description: |` renders with trailing whitespace — so the
transform is not the defect; it is the reason a new value class exists.

**The parser's own non-empty gate is raw too, so the class survives to the
builder.** `src/parser/frontmatter.ts:1346` and `:1351` spread each value onto
`ParsedFrontmatter` only when it is neither `undefined` nor `""`. `"\n"` is
neither, so it is recorded and spread into the builder input at
`src/extension/production-theta-producer.ts:849–850`. The same raw test governs
the `theta/load/argument-hint-not-displayed` advisory (`:1080–1081`), which is
why the BOTH-nl row emits no diagnostic: `description:` counts as present for
the advisory while contributing nothing to the prompt.

**Nothing observes the outcome.** The prompt is a model input, not one of
GOV-15's three observables
(`docs/spec_topics/governance/source-language-stability.md:5`), so the extra
labelled line changes no return value, no diagnostic sequence and no
`theta-system-note` content. Every value in the 0103 witness
(`tests/binder-prompt-description-hint-line-forgery.test.ts`) and in
`tests/binder-system-prompt.test.ts:90–109` carries non-whitespace content, so
no shipped assertion can red on it, and the one live fixture reaching this
renderer declares neither field.

## Why it matters

- **The binder model reads a label with no content.** The prompt's structural
  items are the model's grounding: item 2's line tells it what the theta does and
  item 3's tells it what the arguments look like. A bare `Description: ` asserts
  that a description exists and supplies none — a line the item list does not
  authorise, in a prompt the model has no other channel to check against.
- **It is the shape the spec sentence explicitly forbids.** `:115`'s
  parenthetical "no `Description:` token with an empty value" is the one clause
  in the item list written about this exact rendering, and the collapse clause in
  the same sentence is what produces it.
- **The author's intent is silently discarded.** The author wrote a value and got
  a label with nothing after it. There is no diagnostic on any row (and on the
  argument-hint rows only the pre-existing `W` about the autocomplete entry), so
  nothing at load time distinguishes a value that renders from one that
  collapses away.
- **The advisory's premise is weakened by the same raw test.** BOTH-nl declares
  `description: "\n"` and emits no
  `theta/load/argument-hint-not-displayed`, because `:1080–1081` counts the raw
  value as present. The advisory exists to warn that Pi's autocomplete entry
  will look empty; a `"\n"` description makes it look empty and suppresses the
  warning.
- **Nothing in the corpus or the test suite scores it.** 34 committed files, 21
  recorded values, zero all-whitespace and zero break-bearing. The 0103 witness
  is 479 lines over this exact seam and every one of its rows carries
  non-whitespace content.

## Non-goals

- **Break-free whitespace values.** `description: "   "` renders
  `Description:    ` with its three spaces intact, by the transform's fast path
  (`src/binder/binder-system-prompt.ts:94–96`) and by 0103 §Fix constraint 2's
  byte-identity requirement. Whether a break-free all-space value should also be
  treated as empty is a different question with a byte-stability cost this report
  does not measure and does not ask for.
- **The collapse and the trim themselves.** Both are required by 0103 §Fix (c)
  and by `docs/spec_topics/binder/binder-bypass-and-envelope.md:115`; this report
  asks for no change to `normalisePromptTextLineBreaks`'s mapping of any value
  that retains content.
- **What the parser records.** `src/parser/frontmatter.ts:942` and `:955–958`
  record the scalar verbatim, which is correct for `description:`'s other
  consumer — Pi's `registerCommand` autocomplete entry (`:938–941`). This report
  proposes no change to the recording and no refusal of a whitespace-only
  frontmatter scalar at the parser.
- **U+2028 / U+2029.** Outside the transform's `[\r\n]` predicate, as 0103's
  §Non-goals require, and neither collapses to empty. Rule 1's character set is
  [0091](./0091-rule1-set-excludes-u2028-u2029-line-breaks.md)'s subject.
- **Items 1, 4, 5, 7 and 8.** The `line` helper is untouched here, so the other
  items' rendering is unchanged in either direction.

## Fix

Not settled. Two routes reach the same rendered prompt; the constraints below
bind either.

**(1) Test the collapsed value at the two emission sites.** Compute
`normalisePromptTextLineBreaks(input.description)` once, emit the line only when
the result is non-empty, and the same for `argumentHint`. This makes the
all-break value render exactly as an absent field does (measured control:
`phys 16`, no `Description:` token), keeps the diagnostic sequence of every row
unchanged, and touches one function. The disposition to record: whether item 2's
"non-empty" is then normatively read post-collapse — which is a sentence under
`docs/spec_topics/binder/binder-bypass-and-envelope.md:115` and `:116` and the
mirrored clauses at `docs/reference/frontmatter.md:45`, `:46`, in the same change
as the code, as the 0103 and 0060 fixes both did.

**(2) Refuse an all-break value at load.** A new load-phase diagnostic on a
`description:` / `argument-hint:` whose value collapses to nothing, so the author
learns the value conveys nothing rather than having it silently dropped. This
costs a DIAG-2 registry row
(`docs/spec_topics/diagnostics/diagnostic-shape.md`), a
`docs/reference/diagnostics.md` mirror, and H9a's permitted-code list — the
class of cost the 0103 fix deliberately avoided (its §Fix (e): "No `theta/*` code
is added or removed, so DIAG-2 is not reached"). It also has to decide whether
the code is a `W` (theta registers, prompt renders as under route 1) or stronger,
and it interacts with the existing `theta/load/argument-hint-not-displayed`
trigger (`src/parser/frontmatter.ts:1079–1091`), whose raw non-empty test would
have to be reconciled with the collapsed one.

The routes are not exclusive: route 2 without route 1 leaves the labelled empty
line in the prompt for any theta that registers past a `W`.

**Constraints on either.**

1. **Break-free byte-identity holds.** 0103 §Fix constraint 2 and the fast path
   at `src/binder/binder-system-prompt.ts:94–96` require every value carrying no
   CR and no LF to render unchanged. The corpus census (34 files, 20
   `description:`, one `argument-hint:`, zero break-bearing, zero
   all-whitespace) and the 0103 witness's group (e)
   (`tests/binder-prompt-description-hint-line-forgery.test.ts:429–478`) are the
   controls, and `tests/binder-system-prompt.test.ts:90–109` must stay green
   untouched. `description: "   "` renders `Description:    ` before and after.
2. **The break-bearing-with-content rows are unchanged.** Every row of the 0103
   witness's groups (a)–(d) (`:211` to `:428`) renders exactly as it does at this
   baseline: the fix distinguishes "collapses to empty" from "collapses", and the
   second class is 0103's settled behaviour.
3. **The seam is `buildBinderSystemPrompt`.** As 0103 §Fix constraint 1
   established, transforming or guarding at the caller
   (`src/extension/production-theta-producer.ts:849–850`) would leave the
   guarantee off every other caller of the exported builder. Route 1 belongs at
   `:377–379` and `:383–385`.
4. **Test witness — offline, provider-free.** Every row in §Reproduction settles
   inside one `parseDoc` plus one `buildBinderSystemPrompt`, and the 0103
   witness's `row` harness (`:100–120`) is the shape to reuse. Required: the four
   all-break `description:` variants and the two `argument-hint:` variants
   asserted on the absence of the label and on the physical line count matching
   the absent-field control; the BOTH-nl row; the absent, `""` and empty-block
   controls; the break-free `"   "` row byte-pinned; and each row's diagnostic
   sequence pinned. The witness must red before the fix.
5. **Live is not a witness.** The prompt is a model input and the binder
   `complete()` call is off-session, so no harness channel carries the prompt
   bytes — 0103's residual (1) measured exactly this and found its live cell
   could not red. The offline witness carries the discriminating power.

## Provenance

- Origin:
  [0103](./0103-binder-description-argument-hint-lines-forgeable-by-newline.md)
  §Fix (0.131.0) *Residuals* (2), which records the `description: "\n"` row as
  measured in review and states the question as new and unfiled ("Whether the
  guard should test the collapsed value is a new question, unfiled here"). This
  report reproduces that row at HEAD and adds: the `argument-hint:` half; the
  `"  \n  "`, `"\r\n"` and `"\t\n\t"` variants, which show the class is every
  value made of the four characters the collapse consumes; the both-fields row
  and the observation that it suppresses
  `theta/load/argument-hint-not-displayed` on a raw-presence test; the
  absent-field, `""` and empty-block controls that establish what the omitted
  rendering is (`phys 16`, no label); the break-free `"   "` row that bounds the
  subject; the reading of item 2's omission parenthetical ("no `Description:`
  token with an empty value") as a rendered-prompt prohibition; and the corpus
  census at this baseline.
- Spec: `docs/spec_topics/binder/binder-bypass-and-envelope.md:11` (the
  single-string bypass, which no reproduction row is), `:112` (the item list's
  preamble and its both-halves requirement for conditional rules), `:115`
  (item 2: the non-empty condition, the omission clause with its "no
  `Description:` token with an empty value" parenthetical, and the
  collapse-and-trim sentence the 0103 fix added), `:116` (item 3, same);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15's three
  observables — the prompt is not one), `:9` (a `W` does not disqualify a clean
  load, so the argument-hint rows register);
  `docs/spec_topics/diagnostics/diagnostic-shape.md` (DIAG-2, the cost route 2
  incurs). User-facing: `docs/reference/frontmatter.md:45`, `:46` (the two rows
  stating the collapse and the trim).
- Implementation evidence at `03c05b85`:
  `src/binder/binder-system-prompt.ts:10–18` (the module header's items 2 and 3),
  `:65–92` (the transform's doc comment), `:93–130`
  (`normalisePromptTextLineBreaks`: `:94–96` the fast path, `:97–120` the
  collapse, `:121–129` the trim), `:193–202` (the two input-field contracts),
  `:363–365` (the `line` helper), `:372–385` (items 2 and 3, `:377` / `:383` the
  raw guards, `:378` / `:384` the collapsed interpolations);
  `src/extension/production-theta-producer.ts:290` (the import), `:847–855` (the
  only production call, `:849–850` the two verbatim spreads);
  `src/parser/frontmatter.ts:937–943` (the `description:` arm, value at `:942`),
  `:945–960` (the `argument-hint:` arm, value at `:955–958`), `:1079–1091` (the
  advisory and its raw non-empty test at `:1080–1081`), `:1344–1353` (the two
  spreads onto `ParsedFrontmatter`, each gated on non-empty).
- Test and corpus evidence at `03c05b85`:
  `tests/binder-prompt-description-hint-line-forgery.test.ts` (the 0103 witness,
  479 lines; `:100–120` the `row` harness, `:211` group (a)'s `describe`, `:280` group (b)'s,
  `:333` group (c)'s, `:371` group (d)'s, `:429–478` group (e) the corpus census —
  every row's value carries non-whitespace content);
  `tests/binder-system-prompt.test.ts:90–95` (item 2's positive half), `:97–103`
  and `:105–109` (its two negative halves, both
  `not.toContain("Description:")`);
  `tests/helpers/e2e-s1.ts` (`parseDoc`, the front-end driver this report's
  probes use); the corpus census through the real front end over
  `git ls-files -- "*.theta" "*.thetalib"` — 34 files, 20 recording a
  `description:`, one recording an `argument-hint:`, zero carrying a line break,
  zero all-whitespace.
- Reproduction: two scratch vitest probes at `03c05b85` — the thirteen rendered
  rows quoted above (through `parseDoc` plus the shipped builder with the
  production spreads) and the corpus census. Run on the outputs quoted above,
  then deleted per scratch policy. No file in the tree was written by the
  probes; `src/`, `tests/`, `docs/bugs/README.md` and every other bug doc are
  unmodified by this filing.
