# Bug 0085 — QRY-6's parse-time layer is absent: `emptyTemplateWarning` (`query-render.ts:435`) has no `src/` caller, so `theta/parse/empty-template` never fires and an empty or whitespace-only `@`…`` template loads clean and fails at runtime as `Err(ValidationError { cause: "empty_template" })` instead of warning at load

- **Status:** fixed (0.210.0).
- **Kind:** defect — a registered `W`-severity parse row is implemented,
  unit-tested and never wired. QRY-6 defines **two** layers against a
  degenerate prompt; only the second exists. The consequence is not silent
  acceptance of a wrong value but a *phase shift*: a condition the spec says is
  statically decidable and reported at load is instead discovered at run time,
  per invocation, as an `Err`.
- **Related:**
  - 0050 (open) — the pattern template: a registered parse code whose sole
    emitter has no `src/` caller. Same mechanism; there the position has no
    runtime net at all, here a runtime layer exists but is the *other* half of
    the same rule, so the two are adjacent input classes rather than one.
  - 0079 (open) — a registered code whose renderer arm exists and whose
    production caller cannot select it. Same class one layer down (render vs.
    parse) and on the same `query-render.ts` file
    (`stringifyInterpolatedValue`, `:410`); this report's emitter is `:435` in
    the same module, dead for a different reason (no caller at all rather than
    an unselectable arm).
  - 0072 (open) — the grouping precedent for one dead function owning
    registered codes, and the source of the "no runtime net replaces the check
    that never fires" framing. Here a runtime net *does* exist, which bounds
    the impact and changes the fix calculus.
  - `theta/parse/empty-query-annotation` (`code-registry-parse.md`) is a
    different row on a different position (`@<>` with an empty type
    annotation), is wired, and is not affected.
