---
id: pending
title: GENERIC_ARITY is a plain frozen object read by `[]` / `in` on an author-written generic head, while every other author-keyed lookup in the same type-layer files is null-prototype, `Object.hasOwn`, `Set` or `Map.get`
lens: D1
status: intake
verdict: pending
locations:
  - src/parser/type-walk.ts:73-76
  - src/parser/type-walk.ts:288-296
  - src/parser/params-lowering.ts:360
  - src/parser/params-lowering.ts:374
  - src/parser/params-lowering.ts:402
  - src/parser/type-layer-checks.ts:508
  - src/parser/type-layer-checks.ts:746
  - src/parser/type-layer-walk.ts:1133
  - src/parser/type-layer-walk.ts:1204
  - src/parser/type-walk.ts:440-441
  - src/parser/with-clause-static-checks.ts:287
  - src/parser/type-layer-provable.ts:297
sites: 12
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# GENERIC_ARITY is a plain frozen object read by `[]` / `in` on an author-written generic head, while every other author-keyed lookup in the same type-layer files is null-prototype, `Object.hasOwn`, `Set` or `Map.get`

## Observation
The in-scope type-layer files look up author-controlled source text (a schema name, a field name, a callee name, a binding name, an inline-object raw key) against tables in one of four hazard-guarded ways: a null-prototype record (`Object.create(null)`), an `Object.hasOwn` own-key test before a bracket read, a `Set`, or `Map.get` with an explicit `!== undefined` test. Each of those sites carries a comment naming the reason: an author-chosen key may spell an `Object.prototype` member (`constructor`, `toString`, `hasOwnProperty`, `__proto__`, …) and a plain-object read would answer through the prototype chain. `GENERIC_ARITY` (`src/parser/type-walk.ts:73-76`) is the one author-keyed table in scope built the other way — `Object.freeze({ array: 1, Result: 2 })`, a plain object with `Object.prototype` behind it — and both places that judge a generic head read it without an own-key guard: `walkType`'s `generic` arm does `GENERIC_ARITY[node.ctor]` then tests `!== undefined` (`type-walk.ts:288-289`), and `lowerTypeExpr` (`params-lowering.ts:360/374/402`) tests `ctor in GENERIC_ARITY`. A generic head spelling a prototype member therefore takes the closed-set arm: measured in this session, `let x: toString<integer> = 1` draws `theta/parse/generic-arity-mismatch :: generic type 'toString' expects function toString() { [native code] } type argument(s); got 1`, where the sibling `let x: Zzz<integer> = 1` draws `theta/parse/unresolved-named-type`.

## Evidence

### Way A — plain frozen object, bracket / `in` read on author text

`src/parser/type-walk.ts:66-76` (the table; its comment describes the two readers):
```ts
 * The closed `GenericType` set (grammar.md:99–:100, :107 — "No other
 * identifier is parameterisable"). Exported for `lowerTypeExpr`
 * (`src/parser/params-lowering.ts`), which exempts these two constructor keywords
 * from its reserved-head refusal by membership here rather than by name —
 * one closed set read by both places that judge a generic head, rather than
 * a second copy that could drift.
 */
export const GENERIC_ARITY: Readonly<Record<string, number>> = Object.freeze({
  array: 1,
  Result: 2,
});
```

`src/parser/type-walk.ts:286-296` (reader 1 — bracket read, definedness test; the prototype value is a function, so `!== undefined` passes and `node.args.length !== <function>` is `true`):
```ts
    case "generic": {
      if (rules === "all") {
        const expected = GENERIC_ARITY[node.ctor];
        if (expected !== undefined && node.args.length !== expected) {
          out.push({
            severity: "error",
            code: "theta/parse/generic-arity-mismatch",
            file: site.file,
            range: site.range,
            message: `generic type '${node.ctor}' expects ${expected} type argument(s); got ${node.args.length}`,
          });
        }
```

`src/parser/params-lowering.ts:360`, `:374`, `:402` (reader 2 — `in`, which is `true` for every inherited `Object.prototype` name; out of scope but a consumer of the in-scope table):
```ts
    if (RESERVED_KEYWORDS.has(ctor) && !(ctor in GENERIC_ARITY)) {
```
```ts
    if (!(ctor in GENERIC_ARITY) && IDENTIFIER.test(ctor)) {
```
```ts
    if (!(ctor in GENERIC_ARITY) && !RESERVED_KEYWORDS.has(ctor) && !IDENTIFIER.test(ctor)) {
```

