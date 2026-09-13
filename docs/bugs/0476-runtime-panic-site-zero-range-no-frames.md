# Bug 0476 — a runtime panic's diagnostic carries a synthesized zero range instead of the panic site, and the aborted note shows no location or call chain, so `theta /x aborted: index out of bounds: 1 not in 0..1` names neither the line nor the frame it happened in

- **Status:** fixed (unreleased; lands in the next version bump) — site
  threading plus a **spec amendment** to the aborted-note framing
  (human-ruled 2026-09-12: content-side site suffix, not a renderer-only
  change).
- **Sev/Diff estimate:** S2/D3 — S2: every runtime panic in a non-trivial
  theta is undiagnosable from its own note: the message names the operand
  (`1 not in 0..1`) but not which of the theta's dozens of index expressions
  raised it, and a panic inside an imported `.thetalib` fn does not even name
  the file. The first D4 quality-loop wave (`qw20260912204251`) aborted this
  way and the site had to be reconstructed by reading the whole orchestrator.
  D3: the panic classes gain a site and a frame list, the executor attaches
  them at four expression arms and two call boundaries, the framing gains a
  suffix, and the spec's per-variant note table changes.
- **Kind:** implementation defect against an existing normative clause
  (the diagnostic's `range`), plus a spec gap (nothing gave the human a way to
  SEE the site: the renderer draws `content` only and the panic path has no
  stderr mirror).
