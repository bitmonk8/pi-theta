# Bug 0280 — A callee's declared PROMPT mode is never read below depth 1: `calleeFailsOwnStructuralChecksBody`'s stub `resolveThetaCallee` (`production-composition.ts:2480–2482`) returns `mode: "subagent"` for every `.theta` spec at every depth, and its verdict filter (`:2497–2502`) admits only `unknown-tool` and `unresolvable-theta-path`, so a file whose own `tools:` names a prompt-mode theta un-registers on `theta/load/prompt-mode-callable` while every caller above it registers a callable byte-identical to the healthy control, with no row on any of their files

- **Status:** fixed (0.276.0).
- **Sev/Diff estimate:** S3/D2 — S3 on bug
  [0271](./0271-prompt-grandchild-callee-drop-invisible-at-depth-two.md)'s and
  bug [0275](./0275-escaping-tools-entry-below-immediate-callee-silent-at-caller.md)'s
  observable, measured here rather than assumed: in §Reproduction rows B, C and
  E the caller registers a `.theta` callable exposed to model and code
  (`docs/spec_topics/frontmatter/frontmatter-fields-a.md:74`) over a callee the
  same pass un-registers, and the caller's frozen entry — `kind`, `mode`,
  `calleePath`, `closureHash` — is byte-identical to the healthy control D. Not
  S4: the refusal fires as an error-severity row at the namer's own file, one
  or two files below the files that keep registering. Not S1 on the evidence
  available offline: the wrong execution semantics the depth-1 rule exists to
  prevent are not reached through this path, because
  `parseCalleeTheta`'s dispatch gate re-resolves the invoked child's own
  `tools:` through the REAL deps (`:2919` → `:1688`), that resolution rejects
  on `theta/load/prompt-mode-callable` and returns without a `callableSet`
  (`:1849–1851`), and the gate falls back to `EMPTY_CALLABLE_SET` (`:2919`), so
  the child runs with no `grand` callable rather than with a prompt-mode theta
  spawned as a subagent. That is a code read, not a measurement — see
  §Reproduction, "drive-time face".
  D2 because the mechanism 0275 shipped is the one this needs: a per-callee
  component computed in the frame that owns the entry and folded into the deep
  verdict one level up (`:2457`). Two components must move together (the stub's
  `mode`, and the code filter at `:2497–2502`), one spec sentence added by 0271
  must be withdrawn in two documents, and the fix must not disturb the depth-1
  single-report cells or bug 0276's memo taint rule.
- **Kind:** defect — implementation and spec prose. The implementation admits a
  caller over a callee the same pass un-registers, which
  `docs/spec_topics/invocation.md:22` forbids on the `tools:` surface ("the
  callable cannot be created, and the parent theta does not register"). The
  same paragraph's last-but-one sentence, added by bug 0271, states the
  withhold as a rule — "A `.theta` path's own declared mode is outside this
  walk at every depth" (`invocation.md:20`, mirrored at
  `docs/reference/discovery-cli.md:270`) — so the two sentences disagree with
  each other about the measured rows, and the prose half of any fix is the
  withdrawal of that sentence, not its reinterpretation.
