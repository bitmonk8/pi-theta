---
id: PTQ-1553
title: resolveSubagentSessionConfigAt silently inherits or passes through an out-of-range subagent fn `with { tool_loop.max_rounds / respond_repair.attempts }` value that the frontmatter path refuses with theta/load/frontmatter-value-out-of-range
lens: D6
status: open
verdict: confirmed
locations:
  - src/parser/theta-document.ts:550-560
  - src/parser/theta-document.ts:565-597
  - src/parser/frontmatter-yaml.ts:432-465
  - src/parser/frontmatter.ts:635-658
  - src/extension/subagent-fn-static-checks.ts:179-218
sites: 5
fix_scope: cross-module
d6_class: posture-divergence
d6_anchor: "FN-7 (docs/spec_topics/functions.md#fn-7): \"The clause is validated at load time against the same rules that govern the corresponding frontmatter fields ... and reuses those fields' diagnostics rather than coining parallel codes — ... `tool_loop.max_rounds` and `respond_repair.attempts` through `theta/load/frontmatter-value-out-of-range`\""
wave: qw20260928060032
reported_by: lens-d6-errorposture (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# resolveSubagentSessionConfigAt silently inherits or passes through an out-of-range subagent fn `with { tool_loop.max_rounds / respond_repair.attempts }` value that the frontmatter path refuses with theta/load/frontmatter-value-out-of-range

## Observation
Two paths turn the same two session-config budgets (`tool_loop.max_rounds`, `respond_repair.attempts`) into a resolved value. The frontmatter path (`resolveNonNegIntBlock`, called from `resolveFrontmatterBlocks`) refuses any present value that is not a non-negative integer with `theta/load/frontmatter-value-out-of-range`, so the theta does not register. The `subagent fn` `with { … }` path (`resolveSubagentSessionConfigAt` → `toolLoopValue` / `respondRepairValue` → `objectFieldNumber`) never emits a diagnostic. A value that is not a bare number literal (`"x"`, `-1`, which parses as a unary expression) comes back as `undefined`, so the inherited budget silently applies. A non-integer number literal (`2.5`) is passed through as-is. No other production code reads a `subagent fn`'s `with` clause values for these keys. The only load-time check on a `with` clause (`checkSubagentFnModelOverrides`) covers `model` alone.

## Evidence
**Divergent side (fail-open)** — src/parser/theta-document.ts:550-560 (the with-clause arms of `resolveSubagentSessionConfigAt`):
```ts
    } else if (field.key === "tool_loop") {
      const loop = toolLoopValue(field.value);
      if (loop !== undefined) {
        config.toolLoop = loop;
      }
    } else if (field.key === "respond_repair") {
      const repair = respondRepairValue(field.value);
      if (repair !== undefined) {
        config.respondRepair = repair;
      }
    }
```
src/parser/theta-document.ts:565-597 (the value readers; excerpt):
```ts
 * denotes (RFC 0001 FN-7), mirroring the frontmatter `tool_loop:` block. A
 * non-object / absent `max_rounds` yields `undefined` (the inherited value then
 * stands).
 */
function toolLoopValue(expr: Expr): ParsedToolLoop | undefined {
  const maxRounds = objectFieldNumber(expr, "max_rounds");
  return maxRounds === undefined ? undefined : { maxRounds };
}
...
function objectFieldNumber(expr: Expr, name: string): number | undefined {
  if (expr.kind !== "object") {
    return undefined;
  }
  const field = expr.fields.find((f) => f.name === name);
  if (field === undefined || field.value.kind !== "number") {
    return undefined;
  }
  const parsed = Number(field.value.text);
  return Number.isFinite(parsed) ? parsed : undefined;
}
```

**Fail-closed sibling (frontmatter, same keys, same class)** — src/parser/frontmatter-yaml.ts:432-465 (`resolveNonNegIntBlock`; excerpt):
```ts
  if (sub === undefined) {
    return { value: defaultValue };
  }
  const raw = isScalar(sub.value) ? sub.value.value : sub.value;
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) {
    return { value: raw };
  }
  const range = rangeOf((sub.value ?? sub.key) as Node, lineCounter, lineOffset);
  return {
    diagnostic: {
      severity: "error",
      code: "theta/load/frontmatter-value-out-of-range",
      file,
      ...(range !== undefined ? { range } : {}),
      message: `frontmatter field '${dottedKey}' must be a non-negative integer; got ${renderObserved(
```
src/parser/frontmatter.ts:635-658 (the call sites, pushing the refusal):
```ts
  const toolLoopResult = resolveNonNegIntBlock(
    toolLoopNode,
    "max_rounds",
    "tool_loop.max_rounds",
    25,
    ...
  if ("diagnostic" in toolLoopResult) {
    diagnostics.push(toolLoopResult.diagnostic);
  }
  if ("diagnostic" in respondRepairResult) {
    diagnostics.push(respondRepairResult.diagnostic);
  }
```

**Fail-closed sibling inside the same `with` clause** — src/extension/subagent-fn-static-checks.ts:179-218 (the `model` key, same clause, same "override must meet the frontmatter bar" class; excerpt):
```ts
 * RFC 0001 FN-7 `with { model }` load-time validation. Frontmatter `model:` is
 * resolved against the available model set at LOAD (frontmatter.ts →
 * `theta/load/model-unresolved`); a `subagent fn`'s `with { model }` OVERRIDE
 * must be held to the same bar rather than silently falling back to the
 * inherited session model at runtime (which masked an unresolvable reference).
```

**Sibling-class argument.** Both sides take one value for the same named budget (`tool_loop.max_rounds` or `respond_repair.attempts`) and store it in the same carrier type (`ParsedToolLoop` / `ParsedRespondRepair`). The frontmatter result becomes `ParsedFrontmatter.toolLoop` / `.respondRepair`. `resolveSubagentSessionConfigAt` seeds `config.toolLoop` / `config.respondRepair` from those fields (theta-document.ts:530-535) and then overwrites them from the `with` clause. So the two paths write the same slot in the same object, and the failure class is identical: a present value that is not a non-negative integer. FN-7 names the frontmatter diagnostic as the one the `with` path must reuse.

**Anchor (verbatim, docs/spec_topics/functions.md:71, FN-7):** "The clause is validated at load time against the same rules that govern the corresponding frontmatter fields ([Parameters and Frontmatter](./frontmatter.md)) and reuses those fields' diagnostics rather than coining parallel codes — `model` through `theta/load/model-unresolved`; … `tool_loop.max_rounds` and `respond_repair.attempts` through `theta/load/frontmatter-value-out-of-range`;"

**Behaviour probe (this session).** A scratch script under `$TEMP` (bundled with the repo's `node_modules/.bin/esbuild`, then run with node) called `parseThetaDocument` with an always-resolving `modelMatcher` and `inertSystemNoteChannel()`:
- frontmatter `tool_loop: {max_rounds: 2.5}` + `respond_repair: {attempts: -1}` → two `error theta/load/frontmatter-value-out-of-range` diagnostics (`got 2.5`, `got -1`);
- frontmatter `tool_loop: {max_rounds: "x"}` → `error theta/load/frontmatter-value-out-of-range … got x`;
- `subagent fn a(o: string) with { tool_loop: { max_rounds: 2.5 }, respond_repair: { attempts: -1 } } { o }` → diagnostics `[]`, `sessionConfig` `{"toolLoop":{"maxRounds":2.5},"respondRepair":{"attempts":3}}` (2.5 passed through; -1 dropped and the default 3 inherited);
- `with { tool_loop: { max_rounds: "x" }, respond_repair: { attempts: 1.5 } }` under frontmatter `max_rounds: 5` → diagnostics `[]`, `sessionConfig` `{"toolLoop":{"maxRounds":5},"respondRepair":{"attempts":1.5}}`.

**Searches (this session):**
- `grep -rn "frontmatter-value-out-of-range" src --include=*.ts | wc -l` → 3 hits, all in `src/parser/frontmatter-yaml.ts` (`grep -rln` → 1 file). No other emission site exists.
- `grep -rn "fn.withClause\|stmt.withClause" src --include=*.ts` → 4 hits: subagent-fn-static-checks.ts:199 (the `model` check only), theta-document.ts:536 (this resolver), :865 and :1050 (call-site walkers that emit nothing about value ranges).
- `grep -rn "objectFieldNumber\|toolLoopValue\|respondRepairValue" src --include=*.ts | wc -l` → 7 hits, all in src/parser/theta-document.ts.

## Why this is a problem
The repository's stated posture is fail-closed, and FN-7 says the `with` clause is held to the frontmatter rules and reuses `theta/load/frontmatter-value-out-of-range` for these two keys. The frontmatter path and the `with { model }` check follow that posture. The `with { tool_loop / respond_repair }` path fails open with no diagnostic. It either quietly applies the inherited budget in place of the value the author wrote, or it passes a non-integer round/attempt count (`2.5`) to the spawned session, where the frontmatter spelling of that same value un-registers the theta. The `toolLoopValue` docstring says it is "mirroring the frontmatter `tool_loop:` block", and for present-but-invalid values that claim is false.

## Suggested direction (non-binding, optional)
Hold `subagent fn` `with { tool_loop / respond_repair }` values to the same non-negative-integer rule, and emit the same `theta/load/frontmatter-value-out-of-range` refusal the frontmatter path emits. This could be a load-time check beside `checkSubagentFnModelOverrides`, or a parse-time check in the resolver.

## False-positive check
- **EXST-9 / PIC-73 class check:** neither side is a sink/producer-hook throw at the execution-status bus boundary or an optional degrade-silent capability. Both are load-time value resolution for session-config keys, so neither pre-exempted class applies.
- **allow-broad-catch token check:** no `catch` sits at any cited site (the resolver, the readers, `resolveNonNegIntBlock`, `checkSubagentFnModelOverrides`), so no token applies.
- **Stated-rationale check:** the reader docstrings (theta-document.ts:565-584) state only the absent/non-object case ("the inherited value then stands"), which matches FN-7's "an omitted key still inherits". They give no reason for accepting or dropping a PRESENT out-of-range value, and they claim to mirror the frontmatter block. `resolveSubagentSessionConfigAt`'s docstring (theta-document.ts:494-511) gives no validation rationale. `grep -rln "objectFieldNumber\|toolLoopValue\|respondRepairValue\|resolveSubagentSessionConfigAt" docs quality/issues` → one hit, quality/issues/PTQ-1526-theta-document-residual-eleven-concerns.md, a D9 size filing that lists these functions as a concern row and makes no posture ruling. `grep -rln "with { tool_loop\|with {tool_loop\|with-clause.*max_rounds" docs/bugs quality/issues` → 0 hits, so no bug doc rules on this posture.
- **Sibling-reality check:** the behaviour probe above shows both sides on current code: the frontmatter refusal fires, and the `with` path gives `[]` diagnostics with the inherited or passed-through value. The body parser's `parseWithClause` (src/parser/body-parser.ts:1293-1323) emits only `theta/load/unknown-frontmatter-field` for an unknown key and does not check value ranges.
- **Dedupe:** the open wave filing qw20260928060032-d6-02 concerns the `model-unresolved` message text at `checkSubagentFnModelOverrides`, a different root cause. No listed PTQ or intake file covers with-clause budget validation.

## Triage
verdict: confirmed — divergence verified against the anchor. theta-document.ts:550-560/565-597: objectFieldNumber accepts only a `number`-kind literal, passes any finite value through (2.5 as-is), and silently returns undefined otherwise, so the inherited budget stands. No diagnostic is emitted, while frontmatter-yaml.ts:432-465 resolveNonNegIntBlock refuses any present value that is not a non-negative integer with theta/load/frontmatter-value-out-of-range, pushed at frontmatter.ts:635-658. The same clause's `model` key is held to the frontmatter bar (subagent-fn-static-checks.ts:179-218), and body-parser parseWithClause checks key names only. FN-7 (functions.md:71) states verbatim that the with clause reuses frontmatter-value-out-of-range for tool_loop.max_rounds / respond_repair.attempts. The stated searches reproduce (3 hits in 1 file; 4 withClause sites; 7 reader hits), and no intake file or PTQ tracks this (triage: claude-opus-5-5)
