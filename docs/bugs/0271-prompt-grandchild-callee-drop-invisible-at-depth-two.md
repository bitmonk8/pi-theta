# Bug 0271 — Bug 0267's widened `callee-has-errors` input is one level deep and does not chain: a prompt-mode grandparent whose `tools:` names a healthy subagent child registers over a child that the same pass un-registers, because `calleeFailsOwnStructuralChecks` (`production-composition.ts:2091`) resolves the child's OWN `tools:` `.theta` entries through a fixed subagent stub (`:2140`) instead of the child's real callee judgment, so the child's `theta/load/callee-has-errors` refusal over a dropped grandchild is invisible at the grandparent and no diagnostic lands anywhere on the grandparent's file

- **Status:** fixed (0.270.0).
- **Sev/Diff estimate:** S3/D2 — S3 for the same reason bug
  [0267](./0267-prompt-caller-registers-over-dropped-subagent-callee.md) is S3
  and on the same observable: the grandparent registers a `.theta` callable,
  offered to code and model alike
  (`docs/spec_topics/frontmatter/frontmatter-fields-a.md:74`), for a child that
  will not load, and the author's whole load-time report cites the child and
  the grandchild, never the grandparent. Confirmed S3 rather than seeded: the
  grandparent's frozen callable entry is byte-identical to the healthy control
  — same `kind`/`mode`/`calleePath` and the same `closureHash`
  (§Reproduction rows A–D). Not S2: no wrong value, no isolation boundary
  moves; the failure is late, not silent-and-wrong. D2 because the child's
  refusal row already exists at the child's own file and the mechanism for
  relocating a depth-1 condition onto the caller's file already ships
  (`nestedToolsEscapes`, `:1733–1739`), so the edit is small — but the fix must
  pick between chaining on the child's own refusal and an explicit bounded
  depth walk, and must do so without reintroducing the unbounded recursion the
  0267 stub exists to prevent, so the adjudication and the withhold set are the
  work. Not D1: the naive route (recurse) does not terminate on a `tools:`
  cycle.
- **Kind:** defect — implementation diverges from documented behaviour.
  `docs/spec_topics/invocation.md:20` states the walk is transitive: "callees
  referenced by a callee's own literal `invoke` paths and `.theta` entries in
  `tools:` are loaded into the same cache". `:22` states the per-surface
  consequence: a callee that "fails its own structural checks is *not
  statically resolvable*", and on the `tools:` surface "the callable cannot be
  created, and the parent theta does not register". The child in
  §Reproduction fails its own structural checks — the pass says so, at the
  child's file — and the grandparent registers.