Search (all readers of the table): `grep -rn "GENERIC_ARITY" src --include=*.ts | grep -v -E "^\S+:\s*(//|\*)"` — 7 hits:
```
src/parser/params-lowering.ts:22:import { GENERIC_ARITY } from "./type-grammar";
src/parser/params-lowering.ts:360:    if (RESERVED_KEYWORDS.has(ctor) && !(ctor in GENERIC_ARITY)) {
src/parser/params-lowering.ts:374:    if (!(ctor in GENERIC_ARITY) && IDENTIFIER.test(ctor)) {
src/parser/params-lowering.ts:402:    if (!(ctor in GENERIC_ARITY) && !RESERVED_KEYWORDS.has(ctor) && !IDENTIFIER.test(ctor)) {
src/parser/type-grammar.ts:114:export { GENERIC_ARITY, walkType } from "./type-walk";
src/parser/type-walk.ts:73:export const GENERIC_ARITY: Readonly<Record<string, number>> = Object.freeze({
src/parser/type-walk.ts:288:        const expected = GENERIC_ARITY[node.ctor];
```
Producers of the key: `node.ctor` is the generic head token text the type parser captured; `ctor` in `params-lowering.ts` is the head text before `<` in the `params:` type source. Both are author-written. Neither reader is preceded by an own-key guard (the `!== undefined` at `type-walk.ts:289` is a definedness test, not an own-key test).

### Way B — hazard-guarded lookups on author text, same files

`src/parser/type-layer-checks.ts:495-508` (`collectTypeEnv`, null-prototype record; the comment states the hazard):
```ts
 * Null-prototype (`Object.create(null)`) because a `NamedType` reference
 * carries no case constraint — unlike a declaration position, which
 * `theta/parse/schema-case-mismatch` shields — so a reference may spell an
 * `Object.prototype` own property (`constructor`, `toString`, `valueOf`,
 * `__proto__`, …) verbatim. On an ordinary `{}` a lookup for such a name
 * resolves through the prototype chain to a value that is not a `NamedDecl`,
 * manufacturing a declared type for a name no `schema` statement wrote — a
 * hazard the exported `resolveNamed` (type-compat.ts) also own-key-guards
 * independently at every consumption site, so either defence alone suffices.
 * With no prototype, a declaration literally named `__proto__` becomes an
 * ordinary own property too, instead of replacing the record's prototype.
 */
export function collectTypeEnv(statements: readonly Stmt[]): TypeEnv {
  const env: Record<string, NamedDecl> = Object.create(null) as Record<string, NamedDecl>;
```

`src/parser/type-layer-checks.ts:746` (`collectSchemaFields`, null-prototype record):
```ts
  const out: Record<string, CompatType> = Object.create(null) as Record<string, CompatType>;
```

`src/parser/type-layer-walk.ts:1128-1135` (`checkObjectFields`, own-key guard before the bracket read):
```ts
      // Own-key lookup: a theta field name may collide with an
      // `Object.prototype` member (`toString`, `constructor`, …), and the
      // record must never answer through the prototype chain and manufacture a
      // declared type for a field the schema does not declare.
      const declared =
        declaredFields !== undefined && Object.hasOwn(declaredFields, field.name)
          ? declaredFields[field.name]
          : undefined;
```

`src/parser/type-layer-walk.ts:1204` (`checkPatternFieldTypes`, the same guard):
```ts
              Object.hasOwn(declaredFields, field.name) ? declaredFields[field.name] : undefined;
```

`src/parser/type-walk.ts:402-404` and `:440-441` (`checkInlineFieldKeys`, `Set`s by stated design):
```ts
      // source. `seen` / `reported` are `Set`s, never a plain object, so an
      // author-chosen key can never collide with an object's own prototype
      // keys.
```
```ts
  const seen = new Set<string>();
  const reported = new Set<string>();
```

`src/parser/with-clause-static-checks.ts:270-272` and `:287` (`classifyWithClauseCallee`, `Map.get` by the stated rule):
```ts
 * Bug 0071 §Fix constraint 2 / the 0031-0038 hazard rule: `Map.get` plus an
 * explicit `!== undefined` test — a callee name is author-controlled source
 * text.
```
```ts
  const entry = callableSet?.entries.get(callee);
```

`src/parser/type-layer-provable.ts:296-297` (`provableIdentType`, `Map.get`):
```ts
  // author-controlled source text.
  const recorded = bindings.get(expr.name);
```

