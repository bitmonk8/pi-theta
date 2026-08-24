# Bug 0270 — A subagent callee whose OWN `tools:` names a `.theta` path that resolves to no file un-registers, while its prompt-mode `tools:` caller still registers a fully-formed callable over it: bug 0267's widened read (`calleeFailsOwnStructuralChecks`, `production-composition.ts:2091`) resolves the callee's own `.theta` entries through a fixed stub (`:2140`) that never returns `undefined`, so `theta/load/unresolvable-theta-path` at the callee is invisible to the V15f `callee-has-errors` loop (`:1747–1759`) and the caller mints a `.theta` callable, with a load-time closure hash, for a file that will not load

- **Status:** fixed (0.268.0).
- **Sev/Diff estimate:** S3/D2 — S3 because the load-time report names the
  callee only: the caller registers, the callee does not, and the callable is
  offered to code and model with a closure hash over bytes that never load, so
  an author error becomes a drive-time failure. Same class as bug
  [0267](./0267-prompt-caller-registers-over-dropped-subagent-callee.md)'s
  landed rows 1–4, and the caller-side observable is byte-identical in shape to
  the healthy control. Not S2: no wrong value is produced and no isolation
  boundary moves. Re-scored to D2 from the seeded D1 after reading the seam:
  the admitting predicate sits behind `CallableSetDeps.resolveThetaCallee`
  (`src/parser/callable-set.ts:122`), which is SYNCHRONOUS, so admitting this
  route needs the callee's own `.theta` entry paths resolved (existence, and
  containment against the callee's directory) BEFORE `resolveCallableSet` runs
  — a pre-resolution step, not a predicate edit — while preserving the
  non-recursion bound the stub exists to enforce.
- **Kind:** defect — implementation diverges from documented behaviour.
  `invocation.md:22`: a callee that "fails its own structural checks is *not
  statically resolvable*", and on the `tools:` surface "the callable cannot be
  created, and the parent theta does not register". The callee here fails a
  structural check of its own (`theta/load/unresolvable-theta-path`) and does
  not register; the caller does.
