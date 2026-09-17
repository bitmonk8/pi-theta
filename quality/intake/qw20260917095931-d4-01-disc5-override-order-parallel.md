---
id: pending
title: DISC-5 override grammar is implemented twice
lens: D4
status: intake
verdict: pending
locations:
  - src/discovery/discovery-walk.ts:392-421
  - src/discovery/package-discovery.ts:369-422
sites: 2
fix_scope: cross-module
d4_class: parallel
wave: qw20260917095931
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-17
---

# DISC-5 override grammar is implemented twice

## Observation
The settings `thetaPaths` resolver (`resolveSettingsSource` in `discovery-walk.ts`) and the package `pi.theta` resolver (`resolvePiThetas` in `package-discovery.ts`) both implement the same four-step `!`/`+`/`-` override grammar from `discovery/package-and-settings.md` §DISC-5. The two implementations use different containers and helpers — `Map<string, candidate>` with `globMatches`/`fileEntryOf` versus `Set<string>` with `matchesGlob`/`matchesExact` — but the prefix set, precedence order, and per-step semantics are mirrored.

## Evidence
`src/discovery/discovery-walk.ts:392-403` — settings source applies the four phases:

```typescript
  // Fixed DISC-5 override order: (1) plain includes select the starting set.
  for (const entry of parsed) {
    if (entry.prefix !== "") continue;
    if (entry.glob) await addGlob(entry);
    else await addLiteral(entry);
  }
  // (2) `!` patterns drop selected candidates (glob → pattern match; literal →
  // the exact path, or a directory whose children were contributed).
  for (const entry of parsed) {
    if (entry.prefix !== "!") continue;
    for (const key of [...selected.keys()]) {
      const drop = entry.glob
        ? globMatches(fileEntryOf(key), entry.abs, entry.operand, baseDir)
        : key === entry.abs || dirnameOf(key) === entry.abs;
      if (drop) selected.delete(key);
    }
  }
```

`src/discovery/discovery-walk.ts:409-421` — remaining phases:

```typescript
  // (3) `+` operands re-admit an exact path (classified like a plain literal).
  for (const entry of parsed) {
    if (entry.prefix !== "+") continue;
    await addLiteral(entry);
  }
  // (4) `-` operands remove an exact path (or a directory's contributed
  // children), taking final precedence.
  for (const entry of parsed) {
    if (entry.prefix !== "-") continue;
    for (const key of [...selected.keys()]) {
      if (key === entry.abs || dirnameOf(key) === entry.abs) selected.delete(key);
    }
  }
```

`src/discovery/package-discovery.ts:373-388` — package source classifies entries into the same four prefix buckets:

```typescript
  for (const raw of entries) {
    const prefix = raw[0];
    const operand = prefix === "!" || prefix === "+" || prefix === "-" ? raw.slice(1) : raw;
    if (escapesPackage(pkgRoot, operand)) {
      diagnostics.push({
        severity: "warning",
        code: MANIFEST_ESCAPES_PACKAGE,
        file: pkgRoot,
        message: `package '${pkgName}' 'pi.theta' entry '${raw}' resolves outside the package root`,
      });
      continue;
    }
    if (prefix === "!") bang.push(operand);
    else if (prefix === "+") plus.push(operand);
    else if (prefix === "-") minus.push(operand);
    else plain.push(operand);
  }
```

`src/discovery/package-discovery.ts:393-403` — plain-includes step (empty `plain` selects the whole universe):

```typescript
  // (1) plain includes select the starting set (every path when none present).
  const selected = new Set<string>();
  if (plain.length === 0) {
    for (const entry of universe) selected.add(entry.abs);
  } else {
    for (const entry of universe) {
      if (plain.some((pattern) => matchesGlob(entry, pattern))) {
        selected.add(entry.abs);
      }
    }
  }
```

`src/discovery/package-discovery.ts:404-422` — the same `!`/`+`/`-` sequence:

```typescript
  // (2) `!` patterns drop matching paths.
  for (const entry of universe) {
    if (bang.some((pattern) => matchesGlob(entry, pattern))) {
      selected.delete(entry.abs);
    }
  }
  // (3) `+` operands re-admit an exact path dropped by step 2.
  for (const entry of universe) {
    if (plus.some((operand) => matchesExact(entry, operand))) {
      selected.add(entry.abs);
    }
  }
  // (4) `-` operands remove an exact path, taking final precedence.
  for (const entry of universe) {
    if (minus.some((operand) => matchesExact(entry, operand))) {
      selected.delete(entry.abs);
    }
  }
```

Verdict: parallel (no token-level clone; the two passes share `walkTree` but not the override orchestration).

## Why this is a problem
Load-bearing parallel truth. `discovery/package-and-settings.md` defines one DISC-5 grammar, but two independent discovery paths implement it. If one resolver adds a prefix, reorders the phases, or changes the empty-plain fallback while the other does not, equivalent `thetaPaths` and `pi.theta` patterns would select different files. Today each covers all four prefixes and the same fixed order.

## Suggested direction (non-binding, optional)
A shared source of truth (hypothesis): a neutral prefix classifier plus a four-phase driver living in `src/discovery/`, with each resolver supplying its own match predicate and contribution callback.

## False-positive check
Verified both call sites are live: `resolveSettingsSource` is called from `discoverThetas` in `discovery-walk.ts`; `resolvePiThetas` is called from `resolvePackage` in `package-discovery.ts`. The shared `walkTree` helper is already extracted, but the override orchestration is not. The grammar is defined once in the spec; the code repeats it twice. No tests/ are involved.

## Triage
verdict: questionable — accounting verified: all five excerpts reproduce verbatim at the cited lines; both copies enumerate the same four prefixes (`ParsedSettingsEntry.prefix: "" | "!" | "+" | "-"` at discovery-walk.ts:236/287 vs the plain/bang/plus/minus buckets at package-discovery.ts:369-388) and run the same four phases in the same order; both are live (discoverThetas→resolveSettingsSource at :471, resolvePackage→resolvePiThetas at :598); clone-scan map lists no group for discovery-walk.ts, confirming parallel-not-clone; the spec binds both to one contract (package-and-settings.md:99 → #disc-5) and tests/settings-glob-disc5-matcher.test.ts records that the two enforcement sites already drifted once (globMatches vs matchesGlob), so the anchor is mechanical, not taste; no issue/resolved row tracks the override orchestration (PTQ-0281/0287/0286 cover breakdown, listTree, and path helpers only). One caveat that does not refute the counts: the settings copy has NO empty-plain fallback (step 1 starts from an empty Map; the spec's "every path under the package root" is package-specific), so the "why"'s fallback hypothetical overstates the mirror — the shared four-phase driver is a design decision for a human ruling (triage: claude-fable-5-1)