Search (the guarded mechanisms across the five in-scope files): `grep -n "Object.create(null)\|Object.hasOwn\|\.get(callee)\|bindings.get(expr.name)\|new Set<string>()" src/parser/type-layer-checks.ts src/parser/type-layer-walk.ts src/parser/type-walk.ts src/parser/with-clause-static-checks.ts src/parser/type-layer-provable.ts | grep -v -E "^\S+:\s*(//|\*)"` — 19 hits (first 10 shown, then the total):
```
src/parser/type-layer-checks.ts:508:  const env: Record<string, NamedDecl> = Object.create(null) as Record<string, NamedDecl>;
src/parser/type-layer-checks.ts:555:  const names = new Set<string>();
src/parser/type-layer-checks.ts:624:  const symbols = new Set<string>();
src/parser/type-layer-checks.ts:658:  const cyclic = new Set<string>();
src/parser/type-layer-checks.ts:659:  const settled = new Set<string>();
src/parser/type-layer-checks.ts:661:  const onStack = new Set<string>();
src/parser/type-layer-checks.ts:693:  const names = new Set<string>();
src/parser/type-layer-checks.ts:746:  const out: Record<string, CompatType> = Object.create(null) as Record<string, CompatType>;
src/parser/type-layer-walk.ts:707:    const names = new Set<string>();
src/parser/type-layer-walk.ts:1133:        declaredFields !== undefined && Object.hasOwn(declaredFields, field.name)
```
(19 total; the remaining 9 are type-layer-walk.ts:1204, type-walk.ts:440, :441, with-clause-static-checks.ts:58, :287, :298, :312, :323, type-layer-provable.ts:297.)

### The demonstrated cost (measured this session)

A scratch vitest file under `$TEMP` (created with `mktemp -d`; nothing written in the repository tree) called `parseDoc` from `tests/helpers/e2e-s1.ts` and printed `doc.diagnostics` as `code :: message`. Command: `npx vitest run --config <TEMP>/vitest.probe.config.mjs` with `root: "C:/UnitySrc/pi-theta"` and `include: ["<TEMP>/probe.test.ts"]`. Outputs, verbatim:
```
PROBE let_toString ["theta/parse/generic-arity-mismatch :: generic type 'toString' expects function toString() { [native code] } type argument(s); got 1"]
PROBE let_constructor2 ["theta/parse/generic-arity-mismatch :: generic type 'constructor' expects function Object() { [native code] } type argument(s); got 2"]
PROBE let_hasOwnProperty ["theta/parse/generic-arity-mismatch :: generic type 'hasOwnProperty' expects function hasOwnProperty() { [native code] } type argument(s); got 1"]
PROBE let_Zzz ["theta/parse/unresolved-named-type :: unresolved named type 'Zzz'"]
PROBE params_toString [...,"theta/parse/generic-arity-mismatch :: generic type 'toString' expects function toString() { [native code] } type argument(s); got 1"]
PROBE params_Zzz [...,"theta/parse/unresolved-named-type :: unresolved named type 'Zzz'"]
PROBE schema_toString ["theta/parse/generic-arity-mismatch :: generic type 'toString' expects function toString() { [native code] } type argument(s); got 1"]
PROBE schema_Zzz ["theta/parse/unresolved-named-type :: unresolved named type 'Zzz'"]
```
Sources: `let x: toString<integer> = 1\n1\n`; `let x: constructor<integer, string> = 1\n1\n`; `let x: hasOwnProperty<integer> = 1\n1\n`; `let x: Zzz<integer> = 1\n1\n`; `---\nname: t\nparams:\n  a: toString<integer>\n---\n1\n` (the two `theta/load/*` frontmatter lines elided as `...`); `schema S {\n  a: toString<integer>\n}\n1\n`. The `<n>` slot of the registered message renders a JavaScript function's source text, which no `GENERIC_ARITY` entry holds; the `Zzz` control on the same source shape takes the unresolved-name row.

### Drift already recorded

- `git log --reverse -S"GENERIC_ARITY" -- src | head -1` → `3cadc1ff 2026-06-30 V2a — type-grammar parser + loom-literal-sublanguage + array<T> sink resolution` (the table has been a frozen plain object since it was introduced).
- `git log -i --grep="bug-0038" | head -1` → `b34aaa52 2026-08-01 fix(bug-0038): null-prototype the TypeEnv and own-key-guard its eight reads — v0.48.0`.
- `docs/bugs/0038-typeenv-prototype-member-names-resolve-as-declared-types.md:207-209`: "That fix recorded `collectTypeEnv`'s `env` as 'the same prototype-hazard class one level up …'. The class is closed here". Bugs 0031, 0038 and 0071 each moved one author-keyed table onto a guarded mechanism; `GENERIC_ARITY`, keyed by the same class of author text and pre-dating all three, was not moved, so the two ways now coexist inside one module (`type-walk.ts` guards its raw-key `Set`s at `:440-441` and reads `GENERIC_ARITY` unguarded at `:288`).

Self-inconsistency statement: no written rule exists; the anchor is self-inconsistency plus the cost cited above — the same files state the prototype-chain hazard as the reason for their guarded lookups (`type-layer-checks.ts:495-505`, `type-layer-walk.ts:1128-1131`, `type-walk.ts:402-404`, `with-clause-static-checks.ts:270-272`), and the one unguarded author-keyed table in the same files produces the message shown above.

