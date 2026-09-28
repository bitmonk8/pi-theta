---
id: PTQ-1645
title: Bug record 0055's 0099 discharge note says residual (v)'s respondSchemaSlug hex literal is "now derived from a canonical-form oracle in the witness rather than pinned by hand", but the witness cell b2 still compares against the hand-written constant SEV_SLUG = "1aae0990d53b3485"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0055-literal-union-lowering-omits-type-string-vs-subs1.md:281-303
  - tests/literal-union-string-enum-emission.test.ts:18
  - tests/literal-union-string-enum-emission.test.ts:193
  - tests/literal-union-string-enum-emission.test.ts:430-433
  - tests/literal-union-string-enum-emission.test.ts:452-470
  - docs/bugs/0099-schema-slug-hashes-stringify-not-canonical-form.md:824
sites: 1
fix_scope: localized
d10_class: overstated-strength
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug record 0055's 0099 discharge note says residual (v)'s respondSchemaSlug hex literal is "now derived from a canonical-form oracle in the witness rather than pinned by hand", but the witness cell b2 still compares against the hand-written constant SEV_SLUG = "1aae0990d53b3485"

## Observation
Residual (v) of bug 0055's `## Fix (0.59.0)` notes a gap in the witness: cell b2 pins `respondSchemaSlug`'s value as a hand-written hex literal and does not derive it from an oracle, the way the file derives the `__inline_` slug. The later "Discharged (iv) and (v)" paragraph, written under bug 0099 (0.140.0), says that gap is closed: the hex literal "is now derived from a canonical-form oracle in the witness rather than pinned by hand". At HEAD the witness (`tests/literal-union-string-enum-emission.test.ts`) still declares `const SEV_SLUG = "1aae0990d53b3485";` as a string literal. Cell b2 asserts `.toBe(SEV_SLUG)`. No oracle call produces that value. The file's only oracle derivation is `inlineDefName(B_XY_CANONICAL)`, which is for the `__inline_` name. The 0099 fix commit `a43855de` changed only the literal's value (`16d4106209c9ee70` → `1aae0990d53b3485`). Bug 0099's own re-pin table records the same thing.

## Evidence
**Claim side:** docs/bugs/0055-literal-union-lowering-omits-type-string-vs-subs1.md:281-303 (excerpted; residual (v), then the discharge note's closing sentences)
```
under the recipe as it stands. (v) The witness pins `respondSchemaSlug`'s
`16d4106209c9ee70` as a hex literal alongside the derived enum-vs-alias equality,
rather than deriving it from an oracle as the `__inline_` slug is derived. Both
...
`{"type":"string","enum":["low","high"]}` has canonical form
`{"enum":["low","high"],"type":"string"}` and slug `1aae0990d53b3485`, the value
(v) recorded as the `enum`-first half of its pair. Residual (v)'s hex literal is
now derived from a canonical-form oracle in the witness rather than pinned by
hand.
```

**Evidence side: the witness constant**, tests/literal-union-string-enum-emission.test.ts:430-433
```
const SEV_ENUM_BODY = 'enum Sev { Low = "low", High = "high" }';
const SEV_ALIAS_BODY = 'schema Sev = "low" | "high"';
/** The spelled fragment's `respondSchemaSlug` — the canonical-form slug (bug 0099 route A). */
const SEV_SLUG = "1aae0990d53b3485";
```

**Evidence side: the cell that consumes it**, tests/literal-union-string-enum-emission.test.ts:452-470 (excerpt)
```
  it("RED (b2): both spellings hash to ONE `respondSchemaSlug`, so one respond tool is registered", () => {
    const fromEnum = annotationRoot("b2", "Sev", SEV_ENUM_BODY);
    const fromAlias = annotationRoot("b2", "Sev", SEV_ALIAS_BODY);
    const enumSlug = respondSchemaSlug(fromEnum);
    const aliasSlug = respondSchemaSlug(fromAlias);
    ...
      `\`{"type":"string","enum":["low","high"]}\` (bug 0099 route A); observed ${aliasSlug} ` +
        `over ${JSON.stringify(fromAlias)}`,
    ).toBe(SEV_SLUG);
```

**Evidence side: the file's only oracle derivations** are tests/literal-union-string-enum-emission.test.ts:18 (`import { assertKeysSorted, inlineDefName } from "./helpers/canonical-slug-oracle";`) and :193 (`const B_XY_INLINE = inlineDefName(B_XY_CANONICAL);`). `slugOfCanonicalForm`, which the helper also exports, is not imported.

**Evidence side: the discharging fix's own re-pin table**, docs/bugs/0099-schema-slug-hashes-stringify-not-canonical-form.md:824
```
  | `literal-union-string-enum-emission` (23) | 1 — b2 | `SEV_SLUG` `16d4106209c9ee70`→`1aae0990d53b3485` |