- **Affected** (every citation re-derived at HEAD `76489c61`, v0.266.0;
  `src/extension/production-composition.ts` is 3104 lines at HEAD):
  - `src/extension/production-composition.ts:2140` — the stub
    `resolveThetaCallee` inside `calleeFailsOwnStructuralChecks`, which returns
    `{kind: "theta", mode: "subagent", callee: undefined, calleePath}` for every
    `.theta` entry in the child's own `tools:`. The seam: the grandchild is
    never read, so the child's dead-callable condition over it cannot be seen.
  - `src/extension/production-composition.ts:2091` —
    `calleeFailsOwnStructuralChecks`, bug 0267's widened predicate. Its two
    conditions are the child's own `.thetalib` import resolution and
    `theta/load/unknown-tool` from the child's own `tools:`; neither covers a
    `.theta` entry in the child's own `tools:`.
  - `src/extension/production-composition.ts:2071–2082` — the doc-comment's
    non-recursion bound, which names this report's subject as a deliberate
    withhold: "a grandchild that itself fails its own checks, … is a WITHHOLD
    — this helper answers `false` and the caller keeps registering".
  - `src/extension/production-composition.ts:2030` —
    `parseCalleeForTools`'s `hasErrors`,
    `hasLoadParseError(document.diagnostics) || failsPostParseChecks`. For a
    healthy child both limbs are `false`.
  - `src/extension/production-composition.ts:1747–1759` — the V15f
    `callee-has-errors` loop in `resolveThetaToolsAtLoad` (`:1644`), gated on
    `callee.hasErrors`. It is the only site that un-registers a caller for a
    callee's condition, and it is the site that fires at the CHILD in every
    defect row below.
  - `src/extension/production-composition.ts:1725–1739` — the escape loop that
    relocates a callee's OWN `tools:` entry verdicts
    (`callee.nestedToolsEscapes`, bug 0111) onto the caller's file. Precedent:
    a depth-1 condition already reaches the caller's report through the same
    cache, with a one-level bound.
  - `src/extension/production-composition.ts:2179` —
    `checkNestedToolsContainment`, that precedent's producer, judged against
    the callee's own directory.
  - `src/extension/production-composition.ts:2416–2432` —
    `parseCalleeTheta`'s dispatch gate, which applies the same predicate (bug
    0267 §Fix constraint 3) and therefore inherits the same depth-2 blind spot.
  - `src/extension/production-composition.ts:2549` — `hasLoadParseError`, the
    first limb.
  - `docs/spec_topics/invocation.md:20` (`#static-resolution`) — the transitive
    walk, and `:22` — the per-surface severity rule.
  - `docs/spec_topics/diagnostics/code-registry-load.md:42` —
    `theta/load/callee-has-errors`, Trigger "failed to parse, lower, or pass
    its own structural checks during the parent's per-load-pass
    static-resolution walk". Already ERR-6-classified in `preEvalCauseOf`
    (`src/extension/production-composition.ts:316`).
  - `docs/spec_topics/frontmatter/frontmatter-fields-a.md:74` — `tools`
    exposes the callable set to model and code.
  - `tests/callee-post-parse-errors-un-register-tools-caller.test.ts` — bug
    0267's landed witness (10 cells), all at depth 1.
  - `tests/tools-entry-grammar-derivations-lockstep.test.ts:1347` (D3) and
    `:1434` (D5) — bug 0248's pins that a callee whose OWN `tools:` entry is
    malformed and escaping draws no refusal at its caller. A depth-walking fix
    crosses these.
- **Observed at:** HEAD `76489c61`, v0.266.0, `main`, by one offline
  provider-free scratch probe driving `composeExtensionInstance` over host
  doubles (token `b0271scratch`, removed after measurement).

## Summary

Bug 0267 made a caller refuse when its `tools:` `.theta` callee fails a check
that runs after the callee's own parse. The widened predicate reads the
callee's own `.thetalib` imports and the Pi tool names in the callee's own
`tools:`; a `.theta` entry in the callee's own `tools:` is resolved through a
fixed subagent stub rather than parsed, an explicit non-recursion bound
(`production-composition.ts:2071–2082`).

Stack the same shape one level deeper — grandparent (prompt, `tools:` names the
child) → child (subagent, `tools:` names the grandchild) → grandchild
(subagent, carrying a drop route) — and the chain breaks at depth 2. The
grandchild un-registers. The child un-registers, with an error-severity
`theta/load/callee-has-errors` row located at the child's own file: bug 0267's
fix works exactly as landed one level down. The grandparent registers, with a
callable entry byte-identical to the healthy control, and carries no diagnostic
at all. A refusal at depth 1 does not become a condition at depth 0.

The break is not confined to bug 0267's four widened routes. Row C below drops
the grandchild through its OWN parse error — the pre-0267 V15f route — and the
grandparent is equally silent, because the child's refusal is produced by the
child's own `resolveThetaToolsAtLoad` iteration, which the grandparent's scan
replaces with `parseCalleeForTools`.

## Reproduction

Plant the files under `<cwd>/.pi/theta/` with a `{}` `.pi/settings.json`, then
run `composeExtensionInstance(pi, ctx, undefined, new RendererGate())` over
host doubles (`ctx.cwd` = the workspace), reading `wiring.thetas` for the
registration decisions and each theta's frozen `callableSet.entries` for the
callable list.

Grandparent (every row):
`---\nmode: prompt\ntools:\n  - ./b0271scratchchild.theta as child\n---\n@`hi`\n`

Child (rows A–D):
`---\nmode: subagent\ndescription: c\ntools:\n  - ./b0271scratchgrand.theta as grand\n---\nlet a = 1\n`

