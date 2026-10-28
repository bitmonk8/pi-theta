---
id: PTQ-1782
title: The B0514 disposition and boundary-control files repeat the runtime fixture assembly.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0514-fn-query-disposition-unit.test.ts:32-43
  - tests/b0514-fn-query-boundary-controls.test.ts:43-56
sites: 2
fix_scope: module
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The B0514 disposition and boundary-control files repeat the runtime fixture assembly.

## Observation
The B0514 disposition and boundary-control files each define a `fixture` that prefixes prompt frontmatter, parses source with `parseDeps`, rejects parse errors, scripts a query result, builds the lexical environment, creates checkpoint and mutator recorders, and assembles runtime dependencies. This sequence occurs twice. The control variant uses an extended host, also scripts invoke, supplies a default operation result, and returns a different selection of fixture handles. A B0514 query-runtime fixture under `tests/helpers/` is the natural shared home for the common assembly sequence; the extended host behavior is distinct from that sequence.

## Evidence
`tests/b0514-fn-query-disposition-unit.test.ts:32-43`:

```ts
function fixture(source: string, result: OperationResult) {
  const doc = parseThetaDocument({
    path: "b0514-unit.theta", bytes: new TextEncoder().encode("---\nmode: prompt\n---\n" + source),
  }, parseDeps());
  expect(doc.diagnostics.filter(d => d.severity === "error"), "unit fixture parses cleanly").toEqual([]);
  const host = new ScriptedHost();
  host.results.set("query", result);
  const env = buildEnvironment({ body: doc.body });
  const checkpoint = new RecordingCheckpoint();
  const mutator = new RecordingMutator();
  return { doc, env, checkpoint, mutator, runtime: { ...deps(host), env, checkpoint, mutator } };
}
```

`tests/b0514-fn-query-boundary-controls.test.ts:43-56`:

```ts
function fixture(source: string, result: OperationResult = { ok: true, value: "PAYLOAD" }) {
  const doc = parseThetaDocument({ path: "b0514-controls.theta", bytes: new TextEncoder().encode(
    "---\nmode: prompt\n---\n" + source,
  ) }, parseDeps());
  expect(doc.diagnostics.filter(d => d.severity === "error"), "control fixture parses cleanly").toEqual([]);
  const host = new Host();
  host.results.set("query", result);
  host.results.set("invoke", result);
  const env = buildEnvironment({ body: doc.body });
  const checkpoint = new RecordingCheckpoint();
  const mutator = new RecordingMutator();
  const runtime: ExecuteBodyDeps = { ...deps(host), env, checkpoint, mutator };
  return { doc, host, checkpoint, mutator, runtime };
}
```

Count: two near-identical fixture-assembly implementations, both cited above. The parser path/message, host choice, additional invoke script, result default and returned handles diverge; the parse/admission/environment/recording-runtime assembly sequence is repeated.

## Why this is a problem
This is **boilerplate duplication**, not a complaint about the recording doubles or about having separate control tests. Both files maintain the same sequence for admitting source and wiring its environment and recording runtime dependencies. Their host-specific differences do not explain the repeated parsing, error guard, environment creation and checkpoint/mutator assembly.

## Suggested direction (non-binding, optional)
Consider sharing the common fixture assembly without changing the operation scripts, host-specific observations, fixtures, assertions or test names. `docs/bugs/0514-fn-query-tail-unwrapped-at-call-boundary.md` cites both files as witnesses; this report does not propose merging, renaming or deleting their tests.

## False-positive check
- **Gate-pin:** neither cited function is an inventory/count gate. No pinned expected value is challenged.
- **Recording-double:** checkpoint and mutator recording, including negative conversation-mutation assertions, are legitimate witnesses. The finding concerns repeating their assembly with parsing and environment setup, not whether those observations can fail.
- **docs/bugs/ signature search:** searched `docs/bugs/` for `b0514`, `0514`, `activation boundaries and compatibility`, and `query disposition unit isolation`, then read bug 0514's symptom and red/green/control records. It documents raw-vs-Result, failure-propagation and MatchError signatures followed by passing fix witnesses; no historical red is treated as a silent skip here.
- **Coverage-matrix/bug-doc citation search:** `rg -n 'b0514-fn-query-(boundary-controls|disposition-unit)' docs/bugs/ docs/reference/coverage-matrix.md` finds bug 0514 at lines 369 and 382, with no coverage-matrix match. The witness citations are acknowledged above; no merger, rename or deletion is proposed.
- **Canonical-helper check:** inspected `tests/helpers/invoke-seam-scaffold.ts`, including its `deps` factory and recording doubles. Those components are already reused; the duplicated layer is the surrounding parse-and-runtime fixture assembly, not a reimplementation of the doubles. No claim is made that a canonical complete B0514 fixture already exists.
- **Existing-finding check:** `rg -n 'b0514-fn-query-(boundary-controls|disposition-unit)' quality/` returned zero matches immediately before filing. Both evidence blocks were re-read with line numbers at that time.
- **History intent:** `git log` and `git show --stat 76f2a5b4` show both files landed with `fix: resolve bug 0514`. The bug record distinguishes the disposition witness from additive boundary controls. The report preserves that distinction and does not question their separate test cases.
- **Scope:** this judges two existing setup functions only. It makes no coverage, suite-composition, runtime-risk or production-code claim.

## Triage
verdict: confirmed — Both excerpts match exactly at the cited lines and duplicate prompt parsing, the parse-error guard, environment construction, recorder creation and runtime assembly; the documented host/script/return differences do not account for that shared plumbing. This is D7 boilerplate duplication, not a challenge to recording witnesses or separate tests; bug 0514's citations are acknowledged, and no existing issue or resolved prescribed-shape exemption covers these fixtures. (triage: claude-opus-5-5)
