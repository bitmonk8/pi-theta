---
id: PTQ-1695
title: "Bug 0061's byte-for-byte mixed-union pin was changed by 153eec85 without a coordination note."
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0061-nonparams-type-positions-keep-junk-arm-text-silent.md:1139-1149
  - tests/schema-body-nontype-text-refusal.test.ts:942-954
  - tests/schema-body-nontype-text-refusal.test.ts:973-991
  - docs/bugs/0184-union-arm-literal-lowers-empty-schema.md:1263-1265
  - docs/bugs/0184-union-arm-literal-lowers-empty-schema.md:1374-1384
  - vitest.config.ts:4-12
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20261028153325
reported_by: lens-d10-verification (openai/gpt-6.1-sol)
date: 2026-10-28
---

# Bug 0061's byte-for-byte mixed-union pin was changed by 153eec85 without a coordination note.

## Observation
Bug 0061's fixed §Fix says the mixed literal union `"x" | integer` is pinned byte-for-byte as an `anyOf` containing a permissive literal arm. The cited witness table now expects a `const` arm instead, at both its field and alias instantiations. Its comment and bug 0184's fix record expressly attribute that byte change to bug 0184, commit 153eec85. Bug 0061 contains no coordination note recording this re-pin.

## Evidence
Claim, `docs/bugs/0061-nonparams-type-positions-keep-junk-arm-text-silent.md:1139-1149`:
```text
- §Fix constraint 3, grammar-admitted traffic keeps its bytes AND its silence,
  pinned byte-for-byte at both positions: `array<{b: string}>` →
  `{"type":"array","items":{}}`; `"x" | integer` →
  `{"anyOf":[{},{"type":"integer"}]}`; `{b: string}` →
  `{"$ref":"#/$defs/__inline_0aac28182e71617b"}`; `"low" | "high"` →
  `{"type":"string","enum":["low","high"]}`; `string | integer` →
  `{"type":["string","integer"]}`; `"x"` → `{"const":"x"}`; and `{}` keeps
  `theta/parse/empty-schema-body` ALONE — declined, never refused. The
  `__inline_<slug>` names are minted by hand-written canonical-form SHA-256
  oracles with their own honesty cells; `schemaSlug` is deliberately not
  imported.
```

Current e2 value and authority, `tests/schema-body-nontype-text-refusal.test.ts:943-954`:
```ts
  // The literal ARM lowers schema-subset.md:79's `{ "const": "x" }` and the
  // primitive arm keeps `{"type":"integer"}` (bug 0184 §Fix, the authority that
  // moved this row's bytes; before it the arm was the permissive `{}`). Bug 0061
  // §Fix constraint 4's claim over this row — that it keeps its SILENCE at both
  // positions — is unchanged and is the row's subject.
  [
    "e2 (mixed literal union)",
    '"x" | integer',
    { anyOf: [{ const: "x" }, { type: "integer" }] },
    [],
    [],
  ],
```

