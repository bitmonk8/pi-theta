---
id: pending
title: "Bug 0070's 0.63.0 fix record says cell (C6a) pins `tools: WebSearch` resolving verbatim with `expect(r.registered).toBe(true)`, but 185db9db (bug 0108) re-pinned (C6a) to assert the refusal `registered === false` and appended no note to 0070"
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0070-theta-callable-default-name-unvalidated.md:298-301
  - docs/bugs/0070-theta-callable-default-name-unvalidated.md:434-436
  - docs/bugs/0070-theta-callable-default-name-unvalidated.md:470-472
  - tests/tools-derived-name-shape.test.ts:520-580
  - docs/bugs/0108-uppercase-pi-tool-name-mints-unspellable-callable.md:691-699
  - docs/bugs/0108-uppercase-pi-tool-name-mints-unspellable-callable.md:946-948
sites: 3
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0070's 0.63.0 fix record says cell (C6a) pins `tools: WebSearch` resolving verbatim with `expect(r.registered).toBe(true)`, but 185db9db (bug 0108) re-pinned (C6a) to assert the refusal `registered === false` and appended no note to 0070

## Observation
Bug 0070's `## Fix (0.63.0)` cites cell (C6a) of `tests/tools-derived-name-shape.test.ts` in three places: its Witness inventory, its Verification neutralisation, and Residual 3. All three describe (C6a) as the cell where a non-lowercase-first Pi-tool name (`WebSearch`) resolves verbatim with no claim raised, witnessed on `expect(r.registered).toBe(true)`. The bug-0108 fix commit 185db9db re-pinned that cell. It is now titled "Bug 0070 (C6a) / bug 0108 — the Pi-tool arm carries its own name-shape rule" and asserts `theta/load/invalid-pi-tool-name` fires and `r.registered` is `false`. Bug 0108's record says (C6a) was re-pinned under its §Fix constraint 4 and lists "Discharge notes appended: none". Bug 0070's record has had no commit since 846c110a and mentions neither 0108 nor the re-pin. So the (C6a) pointer still resolves to a cell, but that cell no longer asserts what the record says it does.

## Evidence
Claim side, `docs/bugs/0070-theta-callable-default-name-unvalidated.md:298-301` (Witness inventory):
```
  `code_review` derivation; **(C6/C6a)** the Pi-tool arm — `read` unaffected, and
  a non-lowercase-first registry name (`WebSearch`) resolving verbatim with no
  claim raised, which is the only cell where the `.theta`-arm conjunct is
  load-bearing; **(C7)** the dotted stem `./foo.bar.theta` → `foo.bar`.
```
`:434-436` (Verification):
```
   edit, alone and composed — never `git stash`, never a path checkout. Removing
   the whole arm → 10 red, every one the bug's symptom. Removing only the
   `.theta`-arm conjunct → exactly (C6a), on `expect(r.registered).toBe(true)`.
```
`:470-472` (Residual 3):
```
3. **An uppercase-first host Pi tool name still mints an unspellable callable.**
   `tools: WebSearch` resolves and binds `WebSearch` with no diagnostic — the
   in-principle gap §Non-goals sketched, now pinned as deliberate by cell (C6a).
```

Witness as it stands, `tests/tools-derived-name-shape.test.ts:520` and `:565-573` (excerpt):
```
describe("Bug 0070 (C6a) / bug 0108 — the Pi-tool arm carries its own name-shape rule", () => {
...
    const r = resolveList(["WebSearch"], deps({ piTools: ["WebSearch"] }));
    const dg = withCode(r.diagnostics, INVALID_PI_TOOL_CODE);
    expect(
      dg,
      `no ${INVALID_PI_TOOL_CODE} for the Pi-tool entry \`WebSearch\`; ` +
        "diagnostics: " + JSON.stringify(r.diagnostics),
    ).toBeDefined();
    expect(dg?.message).toBe(invalidPiToolName("WebSearch"));
    expect(r.registered).toBe(false);
```
The cell's own comment (`:549-550`) reads: "The Pi-tool arm is no longer exempt from the lowercase-first rule: bug 0108 corrected two words of bug 0070's residual 3."

The re-pin, `docs/bugs/0108-uppercase-pi-tool-name-mints-unspellable-callable.md:691-699`:
```
4. **Cells (C6) and (C6a) are re-pinned, not treated as an unrelated lock.**
   `tests/tools-derived-name-shape.test.ts:656–669` and `:671–691` currently
   assert `registered === true` and `entries.has("WebSearch")` for
   `tools: WebSearch`. (C6a) exists specifically so 0070's `.theta` conjunct
   cannot be removed unwitnessed, and its comment (`:673–681`) already disclaims
   that an uppercase-first Pi tool name is well-formed. Both cells red when this
   bug is fixed; this section pre-authorises editing them, and the fixer keeps
   (C6a)'s function — a cell that reds if the new arm's own scoping is removed —
   rather than deleting it. (C6)'s `read` row stays green untouched.