- **Affected** (every citation verified at HEAD `07ef0271`, 0.53.0):
  - **The sole emitter** — `emptyTemplateWarning`,
    `src/render/query-render.ts:435–453`: the doc comment naming QRY-6 and the
    pre-escape predicate (`:427–434`), the `renderTemplateText` +
    `isAsciiWhitespaceOnly` predicate (`:440–443`), the emitted `severity:
    "warning"` (`:448`) and `code: EMPTY_TEMPLATE_CODE` (`:449`).
    `rg -n "emptyTemplateWarning" src/` returns exactly one line — `:435`, the
    definition. Outside `docs/`, the only other references are
    `tests/query-render.test.ts:11` (import) and `:194`, `:201` (two direct
    calls).
  - **The code constant** — `EMPTY_TEMPLATE_CODE`,
    `src/render/query-render.ts:77`, and its registry Message constant at
    `:90`. `rg -n "EMPTY_TEMPLATE_CODE" src/` returns two lines: the
    declaration and its single use inside the dead emitter (`:449`).
  - **The only other `src/` occurrences of the string `empty-template`** are
    comments: `src/render/query-render.ts:17`, `:76`, `:90`, `:427`,
    `src/extension/production-theta-producer.ts:2332` (a comment on the
    *runtime* short-circuit's evaluation order) and
    `src/runtime/effectful-statement-host.ts:215` (likewise). No emission.
  - **The runtime layer that does exist and fires instead** — the
    empty-template short-circuit, whose evaluation order is commented at
    `src/extension/production-theta-producer.ts:2332` and whose result arm is
    commented at `src/runtime/effectful-statement-host.ts:215`. It produces
    `Err(QueryError { kind: "validation", cause: "empty_template", … })`
    per QRY-6's second bullet.
  - **The registry row** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:71`. Severity `W`,
    phase `parse`, *Trigger* "`@`...`` template's static body is empty or
    whitespace-only … after newline-trim and dedent. The theta still loads;
    the runtime short-circuits the query if the fully-rendered text is also
    empty.", *Hint* "Add literal text or use `\n` to keep an intentionally-blank
    prompt.", *Message* `query template body is empty after newline-trim and
    dedent`.
  - **The mirror** — `docs/reference/diagnostics.md:120`.
  - **The spec rule that promises the check** —
    [QRY-6](../spec_topics/query/query-forms.md#qry-6)
    (`docs/spec_topics/query/query-forms.md:99`) and its first bullet
    (`:101`).
- **Observed at:** `0.53.0` (`07ef0271`), Windows. Offline and deterministic —
  `parseThetaDocument` through `tests/helpers/e2e-s1.ts:39`; no model, no live
  provider, no file written.

## Summary

QRY-6 opens with "Two layers defend against sending the provider a turn that
contains no useful text" and names them: a **parse-time warning**
(`theta/parse/empty-template`, severity *warning*) and a **runtime
short-circuit**. Layer one does not exist in shipped code. Its only emitter,
`emptyTemplateWarning`, is exported, unit-tested against the whitespace-only
case *and* the `\n`-suppression case, and has no caller in `src/`.

```
---
mode: prompt
---
let r = @``
r
```

loads with zero diagnostics. So do `@`   `` (spaces), `@`\t`` (tab) and a
newline-only template — measured in §Reproduction. All four are exactly the
Trigger's condition.

The consequence is confined but real: the degenerate template survives load,
registers as a slash command, and is discovered only when the query executes,
as `Err(QueryError { kind: "validation", cause: "empty_template", message:
"rendered query template is empty", attempts: 0, … })`. The author gets a
run-time `Err` at an arbitrary point in the program instead of a load-time
warning pointing at the template's source location, and the suppression hatch
QRY-6 designs for the intentional case (write a literal `\n`) has nothing to
suppress.

## Reproduction

Offline, deterministic, at HEAD `07ef0271`, through the shipped front end
(`parseThetaDocument` via `tests/helpers/e2e-s1.ts:39`). Every fixture is
`mode: prompt`. No file written.

```console
$ cat > scratch-emptytpl.ts <<'EOF'
import {parseDoc} from './tests/helpers/e2e-s1.ts';
const FM='---\nmode: prompt\n---\n';
const cases: [string,string][] = [
 ['r1-empty-tpl',   'let r = @``\nr\n'],
 ['r2-ws-tpl',      'let r = @`   `\nr\n'],
 ['r3-nl-only-tpl', 'let r = @`\n\n`\nr\n'],
 ['r4-tab-tpl',     'let r = @`\t`\nr\n'],
 ['c1-nonempty',    'let r = @`hi`\nr\n'],
 ['c2-escape-n',    'let r = @`\\n`\nr\n'],
];
for (const [id,body] of cases) {
  const d = parseDoc(FM+body,'b.theta').diagnostics;
  console.log(id.padEnd(15), d.length===0?'NO DIAGNOSTIC'
    :d.map(x=>x.severity+' '+x.code+': '+x.message).join(' | '));
}
EOF
$ npx tsx scratch-emptytpl.ts
r1-empty-tpl    NO DIAGNOSTIC
r2-ws-tpl       NO DIAGNOSTIC
r3-nl-only-tpl  NO DIAGNOSTIC
r4-tab-tpl      NO DIAGNOSTIC
c1-nonempty     NO DIAGNOSTIC
c2-escape-n     NO DIAGNOSTIC
```

| # | fixture | Trigger satisfied? | expected | observed |
|---|---|---|---|---|
| r1 | `@``` (zero-length static body) | yes | `W theta/parse/empty-template` | none |
| r2 | ``@`   ` `` (three spaces) | yes | `W theta/parse/empty-template` | none |
| r3 | ``@`\n\n` `` (newlines only) | yes | `W theta/parse/empty-template` | none |
| r4 | ``@`\t` `` (tab) | yes | `W theta/parse/empty-template` | none |
| c1 | ``@`hi` `` | no | none | none — correct |
| c2 | ``@`\n` `` (the two-character literal escape) | no — the documented suppression hatch | none | none — correct, but vacuously: r1–r4 do not warn either, so the hatch suppresses nothing |

c2 is the discriminator that makes this measurable rather than a guess: QRY-6
designs `\n` specifically as an opt-out from a warning that fires for r1–r4.
Because r1–r4 are also silent, c2 and r1 are indistinguishable at load — the
author has no way to tell the runtime "this blank prompt is intentional",
because there is nothing to tell.

The emitter answers correctly when called directly:
`tests/query-render.test.ts:194–198` passes `"   \n  \n"` and asserts
`EMPTY_TEMPLATE_CODE` and `EMPTY_TEMPLATE_MESSAGE`; `:201` asserts
`emptyTemplateWarning("\\n")` is `undefined` (the suppression hatch). Both pass.
The gap is the wiring.

**Reachability, bounded by grep.** `rg -n "emptyTemplateWarning" src/` returns
one line (the definition); `rg -n "EMPTY_TEMPLATE_CODE" src/` returns two (the
declaration and its use inside that same dead function); `rg -n
"empty-template" src/` returns six, of which four are comments in
`query-render.ts` and two are comments about the *runtime* short-circuit in
`production-theta-producer.ts:2332` and `effectful-statement-host.ts:215`. No
production site can produce the code.

## Expected behaviour

**QRY-6's first bullet is the promise.**
`docs/spec_topics/query/query-forms.md:99` opens:

> **QRY-6.** Two layers defend against sending the provider a turn that
> contains no useful text:

and `:101` states layer one verbatim:

> **Parse-time warning** (`theta/parse/empty-template`, severity *warning*): if
> a template's *static* body — every literal segment between interpolations,
> taken as the parser's conceptual static-analysis approximation of the
> rendered static body — newline-trim and dedent notionally applied to those
> segments, the escape rewrites … notionally **not** applied — is empty or
> whitespace-only (whitespace being the ASCII set pinned at [System-note
> rendering] rule 1, never the regex `\s` class), **the parser emits a one-line
> warning at the template's source location**. The theta still loads. Authors
> who genuinely intend a whitespace-only prompt can suppress the warning by
> writing an explicit literal escape (`\n`) …

Every clause of the predicate is implemented in `emptyTemplateWarning`
(`query-render.ts:435–453`): the pre-escape reading (`:440–442`, via
`renderTemplateText` with escapes not applied), the ASCII-whitespace set
(`isAsciiWhitespaceOnly`, not `\s`), and the `\n` suppression
(`tests/query-render.test.ts:201`). What is missing is the parser calling it.

**The registry row states it independently.** `code-registry-parse.md:71`,
severity `W`, phase `parse`, with the Trigger over source text and the Hint
naming the repair.

**"The theta still loads" is the load-behaviour clause, not a licence for
silence.** QRY-6 says the theta loads *and* the parser warns; the row's
severity is `W`, so registration is unaffected. The two-layer design is
explicit about why both exist: the parse layer catches the statically decidable
case at the source location, the runtime layer catches the post-interpolation
case that only a run can decide.

**DIAG-1 presupposes the site exists.**
`docs/spec_topics/diagnostics/diagnostic-shape.md:71` entitles tests to assert
the code at every documented diagnostic site. This site is documented in QRY-6,
in the registry row, and in `docs/reference/diagnostics.md:120`, and cannot be
asserted from source text.

## Actual behaviour / root cause

1. **One emitter, zero callers.** `emptyTemplateWarning`
   (`src/render/query-render.ts:435–453`) is a complete, correct implementation
   of QRY-6's parse-time predicate. It is exported and imported by exactly one
   file, `tests/query-render.test.ts`. The shipped tree never calls it, and no
   parser site computes a template's static body for this purpose.

2. **The parser does not carry the static body to a check.** The template's
   literal segments are parsed for rendering, not for the degeneracy predicate;
   nothing in `src/parser/` references `emptyTemplateWarning`,
   `EMPTY_TEMPLATE_CODE`, or the `empty-template` string.

3. **Only layer two runs.** The runtime short-circuit is live —
   `production-theta-producer.ts:2332` records the evaluation ordering and
   `effectful-statement-host.ts:215` records that the short-circuit is the
   query's *result* rather than a `Result` return — and produces
   `Err(QueryError { kind: "validation", cause: "empty_template", message:
   "rendered query template is empty", attempts: 0, validation_errors: [],
   raw_response: null })`. That layer is correct and is not the subject of this
   report; it is what makes the impact a phase shift rather than a silent send.

4. **The `\n` suppression hatch is inert.** `emptyTemplateWarning("\\n")`
   returns `undefined` (`tests/query-render.test.ts:201`) — correct behaviour
   for a check nobody runs. Since the *runtime* short-circuit evaluates the
   **post-escape** rendered text, a template written as ``@`\n` `` renders to a
   single newline, which is ASCII whitespace, and short-circuits anyway. The
   author who follows QRY-6's documented advice to keep an intentionally-blank
   prompt therefore still gets an `Err` at run time, and never saw the warning
   the advice was written to suppress.

5. **The unit test satisfies the closed-set gate.** As in 0050 §Actual
   behaviour item 5, `reconcileClosedSet` (`tools/code-registry/index.js:99`)
   asks whether a *test asserts the code*; `tests/query-render.test.ts:196`
   asserts it by calling the emitter directly. No gate relates a registered
   code to a *reachable* emission.

## Why it matters

- **A statically decidable authoring mistake is deferred to run time.** `@```
  is decidable from the bytes; today it costs a slash-command invocation, and
  the failure lands at whatever point in the program the query sits, with no
  source location for the template.
- **The `Err` is recoverable and therefore losable.** `cause:
  "empty_template"` is an ordinary `ValidationError` arm; a program that
  `match`es the query's `Result` and takes a fallback on `Err` absorbs it
  entirely. The empty template then produces a plausible fallback value on
  every run with no signal anywhere that the prompt was never sent.
- **QRY-6's suppression hatch does not work.** The documented way to keep an
  intentionally-blank prompt (`\n`) suppresses a warning that does not fire and
  does not suppress the short-circuit that does. An author following the spec
  gets the failure they were told how to avoid (§Actual behaviour item 4).
- **Two documents state the layer exists.** QRY-6 and the registry row are both
  normative; the registry is closed under DIAG-2 and read as the inventory of
  what the implementation reports.
- **The whole predicate is already written and green.** The pre-escape reading,
  the ASCII-whitespace set (explicitly *not* `\s`), and the `\n` hatch are all
  implemented and unit-tested. What is absent is one call.

## Non-goals

- **The runtime short-circuit.** Layer two is live and conformant; its
  `cause: "empty_template"` arm, its zero-`attempts` rule and its
  no-respond-repair rule are untouched here.
- **`theta/parse/empty-query-annotation`.** A different row over a different
  position (`@<>`); wired, unaffected.
- **Whether `\n` should also suppress the runtime short-circuit.** §Actual
  behaviour item 4 records that it does not, and that this makes QRY-6's hatch
  ineffective end-to-end. Whether the hatch belongs at layer two as well is a
  spec question this report does not settle — it is noted because a fix that
  restores only the warning leaves the author warned about something they
  cannot then act on.
- **Interpolation-bearing templates.** The Trigger is over the *static* body
  (segments between interpolations); a template whose only content is `${x}`
  has an empty static body and is in the Trigger's letter. Not probed here;
  a wiring must decide it explicitly rather than inherit it.
- **Oversized templates.** QRY-6's neighbouring paragraph states they have no
  pre-flight bound in theta 1.0; unrelated.

## Fix

Settled in-run: **disposition 1** (wire the caller). The record of what
shipped is §Fix (0.210.0) below; the analysis of both dispositions is retained
unchanged.

**Disposition 1 — wire the caller (recommended).** Call `emptyTemplateWarning`
from the parse walk at each `@`…`` template node, with the concatenated static
segments and the template's source range.

- *Where.* The query-template parse site in `src/parser/theta-document.ts`,
  which already has the literal segments and the node range. The emitter takes
  `(staticBody: string, range?: SourceRange)` (`query-render.ts:435–438`) and
  already returns `undefined` on the non-degenerate case, so the call site is
  one push-if-defined.
- *Operand definition is the one open question.* "Every literal segment between
  interpolations" must be pinned for the interpolation-bearing case
  (§Non-goals): `@`${x}`` has an empty static body. QRY-6's letter warns; the
  runtime layer would not short-circuit if `x` renders non-empty. A wiring
  either warns (and accepts a false positive on a template that is only an
  interpolation) or narrows the Trigger prose in the same commit (a DIAG-2
  change).
- *DIAG-2.* Not engaged if the Trigger prose stays accurate — no code added,
  removed, renamed or re-triggered; Message and Hint unchanged (DIAG-4).
  Engaged if the interpolation case narrows the Trigger.
- *GOV-15.* The carve-out applies, and this is the mild end of it: the added
  diagnostic is severity `W`, so registration is unaffected and the
  loads-cleanly predicate (`source-language-stability.md:9`) is not violated —
  only the diagnostic list changes. `rg -n '@`\s*`' docs/examples/
  tests/fixtures/` returns nothing, so no committed input is affected.
- *Witness.* Offline at `parseThetaDocument`: r1–r4 as expected-`W` rows with
  code, message and range asserted; c1–c2 as non-emission rows; one row per
  ASCII-whitespace member and one for U+00A0 asserting **no** warning (the
  registry pins the ASCII set, not `\s`); and one row for the
  interpolation-only template pinning whatever the fix decides.

**Disposition 2 — retire the row.** Remove `theta/parse/empty-template` from
the registry and the corpus, delete the emitter and its two unit tests, and
rewrite QRY-6 from two layers to one. This is a DIAG-2 removal touching
`code-registry-parse.md:71`, `docs/reference/diagnostics.md:120`, and QRY-6's
opening sentence plus its first bullet at `query-forms.md:99` and `:101`.
GOV-15's carve-out covers a removal on the inputs that previously emitted the
code — here the empty set. The consequence to state plainly: theta 1.x then
reports a degenerate template only at run time, as a recoverable `Err`, and
QRY-6's `\n` suppression hatch is deleted with it (it has no meaning without
the warning).

**Recommendation: disposition 1.** The predicate is written, unit-tested, and
implements every clause of QRY-6's first bullet including the two subtle ones
(pre-escape reading, ASCII-whitespace set). The row is severity `W`, so the
GOV-15 blast radius is the smallest of any wiring in this class — no
registration is denied. Retirement additionally requires rewriting a normative
rule and deleting a documented authoring hatch.

## Fix (0.210.0)

- **What shipped:**
  - `src/render/query-render.ts` — new exported `queryTemplateStaticBody`,
    beside `emptyTemplateWarning` under §Degenerate rendered templates: it
    projects a raw template body onto QRY-6's *static* body (backslash escape
    pairs copied verbatim so the predicate stays pre-escape and the `\n` hatch
    keeps working; `${…}` spans dropped with brace-depth tracking; every other
    character copied).
  - `src/parser/theta-document.ts` — the `@`-query capture in `BodyParser`'s
    `parseQuery` now calls `emptyTemplateWarning(queryTemplateStaticBody(…),
    spanRange(openTick.range, closeTick.range))` and pushes the returned
    diagnostic (with `file`) onto the parser's own diagnostic channel — the
    same channel `theta/parse/empty-query-annotation` already uses. Import of
    `../render/query-render` widened accordingly.
  - **The guard, load-bearing:** the check runs only when BOTH tick tokens are
    present. QRY-6's Trigger presupposes a template the author wrote and
    closed; an error-recovery capture (an over-run `@<Ghost` annotation at EOF,
    an unterminated `` @` ``) mints the same node shape with `template: ""`
    for text that is no template body. Premeasured: without the guard five
    protected witnesses red — `tests/fn-param-sink-array-literal.test.ts`,
    `tests/inbound-union-arm-dispatch.test.ts`,
    `tests/inline-object-duplicate-field-name.test.ts`,
    `tests/query-annotation-nontype-text-refusal.test.ts`,
    `tests/unterminated-literal-params-type-refusal.test.ts`; with it the full
    suite is green and no witness is flipped.
  - **The §Non-goals open question is settled by the letter:** the static body
    is the literal segments only, so an interpolation-only template
    (`` @`${x}` ``, `` @`  ${x}  ` ``) warns. Chosen over narrowing the
    Trigger so that the registry Trigger prose stays accurate — **DIAG-2 is not
    engaged**: no code added, removed, renamed or re-triggered, Message and
    Hint unchanged (DIAG-4), registry, mirror and QRY-6 untouched. The corpus
    gate's carve-out table needs no change (`theta/parse/empty-template`
    already carried an asserting test and now also has a reachable-emission
    witness).
  - **GOV-15:** severity `W`, registration unaffected; the loads-cleanly
    predicate is untouched. No committed `.theta` / `.thetalib` fixture, no
    `docs/examples/` input and no `tests/live/**` fixture carries a degenerate
    or interpolation-only template (measured), so no shipped input newly warns.
