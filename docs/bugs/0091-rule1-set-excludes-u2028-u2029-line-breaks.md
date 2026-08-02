# Bug 0091 — System-note rendering rule 1 closes its whitespace set at six ASCII characters, so U+2028 LINE SEPARATOR and U+2029 PARAGRAPH SEPARATOR survive the echo's rule-1 pass by spec: the delivered `Running /<name>: …` note renders as two physical lines to a consumer that treats the JavaScript line terminators as line breaks, and no sentence says whether rule 3's one-line contract is meant to hold against them

- **Status:** open. §Fix is constraint-pinned, not settled. The decision this
  report asks for is the adjudication between two dispositions — widen rule 1's
  whitespace set to cover the two non-ASCII line terminators, or state that the
  six-character closure is deliberate and the two-line render through them is
  accepted — not the wording of one of them. No fix-ordering dependency:
  [0087](./0087-echo-note-newline-unsanitised.md) is fixed (0.56.0) and this is
  its recorded residual.
- **Kind:** spec gap. `docs/spec_topics/binder/defaulting-system-note-echo.md:18`
  closes rule 1's whitespace set at exactly six ASCII characters and states that
  non-ASCII whitespace "is preserved verbatim (neither collapsed nor trimmed)".
  The implementation honours both sentences. What no sentence decides is whether
  rule 3's one-line contract (`:20`) is meant to hold against U+2028 and U+2029,
  which are outside rule 1's set and are line terminators in JavaScript. Rule 1
  enumerates by a *whitespace* criterion; rule 3 constrains a *line*. The two
  sets differ by exactly {U+2028, U+2029}.
- **Related:**
  - [0087](./0087-echo-note-newline-unsanitised.md) (fixed 0.56.0) — the parent.
    Its fix routed the echo's interpolated values through
    `sanitizeSystemNoteSubstring`, closing the U+000A vector for the six ASCII
    characters; its §Fix (0.56.0) *Residuals* item (i) (`:335–341`) records this
    residue and states that widening the set is a spec question. The pin its
    regression file added for the current posture (test `a10`) is the artefact
    this report asks the corpus to stand behind or replace.
  - [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md)
    (open) — disjoint. It renders the recorded declared type and the default
    *source text* into the model-facing binder system prompt through
    `renderBinderParamLine`, a renderer with no rule-1 pass on any path, and its
    carrier is U+000A. This report is about the user-facing `theta-system-note`
    channel, the *evaluated bound value*, and a value that has already passed a
    conformant rule-1 pass. Different renderer, different channel, different
    value source, different character class; neither resolution touches the
    other.
