---
id: PTQ-1726
title: checkFnCallArgs documentation still says recursive array-element sinks are unwired.
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/type-layer-walk.ts:1286-1296
  - src/parser/type-layer-walk.ts:994-997
  - src/parser/type-layer-walk.ts:1411-1416
  - src/parser/type-layer-walk.ts:1051-1062
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# checkFnCallArgs documentation still says recursive array-element sinks are unwired.

## Observation
The documentation of `checkFnCallArgs` says recursive descent into an array-typed sink's element is not wired at this or any other route. The argument-checking loop calls `checkArrayLiteral`, which recursively checks nested array literals against the unfolded element sink. The latter helper's own documentation explicitly identifies it as the implementation of that fourth sink rule. The former comment retains the implementation boundary from bug 0156 before bug 0241 added the descent.

## Evidence

The retained statement, `src/parser/type-layer-walk.ts:1286-1296`:
```ts
   * Bug 0156's fix (§Fix Route A): a function parameter's declared type is
   * the array literal's SECOND element sink in `grammar.md`'s exhaustive
   * three-bullet list — the same footing as the binding-annotation sink
   * (`walkExpr`'s typed-`let` arm, via `sinkedArrayOf`) and the
   * constructor-field sink (`checkObjectField`). The return value names which
   * of `e.args` this call already ran through `checkArrayLiteral` against
   * that sink, so the caller (`walkExpr`'s `case "call"`) does not re-check a
   * sunk literal sink-less — resolved ONCE here rather than re-derived in the
   * walk. The fourth bullet, recursive descent into an array-typed sink's
   * OWN element, is not wired at this or any other route and is not this
   * change's claim.
```

The helper's current contract, `src/parser/type-layer-walk.ts:994-997`:
```ts
   * The array-literal check every sink dispatch shares (`sinkedArrayOf`'s
   * caller, `checkFnCallArgs`, `checkObjectField`), and the one place
   * `grammar.md:238`'s fourth sink bullet is wired: an array-typed sink's
   * element type is itself a sink for a nested array literal. Returns every
```

The parameter-sink dispatch, `src/parser/type-layer-walk.ts:1411-1416`:
```ts
      const unfolded = unfoldAlias(paramType, this.env);
      if (arg.kind === "array" && unfolded.kind === "array") {
        for (const node of this.checkArrayLiteral(arg, unfolded.element, bindings)) {
          sunkArgs.add(node);
        }
      }
```

The recursive descent, `src/parser/type-layer-walk.ts:1051-1062`:
```ts
    const unfolded = unfoldAlias(sink, this.env);
    if (unfolded.kind !== "array") {
      return judged;
    }
    for (const element of array.elements) {
      if (element.kind === "array") {
        for (const node of this.checkArrayLiteral(element, unfolded.element, bindings)) {
          judged.add(node);
        }
      }
    }
    return judged;
```

## Why this is a problem
Under the simplicity-and-cruft principle, historical implementation-status prose becomes residue when it describes a landed mechanism as absent. The comment says the descent is unwired, while the same class both documents and executes it through the parameter-sink route. This is a mismatch in source commentary, not a request to change the sink rules, their guards, or any historical bug record.

## Suggested direction (non-binding, optional)
Align the current method documentation with the landed nested-sink descent without altering the dated bug records.

## False-positive check
- Read the parameter-sink dispatch and the recursive call quoted above; the finding does not infer implementation status from test names or documentation alone.
- Ran `git log -4 --oneline -S 'this.checkArrayLiteral(element, unfolded.element, bindings)' -- src/parser/type-layer-walk.ts src/parser/type-layer-checks.ts`: the descent was introduced by `6e5ac5e6` and later moved with the class by `bd8e73b7`. `git show --format=short --stat 6e5ac5e6` identifies the change as the bug-0241 nested-array sink fix.
- Ran `git log -3 --oneline -S 'The fourth bullet, recursive descent' -- src/parser/type-layer-checks.ts`: the comment came from `dc0b6911`, the earlier bug-0156 parameter-sink fix, and remained through the class extraction. Its statement about what that earlier change claimed can be historical, but the present-tense assertion that no route wires the rule no longer describes the code.
- Ran `rg -n -l 'three-bullet|not wired at this or any other route' quality/intake quality/issues quality/resolved --glob '*.md'` before filing: the only matching report was PTQ-0134, about a different surface-inventory enumeration. No deadness, unused-export, test-only-reachability, or spec-enumeration-removal claim is made.

## Triage
verdict: confirmed — All four excerpts reproduce: checkFnCallArgs still says recursive sinks are unwired, but its live argument loop calls checkArrayLiteral, which recursively descends through unfolded array elements; git history verifies bug 0241 added that mechanism after bug 0156's comment. This is stale production-source implementation prose within D2, and no same-root issue was found (PTQ-0134 concerns SDK inventory counts). (triage: claude-opus-5-5)
