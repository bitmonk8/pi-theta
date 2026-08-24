# Bug 0275 — An escaping `tools:` `.theta` entry un-registers its owner and its owner's immediate caller and stops there: bug 0271's recursive `calleeFailsOwnStructuralChecks` walk skips an escaping entry before it can judge it (`production-composition.ts:2245–2258`, withhold (a)) and `checkNestedToolsContainment` (`:2348`) relocates one level only, so a grandparent whose grandchild's own `tools:` entry escapes the discovery roots registers a callable byte-identical to the healthy control with no diagnostic on its file, while both files below it un-register

- **Status:** open.
- **Sev/Diff estimate:** S3/D3 — S3 on bug
  [0271](./0271-prompt-grandchild-callee-drop-invisible-at-depth-two.md)'s
  observable and by its precedent: the caller registers a `.theta` callable
  exposed to model and code
  (`docs/spec_topics/frontmatter/frontmatter-fields-a.md:74`) over a callee the
  same pass un-registers, and the callable entry is byte-identical to the
  healthy control (§Reproduction rows A, B, D — same `kind`/`mode`/`calleePath`
  and the same `closureHash`). Not S4: the escape is not a prose defect, it
  fires as an error-severity row, two files down from the file that keeps
  registering. Not S1: the caller's callable is dead rather than wrong, and the
  containment boundary itself holds — the escaping target's bytes are never
  parsed at any depth (`:2245–2258`, `:2354`). D3 rather than the seeded D2: the
  route is unsettled (fold containment into 0271's depth walk, or make each
  file's own containment verdict an input its caller reads), the surface is one
  predicate shared by two call sites with different `activeRoots` availability
  (`:2245` vs `:2614`), and any route coordinates pinned bytes across four
  sibling witnesses — bug 0271's cells (ESC)/(ESC2) must not move while (ESC3)
  flips, and bug 0248 cells (D3)/(D5) must not move at all.
- **Kind:** defect — implementation diverges from documented behaviour.
  `docs/spec_topics/invocation.md:22`: a callee that "fails its own structural
  checks is *not statically resolvable*" and on the `tools:` surface "the
  callable cannot be created, and the parent theta does not register". In rows
  A, B and E below the grandchild fails its own structural check — the pass says
  so, at the grandchild's own file, under
  `theta/load/invoke-path-escape` — and the grandparent registers.
- **Affected** (every citation re-derived at HEAD `1e7e4321`, v0.270.0;
  `src/extension/production-composition.ts` is 3291 lines at HEAD, so cite by
  symbol first: the file moved at 0268 and again at 0270/0271):
  - `src/extension/production-composition.ts:2245–2258` — the escape guard
    inside `calleeFailsOwnStructuralChecks`'s recursion (`if (activeRoots !==
    undefined) { … if (containment?.kind === "escape") { continue; } }`). The
    seam: an escaping entry in a recursed-into file's own `tools:` is skipped
    before the recursive judgment, so the file that names it is judged as
    passing its own structural checks at every depth.
  - `src/extension/production-composition.ts:2111–2139` — that withhold's own
    doc-comment, which names this report's subject: "deeper, no relocation
    reaches the V15f caller at all … so the withhold is a GENUINE GAP: an
    escaping entry belonging to a file below the caller's immediate callee
    leaves the caller registering with no row of its own".
  - `src/extension/production-composition.ts:2163` —
    `calleeFailsOwnStructuralChecks`, bug 0271's recursive predicate, with the
    visited-set parameter at `:2172` and its termination check at `:2237`. Its
    admitted conditions are the recursed-into file's frontmatter, its own
    load/parse errors, and itself; containment is not among them.
  - `src/extension/production-composition.ts:2348` —
    `checkNestedToolsContainment`, bug 0111's producer of the relocated
    verdict, judged against the callee's own directory, one level in. `:2354`
    returns `undefined` when `activeRoots` is absent.
  - `src/extension/production-composition.ts:1725–1740` — the escape loop in
    `resolveThetaToolsAtLoad` (`:1644`) that relocates a callee's own entry
    verdicts (`callee.nestedToolsEscapes`, `:1733`) onto the caller's file. This
    is the only path by which an escape reaches a file other than the entry
    owner's, and it spans exactly one level.
  - `src/extension/production-composition.ts:1747–1759` — the V15f
    `theta/load/callee-has-errors` loop, gated on `callee.hasErrors` and
    skipping a callee whose own path escaped. It is the site that would carry
    the caller's row and has no subject in rows A, B and E.
  - `src/extension/production-composition.ts:2032` — `parseCalleeForTools`'s
    (`:1934`) `hasErrors`, `hasLoadParseError(document.diagnostics) ||
    failsPostParseChecks`. Both limbs answer `false` for a child whose own bytes
    parse clean and whose grandchild only escapes.
  - `src/extension/production-composition.ts:2605–2617` —
    `parseCalleeTheta`'s dispatch gate, calling the same predicate with
    `activeRoots` `undefined` (`:2614`), so no containment judgment runs at the
    drive-time re-check at any depth.
  - `docs/spec_topics/invocation.md:20` (`#static-resolution`, widened by 0270
    and 0271) — the recursion and its bound: a `.theta` path named by a callee's
    own `tools:` "is checked for existence and readability, and — when it
    exists, is readable, and lies within an active discovery root — for its own
    parse and its own structural checks in turn, transitively, to whatever depth
    the `tools:` graph reaches", bounded by "a set of the resolved absolute paths
    already visited on the current branch". The same line bounds the escaping
    TARGET only: "a path outside every active discovery root is judged no
    further than its existence, its readability, and its containment — its
    contents are never parsed". No sentence bounds the propagation of the
    verdict about the file that NAMES such a path.
  - `docs/spec_topics/invocation.md:22` — the per-surface severity rule the
    grandparent's registration crosses.
  - `docs/reference/discovery-cli.md:270` — the same wording's mirror.
  - `docs/spec_topics/diagnostics/code-registry-load.md:36` —
    `theta/load/invoke-path-escape`, `E`, Trigger "An `invoke(...)` literal or a
    `tools:` `.theta` entry resolves (post-realpath) to a path that lies outside
    every active discovery root". The Trigger names the entry, not the depth of
    the file declaring it.
  - `docs/spec_topics/diagnostics/code-registry-load.md:42` —
    `theta/load/callee-has-errors`, `E` on the `tools:` surface, already
    ERR-6-classified in `preEvalCauseOf`
    (`src/extension/production-composition.ts:316`).
  - `tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:897` —
    cell (ESC3), bug 0271's explicit pin of the current silence: "WITHHOLD — a
    grandchild whose OWN `tools:` entry escapes leaves the grandparent
    registering … The outcome pinned below is a gap, not a correct disposition;
    pinning it keeps a later fix from flipping it silently." Cells (ESC) and
    (ESC2) in the same file pin the depth-1 single-report property.
  - `tests/tools-entry-grammar-derivations-lockstep.test.ts:1347` (D3) and
    `:1434` (D5) — bug 0248's pins over the entry-grammar route, which this
    report does not touch.
