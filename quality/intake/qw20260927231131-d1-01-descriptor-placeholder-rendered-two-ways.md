---
id: pending
title: The `<descriptor>` placeholder is rendered by two independent mechanisms — placeholder.ts's JSON.stringify-quoted three-kind arm and discovery-path-classify.ts's raw-quoted five-kind renderSourceDescriptor — and the bug-0440 kind widening reached only one of them
lens: D1
status: intake
verdict: pending
locations:
  - src/diagnostics/placeholder.ts:176-182
  - src/diagnostics/placeholder.ts:208-211
  - src/diagnostics/placeholder.ts:316-322
  - src/diagnostics/placeholder.ts:348-354
  - src/discovery/discovery-path-classify.ts:422-448
  - src/discovery/discovery-collision-resolve.ts:111-113
  - src/discovery/discovery-source-enumerate.ts:278
sites: 7
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260927231131
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
---

# The `<descriptor>` placeholder is rendered by two independent mechanisms — placeholder.ts's JSON.stringify-quoted three-kind arm and discovery-path-classify.ts's raw-quoted five-kind renderSourceDescriptor — and the bug-0440 kind widening reached only one of them

## Observation
placeholder-rendering-b.md §5 defines one `<descriptor>` rendering rule: `<kind>:"<value>"` with `<kind>` drawn from the closed five-kind set in discovery-sources.md#descriptor-kinds. The repository implements that rule twice. `src/diagnostics/placeholder.ts` (the module whose header says it exists so "two conformant implementations produce byte-identical strings") carries a `descriptor` arm in both `SourceDerivedPlaceholder`/`renderSourceDerived` and `Category7Placeholder`/`renderCategory7`, quoting the value with `JSON.stringify` and typing `descriptorKind` as the three-member union `"settings" | "cli-flag" | "package"`. `src/discovery/discovery-path-classify.ts` carries `descriptorKindOf` + `renderSourceDescriptor`, quoting the value with a raw template literal `"${descriptorValue}"` and covering all five spec kinds. Every production diagnostic that renders a descriptor (the cross-source-shadow mint and the three source-failure mints) goes through the discovery renderer; the placeholder.ts arm is reached only by `renderCategory7`'s delegation and by tests/placeholder-rendering.test.ts. Bug 0440 (commit a73ccc2f, 2026-09-04) widened the closed kind set from three to five in the discovery renderer; the placeholder.ts union still names the pre-0440 three.

## Evidence

**Way 1 — placeholder.ts, category-5 arm.** src/diagnostics/placeholder.ts:176-182 (re-read before filing):
```ts
/** A category-5 placeholder rendered verbatim from the source. */
export type SourceDerivedPlaceholder =
  | { readonly kind: "identifier"; readonly text: string }
  | { readonly kind: "path"; readonly text: string }
  | { readonly kind: "key"; readonly text: string }
  | { readonly kind: "char"; readonly codePoint: number }
  | { readonly kind: "descriptor"; readonly descriptorKind: "settings" | "cli-flag" | "package"; readonly value: string };
```
src/diagnostics/placeholder.ts:208-211:
```ts
    case "descriptor":
      // The discovery-source descriptor as a `kind:value` pair, rendered
      // `<kind>:"<value>"` (the kind unquoted, the value double-quoted).
      return `${placeholder.descriptorKind}:${JSON.stringify(placeholder.value)}`;
```

**Way 1, second carrier — placeholder.ts, category-7 arm.** src/diagnostics/placeholder.ts:316-322:
```ts
export type Category7Placeholder =
  | { readonly kind: "identifier"; readonly text: string }
  | { readonly kind: "uuid"; readonly value: string }
  | { readonly kind: "closed-enum"; readonly value: string }
  | { readonly kind: "numeric"; readonly value: number }
  | { readonly kind: "path"; readonly text: string }
  | { readonly kind: "descriptor"; readonly descriptorKind: "settings" | "cli-flag" | "package"; readonly value: string };
```
src/diagnostics/placeholder.ts:348-354:
```ts
    case "descriptor":
      // Descriptor-shaped placeholders render via category 5's `<descriptor>`.
      return renderSourceDerived({
        kind: "descriptor",
        descriptorKind: placeholder.descriptorKind,
        value: placeholder.value,
      });
```

