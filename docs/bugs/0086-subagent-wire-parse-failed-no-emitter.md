# Bug 0086 — `theta/runtime/subagent-wire-parse-failed` is the one registered code with zero occurrences anywhere in `src/`: `lineCarriesReservedKey` swallows the `JSON.parse` throw and returns `false`, so the parent's stdout scan cannot distinguish a valid `--mode json` event from a malformed line and the advisory triage diagnostic PIC-65 registers is never emitted

- **Status:** fixed (0.230.0).
- **Kind:** defect — a registered `E`-severity runtime row has **no builder, no
  constant and no emission site** anywhere in the tree. Unlike its five filed
  siblings (0050, 0066, 0072, 0073, 0079), where a conformant implementation
  exists and is merely unreachable, here nothing was ever written: the code
  string does not appear in `src/` at all.
- **Related:**
  - 0073 (open) — the nearest sibling: a registered runtime code whose
    conformant builder (`cancelledBySessionShutdownDiagnostic`,
    `session-shutdown.ts:242`) exists with zero `src/` callers. Same
    consequence class (an operator-visible triage signal the spec registers is
    never delivered), different mechanism — there the builder exists, here it
    does not. Not a duplicate: different code, different subsystem, different
    fix shape.
  - 0079 (open) — a registered parse code whose renderer arm exists but whose
    production caller cannot select it. Same class, third mechanism variant.
  - 0002 (fixed, 0.12.0) — established the subagent child-process stdout
    contract this report measures against; its fix corrected the stdin-EOF pin
    that PIC-65 records at `subagent.md:140`.
  - The four RFC-0006 marshalling codes
    (`subagent-envelope-parse-failed`, `-schema-skew`,
    `-exit-without-envelope`, `-params-validation-failed`) are **wired** and
    are the control: `subagent-json-driver.ts:118–130` routes
    `parseEnvelopeLine`'s verdicts to them, including a
    `case "parse-failed"` arm that emits a diagnostic. The gap is confined to
    the *non-envelope* line class.
- **Affected** (every citation verified at HEAD `07ef0271`, 0.53.0):
  - **The absent emitter.** `rg -n "subagent-wire-parse-failed" src/` returns
    **zero lines**. Across all 193 codes in
    `docs/spec_topics/diagnostics/code-registry-*.md` this is the only code
    with no `src/` occurrence of any kind — not an emission, not a constant,
    not a comment.
  - **The site where the class is decided and discarded** —
    `lineCarriesReservedKey`, `src/runtime/subagent-envelope.ts:126–142`. The
    `JSON.parse` at `:131` is wrapped in `catch (parseError: unknown) { void
    parseError; return false; }` (`:132–135`, carrying an `allow-broad-catch:
    stray-line tolerance — pi-integration-contract/subagent.md PIC-59`
    exemption). A line that is not JSON and a line that is a valid `--mode
    json` event both return `false`, so the two classes are merged at the only
    point where they are distinguishable.
  - **The consumer that acts on that verdict** —
    `src/runtime/subagent-json-driver.ts:108–117`: the `onStdoutLine` handler
    whose body is
    ```ts
    if (!lineCarriesReservedKey(line)) {
      return;
    }
    ```
    (`:115–117`), preceded by the comment at `:112–114` naming stray-line
    tolerance. This bare `return` is the whole disposition of every
    non-envelope line.
  - **The wired sibling arms in the same switch** —
    `subagent-json-driver.ts:118` (`parseEnvelopeLine`), `:119–130` (`ok` /
    `err` / `parse-failed` arms), where `case "parse-failed"` calls
    `mapEnvelopeParseFailure` and `emitDiagnostic(mapping.diagnostic)`
    (`:126–128`). The envelope class has an emitter; the non-envelope class
    has none.
  - **The verdict type that has no non-envelope member** — `EnvelopeParse`,
    `src/runtime/subagent-envelope.ts:114–119`: four arms (`ok`, `err`,
    `schema-skew`, `parse-failed`), all reachable only for a line that already
    carried the reserved key. There is no type in the tree representing "a
    non-envelope line that did not parse".
  - **The other stdout scanner with the same shape** —
    `subagent-envelope.ts:198–202`, whose `if (lineCarriesReservedKey(line))`
    guard has no `else` arm.
  - **The registry row** —
    `docs/spec_topics/diagnostics/code-registry-runtime.md:27`. Severity `E`,
    phase `runtime`, *Message* `subagent event-stream line parse failed: <line
    summary>`.
  - **The mirrors** — `docs/reference/diagnostics.md:248` (the
    Code/Sev/Phase/Message transcription), `:309` (the child-process
    failure-class list), `:338` (the re-scoping note that pins this code to the
    **non-envelope** class).
  - **The routing rules that name the code** —
    `docs/spec_topics/diagnostics/code-registry-runtime.md:7` (the
    ten-child-process-failure-codes sentence) and
    `docs/spec_topics/pi-integration-contract/capability-probe.md:87` (the
    dedicated-code carve-out list against the `internal-error` catch-all).
