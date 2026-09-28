---
id: PTQ-1687
title: The FRNT-1 defaults `max_rounds: 25` / `attempts: 3` are resolved by `resolveNonNegIntBlock` at the frontmatter producer and re-pinned as `?? 25` / `?? 3` nullish fallbacks at the runtime consumer, because `ParsedFrontmatter.toolLoop` / `respondRepair` are declared optional while documented and built as always present
lens: D1
status: open
verdict: confirmed
locations:
  - src/parser/frontmatter-contract.ts:136-148
  - src/parser/frontmatter.ts:635-652
  - src/parser/frontmatter.ts:1129-1146
  - src/extension/production-theta-producer.ts:1025
  - src/extension/production-theta-producer.ts:1434-1435
  - src/parser/theta-document.ts:530-535
sites: 3
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# The FRNT-1 defaults `max_rounds: 25` / `attempts: 3` are resolved by `resolveNonNegIntBlock` at the frontmatter producer and re-pinned as `?? 25` / `?? 3` nullish fallbacks at the runtime consumer, because `ParsedFrontmatter.toolLoop` / `respondRepair` are declared optional while documented and built as always present

## Observation
`parseFrontmatter` resolves the `tool_loop.max_rounds` / `respond_repair.attempts` defaults once, by passing the literals `25` / `3` into `resolveNonNegIntBlock`, and then places `toolLoop` and `respondRepair` unconditionally on every registered `ParsedFrontmatter`. The contract type nevertheless declares both fields optional (`toolLoop?`, `respondRepair?`) with doc comments stating "Populated on every registered theta". The one production module that reads the numbers, `production-theta-producer.ts`, answers the optionality by re-deriving the same spec defaults with nullish fallbacks (`?? 25`, `?? 3`) at two sites; the other production reader (`theta-document.ts`) answers it with `!== undefined` guards and no default. The spec constant is therefore pinned by two mechanisms in two modules.

## Evidence
The contract: optional fields, documented as always present. src/parser/frontmatter-contract.ts:136-148:
```ts
  readonly params?: ParsedParams;
  /**
   * The parsed `tool_loop` block (FRNT-1). Populated on every registered theta
   * — the default `{ maxRounds: 25 }` when the block is absent or empty. Owned
   * by the `V6e` implementation leaf; the `V6e-T` seam declares the shape.
   */
  readonly toolLoop?: ParsedToolLoop;
  /**
   * The parsed `respond_repair` block. Populated on every registered theta —
   * the default `{ attempts: 3 }` when the block is absent or empty. Owned by
   * the `V6e` implementation leaf; the `V6e-T` seam declares the shape.
   */
  readonly respondRepair?: ParsedRespondRepair;
```

Way 1 — the producer pins the default as a `resolveNonNegIntBlock` argument. src/parser/frontmatter.ts:635-652:
```ts
  const toolLoopResult = resolveNonNegIntBlock(
    toolLoopNode,
    "max_rounds",
    "tool_loop.max_rounds",
    25,
    file,
    lineCounter,
    lineOffset,
  );
  const respondRepairResult = resolveNonNegIntBlock(
    respondRepairNode,
    "attempts",
    "respond_repair.attempts",
    3,
    file,
    lineCounter,
    lineOffset,
  );
```
and places both unconditionally (no spread-guard, unlike every sibling optional field). src/parser/frontmatter.ts:1129-1146:
```ts
  const toolLoop: ParsedToolLoop = {
    maxRounds: (toolLoopResult as { value: number }).value,
  };
  const respondRepair: ParsedRespondRepair = {
    attempts: (respondRepairResult as { value: number }).value,
  };
  const frontmatter: ParsedFrontmatter = {
    mode: modeValue as ThetaMode,
    ...(resolvedModel !== undefined ? { model: resolvedModel } : {}),
    // Bug 0491: only a recognised level reaches here (any other present value
    // refused the load above).
    ...(isThinkingLevel(thinkingValue) ? { thinking: thinkingValue } : {}),
    ...(bindModelValue !== undefined ? { bindModel: bindModelValue } : {}),
    ...(bindModelUnresolvable ? { bindModelUnresolvable: true as const } : {}),
    ...(bindEchoValue !== undefined ? { bindEcho: bindEchoValue } : {}),
    ...(params !== undefined ? { params } : {}),
    toolLoop,
    respondRepair,
```