- **Affected** (citations verified at HEAD `1d26a86a`, 0.56.0):
  - **The closed set.** `docs/spec_topics/binder/defaulting-system-note-echo.md:18`
    — "**whitespace** is exactly the ASCII whitespace set {U+0009 (tab), U+000A
    (line feed), U+000B (vertical tab), U+000C (form feed), U+000D (carriage
    return), U+0020 (space)} … Non-ASCII whitespace, including U+00A0 (no-break
    space) and the U+2000–U+200A range, lies outside this set and is preserved
    verbatim (neither collapsed nor trimmed)." The clause names U+00A0 and the
    U+2000–U+200A range; it does not name U+2028 or U+2029, which fall under it
    only through the general "non-ASCII whitespace" phrase.
  - **The line contract the set is measured against.** `:20` (rule 3) — "the
    success echo follows `Running /<name>: <formatted-args>` … the boundary is
    part of the contract so a downstream renderer knows which span it can
    trust". `:16` binds the success echo to the shared line-discipline. Neither
    line defines what counts as a line break.
  - **One implementation of the set, six call sites.**
    `sanitizeSystemNoteSubstring` (`src/binder/system-note.ts:71`) collapses
    `ASCII_WHITESPACE_RUN` (`:56`, the six characters) and trims U+0020 only
    (`:79–87`). Callers: `renderFailureNote` (`:132`), `classifyModelContent`
    (`:158`, `:168`), `renderAmbiguousSuffix` (`:185`),
    `renderCustomTypeUnsafeNote` (`src/binder/compact-transcript.ts:348`), and
    `renderString` (`src/render/argument-echo.ts:111`, the 0087 fix).
  - **The echo path.** `renderString` (`src/render/argument-echo.ts:110`)
    sanitises, then tests `UNQUOTED_STRING` (`:92`, `:112`), then escapes `\`
    and `"` only (`:115`). Both arms that carry a string reach it —
    `renderEchoValue`'s `string` case (`:166`) and `enum` case (`:178`) — and
    the array and object arms recurse into those leaves (`:126`, `:153`).
    `renderArgumentEcho` (`:196`) composes the line;
    `#emitBinderEchoNote` (`src/extension/production-theta-producer.ts:860`)
    caps it (`:891`) and delivers it on the `theta-system-note` channel
    (`:894–902`).
  - **The pin on the current posture.**
    `tests/echo-value-rule1-sanitisation.test.ts:218–228` (`a10`) asserts
    `renderEchoValue("a\u2028b", str)` is `'"a\u2028b"'` and the same for
    U+2029. Its ledger (`:66–72`) lists `a10` as green on both the pre-fix and
    post-fix trees — a non-regression pin against a `\s`-class substitution,
    not a fix witness. `a7` (`:208–216`) pins U+00A0 and U+2003 the same way,
    and those two characters are named by `:18` directly.
  - **A second surface reads the same set by reference.**
    `docs/spec_topics/query/query-forms.md:99` (QRY-6) defines its
    degenerate-template whitespace as "the ASCII set pinned at [System-note
    rendering] rule 1, never the regex `\s` class", and
    `src/render/query-render.ts:55` carries a second copy of the six characters
    (`:58` `isAsciiWhitespaceOnly`, consumed by `emptyTemplateWarning` `:435`
    and `renderEmptyShortCircuit` `:465`).
  - **The corpus's one existing decision on these two characters, on the
    opposite side.** `docs/spec_topics/diagnostics/placeholder-rendering-b.md:22`
    (category 6, *Underlying-error placeholders*) covers
    `<original content first line>` (`:24`) — the placeholder that re-renders
    this note's own content when delivery fails
    (`docs/spec_topics/diagnostics/code-registry-runtime.md:19`). Its rule
    (`:34–39`) cuts at the first `\n`, and `:41` and `:130` state that `\u2028`
    and `\u2029` "are ordinary characters for this rule. Implementations MUST
    NOT split on them, MUST NOT strip them, and MUST NOT promote them into
    `\n`".
  - **The carriers.** Author-side: `docs/spec_topics/lexical.md:26` admits
    `\u{XXXX}` (1–6 hex digits, any non-surrogate scalar), so `"a\u{2028}b"` is
    a well-formed theta string literal, and a raw U+2028 inside a string
    literal also lexes clean — the single-line-body rule reads U+000A only (both
    measured below). Model-side: the binder envelope's `args` is JSON, and JSON
    admits a raw U+2028 inside a string (measured).
- **Observed at:** 0.56.0 (`1d26a86a`), offline, deterministic: direct calls on
  the two exported renderers, plus `ProductionThetaProducer.runBinder()` with a
  scripted off-session binder reply, reading the delivered `pi.sendMessage`
  payload on the `theta-system-note` channel.

## Summary

Rule 1's whitespace set is closed at six ASCII characters, and `:18` states that
non-ASCII whitespace survives verbatim. U+2028 and U+2029 are therefore
spec-mandated survivors of the echo's rule-1 pass, and `sanitizeSystemNoteSubstring`
preserves them. Both are line terminators in JavaScript, so the delivered
`Running /<name>: …` note carries a line break for any consumer that splits on
that set, and a crafted value puts a second line-start `Running /<other>: …`
under author or model control. Rule 3 requires one line and does not say what a
line break is. The corpus does not decide whether the six-character closure is
the intended posture on this input class.

## Reproduction

Offline vitest probe: direct renderer calls, the group-G emitter harness of
`tests/echo-value-rule1-sanitisation.test.ts` (real
`ProductionThetaProducer.runBinder()`, off-session `complete()` scripted with an
`ok` envelope, reading the delivered `theta-system-note` payload), and lexer /
parser calls through `tests/helpers/e2e-s1.ts`. Written, run, deleted.