- **Affected** (every citation re-derived at HEAD `2c913396`, v0.274.0;
  `src/extension/production-composition.ts` is 3566 lines at HEAD and the 0275
  merge rewrote 215 of its lines (154 insertions, 61 deletions), concentrated
  below `:2100`, so cite by symbol first — line cites in bugs
  0267/0270/0271/0275 for this region are stale):
  - `src/extension/production-composition.ts:2480–2482` — the stub
    `resolveThetaCallee` inside `calleeFailsOwnStructuralChecksBody`'s
    `stubDeps` (`:2461`): `readable.get(thetaPath) === false ? undefined : {
    kind: "theta", mode: "subagent", callee: undefined, calleePath: thetaPath
    }`. The `mode` component is a constant. This is the seam: the recursion's
    view of every `.theta` entry below depth 1 is subagent-mode by
    construction.
  - `src/extension/production-composition.ts:2216–2220` — that stub's own
    doc-comment naming this report's subject: "(b) a grandchild's declared
    PROMPT mode (`theta/load/prompt-mode-callable`) — the stub below still
    reports `subagent` unconditionally for every `.theta` spec, at every depth
    (bug 0267 §Fix-record residual 2, unfiled)."
  - `src/extension/production-composition.ts:2497–2502` — the frame's verdict
    filter: `result.diagnostics.some(d => d.severity === "error" && (d.code ===
    "theta/load/unknown-tool" || d.code ===
    "theta/load/unresolvable-theta-path"))`. A SECOND independent barrier: even
    a stub that read the real mode would raise
    `theta/load/prompt-mode-callable` into `result.diagnostics` and this filter
    would drop it.
  - `src/extension/production-composition.ts:2457` — the deep-verdict fold
    `grandchildFails.set(spec, recursive.fails || recursive.ownEscapes)`, bug
    0275's mechanism for carrying a frame-local component to every caller
    above. There is no mode component to fold.
  - `src/extension/production-composition.ts:2304` —
    `calleeFailsOwnStructuralChecksBody`, the recursive predicate; `:2576` its
    boolean-returning entry point; `:2518`
    `calleeFailsOwnStructuralChecksWithTaint`, bug 0276's memo wrapper.
  - `src/extension/production-composition.ts:1826–1835` — the REAL
    `resolveThetaCallee` used at depth 1 by `resolveThetaToolsAtLoad`
    (`:1688`), returning `mode: callee.mode` from the parsed callee. `:2076`
    is where that real mode is read (`mode: document.frontmatter.mode` in
    `parseCalleeForTools`, `:1978`). Depth 1 reads the frontmatter; no depth
    below it does.
  - `src/extension/production-composition.ts:1791–1802` — the V15f
    `theta/load/callee-has-errors` loop, gated on `callee.hasErrors`. It is the
    site that would carry the caller's row and has no subject in rows B, C
    and E.
  - `src/extension/production-composition.ts:2849` — `parseCalleeTheta`, the
    drive-time dispatch gate, calling the same predicate (`:2879–2894`) and
    therefore inheriting the same blind spot; `:2919` its
    `toolResult.callableSet ?? EMPTY_CALLABLE_SET` fallback.
  - `src/parser/callable-set.ts:422–433` — `resolveEntry`'s prompt-mode arm:
    `if (resolved.mode === "prompt")` → error `theta/load/prompt-mode-callable`
    with the registry message. One implementation, reached with a real mode at
    depth 1 and with the constant below it.
  - `docs/spec_topics/invocation.md:20` (`#static-resolution`) — the transitive
    walk ("its own parse and its own structural checks in turn, transitively,
    to whatever depth the `tools:` graph reaches"), the 0275 composition rule
    ("the own-structural-check failure composes into
    `theta/load/callee-has-errors` at every caller above that immediate
    caller"), and the withheld exception "A `.theta` path's own declared mode
    is outside this walk at every depth" (added by 0271, `1e7e4321`).
  - `docs/spec_topics/invocation.md:22` — the per-surface severity rule the
    callers' registration crosses.
  - `docs/reference/discovery-cli.md:270` — the same wording's mirror,
    including the same final sentence.
  - `docs/spec_topics/diagnostics/code-registry-load.md:30` —
    `theta/load/prompt-mode-callable`, `E`, load; Trigger "`tools:` `.theta`
    entry points at a prompt-mode theta file."; Message "`'tools:' entry
    '<path>' points at a prompt-mode theta; only subagent-mode thetas are
    permitted`". The Trigger names the ENTRY, not the depth of the file
    declaring it. Row `:42` is `theta/load/callee-has-errors`, `E` on the
    `tools:` surface, already ERR-6-classified in `preEvalCauseOf`
    (`src/extension/production-composition.ts:299`, arms at `:312` and `:317`).
  - `docs/spec_topics/frontmatter/frontmatter-fields-a.md:74` — `tools`
    declares the callable set exposed "from both the model … and from theta
    code", and `:79` states the depth-1 rule the entries must satisfy: entries
    "must point at **subagent-mode** theta files — a prompt-mode callee in
    `tools:` is `theta/load/prompt-mode-callable`".
  - `tests/production-tools-load-resolution.test.ts:904–921` and
    `tests/callable-set.test.ts:128–152` — the landed depth-1 pins (the parent
    un-registers; the registry message surfaces). Both stay green under every
    route below.
  - `tests/nested-tools-entry-containment.test.ts:729–743` — bug 0111's
    non-co-fire cell, which asserts `theta/load/prompt-mode-callable` does NOT
    accompany a containment rejection at a nested chain. It constrains a fix:
    an entry rejected on its path must still not draw a mode row.
  - No cell in the tree pins the current below-depth-1 disposition — unlike bug
    0275's subject, which cell (ESC3) of
    `tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts` pinned
    as an explicit withhold. Searched: the four `tests/*.ts` files naming
    `theta/load/prompt-mode-callable` all judge depth 1 or its absence.
- **Observed at:** HEAD `2c913396`, v0.274.0, `main`, by one offline
  provider-free probe driving `composeExtensionInstance` over host doubles
  (token `b0280scratch`, removed after measurement).

## Summary

At depth 1 a `tools:` entry naming a prompt-mode `.theta` is an error: the
entry's owner does not register and carries
`theta/load/prompt-mode-callable` at its own file. That holds at every depth,
because the file that names such an entry is judged by its own
`runComposePass` iteration wherever it sits in the chain.

What does not hold is the composition of that verdict upward. Bug 0271 made a
callee's own structural checks visible to its callers by recursing through
`calleeFailsOwnStructuralChecksBody`, and bug 0275 made a frame-local component
compose to every caller above the immediate one. The recursion resolves each
`.theta` spec through a stub whose `mode` is the constant `"subagent"`
(`:2480–2482`), so no depth below 1 can see a prompt-mode declaration; and the
frame's verdict filter admits only two codes (`:2497–2502`), so the rejection
could not become a verdict even if the stub reported it.

Measured: the file naming the prompt-mode callee un-registers, and every caller
above it registers a callable byte-identical to the healthy control's, carrying
no row on its own file. At depth 2 that is one silent caller; at depth 3 it is
two. The caller's mode is irrelevant — a prompt-mode and a subagent-mode root
behave identically (rows B and E).

## Reproduction

Plant the files under `<cwd>/.pi/theta/` with a `{}` `.pi/settings.json`, then
run `composeExtensionInstance(pi, ctx, undefined, new RendererGate())` over
host doubles with `ctx.cwd` = the workspace, reading `wiring.thetas` for the
registration decisions and each theta's frozen `callableSet.entries` for the
callable list. Diagnostics are read off the `theta-system-note` channel
(`details.diagnostics`).

Shapes (`<label>` distinguishes the files):

- prompt-mode file: `---\nmode: prompt\ndescription: d\n[tools:\n  - <spec> as
  <alias>\n]---\n@`hi`\n`
- subagent-mode file: `---\nmode: subagent\ndescription: d\n[tools:\n  - <spec>
  as <alias>\n]---\nlet a = 1\n`

| # | chain (root first) | registers | error rows |
|---|---|---|---|
| A | control, depth 1 — prompt root → **prompt** child | child only; **root refused** | `theta/load/prompt-mode-callable` at the ROOT's file |
| B | prompt root → subagent child → **prompt** grandchild | grandchild and **root**; child refused | `theta/load/prompt-mode-callable` at the CHILD's file; root: NONE |
| C | prompt root → subagent child → subagent grandchild → **prompt** great-grandchild | great-grandchild, **child** and **root**; grandchild refused | `theta/load/prompt-mode-callable` at the GRANDCHILD's file; child and root: NONE |
| D | control — prompt root → subagent child → subagent grandchild | all three | none |
| E | **subagent** root → subagent child → **prompt** grandchild | grandchild and **root**; child refused | identical to row B |

Row A is the landed depth-1 control: the namer refuses and carries the single
row, exactly as `frontmatter-fields-a.md:79` and
`code-registry-load.md:30` state. Rows B, C and E are the same entry one and
two levels deeper, and every file above the namer inverts.

The root's frozen callable entry in rows B, C and E, byte-identical to the
healthy control D on this fixture set (the child's own file is unchanged across
those rows, and RFC-0005's closure scope covers the child plus its transitive
`.thetalib` imports, not the grandchild):

```
{"child":{"kind":"theta","mode":"subagent","calleePath":"./b0280scratchchild.theta",
  "closureHash":"sha256:a01e73b7923bd7b70e02aaf67fa8a7e2f1056eedf995ee6eb3b4c8e034938919"}}
```

In row C the CHILD likewise registers a `grand` callable over a grandchild that
did not register. No caller-side observable separates rows B/C/E from row D.

Note the diagnostic count: exactly one error row lands in each of rows B, C and
E, and it names the grandchild (or great-grandchild) path at the namer's file.
The author reading the report sees a refused middle file and a registered root
whose `child` callable is dead.

**Drive-time face — unmeasured offline.** Whether an invocation of the root's
`child` callable reaches the prompt-mode grandchild as if it were a subagent
needs a driven session, which this probe does not build. The code path at HEAD:
`parseCalleeTheta` (`:2849`) admits the child (the same predicate, same blind
spot), then re-resolves the child's own `tools:` through the real deps
(`:2919` → `resolveThetaToolsAtLoad`, `:1688` → `parseCalleeForTools`, `:1978`,
which reads the real `mode` at `:2076`); that resolution raises
`theta/load/prompt-mode-callable`, sets `registered` false and returns without
a `callableSet` (`:1849–1851`), and the gate substitutes `EMPTY_CALLABLE_SET`
(`:2919`). On that reading the invoked child holds no `grand` callable and the
prompt-mode grandchild is not spawned as a subagent; the drive-time failure is
a missing callable inside a child the load pass said would not register. This
report is scoped to the load-time silence and makes no claim the drive-time
face is measured.

## Expected behaviour

`invocation.md:20` places the grandchild inside the root's static-resolution
walk and states what the walk judges at every depth: existence, readability,
containment, and — when the path is in root and readable — "its own parse and
its own structural checks in turn, transitively, to whatever depth the `tools:`
graph reaches". A `tools:` entry naming a prompt-mode theta is a structural
check of the file that declares it: `frontmatter-fields-a.md:79` makes it a
requirement on that file's entries, and the pass records the failure at that
file (rows B, C, E).

`invocation.md:22` then fixes the consequence at each `tools:` edge above it:
the callable cannot be created and the parent theta does not register. Applied
to row B that is the root; to row C the child and the root. Applied to row A it
is the root alone, which holds at HEAD.

The rule 0275 codified in the same paragraph — an own-structural-check failure
"composes into `theta/load/callee-has-errors` at every caller above that
immediate caller, however far below such a caller the escaping entry sits" — is
the shape expected here, with the namer keeping its own single
`theta/load/prompt-mode-callable` row and every caller above it carrying
`theta/load/callee-has-errors`.

The sentence "A `.theta` path's own declared mode is outside this walk at every
depth" (`invocation.md:20`, `discovery-cli.md:270`) states the current
implementation and contradicts both of the above for the measured rows. It is
prose to withdraw, not a rule to satisfy.

No new registry row is needed. `theta/load/prompt-mode-callable`
(`code-registry-load.md:30`) stays the namer's row;
`theta/load/callee-has-errors` (`:42`) already names the callers' subject at
the right severity and is already in `preEvalCauseOf`'s `tools-resolution`
batch.

Two registration decisions over one file in one pass must agree — bug 0271
§Fix constraint 1. Rows B, C and E are the disagreement.

## Actual behaviour / root cause

`resolveThetaToolsAtLoad` (`:1688`) pre-parses each distinct `.theta` callee
through `parseCalleeForTools` (`:1978`), which reads the callee's real declared
mode (`:2076`) and hands it to the real `resolveThetaCallee`
(`:1826–1835`) — that is the depth-1 path, and row A is green because of it.
The same function computes `hasErrors` as `hasLoadParseError(...) ||
failsPostParseChecks`, and `failsPostParseChecks` is
`calleeFailsOwnStructuralChecks` (`:2576`), bug 0271's recursive predicate.

Inside that recursion (`calleeFailsOwnStructuralChecksBody`, `:2304`) the
frame's own `tools:` list is resolved through `stubDeps` (`:2461`), whose
`resolveThetaCallee` (`:2480–2482`) discriminates one condition only —
readability, bug 0270's route — and returns `mode: "subagent"` for every
readable spec. `resolveEntry` (`src/parser/callable-set.ts:422`) tests
`resolved.mode === "prompt"`, which the constant makes unreachable, so
`theta/load/prompt-mode-callable` is never raised at any depth below 1.

A second barrier sits behind it. The frame's verdict (`:2497–2502`) is
`result.diagnostics.some(d => d.severity === "error" && (d.code ===
"theta/load/unknown-tool" || d.code === "theta/load/unresolvable-theta-path"))`
OR'd with the deep verdicts in `grandchildFails`. The mode code is not in that
list, so a stub returning the real mode would still produce
`fails: false` for the frame. Both components must move for a fix to hold.

Consequently `parseCalleeForTools`'s `hasErrors` is `false` for the child in
row B, the V15f `callee-has-errors` loop (`:1791–1802`) has no subject at the
root, and `resolveCallableSet` mints the `child` callable that
`attachLoadTimeClosureHashes` stamps. The child's own real verdict is produced
by its own `runComposePass` iteration, which reads the grandchild through the
REAL `parseCalleeForTools` path and refuses — the two decisions about the same
file in the same pass, disagreeing.

The withhold is recorded in code at `:2216–2220` and in prose at
`invocation.md:20`. Bug 0267 §Fix-record residual 2 and bug 0275 §Fix-record
residual 1 both name it as unfiled filing material; bug 0275 §Non-goals
excludes it explicitly ("The declared-prompt-mode withhold (b) …, bug 0267
§Fix-record residual 2, unfiled"). No open report owns it.

## Why it matters

- The author's load-time report names one file — the one that declared the bad
  entry. Nothing tells the author the root's `tools:` entry is dead;
  `theta/load/callee-has-errors` exists for that message and does not fire.
- The registered callable is exposed to the model
  (`frontmatter-fields-a.md:74`), so the failure surfaces inside a model turn,
  after the root has spent tokens.
- The silent span grows with the chain (row C: two levels), and it is
  positional, not depth-2-specific.
- The three routes bugs 0267/0270/0271/0275 landed now compose by induction at
  every depth. Mode does not, so the same fixture shape draws opposite
  dispositions depending on which rule the callee broke — the disagreement
  class bug 0248 named.
- The spec sentence added by 0271 makes the divergence self-consistent on
  paper, so a reader checking behaviour against the page finds no defect. That
  is the prose half of this report.

## Non-goals

- Bug [0275](./0275-escaping-tools-entry-below-immediate-callee-silent-at-caller.md)'s
  landed containment composition (`ownEscapes`, the deep fold at `:2457`, the
  single relocated escape row at depth 1). Its rows are green at HEAD and no
  route here changes them.
- Bug 0267's remaining residuals: the `parseCalleeTheta` dispatch gate's
  `activeRoots: undefined` (0275 §Fix-record residual 2 — no containment
  component at the drive-time re-check), and the callee's own `tools:`
  entry-grammar rejections held by bug
  [0248](./0248-malformed-escaping-tools-entry-containment-unwitnessed.md)
  cells (D3)/(D5).
- The divergence between the load-time registration and the drive-time
  re-check recorded in bug 0275's fix record: this report neither widens nor
  narrows what `parseCalleeTheta` judges beyond the shared predicate, and its
  drive-time face is unmeasured (§Reproduction).
- The depth-1 disposition itself (`tests/callable-set.test.ts:128–152`,
  `tests/production-tools-load-resolution.test.ts:904–921`) and the
  non-co-fire rule at a containment-rejected chain
  (`tests/nested-tools-entry-containment.test.ts:729–743`).
- `subagent fn` bodies, which FN-8 (`docs/spec_topics/functions.md:72`)
  exempts from `theta/load/prompt-mode-callable` by construction.
- Bug [0276](./0276-depth-walk-revisits-shared-subtrees-exponentially.md)'s
  memo, except as the constraint below.

## Fix

Route not settled here; the constraints and the two candidate routes are. No
ordering dependency: bugs 0267, 0270, 0271 and 0275 are all shipped at HEAD,
and this report builds on 0275's landed shape.

Route (a) — **the stub reads the real mode.** Extend the pre-resolution probe
that already populates `readable` (the map consulted at `:2481`) to record each
readable spec's parsed frontmatter `mode`, and return it from the stub
(`:2480–2482`) instead of the constant. `resolveEntry`
(`callable-set.ts:422–433`) then raises `theta/load/prompt-mode-callable` at
every depth from the one implementation that raises it at depth 1, and the
frame's filter (`:2497–2502`) admits that code as a third disjunct. Pins: the
message and severity cannot diverge between depths, because one code site
produces both; the depth-1 rows are untouched because depth 1 does not use this
stub.

Route (b) — **the walk judges mode directly.** Read the already-parsed
`document.frontmatter.mode` in the recursion's per-entry loop (beside the
`grandchildFails.set(spec, true)` arm at `:2431`) and set the entry's verdict
without going through `resolveCallableSet` at all. Pins: the verdict does not
depend on which diagnostics `resolveCallableSet` happens to produce, and the
filter at `:2497–2502` stays a two-code list. Costs: the mode rule then has two
implementations, and the divergence bug 0248 named becomes possible between
them.

Constraints on either route:

1. No silent registration over a callee the same pass un-registers, at any
   depth (bug 0271 §Fix constraint 1). Rows B, C and E must red: a pass in
   which a caller registers with no caller-located error-severity row is the
   defect.
2. Exactly one row at the namer. Row A's single
   `theta/load/prompt-mode-callable` at the entry owner's file, and the
   depth-1 cells that pin it, must not gain a second row; callers above the
   namer carry `theta/load/callee-has-errors`, not a second mode row (0275
   §Fix constraint 2's shape).
3. Branch-independence, or the verdict is untaintable. Bug 0276's memo
   (`src/extension/pass-verdict-memo.ts`) stores a verdict keyed by
   `(getAllTools, activeRoots, path)` byte-guarded by the callee's bytes, and
   may only store verdicts computed with `consultedVisited === false`. A
   declared mode is a pure function of the file's own bytes — like
   `ownEscapes`, unlike a visited-set consultation — so folding it into `fails`
   (route (b)) or into the frame's diagnostics (route (a)) needs no new memo
   dimension and no new taint component. Bug 0275 §Fix constraint 2 records the
   same argument for `ownEscapes`; a route that makes the mode verdict depend
   on which branch reached the file breaks the memo's soundness argument.
4. Containment precedes content. An entry rejected on its path must still not
   draw a mode row (`tests/nested-tools-entry-containment.test.ts:729–743`);
   the escape arm's neutral `mode: "subagent"` at `:2034` exists for that and
   stays.
5. Both faces move together. `parseCalleeTheta`'s dispatch gate calls the same
   predicate (bug 0267 §Fix constraint 3), so the load-time registration and
   the drive-time re-check cannot be allowed to diverge in opposite directions
   over the same callee.
6. Prose: withdraw "A `.theta` path's own declared mode is outside this walk at
   every depth" from `docs/spec_topics/invocation.md:20` and
   `docs/reference/discovery-cli.md:270`, and state the composition in the
   0275 form. No new registry row; `code-registry-load.md:30` and `:42` are
   both already correct for their halves.
7. Witness: the current disposition is pinned by no cell (unlike 0275's
   (ESC3)), so a route lands with new cells rather than a flip — one per
   §Reproduction row, with the healthy control D and the depth-1 control A in
   the same file so a route cannot pass by refusing everything.

## Provenance

Bug 0267 §Fix-record residual 2 ("The same shape for a prompt-mode grandchild
callee (`theta/load/prompt-mode-callable` at the callee, caller registers).
Measured in the same probe. Filing material.") and bug 0275 §Fix-record
residual 1 ("Withhold (b) — a grandchild's declared PROMPT mode
(`theta/load/prompt-mode-callable`) is still never read at any depth; the stub
reports `subagent` unconditionally. Unchanged by this report (§Non-goals),
still unfiled; bug 0267 §Fix-record residual 2."), plus bug 0271 §Non-goals
("A prompt-mode grandchild (`theta/load/prompt-mode-callable` at the child) —
bug 0267 §Fix-record residual 2, unfiled"): recorded three times, owned by no
report. Eighteenth session. Filed at HEAD `2c913396`, v0.274.0, from one
offline `composeExtensionInstance` probe over the five rows tabulated in
§Reproduction plus a read of the two call paths at `:1826` and `:2480`.

## Fix (0.276.0)

- What shipped: `src/extension/production-composition.ts` — §Fix route (a): the
  pre-resolution loop inside `calleeFailsOwnStructuralChecksBody` records each
  readable-and-parsed spec's declared frontmatter `mode` (from the `document`
  the loop already produces for `grandchildFails`, no second `fs.readBytes`,
  no reordering of read/containment/parse), the frame's stub
  `resolveThetaCallee` returns that recorded mode instead of the constant
  `"subagent"`, and the frame's verdict filter admits
  `theta/load/prompt-mode-callable` as a third code. A spec that is unreadable
  or that escapes containment never enters the map, so the escape arm keeps its
  neutral subagent-mode default (§Fix constraint 4).
  `docs/spec_topics/invocation.md` and `docs/reference/discovery-cli.md` —
  §Fix constraint 6: the sentence "A `.theta` path's own declared mode is
  outside this walk at every depth", added by bug 0271, is withdrawn in both
  documents and replaced by the 0275-composition form (the file naming the
  entry carries `theta/load/prompt-mode-callable` at its own file; the failure
  composes into `theta/load/callee-has-errors` at every caller above that
  file). No registry row changed:
  `docs/spec_topics/diagnostics/code-registry-load.md:30`'s Trigger names the
  entry with no depth restriction and already covers every depth, and `:42`
  already names the callers' subject.
- Memo composition (§Fix constraint 3): the mode a frame reads is
  `document.frontmatter.mode` of the callee's OWN bytes, so it is a pure
  function of those bytes — branch-independent exactly as `ownEscapes` is. The
  `{ fails, ownEscapes }` pair bug 0276's `pass-verdict-memo.ts` stores on its
  depth-free key therefore stays branch-independent under this change: no new
  memo dimension, no new taint component, and the visited-set skip still taints
  before any parse is skipped, so a verdict computed without a mode read is
  never stored.
- Gates: witness `npx vitest run
  tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts` → red at
  HEAD `3 failed | 2 passed (5)` (cells B/C/E: "the caller must not register
  over a callee this same pass un-registers"), green after `5 passed (5)`.
  Default suite `npm test` → `453 passed (453)` files, `9333 passed (9333)`
  tests. `npm run typecheck` clean, `npm run lint` clean. Live:
  `npx vitest run --config config/vitest/vitest.live.config.ts
  tests/live/b0280live-prompt-mode-below-immediate-callee-live-cell.test.ts` →
  `Test Files 1 passed (1)`, run under the cross-lane live lock.
  `tests/fixtures/h7a/permitted-codes.json` byte-unchanged.
- Review: 2 rounds. Round 1 (deep) — two findings, both non-executable: a
  dangling "that immediate caller" antecedent in the new spec sentence whose
  nearest reading restated the pre-fix behaviour, and a doc-comment that still
  bounded the verdict filter at two codes while narrating withhold (b) as a
  state transition. Round 2 — polish applied to comments and spec prose only;
  verified by gate-diff (the executable diff is byte-identical to the reviewed
  one) with the suite, typecheck and lint green, so the confirmation round was
  skipped.
- Verification: SOLID. Witness reds under two independent neutralisations (the
  stub's mode reverted to the constant; the third verdict disjunct dropped),
  each reding exactly cells B/C/E with the filed signature and leaving controls
  A and D green; both restores byte-exact
  (`git hash-object` → `909d80453db63bc6826a05f3779de5cf89bbcaeb` before and
  after each cycle). Default suite green. Lint and typecheck green. Live cell
  read for coverage of the fixed path, no silent skip, no verbatim-echo
  discriminator; its run was performed by the orchestrator under the lock.
  Pinned-witness sweep: bugs 0275, 0271, 0270, 0267, 0248 and 0276's witnesses
  all unmoved — §Affected's claim that no cell pins the current below-depth-1
  disposition holds as measured.
- Residuals: none of this report's own. §Non-goals stand unchanged: the
  dispatch gate's `activeRoots: undefined` (bug 0275 §Fix-record residual 2),
  the entry-grammar rejections held by bug 0248 cells (D3)/(D5), and the
  drive-time face this report left unmeasured — the load-time registration is
  what moved, and `parseCalleeTheta` inherits the widened predicate through the
  same call, so the two faces move together (§Fix constraint 5) without this
  report widening drive-time semantics.
- Discharge notes appended: `docs/bugs/0271-prompt-grandchild-callee-drop-invisible-at-depth-two.md`
  (the withdrawal of the sentence 0271's fix added).
- Pinned dispositions / non-goals: the depth-1 disposition
  (`tests/callable-set.test.ts:128–152`,
  `tests/production-tools-load-resolution.test.ts:904–921`) and the
  non-co-fire rule at a containment-rejected chain
  (`tests/nested-tools-entry-containment.test.ts:729–743`) are unchanged and
  green.