Way 2 — the consumer re-pins the default as a nullish fallback. src/extension/production-theta-producer.ts:1025:
```ts
    const maxRounds = deps.theta.frontmatter.toolLoop?.maxRounds ?? 25;
```
src/extension/production-theta-producer.ts:1431-1435:
```ts
    return buildTypedQueryValidation({
      lowered,
      schemaValidator: this.#input.root.schemaValidator,
      attempts: theta.frontmatter.respondRepair?.attempts ?? 3,
      maxRounds: theta.frontmatter.toolLoop?.maxRounds ?? 25,
```

Way 3 — the other production reader guards without defaulting. src/parser/theta-document.ts:530-535:
```ts
  if (frontmatter?.toolLoop !== undefined) {
    config.toolLoop = frontmatter.toolLoop;
  }
  if (frontmatter?.respondRepair !== undefined) {
    config.respondRepair = frontmatter.respondRepair;
  }
```

Searches (run this session):

`grep -rn "toolLoop\b" src/ extensions/ tools/ | grep -v "^\s*\*\|//"` — 11 hits:
```
src/extension/production-theta-producer.ts:1025:    const maxRounds = deps.theta.frontmatter.toolLoop?.maxRounds ?? 25;
src/extension/production-theta-producer.ts:1435:      maxRounds: theta.frontmatter.toolLoop?.maxRounds ?? 25,
src/extension/subagent-spawn-regime.ts:1435:      ...(config.toolLoop !== undefined ? { toolLoop: config.toolLoop } : {}),
src/parser/frontmatter-contract.ts:142:  readonly toolLoop?: ParsedToolLoop;
src/parser/frontmatter.ts:1129:  const toolLoop: ParsedToolLoop = {
src/parser/frontmatter.ts:1145:    toolLoop,
src/parser/theta-ast.ts:529:  readonly toolLoop?: ParsedToolLoop;
src/parser/theta-document.ts:520:    toolLoop?: ParsedToolLoop;
src/parser/theta-document.ts:530:  if (frontmatter?.toolLoop !== undefined) {
src/parser/theta-document.ts:531:    config.toolLoop = frontmatter.toolLoop;
src/parser/theta-document.ts:553:        config.toolLoop = loop;
```
`grep -rn "respondRepair\b" src/ extensions/ tools/ | grep -v "^\s*\*\|//"` — 11 hits:
```
src/extension/production-theta-producer.ts:1434:      attempts: theta.frontmatter.respondRepair?.attempts ?? 3,
src/extension/subagent-spawn-regime.ts:1436:      ...(config.respondRepair !== undefined
src/extension/subagent-spawn-regime.ts:1437:        ? { respondRepair: config.respondRepair }
src/parser/frontmatter-contract.ts:148:  readonly respondRepair?: ParsedRespondRepair;
src/parser/frontmatter.ts:1132:  const respondRepair: ParsedRespondRepair = {
src/parser/frontmatter.ts:1146:    respondRepair,
src/parser/theta-ast.ts:536:  readonly respondRepair?: ParsedRespondRepair;
src/parser/theta-document.ts:521:    respondRepair?: ParsedRespondRepair;
src/parser/theta-document.ts:533:  if (frontmatter?.respondRepair !== undefined) {
src/parser/theta-document.ts:534:    config.respondRepair = frontmatter.respondRepair;
src/parser/theta-document.ts:558:        config.respondRepair = repair;
```
`grep -rn "frontmatter: ParsedFrontmatter = {\|: ParsedFrontmatter = {" src/ extensions/ tools/` — 1 hit (the only production constructor):
```
src/parser/frontmatter.ts:1135:  const frontmatter: ParsedFrontmatter = {
```
`grep -rn "\.\.\.theta\.frontmatter\|\.\.\.input\.frontmatter" src/ extensions/ tools/` — 2 hits (the only other production producers, both spread-copies that preserve `toolLoop` / `respondRepair`):
```
src/extension/production-composition.ts:2101:      ? { frontmatter: { ...input.frontmatter, system: importCheck.patchedSystemTemplate } }
src/extension/subagent-spawn-regime.ts:1430:      ...theta.frontmatter,
```
`grep -rn "as unknown as ParsedFrontmatter" tests/ | wc -l` — 26 (first 10 below): test fixtures that build a `ParsedFrontmatter` without `toolLoop` / `respondRepair`; e.g. tests/b0479-frontmatter-model-drives-every-turn.test.ts:86 drives `production-theta-producer` with one, so those runs take the consumer-pinned `?? 25` / `?? 3` rather than the producer-pinned value.
```
tests/b0328-root-closure-hash-marshalled.test.ts:210:      frontmatter: { mode: "subagent" } as unknown as ParsedFrontmatter,
tests/b0328-root-closure-hash-marshalled.test.ts:245:      frontmatter: { mode: "subagent", tools: ["./child.theta"] } as unknown as ParsedFrontmatter,
tests/b0328-root-closure-hash-marshalled.test.ts:268:      frontmatter: { mode: "subagent" } as unknown as ParsedFrontmatter,
tests/b0328-root-closure-hash-marshalled.test.ts:308:    frontmatter: { mode: "subagent" } as unknown as ParsedFrontmatter,
tests/b0343-proto-hash-carrier-row.test.ts:102:      frontmatter: { mode: "subagent" } as unknown as ParsedFrontmatter,
tests/b0343-proto-hash-carrier-row.test.ts:162:      } as unknown as ParsedFrontmatter,
tests/b0343-proto-hash-carrier-row.test.ts:250:    } as unknown as ParsedFrontmatter,
tests/b0479-frontmatter-model-drives-every-turn.test.ts:86:    frontmatter: { mode: "subagent", model: modelRef } as unknown as ParsedFrontmatter,
tests/b0491-frontmatter-thinking-pin.test.ts:132:          frontmatter: { mode: "subagent", thinking: "xhigh" } as unknown as ParsedFrontmatter,
tests/call-with-clause-failure-arms.test.ts:233:      frontmatter: {} as unknown as ParsedFrontmatter,
```