## Why this is a problem
Two mechanisms answer the same question — "is this author-written name a key of my table?" — and they answer differently for the twelve `Object.prototype` own-property names. A maintainer reading `type-walk.ts` sees `seen` / `reported` kept as `Set`s "so an author-chosen key can never collide with an object's own prototype keys" (`:402-404`) and twenty lines earlier a `Readonly<Record<string, number>>` read by `[]` on the same kind of key; the local convention and the table's shape disagree, and there is nothing at the table to say which one is intended. Mechanically, what goes wrong when the ways diverge is exactly what the guarded sites' comments predict and what the probe shows: the unguarded read "manufactur[es]" an answer for a name no entry holds — the `generic` arm takes a `Result`/`array`-only branch for `toString<…>` / `constructor<…>` / `hasOwnProperty<…>` and interpolates a function's source into the `<n>` placeholder, while `params-lowering.ts`'s three `in` tests treat those heads as members of the closed set and skip the reserved-head / closed-set-width arms written for every other head. The drift is already on record: bug 0038's fix declared the hazard class closed for the type layer's tables while this table, in the same layer, keeps the pre-0031 shape.

## Suggested direction (non-binding, optional)
Unproven hypothesis: the closed generic set could be held in whichever guarded shape its two readers already use for their other author-keyed lookups (a null-prototype record, a `ReadonlyMap<string, number>` read via `.get()` + `!== undefined`, or an `Object.hasOwn` guard at the two reads), so `type-walk.ts:288` and `params-lowering.ts:360/374/402` answer for own keys only. Which shape, and whether any witness pins the current `toString<…>` output, is for the fix stage.

## False-positive check
- Clone-map check: no group in the injected clone map covers any cited site (type-walk.ts has no groups; the type-layer-walk.ts groups G040/G058 are the exhaustiveness backstops and the let/reassign compat blocks, not `:1133`/`:1204`; with-clause-static-checks.ts G059 is the two `surface` input types at `:44-53`/`:136-145`, not `:287`). The observation is mechanism-shaped (plain object vs guarded lookup), not a token copy.
- D9-affinity check: this is not a wrong-home claim. `GENERIC_ARITY` lives beside its primary reader (`walkType`) and is re-exported for its second reader by design (`type-walk.ts:67-72`); the finding is about the lookup mechanism at both readers, not about where the table sits.
- D2-deadness check: both sides are live. `GENERIC_ARITY` has 2 direct readers plus a re-export (search S1 above, 7 hits); every guarded site cited is in production code reached by `checkTypeLayer` / `walkType` / `checkWithClauseDefaultReject`.
- Export-style exemption: not applicable (divergent-solutions, not wide-surface).
- Prior-filing check: `grep -rln "GENERIC_ARITY" quality/intake quality/issues quality/resolved` → 5 files (PTQ-0005, PTQ-0025, PTQ-1198, PTQ-1199, PTQ-1200); `grep -rn "prototype" <those five>` → 0 hits — none concerns the lookup mechanism (PTQ-0005 is a subsumed parse guard; the others are D9 breakdowns / a D2 unread field). PTQ-1547 (open, D6) is the `par for` binder fallback, a different site and mechanism.
- Witness check: `grep -rn "toString<\|constructor<\|hasOwnProperty<" tests docs/bugs --include=*.ts --include=*.md | wc -l` → 0, so no test or bug record pins the current output for a prototype-named generic head.
- Behaviour-change guard: the filing's claim is the divergence of mechanism; the probe output is cited as the demonstrated cost, not as a bug report, and no fix is prescribed.

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. Both stated searches reproduce exactly (7 GENERIC_ARITY hits; 19 guarded-mechanism hits, same lines). GENERIC_ARITY is still a plain Object.freeze record read by `[node.ctor]` at type-walk.ts:288 and by `ctor in` at params-lowering.ts:360/374/402. Every Way-B excerpt matches at its cited line (type-layer-checks.ts:508/746, type-layer-walk.ts:1133/1204, type-walk.ts:440-441, with-clause-static-checks.ts:287, type-layer-provable.ts:297). clone-scan finds no groups for type-walk.ts. The commits 3cadc1ff and b34aaa52 and the bug-0038 closure quote all check out. I re-ran the probe in a $TEMP scratch vitest: `toString<integer>` in the let, params and schema positions and `constructor<integer, string>` draw generic-arity-mismatch with a function's source in the `<n>` slot, while `Zzz<integer>` draws unresolved-named-type. The same search for witnesses finds none (0 hits), and no PTQ or intake filing covers this. (triage: claude-opus-5-5)
