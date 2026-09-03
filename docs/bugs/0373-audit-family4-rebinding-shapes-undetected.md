# Bug 0373 — The published inventory-closure audit detects none of the family-(4) rebinding/laundering shapes: `const { ui } = ctx`, `const reg = pi.registerCommand`, computed `pi[...]` access, carrier-typed class fields, `interface MyCtx extends ExtensionContext`, `<C extends ExtensionContext>` laundering, and `Readonly<ExtensionAPI>` parameters all pass the gate with zero records — Pi-side surface reached through them is silently lost from closure coverage

- **Status:** fixed (0.381.0).
- **Sev/Diff estimate:** S3/D2 — S3 because this is a build-time gate, not a
  runtime surface: no end user sees a wrong value, and today's audited tree
  happens to contain none of these shapes (the gate is green). But the gate's
  entire purpose is negative-direction closure, and every one of these shapes
  is an authorable one-line change that silently exempts all downstream
  `pi.*`/`ctx.*` reach from the audit — the exact "silently lost from
  inventory-closure coverage" failure the spec's family-(4) clauses were
  written to prevent. D2 because each missing arm is an independent AST
  pattern (a dozen visitors) plus per-symptom fixtures.
- **Kind:** defect — test infrastructure. A published gate that cannot witness
  most of what its contract says it enforces (the 0047 class), with the
  additional wrinkle that the audit's obligations are conditional on
  publication and the audit IS published (`tests/inventory-closure-audit-gate.test.ts`
  runs it in `npm test` and asserts land-green).
- **Related:**
  - 0047 (fixed 0.223.0) — a gate blind to a namespace it claimed to score;
    same witness-capability class.
  - Sibling report 04 (this campaign) — the same module's exemption-marker
    subsystem diverges independently; distinct mechanism (marker
    scope/placement vs shape detection), filed separately.
- **Affected** (verified at 9474dfa8, v0.347.0):
  - `src/extension/inventory-closure-audit.ts:284-350` (`visitShapes`, pass
    1) — the complete family-(4) detection set: side-effect / default /
    namespace / aliased imports, `export *`/aliased re-exports, dynamic
    `import()`, and the four off-canonical parameter name/annotation arms.
    Nothing else is visited.
  - `src/extension/inventory-closure-audit.ts:430-460` — pass-3 reference
    collection: `pi.<member>` / `ctx.<member>` property accesses resolve
    against the inventory regardless of the syntactic context they sit in, so
    `const reg = pi.registerCommand` resolves as an ordinary category-(1) ref
    and the captured-rebinding prohibition never fires.
  - `tests/inventory-closure-audit-gate.test.ts:116-143` — the `npm test`
    wiring that publishes the audit (green-on-main + red-on-seed).

## Summary

