---
id: PTQ-0053
title: runInventoryClosureAudit's push helper threads a cls AuditClass parameter that every call site fixes to "violation", and the exported AuditClass type has no importer
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/inventory-closure-audit.ts:64
  - src/extension/inventory-closure-audit.ts:414-425
  - src/extension/inventory-closure-audit.ts:440-442
  - src/extension/inventory-closure-audit.ts:824-825
  - src/extension/inventory-closure-audit.ts:867
  - src/extension/inventory-closure-audit.ts:871-889
sites: 6                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# runInventoryClosureAudit's push helper threads a cls AuditClass parameter that every call site fixes to "violation", and the exported AuditClass type has no importer

## Observation
Inside `runInventoryClosureAudit`, the per-file record builder `push` takes a
`cls: AuditClass` parameter and interpolates it into the
`audit/<class>/<family>/<symptom>` discriminator. All three call sites pass
the literal `"violation"`. The only record of another class the module ever
emits — the canary — is constructed directly via `ordered.push`, bypassing
`push`; no `infra`-class record is built anywhere in src (the module docs
assign infrastructure failures to the disk driver outside this core). The
exported `AuditClass` union is referenced by no file outside this module.

## Evidence
src/extension/inventory-closure-audit.ts:64 — the exported type:

```ts
export type AuditClass = "violation" | "infra" | "canary";
```

src/extension/inventory-closure-audit.ts:414-425 — the parameter and its one
read:

```ts
    const push = (
      pos: number,
      cls: AuditClass,
      family: string,
      symptom: string,
      line: string,
      symbol: string,
      proposedResolution: string,
    ): void => {
      ordered.push({
        record: {
          discriminator: `audit/${cls}/${family}/${symptom}`,
```

Call site 1 — src/extension/inventory-closure-audit.ts:440-442
(`emitFamilyFour`):

```ts
      push(
        pos,
        "violation",
```

Call site 2 — src/extension/inventory-closure-audit.ts:825
(`emitFamilyFive`):

```ts
      push(pos, "violation", "stale-or-malformed-marker", symptom, String(ln), NA, resolution);
```

Call site 3 — src/extension/inventory-closure-audit.ts:867 (pass 4):

```ts
      push(r.pos, "violation", r.family, "off-inventory", String(r.line), r.symbol, r.proposedResolution);
```

These are all the `push(` call sites in the function (search: `push(` in the
module — three hits beyond `ordered.push`). The canary bypasses `push`
entirely — src/extension/inventory-closure-audit.ts:871-876:

```ts
  // ---- Non-empty-scan canary (fail-closed, once per invocation). ----
  const canaryOk = walked > 0 && recognised > 0;
  ordered.push({
    record: {
      discriminator: canaryOk
        ? "audit/canary/scan-floor/ok"
```

Search `"infra"` in the module: one hit, the union member at line 64 — no
infra record is ever constructed in src.

## Why this is a problem
Vestigial parameter: every call site passes the same value (the brief's
mechanical criterion), so the `cls` dimension of `push` decides nothing —
`"violation"` could be inlined into the template with zero behavior change.
The parameterization implies the helper serves all three record classes when
in fact the two non-violation classes are produced elsewhere (canary,
directly) or nowhere in this codebase (infra, assigned to the driver). The
`export` on `AuditClass` compounds this: an exhaustive reference search shows
no importer in src/, extensions/, tools/, or tests/, so the union exists only
to type a parameter that never varies.

## Suggested direction (non-binding, optional)
Fold the constant class into `push`'s discriminator template (or into the
helper's name), and drop the unused `export` on `AuditClass` — keeping the
three-class taxonomy documented in the discriminator comment, which is where
the spec partition (audit-failures.md §"Three-class partition") is already
cited.

## False-positive check
Reference searches: `AuditClass` across src/, extensions/, tools/, tests/ —
hits only inventory-closure-audit.ts:64 (definition) and :416 (the `push`
parameter annotation); tests import `AuditRecord`/`AuditResult`/
`runInventoryClosureAudit`/`formatAuditRecordLine` but not `AuditClass`
(tests/inventory-closure-audit.test.ts, tests/inventory-closure-audit-gate.test.ts
import lists verified). The gate test's hand-built infra record
(tests/inventory-closure-audit-gate.test.ts:94-101) types `discriminator` as a
plain string on `AuditRecord` — it does not use `AuditClass` or `push`.
Call-site count: `push(` occurs at exactly three sites (440, 825, 867), all
passing `"violation"`; the canary's `ordered.push` at 873 is a direct record
construction, not a `push` call. Dynamic access: `push` is a function-local
closure; no string-keyed dispatch can reach it. Spec check: the three-class
partition is a spec taxonomy of discriminator TOKENS, not a mandate that this
module's builder be parameterized over it; the canary and (absent) infra
records already spell their class inline.

## Triage
verdict: confirmed — re-verified: the local `push` closure has exactly three call sites (440, 825, 867; other `push(` hits are array `ordered/refs/bucket.push`) and all three pass the literal "violation", and `AuditClass` has zero references repo-wide outside its own definition (:64) and that annotation (:416) — no barrel re-export, no test importer, the only other hit is gitignored `dist/` build output (triage: claude-opus-5)