```
`:946-948`: "- Discharge notes appended: none. Residual 2's obligation belongs to open bug 0109 and is recorded here rather than written into that report, because a sibling lane may hold it."

Searches (run this session):
- `git log --oneline -L '/Bug 0070 (C6a)/,+5:tests/tools-derived-name-shape.test.ts'` → 185db9db (fix(bug-0108) v0.213.0) and 846c110a (fix(bug-0070) v0.63.0).
- `git show 185db9db -- tests/tools-derived-name-shape.test.ts | grep -n "^-.*toBe(true)\|^-describe\|^+describe"` → removed `describe("Bug 0070 (C6a) — the Pi-tool arm's exemption is witnessed on a non-lowercase-first registry name"`, removed `expect(r.registered).toBe(true);` and `expect(r.callableSet?.entries.has("WebSearch")).toBe(true);`, added the `/ bug 0108` describe.
- `git log --oneline -- docs/bugs/0070-theta-callable-default-name-unvalidated.md` → 846c110a, 07ef0271 (no commit after the 0.63.0 fix).
- `grep -n "0108" docs/bugs/0070-theta-callable-default-name-unvalidated.md` → 0 hits (no discharge or coordination note).
- `grep -n "C6a\|WebSearch" docs/bugs/0066-*.md … docs/bugs/0076-*.md` (all eleven shard records) → 9 hits, all in 0070 (`:298`, `:299`, `:398`, `:421`, `:422`, `:436`, `:461`, `:471`, `:472`). No other record in this shard cites (C6a).
- `grep -n "expect(r.registered).toBe(false)" tests/tools-derived-name-shape.test.ts` → `:481` and `:573` (the latter inside (C6a)).
- Coverage matrix / AGENTS.md gate names: this claim cites neither; not applicable. CHANGELOG is corroboration only and was not relied on.

## Why this is a problem
The record's Witness inventory, Verification and Residual 3 each point at (C6a) as the evidence for "`WebSearch` resolves verbatim with no claim raised" and "`expect(r.registered).toBe(true)`". Today that cell proves the opposite observable. A reader following the pointer finds a witness that contradicts the sentence citing it. The house pattern for this situation is a coordination or discharge note: bug 0067's record carries "Coordination note (0337, 2026-08-28)" recording a later flip of its own witness's `.toBe(false)` fields, and bug 0071 carries a bug-0110 discharge note. Bug 0070 has no such note, and bug 0108's record states it appended none.

## Suggested direction (non-binding, optional)
A coordination note on bug 0070, like 0067's 0337 note, recording that 185db9db re-pinned (C6a) to the `theta/load/invalid-pi-tool-name` refusal and that Residual 3 was discharged by bug 0108. The equivalent witness for 0070's own `.theta`-arm conjunct is still (C6a), which now asserts at `:574-578` that `withCode(r.diagnostics, INVALID_DERIVED_CODE)` is undefined for the Pi-tool entry.

## False-positive check
- Representations covered: bug-doc Witness-inventory, Verification and Residual lines (three 0070 sites quoted); test titles (the (C6a) `describe` string before and after 185db9db, via `git show`); test file names (`tests/tools-derived-name-shape.test.ts` exists; bug 0108's own witness `tests/uppercase-pi-tool-name-refusal.test.ts` was added by 185db9db per its `--stat`); coverage-matrix rows (none cited); AGENTS.md gate names (not a gate claim); CHANGELOG (not relied on).
- Not a dated-record-only drift: the record carries no "as of 0.63.0" caveat on (C6a), and Residual 3 says "now pinned as deliberate by cell (C6a)", which reads as current. The house records later witness flips with notes (0067's 0337 note), and none exists here.
- The truth of the 0.63.0 claim at its own HEAD is not disputed. At 846c110a, (C6a) did assert `registered === true`, per the removed lines in 185db9db. Only the pointer's current resolution is at issue.
- No pending candidate among the listed ones cites bug 0070's (C6a) pointer. PTQ-1513 and PTQ-0739 concern D7 harness duplication in the uppercase-Pi-tool tests, not this record's claim chain.

## Triage
verdict: questionable — decay verified: 0070 :298-301/:434-436/:470-472 describe (C6a) as `WebSearch` resolving verbatim on `expect(r.registered).toBe(true)`, but 185db9db (git show: removed the old C6a describe + `registered).toBe(true)`/`entries.has("WebSearch")`) re-pinned tests/tools-derived-name-shape.test.ts:520 "Bug 0070 (C6a) / bug 0108 — the Pi-tool arm carries its own name-shape rule" to assert invalid-pi-tool-name + `registered).toBe(false)` (:573); 0070 untouched since 846c110a, 0 "0108" hits, 0108 :946 "Discharge notes appended: none". No re-point exists (the pointer still names the same cell); repair means a coordination note / retensing Residual 3, which is rewording a human must rule on. Not a same-sha duplicate of d10-02 (different record and pointer; 185db9db deleted nothing). Candidate lacked a ## Triage heading; triage appended one (triage: claude-opus-5-5)
