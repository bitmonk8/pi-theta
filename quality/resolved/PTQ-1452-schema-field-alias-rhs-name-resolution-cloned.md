---
id: PTQ-1452
title: Schema field type and alias RHS duplicate the same name-resolution and unspellable-text emission block
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/parser/schema-graph-checks.ts:71-90
  - src/parser/schema-graph-checks.ts:159-181
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260923145222
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# Schema field type and alias RHS duplicate the same name-resolution and unspellable-text emission block

## Observation
`checkSchemaFieldTypes` (object-form schema field types) and `checkAliasRhs` (alias/union right-hand sides) in `src/parser/schema-graph-checks.ts` both validate a verbatim `Type` capture from a schema declaration. Each function runs the same four-step sequence: allocate a `*ReservedKeywords` and a `*Unspellable` sink, call `collectUnresolvedNamedTypes` with the captured source and the sinks, push diagnostics for any reserved keywords, push diagnostics for any unresolved names, then guard behind a per-declaration/per-field error window and emit `theta/parse/schema-type-not-expression` for unspellable fragments that the shared `isUnspellableTextRefusable` predicate declines. The two blocks differ only in local variable names, the exact source passed to `collectUnresolvedNamedTypes`, and the alias copy's additional `s.aliasRhsRefused !== true` guard.

## Evidence
**Copy 1 — `checkSchemaFieldTypes`, object schema field types** (`src/parser/schema-graph-checks.ts:71-90`):

```typescript
        refs.typeNames,
        fieldReservedKeywords,
        fieldUnspellable,
      );
      for (const keyword of fieldReservedKeywords) {
        out.push(reservedKeywordAsIdentifierDiagnostic(keyword, s.range, file));
      }
      for (const name of fieldUnresolved) {
        out.push(unresolvedNamedTypeDiagnostic(name, s.range, file));
      }
      // bug 0061 §Fix, guard 1 only: the object body has no parse-time
      // refusal to mirror the alias position's guard 2
      // (`emitMalformedAliasRhs`) — a field's type is one verbatim capture
      // with no separate malformed-right-hand-side emission. A field that
      // already drew an error-severity diagnostic in its own walk above
      // (a position rule, a reserved keyword, or an unresolved name)
      // keeps that diagnostic alone; otherwise refuse what the shared
      // decline (`isUnspellableTextRefusable`, params.ts) does not admit,
      // one diagnostic per offending fragment, no dedup.
      if (!out.slice(fieldDiagStart).some((d) => d.severity === "error")) {
```

**Copy 2 — `checkAliasRhs`, alias/union right-hand side** (`src/parser/schema-graph-checks.ts:159-181`):

```typescript
    typeNames,
    aliasReservedKeywords,
    aliasUnspellable,
  );
  for (const keyword of aliasReservedKeywords) {
    out.push(reservedKeywordAsIdentifierDiagnostic(keyword, s.range, file));
  }
  for (const name of aliasUnresolved) {
    out.push(unresolvedNamedTypeDiagnostic(name, s.range, file));
  }
  // bug 0061 §Fix: text no `Type` production spells reaches
  // `lowerTypeExpr`'s catch-all as `aliasUnspellable`
  // (`collectUnresolvedNamedTypes`, body-type-lowering.ts); refuse what the
  // shared decline (`isUnspellableTextRefusable`, type-text-split.ts) does not admit,
  // one diagnostic per offending fragment, no dedup. Guard 1 — this
  // declaration already drew an error-severity diagnostic in its own arm
  // walk above (a position rule, a reserved keyword, or an unresolved
  // name) — keeps that diagnostic alone. Guard 2 — `emitMalformedAliasRhs`
  // already refused this right-hand side at PARSE time, into a diagnostic
  // array this checker pass cannot see — is read off the node flag
  // `finishAliasSchema` recorded (`s.aliasRhsRefused`), so the refusal never
  // cascades onto a right-hand side another row already named.
  if (
    s.aliasRhsRefused !== true &&
```

**Diff verdict:** renamed-only with one behavioural guard added in the alias copy. All structure, helper calls, diagnostic builders, and the `isUnspellableTextRefusable` filter are identical after the variable renames; only the alias path adds the `s.aliasRhsRefused !== true` conjunction. Clone-map group: **G061**.

## Why this is a problem
Both sites are schema-declaration `Type` positions and are expected to emit the same diagnostic sequence for the same invalid input. Because the logic is copied rather than shared, a change to name-resolution behaviour, to the unspellable-text guard, or to the diagnostic ordering in one site can silently leave the other behind. The existing comments already cross-reference each other (both cite bug 0061 and the shared `isUnspellableTextRefusable` predicate), which confirms the two blocks are intended to be the same rule applied to two different capture shapes. The extra `aliasRhsRefused` guard is position-specific and belongs in a parameter, not in a separately-maintained copy of the whole block.

## Suggested direction (non-binding, optional)
The natural shared home is a small helper inside `src/parser/schema-graph-checks.ts` (or an adjacent existing helper module such as `src/parser/body-type-lowering.ts`) that takes the source text, the type-name set, the declaration site, the per-declaration diagnostic-start index, and an optional parse-time-refusal flag, then returns the diagnostics to push. Both call sites would delegate to it.

## False-positive check
- Re-read both cited spans immediately before filing; both are live production code.
- Checked the already-filed list for `schema-graph-checks`, `checkSchemaFieldTypes`, `checkAliasRhs`, and bug 0061 entries; no matching D4 finding exists.
- The duplication is not a spec-normative reference vector; it is an implementation choice for applying the same registry rows to two capture positions.
- No tests/ files are involved.
- The additional `s.aliasRhsRefused !== true` guard in the alias copy was preserved as a position-specific difference, not drift.

## Triage
verdict: confirmed — both excerpts reproduce verbatim at schema-graph-checks.ts:71-90 (`checkSchemaFieldTypes`) and :159-181 (`checkAliasRhs`); `node tools/quality/clone-scan.mjs map` lists exactly G061 renamed-only (4) at those two ranges; both copies are live (`checkSchemaFieldTypes` exported at :463 and imported by type-layer-checks.ts/structural-checks.ts, `checkAliasRhs` called at :255); the sequence collectUnresolvedNamedTypes → reserved-keyword push → unresolved-name push → error-window guard → isUnspellableTextRefusable filter → schemaTypeNotExpressionDiagnostic is identical modulo local names and the alias-only `s.aliasRhsRefused !== true` conjunct (parameterisable, correctly reported as position-specific not drift); the in-code comments cross-cite each other as the same bug 0061 rule so the clone is load-bearing, not a spec vector table or incidental; no quality/issues/ entry cites this file (other "G061" mentions are per-shard scanner ids for unrelated groups) — mechanical dedupe (triage: claude-fable-5-1)
