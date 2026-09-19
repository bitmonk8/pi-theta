---
id: PTQ-1091
title: registry-oracle.ts itself hand-rolls the guard-then-substitute registry-Message idiom four separate ways instead of reusing its own imported registryMessageOf
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/helpers/registry-oracle.ts:99-118
  - tests/helpers/registry-oracle.ts:121-136
  - tests/helpers/registry-oracle.ts:143-172
  - tests/helpers/registry-oracle.ts:261-283
  - tests/helpers/load-row-harness.ts:62-91
sites: 4
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# registry-oracle.ts itself hand-rolls the guard-then-substitute registry-Message idiom four separate ways instead of reusing its own imported registryMessageOf

## Observation
`tests/helpers/registry-oracle.ts` imports `registryMessageOf` from `tests/helpers/load-row-harness.ts` and uses it exactly once (inside `loadRowMessage`, line 51-53). Elsewhere in the same file it hand-rolls the identical "read a registry row's Message template, guard its presence, substitute named placeholders, guard for a leftover unsubstituted placeholder" sequence four more times under four different names (`reservedKeywordFragment`, `registryFragment`, `registeredParseMessage`/`fillParseMessage`, `anchoredRegistryMessage`/`registryErrorLine`), each reading the same `registryMessage(...)` call directly instead of going through the file's own imported helper.

## Evidence
`tests/helpers/registry-oracle.ts:99-118` (`reservedKeywordFragment` — single hard-coded placeholder):
```ts
export function reservedKeywordFragment(keyword: string): string {
  const template = registryMessage(PARSE_REGISTRY, RESERVED_KEYWORD_CODE) as
    | string
    | undefined;
  expect(
    template,
    `${RESERVED_KEYWORD_CODE} has no registry row — the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  const withSlot = template as string;
  expect(
    withSlot,
    `${RESERVED_KEYWORD_CODE}: the registry row's Message template must carry the <keyword> slot this cell fills — the row changed shape`,
  ).toContain("<keyword>");
  const message = withSlot.replace("<keyword>", keyword);
  expect(
    message,
    `${RESERVED_KEYWORD_CODE}: the registry row's Message template grew a second unsubstituted placeholder this reader does not fill`,
  ).not.toMatch(/<[a-z]+>/);
  return `${RESERVED_KEYWORD_CODE}: ${message}`;
}
```

`tests/helpers/registry-oracle.ts:121-136` (`registryFragment` — the general N-placeholder sibling immediately below it):
```ts
export function registryFragment(code: string, substitutions: Readonly<Record<string, string>>): string {
  const template = registryMessage(PARSE_REGISTRY, code) as string | undefined;
  expect(
    template,
    `${code} has no registry row — the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  let message = template as string;
  for (const [key, value] of Object.entries(substitutions)) {
    message = message.replaceAll(`<${key}>`, value);
  }
  expect(
    message,
    `${code}: an unsubstituted placeholder remains — the registry row's Message template changed shape`,
  ).not.toMatch(/<[a-z]+>/);
  return `${code}: ${message}`;
}
```

`tests/helpers/registry-oracle.ts:143-172` (`registeredParseMessage` + `fillParseMessage` — a throw-based guard instead of `expect`, feeding `interpolateStrict`):
```ts
function registeredParseMessage(code: string): string {
  const template = registryMessage(PARSE_REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PAGE} carries no Message row for ${code} — the DIAG-4 column is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}
