---
id: PTQ-1230
title: dedupePreservingFirst hand-rolls the insertion-ordered dedupe that [...new Set(names)] already provides and the codebase already uses
lens: D8
status: open
verdict: confirmed
locations:
  - src/runtime/subagent-argv.ts:385-402
  - src/runtime/subagent-argv.ts:359
sites: 1
fix_scope: localized
d8_class: reimplemented
d8_host: src/runtime/subagent-argv.ts#dedupePreservingFirst
wave: qw20260921183818
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-21
---

# dedupePreservingFirst hand-rolls the insertion-ordered dedupe that [...new Set(names)] already provides and the codebase already uses

## Observation
`dedupePreservingFirst` (src/runtime/subagent-argv.ts:392-402) dedupes a string array with a manual `Set`-guarded accumulation loop: first occurrence wins, order preserved. ECMAScript `Set` gives exactly these semantics by specification — `add` of an existing value is a no-op that does not reorder, and iteration order is insertion order — so `[...new Set(names)]` is the whole function. The codebase already uses that exact idiom for the same job elsewhere. One call site (line 359, the `--tools` csv union).

## Evidence
src/runtime/subagent-argv.ts:392-402 (re-read before filing):

```ts
function dedupePreservingFirst(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}
```

The sole call site, src/runtime/subagent-argv.ts:359:

```ts
    argv.push("--tools", dedupePreservingFirst([...input.hostTools, ...respondNames]).join(","));
```

Facility: ECMAScript `Set` (ES2015; in every configured lib). Spec guarantees at the call site's real needs (the doc comment at 385-391 asks only that "either side can repeat a name ... without the allowlist gaining a repeated entry", first occurrence winning): `Set.prototype.add` on a present value leaves the set unchanged (no reordering), and `Set` iteration is insertion order — so `[...new Set([...input.hostTools, ...respondNames])]` is feature-identical, including first-occurrence-wins ordering. Data scale: a launch's host-tool + respond-tool name list (single-digit strings per launch).

The idiom is already house style: src/extension/hot-reload.ts:344,348 (`[...new Set(`), src/extension/production-composition.ts:1640 (`Array.from(new Set(`), and src/parser/body-type-lowering.ts:631 names "the same `[...new Set(...)]` posture" in prose.

## Why this is a problem
Eleven lines plus a named helper re-derive, by hand, semantics the language specifies for `Set` construction/iteration and that three other modules in this repository already obtain from the one-expression form. The hand loop's correctness (does `add`-then-`push` under a `has` guard really preserve first occurrence?) is something a reader must verify; the facility form is correct by specification.

## Suggested direction (non-binding, optional)
Unproven hypothesis: replace the helper's body with `return [...new Set(names)];` or inline that expression at line 359. The fix stage owns the shape.

## False-positive check
- Callers: `grep -rn dedupePreservingFirst src` → declaration plus the single call site at line 359; not exported, no dynamic access, no test-only caller.
- Semantics check: `Set` insertion-order iteration and duplicate-ignoring `add` are ES-specified (ES2015 §Set Objects); first-occurrence-wins ordering is preserved because a duplicate `add` does not move the element — feature-for-feature with the loop, verified against the doc comment's stated needs (bug 0488 union dedupe).
- Stated-rationale check (D2 precedent): the doc comment (385-391) states why a dedupe is needed, not why a hand loop is needed; no rationale covers the reimplementation.
- Exemption check: subagent-argv.ts is band-exempt for D9 breakdown only; the D8 durable-exemption list does not include this host; no filed/pending candidate covers it.
- Spec check: no docs/spec_topics/ clause constrains the dedupe mechanism; the launch-contract obligations (one flag, csv union, no repeats) are unchanged.

## Triage
verdict: questionable — accounting verified: helper 392-402 and sole call site 359 reproduce byte-exact (grep: declaration + one caller, plus a test string and bug-0488 doc mention, no dynamic access); the doc comment 385-391 asks only first-occurrence-wins insertion-ordered dedupe, which ES `Set` construction/iteration guarantees, so `[...new Set(names)]` covers every stated need; house-style cites confirmed (hot-reload.ts:344,348 `[...new Set(`, production-composition.ts:1640 `Array.from(new Set(`); no D8 exemption row for the host in quality/exemptions.json, no docs/spec_topics clause constrains the mechanism, no tracked issue covers it — the simpler shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): confirmed - D8 wave-1 batch ruling; triage equivalence verification trusted.
