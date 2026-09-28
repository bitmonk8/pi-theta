---
id: pending
title: Bug 0356's fix record names tests/live/fn-call-arity-live-cell.test.ts as a live witness of "the surface the reworded rows describe", but that cell drives a same-file fn arity refusal and never makes a code-driven tool call
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0356-codetoolerror-validation-errors-field-contradiction.md:167
  - docs/spec_topics/hard-ceilings/ceilings-3-and-4.md:25
  - docs/spec_topics/schema-subset.md:55
  - tests/live/fn-call-arity-live-cell.test.ts:1-15
  - tests/live/fn-call-arity-live-cell.test.ts:86-120
sites: 1
fix_scope: localized
d10_class: overstated-strength
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0356's fix record names tests/live/fn-call-arity-live-cell.test.ts as a live witness of "the surface the reworded rows describe", but that cell drives a same-file fn arity refusal and never makes a code-driven tool call

## Observation
Bug 0356 (Status: fixed 0.371.0) is a docs-only reword. It dropped the phantom `validation_errors` field from the "Tool-call args, code-driven (`<name>(args)`)" `Err(CodeToolError { cause: "validation", … })` rows. Its Verification line names `tests/live/fn-call-arity-live-cell.test.ts` as the "Live witness" and says the cell drives "the surface the reworded rows describe". The cell is bug 0131's H8a witness. Its bodies call a same-file top-level `fn` (`fn f(p: integer): integer { 1 }` / `f(1, 2, 3)` and `f(1)`) and assert the load-time `theta/parse/fn-arity-too-many` refusal and a correct-arity drive. No tool is called, no `CodeToolError` is produced, and no depth-walk validation fires. The live evidence is weaker than the wording: it shares only the `<name>(args)` call syntax with the reworded rows.

## Evidence
Claim side, `docs/bugs/0356-codetoolerror-validation-errors-field-contradiction.md:167` (verbatim):
```
- Verification: witness both directions established (contradictory text at fork vs. schema-agreeing text after). Full default suite green. Live witness: `tests/live/fn-call-arity-live-cell.test.ts` (adjacent code-driven `<name>(args)` boundary — the surface the reworded rows describe) driven under the shared live lock = 1/1 passed. Lint + typecheck green.
```
The surface the reworded rows describe, `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md:25`:
```
| Tool-call args, code-driven (`<name>(args)`) | theta code | `Err(CodeToolError { cause: "validation", … })` per [Tool Calls — Failures](../tool-calls.md) and [Errors and Results — `CodeToolError`](../errors-and-results/queryerror-variants.md#queryerror-variants) |
```
and the mirror row `docs/spec_topics/schema-subset.md:55`:
```
| #3 Tool-call args, code-driven | theta code | `Err(CodeToolError { cause: "validation", ... })` per [Tool Calls — Failures](./tool-calls.md) and [Errors and Results — CodeToolError](./errors-and-results.md) |
```
Evidence side, `tests/live/fn-call-arity-live-cell.test.ts:1-15` (header, opened):
```
// H8a live witness — bug 0131: a `<name>(args)` call whose callee resolves to a
// top-level `fn` in the same file is now subject to an argument-COUNT check at
// the type phase (`checkFnCallArity`, wired inside `checkFnCallArgs`,
// `src/parser/type-layer-checks.ts` — arity BEFORE per-argument type, an early
// `return` above the per-argument loop). Two consequences are observable only
// through the real discovery→registration path, not through the offline
// `parseDoc` witness:
//   - the mis-arity theta — `fn f(p: integer): integer { 1 }` called
//     `f(1, 2, 3)` — does NOT register, and its refusal reaches the
//     `theta-system-note` channel a real `SessionManager` settles, carrying
//     `theta/parse/fn-arity-too-many` with the registry-sourced Message
//     (DIAG-4);
//   - the correct-arity control DOES register and drives a real turn to a
//     fixture-pinned sentinel — proving the refusal above is not a broken
//     workspace and that this harness can witness both directions.
```
Its only describe (`:120`) is "bug 0131 live: a same-file `fn` call with too many arguments does not register, while the correct-arity control drives". The two fixtures (`:86-94` REFUSED, `:108-116` ADMITTED) contain only `fn f(...)` declarations and calls to it.

Searches run in this session:
- `rg -c -i "tool" tests/live/fn-call-arity-live-cell.test.ts` → 1 hit, `:42` `// \`registryMessage\` (tools/code-registry/index.js), never written out here.` That is a path in a comment, not a tool call.
- `rg -c "validation_errors|maxDepth|depth exceeds" tests/live/fn-call-arity-live-cell.test.ts` → 0 hits.
- `rg -c "fn-arity-too-many" tests/live/fn-call-arity-live-cell.test.ts` → 3 hits (the cell's actual subject).
- `rg -l "CodeToolError|code_tool" tests/live | wc -l` → 0 files. No live cell in the tree mentions the variant the reworded rows describe.

## Why this is a problem
The record uses a live cell as evidence that the reworded rows are backed live. The wording "the surface the reworded rows describe" says that cell exercises the code-driven tool-call argument validation that surfaces `CodeToolError`. It does not. It exercises a same-file `fn` call's argument-count check at load (a `theta/parse/*` registration refusal), a different call class and a different failure channel that share only call syntax. The honest "adjacent" in the same parenthesis is contradicted by the stronger "the surface the reworded rows describe". This is the overstated-strength shape: evidence cited under wording stronger than what it exercises.

## Suggested direction (non-binding, optional)
Reword the Verification line to say what the cell actually covers (a same-file `fn` call boundary, run as a no-regression backstop for a docs-only change), or drop the live-witness claim in favour of the docs-only witness posture the Gates line already states.

## False-positive check
- Opened the named live cell (header `:1-15`, fixtures `:86-116`, describe `:120`) and both reworded spec rows.
- Ran the four searches above: no tool-call, `CodeToolError`, `validation_errors` or depth-walk observable in the cell; the arity code appears 3 times. No live cell anywhere mentions `CodeToolError`/`code_tool`.
- I do not challenge the docs-only witness posture itself (Gates line: "witness (docs-only)"). The finding is only the Verification line's description of what the live cell witnesses.
- This is not the honesty marker being filed: "adjacent" is an honest marker, but the same parenthesis goes on to call the cell "the surface the reworded rows describe", the stronger claim this finding targets.
- The path resolves and the citation form is fine, so this is not a decayed pointer and not a gate-owned form issue.

## Triage
verdict: questionable — accounting verified; rewording a record is a human ruling. docs/bugs/0356:167 does call tests/live/fn-call-arity-live-cell.test.ts "the surface the reworded rows describe". The rows are ceilings-3-and-4.md:25 and schema-subset.md:55, both on code-driven tool-call args → Err(CodeToolError { cause: "validation" }). The cell is bug 0131's H8a witness. Its header (:1-15), its fixtures (REFUSED :86-94 `f(1, 2, 3)`, ADMITTED :108-116 `f(1)`) and its sole describe (:120) cover only a same-file `fn` arity refusal (theta/parse/fn-arity-too-many) and a correct-arity drive. All four stated searches reproduce: "tool" gives 1 comment hit at :42; validation_errors/maxDepth/depth gives 0; fn-arity-too-many gives 3; CodeToolError|code_tool across tests/live gives 0 files. So the live cell is a no-regression backstop that shares only call syntax, not the tool-call validation surface. The docs-only witness posture on the Gates line (:165) is not challenged, and no other intake or PTQ tracks this 0356 claim (triage: claude-opus-5-5)
