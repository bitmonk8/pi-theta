---
id: PTQ-1694
title: "Bug 0501's typed relocation witness now accepts finalization where its record describes retryable refusal."
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0501-no-abort-compaction-anchor-drift-expires-settle-bound.md:193-197
  - docs/bugs/0501-no-abort-compaction-anchor-drift-expires-settle-bound.md:208-211
  - tests/b0501-no-abort-owned-relocation.test.ts:156-176
  - docs/bugs/0500-post-reply-threshold-compaction-misread-as-unanswered.md:204-204
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20261028153325
reported_by: lens-d10-verification (openai/gpt-6.1-sol)
date: 2026-10-28
---

# Bug 0501's typed relocation witness now accepts finalization where its record describes retryable refusal.

## Observation
Bug 0501 describes retryable forced/repair refusal for a relocated typed window and names the owned-relocation suite as evidence. Commit e071eada changed that suite's prior-history-edit policy cell to accept a separate finalization response, while keeping the failed-residue compaction cells as refusal witnesses. Bug 0500 expressly records the policy change, and the changed cell's comment confirms it. Bug 0501 has no coordination note identifying the changed pin or the finalization exception.

## Evidence
Claim, `docs/bugs/0501-no-abort-compaction-anchor-drift-expires-settle-bound.md:193-197`:
```text
Typed queries mark a relocated replay window sticky even on an ordinary
no-abort settle. Forced or repair replay fails retryably rather than using a
stale index. Existing eligible early capture remains usable unless cancellation
or foreign interleaving takes precedence. Non-compaction shifts use truthful
session-projection wording rather than attributing them to compaction.
```

Named witness, same record, `:208-211`:
```text
- New `tests/b0501-no-abort-owned-relocation.test.ts`: pre-fix 12 intended
  assertion failures / 8 controls green; final 22 cells green, including two
  added safety controls. Existing focused 0288/0482/0483/0503 coverage stays
  green (128 tests / 7 files).
```
The historical execution totals are quoted only to identify the witness entry, not challenged here.

Current changed cell, `tests/b0501-no-abort-owned-relocation.test.ts:156-167`:
```ts
describe("0501 typed relocated-window policy", () => {
  // 0500: prior-edit retains a complete, failed-attempt-free own answer and
  // now qualifies for separate finalization. The compaction fixtures below
  // lose/retain overflow failure residue and remain deliberately ineligible.
  it("prior-edit uses one attributable finalizer instead of stale replay or operational repair", async () => {
    scripted.queue.push(() => ({ ...assistant(""), content: [{ type: "toolCall", id: "final", name: "__theta_finalize", arguments: { outcome: "answer", answer: { score: 777 } } }] }));
    const r = rig("prior-edit", { typed: true });
    expect(await r.turn()).toEqual({ kind: "text", text: "777" });
    expect(await r.model.forcedRespondTurn()).toEqual({ kind: "respond", payload: { score: 777 } });
    expect(await r.model.driveRepairAttempt("repair")).toMatchObject({ kind: "provider_failure", error: { retryable: false } });
    expect(scripted.calls).toHaveLength(1);
  });
```
The adjacent `:168-176` still checks retryable refusal and no provider calls for `kept-user` and `split-turn`; those pins are not alleged to have flipped.

Successor confirmation, `docs/bugs/0500-post-reply-threshold-compaction-misread-as-unanswered.md:204`:
```text
- Only the 0501 typed prior-history-edit refusal cell changes policy: it has a complete retained own answer with no failed residue and now asserts one attributable finalization plus no operational repair. The old full-suite assertion red is retained; kept-user/split-turn fixtures with failed residue still refuse.
```

Searches run in this session:
- `git log --format='%h %s' -S'prior-edit uses one attributable finalizer' -- tests/b0501-no-abort-owned-relocation.test.ts` — 1 commit hit, e071eada. `git show e071eada -- tests/b0501-no-abort-owned-relocation.test.ts` confirms removal of `prior-edit` from the refusal table and addition of this acceptance cell.
- `grep -nE 'e071eada|2026-10-28|finaliz|coordination' docs/bugs/0501-no-abort-compaction-anchor-drift-expires-settle-bound.md` — 0 matching lines. The current-fix section was also read; its 0500 references describe that work as separate and unimplemented, not as a later pin supersession.

## Why this is a problem
The claim→evidence chain no longer resolves to the same policy oracle: following the named typed-relocation witness now finds successful finalization for the prior-edit case instead of its former retryable refusal. This is a flipped witness pin confirmed by the successor record, not an allegation that stale operational replay is now permitted. A dated coordination note can preserve the historical fix account while identifying the exception now asserted by its witness.

## Suggested direction (non-binding, optional)
Append a dated coordination note identifying e071eada / bug 0500's prior-edit finalization re-pin and distinguishing it from the retained kept-user/split-turn refusal witnesses.

## False-positive check
The successor's explicit policy-change statement, changed cell, and adjacent unchanged refusal cells were inspected separately. Finalization is a separate operation rather than stale replay; the finding concerns the named witness's changed disposition, not a claim that replay itself became safe. The default-suite witness is current proof under the brief's green preflight; no tests were executed. This is not the historical combined-design proposal or a citation-form complaint. Existing candidates were checked for this record/commit topic; none listed it. No absence of all possible witnesses or live execution is alleged.

## Triage
verdict: confirmed — Both stated searches reproduce; e071eada, bug 0500 and the cell comment verify the prior-edit policy flip, and 0501 has no coordination note. Append verbatim (\n denotes a newline): "### Coordination note — 2026-10-28, bug 0500 (Git-commit deployment, no package version bump)\n\nBug 0500's fix e071eada (Git-commit deployment, no package version bump) re-pinned the typed prior-edit cell in tests/b0501-no-abort-owned-relocation.test.ts: its complete retained own answer without failed residue now permits one attributable separate finalization, while subsequent operational repair is refused nonretryably. The kept-user and split-turn cells still refuse forced and repair replay retryably with no provider dispatch; stale operational replay remains prohibited. The wording above stands as a dated record; current disposition: docs/bugs/0500-post-reply-threshold-compaction-misread-as-unanswered.md." (triage: claude-opus-5-5)