`audit-recognised-shapes.md` (family (4)) prohibits — "under its own
discriminator", non-exemptible — computed access (`pi[name]`, `ctx[name]`),
namespace destructuring (`const { registerCommand } = pi`, `const { ui } =
ctx`), value-binding aliases (`const reg = pi.registerCommand`, `const c =
ctx`), captured rebindings (`this.ctx = ctx` and "any local variable, field,
or closure-captured binding … whose initialiser is a reference to `ctx`, to
`pi`, or to any descendant member-access expression rooted on either"),
destructured carrier parameters (`function f({ ui }: ExtensionContext)`),
wrapped/intersected/union/generic-applied/aliased carrier annotations
(`Readonly<ExtensionAPI>`, `ExtensionAPI & Mixin`, `type API =
ExtensionAPI`), type-parameter-constraint laundering (`function wrap<C
extends ExtensionContext>(c: C)`), subtype creation (`interface MyCtx extends
ExtensionContext`), non-parameter carrier bindings (class fields / top-level
`const` typed with a carrier literal), `Object.assign({}, pi)`, `keyof typeof
pi`, and CJS/`createRequire` reach. The published audit implements none of
these arms: its family-(4) coverage stops at import/export declaration shapes
and off-canonical parameter name/annotation.

## Reproduction

Scratch probe (deleted; vitest, offline) feeding the exported pure core
`runInventoryClosureAudit` synthetic single-file trees (production
`SDK_SURFACE_INVENTORY`, allow-lists `{Type}`/`{Unsafe}`). Violations
observed per input — all `[]` (zero records of any family):

| Input (inside a canonical carrier where applicable) | Spec verdict | Observed |
|---|---|---|
| `const { ui } = ctx;` | family (4), own discriminator | zero records |
| `const reg = pi.registerCommand;` | family (4) captured-rebinding | resolves as plain cat-(1) ref, zero violations |
| `pi["getFlag" as never];` | family (4) computed access | zero records |
| `class T { private stashed: ExtensionContext \| undefined; }` | family (4) non-parameter binding | zero records |
| `interface MyCtx extends ExtensionContext { … }` + `handler(myCtx: MyCtx) { myCtx.modelRegistry }` | family (4) subtype creation | zero records (and the `modelRegistry` reach is invisible) |
| `function wrap<C extends ExtensionContext>(c: C) { c.cwd; }` | family (4) generic laundering | zero records |
| `function f(api: Readonly<ExtensionAPI>) {}` | family (4) wrapped annotation | zero records |

The destructuring/subtype/generic/wrapped cases additionally launder every
downstream member access out of category-(1)/(3) coverage entirely — not even
the `recognised` canary counter sees them.

## Expected behaviour

Each row above surfaces one `audit/violation/<family-4-token>/<symptom>`
record with the offending shape literal as `symbol` and a rewrite-shape
`proposed-resolution` (audit-failures.md per-family record-shape table, family
(4) row); the family-(4) prohibition is non-exemptible and the audit "MUST
enforce that prohibition under its own discriminator"
(`audit-recognised-shapes.md`, closing sentences). audit-failures.md
additionally requires at least one negative-test fixture per stable
`<symptom>` token — none exist for these shapes.

## Actual behaviour / root cause

`visitShapes` (inventory-closure-audit.ts:284) enumerates exactly ten symptom
arms, all import/export/parameter-declaration shapes. No visitor exists for
variable declarations, binding patterns, property declarations, heritage
clauses, type-parameter constraints, wrapped type annotations, element-access
expressions, `Object.assign`, `keyof typeof`, or `createRequire` invocation.
Pass 3's property-access resolver deliberately ignores enclosing context, so
a member access whose value is captured resolves exactly like a call.

## Why it matters

The audit's land-green assertion is only as strong as its detection floor. As
shipped, a contributor (or a code generator) can move any amount of Pi-side
surface behind a one-line rebinding and the gate stays green forever — the
negative-direction closure the spec calls the mechanization of a theta-1.0
MUST quietly stops covering the moved surface. The spec text is explicit that
these shapes "MUST NOT exist in the audited source tree" precisely because
the canonical-carrier resolution rules cannot see through them.

## Non-goals

- No claim that today's `src/` tree contains any prohibited shape (the gate's
  green-on-main run is currently truthful).
- The `createRequire(...).resolve()` carve-out (Step 0 (d) recipe) is
  respected by the spec and not contested here.
- Marker/exemption behaviour — sibling report 04.

## Fix

