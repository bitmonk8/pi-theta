# Bug 0087 — The `bind_echo` success echo is emitted without rule-1 sanitisation: a bound `params:` value carrying a line break renders the user-facing `Running /<name>: …` system note across two or more physical lines, and a crafted break forges a second `Running /<name>: …` line where the Echo-policy rules say exactly one

- **Status:** fixed (0.56.0). §Fix as settled — `renderString` applies rule 1
  per interpolated value, before the quote predicate and the escape pass. See
  §Fix (0.56.0) below.
- **Kind:** defect at the emission seam. The renderer
  (`renderArgumentEcho`) and the sanitiser (`sanitizeSystemNoteSubstring`)
  both exist and are individually conformant; the production emitter composes
  only the *cap* half of the shared line-discipline and never the *single-line*
  half, so the spec's own stated precondition ("newlines cannot reach the
  formatter") is false on every path that reaches it.
- **Related:**
  - [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md)
    (open) is the sibling finding one seam away: the same class of embedded
    line break violates the binder *system prompt*'s `Parameters:` per-field
    line shape via `renderBinderParamLine`. That report is about model-facing
    prompt bytes and the `Theta: /<name>` line count; this one is about the
    **user-facing `theta-system-note` channel** and the Echo-policy rules 1/3.
    Different renderer, different spec rule, different observable channel, and
    a different value source (0060 renders the *recorded declared type* and the
    *default source text*; this renders the *evaluated bound value*). Fixing
    0060 at `renderBinderParamLine` does not touch this path.
  - [0064](./0064-binder-temperature-400-newest-anthropic-models.md)
    (open) gates live observation of this defect: with the default resolved
    binder model the binder 400s before any echo is emitted. The reproduction
    below pins `bind_model: anthropic/claude-haiku-4-5`, the same escape the
    H9a `acc-params-binder.theta` fixture already uses.
  - [0066](./0066-ajv-verdict-discarded-unreachable-enforcement.md)
    (open) is the adjacent defect on the *same* post-default-merge step
    (`#mergeDeclaredDefaults`), on the validation side rather than the render
    side. Independent; no fix ordering.
- **Affected** (citations verified at HEAD `07ef0271`):
  - `#emitBinderEchoNote` (`src/extension/production-theta-producer.ts:860`) —
    the sole production emitter of the success echo. It builds `EchoParam[]`
    straight off `mergedArgs` (`:882–889`), renders
    (`renderArgumentEcho`, `:892`), applies **only** `capSystemNote` (`:891`),
    and hands the result to `pi.sendMessage` on the `theta-system-note`
    channel (`:894–902`). `sanitizeSystemNoteSubstring` is never called on this
    path — the import at `:295` pulls in `capSystemNote` and
    `classifyModelContent` only.
  - `renderString` (`src/render/argument-echo.ts:100`) — escapes exactly
    U+005C and U+0022 and nothing else (`:104`), per the spec bullet. A U+000A
    fails the `UNQUOTED_STRING` predicate (`:91`), so the value is quoted, and
    the raw newline is emitted inside the quotes.
  - `renderArgumentEcho` (`:185`) joins the per-field renderings into
    `Running /<name>: <fields>` with no line discipline of its own — correctly,
    since the discipline is the caller's per the module docstring.
  - `sanitizeSystemNoteSubstring` (`src/binder/system-note.ts:71`) is the
    conformant rule-1 implementation. Its production callers are
    `renderFailureNote` (`:131`), `classifyModelContent` (`:158`, `:168`),
    `renderAmbiguousSuffix` (`:185`) and `renderCustomTypeUnsafeNote`
    (`src/binder/compact-transcript.ts:348`) — every binder-emitted note
    **except** the success echo.
  - The value source on the deterministic path:
    `#mergeDeclaredDefaults` (`src/extension/production-theta-producer.ts:1155`)
    → `#recoverDeclaredDefaults` (`:1188`) re-reads the `params:` field scalar,
    splits its `= <literal>` right-hand side and evaluates it through the same
    pure evaluator the body uses (`:1228`). `docs/spec_topics/lexical.md:26`
    admits `\n` in a theta string literal, so a declared default is an
    author-controlled carrier of U+000A into `mergedArgs` with no model in the
    loop.