- **Affected** (every citation re-derived at HEAD `76489c61`, v0.266.0;
  `src/extension/production-composition.ts` is 3104 lines at HEAD and was
  reshaped at 0.261.0, 0.264.0 and 0.265.0 — these lines are read off the
  current bytes):
  - `src/extension/production-composition.ts:2140` — inside
    `calleeFailsOwnStructuralChecks`, the `resolveThetaCallee` stub handed to
    `resolveCallableSet`: it returns `{kind:"theta", mode:"subagent", callee:
    undefined, calleePath: thetaPath}` for EVERY `.theta` entry in the callee's
    own `tools:`, never `undefined`. The seam.
  - `src/extension/production-composition.ts:2091` —
    `calleeFailsOwnStructuralChecks`, bug 0267's widened read; its
    doc-comment (`:2071–2081`) records this route as a deliberate withhold
    under the non-recursion bound.
  - `src/extension/production-composition.ts:2157–2159` — the helper's return:
    `result.diagnostics.some(d => d.severity === "error" && d.code ===
    "theta/load/unknown-tool")`, the named-code filter that admits row 4 of
    0267 and nothing else from the callee's own `tools:` resolution.
  - `src/extension/production-composition.ts:2030` —
    `parseCalleeForTools`'s `hasErrors`, now
    `hasLoadParseError(document.diagnostics) || failsPostParseChecks`.
  - `src/extension/production-composition.ts:1747–1759` — the V15f
    `callee-has-errors` loop in `resolveThetaToolsAtLoad` (`:1644`), gated on
    `callee.hasErrors`. The only site that can un-register the caller for a
    callee's condition.
  - `src/extension/production-composition.ts:2413–2432` — `parseCalleeTheta`'s
    dispatch gate: the parse test at `:2413` followed by the same
    `calleeFailsOwnStructuralChecks` call at `:2421` (bug 0267 §Fix constraint
    3), so the drive-time re-check inherits the identical blind spot.
  - `src/parser/callable-set.ts:411` — the `resolveThetaCallee === undefined`
    arm that raises `theta/load/unresolvable-theta-path` against the file
    declaring the entry. In the real resolution this fires on the callee; under
    the stub it is unreachable.
  - `src/parser/callable-set.ts:122` — `CallableSetDeps.resolveThetaCallee`, a
    synchronous lookup, which is why admitting the route is a pre-resolution.
  - `docs/spec_topics/invocation.md:20` — the static-resolution walk. Its
    enumeration of what the walk judges names the callee's own `.thetalib`
    import resolution and "the resolvability of the Pi tool names its own
    `tools:` declares"; a `.theta` path entry in the callee's own `tools:` is
    not enumerated (bug 0267 review finding F1 narrowed the sentence to exactly
    this line).
  - `docs/spec_topics/invocation.md:22` — the per-surface severity rule quoted
    under **Kind**.
  - `docs/spec_topics/diagnostics/code-registry-load.md:29` —
    `theta/load/unresolvable-theta-path`, whose *Trigger* — "`tools:` `.theta`
    entry resolves to a path that does not exist or is not readable" — names
    the CALLEE-side emission measured below, and nothing at the caller.
  - `docs/spec_topics/diagnostics/code-registry-load.md:42` —
    `theta/load/callee-has-errors`, `E` on the `tools:` surface, whose *Trigger*
    defers to `invocation.md#static-resolution` for what the walk judges.
  - `src/extension/production-composition.ts:316` — `preEvalCauseOf`'s
    `tools-resolution` (ERR-6) arm already covering
    `theta/load/callee-has-errors`.
  - `tests/callee-post-parse-errors-un-register-tools-caller.test.ts:560` —
    bug 0267's landed 10-cell witness (`describe`), the offline lock.
  - `tests/live/b0267live-callee-post-parse-errors-un-register-tools-caller-live-cell.test.ts`
    — its live cell, the second lock.
- **Observed at:** HEAD `76489c61`, v0.266.0, `main`, by one offline
  provider-free scratch probe driving `composeExtensionInstance` and
  `discoverAndComposeFixtures` over host doubles (token `b0270scratch`, removed
  after measurement; one case-insensitive sweep confirms no residue).

## Summary

Bug 0267 widened `parseCalleeForTools`'s `hasErrors` so a `tools:` caller
refuses over a callee dropped by four post-parse routes. One route it withheld
is still live: the callee's own `tools:` naming a `.theta` path that resolves to
no file. `calleeFailsOwnStructuralChecks` re-resolves the callee's own callable
set non-recursively, substituting a stub `resolveThetaCallee` that resolves
every `.theta` entry to a subagent-mode placeholder, so the
`theta/load/unresolvable-theta-path` that the callee's real resolution raises —
and that un-registers the callee — is never produced inside the caller's scan.
The V15f loop sees `hasErrors === false`, the caller registers, and its frozen
callable-set entry carries a closure hash over the dropped callee's bytes. The
dispatch gate applies the same predicate, so the drive-time verdict matches:
the callee is accepted.

## Reproduction

Plant the files under `<cwd>/.pi/theta/` with a `{}` `.pi/settings.json`, then
run `composeExtensionInstance(pi, ctx, undefined, new RendererGate())` over host
doubles (`ctx.cwd` = the workspace), reading `wiring.thetas` for the
registration decision and each theta's frozen `callableSet.entries` for the tool
list. Row C uses `discoverAndComposeFixtures` and drives the caller. The
`tools:` caller is
`---\nmode: prompt\ntools:\n  - ./callee.theta as callee\n---\n@`hi`\n`; the
callee is `---\nmode: subagent\ndescription: …\ntools:\n  - ./missing.theta as
gc\n---\nlet a = 1\n`.

