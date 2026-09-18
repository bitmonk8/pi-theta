---
id: PTQ-0921
title: b0268-diagnostic-file-separator-normalisation.test.ts re-parses code-registry-parse.md inline instead of importing the canonical registry read
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0268-diagnostic-file-separator-normalisation.test.ts:65-97
  - tests/helpers/registry-oracle.ts:19-42
  - tests/helpers/load-row-harness.ts:38-72
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0268-diagnostic-file-separator-normalisation.test.ts re-parses code-registry-parse.md inline instead of importing the canonical registry read

## Observation
tests/b0268-diagnostic-file-separator-normalisation.test.ts declares its own
`RegistryRow` interface, its own `REGISTRY` constant built from a raw
`parseRegistry(readFileSync(fileURLToPath(...)))` read of
`docs/spec_topics/diagnostics/code-registry-parse.md`, and its own
`normativeMessage(code)` function that looks the message up via
`registryMessage(REGISTRY, code)` and throws when the row is absent.
tests/helpers/registry-oracle.ts already exports a `readRegistry(shards)` /
`REGISTRY` pair performing the identical read-and-parse over the same shard
files, and tests/helpers/load-row-harness.ts already exports `PARSE_REGISTRY`
/ `PARSE_REGISTRY_PATH` (the identical single-page parse of this exact file)
plus a `registryMessageOf(registry, registryPath, code, fills)` function that
performs the identical presence-check-then-lookup this file's own
`normativeMessage` re-derives. The file imports from neither helper module.

## Evidence

tests/b0268-diagnostic-file-separator-normalisation.test.ts:65-97 (re-read
immediately before filing):
```ts
interface RegistryRow {
  code: string;
  severity: string;
  phase: string;
  message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as RegistryRow[];

/**
 * The row's normative *Message* (DIAG-4). Throws naming the registry page when
 * the row is absent, so registry drift cannot degrade a byte-identity
 * assertion into a comparison against `undefined`.
 */
function normativeMessage(code: string): string {
  const message = registryMessage(REGISTRY, code) as string | undefined;
  if (typeof message !== "string" || message.length === 0) {
    throw new Error(
      `harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no Message row ` +
        `for ${code} — the DIAG-4 column is this file's only message oracle, so a missing ` +
        `row is a harness failure, never a skip`,
    );
  }
  return message;
}
```

tests/helpers/registry-oracle.ts:19-42 — the canonical parse-and-read
(re-read immediately before filing):
```ts
export interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

export function readRegistry(
  shards: readonly ("parse" | "load" | "runtime" | "host")[],
): readonly RegistryRow[] {
  return parseRegistry(
    shards
      .map((shard) =>
        readFileSync(
          fileURLToPath(
            new URL(`../../docs/spec_topics/diagnostics/code-registry-${shard}.md`, import.meta.url),
          ),
          "utf8",
        ),
      )
      .join("\n"),
  ) as RegistryRow[];
}
```

tests/helpers/load-row-harness.ts:38-72 — the sibling single-page parse and
the message lookup this file's own `normativeMessage` re-derives (re-read
immediately before filing):
```ts
export const PARSE_REGISTRY_PATH = "docs/spec_topics/diagnostics/code-registry-parse.md";

export const PARSE_REGISTRY: readonly ParseCodeRegistryRow[] = parseRegistry(
  readFileSync(
    fileURLToPath(new URL(`../../${PARSE_REGISTRY_PATH}`, import.meta.url)),
    "utf8",
  ),
) as ParseCodeRegistryRow[];

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

`normativeMessage` is called at lines 158, 159, 219, 246, 280 and 281, always
with an empty fill set — the degenerate case `registryMessageOf(PARSE_REGISTRY,
PARSE_REGISTRY_PATH, code)` (or `readRegistry(["parse"])` plus a thrown-error
wrapper) already covers.

## Why this is a problem
Both tests/helpers/registry-oracle.ts and tests/helpers/load-row-harness.ts
state in their own header comments that they exist specifically because this
`RegistryRow`/`REGISTRY`/registry-message-lookup read was independently
redeclared across test files (PTQ-0215 for the former, PTQ-0206/PTQ-0207 for
the latter). tests/b0268-diagnostic-file-separator-normalisation.test.ts
reproduces the identical `parseRegistry(readFileSync(fileURLToPath(...)))`
read of the identical `code-registry-parse.md` file, plus a hand-written
presence-guard-then-lookup that both helpers already perform. A change to how
the shard read is performed, or to the DIAG-4 presence-guard's wording,
applied to the two helpers' many importers would not reach this file's
independent copy.

