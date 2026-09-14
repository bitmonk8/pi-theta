---
id: PTQ-0173
title: THETA_1_0_FIELDS is read at exactly one site, a `!THETA_1_0_FIELDS.has(key)` guard that every one of the set's twelve members has already been routed past by its own `continue` arm, so the predicate is constant-true and the set decides nothing
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/parser/frontmatter.ts:320-340
  - src/parser/frontmatter.ts:1833-1847
  - src/parser/frontmatter.ts:1995-2002
  - src/parser/frontmatter.ts:2014-2034
  - src/parser/frontmatter.ts:352
  - src/parser/frontmatter.ts:653-654
sites: 1
fix_scope: localized
wave: qw20260910054544
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-10
---

# THETA_1_0_FIELDS is read at exactly one site, a `!THETA_1_0_FIELDS.has(key)` guard that every one of the set's twelve members has already been routed past by its own `continue` arm, so the predicate is constant-true and the set decides nothing

## Observation
`THETA_1_0_FIELDS` is a module-private `ReadonlySet` of the twelve recognised
frontmatter keys. Its only code read is the `else if (!THETA_1_0_FIELDS.has(key))`
branch at the tail of `parseFrontmatter`'s key loop, which emits
`theta/load/unknown-frontmatter-field`. Every key in the set has a dedicated
`if (key === "...")` arm earlier in the same loop body, and every one of those
arms ends in an unconditional `continue`, so by the time control reaches the
guard, `key` is never a member of the set. The guard is therefore true for every
key that reaches it; the set's membership has no observable effect on which keys
draw the warning. The other two mentions of the identifier (:352, :654) are
prose cross-references.

## Evidence
src/parser/frontmatter.ts:320-340 — the set and its doc, which frames it as
the thing that decides the warning:

```ts
/**
 * The recognised theta 1.0 frontmatter field vocabulary (`frontmatter-fields-a.md`
 * §Field contract). A top-level key outside this set is tolerated and surfaces
 * as the `theta/load/unknown-frontmatter-field` forward-compat warning. `timeout`
 * is deliberately absent: it has a dedicated rejection code (the NOCEIL-1 seam),
 * not the generic unknown-key warning.
 */
const THETA_1_0_FIELDS: ReadonlySet<string> = new Set([
  "description",
  "argument-hint",
  "mode",
  "model",
  "bind_model",
  "bind_context",
  "bind_echo",
  "tools",
  "system",
  "respond_repair",
  "tool_loop",
  "params",
]);
```

src/parser/frontmatter.ts:2014-2034 — the sole read, at the loop tail:

```ts
      if (DEFERRED_FRONTMATTER_FIELDS.has(key)) {
        // Reserved-for-a-deferred-feature seam: a key reserved for a deferred
        // theta 1.0 feature warns with the dedicated code (not the generic
        // unknown-key code) and is tolerated; the theta still registers.
        diagnostics.push({
          severity: "warning",
          code: "theta/load/deferred-frontmatter-field",
          file,
          ...(keyRange !== undefined ? { range: keyRange } : {}),
          message: `frontmatter field '${key}' is reserved for a deferred theta 1.0 feature`,
        });
      } else if (!THETA_1_0_FIELDS.has(key)) {
        // Forward-compat seam: an unrecognised key warns once and is tolerated.
        diagnostics.push({
          severity: "warning",
          code: "theta/load/unknown-frontmatter-field",
```

The twelve arms that precede it. `grep -n 'if (key === \|^        continue;' src/parser/frontmatter.ts`
over the loop body (:1815-2013) yields one `if (key === "<k>")` line and one
`continue;` for each of the twelve set members plus `timeout`:
`mode` :1833/:1846, `model` :1848/:1852, `bind_model` :1854/:1866,
`description` :1868/:1881, `argument-hint` :1883/:1897, `bind_echo` :1899/:1916,
`params` :1918/:1922, `bind_context` :1924/:1937, `tools` :1939/:1971,
`system` :1973/:1993, `tool_loop` :1995/:1997, `respond_repair` :1999/:2001,
`timeout` :2003/:2012. Two representative arms —

src/parser/frontmatter.ts:1833-1847 (an arm with inner branching; the
`continue` is outside the inner `if/else`, so it is unconditional):

```ts
      if (key === "mode") {
        // ...
        modePresent = true;
        if (isScalar(item.value)) {
          modeValue = String(item.value.value);
        } else {
          modeValueKind = renderNonScalarModeKind(item.value);
        }
        modeRange = valueRange;
        continue;
      }
```

