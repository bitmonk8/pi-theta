# Bug 0302 — The IMP-5 cycle graph keys nodes by `.thetalib` basename stem, not resolved path, so two distinct files named `util.thetalib` in different directories are one graph node: a stem-twin import draws a false `theta/load/import-cycle: util.thetalib → util.thetalib` on an acyclic program, and a stem-twin sibling edge overwrites the node's target list so a real `x → a/util → x` cycle loads with zero diagnostics

- **Status:** open.
- **Sev/Diff estimate:** S2/D2 — S2 on both directions: the false-positive
  direction refuses a valid two-file program with a diagnostic naming a cycle
  the source does not contain (wrong-diagnostic class), and the masked
  direction silently admits an input class imports.md `:122` prescribes an `E`
  refusal for. Not S1: the masked cycle produces no wrong runtime value
  (`.thetalib` files carry no initialisation order, and `materializeChain`'s
  visited set bounds materialisation independently), so the harm is a withheld
  mandated refusal plus a false refusal, not a corrupted result. D2: the fix
  is keying `graphEdges` / `entryStems` by resolved path instead of
  `thetalibStem` inside `checkThetaImports` and rendering the printed stems
  from the path-keyed cycle at the end; `detectImportCycle` itself is
  node-id-agnostic, no new code is minted, one witness file is owed.
- **Kind:** defect — imports.md `:122` prescribes cycle detection "by walking
  the static `.thetalib` graph" whose nodes are `.thetalib` **files**
  ("Import cycles between `.thetalib` files"); the implementation collapses
  every file sharing a basename stem into one node, so the walked graph is not
  the static file graph whenever two reachable libs share a basename.
- **Related:**
  - [0101](./0101-from-bearing-reexport-materialises-nothing.md) —
    fixed (0.141.0); widened this same walk's edge set to `export … from`
    edges. Its §Fix residual 4 records that the printed cycle path rotates
    with import-statement order; this report is about the graph's NODE
    identity, not the printed rotation, and both false verdicts here occur
    with plain `import` edges only.
- **Affected** (citations verified at `bc52da38`, v0.287.0):
  - `src/extension/import-static-checks.ts:97–100` — `thetalibStem`: basename
    minus `.thetalib`, documented as "the cycle-graph node id".
  - `src/extension/import-static-checks.ts:385–415` — `walkThetaLib`. `:390`
    computes the node id from the stem; `:409` pushes the TARGET as
    `thetalibStem(load.resolvedPath)`; `:414` `graphEdges.set(stem, targets)`
    — a second file with the same stem OVERWRITES the first file's target
    list. The `walked` guard (`:386–389`) is keyed by resolved path, so both
    twins are walked and both write the same map key.
  - `src/extension/import-static-checks.ts:650` — `entryStems.push(thetalibStem(resolvedPath))`.
  - `src/extension/import-static-checks.ts:806–815` — the IMP-5 loop:
    `detectImportCycle(entry, graph, …)` per entry stem, first hit breaks.
  - `src/parser/imports.ts:651–654` — `ThetaLibImportGraph`: "edges maps each
    file stem to the stems it imports". `:663–710` `detectImportCycle`, a
    straight DFS over whatever node ids the map carries; `:643–645`
    `importCycleMessage` renders each node as `<stem>.thetalib`.
  - `docs/spec_topics/imports.md:122` — §Cycles: cycles "between `.thetalib`
    files", detected "by walking the static `.thetalib` graph".
  - `docs/spec_topics/diagnostics/code-registry-load.md:43` — the
    `theta/load/import-cycle` row: "Static walk of the `.thetalib` graph …
    discovers a cycle."
- **Observed at:** `0.287.0` (`bc52da38`). Offline, deterministic; no live
  model. Scratch vitest driving the real `parseThetaDocument` and the real
  `checkThetaImports` over an in-memory `FileSystem` double (the
  `tests/reexport-chain-resolution.test.ts` harness shape); written, run,
  deleted.

## Summary

