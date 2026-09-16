---
id: PTQ-0371
title: invoke-static-checks.ts's module header and checkInvokeStaticResolution's own doc comment both omit the RFC 0011 runtime-tool call-surface check
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/invoke-static-checks.ts:1-4
  - src/extension/invoke-static-checks.ts:61-75
  - src/extension/invoke-static-checks.ts:1124-1133
  - src/extension/invoke-static-checks.ts:1515-1528
  - src/extension/invoke-static-checks.ts:1732-1743
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260916045442
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-16
---

# invoke-static-checks.ts's module header and checkInvokeStaticResolution's own doc comment both omit the RFC 0011 runtime-tool call-surface check

## Observation
`src/extension/invoke-static-checks.ts` opens with a module-level comment
block (1-75) introduced by "Each check reuses an existing, unit-tested
checker rather than reimplementing it:" and then enumerates every such check
in a bulleted list that ends, after an RFC 0009 bullet, with a "Spec:"
footer (73-75). The exported function `checkInvokeStaticResolution`
(declared at 1529) carries its own near-identical enumerated doc comment
immediately above it (1468-1528), which likewise ends — after an INV-4
bullet — with no further items. Neither list mentions
`checkRuntimeToolCallSurface` (defined 1124-1232 with its own doc comment
naming "RFC 0011 §5.2"), which `checkInvokeStaticResolution` invokes
unconditionally at 1735-1743. `checkRuntimeToolCallSurface` and its call site
were both added by the most recent commit touching this file
(`27c267ed`, "rfc 0011 step 3", 2026-09-16); that commit's diff to this file
starts at line 135, after both comment blocks, so neither was edited.

## Evidence
`src/extension/invoke-static-checks.ts:1-4` — the header's own
completeness claim:
```ts
// Load-time (compose-pass) wiring for the invoke static checks the shipped
// pipeline previously never ran (invocation.md §Argument arity / §Resolution /
// §Cycle detection). Each check reuses an existing, unit-tested checker rather
// than reimplementing it:
```

`src/extension/invoke-static-checks.ts:61-75` — the header's list closes
(after the RFC 0009 bullet) straight into the "Spec:" footer; no RFC 0011 /
runtime-tool bullet exists anywhere in the list:
```ts
//     checks inside `checkInvokeStaticResolution`: `checkClauseCwdType` judges
//     the clause's `cwd` value as an ordinary `string` argument slot on both
//     call surfaces (the surface's own arg-type row, no new code); the mode gate
//     refuses a clause on a statically-resolvable PROMPT-mode callee
//     (`theta/parse/with-clause-prompt-mode-callee`); and the Erratum A′
//     default-reject loop convicts a clause on any bare-ident callee the frozen
//     callable set does not classify `theta` (`theta/parse/with-clause-pi-tool`
//     / `theta/parse/with-clause-in-process-callee`).
//
// The invoke-graph is keyed by discovered slash name (unique per registration),
// so the cycle message renders `invocation cycle: A → B → A` per the spec prose.
//
// Spec: invocation.md (§Argument arity, §Resolution, §Static resolution,
// §Cycle detection), diagnostics/code-registry-parse.md,
// diagnostics/code-registry-load.md.
```

`src/extension/invoke-static-checks.ts:1124-1133` — the omitted check's own
definition, naming the RFC and reusing existing checkers exactly as the
header's opening sentence describes every listed check doing:
```ts
/**
 * RFC 0011 §5.2 (tool-calls.md #session-control-runtime-tools): fixed-signature
 * arity/type checks for call sites whose frozen callable-set entry is
 * `kind: "runtime-tool"`. Mirrors `checkThetaCallableCallSurface`'s structure:
 * per call site, arity via `checkInvokeArity`, type via `checkToolCallArguments`
 * with `calleeKind: "runtime-tool"` and `positionalCount: 1`, first-mismatch-only.
 * GOV-15 inert: the loop body is unreachable when the callable set holds no
 * runtime-tool entry (every 1.0.0-clean file).
 */
function checkRuntimeToolCallSurface(
```

`src/extension/invoke-static-checks.ts:1515-1528` — `checkInvokeStaticResolution`'s
own doc comment's tail (its list runs from 1472 to 1522); it too closes with
no runtime-tool bullet:
```ts
 *   - RFC 0009 Erratum A′ / Erratum B `theta/parse/with-clause-pi-tool` /
 *     `theta/parse/with-clause-in-process-callee`: the default-reject loop over
 *     the bare-ident call surface for a clause on any callee the frozen
 *     callable set does not classify `theta` and that is not one of the
 *     file's own `subagent fn`s (RFC 0012 §10); an imported callee's verdict
 *     is deferred to `checkImportedWithClauseCallees` after import
 *     materialisation;
 *   - INV-4 invocation cycle (`theta/load/invocation-cycle`) via the graph walk.
 *
 * The extension-matching and forward-slash path-literal checks (lexical.md
 * §"Extension matching" / §"Path literals", reached via invocation.md §Resolution)
 * and the dynamic-path rejection (invocation.md §Resolution's string-literal
 * requirement) already fired during the whole-file parse and are not repeated here.
 */
```

