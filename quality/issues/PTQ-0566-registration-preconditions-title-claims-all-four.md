---
id: PTQ-0566
title: The "registration preconditions" cell's name claims all four planted thetas register, but the body checks three and deliberately never checks the fourth
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/live-session-control.test.ts:182-182
  - tests/live/live-session-control.test.ts:229-234
  - tests/live/live-session-control.test.ts:249-261
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The "registration preconditions" cell's name claims all four planted thetas register, but the body checks three and deliberately never checks the fourth

## Observation
`beforeAll` plants four thetas for this file's shared `handle`: `L1_STEM`,
`L2_CHILD_STEM`, `L2_CALLER_STEM`, and `L3_STEM`. The first `it` in the
`describe` block is named "registration preconditions — all four planted
thetas register, so nothing below measures a broken workspace", but its body
loops over only three of the four stems — `L1_STEM`, `L2_CALLER_STEM`, and
`L3_STEM` — calling `handle.command(stem)` on each. `L2_CHILD_STEM` is never
passed to `handle.command` anywhere in this test (nor anywhere else in the
file): a trailing comment inside the same `it` states it is "invoked, not
slash-dispatched... it need not register a standalone slash command for this
cell."

## Evidence
`tests/live/live-session-control.test.ts:182`:
```ts
const L2_CHILD_STEM = "sesscontrol-l2-live-child";
```

`tests/live/live-session-control.test.ts:229-234` (all four stems are planted):
```ts
  const thetas: PlantedTheta[] = [
    { source: "project", stem: L1_STEM, text: L1_THETA },
    { source: "project", stem: L2_CHILD_STEM, text: L2_CHILD },
    { source: "project", stem: L2_CALLER_STEM, text: L2_CALLER },
    { source: "project", stem: L3_STEM, text: L3_THETA },
  ];
```

`tests/live/live-session-control.test.ts:249-261` (the cell under review, full
body):
```ts
  it("registration preconditions — all four planted thetas register, so nothing below measures a broken workspace", () => {
    for (const stem of [L1_STEM, L2_CALLER_STEM, L3_STEM]) {
      if (handle.command(stem) === undefined) {
        failLoudly(
          `live precondition unmet: discovery registered no \`/${stem}\` command ` +
            `(registered: ${JSON.stringify(handle.registeredNames())}). This cell cannot ` +
            "witness the session-control tools if this precondition is unmet.",
        );
      }
    }
    // `L2_CHILD_STEM` is invoked, not slash-dispatched (mirrors
    // `tests/live/b0409live-omitted-defaulted-invoke-child-intake-live-cell.test.ts`):
    // it need not register a standalone slash command for this cell.
  });
```
The loop's array literal `[L1_STEM, L2_CALLER_STEM, L3_STEM]` names three of
the four `PlantedTheta` stems in the `beforeAll` array above it; `L2_CHILD_STEM`
never appears as an argument to `handle.command` anywhere in this file (`grep
-n "handle.command(L2_CHILD_STEM)" tests/live/live-session-control.test.ts`
returns zero hits).

## Why this is a problem
A reader following this test's own name — "all four planted thetas
register" — would take away that the precondition cell establishes, before any
of the file's substantive assertions run, that every one of the four planted
`.theta` files discovery registered as a command. What the body actually
establishes is that three of the four registered as slash commands, and it
explicitly, by design, never checks the fourth's registration status at all —
the trailing comment states the child theta "need not register a standalone
slash command for this cell," not that its registration was checked and found
either present or (permissibly) absent. The title's "all four... register" is
therefore not what the body verifies; a reader who trusts the name and skips
the body would believe a stronger precondition holds (four-for-four
registration) than the one true precondition the loop actually establishes
(three-for-three, with the fourth left unaddressed by this cell).

## Suggested direction (non-binding, optional)
Naming the cell for what its loop actually iterates (the three
slash-dispatched stems) rather than "all four planted thetas" would remove the
mismatch; the fix stage owns the exact wording.

## False-positive check
Gate-pin check: this file is not `*gate*.test.ts` or named kin, so the
pinned-count carve-out does not apply. Recording-double check: this cell
performs no MUST-NOT-called witness; it is a registration precondition check,
not a negative-witness assertion, so that carve-out does not apply.
docs/bugs/ signature search: `grep -rln "sesscontrol-l2-live-child\|L2_CHILD_STEM" docs/bugs/*.md`
returned no hits, so this is not a documented correct-reason red — the cell is
green today and this finding is about its name, not its pass/fail status.
Coverage-matrix / bug-doc citation search: `grep -rn "live-session-control" docs/reference/coverage-matrix.md docs/bugs/*.md`
returned no hits naming this file or this specific `it`, so no citation pins
its current name or body; this finding proposes no merge, rename, or deletion
of the test itself, only observes the name/body mismatch. This finding stays
inside D7 (test-name-vs-body only) and does not touch src/, extensions/, or
tools/, nor does it argue any behaviour is untested — the child's registration
posture (or lack of it) is exercised functionally later in the file's `L2` `it`
via a successful `invoke(...)`, which is a coverage question this finding does
not raise.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-verified independently: excerpts reproduce verbatim at tests/live/live-session-control.test.ts:182/229-234/249-261; the `it` title asserts "all four planted thetas register" while the loop iterates `[L1_STEM, L2_CALLER_STEM, L3_STEM]` (the file's only `handle.command(` call, line 251) and `L2_CHILD_STEM` appears only at its declaration, the invoke path string, the PlantedTheta row and the trailing comment — never in a registration check; the mirrored sibling tests/live/b0409live-omitted-defaulted-invoke-child-intake-live-cell.test.ts:143 names its identical three-stem loop honestly ("the workspace and both parents register"), so this is the D7 misleading-name class per the PTQ-0266/0280 precedent (an in-body comment documenting the omission does not cure the title); docs/bugs, coverage-matrix, plan V24a-T and RFC 0011 greps confirm no citation pins the name, not a *gate* file, failLoudly posture untouched; PTQ-0235 is the same class in a different file/test, not the same root cause (triage: claude-fable-5-1)
