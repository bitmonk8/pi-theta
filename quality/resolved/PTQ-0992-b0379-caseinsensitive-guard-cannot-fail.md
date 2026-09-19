---
id: PTQ-0992
title: b0379's per-it expect(caseInsensitive, ...) assertions are tautologies guarded by their own enclosing if/else branch
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/b0379-tools-entry-byte-match.test.ts:183
  - tests/b0379-tools-entry-byte-match.test.ts:269
  - tests/b0379-tools-entry-byte-match.test.ts:278
  - tests/b0379-tools-entry-byte-match.test.ts:305
  - tests/b0379-tools-entry-byte-match.test.ts:327
  - tests/b0379-tools-entry-byte-match.test.ts:335
sites: 3
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0379's per-it expect(caseInsensitive, ...) assertions are tautologies guarded by their own enclosing if/else branch

## Observation
`tests/b0379-tools-entry-byte-match.test.ts:183` computes `const caseInsensitive = probeCaseSensitivity();` once at module scope. The whole file is then split at `:269` into `if (caseInsensitive) { describe(...) } else { describe(...) }`, so only one branch's `describe`/`it` blocks are ever registered with vitest for a given run — the value of `caseInsensitive` never changes between the `if` check and any `it` body nested inside it. Three `it` bodies inside those branches each open with `expect(caseInsensitive, "probed filesystem branch: ...").toBe(true|false)` (`:278`, `:305` inside the `if (caseInsensitive)` branch asserting `true`; `:335` inside the `else` branch asserting `false`).

## Evidence
`tests/b0379-tools-entry-byte-match.test.ts:183`:
```ts
const caseInsensitive = probeCaseSensitivity();
```

`tests/b0379-tools-entry-byte-match.test.ts:269-279` (the guarding `if`, and the first tautological assertion inside it):
```ts
if (caseInsensitive) {
  describe("bug 0379 (1) — direction (i): silent-accept closes (case-insensitive host)", () => {
    it("`./util.theta` naming on-disk `Util.theta` un-registers the caller with an unresolvable refusal", async () => {
      // At HEAD: `thetaDefaultName('./util.theta')` is `util` (lowercase-first),
      // ...
      expect(caseInsensitive, "probed filesystem branch: case-INSENSITIVE").toBe(true);
      const outcome = await loadWorkspace({
```

`tests/b0379-tools-entry-byte-match.test.ts:305` (second instance, same guarding `if` block):
```ts
      expect(caseInsensitive, "probed filesystem branch: case-INSENSITIVE").toBe(true);
```

`tests/b0379-tools-entry-byte-match.test.ts:327-335` (the `else` branch and its own tautological assertion, asserting the opposite constant):
```ts
} else {
  describe("bug 0379 (5) — parity: a case-variant entry already resolves to no file (case-sensitive host)", () => {
    it("`./Util.theta` naming on-disk `util.theta` un-registers the caller with the same unresolvable refusal Option BM gives a case-insensitive host", async () => {
      // On a case-sensitive host `./Util.theta` names no file, so the entry is
      // already `unresolvable-theta-path` and the caller does not register —
      // the cross-host parity Option BM restores for a case-insensitive host.
      // GREEN at HEAD; this branch exists so the file asserts loudly whichever
      // filesystem it runs on.
      expect(caseInsensitive, "probed filesystem branch: case-SENSITIVE").toBe(false);
```

Exact search: `grep -n "expect(caseInsensitive,"` over this file returns exactly the 3 lines cited above (`278`, `305`, `335`); no other `it` body in the file repeats this self-referential assertion.

## Why this is a problem
Each of the three assertions checks a module-level `const` against the exact boolean value that already gated whether the surrounding `describe`/`it` was even registered with vitest (`if (caseInsensitive) { … }` / `else { … }`). Because `caseInsensitive` is assigned once and never reassigned before or inside these `it` bodies, the assertion inside the `if (caseInsensitive)` branch can only ever run when `caseInsensitive === true`, and the assertion inside the `else` branch can only ever run when `caseInsensitive === false` — there is no code path in which either `expect` call observes the opposite value. Mechanically, `expect(caseInsensitive, ...).toBe(true)` inside a block reachable only when `caseInsensitive` is `true` is a tautology: it restates, rather than tests, the branch condition that already selected the block. This matches the "assertions that cannot fail" class: the assertion cannot fail no matter what the production code under test does, because its own truth was already established by the control flow that reached it, not by any observable the test drives.

## Suggested direction (non-binding, optional)
A comment stating which branch materialised (as the file already writes elsewhere, e.g. `:333-334`, "GREEN at HEAD; this branch exists so the file asserts loudly whichever filesystem it runs on") conveys the same information as a code comment without an `expect` call that cannot fail.

## False-positive check
Gate-pin: not a `*gate*.test.ts` file. Recording-double carve-out: `caseInsensitive` is a plain boolean from a filesystem probe, not a recording double, and the assertion is not a MUST-NOT-called negative witness — the carve-out does not apply. docs/bugs/ signature search: `grep -n "probed filesystem branch" docs/bugs/0379-tools-derived-name-judged-on-entry-spelling.md` returns no hits, so this is not a documented correct-reason-red shape (the file is green on either host, not left red on purpose). coverage-matrix/bug-doc citation search: as established in the sibling finding for this file, the bug doc cites this test only as a witness-run pass count, not by internal assertion; this finding does not touch which `it`s exist or their names, only removes assertions on a value never in doubt. Verified the branch-gating mechanically by reading the file's full `if (caseInsensitive) { … } else { … }` structure (`:269-350`) and confirming `caseInsensitive` is declared `const` at `:183` with no reassignment between declaration and either branch.

## Triage
verdict: confirmed — all three excerpts reproduce byte-exact at 278/305/335 and `grep -n "caseInsensitive"` over the file returns exactly 5 hits (const at 183, the `if` at 269, the three asserts), so the const is never reassigned; `filesystemIsCaseInsensitive` (tests/helpers/case-insensitive-host-probe.ts:59-74) returns only the literals true/false or throws, so inside each arm of `if (caseInsensitive) … else …` the value is already pinned to what `expect(...).toBe(true|false)` asserts — D7 "assertion that cannot fail", the identical shape confirmed and fixed as PTQ-0243 (b0329) and PTQ-0608 (b0363), and PTQ-0243:118 explicitly declined to file against this b0379 copy ("no claim is filed against them"), so this is a new root-cause instance not a duplicate (sibling intake d7-01 is harness duplication, a different root cause); carve-outs re-checked — not a gate test, the asserts read a local const not a recording double, docs/bugs grep for "probed filesystem branch" → 0 and coverage-matrix grep for b0379 → 0 reproduce, the bug doc (0379:228) cites the file only as a 5-passed witness run, no it()/describe() rename or deletion is proposed, and the file is 5/5 green at HEAD (triage: claude-fable-5-1)