| # | grandchild condition | grandchild registers | child registers | grandparent registers | diagnostic sites |
|---|---|---|---|---|---|
| A | imports a `.thetalib` that does not exist (IMP-1) | no | **no** | **yes** | grandchild (`theta/load/unresolvable-thetalib-path`); child (`theta/load/callee-has-errors`); grandparent: NONE |
| B | imports a `.thetalib` carrying a lex + parse error | no | **no** | **yes** | library file (`theta/parse/unterminated-template`, `theta/parse/unsupported-feature`); child (`theta/load/callee-has-errors`); grandparent: NONE |
| C | its own body carries an unterminated template | no | **no** | **yes** | grandchild (both parse rows); child (`theta/load/callee-has-errors`); grandparent: NONE |
| D | control — all three healthy | yes | yes | yes | none |
| E | depth-1 baseline — the grandparent's `tools:` names the row-A file directly, no child | — | no | **no** | callee (`theta/load/unresolvable-thetalib-path`); CALLER (`theta/load/callee-has-errors`) |

Row E is bug 0267's landed behaviour and is green: at depth 1 the caller
refuses and carries the caller-located row. Rows A–C are the same drop routes
one level further down, and the grandparent's outcome inverts.

The grandparent's frozen callable entry, identical in rows A, B, C and the
healthy control D:

```
{"child":{"kind":"theta","mode":"subagent","calleePath":"./b0271scratchchild.theta",
  "closureHash":"sha256:ddad8f8a0649ef7785d4089ef97113f2aa4c7caeb7a66fdc6e3b7da672cff797"}}
```

The hash is equal across all four rows because the closure is the child file
plus its transitive `.thetalib` imports (`collectCallableClosureSources`,
`production-composition.ts:2490`) and the grandchild is neither. The hash is
correct per RFC-0005's scope; the point is that no caller-side observable
separates a registering grandparent over a dropped child from the control.

In rows A–C the child's registered set is empty and the child's own
callable-set entry for `grand` is therefore never minted, so the grandparent
holds a callable naming a file that produced no callable of its own.

## Expected behaviour

`invocation.md:20`: "The walk is transitive: callees referenced by a callee's
own literal `invoke` paths and `.theta` entries in `tools:` are loaded into the
same cache". The grandchild is a `.theta` entry in the child's own `tools:`,
so the spec places it inside the grandparent's static-resolution walk.

`invocation.md:22`: a callee that "fails its own structural checks is *not
statically resolvable*", and on the `tools:` surface "the callable cannot be
created, and the parent theta does not register". The child fails its own
structural checks in rows A–C — the pass records that verdict at the child's
own file, under the code whose Trigger is exactly that condition — so the
grandparent owes a refusal, or at minimum an error-severity row at its own
`tools:` site.

`code-registry-load.md:42` needs no widening: `theta/load/callee-has-errors`
already names this subject, on this surface, at this severity, and is already
in `preEvalCauseOf`'s `tools-resolution` batch
(`production-composition.ts:316`). A fix reusing that row is ERR-6-classified
as landed.

Two registration decisions over the child in one pass must agree. Rows A–C are
the disagreement, one level up from where bug 0267 removed it.

## Actual behaviour / root cause

`resolveThetaToolsAtLoad` (`:1644`) pre-parses each distinct `.theta` callee
through `parseCalleeForTools` (`:1934`), whose `hasErrors` (`:2030`) is
`hasLoadParseError(document.diagnostics) || failsPostParseChecks`. For the
child in rows A–C the first limb is `false`: the child's own bytes parse
clean. The second limb calls `calleeFailsOwnStructuralChecks` (`:2091`), which
runs two checks over the child:

1. `checkThetaImports` over the child's own `.thetalib` imports — the child has
   none;
2. `resolveCallableSet` over the child's own `tools:`, looking for
   `theta/load/unknown-tool` — and this walk supplies a stub
   `resolveThetaCallee` (`:2140`) that returns a fixed
   `{kind: "theta", mode: "subagent", calleePath}` for any `.theta` entry. The
   grandchild file is never opened, never parsed, never judged. No
   `unknown-tool` is raised.

So `hasErrors` is `false`, the V15f loop (`:1747–1759`) has no subject at the
grandparent, and `resolveCallableSet` mints the child callable.
`attachLoadTimeClosureHashes` (`:1867`) then stamps a hash over the child's
bytes and its `.thetalib` closure, producing the fully formed entry above.

