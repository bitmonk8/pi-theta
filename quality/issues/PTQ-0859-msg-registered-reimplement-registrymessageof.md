---
id: PTQ-0859
title: both in-scope files' message-template lookup functions reimplement the exported registryMessageOf instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/member-access-declared-field-type.test.ts:162-179
  - tests/match-pattern-increment-decrement.test.ts:120-128
  - tests/helpers/load-row-harness.ts:62-81
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# both in-scope files' message-template lookup functions reimplement the exported registryMessageOf instead of importing it

## Observation
`tests/helpers/load-row-harness.ts` exports `registryMessageOf(registry, registryPath, code, fills)`, which looks up a registry row's *Message* template via `registryMessage`, asserts it is defined (naming the registry page in the failure), then for each `[placeholder, value]` pair asserts the placeholder is present before replacing it, and returns the rendered string. `tests/member-access-declared-field-type.test.ts` declares its own module-scope `msg(code, fills)` that performs the identical lookup-assert-fill sequence over the same `registryMessage`/`REGISTRY` pairing, using local `throw` in place of `expect().toBeDefined()`/`.toContain()`. `tests/match-pattern-increment-decrement.test.ts` declares a smaller `registered(code)` that reimplements the first half of the same sequence (lookup, then throw naming the registry page when the template is undefined), leaving only the placeholder-fill step to its own caller-side `.replaceAll`. Neither file imports `registryMessageOf`.

## Evidence

tests/helpers/load-row-harness.ts:62-81 (the canonical helper):
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

tests/member-access-declared-field-type.test.ts:162-179 (the same lookup-assert-fill sequence, redeclared locally with `throw` instead of `expect`):
```ts
function msg(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no Message row for ${code} — the DIAG-4 column (diagnostic-shape.md:74) is this file's only oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  let out = template;
  for (const [placeholder, value] of fills) {
    if (!out.includes(placeholder)) {
      throw new Error(
        `harness: the ${code} Message template does not carry ${placeholder}; template=${JSON.stringify(template)}`,
      );
    }
    out = out.replace(placeholder, value);
  }
  return out;
}
```

tests/match-pattern-increment-decrement.test.ts:120-128 (the lookup-and-throw half of the same sequence, minus the fill loop, which its callers `opMessage`/`capMessage` perform separately via `.replaceAll`):
```ts
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PARSE_PAGE} carries no Message row for ${code} — the DIAG-4 column is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}
```

Exact search run: `grep -rn "^function msg(code: string" tests/*.test.ts` returns 55 declarations across the suite (one of which is `tests/member-access-declared-field-type.test.ts:162`); `grep -rn "^function registered(code: string" tests/*.test.ts` returns exactly `tests/match-pattern-increment-decrement.test.ts:120`. Neither in-scope file's import list (both read at the top of each file) names `registryMessageOf` or `tests/helpers/load-row-harness`.

## Why this is a problem
Both in-scope files re-derive the same "fetch the row's Message template, fail loudly naming the registry page if absent, fail loudly naming the placeholder if a fill target is missing, substitute" sequence that `registryMessageOf` already performs and already exports, with no behavioural difference apart from `throw` vs `expect` as the failure mechanism. `tests/fn-param-list-unclosed.test.ts:132-134` in the same repo already imports `registryMessageOf` and wraps it in a one-line local `msg`, showing the thin-wrapper alternative is already in use elsewhere for the identical need.

## Suggested direction (non-binding, optional)
Both `msg` (member-access-declared-field-type) and `registered`+its callers' `.replaceAll` step (match-pattern-increment-decrement) could each become a one-line wrapper around the existing `registryMessageOf` import, following the pattern `tests/fn-param-list-unclosed.test.ts:132-134` already establishes.

## False-positive check
Gate-pin: neither file matches `*gate*.test.ts` or the named gate/census kin. Recording-double: `msg`/`registered` render static registry text; neither records calls nor witnesses a MUST-NOT condition, so the recording-double carve-out does not apply. Docs/bugs signature search: `grep -rln "registryMessageOf" docs/bugs/` → 0 hits, so no documented correct-reason red matches this shape; the local `msg`/`registered` throws are harness-failure guards, not intentionally-red assertions. Coverage-matrix/bug-doc citation search: `grep -n "member-access-declared-field-type\|match-pattern-increment-decrement" docs/reference/coverage-matrix.md` → 0 hits; both files are cited by name in docs/bugs/0136, 0190, 0191, 0192 (member-access-declared-field-type) and docs/bugs/0123 (match-pattern-increment-decrement) as witness suites, but none of those citations names the `msg`/`registered` lines specifically, and this finding proposes no merge, rename, or deletion of either file or any `it()` cell — only that the message-lookup helper function bodies could import the existing shared implementation. This is a code-duplication claim about test harness code, not a claim that any test should exist.

## Triage
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at the cited lines; a normalised diff (REGISTRY→registry, page literal→${registryPath}) of member-access-declared-field-type:163-178 `msg` against load-row-harness.ts:68-80 `registryMessageOf` differs only in `throw new Error` vs `expect(...).toBeDefined()/.toContain()` — same lookup→guard→per-placeholder-guard→replace sequence and return; match-pattern-increment-decrement:120-128 `registered` is the lookup+guard half with its two callers (:164 opMessage, :174 capMessage) doing the fill via `.replaceAll`, equivalent to `.replace` here since `<op>`/`<name>` each occur once in their rows; neither file imports `registryMessageOf`/`load-row-harness` (47 other test files do; fn-param-list-unclosed:132-134 is the one-line wrapper precedent as claimed); both locations under tests/, D7 boilerplate-duplication class, no gate/recording-double/red-signature carve-out (docs/bugs `registryMessageOf` → 0, coverage-matrix cite → 0, no merge/rename/delete proposed). Evidence correction, immaterial to the two-site claim: `grep -rn "^function registered(code: string" tests/*.test.ts` returns 22 declarations, not "exactly" this one, and the `msg` count is 57 not 55. Not a duplicate: resolved PTQ-0634 migrated these same two files' REGISTRY read to readRegistry and explicitly left `msg`/`registered` local (a different root cause), and the house tracks this msg→registryMessageOf pattern per disjoint file set (PTQ-0495/0616/0539/0567 all fixed on other pairs; open PTQ-0747/0430/0431 cite other files) with no open repo-wide canonical, so this pair is an untracked slice (triage: claude-fable-5-1)
