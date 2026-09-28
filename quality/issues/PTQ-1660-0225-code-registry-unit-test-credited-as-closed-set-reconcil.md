---
id: PTQ-1660
title: "Bug 0225's 0.168.0 fix record lists tests/code-registry.test.ts as \"DIAG-2 closed-set reconciliation, both directions\" among its gates, but that file drives the reconciler over a hand-written two-row registry, as bug 0230 later measured"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0225-fn-param-list-foreign-close-paren-silent.md:733-737
  - tests/code-registry.test.ts:86-116
  - docs/bugs/0230-diag-2-closed-set-not-gated-corpus-wide.md:155-160
  - docs/bugs/0230-diag-2-closed-set-not-gated-corpus-wide.md:367-372
  - tests/registry-closed-set-corpus-gate.test.ts:191-192
  - tests/fn-param-not-identifier.test.ts:236-237
sites: 1
fix_scope: localized
d10_class: overstated-strength
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0225's 0.168.0 fix record lists tests/code-registry.test.ts as "DIAG-2 closed-set reconciliation, both directions" among its gates, but that file drives the reconciler over a hand-written two-row registry, as bug 0230 later measured

## Observation
Bug 0225's fix mints a new registry row (`theta/parse/fn-param-not-identifier`). Its `## Fix (0.168.0)` *Gates* bullet lists `tests/code-registry.test.ts` `5 passed (5)` and glosses it as "DIAG-2 closed-set reconciliation, both directions". At 0225's fix commit a63be7f5, and still at HEAD, that file's closed-set cell runs `reconcileClosedSet` over a two-row literal registry and a two-element literal `assertedCodes` list. It exercises the reconciler, not the live registry or the test corpus, so it cannot see 0225's new row at all. Bug 0230 (fixed 0.184.0) measured this and names it as the pattern "fix records credit a gate for enforcing it". The corpus-wide gate 0230 shipped (`tests/registry-closed-set-corpus-gate.test.ts`) is the evidence that now reconciles the live corpus. 0225 was not among the records 0230 named and carries no note.

## Evidence
Claim side (re-read just before filing), `docs/bugs/0225-fn-param-list-foreign-close-paren-silent.md:733-737`:
```
- **Gates:** witness `24 passed (24)`; 0151's witness `35 passed (35)`;
  `tests/code-registry.test.ts` `5 passed (5)` (DIAG-2 closed-set
  reconciliation, both directions); `tests/committed-fixture-parse-gate.test.ts`
  `36 passed (36)`; full default suite `Test Files 358 passed (358) / Tests
  7313 passed (7313)`; `npx tsc --noEmit` clean; `npm run lint` clean. The fork
```

Evidence side, `tests/code-registry.test.ts:89-90`, `:109-115` (HEAD; the same body at a63be7f5 :86-115, which has 5 `it(` blocks there, matching "5 passed"):
```
  it("DIAG-2: the registry is closed — an asserted code with no row and a registry code with no asserting test both fail", () => {
    const registry: RegistryRow[] = [
...
    // `theta/parse/unterminated-string` is asserted (present in the registry);
    // `theta/runtime/ghost` is asserted but absent from the registry; and
    // `theta/runtime/match-error` is a registry code that no test asserts.
    const findings = reconcileClosedSet({
      registry,
      assertedCodes: ["theta/parse/unterminated-string", "theta/runtime/ghost"],
    }) as Finding[];
```
Bug 0230's measurement of that file, `docs/bugs/0230-diag-2-closed-set-not-gated-corpus-wide.md:155-160`:
```
`tests/code-registry.test.ts` is the file bug records name as "the closed-set
gate". Its closed-set test (`:86`) builds a two-row registry literal
(`:87–:105`) and a two-element asserted-code list (`:111`) and asserts that
`reconcileClosedSet` reports one finding of each kind. That is a unit test of
the reconciler. The file's only live-corpus assertion is the `parseRegistry`
shape test (`:62`): one row, four namespaces.
```
and `:367-372`:
```
- **The same-commit discipline DIAG-2 states is unenforced, and fix records
  credit a gate for enforcing it.** `docs/bugs/0155-…:622` calls
  `tests/code-registry.test.ts` "the closed-set gate";
  `docs/bugs/0102-…:712` and `docs/bugs/0031-…:660` reason from what its
  "closed-set reconciliation" would demand of a new code. Cells B3 and B4 show
  the file cannot answer that question. Every future fix minting a row inherits
```
The live-corpus reconciliation that exists now, `tests/registry-closed-set-corpus-gate.test.ts:191-192`:
```
describe("DIAG-2 — the closed set, reconciled over the live corpus (bug 0230)", () => {
  it("DIAG-2: every registry code with no asserting test is a pinned carve-out, and every carve-out is still reported", () => {
```
0225's own direct evidence for its row, which is sound and not disputed, `tests/fn-param-not-identifier.test.ts:236-237`:
```
describe("0225 registry — the new row is a DIAG-2 addition in the fix's own commit", () => {
  it("code-registry-parse.md carries `theta/parse/fn-param-not-identifier` with a placeholder-free Message", () => {
```

