---
id: PTQ-0868
title: subagent-invoke-nonfinite-return-refusal.test.ts retypes the registry-template pointer-message composition algorithm two siblings already carry
lens: D7
status: open
verdict: confirmed
locations:
  - tests/subagent-invoke-nonfinite-return-refusal.test.ts:171-193
  - tests/subagent-envelope-nonfinite-ok-refusal.test.ts:236-280
  - tests/subagent-envelope-result-carriage.test.ts:368-392
sites: 3
fix_scope: module
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# subagent-invoke-nonfinite-return-refusal.test.ts retypes the registry-template pointer-message composition algorithm two siblings already carry

## Observation
`tests/subagent-invoke-nonfinite-return-refusal.test.ts` declares
`expectedRefusalMessage(pointer, value)`, which composes the bug-0180
non-representable-value refusal message from the registry row's `Message`
template by locating the `<value>` placeholder, splitting the template into
`head`/`tail`, stripping the trailing `": "` separator off `head` to get
`subject`, inserting an ` at <pointer>` segment when `pointer` is non-empty,
then rejoining `subject` + `location` + `": "` + `String(value)` + `tail`.
`tests/subagent-envelope-nonfinite-ok-refusal.test.ts` and
`tests/subagent-envelope-result-carriage.test.ts` — the child-side unit
witness and the parent-side result-carriage witness for the same bug — each
carry a function performing the identical `cut`/`head`/`tail`/`subject`/
`location` arithmetic over the identical template shape, ending in the
identical `` `${subject}${location}${separator}${String(value)}${tail}` ``
return expression. None of the three imports this composition from a shared
module; only the underlying `REGISTRY` read is centralised
(`tests/helpers/registry-oracle.ts`).

## Evidence
tests/subagent-invoke-nonfinite-return-refusal.test.ts:171-193:
```ts
function expectedRefusalMessage(pointer: string, value: number): string {
  const template = REFUSAL_TEMPLATE;
  if (template === undefined) {
    return (
      `<unavailable: docs/spec_topics/diagnostics/code-registry-runtime.md carries no Message ` +
      `row for ${REFUSAL_CODE}, and DIAG-4 makes that column the only source for this string>`
    );
  }
  const cut = template.indexOf(VALUE_PLACEHOLDER);
  const head = cut < 0 ? "" : template.slice(0, cut);
  const separator = ": ";
  if (cut < 0 || !head.endsWith(separator)) {
    return (
      `<unavailable: the ${REFUSAL_CODE} registry Message template ${JSON.stringify(template)} ` +
      `does not carry ${VALUE_PLACEHOLDER} after a ${JSON.stringify(separator)} separator, so ` +
      `the ' at <pointer>' segment has no anchored insertion point>`
    );
  }
  const tail = template.slice(cut + VALUE_PLACEHOLDER.length);
  const subject = head.slice(0, head.length - separator.length);
  const location = pointer.length > 0 ? ` at ${pointer}` : "";
  return `${subject}${location}${separator}${String(value)}${tail}`;
}
```

tests/subagent-envelope-nonfinite-ok-refusal.test.ts:236-280 (re-read
immediately before filing — the same halving/rejoining arithmetic, split
across `refusalTemplate()` and `expectedRefusalMessage()`):
```ts
function refusalTemplate(): string {
  const template = registryMessage(REGISTRY, REFUSAL_CODE) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `precondition unmet: docs/spec_topics/diagnostics/code-registry-runtime.md carries no ` +
        `Message row for ${REFUSAL_CODE} — DIAG-4 makes that column the normative string and ` +
        `every message assertion here sources its expectation from it rather than from copied ` +
        `prose, so the row is part of the change under test`,
    );
  }
  if (!template.includes(VALUE_PLACEHOLDER)) {
    throw new Error(
      `precondition unmet: the ${REFUSAL_CODE} registry Message template ` +
        `${JSON.stringify(template)} does not carry the ${VALUE_PLACEHOLDER} placeholder the ` +
        `refused value fills`,
    );
  }
  return template;
}

function expectedRefusalMessage(pointer: string, value: number): string {
  const template = refusalTemplate();
  const cut = template.indexOf(VALUE_PLACEHOLDER);
  const head = template.slice(0, cut);
  const tail = template.slice(cut + VALUE_PLACEHOLDER.length);
  const separator = ": ";
  if (!head.endsWith(separator)) {
    throw new Error(
      `precondition unmet: the ${REFUSAL_CODE} registry Message template ` +
        `${JSON.stringify(template)} does not separate its subject from ${VALUE_PLACEHOLDER} ` +
        `with ${JSON.stringify(separator)}, so the ' at <pointer>' segment has no anchored ` +
        `insertion point`,
    );
  }
  const subject = head.slice(0, head.length - separator.length);
  const location = pointer.length > 0 ? ` at ${pointer}` : "";
  return `${subject}${location}${separator}${String(value)}${tail}`;
}
```