Both position instantiations are explicit at :973-978:
```ts
describe("bug 0061 (e) — grammar-admitted catch-all traffic keeps its bytes (except e2, bug 0184 §Fix) and its silence", () => {
  for (const [label, typeSource, fragment, hoisted, expectedCodes] of ADMITTED_ROWS) {
    for (const position of ["field", "alias"] as const) {
      it(`GREEN (${label}, ${position}): \`${typeSource}\` is unchanged`, () => {
        const cell = `${label} (${position})`;
        const read = readAt(cell, position, typeSource);
```

The lowering assertion consumes that value at :985-991:
```ts
        expect(
          read.lowered,
          `${cell}: the emission the table prescribes, byte-for-byte. The table is the source of ` +
            `truth for these bytes; row \`e2\`'s were re-derived under bug 0184 §Fix (a literal ` +
            `ARM of a MIXED union lowers schema-subset.md:79's \`const\`, not the permissive ` +
            `\`{}\`), and every other row's are bug 0061 §Fix constraint 4's own`,
        ).toEqual(position === "field" ? sField(fragment) : fragment);
```

Successor confirmation, `docs/bugs/0184-union-arm-literal-lowers-empty-schema.md:1263-1265`:
```text
  6. `tests/schema-body-nontype-text-refusal.test.ts` row `e2`
     (`"x" | integer`, `field` AND `alias`) — subject: the SILENCE. Preserved
     and still asserted first (`[]` diagnostics); the bytes assertion moved.
```

The successor's note inventory, :1374-1384, names records other than 0061:
```text
- **Discharge notes appended** (append-only, nothing deleted):
  [0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md)'s
  `## Fix (0.102.0)` *Residuals* item 1 — this filing's origin — marked
  discharged here, with its `RED (first-match-wins)` premise cell's fate
  stated; and §Fix constraint 3's authority notes on
  [0043](./0043-union-nonprimitive-arm-lowers-permissive.md),
  [0055](./0055-literal-union-lowering-omits-type-string-vs-subs1.md) and
  [0056](./0056-params-literal-sublanguage-absent-lowers-permissive.md)
  §Non-goals (each bullet's disposition moved, by this §Fix, with the cells
  named), plus a COORDINATION note on
  [0098](./0098-nonstring-literal-union-emission-unspecified.md) §Non-goals.
```

Searches run this session:
- `git log --format='%h %s' -S'bug 0184 §Fix, the authority' -- tests/schema-body-nontype-text-refusal.test.ts` — 1 commit hit, 153eec85 (bug 0184, v0.115.0). Its diff changes e2's expected literal arm from `{}` to `{ const: "x" }` and adds the quoted authority comment.
- `grep -cE '0184|153eec85' docs/bugs/0061-nonparams-type-positions-keep-junk-arm-text-silent.md` — 0 matching lines. Its appended notes were read and do not coordinate this change.

The witness is included by `vitest.config.ts:4-12`, not under its excluded `tests/live/**` subtree. It is current default-suite proof under the brief's preflight premise; no tests were run.

## Why this is a problem
D10's flipped-pin rule distinguishes a witness that still resolves by name from one that still asserts the cited observable. The diagnostic-silence observable survives here, but the record explicitly also claims byte-for-byte preservation and spells the old bytes. That part of the claim is no longer what e2 proves, and the record does not disclose its supersession.

## Suggested direction (non-binding, optional)
A dated coordination note can identify 153eec85 / bug 0184 and e2's current field/alias byte assertions while preserving the historical fix text and its still-valid silence claim.

## False-positive check
The claim was re-read immediately before filing. The e2 table value and its field and alias assertion branches were inspected separately; this is not an inference from a renamed test or a source implementation. Both the cell comment and the successor record confirm the byte flip, and both explicitly preserve diagnostic silence. No assertion about the other examples in the quoted claim is being challenged. The commit/intake/issue checks found no existing finding for this record's e2 pin. Other 0061 pin changes originate in different commits and are not bundled into this finding. The finding is about witness decay, not gate-enforced citation syntax, coverage, or the correctness of the changed lowering.

## Triage
verdict: confirmed — Both searches reproduce; 153eec85 and the current e2 comment confirm the byte flip at field and alias, with no coordination note in 0061, deliberate no-note ruling in 0184, or duplicate found. Append verbatim (\n\n denotes a blank line): "### Coordination note — 2026-10-28, bug 0184 (0.115.0)\n\nCommit 153eec85, bug 0184's fix (0.115.0), re-pinned the e2 mixed-literal-union cells at both field and alias positions in tests/schema-body-nontype-text-refusal.test.ts: `"x" | integer` now asserts `{"anyOf":[{"const":"x"},{"type":"integer"}]}` (inside the field enclosure at the field position), while both cells still assert no diagnostics. The wording above stands as a dated record; current disposition: docs/bugs/0184-union-arm-literal-lowers-empty-schema.md." (triage: claude-opus-5-5)
