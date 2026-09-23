---
id: PTQ-1322
title: fn-param-annotation-optional / fn-param-list-unclosed each redeclare a local `FM`/`theta(body, path)` pair that is byte-identical to e2e-s1's exported `parsePromptBody`
lens: D7
status: open
verdict: confirmed
locations:
  - tests/fn-param-annotation-optional.test.ts:345-351
  - tests/fn-param-list-unclosed.test.ts:159-165
  - tests/helpers/e2e-s1.ts:66-73
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# fn-param-annotation-optional / fn-param-list-unclosed each redeclare a local `FM`/`theta(body, path)` pair that is byte-identical to e2e-s1's exported `parsePromptBody`

## Observation
Both in-scope files declare a private constant `FM = "---\nmode: prompt\n---\n"` and a private wrapper `function theta(body: string, path = "test.theta"): ThetaDocument { return parseDoc(FM + body, path); }`, with the same doc-comment wording in both files. `tests/helpers/e2e-s1.ts` already exports `FRONTMATTER`/an internal `FM` built from it and a function `parsePromptBody(body: string, path = "test.theta"): ThetaDocument` at lines 66-73 whose body is `return parseDoc(FM + body, path);` — the same frontmatter text, the same parameter list, the same default, and the same one-line body. `parsePromptBody` is already imported and used by four other test files.

## Evidence
tests/fn-param-annotation-optional.test.ts:345-351:
```ts
/** Frontmatter for every row — occupies lines 1–3, so body line 1 is file line 4. */
const FM = "---\nmode: prompt\n---\n";

/** Parse `body` under the standard frontmatter, at `path` (default `.theta`). */
function theta(body: string, path = "test.theta"): ThetaDocument {
  return parseDoc(FM + body, path);
}
```

tests/fn-param-list-unclosed.test.ts:159-165 (byte-identical to the excerpt above, including the doc comments):
```ts
/** Frontmatter for every row — occupies lines 1–3, so body line 1 is file line 4. */
const FM = "---\nmode: prompt\n---\n";

/** Parse `body` under the standard frontmatter, at `path` (default `.theta`). */
function theta(body: string, path = "test.theta"): ThetaDocument {
  return parseDoc(FM + body, path);
}
```

tests/helpers/e2e-s1.ts:66-73, the canonical helper already exported:
```ts
/** Frontmatter for every `.theta` row — occupies lines 1–3, body starts at 4. */
export const FRONTMATTER: readonly string[] = ["---", "mode: prompt", "---"];
const FM = `${FRONTMATTER.join("\n")}\n`;

/** Parse `body` as a `.theta` under the standard frontmatter. */
export function parsePromptBody(body: string, path = "test.theta"): ThetaDocument {
  return parseDoc(FM + body, path);
}
```

Exact search: `grep -rn 'function theta(body: string, path = "test.theta"): ThetaDocument' tests/*.ts` → 3 hits (the two in-scope files plus `tests/fn-param-not-identifier.test.ts:232`, out of this review's scope). `grep -rl "parsePromptBody" tests/*.ts` → 4 hits (`tests/division-result-type-number.test.ts`, `tests/fn-param-name-case.test.ts`, `tests/fn-param-name-reserved-keyword.test.ts`, `tests/modulo-zero-result-type-number.test.ts`), confirming the helper is already the adopted convention among sibling `fn-param-*` files, not a dead export.

## Why this is a problem
Both in-scope files' own `FM`/`theta` produce the exact string `parsePromptBody` already produces from the exact same default path and the exact same construction (`parseDoc(FM + body, path)`), under a name (`theta`) that also collides conceptually with `e2e-s1.ts`'s own exported `theta(...frontmatterLines)` (a different, variadic-frontmatter builder at e2e-s1.ts:72) — two different meanings for the identifier `theta` exist in the same helper family. This is the "Boilerplate duplication" class: a harness sequence (frontmatter constant + parse wrapper) is retyped rather than imported, in a helper family (`tests/helpers/e2e-s1.ts`) that already carries it and that sibling files in the same `fn-param-*` group already import it from.

## Suggested direction (non-binding, optional)
`parsePromptBody` (tests/helpers/e2e-s1.ts) is the existing shared home; the two in-scope files' local `FM`/`theta` pair is what a later pass would point at it instead of retyping.

## False-positive check
- Gate-pin carve-out: neither file matches `*gate*.test.ts` or the named kin; not applicable.
- Recording-double carve-out: no recording double or negative witness is involved; not applicable.
- docs/bugs/ signature search: `grep -rl "function theta(body: string, path" docs/bugs/*.md` → 0 hits; no documented correct-reason red covers this wrapper.
- coverage-matrix/bug-doc citation search: `grep -n "fn-param-annotation-optional\|fn-param-list-unclosed" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of either file or any `it()`/`describe()`, only that the local `FM`/`theta` pair could be replaced by the existing import.
- Coverage-drift check: this is about a repeated helper DEFINITION, not a missing test path; every copy is already exercised by its own file's tests.
- Prior-filing search: the already-filed `theta`/fixture-builder tickets in scope for this repo (e.g. PTQ-0606, the `theta(...lines)`/`invokeCaller`/`callableCaller` production-load trio) cite a different function shape (a raw-line joiner for planted `.pi/theta/` workspaces); none of the prior filings' excerpts match this `FM`/`parsePromptBody`-shaped wrapper.

## Triage
<!-- appended by triage -->
verdict: confirmed — both excerpts reproduce byte-for-byte at fn-param-annotation-optional:345-351 and fn-param-list-unclosed:159-165, and e2e-s1's `FRONTMATTER`/`FM`/`parsePromptBody(body, path = "test.theta")` matches the cited text (now at e2e-s1.ts:126-133, line drift only) with the identical `parseDoc(FM + body, path)` body; stated searches reproduce exactly (3 `function theta(body…)` hits incl. out-of-scope fn-param-not-identifier:232; `parsePromptBody` imported by the 4 named siblings; docs/bugs and coverage-matrix greps → 0); both files already import `parseDoc`/`topKinds` from e2e-s1 and not its variadic `theta`, so the swap is a pure import change with no test merge/rename/delete; not a duplicate — PTQ-0592 (fixed) covered the name-case/reserved-keyword pair (hence their `parsePromptBody` adoption), PTQ-0555/0782/0887/1074/0606 cite other files and other builder shapes, and REVIEW_LOG:165/412 explicitly left this FM/theta idiom unfiled, so no existing row tracks these two sites (triage: claude-fable-5-1)
