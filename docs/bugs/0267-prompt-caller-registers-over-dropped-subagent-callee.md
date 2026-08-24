# Bug 0267 — A prompt-mode caller's `tools:` `.theta` entry registers over a subagent-mode callee the same load pass un-registers: `parseCalleeForTools` derives `hasErrors` from the callee's `parseThetaDocument` diagnostics alone (`production-composition.ts:2013`), so every drop route that runs AFTER the parse in `runComposePass` — the `.thetalib` import checks, the callee's own `tools:` resolution, and the remaining post-parse gates — is invisible to the V15f `callee-has-errors` loop, and the caller mints a `.theta` callable, with a load-time closure hash, for a file that will not run

- **Status:** fixed (0.264.0).
- **Sev/Diff estimate:** S3/D2 — S3 because load-time silence converts an
  author error into a drive-time failure: the caller registers, the callee does
  not, and the author's only load-time signal is a row citing the callee (or
  its library), never a row at the caller's `tools:` site, so the callable is
  offered to code and model alike. Confirmed at S3 from the measurements below
  rather than seeded: the divergence is not one fixture but five distinct drop
  routes (two `.thetalib` routes, the IMP-1 route, the unknown-symbol route,
  and the callee's own `tools:` route), and the caller-side observable is
  identical to the healthy control — same callable, same `kind`/`mode`, a
  closure hash over the broken bytes. Not S2: no wrong value is produced and no
  isolation boundary moves; the failure is late, not silent-and-wrong. D2
  because the seam is one predicate in one function, but the fix must decide
  what "its own structural checks" means operationally at a point in
  `parseCalleeForTools` that runs BEFORE the caller's own post-parse gates, and
  every route it admits changes a registration outcome, so the witness set and
  the permitted-code decision are the work, not the edit.
- **Kind:** defect — implementation diverges from documented behaviour.
  `invocation.md:22` states the rule the implementation half-applies: a callee
  that "fails its own structural checks is *not statically resolvable*", and on
  the `tools:` surface the consequence is error severity — "the callable cannot
  be created, and the parent theta does not register". The code exists
  (`checkCalleeHasErrors`, the V15f loop at
  `src/extension/production-composition.ts:1747–1759`); its input predicate is
  narrower than the spec's subject.
- **Affected** (every citation re-derived at HEAD `b2491a8d`, v0.262.0;
  `src/extension/production-composition.ts` is 2943 lines at HEAD and was
  reshaped by bug [0264](./0264-thetalib-reparse-walks-reemit-lex-rows-per-walk.md)
  in 0.261.0 — these lines are read off the current bytes):
  - `src/extension/production-composition.ts:2013` — `parseCalleeForTools`
    returns `hasErrors: hasLoadParseError(document.diagnostics)`, where
    `document` is the `parseViaPassCache` result for the callee file alone. The
    seam.
  - `src/extension/production-composition.ts:1747–1759` — the V15f
    callee-has-errors loop inside `resolveThetaToolsAtLoad` (`:1644`), gated on
    `callee.hasErrors`. It is the only site that can un-register the caller for
    a callee's condition.
  - `src/extension/production-composition.ts:2388–2395` — `hasLoadParseError`,
    which tests only error-severity `theta/load/*` / `theta/parse/*` rows
    already present on the parsed document.
  - `src/extension/production-composition.ts:925–938` — `runComposePass`'s
    import check: `checkThetaImports` runs per discovered theta and its
    error-severity rows `continue` past registration. This is the callee's drop
    site for the `.thetalib` routes; it runs on the callee only when the callee
    is itself discovered, and never as part of the caller's `tools:` scan.
  - `src/extension/production-composition.ts:813–831` — the caller's own
    `resolveThetaToolsAtLoad` call and its error-severity `continue`; the
    callee's own `tools:` resolution reached through this path is
    `parseCalleeForTools`, not a second `resolveThetaToolsAtLoad`, so the
    callee's `theta/load/unknown-tool` never reaches the caller's decision.
  - `src/extension/production-composition.ts:2246–2271` — `parseCalleeTheta`,
    the H8b dispatch parse wired as `parseCallee` at `:747`. Its gate
    (`:2269`) is the same `document.frontmatter === null ||
    hasLoadParseError(document.diagnostics)` test, so the drive-time re-check
    inherits the identical blind spot and returns a runnable input.
  - `src/extension/production-theta-producer.ts:3664–3672` — `#driveCallee`'s
    `Err(InvokeInfraError{cause:"load_failure"})` arm, taken only when
    `parseCallee` returns `undefined`.
  - `src/extension/import-static-checks.ts:317` — `checkThetaImports`, whose
    diagnostics are the callee's un-registration input and are computed from a
    walk `parseCalleeForTools` does not perform.
  - `docs/spec_topics/invocation.md:20` (`#static-resolution`) and `:22` — the
    static-resolution walk and the per-surface severity rule.
  - `docs/spec_topics/diagnostics/code-registry-load.md:42` —
    `theta/load/callee-has-errors`, whose *Trigger* names a callee that "failed
    to parse, lower, or pass its own structural checks during the parent's
    per-load-pass static-resolution walk".
  - `docs/spec_topics/imports.md:23` — IMP-1: an unresolvable `.thetalib`
    import emits `theta/load/unresolvable-thetalib-path` "against the importing
    file" and "does not register that file".
  - `docs/spec_topics/frontmatter/frontmatter-fields-a.md:74` — `tools`
    declares the callable set exposed "to both code and model".
  - `tests/thetalib-reparse-walk-single-delivery.test.ts:514–544` — bug 0264's
    landed fixture (C), which pins `pass.registered` (`:536–538`) to
    `["b0264caller"]` over
    exactly this shape. The pin is correct as a non-regression statement about
    0264; this report is the claim that the pinned value is wrong.
- **Observed at:** HEAD `b2491a8d`, v0.262.0, `main`, by one offline
  provider-free scratch probe driving `composeExtensionInstance` over host
  doubles (token `b0267scratch`, removed after measurement).

## Summary

A `tools:` `.theta` entry naming a subagent-mode callee registers the caller
whenever the callee's error is found by any check that runs after the callee's
own `parseThetaDocument`. The caller's scan
(`parseCalleeForTools` → `hasErrors`) reads the callee's parse-document
diagnostics and nothing else, so it sees a clean file; the callee's real
verdict is produced later in `runComposePass`, on the callee's own iteration,
by the import checks and the callee's own `tools:` resolution — checks the
caller's scan never runs. The result at load: the caller registers, the callee
does not, no diagnostic is located at the caller's `tools:` site, and the
frozen callable-set entry carries a `closureHash` computed over bytes that
un-register.

Measured over five drop routes. The control — a healthy callee — is
indistinguishable from the defect on every caller-side observable.

## Reproduction

Plant the files under `<cwd>/.pi/theta/` with a `{}` `.pi/settings.json`, then
run `composeExtensionInstance(pi, ctx, undefined, new RendererGate())` over
host doubles (`ctx.cwd` = the workspace), reading `wiring.thetas` for the
registration decision and each theta's frozen `callableSet.entries` for the
tool list. The caller is
`---\nmode: prompt\ntools:\n  - ./callee.theta as callee\n---\n@`hi`\n` in
every row; the callee is subagent-mode.

| # | callee condition | caller registers | caller's callable list | callee registers | diagnostic sites | drive outcome |
|---|---|---|---|---|---|---|
| 1 | imports a `.thetalib` carrying a lex + parse error | **yes** | `callee → {kind: theta, mode: subagent, calleePath: ./callee.theta, closureHash: sha256:…}` | no | the library file only (`theta/parse/unterminated-template`, `theta/parse/unsupported-feature`) | dispatch parse accepts; no `load_failure` |
| 2 | imports a `.thetalib` that does not exist (IMP-1) | **yes** | same shape, hash over the broken bytes | no | the CALLEE file (`theta/load/unresolvable-thetalib-path`) | dispatch parse accepts |
| 3 | imports a symbol the library does not export | **yes** | same shape | no | the CALLEE file (`theta/parse/import-unknown-symbol`) | dispatch parse accepts |
| 4 | its own `tools:` names an unknown Pi tool | **yes** | same shape | no | the CALLEE file (`theta/load/unknown-tool`) | dispatch parse accepts; callee's own `tools:` collapse to the EMPTY snapshot |
| 5 | control A — the callee's OWN body carries an unterminated template | no | — (caller un-registers) | no | callee rows plus `theta/load/callee-has-errors` at the CALLER (`caller.theta:1:1`) | not reached |
| 6 | control B — healthy callee, healthy library | yes | same shape as rows 1–4 | yes | none | runs |

Rows 1–4 are the defect: the caller's registration and callable entry are
byte-identical in shape to control B (row 6) while the callee is in the state
of control A (row 5). Row 5 is the only condition the V15f loop detects,
because it is the only one whose rows land on the callee's own parse document.

Seam measurement, taken directly rather than through the pass: for the row-1
callee, `parseThetaDocument(callee)` returns `diagnostics: []`, while
`checkThetaImports` over the same parsed input returns two error-severity rows.
`hasLoadParseError([])` is `false`, so `hasErrors` is `false` and the V15f loop
has no subject.

Drive column: `parseCalleeTheta` (`:2269`) applies the same
`hasLoadParseError(document.diagnostics)` gate, so it returns a runnable input
for rows 1–4 and `#driveCallee`'s `load_failure` arm is not taken. The terminal
outcome the caller observes past that point is not offline-determined here — it
depends on the spawned child's own compose pass, which drops the same file (row
1's condition measured standalone: nothing registers). The permitted terminal
code is left to the fix's real-run decision (§Fix).

## Expected behaviour

`invocation.md:22`: a callee that "fails its own structural checks is *not
statically resolvable*", and on the `tools:` surface the parent's disposition
is error — "the callable cannot be created, and the parent theta does not
register". The sentence's next clause anticipates precisely rows 1–4: "The
callee, when later loaded as its own slash command, fails to register on its
own merits" — the cross-reference at the parent is what the parent owes.

`code-registry-load.md:42` states the same Trigger for
`theta/load/callee-has-errors` and adds the walk it is judged in: "during the
parent's per-load-pass static-resolution walk". `invocation.md:20` defines that
walk as transitive over the callee's own `invoke` paths and `tools:` entries;
it does not enumerate the callee's `.thetalib` imports, which is the spec-side
gap the fix must close or record.

`imports.md:23` (IMP-1) settles the callee's own side: the importing file "does
not register". Two registration decisions over the same file in one pass must
agree; rows 1–4 are the disagreement.

The ERR-6 mapping needs no widening: `theta/load/callee-has-errors` is already
in `preEvalCauseOf`'s `tools-resolution` batch
(`src/extension/production-composition.ts:316`), so a fix that reuses the
existing row is ERR-6-classified as landed.

## Actual behaviour / root cause

`resolveThetaToolsAtLoad` (`:1644`) pre-parses each distinct `.theta` callee
through `parseCalleeForTools` (`:1934`) and stores a `CalleeParse` whose
`hasErrors` field is `hasLoadParseError(document.diagnostics)` (`:2013`). That
document is the callee file's own `parseViaPassCache` result: frontmatter
validations, body parse, and the V-slice parse checkers. It is not the callee's
registration verdict. The verdict is assembled later, in `runComposePass`'s
per-theta loop, from checks that each own their own `continue`: the
extension-tool reachability gate, the invoke static checks, the `subagent fn`
checks and model overrides, the binder-model resolution, and — for rows 1–3 —
`checkThetaImports` (`:925–938`). For row 4 the verdict comes from the callee's
own `resolveThetaToolsAtLoad`, which the caller's scan replaces with
`parseCalleeForTools`, a projection that reads mode, existence, containment and
nested containment only.

The V15f loop (`:1747–1759`) then finds `hasErrors === false`, emits nothing,
and `resolveCallableSet` mints the callable. `attachLoadTimeClosureHashes` runs
afterwards and stamps a closure hash over the callee's transitive bytes, so the
registered entry is fully formed over a file that will not load.

The same predicate is repeated at the dispatch parse (`parseCalleeTheta`,
`:2269`), so the runtime backstop that would convert the load-time miss into an
`Err(InvokeInfraError{cause:"load_failure"})` does not fire either: one
predicate, two sites, one blind spot.

Row 4 has an extra consequence at the dispatch parse: `parseCalleeTheta` calls
`resolveThetaToolsAtLoad` on the callee (`:2296`) and keeps only
`toolResult.callableSet`, which is `undefined` when the resolution errored, so
the callee is composed with `EMPTY_CALLABLE_SET` — a child running with a
callable set its own frontmatter did not declare.

## Why it matters

- The author's load-time report names the library or the callee, never the
  caller. Nothing tells the author that the caller's `tools:` entry is dead;
  `theta/load/callee-has-errors` exists for exactly that message and does not
  fire.
- The registered callable is offered to the model as a tool
  (`frontmatter-fields-a.md:74`), so the failure surfaces inside a model turn,
  at a point where the caller has already spent tokens.
- Two decisions over one file disagree in one pass: the callee un-registers
  (IMP-1) while the caller registers a callable naming it.
- The stored closure hash (RFC-0005 `#subagent-theta-callable-hash`) is
  computed over bytes that do not load, so the hash-divergence mechanism is
  seeded with a value that can never be honoured.

## Non-goals

- Bug [0264](./0264-thetalib-reparse-walks-reemit-lex-rows-per-walk.md)'s
  landed per-pass parse cache and its note-count dedup. This report changes no
  note count and does not reopen that fix; it re-reads the same seam for the
  registration decision 0264 explicitly left unchanged.
- The path-separator spelling divergence between the walks (a normalised
  spelling from one walk, a Win32 spelling from another for the same file).
  That is 0264's recorded observation and is filed as
  [0268](./0268-load-notes-render-same-file-with-mixed-path-separators.md).
- Widening the drop-route set the CALLEE itself is judged by. The callee's own
  registration is correct in every row above.
- The `invoke(...)` surface's warning severity (`invocation.md:22`). Only the
  `tools:` surface is in scope.

## Fix

Route not settled here; the constraints are.

1. No silent registration over a dropped callee. For every condition that
   un-registers the callee in the same pass, the caller's load must either
   refuse registration or carry an error-severity diagnostic located at the
   caller's `tools:` site. A pass in which the callee un-registers and the
   caller registers with no caller-located row is the defect and must red.
2. Prefer the existing registry row. `theta/load/callee-has-errors`
   (`code-registry-load.md:42`) already names this subject on this surface with
   this severity and is already ERR-6-classified
   (`production-composition.ts:316`). A new code needs a registry row, a
   `preEvalCauseOf` arm and an FN-7 list entry, and must be justified against
   the existing row's Trigger before it is minted.
3. One predicate, both sites. Whatever widens `parseCalleeForTools`'s
   `hasErrors` must be applied to `parseCalleeTheta`'s dispatch gate (`:2269`)
   in the same change, or the load-time and drive-time verdicts diverge again
   in the opposite direction.
4. Scope the widened check explicitly. The callee's post-parse checks are not
   all reachable from a `tools:` scan at the point `parseCalleeForTools` runs
   (the invoke graph is built later; the executable probe is per-pass). The fix
   states which routes it admits and records the rest, rather than implying
   completeness.
5. Route open: refusal at load (the caller does not register) versus registered
   with a caller-located diagnostic. Constraint 1 admits both; `invocation.md:22`
   reads as refusal for the `tools:` surface, and the fix adjudicates against
   that sentence rather than around it.
6. The permitted terminal codes for a drive that still reaches dispatch are
   settled by a real run, not by derivation. The offline evidence above
   establishes only that `load_failure` is not taken today.
7. `tests/thetalib-reparse-walk-single-delivery.test.ts:536–538` pins
   `pass.registered` to `["b0264caller"]` for the row-1 shape. A fix taking the
   refusal route moves that pin; the move is this report's subject and must be
   made deliberately, with 0264's note-count assertions in the same file left
   intact.

## Provenance

Bug 0264's fix record (`.pi/tmp/fixes/0264-report.md`, residual 1) and
`docs/bugs/0264-thetalib-reparse-walks-reemit-lex-rows-per-walk.md` §Actual
record observation (C) — "a prompt-mode caller registering over a dropped
subagent callee" — as an observation left unchased and marked filing material.
Sixteenth set. Filed at HEAD `b2491a8d`, v0.262.0, from an offline
`composeExtensionInstance` probe over the six conditions tabulated in
§Reproduction plus a direct `parseThetaDocument` / `checkThetaImports` seam
measurement.

## Fix (0.264.0)

- What shipped:
  - `src/extension/production-composition.ts` — new
    `calleeFailsOwnStructuralChecks`, which answers whether an
    already-parsed callee fails a check that runs AFTER its own
    `parseThetaDocument`; `parseCalleeForTools`'s `hasErrors` is now
    `hasLoadParseError(document.diagnostics) || calleeFailsOwnStructuralChecks(…)`
    (§Fix constraints 1, 2, 5), and `parseCalleeTheta`'s dispatch gate applies
    the same predicate (§Fix constraint 3). `ctx` and the `getAllTools`
    snapshot are threaded to the pre-parse callee-cache loop, which is what the
    second condition needs.
  - `src/extension/import-static-checks.ts` — `checkThetaImports` gained an
    opt-out `claimDelivery?: boolean` (default `true`, so every pre-existing
    call site is behaviourally byte-equivalent). The new observing walk passes
    `false` and skips `claimUndelivered` entirely, because that call MUTATES
    bug 0264's pass-scoped delivered-set: claiming on behalf of a caller that
    never puts the rows on the channel would starve the callee's own
    `runComposePass` iteration of them and move a delivery count.
  - `docs/spec_topics/invocation.md` §Static resolution and its mirror in
    `docs/reference/discovery-cli.md` — the transitive walk's
    own-structural-checks judgment is now stated to cover a callee's own
    `.thetalib` import resolution and the resolvability of the Pi tool names
    its own `tools:` declares, closing the spec-side gap §Expected behaviour
    named. `code-registry-load.md`'s `theta/load/callee-has-errors` row is
    BYTE-UNCHANGED: its Trigger already reads "failed to parse, lower, or pass
    its own structural checks", so this is no Trigger widening. No new code was
    minted; the row is already ERR-6-classified in `preEvalCauseOf`.
  - `tests/thetalib-reparse-walk-single-delivery.test.ts` — cell (C)'s
    `pass.registered` pin moved from `["b0264caller"]` to `[]` under §Fix
    constraint 7's enumerated authority. Bug 0264's note-count assertions in
    that file are byte-preserved.
  - `tests/arg-mismatch-diagnostic-count-by-surface.test.ts` — the two
    `hasLoadParseError` citations this diff genuinely shifted (`2388` → `2549`),
    the only citations into `production-composition.ts` that were accurate
    before this change.

- Route, adjudicated on the record (§Fix constraint 5 left it open). REFUSAL AT
  LOAD, reusing the existing row rather than a registered-with-diagnostic
  posture. `invocation.md` §Static resolution is explicit for this surface — "a
  `tools:` `.theta` entry pointing at an unparseable callee is **error** — the
  callable cannot be created, and the parent theta does not register" — and the
  V15f loop already implements refusal WITH a caller-located row, so widening
  its input satisfies both limbs of §Fix constraint 1 at once and satisfies
  §Fix constraint 2 without minting a code.

- Scope admitted (§Fix constraint 4), and what is withheld. Admitted:
  §Reproduction rows 1-3 (the callee's own `.thetalib` import resolution) and
  row 4 (`theta/load/unknown-tool` from the callee's own `tools:`). Withheld,
  deliberately, each recorded in the helper's doc-comment:
  1. the callee's extension-tool reachability gate, its `invoke` static checks,
     its `subagent fn` checks and `subagent fn` model overrides, and its
     `model:` / binder-model resolution — each needs a pass-scoped input (the
     executable probe, the invoke graph, the shared `modelMatcher`) that is not
     in hand where the caller's `tools:` scan runs;
  2. the callee's own `tools:` ENTRY-GRAMMAR rejections
     (`theta/load/malformed-tool-entry` and siblings) — bug 0248 cells (D3) and
     (D5) pin exactly that caller as registering, and that pin is a lock this
     report carries no authority over;
  3. a `.theta` entry in the callee's OWN `tools:` that resolves to no file, or
     to a prompt-mode callee. The nested resolution is non-recursive by
     construction — a `tools:` cycle A↔B would not terminate otherwise, and
     `checkNestedToolsContainment` refuses full nested resolution at the same
     depth for the same reason (bug 0111) — so the stub `resolveThetaCallee`
     never returns `undefined` and never reports `prompt`. The stub is
     conservative: every divergence from the real resolution is a WITHHOLD, so
     it can never manufacture a refusal.

- Gates (all run by the orchestrator on the final tree,
  `git hash-object src/extension/production-composition.ts` =
  `af241428cb7367904adc5963570910f789e6d35c`):
  - witness — `npx vitest run tests/callee-post-parse-errors-un-register-tools-caller.test.ts`
    → `Test Files 1 passed (1)`, `Tests 10 passed (10)`;
  - full default suite — `npm test` → `Test Files 440 passed (440)`,
    `Tests 9216 passed (9216)`;
  - `npm run typecheck` → `tsc -p tsconfig.json --noEmit`, clean;
  - `npm run lint` → `eslint … "src/**/*.ts"`, clean;
  - citation gate — `npx vitest run tests/citation-symbol-form-gate.test.ts`
    → 3 passed, residual pin still 415, not raised;
  - line stability — `wc -l docs/spec_topics/invocation.md
    docs/reference/discovery-cli.md` → 89 / 285, unchanged, so no document or
    test citing `invocation.md` by line was disturbed;
  - live — `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/b0267live-callee-post-parse-errors-un-register-tools-caller-live-cell.test.ts`
    → `Test Files 1 passed (1)`, `Tests 1 passed (1)`, 3315 ms, RC=0, run under
    the global live lock by the orchestrator (reviewers and verifiers never run
    live).

- Review: 2 rounds, plus one pre-review correction round.
  - Correction round (not a review round; citation/comment-only). The
    implementer had also mechanically shifted `production-composition.ts` line
    citations in 19 further test files. Every shifted number except the
    `arg-mismatch` pair was measured against
    `git show HEAD:src/extension/production-composition.ts` and found ALREADY
    STALE at the fork (`2045`, `2047`, `2070`, `2079`, `2092`, `2094`, `2214`,
    `2220`, `2261`, `2342`, `2360`, `2448`, `2728` all point at unrelated
    content), so shifting them would have dressed stale citations as fresh. The
    19 files were restored BYTE-EXACT (`git hash-object` equal to
    `git rev-parse HEAD:<path>` for each). Repo precedent for the narrow scope:
    bug 0264's own commit reshaped the same file and updated exactly the one
    accurate test file, and citation debt is repaired by a separate dedicated
    campaign commit.
  - Round 1 (deep) — FINDINGS, two blockers. (F1, spec) the added normative
    sentence claimed coverage of "the resolvability of the callables its own
    `tools:` declares", which reads onto `.theta` path entries the
    implementation withholds; narrowed in both documents to the Pi tool names.
    (F2, test) the dispatch-gate half was unwitnessed — deleting it red nothing
    — and §Fix constraint 6 was undischarged; both closed below. Residuals:
    the witness header's pre-fix seam description (fixed), and bug 0248 (D3)'s
    now-historical assertion-message clause (recorded, file untouched).
  - Round 2 (fast) — CLEAN. Verified the narrowed prose against what the helper
    admits, that cells (7)-(9) reach the dispatch gate through the
    `invoke(...)`-literal surface (whose caller has no `tools:` and therefore
    cannot be witnessed by the load-time refusal), that cell (9)'s control
    channel is proven live in-cell, and that no fixture token leaked between
    the offline and live files.

- Verification: SOLID.
  - The witnesses genuinely witness the bug — two independent neutralisations.
    Dropping `|| failsPostParseChecks` from `parseCalleeForTools` reds offline
    cells 1-4 AND bug 0264's cell (C) (`expected [ 'b0264caller' ] to deeply
    equal []`); deleting the `parseCalleeTheta` gate block reds cells 7, 8, 9.
    Both restored byte-exact, `git hash-object` returning
    `af241428cb7367904adc5963570910f789e6d35c` before and after each.
  - Full default suite green: 440 files / 9216 tests, zero failures.
  - Live coverage exercises the fixed path in all three halves, read-verified
    non-vacuous: every absence claim is preceded by a `failLoudly` precondition
    (an unrelated control theta must register; the note channel must be
    non-empty; the callee's own drop-route row must be present), the healthy
    control drives a real task-framed arithmetic turn observed on the
    deterministic `userTexts` channel, and half (c) matches the terminal note
    on all three of stem, callee path and `failed (load_failure)`.
  - Lint and typecheck pass.
  - Named locks intact: bug 0264's note counts (byte-preserved, 4/4 green),
    bug 0255's witness, bug 0013's severity split, bug 0253's lockstep witness,
    and bug 0248's containment cells (D3)/(D5) (32 tests green, file untouched).

- §Fix constraint 6, discharged by a real run rather than by derivation. The
  `tools:` surface no longer reaches dispatch at all — the caller does not
  register. The surface that still does is the `invoke(...)` literal, which
  `invocation.md` §Static resolution keeps at warning severity. Measured:
  before this fix that drive ended `subagent_model_unresolved`; after it, and
  in the live run, it ends `theta /<caller> returned Err: invoke of
  ./<callee>.theta failed (load_failure)` — the `#driveCallee` arm §Affected
  named as not taken today. `theta/load/callee-has-errors` is byte-unchanged in
  the registry and drew no permitted-codes movement.

- Residuals:
  1. A callee whose own `tools:` names a `.theta` path that resolves to no file
     still un-registers while its caller registers with no caller-located row —
     the §Fix-constraint-1 shape on a route this fix withholds by the
     non-recursion argument above. Measured during review with a scratch probe:
     the callee drew `theta/load/unresolvable-theta-path` and the caller
     remained in the registered set. Filing material; not covered by this
     report's enumerated authority, and the normative sentence added here was
     narrowed so that it does not claim it.
  2. The same shape for a prompt-mode grandchild callee
     (`theta/load/prompt-mode-callable` at the callee, caller registers).
     Measured in the same probe. Filing material.
  3. The callee's own `tools:` entry-grammar rejections remain unadmitted, held
     by bug 0248 cells (D3)/(D5). Moving that would need an enumerated
     authority over 0248's pins that no open report currently carries.
  4. `tests/tools-entry-grammar-derivations-lockstep.test.ts` cell (D3)'s
     assertion-message clause — "which `parseCalleeForTools`' `hasErrors`
     input … cannot see for an entry-grammar rejection" — is now historical:
     the predicate does read `resolveCallableSet`'s output and excludes the
     entry-grammar codes by an explicit filter. The pinned behaviour is
     unchanged and the file is a lock, so the clause is left byte-untouched as
     citation debt for that lock's owner.
  5. Citation debt into `src/extension/production-composition.ts` is unchanged
     by this fix and remains large: this diff shifts lines again, and the 19
     test files restored in the correction round carry citations that were
     already stale before it. Neither that file nor `import-static-checks.ts`
     is in the `tests/citation-symbol-form-gate.test.ts` ratchet, so the sweep
     is that ratchet's campaign, not this fix's.

- Discharge notes appended:
  `docs/bugs/0264-thetalib-reparse-walks-reemit-lex-rows-per-walk.md` — a dated
  coordination note recording the cell (C) pin move, its authority, and that
  0264's own note-count subject is byte-preserved.

- Pinned dispositions / non-goals: bug 0268's path-separator spelling is
  untouched — the witnesses separator-normalise before comparing, exactly as
  the landed cells do, and assert nothing about the spelling. The `invoke(...)`
  surface's WARNING severity is unchanged (§Non-goals); only its dispatch
  outcome moves, which §Fix constraint 3 mandates. The callee's own
  registration decision is unchanged in every row.