`\u2028` below denotes the literal character U+2028 (likewise `\u2029`,
`\u00A0`, `\u2003`); the probe printed them escaped. *LF lines* splits on
U+000A; *JS lines* splits on the JavaScript line-terminator set
`{\n, \r, \r\n, U+2028, U+2029}`. No measured value carries a U+000D, so the two
columns differ only where a non-ASCII terminator is present.

**(a) Per-value renderer** (`renderEchoValue(value, { kind: "string" })` unless
noted).

| Value | Rendered | Scalars | LF lines | JS lines |
| --- | --- | --- | --- | --- |
| `a\u2028b` | `"a\u2028b"` | 5 | 1 | **2** |
| `a\u2029b` | `"a\u2029b"` | 5 | 1 | **2** |
| `\u2028ab\u2028` | `"\u2028ab\u2028"` (edges untrimmed) | 6 | 1 | **3** |
| `a\u2028b` (`enum` arm) | `"a\u2028b"` | 5 | 1 | **2** |
| `["a\u2028b"]` (`array` arm) | `["a\u2028b"]` | 7 | 1 | **2** |
| `a\nb` (control) | `"a b"` | 5 | 1 | 1 |
| `a\u00A0b` (control) | `"a\u00A0b"` | 5 | 1 | 1 |
| `a\u2003b` (control) | `"a\u2003b"` | 5 | 1 | 1 |

The three controls are the settled rows: U+000A is collapsed by the 0087 fix,
and U+00A0 and U+2003 survive as `:18` requires without producing a line break.

**(b) Delivered channel content** (two-required-string-param theta
`code-review`, binder-supplied `audience`, one note captured on
`theta-system-note` with `display: true`).

| Binder-supplied `audience` | Delivered content | Scalars | LF lines | JS lines |
| --- | --- | --- | --- | --- |
| `a\u2028b` | `Running /code-review: topic=async, audience="a\u2028b"` | 49 | 1 | **2** |
| `a\u2029b` | `Running /code-review: topic=async, audience="a\u2029b"` | 49 | 1 | **2** |
| `x\u2028Running /admin: pwned=true` | `Running /code-review: topic=async, audience="x\u2028Running /admin: pwned=true"` | 74 | 1 | **2** |
| `a\nb` (control) | `Running /code-review: topic=async, audience="a b"` | 49 | 1 | 1 |

**Forging measurement on row 3.** The JS-terminator split yields
`["Running /code-review: topic=async, audience=\"x", "Running /admin: pwned=true\""]`;
`/^Running \//gm` matches **2** times; `/^.*$/` does not match the content whole;
`content.split(/\r?\n/)` yields **1**. A consumer using JavaScript's multiline
anchors or the dot-does-not-match-line-terminator default reads two echoes and
one failed single-line validation; a consumer splitting on LF alone reads one
line. This is 0087's forging vector at one remove: same shape, narrower carrier.

**(c) Carriers.**

| Probe | Result |
| --- | --- |
| `lexSrc('"a\u{2028}b"')` | string token value is `a\u2028b` (3 scalars), zero diagnostics |
| `lexSrc('"a\u2028b"')` (raw character in the literal) | same value, zero diagnostics — not `theta/parse/literal-newline-in-string` |
| `parseDoc` of a `params:` field `extra: 'string = "a\u{2028}b"'` | zero diagnostics |
| `parseDoc` of a body `let s = "a\u{2028}b"` | zero diagnostics |
| `JSON.parse('{"a":"x\u2028y"}')` (raw character in JSON) | `x\u2028y` |

**(d) Two adjacent surfaces, measured at the current set.**

| Probe | Result today | Result if the set widens |
| --- | --- | --- |
| `classifyModelContent({ message: "\u2028" })` | `present` | `empty-malformed` — the rule-4 malformed-envelope row (`:21`) |
| `classifyModelContent({ message: "  " })` (control) | `empty-malformed` | unchanged |
| `renderEmptyShortCircuit("\u2028")` | `undefined` (a turn is issued) | `Err(ValidationError{cause:"empty_template"})` via QRY-6 |
| `renderEmptyShortCircuit(" \t ")` (control) | `empty_template` | unchanged |