- **Observed at:** HEAD `1e7e4321`, v0.270.0, `main`, by one offline
  provider-free probe driving `composeExtensionInstance` over host doubles
  (token `b0275scratch`, removed after measurement).

## Summary

Bug 0271 made the caller-side callee-has-errors judgment recurse: a callee's
own `tools:` `.theta` entries are read, judged for containment, then parsed and
re-judged by the same predicate, bounded by a visited set. Containment is a
skip in that recursion, not a verdict (`production-composition.ts:2245–2258`).
The only mechanism that carries an escape verdict off the entry owner's file is
`checkNestedToolsContainment`'s relocation (`:2348`, drained at `:1733`), which
reaches the entry owner's immediate caller and no further.

So an escaping `tools:` entry produces exactly two un-registrations and two
error rows, at exactly two files, wherever it sits in the chain: the file whose
entry escapes, and that file's immediate caller. Every caller above them
registers, carrying no row. At depth 1 the caller is the top of the chain and
the outcome is complete (§Reproduction row C). At depth 2 the grandparent
registers a callable whose `kind`, `mode`, `calleePath` and `closureHash` are
byte-identical to the healthy control's (rows A, B, D). At depth 3 the silence
covers two levels (row E): the child registers over a grandchild the same pass
un-registers, one level below the grandparent that also registers.

The escaping path itself is never opened for parse at any depth, which is
correct (`invocation.md:20`). The defect is the reach of the verdict about the
in-root, readable file that names it.

## Reproduction