- **Observed at:** 0.53.0 (`07ef0271`), **live**, harness
  `tests/live/harness.ts` (`bootShippedExtension` + `driveSlashCaptureTurn`),
  real provider, session model `claude-sonnet-5`, binder model
  `anthropic/claude-haiku-4-5`.

## Summary

`binder/defaulting-system-note-echo.md:18` (rule 1) names "the echo's
interpolated values" as one of the three substring classes that MUST have each
`\r` / `\n` / `\r\n` replaced by a single U+0020 before the note is composed.
`:35` restates the consequence as a fact the quote rule depends on: "newlines
cannot reach the formatter because System-note rendering rule 1 has already
collapsed them to spaces upstream."

Nothing upstream does that. `#emitBinderEchoNote` applies rule 2 (the
120-code-point cap) and no other rule. A bound value carrying U+000A therefore
reaches `renderString`, which quotes it (the newline fails the unquoted
predicate) but escapes only `"` and `\`, and the raw U+000A is emitted into the
`theta-system-note` content the user sees.

## Reproduction

Live, in-process, through the shipped extension entry. Plant one `.theta` under
the project discovery root and drive its slash command:

```
---
mode: prompt
bind_model: anthropic/claude-haiku-4-5
params:
  topic: string
  extra: 'string = "a\nb"'
---
"done"
```

```
npx vitest run --config config/vitest/vitest.live.config.ts tests/live/scratch-conv-echo.test.ts
```

Driving `/echonl widgets` and reading the `theta-system-note` entries off the
settled in-memory `SessionManager` yields exactly one note:

```
lines=2 scalars=53
"Running /echonl: topic=widgets, extra=\"a\nb\" (default)"
```

`\n` there is a real U+000A: the note occupies two physical lines.

**Forging vector.** The same input class puts a fully-formed second note line
under author control. With `extra: 'string = "x\nRunning /admin: pwned=true"'`,
driving `/forge widgets` yields one note whose content is:

```
lines=2
"Running /forge: topic=widgets, extra=\"x\nRunning /admin: pwned=true\" (default)"
```

A consumer splitting the channel on newlines — or any renderer that shows one
system note per line — reads a second, fabricated `Running /admin: …` echo for
a theta that never ran.

**Control cases, same run, all conformant** (so the observation is not a
harness artefact):

| Declared default | Rendered note | Verdict |
| --- | --- | --- |
| `string = "plain_id-1.2"` | `Running /echoplain: topic=widgets, extra=plain_id-1.2 (default)` | conformant (BNDR-6b, `(default)` tag) |
| `string = "he said \"hi\" and \\ back"` | `Running /echoquote: topic=widgets, extra="he said \"hi\" and \\ back" (default)` | conformant (BNDR-6e) |
| `string = "L"×200` | 120 scalars, trailing `…` | conformant (rule 2) |
| `string = "😀"×80` | 120 scalars, trailing `…`, no split surrogate | conformant (rule 2 scalar alignment) |
| `string = "a\nb"` | **2 physical lines** | **non-conformant** |

The cap, the quote predicate, the escape set, the `(default)` tag and the
astral-safe truncation are all correct. Rule 1 is the single missing step.

## Expected behaviour

- `docs/spec_topics/binder/defaulting-system-note-echo.md:18` — rule 1,
  *Single line*: "Replace each `\r`, `\n`, and `\r\n` in any model-supplied
  substring (**the echo's interpolated values**, the `message` field, each
  `candidates[i]`) with a single space. Collapse runs of whitespace to one
  U+0020 space. Trim leading and trailing whitespace from the result."
- `:19` — rule 2 measures the cap "over the rule-1 output"; the ordering is
  stated, so rule 1 is a precondition of the step that is implemented.
- `:20` — rule 3: "the success echo follows `Running /<name>: <formatted-args>`
  … the boundary is part of the contract so a downstream renderer knows which
  span it can trust."
- `:35` — the quote-predicate bullet's own justification for escaping only `"`
  and `\`.
- `:16` — the umbrella: "All binder-emitted system notes — **the success
  echo**, the `needs_info` and `ambiguous` failure messages, and the three
  runtime-emitted failure rows — share one line-discipline."

Expected note for the reproduction: `Running /echonl: topic=widgets, extra="a b" (default)`
— one line, the U+000A collapsed to one U+0020, quoting retained because the
space still fails the unquoted predicate.

## Actual behaviour / root cause

`#emitBinderEchoNote` composes rule 2 only:

```ts
const content = capSystemNote(
  renderArgumentEcho({ thetaName: theta.slashName, params: echoParams }),
);
```

There is no rule-1 pass at any point between the binder envelope / default
evaluation and this call. Applying rule 1 to the *whole rendered line* after
the fact would also be wrong: it would collapse legitimate interior runs the
formatter itself produced and would trim nothing useful. The rule is scoped to
the interpolated substrings, so the sanitisation belongs per-value, before
`renderString`'s quote predicate runs — which is exactly what `:35` asserts
already happens.

Two live reachable carriers of U+000A into `mergedArgs`:

1. **Declared default (deterministic, no model).** `#recoverDeclaredDefaults`
   evaluates the author's `= "a\nb"` literal through the pure evaluator; the
   value is a real newline. This is the reproduction above.
2. **Binder-supplied value (model-dependent).** The envelope's `args` is
   JSON; `"a\nb"` is a valid JSON string. `#mergeDeclaredDefaults` preserves a
   binder-supplied value unchanged (fill-if-absent), so it reaches the same
   renderer. Not exercised in the reproduction because it is stochastic.

## Why it matters

1. The user-facing channel breaks its own one-line contract on ordinary,
   diagnostic-free input. The theta loads with zero diagnostics, registers, and
   binds successfully; the note is the *success* surface.
2. Rule 3's prefix/suffix demarcation is what a downstream renderer is told it
   can trust. The forging case shows the trust boundary is violable from the
   value side: an author (or, on carrier 2, a model) can synthesise a complete
   second `Running /<other>: …` line inside one note's content.
3. The defect is invisible to the current gates. `capSystemNote` is applied, so
   the length assertions pass; the offline echo test
   (`tests/e2e-s5-binder-echo-emission.test.ts`) drives values that carry no
   line break, and the H9a acceptance fixture `acc-params-binder.theta`
   declares `count: number = 3`.
4. It is the same input class as 0060 arriving on a second surface. Fixing one
   renderer leaves the other open; the two share a root cause only in the sense
   that no seam owns "a runtime-supplied string entering a line-shaped
   template."

## Non-goals

- Not a claim that rule 2 is wrong. The 120-scalar cap, its `…`, and its
  scalar-aligned truncation were probed at this HEAD and are conformant
  (including the astral case).
- Not about the quote predicate, the escape set, the array/object rules, the
  `(default)` tagging, or the BNDR-6 numeric rows — all probed conformant.
- Not about `bind_echo: false`, the no-params bypass, or the single-string
  bypass: all three suppress the echo correctly at this HEAD (probed live:
  `/echooff` → 0 notes; `/npecho` → the SLSH-1 note only; `/sbypass` →
  0 notes).
- Not about the binder failure-arm notes (`needs_info`, `ambiguous`,
  malformed-envelope) — those route through `renderFailureNote` and are
  rule-1-clean.

## Fix

Apply rule 1 per interpolated value, at the point the value's text is produced,
so the quote predicate sees the rule-1 output — the ordering `:35` states.

The narrow edit is inside `renderString` (`src/render/argument-echo.ts:100`):
sanitise `value` through `sanitizeSystemNoteSubstring` before the
`UNQUOTED_STRING` test and before the escape pass. That covers the `string`
arm and the `enum` arm (which routes through the same function, `:169`) —
the only two arms that can carry a U+000A, since `integer` / `number` /
`boolean` / `null` render from a closed token set and the array/object arms
recurse into these leaves.