## Expected behaviour

A normative sentence decides whether rule 3's one-line contract holds against
the non-ASCII line terminators, and rule 1's set, the `a10` pin and the second
copy of the set in `src/render/query-render.ts` follow that sentence. The lines
that come closest each stop short:

- `docs/spec_topics/binder/defaulting-system-note-echo.md:18` — fixes the
  whitespace set by ASCII membership and preserves everything outside it. It
  answers "which characters are collapsed", not "which characters break a
  line". The two questions coincide for the six ASCII characters and diverge at
  U+2028 and U+2029.
- `:20` (rule 3) — states the one-line grammar and the trust boundary, and
  names no line-terminator set.
- `:16` — binds the success echo to the shared line-discipline; carries the
  same silence.
- `:19` (rule 2) — measures the cap "over the rule-1 output" in Unicode scalars.
  Scalar counting is terminator-agnostic, so the cap gives no evidence either
  way.
- `:24` — the normative reference rendering fixes the tab-and-space collapse and
  the U+00A0 pass-through. No reference rendering covers a non-ASCII line
  terminator.
- `docs/spec_topics/diagnostics/placeholder-rendering-b.md:41`, `:130` — decide
  the identical question for category 6 and answer "ordinary characters, MUST
  NOT split". That rule governs `<original content first line>`, which
  re-renders this note's content on the delivery-failure path, but its scope is
  its own rule ("for this rule"), so it does not settle rule 1's set.

## Actual behaviour / root cause

The implementation is conformant. `ASCII_WHITESPACE_RUN`
(`src/binder/system-note.ts:56`) is the six-character class and the trim strips
U+0020 only (`:79–87`), so `sanitizeSystemNoteSubstring("a\u2028b")` returns its
input unchanged. `renderString` (`src/render/argument-echo.ts:110`) runs the
quote predicate over that output; U+2028 is outside `[A-Za-z0-9_.-]`, so the
value is quoted, and the escape pass touches `"` and `\` only, per `:35`. The delivered
note therefore contains the character verbatim, which is what `:18` requires and
what `a10` pins.

The gap is in the pairing of two rules that were written against different
criteria. Rule 1 enumerates *whitespace* and excludes everything non-ASCII; rule
3 constrains a *line* and defines no terminator set. For the six ASCII
characters the two coincide: collapsing them is exactly what keeps the note one
line. Outside the set the two come apart, and only at U+2028 and U+2029 — the
other named survivors (U+00A0, the U+2000–U+200A range) are not line
terminators, so preserving them costs rule 3 nothing. Rows (a) and (b) measure
both halves of that split.

Reachability is narrower than 0087's U+000A but is not zero, and both of 0087's
carriers remain open: the declared-default carrier through `\u{2028}` (or a raw
character) in a theta string literal, and the binder-supplied carrier through a
JSON string. Rows (c) measure both.

## Why it matters

1. Rule 3's demarcation is what a downstream renderer is told it can trust. Row
   (b) 3 shows the trust boundary is violable from the value side for a
   consumer using JavaScript's line-terminator semantics: `/^Running \//gm`
   matches twice on one note's content, and the second match is a complete
   fabricated echo for a theta that never ran.