Extend pass 1 with one visitor per missing family-(4) clause, each with its
own `<symptom>` token and fixture (the spec's per-`<symptom>` fixture floor).
The captured-rebinding clause needs a context check in pass 3 (a `pi.`/`ctx.`
property access whose parent is a variable-declaration initialiser /
assignment RHS / property assignment is family (4), not a plain ref).
Alternatively, narrow the published claim — but the spec offers no partial-
publication tier: the obligations bind "if and when the implementation
publishes the audit", and it is published.

## Provenance

Spec-to-arm table built from audit-recognised-shapes.md; each missing arm
witnessed mechanically through the exported pure core with the production
inventory (probe deleted).

## Fix (0.381.0)
- What shipped:
  - `src/extension/inventory-closure-audit.ts` — pass-1 gains one carrier-scoped visitor per missing family-(4) clause (`computed-access`, `namespace-destructuring`, `captured-rebinding`, `destructured-carrier`, `wrapped-annotation`, `type-parameter-constraint`, `subtype-creation`, `non-parameter-binding`, `object-assign`, `keyof-typeof`, `cjs-require`), each with its own `<symptom>` token under the existing `out-of-scope-shape` family; pass-3 adds the captured-rebinding context check (a `pi.`/`ctx.` property access whose parent — through grouping/cast wrappers — is a variable-declaration initialiser or `=` assignment RHS is family (4), not a plain ref). Visitors key on carrier-LITERAL-typed annotations and on bare `pi`/`ctx` identifiers within canonical carrier scope (`inPiCarrier`/`inCtxCarrier`), never bare identifier names outside carrier scope.
  - `src/extension/production-theta-producer.ts` — `LivePromptQueryModel`'s `readonly #pi: ExtensionAPI` / `readonly #ctx: ExtensionCommandContext` class fields (the family-(4) non-parameter carrier-binding shape that predated this doc) narrowed to `Pick<>` structural-cap type aliases (`LivePromptQueryPi` = sendMessage/sendUserMessage/getActiveTools/setActiveTools; `LivePromptQueryCtx` = abort/isIdle/signal/waitForIdle), mirroring `production-host-loop-dispatch.ts`'s `HostLoopPi`/`HostLoopCtx`. Behaviour-preserving stored-type narrowing (type erasure ⇒ identical JS); the b0010/typed-query suites and full suite stay green with zero flips.
  - `tests/inventory-closure-audit-gate.test.ts` — one negative-test fixture per new `<symptom>` token (the spec's per-`<symptom>` fixture floor), incl. grouping/cast-wrapper capture cases and the `module`-namespace `createRequire` form.
- Gates: witness reverts red-for-reason + restore green (verifier obligation 1); full default suite `npx vitest run` = 550 files / 10261 tests pass; `tsc -p tsconfig.json --noEmit` exit 0; `eslint src/**/*.ts` clean; live `b0351live-value-position-query-success-binds` (real `pi -p`, typed-query drive) green under the campaign lock.
- Review: 2 rounds. Round 1 (bug-fix-reviewer): 5 findings — F1 wrapper-evasion of the capture check [correctness], F2 valid-citation-prefix misroute [spec], F3 namespace `createRequire` missed [correctness], F4 stale fixture comment [prose], F5 sibling redundant markers [test] — all fixed. Round 2 (bug-fix-reviewer-fast): CLEAN, no findings.
- Verification: SOLID. (1) three witness reverts red-for-reason, restore byte-exact; (2) full suite green; (3) live confirmed (orchestrator-run); (4) typecheck+lint exit 0.
- Residuals:
  1. `non-parameter-binding` fires on function-local `const`/`let`/`var` too, a deliberate superset of the clause's "top-level" enumeration (intent-faithful: any non-parameter carrier binding launders); no such local exists in `src/` (gate green over 162 files).
  2. `subtype-creation` `symbol` truncates a body-carrying declaration at `{` (`declHeadText`) rather than the pinned verbatim-single-line normalisation — a boundedness choice (WHY-commented).
  3. Aliased/intermediate-binding `createRequire` indirection (`const req = createRequire(...); req(...)`) is unimplemented — the spec's type-aware MAY (needs data-flow); the bare and `module`-namespace forms are covered.
  4. Pre-existing family-(4) tokens (`side-effect-import`, `default-import`, `export-star`, `aliased-export`, off-canonical-name/annotation `pi`) still lack per-`<symptom>` fixtures — pre-dates this fix; the new arms all comply.
- Discharge notes appended: none (0374 is the sibling and lands after this in the same module/gate test).
- Pinned dispositions / non-goals: **Non-goal-1 of this doc is FALSE and is superseded by parent adjudication** (the 0362 doc-was-wrong-note pattern). The doc's Non-goal-1 ("today's src/ tree contains no prohibited shape; the gate's green-on-main run is currently truthful") did not hold: `LivePromptQueryModel`'s `#pi`/`#ctx` carrier-typed class fields were the family-(4) non-parameter carrier-binding shape, present since before this doc's verification commit (9474dfa8). Parent adjudication: **Option 1 — expand scope + clean the tree, with carrier-scoped detection.** The refactor above removes the only real class-field hit; all other carrier-literal occurrences in `src/` are interface/object-type property SIGNATURES (out of the class-field clause), confirmed. The pass-3 capture check is scoped to the spec's "local variable, field, or closure-captured binding" — object-literal property carriage (`{ modelRegistry: ctx.modelRegistry }` at production-composition.ts:768, in canonical carrier scope) is NOT such a binding and stays GREEN (the composition-site carrier read the audit enumerates). No additional carrier-typed tree hit required a non-mechanical behaviour change.
