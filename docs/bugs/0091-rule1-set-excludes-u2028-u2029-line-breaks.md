# Bug 0091 — System-note rendering rule 1 closes its whitespace set at six ASCII characters, so U+2028 LINE SEPARATOR and U+2029 PARAGRAPH SEPARATOR survive the echo's rule-1 pass by spec: the delivered `Running /<name>: …` note renders as two physical lines to a consumer that treats the JavaScript line terminators as line breaks, and no sentence says whether rule 3's one-line contract is meant to hold against them

- **Status:** fixed (0.257.0). The adjudication this report asked for was made by
  operator ruling in favour of **disposition 2** — the six-character closure is
  deliberate and the two-line render through a non-ASCII line terminator is
  accepted. See §Fix (0.257.0) below. No fix-ordering dependency:
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

**(d′) The two failure-arm renderers, re-measured at HEAD `ade1dfec`** (added
by the adjudication pass; the original filing measured the success echo only,
so these two rows widen the filing's own §Affected list of
`sanitizeSystemNoteSubstring` call sites from named to measured). Both
confirm the same posture the success echo carries.

| Probe | Result today | Result if the set widens |
| --- | --- | --- |
| `renderFailureNote` with suffix `a\u2028b` | `theta /t: argument binding needs more info — a\u2028b`; LF lines 1, JS lines **2** | one line |
| `renderAmbiguousSuffix({ message: "a\u2028b" })` | `a\u2028b`; LF lines 1, JS lines **2** | one line |

Rule 3's `theta /<name>: <fixed-phrase> — <sanitised-suffix>` grammar is
therefore violable through the same two code points on the failure arms, not
only on the success echo. Two further confirmations measured in the same pass,
on surfaces landed after this report was filed: `normaliseLiteralValueLineBreaks`
(`src/diagnostics/diagnostic.ts`, bugs 0105 / 0250) returns byte identity on
`a\u2028b` because its predicate is `[\r\n]`, and `renderHostDerivedTail`
(`src/diagnostics/placeholder.ts`, bug 0258) leaves `a\u2028b` intact while
cutting `a\nb` at the first U+000A. Neither discharges this report; both decide
these two code points the same way §Fix (0.257.0) below ratifies.

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

## Fix (0.257.0)

**Spec authority.** This report asked for an adjudication, not an
implementation, and the adjudication was made by operator ruling. The ruling is
recorded verbatim because it, not this record's reading of it, is the authority
the resolution rests on:

> OPERATOR RULING (fifteenth set, ruling 3): 0091 = disposition 2 — state the
> closure as deliberate. Rule1's sanitisation set is the CR/LF class only, by
> design; U+2028 and U+2029 are ordinary characters on every render surface
> (echo values, notes, failure notes, ambiguous suffixes, host-derived tails —
> the six accreted sites' posture is ratified). One normative sentence states
> this where rule1 is defined, with mirrors per DIAG-2 only if that definition
> lives on a registry page (expect not). The JS-line-terminator forging vector
> (the /^Running \//gm 2-vs-1 row) is recorded as the ACCEPTED RESIDUAL — real
> only for downstream consumers honouring JS line terminators, none shipped; a
> real consumer face reopens it as a new filing. The two landed explicit
> deferrals (their fix records deferred these codepoints to 0091) get dated
> coordination notes pointing at this disposition (version 0.257.0). Disposition 1
> (widen) is REJECTED — it would flip witness a10, change behaviour at d6/d7's
> surfaces, and contradict six landed sites.

- What shipped:
  - `docs/spec_topics/binder/defaulting-system-note-echo.md` — the one normative
    sentence-set, appended inline to rule 1's own paragraph (the physical line
    opening `1. **Single line.**`, line 18), which is where rule 1 is defined.
    It states four things: the six-ASCII closure is deliberate, not an
    oversight; the replacement sub-step's line terminators are U+000A, U+000D
    and the U+000D U+000A pair, and rule 1 together with rule 3's one-line
    contract is defined against that CR/LF class only; U+2028 and U+2029 are
    ordinary characters for these rules and implementations MUST NOT split on
    them, MUST NOT strip them, and MUST NOT promote them into U+000A, matching
    the posture the "Category 6 line-separator scope" bullet already states in
    [Placeholder rendering b — Edge cases](../spec_topics/diagnostics/placeholder-rendering-b.md#edge-cases);
    and the accepted residual named below. The append is **inline** by design:
    the page's total line count is 82 before and after, so every corpus citation
    into lines 19–82 of that page is byte-stable.
  - No mirror was written. Per DIAG-2 a mirror is owed only where the definition
    lives on a registry page; rule 1 is defined on a binder spec-topic page, so
    the ruling's mirror condition ("expect not") is not met. No `theta/*` code
    is added, removed or reworded and no registry row moves.
  - `tests/b0091-rule1-ascii-terminator-closure-gate.test.ts` — new six-cell
    conformance oracle over the edited page (cells 1–4 the prose obligations,
    cell 5 an anti-widening ratchet on the unchanged six-character enumeration,
    cell 6 the behavioural mirror on both code points).
  - This document — §Reproduction gains block (d′); §Status becomes fixed.
  - Two dated coordination notes (below, and in the two deferring records).
- **Zero source bytes changed.** `git diff --name-only HEAD -- src` is empty.
  Disposition 2 ratifies the implementation as it stands; the code was already
  conformant, as §Actual behaviour states.
- Gates: witness `tests/b0091-rule1-ascii-terminator-closure-gate.test.ts`
  6/6 green (RED 4/6 at the pre-fix bytes, cells 1–4, restored byte-exact —
  blob `18c7e769` before and after the revert probe); full default suite
  `npm test` **428 files / 9050 tests passed**; `npm run typecheck` clean;
  `npm run lint` clean. No live test owed or run: no runtime path moved.
- Review: 2 rounds. Round 1 (deep) — one `fidelity` finding, that the forward
  citations to "§Fix (0.257.0)" and the two coordination notes' "is fixed" claims
  dangled while §Fix still read "Not yet decided"; fixed by this record. One
  non-blocking `test` residual (the behavioural mirror pinned U+2028 only),
  fixed by adding the U+2029 assertion to cell 6. Round 2 (fast) — clean; it
  re-ran the gates independently and re-derived the record's own claims (82-line
  page count, empty `src` diff, the `a7`/`a10` blob) against the tree. Round 2
  raised one `prose` residual against an earlier draft of this bullet, which
  asserted its verdict before the round had run; this wording records the
  sequence instead.
- Verification: SOLID. Witness reds at the pre-fix bytes and greens at the fix
  bytes with a hash-verified byte-exact restore; default suite green; live not
  owed and not run, with the zero-src-diff claim verified rather than asserted;
  typecheck and lint clean; the locked cells `a7`/`a10`
  (`tests/echo-value-rule1-sanitisation.test.ts`) byte-identical to the baseline
  (blob `01e06ca4` on both sides).
- Residuals:
  1. **The accepted residual (ruling, verbatim scope).** The forging observable
     of §Reproduction row (b) 3 stands: a downstream consumer that honours the
     JavaScript line-terminator set reads two anchored `Running /` matches on
     one note's content, the second a complete fabricated echo for a theta that
     never ran. It is accepted because it is real only for such a consumer and
     none ships — Pi's own `theta-system-note` surface is not one, and this
     report's §Non-goals already declined to measure any particular renderer.
     **Reopen condition:** a real consumer face honouring JS line terminators
     reopens this as a **new filing**, not as a reopening of 0091.
  2. **`placeholder-rendering-b.md`'s category-6 parenthetical is false at
     HEAD, and is left standing.** §Fix constraint 6 required a resolution
     citing that precedent to re-check the parenthetical "authors cannot
     introduce them through a regular string literal". It was re-checked and it
     is false: §Reproduction rows (c) 1 and (c) 2 measure a `\u{2028}` escape
     and a raw U+2028 both lexing clean inside a theta string literal. It was
     **not edited**: the ruling authorises one sentence where rule 1 is defined,
     and that page is a different rule's definition site. The precedent's *rule*
     is unaffected either way — constraint 6 concedes this — and the new
     cross-reference cites the posture, which is true, not the justification,
     which is not. **Owed as a separate filing**: a one-clause correction of
     that parenthetical on its own page.
  3. **The filing's §Affected and §Provenance line numbers are stale at HEAD**
     and are deliberately not refreshed: per `docs/STYLE.md` §Citations,
     `docs/bugs/**` is outside the citation gate in both directions and a bug
     document is a dated record of one HEAD. A reader resolving a stale position
     reads by symbol. The measured drift is recorded in the adjudication pass's
     working notes, not here.
- Discharge notes appended: two dated coordination notes, both pointing at this
  disposition — bug
  [0103](./0103-binder-description-argument-hint-lines-forgeable-by-newline.md)
  (fixed 0.131.0; its §Fix alternatives item (b) and *Residuals* item 4 deferred
  these code points here) and bug
  [0209](./0209-binder-description-hint-all-break-value-emits-labelled-empty-line.md)
  (fixed 0.143.0; its §Non-goals and *Pinned dispositions* deferred them here).
  Both deferrals are discharged in the direction those records already assumed;
  neither record's measurements or witness cells move.
- Pinned dispositions / non-goals:
  - **Disposition 1 is rejected, and cell 5 of the new witness is the ratchet.**
    Rule 1's enumeration stays exactly {U+0009, U+000A, U+000B, U+000C, U+000D,
    U+0020}; the "exactly the ASCII whitespace set" framing, the `\s`-class
    prohibition and the U+00A0 clause are byte-unchanged. A future edit adding
    U+2028 or U+2029 to that set reds cell 5 deliberately.
  - `src/binder/system-note.ts`, `src/render/argument-echo.ts`,
    `src/render/query-render.ts` and
    `src/extension/production-theta-producer.ts` are untouched. QRY-6's
    by-reference clause (`docs/spec_topics/query/query-forms.md`) needs no edit:
    it points at rule 1's set, and the set did not move.
  - The two §Reproduction row (d) outcomes do **not** flip:
    `classifyModelContent({ message: "\u2028" })` stays `present` and
    `renderEmptyShortCircuit("\u2028")` stays `undefined`. Block (d′)'s
    `renderFailureNote` and `renderAmbiguousSuffix` likewise stay as measured —
    the ruling ratifies those two surfaces rather than changing them.
  - `tests/echo-value-rule1-sanitisation.test.ts` cells `a7` and `a10` are
    byte-unchanged and are now anchored by normative text rather than by a test
    comment, which is what §Why it matters item 2 asked for.
  - Bug [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md)
    is untouched, as §Non-goals requires: its renderer has no rule-1 pass on any
    path, so nothing in this resolution reaches it.

