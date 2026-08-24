# Bug 0263 — A `params:` field type whose text STARTS with a quote character — the unwrapped literal union `p: "a" | "b"` — is not valid YAML, so FM-5 discards the whole recovered frontmatter document and the sole diagnostic is `theta/load/missing-mode` with `mode: prompt` literally present: the three `YAMLParseError`s naming line, column and the offending text are dropped unread, no diagnostic names `params:`, the field, or the type text, and the author's actual mistake — one pair of enclosing single quotes — is invisible

- **Status:** fixed (0.262.0)
- **Sev/Diff estimate:** S3/D2 — a wrong-attribution diagnostic on a common
  authoring shape (the spec's own literal-union type text written on a
  `params:` line), fail-closed and total: the theta does not register, and
  every other frontmatter field on the file goes unread with it, so a
  `model:` that resolves to nothing and an unknown key draw nothing either.
  D2 because the failing input is in hand at the discard point
  (`doc.errors` carries the position and the offending text) but the closed
  diagnostics registry has no code for it, so the fix adds a registry row
  and its placeholder rendering alongside the emission.
- **Kind:** defect — a diagnostic names a cause the source does not exhibit.
  `theta/load/missing-mode`'s registry row
  (`docs/spec_topics/diagnostics/code-registry-load.md:17`) states the
  *Trigger* as "Frontmatter omits the required `mode:` field" and its *Hint*
  as "Add `mode: prompt` or `mode: subagent`; `mode:` is the only required
  frontmatter field". Both are false of this input: `mode: prompt` is present
  on its own well-formed line, and adding it again changes nothing.
  `frontmatter-fields-a.md:36` repeats the same trigger. The `params:`
  surface has its own load-time code for a right-hand side that does not
  spell a type expression — `theta/load/params-type-not-expression`
  (`code-registry-load.md:19`) — but that judgement runs at the frontmatter
  read, which this input never reaches.
- **Related:**
  - [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)
    §Residuals (iv) — the same collapse under a different YAML error
    (`BLOCK_AS_IMPLICIT_KEY` from `p: array<{a: string}>`), recorded there as
    "pre-existing and fail-closed, but the diagnostic misnames the cause" and
    never filed.
  - [0035](./0035-params-rhs-inline-object-under-emission.md) §Related,
    [0041](./0041-params-block-mapping-rhs-silent-permissive.md) (fixture I
    obligation) and
    [0056](./0056-params-literal-sublanguage-absent-lowers-permissive.md)
    §Reproduction each measure this collapse in passing and each disclaims it,
    deferring to 0028 §Residuals (iv). This report is the filing all three
    defer to.
  - [0098](./0098-nonstring-literal-union-emission-unspecified.md) — the
    non-string literal-union emission, fixed in 0.252.0. Its witness fixture
    works around this bug by quoting the whole scalar (`r: '"x" | null'`);
    its fix record names the find and holds it out of scope.
- **Affected:**
  - `parseFrontmatter` (`src/parser/frontmatter.ts:896–915`) — the FM-5
    discard. `parseDocument(block.yaml, { lineCounter })` (`:901`) returns a
    partially-recovered document; `yamlErrored` (`:911`) is true whenever
    `doc.errors` is non-empty, and `map` (`:912–915`) becomes `undefined`.
    `doc.errors` is read for its length only — no element of it reaches a
    diagnostic, a range, or a message.
  - `src/parser/frontmatter.ts:1111–1118` — the `modeValue === undefined`
    arm that then pushes `theta/load/missing-mode`. With `map` undefined the
    field loop never runs, so `modeValue` is undefined whatever the source
    spells.
  - `src/parser/theta-document.ts:951` — the sole production call into
    `parseFrontmatter`, which re-wraps the fenced block. The document's
    `frontmatter` is `null` on this path.
  - `src/extension/production-composition.ts:1787` — `const registered =
    !diagnostics.some((d) => d.severity === "error")`. One error-severity
    diagnostic un-registers the theta.
  - `docs/spec_topics/diagnostics/code-registry-load.md` — the closed load
    registry has no malformed-frontmatter-YAML code. The FM-5 comment
    (`src/parser/frontmatter.ts:905–910`) states that absence as the reason
    for the degrade.
- **Observed at:** HEAD `a6816b96` (v0.258.0), scratch probe `b0263scratch`
  over `parseThetaDocument` with the production parse deps, one sweep,
  removed after measurement.

## Summary

