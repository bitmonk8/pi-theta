# Bug 0446 — A from-bearing `export { X } from "…"` NESTED inside an `if`/`fn` body is wholly inert with zero diagnostics in BOTH hosts: in a `.theta` it escapes `checkExportInTheta` (top-level walk only), and in a `.thetalib` `fn` body it escapes the top-level-form rule, the re-export closure, and IMP-1 alike — while its SHAPE faults (malformed specifier list, non-`.thetalib` extension) are still refused at the same nested position

- **Status:** open.
- **Sev/Diff estimate:** S4/D2 — S4: dropped author intent with zero
  diagnostics; no wrong value can flow (the nested statement binds nothing and
  executes as a runtime no-op), matching bug 0431's own S4 rating for the
  top-level `.theta` sibling. The `.thetalib` face is the sharper half: a
  nested `export … from` naming a missing file or an undeclared symbol inside
  a lib that MATERIALISES and RUNS is silent where the byte-identical
  statement one brace out draws `theta/load/unresolvable-thetalib-path` /
  `theta/parse/import-unknown-symbol`. D2: the fix is an adjudication first
  (refuse the nested position in both hosts, or spec-pin its inertness), then
  a small recursive-walk change to `checkExportInTheta` /
  `checkThetaLibTopLevel`'s sibling — the same shape 0431's own adjudication
  took for the top level.
- **Kind:** spec gap — `imports.md:54` dispositions the `.theta` form "at a
  `.theta` top level" only, the registry Trigger
  (`code-registry-parse.md:137`) is likewise scoped to "A top-level
  `export … from` statement", `imports.md:13`'s `.thetalib` rule constrains
  the top level only ("Top-level may contain only …") while `:14` licenses
  "the full Theta language" inside `fn` bodies without dispositioning
  `import`/`export` statements there; no sentence anywhere gives the nested
  position in either host any disposition. The implementation parses the form
  at any statement depth and every semantic consumer ignores it.
- **Related:**
  - 0431 (fixed 0.434.0) — the top-level `.theta` filing. Its §Fix residual 1
    names this exact class verbatim: "a nested from-bearing `export` (inside
    an `if`/`fn` body) in a `.theta` remains wholly inert —
    `checkExportInTheta` walks top-level statements only, exactly as the
    sibling `.thetalib` top-level rule does; a pre-existing top-level-only
    architecture, deserves its own filing." This is that filing, widened to
    the `.thetalib` host the residual's parenthetical names.
  - 0333 (fixed 0.302.0) — widened re-export fault coverage to every WALKED
    lib; the closure reads `extractThetaLibForms`, which walks top-level
    statements only, so a nested export edge is outside that closure at every
    depth.
  - 0058 (fixed 0.60.0) — the from-less form in both file kinds; untouched
    here (a nested `export { X }` with no path stays that report's settled
    ground).
  - [bug 0447](./0447-nested-import-statement-inert.md) — the `import` sibling of the same
    top-level-only architecture (nested `import` statements equally inert);
    separate mechanism (different consumers), filed per mechanism.
  - [0025](./0025-ctor-unresolved-schema-name-passthrough.md) — its §Fix
    residual (iv) records the declaration-side face of the same
    top-level-only architecture: a block-nested `schema`/`enum` declaration
    is "accepted with no diagnostic although resolution and runtime
    registration are both top-level-only … an unfiled gap".
  - [0224](./0224-identifier-walk-never-descends-par-for.md) — walk-descent
    precedent: a statement walk missing a nested arm, fixed by widening the
    walk — the fix shape option 1 reuses.
- **Affected** (verified at 401a425b, v0.437.0):
  - `src/parser/theta-document.ts:2703–2704` — `parseStatement` dispatches
    `export` (and `import`) as an ordinary statement, so the form parses at
    ANY statement depth: `if`/`while`/`for` `StmtBlock`s and `fn` bodies
    included (grammar.md:118–126, `Stmt*` in every block production).
  - `src/parser/theta-document.ts:1618–1633` — `checkExportInTheta` iterates
    `block.statements` (top level) only; no recursion into `if`/`fn` bodies.
    Its caller at `:1360–1362` passes the top-level block.
  - `src/parser/theta-document.ts:1586` — `checkThetaLibTopLevel` likewise
    walks top-level forms only, and its subject is the top-level rule by
    construction — no `.thetalib`-side rule reaches a nested statement.
  - `src/extension/import-static-checks.ts:208` — `extractThetaLibForms`
    reads `body.statements` (top level) only, so a nested `export` edge never
    enters `reExports`, the re-export closure, or IMP-1 resolution.
  - `src/runtime/statement-executor.ts:2128–2134` — the `import`/`export`
    statement arm: "Declarations are hoisted / registered by `V19b`'s
    environment; inert here" — a nested export EXECUTES as a silent no-op.
  - `docs/spec_topics/imports.md:13–14`, `:54` (the top-level-scoped
    disposition sentence); `docs/spec_topics/diagnostics/code-registry-parse.md:137`
    (the top-level-scoped Trigger).