- **Gates:**
  - Witness RED before: `npx vitest run tests/empty-template-parse-warning.test.ts`
    → `Tests 12 failed | 14 passed (26)`, every red "expected +0 to be 1 …
    NO DIAGNOSTIC".
  - Witness GREEN after: `Test Files 1 passed (1) / Tests 26 passed (26)`.
  - Full default suite: `npx vitest run` → `Test Files 392 passed (392) /
    Tests 8176 passed (8176)`.
  - `npm run typecheck` → clean; `npm run lint` → clean.
  - Live: `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/empty-template-warning-registration-live-cell.test.ts` →
    `Test Files 1 passed (1) / Tests 1 passed (1)` (run twice: verifier, then
    orchestrator, each under the shared live lock).
- **Review:** 1 round — `bug-fix-reviewer`, verdict CLEAN, no findings; it
  re-derived the predicate clause-by-clause against QRY-6, compared
  `queryTemplateStaticBody` against `lexQueryTemplate`'s interpolation scan,
  probed the guard for a written-and-closed template reaching the site with a
  tick missing (none exists), and reproduced the 12-cell red itself.
- **Verification:** verdict solid.
  - Witness genuineness: the diagnostic push was neutralised in place → 12
    W-cells red, 14 M/L/S controls green; restored byte-exact
    (`git hash-object` equal to the pre-probe blob) → 26/26 green.
  - Full default suite green (392/8176).
  - Live end-to-end: no existing live cell loaded a degenerate template, so one
    H8a cell was added — it plants a control theta and an offender
    (`` let r = @`   `? ``), asserts registration is NOT denied (severity `W`),
    counts exactly one `theta/parse/empty-template: <registry Message>` on the
    real `theta-system-note` load batch, and drives the registered command,
    asserting empty `userTexts` plus the QRY-6 layer-two SLSH-3 note. Zero
    provider tokens; no verbatim-echo sentinel (sentinel-refusal class avoided).
  - Lint and typecheck clean (the typecheck covers `tests/`, hence the live
    cell).