A `params:` field whose type text begins with `"` or `'` makes the frontmatter
block invalid YAML: YAML reads the leading quoted scalar as the whole value and
the remaining text (`| "b"`) as unexpected tokens. FM-5 discards the recovered
document rather than consume a partial parse, and the load ends with exactly
one diagnostic, `theta/load/missing-mode`, on a file whose `mode:` line is
present and correct. No diagnostic names `params:`, the field, the type text,
or a line or column inside the frontmatter. The three `YAMLParseError` objects
that carry all of that information are read for their count and dropped.

The trigger is the leading quote, not the union: `p: "a"|"b"`,
`p: 'a' | 'b'` and `p: "a" | "b" = "a"` collapse identically, while
`p: string | "a"` and `p: array<"a" | "b">` — the same quote characters, not
in first position — parse and lower normally. The correctly authored spelling
is the whole scalar wrapped in single quotes, `p: '"a" | "b"'`, which loads
clean and lowers `{"type":"string","enum":["a","b"]}`.

The class is independent of bug 0098's non-string subject: the all-string
literal union is the exact shape that trips it.

## Reproduction

Each row is one file: `---`, `mode: prompt`, `params:`, the field line, `---`,
body `` @`hi` ``. Parsed through `parseThetaDocument` with the production
parse deps; "diagnostics" is the complete list at every severity.

| field line | YAML errors (`doc.errors`) | diagnostics | frontmatter | lowered `properties.p` |
|---|---|---|---|---|
| `p: "a" \| "b"` | 3 × `UNEXPECTED_TOKEN` at 3:10, 3:12, 3:15 | `error theta/load/missing-mode :: frontmatter is missing required field 'mode:'` | `null` | — |
| `p: '"a" \| "b"'` (control) | none | none | parsed, `mode: prompt` | `{"type":"string","enum":["a","b"]}` |
| `p: "a"\|"b"` | 2 × `UNEXPECTED_TOKEN` at 3:9, 3:13 | `error theta/load/missing-mode` | `null` | — |
| `p: 'a' \| 'b'` | 3 × `UNEXPECTED_TOKEN` at 3:10, 3:12, 3:15 | `error theta/load/missing-mode` | `null` | — |
| `p: "a" \| "b" = "a"` | 3 × `UNEXPECTED_TOKEN` at 3:10, 3:12, 3:21 | `error theta/load/missing-mode` | `null` | — |
| `p: array<{a: string}>` | 1 × `BLOCK_AS_IMPLICIT_KEY` at 3:6 | `error theta/load/missing-mode` | `null` | — |
| `p: "a"` | none | `error theta/parse/unresolved-named-type :: unresolved named type 'a'` | `null` | — |
| `p: string \| "a"` | none | none | parsed | `{"anyOf":[{"type":"string"},{"const":"a"}]}` |
| `p: array<"a" \| "b">` | none | none | parsed | `{"type":"array","items":{"type":"string","enum":["a","b"]}}` |
| `p: 1 \| 2` | none | none | parsed | `{"enum":[1,2]}` |
| `p: string = "hi"` | none | none | parsed | `{"type":"string"}` |

The first row's dropped error text, verbatim from `doc.errors[0].message`:

```
Unexpected block-scalar-header at node end at line 3, column 10:

  p: "a" | "b"
         ^
```

Whole-file suppression, one file with `mode: prompt`, `bogus_key: 1`,
`model: nope/nope`, `params:` over `ok: string` and `p: "a" | "b"`: the
complete diagnostic list is one `theta/load/missing-mode`. The unknown key
draws no `theta/load/unknown-frontmatter-field`, and the unresolvable
`model:` draws no `theta/load/model-unresolved` — neither field is ever read.

## Expected behaviour

A frontmatter block the YAML parser rejects draws a diagnostic that names the
parse failure and locates it: the file position the `YAMLParseError` carries
and the offending text. Where the failing line is a `params:` field, the
diagnostic names that field. `theta/load/missing-mode` fires only when `mode:`
is absent, as its registry row and `frontmatter-fields-a.md:36` state.

## Actual behaviour / root cause

`parseDocument` (`src/parser/frontmatter.ts:901`) recovers a partial document
and records every failure in `doc.errors`, each with `linePos` start and end
and a `message` carrying the source line and a caret. FM-5 (`:902–915`) tests
`doc.errors.length > 0` and, on any error, forces `map` to `undefined`. The
error objects are not read again — not for a range, not for a message, not for
a count in a payload.

With `map` undefined the field loop (`:944` onward) never executes, so every
recognised field is unset. The required-`mode:` arm (`:1111–1118`) then fires
on `modeValue === undefined`, which is now a statement about the discard rather
than about the source. `parseThetaDocument` (`src/parser/theta-document.ts:951`)
returns `frontmatter: null`, and the error severity un-registers the theta at
`src/extension/production-composition.ts:1787`.

