---
id: PTQ-1332
title: Local `theta(slashName)` ParsedTheta fixture builder duplicated instead of using the canonical `makeTheta` helper
lens: D7
status: open
verdict: confirmed
locations:
  - tests/registration-reload-wiring.test.ts:39-45
  - tests/b0375-degraded-excision-witness.test.ts:35-41
  - tests/drain-state-contract.test.ts:155-161
  - tests/drain-state-contract.test.ts:192-198
  - tests/hot-reload-stale-quiesce-arms.test.ts:34-40
  - tests/watcher-terminated-recovery.test.ts:62-68
sites: 6
fix_scope: module
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# Local `theta(slashName)` ParsedTheta fixture builder duplicated instead of using the canonical `makeTheta` helper

## Observation
`tests/registration-reload-wiring.test.ts` declares a module-scope no-op run
constant and a `theta(slashName)` arrow function that builds a minimal
`ParsedTheta` (`{ slashName, frontmatter: { mode: "prompt" }, body: { statements: [], tail: null }, run }`).
The identical shape — a named no-op run constant plus a `theta`/`ParsedTheta`
builder with the same three fields and the same values — is independently
declared in four other in-repo test files (six declaration sites total, one
file declaring it twice at different scopes). `tests/helpers/watch-arming-harness.ts`
already exports a `makeTheta(slashName, run?)` function that builds the same
`ParsedTheta` shape (with `frontmatter`/`body` placeholders and a default
no-op `run`). None of the six sites import it.

## Evidence

tests/registration-reload-wiring.test.ts:39-45
```ts
const NOOP_RUN = async (): Promise<void> => {};
const theta = (slashName: string): ParsedTheta => ({
  slashName,
  frontmatter: { mode: "prompt" },
  body: { statements: [], tail: null },
  run: NOOP_RUN,
});
```

tests/b0375-degraded-excision-witness.test.ts:35-41
```ts
const noopRun = async (): Promise<void> => {};
const theta = (slashName: string): ParsedTheta => ({
  slashName,
  frontmatter: { mode: "prompt" },
  body: { statements: [], tail: null },
  run: noopRun,
});
```

tests/drain-state-contract.test.ts:155-161 (first of two sites in this file)
```ts
  const noopRun = async (): Promise<void> => {};
  const theta = (slashName: string): ParsedTheta => ({
    slashName,
    frontmatter: { mode: "prompt" },
    body: { statements: [], tail: null },
    run: noopRun,
  });
```

tests/drain-state-contract.test.ts:192-198 (second site, same file)
```ts
  const noopRun = async (): Promise<void> => {};
  const theta = (slashName: string): ParsedTheta => ({
    slashName,
    frontmatter: { mode: "prompt" },
    body: { statements: [], tail: null },
    run: noopRun,
  });
```

tests/hot-reload-stale-quiesce-arms.test.ts:34-40
```ts
const NOOP_RUN = async (): Promise<void> => {};
const theta = (slashName: string): ParsedTheta => ({
  slashName,
  frontmatter: { mode: "prompt" },
  body: { statements: [], tail: null },
  run: NOOP_RUN,
});
```

tests/watcher-terminated-recovery.test.ts:62-68
```ts
const NOOP_RUN = async (): Promise<void> => {};
const theta = (slashName: string): ParsedTheta => ({
  slashName,
  frontmatter: { mode: "prompt" },
  body: { statements: [], tail: null },
  run: NOOP_RUN,
});
```

The canonical helper, tests/helpers/watch-arming-harness.ts:192-206:
```ts
/**
 * A minimal `ParsedTheta`. Factory dispatch reads `slashName` and `run`;
 * `frontmatter` and `body` carry inert placeholders.
 */
export function makeTheta(
  slashName: string,
  run: (args: string, ctx: ExtensionCommandContext) => Promise<void> = async (): Promise<void> => {},
): ParsedTheta {
  return {
    slashName,
    frontmatter: { mode: "prompt" } as unknown as ParsedTheta["frontmatter"],
    body: { statements: [] } as unknown as ParsedTheta["body"],
    run,
  };
}
```

Search performed: `grep -rn "const theta = (slashName: string): ParsedTheta =>" tests/*.ts` returns exactly the 5 files / 6 sites above; none of the five files import `watch-arming-harness` or `makeTheta` (`grep -n "watch-arming-harness\|makeTheta" <file>` returns no hits in any of them).

## Why this is a problem
The same fixture-object shape (name, inert frontmatter/body, no-op run) is hand-retyped at six call sites across five files rather than imported from the helper module that already exports it under the name `makeTheta`. This is boilerplate duplication of a harness fixture that has a natural home already built and already exported from `tests/helpers/`.

## Suggested direction (non-binding, optional)
`tests/helpers/watch-arming-harness.ts`'s exported `makeTheta` is the existing shared home; the five files could import it in place of their local declarations.

## False-positive check
- Gate-pin check: none of the five files match `*gate*.test.ts` or the named gate kin; not applicable.
- Recording-double check: this is a plain data-fixture builder, not a call-recording double; not applicable.
- docs/bugs/ signature search: `grep -rl` for each file's basename against `docs/bugs/` shows each file is cited only as a witness/description in its own bug doc (0375, 0018/0024/0313 etc. for the others), never as a pinned code excerpt naming `theta(`/`makeTheta`/`ParsedTheta` fixture text; no correct-reason-red carve-out applies to this fixture code.
- coverage-matrix / bug-doc citation search: `grep -rn` for each filename in `docs/reference/coverage-matrix.md` and `docs/bugs/*.md` finds only file-level mentions of the test suites, none of which cite the `theta`/`NOOP_RUN` fixture by name; no merge/rename/delete of any test is proposed here, only an import substitution, so no citation conflict exists.
- Coverage drift: not claimed; this finding is scoped to duplicated test-code shape, not to what is or isn't tested.

## Triage
verdict: confirmed — independently re-verified: `grep -n "const theta = (slashName: string): ParsedTheta =>" -A5 tests/*.ts` returns exactly the 6 sites in the 5 named files at :36/:156/:193/:35/:40/:63 (one-line drift from the cited ranges, bodies byte-identical modulo the `NOOP_RUN`/`noopRun` constant name), `makeTheta` is exported at tests/helpers/watch-arming-harness.ts:196-206 with the same `slashName`/`{ mode: "prompt" }`/`{ statements: [] }`/default no-op `run` shape and is already imported by 5 other tests, while none of the 5 filed files imports `watch-arming-harness` or `makeTheta` (grep → 0); every copy is live (5/1/4/1/2 `theta("` calls) and no file reads `.body`/`.frontmatter`/`.tail`, so the only textual difference (`tail: null`, no casts) is inert and the substitution is mechanical; none is a gate kin, no recording double, docs/bugs + coverage-matrix name none of `NOOP_RUN`/`noopRun`/`makeTheta` (grep → 0) and no it()/describe() merge/rename/delete is proposed; not a duplicate — PTQ-0606/0782/1035 cover the unrelated source-text `theta(...lines)` joiner, PTQ-1070 the GREET_THETA strings, and no issues/resolved row or log line names this ParsedTheta builder — in-scope D7 copy-paste-fixture class (triage: claude-fable-5-1)