**Way 2 — discovery-path-classify.ts.** src/discovery/discovery-path-classify.ts:422-448:
```ts
/** The closed descriptor-kind spelling for a discovery source
 *  (discovery-sources.md#descriptor-kinds): distinct from `sourceLabelOf`'s
 *  prose category labels — this is the `<kind>` half of the normative
 *  `<kind>:"<value>"` descriptor form (placeholder-rendering-b.md §5). */
function descriptorKindOf(source: DiscoverySource): string {
  switch (source) {
    case "cli":
      return "cli-flag";
    case "settings":
      return "settings";
    case "project":
      return "project";
    case "package":
      return "package";
    case "global":
      return "global";
  }
}
```
src/discovery/discovery-path-classify.ts:440-448:
```ts
/** Render a source kind + descriptor value as the normative
 *  `<kind>:"<value>"` descriptor (placeholder-rendering-b.md §5/§7) — the
 *  one rendering shared by every mint site that renders a discovery source
 *  as `<descriptor>`, so a source rejected by two different observers
 *  cannot render under two grammars for the same pass (bug 0461). */
export function renderSourceDescriptor(source: DiscoverySource, descriptorValue: string): string {
  return `${descriptorKindOf(source)}:"${descriptorValue}"`;
}
```

**Way 2's production consumers.** src/discovery/discovery-collision-resolve.ts:111-113:
```ts
export function renderDescriptor(candidate: SourcedCandidate): string {
  return renderSourceDescriptor(candidate.source, candidate.descriptorValue);
}
```
src/discovery/discovery-source-enumerate.ts:278:
```ts
  const descriptor = renderSourceDescriptor(source, descriptorValue);
```

**Counts, both ways (all commands run in this session):**
- `grep -rn "renderSourceDescriptor" src --include=*.ts` → 5 hits: the declaration (discovery-path-classify.ts:446), 2 imports, 2 call sites (discovery-collision-resolve.ts:112, discovery-source-enumerate.ts:278).
- `grep -rn 'kind: "descriptor"' src tests --include=*.ts` → 4 hits: the two union arms (placeholder.ts:182, :322), the `renderCategory7` delegation (placeholder.ts:351), and one test producer (tests/placeholder-rendering.test.ts:98). No src/ producer outside placeholder.ts.
- `grep -rn "descriptorKind:" src tests --include=*.ts` → 4 hits (placeholder.ts:182, :322, :352; tests/placeholder-rendering.test.ts:99). Every producer of the placeholder.ts arm supplies `"settings"`; no producer anywhere supplies `project` or `global` to it — the type cannot express them.
- `grep -rn "renderSourceDerived" src --include=*.ts | grep -v "^src/diagnostics/placeholder.ts"` → 2 hits, both src/runtime/runtime-access-evaluators.ts (:8 import, :40 the `key` arm) — the function is production-live; its `descriptor` arm is reached from src/ only via `renderCategory7`.
- `grep -rn "renderCategory7" src tests --include=*.ts | grep -v "^src/diagnostics/placeholder.ts"` → 4 hits, all tests/placeholder-rendering.test.ts (:10 import, :121, :123, :128).
- `grep -rn "JSON.stringify" src/discovery/*.ts | grep -i descriptor` → 0 hits: the discovery renderer never escapes the value.

**Drift that already happened.** docs/bugs/0440-cross-source-shadow-descriptor-form.md:240 (verbatim): "Old set (three): `settings`, `cli-flag`, `package`. New set (five): the same three plus `project`, `global`." and :242 "`descriptorKindOf` returns the prior spelling for the three". `git log --format='%h %ad %s' --date=short -S'closed set of five' -- docs/spec_topics/discovery/discovery-sources.md` → `a73ccc2f 2026-09-04 fix(bug-0440): cross-source shadow renders descriptors, not bare paths — v0.420.0`. `git log -S'"settings" | "cli-flag" | "package"' --oneline -- src` → one hit, `e7cee8a9 V7c-T — placeholder-rendering tests …` (the union was minted then and never widened). placeholder.ts has been edited three times since 0440 (`git log --format='%h %ad %s' --date=short -- src/diagnostics/placeholder.ts | head -3` → 9fe2c769 2026-09-23, 8234cfbb 2026-09-13, 13a3f7a0 2026-09-08) without the widening reaching it.