The degrade is deliberate and documented in place: the FM-5 comment
(`:905–910`) states that the closed diagnostics registry has no malformed-YAML
code and elects `theta/load/missing-mode` as "the documented 'no recognised
frontmatter mapping' surface". The registry confirms the absence — the
`theta/load/*` table (`docs/spec_topics/diagnostics/code-registry-load.md`)
carries rows for a missing `mode:`, an unknown `mode:` value, `params: null`,
a `params:` right-hand side that is not a type expression, a malformed
`tools:` field and entry, and out-of-range scalars, and no row for a
frontmatter block that does not parse as YAML. So the misattribution is not a
mis-selection among available codes; there is one code and it is the wrong
one.

The `params:`-specific route is closed for the same reason.
`theta/load/params-type-not-expression` is judged "at the frontmatter read
where the field's YAML is still in hand" (`code-registry-load.md:19`) — a
stage this input never reaches, because there is no map to read fields from.

## Why it matters

The author's mistake is one pair of enclosing single quotes on one line, and
the diagnostic points at a different line that is already correct. Following
the hint verbatim ("Add `mode: prompt`") produces no change, so the remedy path
the diagnostics contract offers is a dead end for this class. The theta does
not register, and the whole frontmatter goes unread with it, so no second
diagnostic narrows the search: a file with several fields yields one sentence
about the one field that is not at fault.