Plant the files under `<cwd>/.pi/theta/` with a `{}` `.pi/settings.json`, plant
the escape target under `<cwd>/outside/` (not a discovery root), then run
`composeExtensionInstance(pi, ctx, undefined, new RendererGate())` over host
doubles with `ctx.cwd` = the workspace, reading `wiring.thetas` for the
registration decisions and each theta's frozen `callableSet.entries` for the
callable list.

Grandparent (every row): `---\nmode: prompt\ntools:\n  - ./child.theta as
child\n---\n@`hi`\n`

Child (rows A, B, D, E): `---\nmode: subagent\ndescription: c\ntools:\n  -
./gc.theta as grand\n---\nlet a = 1\n`

| # | escaping entry sits in | entry spelling | registers: gc / child / gp | error rows |
|---|---|---|---|---|
| A | the grandchild's own `tools:` | `../../outside/out.theta` | no / **no** / **yes** | grandchild and child: `theta/load/invoke-path-escape`; grandparent: NONE |
| B | the grandchild's own `tools:` | absolute path to `<cwd>/outside/out.theta` | no / **no** / **yes** | identical to row A, message rendering the absolute path |
| C | control, depth 1 — the child's own `tools:` | `../../outside/out.theta` | — / no / no | child AND grandparent: `theta/load/invoke-path-escape` |
| D | control — nothing escapes | — | yes / yes / yes | none |
| E | depth 3 — the great-grandchild's own `tools:` | `../../outside/out.theta` | ggc no / gc no / **child yes** / **gp yes** | great-grandchild and grandchild: `theta/load/invoke-path-escape`; child and grandparent: NONE |

Row C is bug 0248's and bug 0111's landed depth-1 behaviour and is green: the
caller refuses and carries the relocated row. Rows A and B are the same entry
one level deeper, and the top of the chain inverts. Row E shows the pattern is
positional, not depth-2-specific: the two files that refuse are the entry owner
and its immediate caller, and every caller above them registers.

The grandparent's frozen callable entry in rows A and B, byte-identical to the
healthy control D on this fixture set:

```
{"child":{"kind":"theta","mode":"subagent","calleePath":"./b0275scratchch.theta",
  "closureHash":"sha256:13a537bfbd372efa0f018d0ebb502e880d3f31454df289c19ed70029157048bb"}}
```

Hash equality is correct per RFC-0005's closure scope (the child file plus its
transitive `.thetalib` imports, not the grandchild); it is quoted to show that
no caller-side observable separates rows A and B from row D. In rows A and B
the child's registered set is empty, so the callable the grandparent holds
names a file that minted no callable of its own. In row E the child registers a
`grand` callable over a grandchild that did not register.

The drive-time face carries the same gap by construction:
`parseCalleeTheta`'s dispatch gate calls the one predicate with `activeRoots`
`undefined` (`:2614`), and the recursion's containment probe is guarded on that
argument (`:2245`), so no containment judgment runs at that gate at any depth.
The runtime open re-check (INV-1) fires only when the escaping callee is opened
for invocation, which requires the file that names it to have run — and that
file did not register.

## Expected behaviour

`invocation.md:20` places the grandchild inside the grandparent's
static-resolution walk and states what the walk judges at every depth: a named
`.theta` path is checked for existence, readability and containment, and — when
it is in root and readable — for its own parse and its own structural checks,
transitively. The grandchild in rows A, B and E is in root and readable, and it
fails a structural check of its own: its `tools:` entry escapes, so per the same
page's `Resolution` paragraph "a `tools:` `.theta` entry that escapes likewise
fails to register the callable".

`invocation.md:22` then fixes the consequence at each `tools:` edge above it:
the callable cannot be created and the parent does not register. Applied to row
A that is the child (which holds, at HEAD) and the grandparent (which does
not). Applied to row E it is the grandchild, the child and the grandparent, and
only the grandchild holds.

`code-registry-load.md:42` needs no widening: `theta/load/callee-has-errors`
already names this subject on this surface at this severity and is already in
`preEvalCauseOf`'s `tools-resolution` batch (`:316`).
`code-registry-load.md:36` needs no widening either: the escape row belongs to
the entry owner and its immediate caller, where it already lands.

Two registration decisions over one file in one pass must agree — bug 0271
§Fix constraint 1. Rows A, B and E are the disagreement, on the one route bug
0271 recorded rather than admitted.

## Actual behaviour / root cause

