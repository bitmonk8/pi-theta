---
id: PTQ-1298
title: mode and bind_context frontmatter arms are a renamed-only copy
lens: D4
status: open
verdict: confirmed
locations:
  - src/parser/frontmatter.ts:449-464
  - src/parser/frontmatter.ts:540-555
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260922211400
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-22
---

# mode and bind_context frontmatter arms are a renamed-only copy

## Observation
`collectRecognisedFields` in `src/parser/frontmatter.ts` handles the `mode:`
key at lines 449-463 and the `bind_context:` key at lines 540-554 with two
arms that are identical except for the field names and the non-scalar kind
helper they call. The `bind_context:` arm's own comment says it is
"mirroring the `mode:` arm" (bug 0297). Both arms implement the same
"present non-scalar value is present-but-bad, not absent" protocol: they set
a presence flag, capture a scalar string value, or record a bounded kind
token for a non-scalar value.

## Evidence
**Copy 1 — `mode:` arm**
```ts
src/parser/frontmatter.ts:449-464
      if (key === "mode") {
        // A present non-scalar `mode:` value is present-but-bad, not absent:
        // record presence so the required-mode arm keys on genuine absence, and
        // the value's bounded kind token so the unknown-mode-value arm can name
        // the shape. `modeValueKind` is set for exactly the non-scalar present
        // case (where `modeValue` stays undefined).
        fields.modePresent = true;
        if (isScalar(item.value)) {
          fields.modeValue = String(item.value.value);
        } else {
          fields.modeValueKind = renderNonScalarModeKind(item.value);
        }
        fields.modeRange = valueRange;
        continue;
      }
      if (key === "model") {
```

**Copy 2 — `bind_context:` arm**
```ts
src/parser/frontmatter.ts:540-555
      if (key === "bind_context") {
        // A present non-scalar `bind_context:` value is present-but-bad, not
        // absent: record presence so the unknown-value arm keys on presence, and
        // the value's bounded kind token so it can name the shape (bug 0297,
        // mirroring the `mode:` arm). `bindContextValueKind` is set for exactly
        // the non-scalar present case (where `bindContextValue` stays undefined).
        fields.bindContextPresent = true;
        if (isScalar(item.value)) {
          fields.bindContextValue = String(item.value.value);
        } else {
          fields.bindContextValueKind = renderNonScalarBindContextKind(item.value);
        }
        fields.bindContextRange = valueRange;
        continue;
      }
      if (key === "tools") {
```

**Diff verdict:** renamed-only. The only differences are the field identifiers
(`mode*` vs `bindContext*`), the key literal (`"mode"` vs `"bind_context"`),
and the helper (`renderNonScalarModeKind` vs `renderNonScalarBindContextKind`).
The structural statements, comments, and invariant wording are otherwise
identical.

**Clone-map group:** `G035` — 67 tokens — renamed-only (7) —
`src/parser/frontmatter.ts:449-464, src/parser/frontmatter.ts:540-555`.

## Why this is a problem
This is load-bearing duplication, not incidental similarity. Both arms
implement the same recognised-key/unrecognised-value split from the
frontmatter field contract, and the downstream validation in
`checkRecognisedFields` relies on the same invariants for both fields:
`modeValue`/`bindContextValue` is defined for a scalar, and
`modeValueKind`/`bindContextValueKind` is defined for a non-scalar. If one arm
were updated (for example, to change how non-scalar values are rendered or to
treat a new YAML node shape as present-but-bad) and the other were not, the
two fields would disagree on whether a non-scalar value counts as present and
on the `<value>` token shown in the out-of-range diagnostic. The spec treats
`mode:` and `bind_context:` as separate fields, but the protocol for handling
a present-but-unrecognised value is the same.

## Suggested direction (non-binding, optional)
A natural shared home is a small helper in `src/parser/frontmatter-yaml.ts`
that, given a YAML node, returns `{ present: true, scalar?: string, kind?:
string }` using the existing `renderNonScalarModeKind` / `renderNonScalarBindContextKind`
shape. `collectRecognisedFields` would call that helper for both `mode:` and
`bind_context:` rather than inlining the protocol twice. This keeps the
single-source-of-truth for the present-non-scalar protocol next to the other
frontmatter YAML rendering helpers.

## False-positive check
- Re-read both cited spans in the current `src/parser/frontmatter.ts` before
  filing; both copies are live code reached from `parseFrontmatter`.
- Verified the clone-map group `G035` against the actual line ranges; the
  excerpts above match the scanner's reported spans.
- Not a spec-normative vector table; the spec clause
  (`frontmatter-fields-a.md`) describes the two fields independently and does
  not repeat this imperative protocol.
- Not in `tests/`; not generated code.
- The similarity is not merely incidental: the `bind_context:` comment
  explicitly states it mirrors the `mode:` arm, confirming the shared
  protocol.

## Triage
verdict: confirmed — both excerpts reproduce byte-exact at src/parser/frontmatter.ts:449-464 and :540-555 and an independent `clone-scan.mjs map --files` re-run lists exactly `G035 — 67 tokens — renamed-only (7) — frontmatter.ts:449-464, 540-555`; a manual diff shows the only differences are the `mode`/`bind_context` key literal, the `mode*`/`bindContext*` field names and the kind helper, with the seven statements (presence flag, isScalar → String(value) else kind token, range, continue) and the invariant wording otherwise identical; both copies are live (collectRecognisedFields' sole caller parseFrontmatter at :1082, the four fields flow out at :676/:683 to checkRecognisedFields, and tests/b0297-bind-context-bind-model-nonscalar.test.ts exercises the non-scalar arm); not incidental — the bind_context comment states it mirrors the mode arm (bug 0297) and the two kind helpers it calls (frontmatter-yaml.ts:210-214 renderNonScalarModeKind, :227-231 renderNonScalarBindContextKind) are themselves byte-identical bodies each documented as mirroring the other, so a change to the present-non-scalar protocol on one side silently leaves the other behind (the drift risk the filing names); not a spec vector table (frontmatter-fields-a.md describes the two fields, not this imperative protocol); not a duplicate — PTQ-1283 (open, D9) keys the whole 271-LOC collectRecognisedFields host as a breakdown and PTQ-0149 (resolved, D2) was the helpers' dead isMap arm, neither names this two-arm clone, though the fixer should sequence against PTQ-1283's Seam A and may fold the identical kind-helper pair into the same shared helper; sites: 2 accurate (the bind_echo arm at :519-532 reuses the kind helper but is a diverged three-way boolean/scalar/kind split, correctly not counted) (triage: claude-fable-5-1)
