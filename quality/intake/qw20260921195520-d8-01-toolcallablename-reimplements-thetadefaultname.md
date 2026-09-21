---
id: pending
title: toolCallableName's `.theta`-path arm hand-rolls the default-name derivation that callable-set.ts's exported thetaDefaultName declares itself the single implementation of
lens: D8
status: intake
verdict: pending
locations:
  - src/parser/theta-document.ts:1856-1861
  - src/parser/callable-set.ts:555-566
  - src/parser/theta-document.ts:1826-1846
  - src/extension/production-theta-producer.ts:5875-5884
sites: 2
fix_scope: module
d8_class: reimplemented
d8_host: src/parser/theta-document.ts#toolCallableName
wave: qw20260921195520
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-21
---

# toolCallableName's `.theta`-path arm hand-rolls the default-name derivation that callable-set.ts's exported thetaDefaultName declares itself the single implementation of

## Observation
`theta-document.ts#toolCallableName` (1847-1861) derives the presented callable name for a `tools:` entry at parse time. Its `.theta`-path arm re-derives "basename, strip `.theta`, hyphens→underscores" by hand. `callable-set.ts#thetaDefaultName` (564-566) is the exported implementation of exactly that rule, and its doc comment pins single-implementation intent: it was exported specifically so other readers "cannot diverge on a hyphenated stem (bug 0253)". `theta-document.ts` already imports from the same dependency neighbourhood (`./frontmatter`, `./runtime-tools`, `./invoke-diagnostics` — the modules `callable-set.ts` itself imports), so no cycle blocks delegation.

## Evidence
The reimplementation, src/parser/theta-document.ts:1856-1861:
```ts
  const basename = spec.slice(spec.lastIndexOf("/") + 1);
  const stem = basename.endsWith(".theta")
    ? basename.slice(0, -".theta".length)
    : basename;
  return stem.replace(/-/g, "_");
```

The facility, src/parser/callable-set.ts:555-566 (doc + body, verbatim):
```ts
 * (`./code-review.theta` → `code_review`). The SINGLE implementation of
 * `frontmatter-fields-a.md` §default name — exported for the same reason
 * `parseToolsEntry` above is: the producer's snapshot-absent fallback
 * (`src/extension/production-theta-producer.ts`) derives a `.theta` entry's
 * default name from this function rather than re-implementing the rule, so
 * the two readers cannot diverge on a hyphenated stem (bug 0253).
 */
export function thetaDefaultName(thetaPath: string): string {
  return posix.basename(thetaPath, ".theta").replace(/-/g, "_");
}
```

Feature-for-feature at the call sites' real needs: `toolCallableName` is called at theta-document.ts:1913 (identifier-root seeding) and :3095 (shadowed-callable check), always on a whitespace-free `spec` token (the function splits on `/\s+/` first). For every whitespace-free spec, `posix.basename(spec, ".theta").replace(/-/g, "_")` and the hand-rolled slice produce identical output except a spec ending in `/` (posix.basename strips the trailing separator, the slice yields `""`) — a malformed entry either way, which reaches `theta/load/malformed-tool-entry` or `theta/load/unresolvable-theta-path` at load regardless of which parse-layer seed name it got.

The in-code rationale for NOT delegating (theta-document.ts:1830-1843, "DELIBERATELY wider than `parseToolsEntry`'s closed grammar (bug 0106 §Fix constraint 7)") defends only the ENTRY-SPLIT wideness — `parts.length >= 3` instead of `=== 3`, no rejection of two tokens. It says nothing about the name-derivation arm; the derivation is the part `thetaDefaultName` owns and the part bug 0253 locked. `production-theta-producer.ts:5875-5884` shows the two concerns already separated once: it does its own entry split, then calls `thetaDefaultName(parsed.spec)` for the derivation.

## Why this is a problem
`thetaDefaultName`'s own contract ("The SINGLE implementation … so the two readers cannot diverge") is false today: this is a third reader that re-implements the rule instead of importing it. A future change to the default-name rule (or a fix to the trailing-separator edge) lands in `callable-set.ts` and `production-theta-producer.ts` but silently misses the parse-layer seed, splitting the load-time presented name from the parse-time identifier-root/shadow-check name — exactly the divergence bug 0253 closed.

## Suggested direction (non-binding, optional)
Unproven hypothesis: keep `toolCallableName`'s deliberately-wide split intact and replace only lines 1856-1861 with `return thetaDefaultName(spec);` (import from `./callable-set`; `callable-set.ts` does not import `theta-document.ts`, so no cycle). The sole behavioural delta is the trailing-`/` malformed-spec seed name.

## False-positive check
- Exemption check: D8 durable exemptions cover `discovery-walk.ts#enumerateDirectory` and `production-theta-producer.ts#firstAdmittingArmProperties` only — neither is this host.
- Already-filed check: `grep -rl toolCallableName quality/` hits only PTQ-1156 (D9 file-level concern inventory, where it appears as an inventory row, no reimplementation claim); PTQ-0373/PTQ-0382 (resolved) concern the entry-split gate quadruplication, not the name derivation; PTQ-1221/PTQ-1229 were filed against other hosts' basename slices.
- Deliberate-rationale check (D2 precedent): the bug 0106 §Fix constraint 7 rationale at 1826-1846 was re-read in full; it defends the token-count wideness and the refusal to delegate to `parseToolsEntry` — the derivation arm is outside its scope.
- Spec check: frontmatter-fields-a.md §default name is the rule both implementations encode; delegation drops no clause.
- The split-duplication between `toolCallableName` and `piToolCallableName` (2344-2351) is duplication, routed to D4, not claimed here.

## Triage
verdict: questionable — accounting verified: theta-document.ts:1856-1861 hand-rolls basename/strip-`.theta`/hyphen→underscore byte-for-byte as excerpted; callable-set.ts:555-566 exports thetaDefaultName with the quoted "SINGLE implementation … bug 0253" doc; production-theta-producer.ts:5884 already delegates after its own split; the bug-0106 constraint-7 rationale at 1830-1846 covers only the `parts.length >= 3` wideness, not the derivation arm; both live callers (1913, 3095) pass whitespace-free specs so the sole delta is the malformed trailing-`/` seed; spec frontmatter-fields-a.md:85 §default name is the same rule (nothing dropped); no D8 exemption for the host; no cycle (callable-set.ts does not import theta-document.ts; the only inbound edge is a type-only import via invoke-diagnostics, which theta-document already imports); prior PTQ-1221/1229/0373/0382 target other hosts or the entry-split gate — the simpler shape is a design decision for a human ruling (triage: claude-fable-5-1)