| # | callee's own `tools:` `.theta` entry | caller registers | caller's callable list | callee registers | diagnostic sites |
|---|---|---|---|---|---|
| A | `./missing.theta` — no such file | **yes** | `callee → {kind: theta, mode: subagent, calleePath: ./callee.theta, closureHash: sha256:ba48f401…}` | no | the CALLEE file only: `theta/load/unresolvable-theta-path`, error, `cannot resolve .theta path './missing.theta'` |
| B | control — the path exists (subagent grandchild) | yes | same entry shape, hash over the healthy bytes | yes | none |

Row A is the defect: the caller's registration and callable entry are identical
in shape to control B while the callee is dropped, and no row is located at the
caller's `tools:` site. `theta/load/callee-has-errors` does not appear in row A.

Row C, the drive-time face, offline: an `invoke("./callee.theta")?` literal
caller over a PROMPT-mode callee carrying the same missing-`.theta` entry (the
literal surface is warning severity, so its caller registers and can be
dispatched; prompt mode keeps the probe from spawning a real `pi` child, exactly
as bug 0267's cell 9 does). Measured: the callee does not register; the caller
registers and drives; the drive puts ZERO notes on the `theta-system-note`
channel, so `#driveCallee`'s `Err(InvokeInfraError{cause:"load_failure"})` arm
is not taken and the callee's body runs. The dispatch gate at `:2421` accepts a
file the same pass dropped.

## Expected behaviour

`invocation.md:22`: a callee that fails its own structural checks is not
statically resolvable, and on the `tools:` surface the parent's disposition is
error — the callable is not created and the parent does not register. An
unresolvable `.theta` entry in the callee's own `tools:` is one of the callee's
own structural checks: it is error severity
(`code-registry-load.md:29`), it un-registers the callee, and it is raised by
the same `resolveCallableSet` walk whose `theta/load/unknown-tool` outcome bug
0267 already admits (`production-composition.ts:2157–2159`).

Two registration decisions over one file in one pass must agree. Row A is the
disagreement, in the same shape bug 0267 §Fix constraint 1 declared the defect.

The ERR-6 mapping needs no widening: `theta/load/callee-has-errors` is already
in `preEvalCauseOf`'s `tools-resolution` batch (`:316`), so reusing that row is
ERR-6-classified as landed.

## Actual behaviour / root cause

`calleeFailsOwnStructuralChecks` (`:2091`) answers the caller's scan in two
conditions. The second re-runs `resolveCallableSet` over the callee's own
`tools:` with a stub `CallableSetDeps`. The stub's `resolveThetaCallee`
(`:2140`) returns a fixed `{kind:"theta", mode:"subagent", callee: undefined}`
for any `.theta` path, without touching the filesystem. `resolveEntry`'s
`resolved === undefined` arm (`src/parser/callable-set.ts:411`) — the only
producer of `theta/load/unresolvable-theta-path` — is therefore unreachable
inside this walk, and the helper's return filter (`:2157–2159`) names
`theta/load/unknown-tool` alone, so even a produced row would not count.
`hasErrors` (`:2030`) stays `false`, the V15f loop (`:1747–1759`) has no
subject, `resolveCallableSet` mints the caller's callable, and
`attachLoadTimeClosureHashes` stamps a hash over the callee's transitive bytes.

The stub is deliberate and its doc-comment (`:2131–2146`) states the bound: full
recursion here is unbounded — a `tools:` cycle A↔B would not terminate — and
`checkNestedToolsContainment` refuses full nested resolution at the same depth
for the same reason (bug 0111). The stub is conservative by construction: every
divergence from the real resolution is a withhold, never a false refusal. This
report is the claim that one of those withholds leaves a live registration
divergence, not that the bound is wrong.

The callee's real drop happens later, on its own `runComposePass` iteration,
where `resolveThetaToolsAtLoad` performs the real path resolution and the row
lands on the callee file. The caller's scan never runs that resolution.

The dispatch gate (`:2413–2432`) calls the same helper, so the drive-time
verdict tracks the load-time one: row C measures the callee accepted at
dispatch. That is bug 0267 §Fix constraint 3 holding — one predicate, both
sites — with the same blind spot at both.

## Why it matters

- The author's load-time report names the callee, never the caller. Nothing
  says the caller's `tools:` entry is dead; `theta/load/callee-has-errors`
  exists for that message and does not fire.
- `frontmatter-fields-a.md:74`: the `tools` callable set is "callable from both
  the model (during a query's tool-call loop) and from theta code", so the dead callable reaches a model turn after tokens
  are spent.
- The stored closure hash (RFC-0005 `#subagent-theta-callable-hash`) is computed
  over bytes that do not load, so the hash-divergence mechanism is seeded with a
  value that can never be honoured.
- The route is the ONLY structural difference between rows A and B; the fixed
  0267 rows and this one are indistinguishable to an author.

## Non-goals

- Bug [0267](./0267-prompt-caller-registers-over-dropped-subagent-callee.md)'s
  landed rows (the callee's `.thetalib` import routes and its own
  `theta/load/unknown-tool`). Those refuse correctly at HEAD and are not
  reopened; this report adds one row at the same read.
- The prompt-mode grandchild variant — the callee's own `tools:` `.theta` entry
  resolving to a PROMPT-mode file (`theta/load/prompt-mode-callable` at the
  callee, caller registers). Same seam, different stub field (`mode:
  "subagent"` unconditionally at `:2140`); filed separately as
  `./0271-callee-tools-prompt-mode-grandchild-caller-still-registers.md`.
- Recursion into a grandchild's OWN errors. The non-recursion bound stands; only
  the existence (and containment) of the path named by the callee's own entry is
  in scope, which terminates without a graph walk.
- The callee's own `tools:` entry-grammar rejections, held by bug 0248 cells
  (D3)/(D5).
- The callee's own registration decision, correct in every row above.
- The `invoke(...)` literal surface's WARNING severity. Row C records its
  dispatch outcome as evidence; the severity does not move.

## Fix

Route not settled here; the constraints are.

1. Admit the route at the same widened read. A callee whose own `tools:`
   `.theta` entry resolves to no file un-registers, so the `tools:` caller must
   refuse — absent from the registered set, with an error-severity row located
   at the caller's `tools:` site — exactly as bug 0267's landed rows do.
2. Prefer the existing row. `theta/load/callee-has-errors`
   (`code-registry-load.md:42`) already names this subject on this surface at
   this severity and is already ERR-6-classified (`:316`). A new code needs a
   registry row, a `preEvalCauseOf` arm and an FN-7 list entry, and must be
   justified against the existing row's Trigger first.
3. The predicate is adjudicable, and the seam is a pre-resolution, not a
   callback edit. `CallableSetDeps.resolveThetaCallee`
   (`src/parser/callable-set.ts:122`) is synchronous while path resolution is
   async, so the fix decides where the callee's own entry paths get resolved
   (a pre-pass feeding a map the stub reads, or a separate existence walk beside
   `resolveCallableSet`) and whether the return filter (`:2157–2159`) gains
   `theta/load/unresolvable-theta-path` or is replaced by a per-route list.
4. Keep the non-recursion bound and keep the stub conservative. The admitted
   check terminates on the callee's own entries; it does not parse the
   grandchild, does not read its mode, and does not follow its `tools:`. Every
   remaining divergence stays a withhold, recorded in the helper's doc-comment
   as 0267 did.
5. One predicate, both sites. Whatever admits the route at `parseCalleeForTools`
   applies at `parseCalleeTheta`'s dispatch gate (`:2421`) in the same change,
   or row C's drive-time verdict diverges from the load-time one.
6. Containment interacts. `checkNestedToolsContainment` already judges the
   callee's own `.theta` entries for discovery-root containment (bug 0111), and
   an escaping entry draws `theta/load/invoke-path-escape`, not
   `unresolvable-theta-path`. The fix states which of the two the widened read
   admits, and does not double-report.
7. Locks. Bug 0267's 10-cell offline witness
   (`tests/callee-post-parse-errors-un-register-tools-caller.test.ts:560`) and
   its live cell
   (`tests/live/b0267live-callee-post-parse-errors-un-register-tools-caller-live-cell.test.ts`)
   must stay green byte-unchanged in their assertions; bug 0248 cells (D3)/(D5)
   and bug 0264's note counts are untouched by this route.
8. Order: this report and
   `./0271-callee-tools-prompt-mode-grandchild-caller-still-registers.md` share
   the stub at `:2140`. Whichever lands first owns the pre-resolution
   mechanism; the second reuses it and adds only its own code to the filter.

## Provenance

Bug 0267's fix record (`.pi/tmp/fixes/0267-report.md`; the same enumeration in
`docs/bugs/0267-prompt-caller-registers-over-dropped-subagent-callee.md` §Fix
(0.264.0), "Scope admitted … and what is withheld", withhold 3, and Residual 1
— "a callee whose own `tools:` names a `.theta` path that resolves to no file
still un-registers while its caller registers with no caller-located row …
Filing material"). Sixteenth set. Filed at HEAD `76489c61`, v0.266.0, from an
offline `composeExtensionInstance` / `discoverAndComposeFixtures` probe over the
two load-pass rows and the drive-time row tabulated in §Reproduction.

Ownership: the 0267 fix record's withhold enumeration is a record, not an owner
— 0267 is closed at 0.264.0 and its normative sentence
(`invocation.md:20`) was narrowed during review (finding F1) so that it does
NOT claim `.theta` path entries in the callee's own `tools:`. No current
*Trigger* covers the caller-side silence: `theta/load/unresolvable-theta-path`
(`code-registry-load.md:29`) names the file whose `tools:` entry is
unresolvable, which is the CALLEE-side emission this probe measured, and
`theta/load/callee-has-errors` (`:42`) defers to
`invocation.md#static-resolution`, whose enumeration stops at the callee's
`.thetalib` imports and its Pi tool names. The gap is therefore both
implementation-side and enumeration-side, and closing it is this report's
subject.

## Fix (0.268.0)

- What shipped:
  - `src/extension/production-composition.ts` —
    `calleeFailsOwnStructuralChecks` gained a PRE-RESOLUTION
    existence/readability probe over the callee's OWN `tools:` `.theta`
    entries, keyed by the spec as written (the same key
    `deps.resolveThetaCallee` is called with), resolved against the callee's
    directory, bytes discarded and never parsed (§Fix constraints 1 and 3);
    the stub `resolveThetaCallee` returns `undefined` for exactly the specs
    that probe recorded unreadable, so `resolveEntry`'s
    `resolved === undefined` arm raises `theta/load/unresolvable-theta-path`
    inside the caller's scan; the return filter became an explicit per-route
    code list (`theta/load/unknown-tool` from bug 0267 row 4 plus
    `theta/load/unresolvable-theta-path`), never a general `registered`
    verdict and never an entry-grammar code (§Fix constraint 2 — the landed
    `theta/load/callee-has-errors` row carries the caller's report, so no new
    code, no new registry row, no `preEvalCauseOf` arm);
    `checkNestedToolsContainment` now probes the nested entry's readability
    BEFORE judging containment and skips an entry whose read fails, the same
    read-then-containment order the depth-0 loop in `parseCalleeForTools`
    already runs (§Fix constraint 6); the helper's doc-comment records the
    admitted route, the precedence, and the re-enumerated WITHHOLDS.
  - `docs/spec_topics/invocation.md` (§Static resolution) — same-commit
    enumeration widening (DIAG-2): the callee's own structural checks judged
    by the walk now include the existence and readability of the `.theta`
    paths its own `tools:` names, with the bound stated (never that path's own
    parse, its own declared mode, or its own `tools:` entries) and the
    precedence stated (a path that cannot be read takes the unresolvable-path
    disposition; the containment disposition applies only to a path that can
    be read).
  - `docs/reference/discovery-cli.md` — the reference mirror of that sentence,
    amended identically. Grep found no further mirror.
  - `tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts`
    (new) — the offline witness, seven cells.
  - `tests/live/b0270live-callee-tools-missing-theta-path-live-cell.test.ts`
    (new) — the H8a live cell (registration outcome ⇒ live owed), standalone
    per the precedent of bug 0267's live cell, so no H8a cell number moves.
  - `tests/arg-mismatch-diagnostic-count-by-surface.test.ts`,
    `tests/callee-post-parse-errors-un-register-tools-caller.test.ts` —
    comment/message line-number citations re-derived, because this diff's
    doc-comment growth shifted the lines those two files cite. Assertions
    byte-unchanged in both; bug 0267's ten cells are byte-identical in
    behaviour (§Fix constraint 7).
- The adjudication (§Fix left the route open): the seam is a PRE-RESOLUTION,
  as §Fix constraint 3 anticipated — `CallableSetDeps.resolveThetaCallee` is
  synchronous while path resolution is async, so the probe runs before
  `resolveCallableSet` and feeds a `spec → readable` map the stub reads. The
  return filter gained the one route's code rather than being replaced by a
  general verdict. `mode: "subagent"` stays UNCONDITIONAL: the prompt-mode
  grandchild is a separate route and stays a withhold. One predicate serves
  both sites for free (§Fix constraint 5) — `parseCalleeTheta`'s dispatch gate
  calls the same helper, so no second admission exists to diverge. Containment
  (§Fix constraint 6) is adjudicated by PRECEDENCE, not by mutual exclusion:
  `checkInvokePathAtLoad` consults `realpath` alone, and a path that
  `realpath`s can still fail to read (a DIRECTORY named `<name>.theta` rejects
  `EISDIR`), so the two conditions are not disjoint; the containment walk
  defers to the read, exactly as the depth-0 loop does, and the read failure
  owns the entry.
- Gates: witness file `Tests 7 passed (7)`; full default suite
  `Test Files 445 passed (445) / Tests 9260 passed (9260)`; `npm run typecheck`
  (`tsc -p tsconfig.json --noEmit`) clean; `npm run lint` clean; live cell
  `Test Files 1 passed (1) / Tests 1 passed (1)` under the shared live lock.
- Review: 2 rounds plus one prose/comment polish round. Round 1 (deep):
  three findings — F1 `correctness`, an existing-but-unreadable grandchild
  outside every root drew TWO caller-located rows (`invoke-path-escape` +
  `callee-has-errors`), diff-introduced, closed by the read-before-containment
  precedence above plus new cells (D2)/(D3); F2 `test`, the new witness's
  header cited pre-fix line numbers in present tense; F3 `prose`, a banned
  word in the new live cell. Round 2 (fast): CLEAN, two non-blocking residuals
  (recorded below). Polish round: one false doc-comment clause ("never a
  grandchild's bytes" — the probe does read them, and discards them unparsed)
  and the spec precedence clause; verified by gate-diff as comment/prose only,
  so no confirmation review round was dispatched.
- Verification: SOLID. (i) Three targeted neutralisations, each restored
  byte-exact and blob-hash verified against the pre-edit working-tree hash
  (`7ae14f89b9e27f628217666f987ba4a6e66e8333`), never against HEAD: reverting
  the stub to its unconditional form reds cells (A), (C), (D2), (D3); dropping
  `theta/load/unresolvable-theta-path` from the return filter reds the same
  four; removing the read-before-containment skip reds (D2) with the exact
  double-report signature (`invoke-path-escape` and `callee-has-errors`
  co-located at the caller). (ii) Full default suite green, with bug 0267's
  ten cells, bug 0248's lockstep (D3)/(D5), bug 0264's note-count witness and
  bug 0111's containment witness all green and their assertions byte-unchanged.
  (iii) Live coverage: the H8a cell was run green under the shared live lock by
  the orchestrator; the verifier audited it statically (real `ExtensionRunner`,
  registration read off the real runner, the `theta-system-note` channel read
  off the settled `SessionManager`, a task-framed arithmetic discriminator,
  `failLoudly` on a missing provider, the harness's child pins) and found no
  gap. (iv) Typecheck and lint clean.
- Residuals:
  1. The prompt-mode grandchild route stays a WITHHOLD, by §Non-goals and
     §Fix constraint 4: the stub reports `subagent` unconditionally, so a
     callee whose own `tools:` names an EXISTING prompt-mode `.theta` still
     leaves its caller registering. That is the separately filed depth-two
     report, which reuses this fix's pre-resolution mechanism and adds only
     its own code to the return filter (§Fix constraint 8, this side of the
     order).
  2. The remaining withholds are enumerated in the helper's doc-comment rather
     than tested: a grandchild that exists and reads but fails its OWN parse
     or structural checks (cell (E) pins the caller still registering, so an
     over-refusal reds), its declared mode, and its own `tools:` entries.
     The non-recursion bound is unchanged.
  3. Citation debt into `src/extension/production-composition.ts` is unchanged
     and remains large: this diff shifted lines again, and the sweep found the
     other citing test files already stale before this fix (verified against
     `git show HEAD:`). Only the two files this diff shifted from correct to
     stale were re-derived. `src/extension/production-composition.ts:2282`
     still cites `code-registry-load.md:35` for
     `theta/load/invoke-path-escape`, whose row sits at line 36 — pre-existing,
     left untouched rather than dressed as fresh work.
  4. §Reproduction's row B understates the registered set: the grandchild,
     planted on the same discovery source, registers in its own right, so the
     healthy row registers three names, not two. The row-A closure hash
     `sha256:ba48f401…` is specific to the filing probe's fixture bytes; the
     landed witness asserts the entry shape and `sha256:` form instead of a
     literal digest.
  5. §Non-goals and §Fix constraint 8 cite the depth-two report as
     `./0271-callee-tools-prompt-mode-grandchild-caller-still-registers.md`;
     the filed document is
     `./0271-prompt-grandchild-callee-drop-invisible-at-depth-two.md`.
     Citation debt only — recorded here rather than rewritten, per the
     non-rewriting rule for `docs/bugs/**`.
- Discharge notes appended:
  `docs/bugs/0267-prompt-caller-registers-over-dropped-subagent-callee.md` —
  a dated note recording that its withhold 3 / Residual 1 is closed here.
- Pinned dispositions / non-goals: the `invoke(...)` literal surface keeps its
  WARNING severity (only its dispatch outcome moves, which §Fix constraint 5
  mandates); the callee's own registration decision is unchanged in every row;
  bug 0248's entry-grammar rejections stay outside the return filter; bug
  0264's note counts and bug 0111's containment reporting are byte-preserved
  except where the read now owns an unreadable entry, which cells (D2)/(D3)
  pin; `tests/fixtures/h7a/permitted-codes.json` is byte-unchanged (no new
  code was minted, so a real H9a run had nothing to decide).

## Coordination note (0.270.0) — cell (E) / the non-recursion-bound withhold flipped

This report's witness
(`tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts`)
cell (E) pinned a WITHHOLD: a grandchild that exists but carries its own
errors left the `tools:` caller registering, because the stub
`resolveThetaCallee` this report introduced answered every `.theta` entry with
a fixed, non-recursive shape. [Bug
0271](./0271-prompt-grandchild-callee-drop-invisible-at-depth-two.md) closes
that withhold at 0.270.0: `calleeFailsOwnStructuralChecks` now recurses one
level into a `.theta` entry in the callee's own `tools:`, under an explicit
visited-set bound keyed by resolved absolute path, so a grandchild that fails
its own structural checks now reaches the caller through the existing
`theta/load/callee-has-errors` row this report's fix reused. Cell (E) is
flipped under bug 0271's doc authority to assert the new contract
(`pass.registered` empty, `theta/load/callee-has-errors` located at the
caller); the other six cells in this file are unchanged. This report's
existence/readability probe and its `readable` map are unchanged and are
reused, not duplicated, by bug 0271's recursion.
