---
id: pending
title: TypeLayerWalk.walkStmt is 333 LOC because its `let` arm alone spans 198 lines of binding-record logic inside the statement dispatch
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/type-layer-checks.ts:1625-1957
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/type-layer-checks.ts#TypeLayerWalk.walkStmt
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# TypeLayerWalk.walkStmt is 333 LOC because its `let` arm alone spans 198 lines of binding-record logic inside the statement dispatch

## Observation
`walkStmt` (src/parser/type-layer-checks.ts:1625-1957, 333 LOC, strong band) is a switch over `stmt.kind`. Two arms carry substantial inline bodies — `let` (198 lines) and `reassign` (48 lines) — while the remaining nine arms are 3-6 line delegations (`fn` delegates to `walkFn`, `if`/`while`/`for` to check helpers plus recursion).

## Evidence
Step inventory (arm boundaries from `grep -n 'case "'` over 1625-1957):

| phase (arm) | lines | LOC | locals read/written |
|---|---|---|---|
| `let`: annotation recogniser withhold, conversion, sunk-array decision, RHS compat + element check, init walk, record declared/inferred type, Result-membership channels, unprovable marking | 1627-1824 | 198 | rhsType, annotation, sunkArray, sunkArrays, initUnprovable, inferred, recorded; writes bindings, this.diagnostics, this.resultBindings, this.unprovableBindings |
| `reassign`: target lookup, withheld gates, RHS compat, `+=` desugar plus-gate | 1825-1872 | 48 | declared, rhsType; writes this.diagnostics |
| `if` / `while`: boolean-position check + recursion | 1873-1883 | 11 | none beyond params |
| `for`: iterand check, element binding, body walk | 1884-1931 | 48 | iterandType, diag, inner, unfolded |
| `fn`/`return`/`query`/`tool-call`/`invoke`/`expr`/default | 1932-1957 | 26 | none |

The `let` arm's locals (rhsType, annotation, sunkArray, sunkArrays, initUnprovable, inferred, recorded) are private to that arm — no other arm reads them.

## Why this is a problem
Strong band: presumption of breakdown absent a strong concrete reason. Reasons considered and defeated: closed-enumeration dispatch — the switch does mirror the `Stmt` union (grammar.md statement productions), but the reason requires every arm short, and the longest arm is 198 LOC (over the 100 justify function threshold on its own); single algorithm with shared local state — defeated, the `let` arm's seven locals are arm-private, so `walkLetStmt(stmt, bindings, flow)` threads only the three parameters the method already receives (env/file/diagnostics ride on `this`); no measured cost, no reverted split, no exemptions.json entry, no spec-cited critical section that a private-method seam would interleave.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: the `let` arm body (1627-1824, 198 LOC) -> private `TypeLayerWalk.walkLetStmt` (hypothesis) — 0 exported symbols moved, 0 external importers affected, cross-references stay in-class. Seam B: the `reassign` arm (1825-1872, 48 LOC) -> private `walkReassignStmt` (hypothesis), same shape.

## False-positive check
Band check: 333 LOC ≥ 200 (strong) per the authoritative map. Reasons-considered: the five reason classes checked above; the closed-enumeration reason is defeated by the 198-LOC arm. Exemptions check: no D9 key for this host in quality/exemptions.json. Generated-code check: hand-written with per-bug rationale (bugs 0050, 0079, 0083, 0090, 0115, 0124, 0130, 0199, 0314, 0341 cited in-body). Spec-mirror check: the arm set mirrors the statement grammar, recorded above and defeated on arm length. Note: a substantial fraction of the arm's lines are rationale comments; the comment prose moves with the arm under either seam, and the scanner's LOC measure (which counts them) is the authoritative one.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces TypeLayerWalk.walkStmt at 1625-1957 / 333 LOC / band strong; all five arm boundaries match (`case "let"` 1627, `reassign` 1825, `if` 1873, `while` 1879, `for` 1884, delegation arms 1932-1952); the `let` arm's seven locals (rhsType, annotation, sunkArray, sunkArrays, initUnprovable, inferred, recorded) are block-scoped to that arm and the `reassign` arm redeclares its own `rhsType`, so no shared-local reason applies; no quality/exemptions.json entry for the file or method; closed-enumeration reason is acknowledged and contested on arm length (198 scanner LOC, of which 143 are comment lines and 55 code — disclosed in the filing); same-wave sibling d9-01 is file-level (host = the file), distinct root cause; whether a comment-dense 198-LOC arm inside a Stmt-union switch warrants a private-method seam is a design ruling for a human (triage: claude-fable-5-1)