```

**Searches run in this session:**
- `grep -n "SEV_SLUG" tests/literal-union-string-enum-emission.test.ts | wc -l`: 2 hits, the declaration at :433 and the `.toBe(SEV_SLUG)` at :469. Nothing is assigned from a computation.
- `grep -c "1aae0990d53b3485" tests/literal-union-string-enum-emission.test.ts`: 2 hits, the header comment at :92 and the literal at :433.
- `grep -c "createHash" tests/literal-union-string-enum-emission.test.ts`: 0.
- `grep -n "inlineDefName(\|assertKeysSorted(" tests/literal-union-string-enum-emission.test.ts`: 2 hits (:193 over `B_XY_CANONICAL`, :298 over the same). Neither touches the Sev fragment.
- History: I ran `git log --format=%h -- tests/literal-union-string-enum-emission.test.ts` and grepped `SEV_SLUG =` in each of the 12 revisions. The literal is `"16d4106209c9ee70"` at 0b1e20ab, 81600080, 153eec85 and 2f56cb0a. It is `"1aae0990d53b3485"` from a43855de (bug 0099, v0.140.0) through 1e6da3ca (HEAD's last touch). `git show a43855de -- <file>` shows the change as `-const SEV_SLUG = "16d4106209c9ee70";` / `+const SEV_SLUG = "1aae0990d53b3485";`, a literal-for-literal swap.

## Why this is a problem
The discharge note claims the witness was strengthened: the value residual (v) flagged as hand-pinned is now oracle-derived. The recorded evidence (the witness at HEAD, the commit that discharged it, and 0099's own table) shows only a new hand-pinned value. So the record says residual (v) is closed, but the witness still has exactly the shape residual (v) described. The claim is stronger than its evidence.

## Suggested direction (non-binding, optional)
Either reword the sentence so it says the literal was re-pinned by hand to the canonical-form value (which is what 0099's table records), or leave residual (v) open. Choosing between them is a wording decision for the record's owner.

## False-positive check
- **Other representations of an oracle derivation for this value.** Test filenames and titles: `grep -rln "1aae0990d53b3485" tests docs/bugs` → 9 files. One is the witness itself. The other 8 are `tests/b0488-*.test.ts` (4 files, each carrying the value as a hand-written literal), `tests/live/typed-query-wire-shapes.test.ts:302` (a comment), and the 0055/0099/0488 records. None of the 8 derives the value. The helper `tests/helpers/canonical-slug-oracle.ts` exports `slugOfCanonicalForm` (:9), but the witness does not import it.
- **Coverage-matrix / AGENTS.md:** the claim is about one test cell's derivation, which no matrix row or AGENTS.md gate names. `grep -c "SEV_SLUG\|0055" AGENTS.md` → 0.
- **Honesty marker check:** residual (v) itself is an honest marker ("accepted as written"). This filing targets the later discharge sentence, which says the marker's gap is closed. I am not filing the marker.
- **Truth not adjudicated:** I do not question that `1aae0990d53b3485` is the correct canonical-form slug. Only the "derived from an oracle" wording is at issue.
- **Already-filed topics:** PTQ-1352 / PTQ-0794 / PTQ-1510 concern test code reimplementing the slug oracle (D7). None concerns 0055's record claim.

## Triage
verdict: questionable — accounting verified; rewording a record is a human ruling. The 0055 discharge note (:301-303) says residual (v)'s hex literal is "now derived from a canonical-form oracle in the witness rather than pinned by hand", but at HEAD tests/literal-union-string-enum-emission.test.ts:433 still hand-pins `const SEV_SLUG = "1aae0990d53b3485"` and cell b2 checks `.toBe(SEV_SLUG)` at :469. The file's only oracle calls are inlineDefName(B_XY_CANONICAL) at :193 and assertKeysSorted at :298, both on the B_XY fragment; slugOfCanonicalForm is never imported and createHash appears 0 times. a43855de swapped one literal for another (16d4…→1aae…), and 0099:824's re-pin table records it the same way. No intake file or PTQ tracks this; PTQ-1352/1510 are D7 oracle-reimplementation filings with a different root cause (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (overstated-strength). APPEND EXACTLY the following block at the very end of docs/bugs/0055-literal-union-lowering-omits-type-string-vs-subs1.md, nothing else; every existing line stays byte-identical:

### Correction note — 2026-09-28 (D10 wave qw20260928081617)

The bug 0099 discharge note above says the residual (v) hex literal is now derived from a canonical-form oracle in the witness rather than pinned by hand. At HEAD the witness tests/literal-union-string-enum-emission.test.ts still hand-pins const SEV_SLUG (cell b2 compares .toBe(SEV_SLUG)); commit a43855de (bug 0099 fix, v0.140.0) swapped one hand-pinned literal for another, and no canonical-form oracle call (slugOfCanonicalForm, createHash) exists in that file. The derivation claim is retracted; the pin is a hand literal, recorded as such in the bug 0099 re-pin table.