The child's real verdict is produced later, on the child's own
`runComposePass` iteration, by the child's own `resolveThetaToolsAtLoad` — a
call the grandparent's scan never makes, because at that depth the scan is
`parseCalleeForTools`, a projection reading mode, existence, containment,
nested containment, and the two bug-0267 conditions.

The bound is deliberate and documented (`:2071–2082`): recursing is unbounded,
since a `tools:` cycle A↔B would not terminate, and
`checkNestedToolsContainment` (`:2179`, bug 0111) refuses full nested
resolution at the same depth for the same reason. The stub is written to
withhold rather than over-refuse, and this report is one of the withholds its
own doc-comment enumerates: "a grandchild that itself fails its own checks, …
is a WITHHOLD". The defect is that the withheld condition is the
§Fix-constraint-1 shape bug 0267 was filed to remove — the callee un-registers,
the caller registers, and nothing is located at the caller.

`parseCalleeTheta`'s dispatch gate (`:2416–2432`) applies the same predicate,
so the drive-time re-check inherits the identical blind spot: one predicate,
two sites, one gap, one level down.

## Why it matters

- The author's load-time report names the grandchild and the child. Nothing
  tells the author the grandparent's `tools:` entry is dead;
  `theta/load/callee-has-errors` exists for that message and does not fire at
  the grandparent.
- The registered callable is exposed to the model
  (`frontmatter-fields-a.md:74`), so the failure surfaces inside a model turn,
  after the grandparent has spent tokens.
- Bug 0267's fix reads as complete on the surface an author interacts with — a
  refusal is visible one level down, at the child — which makes the depth-2
  silence harder to attribute than the depth-1 silence it replaced.
- Depth is not bounded in practice. Every additional `tools:` level restores
  the pre-0267 behaviour at the level above it.

## Non-goals

- Bug [0267](./0267-prompt-caller-registers-over-dropped-subagent-callee.md)'s
  landed depth-1 rows. Rows 1–4 of its §Reproduction refuse correctly at HEAD;
  row E above re-measures one of them. This report changes no depth-1 outcome.
- The route where a `.theta` entry in the callee's own `tools:` resolves to no
  file (`theta/load/unresolvable-theta-path` at the callee, caller registers) —
  bug 0267 §Fix-record residual 1, filed as
  [0270](./0270-callee-tools-missing-theta-path-caller-still-registers.md). That route
  and this one share the stub at `:2140`; they are separate reports because
  0270's condition is visible without reading the grandchild at all (the path
  does not resolve) while this one requires judging the grandchild's contents.
- A prompt-mode grandchild (`theta/load/prompt-mode-callable` at the child) —
  bug 0267 §Fix-record residual 2, unfiled.
- The callee's own `tools:` entry-grammar rejections, held by bug 0248 cells
  (D3)/(D5) (`tests/tools-entry-grammar-derivations-lockstep.test.ts:1347`,
  `:1434`).
- The `invoke(...)` surface's warning severity (`invocation.md:22`). Only the
  `tools:` surface is in scope.
- Bug 0268's path-separator spelling divergence between the walks.

## Fix

Route not settled here; the constraints are.

1. No silent registration over a dropped callee, at any depth. If the pass
   un-registers the child, the grandparent must either refuse or carry an
   error-severity diagnostic located at the grandparent's `tools:` site. A pass
   in which rows A–C leave the grandparent registered with no grandparent-located
   row is the defect and must red.
2. Termination is a hard constraint, not a preference. A `tools:` cycle (A names
   B, B names A) must terminate. Any route that walks deeper needs an explicit
   bound — a visited set keyed by resolved absolute path, a depth cap, or both —
   and the bound must be stated in the code, not implied by the fixture set.
3. Two candidate routes, to be adjudicated against `invocation.md:20` rather
   than around it:
   (a) chain on the child's own refusal — make the child's V15f verdict, which
   the pass already computes at the child's file, an input the grandparent's
   scan can read, so `callee-has-errors` composes by one rule at every depth;
   (b) an explicit bounded depth walk inside
   `calleeFailsOwnStructuralChecks`, extending the stub at `:2140` to a real
   resolution under constraint 2's bound.
   Route (a) is ordering-sensitive: the grandparent's scan runs during the
   grandparent's own `runComposePass` iteration, which may precede the child's,
   so "read the child's verdict" needs a verdict that exists at that point.
   Route (b) pays the parse cost again but is order-free. The fix states which
   it takes and why.
