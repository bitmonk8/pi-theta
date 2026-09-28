---
id: PTQ-1547
title: checkParFor binds a non-array iterand's loop variable to a bare named "unknown" where the plain-for arm records it withheld, so a nested for inside par for draws a false non-array-iterand
lens: D6
status: open
verdict: confirmed
locations:
  - src/parser/type-layer-walk.ts:1622-1634
  - src/parser/type-layer-walk.ts:208-224
  - src/parser/type-layer-iterand.ts:18-29
sites: 3
fix_scope: module
d6_class: posture-divergence
d6_anchor: docs/bugs/0126-plain-for-binds-no-loop-variable.md §Fix (0.107.0) route settlement ("the literal `par for` mirror reintroduces this report's own defect … draws a false `theta/parse/non-array-iterand :: … got unknown`, an `E` denying registration on a program that loads cleanly")
wave: qw20260928060032
reported_by: lens-d6-errorposture (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# checkParFor binds a non-array iterand's loop variable to a bare named "unknown" where the plain-for arm records it withheld, so a nested for inside par for draws a false non-array-iterand

## Observation
`TypeLayerWalk` has two loop arms that handle the same condition: the iterand's static type is not `array<T>` after TYPE-11 unfolding, so the walk has no element type for the loop variable. The plain-`for` arm (`walkStmt` `case "for"`) records the variable through `recordWithheldBinders`. That mints the `withheld` marker, and the three sinks that refuse an unresolvable `named` (iterand, object-index key, `join` element) test for that marker and skip their verdict. The `par for` arm (`checkParFor`) binds the same variable to `{ kind: "named", name: "unknown" }` through `bindLoopElement`. That object carries no `withheld` marker, so those sinks judge it and refuse it. Measured in this session: `fn h(p) { for x in p { for y in x { } } }` gives `[]`, while `fn h(p) { par for x in p { for y in x { } }\n 1 }` gives `theta/parse/non-array-iterand :: 'for' expects array<T> after 'in'; got unknown`.

## Evidence
Divergent side, `par for` arm, `src/parser/type-layer-walk.ts:1622-1634`:
```ts
    // Bind the fresh immutable loop variable to the iterand element type so
    // body checks resolve it, then walk the body. TYPE-11: an alias of
    // `array<T>` supplies the same element as `array<T>` itself, so the
    // iterand is unfolded again here, independently of the admissibility
    // gate above — this is its own `kind === "array"` test, over the
    // element rather than the whole iterand.
    const iterandType = unfoldAlias(this.typeOf(e.iterand, bindings), this.env);
    const inner = new Map(bindings);
    const elementType: CompatType =
      iterandType.kind === "array" ? iterandType.element : { kind: "named", name: "unknown" };
    this.bindLoopElement(inner, e.variable, elementType, e.iterand, bindings);
    this.walkBlock(e.body, inner, flow);
    return;
```

Sibling side, plain-`for` arm, `src/parser/type-layer-walk.ts:208-224`:
```ts
        // exactly as the admissibility gate above already requires. A
        // non-`array` iterand withholds instead of adopting a nominal: the
        // gate above has already refused it at its own span (or deferred, when
        // the iterand is itself withheld), and a minted unresolvable name
        // would be judged structurally at the sinks that refuse unresolvables
        // — measured, it draws a false `theta/parse/non-array-iterand … got
        // unknown` on `fn h(p) { for x in p { for y in x { } } }`, which loads
        // cleanly. ...
        const unfolded = unfoldAlias(iterandType, this.env);
        if (unfolded.kind === "array") {
          this.bindLoopElement(inner, stmt.variable, unfolded.element, stmt.iterand, bindings);
        } else {
          this.recordWithheldBinders(inner, [stmt.variable]);
        }
```

The sink that tells the two apart, `src/parser/type-layer-iterand.ts:18-29`. It withholds only on the `withheld` marker, never on a bare `named "unknown"`:
```ts
export function checkIterand(
  iterandType: CompatType,
  site: ControlFlowSite,
  env: TypeEnv,
  diagnostics: Diagnostic[],
): void {
  const diag = containsWithheldBinderType(iterandType)
    ? undefined
    : checkForIterand({ type: iterandType }, site, env);
  if (diag !== undefined) {
    diagnostics.push(diag);
  }
}
```

Sibling-class argument, stated mechanically: both arms run the same `unfoldAlias(typeOf(iterand))` and branch on `kind === "array"`. Both arms send the array branch to the shared `bindLoopElement` (lines 221 and 1633, the only two call sites: `grep -n 'this.bindLoopElement(' src/parser/type-layer-walk.ts` → 2 hits). They differ only in the non-array branch. There the plain `for` calls `recordWithheldBinders` (`grep -n 'this.recordWithheldBinders(' src/parser/type-layer-walk.ts` → 4 hits: 223, 296, 713, 731, none in `checkParFor`). The `par for` mints the file's only `name: "unknown"` literal (`grep -c 'name: "unknown"' src/parser/type-layer-walk.ts` → 1).

Anchor, quoted from `docs/bugs/0126-plain-for-binds-no-loop-variable.md:1207-1218` (§Fix (0.107.0), fixed status). This record measured the `par for` fallback's behaviour when it is mirrored onto `for`:
> The fallback choice is decisive and was measured both ways: the literal `par for` mirror reintroduces **this report's own defect** at the binder classes it does not own — `fn h(p) { for x in p { for y in x { } } }` draws a false `theta/parse/non-array-iterand :: … got unknown`, an `E` denying registration on a program that loads cleanly, with an internal sentinel rendered into a `<type>` slot.

The walk file's header, `src/parser/type-layer-walk.ts:5-6`, states the same posture: "Unprovable reads defer to runtime; withholding can suppress a diagnostic, never manufacture one."

Measurements run this session. A scratch probe under $TEMP called `parseThetaDocument` directly with inert deps:
- `fn h(p) { for x in p { for y in x { } } }` → `[]`
- `fn h(p) { par for x in p { for y in x { } }\n 1 }` → `["theta/parse/non-array-iterand :: 'for' expects array<T> after 'in'; got unknown"]`
- `fn h(p) { let r = par for x in p { for y in x { } 1 }\n r }` → same false `non-array-iterand`
- `fn h(p) { par for x in p { [x].join(",") }\n 1 }` → `["theta/parse/non-string-array-join :: array.join requires a string element type; got array<unknown>"]`

## Why this is a problem
The two loop arms give opposite answers when the parser cannot see the iterand's element type. The plain `for` withholds and defers, as bug 0126's settled fix requires. The `par for` arm hands the body a sentinel that the unresolvable-refusing sinks judge, so it produces an `E`-severity `theta/parse/*` refusal. That refusal denies registration of a theta whose plain-`for` spelling loads cleanly, which is the exact false refusal bug 0126 measured and rejected for the `for` arm.

## Suggested direction (non-binding, optional)
Make `checkParFor`'s non-array branch use the same withheld-binder route as the plain-`for` arm, so a variable the layer cannot type is marked withheld on both loop kinds.

## False-positive check
- EXST-9 / PIC-73 class check: neither applies. This is a parse-time type-layer walk, not an execution-status sink or an optional degrade-silent capability.
- allow-broad-catch token check: no catch at any cited site. `grep -n "catch" src/parser/type-layer-walk.ts src/parser/type-layer-iterand.ts` finds none in code.
- Stated-rationale check: bug 0126 §Non-goals (`:821-824`) says "The `par for` arm is the reference implementation here, not a subject. Its non-`array` fallback (`{ kind: "named", name: "unknown" }`, `:1192`) … [is] unchanged by any route below". The §Fix record's "post-0050 the two arms' non-`array` fallbacks legitimately differ" (`:1208-1209`) rests on that pin. This is a scope exclusion, not a stated reason that the sentinel is correct. The same record's measurement (quoted above) shows the sentinel produces a false `E`, and this session's probe shows the `par for` arm producing that `E` on the `par for` spelling, so the "legitimately differ" rationale is demonstrably false as a posture claim. Bug 0126 §Fix (e) posture 2 calls the sentinel "already safe by accident", but only in the schema-namespace-collision sense (`schema unknown` cannot load). It does not cover the unresolvable-refusing sinks. Bug 0247 admits the `unknown` spelling as a rendering; it rules on text, not on whether the refusal should fire. The `checkParFor` comment (`:1622-1627`) gives no rationale for the non-array value.
- Sibling-reality check: both arms are live in production; both are reached from `walkStmt` / `walkExpr` in the same `TypeLayerWalk`. `grep -rln "got unknown" tests` → 1 file (tests/plain-for-loop-variable-element-type.test.ts), which pins the plain-`for` g1/g5 cells. No test pins the `par for` nested-`for` refusal: `grep -rn "par for x in p" tests docs/bugs` → 6 hits, all over the annotated `p.xs` member iterand (bug 0190 R11), none over an unannotated parameter.
- Routing notes (not filed here): an empty-literal iterand (`for x in [] { for y in x { } }`) draws the same false `non-array-iterand … got unknown` on BOTH arms (measured). The array-branch element `named "unknown"` comes from `#typeExpr`'s `[]` typing. That handling is the same on both arms, so it is a bug routing, not this divergence.

## Triage
verdict: confirmed — both sides were checked and reproduce. type-layer-walk.ts:1628-1633 `checkParFor` binds a non-array iterand's element to `{kind:"named",name:"unknown"}`, and :218-224 plain `for` uses `recordWithheldBinders`. type-layer-iterand.ts:24 withholds only on `containsWithheldBinderType`. Every stated search reproduces (bindLoopElement 2 hits at 221/1633; recordWithheldBinders 4 hits at 223/296/713/731; 1 `name: "unknown"`; 6 `par for x in p` hits; 1 `got unknown` test file; 0 catches). A re-run probe gave `[]` for the plain-for nested loop, but false `non-array-iterand … got unknown` for both par-for spellings and a false `non-string-array-join … array<unknown>`. The anchor pins the withheld side: bug 0126 §Fix :1214-1218 measured that this exact sentinel draws a false E on a clean program, and the walk header :5-6 says withholding "never manufacture[s]" a diagnostic. The "legitimately differ" line at 0126:1208-1209 rests only on the §Non-goals scope pin (:821-824), not on any claim that the sentinel is sound. No EXST-9/PIC-73 pin applies, and no open or resolved PTQ tracks this (PTQ-1133 was the gate clone, not the binder fallback) (triage: claude-opus-5-5)