`resolveThetaToolsAtLoad` (`:1644`) pre-parses each distinct `.theta` callee
through `parseCalleeForTools` (`:1934`). For the child in rows A and B,
`hasErrors` (`:2032`) is `false` on both limbs: the child's own bytes parse
clean, and `calleeFailsOwnStructuralChecks` (`:2163`) recurses into the
grandchild and answers `false`. The recursion reads the grandchild's escaping
spec, probes containment through `checkInvokePathAtLoad`, and on `escape`
takes `continue` (`:2255–2257`) — the guard's stated purpose is that an
escaping entry's bytes are never parsed. Skipping the parse is required;
skipping the verdict is the defect. Nothing in that arm marks the grandchild as
failing, so the grandchild is judged as passing its own structural checks, the
V15f loop (`:1747–1759`) has no subject at the grandparent, and
`resolveCallableSet` mints the child callable that
`attachLoadTimeClosureHashes` stamps.

The grandchild's real verdict is produced by two other mechanisms, both
one-level: the grandchild's own `runComposePass` iteration (its own file's
escape row, and its own non-registration), and the child's
`checkNestedToolsContainment` (`:2348`) relocating the same verdict onto the
child's file through the escape loop at `:1733`. Neither composes. The
relocation is one level in by construction — it judges the immediate callee's
own entries against the immediate callee's directory — and bug 0271's recursion,
the mechanism that does compose by induction, treats containment as a skip.

The guard's own doc-comment (`:2111–2128`) states this outcome and the reason it
shipped: at recursion level 1 admitting containment would draw a second row for
one condition at the file the relocation already covers, and bug 0271 §Fix
constraint 8 gave that report no authority over the bug 0248 cells that pin
`checkNestedToolsContainment`'s caller-side outcomes (`:2126–2139`). The
withhold is recorded, not owned.

## Why it matters

- The author's load-time report names the escaping entry's owner and that
  owner's immediate caller. Nothing tells the author the grandparent's `tools:`
  entry is dead; `theta/load/callee-has-errors` exists for that message and
  does not fire there.
- The registered callable is exposed to the model
  (`frontmatter-fields-a.md:74`), so the failure surfaces inside a model turn,
  after the grandparent has spent tokens.
- Bug 0271's fix made the error routes compose by induction at every depth. The
  containment route did not, so the two routes now disagree at the same depth
  over the same shape: a broken grandchild refuses the grandparent (0271 cells
  A–C), an escaping-entry grandchild does not (cell (ESC3)).
- Row E shows the silent span grows with the chain: the refusal covers the two
  bottom files whatever the chain length, so every level above them is silent.

## Non-goals

- Bug [0271](./0271-prompt-grandchild-callee-drop-invisible-at-depth-two.md)'s
  landed recursive walk over the error routes (own frontmatter, own parse, own
  `unknown-tool`, own `unresolvable-theta-path`, recursively). Its cells (A),
  (B), (C), (D), (CYC1), (CYC2), (DEPTH3) are green at HEAD and this report
  changes none of them.
- Bug
  [0248](./0248-malformed-escaping-tools-entry-containment-unwitnessed.md)'s
  entry-grammar route, cells (D3)/(D5): an entry that fails `parseToolsEntry` is skipped
  before either containment loop runs, and `theta/load/invoke-path-escape`'s
  Trigger does not name it. This report carries no authority there.
- The depth-1 outcome of an escaping entry (§Reproduction row C) and its
  single-report property (bug 0271 cells (ESC)/(ESC2), bug 0270 cells
  (D)/(D2)/(D3)).
- The containment boundary itself. An out-of-root path's contents are never
  parsed at any depth (`invocation.md:20`), and no route here changes that.
- The runtime open re-check (INV-1) and the load-vs-invocation symlink race.
- The declared-prompt-mode withhold (b) at `:2140–2143`, bug 0267 §Fix-record
  residual 2, unfiled.
- Bug [0268](./0268-load-notes-render-same-file-with-mixed-path-separators.md)'s
  path-separator spelling divergence between the walks.

## Fix

Route not settled here; the constraints are.

1. No silent registration over a callee the same pass un-registers, at any
   depth (bug 0271 §Fix constraint 1, unchanged). Rows A, B and E must red: a
   pass in which the grandparent registers with no grandparent-located
   error-severity row is the defect.
