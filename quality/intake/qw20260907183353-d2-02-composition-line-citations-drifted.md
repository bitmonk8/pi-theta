---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: Three hardcoded line citations in production-composition.ts doc comments point at code that has moved, naming the wrong sites
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/production-composition.ts:3733-3736
  - src/extension/production-composition.ts:2717-2718
  - src/extension/production-composition.ts:4191-4193
sites: 3                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Three hardcoded line citations in production-composition.ts doc comments point at code that has moved, naming the wrong sites

## Observation
Doc comments in `production-composition.ts` cite exact line numbers as
navigation anchors. Three of them no longer point at the code they name: a
self-file citation (`:808`) for the dropped-batch `sink.emitGroup` delivery
site, a `callable-set.ts:442` citation for the `theta/load/prompt-mode-callable`
raise, and a `schema-validator.ts:126-136` citation for the validator-cache
64-bit-collision arm. Each cited line today holds unrelated code.

## Evidence
Citation 1 — src/extension/production-composition.ts:3733-3736 (inside
`parseDiscoveredTheta`):

```ts
    // Bug 0255: `lexTheta` already delivered `document.deliveredDiagnostics`
    // through the V7d seam (`src/lexer/lexer.ts:131`/`:109`) before this parse
    // ran; re-delivering them here (`:808`'s `sink.emitGroup`) would double-
    // deliver every lex row.
```

Line 808 of the same file is a comment line inside the PIC-64 /
envelope-writer hoist block ("// Bug 0178 element (b): hoisted here (not
inline in `producerDeps` below) so ..."). The dropped-batch delivery site the
comment describes is `sink.emitGroup(parsed.dropped)` at line 972; the full
list of `sink.emitGroup` call sites in the file is 633, 671, 685, 972, 981,
1049, 1075, 1101, 1119, 1134, 1164, 1219 — none at or near 808.

Citation 2 — src/extension/production-composition.ts:2717-2718 (inside
`calleeFailsOwnStructuralChecksBody`'s withhold-(b) doc):

```ts
 *       `resolveEntry` (`callable-set.ts:442`) is the one implementation that
 *       raises `theta/load/prompt-mode-callable`, so this frame raises the
```

src/parser/callable-set.ts:442-444 today is the `diagnostic:` opener of the
`theta/load/unresolvable-theta-path` arm — a different diagnostic:

```ts
      diagnostic: {
        severity: "error",
        code: "theta/load/unresolvable-theta-path",
```

The `prompt-mode-callable` raise is at src/parser/callable-set.ts:494
(`code: "theta/load/prompt-mode-callable",` — the only raise site, grep
`prompt-mode-callable` in callable-set.ts: doc rows at :18/:68/:183 and the
one code row at :494).

Citation 3 — src/extension/production-composition.ts:4191-4193 (the
`productionSchemaSlugOf` doc):

```ts
 * (not an inline closure) so the byte comparison the seam performs — the
 * 64-bit-collision arm at src/seams/schema-validator.ts:126-136 — is a
 * property of THIS function under test, not of a source-text pattern over the
```

src/seams/schema-validator.ts:126-136 today is the body of
`declaresFilteredProperty` (the `__proto__` filtered-key walk). The collision
arm — the byte-equality check plus the `validator-cache-collision` emit — is
at src/seams/schema-validator.ts:397-412:

```ts
      if (cached.canonicalBytes === canonicalBytes) {
        return cached.validator;
      }
      // Byte mismatch == schema-slug collision: refuse to serve the wrong
      // cached validator. ...
      this.#deps.emit({
        severity: "error",
        code: "theta/runtime/validator-cache-collision",
```

## Why this is a problem
Stale historical narration: a line citation is a claim about the current code,
and all three cited locations are provably wrong against the current tree (the
verification is mechanical, shown above). Two of the three now point at
*different diagnostics/functions than the ones named* — `callable-set.ts:442`
lands on the `unresolvable-theta-path` arm while naming `prompt-mode-callable`,
and `schema-validator.ts:126-136` lands on a `__proto__`-filter helper while
naming the collision arm — so a reader following the anchor is directed to
code that appears to contradict the comment. The same file demonstrates the
durable alternative: neighbouring comments cite by symbol name
(`resolveEntry`, `#recheckCalleeContainment`) without numbers, and the other
numeric citations in this file still resolve (see False-positive check).

## Suggested direction (non-binding, optional)
Replace the three numeric anchors with symbol-name references (the call-site
expression `sink.emitGroup(parsed.dropped)` in `runComposePass`;
`resolveEntry`'s `prompt-mode-callable` arm; `AjvSchemaValidator.compile`'s
byte-equality arm), or refresh the numbers — the fix stage owns the choice.

## False-positive check
- Verified each cited line against the current tree: production-composition.ts:808
  (comment line in the envelope-writer hoist, no `emitGroup`); grep
  `sink.emitGroup` over the file (12 hits, listed in Evidence, none near 808);
  callable-set.ts:435-465 read (the :442 region is the unresolvable-path
  return) and grep `prompt-mode-callable` (single code site :494);
  schema-validator.ts:120-140 read (`declaresFilteredProperty`) and
  :389-413 read (the actual collision arm).
- Checked the remaining numeric citations in the same comments so the finding
  does not over-claim: `src/lexer/lexer.ts:131`/`:109` (cited at :3734) both
  still land on `emitDiagnosticBatch(...)` calls in `lexTheta` — accurate;
  `tests/nested-tools-entry-containment.test.ts:729-743` (cited at :3041)
  still lands on the non-co-fire assertion loop — accurate;
  `host-interfaces-services.md:46` (cited at :4188) still lands on the PIC-11
  validator-cache bullet — accurate. Only the three drifted citations are
  filed.
- Deadness/test-caller rules: not applicable — the finding is about comment
  text, not code reachability; no behavior claim is made.
- Duplicate check: the prior wave filed citation-drift findings against other
  files (wire-walk, ledger errnote, interpolation source); none covers
  production-composition.ts's citations.

## Triage