Constraints any fix must satisfy:

- Rule 1's whitespace set is the six ASCII characters only. Reuse
  `sanitizeSystemNoteSubstring`; do not substitute `String.prototype.trim` or a
  `\s` regex (U+00A0 must survive verbatim — the BNDR-6 rows do not cover it,
  but rule 1 `:18` pins it, and the SLSH-1 trim already honours it at this
  HEAD).
- The quote predicate must run *after* the collapse, so `"a\nb"` renders
  `"a b"` (quoted, because U+0020 is outside the unquoted set) and not `a b`.
- Rule 2's cap must keep running last, over the rule-1 output (`:19`).
- The `(default)` tag, the `, ` field separator and the `Running /<name>: `
  prefix are theta-controlled and must not be sanitised into the suffix span.

Alternative placement — sanitising each `EchoParam.value` in
`#emitBinderEchoNote` before `renderArgumentEcho` — is rejected: it would have
to walk the array/object arms itself, duplicating the recursion the renderer
already owns, and would leave the seam re-breakable by any future caller of
`renderArgumentEcho`.

## Fix (0.56.0)

The settled §Fix, implemented as written; two review rounds, one fixer round
and one verification round. Line anchors are at the fix commit.

**The edit.** `renderString` (`src/render/argument-echo.ts:110`) passes its
`value` through `sanitizeSystemNoteSubstring` (`src/binder/system-note.ts:71`)
and runs the `UNQUOTED_STRING` predicate (`:92`) and the escape pass over that
output. One edit covers both arms that can carry a U+000A — the `string` arm
(`:165`) and the `enum` arm (`:175`) call the same function — and the array and
object arms inherit it by recursing into those leaves. The import is acyclic:
`src/binder/system-note.ts` declares no imports of its own.

All four of §Fix's constraints hold and are locked by tests. The rule-1
implementation is reused rather than re-derived, so the whitespace set stays
the six ASCII characters and U+00A0, U+2003, U+2028 and U+2029 survive verbatim
— each of the four is a character a `\s`-class implementation would wrongly
collapse. The predicate reads the collapsed text, so `"a\nb"` renders `"a b"`
quoted and never bare `a b`. `capSystemNote` is untouched at its sole call site
(`src/extension/production-theta-producer.ts:891`) and still measures the whole
rendered line last. `renderArgumentEcho` carries no change, so the
`Running /<name>: ` prefix, the `, ` separator and the ` (default)` tag are
rendered from theta-controlled text without passing through rule 1 — a theta
whose slash name itself contains a two-space run keeps it.

**Consequences of the trim sub-step.** Rule 1 trims before the predicate runs,
so a value whose only out-of-set characters are at its edges now satisfies the
unquoted predicate: `"\nplain\n"` renders bare `plain` and `"  ab  "` renders
bare `ab`. A value that sanitises away entirely renders `""`, the BNDR-6a
rendering, at every position the leaf reaches — top level, array element,
object first field, and enum wire string. None of these moves a BNDR-6 row: no
row in that table carries an edge, tab, or multi-character whitespace run, and
the two rows with a single interior U+0020 (BNDR-6c, BNDR-6x, and the `"b c"`
leaves of BNDR-6k and BNDR-6n) are runs of length one that collapse to
themselves. The 26 byte-exact pins in `tests/argument-echo.test.ts` are green
unchanged.

**No spec, registry, `docs/reference/` or `permitted-codes.json` edit.** The
fix conforms the implementation to prose that already exists; DIAG-2 held with
no new code, no new row and no widened trigger. `:35`'s "rule 1 has already
collapsed them to spaces upstream" describes the ORDERING the predicate
depends on, not a function boundary — the spec names no formatter entry point,
and no consumer-visible observable distinguishes a collapse performed before
the call from one performed as the call's first step. No `docs/reference/`
page restates the sentence.