2. One condition, one caller-located row. Bug 0271 cells (ESC)/(ESC2) and bug
   0270 cells (D)/(D2)/(D3) pin exactly one row at the caller's file for one
   escaping entry at depth 1. Any route keeps that outcome, so the widened
   judgment must not fire where the relocation already covers the same file for
   the same entry.
3. Two candidate routes, to be adjudicated against `invocation.md:20` rather
   than around it:
   (a) fold containment into bug 0271's recursion — replace the `continue` at
   `:2256` with a failure verdict, gated so it does not double-report at
   recursion level 1 (the level the relocation covers). The gate is a
   depth-conditional rule and must be stated in the code, not implied by the
   fixture set;
   (b) make each file's OWN containment verdict an input its caller reads —
   the escape verdict becomes part of that file's `hasErrors`, so
   `callee-has-errors` composes by the one rule at every depth and the
   relocation stays the depth-1 report. This route must state how a verdict
   computed at one file's judgment reaches a caller whose `runComposePass`
   iteration may precede it, the same ordering hazard that sank bug 0271 §Fix
   route (a).
   The fix states which it takes and why, and which of the two mechanisms
   (relocation, recursion) owns which depth afterwards.
4. Prefer the existing rows (bug 0271 §Fix constraint 4).
   `theta/load/callee-has-errors` (`code-registry-load.md:42`) is the caller's
   row; `theta/load/invoke-path-escape` (`:36`) stays the entry owner's and its
   immediate caller's. A new code needs a registry row, a `preEvalCauseOf` arm
   and an FN-7 list entry, and must be justified against both existing
   Triggers first.
5. One predicate, both sites (bug 0267 §Fix constraint 3, unchanged).
   `parseCalleeTheta`'s dispatch gate passes `activeRoots` `undefined`
   (`:2614`), so a containment-derived verdict cannot run there as written. The
   fix either supplies that gate an `activeRoots` union and states the
   consequence for the drive-time re-check, or records the divergence
   explicitly in the doc-comment as a withhold with its own reason.
6. Termination and read count. Reuse bug 0271's visited set (`:2172`, `:2237`);
   a member already visited stays a withhold, never a manufactured refusal. The
   containment probe already runs on the bytes that loop read (`:2245–2258`), so
   no route adds a second `fs.readBytes` per spec.
7. Spec. `invocation.md:20` and its `docs/reference/discovery-cli.md:270`
   mirror bound the escaping TARGET's judgment and say nothing about the reach
   of the verdict over the in-root file that names it. The fix either makes the
   implementation propagate that verdict or states the bound in both pages,
   in the same commit.
8. Locks.
   - `tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts` — bug
     0271's 10-cell witness. Cells (A)–(D), (CYC1), (CYC2), (DEPTH3), (ESC) and
     (ESC2) stay green unchanged. Cell (ESC3) (`:897`) is this report's subject
     and flips under this report's authority; its own comment authorises the
     flip ("pinning it keeps a later fix from flipping it silently").
   - `tests/live/b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts`
     — green unchanged.
   - `tests/tools-entry-grammar-derivations-lockstep.test.ts:1347` (D3) and
     `:1434` (D5) — not moved; bug 0248 owns the entry-grammar route
     (`./0248-malformed-escaping-tools-entry-containment-unwitnessed.md`).
   - `tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts`
     — bug 0270's witness, green unchanged.
   - `tests/callee-post-parse-errors-un-register-tools-caller.test.ts` and
     `tests/live/b0267live-callee-post-parse-errors-un-register-tools-caller-live-cell.test.ts`
     — bug 0267's depth-1 statement, green unchanged.
9. The new witness covers §Reproduction rows A, B, C, D and E, so the fix is
   pinned as positional (entry owner plus every caller above it) rather than as
   a depth-2 special case.

## Provenance

Bug 0271's fix record (`.pi/tmp/fixes/0271-report.md`) — "Withheld and
recorded: an escaping grandchild (path-shaped, bug 0111's
`checkNestedToolsContainment` surface … at recursion level 1 admitting it would
double-report, and deeper it is a genuine gap, Residual 1)", the same withhold
as it ships in the predicate's doc-comment
(`src/extension/production-composition.ts:2111–2128`), and its pin as cell
(ESC3). Seventeenth set. Filed at HEAD `1e7e4321`, v0.270.0, from an offline
`composeExtensionInstance` probe over the five conditions tabulated in
§Reproduction.
