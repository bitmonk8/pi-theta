# Bug 0117 — `error-model.md` §"Runtime panics" enumerates six panic sources "each carrying its registered `theta/runtime/*` code" and calls the set closed, but a seventh `ThetaPanic` ships: `InterpolatedResultPanic`, QRY-18's runtime fallback, carrying `theta/parse/interpolated-result` — so the enumeration, the four claims keyed off its count, and the four delivery-channel sentences that describe a panic's diagnostic by that prefix (one of which the shipped note contradicts outright) are all one generation behind the shipped panic set, while the panic itself is what QRY-18 and the registry row prescribe

- **Status:** fixed (0.256.0). The operator ruled disposition (a)(2) (fifteenth
  set, ruling 1, quoted verbatim in §Fix (0.256.0) below); the enumeration is
  scoped to `theta/runtime/*` panic sources and the QRY-18 fallback is stated
  beside it as the one exception. The [GOV-30](../spec_topics/governance/req-id-prefix-table-active-b.md#gov-30)
  lock-step mirror moved with it. No code change was made — the shipped panic is
  what QRY-18 and the registry row require. No ordering dependency:
  [0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md) is
  **fixed (0.69.0)** and is this report's origin.
- **Sev/Diff estimate:** S4/D3 — a spec-prose defect where the shipped behaviour
  is what QRY-18 and the registry row prescribe, so no input observes anything
  wrong (S4); D3 because the disposition is an in-run adjudication with no
  settled §Fix, and either branch lands lock-step prose across five
  `docs/spec_topics/` pages (`error-model.md`, `code-registry-runtime.md`,
  `queryerror-variants.md`, `pi-integration-contract/runtime-event-channel.md`,
  `glossary.md`) and three `docs/reference/` mirrors.
- **Kind:** spec gap in
  `docs/spec_topics/errors-and-results/error-model.md:65–85`. `:65` introduces
  the panic list as "V1 panic sources — each carrying its registered
  `theta/runtime/*` code"; `:67–72` enumerate six; `:74` calls the list closed
  and refers back to "the six closed-list sources above"; `:76` names
  `code-registry-runtime.md` as the registry the panic's *Message template* is
  read from and summarises "The six V1 templates" in the `:78–85` table. A
  seventh `ThetaPanic` subclass ships (`src/render/query-render.ts:110`) whose
  code is `theta/parse/interpolated-result` (`:80`, `:111`). No sentence on the
  page mentions it; the page's own framing implies no `ThetaPanic` can carry a
  non-`theta/runtime/*` code. **Also a defect against
  `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:91`** on its
  literal reading — the panic's group-B `theta-system-note` carries a
  `theta/parse/*` diagnostic where that sentence says "a single `theta/runtime/*`
  diagnostic" — which is the sentence that makes §Fix (a)(1) a correction rather
  than a widening. Which of the two dispositions in §Fix (a) governs is this
  report's deliverable.
- **Related:**
  - [0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md) —
    **fixed (0.69.0)**, the origin. Its §Fix (b) added the seventh panic:
    "`InterpolatedResultPanic`, a `ThetaPanic` subclass carrying
    `INTERPOLATED_RESULT_CODE` … Subclassing `ThetaPanic` is what puts it on the
    same closed routing as `MissingObjectKeyPanic` / `NullMemberAccessPanic`,
    which is what keeps QRY-21 true." Its fix record states "**No spec or
    registry edit was needed**" for the registry, which is accurate — the
    `theta/parse/interpolated-result` row already licensed both dispositions —
    and its orchestrator recorded the residual this report files (quoted in
    §Provenance). The commit `a410f727` touches no file under `docs/spec_topics/`.
  - [0027](./0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md) —
    **fixed (0.39.0)**, the precedent for extending the panic-adjacent surface
    without extending the closed list. Its fix added
    `theta/runtime/non-object-receiver` as a "registered non-panic runtime
    rejection", and `error-model.md:74` was amended to absorb it in prose. That
    route is unavailable here: `NonObjectReceiverError` extends `Error`
    (`src/runtime/runtime-panics.ts:145`), so it is not a panic and does not
    enter the closed list; `InterpolatedResultPanic` extends `ThetaPanic`
    (`src/render/query-render.ts:110`), and that subclassing is load-bearing for
    QRY-21.
  - [0036](./0036-missing-object-key-bare-key-rendering.md) — **fixed (0.41.0)**,
    the precedent that `error-model.md:76`'s panic-message paragraph is normative
    and is read by witnesses. It changed one panic's rendered `<key>` placeholder
    without touching the closed list, and its witness cites `error-model.md:71`
    as the list line (`tests/missing-object-key-rendering.test.ts:83`, `:300`).
  - [0109](./0109-tools-diagnostic-enumerations-one-generation-behind.md) —
    **open**, the same shape one namespace over: a shipped enumeration of a
    diagnostic family that is one generation behind the closed registry, fixed by
    editing the enumeration rather than the behaviour. Disjoint subject
    (`tools:`-surface `theta/load/*` codes); cited for the disposition it takes,
    not for any shared surface.
- **Affected** (every citation verified at HEAD `a410f727`, 0.69.0):
  - `docs/spec_topics/errors-and-results/error-model.md:63` — the
    `<a id="runtime-panics"></a>` anchor every sibling page and five test files
    cite into.
  - `error-model.md:65` — **the defect site.** "V1 panic sources — each carrying
    its registered `theta/runtime/*` code from [Diagnostics]".
    The clause is the prefix claim §Fix (b) asks about.
  - `error-model.md:67–72` — the six bullets: `theta/runtime/match-error`,
    `theta/runtime/index-out-of-bounds`, `theta/runtime/null-member-access`,
    `theta/runtime/null-index-access`, `theta/runtime/missing-object-key`,
    `theta/runtime/invoke-depth-exceeded`. Six bullets, six `theta/runtime/*`
    codes, no seventh.
  - `error-model.md:74` — "This list is closed for *spec-defined* panic
    sources", and, inside the runtime-defect-surface sentence, "that is not one
    of the six closed-list sources above". The count is load-bearing twice.
  - `error-model.md:76` — "Every panic carries a single human-readable message
    string formatted at the panic site according to the *Message template*
    registered for its `theta/runtime/*` code in the [Diagnostics code
    registry](../diagnostics/code-registry-runtime.md#…)" and "The six V1
    templates and their placeholders are summarised below". Both clauses are
    false for the seventh panic as a matter of location: its template is
    registered in `code-registry-parse.md:72`, not in
    `code-registry-runtime.md`.
  - `error-model.md:78–85` — the message-template table: six rows, all
    `theta/runtime/*`.
  - `error-model.md:10` — the *Failure* bullet, "panicked (the closed list under
    **Runtime panics** below)"; `:33` — the *Panic* row of the per-cause caller
    surfaces table, which routes every panic to
    `InvokeInfraError { cause: "panic" }`, the `"theta /<name> aborted: <message>"`
    note, and a `theta-system-note` carrying `details: { diagnostics: [Diagnostic] }`;
    `:55` — ERR-13, which names "a panic in a slash-command theta"; `:89–91` —
    the routing preamble and the slash-command bullet. All four are
    prefix-agnostic and hold unchanged for the seventh panic — the shipped
    routing satisfies them (see §Actual behaviour).
  - `error-model.md:92` — the `invoke`-parent bullet, whose closing clause is
    prefix-bearing: "though matching on the `theta/runtime/*` code (when surfaced
    through the diagnostics channel) is the more stable discriminator".
    Author-facing advice the seventh panic falsifies for its own input class.
  - **The delivery channel's prefix claims** — a second family, outside
    `error-model.md`:
    - `docs/spec_topics/glossary.md:7` — the **always-log set**: "The closed set
      of runtime failures — `QueryError` `kind` values, binder failure causes,
      and `theta/runtime/*` panic codes — whose runtime occurrence emits exactly
      one `theta-system-note` event regardless of whether the author matched the
      `Err`, propagated it via `?`, or discarded it via `let _ =`." The set is
      closed and one of its three constituents is named by code prefix.
    - `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:91` —
      "A panic emits exactly one `theta-system-note` per top-level panic with
      `details: { diagnostics: [Diagnostic] }` carrying a single
      `theta/runtime/*` diagnostic (message per the registered template in
      [Diagnostics])." The sharpest contradiction in the
      corpus: the shipped note for the seventh panic carries a `theta/parse/*`
      diagnostic in exactly that field.
    - `runtime-event-channel.md:32` — the group-B row of the `details`-shape
      table, "runtime panic (single-element batch, `theta/runtime/*` code)";
      `:57` — the always-log inventory's panic entry, "Runtime panics — every
      row of [Diagnostics — `theta/runtime/*`], routed through the
      `details: { diagnostics: [...] }` shape", which enumerates the
      panic set by registry page.
    - `src/extension/production-theta-producer.ts:1314–1324` — `emitPanicNote`,
      which sends `{ customType: SYSTEM_NOTE_CHANNEL, content: framing,
      display: true, details: { diagnostics: [diagnostic] } }` with
      `triggerTurn: false`, documented at `:1308–1310` as "the group-B
      `details: { diagnostics: [Diagnostic] }` shape". The `diagnostic` is the
      one built at `theta-composition-producer.ts:460–467` with
      `code: thrown.code`, so the seventh panic's group-B note carries
      `theta/parse/interpolated-result`.
    - No `docs/reference/` page mirrors the runtime-event channel or the
      always-log set. `docs/reference/` holds ten pages (`README`,
      `coverage-matrix`, `diagnostics`, `discovery-cli`, `errors-and-results`,
      `frontmatter`, `grammar`, `hard-ceilings`, `schema-subset`,
      `type-system`), none for the Pi integration contract or the glossary, and
      `rg -n "always-log" docs/reference/` returns nothing.
  - `src/render/query-render.ts:110–116` — **the seventh `ThetaPanic`.**
    `export class InterpolatedResultPanic extends ThetaPanic` with
    `readonly code = INTERPOLATED_RESULT_CODE` (`:111`) and
    `this.name = "InterpolatedResultPanic"` (`:114`).
    `INTERPOLATED_RESULT_CODE = "theta/parse/interpolated-result"` (`:80`);
    `INTERPOLATED_RESULT_MESSAGE` (`:95–96`) is the registry *Message* verbatim.
    Its doc comment (`:99–109`) states the design: "Carries the same registered
    `theta/parse/interpolated-result` code the static gate emits — QRY-18's
    'static where possible, runtime where not' posture. A `ThetaPanic` subclass,
    not a plain thrown `Error`, so `isThetaPanic` classifies it and QRY-21 (a
    panic during interpolation is never caught by `let _ =`) holds for it".
  - `src/render/query-render.ts:396–399`, `:431–441` —
    `stringifyInterpolatedValue`'s `case "result"` arm, which returns
    `{ ok: false, diagnostic: { severity: "error", code: INTERPOLATED_RESULT_CODE,
    message: INTERPOLATED_RESULT_MESSAGE } }`. The panic's message is that
    diagnostic's message.
  - `src/extension/production-theta-producer.ts:5657` — `stringifyInterpolation`,
    the one raise site; `:5675–5681` — the call, the QRY-18 comment, and
    `throw new InterpolatedResultPanic(rendered.diagnostic.message)`.
  - `src/parser/system-interpolation.ts:467–486` — the `system:`-field
    interpolation path, which calls the same `stringifyInterpolatedValue`
    (`:480`) and returns `{ ok: false, diagnostic: rendered.diagnostic }`
    (`:482`) rather than throwing. The panic is confined to the `@`-template
    render path; the `system:` path produces a diagnostic.
  - `src/runtime/runtime-panics.ts:62–69` — the `ThetaPanic` base and its doc
    comment, whose closing sentence is "Each subclass carries its registered
    `theta/runtime/*` code." The seventh subclass does not; the comment is stale.
    `:67–69` is the class body (`abstract readonly code: string`).
  - `src/runtime/runtime-panics.ts:496–503` — `surfaceUnexpectedThrow`, whose
    first arm returns `undefined` for `isThetaPanic(thrown)` under the comment
    "Already a panic (one of the six closed sources): not a runtime defect, not
    reclassified — the caller rethrows it so it bypasses `?`/`match`" (`:500–501`).
    `InterpolatedResultPanic` takes that arm, so it is never reclassified to
    `theta/runtime/internal-error`; the comment's count is stale.
    `:546–548` — `isThetaPanic`, `error instanceof ThetaPanic`.
  - `src/runtime/runtime-panics.ts:145–151` — `NonObjectReceiverError extends
    Error` (not `ThetaPanic`), with the doc comment at `:140` stating the closed
    list "is closed and stays closed". Bug 0027's route, and the contrast that
    makes it inapplicable here.
  - `src/extension/theta-composition-producer.ts:443`, `:457–468` — the
    top-level slash surface. The catch is annotated
    `// allow-broad-catch: top-level-slash runtime-defect surface — error-model.md#runtime-panics`;
    the `isThetaPanic(thrown)` arm builds a `Diagnostic` with `code: thrown.code`
    (`:463`) and calls
    `emitPanicNote(`theta /${theta.slashName} aborted: ${thrown.message}`, diagnostic)`
    (`:468`). For the seventh panic that note's diagnostic carries a
    `theta/parse/*` code on the panic channel `error-model.md:33` defines.
  - `src/runtime/invoke-cancellation.ts:132–139` — the `invoke`-boundary arm:
    `cause: pinnedCause ?? (isThetaPanic(thrown) ? "panic" : "internal_error")`,
    so a callee's interpolation panic reaches the parent as
    `cause: "panic"`. `src/runtime/statement-executor.ts:462–470` — the
    `subagent fn` boundary, same predicate; `:1182–1191` — `parForPanicError`,
    the ERR-20 `par for` downgrade point, same predicate.
  - `docs/spec_topics/query/query-escapes-stringification.md:16` — QRY-18;
    `:28` — the `Result<T, E>` row of the stringification table ("parse error
    `theta/parse/interpolated-result`"); `:32` — the fallback sentence this
    report treats as the licence (quoted in §Expected behaviour).
  - `query-escapes-stringification.md:58` — QRY-21: "A `${expr}` interpolation
    can trip any of the runtime panics in [Errors and Results — Runtime
    panics] (non-exhaustive `match`, OOB,
    null/missing-key access)." The reach is delegated to `error-model.md`'s list
    and the parenthetical names three families, none of them this one.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:72` — the
    `theta/parse/interpolated-result` row: Sev `E`, Phase `type`, *Trigger*
    "`${expr}` interpolation whose `expr` has Theta static type `Result<T, E>`
    (the runtime renderer raises the same code as a panic when the type is
    statically unresolvable)", *Message* `Result value cannot be interpolated;
    unwrap with ? or match first`. Unmodified by `a410f727`; the row predates the
    fix (last touched by the 0.65.0 commit `80fef716`).
  - `docs/spec_topics/diagnostics/code-registry-runtime.md:7` — "theta 1.0.0 has
    exactly six **panic sources** — the closed panic-source list enumerated in
    [Errors and Results — Runtime panics](…#runtime-panics); the table below
    carries one row per code in that list, identifiable by matching each row's
    *Code* cell against that closed list." The second clause is the constraint
    §Fix (c) has to answer: the seventh source's row is on a different registry
    page.
  - `code-registry-runtime.md:22` — the `theta/runtime/internal-error` row's
    *Trigger*, which opens "The interpreter or an adapter it called threw an
    exception outside the closed theta 1.0.0 panic-source list". The definition
    is negative over the closed list, so the list's membership decides what this
    row claims.
  - `docs/spec_topics/errors-and-results/queryerror-variants.md:186–187` — the
    `InvokeInfraError.cause` union comments: `"panic"` is "callee aborted via
    runtime panic (see Runtime panics above)", `"internal_error"` is "callee
    threw an unexpected interpreter exception outside the closed theta 1.0.0
    panic-source list". Negative over the same list, on the `invoke` surface.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2 (the registry
    is closed; a code's namespace, severity or trigger change is a spec change
    landing at the same time); `:74` — DIAG-4 (the *Message* column is normative,
    witnesses source strings from it); `:80` — the column legend, whose *Phase*
    vocabulary is "`type` (type-system checks) … or `runtime` (panic during
    execution)". One row carries one *Phase*; this code's two dispositions
    straddle two — the sub-question in §Fix (d).
  - `docs/spec_topics/expressions.md:9` — "an entry on the canonical closed list
    in [Errors and Results — Runtime panics]", the phrase that makes
    `error-model.md:67–72` the corpus's single panic inventory.
  - `docs/spec_topics/control-flow.md:78` — CTRL-5, which states the `par for`
    panic downgrade without enumerating sources ("A runtime panic inside one
    iteration does not abort the theta") and forward-links ERR-20 in
    `docs/reference/`. Prefix-agnostic; holds unchanged.
  - **Mirrors a fix must touch** (DIAG-2 / GOV-30 lock-step):
    - `docs/reference/errors-and-results.md:78–118` — the §"Runtime panics"
      mirror. `:82` repeats the prefix claim ("The closed theta 1.0.0
      panic-source list, each with its registered `theta/runtime/*` code");
      `:84–89` the six bullets; `:93` "outside the six sources"; `:101–102` the
      message-string paragraph; `:104–111` the six-row table. `rg -n
      "interpolat" docs/reference/errors-and-results.md` returns nothing.
    - `docs/reference/errors-and-results.md:120–134` — ERR-20, whose normative
      text lives on the reference page (no `docs/spec_topics/` counterpart;
      CTRL-5 links to it). `:123` scopes the downgrade to "any of the six panic
      sources above", while the implementation predicate is `isThetaPanic`
      (`statement-executor.ts:1187`), which admits seven.
    - `docs/reference/diagnostics.md:230` — "theta 1.0.0 has exactly six **panic
      sources** (the first six rows)", the mirror of
      `code-registry-runtime.md:7`; `:121` — the
      `theta/parse/interpolated-result` row mirror, which carries Code / Sev /
      Phase / Message only. The reference registry has no *Trigger* column, so
      the parse row's panic clause is **not** mirrored there; `:45` — the
      namespace gloss "`theta/runtime/*` (execution panics, runtime-defect …)".
    - `docs/reference/coverage-matrix.md:53` — the `errors-and-results.md` row,
      which lists "runtime panics + message templates" as mirrored content.
    - `docs/reference/frontmatter.md:264–265` — "`Result<T, E>` interpolands are
      rejected at parse time (`theta/parse/interpolated-result`)". Accurate for
      the `system:` field it documents (that path returns a diagnostic,
      `system-interpolation.ts:482`) and silent about the `@`-template runtime
      arm.
  - **Test evidence.** `tests/interpolated-result-gate.test.ts` — bug 0079's
    witness, 22 cells. Its group (b) drives the real render chain and asserts the
    panic's identity: `isThetaPanic(thrown)` (`:823–824`, rationale "the fallback
    lands 'on the closed runtime-panic routing already used by
    `MissingObjectKeyPanic` / `NullMemberAccessPanic`'") and
    `thrown.code === INTERPOLATED_RESULT_CODE` (`:828–829`, rationale citing the
    registry *Trigger*). `:176–190` reads the expected *Message* out of the four
    registry pages per DIAG-4. `tests/live/live-production-acceptance.test.ts:1213–1227`
    and `:1355–1375` — the live H8a cells: the panic is framed on the
    `theta-system-note` channel and `turn.userTexts` stays empty.
  - **Test coverage of this defect: none.** No cell compares
    `error-model.md:67–72` against the `ThetaPanic` subclass set.
    `tests/runtime-panics.test.ts` iterates a hand-written table
    (`PANIC_CASES`, `:113–187`) under the describe "V4b-T — the six closed panic
    sources emit their registered message templates" (`:189`); the set is
    written out, not derived from `src/`. Four other files carry the count in
    prose only — `tests/absent-member-presence-gate.test.ts:79`, `:796`,
    `tests/non-object-receiver-gate.test.ts:923`,
    `tests/missing-object-key-rendering.test.ts:83`, `:300`,
    `tests/par-for.test.ts:531` — as comments and assertion rationales, so none
    of them reds on the seventh source.

- **Observed at:** `0.69.0` (HEAD `a410f727`). Prose-only defect; there is no
  runtime observation to make, because the runtime behaviour is the prescribed
  one. Established by a citation walk over the committed tree (`rg` / `awk` over
  `docs/` and `src/`, reproduced in §Reproduction). No probe, no scratch file, no
  test run, no provider.

## Summary

`docs/spec_topics/errors-and-results/error-model.md:65` opens the panic
enumeration with "V1 panic sources — each carrying its registered
`theta/runtime/*` code", lists six (`:67–72`), and closes the set at `:74`
("This list is closed for *spec-defined* panic sources"), referring back to it
as "the six closed-list sources above". `:76` reads each panic's message
template out of `code-registry-runtime.md` and summarises "The six V1
templates" in the `:78–85` table.

Seven classes extend `ThetaPanic` at HEAD. The seventh is
`InterpolatedResultPanic` (`src/render/query-render.ts:110`), raised from
`stringifyInterpolation` (`src/extension/production-theta-producer.ts:5680`),
and its `code` is `theta/parse/interpolated-result`
(`src/render/query-render.ts:80`, `:111`) — a `theta/parse/*` code, registered
in `code-registry-parse.md:72`. `error-model.md` does not mention it: `rg -n
"interpolated-result" docs/spec_topics/errors-and-results/` returns nothing.

The panic is required, not incidental. QRY-18 prescribes it
(`query-escapes-stringification.md:32`) and the registry row's own *Trigger*
names it (`code-registry-parse.md:72`). Bug 0079 raised it because QRY-18's
`Result<T, E>` row had no reachable disposition at any input, and it subclassed
`ThetaPanic` so that QRY-21 — a panic during interpolation is not contained by
`let _ =` — holds for it. The routing follows: `surfaceUnexpectedThrow` returns
`undefined` for any `ThetaPanic` (`src/runtime/runtime-panics.ts:500–503`), the
slash surface frames it with `code: thrown.code`
(`theta-composition-producer.ts:463`), and the three
`isThetaPanic(thrown) ? "panic" : "internal_error"` boundaries classify it as
`"panic"`. Every prefix-agnostic obligation on the page — `:10`, `:33`, `:55`,
`:89–91`, `:94` — is satisfied.

What is missing is any sentence acknowledging that a panic may carry a
parse-class code. Two families of claim depend on the omission.

Four are keyed off the enumeration and its count: `code-registry-runtime.md:7`
("exactly six **panic sources** … the table below carries one row per code in
that list"), the `theta/runtime/internal-error` *Trigger* defined negatively over
the list (`code-registry-runtime.md:22`), the `InvokeInfraError.cause`
`"internal_error"` comment defined the same way (`queryerror-variants.md:187`),
and reference ERR-20's downgrade scope ("any of the six panic sources above",
`docs/reference/errors-and-results.md:123`). Two of those are negative
definitions, so the list's membership decides what they assert: read literally
today, an `InterpolatedResultPanic` is "an exception outside the closed theta
1.0.0 panic-source list" and would be `theta/runtime/internal-error` /
`cause: "internal_error"`, which contradicts the shipped routing.

Four more state the prefix over a panic's *diagnostic*, on the delivery channel:
`runtime-event-channel.md:91` ("A panic emits exactly one `theta-system-note` per
top-level panic with `details: { diagnostics: [Diagnostic] }` carrying a single
`theta/runtime/*` diagnostic"), `:32` (the group-B table row, "runtime panic
(single-element batch, `theta/runtime/*` code)"), `:57` (the always-log inventory
entry, "every row of [Diagnostics — `theta/runtime/*`]"), and `glossary.md:7`,
which constitutes the closed always-log set partly from "`theta/runtime/*` panic
codes". The shipped note for the seventh panic carries
`theta/parse/interpolated-result` in the field `:91` describes
(`emitPanicNote`, `production-theta-producer.ts:1314–1324`; `code: thrown.code`,
`theta-composition-producer.ts:463`). `error-model.md:92` adds author-facing
advice resting on the same presumption, and two code comments assert the
invariant outright (`src/runtime/runtime-panics.ts:65`, `:500`).

Two dispositions are available — widen the enumeration, or scope it explicitly
to `theta/runtime/*` sources and state that the QRY-18 fallback is outside it —
and §Fix enumerates both with consequences. The choice is not made here.

## Reproduction

There is nothing to run: the defect is prose, and the runtime behaviour it fails
to describe is the behaviour QRY-18 prescribes. What follows is a citation walk
over the committed tree at `a410f727` — the enumerated set on one side, the
shipped `ThetaPanic` set on the other. Every command below was executed at HEAD
and its output is transcribed.

### The enumerated set: six sources, six `theta/runtime/*` codes

```
$ awk 'NR>=67 && NR<=72' docs/spec_topics/errors-and-results/error-model.md
- Non-exhaustive `match` — `theta/runtime/match-error` (…)
- Array index out of bounds (…) — `theta/runtime/index-out-of-bounds`.
- `.field` access on `null` — `theta/runtime/null-member-access`.
- `[i]` access on `null` — `theta/runtime/null-index-access`.
- Member or indexed access on a missing object key — `theta/runtime/missing-object-key`.
- `invoke` chain depth exceeded — `theta/runtime/invoke-depth-exceeded` (…)
```

Six bullets, six codes, every one `theta/runtime/*`. The framing at `:65` and
the closure at `:74` are quoted in §Affected.

### The shipped set: seven `ThetaPanic` subclasses

```
$ rg -n "extends ThetaPanic" src/
src/render/query-render.ts:110:export class InterpolatedResultPanic extends ThetaPanic {
src/runtime/match-result.ts:40:export class MatchError extends ThetaPanic {
src/runtime/runtime-panics.ts:72:export class IndexOutOfBoundsPanic extends ThetaPanic {
src/runtime/runtime-panics.ts:81:export class MissingObjectKeyPanic extends ThetaPanic {
src/runtime/runtime-panics.ts:90:export class NullIndexAccessPanic extends ThetaPanic {
src/runtime/runtime-panics.ts:99:export class NullMemberAccessPanic extends ThetaPanic {
src/runtime/runtime-panics.ts:108:export class InvokeDepthExceededPanic extends ThetaPanic {
```

Six of the seven map one-to-one onto the enumerated bullets. The seventh is
`InterpolatedResultPanic`, and it is the only one declared outside
`src/runtime/`.

### The seventh panic's code is `theta/parse/*`

```
$ rg -n "INTERPOLATED_RESULT_CODE = |readonly code = " src/render/query-render.ts
80:export const INTERPOLATED_RESULT_CODE = "theta/parse/interpolated-result";
111:  readonly code = INTERPOLATED_RESULT_CODE;
```

`readonly code` is the field `ThetaPanic` declares abstract
(`src/runtime/runtime-panics.ts:67–69`) and the field the slash surface copies
into the emitted diagnostic (`theta-composition-producer.ts:463`).

### `error-model.md` does not mention it

```
$ rg -n "interpolated-result" docs/spec_topics/errors-and-results/
$ rg -n "interpolat" docs/reference/errors-and-results.md
```

Both empty. The only `interpolat` hit anywhere in
`docs/spec_topics/errors-and-results/` is `error-model.md:76`, in the unrelated
sense of placeholder interpolation inside a message template.

### The raise site, and its one production caller

```
$ rg -n "stringifyInterpolation" src/
src/extension/production-theta-producer.ts:5624: * `stringifyInterpolation`).
src/extension/production-theta-producer.ts:5634:    text += stringifyInterpolation(part.exprSource, env);
src/extension/production-theta-producer.ts:5657:function stringifyInterpolation(source: string, env: LexicalEnvironment): string {
src/extension/production-theta-producer.ts:5757: * `stringifyInterpolation` can raise QRY-18's runtime fallback for it instead
src/extension/production-theta-producer.ts:5992: * render path (`stringifyInterpolation`), so a receiver that would leak into a
```

`:5680` is the throw. The `system:`-field interpolation path shares the
renderer but not the disposition: `src/parser/system-interpolation.ts:480`
calls the same `stringifyInterpolatedValue` and `:482` returns
`{ ok: false, diagnostic: rendered.diagnostic }`. One raise site, one surface.

### The two negative definitions the enumeration governs

```
$ rg -n "outside the closed theta 1.0.0 panic-source list" docs/spec_topics/
docs/spec_topics/diagnostics/code-registry-runtime.md:22:| `theta/runtime/internal-error` | E | runtime | The interpreter or an adapter it called threw an exception outside the closed theta 1.0.0 panic-source list …
docs/spec_topics/errors-and-results/queryerror-variants.md:187:       | "internal_error"             // callee threw an unexpected interpreter exception outside the closed theta 1.0.0 panic-source list
```

Both are defined by exclusion from `error-model.md:67–72`. The implementation
partitions by `isThetaPanic` instead
(`src/runtime/runtime-panics.ts:500–503`, `invoke-cancellation.ts:138`,
`statement-executor.ts:468`, `:1187`), which admits the seventh class. The two
partitions coincide for six sources and disagree on the seventh.

### No gate scores the enumeration

`tests/runtime-panics.test.ts` iterates a hand-written `PANIC_CASES` table
(`:113–187`) under a describe naming six sources (`:189`); nothing derives the
set from `src/`. The four other files carrying the count
(`tests/absent-member-presence-gate.test.ts:79`, `:796`,
`tests/non-object-receiver-gate.test.ts:923`,
`tests/missing-object-key-rendering.test.ts:83`, `:300`,
`tests/par-for.test.ts:531`) carry it in comments and assertion-failure
rationales. `npm test` is green at HEAD with seven `ThetaPanic` subclasses and a
six-source enumeration.

## Expected behaviour

**The panic is prescribed.** QRY-18's note at
`docs/spec_topics/query/query-escapes-stringification.md:32`:

> The `Result` rejection is **static**, resolved from the expression's type, and
> fires even when the `Result`-valued expression sits behind a function call
> whose return type the parser can resolve. When the type is unresolvable (e.g.
> an inferred binding that widens past the parser's view), the runtime renderer
> falls back to a panic carrying the same `theta/parse/interpolated-result`
> diagnostic code — the same "static where possible, runtime where not" posture
> used elsewhere for tool-call argument typing.

**The code is prescribed by the registry row itself.**
`docs/spec_topics/diagnostics/code-registry-parse.md:72`, *Trigger* column:

> `${expr}` interpolation whose `expr` has Theta static type `Result<T, E>` (the
> runtime renderer raises the same code as a panic when the type is statically
> unresolvable).

Under DIAG-2 (`diagnostic-shape.md:72`) a *Trigger* is normative and a change to
one is a spec change. That row already licensed the panic and its code before bug
0079 landed: the row is untouched by `a410f727`, and its last modification is the
0.65.0 commit `80fef716`. `docs/reference/diagnostics.md:121` mirrors the row's
Code / Sev / Phase / Message; the reference registry has no *Trigger* column, so
the panic clause has no reference mirror to drift from.

**The `ThetaPanic` subclassing is prescribed by QRY-21.**
`query-escapes-stringification.md:58`:

> **QRY-21.** A `${expr}` interpolation can trip any of the runtime panics in
> [Errors and Results — Runtime panics]
> (non-exhaustive `match`, OOB, null/missing-key access). Panics arise during
> evaluation of the RHS and propagate before the `let _ =` binding completes;
> the discard form does not contain them.

QRY-21's containment claim is a property of the panic routing, and that routing
is entered by `instanceof ThetaPanic` (`src/runtime/runtime-panics.ts:546–548`).
A plain `Error` would reach `surfaceUnexpectedThrow`'s general arm and be
re-coded `theta/runtime/internal-error` (`:536–542`), which would contradict the
registry *Trigger*'s "raises the same code". Subclassing `ThetaPanic` is the only
route that satisfies both sentences at once.

**So the shipped behaviour is conformant, and the corpus is short one sentence.**
Three obligations hold at HEAD and any disposition must preserve them:

1. A `Result`-valued `${expr}` whose static type is unresolvable panics, and the
   panic carries `theta/parse/interpolated-result` — `code-registry-parse.md:72`,
   `query-escapes-stringification.md:32`.
2. The panic travels the panic channels: the `"theta /<name> aborted: <message>"`
   note with `details: { diagnostics: [Diagnostic] }` and
   `InvokeInfraError { cause: "panic" }` — `error-model.md:33`, `:89–92`.
3. `let _ =` does not contain it, and neither does `match` — QRY-21,
   `error-model.md:94`.

What no sentence supplies is an account of a `ThetaPanic` whose code is not
`theta/runtime/*`. `error-model.md:65` implies the prefix, `:74` closes the set
that two other *Trigger*s are defined by exclusion from, and `:76` names the
wrong registry page for the seventh panic's *Message template*. One sentence —
in `error-model.md` §"Runtime panics" under disposition (i), or scoping the
section under disposition (ii) — is owed. Which one is §Fix (a).

## Actual behaviour / root cause

**The enumeration is a closed set with a prefix in its preamble.**
`error-model.md:65` binds two facts into one clause — that the list is the panic
inventory, and that each entry carries a `theta/runtime/*` code. The corpus then
cites the list for the first fact while the second rides along unstated. Nothing
distinguishes "the closed set of panic sources" from "the closed set of
`theta/runtime/*` panic sources", so a reader cannot tell whether a parse-coded
panic is a spec violation or a member the list forgot.

**The count is load-bearing in four places, none of which is on this page's
own edit surface.**

- `code-registry-runtime.md:7` — "theta 1.0.0 has exactly six **panic sources**
  … the table below carries one row per code in that list, identifiable by
  matching each row's *Code* cell against that closed list." The second clause
  binds the closed list to *this* table's rows. A seventh source whose row lives
  in `code-registry-parse.md` cannot be matched that way.
- `code-registry-runtime.md:22` — the `theta/runtime/internal-error` *Trigger*,
  "threw an exception outside the closed theta 1.0.0 panic-source list".
- `queryerror-variants.md:187` — `cause: "internal_error"`, "outside the closed
  theta 1.0.0 panic-source list".
- `docs/reference/errors-and-results.md:123` — ERR-20, "from any of the six panic
  sources above". ERR-20's normative text lives on the reference page;
  `control-flow.md:78` (CTRL-5) states the downgrade without an enumeration and
  links to it.

The two negative definitions are the sharp ones. Read literally at HEAD they
classify `InterpolatedResultPanic` as a runtime defect, because it is a throw
whose source is not on the closed list. The implementation classifies by
`isThetaPanic`:

```ts
// src/runtime/runtime-panics.ts:499–504
  // Already a panic (one of the six closed sources): not a runtime defect, not
  // reclassified — the caller rethrows it so it bypasses `?`/`match`.
  if (isThetaPanic(thrown)) {
    return undefined;
  }
```

`isThetaPanic` is `error instanceof ThetaPanic` (`:546–548`), so the arm admits
seven classes while its comment names six. The same predicate decides the
`InvokeInfraError.cause` at all three boundaries
(`invoke-cancellation.ts:138`, `statement-executor.ts:468`, `:1187`), so a
callee's interpolation panic reaches its parent as `cause: "panic"` — which
`queryerror-variants.md:186` defines as "callee aborted via runtime panic (see
Runtime panics above)", pointing back at a list the panic is not on.

**The delivery channel describes a panic's diagnostic by prefix, and the seventh
panic's note contradicts it.** The slash surface builds the diagnostic with
`code: thrown.code` (`theta-composition-producer.ts:463`) and hands it to
`emitPanicNote`, which sends one `theta-system-note` with
`details: { diagnostics: [diagnostic] }`
(`production-theta-producer.ts:1314–1324`). That is the group-B emission
`runtime-event-channel.md:91` specifies as "carrying a single `theta/runtime/*`
diagnostic", and `:32` tabulates it the same way. For the seventh panic the code
in that field is `theta/parse/interpolated-result`. `:57` compounds it by
enumerating the channel's panic membership as "every row of [Diagnostics —
`theta/runtime/*`]", which no longer covers the panic set, and `glossary.md:7`
constitutes the closed always-log set partly from "`theta/runtime/*` panic
codes", so the seventh panic's membership in that closed set is unstated while
its note is emitted. The behaviour is what `error-model.md:33` and `:89–91`
prescribe — one note, group B, session intact — and the descriptions of it are
written in terms of a code prefix rather than in terms of the panic surface.

**The message-template paragraph names the wrong registry page.**
`error-model.md:76` requires every panic's message to be the *Message template*
"registered for its `theta/runtime/*` code in the [Diagnostics code
registry](../diagnostics/code-registry-runtime.md#…)". The seventh panic's
message is `rendered.diagnostic.message`
(`production-theta-producer.ts:5680`), which is `INTERPOLATED_RESULT_MESSAGE`
(`query-render.ts:95–96`, `:439`) — the *Message* column of
`code-registry-parse.md:72`, verbatim. The substance of the requirement is met
(registry-anchored, DIAG-4-conformant, and bug 0079's witnesses read the string
out of the registry rather than copying it,
`tests/interpolated-result-gate.test.ts:176–190`); the sentence's pointer is
wrong for this one panic, and the `:78–85` table that summarises "The six V1
templates" has no row for it.

**Two code comments assert the invariant outright.**
`src/runtime/runtime-panics.ts:65` — "Each subclass carries its registered
`theta/runtime/*` code." — is false for `InterpolatedResultPanic`. `:500` — "one
of the six closed sources" — undercounts the arm it annotates. Both are comments,
so no behaviour depends on them; both are the same claim the spec page makes, in
the module that owns the base class.

**The disposition question is which sentence was intended.** Bug 0079's fix
report records the deliberation and its scope limit (quoted in §Provenance): the
registry row alone licensed the panic, so the fix needed no spec edit, and
amending the spec was outside its brief. That leaves the enumeration's intent
unadjudicated. Both readings are defensible from the text as written, which is
why this report pins rather than answers.

## Why it matters

- **The corpus's single panic inventory omits a shipped panic.**
  `expressions.md:9` calls `error-model.md:67–72` "the canonical closed list",
  and five test files cite it as the authority. A theta author reading the page
  to learn what can abort a theta does not learn that a `${expr}` interpolation
  can, beyond the three families QRY-21's parenthetical names.
- **Two normative *Trigger*s are defined by exclusion from the list, so the
  omission changes what they assert.** Read literally,
  `code-registry-runtime.md:22` and `queryerror-variants.md:187` put the
  interpolation panic on the runtime-defect surface with code
  `theta/runtime/internal-error` and `cause: "internal_error"`. The
  implementation routes it as a panic. One of the two has to move, and today the
  corpus does not say which.
- **The `theta/runtime/*` prefix reads as an invariant that a conformance test
  could be written against.** `error-model.md:65` and `:76`, mirrored at
  `docs/reference/errors-and-results.md:82`, support the inference "every panic's
  code starts `theta/runtime/`". A test deriving the panic set from `src/` and
  asserting the prefix reds at HEAD against correct behaviour. No such test
  exists, which is why the drift is undetected rather than harmless.
- **The always-log set is closed and constituted partly by code prefix.**
  `glossary.md:7` builds it from `QueryError` `kind` values, binder failure
  causes, and "`theta/runtime/*` panic codes";
  `runtime-event-channel.md:57` enumerates its panic membership as "every row of
  [Diagnostics — `theta/runtime/*`]". The seventh panic emits its note
  (`emitPanicNote`, `production-theta-producer.ts:1314–1324`), so it behaves as a
  member of a closed set that does not name it. An operator reading those two
  pages to determine which failures are guaranteed to reach the channel gets an
  inventory one short.
- **One sentence is contradicted rather than merely silent.**
  `runtime-event-channel.md:91` states that a panic's group-B note carries "a
  single `theta/runtime/*` diagnostic". The shipped note carries a
  `theta/parse/*` one. That sentence moves under either disposition, which is why
  neither branch of §Fix (a) is a no-op.
- **ERR-20's downgrade scope understates its own implementation.**
  `docs/reference/errors-and-results.md:123` scopes the `par for` panic downgrade
  to "any of the six panic sources above"; `parForPanicError`
  (`statement-executor.ts:1182–1191`) downgrades on `isThetaPanic`, so an
  interpolation panic inside a `par for` body becomes that element's
  `Err(… cause: "panic" …)` — correct behaviour, outside the stated scope.
- **`code-registry-runtime.md:7` states a matching rule that cannot hold for a
  seventh source.** "The table below carries one row per code in that list,
  identifiable by matching each row's *Code* cell against that closed list" is a
  mechanical check. Widening the list without addressing that sentence makes it
  false; leaving the list at six keeps it true and leaves the panic unaccounted
  for. Either way the sentence is part of the fix.
- **Nothing in the suite reds on it.** The count lives in a hand-written table
  and in comments (`tests/runtime-panics.test.ts:113–187`, `:189`, and four other
  files). The one witness that inspects the seventh panic's identity
  (`tests/interpolated-result-gate.test.ts:823–829`) asserts precisely the two
  properties that make it exceptional — `isThetaPanic` true, code
  `theta/parse/interpolated-result` — without comparing either against
  `error-model.md`.
- **The next panic-adjacent addition inherits the ambiguity.** Bug 0027 added a
  registered runtime rejection and amended `error-model.md:74` to absorb it,
  because it was not a `ThetaPanic`. Bug 0079 added a `ThetaPanic` and amended
  nothing. The two precedents point opposite ways, so the third addition has no
  rule to follow.

## Non-goals

- **Bug 0079's shipped behaviour.** The panic, its code, its `ThetaPanic`
  subclassing and its routing are conformant with QRY-18 `:32`, the registry row
  `code-registry-parse.md:72` and QRY-21. This report proposes no change to
  `src/`, and any disposition that requires one is out of scope for it.
- **Re-coding the panic to a `theta/runtime/*` code.** That would satisfy
  `error-model.md:65` mechanically and is excluded on three independent grounds:
  the registry *Trigger* requires "the same code" as the static gate
  (`code-registry-parse.md:72`), DIAG-3 (`diagnostic-shape.md:73`) makes a
  registered code a stable identifier whose rename is deferred to theta 2.0, and
  a new code would be a DIAG-2 row addition with its own mirrors. Not offered as
  a disposition in §Fix.
- **The `system:`-field interpolation path.** It shares the renderer and returns
  a diagnostic rather than panicking (`system-interpolation.ts:480–482`), so it
  raises no panic-inventory question. `docs/reference/frontmatter.md:264–265`
  describes that path accurately.
- **`theta/runtime/non-object-receiver`.** Bug 0027's registered non-panic
  rejection is already absorbed in `error-model.md:74`'s prose and extends
  `Error`, not `ThetaPanic` (`src/runtime/runtime-panics.ts:145`). Its
  disposition is settled and is not reopened.
- **The stale comments in `src/`.** `src/runtime/runtime-panics.ts:65` and
  `:500` restate the spec claim this report questions. Whether they are corrected
  depends on which disposition §Fix (a) takes, and they are named here as
  consequences rather than as an independent defect.
- **The `theta/runtime/internal-error` *Trigger*'s open-endedness.**
  `code-registry-runtime.md:7` states the code is stable and "only its trigger
  condition is intentionally open-ended". This report's concern is the *negative*
  half of that Trigger (its exclusion clause), not its open-ended positive half.

## Fix

**Not settled. This report exists to pin the spec disposition**, which is what
bug 0079's fix report deferred by name: "A spec silence, not a defect of this
fix: I did not edit the spec (that would be a scope change under the brief), and
the registry row alone already licensed the panic. Worth an operator decision on
whether error-model.md should acknowledge the parse-coded panic." Five questions
have to be answered, and (a) decides the rest.

**(a) Which disposition governs the enumeration? — the operator decision.**
Both readings are available from the text as written, and the choice is a GOV-30
lock-step edit either way.

1. **Widen: `error-model.md` §"Runtime panics" acknowledges the parse-coded
   interpolation panic, and the set stays closed at seven.** The list becomes
   the inventory of panic sources simpliciter, and the `theta/runtime/*` clause
   at `:65` stops being a membership condition. Consequences, all mandatory in
   the same commit:
   - `:65`'s "each carrying its registered `theta/runtime/*` code" no longer
     holds for every entry and has to be requalified (per-entry codes, or the
     clause dropped).
   - A seventh bullet at `:67–72`, naming `theta/parse/interpolated-result` and
     forward-linking QRY-18 (`query-escapes-stringification.md:32`) the way the
     `invoke`-depth bullet forward-links `invocation.md`.
   - `:74`'s "the six closed-list sources above" → seven. The
     runtime-defect-surface sentence's exclusion then covers the seventh
     automatically, which resolves the `code-registry-runtime.md:22` and
     `queryerror-variants.md:187` negative definitions with no edit to either.
   - `:76`'s "registered for its `theta/runtime/*` code in the [Diagnostics code
     registry](../diagnostics/code-registry-runtime.md…)" has to admit a
     template registered on `code-registry-parse.md`, and the `:78–85` table
     ("The six V1 templates") gains a row or states that it summarises the
     `theta/runtime/*` subset only.
   - `code-registry-runtime.md:7` — "exactly six **panic sources**" → seven, and
     "the table below carries one row per code in that list" becomes false as
     written, because one of the seven rows is on a sibling page. That sentence
     needs a cross-registry clause.
   - `runtime-event-channel.md:91`'s "carrying a single `theta/runtime/*`
     diagnostic", `:32`'s group-B row, `:57`'s "every row of [Diagnostics —
     `theta/runtime/*`]" and `glossary.md:7`'s "`theta/runtime/*` panic codes"
     all state the prefix over a panic's diagnostic and all move with the list.
   - This branch is a **correction**, not a widening: per (b),
     `runtime-event-channel.md:91` is contradicted by the shipped note today.
2. **Scope: the enumeration is of `theta/runtime/*` panic *sources* only, and
   QRY-18's fallback is outside it.** The set stays at six and the section gains
   a sentence saying so — that a registered non-`theta/runtime/*` code may be
   raised as a panic by a rule owned elsewhere, that such a panic shares the
   routing at `:33` / `:89–91` and QRY-21's containment property, and that
   `theta/parse/interpolated-result` (QRY-18) is the theta 1.0 instance.
   Consequences:
   - Without that sentence the disposition is not stateable: `:74`'s exclusion
     clause and the two *Trigger*s defined negatively over the list keep
     classifying the panic as a runtime defect, contradicting the shipped
     routing. Silence is not an option under this branch either.
   - `code-registry-runtime.md:22` and `queryerror-variants.md:187` need their
     exclusion clauses re-anchored — "outside the closed panic-source list"
     becomes "not a panic" or equivalent — since exclusion from a six-item
     `theta/runtime/*` list no longer implies runtime-defect status.
   - `code-registry-runtime.md:7`'s matching rule survives unchanged, which is
     this branch's main advantage.
   - `runtime-event-channel.md:91` still moves. Its subject is every top-level
     panic, not the six-item list, so scoping the enumeration does not repair it;
     the same holds for `:32`, `:57`, `glossary.md:7` and `error-model.md:92`.
   - The mirror set is the same as under (1); the edits are scoping clauses
     rather than a seventh entry.

Do not pick by which edit is smaller. The question is what the enumeration is
*of*, and both branches touch the same pages — the five `docs/spec_topics/` pages
named in §Sev/Diff and the reference mirrors in (e).

**(b) Does any prose assert that every `ThetaPanic` carries a `theta/runtime/*`
code? — searched, and what turned up.** This decides whether (a)(1) is a
widening or a correction. `rg -n 'theta/runtime/\*' docs/spec_topics/
docs/reference/` at HEAD returns the sites below. **Prose does assert it, in six
places, and one of them is contradicted outright**, so (a)(1) is a **correction**
and (a)(2) does not escape the same edits.

- **Quantified over every panic, and contradicted.**
  `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:91` — "A
  panic emits exactly one `theta-system-note` per top-level panic with
  `details: { diagnostics: [Diagnostic] }` carrying a single `theta/runtime/*`
  diagnostic". Subject: every top-level panic. The shipped note for the seventh
  panic carries `theta/parse/interpolated-result` in that field
  (`emitPanicNote`, `src/extension/production-theta-producer.ts:1314–1324`;
  `code: thrown.code`, `src/extension/theta-composition-producer.ts:463`).
- **Quantified over every panic, and location-wrong.**
  `error-model.md:76` — "Every panic carries a single human-readable message
  string … registered for its `theta/runtime/*` code in the [Diagnostics code
  registry](…code-registry-runtime.md…)". Subject: every panic. Substance
  satisfied (the seventh panic's message is its registry *Message* verbatim),
  page and prefix wrong.
- **Constitutive of a closed set.** `docs/spec_topics/glossary.md:7` builds the
  always-log set from "`QueryError` `kind` values, binder failure causes, and
  `theta/runtime/*` panic codes"; `runtime-event-channel.md:57` enumerates the
  same membership as "every row of [Diagnostics — `theta/runtime/*`]". The
  seventh panic emits its note, so it behaves as a member of a set whose
  definition does not reach it.
- **Tabulated.** `runtime-event-channel.md:32` — the group-B row, "runtime panic
  (single-element batch, `theta/runtime/*` code)".
- **Author-facing advice.** `error-model.md:92` — "matching on the
  `theta/runtime/*` code (when surfaced through the diagnostics channel) is the
  more stable discriminator". Holds for six sources, fails for the seventh.
- **A property of the list rather than of `ThetaPanic`.** `error-model.md:65` —
  "V1 panic sources — each carrying its registered `theta/runtime/*` code" —
  predicates the prefix of the enumerated entries, so read narrowly it is not a
  quantification. It is the sentence that makes the other five read as an
  invariant.
- **Mirrors, weaker than the spec.** `docs/reference/errors-and-results.md:82`
  repeats `:65`'s clause verbatim; `:101–102` mirrors `:76` without naming a
  registry page. `docs/reference/diagnostics.md:45` glosses the namespace
  ("`theta/runtime/*` (execution panics, runtime-defect …)"), which is a
  namespace description, not a claim about panics.
- **Two code comments state it outright.** `src/runtime/runtime-panics.ts:65`:
  "Each subclass carries its registered `theta/runtime/*` code." — false at HEAD
  for `InterpolatedResultPanic`. `:500`: "Already a panic (one of the six closed
  sources)" — annotating an arm that admits seven. Comments, so nothing depends
  on them; they record the intent the spec pages project.
- **Not found anywhere:** a sentence permitting a panic to carry a
  non-`theta/runtime/*` code. The other pages that touch panic routing cite one
  specific code rather than quantifying over panics —
  `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md:62` and
  `docs/spec_topics/hard-ceilings/ceiling-invariants-and-audit.md:9` both name
  `theta/runtime/invoke-depth-exceeded`; `docs/spec_topics/invocation.md:85`
  (INV-4) and `docs/spec_topics/tool-calls.md:32` name no prefix-quantified
  claim.

Record this finding in whichever branch lands: `runtime-event-channel.md:91`'s
status is the difference between "the spec was silent" and "the spec was wrong",
and it decides whether the fix is filed as a widening or as a correction.

**(c) DIAG-2: no registry edit is owed, and confirm that before editing.** The
`theta/parse/interpolated-result` row already registers both dispositions in its
*Trigger* (`code-registry-parse.md:72`), so neither branch adds, removes or
re-namespaces a code, and DIAG-2's same-commit obligation is discharged by the
row as it stands — the position bug 0079's fix record takes ("No spec or
registry edit was needed") and which the commit `a410f727` bears out (no file
under `docs/spec_topics/` is touched). Two constraints hold either way. DIAG-4
(`diagnostic-shape.md:74`) forbids rewording the *Message*, and the shipped
panic already carries it verbatim (`query-render.ts:95–96`, `:439`;
`production-theta-producer.ts:5680`). `docs/reference/diagnostics.md` carries no
*Trigger* column, so the row's panic clause has no reference mirror to update.
If an adjudication nonetheless concludes the *Trigger* needs the runtime arm
stated more explicitly, that is a DIAG-2 *Trigger* change landing in the same
commit.

**(d) The row's *Phase* cell — one value, two dispositions.**
`code-registry-parse.md:72` carries Phase `type`, and the column legend
(`diagnostic-shape.md:80`) defines `type` as "type-system checks" against
`runtime` as "panic during execution". The static gate is a `type`-phase refusal;
the fallback is a runtime panic. One row carries one *Phase*. The row predates
bug 0079 with `type` in that cell, so this is not drift introduced by the fix,
and no observable depends on it (the *Phase* column feeds no runtime behaviour).
State the disposition explicitly rather than leave it implicit: either `type`
covers the row's primary disposition and the *Trigger* carries the runtime arm,
or the legend needs a rule for a two-disposition code. Do not change the cell
without deciding which.

**(e) The lock-step set — same commit, DIAG-2 / GOV-30.** Every page below moves
with a fix under whichever branch (a) takes — the `docs/reference/` mirrors
first, then the `docs/spec_topics/` co-edits. Each citation verified at HEAD.

- `docs/reference/errors-and-results.md:78–118` — the §"Runtime panics" mirror:
  the prefix clause (`:82`), the six bullets (`:84–89`), "outside the six
  sources" (`:93`), the message-string paragraph (`:101–102`), the six-row table
  (`:104–111`).
- `docs/reference/errors-and-results.md:120–134` — ERR-20, whose scope sentence
  (`:123`) says "any of the six panic sources above". ERR-20 has no
  `docs/spec_topics/` counterpart — `control-flow.md:78` (CTRL-5) states the
  downgrade without enumerating and links here — so the reference page is the
  normative site for that sentence and the edit lands there, not upstream.
- `docs/reference/diagnostics.md:230` — "exactly six **panic sources** (the first
  six rows)", the mirror of `code-registry-runtime.md:7`.
- `docs/reference/coverage-matrix.md:53` — the `errors-and-results.md` row, which
  claims "runtime panics + message templates" as mirrored content; it needs
  re-checking against whatever the mirror ends up saying.
- `docs/spec_topics/query/query-escapes-stringification.md:58` — QRY-21, whose
  parenthetical lists three panic families and omits this one. Under (a)(1) the
  seventh source is reachable through QRY-21's "any of the runtime panics in
  [Errors and Results — Runtime panics]" delegation and the parenthetical is
  illustrative; under (a)(2) QRY-21's reach over a panic outside that list is
  unstated. Either way the sentence is in scope.
- `docs/spec_topics/diagnostics/code-registry-runtime.md:7`, `:22` and
  `docs/spec_topics/errors-and-results/queryerror-variants.md:187` — the
  count-bearing sentence and the two negative definitions, per (a).
- `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:91`, `:32`,
  `:57`, `docs/spec_topics/glossary.md:7` and `error-model.md:92` — the
  delivery-channel prefix claims and the always-log set's constitution, per (b).
  `:91` is contradicted by the shipped note and moves under either branch;
  `:57`'s "every row of [Diagnostics — `theta/runtime/*`]" and `glossary.md:7`'s
  "`theta/runtime/*` panic codes" have to state the seventh panic's always-log
  membership one way or the other. No `docs/reference/` page mirrors either
  surface (the directory carries no Pi-integration-contract or glossary page), so
  these edits have no reference counterpart.
- Not mirrors, and consequences rather than obligations:
  `src/runtime/runtime-panics.ts:65` and `:500` (the two comments), and the five
  test files whose comments and assertion rationales carry the count
  (`tests/runtime-panics.test.ts:113`, `:189`;
  `tests/absent-member-presence-gate.test.ts:79`, `:796`;
  `tests/non-object-receiver-gate.test.ts:923`;
  `tests/missing-object-key-rendering.test.ts:83`, `:300`;
  `tests/par-for.test.ts:531`).

**Witness — a derived-inventory gate, offline and provider-free.** The reason
this drift went unobserved is that the panic inventory is written out by hand in
both the corpus and the suite. Whichever branch (a) takes, one cell closes that:
derive the panic set from `src/` (the `ThetaPanic` subclasses and their `code`
fields) and assert it against the enumeration parsed out of
`docs/spec_topics/errors-and-results/error-model.md` §"Runtime panics", the way
`tests/interpolated-result-gate.test.ts:176–190` already parses the registry for
DIAG-4 strings. Under (a)(1) the assertion is set equality; under (a)(2) it is
equality against the `theta/runtime/*` subset plus an explicit allow-list naming
the parse-coded panic and the sentence that licenses it. Prove the red direction
once (drop one bullet, or one subclass) before landing. No live test is involved:
bug 0079's live cells
(`tests/live/live-production-acceptance.test.ts:1213–1227`, `:1355–1375`) already
pin the panic's channel and its zero-token render-time abort, and no branch here
changes either.

## Provenance

- Origin: bug 0079's fix (0.69.0, commit `a410f727`), which raised the seventh
  panic and recorded this silence for an operator in its report's *For sibling
  orchestrators* section: "`docs/spec_topics/errors-and-results/error-model.md`
  §\"Runtime panics\" enumerates six closed panic sources, each carrying a
  `theta/runtime/*` code, and does not mention QRY-18's interpolation fallback —
  which the `theta/parse/interpolated-result` registry row and QRY-18 `:32` both
  require and which now exists as a seventh `ThetaPanic`. A spec silence, not a
  defect of this fix: I did not edit the spec (that would be a scope change under
  the brief), and the registry row alone already licensed the panic. Worth an
  operator decision on whether error-model.md should acknowledge the parse-coded
  panic." This report is that decision's input, and adds what the deferral does
  not state: the seven-versus-six inventory measured at HEAD, the four dependent
  claims keyed off the count, the two *Trigger*s defined negatively over the
  closed list and the `isThetaPanic` partition they disagree with, the
  `:76`-versus-`:65` distinction that decides whether widening is a correction,
  the two stale code comments, the *Phase*-cell sub-question, the mirror set, and
  the absence of any gate deriving the inventory from `src/`.
- Spec: `docs/spec_topics/errors-and-results/error-model.md:10` (the *Failure*
  bullet), `:33` (the *Panic* row of the per-cause table), `:55` (ERR-13), `:63`
  (the `runtime-panics` anchor), `:65` (**the defect site** — the prefix clause),
  `:67–72` (the six bullets), `:74` (the closure and the runtime-defect surface),
  `:76` (the panic-message paragraph and its registry pointer), `:78–85` (the
  six-row table), `:89–92` (the routing bullets), `:94` (panics are not values);
  `docs/spec_topics/query/query-escapes-stringification.md:16` (QRY-18), `:28`
  (the `Result<T, E>` row), `:32` (the runtime-fallback sentence — the licence),
  `:58` (QRY-21);
  `docs/spec_topics/diagnostics/code-registry-parse.md:72` (the row: Sev `E`,
  Phase `type`, the *Trigger*'s panic clause, the *Message*);
  `docs/spec_topics/diagnostics/code-registry-runtime.md:7` (the six-source count
  and the one-row-per-code matching rule), `:22` (the
  `theta/runtime/internal-error` *Trigger*'s exclusion clause);
  `docs/spec_topics/errors-and-results/queryerror-variants.md:186–187` (the
  `panic` / `internal_error` cause comments);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:73` (DIAG-3),
  `:74` (DIAG-4), `:80` (the column legend's *Phase* vocabulary);
  `docs/spec_topics/expressions.md:9` ("the canonical closed list");
  `docs/spec_topics/glossary.md:7` (the always-log set, constituted partly from
  "`theta/runtime/*` panic codes");
  `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:32` (the
  group-B table row), `:57` (the always-log panic inventory), `:91` (the
  one-note-per-panic rule and its "single `theta/runtime/*` diagnostic" clause —
  the corpus sentence the shipped note contradicts);
  `docs/spec_topics/control-flow.md:78` (CTRL-5, prefix-agnostic, links ERR-20);
  `docs/spec_topics/governance/req-id-prefix-table-active-b.md:76` (GOV-30
  lock-step). User-facing mirrors: `docs/reference/errors-and-results.md:78–118`
  and `:120–134` (ERR-20); `docs/reference/diagnostics.md:45`, `:121`, `:230`;
  `docs/reference/coverage-matrix.md:53`; `docs/reference/frontmatter.md:264–265`.
- Implementation evidence at `a410f727`: `src/render/query-render.ts:80`
  (`INTERPOLATED_RESULT_CODE`), `:95–96` (the registry *Message*), `:99–109` (the
  design doc comment), `:110–116` (**`InterpolatedResultPanic`**, `code` at
  `:111`), `:396–399` and `:431–441` (`stringifyInterpolatedValue`'s
  `case "result"` arm);
  `src/extension/production-theta-producer.ts:5657` (`stringifyInterpolation`),
  `:5675–5681` (the throw); `src/parser/system-interpolation.ts:467–486` (the
  `system:` path's diagnostic return); `src/runtime/runtime-panics.ts:62–69` (the
  `ThetaPanic` base and its stale comment), `:72`, `:81`, `:90`, `:99`, `:108`
  (the five subclasses this module owns), `:145–151`
  (`NonObjectReceiverError extends Error`), `:496–503` (`surfaceUnexpectedThrow`'s
  `isThetaPanic` arm and its stale comment), `:536–542` (the general
  `internal-error` arm), `:546–548` (`isThetaPanic`);
  `src/runtime/match-result.ts:40–41` (`MatchError`);
  `src/extension/theta-composition-producer.ts:315` (the `emitPanicNote`
  dependency declaration), `:443` (the annotated catch), `:457–468` (the panic
  arm, `code: thrown.code` at `:463`, the framing at `:468`);
  `src/extension/production-theta-producer.ts:1305–1324` (`emitPanicNote` and its
  group-B `details: { diagnostics: [Diagnostic] }` delivery); `src/runtime/invoke-cancellation.ts:132–139`,
  `src/runtime/statement-executor.ts:462–470` and `:1182–1191` (the three
  `isThetaPanic ? "panic" : "internal_error"` boundaries).
- Test evidence at `a410f727`: `tests/interpolated-result-gate.test.ts` (bug
  0079's witness, 22 cells; the DIAG-4 registry oracle at `:176–190`; group (b)'s
  `isThetaPanic` assertion at `:823–824` and its code assertion at `:828–829`);
  `tests/live/live-production-acceptance.test.ts:1213–1227` (the H8a header
  naming `InterpolatedResultPanic` and the channel) and `:1355–1375` (the
  `userTexts` / `systemNotes` observables); `tests/runtime-panics.test.ts:113–187`
  (the hand-written `PANIC_CASES` table) and `:189` (the six-source describe);
  `tests/absent-member-presence-gate.test.ts:79`, `:796`,
  `tests/non-object-receiver-gate.test.ts:923`,
  `tests/missing-object-key-rendering.test.ts:83`, `:300`,
  `tests/par-for.test.ts:531` (the count carried in comments and rationales only).
  No cell derives the panic set from `src/`; `npm test` is green at HEAD.
- Reproduction: the citation walk in §Reproduction — `rg` and `awk` over the
  committed tree at `a410f727`, transcribed with its outputs. No probe was
  written, no test was run, no file in the tree was modified by this filing, and
  no scratch file was created. `src/`, `tests/`, `docs/spec_topics/`,
  `docs/reference/`, `docs/bugs/README.md` and every other bug document are
  unmodified.

## Re-derivation (2026-08-23, HEAD `3778f4a8`) — not mooted, route still unsettled, STOPPED

An in-run re-derivation at `3778f4a8` (the tree carrying bug 0247's category-1
clause on `placeholder-rendering-a.md` and every merge up to it) re-ran the
§Reproduction citation walk against today's corpus. **The defect is live and
unmoved**, no discharger has landed, and §Fix (a) is still an unmade operator
decision. No file outside this document was edited, no test was written, no
scratch file was created, no version shipped. This note is append-only at EOF so
the sibling citations into this document's own line numbers
(`0114:1093` cites `0117:196`, `:490`, `:882`) do not shift.

### Probe table

| # | Probe (run at `3778f4a8`) | Result | Bearing |
|---|---|---|---|
| 1 | `git log a410f727..HEAD -- docs/spec_topics/errors-and-results/error-model.md` | empty; the file's last touch is `62a848ff` (bug 0032) | The defect site has not been edited since before this report was filed. |
| 2 | `git log a410f727..HEAD -- docs/reference/errors-and-results.md` | empty | The reference mirror is equally unmoved. |
| 3 | `awk` over `error-model.md:63–94` | `:65` still reads "V1 panic sources — each carrying its registered `theta/runtime/*` code"; `:67–72` still six bullets; `:74` still "the six closed-list sources above"; `:76` still points at `code-registry-runtime.md` and still says "The six V1 templates"; `:78–85` still six rows; `:91` still "the `theta/runtime/*` diagnostic"; `:92` still the prefix advice | Every §Affected citation into the defect site holds verbatim. |
| 4 | `rg -n "extends ThetaPanic" src/` | seven classes: `InterpolatedResultPanic` (`src/render/query-render.ts:110`) plus the six enumerated ones | Seven-versus-six is unchanged. |
| 5 | `rg -n "INTERPOLATED_RESULT_CODE = " src/render/query-render.ts` | `:80` `"theta/parse/interpolated-result"`; `:111` `readonly code = INTERPOLATED_RESULT_CODE` | The seventh panic's code is still `theta/parse/*`. |
| 6 | `rg -n "interpolated-result" docs/spec_topics/errors-and-results/` | empty | `error-model.md` still does not mention it. |
| 7 | `rg -n "interpolat" docs/reference/errors-and-results.md` | empty | The mirror still does not mention it. |
| 8 | `awk` over `runtime-event-channel.md:32`, `:57`, `:91`; `glossary.md:7` | all four prefix claims verbatim as filed | §Fix (b)'s "prose does assert it, and one sentence is contradicted outright" still holds; `:91` is still the sharpest contradiction. |
| 9 | `awk` over `code-registry-runtime.md:7`, `:22`; `queryerror-variants.md:187` | "exactly six **panic sources** … one row per code in that list" verbatim at `:7`; both negative definitions verbatim | The four count-keyed claims are unchanged. |
| 10 | `rg -n "new InterpolatedResultPanic" src/` | one raise site, `src/extension/production-theta-producer.ts:6292` | Still one raise site; the `system:` path still returns a diagnostic. |
| 11 | `rg -n "Each subclass carries\|one of the six closed sources" src/runtime/runtime-panics.ts` | `:65` and `:500` verbatim | Both stale comments survive. |
| 12 | `rg -n "exactly six" docs/` | `code-registry-runtime.md:7`, `docs/reference/diagnostics.md:255` | The mirror moved line but not content. |
| 13 | `awk` over `placeholder-rendering-a.md:5–58` (bug 0247's landed clause) | 0247 added category 1's undetermined-static-type token table (`:28`, `:30–42`); category 2's `Result<T, E>` scrutinee rule sits at `:58` | **Bug 0247 does not reach this report.** It governs how a `<type>` / `<scrutinee summary>` placeholder renders, not which panics exist or what code a panic carries. It neither moots the enumeration question nor changes the abort's legality. |
| 14 | `rg -n "runtime-fallback panic" docs/spec_topics/expressions.md` | `:188` — "`?` … inside a `${...}` query-template interpolation … aborts the theta with QRY-18's runtime-fallback panic (`theta/parse/interpolated-result`)" | **New since filing.** A second spec page now names the parse-coded panic in normative prose while `error-model.md:9`'s "canonical closed list" still omits it — the drift widened rather than closed. |

### Citation drift since `a410f727` (this report's citations, refreshed)

Content-identical, line-moved. `error-model.md` and `docs/reference/errors-and-results.md` citations are **unchanged**.

- `docs/spec_topics/diagnostics/code-registry-parse.md:72` → **`:83`**. The row's
  *Trigger* also **grew a second runtime arm** (bug 0114, containment at any
  depth: "the runtime renderer also raises it when `expr`'s static type is
  `array<T>` or a Schema-typed object and the evaluated value holds a `Result` at
  any depth"). More inputs reach the seventh panic; the disposition question is
  unchanged.
- `docs/spec_topics/query/query-escapes-stringification.md:58` (QRY-21) → **`:59`**;
  `:16` (QRY-18), `:28`, `:32` unchanged; **`:33` is new** (bug 0114's containment
  sentence, the runtime arm restated).
- `docs/reference/diagnostics.md:230` → **`:255`**; `:121` → **`:129`**; `:45`
  unchanged.
- `docs/reference/frontmatter.md:264–265` → **`:332`**.
- `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:73` (DIAG-3),
  `:74` (DIAG-4), `:80` (column legend) unchanged.
- `src/extension/production-theta-producer.ts:5680` (the throw) → **`:6292`**;
  `emitPanicNote` → **`:1563`**.
- `src/extension/theta-composition-producer.ts:443` (the annotated catch) →
  **`:542`**; `:463` (`code: thrown.code`) → **`:589`**; `:468` (the framing) →
  **`:594`**.
- `src/runtime/statement-executor.ts:468` → **`:490`**; `:1187` → **`:1235`**.
- `src/runtime/runtime-panics.ts:65`, `:500`, `:502`, `:546`,
  `src/runtime/invoke-cancellation.ts:138`, `src/render/query-render.ts:80`,
  `:110`, `:111` unchanged.
- Test citations unchanged: `tests/absent-member-presence-gate.test.ts:796`,
  `tests/non-object-receiver-gate.test.ts:923`,
  `tests/missing-object-key-rendering.test.ts:300`,
  `tests/runtime-panics.test.ts:113`, `:189` all still cite
  `error-model.md:71` / "the six closed panic sources".

### Why this run stopped rather than landing a clause

The route is genuinely unsettled and nothing in the corpus at `3778f4a8` forces a
branch. §Fix (a) offers two dispositions; this report's own Status paragraph calls
the choice "an operator decision under [GOV-30] lock-step", and §Fix (a) closes
with "Do not pick by which edit is smaller. The question is what the enumeration
is *of*." Both branches change what the canonical closed list **means**, and both
land lock-step prose across five `docs/spec_topics/` pages and four
`docs/reference/` mirrors. Three candidate forcing constraints were examined and
none decides:

1. **Bug 0027's precedent** (absorb into `error-model.md:74`'s runtime-defect
   surface without extending the closed list) is the shape of branch (a)(2), but
   §Related already rules that route unavailable — 0027's `NonObjectReceiverError`
   extends `Error` and is **not** a panic, whereas `InterpolatedResultPanic`
   extends `ThetaPanic` and that subclassing is load-bearing for QRY-21. It
   argues for (a)(2)'s *shape* without settling whether a panic may sit outside
   the panic-source list.
2. **QRY-21's delegation** (`query-escapes-stringification.md:59`, "any of the
   runtime panics in [Errors and Results — Runtime panics]") reaches the seventh
   panic automatically under (a)(1) and needs an added clause under (a)(2) — a
   cost of (a)(2), which §Fix (e) already books as in scope either way.
3. **`code-registry-runtime.md:7`'s matching rule** survives untouched under
   (a)(2) and needs a cross-registry clause under (a)(1) — a cost of (a)(1), and
   exactly the "which edit is smaller" tie-break §Fix (a) forbids.

There is also no branch-neutral partial landing. The delivery-channel prefix
claims (`runtime-event-channel.md:91`, `:32`, `:57`, `glossary.md:7`,
`error-model.md:92`) move under either branch, but their replacement wording has
to characterise the seventh panic — as a seventh list member or as a panic
outside the list — which is the branch choice restated. The §Fix witness has the
same property: set equality under (a)(1), subset-plus-allow-list under (a)(2).

**The question, stated for the operator:** *is the `error-model.md`
§"Runtime panics" enumeration the closed list of panic sources simpliciter
(→ widen to seven, disposition (a)(1)), or the closed list of `theta/runtime/*`
panic sources with QRY-18's fallback deliberately outside it (→ scope, and state
that a registered non-`theta/runtime/*` code may be raised as a panic by a rule
owned elsewhere, disposition (a)(2))?* Everything downstream — the count-keyed
claims, the two negative *Trigger*s, the delivery-channel prefix sentences, the
`:78–85` table, ERR-20's scope, and the shape of the derived-inventory witness —
follows mechanically once that is answered. Status stays **open**.

## Fix (0.256.0)

**Spec authority — the operator ruling (fifteenth set, ruling 1), verbatim:**

> OPERATOR RULING (fifteenth set, ruling 1): 0117 = (a)(2). error-model.md
> §Runtime panics enumerates the sources of theta/runtime/* panics — scope the
> list header accordingly and state the one exception immediately beside it:
> QRY-18's runtime fallback (InterpolatedResultPanic) panics with the
> parse-namespaced code theta/parse/interpolated-result, cross-referencing
> expressions.md:188 which already names it. The namespace ↔ list correspondence
> stays exact; code-registry-runtime.md:7's matching prose stays true
> unmodified; the list is NOT widened to seven.

- **What shipped:**
  - `docs/spec_topics/errors-and-results/error-model.md` — the
    `**Runtime panics.**` header paragraph (line 65) rewritten *in place, still
    one line, file still 94 lines*: it now states that the section enumerates
    the sources of `theta/runtime/*` panics and that the namespace and the list
    correspond exactly (a source is listed **iff** its registered code sits in
    the `theta/runtime/*` namespace), then states the one exception immediately
    beside it — QRY-18's runtime fallback `InterpolatedResultPanic`, carrying
    the parse-namespaced code `theta/parse/interpolated-result`, whose *Message
    template* is registered in `code-registry-parse.md` rather than the runtime
    registry, a panic in every other respect (panic routing kept; contained by
    neither `match` nor `?` nor `let _ =`, QRY-21) and, being deliberate and
    registered rather than an unanticipated throw, not on the runtime-defect
    surface — cross-referencing
    [Query — QRY-18](../spec_topics/query/query-escapes-stringification.md#qry-18)
    and [Expressions — `?` operator](../spec_topics/expressions.md#question-operator),
    which already name it. The six bullets, the closure paragraph, the
    message-template table and the routing bullets are byte-unchanged.
  - `docs/reference/errors-and-results.md` — the GOV-30 lock-step mirror: the
    §"Runtime panics" head sentence rescoped the same way, plus one condensed
    exception paragraph after the six mirror bullets. Six bullets unchanged.
    ERR-20 unedited.
  - `docs/spec_topics/expressions.md` — lines 9 and 10: "the canonical closed
    list" → "the canonical closed list of `theta/runtime/*` panic sources", the
    smallest edit that makes the page agree with the scoped meaning. Those are
    both occurrences of the phrase in the corpus; the file is still 242 lines.
  - `tests/b0117-panic-namespace-scoping-gate.test.ts` — new 12-cell
    conformance oracle (0062/0049 shape).
- **Deliberately NOT edited, enumerated** (each checked against the bytes; none
  restates the six-item claim in a way (a)(2) falsifies):
  1. `docs/spec_topics/diagnostics/code-registry-runtime.md` line 7 — pinned by
     the ruling as true unmodified; its referent list is now the scoped one.
     Byte-untouched, and oracle cell K asserts its prose survives.
  2. `code-registry-runtime.md` line 22 (`theta/runtime/internal-error`
     *Trigger*) — a registry cell; no cell edit is authorized (DIAG-2/DIAG-4),
     and its exclusion clause is over *unanticipated* throws, which the
     deliberate registered panic is not.
  3. `docs/spec_topics/errors-and-results/queryerror-variants.md` line 187 —
     the same negative definition with the same "unexpected" qualifier; true
     unmodified.
  4. `error-model.md` line 74 — scoped to "unexpected interpreter exceptions …
     the runtime did not anticipate"; the new exception sentence says
     explicitly that the exception is not on that surface.
  5. `error-model.md` lines 76, 91 and 92 — their `theta/runtime/*` references
     are read under the stated exception three sentences above, which names the
     exception's registry page and its routing. The ruling prescribes two
     sentences, not quantifier surgery across the section; the operator's own
     treatment of `code-registry-runtime.md` line 7 is the precedent.
  6. `docs/reference/diagnostics.md`'s six-panic-sources prose — the mirror of
     `code-registry-runtime.md` line 7; it moves only if that line moves.
  7. `docs/reference/errors-and-results.md` ERR-20 — "from any of the six panic
     sources above" is a sufficient-condition statement, under-prescriptive
     rather than false, and its understatement predates and is independent of
     this ruling. Residual 1 below.
  8. `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` lines
     32, 57 and 91, and `docs/spec_topics/glossary.md` line 7 — delivery-channel
     prefix claims. They do not restate the six-item claim, so they fall outside
     the granted scope; they were already contradicted at HEAD, independent of
     the ruling. Residual 2 below.
  9. `docs/spec_topics/expressions.md` line 234 — "integer overflow's deliberate
     exclusion from the closed panic list" is true under the scoped reading.
  10. `docs/reference/coverage-matrix.md` line 53 and
      `docs/reference/frontmatter.md`'s `system:`-field sentence — no six-item
      claim; accurate as written.
  11. `src/` — byte-untouched. The stale comments at
      `src/runtime/runtime-panics.ts` line 65 and line 500 are this report's own
      named non-goal and no ruling clause reaches them. Residual 3 below.
- **Gates** (run by the orchestrator at the final tree state):
  - Witness: `npx vitest run tests/b0117-panic-namespace-scoping-gate.test.ts`
    → `Test Files 1 passed (1)` / `Tests 12 passed (12)`.
  - Full default suite: `npm test` → `Test Files 426 passed (426)` /
    `Tests 8954 passed (8954)`.
  - `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) → exit 0.
  - `npm run lint` (`eslint "src/**/*.ts"`) → exit 0.
  - Citation gate `tests/citation-symbol-form-gate.test.ts` → 3 passed.
- **Review:** 1 round. Round 1 (`bug-fix-reviewer`) — **CLEAN**, no findings;
  two non-blocking residuals (a "quoted verbatim" claim in the witness header
  that was really citation-normalized, and the out-of-scope prefix claims
  recorded as residual 2). The first was polished by one comment-only
  `bug-fix-fixer-light` round, verified by gate-diff (comment lines only);
  the confirmation review round was skipped per policy.
- **Verification:** PASS. (1) Each of the seven red-at-HEAD cells re-reddened
  when its page was reverted to HEAD bytes and greened on restore, every file
  proven byte-identical afterwards by `git hash-object`; cells H and L proven
  non-vacuous by a seventh-bullet mutation, cell J by its `toBe(1)` cardinality
  form over the src-derived subclass set. (2) Default suite green. (3) No live
  run owed or performed — `git diff --stat -- src/` is empty, so no
  live-exercised surface moved. (4) Typecheck and lint exit 0.
- **Residuals:**
  1. **ERR-20's scope still understates its implementation.**
     `docs/reference/errors-and-results.md` ERR-20 (now from line 127) scopes
     the `par for` downgrade to "any of the six panic sources above", while
     `parForPanicError` downgrades on `isThetaPanic`
     (`src/runtime/statement-executor.ts` line 1235), which admits the
     exception panic too. Pre-existing, not falsified by (a)(2), outside the
     granted scope. Follow-up bug material.
  2. **The delivery-channel prefix claims remain contradicted.**
     `runtime-event-channel.md` line 91 ("carrying a single `theta/runtime/*`
     diagnostic"), line 32, line 57 and `glossary.md` line 7's always-log set
     still describe a panic's diagnostic by namespace, while the exception
     panic's group-B note carries `theta/parse/interpolated-result`. Unchanged
     from HEAD; the ruling did not reach them and they do not restate the
     six-item claim. Follow-up bug material.
  3. **Two stale comments in `src/`** — `src/runtime/runtime-panics.ts` line 65
     ("Each subclass carries its registered `theta/runtime/*` code") and line
     500 ("one of the six closed sources"). Named as a non-goal by this report;
     `src/` is byte-untouched by design.
  4. **Line-shift map for `docs/reference/errors-and-results.md`** (355 → 362
     lines; +1 from old line 83, +7 from old line 90): old 86→87, 88→89,
     91→98, 92→99, 108→115, 110→117, 120→127, 123→130, 133→140, 295→302.
     No `src/` or `tests/` file cites a line of that page; the citing documents
     are bug reports, whose citations are snapshots taken at a named HEAD.
     `error-model.md` (94 lines) and `expressions.md` (242 lines) did **not**
     move, so the five tests citing `error-model.md` line 65, line 69, line 71,
     line 74 and line 76 are unaffected.
- **Discharge notes appended:** none.
- **Pinned dispositions / non-goals:** the list is **not** widened to seven;
  `code-registry-runtime.md` is byte-untouched and its line 7 prose stays true
  unmodified; no registry cell is edited; the shipped panic, its code, its
  `ThetaPanic` subclassing and its routing are unchanged.
- **Lane note:** landed in worktree `lane/g`; no `package.json`, `CHANGELOG.md`
  or `docs/bugs/README.md` edit and no commit was made here. The version is
  recorded as the literal placeholder `0.256.0` for the merging parent to resolve.