4. Prefer the existing registry row. `theta/load/callee-has-errors`
   (`code-registry-load.md:42`) already names this subject on this surface at
   this severity and is already ERR-6-classified (`:316`). A new code needs a
   registry row, a `preEvalCauseOf` arm and an FN-7 list entry, and must be
   justified against the existing row's Trigger before it is minted.
5. One predicate, both sites (bug 0267 §Fix constraint 3, unchanged). Whatever
   moves in `calleeFailsOwnStructuralChecks` reaches `parseCalleeTheta`'s
   dispatch gate (`:2416–2432`) in the same change.
6. Scope the widened check explicitly and record the rest, as bug 0267 did. The
   fix states which grandchild conditions it admits (the `.thetalib` routes,
   the own-parse route, the child's own `unknown-tool`) and which it withholds,
   and updates the `:2071–2082` doc-comment so the enumerated withhold list
   matches what ships.
7. `invocation.md:20`'s transitivity sentence and its mirror in
   `docs/reference/discovery-cli.md` describe a walk the implementation bounds
   at one level. The fix either makes the implementation match the sentence or
   narrows the sentence to the bound it keeps; leaving both as they are is not
   an outcome.
8. Locks. Bug 0267's witness
   (`tests/callee-post-parse-errors-un-register-tools-caller.test.ts`, 10 cells)
   and its live cell
   (`tests/live/b0267live-callee-post-parse-errors-un-register-tools-caller-live-cell.test.ts`)
   stay green unchanged — they are the depth-1 statement this report does not
   move. Bug 0248 cells (D3)/(D5)
   (`tests/tools-entry-grammar-derivations-lockstep.test.ts:1347`, `:1434`) pin
   a caller registering over a callee whose own `tools:` entry is malformed and
   escaping; a depth-walking route (3b) must not move those pins, and this
   report carries no authority over them.
9. Bug [0270](./0270-callee-tools-missing-theta-path-caller-still-registers.md)
   shares the stub at `:2140`. If 0270 lands first with a real nested
   resolution, this report's route (3b) may reduce to widening the code set that
   resolution is judged by; if this report lands first, 0270's route narrows
   the same way. Neither blocks the other, and whichever is second states which
   of its own constraints the first already discharged.

## Provenance

Bug 0267's fix record (`.pi/tmp/fixes/0267-report.md`) — the "Scope admitted
… and what is withheld" section's third withhold, the non-recursion bound, and
the same bound as it ships in the helper's doc-comment
(`src/extension/production-composition.ts:2071–2082`), whose enumerated
withholds include "a grandchild that itself fails its own checks". Sixteenth
set. Filed at HEAD `76489c61`, v0.266.0, from an offline
`composeExtensionInstance` probe over the five conditions tabulated in
§Reproduction.

## Fix (0.270.0)

- What shipped:
  - `src/extension/production-composition.ts` — `calleeFailsOwnStructuralChecks`
    gains a third admitted condition (§Fix constraint 3 route (b)): bug 0270's
    pre-resolution loop over the callee's OWN `tools:` `.theta` entries now, for
    an entry that reads, is unvisited and is inside the discovery roots, parses
    it through the pass cache and judges it as failing when its frontmatter is
    null, its own parse carries a load/parse error, or the SAME predicate
    recurses over it and answers `true`. One rule, composed by induction at
    every depth, mirroring `parseCalleeForTools`'s own `hasErrors`. Termination
    (§Fix constraint 2) is an explicit visited set of resolved absolute paths,
    threaded through the recursion and seeded at both call sites with the
    callee's own path; a member already in the set is a withhold, never a
    manufactured refusal. No new diagnostic code (§Fix constraint 4): the
    caller's row is the existing V15f `theta/load/callee-has-errors` push,
    reached because the predicate's input widened. One predicate, both sites
    (§Fix constraint 5): `parseCalleeTheta`'s dispatch gate calls the same
    helper. The doc-comment records the route adjudication, the termination
    argument and the four withholds (§Fix constraint 6).
  - `docs/spec_topics/invocation.md` §Static resolution and its
    `docs/reference/discovery-cli.md` mirror — the transitivity sentence bug
    0270 narrowed to existence and readability now states the recursion, its
    visited-set bound, and what stays outside the walk at every depth: a named
    path's declared mode, and an out-of-root path's contents, which are read for
    readability and never parsed (same-commit spec edit, §Fix constraint 7,
    DIAG-2).
  - `tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts` —
    bug 0270's cell (E), that report's explicit 0271-withhold lock on the
    depth-two silence, flipped under this report's authority; the other six
    cells unchanged.
- Route adjudicated (§Fix constraint 3, which left it open): route (b), the
  bounded depth walk. Route (a) — chain on the child's own V15f verdict — was
  rejected because the pass keeps no cross-iteration verdict store and a
  grandparent's `runComposePass` iteration may precede the child's, so reading
  the child's verdict needs a fixpoint or a second pass and makes the outcome
  depend on discovery order. Route (b) is order-free, and because the recursion
  re-enters the same predicate it composes by induction at every depth — the
  property route (a) was wanted for, without the ordering hazard.
- Scope admitted: a grandchild's own `.thetalib` import resolution (§Reproduction
  rows A and B), its own parse (row C), its own `tools:` `theta/load/unknown-tool`
  and `theta/load/unresolvable-theta-path`, and all of those recursively at any
  depth. Withheld and recorded: an escaping grandchild (path-shaped, bug 0111's
  `checkNestedToolsContainment` surface, judged without reading the entry's
  contents, and that helper relocates a verdict one level only — so at
  recursion level 1 admitting it would double-report, and deeper it is a
  genuine gap, Residual 1 below); a grandchild's declared prompt mode (bug
  0267's §Fix-record residual 2, unfiled); a member already in the visited set;
  and any entry the entry-grammar gate skipped, so bug 0248 cells (D3)/(D5) stay
  out (§Fix constraint 8).