src/parser/frontmatter.ts:1995-2002:

```ts
      if (key === "tool_loop") {
        toolLoopNode = item.value;
        continue;
      }
      if (key === "respond_repair") {
        respondRepairNode = item.value;
        continue;
      }
```

Mechanical proof: the loop body is a straight sequence of `if (key === "<k>") { …; continue; }`
blocks for all twelve members of the set followed by the `DEFERRED_FRONTMATTER_FIELDS`
/ `THETA_1_0_FIELDS` pair. A `key` equal to any member exits the iteration at
its own arm; a `key` reaching :2025 is therefore not a member, and
`!THETA_1_0_FIELDS.has(key)` evaluates `true` on every path that reaches it.

## Why this is a problem
Dead predicate. A guard whose value is fixed by the code above it selects
nothing; the `else if` is extensionally `else`. The set's doc (:321-325) tells
a reader that membership is what routes a key to the warning, and two other
comments (:352 "Membership is disjoint from `THETA_1_0_FIELDS`", :653-654
"matching `THETA_1_0_FIELDS` above") present it as a load-bearing table, when
its only consumer cannot observe its contents: adding or removing an entry
changes no diagnostic unless a matching `continue` arm is also added or
removed. History shows how it got here — the set and guard date from V6a
(4843d586, 2026-06-30), when several members had no arm and did reach the
guard; the last member to gain its own `continue` arm was `argument-hint`
(d23c22be, 2026-07-13), after which the guard has been constant.

## Suggested direction (non-binding, optional)
Either make the set the single source of truth the doc describes (e.g. have
the arms dispatch through it, or drop the per-arm `continue`s so recognised
keys fall through to the shared membership check), or delete the set and its
guard and let the `else` branch carry the forward-compat warning outright,
updating the two prose cross-references. The fix stage owns the choice.

## False-positive check
- Reference search: `grep -rn "THETA_1_0_FIELDS" src/ extensions/ tools/ tests/`
  → 4 hits, all in src/parser/frontmatter.ts: :327 (declaration), :352 and
  :654 (comment text), :2025 (the guard). Not exported, so no re-export or
  cross-file reader is possible; no string-keyed or dynamic access exists.
- Unconditional `continue` in every arm: read each of the twelve arm bodies
  (:1833-2002); every `continue;` is at arm top level, not nested inside an
  inner `if`/`else`, so no member key can fall through to :2025.
- Non-scalar keys: those `continue` at :1822 before any arm, so they never
  reach the guard either; they cannot make the predicate false.
- Fail-closed / spec-mandated reading considered: the guard's false branch is
  "recognised key, no warning" — that outcome is already produced upstream by
  the arms, so nothing in the spec relies on this predicate being live.
- Not test-only-reachable: the set is unreachable from tests (module-private)
  and its predicate is constant in production; this is not a "tests are the
  only caller" case.
- Not a duplicate: no filed finding cites frontmatter.ts:320-340 or :2025;
  PTQ-0149 concerns the `renderNonScalar*Kind` helpers, PTQ-0120 the
  `parseParams` double call, PTQ-0093 (resolved) the header narration.

## Triage
verdict: confirmed — every excerpt reproduces verbatim at the cited lines and my own grep of the loop body (:1815-2013) yields exactly the 13 claimed `if (key === …)`/`continue;` pairs with each `continue` at arm top level (the mode/bind_model/bind_echo/bind_context/tools/system arms place it after their inner if/else, not inside), so all twelve set members exit before :2025 and `!THETA_1_0_FIELDS.has(key)` is true on every reaching path — swapping the set for an empty one or the `else if` for `else` changes no diagnostic for any input; repo-wide grep finds the identifier only at :327/:352/:654/:2025 (unexported, no test/tool/string-keyed reader, no `export *`), and git confirms the vestige: 4843d586 (V6a, as `LOOM_1_0_FIELDS`) shipped set+guard with only mode/model/timeout arms so members did reach it, d23c22be added the twelfth arm (`argument-hint`; its parent had 11) after which the guard has been constant — same shape as confirmed PTQ-0147/0076/0158; only defect is the 'Why' overstatement that *adding* an entry changes nothing (a member added with no arm would silence the warning for that key), which does not touch the present-tense proof (triage: claude-opus-5)
