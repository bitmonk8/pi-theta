# Bug 0258 — `theta/runtime/subagent-envelope-parse-failed` renders its `<line summary>` through `summarizeLine` alone, so a reserved-key child stdout line written `\r\n` reaches the operator with the pump's trailing U+000D still inside the message: the category-8 first-line truncation `placeholder-rendering-b.md:91` pins for the placeholder is applied by the sibling row `theta/runtime/subagent-wire-parse-failed` (`mapWireParseFailure`, wired by bug 0086 at 0.230.0) and by nothing here, and the same CR-bearing string is also the `InvokeInfraError.message` the parent hands an `invoke` caller

- **Status:** fixed (0.242.0).
- **Sev/Diff estimate:** S3/D1 — S3 because a registered diagnostic renders a
  cooked control character where `diagnostic-shape.md:34` says single-line
  summary and `placeholder-rendering-b.md:91` states the exact transform that
  removes it, but the input class needs a child (or a co-process on the child's
  fd 1) writing a `\r\n`-terminated reserved-key line that fails the pinned
  schema, which the shipped writer never produces. D1 because the remedy is one
  call to a function this module already imports (`renderHostDerivedTail`,
  `src/runtime/subagent-envelope.ts:53`) at one interpolation (`:393`), with
  zero net line shift and no existing assertion moving.
- **Kind:** defect — implementation. `placeholder-rendering-b.md:89` lists
  `<line summary>` among the category-8 host-derived freeform tails and `:91`
  states the rule (newline-normalise, cut at the first `\n`); `:93` names both
  carrier rows —`theta/runtime/subagent-wire-parse-failed` and
  `theta/runtime/subagent-envelope-parse-failed` — as rendering "per the rule
  above". No spec edit is required: the rule is already written and already
  covers this row.
- **Related:**
  - [0086](./0086-subagent-wire-parse-failed-no-emitter.md) — **fixed
    (0.230.0)**, the filing origin. Its `## Fix (0.230.0)` §Residuals item 1
    names this report's subject: "The sibling row
    `theta/runtime/subagent-envelope-parse-failed` has the identical latent
    `<line summary>` CR non-conformance: `mapEnvelopeParseFailure` renders a
    trailing CR that category 6's first-line truncation would cut. It is
    pre-existing and unfiled, and fixing it would move that row's observable, so
    it was left alone (GOV-15). Worth its own report." This report is that
    filing. 0086 shipped the wired sibling (`mapWireParseFailure`,
    `src/runtime/subagent-envelope.ts:421`) whose rendering this row does not
    share.
  - [0105](./0105-malformed-tool-entry-message-embeds-raw-newline.md) — **fixed
    (0.217.0)** and
    [0250](./0250-duplicate-enum-value-message-embeds-cooked-newline.md) —
    **fixed (0.221.0)**, the two landed precedents for one un-normalised
    interpolation reaching a line-oriented rendering. Both fixed it at the
    interpolation rather than at the renderer, and 0250 is the last-site case of
    an enumeration whose other sites were already wired — the shape this report
    has. Neither owns this carrier: 0105 and 0250 wired
    `normaliseLiteralValueLineBreaks` at parse/load-time `<value>` sites
    (`placeholder-rendering-b.md:74`, §7), a different sub-rule from §8's
    host-derived tail.
  - **Ordering:** no report blocks this one and this one blocks none. Its only
    dependency — the category-8 renderer — is in the tree and already imported
    by the file that needs it.