```

`tests/helpers/registry-oracle.ts:261-283` (`anchoredRegistryMessage` + `registryErrorLine` — an `expect`-based guard against the four-page `REGISTRY` instead of `PARSE_REGISTRY`, with an `error ` prefix on the return):
```ts
function anchoredRegistryMessage(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: the diagnostics code registry must carry the *Message* row for ${code}; ` +
      `without it every expected message in this file would be a restatement, which DIAG-4 bars`,
  ).toBeDefined();
  return template as string;
}

export function registryErrorLine(code: string, subs: ReadonlyArray<readonly [string, string]>): string {
  let message = anchoredRegistryMessage(code);
  for (const [placeholder, value] of subs) {
    expect(
      message.includes(placeholder),
      `DIAG-4 anchor: the registry *Message* for ${code} must carry the ${placeholder} ` +
        `placeholder this file interpolates; observed template ${JSON.stringify(message)}`,
    ).toBe(true);
    message = message.replace(placeholder, value);
  }
  return `error ${code}: ${message}`;
}
```

`tests/helpers/load-row-harness.ts:62-91` — the generic, already-imported version of this same "guard presence, then for each `[placeholder, value]` fill guard-then-substitute" shape (`registryMessageOf`/`registryLineOf`), used by this file's own `loadRowMessage` but by none of the four functions above:
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

Exact search: `grep -n "registryMessage(" tests/helpers/registry-oracle.ts` → 5 call sites (lines 41 inside `loadRowMessage` via the imported function, 100, 122, 147, 262) — one going through the imported `registryMessageOf`, the other four reading `registryMessage` directly.

## Why this is a problem
`registry-oracle.ts`'s own header states its reason for existing is to stop test files from hand-rolling the registry-Message read-and-render idiom, and it imports `registryMessageOf` from `load-row-harness.ts` for exactly that idiom — yet within the same module, four more renderer functions each re-derive the identical presence-guard/substitute/(sometimes) leftover-guard/return sequence under a different name and a different guard mechanism (two via `expect(...).toBeTypeOf("string")`, one via a thrown `Error`, one via `expect(...).toBeDefined()`), rather than composing the one it already imports.

## Suggested direction (non-binding, optional)
`reservedKeywordFragment` in particular is a near-total subset of the very next function, `registryFragment` (same read, same guard, same leftover check, same `${code}: ${message}` return), differing only by a hard-coded code and one extra pre-substitution presence check; a look at whether the four renderer idioms in this file could route through `registryMessageOf` (or a to-be-widened version of it) is a natural next step, mindful that the four differ in return-string prefix (`error <code>: ` vs bare `<code>: `) and in whether a leftover-placeholder guard runs.

## False-positive check
- Gate-pin check: `tests/helpers/registry-oracle.ts` is not `*gate*.test.ts` or a named gate kin; not a pinned-count gate.
- Recording-double check: all four functions render a message string from a parsed registry row; none records a call or backs a MUST-NOT-call negative witness, so the recording-double carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "reservedKeywordFragment\|registryFragment\|registeredParseMessage\|anchoredRegistryMessage" docs/bugs/*.md` → 0 hits; no open bug documents a rationale for keeping these four renderers separate from `registryMessageOf`.
- coverage-matrix/bug-doc citation search: `grep -n "registry-oracle.ts" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()`, and none of the four functions or their ~196 call sites across `tests/*.test.ts` is itself a test; it observes duplicated helper-function bodies inside a tests/helpers/ module.
- Prior-filing overlap check: `grep -rl "registryFragment\|reservedKeywordFragment\|anchoredRegistryMessage\|registeredParseMessage" quality/issues quality/resolved` shows PTQ-0786 (already triaged "questionable") and PTQ-0768/PTQ-0817/PTQ-0827 etc., all of which are about OTHER test files reimplementing `registryFragment`/`registryMessageOf`-shaped renderers locally; none names `tests/helpers/registry-oracle.ts`'s own four internal renderers as duplicating each other or its own imported `registryMessageOf`, so this is a distinct root cause (the duplication is inside the canonical dedup file itself, not a caller bypassing it).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — independently re-verified: all five excerpts reproduce verbatim at the cited lines, docs/bugs → 0 and coverage-matrix → 0 reproduce, and `git log -S` shows the four renderers were each hoisted into registry-oracle.ts by a different fix commit on 2026-09-18 (reservedKeywordFragment ← 5e1860ec, registryFragment ← e3546327, registeredParseMessage/fillParseMessage ← e54a42b3, anchoredRegistryMessage/registryErrorLine ← cec9ee56), so the co-resident four-idiom accretion is a real D7 boilerplate observation in tests/helpers/ and not a duplicate (PTQ-0786 covers live-production-acceptance's fragments, PTQ-0951 per-file throw readers, PTQ-0991/0983 callers bypassing these builders — none names this file's own renderers); but the stated grep misreports (`registryMessage(` → 4 hits :100/:122/:144/:262, not 5; the registryMessageOf use is at :52 not :41) and the title's "identical" is refuted by the bodies themselves — the four differ in registry (PARSE_REGISTRY vs four-page REGISTRY), guard mechanism (toBeTypeOf("string") / throw / toBeDefined()), substitution contract (Record→`<key>` replaceAll / Map→interpolateStrict with both-ways strictness / tuple-array replace with pre-check / hard-coded slot), leftover-placeholder guard (yes / yes / strict / none) and return prefix (`code: ` / `code: ` / bare / `error code: `), and the named facility `registryMessageOf` carries NO leftover-`<[a-z]+>` guard, so routing through it is not a drop-in but silently drops a guard three of the four carry; with ~200 live call sites behind these exports (fnArgMessage 72, narrowingMessage 25, arithmeticMessage 25, letRhsMessage 23, schemaRefusal 20, registryFragment 14, arrayElementMessage 12, paramsRefusal 9, reservedKeywordFragment 6) a unification means designing a widened renderer (prefix / leftover-guard / strictness options) and rewording every guard failure, which is a design ruling for a human rather than a mechanical dedupe — only the reservedKeywordFragment → registryFragment(RESERVED_KEYWORD_CODE, {keyword}) fold is near-mechanical (loses one slot-presence pre-check; no parse template repeats a placeholder so replace/replaceAll is equivalent today) and could be accepted on its own if the human declines the wider unification (triage: claude-fable-5-1)
verdict: questionable — re-triaged independently (prior in-file note was never logged in TRIAGE_LOG): all five excerpts reproduce (registry-oracle.ts :99-118/:121-136/:143-172/:261-283 verbatim; load-row-harness.ts registryMessageOf at :60-83, drift only), docs/bugs → 0 and coverage-matrix → 0 reproduce, `git log -S` confirms four separate same-day fix-commit hoists (5e1860ec / e3546327 / e54a42b3 / cec9ee56) so the accretion inside the canonical module is a real D7 boilerplate observation in tests/helpers/, and it is not a duplicate (no open/resolved row and no same-wave sibling names this file's own renderers; PTQ-0776-03/0840/1019/1046 cite registry-oracle.ts only as the canonical target) — but the stated grep misreports (`registryMessage(` → 4 hits :100/:122/:144/:262, not 5; the registryMessageOf call is at :52), the title's "identical" is refuted by the bodies (guards toBeTypeOf/throw/toBeDefined; fills Record→replaceAll / Map→interpolateStrict two-way / tuple→replace / hard-coded slot; leftover guard on three of four; prefixes `code: `/bare/`error code: `), and routing through the named facility is not a drop-in: `registryMessageOf` carries no leftover-`<[a-z]+>` guard and uses single `replace`, while code-registry-parse.md row `theta/parse/shadowed-callable-call` repeats `<name>` (149 rows scanned, 1 repeat), so folding `registryFragment` onto it silently changes the fill contract for a general exported helper — the widened renderer's contract (replaceAll vs replace, leftover guard, expect vs throw, prefix) is a human ruling, not a mechanical dedupe; the two wording-only folds are mechanical and could be accepted alone: `registryErrorLine` ≡ `registryLineOf(REGISTRY, path, code, subs)` (same guard→per-tuple contains→replace→`error code: ` shape, 43 diff lines all wording/params) and `reservedKeywordFragment` ≡ `registryFragment(RESERVED_KEYWORD_CODE, {keyword})` (loses one slot pre-check wording); no call site changes since all ~200 callers (fnArgMessage 72, narrowingMessage 25, arithmeticMessage 25, letRhsMessage 23, schemaRefusal 20, registryFragment 14, arrayElementMessage 12, paramsRefusal 9, reservedKeywordFragment 6, objectFieldMismatchMessage 2) go through the exported wrappers; form note: `d4_class: clone` is an extraneous D4-only field on a D7 filing, non-blocking (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-19), NARROWED to the two folds both triage passes verified as mechanical: (1) reservedKeywordFragment => registryFragment(RESERVED_KEYWORD_CODE, {keyword}) (the lost slot-presence pre-check wording is accepted); (2) registryErrorLine => registryLineOf(REGISTRY, path, code, subs) (wording-only). DECLINED: any routing through registryMessageOf and any widened unified renderer - registryMessageOf carries no leftover-<[a-z]+> guard and uses single replace while the shadowed-callable-call row repeats <name>, so the general fold silently changes fill contracts for ~200 call sites; the four remaining renderers stay distinct ON PURPOSE. If accretion continues, re-file the unification as a design task, not a dedupe.