Searches (all run in this session):
- `grep -c 0230 docs/bugs/0225-fn-param-list-foreign-close-paren-silent.md` → **0**. `grep -c registry-closed-set-corpus-gate docs/bugs/0225-…` → **0**. `grep -c 0225 docs/bugs/0230-…` → **0**, so 0230's list of crediting records does not include 0225.
- `git log --format=%h -- docs/bugs/0225-…` → 3b11f739, a63be7f5, 074740b1 (bug 0370's coordination note only; no 0230 note).
- `git show a63be7f5:tests/code-registry.test.ts | grep -c "  it("` → **5**, so the record's "5 passed (5)" is this file, and its only closed-set cell is the synthetic one above.
- `grep -rl "tests/code-registry.test.ts" docs/bugs | wc -l` → **23** records cite the file. Only 0225 is in this shard.
- AGENTS.md gate names: `grep -n "reconcil\|closed" AGENTS.md` → no DIAG-2 gate entry (hits are fail-closed prose only).
- Pending candidates: `grep -rln "code-registry.test\|closed-set reconciliation" quality/intake` → **0** files before this one.

## Why this is a problem
The gate list presents a reconciler unit test as closed-set reconciliation for a fix that adds a registry row. That wording reads as corpus-level assurance that the new row is registered, mirrored and asserted. The cited test cannot give that assurance: its inputs are literals, and 0230's ghost-row probe (a registry row added with no mirror row and no asserting test) left the whole default suite, this file included, green. The row's registration is independently witnessed by 0225's own registry cell. What is overstated is only the strength credited to `tests/code-registry.test.ts`, which is exactly the "unearned assurance" 0230 records.

## Suggested direction (non-binding, optional)
Narrow the parenthetical to what the file tests (the reconciler over synthetic inputs), or add a note naming `tests/registry-closed-set-corpus-gate.test.ts` (bug 0230) as the corpus-wide DIAG-2 reconciliation that now covers the row.

## False-positive check
- The cited test's body was read at HEAD and at 0225's fix commit, and its closed-set cell is synthetic in both.
- Claim truth is not adjudicated. Whether `fn-param-not-identifier` is registered and asserted is not in question: 0225's own registry cell witnesses it, and the corpus gate now reconciles it. Only the strength credited to the cited gate is in question.
- Not already filed: 0230 names 0155, 0102 and 0031, which are not in this shard and not 0225. No pending candidate cites `code-registry.test`.
- Not a gate-enforced form issue. No gate reads fix-record gate prose.

## Triage
verdict: questionable — accounting verified; rewording a record is a human ruling. 0225:733-737 credits tests/code-registry.test.ts "5 passed (5)" as "DIAG-2 closed-set reconciliation, both directions". That file has 5 it() blocks at a63be7f5, and its closed-set cell (HEAD :89-115) runs reconcileClosedSet over a two-row literal registry and a two-element literal assertedCodes list. So it is a unit test of the reconciler, not a gate over the live corpus, matching 0230:155-160/:367-372. The live-corpus gate tests/registry-closed-set-corpus-gate.test.ts:191-192 exists. All stated searches reproduce: 0230/corpus-gate/0225 cross-refs 0/0/0, log 3b11f739/a63be7f5/074740b1, 23 citing records, no AGENTS.md DIAG-2 gate, no other intake/PTQ citing code-registry.test (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (overstated-strength). APPEND EXACTLY the following block at the very end of docs/bugs/0225-fn-param-list-foreign-close-paren-silent.md, nothing else; every existing line stays byte-identical:

### Correction note — 2026-09-28 (D10 wave qw20260928081617)

The gates list above credits tests/code-registry.test.ts as DIAG-2 closed-set reconciliation, both directions. That file is a unit test of the reconciler over a two-row literal registry and a two-element literal asserted-codes list, not a gate over the live corpus (the bug 0230 record draws the same distinction). The corpus-wide instrument is tests/registry-closed-set-corpus-gate.test.ts. Read the credit as: reconciler unit cells green; the corpus reconciliation gate is the 0230 gate.