- **Residuals:**
  1. `theta/parse/unterminated-template` does not fire for an unterminated
     `` @` `` reached through `parseDoc` — `UNTERMINATED_TEMPLATE_CODE` has no
     emission site in `src/parser/` or `src/lexer/` on that path. Measured
     while pinning this fix's suppression rows (`S-7`/`S-8` therefore assert
     only the negative). Same dead-registration class as bug 0050; unfiled,
     out of scope here.
  2. `` @` ${x // }` `` (a line comment inside an interpolation commenting out
     the closing tick) loads with zero diagnostics; `` ${f("}")} `` misparses at
     the character-level brace counter. Both are pre-existing lexer behaviour,
     unchanged by this fix, and neither produces a spurious warning.
  3. QRY-6's `\n` hatch remains ineffective end-to-end: it suppresses the
     parse-time warning (now real) but not the runtime short-circuit, which
     reads the post-escape render. Recorded as a spec question by §Non-goals;
     not settled here.
- **Discharge notes appended:** none.
- **Pinned dispositions / non-goals:** the runtime short-circuit,
  `theta/parse/empty-query-annotation`, oversized templates and whether `\n`
  should also suppress layer two all stay as §Non-goals states them.

## Provenance

- **Origin:** systematic dead-enforcement sweep — the set of exported functions
  in `src/` with no `src/` caller, intersected with the codes registered in
  `docs/spec_topics/diagnostics/code-registry-*.md`.
  `emptyTemplateWarning` is one of two dead emitters (with
  `checkIncrementDecrement`, candidate 01) that solely own a registered parse
  code.