The shape is reachable from the spec's own material. `schema Severity = "low" |
"medium" | "high"` (`docs/spec_topics/type-system.md:56`) is the literal union
written in body syntax; transcribing that text onto a `params:` line is the
failing input. Nothing in `frontmatter-fields-a.md:58`'s *Type side* prose
states that a type text starting with a quote must itself be quoted at the YAML
level.

## Non-goals

- The non-string literal-union emission — bug 0098, fixed in 0.252.0
  (`SUBS-3`). This report's subject is the diagnostic on a frontmatter block
  that does not parse, and it hits the all-string union equally.
- General YAML error-message quality beyond this class. The subject is that
  the load reports a cause the source does not exhibit and drops the position
  it holds; how many errors are surfaced, and whether their wording is
  re-authored, is settled by the §Fix constraints, not widened here.
- Admitting the unquoted spelling. Making `p: "a" | "b"` parse would require
  the frontmatter block to be read by something other than a YAML parser.
  The authored form stays `p: '"a" | "b"'`.
- The adjacent `p: "a"` row, where YAML strips the quotes and the load draws
  `theta/parse/unresolved-named-type 'a'` on a well-formed frontmatter. That
  is a type-text recovery question at a parsing frontmatter, not a
  frontmatter-parse-failure one.

## Fix

Report the YAML parse failure as itself: at FM-5's discard point, emit a
diagnostic that carries the position and the offending text `doc.errors`
already holds, in place of the `theta/load/missing-mode` the discard currently
produces. Whether the code is a general frontmatter-parse-failure row or a
`params:`-scoped pre-check that runs before the YAML parse is adjudicable
against the constraints below; the general row is the cheaper of the two to
keep true, because the trigger is the parser's verdict rather than a
re-implementation of YAML's quoting rules.

Constraints, whichever route is taken:

1. **No `theta/load/missing-mode` on a file whose `mode:` line is present.**
   Every §Reproduction row that carries `mode: prompt` and collapses today
   must stop drawing that code. The code's registry row and
   `frontmatter-fields-a.md:36` keep their current *Trigger* unamended.
2. **The diagnostic locates the failure.** At minimum the line and column of
   the first `YAMLParseError` (`linePos[0]`), expressed in file coordinates —
   `parseFrontmatter` already applies `lineOffset` for its other ranges — and
   the offending source text. The `params:` field name is named where the
   failing position falls inside a `params:` field line.
3. **A new code carries a registry row in the same commit**, with *Trigger*,
   *Hint*, *Message* and placeholder rendering, per the closed-registry rule
   the FM-5 comment cites as the reason for today's degrade. The *Hint* names
   the quoting remedy for the leading-quote class.
4. **Message stays single-line.** `doc.errors[*].message` carries embedded
   newlines and a caret line; `diagnostic-shape.md:34` requires a single-line
   summary, and bugs
   [0105](./0105-malformed-tool-entry-message-embeds-raw-newline.md) and
   [0250](./0250-duplicate-enum-value-message-embeds-cooked-newline.md) pin
   what an untransformed embedded break does to the rendered output. Any
   interpolated source text is line-break-transformed.
5. **The theta still does not register.** The refusal is fail-closed today and
   stays fail-closed; only the diagnostic changes.
6. **A block that parses is untouched.** Every §Reproduction row with an empty
   `doc.errors` keeps its current diagnostics and its current lowering,
   including the `p: "a"` row's `theta/parse/unresolved-named-type` and the
   permissive rows the `params:` text stage owns.
7. **`BLOCK_AS_IMPLICIT_KEY` is covered with `UNEXPECTED_TOKEN`.** The
   `p: array<{a: string}>` row is the same discard under a different YAML
   error; a fix that improves only the leading-quote class leaves 0028
   §Residuals (iv) open and must say so.
8. **Multiple errors reduce deterministically.** The first row produces three
   `YAMLParseError`s for one authoring mistake. One diagnostic per frontmatter
   block, keyed to the first error in `doc.errors` order.

## Fix (0.262.0)

- **Re-measurement at HEAD `616c6d0e` (v0.258.0), before any edit.** Every
  §Reproduction row reproduces as filed, with two corrections to the report.
  (1) Row 1's three `doc.errors` entries are two `UNEXPECTED_TOKEN` plus a
  third whose code is `MISSING_CHAR` at block line 4, column 1 — the COUNT
  (three) and the FIRST error's position (block line 3, column 10) are exact,
  and §Fix constraint 8 keys on the first error, so nothing shipped depends on
  the third. (2) The positions `doc.errors` carries are BLOCK-relative; the
  frontmatter block's line offset is 1 for a leading `---` fence, so the file
  coordinate is the block line plus one with the column carried through — the
  same transform `parseFrontmatter` already applies to its other ranges.
- **Route: the general row, not a `params:`-scoped pre-check.** §Fix left the
  choice adjudicable; the general row is taken, for three reasons on the
  record. (a) Constraint 7 requires `BLOCK_AS_IMPLICIT_KEY` to be covered
  together with `UNEXPECTED_TOKEN`; a report keyed on the parser's own verdict
  covers every error class by construction, where a `params:`-scoped quoting
  pre-check would have to re-implement YAML's quoting rules separately for
  each. (b) The trigger is the parser's verdict rather than a prediction of
  it, which is §Fix's own stated reason for preferring this route. (c) The
  discard is reached from spellings that are not `params:` fields at all — an
  unquoted comma-leading `tools:` scalar and a duplicate top-level key both
  land there — and constraint 1 demands that every collapsing block with a
  present `mode:` stop drawing `theta/load/missing-mode`, which a
  `params:`-scoped route cannot deliver.
- **What shipped:**
  - `docs/spec_topics/diagnostics/code-registry-load.md` — one new row,
    `theta/load/malformed-frontmatter-yaml` (E, load), with *Trigger*, *Spec
    rule*, *Hint* and *Message*. The *Trigger* states the parser's rejection,
    the refusal of the partially-recovered parse, the one-diagnostic-per-block
    rule keyed to the first reported error, the non-registration, the
    suppression of every other frontmatter diagnostic for the same block
    (`theta/load/missing-mode` included, whose own *Trigger* is unamended),
    and the full rendering of `<line>`, `<column>`, `<text>` and `<scope>`
    including `<scope>`'s empty-string arm. The *Hint* names the quoting
    remedy for the leading-quote class (constraint 3).
  - `docs/spec_topics/diagnostics/placeholder-rendering-a.md` — the four new
    placeholders admitted into the closed placeholder vocabulary in the same
    file-set as the row, per the closure's same-commit rule: `<line>` and
    `<column>` join the numeric category with a scope clause pinning them to
    1-indexed file coordinates, and `<text>` and `<scope>` are admitted as a
    new bespoke closure clause (h) whose rendering lives inline in the row's
    own *Trigger*, the same shape the existing bespoke `<list>`, `<read>` and
    `<binder>` clauses take. Clause (h) also states the thing no prior clause
    had to: `<scope>` is CONDITIONAL, so an admitted interpolation may render
    zero bytes.
  - `docs/reference/diagnostics.md` — the DIAG-2 mirror row, same relative
    position, carrying the stable-contract columns only.
  - `src/parser/frontmatter.ts` — FM-5's discard now builds the report from
    the first error it already holds: the file-coordinate position, the
    offending source line trimmed and line-break-normalised through the
    existing `theta/load/*` normalisation (constraint 4, so an embedded break
    cannot reach a single-line message), and a `(in 'params:' field
    '<param>')` clause when the failing line sits inside the `params:` block
    and itself spells a field key (constraint 2). Exactly one such diagnostic
    per block (constraint 8), located as a one-column end-exclusive span at
    the reported position. The report is TOTAL for a rejected block: the
    position field is optional on the parser's error type, and an error
    carrying none falls back to the block's own first character rather than
    yielding no report — so the required-`mode:` arm gates on the rejection
    alone, the registry's statement that `theta/load/missing-mode` fires only
    on a block that PARSES holds without qualification, and no path exists on
    which a rejected block loses its only error-severity diagnostic
    (constraint 5). The FM-5 comment no longer cites the registry's lack of a
    malformed-YAML code, which is no longer true.
  - `tests/frontmatter-yaml-parse-failure-diagnostic.test.ts` — 33 cells: a
    green oracle group deriving every expected coordinate from the parser's
    own reported position rather than a hand count; the five collapsing
    §Reproduction rows including the `BLOCK_AS_IMPLICIT_KEY` one; the
    located-ness and the single-line-message check; two non-`params:` failures
    proving the empty `<scope>` arm; the one-diagnostic-per-block rule; the
    six constraint-6 fences (the `p: '"a" | "b"'` control's `enum` lowering
    among them) and the §Non-goals `p: "a"` fence; the constraint-1 fence that
    a genuinely absent `mode:` keeps its own code and message; the
    constraint-5 non-registration fences; and the two DIAG-2 mirror cells.
  - `tests/live/b0263live-frontmatter-yaml-parse-failure-live-cell.test.ts` —
    the live cell for the registration-side statement: the unquoted offender
    stays out of the registered set through the real discovery → load →
    `pi.registerCommand` path under the new located code, while its
    byte-neighbour (the one pair of enclosing single quotes the *Hint* names)
    registers and drives a real turn over both bound `params:` fields.
  - Four protected FM-5 witness cells flipped under constraint 1's
    pre-authorization, each from `theta/load/missing-mode` to the new located
    code: `tests/params-block-mapping-rhs-refusal.test.ts` (d5, fixture I),
    `tests/params-inline-object-lowering.test.ts` (e7, now sourcing its
    expected message from the registry per DIAG-4 instead of copied prose),
    `tests/inline-object-duplicate-field-name.test.ts` (a11, first assertion
    only) and `tests/tools-field-zero-entry-scalar-refusal.test.ts` (E4, four
    rows; `registered === false` unchanged, and bug 0206's own rule for that
    group is untouched). The remaining test-file edits are comment-only:
    prose that named the collapse's old code, and citations into
    `src/parser/frontmatter.ts` made stale by this diff's line shift.
- **Constraint 7 — `BLOCK_AS_IMPLICIT_KEY` is covered.** The report keys on
  the first error whatever its class, so `p: array<{a: string}>` draws the
  same located diagnostic as the leading-quote rows and names the `params:`
  field. **Bug [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)
  §Residuals (iv) is discharged**, and with it the deferrals bugs
  [0035](./0035-params-rhs-inline-object-under-emission.md),
  [0041](./0041-params-block-mapping-rhs-silent-permissive.md) and
  [0056](./0056-params-literal-sublanguage-absent-lowers-permissive.md) each
  recorded against it. Coordination notes are appended to all four.
- **§Non-goals held.** The unquoted spelling is still not admitted — the
  authored form stays `p: '"a" | "b"'`. The adjacent `p: "a"` row keeps
  exactly `theta/parse/unresolved-named-type 'a'` on its well-formed
  frontmatter, fenced by its own cell. No row with an empty error list moved.
- **Not H9a-reachable.** A real H9a acceptance run (15 files, 25 cells, all
  green) captured no emission of the new code: nothing in the shipped fixture
  corpus spells a frontmatter block the YAML parser rejects, so the code is
  reachable only from an authored mistake or fault injection.
  `tests/fixtures/h7a/permitted-codes.json` is therefore byte-unchanged.

## Provenance

Named as out-of-scope residual 2 in bug 0098's fix record
(`.pi/tmp/fixes/0098-report.md`, "Residuals / notes" item 4): "a `params:`
field whose declared type contains a bare `"` breaks YAML frontmatter parsing
outright … and NO diagnostic naming the type. It hits the all-STRING literal
union equally … Someone should file it." Recorded earlier, under the
`BLOCK_AS_IMPLICIT_KEY` spelling, as bug 0028 §Residuals (iv), and deferred to
by bugs 0035, 0041 and 0056 without ever being filed.

Reproduced at HEAD `a6816b96` (v0.258.0) with scratch probe `b0263scratch`
(one sweep, removed): the eleven §Reproduction rows, the dropped `doc.errors`
text, and the whole-file suppression measurement are taken here.
