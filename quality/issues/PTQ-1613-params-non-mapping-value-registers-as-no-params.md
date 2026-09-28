---
id: PTQ-1613
title: A present non-mapping, non-null `params:` value (`params: [a, b]`, `params: 42`, `params: hello`) registers as a no-params theta with zero diagnostics, because extractParsedParams returns silently on `!isMap` while `params: null` and non-mapping `tool_loop:` / `respond_repair:` values are refused
lens: D6
status: open
verdict: confirmed
locations:
  - src/parser/frontmatter-params.ts:98-100
  - src/parser/frontmatter.ts:816-832
  - src/parser/frontmatter-yaml.ts:366-390
  - src/parser/frontmatter.ts:659-663
sites: 4
fix_scope: module
d6_class: posture-divergence
d6_anchor: "docs/spec_topics/frontmatter/frontmatter-fields-a.md:48 (tool_loop row) — \"A present `tool_loop:` value that is not a mapping — a scalar, a sequence, or any other non-mapping node — is `theta/load/malformed-tool-loop-field` and the theta does not register\"; :45 (tools row) — \"\\\"absent\\\" and \\\"present-but-the-wrong-shape\\\" do not collapse into one behaviour\""
wave: qw20260928060032
reported_by: lens-d6-errorposture (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# A present non-mapping, non-null `params:` value (`params: [a, b]`, `params: 42`, `params: hello`) registers as a no-params theta with zero diagnostics, because extractParsedParams returns silently on `!isMap` while `params: null` and non-mapping `tool_loop:` / `respond_repair:` values are refused

## Observation
The `params:` value node goes through two checks, and neither covers the other's inputs. `checkRecognisedFields` refuses only a null-shaped node (`paramsIsNull`: JS null/undefined or a null scalar) with `theta/load/params-null`. `extractParsedParams` returns `params: undefined` with an empty diagnostic list for every node that is not a mapping. So a present scalar or sequence `params:` value gets no diagnostic from either check. `parseFrontmatter` then returns `registered: true`, the `params` field is absent, and the theta is a no-params theta. The frontmatter's other mapping-shaped blocks, `tool_loop:` and `respond_repair:`, refuse the same shape through `checkBlockShape`. I checked this in this session with a scratch `vite-node` probe under $TEMP, calling `parseFrontmatter` and `parseThetaDocument` directly:
- `params: [a, b]`, `params: 42`, `params: hello`: registered, diagnostics `[]`, `params=undefined`.
- `params: null`: `["theta/load/params-null"]`, frontmatter null.
- `tool_loop: 42`: `registered false`, `["theta/load/malformed-tool-loop-field"]`.

## Evidence
**Divergent side (fail-open): non-mapping `params:` collapses to absent.** src/parser/frontmatter-params.ts:98-100
```ts
  if (!isMap(paramsNode)) {
    return { params: undefined, fieldInputs: [], diagnostics: [], loweringDiagnostics: [] };
  }
```
The only other `paramsNode` shape gate refuses only the null spellings. src/parser/frontmatter.ts:816-832
```ts
  // The redundant `params: null` is rejected — omit `params:` or use `params: {}`
  // (both of which are equivalent no-params forms).
  const paramsIsNull =
    paramsPresent &&
    (paramsNode === null ||
      paramsNode === undefined ||
      (isScalar(paramsNode) && paramsNode.value === null));
  if (paramsIsNull) {
    diagnostics.push({
      severity: "error",
      code: "theta/load/params-null",
      file,
      ...(paramsRange !== undefined ? { range: paramsRange } : {}),
      message:
        "'params: null' is not permitted; omit 'params:' or use 'params: {}'",
    });
  }
```

**Sibling side (fail-closed): the mapping-shaped blocks refuse a non-mapping value.** src/parser/frontmatter-yaml.ts:366-390
```ts
// A present `tool_loop:` / `respond_repair:` value that is not a mapping is refused
// (0.332.0, bug 0301 face b): a scalar, a sequence, or an alias where the block contract
// requires a mapping. Absent, a null scalar (bare key / `null` / `~`), and a mapping
// (including the empty `{}`) are the equivalent-to-absent spellings and return
// undefined (silent) — the null scalar is the spec's own name for the absent case.
function checkBlockShape(
  ...
  if (blockNode === null || blockNode === undefined) return undefined;
  if (isMap(blockNode)) return undefined;
  if (isScalar(blockNode) && blockNode.value === null) return undefined;
  const range = rangeOf(blockNode, lineCounter, lineOffset);
  return {
    severity: "error",
    code: malformedCode,
```
It is applied to both blocks at src/parser/frontmatter.ts:659-663:
```ts
  const toolLoopMalformed = checkBlockShape(toolLoopNode, "tool_loop", "theta/load/malformed-tool-loop-field", file, lineCounter, lineOffset);
  if (toolLoopMalformed !== undefined) diagnostics.push(toolLoopMalformed);
  ...
  const respondRepairMalformed = checkBlockShape(respondRepairNode, "respond_repair", "theta/load/malformed-respond-repair-field", file, lineCounter, lineOffset);
```

**Sibling-class argument.** All three paths answer the same question about the same kind of input: a top-level frontmatter field whose contract is a YAML mapping (`params: {}` ≡ absent, like `tool_loop: {}` / `respond_repair: {}` ≡ absent), with the value node read in the same `collectRecognisedFields` loop. `params:` and `tool_loop:` / `respond_repair:` accept the same spellings: an absent field and an empty mapping are equivalent. For the null spelling they differ in the opposite direction from this finding: `params:` refuses null (`params-null`), while `checkBlockShape` treats null as absent. For a present node that is neither a mapping nor null, the block path refuses with an error and the theta does not register, but the `params:` path loads the theta as if the field were absent. Within the `params:` field itself, the null node is refused and every other non-mapping node is silent, so one field has two postures for "present but not a mapping".

**Anchor (right side).** docs/spec_topics/frontmatter/frontmatter-fields-a.md:48 (the `tool_loop` row): "A present `tool_loop:` value that is not a mapping — a scalar, a sequence, or any other non-mapping node — is `theta/load/malformed-tool-loop-field` and the theta does not register". :45 (the `tools` row) and :46 (the `system` row, "mirroring the `tools` row above"): "\"absent\" and \"present-but-the-wrong-shape\" do not collapse into one behaviour". The `params` row (:49) pins absent ≡ `params: {}` and refuses `params: null`. It gives no sentence to a present scalar or sequence value, and no registry row covers one. The only `theta/load/params-*` shape codes are `params-null` and `params-type-not-expression` (code-registry-load.md:21-22), and the latter is per-field.

## Why this is a problem
The repository's frontmatter posture is fail-closed on present-but-wrong-shape values. Bugs 0104, 0296, 0297, 0298 and 0301 each closed one field's "present-but-bad collapses to absent" hole, and the spec rows quoted above state it per field. `params:` is the remaining mapping-shaped field where a mis-shaped value collapses silently onto the absent behaviour. The theta registers with no parameters, the binder does not run (frontmatter-fields-a.md:49: "the binder does not run regardless of how the theta is invoked"), and the author gets no signal. The refusal for `params: null` shows that `params:` is not treated as a tolerant field. The null spelling is refused, and every other non-mapping spelling gets through.

## Suggested direction (non-binding, optional)
Refuse a present non-mapping, non-null `params:` value at the frontmatter read, the same way `checkBlockShape` does for the two blocks. No registry row fits today: `params-null`'s message names `params: null` specifically. So a spec/registry decision (widen `params-null` or mint a sibling code) comes first.

## False-positive check
- **EXST-9 / PIC-73 class check:** not applicable. Both sides are parse-time frontmatter shape checks, not execution-status sinks or producer hooks, and not an optional degrade-silent capability.
- **allow-broad-catch token check:** no catch at any cited site. `grep -nE "catch|allow-broad-catch"` over the 14 in-scope files returned 2 hits, both comments (imports.ts:334 "catch-all", invoke-diagnostics.ts:481 "can catch them"), not catch clauses.
- **Stated-rationale check:** the comment at frontmatter-params.ts:98 gives no rationale for silence. The `extractParsedParams` doc comment (frontmatter-params.ts:59-62) restates the behaviour ("Returns `undefined` when the block is absent, `null`, or not a mapping") and gives no reason for leaving a non-mapping node unreported. The rest of that comment covers field-level refusals only. The `paramsIsNull` comment (frontmatter.ts:816-817) names only `null`. No bug doc rules on a non-mapping `params:`: `ls docs/bugs | grep -i params` returned 24 files, none about a whole-field non-mapping value. `grep -rln "params" docs/bugs | xargs grep -l -i "not a mapping\|non-mapping\|nonmapping"` returned 2 files (0301, README.md), and both concern `tool_loop`/`respond_repair` and per-field block-mapping RHS (0041), not the `params:` node itself.
- **Sibling-reality check:** `grep -rn "isMap(paramsNode)" src` returned 1 hit, the divergent line. `grep -rn "paramsNode" src --include=*.ts` returned 12 hits: 9 in frontmatter.ts and 3 in frontmatter-params.ts. So no later layer refuses the shape. The `parseThetaDocument` probe confirmed it end to end: `params: [a, b]` gave a non-null frontmatter and diagnostics `[]`. `grep -rnE "\"params: (\[|[0-9]|[A-Za-z~])" tests` returned 17 hits. None is a YAML fixture with a non-mapping, non-null `params:` value (they are `params: null`, `"params: field"` labels, and prose), so no test pins the silence.
- **Git history:** `git log --oneline -S"if (!isMap(paramsNode))" -- src/parser/` shows only quality-loop refactors (264dcbd6, 4d18f5cf), with no posture ruling.

## Triage
verdict: questionable — divergence verified but the anchor does not pin params: I checked frontmatter-params.ts:98-100 (`!isMap` → silent undefined), frontmatter.ts:816-832 (only null refused), frontmatter-yaml.ts:366-390 and frontmatter.ts:659-663 (checkBlockShape refuses non-mapping tool_loop/respond_repair), and all the stated searches reproduce (1 isMap hit; 12 paramsNode hits, 9+3; 24 params bug files; 2 non-mapping files; commits 264dcbd6/4d18f5cf). A scratch vite-node probe with `mode: prompt` gives `params: [a, b]`/`42`/`hello` → registered, [] diagnostics, no params, `params: null` → params-null, `tool_loop: 42` → malformed-tool-loop-field. But the anchor is the tool_loop row (frontmatter-fields-a.md:48) and the tools/system rows (:45-46), which are other fields' clauses. The params row (:49) pins only absent ≡ `{}` and `params: null`, and no registry row covers a non-mapping params value (the filing admits this). So which posture is right, and which new code or widened params-null would carry it, needs a human spec/registry ruling (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: refuse a present non-mapping, non-null 'params:' value at the frontmatter read the way checkBlockShape refuses tool_loop/respond_repair - mint theta/load/malformed-params-field (E, load; message: malformed 'params:' field; expected a mapping, got <kind>) with a code-registry-load.md row and a frontmatter-fields-a.md params-row sentence FIRST, then the code gate; the theta does not register. params: null keeps theta/load/params-null; absent and params: {} stay the silent no-params spellings. Failure-path-only: mapping-valued params: lowering unchanged.