- **Evidence:** the §Reproduction script, run at HEAD `07ef0271`, output quoted
  verbatim; `rg -n "emptyTemplateWarning" src/` (one line),
  `rg -n "EMPTY_TEMPLATE_CODE" src/` (two lines, declaration + use inside the
  dead function), `rg -n "empty-template" src/` (six lines, four comments in
  `query-render.ts` and two comments about the runtime layer),
  `rg -n '@`\s*`' docs/examples/ tests/fixtures/` (no hits). Scratch file
  written, run and deleted.
- **Implementation:** `src/render/query-render.ts` (`:17` module comment, `:76`
  code doc, `:77` `EMPTY_TEMPLATE_CODE`, `:90` message constant, `:427–434`
  emitter doc comment, `:435–453` `emptyTemplateWarning`, `:448` severity,
  `:449` code), `src/extension/production-theta-producer.ts:2332`,
  `src/runtime/effectful-statement-host.ts:215`, all at `07ef0271`.
- **Spec measured against:**
  [query-forms.md](../spec_topics/query/query-forms.md) (`:95` §Degenerate
  rendered templates, `:99` QRY-6, `:101` the parse-time-warning bullet and the
  runtime short-circuit bullet);
  [query-escapes-stringification.md:35](../spec_topics/query/query-escapes-stringification.md)
  (the per-slot cross-reference back to QRY-6);
  [code-registry-parse.md:71](../spec_topics/diagnostics/code-registry-parse.md);
  [diagnostic-shape.md:71](../spec_topics/diagnostics/diagnostic-shape.md)
  (DIAG-1), `:72` (DIAG-2), `:74` (DIAG-4);
  [source-language-stability.md](../spec_topics/governance/source-language-stability.md)
  (`:9`, `:25`).
- **Mirrors:** `docs/reference/diagnostics.md:120`.
- **Tests and tooling read, none changed:** `tests/query-render.test.ts:3–5`,
  `:11`, `:194–201`, `:210`; `tests/helpers/e2e-s1.ts:39`;
  `tools/code-registry/index.js:99`.