## Suggested direction (non-binding, optional)
tests/helpers/load-row-harness.ts already exports `PARSE_REGISTRY`,
`PARSE_REGISTRY_PATH` and `registryMessageOf`, all of which read the exact
file and perform the exact presence-guard-then-lookup this file's local
`REGISTRY`/`RegistryRow`/`normativeMessage` re-derive.

## False-positive check
- Gate-pin check: tests/b0268-diagnostic-file-separator-normalisation.test.ts
  does not match `*gate*.test.ts` or the named kin; the cited lines are a
  registry-row read and a message lookup, not a pinned count or inventory.
- Recording-double check: `REGISTRY`/`normativeMessage` back a message-string
  lookup, not a fake or a "never called" witness. Not applicable.
- docs/bugs/ signature search: `grep -n "Status" docs/bugs/0268-*.md` →
  docs/bugs/0268-diagnostic-file-path-separator-inconsistent-per-load-pass.md,
  "fixed (0.312.0)". `npx vitest run tests/b0268-diagnostic-file-separator-normalisation.test.ts`
  → 5 passed at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0268-diagnostic-file-separator-normalisation" docs/reference/coverage-matrix.md`
  → 0 hits. `grep -n "RegistryRow\|normativeMessage" docs/bugs/0268-*.md` →
  0 hits. This finding proposes no merge, rename or deletion of any test,
  `it()` or `describe()` — only that the local registry read and message
  lookup could call the already-exported helpers instead of restating them —
  so no witness-list citation is disturbed.
- Overlap check against already-filed/resolved topics: PTQ-0902 and PTQ-0908
  (both confirmed) cite the SIBLING file
  tests/b0268-load-note-path-spelling-single-convention.test.ts's own
  `normativeMessagePattern`/`RegistryRow`/`REGISTRY` reimplementation — neither
  finding's `locations` cites
  tests/b0268-diagnostic-file-separator-normalisation.test.ts by path.
  `grep -rl "b0268-diagnostic-file-separator-normalisation"
  quality/issues quality/resolved quality/intake` (before this filing) found
  no hit. PTQ-0427 (resolved) covers this sibling pair's `makeHost` family in
  the OTHER b0268 file only. This is a distinct, currently-unfiled occurrence
  of the same registry-read root cause in the first file this wave's brief
  names.

## Triage
<triage appends: triage note here>
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at the cited lines (test :65-97 local `RegistryRow`/`REGISTRY`/`normativeMessage`, registry-oracle.ts :19-42 `readRegistry`, load-row-harness.ts :38-72 `PARSE_REGISTRY`/`PARSE_REGISTRY_PATH`/`registryMessageOf`); mktemp whitespace-stripped extraction of the test's read (:72-82) against `PARSE_REGISTRY` (:49-54) differs only by the `../` vs `../../` depth literal and the row-type alias, i.e. the same `parseRegistry(readFileSync(fileURLToPath(new URL(...code-registry-parse.md))))` of the same page, and `normativeMessage` is `registryMessage` + presence guard exactly as `registryMessageOf` with empty fills; the local copy is live (six calls at :158,:159,:219,:246,:280,:281 reproduce) and predates both exports (region 978670e0 2026-08-24 vs. `PARSE_REGISTRY` 2594cd44 2026-09-11 and `readRegistry` c79a9039 2026-09-17) so it is an unmigrated residual, not a design choice; the test imports from neither helper (import block :1-21); `npx vitest run` → 5 passed at HEAD, bug 0268 fixed (0.265.0) — the candidate misnames the bug doc (actual docs/bugs/0268-load-notes-render-same-file-with-mixed-path-separators.md, 0.265.0 not 0.312.0) but the fixed-status substance holds; the bug doc's only citation (:331) is a run command, coverage-matrix → 0, no merge/rename/delete proposed, no gate/recording-double/red-test carve-out; all locations under tests/, D7 boilerplate-duplication class; not a duplicate — the only PTQs citing this file (resolved PTQ-0427/0643/0677) cover the makeHost/makeChannel doubles, and confirmed PTQ-0902/PTQ-0908 cite the SIBLING b0268 file's read only, so per the store's per-file registry-oracle convention (PTQ-0908 note) this is a distinct unremediated occurrence (triage: claude-fable-5-1)
