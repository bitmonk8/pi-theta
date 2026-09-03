# Bug 0386 — a dead block-scoped `let x` overwrites the flat parse mutability map file-linearly, so a later legal write to a live outer `let mut x` is refused with a false `theta/parse/immutable-rebinding` and the theta fails to load

- **Status:** fixed (0.398.0).
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

## Fix (0.398.0)

- What shipped:
  - `src/parser/theta-document.ts` — §Fix realised as its first option (the
    `withImmutableBindings` save/restore shape generalised to declaration-carrying
    blocks). `parseBlock()` — the single production for every non-top-level
    `{ … }` block (if/else, while, for/par-for and fn bodies via
    `withImmutableBindings`, match-arm and other block-exprs via
    `parseBlockExprNode`) — now snapshots `this.bindings` (`new Map(this.bindings)`)
    on entry and restores it (clear + repopulate, mutating the `readonly` field in
    place) in a `finally`. A block-scoped `let`/`let mut` therefore stops leaking
    its mutability onto an enclosing same-named entry once the block's `}` closes
    (expressions.md:51 lexical shadowing). `parseBody()` → `parseForms()` parses the
    top level directly and never calls `parseBlock`, so top-level file-linear
    behaviour (redeclaration) is structurally untouched; fn bodies restore across the
    whole body because a fn body IS one `parseBlock` (row A5).
  - `tests/b0386-dead-block-let-scope.test.ts` (new, 8 cells) — the offline witness
    over the b0370 `codesOf` harness: forward rows A1/A3/A4/A5/A6 (a dead-block `let`
    shadow no longer falsely refuses the later legal write to the outer `let mut`),
    the reverse-direction control R1 (a dead-block `let mut` shadow of an immutable
    outer `let` is now refused AT PARSE — the §Fix "reverse-direction control",
    proving the NEW parse-refusal disposition per parent ratification, NOT the old
    belt), and the two byte-identical controls A2/A7.
  - `tests/live/b0386-dead-block-let-scope-live-cell.test.ts` (new, H8a) — the live
    registration cell: the legal dead-block-shadow theta now REGISTERS (fork denied it
    via the false `immutable-rebinding`), the reverse shadow is ABSENT (now
    parse-refused), a no-shadow control registers. Registration-only observable
    (`handle.command` / `registeredNames`); no model turn driven.
  - `tests/b0370-reassign-target-scope.test.ts` — the two PARENT-RATIFIED sibling-cell
    flips (spec-correct consequences of block-scoping, beyond 0386's own enumeration):
    (F1) the dead-block-shadow RESIDUAL cell flips from parse-clean-`[]`-plus-runtime-
    belt to the parse refusal `[theta/parse/immutable-rebinding]` (belt drive removed —
    the write never reaches runtime now); (F2) the sibling-fn-leak WITNESS cell flips
    `[immutable-rebinding]` → `[unknown-identifier]` (`w` is genuinely out of `f`'s
    closure-free scope once `g`'s `let w` stops leaking). The "loud-belt residuals"
    describe header is updated (three residual classes → two; the dead-block-shadow
    class is superseded by 0386). The other two belt residuals (non-writable root,
    params-shadow) keep their subjects untouched.
- Gates:
  - Witness: `npx vitest run tests/b0386-dead-block-let-scope.test.ts` → 8/8 GREEN
    after fix; RED at fork (A1/A3/A4/A5/A6/R1 red for the false-refusal symptom, A2/A7
    controls green), verifier-reproduced by neutralising the `parseBlock` hunk.
  - Full suite: `npx vitest run` → 559 files / 10332 tests green (baseline 558/10324 +
    the new offline witness's 8 cells; the verifier's run was 559/10332 all green).
  - Typecheck: `npm run typecheck` clean. Lint: `npm run lint` clean.
  - Live: `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/b0386-dead-block-let-scope-live-cell.test.ts` GREEN after fix,
    RED-proven at fork (both directions: legal theta absent, reverse present), run under
    the lane live lock.
- Review: 1 round. R1 (`bug-fix-reviewer`) — CLEAN, no correctness/fidelity/spec
  finding; three non-blocking residuals (recorded below), deep re-review not
  recommended.
- Verification: SOLID (`bug-fix-verifier`). (i) Witness genuinely witnesses — the
  `parseBlock` hunk neutralised byte-exact → b0386 6/8 red for the doc's symptom and the
  two flipped b0370 cells (F1, F2) red; restored byte-exact (`git hash-object`
  `72a5eef1…` match) → b0386 8/8 + b0370 33/33 green. (ii) Full suite 559/10332 green.
  (iii) Live confirmed present + asserting registration observables (orchestrator-
  discharged, not re-run by the verifier per lane rule). (iv) Typecheck + lint clean.
- Residuals:
  1. Doc-was-wrong, recorded per the 0362 pattern (the §Non-goals body is NOT silently
     rewritten): 0386's own §Non-goals says the reverse leak "its disposition is already
     documented as the belt." The mechanism this same doc mandates (block-scoping the
     flat map) UNAVOIDABLY fixes the reverse leak too — it becomes a parse-time
     `theta/parse/immutable-rebinding` refusal, not a belt hit. The reverse leak is
     FIXED, not preserved; the §Non-goals sentence is falsified by the §Fix. The prior
     orchestrator's STOP (`.pi/tmp/fixes/0386-report.md`) surfaced this contradiction and
     the two b0370 flips; the parent adjudicated and RATIFIED both flips as spec-correct
     before this run — and ratified that R1 (the reverse-direction control) now proves the
     new parse-refusal disposition instead of the belt.
  2. Doc imprecision: the §Fix constraint names `theta/parse/duplicate-binding`; that
     code appears nowhere in `src/` or the parse registry. The invariant it names
     (top-level redeclaration untouched) IS verified (parseBody bypasses parseBlock;
     A2/A7 and the b0370 same-scope controls stay byte-identical), but the code name is a
     phantom and is not propagated into this record's claims.
  3. Two neighbouring 0370 comments (`theta-document.ts:494`, `:2275`) describe the map
     as "file-linear" unqualified; post-fix it is file-linear only within a scope level.
     :2275's claim still holds for the TOP-LEVEL params-seed shadow it explains; :494 is a
     general descriptor. Left as a prose follow-up — not this §Fix's surface, and not
     load-bearing.
  4. An UNPINNED top-level shape — `if true { let x = 2 }` with no outer `x`, then
     `x = 3` — moves from the false `[immutable-rebinding]` to the honest
     `[unknown-identifier]` (same class as F2, at top level). No committed cell asserts
     it (full suite green with only the two ratified flips), so it is not a third
     committed-cell flip; recorded for completeness.
- Discharge notes appended: `docs/bugs/0370-…md` (dated coordination note: its Residual
  1(c) candidate follow-up landed as 0386; the dead-block-shadow case moved from the
  layer-2 belt to parse-time refusal).
- Pinned dispositions / non-goals: no new registry rows (0326 anti-fork — the fix reuses
  `immutable-rebinding` / `unknown-identifier` at truer positions). The layer-2 runtime
  belt stays for values that still launder past parse (0370's non-writable-root and
  params-shadow residuals keep their subjects, untouched). 0396's separate CTRL-4
  `bodyLocals` map is a different mechanism, untouched. `0.398.0` is a literal placeholder
  the lane parent substitutes at merge.
