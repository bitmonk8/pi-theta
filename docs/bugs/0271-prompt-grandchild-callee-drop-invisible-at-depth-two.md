# Bug 0271 — Bug 0267's widened `callee-has-errors` input is one level deep and does not chain: a prompt-mode grandparent whose `tools:` names a healthy subagent child registers over a child that the same pass un-registers, because `calleeFailsOwnStructuralChecks` (`production-composition.ts:2091`) resolves the child's OWN `tools:` `.theta` entries through a fixed subagent stub (`:2140`) instead of the child's real callee judgment, so the child's `theta/load/callee-has-errors` refusal over a dropped grandchild is invisible at the grandparent and no diagnostic lands anywhere on the grandparent's file

- **Status:** open.
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
