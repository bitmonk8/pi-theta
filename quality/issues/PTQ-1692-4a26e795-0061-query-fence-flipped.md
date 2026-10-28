---
id: PTQ-1692
title: "Bug 0061 still cites query-annotation silence after 4a26e795 flipped its g1 witness."
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0061-nonparams-type-positions-keep-junk-arm-text-silent.md:1267-1273
  - tests/schema-body-nontype-text-refusal.test.ts:1118-1138
  - tests/schema-body-nontype-text-refusal.test.ts:1141-1153
  - docs/bugs/0203-query-annotation-junk-suppresses-unresolved-named-type.md:1118-1138
  - docs/bugs/0203-query-annotation-junk-suppresses-unresolved-named-type.md:1245-1251
  - vitest.config.ts:4-12
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20261028153325
reported_by: lens-d10-verification (openai/gpt-6.1-sol)
date: 2026-10-28
---

# Bug 0061 still cites query-annotation silence after 4a26e795 flipped its g1 witness.

## Observation
Bug 0061's appended discharge note retains `@<Cat +>` diagnostic silence as a remaining tripwire. Its g1 witness now asserts `theta/parse/query-annotation-type-not-expression`, while g2 still asserts the unchanged lowering. Commit 4a26e795 flipped g1 under bug 0203's authority, but bug 0061 contains no coordination note naming that successor.

## Evidence
Claim, `docs/bugs/0061-nonparams-type-positions-keep-junk-arm-text-silent.md:1267-1273`:
```text
   requires them refused, so cells `g3` / `g4` / `g5` of
   `tests/schema-body-nontype-text-refusal.test.ts` now expect one
   `theta/parse/annotation-type-not-expression` each, marked inline with bug
   0124 as their authority. The file's cell count is unchanged at 96 and nothing
   else in it moved. The remaining two tripwires — `@<Cat +>` → `[]` and
   `lowerQueryResponseSchema("Cat +", …)` → `{}` — are byte-identical across
   that change and still guard the `@<T>` position, which stays unthreaded.
```

Current g1 assertion, `tests/schema-body-nontype-text-refusal.test.ts:1127-1138`:
```ts
    const label = "g1 (@<Cat +>)";
    const doc = parseDoc(bodyOnlySrc("let r = @<Cat +>`hi`\nr\n"), "bug0061.theta");
    expect(
      doc.body.statements.some((s) => s.kind === "let"),
      `${label}: precondition — the annotated query parsed, so the annotation position was ` +
        `actually reached`,
    ).toBe(true);
    expect(
      diagLines(doc),
      `${label}: bug 0203's row now covers this position; it is not this bug's row and not this ` +
        `bug's sink`,
    ).toEqual([plainLine("theta/parse/query-annotation-type-not-expression")]);
```

The separate g2 lowering pin remains, :1149-1153:
```ts
    expect(
      lowerQueryResponseSchema("Cat +", schemas, enums),
      `${label}: the annotation seam threads no refusal sink, so its permissive answer is ` +
        `unchanged by this fix — a fix that moves it has claimed a position this report does not own`,
    ).toEqual(PERMISSIVE);
```

Successor's explicit flip confirmation, `docs/bugs/0203-query-annotation-junk-suppresses-unresolved-named-type.md:1118-1128`:
```text
- <a id="g1-fence-flip"></a>**The fence flip §Fix (b)(8) does NOT enumerate —
  `tests/schema-body-nontype-text-refusal.test.ts` g1, pending parent
  ratification.** §Fix (b)(8) names three cells in bug 0124's witness and no
  others; a FOURTH fence sits at the same `@<T>` position in bug 0061's
  witness: the cell titled "GREEN (g1, `@<T>` annotation): `@<Cat +>` stays
  silent", together with its group header sentence "Only the `@<T>` annotation (g1/g2) still
  threads no sink under either bug and stays silent." Bug 0061 fenced the
  position without OWNING it, and its own cell comment declines the
  disposition in terms — "§Fix constraint 2 pins it as measured silent at HEAD
  and **not claimed**" — exactly as bug 0124 later did at f5/f6. It therefore
  flips under this bug's authority for the same reason f5 and f6 do: `Cat +`
```

Successor's note inventory, :1245-1251:
```text
- **Discharge notes appended.**
  [0124](./0124-parsetype-trailing-punctuation-leniency.md) — its residual 4
  (the `@<T>` capture out of frame) and its residual 3
  (`isUnspellableTextRefusable`'s one-short consumer enumeration) are both
  closed by this fix, and its own three-position Trigger is unchanged. No
  other sibling doc was touched: 0059, 0061, 0044, 0028 and 0014 keep their
  claims intact and are measured here only as controls.
```

Searches run this session:
- `git log --format='%h %s' -S'g1-fence-flip' -- tests/schema-body-nontype-text-refusal.test.ts` — 1 commit hit, 4a26e795 (bug 0203, v0.135.0). Its commit message explicitly records g1's flip as parent-ratified and g2 as untouched.
- `grep -cE '0203|4a26e795|g1-fence-flip' docs/bugs/0061-nonparams-type-positions-keep-junk-arm-text-silent.md` — 0 matching lines. The record's appended notes were opened; they cover 0124 and the corpus gate, not this flip.

`vitest.config.ts:4-12` includes `tests/**/*.test.ts` and excludes `tests/live/**`. This g1 cell is default-suite evidence, current under the brief's green-preflight premise; no test was executed.

## Why this is a problem
The claim→evidence chain points a reader seeking an asserted empty diagnostic list to a witness asserting a refusal. The flipped-pin branch of D10's decayed-pointer rule applies even though the row id survives and the separate lowering premise remains valid. The missing coordination is about which observable the witness now proves, not whether bug 0203's change was appropriate.

## Suggested direction (non-binding, optional)
An append-only dated coordination note can name 4a26e795 / bug 0203, g1's current refusal and g2's surviving lowering assertion without rewriting the historical discharge note.

## False-positive check
The claim was re-read immediately before filing. g1 and g2 were inspected separately, so this does not attribute the diagnostic flip to the unchanged lowering seam. The successor record and commit both confirm the deliberate flip; the cited record lacks its coordination note. The existing 0124 discharge note addresses g3/g4/g5 rather than this later g1 change. The intake/issue search for the commit found no existing filing of this record's g1 pin. This filing covers only the briefed record, not sibling records named by the successor. Live witnesses elsewhere in the record exist but are not gate-proven; this finding relies on the default-suite g1 assertion, not live execution or a coverage request.

## Triage
verdict: confirmed — Both stated searches reproduce; 4a26e795 and bug 0203 explicitly confirm g1's diagnostic flip, while g2 still asserts {}; 0061 has no coordination note and no duplicate tracks this pin. The successor's untouched-doc inventory does not explicitly rule against a note for this flip. No tests executed. Append exactly (\n denotes a newline): "### Coordination note — 2026-10-28, bug 0203 (0.135.0)\n\nCommit 4a26e795 (bug 0203 fix, v0.135.0) re-pinned g1 in tests/schema-body-nontype-text-refusal.test.ts: @<Cat +> now asserts theta/parse/query-annotation-type-not-expression rather than an empty diagnostic list. Cell g2 in the same file remains unchanged and asserts lowerQueryResponseSchema(\"Cat +\", …) returns {}. The wording above stands as a dated record; current disposition: docs/bugs/0203-query-annotation-junk-suppresses-unresolved-named-type.md." (triage: claude-opus-5-5)