2. The behaviour exists only as a test row. `a10`
   (`tests/echo-value-rule1-sanitisation.test.ts:218–228`) is the sole artefact
   asserting that the two characters survive, inside the regression file of a
   report that is fixed and closed. A later edit to
   `sanitizeSystemNoteSubstring` has no normative text to check itself against,
   and a reviewer's authority is a test comment whose own last clause records
   the open question ("how a downstream renderer displays either character is
   outside rule 1's scope").
3. The set has one normative statement, two code copies and one by-reference
   consumer, so the decision is not local to the echo. A widening changes all
   six `sanitizeSystemNoteSubstring` call sites at once and,
   per QRY-6's cross-reference (`query-forms.md:99`), the degenerate-template
   predicate as well. Rows (d) measure the two outcomes that flip: a `message`
   of only U+2028 becomes a malformed envelope, and a template rendering to only
   U+2028 short-circuits instead of issuing a turn.
4. The corpus currently answers the same question two ways for the same bytes.
   Category 6 (`placeholder-rendering-b.md:41`, `:130`) states that U+2028 and
   U+2029 are ordinary characters and MUST NOT be split on, and it governs the
   first-line re-render of this note's content when delivery fails. Rule 1's
   silence leaves the echo path with no stated posture at all.

## Non-goals

- Not a claim that the implementation is non-conformant. Every row in (a) and
  (b) is what `:18` prescribes, and the four control rows across those two
  tables are conformant on both the quote predicate and the collapse.
- Not a reopening of 0087. The six ASCII characters, the rule-1-before-rule-2
  ordering, the quote predicate, the escape set, the `(default)` tag and the
  BNDR-6 rows are settled there and are green at this HEAD.
- Not about U+00A0, U+2003 or the rest of the U+2000–U+200A range. `:18` names
  them, `a7` pins them, `:24` carries a normative reference rendering for
  U+00A0, and none of them produces a line break (rows (a) 7 and 8).
- Not about how a particular terminal or renderer displays U+2028. This report
  measures the delivered bytes and the behaviour of consumers that split on the
  JavaScript line-terminator set; the rendering behaviour of Pi's own
  `theta-system-note` renderer is not measured here.
- Not about category 6's own rule, which already decides its question and needs
  no change under either disposition.
- Not about
  [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md).
  Its renderer has no rule-1 pass on any path, so widening rule 1's set would
  not reach it.

## Fix

Not yet decided. The settled question is a **spec** decision on
`docs/spec_topics/binder/defaulting-system-note-echo.md`: whether rule 3's
one-line contract binds against U+2028 and U+2029, or whether the six-character
closure of rule 1 is deliberate and the two-line render through a non-ASCII line
terminator is accepted. The code and the `a10` pin follow the text.

**Candidate dispositions.**

1. *Widen rule 1's set to include U+2028 and U+2029.* One edit at `:18`: the
   collapse and trim sub-steps read the six ASCII characters plus the two
   non-ASCII line terminators, with the non-ASCII preservation clause retained
   for U+00A0 and the U+2000–U+200A range. Same commit: `ASCII_WHITESPACE_RUN`
   (`src/binder/system-note.ts:56`), the second copy of the set
   (`src/render/query-render.ts:55`), and the `a10` expectation
   (`tests/echo-value-rule1-sanitisation.test.ts:218–228`, which becomes a
   collapse row and joins group A's `"a b"` rows). Rows (a), (b) and (d) all
   flip. The edit closes the forging vector for these two characters and makes
   the echo one line under every line-terminator convention measured here.
   Obligations attached: the widened set is no longer "exactly the ASCII
   whitespace set", so `:18`'s own framing and QRY-6's cross-reference wording
   (`query-forms.md:99`) both move; the two row (d) outcomes are behaviour
   changes on adjacent surfaces and must be stated rather than discovered; and
   the resulting divergence from category 6 (`placeholder-rendering-b.md:41`,
   `:130`) on the same bytes must be stated at one of the two sites.
2. *State that the six-character closure is deliberate.* One sentence at `:18`
   or `:20`: rule 3's one-line contract is defined over the ASCII line
   terminators only; U+2028 and U+2029 are ordinary characters for this rule and
   are preserved, and a consumer that treats them as line breaks may render a
   note across more than one line. Changes no code and moves no test
   expectation; `a10` gains the anchor it lacks, and the corpus answers the
   question the same way at both sites that face it. Obligation attached: the
   accepted risk is the row (b) 3 forging observable, so the sentence states
   that the trust boundary rule 3 establishes is defined against the ASCII
   terminators and does not extend to a consumer using JavaScript's
   line-terminator semantics.

**Constraints on any resolution.**

1. **`:18`'s set is closed prose, and it is the only place it is stated
   normatively.** No `docs/reference/` page restates the six characters
   (checked at this HEAD); the two code copies (`src/binder/system-note.ts:56`,
   `src/render/query-render.ts:55`) and QRY-6's by-reference clause
   (`query-forms.md:99`) are the only downstream carriers. A widening that
   moves one copy and not the other leaves two implementations of one set.
2. **U+00A0 and U+2003 stay preserved.** `:18` names U+00A0 and the
   U+2000–U+200A range deliberately, `:24` pins the U+00A0 rendering
   normatively, and `a7` (`tests/echo-value-rule1-sanitisation.test.ts:208–216`)
   plus `tests/binder-system-note-determinism.test.ts:54` pin it in tests. A
   widening enumerates the two added characters; it does not reach for a `\s`
   class, which would take both of these with it.
3. **Rule 2's ordering is unaffected and must stay last.** `:19` measures the
   cap over the rule-1 output in Unicode scalars; a widening changes the scalar
   count of the sanitised value — row (a) 3 goes from 6 rendered scalars to 2,
   because the trimmed value `ab` then satisfies the unquoted predicate and
   renders bare — but not the ordering, and `capSystemNote`'s sole call site
   (`src/extension/production-theta-producer.ts:891`) is untouched by either
   disposition.
4. **`a10` moves with the text, in the same commit.** It is the only test in
   `tests/` that depends on these two characters (checked at this HEAD); its
   ledger entry (`:66–72`) classifies it as a guard against a `\s`-class
   substitution, and under disposition 1 that role passes to `a7` alone.
5. **Neither disposition mints a diagnostic code.** Disposition 2 fires nothing
   new. Disposition 1 fires no new code either, but changes which inputs reach
   two existing outcomes — the rule-4 malformed-envelope row (`:21`, through
   `classifyModelContent`, `src/binder/system-note.ts:158`, `:168`) and QRY-6's
   `empty_template` short-circuit (`src/render/query-render.ts:465`) — both
   measured in rows (d). DIAG-2 is not reached.
6. **The category-6 precedent is the corpus's only existing decision on these
   characters, and its stated justification does not hold at this HEAD.**
   `placeholder-rendering-b.md:130` justifies its posture in part with "authors
   cannot introduce them through a regular string literal". Rows (c) 1 and 2
   measure the opposite: `lexical.md:26`'s `\u{XXXX}` escape admits
   `\u{2028}`, and a raw U+2028 inside a string literal lexes clean because the
   single-line-body rule reads U+000A only. A resolution citing that precedent
   re-checks the parenthetical in the same commit; the precedent's *rule* is
   unaffected either way.

## Provenance

- Spec: `docs/spec_topics/binder/defaulting-system-note-echo.md:16`, `:18`,
  `:19`, `:20`, `:21`, `:24`, `:35`;
  `docs/spec_topics/query/query-forms.md:99` (QRY-6);
  `docs/spec_topics/diagnostics/placeholder-rendering-b.md:22`, `:24`, `:34–39`,
  `:41`, `:130`; `docs/spec_topics/diagnostics/code-registry-runtime.md:19`;
  `docs/spec_topics/lexical.md:26`.
- Implementation: `src/binder/system-note.ts:56`, `:71`, `:79–87`, `:132`,
  `:158`, `:168`, `:185`; `src/binder/compact-transcript.ts:348`;
  `src/render/argument-echo.ts:92`, `:110–116`, `:126`, `:153`, `:163`, `:166`,
  `:178`, `:196`; `src/render/query-render.ts:55`, `:58`, `:435`, `:465`;
  `src/extension/production-theta-producer.ts:860`, `:891`, `:894–902`.
- Tests: `tests/echo-value-rule1-sanitisation.test.ts:66–72`, `:208–216`,
  `:218–228`; `tests/binder-system-note-determinism.test.ts:54`.
- Prior reports read for separation:
  [0087](./0087-echo-note-newline-unsanitised.md) (§Fix (0.56.0) *Residuals*
  item (i), `:335–341`),
  [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md).
- Observations: one throwaway offline vitest probe at `1d26a86a` — direct
  renderer calls, the group-G emitter harness copied from
  `tests/echo-value-rule1-sanitisation.test.ts`, lexer/parser calls through
  `tests/helpers/e2e-s1.ts`, and direct calls on `classifyModelContent` and
  `renderEmptyShortCircuit`; deleted after the run. Every `path:line` above was
  re-verified at this HEAD.