`src/extension/invoke-static-checks.ts:1732-1743` — the live, unconditional
wiring inside `checkInvokeStaticResolution` itself, proving the omitted check
runs on every call to the function both comment blocks describe:
```ts
    // RFC 0011 §5.2: fixed-signature arity/type checks for runtime-tool call
    // sites. GOV-15 inert: the loop body is unreachable when no `tools:` entry
    // resolves to a `"runtime-tool"` kind (every 1.0.0-clean file).
    diagnostics.push(
      ...checkRuntimeToolCallSurface(
        callSites.callExprs,
        callerPath,
        typeEnv,
        typePass,
        deps.callableSet,
      ),
    );
```

## Why this is a problem
Both comment blocks present themselves as closed inventories of what this
module, and this function specifically, check ("Each check reuses … rather
than reimplementing it:", followed immediately by the bulleted list; the
function's own doc opens "returning every diagnostic…" over its own
matching list). A reader auditing which checks `checkInvokeStaticResolution`
runs, or grepping either comment block to find where a `tools:` entry of
kind `runtime-tool` gets its arity/type checking, is told the enumerated set
is complete when the current function runs one more phase than either list
names. The gap is mechanical, not interpretive: `checkRuntimeToolCallSurface`
is a real, wired, unconditionally-invoked function reusing the exact
"existing, unit-tested checker" idiom (`checkInvokeArity`,
`checkToolCallArguments`) the header's own framing sentence promises to
enumerate.

## Suggested direction (non-binding, optional)
Add a bullet for the RFC 0011 §5.2 runtime-tool call-surface check to both
comment blocks, in the same style as the existing bullets (naming the spec
section and the reused checkers), rather than leaving either list to imply
it is exhaustive when it is not.

## False-positive check
- Grepped `src/extension/invoke-static-checks.ts` lines 1-75 and 1468-1528
  (both comment blocks in full) for `runtime-tool`, `RFC 0011`, and
  `checkRuntimeToolCallSurface` — zero hits in either range; all four hits
  for `checkRuntimeToolCallSurface` in the file (1125 doc, 1133 declaration,
  1149 internal reference in a sibling helper's own doc, 1736 call site) sit
  outside both ranges.
- Confirmed the check is live, not dead: `checkRuntimeToolCallSurface` is
  called unconditionally from inside the exported `checkInvokeStaticResolution`
  (1736), which is itself called from `production-composition.ts` (grep
  confirms `checkInvokeStaticResolution` imported and invoked there) and from
  four test files (`session-control-static-checks.test.ts`,
  `session-control-parse.test.ts`, etc.) — this is a documentation-staleness
  claim, not a deadness claim.
- Git-history intent check: `git show 27c267ed -- src/extension/invoke-static-checks.ts`
  is the commit that added `checkRuntimeToolCallSurface`, its doc comment, and
  its call site; its diff hunk to this file starts at line 135 (`git show
  27c267ed -- src/extension/invoke-static-checks.ts | grep -m1 '^@@'` →
  `@@ -135,7 +135,9 @@`), confirming neither comment block (1-75, 1468-1528)
  was touched by the commit that made this omission current.
- Prior-finding check: grepped `quality/issues`/`quality/resolved`/`quality/intake`
  for `checkRuntimeToolCallSurface` and `RFC 0011 §5.2` — no hits in any
  filed or resolved finding; this file's own prior D9 filings
  (`PTQ-0321`/`PTQ-0351`/`PTQ-0370`, all resolved or open) concern function
  decomposition and cross-file placement, not the header/doc-comment text
  itself, and none of them post-date the commit that created this gap.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — header (1-75) and checkInvokeStaticResolution's own doc (1468-1528) both reproduce verbatim and both grep clean (zero hits) for "runtime-tool"/"RFC 0011"/"checkRuntimeToolCallSurface"; checkRuntimeToolCallSurface (doc+decl 1124-1133) is real, named RFC 0011 §5.2, and unconditionally invoked at 1736 inside checkInvokeStaticResolution (live production caller confirmed at production-composition.ts:1397); git show 27c267ed added the check and its diff to this file starts at old-line 135, with both cited comment ranges byte-identical pre/post that commit — a fresh instance of the stale-roster class already confirmed twice for this exact file (PTQ-0170, PTQ-0176, both since fixed to include what they flagged), not a duplicate of either or of the placement-only PTQ-0321/0351/0370/sibling d2-02; candidate's own false-positive-check miscounts the identifier's total file hits as 4 (actual 2: 1133/1736 — lines 1125/1149 contain no such reference) and its Observation over-extends the function's span to 1232 (actual close 1216), but neither slip touches the load-bearing claim (triage: claude-opus-5)