`walkThetaLib` builds the IMP-5 cycle graph with `thetalibStem` — the file
basename minus `.thetalib` — as the node id, while every other identity in the
same pass (the `walked` set, the `parseCache`, `closedOver`,
`materializeChain`'s visited set) is the resolved path. Relative imports make
same-basename libs in different directories ordinary input
(`./a/util.thetalib`, `./b/util.thetalib`), and for such input the stem-keyed
graph is wrong in both directions:

1. An edge between two DIFFERENT files that share a stem becomes a self-loop:
   `theta/load/import-cycle: util.thetalib → util.thetalib` fires on an
   acyclic program, which does not register.
2. Two same-stem files write the same `graphEdges` key, and the later
   `graphEdges.set(stem, targets)` overwrites the earlier file's target list —
   deleting real edges. A genuine `x → a/util → x` cycle loads with zero
   diagnostics when `x` also imports a second lib named `util.thetalib`.

## Reproduction

Offline at `bc52da38`. Importing file `/proj/app.theta` (frontmatter
`model: "sonnet"` + `mode: prompt`); `diags` is
`checkThetaImports(...).diagnostics`.

### False positive — acyclic program refused

```
@@ app        import { f } from "./util.thetalib"
   /proj/util.thetalib      import { g } from "./sub/util.thetalib"
                            fn f(x: integer): integer { x }
   /proj/sub/util.thetalib  fn g(x: integer): integer { x }
   app parse :: []
   diags     :: ["error theta/load/import-cycle: import cycle:
                  util.thetalib → util.thetalib"]
```

Two files, one edge, no cycle. The theta does not register (error-severity
load diagnostic). The printed path names one basename for two files and is
unactionable as written.

### False negative — real cycle masked by the stem-twin overwrite

```
@@ app        import { xf } from "./x.thetalib"
   /proj/x.thetalib        import { af } from "./a/util.thetalib"
                           import { bf } from "./b/util.thetalib"
                           fn xf(k: integer): integer { k }
   /proj/a/util.thetalib   import { xf } from "../x.thetalib"     ← real cycle x → a/util → x
                           fn af(k: integer): integer { k }
   /proj/b/util.thetalib   fn bf(k: integer): integer { k }
   app parse :: []
   diags     :: []                                                ← cycle admitted silently
```

Removing the stem twin restores the mandated refusal (control):

```
@@ same fixture minus the `import { bf } …` line and b/util.thetalib
   diags :: ["error theta/load/import-cycle: import cycle:
              x.thetalib → util.thetalib → x.thetalib"]

@@ distinct-stem control (x ↔ y)
   diags :: ["error theta/load/import-cycle: import cycle:
              x.thetalib → y.thetalib → x.thetalib"]
```

Walk order derivation for the masked row: `walkThetaLib(x)` processes
`a/util` first — its recursion sets `graphEdges["util"] = ["x"]` — then
`b/util`, whose recursion sets `graphEdges["util"] = []`, deleting the
back-edge; `detectImportCycle("x")` then walks `x → util → (nothing)`.

A self-import (`self.thetalib` importing itself) and the plain two-file cycle
are detected correctly (measured), so the defect is confined to stem
collisions.

## Expected behaviour

- `docs/spec_topics/imports.md:122`: "Import cycles between `.thetalib`
  files are detected at parse time by walking the static `.thetalib` graph …
  and reported as `theta/load/import-cycle` with the cycle path printed." The
  static graph's nodes are files; `/proj/util.thetalib` and
  `/proj/sub/util.thetalib` are two files with one edge between them, which
  is acyclic, and `x.thetalib → a/util.thetalib → x.thetalib` is a cycle
  regardless of what else `x` imports.
- `docs/spec_topics/diagnostics/code-registry-load.md:43` — the row's Trigger
  is "discovers a cycle"; the false-positive row discovers none.

## Actual behaviour / root cause

`thetalibStem` (`src/extension/import-static-checks.ts:97–100`) is the graph
node id. `walkThetaLib` walks per resolved path (`walked`, `:386–389`) but
writes per stem (`graphEdges.set(stem, targets)`, `:414`) and records targets
as stems (`:409`). Two consequences:

- Any resolvable edge whose source and target files share a stem becomes a
  self-loop on that stem's node — the false positive.
- Two files sharing a stem race for one map key; the later
  `graphEdges.set` replaces the earlier target list wholesale — the mask.
  Which file writes last is walk order, i.e. import-statement order, so the
  verdict for one file set can also depend on statement order (the property
  bug 0101's fixpoint was introduced to remove on the name side).

`detectImportCycle` (`src/parser/imports.ts:663`) is a correct DFS over the
map it is given; the defect is entirely in the map's key space.

## Why it matters

- A valid, ordinary layout — shared helper libs named `util.thetalib` /
  `schemas.thetalib` per directory, exactly what relative `../` imports are
  for — is refused at load with a message naming a cycle that does not exist,
  and the message's stem rendering gives the author no way to see which two
  files are meant.
- The masked direction silently withholds an `E`-severity refusal the spec
  mandates, and whether it is withheld depends on import-statement order.
- Every sibling identity in the same pass (parse cache, re-export closure,
  materialisation) is path-keyed; the cycle graph is the one stem-keyed
  reader, so the walks disagree about what the graph is.

## Non-goals

- The printed cycle path's rotation with import order (0101 §Fix residual 4)
  and its stem-only rendering. A path-keyed graph can keep rendering stems in
  the message; whether the message should disambiguate same-stem files is a
  registry/DIAG-4 question this report does not adjudicate.
- The transitive-lib diagnostic discard in the same walk (`walkThetaLib`
  drops `load.diagnostics` at `:404–408`) — filed separately (candidate 03).

## Fix

Key the graph by resolved path: `graphEdges: Map<resolvedPath, resolvedPath[]>`,
`entryStems` → entry resolved paths, and render the message stems from the
cycle's paths at emission (`importCycleMessage` already takes a stem list; map
paths → stems only for printing). `detectImportCycle` needs no change — its
node ids are opaque. One decision to state in the fix: whether the printed
`<A>.thetalib` placeholders stay bare stems (registry row
`code-registry-load.md:43` fixes the message shape; two same-stem files in one
cycle would then print identical labels) or gain a disambiguating directory
prefix, which is a DIAG-4 message change. Witness cells: the three
reproduction rows above plus the self-import and two-file-cycle controls.

## Provenance

- Hunt seed: imports-graph area brief, hypothesis 1 (cycle reachability) and
  8 (same-basename spellings).
- Implementation reading: `src/extension/import-static-checks.ts` (walk and
  IMP-5 loop), `src/parser/imports.ts` (`detectImportCycle`,
  `ThetaLibImportGraph`).
- Probes: scratch vitest `tests/scratch-imports-graph.test.ts` cells A1, A2,
  A2b, A3, E4 at `bc52da38`; outputs quoted verbatim above; file deleted per
  scratch policy. No non-scratch file modified.
