---
id: PTQ-0060
title: Module headers in inventory-closure-audit.ts and load-pre-eval.ts still narrate the retired tests-task stub state ("ships a non-compliant stub", "the routed note never reaches pi.sendMessage") after the paired implementations landed
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/inventory-closure-audit.ts:35-38
  - src/extension/load-pre-eval.ts:32-35
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Module headers in inventory-closure-audit.ts and load-pre-eval.ts still narrate the retired tests-task stub state ("ships a non-compliant stub", "the routed note never reaches pi.sendMessage") after the paired implementations landed

## Observation
Both modules were delivered in a tests-task-then-implementation pair (V18b-T →
V18b; V4e-T → V4e). Each module header still carries the tests-task paragraph
describing the file as shipping a stub, in terms that contradict the current
code: `inventory-closure-audit.ts` says "this tests-task ships the seam + a
non-compliant stub" while the file contains the full audit implementation, and
`load-pre-eval.ts` says the stubbed routing means "the routed note never
reaches the channel's `pi.sendMessage`" while the current body delivers every
note via `sendSystemNote`.

## Evidence
src/extension/inventory-closure-audit.ts:35-38:

```ts
// the *Sequential by default* blocking-runtime surface. The V18b implementation
// fills `runInventoryClosureAudit` in (and wires a thin disk-walk + `npm test`
// driver around it); this tests-task ships the seam + a non-compliant stub so
// the paired failing tests red on their own primary assertions.
```

Current code: `runInventoryClosureAudit` is fully implemented in the same file
(src/extension/inventory-closure-audit.ts:373-889 — four AST passes plus the
canary), not a stub. Git: the header sentence is byte-identical to the V18b-T
stub commit (`604d22c5 V18b-T — Inventory-closure audit gate (tests)`); the
implementation landed in the next commit touching the file (`123f0398 V18b`)
without updating it.

src/extension/load-pre-eval.ts:32-35:

```ts
// V4e-T (tests-task) declares this seam and stubs the routing so the failing
// ERR-1…ERR-6/ERR-16 tests compile and red on their own primary assertions
// (the routed note never reaches the channel's `pi.sendMessage`). The paired
// V4e implementation leaf wires the routing.
```

Current code, same file (src/extension/load-pre-eval.ts:107-108):

```ts
      void cause;
      sendSystemNote(note, deps.channel);
```

Git: the paragraph dates from the V4e-T stub commit (`f419ff13 V4e-T —
load-time pre-evaluation failure routing tests (red)`); the implementation
commit (`f701ba71 V4e`) wired `sendSystemNote` and left the paragraph in
place (only a later corpus-wide Loom→Theta rename touched its wording).

## Why this is a problem
Leftover scaffolding narration: both paragraphs describe a delivery-phase
state ("this tests-task ships … a non-compliant stub"; "the routed note never
reaches the channel's `pi.sendMessage`") that the very next commit made
false, and current-code readers have no way to tell from the header whether
they are looking at the stub or the implementation. The feature's landing is
shown in git history (V18b commit 123f0398; V4e commit f701ba71), which is
the mechanical test for scaffolding comments that should have been retired
with the scaffold.

## Suggested direction (non-binding, optional)
Rewrite each paragraph to describe the module as it stands (the seam shape
and who owns the disk driver / routing), dropping the tests-task/stub
sequencing narrative or moving it to the commit history where it already
lives.

## False-positive check
Verified against current code, not just wording: `runInventoryClosureAudit`
(inventory-closure-audit.ts:373) contains the full recognizer/marker/canary
implementation and its tests pass against it (tests/inventory-closure-audit.test.ts,
tests/inventory-closure-audit-gate.test.ts import and run the real function);
`routePreEvalFailure` (load-pre-eval.ts:97-110) calls `sendSystemNote`, whose
delivery reaches the channel's `pi.sendMessage` seam — the exact observable
the V4e-T parenthetical says never happens. Git-history intent check:
`git log --follow` on both files shows the tests-task commit introduced each
paragraph and the implementation commit did not revise it (V18b-T 604d22c5 →
V18b 123f0398; V4e-T f419ff13 → V4e f701ba71); `git show 604d22c5` confirms
the V18b-T header text is byte-identical to today's. Overlap check: the
already-filed qw20260907130901-d2-01 (pre-eval cause discarded) cites
load-pre-eval.ts:97-111 for a different root cause (an unread parameter);
this finding is confined to the header narration at lines 32-35 and shares no
claim with it.

## Triage
verdict: confirmed — both excerpts verbatim at cited lines; runInventoryClosureAudit is a full implementation at 373-892 with no stub body left yet its header is byte-identical to stub commit 604d22c5 (which shipped `void input; return { records: [], walked: 0, recognised: 0 }`), and V4e f701ba71 wired sendSystemNote -> pi.sendMessage while deleting only the body twin of the header's still-present "never reaches" claim; locations disjoint from the d2-01/d2-09 same-slug filings and from d2-01-pre-eval-cause-discarded (triage: claude-opus-5)