- **Observed at:** `0.53.0` (`07ef0271`), Windows. Structural — bounded by
  grep and by the control-flow of two functions, not by fixture: the code
  string is absent from `src/`, so no input can produce it. Offline; no model,
  no live provider, no child spawned.

## Summary

`theta/runtime/subagent-wire-parse-failed` is registered at severity `E` with
the Message `subagent event-stream line parse failed: <line summary>`, is
listed among the ten RFC-0006 child-process failure codes
(`code-registry-runtime.md:7`), and is named in the capability-probe carve-out
that keeps it off the `theta/runtime/internal-error` catch-all
(`capability-probe.md:87`). It has **no emitter, no constant and no mention of
any kind** in `src/` — the only such code among the 193 registered.

The mechanism is one swallowed exception. `lineCarriesReservedKey`
(`subagent-envelope.ts:126`) is the parent's sole classifier for a child stdout
line. It `JSON.parse`s the line inside a `try`, and on a throw returns `false`
(`:132–135`) — the same answer it returns for a perfectly valid `--mode json`
event that simply is not the envelope. The caller
(`subagent-json-driver.ts:115–117`) then `return`s. The two classes the
registry distinguishes — "a valid non-envelope event, correctly ignored" and "a
line on the event stream that was expected to be JSON and did not parse" — are
therefore indistinguishable at the only site that could tell them apart, and
the second never produces its diagnostic.

The registry itself scopes the impact: "The parent ignores stray non-envelope
lines by construction (per PIC-59), so this diagnostic is **advisory triage**
rather than a result-altering failure." The result is not corrupted. What is
lost is the operator's only in-band signal that a subagent child is emitting
malformed bytes on its event stream — precisely the signal that separates "the
child is healthy and my theta returned `Err`" from "the child's wire protocol
is broken".

## Reproduction

Structural, at HEAD `07ef0271`. No probe can witness the code because no code
path constructs it; the observation is a closed grep over the tree plus the
control flow of two functions.

```console
$ rg -n "subagent-wire-parse-failed" src/
$ echo "exit=$?"
exit=1
```

Zero hits. For comparison, the four wired marshalling siblings:

```console
$ for c in subagent-envelope-parse-failed subagent-envelope-schema-skew \
           subagent-exit-without-envelope subagent-params-validation-failed; do
    printf '%-40s %s\n' "$c" "$(rg -c "$c" -g '*.ts' src/ | wc -l) file(s)"
  done
subagent-envelope-parse-failed           1 file(s)
subagent-envelope-schema-skew            1 file(s)
subagent-exit-without-envelope           1 file(s)
subagent-params-validation-failed        1 file(s)
```

The whole-registry sweep that isolates it (193 codes extracted from the four
registry pages, each grepped against `src/`):

