# Bug 0386 — a dead block-scoped `let x` overwrites the flat parse mutability map file-linearly, so a later legal write to a live outer `let mut x` is refused with a false `theta/parse/immutable-rebinding` and the theta fails to load

- **Status:** open.
- **Sev/Diff estimate:** S2/D2 — S2: a legal program (per the lexical-shadowing
  rule) is refused at parse, so the theta never registers; the diagnostic names
  a rebinding of an immutable binding that does not exist at that position (the
  live binding in scope is `let mut`). Not S1: the refusal is loud, nothing
  silently binds wrong. D2 because the honest fix is block-scoping the parse
  mutability map (save/restore on every `Block`, the same mechanism
  `withImmutableBindings` already applies to params / `for` / `match` binders),
  which touches every block-producing production but is mechanical.
- **Kind:** defect (parse-layer scope model diverges from the lexical-shadowing
  rule).
- **Related:**
  - [0370](./0370-reassign-target-scope-unchecked-cross-boundary-writes.md)
    — fixed (0.370.0). Its §Fix Residual 2 names exactly this input class as a
    follow-up candidate ("the reverse pre-existing FALSE `immutable-rebinding`
    on the legal write `let mut x = 1` / `if true { let x = 2 }` / `x = 3`. No
    committed cell asserts the false-refusal. Block-scoping the map is the
    fix.") and its Residual 1(c) pins the sibling direction (dead block `let
    mut` leaking writability onto an immutable outer `let`) as the loud
    layer-2 belt disposition. The fixer filed no follow-up; this report is it.
  - 0115 / 0341 — the reassign TYPE checks at the same seam; neither owns
    target-scope membership.
- **Affected** (verified at d63c5148, v0.382.0):
  - `src/parser/theta-document.ts:2652` — `buildLet` records every `let` in
    `this.bindings` (`this.bindings.set(name, mutable)`) with no save/restore
    at block exit: the map is file-linear, so a block-scoped `let x` (inside
    `if` / `for` / `while` / a `match`-arm block / a `fn` body) permanently
    overwrites the outer `let mut x`'s `true` with `false` for the rest of the
    file.
  - `src/parser/theta-document.ts:2722` — `buildReassign` reads
    `this.bindings.get(target) === false` → `immutable-rebinding`; after the
    dead shadow it sees `false` for a target whose in-scope binding is the
    outer `let mut`.
  - `src/parser/theta-document.ts:2745-2775` — `withImmutableBindings` is the
    existing save/restore mechanism, applied only to params / `for` / `par
    for` / `match` binders (bug 0370 §Fix layer 1), not to `let` declarations
    inside blocks.
- **Observed at:** v0.382.0 (d63c5148), offline scratch vitest over
  `parseThetaDocument` (the b0370 witness harness's `codesOf` shape); scratch
  deleted.

## Summary

The parse-time mutability map `this.bindings` is flat and file-linear. Bug
0370's fix save/restores it around parameter, loop, and match-binder scopes,
but a plain `let` statement inside any block still writes the map permanently.
A dead block-scoped `let x = 2` therefore replaces the outer `let mut x`'s
writability with `false` for the remainder of the file, and every later legal
write `x = 3` — which per the shadowing rule targets the outer, mutable
binding — is refused at parse with `theta/parse/immutable-rebinding`. The
refusal is an error-severity diagnostic, so the theta fails to register: a
valid program cannot load.

## Reproduction

Scratch vitest (deleted) parsing each source with the b0370 harness's
`codesOf` (frontmatter `---\nmode: prompt\n---\n` prepended; error-severity
codes collected). Observed at d63c5148:

| # | Source | Expected | Observed |
|---|--------|----------|----------|
| A1 | `let mut x = 1` / `if true { let x = 2 }` / `x = 3` | `[]` | `["theta/parse/immutable-rebinding"]` |
| A3 | `let mut x = 1` / `for i in [1] { let x = 2 }` / `x = 3` | `[]` | `["theta/parse/immutable-rebinding"]` |
| A4 | `let mut x = 1` / `match 1 { n => { let x = 2 } }` / `x = 3` | `[]` | `["theta/parse/block-expr-missing-tail", "theta/parse/immutable-rebinding"]` |
| A5 | `let mut x = 1` / `fn g(): integer { let x = 2` / `return x }` / `x = 3` / `let y = g()` | `[]` | `["theta/parse/immutable-rebinding"]` |
| A6 | `let mut x = 1` / `let mut n = 0` / `while n < 1 { let x = 2` / `n += 1 }` / `x = 3` | `[]` | `["theta/parse/immutable-rebinding"]` |
| A2 (control) | `let mut x = 1` / `x = 3` | `[]` | `[]` |
| A7 (control) | `let x = 1` / `x = 3` | refusal | `["theta/parse/immutable-rebinding"]` |

Row A4 additionally reports `theta/parse/block-expr-missing-tail` (the
match-arm block ends in a `let` statement, not a tail expression); the false
`immutable-rebinding` fires alongside it, so A4 still witnesses the class.

The A5 row shows the class is not even block-vs-top-level: a `fn` body's local
`let` poisons the top-level map across the FN-1 no-closures boundary in the
write direction, the mirror of the read-direction boundary 0016/0370 closed.
Statement ORDER decides the verdict — moving `x = 3` above the block parses
clean — demonstrating the map is file-linear where the spec's rule is lexical.

## Expected behaviour

- `docs/spec_topics/expressions.md:51`: "Local bindings (1) shadow everything
  else lexically, the same as in Rust or TypeScript." In Rust and TypeScript a
  block-scoped `let` shadow ends at its block's `}`; after the block, the
  outer binding is the one in scope. `x = 3` after `if true { let x = 2 }`
  therefore targets the outer `let mut x`.
- `docs/spec_topics/bindings.md:12`: reassignment (plain and compound) "are
  all legal on `let mut` bindings". The targeted binding is a `let mut`.
- `docs/spec_topics/bindings.md:6`: `theta/parse/immutable-rebinding` is
  defined for rebinding an IMMUTABLE binding; no immutable `x` is in scope at
  the write.
- `docs/spec_topics/functions.md:20` (FN-1): a `fn` body is closure-free — its
  locals are not the file's top-level bindings (row A5).

## Actual behaviour / root cause

`buildLet` (`theta-document.ts:2652`) mutates the flat map unconditionally and
nothing restores it when a block closes; `buildReassign`
(`theta-document.ts:2722`) trusts the map as the scope model. Bug 0370's
`withImmutableBindings` (`:2745-2775`) proves the save/restore pattern in the
same class but wraps only binder-introducing constructs, not block bodies. The
0370 fix record recorded both leak directions (its Residuals 1(c) and 2) and
deferred them; the write-refusal direction has no witness cell and no filed
bug.

## Why it matters

An author following the documented shadowing model — a scratch `let x` inside
an `if` arm, a helper `fn` with a local of the same name as a top-level
counter — gets a hard load failure on a program every named reference
implementation of the rule (Rust, TypeScript) accepts, with a diagnostic
asserting an immutability that is not true of the binding in scope. The
refusal fires at parse, so the theta is unusable until the author renames a
local that per spec should be invisible outside its block.

## Non-goals

- The reverse leak (dead block `let mut` making a write to an immutable outer
  `let` parse-clean and reach the loud layer-2 belt) — recorded and
  witness-pinned by 0370's fix (its residual 1(c) cells); same root cause, but
  its disposition is already documented as the belt.
- The runtime write path (`writeBinding`) — 0370's layers 2/3 are correct once
  the parse verdict is right.

## Fix

Block-scope the mutability map: save/restore `this.bindings` entries for
names declared by `let` inside every non-top-level `Block` (the
`withImmutableBindings` save/restore shape generalised to declaration-carrying
blocks), or replace the flat map with a scope stack. Constraint: the
top-level file-linear behaviour for TOP-LEVEL redeclaration must not change
(`theta/parse/duplicate-binding` sibling checks unaffected); `fn` bodies must
restore across the whole body (row A5). The five reproduction rows plus the
two controls are the witness set; add the reverse-direction control from
0370's residual 1(c) cells to prove no regression of the belt disposition.

## Provenance

Fix-residuals sweep over bugs 0351-0385: 0370 §Fix Residual 2 named this
class unprospected. Probed at d63c5148 with a scratch vitest over
`parseThetaDocument` (7 cells, table above); scratch deleted. Spec read:
expressions.md:51, bindings.md (whole page), functions.md FN-1. Implementation
read: theta-document.ts:2640-2775. Dup check: README index has no
block-scoping / mutability-map report; 0370 is fixed and explicitly excludes
this class from its scope.
