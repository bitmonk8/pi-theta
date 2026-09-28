---
id: PTQ-1659
title: Bug 0407's residual 2 says "renders the JSON row WITHOUT arm wire renames — pinned by `b0408` G2", but G2's `Cat`/`Dog` arms declare no renames, so G2 cannot witness rename loss
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0407-system-interp-object-render-skips-wire-translation.md:193
  - tests/b0408-scalar-union-params-render-json-row.test.ts:106-126
  - docs/bugs/0425-union-of-schemas-arm-renames-dropped.md:16-22
  - docs/bugs/0425-union-of-schemas-arm-renames-dropped.md:100-104
sites: 1
fix_scope: localized
d10_class: overstated-strength
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0407's residual 2 says "renders the JSON row WITHOUT arm wire renames — pinned by `b0408` G2", but G2's `Cat`/`Dog` arms declare no renames, so G2 cannot witness rename loss

## Observation
0407's `## Fix (0.405.0)` Residual 2 makes a two-part claim: a `discriminated-union`-of-schemas renders the JSON row, and it does so without arm wire renames. It cites `b0408` G2 as the pin for both parts. G2 declares `schema Cat { kind: string }` and `schema Dog { kind: string }`, with no `as "…"` field renames. It asserts `'Pet: {"kind":"cat"}'`, and those bytes are the same whether or not renames are applied. G2 therefore pins the JSON-row routing only. The rename loss the residual names has no witness in G2. The designated follow-up record 0425 says so explicitly.

## Evidence
Claim side (docs/bugs/0407-system-interp-object-render-skips-wire-translation.md:193, re-read before filing):
```
  2. A `discriminated-union`-of-schemas (`Cat \| Dog`) renders the JSON row WITHOUT arm wire renames (0407 §Fix's union-arm threading not adopted; 0408 non-goal) — pinned by `b0408` G2.
```
Evidence side (tests/b0408-scalar-union-params-render-json-row.test.ts:106-126, opened):
```
  // G2 (guard) — a union of OBJECT schemas must stay on the JSON-object row
  // (§Non-goals: "the object row is arguably right for those"). Green at the
  // fork and must remain green post-fix.
  it("G2 (guard): an object-schema union stays on the JSON row", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Pet: \${pet}'
params:
  pet: 'Cat | Dog'
---
schema Cat { kind: string }
schema Dog { kind: string }
let x = 1`);
    ...
    expect(r.ok && r.text).toBe('Pet: {"kind":"cat"}');
```
Corroboration from the designated follow-up (docs/bugs/0425-union-of-schemas-arm-renames-dropped.md:18-22):
```
  twice: 0407 §Fix residual 2 ("union-arm threading not adopted") and 0408
  §Fix residual 2; `tests/b0408-*.test.ts` G2 pins the JSON-row routing for
  object unions (with rename-free arms, so the rename loss itself is
  unwitnessed by any committed test). This report is the designated filing.
```
docs/bugs/0425-union-of-schemas-arm-renames-dropped.md:102-104:
```
Note the committed pin: `tests/b0408-*.test.ts` G2 uses rename-FREE arms
(`schema Cat { kind: string }`), so it pins only the JSON-row routing —
today's theta-side bytes for RENAMED arms are pinned by no committed test.
```
Searches run this session:
- `git log --format="%h %s" -- tests/b0408-scalar-union-params-render-json-row.test.ts` → 4 commits (`8f29983e` fix, then `f593d10e`, `eb3a16f8`, `7ef3e61e` quality). The `it()`/`describe()` scan shows no title change after creation. The last commit's diff only swaps a local `errorCodes` helper for an import. G2 has had rename-free arms since the fix.
- `grep -n "schema Cat\|schema Dog\|as \"" tests/b0425-union-of-schemas-arm-renames-dropped.test.ts` → renamed-arm fixtures (`schema Cat { kind as "K": string, name as "N": string }`, :41). Renamed union arms were first given a committed witness under 0425, after 0407 was written.

## Why this is a problem
The residual cites a committed cell as the pin for a named behaviour ("WITHOUT arm wire renames"). The cell's fixture cannot tell renamed bytes from un-renamed bytes. The cited evidence supports only the JSON-row half of the sentence, and the wording states more than that. 0425's own record calls the rename loss "unwitnessed by any committed test", which contradicts "pinned by `b0408` G2" as written in 0407.

## Suggested direction (non-binding, optional)
Narrow the pin in residual 2 to the JSON-row routing, and add a forward note that the rename half was first witnessed, and fixed, under 0425 (`tests/b0425-union-of-schemas-arm-renames-dropped.test.ts`).

## False-positive check
- Checked the sibling record 0408 (in shard): its Residual 2 (docs/bugs/0408-…md:165) states the same residual but cites no pin. Only 0407 makes the "pinned by G2" claim, so one site.
- Checked that no other b0408 cell covers renamed union arms. Its cells are W1–W4 (scalar unions), G1 (plain `number`), G2 (rename-free object union) and G3 (`.Ident` refusal), and none declares an `as "…"` rename. `grep -n "as \"" tests/b0408-scalar-union-params-render-json-row.test.ts` → 0 hits.
- None of the pending candidates cites 0407 or b0408 G2.
- This is not about citation form. The pointer resolves; the finding is the strength of the claim the pointer is said to carry.

## Triage
verdict: questionable — accounting verified; rewording a record is a human ruling: 0407:193 residual 2 says the union "renders the JSON row WITHOUT arm wire renames — pinned by `b0408` G2", but b0408 G2 ("G2 (guard): an object-schema union stays on the JSON row", :109-126) uses rename-free `schema Cat { kind: string }`/`Dog` arms and asserts `'Pet: {"kind":"cat"}'`. Those bytes are the same with or without renames, so G2 pins only the JSON-row routing (`grep -c 'as "'` on b0408 → 0). 0425:18-22/:102-104 says so too ("rename loss itself is unwitnessed"). Renamed-arm fixtures appear only in b0425 (:41-42). 4 commits reproduce; no dedupe hit (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (overstated-strength). APPEND EXACTLY the following block at the very end of docs/bugs/0407-system-interp-object-render-skips-wire-translation.md, nothing else; every existing line stays byte-identical:

### Correction note — 2026-09-28 (D10 wave qw20260928081617)

Residual 2 above says the union renders the JSON row WITHOUT arm wire renames, pinned by b0408 G2. The G2 guard cell uses rename-free Cat/Dog arms, whose rendered bytes are identical with or without rename handling, so G2 pins only the JSON-row routing — it cannot witness rename loss, as the bug 0425 record states (rename loss itself is unwitnessed there; renamed-arm fixtures live in b0425). The routing half of the residual stands; the rename-loss half is witnessed by bug 0425, not by G2.
