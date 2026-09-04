# Bug 0447 — An `import { … } from "…"` statement NESTED inside an `if`/`fn` body is semantically inert in both hosts with no disposition: its path is never resolved (a missing lib draws nothing), nothing materialises, and the statement executes as a no-op — while a body USE of the nested-imported name draws `theta/parse/unknown-identifier`, a diagnostic that names the wrong fault and points away from the import the author wrote one line up

- **Status:** open.
- **Sev/Diff estimate:** S4/D2 — S4: dropped author intent with zero
  diagnostics for the unused-nested-import class (path and specifiers wholly
  unvalidated; a lib `fn` body hosting one still materialises and runs), and a
  loud-but-misattributed refusal for the used class (the theta refuses to
  register on `unknown-identifier`, so no wrong value flows in production —
  which is what keeps this out of S2/S3 despite the misleading message). D2:
  same adjudication shape as the export sibling (refuse nested placement vs
  spec-pin inertness), one recursive-walk seam either way, but the used-class
  message question (should the refusal name the illegal import placement
  rather than an unknown name?) is its own small adjudication.
- **Kind:** spec gap — imports.md states no placement rule for `import` in a
  `.theta` at all (its examples are top-level; `ImportDecl` at `imports.md:73`
  is unscoped), `imports.md:13` constrains only a `.thetalib`'s TOP level, and
  `:14`'s "full Theta language" sentence does not disposition a nested
  `import`; the implementation parses the form at any depth, collects it from
  the top level only, and polices its SHAPE (extension, specifier list) at
  every depth — the same partial-policing state 0431 documented for the
  export form.