```console
$ codes=$(grep -ohE 'theta/(parse|load|runtime|host)/[a-z0-9-]+' \
    docs/spec_topics/diagnostics/code-registry-*.md | sort -u)
$ echo "$codes" | wc -l
193
$ for c in $codes; do
    [ "$(grep -rF "$c" src/ | wc -l)" -eq 0 ] && echo "ZERO $c"
  done
ZERO theta/runtime/subagent-wire-parse-failed
```

The control flow that merges the two line classes,
`src/runtime/subagent-envelope.ts:126–142` verbatim:

```ts
export function lineCarriesReservedKey(line: string): boolean {
  // A line that is not JSON, or is JSON but does not carry the reserved key, is
  // ignored by the parent (stray-line tolerance, PIC-59).
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (parseError: unknown) { // allow-broad-catch: stray-line tolerance — pi-integration-contract/subagent.md PIC-59
    void parseError;
    return false;
  }
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    Object.prototype.hasOwnProperty.call(parsed, THETA_RESULT_KEY)
  );
}
```

and its sole consumer, `src/runtime/subagent-json-driver.ts:108–130`:

```ts
detachStdout = child.onStdoutLine((line) => {
  if (settled) {
    return;
  }
  // Stray-line tolerance: ignore every non-`theta_result` line (valid
  // `--mode json` events, garbage, partial JSON) until the reserved-key
  // envelope line — which cannot be split mid-write — is seen (PIC-59).
  if (!lineCarriesReservedKey(line)) {
    return;
  }
  const parse = parseEnvelopeLine(line);
  switch (parse.kind) {
    case "ok":    settle({ ok: true,  value: parse.value }); return;
    case "err":   settle({ ok: false, error: parse.error }); return;
    case "parse-failed": {
      const mapping = mapEnvelopeParseFailure(parse.line, calleePath);
      emitDiagnostic(mapping.diagnostic);
      settle({ ok: false, error: mapping.error });
      return;
    }
```

The comment at `:112–114` states the merge explicitly — "valid `--mode json`
events, garbage, partial JSON" are one class to this code. The registry says
they are two.

The `case "parse-failed"` arm (`:125–129`) is the control: for a line that
*did* carry the reserved key, a parse failure produces a diagnostic through
`emitDiagnostic`. The delivery channel therefore exists and is reached from
this exact handler; only the non-envelope class has no arm to reach it from.

The second scanner, `subagent-envelope.ts:198–202`, has the same shape with no
`else`:

```ts
    if (lineCarriesReservedKey(line)) {
      return { found: true, parse: parseEnvelopeLine(line) };
    }
```

## Expected behaviour

**The registry row is the promise.**
`docs/spec_topics/diagnostics/code-registry-runtime.md:27`, *Trigger* column
verbatim:

> A line on the subagent child's `--mode json` stdout event stream was expected
> to be a JSON event but did not parse. This code covers malformed
> **non-envelope** event-stream lines; a malformed reserved-key
> `{"theta_result": …}` **envelope** line is
> `theta/runtime/subagent-envelope-parse-failed` instead. The parent ignores
> stray non-envelope lines by construction (per
> [PIC-59](../pi-integration-contract/subagent.md#pic-59)), so this diagnostic
> is advisory triage rather than a result-altering failure. `message` carries a
> truncated rendering of the offending line.

*Message*: `subagent event-stream line parse failed: <line summary>`.

Three things follow that the implementation does not do. (a) The two line
classes are explicitly separated by the row itself, which names the sibling
code for the other class. (b) Ignoring the line for *result* purposes and
emitting the diagnostic are stated as compatible — "the parent ignores stray
non-envelope lines by construction … so this diagnostic is advisory triage",
i.e. the ignore is the reason the severity does not alter the result, not a
reason to stay silent. (c) The Message requires a truncated rendering of the
offending line, so the line must survive to the emission site;
`lineCarriesReservedKey` discards it.

**The routing rules name the code twice more.**
`code-registry-runtime.md:7` lists it among the ten codes that "cover the
subagent child-process failure classes of the child-process theta design (see
PIC-65)". `capability-probe.md:87` lists it among the dedicated codes that are
carved out of the `theta/runtime/internal-error` catch-all — a carve-out that
is only meaningful if the code can be emitted.

**PIC-59 bounds the tolerance to results, not to diagnostics.**
`docs/spec_topics/pi-integration-contract/subagent.md:80` states the parent
"matches the reserved key and ignores every other line", and `:94` that "Stray
lines from other extensions can still appear in the stream but cannot corrupt
the envelope, and the parent ignores every non-`theta_result` line". Both
sentences govern envelope selection and result fidelity. Neither says a line
that fails to parse as JSON is undiagnosable — and the registry row, written
against the same PIC-59, says the opposite.

**DIAG-1 presupposes the site exists.**
`docs/spec_topics/diagnostics/diagnostic-shape.md:71` entitles tests to assert
the specific code at every documented diagnostic site. No test in the tree can
assert this one — there is no emitter to call, not even directly, so this code
lacks even the direct-call unit test that pins 0050's and 0079's rows green.

## Actual behaviour / root cause

1. **The classifier throws away the distinguishing information.**
   `lineCarriesReservedKey` (`subagent-envelope.ts:126–142`) is the only place
   in the tree where a child stdout line is tested for JSON validity. Its
   return type is `boolean`, so it is structurally incapable of reporting the
   three-way outcome the registry needs (envelope / valid non-envelope /
   malformed). The `catch` at `:132` discards the `SyntaxError` (`void
   parseError`) and the line itself.

2. **The caller has no arm for the third case.**
   `subagent-json-driver.ts:115–117` maps `false` to a bare `return`. The
   comment at `:112–114` enumerates the merged classes — "valid `--mode json`
   events, garbage, partial JSON" — showing the merge was deliberate at the
   time and reading PIC-59's stray-line tolerance as covering diagnostics too.

3. **No type carries the class.** `EnvelopeParse`
   (`subagent-envelope.ts:114–119`) has four arms, all downstream of the
   reserved-key match. Nothing in the tree represents "non-envelope line that
   did not parse", so there is no value for a diagnostic builder to consume.

4. **The delivery channel is present and used by the neighbours.**
   `emitDiagnostic` is in scope in the same handler and is called by the
   `parse-failed` arm (`:126–128`). The four marshalling codes and
   `subagent-spawn-failed`, `subagent-child-crashed`,
   `subagent-teardown-timeout`, `subagent-callable-hash-mismatch`,
   `subagent-model-preflight-mismatch` all have emitters. This code is the
   tenth of the ten PIC-65 codes and the only one with none.

5. **The second scanner repeats the shape.**
   `subagent-envelope.ts:198–202` guards on `lineCarriesReservedKey` with no
   `else` arm, so a fix confined to the driver would leave this path silent.

6. **No gate catches it.** `reconcileClosedSet`
   (`tools/code-registry/index.js:99`) reports
   `registry-code-no-asserting-test`; its predicate is whether a test asserts
   the code, and it runs over seeded fixtures under
   `test-fixtures/closing-gate/` (`tests/closing-gate.test.ts:15–26`) rather
   than over this corpus. Nothing in the tree relates a registered code to the
   existence of an emitter.

## Why it matters

- **The one triage signal for a broken child wire protocol is absent.** A child
  that writes non-JSON to fd 1 — an extension `console.log`ing past Pi's
  `takeOverStdout()` reassignment, a crash banner, a partially-written line
  from a non-Node co-process — is indistinguishable to the parent from a
  healthy child. The invocation then ends on
  `subagent-exit-without-envelope` or a timeout, and the operator has no
  evidence pointing at the stream.
- **The code was registered precisely for the diagnosis this code path makes
  impossible.** `capability-probe.md:87` carves it out of the
  `internal-error` catch-all so an operator can tell wire-parse failure from a
  generic runtime defect. With no emitter, the carve-out routes nothing and the
  failure surfaces, if at all, under a code that says nothing about the stream.
- **PIC-59's stray-line tolerance is being read one clause too wide.** The
  tolerance is a *result-fidelity* rule (ignore non-envelope lines when
  selecting the envelope). The implementation applies it as an
  *observability* rule (say nothing about any non-envelope line), which the
  registry row written against the same PIC-59 contradicts in its own text.
- **It is the weakest row in the registry by evidence.** Every other of the 193
  codes has at least a string constant in `src/`; several unreachable ones
  (0050, 0079) at least have a conformant builder and a direct-call unit test.
  This one has nothing, so no reader of the registry, and no test, can
  distinguish it from a wired row.
- **The child-process path is live-exercised.** `tests/live/**` and
  `tests/subagent-child-real-spawn.test.ts` drive real children, so the stream
  this code describes is real traffic in the default and live gates alike —
  and neither gate can witness the code.

## Non-goals

- **Changing result semantics.** PIC-59's stray-line tolerance for *envelope
  selection* is correct and must not move: a malformed non-envelope line must
  continue not to settle the invocation. The registry row already fixes the
  severity's meaning as "advisory triage rather than a result-altering
  failure".
- **The four wired marshalling codes** and the envelope `parse-failed` arm —
  correct and untouched.
- **Deciding what counts as "expected to be a JSON event".** Pi's `--mode json`
  stream is line-oriented JSON, but other extensions may write to the stream
  (`subagent.md:94` says so explicitly). Whether every non-JSON line is
  malformed, or only those matching some heuristic, is the substantive design
  question a fix must answer; this report does not answer it. See §Fix.
- **`stderr`.** The child's stderr is captured separately
  (`subagent-json-driver.ts:105`, `lastStderr`) and is not the stream this row
  covers.
- **0073's per-invocation clean-cancel note.** Different code, different
  subsystem; cited only as the nearest mechanism sibling.

## Fix

Not yet decided. The single constraint that shapes every option: the
information the Message needs (the offending line) is destroyed at
`subagent-envelope.ts:132–135` and the classification is destroyed by the
`boolean` return type, so no fix is possible without widening that function's
verdict.

**Disposition 1 — widen the classifier's verdict and emit (recommended).**

- *Shape.* Replace `lineCarriesReservedKey`'s `boolean` with a three-way
  verdict (`"envelope" | "other-json" | "unparseable"`), carrying the line on
  the third arm. Both call sites (`subagent-json-driver.ts:115`,
  `subagent-envelope.ts:198`) must be updated together — a fix confined to the
  driver leaves the second scanner silent (§Actual behaviour item 5).
- *Emission.* `emitDiagnostic` is already in scope in the driver handler
  (`:126–128` uses it), so the driver arm is one call. The second scanner
  returns rather than emits and needs its own route to the same sink.
- *Message.* `subagent event-stream line parse failed: <line summary>` requires
  a *truncated* rendering; the truncation rule must be pinned against the
  `<line summary>` placeholder category in
  `docs/spec_topics/diagnostics/placeholder-rendering-*.md` rather than
  invented.
- *Volume is the real risk, and the reason this is not a one-line fix.* The
  stream is shared (`subagent.md:94`), the diagnostic is `E`, and a chatty
  co-extension could produce one `E` per line for the life of the child. Any
  wiring must bound emission — once per invocation, or a counted summary — and
  that bound belongs in the registry row's Trigger prose, which is a DIAG-2
  change moving `code-registry-runtime.md:27`,
  `docs/reference/diagnostics.md:248` and `:338` in the same commit.
- *Result semantics unchanged.* The line is still ignored for envelope
  selection; the invocation still settles only on the envelope, EOF or exit.
- *Witness.* Offline through the existing fake child harness
  (`tests/helpers/fake-json-child.ts`): feed a malformed non-JSON line, a valid
  non-envelope JSON event, and a malformed reserved-key line, and assert
  exactly one `subagent-wire-parse-failed` for the first, **none** for the
  second (the class separation is the whole point), and
  `subagent-envelope-parse-failed` for the third. Then assert the emission
  bound with a many-line fixture.

**Disposition 2 — retire the row.** Remove
`theta/runtime/subagent-wire-parse-failed` from the registry and the corpus.
This is a DIAG-2 removal touching `code-registry-runtime.md:27` and the
ten-code sentence at `:7`, `docs/reference/diagnostics.md:248`, `:309` and
`:338`, and the carve-out list at `capability-probe.md:87`. GOV-15's carve-out
covers a removal over the inputs that previously emitted the code — the empty
set, so no observable changes. The consequence to state plainly: theta 1.x then
offers no diagnosis of a malformed child event stream, and a broken child wire
protocol is observable only as a missing envelope.

**Recommendation: disposition 1, with the emission bound settled first.** The
row is cited in three normative places, the delivery channel is present and
used by the sibling arm in the same handler, and the class separation the row
describes is a genuine operator need (§Why it matters). But this is the one
report in this class where retirement is not obviously the worse option: the
implementation never had the check, the spec's own severity note calls it
advisory, and an unbounded `E` on a stream the spec says other extensions may
write to could be worse than silence. The bound is the decision; the wiring
follows from it.

## Provenance

- **Origin:** systematic dead-enforcement sweep — every code in
  `docs/spec_topics/diagnostics/code-registry-*.md` (193, extracted
  mechanically) grepped against `src/`. This is the sole zero-occurrence
  result.
- **Evidence:** the §Reproduction greps, run at HEAD `07ef0271`, output quoted
  verbatim; the two verbatim source extracts. No probe was written — none can
  witness a code with no emitter, and that absence is itself the finding.
- **Implementation:** `src/runtime/subagent-envelope.ts` (`:11–12` module
  comment, `:114–119` `EnvelopeParse`, `:121–125` doc comment, `:126–142`
  `lineCarriesReservedKey`, `:131` `JSON.parse`, `:132–135` the swallowing
  catch, `:144–148` `parseEnvelopeLine` doc, `:149` `parseEnvelopeLine`,
  `:198–202` the second scanner),
  `src/runtime/subagent-json-driver.ts` (`:30`, `:32`, `:36` imports,
  `:105` stderr capture, `:108–117` the stdout handler and the bare `return`,
  `:118–130` the wired envelope arms, `:126–128` `emitDiagnostic`),
  `src/extension/production-subagent-host.ts` (`:130–140` the fd-1 envelope
  writer, `:179–204` LF-only line splitting), all at `07ef0271`.
- **Spec measured against:**
  [code-registry-runtime.md:27](../spec_topics/diagnostics/code-registry-runtime.md)
  (the row), `:7` (the ten-child-process-code sentence);
  [subagent.md](../spec_topics/pi-integration-contract/subagent.md) (`:9`
  PIC-65 intro, `:80` PIC-59, `:94` shared-stdout safety and stray-line
  tolerance, `:140` the consumed stdout wire surface);
  [capability-probe.md:87](../spec_topics/pi-integration-contract/capability-probe.md)
  (the dedicated-code carve-out);
  [diagnostic-shape.md:71](../spec_topics/diagnostics/diagnostic-shape.md)
  (DIAG-1), `:72` (DIAG-2);
  [source-language-stability.md:25](../spec_topics/governance/source-language-stability.md).
- **Mirrors:** `docs/reference/diagnostics.md:248`, `:309`, `:338`.
- **Tooling read, none changed:** `tools/code-registry/index.js:99`;
  `tests/closing-gate.test.ts:15–26`.

## Fix (0.230.0)

Disposition 1 (wire the emitter), with the emission bound settled as part of the
fix. Disposition 2 (retire the row) was rejected: the row is cited in three
normative places and the class separation it describes is a real operator need.

- **What shipped:**
  - `src/runtime/subagent-envelope.ts` — the classifier's verdict widens from
    `boolean` to a three-way `classifyChildStdoutLine` (`envelope` /
    `other-json` / `unparseable`, the third arm carrying the offending line), so
    the two line classes the registry distinguishes are no longer merged at the
    only site that can tell them apart. `lineCarriesReservedKey` is retained as a
    thin `boolean` wrapper over it, so every existing call site and its
    assertions are unaffected.
  - `src/runtime/subagent-envelope.ts` — `SUBAGENT_WIRE_PARSE_FAILED_CODE` and
    the advisory-only builder `mapWireParseFailure` are new; the builder returns
    a `Diagnostic` alone, never an `Err`, because the row is advisory triage and
    the result does not change. `<line summary>` renders through the shipped
    `renderHostDerivedTail` (category 6 first-line truncation) before
    `summarizeLine`'s length cap; `summarizeLine` and `mapEnvelopeParseFailure`
    are byte-untouched, so the sibling row's observable does not move (GOV-15).
  - `src/runtime/subagent-envelope.ts` — `EnvelopeScan` widens so both arms
    carry `unparseableLines` in stream order, discharging §Actual behaviour
    item 5: the second scanner no longer merges the class either. It has no
    `src/` caller, so it emits nothing of its own.
  - `src/runtime/subagent-json-driver.ts` — the stdout handler classifies each
    line: `envelope` falls through to the unchanged parse/settle arms,
    `other-json` returns, and a non-blank `unparseable` line emits the advisory
    diagnostic. Result semantics are unchanged: the line is still ignored for
    envelope selection and the invocation still settles only on the envelope,
    EOF or exit.
  - **The emission bound** (the decision §Fix left open) — at most one
    diagnostic per subagent invocation, naming the first offending line, held by
    a per-drive closure local rather than module state. The stream is shared with
    other extensions and the severity is `E`, so an unbounded emitter could
    produce one `E` per line for the life of the child.
  - **Blank framing is not diagnosed** — a line consisting only of JSON
    whitespace (space, tab, CR, LF) is stdout framing, not a malformed event.
    The predicate is deliberately narrower than `String.prototype.trim`, whose
    ECMAScript whitespace set would also swallow U+2028, U+2029, U+00A0 and
    U+FEFF — characters the corpus pins as ordinary and never to be stripped.
  - `docs/spec_topics/diagnostics/code-registry-runtime.md` and
    `docs/reference/diagnostics.md` — the DIAG-2 same-commit spec edit carrying
    both bounds into the row's *Trigger* prose and its mirror note. *Code*,
    *Sev*, *Phase* and *Message* cells, the mirror table row and the
    child-process failure-class list are byte-unchanged; the closed
    placeholder-rendering tables are untouched (`<line summary>` was already
    correctly bound there).
  - `tests/subagent-json-wire.test.ts` — the cell that encoded the buggy
    contract (a zero-diagnostic assertion over a stream containing a raw garbage
    line) now asserts the `Ok` result is unaltered and that exactly the one
    advisory diagnostic rides alongside, keyed on the exported code constant.
    The garbage line is kept: it is the stray-line-tolerance evidence.
  - `tests/registry-closed-set-corpus-gate.test.ts` — the carve-out reason for
    this code moves from "no emitter, so no test can witness" to the truthful
    sibling pattern (emitted and genuinely witnessed; the shipped extractor
    cannot see the assertion because the witness derives the code from the
    registry rather than spelling a literal span). The entry is kept rather than
    deleted: arm (3) still reports the code, and the table is asserted set-equal
    to the live arm in both directions. Three sibling entries' `path:line`
    citations were re-derived for the line shift.
- **Gates:** witness run
  `npx vitest run tests/subagent-wire-parse-failed-emitter.test.ts tests/subagent-wire-parse-failed-classifier.test.ts`
  → `Test Files 2 passed (2) / Tests 16 passed (16)`; red before the fix with
  `AssertionError: expected [] to have a length of 1 but got +0`. Full default
  suite `npm test` → `Test Files 411 passed (411) / Tests 8613 passed (8613)`.
  `npm run typecheck` → clean, no output. `npm run lint` → clean, no output.
  `rg "theta/runtime/subagent-wire-parse-failed" tests/` → zero hits, so the
  carve-out entry's stated reason stays true.
- **Review:** 2 rounds plus one comment-only polish round. Round 1 (deep) —
  three findings: `<line summary>` did not implement category 6's first-line
  truncation, so a pump-delivered trailing CR reached the operator (spec); the
  blank-line filter used `String.prototype.trim`, swallowing U+2028-only and
  U+00A0-only lines the corpus pins as ordinary (spec); the narrowed json-wire
  cell asserted severity and a message substring but not the code (test). All
  three fixed. Round 2 (fast) — clean on correctness, fidelity and spec; one
  residual, six `path:line` citations the round-1 fixer's re-derivation landed on
  the wrong symbol. Round 3 — comment-only citation repair, re-derived by grep
  against the declaration lines; polish verified by gate-diff, confirmation
  round skipped (every hunk inside a doc-comment or `//` comment, gates re-run
  green).
- **Verification:** SOLID. (1) The witnesses genuinely witness the bug: four
  targeted byte neutralisations — the emission itself, the emission bound, the
  blank-line filter, and the classifier's `unparseable` arm merged back into
  `other-json` — each red the intended cells (`expected [] to have a length of 1
  but got +0`; `to have a length of 1 but got 12`; `to have a length of +0 but
  got 1`; eleven cells red on the classifier merge) and each restored
  byte-exact, hash-verified; no `git stash`, no `git checkout --`. (2) Full
  default suite green. (3) Live: the H8a subagent-mode success drive and the H9a
  non-interactive subagent-mode acceptance cell were both run for real under the
  shared live lock and both passed — no new `theta-system-note` framing, and the
  permitted-codes, clean-stderr and no-error-exit assertions all green against an
  unmodified `permitted-codes.json`. (4) Typecheck and lint clean.
- **Residuals:**
  1. The sibling row `theta/runtime/subagent-envelope-parse-failed` has the
     identical latent `<line summary>` CR non-conformance: `mapEnvelopeParseFailure`
     renders a trailing CR that category 6's first-line truncation would cut. It
     is pre-existing and unfiled, and fixing it would move that row's
     observable, so it was left alone (GOV-15). Worth its own report.
  2. `scanStreamForEnvelope` carries `unparseableLines` but emits nothing,
     because it has no `src/` caller (`rg -n "scanStreamForEnvelope" src/` finds
     only its own definition and the module header). A future caller inherits the
     class separation rather than having to rediscover it.
  3. `theta/runtime/subagent-wire-parse-failed` is fault-injection-only, not
     reachable from ordinary `pi -p` traffic: a healthy child writes strict JSONL
     and the production pump drops empty lines. Established by real runs — the
     H8a drive reported an empty system-note array and the H9a acceptance cell
     passed the permitted-codes and stderr gates unchanged — so
     `tests/fixtures/h7a/permitted-codes.json` is correctly untouched. A live
     witness of the emission would need an extension planted into the child that
     writes non-JSON to fd 1; none exists and none is required here.
  4. Several `path:line` citations in
     `tests/subagent-envelope-nonfinite-ok-refusal.test.ts` and
     `tests/subagent-envelope-result-carriage.test.ts`, and two in
     `tests/invoke-prompt-cell-enum-return.test.ts` and
     `tests/invoke-return-enum-carrier-projection.test.ts`, were already stale
     before this change and were left alone rather than widened into. Neither
     file is on the citation gate's converted-file ratchet.
- **Discharge notes appended:** none.
- **Pinned dispositions / non-goals:** the row is WIRED, not retired.
  `lineCarriesReservedKey` stays `boolean` (a wrapper), so no existing call site
  or assertion was migrated. PIC-59's stray-line tolerance keeps governing
  *result* fidelity and is unchanged; only the observability reading of it moved.
  `summarizeLine`, `mapEnvelopeParseFailure` and the four wired marshalling codes
  are untouched. The closed placeholder-rendering tables are untouched.