- Gates:
  - Witness before: `Tests 5 failed | 3 passed (8)`, every red reading
    `expected [ 'b0271gp' ] to not include 'b0271gp'` with the child's depth-one
    row present and no grandparent-located row. After:
    `Test Files 1 passed (1) / Tests 10 passed (10)`.
  - Full default suite: `Test Files 447 passed (447) / Tests 9280 passed (9280)`.
  - Typecheck: `tsc -p tsconfig.json --noEmit` — clean, no output.
  - Lint: `eslint --no-error-on-unmatched-pattern "src/**/*.ts"` — clean, no
    output.
  - Live: `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts` —
    `Test Files 1 passed (1) / Tests 1 passed (1)`, re-run at the final tree
    state.
- Tests that lock it:
  - `tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts` — ten
    offline cells: (A)(B)(C) §Reproduction rows A–C at depth two, (D) the
    three-level healthy control, (CYC1) a healthy two-file `tools:` cycle and
    (CYC2) the same cycle with a broken member, both wall-clock-bounded,
    (DEPTH3) a broken great-grandchild proving the rule composes by induction,
    (ESC) the escaping-grandchild single-report withhold, (ESC2) the same shape
    with broken bytes — the cell that can actually red on the withhold's
    removal — and (ESC3) the recorded gap of Residual 1, pinned as a withhold.
  - `tests/live/b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts` —
    the H8a cell: the grandparent absent from the real runner's registered set
    over a depth-two drop with its own caller-located row, the dispatch-gate
    half through the literal `invoke(...)` surface, and a byte-neighbour healthy
    three-level control that registers and drives a real turn.