Counts both ways. Producers of `ParsedFrontmatter.toolLoop` / `.respondRepair` in production: 1 constructor (frontmatter.ts:1135, sets both unconditionally) + 2 spread-copies (production-composition.ts:2101, subagent-spawn-regime.ts:1430) that carry them through; production producers of the `undefined` arm: 0. Consumers: production-theta-producer.ts:1025, :1434, :1435 (nullish fallback to a second literal copy of the spec default) and theta-document.ts:530-535 (undefined-guard, no default). The spec default itself (docs/spec_topics/frontmatter/frontmatter-fields-a.md:47-48 — `{ max_rounds: 25 }`, `{ attempts: 3 }`) is spelled as a code literal in two production modules.

Self-inconsistency statement: no written rule says where a frontmatter default must be resolved or that a contract field must be non-optional when always built; the anchor is self-inconsistency — the same record's own doc says "Populated on every registered theta" while its type says optional, the producer builds it unconditionally while one consumer re-defaults it and another guards it — plus the cost below.

## Why this is a problem
One spec constant, two code pins, two mechanisms. A maintainer who changes the FRNT-1 default at frontmatter.ts:639 / :648 (the site the frontmatter parser, its `resolveNonNegIntBlock` doc, and the `frontmatter-fields-a.md` table all point at) leaves `?? 25` / `?? 3` at production-theta-producer.ts:1025 / :1434-1435 untouched; nothing in the type system or the tests relates the two literals. In production the consumer fallback is unreachable (every `ParsedFrontmatter` is built by frontmatter.ts:1135 or spread from one), so the divergence would be silent there — but the 26 test fixtures that cast a partial object to `ParsedFrontmatter` (e.g. b0479:86, which drives `production-theta-producer`) run under the consumer's literal, so after such an edit the test suite and the production path would be exercising different default values while both still pass. The optional declaration is the mechanism that invites the re-pin: a reader of `frontmatter-contract.ts:142` sees `toolLoop?` and, reasonably, writes a fallback; the doc sentence two lines above it says the fallback can never fire. `theta-document.ts:530-535` shows the third reading of the same field (guard, no default), so consumers already disagree on what an absent `toolLoop` means.

