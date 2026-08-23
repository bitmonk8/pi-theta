# Bug 0255 — A dropped theta's lex-phase diagnostics reach the `theta-system-note` channel twice: `lexTheta` delivers its own batch through the V7d seam (`src/lexer/lexer.ts:131`) and the composition root re-delivers the same rows in the drop group (`src/extension/production-composition.ts:2435` → `:757`), so one `theta/parse/block-comment` (or any other lexer-surfaced row) renders as two notes on one load pass, against `diagnostic-shape.md:65`'s one-`pi.sendMessage`-per-`.theta` rule

- **Status:** fixed (0.247.0). The dedup point §Fix left open was adjudicated
  in-run to candidate 2 (the drop group); see `## Fix (0.247.0)`.
- **Sev/Diff estimate:** S2/D2 — S2 because the author-visible output is wrong
  in count, not in content: every lexer-surfaced row on a theta that fails to
  register is presented twice (measured: `n` lex rows produce `n + 1` notes and
  each row's rendered line appears exactly twice, §Reproduction (A)/(C)), while
  the parse-phase rows on the same file appear once, so the note stream implies
  a repetition that the source does not contain. No value is miscomputed and
  registration is unaffected. D2 because three candidate dedup points exist and
  the choice is cross-cutting: the lexer's own emit is a declared seam
  (`src/lexer/lexer.ts:8–9`, `:88–90`) with three no-op-channel callers that
  depend on delivery being caller-owned, and the drop group's per-diagnostic
  error fan-out is bug 0013's settled routing.
- **Kind:** defect — implementation. The spec fixes the delivery count
  (`docs/spec_topics/diagnostics/diagnostic-shape.md:65`: a rejected theta is
  reported "with the complete list in **one `pi.sendMessage` call per `.theta`
  file** … rather than fast-failing on the first error or fanning out one
  message per error"); two independent delivery sites each satisfy that rule
  locally and violate it jointly.
- **Related:**
  - [0246](./0246-unterminated-query-template-registered-unfired.md) —
    **fixed (0.224.0)**, the filing origin. Its `## Fix (0.224.0)` §Residuals
    item 2 (`:459–475`) records the doubling as measured, pre-existing and out
    of that fix's scope, and states the coverage consequence: the live cell
    `tests/live/unterminated-template-registration-live-cell.test.ts` asserts
    the channel count as a **lower bound** (`:194–199`) instead of exact-one,
    with the exact-one discipline held offline at `parseThetaDocument` level in
    `tests/unterminated-template-lexer-emission.test.ts`. Closing this report
    is what allows that live assertion to be tightened; a fix here rebases that
    cell's comment (`:49–59`), whose citations are stale (it cites
    `production-composition.ts:2417` → `:754`; the sites are `:2435` → `:757`
    at HEAD).
  - [0013](./0013-load-warnings-dropped-by-both-production-sinks.md) —
    **fixed (0.24.0)**, which established the `LoadDiagnosticSink
    { emit, emitGroup }` shape and the severity split this report's second
    delivery route runs through: an error routes per-diagnostic through the
    pre-eval router, a warning batches (`emitLoadNoteGroup`,
    `src/extension/production-composition.ts:1279–1295`). That split is
    correct for its own subject; the duplication is the *pair* of routes, not
    either route's shape.
  - **Ordering:** no report blocks this one, and this one blocks none.
- **Affected** (every citation verified at HEAD `53cd0d86`, 0.240.0):
  - `src/lexer/lexer.ts:128–132` — **delivery route 1.** `lexTheta` collects
    `[...scanned.diagnostics, ...contextual]` (`:126`) and, when non-empty,
    calls `emitDiagnosticBatch(diagnostics, deps)` (`:131`) — one batched
    `theta-system-note` carrying every lex row of the file — then returns the
    same array (`:133`). `:109` is the same-shaped early return for
    `theta/load/invalid-encoding`. The module docstring `:7–9` and the function
    docstring `:88–90` declare this emit as the seam's contract ("delivered
    through the V7d producer-facing diagnostic-emission seam
    (`emitDiagnosticBatch`) as exactly one batched `theta-system-note`").
  - `src/parser/theta-document.ts:897` — the production caller:
    `lexTheta({ path: file, bytes: encodeSource(split.bodyText) },
    deps.systemNote)`. The returned `lex.diagnostics` flow into the document
    batch, so `document.diagnostics` contains rows that have already been
    delivered.
  - `src/extension/production-composition.ts:2435` — **the re-delivery
    source.** `parseDiscoveredTheta` returns
    `{ dropped: [...document.diagnostics, ...subagentFnFraming] }` on the
    frontmatter-absent / error-severity arm.
  - `src/extension/production-composition.ts:753–757` — **delivery route 2.**
    `if ("dropped" in parsed) { … sink.emitGroup(parsed.dropped); continue; }`.
  - `src/extension/production-composition.ts:1279–1295` —
    `emitLoadNoteGroup`, the shipped `loadSink.emitGroup` (`:1300–1303`): each
    error member is routed individually through
    `preEvalRouter.routePreEvalFailure` with
    `content: renderDiagnosticBatch([diagnostic])`, warnings batch through
    `emitDiagnosticBatch`. Every lexer-surfaced code is error-severity (17
    `severity: "error"` pushes in `src/lexer/lexer.ts`, no `"warning"` push), so
    a lex row always takes the per-diagnostic arm here.
  - `src/extension/production-composition.ts:588` — the seam that makes both
    routes land on the same channel:
    `const systemNote = buildSystemNoteDeps(pi, ctx, sink.emit, rendererGate)`,
    threaded into `parseDeps` (`:589`) and handed to `parseThetaDocument` by
    `parseDiscoveredTheta` (`:2406`, `:757`'s sibling call at `:749–752`).
  - `src/parser/theta-document.ts:1345–1352`, `:1374–1381`, `:8570–8577` —
    three `lexTheta` callers that pass an inline **no-op** channel
    (`pi: { sendMessage: () => {} }`, `ui: { notify: () => {} }`,
    `emitDiagnostic: () => {}`) because they want tokens without delivery. The
    docstring at `:1339–1343` states the rationale ("Lex diagnostics are
    discarded here"). These are the callers a route-1 removal must keep working.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:65` — the **Multi-error
    reporting** rule: one `pi.sendMessage` call per `.theta` file, "rather than
    fast-failing on the first error or fanning out one message per error".
  - `tests/live/unterminated-template-registration-live-cell.test.ts:49–59`
    (the "WHY THE CHANNEL COUNT IS NOT PINNED EXACTLY" comment) and `:194–199`
    (`toBeGreaterThanOrEqual(1)`) — the coverage the doubling weakens. The
    comment's citations are 0246-era and stale (`:2417` → `:754`).
  - `tests/live/params-default-unterminated-literal-live-cell.test.ts` — the
    sibling live cell that asserts presence rather than count for the same
    reason.
  - `tests/unterminated-template-lexer-emission.test.ts` — where exact-one is
    held today: at `parseThetaDocument` level, below both delivery routes.
  - `tests/extension-bootstrap-sink-liveness.test.ts:715–791` — bug 0023
    element 2, the existing witness over this exact path (a block-comment
    theta driven through `composeExtensionInstance`). It asserts channel
    *routing* with `toContain`, not delivery counts, so it neither witnesses nor
    blocks the duplication.

## Reproduction

At HEAD `53cd0d86` (0.240.0). A scratch probe planted one `.theta` under
`<tmp>/.pi/theta/`, ran `composeExtensionInstance(pi, ctx, undefined, new
RendererGate())` against the host doubles of
`tests/extension-bootstrap-sink-liveness.test.ts` (`makeHost`,
`plantMalformedTheta`), and recorded every `pi.sendMessage` note. The gate is
undegraded, so every note takes the transcript arm.

### (A) One lex row, one file → two identical notes

| Body (after `---\nmode: prompt\n---`) | notes on the channel | notes carrying the lex code |
| --- | --- | --- |
| `` let _ = @`abc `` | 2 | 2 (`theta/parse/unterminated-template`) |
| `/* c */` + `let a = "x"` | 2 | 2 (`theta/parse/block-comment`) |
| `let a = "x` (EOF) | 2 | 2 (`theta/parse/literal-newline-in-string`) |
| `let a = \` | 3 | 2 (`theta/parse/stray-backslash`) |

Verbatim, the `block-comment` row (paths shortened):

```
[0] theta-system-note :: …/probe.theta:4:1: theta/parse/block-comment: block comments are not supported
[1] theta-system-note :: …/probe.theta:4:1: theta/parse/block-comment: block comments are not supported
```

The two notes are byte-identical in `content`. The `stray-backslash` row's
third note is the parse-phase `theta/parse/let-without-initialiser`, which
appears **once** — the asymmetry is confined to the lex phase.

### (B) Neutralising route 1 collapses every count to one

With `src/lexer/lexer.ts:128` temporarily read as
`if (false && diagnostics.length > 0)` (restored byte-exact afterwards;
`git hash-object src/lexer/lexer.ts` = `f0b4714dc09213972806f9ed3beb457880322741`
before and after), the same four rows deliver once each: total notes 1, 1, 1, 2
respectively, and the parse-phase row is unchanged. Route 2 alone therefore
carries every lex row to the author.

### (C) The delivery shape: `n` lex rows → `n + 1` notes

Body `let a = \` ⏎ `let match = 1` (two distinct lex rows):

```
[0] …:4:9: theta/parse/stray-backslash: stray backslash in source
    (blank line)
    …:5:5: theta/parse/reserved-keyword-as-identifier: reserved keyword 'match' cannot be used as an identifier
[1] …:4:1: theta/parse/let-without-initialiser: let binding 'a' has no initialiser
[2] …:4:9: theta/parse/stray-backslash: stray backslash in source
[3] …:5:5: theta/parse/reserved-keyword-as-identifier: reserved keyword 'match' cannot be used as an identifier
```

`[0]` is route 1's single batch (both rows, blank-line separated per
`diagnostic-shape.md:63`); `[2]` and `[3]` are route 2's per-diagnostic
re-deliveries. Each lex row's rendered line appears exactly twice; the
parse-phase row appears once.

### (D) The affected code set

Every code `lexTheta` returns takes both routes. `src/lexer/lexer.ts` pushes
fifteen distinct codes: `theta/load/invalid-encoding`,
`theta/parse/binding-case-mismatch`, `theta/parse/block-comment`,
`theta/parse/illegal-escape`, `theta/parse/integer-literal-out-of-range`,
`theta/parse/invalid-unicode-escape`,
`theta/parse/literal-newline-in-string`,
`theta/parse/number-literal-not-finite`,
`theta/parse/reserved-keyword-as-identifier`,
`theta/parse/schema-case-mismatch`, `theta/parse/single-line-if`,
`theta/parse/stray-backslash`, `theta/parse/unsupported-feature`,
`theta/parse/unterminated-string`, `theta/parse/unterminated-template`. All
fifteen are error-severity, so each one un-registers the theta and takes the
drop arm. The four codes in `src/lexer/literals.ts` are reached from the parser
(`validatePathLiteral`, `src/parser/theta-document.ts:36`), not from
`lexTheta`, and deliver once.

## Expected behaviour

One load pass over one `.theta` presents each diagnostic to the author once.
Per `docs/spec_topics/diagnostics/diagnostic-shape.md:65`, a rejected theta's
complete diagnostic list arrives in one `pi.sendMessage` per file; a lex-phase
row is not exempt and is not duplicated by the number of delivery seams the
row's array passes through.

## Actual behaviour / root cause

Two sites deliver the same array. `lexTheta` both emits and returns its
diagnostics (`src/lexer/lexer.ts:131`, `:133`); `parseThetaDocument` folds the
returned rows into `document.diagnostics` (`src/parser/theta-document.ts:897`);
`parseDiscoveredTheta` returns that array as the drop group
(`src/extension/production-composition.ts:2435`); the compose pass delivers the
group onto the same channel (`:757` → `emitLoadNoteGroup`, `:1279–1295`). Both
channels are built from the same `pi.sendMessage` seam (`:588` and the
`loadSink`/`channel` pair at `:1257`), so nothing between them can observe that
a row is already delivered.

Neither site is redundant on its own reading: route 1 is the declared
producer-facing seam contract (`src/lexer/lexer.ts:8–9`, `:88–90`), and route 2
is required by FM-3 / DIAG-1 — a drop must carry its registry code and message
to the author, and the parse-phase rows in the same array have no other
delivery. The defect is that no site owns the delivery decision for a row that
both can see.

## Why it matters

- The author reads the same line twice per lex error and cannot tell repetition
  in the output from repetition in the source. With several lex rows the batch
  note and the per-row notes interleave (§Reproduction (C)), so the transcript
  presents one file's errors in two different groupings.
- Delivery counts are unassertable at the load path, so live coverage degrades
  to lower bounds: 0246's cell (`:194–199`) and its sibling
  `tests/live/params-default-unterminated-literal-live-cell.test.ts` both
  weaken to presence assertions, which cannot witness an over-delivery
  regression of any size.
- The duplication scales with the code set, not with the input: all fifteen
  lexer-surfaced codes (§Reproduction (D)) are affected on every theta that
  drops.

## Fix

Establish single-delivery at the seam: for one load pass over one `.theta`, each
diagnostic reaches the `theta-system-note` channel exactly once, whichever
phase produced it. Constraints on any route:

1. **Exact-one, not at-most-one.** A dropped theta's lex rows must still reach
   the author with their registry code and message (FM-3 / DIAG-1). A fix that
   silences route 1 without proving route 2 delivers the same rows, or vice
   versa, is a regression to a silent drop.
2. **The no-op-channel callers keep working.** `parseExpressionSource`
   (`src/parser/theta-document.ts:1345`), its sibling at `:1374` and
   `firstForbiddenInterpolationToken` (`:8570`) pass an inert channel and rely
   on `lexTheta` returning diagnostics they discard. No route may make those
   paths deliver, and none may require them to supply a real channel.
3. **Bug 0013's severity split is preserved.** Errors route per-diagnostic
   through the pre-eval router and warnings batch
   (`src/extension/production-composition.ts:1279–1295`). Deduplication must
   not collapse that split or re-batch errors.
4. **The batching rule holds for the surviving route.** Whatever delivers, one
   file's rows follow `diagnostic-shape.md:65`/`:63` — no fan-out beyond what
   0013 already fixed for errors, and multi-row batches keep the blank-line
   separation.
5. **Both directions witnessed.** A regression cell asserts an exact note count
   (not a lower bound) for a single-row and a multi-row lex drop through
   `composeExtensionInstance`, and reds when either route is restored. 0246's
   live cell (`:194–199`) tightens from `toBeGreaterThanOrEqual(1)` to exact,
   and its stale route citations (`:49–59`: `:2417` → `:754`) are corrected to
   `:2435` → `:757`.

Candidate dedup points, all reachable; the route choice is open:

- **The lexer's emit (`src/lexer/lexer.ts:128–132`).** Drop route 1 and make
  `lexTheta` a pure returner, moving the delivery obligation to
  `parseThetaDocument`'s callers. This deletes the duplication at the source
  and removes the `deps.systemNote` argument's only use inside the lexer, but
  reverses the V7d seam contract stated at `:8–9` / `:88–90`, so the contract
  text moves with it; any other producer that emits on its own must be swept
  for the same shape.
- **The drop group (`src/extension/production-composition.ts:2435` / `:757`).**
  Partition `document.diagnostics` into already-delivered lex rows and
  undelivered parse rows, and re-deliver only the latter. Keeps both seam
  contracts intact, but requires `parseThetaDocument` to report which rows it
  already delivered — the partition cannot be inferred from a code prefix,
  since `theta/parse/*` spans both phases (§Reproduction (C)).
- **The channel (`buildSystemNoteDeps` / `emitDiagnosticBatch`,
  `src/extension/production-composition.ts:588`,
  `src/extension/system-note-channel.ts:336`).** A per-pass delivered-set
  keyed on `(file, range, code)` suppressing a second delivery of the same row.
  Route-agnostic and covers any future double-delivering producer, but adds
  pass-scoped state to a seam that is currently stateless, and must not
  suppress a genuine re-delivery across hot-reload passes.

## Provenance

Found by the orchestrator of bug 0246's fix (0.224.0) while measuring that
fix's live cell: the cell observed two identical notes for a push that
instrumentation confirmed single. Recorded as §Residuals item 2 of
`docs/bugs/0246-unterminated-query-template-registered-unfired.md:459–475` and
as residual 2 of that run's report, both of which name it unfiled and
pre-existing. Re-reproduced here at HEAD `53cd0d86` with the scratch probe of
§Reproduction, which also established the `n + 1` delivery shape, the
lex/parse asymmetry, the fifteen-code scope, and route 1's neutralisation
witness.

## Fix (0.247.0)

- Route adjudication (§Fix left the dedup point open; decided in-run on the
  record): **candidate 2 — the drop group**. Candidate 1 (silencing the
  lexer's emit) was rejected because route 1 is the ONLY delivery for the five
  secondary `parseThetaDocument` callers that discard `document.diagnostics`
  (`src/extension/production-composition.ts` `resolveCalleeArity`,
  `parseCalleeForTools`, `parseCalleeTheta`, the closure-source walk, and
  `src/extension/import-static-checks.ts`'s `.thetalib` parse), so removing it
  turns those into silent drops (§Fix constraint 1), and because it would flip
  the V7d seam assertions of `tests/lexer-core.test.ts` ("fires through the V7d
  seam … not a direct out-of-band `pi.sendMessage`"). Candidate 3 (a per-pass
  delivered-set in the channel) adds state to a stateless seam and must reason
  about hot-reload passes. Candidate 2 changes neither seam contract, leaves
  `emitLoadNoteGroup` byte-unchanged (constraint 3), and keeps the surviving
  delivery batched per file (constraint 4, `diagnostic-shape.md:63`/`:65`).
- What shipped:
  - `src/parser/theta-document.ts` — `ThetaDocument` gains
    `deliveredDiagnostics`, the subset of `diagnostics` `lexTheta` already
    delivered through the V7d seam, set from the lex result at the single
    `parseThetaDocument` return site.
  - `src/extension/production-composition.ts` — `parseDiscoveredTheta`'s drop
    arm excludes `deliveredDiagnostics` from `dropped` by object identity (a
    code prefix cannot discriminate: `theta/parse/*` spans both phases);
    `subagentFnFraming` is never lexer-produced and always ships. The
    registering arm needs no filter (every lexer-surfaced code is
    error-severity, so a delivered lex row always took the drop arm).
  - `tests/lex-drop-single-delivery.test.ts` (new) — the constraint-5 witness.
  - `tests/live/unterminated-template-registration-live-cell.test.ts` —
    constraint 5's live half (see the flip enumeration below).
- Gates: witness `npx vitest run tests/lex-drop-single-delivery.test.ts` →
  4 passed (RED before the fix: 2-vs-1 and 4-vs-2, restored byte-exact,
  `git hash-object` matched); full default suite
  `npx vitest run --poolOptions.threads.maxThreads=3` → 423 files /
  8892 tests passed; `npm run typecheck` → clean; `npm run lint` → clean;
  live `npx vitest run --config config/vitest/vitest.live.config.ts
  tests/live/unterminated-template-registration-live-cell.test.ts
  tests/live/params-default-unterminated-literal-live-cell.test.ts` → RC=0,
  2 files / 3 tests passed.
- Authorized witness flips (no other protected cell changed):
  1. `tests/live/unterminated-template-registration-live-cell.test.ts` —
     `toBeGreaterThanOrEqual(1)` → `toBe(1)` on the occurrence count, its
     failure message rewritten, and its stale route citations corrected
     (`production-composition.ts:2417` → `:2446`, `:754` → `:757`). Authority:
     this report's §Fix constraint 5 and bug 0246's `## Fix (0.224.0)`
     §Residuals item 2, which names the tightening as this report's to make.
     Bug 0246's offline witness (`tests/unterminated-template-lexer-emission.test.ts`)
     and the rest of its cell set are untouched and green.
  2. Bug 0013's landed shape and surfaces: untouched —
     `emitLoadNoteGroup` (`:1279–1295` pre-shift) carries no hunk, the
     error-per-diagnostic / warning-batched split is unchanged.
- Review: 1 round (`bug-fix-reviewer`) — CLEAN, no blocking finding; residuals
  R1–R4 below. One comment-only polish round (`bug-fix-fixer-light`) resolved
  the R2 prose pointer; polish verified by gate-diff (comment-only hunk,
  gates re-run green), confirmation round skipped.
- Verification: SOLID. Red-proof by in-place neutralisation of the drop-arm
  hunk and byte-exact restoration (hash `ff169e84211c48094656ced52ea4ffa661b758df`
  before and after); full suite green; live evidence judged to discharge the
  end-to-end obligation (the tightened exact-one assertion runs the real load
  path); lint and typecheck clean; tree carries exactly the four expected
  paths and `tests/fixtures/h7a/permitted-codes.json` is byte-unchanged.
- Residuals:
  1. The `theta/load/invalid-encoding` drop variant is verified by reading
     (`src/lexer/lexer.ts` emits the encoding row before returning the same
     array, so the identity filter cannot silence it) but is not witnessed by
     a planted non-UTF-8 fixture; §Fix constraint 5 asks only for single-row
     and multi-row lex drops.
  2. Out of this route's scope: a malformed `.theta` that is BOTH discovered
     and reached as a `tools:` callee / imported `.thetalib` still puts its lex
     rows on the channel once per parsing walk, because those re-parse paths
     pass the real note channel and discard `document.diagnostics`
     (`production-composition.ts` `resolveCalleeArity` / `parseCalleeForTools`
     / `parseCalleeTheta` / the closure walk, `import-static-checks.ts`).
     Pre-existing, byte-untouched here, filing material for a separate report.
  3. Line-number drift: this fix inserts 8 lines into
     `src/parser/theta-document.ts` below its `ThetaDocument.diagnostics`
     declaration and 11 lines into `src/extension/production-composition.ts`
     below `parseDiscoveredTheta`'s drop arm, so `path:line` citations below
     those points shift. This report's own pre-fix citations are affected
     (`theta-document.ts:897` → `:904`, `production-composition.ts:2435` →
     `:2446`) and are left as the pre-fix record they describe. Nine other
     OPEN reports cite past the insertion points and were NOT edited (foreign
     documents): 0046, 0051, 0061, 0104, 0121, 0140, 0192, 0197, 0259.
  4. Under full-parallelism `npm test`, `tests/production-tools-load-resolution.test.ts`
     intermittently trips a `beforeAll` timeout under worker contention; green
     standalone and green in every throttled full run. Not attributable to
     this change.
- Discharge notes appended: none (0246's residual item 2 is discharged by the
  flip above; its document was not edited in this lane).
- Pinned dispositions / non-goals: the V7d producer-facing seam contract
  (`src/lexer/lexer.ts` module and `lexTheta` docstrings) is deliberately
  unchanged; the three no-op-channel `lexTheta` callers are untouched
  (§Fix constraint 2); no diagnostic code was added, removed or reclassified,
  so the GOV-15 registry carve-out is not engaged and
  `tests/fixtures/h7a/permitted-codes.json` is byte-unchanged.