- **Observed at:** v0.437.0 (401a425b). Offline, deterministic: scratch
  vitest over real `parseThetaDocument` + real `checkThetaImports` (in-memory
  `FileSystem` double) + real `executeBody` via
  `createProductionProducerDeps` — the bug-0306/0430 harness shape. Scratch
  file deleted.

## Summary

Bug 0431 closed the `.theta` TOP-LEVEL from-bearing export with a parse-time
E. The parser admits the same statement at any nested depth
(`parseStatement`'s `export` arm serves every block), and at a nested
position every consumer misses it: `checkExportInTheta` and
`checkThetaLibTopLevel` walk top-level statements only, the re-export
closure's reader `extractThetaLibForms` walks top-level statements only, and
the runtime executes the statement as a no-op. So a nested export's path is
never resolved (IMP-1 never runs), its specifier is never matched against any
export set, and it contributes nothing — in a `.theta` AND inside an imported
`.thetalib`'s `fn` body, which materialises and runs normally around it.
Meanwhile the statement's SHAPE faults still fire at the nested position
(the lexer's extension check and `parseImportExport`'s specifier-list
checks push diagnostics wherever the statement parses), reproducing exactly
the partial-policing asymmetry 0431 documented for the top level: malformed
spellings refused, well-formed-but-broken ones silently inert.

## Reproduction

Offline at 401a425b; app frontmatter `model: "sonnet"`, `mode: prompt`;
`parse` = app parse diagnostics, `load` = `checkThetaImports().diagnostics`,
`value` = settled `executeBody` result.

### N1 — `.theta`, nested in `if` (missing path)

```
if true {
  export { X } from "./missing.thetalib"
}
1
```

Observed: parse `[]`, load `[]`, value `1`. Control (same statement at top
level): `error theta/parse/export-in-theta: a from-bearing 'export … from'
is not permitted at a .theta top level; …`.

### N2 — `.theta`, nested in `fn` body

```
fn f(): integer {
  export { X } from "./missing.thetalib"
  1
}
let y = f()
y
```

Observed: parse `[]`, load `[]`, value `1`.

### N3 — `.thetalib`, nested in `fn` body (missing path)

App: `import { af } from "./lib.thetalib"` + `let y = af(1)` + `y`.
Lib `/proj/lib.thetalib`:

```
fn af(x: integer): integer {
  export { X } from "./missing.thetalib"
  x
}
```

Observed: parse `[]`, load `[]`, `fn af` materialises, value `1`. Control
(same export at the lib's top level):
`error theta/load/unresolvable-thetalib-path: cannot resolve .thetalib
import './missing.thetalib'` — this load-side control is code-read-verified
at the pin (`extractThetaLibForms` reads `body.statements` only;
`collectImports` seeds IMP-1 from top-level edges), not re-run.

### N4 — shape rules DO fire nested (the partial-policing contrast)

`if true { export { a as } from "./lib.thetalib" }` draws
`error theta/parse/import-malformed-specifier-list: …` — a nested statement
IS policed for shape, so the semantic inertness is not a "nested statements
are out of scope" convention.

## Expected behaviour

No prescribed disposition exists — that is the gap:

- `imports.md:54` refuses the form "at a `.theta` top level"; the registry
  Trigger (`code-registry-parse.md:137`) says "A top-level `export … from`
  statement". Both are silent on the nested position, in both directions.
- `imports.md:13` constrains a `.thetalib`'s TOP level; `:14` ("Inside `fn`
  bodies, the full Theta language is available") does not say whether
  `import`/`export` statements are part of that language at a nested
  position, and no re-export sentence scopes the closure to top-level
  statements.
- IMP-1 (`imports.md:23`) governs "a re-export's own `.thetalib` path
  identically to an `import`'s … sited on the re-exporting file whose
  statement names it" with no depth qualifier — N3's lib is a re-exporting
  file whose statement names a missing path, and nothing fires.
- The internally consistent dispositions are: (a) refuse the nested position
  in both hosts (extend `checkExportInTheta` to a recursive walk; mint or
  reuse a row for the `.thetalib` nested position), or (b) a spec sentence
  pinning nested `export` statements as legal and wholly inert in both
  hosts. Today's behaviour is (b)-shaped with no sentence — the exact state
  0431 was filed against for the top level.

## Actual behaviour / root cause

One architecture, three misses: `parseStatement`
(`theta-document.ts:2703–2704`) admits the form at any depth, but every
semantic consumer is top-level-keyed — `checkExportInTheta`
(`:1618–1633`, `for (const stmt of block.statements)` with no recursion),
`checkThetaLibTopLevel` (`:1586`, top-level forms by subject), and
`extractThetaLibForms` (`import-static-checks.ts:208`, feeding the re-export
closure, IMP-1 resolution and the export fixpoint). The runtime's
`import`/`export` statement arm (`statement-executor.ts:2128–2134`) is an
explicit no-op. Shape rules live in the lexer and inside `parseImportExport`
itself, so they fire wherever the statement parses — the asymmetry is
semantic-vs-shape, not top-vs-nested.

## Why it matters

- 0431's rationale transfers verbatim one brace in: an author writing
  `export … from` inside an `if` (e.g. attempting a conditional re-export)
  misunderstands the model and gets no correction, while a typo in the same
  statement's list spelling is an E.
- The `.thetalib` face survives 0333's closure widening: 0333 made every
  WALKED lib's top-level export edges reportable at any depth; a nested edge
  is invisible to that closure at every depth, so the "last unpoliced corner"
  claim in 0431 holds only for top-level statements.
- The refusal 0431 shipped is trivially evaded by indentation: wrapping the
  refused statement in `if true { … }` converts a parse E into a clean load.

## Non-goals

- The from-less nested form (`export { X }`, empty path) — 0058's settled
  ground; `checkExportInTheta`'s path guard already excludes it at the top
  level and nothing here proposes judging it nested.
- Nested `import` statements — [bug 0447](./0447-nested-import-statement-inert.md) (different
  consumers, different observables).
- Top-level behaviour in either host — 0431 (`.theta`) and 0333/0428
  (`.thetalib`) fixed ground; all controls re-verified green in this sweep.

## Fix

Options:

1. **Refuse the nested position in both hosts** (recommended): make
   `checkExportInTheta` walk nested blocks (reusing its existing per-statement
   test) so the 0431 code fires at any depth in a `.theta`; for a
   `.thetalib`, either extend `checkThetaLibTopLevel`'s sibling with a
   nested-position arm of `thetalib-top-level-statement` (its message wording
   would need a DIAG-2 look — the current row is about top-level placement)
   or mint a small `export-in-fn-body`-class row. Loud, closes both fault
   classes, symmetric with 0431's adjudication. GOV-15: newly-refused
   spellings currently load clean — same carve-out posture as 0431.
2. **Resolve-and-check, keep inert**: seed the re-export closure and IMP-1
   from nested export statements too. Polices a statement that remains
   meaningless; quietly implies the nested form is legal. Rejected by 0431's
   own adjudication for the top level; the same reasoning applies.
3. **Spec-pin the inertness**: one sentence per host. Cheapest; normalises
   dead statements and keeps the shape/semantic asymmetry.

Any fix must keep: N4's shape-rule emissions unchanged; the top-level
`.theta` refusal and `.thetalib` top-level export semantics byte-identical;
the runtime no-op arm for whatever remains legal.

## Provenance

import-intake-6 bug-hunt sweep, 401a425b (v0.437.0). Origin: bug 0431 §Fix
(0.434.0) residual 1 ("deserves its own filing"). Probe:
`tests/scratch-ii6-intake.test.ts` (deleted) — cells A1/A1c/A2/A3/A3c/A7,
outputs quoted verbatim. Spec read: imports.md:13–14, :23, :54;
code-registry-parse.md:137; grammar.md §Block expressions. No non-scratch
file modified.