## Suggested direction (non-binding, optional)
Unproven hypothesis: the contract's type should say what its doc and producer already say — `toolLoop` / `respondRepair` non-optional on `ParsedFrontmatter` — so the consumer fallbacks become type errors and the FRNT-1 literal has one code home (frontmatter.ts); the `SubagentSessionConfig` inherit-or-override optionality (theta-ast.ts:529/536) is a different record and unaffected. The fix stage owns the choice.

## False-positive check
- Clone-map check: the injected clone map lists no group covering frontmatter-contract.ts:136-148, frontmatter.ts:635-652 / 1129-1146, or production-theta-producer.ts:1025 / 1434-1435 (frontmatter.ts's G004/G023 are at 492-524 and 150-164/279-297); the two pins are a literal argument versus a nullish-coalesce expression — mechanism-shaped, not a token copy.
- D9-affinity check: not a wrong-home claim; the producer default belongs with the parser and the reads belong with the runtime consumer. The claim is that the same constant is decided in both.
- D2-deadness check: both sides live — frontmatter.ts:635-652 runs on every parse; production-theta-producer.ts:1025 / :1434-1435 run on every driven turn (the `?? 25` right-hand side is the arm that is unreachable in production, but it is reached by the 26 partial test fixtures, so it is not dead by this repository's rule).
- Export-style-exemption check (class is divergent-solutions; noted for completeness): no `export`-without-importer claim is made; `ParsedFrontmatter` has many production importers.
- Prior-filing / PTQ check: `grep -rln "?? 25\|maxRounds ??\|attempts ?? 3" quality/` — 0 hits. PTQ-1267 (resolved, "frontmatter-contract-types-row-remains") is a D9 breakdown claim about frontmatter.ts co-hosting the contract-type family (its text mentions `toolLoop` 0 times), not this field's optionality; PTQ-1164 / PTQ-1146 are D9 inventories of frontmatter.ts. None prescribes the `?? 25` shape or covers this site.
- Spec check: frontmatter-fields-a.md:47-48 pins the default values (25 / 3) and that an absent block takes them; it does not adjudicate where in the code the default is applied, so no D6 anchor decides this and no behaviour is asserted to be wrong today (both pins currently agree).
- Not a bug filing: no current mis-behaviour is claimed; the values agree today.

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. All 6 excerpts match at the cited lines: contract-type :142/:148 is optional while its doc says "Populated on every registered theta"; frontmatter.ts:635-652 passes 25/3 as arguments; :1129-1146 sets both fields every time; producer :1025/:1434-1435 has `?? 25`/`?? 3`; theta-document :530-535 checks for undefined. I re-ran all 6 stated searches word for word: A 11 lines, B 11, C 1, D 2, E 26 (first 10 identical), F 0 in quality/ apart from this filing's own REVIEW_LOG/notes rows. clone-scan shows no clone groups for frontmatter-contract.ts or production-theta-producer.ts. Not a duplicate: resolved PTQ-0180 removed the producer's own internal `: 25`/`: 3` fallback, not these consumer copies. No open PTQ covers these fields. The claim is not symmetry-only: it is one spec constant (frontmatter-fields-a.md:47-48) with a second literal copy that production can never reach, plus a type that contradicts its own doc. But there is no drift commit or bug record, so the cost is still hypothetical. The b0479:86 example is overstated: section A is a subagent-launch spawn test, and it is not shown to reach :1025/:1434 (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: the type says what the producer builds — toolLoop and respondRepair become REQUIRED on ParsedFrontmatter (src/parser/frontmatter-contract.ts:142/:148; their docs already say "Populated on every registered theta" and the sole constructor in frontmatter.ts sets both unconditionally). Delete the consumer re-pins: production-theta-producer.ts:1040 and :1449-1450 (HEAD) read `.toolLoop.maxRounds` / `.respondRepair.attempts` directly — no `?? 25` / `?? 3` — so the FRNT-1 literals keep one code home (frontmatter.ts:165-182's resolveNonNegIntBlock arguments). theta-document.ts:530-535's guards stay (they guard frontmatter presence for SubagentSessionConfig, a different record; theta-ast.ts:529/:536 optionality unaffected). Update the partial `as unknown as ParsedFrontmatter` test fixtures that actually reach those reads (b0479 et al.) to carry `toolLoop: { maxRounds: 25 }, respondRepair: { attempts: 3 }`. Behaviour identical in production (the fallbacks were unreachable there).
