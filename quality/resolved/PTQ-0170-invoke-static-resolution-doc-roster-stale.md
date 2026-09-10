---
id: PTQ-0170
title: checkInvokeStaticResolution's doc comment claims to list "every diagnostic" the function returns but omits five codes its body emits (invoke-arg-type-mismatch and the four RFC 0009 with-clause routes) and calls the type checks "Both" where the body counts three
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/invoke-static-checks.ts:989-1028
  - src/extension/invoke-static-checks.ts:1129-1139
  - src/extension/invoke-static-checks.ts:1145-1156
  - src/extension/invoke-static-checks.ts:1202-1212
  - src/extension/invoke-static-checks.ts:1247-1268
  - src/extension/invoke-static-checks.ts:1423-1446
  - src/extension/invoke-static-checks.ts:1046-1048
sites: 7
fix_scope: localized
wave: qw20260910054544
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-10
---

# checkInvokeStaticResolution's doc comment claims to list "every diagnostic" the function returns but omits five codes its body emits (invoke-arg-type-mismatch and the four RFC 0009 with-clause routes) and calls the type checks "Both" where the body counts three

## Observation
The doc comment on `checkInvokeStaticResolution` opens "Run the load-time
invoke static checks for one discovered theta, returning every diagnostic" and
then enumerates five items: INV-1 path-escape, INV-3 arity, bug 0072
`tool-arg-type-mismatch`, bug 0072 `tool-arg-schema-conflict`, and INV-4
cycle, with a bridging sentence "Both type checks judge an expression by the
SET of types". The function body additionally pushes
`theta/parse/invoke-arg-type-mismatch` (bug 0137, via `checkInvokeCall`),
`theta/parse/with-clause-prompt-mode-callee` (two surfaces),
`theta/parse/with-clause-pi-tool`, `theta/parse/with-clause-in-process-callee`,
and the INV-6 `cwd` type route (via `checkClauseCwdType`, which reuses the
per-surface argument codes). The body's own comment at :1046 counts "all
three static tool/invoke-argument TYPE checks". Git blame shows the doc block
was last touched by the bug 0072 / bug 0112 commits and was not edited by the
bug 0137 commit (a314ac83, 2026-08-05) or the RFC 0009 commit (96303cc3,
2026-09-09) that added the omitted emissions.

## Evidence
src/extension/invoke-static-checks.ts:989-991 — the completeness claim:

```ts
/**
 * Run the load-time invoke static checks for one discovered theta, returning
 * every diagnostic (error-severity entries un-register the theta):
```

src/extension/invoke-static-checks.ts:1003-1022 — the roster (INV-3 at :1003-1006, the two
bug 0072 rows, "Both type checks", INV-4); nothing between :992 and :1028
names bug 0137, INV-6, INV-8, or any `with-clause-*` code:

```ts
 *   - INV-3 arity (`theta/parse/invoke-arity-too-{many,few}`) against the
 *     (tool-calls.md §"Argument shape" binds the two by name);
 *   - bug 0072 `theta/parse/tool-arg-type-mismatch` over the `.theta`-callable
 *     call surface, immediately AFTER its arity check and only when arity
 *     raised no diagnostic (arity before type, invocation.md §Argument
 *     arity): a positional argument whose static type does not match the
 *     callee's corresponding `params:` field type;
 *   - bug 0072 `theta/parse/tool-arg-schema-conflict` over the Pi-tool call
 *     surface: a sole bare-object argument field whose static type is
 *     provably disjoint from the tool's registered input-schema type for
 *     that field (RFC 0002's provable-disjointness front-run of the runtime
 *     AJV check);
 *
 *     Both type checks judge an expression by the SET of types it can evaluate
```

src/extension/invoke-static-checks.ts:1129-1139 — omitted emission 1, the
invoke-surface INV-8 mode gate:

```ts
      if (invoke.withClause !== undefined && arity !== undefined && arity.mode === "prompt") {
        diagnostics.push({
          severity: "error",
          code: WITH_CLAUSE_PROMPT_MODE_CALLEE_CODE,
          file: site.file,
          range: site.range,
          message: withClausePromptModeCalleeMessage(invoke.path),
          hint: WITH_CLAUSE_PROMPT_MODE_CALLEE_HINT,
        });
        clauseRefused = true;
      }
```

src/extension/invoke-static-checks.ts:1145-1156 — omitted emission 2, the
INV-6 `cwd` type route (`checkClauseCwdType` emits
`INVOKE_ARG_TYPE_MISMATCH_CODE` on this surface, :453-467):

```ts
      if (!clauseRefused) {
        diagnostics.push(
          ...checkClauseCwdType({
            ...(invoke.withClause !== undefined ? { clause: invoke.withClause } : {}),
            surface: { kind: "invoke", providedCount },
            file: callerPath,
            fallbackRange: invoke.range,
            typeEnv,
            typePass,
          }),
        );
      }
```

src/extension/invoke-static-checks.ts:1202-1212 — omitted emission 3, bug
0137's `theta/parse/invoke-arg-type-mismatch` (`checkInvokeCall` →
`checkInvokeArgTypes`, src/parser/invoke-diagnostics.ts:585 and :297):

```ts
        diagnostics.push(
          ...checkInvokeCall({
            callee: invoke.path,
            staticallyResolvable: true,
            requiredCount: arity.requiredCount,
            totalCount: arity.totalCount,
            args: argSlots,
            env: emptyCalleeAnnotationEnv,
            site,
          }),
        );
```

src/extension/invoke-static-checks.ts:1247-1256 — omitted emission 1 again on
the `.theta`-callable surface (`WITH_CLAUSE_PROMPT_MODE_CALLEE_CODE`), followed
at :1257-1268 by the second `checkClauseCwdType` call.

src/extension/invoke-static-checks.ts:1423-1446 — omitted emissions 4 and 5,
the Erratum A′ default-reject loop:

```ts
        if (entry !== undefined && entry.kind === "pi-tool") {
          diagnostics.push({
            severity: "error",
            code: WITH_CLAUSE_PI_TOOL_CODE,
            file: callerPath,
```
```ts
        diagnostics.push({
          severity: "error",
          code: WITH_CLAUSE_IN_PROCESS_CALLEE_CODE,
          file: callerPath,
```

src/extension/invoke-static-checks.ts:1046-1048 — the body's own count of type
checks, disagreeing with the doc's "Both":

```ts
    // Bug 0072 / bug 0137: all three static tool/invoke-argument TYPE checks —
    // this loop's own per-argument check below, the `.theta`-callable
    // per-argument check, and the Pi-tool schema-conflict check — share ONE
```

Code constants named above resolve to registry codes at
src/parser/invoke-diagnostics.ts:66 (`theta/parse/invoke-arg-type-mismatch`),
:92-93 (`theta/parse/with-clause-prompt-mode-callee`), :96
(`theta/parse/with-clause-pi-tool`), :103-104
(`theta/parse/with-clause-in-process-callee`).

Blame of :989-1028: `git blame -L 989,1028` attributes every line to
80fef716 (bug 0072), 537c274c (bug 0112), 2626d39d, f8364db1, 1c7bd36a —
none to a314ac83 (bug 0137) or 96303cc3 (RFC 0009). `git show a314ac83 --
src/extension/invoke-static-checks.ts` edits the module header (:11-17) and
`CalleeArityField`'s doc but no line of this block.

## Why this is a problem
Stale roster with an explicit completeness claim. The comment says the list
is "every diagnostic" the function returns; the body emits five diagnostic
routes (one of them on two surfaces) that the list does not contain, and the
list's bridging count ("Both type checks") is contradicted by the same
function's in-body count ("all three"). A reader auditing which registry rows
this compose pass owns — the module's stated purpose — is told a subset and
has to discover the with-clause and 0137 routes by reading 500 lines of body.
The gap is mechanical, not interpretive: two later commits added emissions to
the function and left its inventory untouched.

