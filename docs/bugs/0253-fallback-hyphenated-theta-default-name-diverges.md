# Bug 0253 — The producer's snapshot-absent fallback derives a hyphenated `.theta` entry's default callable name without the hyphen→underscore remap the spec states: for `tools: - ./code-review.theta` the fallback presents `code-review` while the resolver (`thetaDefaultName`), the parse gate (`toolCallableName`) and `frontmatter-fields-a.md:84` all derive `code_review`, so a fixture-borne theta's arm-4 callable registry holds a name the parse gate never derives and the same entry's callee-path lookup misses

- **Status:** fixed (0.222.0).
- **Sev/Diff estimate:** S2/D1 — S2 because two shipped components disagree on
  the callable name of a well-formed entry, with two measured consequences (the
  bug-0016 dispatch belt is silent on a shadowed call the parse gate rejects,
  and `thetaCalleePath`'s fallback resolves no callee path for the entry), but
  the divergent arm is reached only by thetas carrying no callable-set snapshot,
  which the production load path never produces
  (`src/extension/production-composition.ts:1786`). D1 because the remedy is one
  derivation site in `src/extension/production-theta-producer.ts` routed to the
  resolver's existing function, with no spec edit and a witness that already
  pins both directions.
- **Kind:** defect — implementation. The spec sentence exists and names the
  underscore answer (`docs/spec_topics/frontmatter/frontmatter-fields-a.md:84`,
  mirrored at `docs/reference/frontmatter.md:168`); two of the three readers
  implement it and the third does not.
- **Related:**
  - [0107](./0107-tools-lockstep-witness-is-source-shape-gate.md) — **fixed
    (0.219.0)**, the filing origin. Its `## Fix (0.219.0)` §Residuals item 1
    records this divergence as "recorded, not closed — … deliberately out of
    this run's scope, which is tests-only", and states the closing sequence:
    "Whoever closes it flips (D4) to `belt-fired`, moves it into (D3), and
    updates the file header's PINNED DIVERGENCE paragraph". This report is that
    filing. 0107 also landed the witness that pins the current state, cell (D4)
    (`tests/tools-entry-closed-grammar-lockstep.test.ts:466–509`).
  - [0069](./0069-tools-entry-residue-silently-dropped.md) — **fixed (0.62.0)**,
    which closed the *grammar* half of the same lock-step (the fallback
    delegates entry parsing to the exported `parseToolsEntry`,
    `src/parser/callable-set.ts:362`). The *derivation* half — what name a
    well-formed `.theta` spec maps to — was never routed to the shared
    function, and is this report's subject.
  - [0106](./0106-tools-entry-grammar-derivations-outside-lockstep.md) —
    **fixed (0.216.0)**, the parse-gate-side derivations
    (`toolCallableName`, `piToolCallableName`, `toolsEntrySpec`). Its landed
    witness `tests/tools-entry-grammar-derivations-lockstep.test.ts` pins the
    parse gate against the resolver and never reaches the producer fallback, so
    it neither covers nor blocks this fix.
  - **Ordering:** no report blocks this one, and this one blocks none. The fix
    edits `src/extension/production-theta-producer.ts` and
    `tests/tools-entry-closed-grammar-lockstep.test.ts`; any concurrent change
    to that witness file rebases on whichever lands first.
- **Affected** (every citation verified at HEAD `b9cf2f26`, 0.219.0):
  - `src/extension/production-theta-producer.ts:714–717` — **the divergent
    derivation.** `thetaCallableName`: it normalises `\` to `/`, takes the
    basename and strips a trailing `.theta`. It does not map hyphens to
    underscores. Two call sites, both in snapshot-absent fallback arms: `:4230`
    and `:4160`.
  - `src/extension/production-theta-producer.ts:4214–4235` —
    `presentedCallableNames`, module-private. `:4215–4218` is the snapshot arm
    (the frozen snapshot's keys are the presented names); `:4219–4234` the
    snapshot-absent fallback; `:4221` the `parseToolsEntry` delegation; `:4226`
    the rename arm; `:4229–4231` the default-name derivation, which calls
    `thetaCallableName` for a non-identifier spec. Its doc comment `:4201` calls
    the returned names "post-`as` / post-hyphen→underscore", which the fallback
    arm does not satisfy.
  - `src/extension/production-theta-producer.ts:4149–4161` — `thetaCalleePath`,
    the second consumer of the same derivation. The snapshot arm keys the
    frozen set by the presented name (`:4155`); the fallback (`:4158–4160`)
    matches `thetaCallableName(entry) === calleeName` against
    `frontmatter.tools`. Its doc comment `:4134–4139` states that the
    pre-snapshot basename match "dropped renamed (`./c.theta as foo`) and
    hyphenated (`./my-tool.theta` → `my_tool`) callees"; the fallback still is
    that match.
  - `src/parser/callable-set.ts:442–446` — `thetaDefaultName`, the resolver's
    derivation: basename, `.theta` stripped, `stem.replace(/-/g, "_")`. Module-
    private (no `export` at HEAD). `:437–441` is its doc comment, which quotes
    the spec rule and the `./code-review.theta` → `code_review` example.
  - `src/parser/theta-document.ts:5677` — `toolCallableName`, the parse gate's
    derivation, which maps hyphens to underscores and therefore agrees with the
    resolver.
  - `docs/spec_topics/frontmatter/frontmatter-fields-a.md:84` — the normative
    sentence: "For a `.theta` path, the default name is the file's basename
    without the `.theta` extension, with **hyphens replaced by underscores**
    (`./code-review.theta` → `code_review`). The remap exists because theta-file
    naming convention favours hyphens while theta identifiers must be
    lowercase-first identifier-shaped." Mirrored at
    `docs/reference/frontmatter.md:168`. The frontmatter-fields pages own this
    rule; the fix needs no spec edit.
  - `tests/tools-entry-closed-grammar-lockstep.test.ts:466–509` — **cell (D4)**,
    the pin. `:492` is the entry `./b0107-code-review.theta`; `:494–500` asserts
    the resolver still answers `["b0107_code_review"]`; `:501–508` asserts the
    belt verdict for a shadowed call of `b0107_code_review` is
    `drive-completed`, i.e. the fallback does not present the spec'd name. The
    cell's comment (`:467–490`) names the pinned state as "WRONG BY THE SPEC"
    and instructs: "flip it to `belt-fired` when the divergence closes and move
    the cell into (D3)". `:80–91` is the file header's PINNED DIVERGENCE
    paragraph, which states the same. `:321–376` is `beltVerdictFor`, the
    harness this report's probe mirrors.
  - `src/runtime/lexical-environment.ts:462–466` — `localShadowsCallable`; its
    first test is `root.callables.has(name)`, which makes arm-4 registry
    membership observable from outside the producer module through the belt
    throw `ShadowedCalleeDispatchDefectError`
    (`src/runtime/tool-call.ts:478`).
  - `src/extension/production-theta-producer.ts:4251–4274` —
    `buildBoundEnvironment`, which installs the presented names as
    `callables: callableNames` (`:4274`).
  - `src/extension/reload-wiring.ts:76–82` — `ParsedTheta.callableSet?`, whose
    absence selects the fallback: "Absent → the runtime falls back to the
    producer-wide resolver (in-memory fixtures) rather than the frozen set."
  - `src/extension/production-composition.ts:1786` — the production load path
    always attaches a snapshot (`result.callableSet ?? EMPTY_CALLABLE_SET`), so
    the divergent arm serves in-memory fixtures and harnesses, not discovered
    thetas.
- **Observed at:** `0.219.0` (HEAD `b9cf2f26`). Offline, deterministic; no live
  model, no provider. Two scratch `vite-node` probes under the gitignored
  `.pi/tmp/`, run and deleted: the real exported `resolveCallableSet`, and the
  real `parseThetaDocument` → `createProductionProducerDeps().bindPromptConversation`
  → `executeBody` over thetas built with **no** `callableSet`, with a
  `resolvePiTool` double resolving any name to the sentinel `AMBIENT-EXECUTED`.
  No file under `src/`, `tests/` or `docs/` was modified during measurement.

## Summary

For the `tools:` entry `./code-review.theta` with no `as` rename, three shipped
readers derive the callable's name. The resolver
(`thetaDefaultName`, `src/parser/callable-set.ts:442–446`) and the parse gate
(`toolCallableName`, `src/parser/theta-document.ts:5677`) derive `code_review`;
the producer's snapshot-absent fallback (`thetaCallableName`,
`src/extension/production-theta-producer.ts:714–717`) derives `code-review`.
`docs/spec_topics/frontmatter/frontmatter-fields-a.md:84` states the rule —
basename, `.theta` stripped, hyphens replaced by underscores — so the fallback
is the non-conforming side.

Two consequences are measured below on a theta carrying no callable-set
snapshot. First, the arm-4 callable registry holds `code-review`, so a local
binding shadowing `code_review` does not trip the bug-0016 dispatch belt, while
the parse gate emits `theta/parse/shadowed-callable-call` for that same source:
the gate rejects a call site the runtime dispatches. Second,
`thetaCalleePath`'s fallback (`:4158–4160`) matches the same derivation against
`frontmatter.tools`, so a call of `code_review` resolves no `.theta` callee path
and falls through to Pi-tool dispatch; with a hyphen-free stem the identical
fixture routes to the theta callee. The derived name is also unspellable: no
theta expression can call `code-review`, so the fallback's presented name is
reachable by no source.

Blast radius is the fixture surface. The production load path attaches a
snapshot to every registered theta
(`src/extension/production-composition.ts:1786`), so discovered thetas take the
snapshot arm and read the resolver's names.

## Reproduction

Offline, at `b9cf2f26`. Both probes drive the real parse and the real production
producer over a `ThetaCompositionInput` with **no** `callableSet`, the shape
`tests/tools-entry-closed-grammar-lockstep.test.ts:321–376` (`beltVerdictFor`)
uses.

### The two names for one entry

Probe 1 resolves `tools: [ "./code-review.theta" ]` through the real
`resolveCallableSet`, then drives a fixture with the same entry, a local
shadowing `code_review`, and a call of it. `belt-fired` means the name is in the
arm-4 registry the fallback populated; `drive-completed` means it is not.

```
@@ RESOLVER   registered=true  names=["code_review"]
@@ FALLBACK   ./code-review.theta + shadow of `code_review`
              drive-completed  value="AMBIENT-EXECUTED"
              parse=["theta/parse/shadowed-callable-call","theta/parse/bare-object-literal"]
@@ CONTROL    ./plain.theta       + shadow of `plain`
              belt-fired
              parse=["theta/parse/shadowed-callable-call","theta/parse/bare-object-literal"]
```

The control shows the observable can fire: for a hyphen-free stem the two
derivations are textually identical and the belt throws. For the hyphenated stem
the belt is silent while the parse gate emits
`theta/parse/shadowed-callable-call` for the same source — the gate derived
`code_review` and the fallback did not.

### The callee-path consequence

Probe 2 drives the same two entries with no shadow, calling the resolver's
derived name directly.

```
@@ ./plain.theta        + `plain({ path: "p" })?`
   outcome=fail    error={"kind":"invoke_infra","message":"invoke callee './plain.theta' could not be loaded",
                          "callee_path":"./plain.theta","cause":"load_failure"}
@@ ./code-review.theta  + `code_review({ path: "p" })?`
   outcome=success value="AMBIENT-EXECUTED"
```

The hyphen-free entry resolves through `thetaCalleePath` to the `.theta` callee
and fails on the fixture's absent file. The hyphenated entry resolves to no
callee path, so the call dispatches through the Pi-tool route and returns the
probe's ambient sentinel. Same entry shape, same call spelling, two routes.

### The pin

```
npx vitest run tests/tools-entry-closed-grammar-lockstep.test.ts
  Test Files  1 passed (1)
       Tests  11 passed (11)
```

Cell (D4) (`:466–509`) is green, which is what pins the divergence: it asserts
`drive-completed` for a shadowed call of the spec'd name and reds when the
fallback starts presenting it.

## Expected behaviour

- **One derivation, the spec'd one.** `frontmatter-fields-a.md:84` states the
  default name for a `.theta` path: basename, `.theta` stripped, hyphens
  replaced by underscores. Every reader of a `tools:` entry answers with that
  name, so the fallback presents `code_review` for `./code-review.theta`.
- **The presented name is spellable.** The rule's own rationale is that "theta
  identifiers must be lowercase-first identifier-shaped"
  (`frontmatter-fields-a.md:84`). A presented name containing a hyphen can be
  named by no call site, so the registry entry it creates is unreachable and the
  entry the source does name is absent.
- **The parse gate and the runtime agree on which call sites are shadowed.** The
  gate rejects a call of `code_review` under a local of that name
  (`theta/parse/shadowed-callable-call`); the bug-0016 belt
  (`src/runtime/lexical-environment.ts:462–466`,
  `src/runtime/tool-call.ts:478`) fires for the same site. Membership in the
  arm-4 registry is what the belt keys on, so it holds the name the gate
  derives.
- **The fallback's callee-path lookup finds a hyphenated callee.**
  `thetaCalleePath`'s doc comment (`:4134–4139`) states that the pre-snapshot
  basename match "dropped renamed … and hyphenated (`./my-tool.theta` →
  `my_tool`) callees" and that the snapshot arm exists to fix that. The
  snapshot-absent arm resolves the same callee.
- **The doc comments are true of the code.** `:4201` and `:4134` describe the
  names they handle as "post-`as` / post-hyphen→underscore".

## Actual behaviour / root cause

`thetaCallableName` (`src/extension/production-theta-producer.ts:714–717`) is a
second implementation of the default-name rule that stops one step early:

```ts
function thetaCallableName(path: string): string {
  const base = path.slice(path.replace(/\\/g, "/").lastIndexOf("/") + 1);
  return base.endsWith(".theta") ? base.slice(0, -".theta".length) : base;
}
```

The resolver's `thetaDefaultName` (`src/parser/callable-set.ts:442–446`)
performs the same two steps and then `stem.replace(/-/g, "_")`. The producer
function is not derived from it and does not call it — `thetaDefaultName` is
module-private, with no `export` at HEAD — so the remap is absent from both
fallback arms that use it: the presented-name list (`:4229–4231`) and the
callee-path match (`:4158–4160`).

Bug 0069's fix removed the fallback's *entry grammar* by exporting
`parseToolsEntry` and calling it (`:4221`), which is why malformed entries now
agree on both sides. The *name derivation* applied to the parsed spec was left
duplicated, so the one input shape where the two implementations differ — a stem
containing a hyphen — still yields two answers. Bug 0107 measured that
divergence and pinned it in cell (D4) rather than closing it, its run being
tests-only.

The divergence is invisible in production because every discovered theta carries
a snapshot (`src/extension/production-composition.ts:1786`) and the snapshot's
keys come from the resolver. It is visible to every in-memory fixture and
harness that builds a `ThetaCompositionInput` without one, which is the shape
the conformance and lock-step suites use.

## Why it matters

- The runtime dispatches a call site the parse gate rejects. The bug-0016 belt
  exists to make that combination impossible; for a hyphenated `.theta` entry in
  a snapshot-absent theta it does not fire, so the gate's guarantee and the
  runtime's behaviour part company on well-formed input.
- The fixture surface is where new runtime behaviour is measured. A harness that
  writes `tools: - ./my-tool.theta` and calls `my_tool` exercises the Pi-tool
  dispatch route instead of the theta-callee route, and nothing reports the
  substitution — the call succeeds against whatever `resolvePiTool` supplies.
- Three components implement one spec sentence, and the count of implementations
  is the standing hazard bugs 0069, 0106 and 0107 each narrowed. This is the
  last measured disagreement between the resolver and the producer fallback.

## Fix

Route the producer's fallback derivation to the resolver's.

1. Export `thetaDefaultName` from `src/parser/callable-set.ts:442`, with its doc
   comment restating that it is the single implementation of
   `frontmatter-fields-a.md:84` — the same export rationale
   `parseToolsEntry` carries (`src/parser/callable-set.ts:362`).
2. Delete `thetaCallableName`
   (`src/extension/production-theta-producer.ts:714–717`) and call the imported
   `thetaDefaultName` at both of its sites: the presented-name derivation
   (`:4229–4231`) and `thetaCalleePath`'s fallback match (`:4158–4160`). The
   producer then holds no default-name derivation of its own. The removed `\`→
   `/` normalisation has no counterpart on the resolver side, so dropping it is
   part of the agreement rather than a regression: a `\`-separated entry now
   derives the same name on both readers.
3. Flip cell (D4) (`tests/tools-entry-closed-grammar-lockstep.test.ts:466–509`)
   to `belt-fired`, move it into group (D3) as a further agreement cell, and
   rewrite the file header's PINNED DIVERGENCE paragraph (`:80–91`) to state
   that the readers agree on hyphenated stems. The cell is the authorized flip:
   its own message and 0107 §Fix §Residuals item 1 name this sequence.
4. Add one (D3) cell for the callee-path consequence: a snapshot-absent fixture
   with `- ./<stem>-<stem>.theta` calling the underscored name resolves the
   `.theta` callee (the `invoke_infra` load failure for the fixture path) rather
   than the Pi-tool route. Without it the fix's second call site has no witness.

Prove the red direction once: with step 2 reverted, the flipped (D4) cell and
the new callee-path cell must red naming the disagreement, and the rest of the
file must stay green.

The spec is unchanged: `frontmatter-fields-a.md:84` already states the rule the
fix implements, and no diagnostic code, message text or registry row moves.

## Non-goals

- The derived name's validity check (`theta/load/invalid-derived-tool-name`,
  bug 0070) is applied by the resolver and not by the fallback. That is a
  separate absence; this fix makes the two derive the same name, not the same
  diagnostics.
- Whether the snapshot-absent fallback should exist at all is out of scope; the
  fix keeps the arm and makes it agree.
- (D1)'s remaining source-shape scan and the export of
  `presentedCallableNames` stay as 0107 left them.

## Provenance

- Origin: bug 0107 `## Fix (0.219.0)` §Residuals item 1, which records the
  divergence as "recorded, not closed" and states that a separate filing owns
  it. Ownership re-checked at HEAD: 0069, 0070, 0106 and 0107 are all fixed, and
  no open report cites `thetaCallableName` or the hyphenated default name.
- Measurement: two scratch `vite-node` probes under `.pi/tmp/` (deleted after
  the run) driving the real `resolveCallableSet`, `parseThetaDocument`, and
  `createProductionProducerDeps().bindPromptConversation` → `executeBody` over
  snapshot-absent thetas, plus one run of
  `tests/tools-entry-closed-grammar-lockstep.test.ts` (11 passed).
- Every citation in this report was re-derived at HEAD `b9cf2f26` by `rg` over
  the tree; the line numbers in bug 0107 predate it and were not copied.

## Fix (0.222.0)

- What shipped:
  - `src/parser/callable-set.ts` — §Fix step 1: `thetaDefaultName` is exported,
    its doc comment naming it the single implementation of
    `frontmatter-fields-a.md` §default name and its producer-side consumer, on
    the export rationale `parseToolsEntry` already carries.
  - `src/extension/production-theta-producer.ts` — §Fix step 2:
    `thetaCallableName` deleted; `presentedCallableNames`' default-name
    derivation and `thetaCalleePath`'s snapshot-absent match both call the
    imported `thetaDefaultName`, so the producer holds no default-name
    derivation of its own. The `\`→`/` normalisation is gone with it, per
    §Fix step 2 (backslash path literals are rejected by the parse gate,
    `theta/parse/invalid-path-separator`, and no `frontmatter.tools` fixture in
    the tree carries one). Both stale doc comments now describe the shared
    derivation.
  - `tests/tools-entry-closed-grammar-lockstep.test.ts` — §Fix steps 3 and 4:
    cell (D4) flipped to `belt-fired` and moved into (D3) (its resolver-side
    assertion and its `./b0107-code-review.theta` stem intact), the (D4)
    describe gone, the file header's PINNED DIVERGENCE paragraph rewritten as
    "hyphenated stems agree too", and a new `calleeRouteFor` harness plus a
    (D3) callee-route pair (hyphen-free control + hyphenated cell) witnessing
    the second call site.
  - `tests/live/live-production-acceptance.test.ts` — additive live cell for the
    agreement face end to end (no existing cell weakened, reworded, reordered
    or deleted).
  - No spec edit. No diagnostic code, message or registry row moved.
- Gates:
  - Witness before the fix: `npx vitest run
    tests/tools-entry-closed-grammar-lockstep.test.ts` → `Tests  2 failed | 11
    passed (13)`; the reds were `expected 'drive-completed' to be 'belt-fired'`
    and `expected 'pi-tool' to be 'theta-callee'`.
  - Witness after: `Test Files  1 passed (1)` / `Tests  13 passed (13)`.
  - Full default suite: `npm test` → `Test Files  408 passed (408)` /
    `Tests  8583 passed (8583)`.
  - Typecheck: `npx tsc -p tsconfig.json --noEmit` → clean.
  - Lint: `npm run lint` → clean.
- Review: 2 rounds.
  - Round 1 (deep): one prose finding — `thetaCalleePath`'s doc comment stacked
    two em-dash appositives so the trailing clause attached to
    `thetaDefaultName`; plus one non-blocking test residual — `calleeRouteFor`
    did not pin the `invoke_infra` error's `callee_path` to the entry. No
    correctness, fidelity or spec finding; §Non-goals verified honoured.
  - Fixer round 1 applied both: the comment split into two sentences, and the
    `callee_path === entry` pin with a loud throw on mismatch, its red direction
    proved by perturbation and restored by writing the content back.
  - Round 2 (fast): clean, no escalation.
- Verification: SOLID.
  - Witness genuineness — the deleted un-remapped derivation was re-introduced
    at both call sites by a targeted byte edit; exactly the two hyphenated cells
    reproduced their named disagreement (`drive-completed` / `pi-tool`) and
    every other cell stayed green; the file was restored by writing the content
    back and `git hash-object` matched the pre-edit snapshot
    (`999542ecc100710ae4611352f28243766d0f54c6`), 13/13 green after. No
    `git stash`, no `git checkout --`, no `git restore`.
  - Full default suite green (408 files / 8583 tests).
  - Live coverage — no `tests/live/**` cell planted a hyphenated `.theta`
    `tools:` entry with no `as` rename, so one was added to
    `tests/live/live-production-acceptance.test.ts`: a discovered caller whose
    `tools:` names `./b0253live-code-review.theta` and whose body calls
    `b0253live_code_review()?`, asserting the marker-anchored rendered value is
    the callee's own literal and that no fail-closed `theta-system-note` fired,
    with a task-framed arithmetic discriminator. Run under the live lock:
    `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/live-production-acceptance.test.ts -t "bug 0253"` →
    `Tests  1 passed | 88 skipped (89)`.
  - Lint and typecheck clean, re-run after the live cell landed.
- Residuals:
  1. The live cell witnesses the AGREEMENT face only, not the repaired arm.
     Discovery always attaches a snapshot
     (`src/extension/production-composition.ts`), so a real `pi -p` run takes
     the snapshot arm and the fallback cannot be reached live; the fallback's
     own witness is the offline (D3) pair, whose red direction was proved twice
     (Phase 1 and verification).
  2. One comment-only trim was made by the orchestrator after verification: the
     live cell's leading comment carried the clause "Added during bug-0253 fix
     verification to close this live-coverage gap", historical narration the
     house rules forbid. Removed; typecheck, lint and the offline witness
     re-run green afterwards. No assertion and no executable line touched.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: §Non-goals stand unchanged — the derived-name
  validity check (bug 0070) is still resolver-only and was NOT added to the
  fallback; the snapshot-absent arm is kept and made to agree; (D1)'s
  source-shape scan and `presentedCallableNames`' non-export stay as bug 0107
  left them.
