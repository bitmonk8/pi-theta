# Plan-review fix-loop forensic analysis — pi-loom

_Each entry below summarises one failed `/plan-fix-findings-loop`
iteration, with a pointer to the detailed forensic report under
`.pi/tmp/plan-fix-failure-forensics/` (gitignored — read it on demand;
it does not persist across worktree wipes)._

---

## 2026-06-10 — T27 — V17a leaves three normative cancellation MUSTs with no asserting test

- **Failure mode:** fast-loop-unresolved
- **Trajectory:** n/a
- **Passes:** n/a
- **Forensic report:** none (fast loop — no forensic report)
- **Parked findings (this run):** `T27 — V17a leaves three normative cancellation MUSTs with no asserting test`
- **Loop notes:** finding not resolved by fast fix — fast reviewer reported FindingResolved: partial. CNCL-4/5/6 anchored in cancellation.md and asserted in V17a-T (mirrored V17a) with coverage rows, but the CNCL-4 session-shutdown facet ("loom cancelled by session shutdown") was added to V9g's Tests block without the matching bullet in its paired V9g-T tests task, and V9g-T's Spec line still omits cancellation.md; per the -T pairing convention that facet's failing test is not authored. Below-floor mechanical gap (floor high/90).
- **Fixer notes:** none

The detailed root-cause analysis and ranked Immediate / Pipeline
recommendations live in the gitignored forensic report cited above.
This file records only the durable TL;DR pointer so future
`/plan-review` regeneration runs (or future human triage) can trace
why the listed findings ended up in
`plan-review-parked.md`.

---

## 2026-06-10 — T21 — Asserted diagnostic code `loom/parse/empty-enum-body` is absent from the parse registry

- **Failure mode:** fast-loop-unresolved
- **Trajectory:** n/a
- **Passes:** n/a
- **Forensic report:** none (fast loop — no forensic report)
- **Parked findings (this run):** `T21 — Asserted diagnostic code loom/parse/empty-enum-body is absent from the parse registry`
- **Loop notes:** finding not resolved by fast fix per the plan-only fast reviewer (FindingResolved: no). The resolution is entirely spec-side: plan-review-fixer added the loom/parse/empty-enum-body row to docs/spec_topics/diagnostics/code-registry-parse.md (mirroring empty-schema-body, message string verbatim from schemas.md), which is exactly the recommendation. The V5a/V5a-T plan leaves already cite the code correctly and need no edit, so the plan diff is empty and the plan-only fast reviewer cannot witness the spec registry row. The substantive defect (registry/prose drift) is closed by the committed spec edit; this parking records that the fast plan-only pass could not confirm it. Stage C re-review should not resurface T21 now the row exists.
- **Fixer notes:** none

The detailed root-cause analysis and ranked Immediate / Pipeline
recommendations live in the gitignored forensic report cited above.
This file records only the durable TL;DR pointer so future
`/plan-review` regeneration runs (or future human triage) can trace
why the listed findings ended up in
`plan-review-parked.md`.

---