- **Affected** (every citation verified at HEAD `53cd0d86`, 0.240.0):
  - `src/runtime/subagent-envelope.ts:386–408` — **the emission site.**
    `mapEnvelopeParseFailure` (`:392`). `:393` is the whole of the rendering,
    `const summary = summarizeLine(line);`, and `:394` interpolates it:
    ``const message = `subagent return envelope failed the pinned schema:
    ${summary}` ``. `:404` is the `code` field; the one `message` string is
    placed on both `error.message` (`:398`) and `diagnostic.message` (`:405`).
  - `src/runtime/subagent-envelope.ts:374–378` — `summarizeLine`, the local
    length cap: `MAX = 120` (`:376`), `line.length > MAX` yields the first 120
    characters plus U+2026, otherwise the line verbatim (`:377`). It performs no
    newline handling of any kind.
  - `src/runtime/subagent-envelope.ts:410–437` — `mapWireParseFailure`, the
    sibling row's builder. `:422–433` is the comment stating the rule for this
    placeholder class ("newline-normalise (`\r\n` and bare `\r` become `\n`),
    then cut at the first break … The production line pump splits on `\n` alone
    and leaves a trailing CR for this parser to trim … that CR must not reach
    the operator"), and `:434` is the rendering that applies it:
    `summarizeLine(renderHostDerivedTail(line))`.
  - `src/runtime/subagent-envelope.ts:53` — the import line,
    `import { renderHostDerivedTail } from "../diagnostics/placeholder";`. The
    binding this site needs is already in scope in this module, so no import
    edit is reachable from the fix.
  - `src/diagnostics/placeholder.ts:350–353` — `renderHostDerivedTail`, the
    shared category-8 renderer, delegating to `firstLineTruncate`
    (`:285–291`): `\r\n` → `\n` and bare `\r` → `\n` (`:286`), cut at the first
    `\n` (`:287–289`), and the literal `<no message>` on an empty first line
    (`:290`).
  - `src/runtime/subagent-json-driver.ts:127–162` — the driver arm that decides
    which of the two rows a line reaches. `:127` classifies the line; `:131–147`
    is the `unparseable` arm — its blank-line filter (`:140`,
    `/^[ \t\r\n]*$/`) and the bounded wire emission (`:143–145`); `:157–162` is
    the `parse-failed` arm, which calls `mapEnvelopeParseFailure(parse.line,
    calleePath)` (`:158`), emits the diagnostic (`:159`) and settles the
    invocation on the reconstructed `Err` (`:160`). The envelope row has no
    blank-line filter and no per-invocation bound, because a reserved-key line
    is JSON by construction and settles the drive.
  - `src/extension/production-subagent-host.ts:318–338` — `adaptChild`'s line
    pump. `:319–320` states the framing ("LF-only line buffers per stream …
    a trailing CR is left for the wire parser to trim"), `:329` splits on
    `buffer.indexOf("\n")`, `:330–331` slice the line without the delimiter, and
    `:332–334` skip a zero-length line. Nothing strips U+000D, so a
    `\r\n`-terminated child write is delivered as a line ending in U+000D.
  - `src/extension/production-theta-producer.ts:2250` — the shipped
    `driveSubagentChild` call.
    `src/extension/production-composition.ts:732` — `emitDiagnostic: sink.emit`,
    the per-diagnostic runtime arm this row's diagnostic rides.
  - `src/runtime/err-note-render.ts:158–162` — SNK-i, the `invoke_infra` arm of
    the `Err` system-note rendering. It interpolates `e.callee_path` and
    `e.cause` and **not** `e.message` (`:161`), so the CR-bearing string reaches
    the operator through the diagnostic channel and through the `Err` an
    `invoke` parent receives, not through this note.
  - `src/diagnostics/diagnostic.ts:62–90` — `renderDiagnosticLine`; `:80`
    appends `\n  hint: <hint>` and `:86` appends
    `\n  <file>:<line>:<col>: <message>` per related site. `:97` —
    `renderDiagnosticBatch`, joining blocks with `"\n\n"`. `:152` —
    `normaliseLiteralValueLineBreaks`, the §7 parse-time literal-value transform
    0105 and 0250 wired; it is **not** imported by
    `src/runtime/subagent-envelope.ts` and its output diverges from §8's on
    trailing whitespace (measured below).
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md:89` — §8's
    placeholder list, `<line summary>` among them. `:91` — the rule
    (newline-normalise per Lexical — Encoding, prefix up to but not including
    the first `\n`, preserve trailing whitespace, `<no message>` when empty),
    plus the byte-identicality of the surrounding template. `:36–39` —
    category 6's four numbered steps that §8 defers to; step 1 collapses `\r\n`
    and bare `\r` to `\n`, step 3 forbids an rstrip. `:93` — the
    subagent-host-derived-tails paragraph naming
    `theta/runtime/subagent-envelope-parse-failed` as a `<line summary>` row
    that "renders per the rule above", and placing these rows inside GOV-15
    observable (c)'s category-8 host-derived-freeform-tails normalisation class.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:34` — `message: string,
    // single-line summary`. `:63` — **Serialised content format**. `:72` —
    DIAG-2. `:74` — DIAG-4, the *Message* column normative
    character-for-character.
  - `docs/spec_topics/diagnostics/code-registry-runtime.md:28` — the
    `theta/runtime/subagent-envelope-parse-failed` row (E, runtime). *Message*:
    `subagent return envelope parse failed: <line summary>`. `:27` — the sibling
    `subagent-wire-parse-failed` row, whose Trigger states the JSON-whitespace
    exemption "including the trailing CR of a `\r\n`-terminated write". Mirrors:
    `docs/reference/diagnostics.md:277` and `:276`.
  - `docs/spec_topics/governance/source-language-stability.md:5` — GOV-15.
    Observable (c) is equivalence after normalising "the category-8
    host-derived freeform tails", which is the class
    `placeholder-rendering-b.md:93` places this row in, so a change to this
    tail's rendering is inside the normalisation rather than a divergence of the
    promise.
  - `tests/subagent-envelope.test.ts:321–334` — the only unit cell over
    `mapEnvelopeParseFailure` (`:326`). It asserts `error.kind`, `error.cause`,
    `error.callee_path`, `diagnostic.code` and `diagnostic.severity` and does
    not read `message` at all, so no assertion in the tree constrains this
    row's rendered text.
  - `tests/subagent-json-wire.test.ts:132–144` — the driver-seam cell; it
    asserts the emitted code (`:144`) and no message.
  - `tests/subagent-wire-parse-failed-emitter.test.ts:347–383` — 0086's two CR
    cells for the sibling row: the trailing-CR case asserting
    `not.toContain("\r")` (`:365`) and the embedded-bare-CR case (`:369`). Its
    prefix oracle is registry-derived (`messagePrefixOf`, `:132–147`, over
    `registryMessage`), which is the DIAG-4 discipline a new witness inherits —
    and the reason §Fix constraint 4 exists.
  - `tests/registry-closed-set-corpus-gate.test.ts:138–145` — the `CARVE_OUT`
    entry for this code, which cites `src/runtime/subagent-envelope.ts:404` as
    the emission line. That citation is exact at HEAD and pins the fix's
    zero-line-shift constraint.
  - `tests/fixtures/h7a/permitted-codes.json` — 11 codes; this one is absent,
    and no fixture drives a malformed reserved-key line, so the code is
    unreachable from an ordinary `pi -p` run.
  - **No open report owns this carrier.** `rg -n 'mapEnvelopeParseFailure'
    docs/bugs/` returns only `0086-…` (fixed).
    `rg -n 'envelope-parse-failed' docs/bugs/` adds 0189 (fixed, 0.129.0), 0230
    (fixed, 0.184.0) and 0246 (fixed, 0.224.0), each citing the row for its
    registry-inventory subject rather than its rendering. 0250 fixed the §7
    enum-value carrier and 0105 the §7 `tools:`-entry carriers; this is the §8
    envelope-summary carrier.
- **Observed at:** `0.240.0` (HEAD `53cd0d86`). Offline, deterministic; no live
  model, no provider, no child process. Two scratch vitest probes calling
  `mapEnvelopeParseFailure`, `mapWireParseFailure`,
  `classifyChildStdoutLine`, `parseEnvelopeLine`, `renderHostDerivedTail` and
  `normaliseLiteralValueLineBreaks` directly, with the real
  `renderDiagnosticLine` / `renderDiagnosticBatch` applied to the diagnostics
  produced; written, run, deleted.

## Summary

`mapEnvelopeParseFailure` renders `<line summary>` with the length cap only:

```ts
const summary = summarizeLine(line);
const message = `subagent return envelope failed the pinned schema: ${summary}`;
```

`src/runtime/subagent-envelope.ts:393–394`. `summarizeLine` (`:374–378`) cuts at
120 characters and does nothing else. `placeholder-rendering-b.md:89` lists
`<line summary>` among category 8's host-derived freeform tails, `:91` states
the rendering (newline-normalise, then the prefix up to the first `\n`), and
`:93` names `theta/runtime/subagent-envelope-parse-failed` as one of the two
rows binding that placeholder. The transform is absent here and present in the
sibling builder eleven lines below, `mapWireParseFailure` (`:434`), which
renders `summarizeLine(renderHostDerivedTail(line))`.

The reachable carrier is the trailing U+000D of a `\r\n`-terminated write. The
production line pump splits on `\n` alone and leaves the CR "for the wire parser
to trim" (`src/extension/production-subagent-host.ts:319–320`, `:329`), so a
child writing `{"theta_result":{"v":1}}\r\n` delivers the line
`{"theta_result":{"v":1}}\r`. `JSON.parse` tolerates trailing whitespace, so
that line still classifies `envelope` and still fails the pinned schema, and the
CR rides the interpolation into both the diagnostic and the `Err`:

```
"subagent return envelope failed the pinned schema: {\"theta_result\":{\"v\":1}}\r"
```

The same input through the sibling builder renders without the CR. An interior
bare CR is not a carrier of this row: it makes `JSON.parse` throw, so
`classifyChildStdoutLine` answers `unparseable` and the driver routes the line
to `theta/runtime/subagent-wire-parse-failed` instead
(`src/runtime/subagent-json-driver.ts:131–147`) — measured below. The single
reachable class is therefore: a reserved-key line that parses as JSON, fails the
pinned schema, ends in U+000D, and is at most 120 characters long including that
CR (past the cap `summarizeLine` truncates the CR away).

The cooked CR is a control character in a field
`diagnostic-shape.md:34` states as a single-line summary. It is not split by the
`/\r?\n/` splitters the repository's own gates use, so it does not register as a
second line; it re-homes the cursor on a terminal that honours carriage return,
overwriting the rendered prefix — including the `<file>:<line>:<col>: <code>: `
segment `renderDiagnosticLine` puts in front of it
(`src/diagnostics/diagnostic.ts:62–90`).

## Reproduction

Offline, at `53cd0d86`. Scratch vitest, direct calls; no child process and no
provider. `classify` is `classifyChildStdoutLine(line).kind`, `parse` is
`parseEnvelopeLine(line).kind`, `envelope` is
`mapEnvelopeParseFailure(line, "/theta/child.theta").diagnostic.message` (the
same string as `.error.message`, asserted equal), `sibling` is
`mapWireParseFailure(line).message`. Every value is JSON-escaped.

```
A  input     "{\"theta_result\":{\"v\":1}}\r"                      [CRLF write]
   classify  envelope        parse  parse-failed
   envelope  "subagent return envelope failed the pinned schema: {\"theta_result\":{\"v\":1}}\r"
             hasCR=true   lines=1
   sibling   "subagent event-stream line parse failed: {\"theta_result\":{\"v\":1}}"

B  input     "{\"theta_result\":{\"v\":1,\"x\":\"a\rb\"}}"          [interior bare CR]
   classify  unparseable     parse  parse-failed
   envelope  "…pinned schema: {\"theta_result\":{\"v\":1,\"x\":\"a\rb\"}}"   hasCR=true
   sibling   "subagent event-stream line parse failed: {\"theta_result\":{\"v\":1,\"x\":\"a"

C  input     "{\"theta_result\":7}\r"                              [non-object payload]
   classify  envelope        parse  parse-failed
   envelope  "…pinned schema: {\"theta_result\":7}\r"              hasCR=true

D  input     "{\"theta_result\":{\"ok\":1}}\r"                     [no `v` field]
   classify  envelope        parse  parse-failed
   envelope  "…pinned schema: {\"theta_result\":{\"ok\":1}}\r"     hasCR=true

E  input     "{\"theta_result\":{\"v\":1}}"                        [control, no CR]
   classify  envelope        parse  parse-failed
   envelope  "…pinned schema: {\"theta_result\":{\"v\":1}}"        hasCR=false
   sibling   byte-identical to `envelope` after the prefix

F  input     "{\"theta_result\":{\"v\":1,\"x\":\"aaa…\"}}\r"        [200 a's, >120 chars]
   envelope  "…pinned schema: {\"theta_result\":{\"v\":1,\"x\":\"aaaa…"  hasCR=false
```

Rows A, C and D are the reachable class: `classify` is `envelope`, so the driver's
`parse-failed` arm (`src/runtime/subagent-json-driver.ts:157–162`) calls this
builder, and the CR survives. Row B classifies `unparseable`, so the driver
never reaches this builder for it — the interior-CR forgery is the sibling row's
input, and the sibling cuts it. Row F shows the cap masking the defect above 120
characters: the truncation removes the tail, CR included. Row E is the identity
half.

### The line-oriented forgeries are not reachable through the driver

Called directly, a `\n` in the line produces a two-physical-line `message` and
forges the reserved continuation lines: input
`{"theta_result":{"v":1}}\n  hint: forged` renders through the real
`renderDiagnosticLine` as

```
theta/runtime/subagent-envelope-parse-failed: subagent return envelope failed the pinned schema: {"theta_result":{"v":1}}
  hint: forged
```

— a `  hint: ` line on a diagnostic carrying no `hint` field — and
`{"theta_result":{"v":1}}\n\ntail` makes `renderDiagnosticBatch([d])` render
**2** blocks from one `Diagnostic`. The production pump splits on `\n`
(`src/extension/production-subagent-host.ts:329`), so no delivered line contains
one: these are unit-level properties of the builder, not shipped forgeries. They
are recorded because the transform that closes the CR closes them too, and
because `mapEnvelopeParseFailure` is exported and callable by any future caller.

### Both candidate transforms close the reachable class, and they are not interchangeable

`renderHostDerivedTail` (§8, `src/diagnostics/placeholder.ts:350`) against
`normaliseLiteralValueLineBreaks` (§7, `src/diagnostics/diagnostic.ts:152`) on
the same inputs:

```
"{\"theta_result\":{\"v\":1}}\r"    §8 -> "{\"theta_result\":{\"v\":1}}"    §7 -> "{\"theta_result\":{\"v\":1}}"
"{\"theta_result\":{\"v\":1}} \r"   §8 -> "{\"theta_result\":{\"v\":1}} "   §7 -> "{\"theta_result\":{\"v\":1}}"
"{\"theta_result\":{\"v\":1}}"      §8 -> "{\"theta_result\":{\"v\":1}}"    §7 -> "{\"theta_result\":{\"v\":1}}"
"{\"a\":1}\t\r"                     §8 -> "{\"a\":1}\t"                    §7 -> "{\"a\":1}"
```

They agree on a bare trailing CR and diverge whenever horizontal whitespace
adjoins it: §8 preserves it (`placeholder-rendering-b.md:38`, "Preserve trailing
whitespace on the resulting line — no rstrip"), §7 collapses the run and trims
(`src/diagnostics/diagnostic.ts:152`). §8 is the rule this row's placeholder is
listed under.

### Not measured

No child process was spawned and no live drive was run. The delivery claim rests
on reading the shipped route
(`src/extension/production-theta-producer.ts:2250` →
`src/extension/production-composition.ts:732`), not on an end-to-end capture.
Nothing is claimed about the operator's rendered transcript; the strings
measured are the `Diagnostic` fields and the `content` input that
`diagnostic-shape.md:63` governs.

## Expected behaviour

- **`<line summary>` renders per category 8.** `placeholder-rendering-b.md:89`
  lists the placeholder, `:91` states the rule, and `:93` names
  `theta/runtime/subagent-envelope-parse-failed` as a row that binds it. Step 1
  of the rule it defers to (`:36`) collapses `\r\n` and bare `\r` to `\n` and
  step 2 (`:37`) cuts before it, so no U+000D survives into the rendered tail.
- **`message` is one line and carries no cooked control character.**
  `diagnostic-shape.md:34` states the field as a single-line summary, mirrored
  at `docs/reference/diagnostics.md:19`. No page qualifies the claim by code or
  by the provenance of the interpolated value.
- **The two `<line summary>` rows render the same input identically.**
  `placeholder-rendering-b.md:93` states one rule for both. A line that renders
  `garbage` through `theta/runtime/subagent-wire-parse-failed` and `garbage\r`
  through `theta/runtime/subagent-envelope-parse-failed` leaves the rule
  half-enforced, and the difference is the pump artefact rather than anything
  about the offending line.
- **The rendered prefix is the renderer's.** `renderDiagnosticLine` puts the
  located triple and the code in front of the message
  (`src/diagnostics/diagnostic.ts:62–90`). A trailing CR in the message returns
  the cursor to the start of that composed line on a terminal that honours it,
  so the operator can lose the code and location that identify the diagnostic.
- **The `Err` the parent hands an `invoke` caller carries the same disciplined
  string.** `mapEnvelopeParseFailure` places one string on `diagnostic.message`
  and `error.message` (`src/runtime/subagent-envelope.ts:394–405`); the second
  copy crosses into the caller's `Err` and is not covered by any other
  normalisation.

## Why it matters

- **The rule is written, the sibling implements it, and this row does not.**
  `placeholder-rendering-b.md:93` names both rows in one sentence.
  `mapWireParseFailure` applies `renderHostDerivedTail`
  (`src/runtime/subagent-envelope.ts:434`); `mapEnvelopeParseFailure` does not
  (`:393`). The two builders are eleven lines apart in one file, so the next
  reader of either has to establish by measurement which of them states the
  rule correctly.
- **Nothing in the tree constrains this row's rendered text.** The one unit cell
  (`tests/subagent-envelope.test.ts:321–334`) reads `code`, `severity`, `cause`
  and `callee_path`; the driver cell (`tests/subagent-json-wire.test.ts:144`)
  reads the code. `rg -n 'failed the pinned schema'` over the repository
  matches only `src/runtime/subagent-envelope.ts`. The property can regress or
  be fixed silently.
- **The defect is in the fail-closed path.** Unlike the advisory sibling, this
  row settles the invocation (`src/runtime/subagent-json-driver.ts:158–160`), so
  the CR-bearing string is what an operator reads while triaging a failed
  subagent invocation, and the copy on `InvokeInfraError.message` is what the
  parent's `Err` carries. SNK-i does not render that field
  (`src/runtime/err-note-render.ts:161`), so the diagnostic channel is the
  operator's only view of it.
- **GOV-15 is not a barrier, contrary to the residual that filed this.** 0086
  §Residuals item 1 left the row alone citing GOV-15;
  `placeholder-rendering-b.md:93` places these rows inside GOV-15 observable
  (c)'s category-8 host-derived-freeform-tails normalisation class
  (`docs/spec_topics/governance/source-language-stability.md:5`), so the
  rendering change is inside the normalisation. The residual's operative reason
  was scope: the site was outside 0086's §Fix region.
- **The input class is a skew or a co-process, which is when triage output has
  to be trustworthy.** The shipped child writes conforming envelopes
  (`serializeOkEnvelope` / `serializeErrEnvelope`), so a reserved-key line that
  fails the pinned schema comes from a version-skewed build or from another
  writer on the child's fd 1 — and a `\r\n`-terminated writer is the ordinary
  Windows console case.

## Non-goals

- **The *Message* template divergence.** The registry states
  `subagent return envelope parse failed: <line summary>`
  (`docs/spec_topics/diagnostics/code-registry-runtime.md:28`, mirrored at
  `docs/reference/diagnostics.md:277`); the shipped prefix at the time this
  report was filed was `subagent return envelope failed the pinned schema: `.
  This was a DIAG-4 question (`diagnostic-shape.md:74`) about which of the two
  moves, measured here only because a registry-derived witness oracle collides
  with it (§Fix constraint 4), and it was not this report's subject. Bug 0261
  (0.249.0) resolved it under branch A: the code aligned to the registry, so
  `src/runtime/subagent-envelope.ts:394` now reads `subagent return envelope
  parse failed: ${summary}` and neither registry cell moved.
- **`summarizeLine`'s 120-character cap.** `placeholder-rendering-b.md:91`
  leaves the length bound implementation-defined; the cap and the U+2026 marker
  are untouched, and the ordering (normalise, then cut) is the sibling's.
- **The other four rows in `placeholder-rendering-b.md:93`.** `<exit detail>`
  is built locally from a signal name or an exit code
  (`renderExitDetail`, `src/runtime/subagent-json-driver.ts:48–53`) and binds no
  free host text; `<detail>` on
  `theta/runtime/subagent-params-validation-failed`
  (`src/runtime/subagent-params.ts:304–318`) binds validator text and is not
  measured here. A sweep of §8 rows is a separate subject.
- **The driver's routing.** That an interior bare CR classifies `unparseable`
  and reaches the sibling row rather than this one is the shipped class
  separation bug 0086 pinned; it is correct and untouched.
- **`normaliseLiteralValueLineBreaks`'s §7 call sites.** The six 0105 sites and
  the one 0250 site answer a different sub-rule and do not move.
- **The serialised content format.** `diagnostic-shape.md:63`'s continuation-line
  and block-separator shapes are the contract; the transform belongs on the
  interpolated tail, as in
  [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md),
  [0087](./0087-echo-note-newline-unsanitised.md), 0105 and 0250.

## Fix

Render this row's `<line summary>` through the category-8 rule the sibling row
already applies. `src/runtime/subagent-envelope.ts:393` becomes
`const summary = summarizeLine(renderHostDerivedTail(line));` — the same
composition, in the same order, as `:434`. `renderHostDerivedTail` is already
imported at `:53`, so the edit is one line and the module's line count does not
change.

Constraints:

1. **The seam is the shared category-8 renderer, not the §7 transform.** Two
   spellings are admissible: the call at the interpolation as above, or folding
   the normalisation into `summarizeLine` (`:374–378`) so both builders inherit
   it and `:434`'s explicit call collapses to a plain `summarizeLine(line)`. The
   first keeps `summarizeLine` a pure length cap and leaves `:434` byte-untouched;
   the second single-sources the composition for a future third caller. Either
   satisfies `placeholder-rendering-b.md:91`.
   `normaliseLiteralValueLineBreaks` (`src/diagnostics/diagnostic.ts:152`) is
   **not** the seam: it answers §7's parse-time literal-value sub-rule, it
   collapses interior breaks to U+0020 instead of cutting at the first one, and
   it trims trailing whitespace where §8 forbids an rstrip — measured divergence
   in §Reproduction. Whichever spelling lands, the rendered tail for the
   reachable class is byte-identical to the sibling's.
2. **Net line shift in `src/runtime/subagent-envelope.ts` is ZERO.**
   `tests/registry-closed-set-corpus-gate.test.ts:138–145` cites `:404` as this
   code's emission line, and this report and 0086 cite `:374–378`, `:392–408`,
   `:421` and `:434`. Verify the file's line count before and after; the
   alternative is a citation sweep.
3. **No spec edit.** `placeholder-rendering-b.md:89`, `:91` and `:93` already
   state the rule and already name this row, so DIAG-2's same-commit rule
   (`diagnostic-shape.md:72`) has no subject and the closed placeholder tables
   do not move (GOV-7 / GOV-8). Confirm rather than assume: re-read `:93` at the
   fix baseline and check it still names both rows.
4. **The witness asserts the CR property independently of the prefix.**
   0086's cells anchor on a registry-derived prefix (`messagePrefixOf`,
   `tests/subagent-wire-parse-failed-emitter.test.ts:132–147`). The shipped
   prefix for this row diverged from its registry template (§Non-goals), so a
   cell copied from 0086 would red for two reasons at once and stay red after
   the fix. Assert `not.toContain("\r")` on the message and the tail's content
   by `toContain`, without a whole-message equality and without a
   registry-derived prefix anchor, unless the prefix divergence is dispositioned
   first — in which case that disposition is a separate change with its own
   record. **DISCHARGED by bug 0261 (0.249.0), branch A:** the shipped prefix now
   matches the registry template prefix, so the exception this constraint
   states no longer applies; this file's CR cells still carry no
   registry-derived prefix anchor, on the narrower and still-current ground
   that a prefix check and a CR check are separate properties (see
   `tests/b0258-envelope-parse-failed-line-summary-cr.test.ts`'s header).
5. **The witness pins both directions.** Required cells: the reachable
   trailing-CR line (rows A, C, D of §Reproduction) asserting the rendered
   `message` and `error.message` carry no U+000D and still name the offending
   line; the break-free control (row E) asserted byte-identical to today, which
   is the identity half; the over-cap line (row F) asserted unchanged; the
   interior-bare-CR line asserted to classify `unparseable` and reach the
   sibling code, so the class separation cannot drift under the fix; and one
   driver-level cell through `driveSubagentChild` over a fake child emitting a
   `\r`-terminated reserved-key line, asserting the emitted diagnostic's code
   plus the absence of U+000D and the fail-closed `Err`. Each must red against
   the pre-fix bytes on the CR assertion, never on a compile error.
6. **The existing cells stay green untouched.**
   `tests/subagent-envelope.test.ts:321–334` and
   `tests/subagent-json-wire.test.ts:132–144` read no message text, and
   0086's `tests/subagent-wire-parse-failed-emitter.test.ts` (10 cells) is
   unaffected by an edit at `:393`; if constraint 1's second spelling is taken it
   also changes `:434`, so re-run that file explicitly.
7. **GOV-15 is confirmed, not assumed.** The change alters a category-8
   host-derived tail's rendering, which observable (c) normalises
   (`docs/spec_topics/governance/source-language-stability.md:5` via
   `placeholder-rendering-b.md:93`). No diagnostic-code sequence moves: every
   input in §Reproduction emits the same code with the same severity and the
   same `Err` before and after. `tests/fixtures/h7a/permitted-codes.json` needs
   no entry (11 codes, this one absent; no fixture drives a malformed
   reserved-key line) — re-confirm at the fix baseline.
8. **No live run is owed beyond the existing subagent coverage.** The row is
   fault-injection-only from ordinary `pi -p` traffic (0086 §Residuals item 3
   established the same for the sibling: a healthy child writes strict JSONL).
   Run the H8a subagent-mode drive and the H9a subagent-mode acceptance cell to
   show the ordinary path is unflipped; a live witness of this emission would
   need a planted child writing a malformed reserved-key line, and none exists.

## Fix (0.242.0)

- What shipped: `src/runtime/subagent-envelope.ts:393` —
  `const summary = summarizeLine(renderHostDerivedTail(line));`, §Fix
  constraint 1's first spelling (the call at the interpolation), the same
  composition and order as the sibling `mapWireParseFailure` at `:434`, which
  is byte-untouched; `summarizeLine`'s body (`:374–378`) is byte-untouched;
  the `mapEnvelopeParseFailure` doc comment (`:389–390`) reworded in place to
  state the tail's category-8 class. `renderHostDerivedTail` was already
  imported at `:53`, so no import edit. No spec edit, no fixture edit.
- Gates: witness `npx vitest run
  tests/b0258-envelope-parse-failed-line-summary-cr.test.ts` — pre-fix
  `Tests 4 failed | 3 passed (7)`, every red on `expected '…' not to contain
  '\r'`; post-fix `Tests 7 passed (7)`. Full suite `npm test` —
  `Test Files 423 passed (423)` / `Tests 8895 passed (8895)`, zero skipped.
  `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) and `npm run lint`
  (`eslint … "src/**/*.ts"`) both clean. Live, under the shared live-lock:
  H8a `tests/live/live-production-acceptance.test.ts -t "subagent-mode"` →
  `2 passed | 87 skipped`, RC=0; H9a
  `tests/live/acceptance/noninteractive-acceptance.test.ts -t "subagent-mode"`
  → `1 passed | 9 skipped`, RC=0.
- Review: 1 round — `bug-fix-reviewer`, verdict CLEAN, zero findings; it
  re-derived constraints 1–7, re-ran the pre-fix red path against restored
  HEAD bytes, and confirmed the registry-gate carve-out arm stays open.
- Verification: SOLID. (1) Witness reds pre-fix for the CR reason and only for
  it — the 4 CR cells red, the identity, over-cap and class-separation cells
  stay green; restore byte-exact (`3 insertions(+), 3 deletions(-)`, 852
  lines). (2) Default suite green, zero skipped. (3) Live discharged as above;
  §Fix constraint 8 owes no further live witness — the row is
  fault-injection-only from ordinary `pi -p` traffic. (4) Lint and typecheck
  clean. (5) Locks unflipped: `tests/fixtures/h7a/permitted-codes.json`
  byte-unchanged after a real H9a run (11 codes, this one still absent),
  bug 0086's `tests/subagent-wire-parse-failed-emitter.test.ts` (10 cells),
  `tests/subagent-envelope.test.ts` (32) and `tests/subagent-json-wire.test.ts`
  (7) byte-unchanged and green.
- Constraint 2 (zero line shift) discharged by measurement:
  `src/runtime/subagent-envelope.ts` is 852 lines before and after; `:404` is
  still `code: SUBAGENT_ENVELOPE_PARSE_FAILED_CODE,`, the exact line
  `tests/registry-closed-set-corpus-gate.test.ts:139` cites, and `:434` is
  still the sibling's rendering. `tests/registry-closed-set-corpus-gate.test.ts`
  green, unmodified.
- Constraint 3 re-confirmed at the fix baseline:
  `docs/spec_topics/diagnostics/placeholder-rendering-b.md:89` still lists
  `<line summary>`, `:91` still states the rule, and `:93` still names both
  carrier rows, so DIAG-2 has no subject and no closed table moves.
- What locks it: `tests/b0258-envelope-parse-failed-line-summary-cr.test.ts`,
  7 cells — rows A/C/D asserting no U+000D on both `diagnostic.message` and
  `error.message` while still naming the offending line, row E's byte-identity
  control, row F's over-cap rendering held still, row B's interior-bare-CR
  class separation to `theta/runtime/subagent-wire-parse-failed`, and one
  `driveSubagentChild` seam cell over a fake child emitting a `\r`-terminated
  reserved-key line asserting the code, the CR absence and the fail-closed
  `Err(invoke_infra/internal_error)`. Per §Fix constraint 4 the CR cells use no
  registry-derived prefix oracle and no whole-message equality, so bug 0261's
  *Message*-template divergence does not couple to them. **DISCHARGED note
  (bug 0261, 0.249.0):** the divergence this constraint routed around no longer
  exists; the same-file `SHIPPED_PREFIX` literal at cells (b) and (c) was
  flipped to the new shipped prefix by the 0261 change, under this report's own
  fix-record pre-authorization for that flip (`.pi/tmp/fixes/0258-report.md`).
- Residuals:
  1. The *Message* template divergence (`subagent return envelope failed the
     pinned schema: ` shipped versus the registry's `subagent return envelope
     parse failed: <line summary>`,
     `docs/spec_topics/diagnostics/code-registry-runtime.md:28`) was untouched
     here and remained bug 0261's subject. Bug 0261 (0.249.0) resolved it under
     branch A: the code was aligned to the registry, neither registry cell
     moved, and cells (b) and (c) of this file's witness had their
     `SHIPPED_PREFIX` literal updated in the same change, per this report's own
     fix-record pre-authorization for that flip.
  2. The witness file must not spell either registry code with its `theta/`
     namespace prefix: `tests/registry-closed-set-corpus-gate.test.ts`'s
     extractor counts any full code-shaped literal under `tests/**` as an
     asserting witness, which would close the carve-out arm both rows are
     pinned under and red the gate. The file asserts through the exported
     constants and carries a header paragraph saying so.
  3. The other four §8 rows named at `placeholder-rendering-b.md:93`
     (`<exit detail>`, `<detail>`) were not swept; §Non-goals keeps that a
     separate subject.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: §Fix spelling 1 was taken over folding the
  normalisation into `summarizeLine`, on the operator's "your call on the
  record" — it keeps `summarizeLine` a pure length cap and leaves `:434`
  byte-untouched, which is what makes the zero-line-shift and
  existing-cells-untouched constraints trivially checkable.
  `normaliseLiteralValueLineBreaks` stays ruled out on the measured
  trailing-whitespace divergence. The driver's `unparseable`/`envelope` routing
  and the 120-character cap are untouched.

## Provenance

- Origin: the bug 0086 fix (0.230.0), `## Fix (0.230.0)` §Residuals item 1,
  which names the carrier, the builder, the trailing-CR mechanism and the
  warranted sibling filing, and `.pi/tmp/fixes/0086-report.md` residual 1, which
  records the same and states that `summarizeLine` and
  `mapEnvelopeParseFailure` were left byte-untouched. This report is that
  filing, and adds what the residual does not state: the exact interpolation and
  cap sites with their line forms; the reachability boundary (an interior bare
  CR classifies `unparseable` and reaches the sibling row, so the trailing CR of
  a `\r\n` write is the whole reachable class, and the 120-character cap masks
  it above the cap); the measured renderings for six inputs, the sibling's
  rendering of the same inputs, and the two candidate transforms' divergence on
  trailing whitespace; the second copy of the string on
  `InvokeInfraError.message` and SNK-i's omission of that field; the unit-level
  `  hint: ` and batch-block forgeries with their unreachability through the
  pump; the absence of any assertion on this row's message; and the
  single-approach fix with its constraints, including the registry-prefix
  collision a copied 0086 witness would hit.
- Spec: `docs/spec_topics/diagnostics/placeholder-rendering-b.md:89` (§8's
  placeholder list), `:91` (§8's rule and its byte-identical surround), `:36–39`
  (category 6's four numbered truncation steps §8 defers to), `:93` (the
  subagent host-derived tails, both `<line summary>` rows, and the GOV-15
  observable-(c) class), `:74` (§7's parse-time literal-value sub-rule — the
  other precedent's rule, not this one's);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:34` (the `message`
  single-line summary), `:63` (the serialised content format), `:72` (DIAG-2),
  `:74` (DIAG-4);
  `docs/spec_topics/diagnostics/code-registry-runtime.md:28` (the
  `theta/runtime/subagent-envelope-parse-failed` row), `:27` (the sibling row
  and its JSON-whitespace / trailing-CR Trigger sentence);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15,
  observable (c) and its category-8 normalisation clause);
  `docs/spec_topics/pi-integration-contract/subagent.md` (PIC-59, the
  return-value envelope and its stray-line tolerance). User-facing:
  `docs/reference/diagnostics.md:19` (the `message` line), `:276–277` (the two
  *Message* mirror rows).
- Implementation evidence at `53cd0d86`:
  `src/runtime/subagent-envelope.ts:19` (the module header's advisory-sibling
  bullet), `:53` (the `renderHostDerivedTail` import), `:96` (the code
  constant), `:374–378` (`summarizeLine`; `:376` the cap, `:377` the
  truncation), `:386–408` (`mapEnvelopeParseFailure`; `:392` the signature,
  `:393` the un-normalised rendering, `:394` the interpolation, `:398` the
  `error.message` copy, `:404` the code, `:405` the `diagnostic.message` copy),
  `:410–437` (`mapWireParseFailure`; `:422–433` the rule comment, `:434` the
  normalised rendering);
  `src/diagnostics/placeholder.ts:285–291` (`firstLineTruncate`; `:286` the
  `\r\n` / bare-`\r` normalisation, `:287–289` the first-`\n` cut, `:290` the
  `<no message>` arm), `:350–353` (`renderHostDerivedTail`);
  `src/runtime/subagent-json-driver.ts:48–53` (`renderExitDetail`), `:127`
  (the classification), `:131–147` (the `unparseable` arm; `:140` the blank-line
  filter, `:143–145` the bounded wire emission), `:157–162` (the `parse-failed`
  arm; `:158` the builder call, `:159` the emit, `:160` the fail-closed settle);
  `src/extension/production-subagent-host.ts:318–338` (`adaptChild`'s pump;
  `:319–320` the LF-only framing comment, `:329` the `indexOf("\n")` split,
  `:330–334` the slice and the empty-line skip);
  `src/extension/production-theta-producer.ts:2250` (the `driveSubagentChild`
  call), `src/extension/production-composition.ts:732`
  (`emitDiagnostic: sink.emit`);
  `src/runtime/err-note-render.ts:158–162` (SNK-i; `:161` interpolates
  `callee_path` and `cause` only);
  `src/diagnostics/diagnostic.ts:62–90` (`renderDiagnosticLine`; `:80` the hint
  continuation, `:86` the related-site line), `:97` (`renderDiagnosticBatch`'s
  `"\n\n"` join), `:152` (`normaliseLiteralValueLineBreaks`).
- Test and corpus evidence at `53cd0d86`:
  `tests/subagent-envelope.test.ts:321–334` (the one unit cell; `:326` the
  builder call, `:330` the code assertion, no message assertion);
  `tests/subagent-json-wire.test.ts:132–144` (the driver-seam cell; `:144` the
  code assertion);
  `tests/subagent-wire-parse-failed-emitter.test.ts:132–147`
  (`messagePrefixOf`, the registry-derived oracle), `:347–383` (0086's two CR
  cells; `:365` the `not.toContain("\r")` assertion);
  `tests/registry-closed-set-corpus-gate.test.ts:138–145` (the `CARVE_OUT`
  entry citing `src/runtime/subagent-envelope.ts:404`);
  `tests/fixtures/h7a/permitted-codes.json` (11 codes, this one absent);
  `rg -n 'failed the pinned schema'` (three hits, all in
  `src/runtime/subagent-envelope.ts`: `:96`, `:387`, `:394` — no test text);
  `rg -n 'mapEnvelopeParseFailure' docs/bugs/` (only the fixed 0086);
  `rg -n 'renderHostDerivedTail|normaliseLiteralValueLineBreaks' src/` (the two
  transforms and their call sites — `renderHostDerivedTail` at
  `src/runtime/subagent-envelope.ts:434` and
  `src/diagnostics/placeholder.ts:379`, `normaliseLiteralValueLineBreaks` at the
  seven §7 sites, none in `src/runtime/`).
- Reproduction: two scratch vitest probes at `53cd0d86` over
  `mapEnvelopeParseFailure` / `mapWireParseFailure` /
  `classifyChildStdoutLine` / `parseEnvelopeLine`, with the real
  `renderDiagnosticLine` / `renderDiagnosticBatch`, and one over
  `renderHostDerivedTail` against `normaliseLiteralValueLineBreaks`. Run on the
  outputs quoted above, then deleted per scratch policy. No file in the tree was
  written by the probes; `src/`, `tests/`, `docs/bugs/README.md` and every other
  bug doc are unmodified by this filing.
