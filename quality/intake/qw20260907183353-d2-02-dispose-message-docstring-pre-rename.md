---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: renderSubagentDisposeFailureMessage's docstring states the pre-rename Message template "subagent dispose failed" that its own body and the registry row contradict
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/subagent-isolation.ts:69-73
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# renderSubagentDisposeFailureMessage's docstring states the pre-rename Message template "subagent dispose failed" that its own body and the registry row contradict

## Observation
The docstring on `renderSubagentDisposeFailureMessage` quotes the diagnostics
registry Message column for `theta/runtime/subagent-dispose-failure` as
`subagent dispose failed: <dispose error first line>`. The function body four
lines below returns `subagent teardown failed: ...`, the registry row pins
`subagent teardown failed: <teardown error first line>`, and the shipped test
asserts the teardown spelling verbatim. The docstring carries the template's
pre-rename generation.

## Evidence
src/runtime/subagent-isolation.ts:69-80 — the claim and the contradicting body:

```ts
/**
 * PIC-65 advisory diagnostic message (diagnostics registry Message column, code
 * `theta/runtime/subagent-dispose-failure`): `subagent dispose failed: <dispose
 * error first line>`.
 */
export function renderSubagentDisposeFailureMessage(disposeError: unknown): string {
  const raw = disposeError instanceof Error ? disposeError.message : String(disposeError);
  const firstLine = raw.split("\n", 1)[0] ?? "";
  // Registry-pinned Message column (code-registry-runtime.md): only the first
  // line of a multi-line teardown-step error rides in.
  return `subagent teardown failed: ${firstLine}`;
}
```

docs/reference/diagnostics.md:293 — the pinned registry row:

```
| `theta/runtime/subagent-dispose-failure` | E | runtime | `subagent teardown failed: <teardown error first line>`. |
```

tests/subagent-isolation.test.ts:212-219 — the shipped lock on the teardown
spelling:

```ts
  it("PIC-65: the dispose-failure Message column is the registry-pinned string verbatim (\"subagent teardown failed: <first line>\")", () => {
```

docs/bugs/0189-registry-placeholders-outside-closed-categories.md (§R6, fixed
0.129.0) records the rename mechanism: commit `fda23a4b` (v0.8.0, RFC 0005)
renamed the row's Message token from `subagent dispose failed: <dispose error
first line>` to `subagent teardown failed: <teardown error first line>`.

## Why this is a problem
Historical narration: the docstring makes a present-tense factual claim ("the
diagnostics registry Message column ... is `subagent dispose failed: <dispose
error first line>`") that is one generation behind — falsified by the registry
row, by the function's own return statement directly below it, and by the test
that pins the emitted bytes. A reader trusting the docstring (for example, when
grepping logs for the message) searches for a string the runtime never emits.
Bug 0189's fix (0.129.0) reconciled the placeholder-rendering docs to the
teardown wording but did not touch this comment.

## Suggested direction (non-binding, optional)
Update the docstring's quoted template to the pinned
`subagent teardown failed: <teardown error first line>` form.

## False-positive check
- Verified the emitted string: `grep -rn "subagent dispose failed" src tests`
  → only this docstring (src/runtime/subagent-isolation.ts:71); every code and
  test occurrence of the message is the `subagent teardown failed:` spelling
  (src/runtime/subagent-isolation.ts:79, tests/subagent-isolation.test.ts:219).
- Verified the registry: docs/reference/diagnostics.md:293 and
  docs/spec_topics/diagnostics/code-registry-runtime.md:26 both carry the
  teardown wording for this code; no registry row anywhere carries the dispose
  wording.
- Git intent: bug 0189 §R6 documents (with read-only `git show` transcripts)
  that `fda23a4b` renamed the token in the same commit that re-scoped the
  trigger; the docstring predates the rename and was not updated. Bug 0189's
  §Fix scope was the two placeholder-rendering-*.md pages only, so the comment
  was not left deliberately by that fix.
- Checked already-filed intake and the triage log: no filed finding names
  subagent-isolation.ts's dispose-message docstring (the one filed
  subagent-isolation finding, qw20260907130901-d2-06-isolation-model-guard-
  reexport-unused, concerns the model-guard re-export block).

## Triage