tests/subagent-envelope-result-carriage.test.ts:368-392 (re-read immediately
before filing — a third copy of the same arithmetic under a third name):
```ts
function nonRepresentableMessage(pointer: string, value: number): string {
  const template = registryMessage(REGISTRY, SUBAGENT_RETURN_VALUE_NOT_REPRESENTABLE_CODE) as
    | string
    | undefined;
  const separator = ": ";
  if (template === undefined || !template.includes(VALUE_PLACEHOLDER)) {
    throw new Error(
      `precondition unmet: docs/spec_topics/diagnostics/code-registry-runtime.md carries no ` +
        `usable Message row for ${SUBAGENT_RETURN_VALUE_NOT_REPRESENTABLE_CODE} — DIAG-4 makes ` +
        `that column the only source for the refusal string this file asserts. Observed ` +
        `template: ${JSON.stringify(template)}`,
    );
  }
  const cut = template.indexOf(VALUE_PLACEHOLDER);
  const head = template.slice(0, cut);
  const tail = template.slice(cut + VALUE_PLACEHOLDER.length);
  if (!head.endsWith(separator)) {
    throw new Error(
      `precondition unmet: the ${SUBAGENT_RETURN_VALUE_NOT_REPRESENTABLE_CODE} registry Message ` +
        `template ${JSON.stringify(template)} does not separate its subject from ` +
        `${VALUE_PLACEHOLDER} with ${JSON.stringify(separator)}, so the ' at <pointer>' segment ` +
        `has no anchored insertion point`,
    );
  }
  const subject = head.slice(0, head.length - separator.length);
  const location = pointer.length > 0 ? ` at ${pointer}` : "";
  return `${subject}${location}${separator}${String(value)}${tail}`;
}
```

Search performed: `grep -rn "const location = pointer.length > 0" tests/*.test.ts` → exactly these 3 files. `grep -n "location\|subject\|separator" tests/helpers/registry-oracle.ts` → 0 hits; `registry-oracle.ts`'s own header states it centralises only the four-shard `REGISTRY` read and that "each file's own `registryMessageOf`/`registryRowOf`-shaped reader … stays local" — the pointer-composition arithmetic itself is not part of what it exports.

## Why this is a problem
All three files are bug-0180 witnesses for the SAME registered code
(`theta/runtime/subagent-return-value-not-representable`) and the SAME
registry `Message` template shape (subject + optional ` at <pointer>` +
`": "` + `<value>` + tail), and each retypes the identical five-line
placeholder-split/separator-strip/rejoin arithmetic rather than importing it
once. A change to the template's shape (e.g. a different separator, or the
pointer segment moving before the subject) would have to be re-derived
correctly in three places to keep all three witnesses meaningful together.

## Suggested direction (non-binding, optional)
A `tests/helpers/`-hosted function taking a registry template string, a
pointer and a value and returning the composed message (the outer
missing-row / malformed-template handling — throw vs. unmatchable-marker —
staying a per-file decision, as the in-scope file's own comment explains its
choice) would sit beside `tests/helpers/registry-oracle.ts`, which all three
files already import from for the underlying `REGISTRY`/`registryMessage`
read.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the
  named gate kinds; the cited lines are a message-composition helper, not a
  pinned count or inventory.
- Recording-double check: not applicable — these are pure string-composition
  functions, not recording doubles or MUST-NOT witnesses.
- docs/bugs/ signature search: `grep -rl "subagent-return-value-not-representable\|0180" docs/bugs/0180*.md` confirms all three files are named witnesses of `docs/bugs/0180-invoke-return-nonfinite-number-mode-variance.md` by design (the in-scope file's own header names both siblings as its unit/parent-carriage counterparts) — the bug doc pins the SET of witnesses, not this specific composition-arithmetic duplication across them, and no merge/rename/delete of any of the three files or their `it()`s is proposed here.
- coverage-matrix/bug-doc citation search: `grep -n "subagent-invoke-nonfinite-return-refusal\|subagent-envelope-nonfinite-ok-refusal\|subagent-envelope-result-carriage" docs/reference/coverage-matrix.md` → 0 hits.
- Coverage check: the claim is about a repeated composition-function DEFINITION; each file's own suite already exercises its own copy against real registry text, so this is not a coverage-gap claim.
- Distinct from PTQ-0707 (fixed): PTQ-0707 covered `subagent-invoke-nonfinite-return-refusal.test.ts`'s re-parsing of the four-shard `REGISTRY` itself (now fixed — the file imports `REGISTRY` from `tests/helpers/registry-oracle.ts`); this finding's evidence is the separate pointer-message composition arithmetic layered on top of that shared read, unaddressed by that fix.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at the cited lines; the six-line `cut`/`head`/`tail`/`subject`/`location`/return composition core was extracted and diffed — byte-identical between subagent-envelope-nonfinite-ok-refusal.test.ts:255-282 and subagent-envelope-result-carriage.test.ts:368-394, and the in-scope file (:171-193) differs only by a defensive `cut < 0 ? "" :` guard on `head` that the following `cut < 0 ||` branch makes semantically equivalent; no tests/helpers module exports any pointer-composition (`grep "at \${pointer}" tests/helpers/ src/` → 0; registry-oracle.ts header scopes itself to the REGISTRY read only); all copies are live (4/19/8 call sites); D7 boilerplate-duplication inside tests/, none is a *gate* or tests/live file, 0 coverage-matrix hits, bug 0180 names the files as witnesses but no merge/rename/delete is proposed; not tracked — resolved PTQ-0707 covered only this file's REGISTRY re-parse, and PTQ-0583/0686/0687 name these files for unrelated harnesses. Two filing inaccuracies that do not refute the root cause: the stated grep actually returns FOUR files, not three — tests/subagent-return-depth-refusal.test.ts:368-394 carries a byte-identical fourth copy (`nonRepresentableMessage`, bug 0187 witness) that should be folded into the location list at acceptance (sites: 4); and the claim that all three files "already import from registry-oracle" is false — only the in-scope file does, the other two re-parse REGISTRY locally via tools/code-registry (a separate registry-oracle-reread class, not this finding). (triage: claude-fable-5-1)
