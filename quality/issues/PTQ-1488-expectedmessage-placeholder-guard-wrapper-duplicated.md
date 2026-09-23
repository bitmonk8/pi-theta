---
id: PTQ-1488
title: nested-tools-entry-containment.test.ts and tools-entry-containment.test.ts each redeclare a byte-identical expectedMessage placeholder-guard wrapper
lens: D7
status: open
verdict: confirmed
locations:
  - tests/nested-tools-entry-containment.test.ts:81-91
  - tests/tools-entry-containment.test.ts:70-80
  - tests/helpers/registry-oracle.ts:171-182
sites: 2
fix_scope: module
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# nested-tools-entry-containment.test.ts and tools-entry-containment.test.ts each redeclare a byte-identical expectedMessage placeholder-guard wrapper

## Observation
Both `tests/nested-tools-entry-containment.test.ts` and `tests/tools-entry-containment.test.ts` import the same `expectedMessage` helper from `tests/helpers/registry-oracle.ts` under the alias `filledRegistryMessage`, then each locally declares its own function also named `expectedMessage` that calls `filledRegistryMessage` and asserts the result carries no unsubstituted `<…>` placeholder before returning it. The two local declarations are byte-identical apart from line position.

## Evidence
tests/nested-tools-entry-containment.test.ts:81-91:
```ts
/** Source a code's registered *Message* template and fill its `<…>` placeholders. */
function expectedMessage(
  code: string,
  subs: Readonly<Record<string, string>>,
): string {
  const message = filledRegistryMessage(REGISTRY, code, subs);
  expect(
    message,
    `${code}: an unsubstituted <…> placeholder remains — the registry row's ` +
      "Message template changed shape and this file's substitutions are stale",
  ).not.toMatch(/<[a-z]+>/);
  return message;
}
```

tests/tools-entry-containment.test.ts:70-80:
```ts
function expectedMessage(
  code: string,
  subs: Readonly<Record<string, string>>,
): string {
  const message = filledRegistryMessage(REGISTRY, code, subs);
  expect(
    message,
    `${code}: an unsubstituted <…> placeholder remains — the registry row's ` +
      "Message template changed shape and this file's substitutions are stale",
  ).not.toMatch(/<[a-z]+>/);
  return message;
}
```

`diff` of the two function bodies shows only a doc-comment line present in one file and a blank-line/return-statement position difference — the executable statements are identical. tests/helpers/registry-oracle.ts:171-182 exports the underlying `expectedMessage(registry, code, subs)` that both files import (aliased `filledRegistryMessage`); it performs the substitution loop but does not itself assert the no-leftover-placeholder invariant, which is the one addition both call sites separately re-add.

Search: `grep -rn "expectedMessage as filledRegistryMessage" tests/*.test.ts` returns exactly these two files.

## Why this is a problem
The same four-statement guard — call the shared substitution helper, then assert no `<…>` token survives, then return — is declared twice under the identical local name `expectedMessage`, shadowing the imported alias's purpose in both files rather than being pulled once into a shared helper. A reader who edits the guard's wording or its regex in one file (as bug fixes to this file's own conventions do routinely) has no signal that the identical function exists a second time in a sibling `tools:`-entry-containment file covering the neighbouring bug.

## Suggested direction (non-binding, optional)
Exporting this placeholder-guard wrapper from `tests/helpers/registry-oracle.ts` alongside the `expectedMessage` it already wraps is the natural shared home both call sites already import from.

## False-positive check
Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin patterns. Recording-double check: this wrapper is a message-string assertion helper, not a call-recording double, so the negative-witness carve-out does not apply. docs/bugs/ signature search: `grep -rn "unsubstituted <" docs/bugs/*.md` returned no hits. Coverage-matrix/bug-doc citation search: `grep -rn "function expectedMessage" docs/reference/coverage-matrix.md docs/bugs/*.md` returned no hits, so neither declaration is cited by name in a pinning document; no merge, rename, or deletion of either test is proposed. `quality/issues/PTQ-1375-expectedmessage-redeclared-despite-import.md` was read in full: it covers a different pair of files (`theta-callable-call-arity.test.ts`, `tool-arg-parse-checks.test.ts`) whose local `expectedMessage` hand-rolls the substitution loop from the raw `registryMessage` import WITHOUT importing the canonical `expectedMessage` helper at all — the opposite defect from this finding, where both cited files DO import the canonical helper (aliased) and duplicate only the placeholder-guard wrapped around it. The two findings do not share a root cause and this is not a duplicate.

## Triage
verdict: confirmed — independently re-verified: the two local `expectedMessage` wrappers reproduce at nested-tools-entry-containment.test.ts:81-91 and tools-entry-containment.test.ts:69-79 and `diff` of those ranges is byte-identical INCLUDING the doc comment (the filing's "doc-comment line present in one file" remark is the only inaccuracy and cuts in the filing's favour); `grep -rln "expectedMessage as filledRegistryMessage" tests/` hits exactly these two files; registry-oracle.ts:171-182 `expectedMessage` does the substitution loop with no leftover-`<…>` assertion while the same module already asserts via `expect` in `descriptorFragment` (:150) so a guarded export is in-grain; both locals live (2 and 4 call sites); tests/ only, no gate test, 0 docs/bugs and 0 coverage-matrix hits, no merge/rename/delete proposed; NOT a duplicate of resolved PTQ-1329 — that ticket's root cause (hand-rolled `registryMessage`+`replaceAll` loop) was removed in 245781a6, whose fix note says it deliberately kept "each file's unsubstituted-placeholder assertion as the thin local wrapper", so this candidate names the residual that fix left behind, and open PTQ-1375 covers different files with the pre-fix defect; D7 copy-paste helper class with a mechanical dedupe (export the guarded wrapper from the module both files already import) (triage: claude-fable-5-1)