- **Spec basis** (at `430a196a`, v0.471.0 — pre-amendment wording):
  - [`errors-and-results/error-model.md` §Runtime panics](../spec_topics/errors-and-results/error-model.md#runtime-panics),
    the *Panic message string (normative)* paragraph: "There is exactly one
    message string per panic … surface-specific framing (the `theta /<name>
    aborted: ` prefix …) wraps the message rather than replacing it. **The
    panic site itself is reported separately through the diagnostic's `file`
    / `range`** … For panics inside a `.thetalib`-imported frame, the panic
    site is the leaf source location, not the importer." — the requirement
    the implementation does not meet.
  - The same section's slash-command bullet and
    [`pi-integration-contract/runtime-event-channel.md`](../spec_topics/pi-integration-contract/runtime-event-channel.md)
    per-variant table: `content` = `theta /<name> aborted: <message>`,
    `details: { diagnostics: [Diagnostic] }` — the framing this fix extends.
  - [`diagnostics/diagnostic-shape.md`](../spec_topics/diagnostics/diagnostic-shape.md):
    the `Diagnostic` fields (`file`, `range`, `message`, `hint`, `related`)
    and the serialised line format `<file>:<line>:<col>: <code>: <message>`
    with hint continuation lines — the shape the site suffix mirrors.
  - [`diagnostics/code-registry-runtime.md`](../spec_topics/diagnostics/code-registry-runtime.md)
    rows for the six panic codes — the message templates, which this fix
    does NOT change.
- **Affected** (at `430a196a`):
  - `src/runtime/runtime-panics.ts` — `ThetaPanic` and its five subclasses
    carry only `code` + `message`; the four construction seams
    (`evaluateIndexAccess`, `evaluateMemberAccess`, `enterInvokeFrame`,
    `assertKeyPresent`) take no site.
  - `src/runtime/match-result.ts:152` — `MatchError` likewise.
  - `src/runtime/statement-executor.ts:1154,1182,1696` and the fn-call
    evaluation (`evalUserFnCall`) — the arms that hold the `IndexExpr` /
    `MemberExpr` / `MatchExpr` / `CallExpr` node (every one `extends
    NodeBase { range }`) and do not thread it.
  - `src/extension/theta-composition-producer.ts:657-670`
    (`surfaceDispatchDefect`) — "a bare panic carries no SourceRange, so
    synthesize the zero body range": `file` = the theta's own source path
    even for a `.thetalib` leaf, `range` = `ZERO_BODY_RANGE`.
  - `src/extension/production-theta-producer.ts:1809-1814`
    (`emitPanicNote`) — `content` is the bare framing.
- **Observed at:** v0.471.0 (`507810dc`), Windows, `/quality-loop lenses=D4`:
  `theta /quality-loop aborted: index out of bounds: 1 not in 0..1`. The
  raising expression was `cols[1]` in the orchestrator's cluster pick loop
  (`.pi/theta/quality-loop.theta`, step 6) on a one-column row; the note
  named neither the line nor the loop.
- **Related:** bug 0365 (index-kind belt — the message operand rendering, kept
  byte-identical here); bug 0398 / 0404 (the note `details.diagnostics`
  shape, unchanged); bug 0422 (`theta/parse/interpolated-result` panic route
  — same framing, gains the same suffix: the `InterpolatedResultPanic` raised
  at `stringifyInterpolation`'s own `raiseInterpolatedResult` call
  (production-theta-producer.ts) unwinds through the SAME `renderQueryText`
  wrap every other interpolation panic does, so it too is retargeted to the
  query's real range and gains an `in interpolation ${…}` frame — verified
  directly, offline, since the panic fires while composing the query TEXT,
  before any provider turn (see the follow-up witness in
  `tests/b0476-panic-site-and-frames.test.ts`). The OTHER `raiseInterpolatedResult`
  call site, inside `evaluatePureExpression`'s `"try"` (`?`-propagate) arm, is
  covered the SAME way when reached via an interpolation (the only shipped
  route that raises it with no site/frame of its own); reached from a
  DEFAULT-param-value evaluation instead, the `ThetaPanic` is silently
  absorbed by that caller's own catch (never surfaces, so it needs no site);
  reached from an `invoke`/call argument position, the operand is real
  document AST, already file-relative, and outside this fix's scope. The
  `system:` frontmatter template (`src/parser/system-interpolation.ts`) is a
  DIFFERENT, unrelated surface — it accepts only a bare `Path` grammar, never
  reaches `parseExpressionSource`/`evaluatePureExpression`, and per its own
  header comment can never produce a `Result`-typed slot, so it never raises
  this panic at all); INV-4 depth accounting
  (`LexicalEnvironment.currentResidence()` already resolves the declaring
  file of a `.thetalib` fn at call time — the leaf-location rule's data
  source).

## Summary

A `ThetaPanic` is thrown from a construction seam that knows only the values
involved. The executor arm that called the seam holds the AST node — and with
it the source range and, through the lexical environment, the declaring file —
but nothing threads that into the panic. By the time the top-level catch
frames the note, the site is gone, so the diagnostic is filled with a
synthesized zero range and the theta's own path, and the note content carries
only the message. The user reads `index out of bounds: 1 not in 0..1` and
has to find the expression by hand.

## Reproduction

```
---
description: "bug 0476 repro"
mode: prompt
bind_model: "anthropic/claude-sonnet-5"
tools:
  - bash
---
fn second(cols: array<string>): string {
  return cols[1]
}
let rows = ["only-one-column"]
let _ = second(rows.split("\t"))
```
Pre-fix note: `theta /repro aborted: index out of bounds: 1 not in 0..1`; the
`details.diagnostics[0]` carries `file: <repro path>`, `range` = the zero
body range, no `hint`.

## Expected behaviour (post-ruling)

1. The panic's diagnostic carries the **panic site**: `file` = the source
   file of the raising expression (the `.thetalib` leaf for an imported fn
   body, per the existing normative sentence), `range` = that expression's
   range (`IndexExpr` / `MemberExpr` / `MatchExpr`; for
   `theta/runtime/invoke-depth-exceeded` the call expression that would have
   opened the frame).
2. The diagnostic's `hint` carries the **theta stack**: one line per open
   frame at the panic, innermost first — `in fn <name> (<call-site
   file>:<line>:<col>)` for every user-`fn` call boundary (imported or local),
   `in par for lane (<file>:<line>:<col>)` for a parallel lane body, and
   `in interpolation ${<source>} (<file>:<line>:<col>)` (follow-up) for a
   panic that arose while evaluating a `${…}` expression inside an
   `@`-query template — ending with `at <site file>:<line>:<col>` as the
   first line. A panic at top level has a one-line hint. **Follow-up
   amendment:** an expression evaluated inside a `${…}` interpolation is
   located at its enclosing query's own range with the hole's raw text named
   in the new frame — never at a coordinate local to the re-parsed
   interpolation substring (`stringifyInterpolation` → `parseExpressionSource`
   yields node ranges local to that substring, line 1, column within the
   hole).
3. **Spec amendment — the aborted note's `content`** is the unchanged framing
   line followed by the same lines, indented two spaces:
   ```
   theta /repro aborted: index out of bounds: 1 not in 0..1
     at C:/…/repro.theta:8:10
     in fn second (C:/…/repro.theta:11:9)
   ```
   The `<message>` string stays byte-identical (one string per panic, never
   re-formatted); only the framing grows a suffix. The
   `aborted with internal error: <detail>` framing gains the same suffix
   whenever a site is known (it usually is not for a host throw; then the
   content is the bare framing exactly as before).
4. Nothing else changes: one note per panic, `details: { diagnostics:
   [Diagnostic] }` single-element, `display` rules, `InvokeInfraError {
   cause: "panic" }` for an `invoke` parent, the six message templates.

## Actual behaviour / root cause

See §Affected: the construction seams have no site parameter; the executor
arms that have the node do not pass it; `surfaceDispatchDefect` synthesizes
`ZERO_BODY_RANGE`; `emitPanicNote` frames the bare message; the renderer
draws `content` only, so even the (wrong) diagnostic range is never shown.

## Non-goals

- Changing any panic **message** template (bug 0365 pins the operand
  rendering; the registry rows are unchanged).
- A host JavaScript stack for panics (that is the `internal-error` path's
  `hint`, unchanged).
- Carrying the site across the `invoke` boundary into the parent's
  `InvokeInfraError` message — the callee's own note carries it; a follow-up
  may add a structured field to the error.
- Rendering `details.diagnostics` in the TUI renderer (the human ruled for
  the content-side suffix so print mode and transcript replay see it too).

## Fix (unreleased)

- `runtime-panics.ts`: `ThetaPanic` gains `site?: PanicSite` (`{ file,
  range }`), `frames: PanicFrame[]`, and a `pendingRange?: SourceRange`
  (`file` stays required on `PanicSite` itself). `attachPanicSite(panic,
  site)` sets the site only when absent (innermost raise wins);
  `pushPanicFrame(panic, frame)` appends a frame whose `file` may itself be
  absent (pending). Two more helpers give the fix its TWO-PHASE site: a raise
  site that knows the node's range but not (yet) its file calls
  `attachPanicRange(panic, range)`, recording `pendingRange` when no site is
  set yet; `completePanicSite(panic, file)` — called exactly once, at the top
  of `surfaceDispatchDefect` — turns a pending range into a real `site` when
  one is still absent, and back-fills `file` on every frame that was pushed
  with none. `MatchError` implements the same shape.
- `statement-executor.ts`: the index / member / match arms and the fn-call
  evaluation wrap their seam call in a catch that attaches the FULL site
  (`expr.range`, the current residence's file, which this executor always
  has) and re-throws; the fn-call boundary pushes `{ kind: "fn", name, file,
  range }` (call site) as the panic unwinds through it; the `par for` lane
  body pushes `{ kind: "par-for", file, range }`; the depth seam's caller
  attaches the call expression as the site.
  `production-theta-producer.ts`'s PURE HOST evaluator is instrumented too —
  its evaluator, reachable on the shipped `@`-query interpolation route
  (`renderQueryText` → `stringifyInterpolation` → `evaluatePureExpression`),
  is NOT absorbed as originally assumed below; correcting that premise is
  this fix's amendment. Its member/index arms, its pure fn-call boundary, and
  its depth seam's caller all wrap their seam call the same way, but this
  host knows only the raising node's range, not the top-level body's on-disk
  file — only `surfaceDispatchDefect` (theta-composition-producer.ts) knows
  that, since the theta's own `sourcePath` lives there, not in the pure host.
  So each pure-host arm attaches a FULL site (`attachPanicSite`) when
  `LexicalEnvironment.currentResidence()` is known (a `.thetalib` leaf reached
  through the pure host still names its own file directly) and a PENDING
  range (`attachPanicRange`) otherwise; `surfaceDispatchDefect` completes any
  pending range with the theta's own source path — the correct file for the
  top-level body — before building the diagnostic.
- `theta-composition-producer.ts` `surfaceDispatchDefect`: FIRST calls
  `completePanicSite(thrown, theta.sourcePath ?? theta.slashName)`, THEN the
  diagnostic takes `panic.site` (falling back to the zero body range only
  when a panic carries none — a defect, asserted by a tripwire test), `hint`
  = the rendered stack; `emitPanicNote` receives the framing WITH the suffix
  (`renderPanicSuffixLines(panic)`), the internal-error route unchanged
  unless a site is present. `renderPanicSuffixLines` returns `[]` whenever
  `panic.site === undefined` (a spec/code contradiction fix: frames render
  only UNDER a site), so a site-less panic — defensive only, after the pure-
  host instrumentation above — carries neither suffix nor `hint`, matching
  the amended `error-model.md` paragraph and `runtime-event-channel.md` row
  exactly.
- Spec: `error-model.md` §Runtime panics (slash bullet + a new *Panic site
  suffix (normative)* paragraph), `runtime-event-channel.md` per-variant row,
  `code-registry-runtime.md` unchanged; CHANGELOG 0.472.0.
- **Follow-up (interpolation-local coordinates):** the fix above still let an
  interpolation panic's site/frame carry a coordinate LOCAL to the re-parsed
  `${…}` substring (`parseExpressionSource(source)`, `stringifyInterpolation`)
  — misleading, since it names a line/column inside the hole, not the
  enclosing query. A fourth `PanicFrame` kind, `{ kind: "interpolation",
  source, file, range }`, renders `in interpolation ${<source>} (<file>:<line>:<col>)`.
  `retargetInterpolationPanic(panic, { source, file, range })`
  (`runtime-panics.ts`) retargets the ONE substring-local coordinate a panic
  emerging from `stringifyInterpolation` can carry: (a) `panic.frames.length
  === 0` — the site/pending range is local — replaced with the enclosing
  query's real `{ file, range }`; (b) otherwise the OUTERMOST (last-pushed)
  frame — the call expression WRITTEN INSIDE the interpolation — has the
  local range, replaced in place (an inner frame, from a call made inside
  that callee's own document-AST body, is untouched); both arms then push the
  new `interpolation` frame. `renderQueryText`'s wrap around
  `stringifyInterpolation` is the ONE call site: it knows both the local
  coordinate the pure host produced and the enclosing `QueryExpr`'s own real
  range, so it calls the retarget then re-throws.

### Witnesses

- `tests/b0476-panic-site-and-frames.test.ts` (NEW): (1) an index panic at
  top level → diagnostic `range` = the `IndexExpr` range, `file` = the theta
  path, hint = one `at` line, content = framing + `  at …`; (2) the same
  panic inside a local `fn` → hint/content carry `in fn second (<call
  site>)`; (3) inside an imported `.thetalib` fn → `file` = the thetalib path
  (leaf rule), the frame's call site = the importer; (4) member / match
  panics attach their own node's range (the index arm's own site-attachment
  is already proven three ways by (1)-(3); `NullIndexAccessPanic` shares the
  exact same try/catch as `IndexOutOfBoundsPanic`, so the null-index
  deviation is not re-exercised with a separate fixture); (5)
  `invoke-depth-exceeded` attaches the call expression; (6) a `par for` lane
  panic carries the lane frame — asserted both as the direct mechanism
  (`pushPanicFrame` + `renderPanicSuffixLines`) and, via a passthrough spy on
  `pushPanicFrame`, against a REAL lane panic (so a deleted push reds); (7)
  the message string is byte-identical pre/post (the `<message>` slice of the
  content equals the registry template rendering); (8) tripwire: a
  `ThetaPanic` reaching `surfaceDispatchDefect` without a site is asserted as
  a defect in the test (the fallback exists, but no shipped panic path may
  take it); (9) [follow-up] an interpolation panic (the pure host evaluator's
  index arm, reached through `renderQueryText` → `stringifyInterpolation`) is
  RETARGETED (`retargetInterpolationPanic`) to the enclosing `@`-query's own
  real range — diagnostic `range`/`file` = the `let s = @…`` statement's
  QueryExpr, NOT the interpolation-local `IndexExpr` range the re-parsed
  substring yields; `hint`/`content` gain the new `in interpolation ${cols[1]}
  (…)` frame naming the hole, and the OLD local coordinate is asserted absent;
  (10) [follow-up] the same, inside a local `fn` called from an interpolation
  — the fn body's OWN site (document AST, file-relative) is unchanged, but the
  pure fn-call boundary's `in fn <name> (…)` frame — pushed at the
  interpolation-local CALL site — is retargeted to the query's own range, and
  an `in interpolation ${second(rows)} (…)` frame follows it. A new UNIT test
  drives `retargetInterpolationPanic`'s frames-present branch (b) directly on
  a hand-built panic (inner frame untouched, outermost frame retargeted,
  interpolation frame appended last), and a new drive-level test proves the
  bug 0422 `theta/parse/interpolated-result` route is retargeted the same way
  (offline, since the panic fires before any provider turn). A twelfth unit
  assertion (BLOCKER B) pins that a hand-built panic with frames but no site
  renders `[]` — no suffix at all.
- Existing tests that pinned the bare framing as the whole `content` are
  re-pinned to the amended framing (each names bug 0476).
