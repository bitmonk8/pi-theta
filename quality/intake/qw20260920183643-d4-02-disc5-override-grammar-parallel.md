---
id: pending
title: DISC-5 override grammar implemented separately in settings and package discovery
lens: D4
status: intake
verdict: pending
locations:
  - src/discovery/discovery-walk.ts:280-419
  - src/discovery/package-discovery.ts:356-420
sites: 2
fix_scope: module
d4_class: parallel
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# DISC-5 override grammar implemented separately in settings and package discovery

## Observation
The DISC-5 minimatch override grammar (`!` drop, `+` re-admit, `-` remove, with fixed precedence plain → `!` → `+` → `-`) is implemented independently in two places: `resolveSettingsSource` in `discovery-walk.ts` for settings `thetaPaths`, and `resolvePiThetas` in `package-discovery.ts` for package `pi.theta`. Each file has its own prefix parser, its own selected-set manipulation, and its own matcher helpers (`globMatches` vs `matchesGlob`/`matchesExact`). The implementations already diverge in how they interpret prefixes: settings distinguishes glob vs literal operands for plain/`!` entries and allows `+`/`-` to match directories; package treats plain/`!` as globs and `+`/`-` as exact paths only.

## Evidence
`src/discovery/discovery-walk.ts:280-419` (settings `thetaPaths`):
```ts
  const parsed: ParsedSettingsEntry[] = entries.map((raw, index) => {
    const first = raw[0];
    const prefix = first === "!" || first === "+" || first === "-" ? first : "";
    const operand = prefix === "" ? raw : raw.slice(1);
    return {
      index,
      prefix,
      abs: resolveSettingsOperand(operand, baseDir, fs),
      glob: isGlobPattern(operand),
      operand,
      raw,
    };
  });
  ...
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

`src/discovery/package-discovery.ts:356-420` (package `pi.theta`):
```ts
  const plain: string[] = [];
  const bang: string[] = [];
  const plus: string[] = [];
  const minus: string[] = [];
  for (const raw of entries) {
    const prefix = raw[0];
    const operand = prefix === "!" || prefix === "+" || prefix === "-" ? raw.slice(1) : raw;
    if (escapesPackage(pkgRoot, operand)) {
      ...
      continue;
    }
    if (prefix === "!") bang.push(operand);
    else if (prefix === "+") plus.push(operand);
    else if (prefix === "-") minus.push(operand);
    else plain.push(operand);
  }
  ...
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

Diff verdict: parallel implementations of the same DISC-5 grammar, not cloned copies. The precedence order (plain → `!` → `+` → `-`) is identical, but the operand interpretation and selected-set mutation differ: settings mixes glob/literal per entry and permits directory-level `+`/`-` matches, while package treats all plain/`!` operands as globs and all `+`/`-` operands as exact paths.

## Why this is a problem
The DISC-5 grammar is a single spec concept (discovery/package-and-settings.md), but it is encoded twice. A change to the grammar—adding a new prefix, changing precedence, or changing whether `+`/`-` may match directories—must be applied to both passes or the settings and package discovery paths will behave differently for the same manifest syntax. The existing divergence in literal-vs-glob handling shows the two implementations have already evolved independently, which is exactly the kind of drift a shared truth would prevent. Divergence here changes which `.theta` files are discovered and which diagnostics are emitted.

## Suggested direction (non-binding, optional)
A shared source of truth for the DISC-5 prefix parser, precedence order, and selected-set operations could live in `src/discovery/discovery-model.ts` or a new small helper module, with settings and package discovery supplying their own matcher predicates (glob vs exact) as parameters.

## False-positive check
- Re-verified the clone map for this shard: no clone groups in either file.
- Searched `src/` for other DISC-5 prefix parsers (`prefix === "!"`, `prefix === "+"`, `prefix === "-"`, `matchesGlob`, `globMatches`): only these two implementations exist.
- Searched `quality/intake/` for prior D4 filings about DISC-5, `pi.theta`, `thetaPaths`, or the override grammar: none found.
- Both implementations are live (`resolveSettingsSource` is called from `discoverThetas`; `resolvePiThetas` is called from `resolvePackage` during package discovery). The inline comment at `discovery-walk.ts:200` explicitly notes that `globMatches` mirrors `matchesGlob`, confirming the parallel is recognised but not centralized.

## Triage