- Review: 3 rounds, plus one pre-review correction round (citation and comment
  prose only: four self-shifted `production-composition.ts` citations in the new
  witness header, and the flipped cell's heading comment in bug 0270's witness).
  - Round 1 (deep): two findings. The escape withhold's doc-comment claimed
    coverage that does not exist below recursion level 1; both amended spec
    sentences claimed an out-of-root path's contents are never read when only
    the parse is withheld. Both closed prose-only.
  - Round 2 (fast): CLEAN.
  - Round 3 (fast, after the verifier's finding was closed): CLEAN.
- Verification: SOLID on all five obligations. The witness reds under three
  independent neutralisations, each restored byte-exact and hash-verified: the
  recursion's contribution to the return value dropped — cells (A)(B)(C)(CYC2)
  (DEPTH3) and bug 0270's flipped cell (E) all red; the visited-set guard
  disabled — cell (CYC1) HANGS and is killed at its 60 s ceiling, which is the
  termination proof that the bound is load-bearing; the escape `continue`
  removed — cell (ESC2) reds with the double-report signature
  (`theta/load/invoke-path-escape` and `theta/load/callee-has-errors` both
  located at the caller). The full suite is green with bug 0267's ten cells, bug
  0248's lockstep, bug 0264's note-count witness and bug 0111's containment
  witness all byte-unchanged and absent from the diff. The live cell was run by
  the orchestrator under the shared lock and its red path proven by
  neutralisation; no reviewer or verifier ran live.
- Residuals:
  1. An escaping entry belonging to a file BELOW the caller's immediate callee
     leaves the caller registering with no row of its own. Measured: for a
     grandparent whose `tools:` names a child whose `tools:` names a grandchild
     whose OWN `tools:` entry escapes every discovery root, the registered set
     is exactly the grandparent, `theta/load/invoke-path-escape` is located at
     the child's file and at the grandchild's file, and nothing is located at
     the grandparent's file. Withheld rather than admitted because the condition
     is path-shaped and judged without reading the entry's contents, which is
     bug 0111's `checkNestedToolsContainment` surface — "one level in" — and
     §Fix constraint 8 gives this report no authority over the bug 0248 cells
     that pin that helper's caller-side outcomes. Pinned as cell (ESC3) so a
     later fix flips it loudly. Sweep material for a separate report.
  2. The visited set is per-branch, so a shared subtree is re-judged once per
     simple path through the `tools:` graph. Termination is unaffected and
     proven; the cost is not. A k-layer two-wide diamond ladder produces on the
     order of 2^k predicate invocations, each re-running the readability probe,
     the containment `realpath`, `checkThetaImports` and `resolveCallableSet`
     (the parse itself is memoised by the pass cache). Polynomial for trees and
     narrow graphs; an effective hang around k = 30. A depth cap or a
     cycle-free-verdict memo is the remedy, and a global memo would change
     semantics, since a verdict is branch-dependent where a cycle re-enters a
     branch-specific ancestor. Sweep material.
  3. The drive-time dispatch gate passes no active roots, so the recursion there
     judges a grandchild's parse without any containment judgement at any depth.
     This narrows the pre-existing load-versus-drive divergence rather than
     widening it, and §Static resolution describes the load pass, so nothing
     normative is contradicted. Recorded, not changed.
  4. Where this document turned out wrong at HEAD, recorded rather than
     rewritten: every `src/extension/production-composition.ts` citation in
     §Affected is stale by roughly +120 lines from bug 0270's merge, and the
     file is 3207 lines at HEAD rather than 3104; §"Actual behaviour / root
     cause"'s claim that the stub returns a fixed shape "for any `.theta` entry"
     holds only for a READABLE entry, since bug 0270 made it answer `undefined`
     for a recorded-unreadable spec; and §Reproduction's literal closure hash is
     fixture-byte-specific, so the witness pins the entry shape and the
     `sha256:` form instead of a digest. Every row's outcome reproduced exactly.
  5. §Fix constraint 7 was an either/or when this report was filed. Bug 0270's
     spec edit narrowed the transitivity sentence in the interval, so by the
     time this fix landed the same-commit spec amendment was required rather
     than optional. Discharged.
- Discharge notes appended: bug 0270's document (its cell (E) withhold flipped
  here, with the mechanism it contributed reused rather than duplicated) and bug
  0267's document (its withheld grandchild-fails-its-own-checks route closed
  here). Both APPENDED and dated, nothing rewritten.
- Pinned dispositions / non-goals: no depth-one outcome moved; bug 0248 cells
  (D3)/(D5) and bug 0267's ten cells and live cell are byte-unchanged; no
  diagnostic code was minted, so `tests/fixtures/h7a/permitted-codes.json` is
  byte-unchanged; closure-hash equality across §Reproduction's rows is correct
  per RFC-0005 and was neither chased nor asserted; the prompt-mode grandchild
  route stays a withhold (bug 0267 §Fix-record residual 2).