## Suggested direction (non-binding, optional)
Bring the doc roster into agreement with the body's emission set (or drop the
"every diagnostic" framing in favour of pointing at the body's per-loop
comments, which are current), and reconcile "Both"/"three" with the checks
present.

## False-positive check
- Verified each omitted code is actually pushed by this function: grep for
  `code:` / `checkInvokeCall(` / `checkClauseCwdType(` between :1029 and
  :1535 yields the sites cited above; `checkInvokeCall` returns
  `checkInvokeArgTypes` after arity passes (src/parser/invoke-diagnostics.ts:573-585),
  which pushes `INVOKE_ARG_TYPE_MISMATCH_CODE` (:297); `checkClauseCwdType`
  pushes `INVOKE_ARG_TYPE_MISMATCH_CODE` (:454-469) and, on the other surface,
  `checkToolCallArguments` with `calleeKind: "theta-callable"` (:470-486).
- Verified the doc block does not mention them: `sed -n 989,1028p | grep -i
  "0137\|with-clause\|INV-6\|INV-8\|cwd\|prompt-mode"` → no hits.
- Verified this is not a scoped-subset reading: the sentence is "returning
  every diagnostic", not "the following diagnostics among others"; and the doc
  does include the bug 0072 additions from the same era, so it is an inventory
  that stopped being maintained, not a deliberately partial one.
- Git intent: blame attributes no line of :989-1028 to a314ac83 or 96303cc3;
  the module header (:11-17) WAS updated for bug 0137, showing the omission is
  an oversight at this second site rather than a documented policy.
- Not a duplicate: PTQ-0061 (collectInvokeExprs export), PTQ-0050
  (ImportedNonCtorKind), PTQ-0127/PTQ-0137 (rosters in other files) and the
  pending qw20260907183353-d2-05 (checkCompatible knob) cover different
  symptoms; no filed finding cites :989-1028.

## Triage
verdict: confirmed — every cited fact reproduces: the doc at :990-991 says "returning every diagnostic" and its roster (:992-1022) names only INV-1, INV-3, the two bug-0072 rows and INV-4 with a "Both type checks" bridge, while the function body (closes :1537) also pushes WITH_CLAUSE_PROMPT_MODE_CALLEE_CODE (:1130-1132, :1247-1249), checkClauseCwdType (:1146, :1258 → INVOKE_ARG_TYPE_MISMATCH_CODE / theta-callable tool-arg-type-mismatch at :453-486), checkInvokeCall (:1202 → checkInvokeArgTypes → INVOKE_ARG_TYPE_MISMATCH_CODE, invoke-diagnostics.ts:295-297/569-585), WITH_CLAUSE_PI_TOOL_CODE (:1426) and WITH_CLAUSE_IN_PROCESS_CALLEE_CODE (:1439), all resolving to registry codes at invoke-diagnostics.ts:66/92-93/96/103-104; the third type check (buildInvokeArgSlot, collectProvableArgTypes at :940) judges by type-SET exactly like the two the doc counts, so "Both" undercounts as the body's own :1046 "all three" says; `git blame -L 989,1028` attributes no line to a314ac83 (bug 0137) or 96303cc3 (RFC 0009) — the only post-0137 touch, 537c274c (bug 0112), is a scoped INV-5→INV-1 relabel, not a roster pass — and my own enumeration of every diagnostics.push in :1029-1537 adds a sixth omission (checkCalleeHasErrors :1099-1100, 8f3fccf3) that widens the gap; stale-inventory-with-completeness-claim is the accepted class of PTQ-0113/0116/0127/0160, and same-wave siblings d2-02 (module header :1-58) and d2-03 (:1049 "both check loops") explicitly exclude this block, so not a duplicate (triage: claude-opus-5)
