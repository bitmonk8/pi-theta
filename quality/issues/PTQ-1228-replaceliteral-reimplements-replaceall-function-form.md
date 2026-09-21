---
id: PTQ-1228
title: replaceLiteral hand-rolls the literal all-occurrences scan that String.prototype.replaceAll's function-replacer form already provides
lens: D8
status: open
verdict: confirmed
locations:
  - src/runtime/stdlib-string.ts:118-142
sites: 1
fix_scope: localized
d8_class: reimplemented
d8_host: src/runtime/stdlib-string.ts#replaceLiteral
wave: qw20260921183818
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-21
---

# replaceLiteral hand-rolls the literal all-occurrences scan that String.prototype.replaceAll's function-replacer form already provides

## Observation
`replaceLiteral` (src/runtime/stdlib-string.ts:127-142) implements the theta `replace(from, to)` member as a hand-written cursor/indexOf scan. Its doc comment justifies the hand roll by naming only `replaceAll`'s **string**-replacement form as unusable (it interprets `$`-sequences). `replaceAll`'s **function**-replacer form performs the same single left-to-right non-overlapping scan and inserts the returned string literally — `$`-sequence substitution (ES `GetSubstitution`) applies only when the replacement is a string, never when it is a function. The single caller is the `"replace"` arm of `evaluateStringMember` (line 112).

## Evidence
The hand scan, src/runtime/stdlib-string.ts:127-142 (re-read before filing):

```ts
function replaceLiteral(receiver: string, from: string, to: string): string {
  if (from === "") {
    return receiver;
  }
  let result = "";
  let cursor = 0;
  for (;;) {
    const at = receiver.indexOf(from, cursor);
    if (at === -1) {
      result += receiver.slice(cursor);
      return result;
    }
    result += receiver.slice(cursor, at) + to;
    cursor = at + from.length;
  }
}
```

The stated rationale, src/runtime/stdlib-string.ts:121-126:

```
 * `to` is inserted literally — `$`-sequences (`$&`,
 * `$$`, `$n`) are never interpreted as JS replacement patterns, so this cannot
 * use the host `String.prototype.replaceAll`, whose string-replacement form
 * does interpret them.
```

Facility: `String.prototype.replaceAll` (ES2021; tsconfig.json targets/libs ES2022, package.json pins node >= 22.19.0, so it is available). Feature-for-feature against the call site's needs (the module header's contract, lines 15-20: "single left-to-right non-overlapping scan matching host `String.prototype.replaceAll`", `$`-sequences literal, empty `from` returns receiver unchanged):
- non-overlapping left-to-right scan: `replaceAll` is specified as exactly this scan (ES §String.prototype.replaceAll) — the header itself says the required semantics "match host `String.prototype.replaceAll`";
- literal insertion of `to`: `receiver.replaceAll(from, () => to)` — the function-replacer form never runs `GetSubstitution`, so `$&`/`$$`/`$n` are inert;
- empty `from`: `replaceAll("")` inserts between every code unit, so the existing three-line empty-`from` guard stays; only the twelve-line scan below it is the reimplementation.
The five normative expressions.md reference vectors are all non-empty-`from`, literal-`to` cases the function-replacer form satisfies identically.

## Why this is a problem
The module's own contract defines the required behaviour as "matching host `String.prototype.replaceAll`" and then reimplements that host facility with a manual cursor loop, on the strength of a rationale that examines only one of the facility's two replacement forms. A hand scan of this shape must be independently verified for the non-overlap/rewind properties the built-in guarantees by specification; the LOC and review burden buy nothing the one-expression facility call does not already provide.

## Suggested direction (non-binding, optional)
Unproven hypothesis: keep the empty-`from` guard and replace the scan with `receiver.replaceAll(from, () => to)` (or `receiver.split(from).join(to)`, which is likewise `$`-inert), verifying the five expressions.md reference vectors still reproduce. The fix stage owns the choice.

## False-positive check
- Spec check: expressions.md §"Built-in methods and properties" pins single left-to-right non-overlapping scan, literal `$`, empty-`from` identity — all preserved by the function-replacer form plus the retained guard; no clause requires a hand scan. Not challenging any spec clause.
- Stated-rationale check (D2 precedent): the comment's claim is narrowly true of the string-replacement form only; it does not name or rule out the function-replacer form, so the rationale does not cover the hand roll.
- Availability check: tsconfig `target: ES2022`, `lib: ["ES2022", ...]`, node >= 22.19.0 — replaceAll (ES2021) is in the compilation lib and runtime.
- Callers: `grep -rn replaceLiteral src` → one call site, stdlib-string.ts:112; not exported, no dynamic access.
- Exemption check: D8 durable exemptions list discovery-walk.ts#enumerateDirectory and production-theta-producer.ts#firstAdmittingArmProperties only — this host is not exempted; no pending/filed candidate covers it.

## Triage
verdict: questionable — accounting verified: excerpts byte-match stdlib-string.ts:118-142; sole caller is the `replace` arm at :112 (tests reference the name only in comments/messages); host not in quality/exemptions.json (D8 rows are enumerateDirectory and firstAdmittingArmProperties only); no existing PTQ/intake row covers it; the named facility covers every cited need — `receiver.replaceAll(from, () => to)` behind the retained empty-`from` guard reproduces all five expressions.md:93-97 normative vectors exactly under node 22 (`$&`/`$$`/`$1` inert; unguarded `replaceAll("")` yields `XaXbXcX`, so the guard is load-bearing and the filing keeps it), tsconfig lib ES2022 admits replaceAll; the doc-comment rationale names only the string-replacer form so it does not cover the hand roll; no spec clause requires a hand scan — the simpler shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): confirmed - D8 wave-1 batch ruling; triage equivalence verification trusted.