**Tests.** `tests/echo-value-rule1-sanitisation.test.ts` (25 tests, offline,
deterministic). Groups A–C are the per-arm rule-1 rows (the six-character set
one character at a time, run collapse, edge trim, the empty result, and the
non-ASCII survivors), D is rule 3's one-line contract including the forging
vector, E is the rule-1-before-rule-2 ordering, F is the theta-controlled
spans, and G drives `ProductionThetaProducer.runBinder()` with a scripted
off-session binder reply and reads the delivered `pi.sendMessage` payload on
the `theta-system-note` channel — the §Actual behaviour carrier-2 path.
Neutralising the sanitiser call reds 22 of the 25; a7, a10 and e2 are green on
both trees by design, being the guards against a `\s`-class substitution and
against deleting the cap.

**Live.** No shipped live test reaches the fixed path: the H8a production
acceptance file declares no `params:` theta at all, and the H9a binder area
asserts only exit code, stderr cleanliness and envelope non-leakage on `pi -p`
stdout, declining by design to read the note channel — its `acc-params-binder`
fixture declares `count: number = 3`, which carries no whitespace. A scratch
live probe planted the §Reproduction theta under the project discovery root and
drove `/echonl widgets` through `bootShippedExtension` + `driveSlashCaptureTurn`
against a real provider, pinning `bind_model: anthropic/claude-haiku-4-5` (the
[0064](./0064-binder-temperature-400-newest-anthropic-models.md) escape).
Neutralised, it reproduced the report byte-for-byte —
`"Running /echonl: topic=widgets, extra=\"a\nb\" (default)"`, 2 physical lines,
deterministic across the retry. Restored, one line:
`Running /echonl: topic=widgets, extra="a b" (default)`. Probe deleted after
the run, per the 0033 precedent. Both shipped live suites ran green alongside
it (18 tests).

**Reproduction re-derived at the fix baseline** (`5a008bcf`, 0.55.0) with a
scratch offline probe before any assertion was pinned: `lines=2 scalars=53`,
content byte-identical to the 0.53.0 live observation recorded above — zero
drift. Every `path:line` citation in §Affected was re-verified at that HEAD and
none had moved.

**Residuals.** (i) U+2028 LINE SEPARATOR and U+2029 PARAGRAPH SEPARATOR lie
outside rule 1's six-character set and therefore survive verbatim, which `:18`
requires and `a10` now pins. A consumer that treats the JavaScript line
terminators as line breaks still sees a two-line note from such a value. The
set is closed at six characters by `:18`, so widening it is a spec question,
not an implementation one. (ii) The `renderObject` first-field read
(`src/render/argument-echo.ts:153`) casts `value[first.name]` to `ThetaValue`
without an own-key guard; the value is a lowered-schema-driven record and the
throw class is unchanged by this fix, but the cast is pre-existing and
untouched. (iii) [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md)
is untouched, as its own report and this one agree: it renders the recorded
declared type and the default SOURCE text into the model-facing binder prompt
through `renderBinderParamLine`, a different renderer on a different channel.

## Provenance

- Spec: `docs/spec_topics/binder/defaulting-system-note-echo.md:16`, `:18`,
  `:19`, `:20`, `:35`, `:45`, and the BNDR-6 table (`:48–74`);
  `docs/spec_topics/slash-invocation.md:11`;
  `docs/spec_topics/lexical.md:26` (string-literal escape set).
- Implementation: `src/extension/production-theta-producer.ts:295`, `:845`,
  `:860–903`, `:1155`, `:1188–1230`; `src/render/argument-echo.ts:91`, `:100`,
  `:152–182`, `:185`; `src/binder/system-note.ts:71`, `:99`, `:131`.
- Existing reports read in full for duplicate separation: 0024, 0030, 0047,
  0048, 0060, 0064, 0066, 0068.
- Observations: throwaway live vitest probes
  (`tests/live/scratch-conv-echo*.test.ts`) over `tests/live/harness.ts` at
  `07ef0271`, deleted after the runs.
