---
id: PTQ-0832
title: reservedMessage/unresolvedMessage locally reimplement the canonical registryMessageOf reader three times in one file
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/inline-slug-name-reservation.test.ts:142-150
  - tests/inline-slug-name-reservation.test.ts:418-423
  - tests/inline-slug-name-reservation.test.ts:970-978
  - tests/helpers/load-row-harness.ts:62-76
sites: 3
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# reservedMessage/unresolvedMessage locally reimplement the canonical registryMessageOf reader three times in one file

## Observation
tests/inline-slug-name-reservation.test.ts declares a module-level function
`reservedMessage` (:142-150) and, separately, a `describe`-scoped function
`unresolvedMessage` (:970-978), plus one more inlined copy of the same three
statements at :418-423. All three read a registry row's *Message* template via
`registryMessage(REGISTRY, <code>)`, assert its definedness with the identical
`` `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${code}` `` string, then fill the `<name>` placeholder.
tests/helpers/load-row-harness.ts already exports `registryMessageOf` (:62-76),
which performs the exact same read-assert-fill sequence — parameterised over
`registry`, `registryPath`, `code` and a `fills` list — with the same "DIAG-4
anchor" wording in its own assertion message.

## Evidence
tests/inline-slug-name-reservation.test.ts:142-150
```ts
function reservedMessage(name: string): string {
  const template = registryMessage(REGISTRY, CODE) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the ` +
      `Message row for ${CODE}`,
  ).toBeDefined();
  return (template as string).replace("<name>", name);
}
```

tests/inline-slug-name-reservation.test.ts:418-423 (same three-statement body,
inlined rather than called, immediately followed by an equality check on the
same `template`):
```ts
    const template = registryMessage(REGISTRY, CODE) as string | undefined;
    expect(
      template,
      `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the ` +
        `Message row for ${CODE}`,
    ).toBeDefined();
```

tests/inline-slug-name-reservation.test.ts:970-978 (second local function, same
shape, different code constant):
```ts
  function unresolvedMessage(name: string): string {
    const template = registryMessage(REGISTRY, UNRESOLVED_CODE) as string | undefined;
    expect(
      template,
      `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the ` +
        `Message row for ${UNRESOLVED_CODE}`,
    ).toBeDefined();
    return (template as string).replace("<name>", name);
  }
```

tests/helpers/load-row-harness.ts:62-76 — the canonical reader already
exported from this module:
```ts
export function registryMessageOf(
  registry: readonly RegistryRow[],
  registryPath: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
): string {
  const template = registryMessage(registry, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${registryPath} must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}
```

## Why this is a problem
`registryMessageOf`'s parameters (`registry`, `registryPath`, `code`, `fills`)
already cover every argument the three local sites vary (`REGISTRY` is the same
value both places import, `CODE`/`UNRESOLVED_CODE` map to the `code` parameter,
`<name>` maps to a single `fills` pair), and its assertion message is the exact
"DIAG-4 anchor" wording the local sites paraphrase, which is the signature of a
copy sourced from the same origin rather than independently written. The file
already imports from the sibling helper module tree (`REGISTRY` from
`./helpers/registry-oracle`), so the read-assert-fill sequence is reimplemented
three times inside one file instead of drawn once from
`tests/helpers/load-row-harness.ts`.

## Suggested direction (non-binding, optional)
`tests/helpers/load-row-harness.ts`'s `registryMessageOf` is the established
home for this read-assert-fill sequence; a caller here would pass `REGISTRY`,
`docs/spec_topics/diagnostics/code-registry-parse.md`, the relevant code
constant, and `[["<name>", name]]` in place of each local body.

## False-positive check
- Gate-pin: `tests/inline-slug-name-reservation.test.ts` does not match
  `*gate*.test.ts` or any named kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate).
- Recording-double: none of the three sites record calls for a "never called"
  witness; all three return a value read from the registry.
- docs/bugs/ signature search: `grep -rln "registryMessageOf\|reservedMessage\|unresolvedMessage" docs/bugs/` → 0 files; no open bug documents this duplication or gives a documented correct-reason rationale for the local copies.
- coverage-matrix/bug-doc citation search: `grep -n "inline-slug-name-reservation" docs/reference/coverage-matrix.md` → 0 hits. `docs/bugs/0040-inline-slug-def-namespace-not-reserved.md:445` does cite this file by name as its "Offline lock" witness ("45 tests" across groups (a)-(h)), pinning the file's test count and per-group behaviour — this finding proposes no change to any `it()`/`describe()` name, test count, or assertion outcome, only to where the three helper-body definitions live, so that pinned witness is unaffected.
- Prior-finding search: `grep -rl "reservedMessage\|registryMessageOf" quality/` shows no existing filing (open, resolved or intake) that names this file for this root cause; PTQ-0205 (resolved) already covers this file's separate `diagLines`/`diagCodes` duplication, a different helper pair, and is not re-filed here.
- Coverage check: the claim is about a repeated function DEFINITION, not a missing test path; all three sites are exercised by the tests that call them.

## Triage
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at tests/inline-slug-name-reservation.test.ts:142-150, :418-423 and :970-978 and the canonical at tests/helpers/load-row-harness.ts:62-76; every copy is live (reservedMessage called at :401, unresolvedMessage twice in group (h), the :418 inline copy sits inside test (a1) where a zero-fills registryMessageOf returns the same template for the following toBe(EXPECTED_TEMPLATE)); registry-oracle's 6-field RegistryRow is a structural superset of the helper's {code,message} so REGISTRY passes through and the hardcoded page path equals PARSE_REGISTRY_PATH; registryMessageOf is an exported, widely-imported helper (b0046/b0272-b0282/b0429/b0430/alias-sink/brace-* files) so the fix is a per-file migration, not a helper export; stated searches reproduce (docs/bugs → 0, coverage-matrix → 0, bug 0040:445 pins 45 tests by group and no it()/describe()/assertion change is proposed); not a gate file, no recording-double or red-test carve-out; dedupe clean — PTQ-0734/0412 name an unresolvedMessage in other files, and the PTQs naming this file cover different helpers (PTQ-0205 diagLines, PTQ-0425 ajv, PTQ-0474 the since-fixed REGISTRY read whose migration is exactly why only this message-reader residue remains); same D7 boilerplate-duplication class as ratified PTQ-0495/0539/0616, same-wave registryMessageOf siblings cite disjoint files (triage: claude-fable-5-1)