- **Related:**
  - [bug 0446](./0446-nested-export-from-wholly-inert-both-hosts.md) — the `export … from` sibling (0431 §Fix
    residual 1's filing). Same top-level-only architecture; two reports, not
    one, on two grounds. (1) Zero consumer overlap: the export half misses
    `checkExportInTheta`, `checkThetaLibTopLevel` and the re-export closure;
    this half misses `collectImports` (so IMP-1/IMP-3/IMP-4 and
    materialisation never run) and the identifier-root seeds. (2) Different
    adjudication: export = widen an EXISTING refusal (0431's minted code,
    walk made recursive); import = mint a NEW placement row plus its own
    spec sentence and GOV-15 flip set.
  - 0431 (fixed 0.434.0) — established the partial-policing framing (shape
    rules fire, semantic rules never run) this report re-measures for the
    import form at the nested position.
  - 0428 (fixed 0.421.0) — IMP-1's read-failure lane at the top level; the
    nested statement never reaches IMP-1 at all, one stage earlier.
  - 0101 (fixed 0.141.0) — the unbound-import runtime observables; not
    reachable here in production (the use-site parse E denies registration),
    reachable only in harnesses that execute anyway.
- **Affected** (verified at 401a425b, v0.437.0):
  - `src/parser/theta-document.ts:2701–2702` — `parseStatement` dispatches
    `import` as an ordinary statement at any depth (every `Stmt*` block
    production, grammar.md:118–126).
  - `src/extension/import-static-checks.ts:157–165` — `collectImports`
    filters `body.statements` (top level) only: a nested `ImportDecl` never
    enters the load pass, so IMP-1 resolution, IMP-3 unknown-symbol, IMP-4,
    collision bookkeeping and materialisation all skip it.
  - `src/extension/import-static-checks.ts:208` — `extractThetaLibForms`
    reads top-level statements only, so a nested `import` inside a
    `.thetalib` `fn` body is equally invisible to the lib walk.
  - `src/parser/theta-document.ts:6503–6533` (`collectIdentRoots` `import`
    arm) and `:7612–7630` (the call-site walk's `fnImportDecls`) — both seed
    from top-level statements only; `walkIdentStmt`'s `default:` arm
    (`:6836–6839`) treats a nested `import` as carrying "no
    identifier-resolution sites" and binds nothing into the nested scope, so
    a use of the name draws `theta/parse/unknown-identifier`.
  - `src/runtime/statement-executor.ts:2128–2134` — the statement executes as
    a no-op ("Declarations are hoisted / registered by `V19b`'s environment;
    inert here").
  - `docs/spec_topics/imports.md:13–14`, `:73`;
    `docs/spec_topics/diagnostics/code-registry-parse.md` (no row names an
    import-placement fault).
- **Observed at:** v0.437.0 (401a425b). Offline, deterministic: scratch
  vitest, bug-0306 harness shape (real `parseThetaDocument` +
  `checkThetaImports` over an in-memory FS + `executeBody`). Scratch deleted.

## Summary

`parseStatement` admits `import` at any statement depth, but the entire
import pipeline is keyed to top-level statements: `collectImports` (the load
pass's sole entry for `.theta` imports), `extractThetaLibForms` (the lib
walk), the identifier-root seeds, and the call-site walk's import set. A
nested import is therefore parsed, shape-checked, and then ignored by every
semantic consumer: its path is never resolved (a garbage path draws nothing),
its symbols are never checked or bound, and at runtime the statement is a
no-op. If the imported name is USED, the use draws
`theta/parse/unknown-identifier` — a true statement about the walk's scope
sets but a false pointer for the author, whose import statement is right
there and whose actual fault (placement) is named by nothing. If the name is
unused — or the import sits inside a `.thetalib` `fn` body — the statement is
completely silent.

## Reproduction

Offline at 401a425b; frontmatter `model: "sonnet"`, `mode: prompt`.

### M1 — `.theta`, nested, unused, missing path: silent

```
if true {
  import { zf } from "./missing.thetalib"
}
1
```

Observed: parse `[]`, load `[]`, value `1`. Control: the same statement at
top level draws `error theta/load/unresolvable-thetalib-path: cannot resolve
.thetalib import './missing.thetalib'`.

### M2 — `.theta`, nested, used inside the same block (lib EXISTS and is well-formed)

```
if true {
  import { af } from "./lib.thetalib"
  let y = af(1)
}
1
```

(lib `/proj/lib.thetalib` = `fn af(x: integer): integer { x }`)

Observed: parse `["error theta/parse/unknown-identifier: unknown identifier
'af'"]`; load `[]`; nothing materialises. The diagnostic names an unknown
identifier; the author's fault is import placement, which nothing names. Use
at top level after the block (M2b) behaves identically.

### M3 — `.thetalib` `fn` body hosting a nested import, missing path: silent

App imports and calls `af` from `/proj/lib.thetalib`:

```
fn af(x: integer): integer {
  import { zf } from "./missing.thetalib"
  x
}
```

Observed: parse `[]`, load `[]`, `fn af` materialises, value `1`.

### M4 — shape rules DO fire nested

`if true { import { af } from "./lib.theta" }` draws
`error theta/parse/import-non-thetalib-extension: import path './lib.theta'
does not end in .thetalib` (the lexer's path-literal check is depth-blind).

## Expected behaviour

No prescribed disposition exists:

- imports.md never states where an `import` may sit in a `.theta`; the
  `ImportDecl` production (`:73`) is unscoped and every prose example is
  top-level. For a `.thetalib`, `:13` scopes the top-level-only constraint to
  the top level and `:14` licenses "the full Theta language" in `fn` bodies
  without addressing `import`.
- IMP-1 (`:23`) prescribes `theta/load/unresolvable-thetalib-path` for an
  unresolvable spec with no placement qualifier — M1's and M3's paths are
  unresolvable specs named by `import` statements, and nothing fires.
- expressions.md's identifier-resolution arm (3) is "a symbol imported from a
  `.thetalib` file" with no top-level qualifier, so M2's `unknown-identifier`
  rests on an implementation convention (top-level-only seeding) no spec
  sentence states.
- Consistent dispositions: (a) refuse `import` at nested positions in both
  hosts (a parse row naming the placement — the loud sibling of 0431's
  `.theta` export refusal), or (b) spec-pin nested imports as legal-and-inert
  plus keep the use-site `unknown-identifier` as the documented consequence.
  Today is (b)-shaped with no sentence and a misleading use-site message.

## Actual behaviour / root cause

`collectImports` (`import-static-checks.ts:157–165`) and
`extractThetaLibForms` (`:208`) read `body.statements` top-level only —
nothing downstream of either can see a nested `ImportDecl`. The parse-side
scope builders (`collectIdentRoots` `:6503+`, `fnImportDecls` `:7612+`) read
the same top-level list, and `walkIdentStmt`'s `default:` arm treats a nested
`import` as binding nothing, so uses refuse as unknown identifiers. Shape
checks (lexer extension check; `parseImportExport`'s specifier-list family)
push diagnostics wherever the statement parses, giving the
shape-policed/semantics-ignored split. The runtime arm
(`statement-executor.ts:2128–2134`) is an explicit no-op.

## Why it matters

- The unused / lib-hosted classes (M1, M3) are the 0431 silence class:
  author intent (import this lib) dropped with zero diagnostics, while a
  spelling-level typo in the same statement is an E — the exact inversion the
  loud import rules exist to prevent.
- The used class (M2) produces a diagnostic that actively misdirects: an
  author who writes a legal-looking import and a call gets "unknown
  identifier", investigates spelling/visibility, and finds both correct. No
  channel names the placement rule because no placement rule exists.
- The evasion composes with candidate 01: everything the import/export
  intake refuses at the top level is reachable-but-inert one block down.

## Non-goals

- Nested `export … from` — [bug 0446](./0446-nested-export-from-wholly-inert-both-hosts.md).
- The unbound-import runtime fall-through (0101, settled) — unreachable here
  in production since M2's parse E denies registration.
- The top-level import pipeline (IMP-1/IMP-3/IMP-4, 0428's read lane,
  0333's closure) — all controls re-verified, untouched.
- Whether a nested import SHOULD bind block-locally (a language-design
  question; theta 1.0 has no local-import semantics to enforce).

## Fix

Options:

1. **Refuse nested placement in both hosts** (recommended): a parse-time E
   (one row, e.g. `theta/parse/import-not-top-level`, or a host-split pair
   mirroring 0431's shape) fired by a recursive statement walk, ranged over
   the statement. Closes M1/M2/M3 at one seam, replaces M2's misattribution
   with a fault-naming refusal, and keeps M4's shape co-fires. DIAG-2 row +
   spec sentence in the same commit; GOV-15 addition (every newly-refused
   spelling loads clean today — M2's class already refuses, on a different
   code, so its verdict does not flip, only its message set).
2. **Spec-pin inertness**: sentences in imports.md for both hosts declaring
   nested `import`/`export` statements legal and ignored, plus (optionally) a
   hint on `unknown-identifier` when the unknown name matches a nested
   import's binding. Cheapest; normalises dead statements and leaves M2's
   misdirection (or partially patches it via the hint).
3. **Bind nested imports for real** (resolve at load, scope block-locally):
   rejected — invents new language semantics no spec sentence asks for, and
   inverts the sync-parse/async-load layering for a form with no use case.

## Provenance

import-intake-6 bug-hunt sweep, 401a425b (v0.437.0). Fresh find adjacent to
bug 0431 §Fix residual 1 (the export sibling; this report is the import half
of the same top-level-only architecture). Probe:
`tests/scratch-ii6-intake.test.ts` (deleted) — cells A4/A4b/A5/A6/A7a,
outputs quoted verbatim. Spec read: imports.md:13–14, :23, :73;
expressions.md §Identifier resolution; grammar.md §Block expressions. No
non-scratch file modified.