**Concrete output divergence between the two ways.** discovery-walk.ts:459 mints the cli-flag value verbatim (`descriptorValue: \`--theta ${raw}\``), so a Windows operand carries backslashes. `node -e 'const v="--theta C:\\thetas"; console.log("cli-flag:"+JSON.stringify(v)); console.log("cli-flag:\""+v+"\"");'` printed:
```
cli-flag:"--theta C:\\thetas"     ← placeholder.ts arm
cli-flag:"--theta C:\thetas"      ← renderSourceDescriptor (what production emits)
```
The same divergence arises for any value containing `"`; the two mechanisms agree only on values with no `"` or `\`.

**Self-inconsistency statement.** No written rule chooses between the two implementations or specifies value escaping (placeholder-rendering-b.md:13 says only "the value double-quoted"); the anchor is self-inconsistency — one spec rule, two renderers with different quoting and different kind rosters — plus the cost cited above.

## Why this is a problem
Design consistency: the same contract surface (`<descriptor>` rendering) is realised by two mechanisms that have already diverged on both axes a maintainer would rely on. (1) Kind roster: the spec's closed set is five (discovery-sources.md:11 "a closed set of five … Widening this closed set is a GOV-7 change"); Way 2 has five, Way 1 has the pre-0440 three, so a maintainer who routes a conventional-root (`project`/`global`) descriptor through the "canonical placeholder seam" hits a type error, while one who reads placeholder.ts as the roster of record under-counts the kinds by two. (2) Value quoting: Way 1 JSON-escapes, Way 2 does not, so a test vector written against placeholder.ts (the module whose header promises byte-identical output across implementations) does not predict the bytes production emits for a backslash- or quote-bearing operand. The 0440 widening landing in one renderer and not the other is the drift itself, not a hypothetical.

## Suggested direction (non-binding, optional)
Unproven hypothesis: one of the two mechanisms is redundant — either placeholder.ts's descriptor arms delegate to (or are replaced by) the discovery renderer, or `renderSourceDescriptor` is re-homed onto placeholder.ts with the kind union widened to the spec's five and the quoting rule chosen once. Which quoting is the intended one is a human ruling; existing b0440/b0461 tests pin the raw form for values without special characters only.

## False-positive check
- Clone-map check: no group covers this. G021 (placeholder.ts:71-77 vs schema-lowering.ts) and G049 (placeholder.ts:124-157 vs :312-359, an in-file self-pair) do not pair placeholder.ts's descriptor arm with discovery-path-classify.ts:422-448; the two bodies share no token run (JSON.stringify template vs switch + raw template).
- D9-affinity check: not a wrong-home claim. Both renderers sit in defensible homes (the placeholder seam; the discovery module that owns `DiscoverySource`); the finding is that there are two of them, not that one is misplaced.
- D2-deadness check: both sides live. Way 2 has 2 production call sites (counted above). Way 1's `renderSourceDerived` is production-imported (runtime-access-evaluators.ts:8/:40); its descriptor arm is reached by `renderCategory7` and asserted by tests/placeholder-rendering.test.ts:92-104 — test reachability is not dead per this brief. Prior D9/D2 waves (REVIEW_LOG 2026-09-13 D9 shard-01, 2026-09-17 D2 shard-02, 2026-09-23 D2 shard-01) routed the placeholder.ts descriptor arms to D2 and D2 declined them as test-reached; none filed the two-mechanism inconsistency.
- Export-style exemption: not applicable (divergent-solutions, not wide-surface); `descriptorKind` is a kind discriminator and is not the subject — the subject is the roster and quoting divergence.
- Prior-filing check: `grep -rli "renderSourceDerived\|descriptorKind\|renderSourceDescriptor" quality/` → hits only in PTQ-0281/0284/0307/0318/0390/0402 (resolved) and logs. PTQ-0284 and PTQ-0402 consolidated package-discovery.ts's inline descriptor mints onto `renderSourceDescriptor` (read: their fix scope is the discovery-side mints only; neither names placeholder.ts). TRIAGE_LOG 2026-09-20 rejected `descriptorKindOf` vs `sourceLabelOf` (a different pair — two switches over `DiscoverySource`); this filing does not re-derive that.
- Spec check: placeholder-rendering-b.md:13 and discovery-sources.md:11 both re-read this session; neither specifies escaping, both specify five kinds.
- Self-inconsistency: no written rule exists; the anchor is self-inconsistency plus the cost cited above.

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. All six stated searches reproduce with the stated hit counts (5/4/4/2/4/0), and every excerpt matches at the cited lines. The two renderers really differ. placeholder.ts:182/:322 still types the kind as the three-member `"settings"|"cli-flag"|"package"` union and quotes with JSON.stringify (:211). discovery-path-classify.ts:426-448 covers all five kinds and quotes raw, and it is the only renderer production uses (collision-resolve:112, source-enumerate:278). The cost is real: commit a73ccc2f (bug 0440) widened the spec set to five (discovery-sources.md#descriptor-kinds, placeholder-rendering-b.md:13), while the union has been unchanged since e7cee8a9. The quoting also diverges for values containing `\` or `"`, and cli-flag values are verbatim (discovery-walk.ts:459). Clone-scan shows only G021/G049, neither of which pairs these two renderers. No open PTQ or intake file covers this; PTQ-0284/0402 dealt only with the discovery-side mints (triage: claude-opus-5-5)
