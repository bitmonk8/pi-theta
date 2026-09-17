---
id: PTQ-0602
title: Three in-scope live cells hand-roll the sharded diagnostics-registry read tests/helpers/registry-oracle.ts already centralises, two of them also duplicating a byte-identical registryFragment reader
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/schema-field-discard-recovery-live-cell.test.ts:71-78
  - tests/live/unterminated-template-registration-live-cell.test.ts:91-98
  - tests/live/withheld-binder-provenance-live-cell.test.ts:95-102
  - tests/live/schema-field-discard-recovery-live-cell.test.ts:81-92
  - tests/live/withheld-binder-provenance-live-cell.test.ts:105-116
  - tests/helpers/registry-oracle.ts:14-45
sites: 5                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Three in-scope live cells hand-roll the sharded diagnostics-registry read tests/helpers/registry-oracle.ts already centralises, two of them also duplicating a byte-identical registryFragment reader

## Observation
Three of the twelve in-scope files each declare their own module-scope
`REGISTRY` constant by hand-rolling `readFileSync` + `fileURLToPath` +
`parseRegistry(...)` over the single page
`docs/spec_topics/diagnostics/code-registry-parse.md`, byte-identical to each
other. `tests/helpers/registry-oracle.ts` already exports `readRegistry(shards)`
and a ready-made joined `REGISTRY` constant for exactly this read, created (per
its own header) because the same read had already been "redeclared
byte-for-byte... in several test files." On top of the redeclared `REGISTRY`
constant, two of the three also declare a byte-identical `registryFragment(code,
substitutions)` DIAG-4 message-fragment reader.

## Evidence
`tests/live/schema-field-discard-recovery-live-cell.test.ts:71-78`:
```ts
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];
```

`tests/live/unterminated-template-registration-live-cell.test.ts:91-98` — the
identical seven-line block, differing only in surrounding comment wording.

`tests/live/withheld-binder-provenance-live-cell.test.ts:95-102` — the
identical seven-line block again.

`tests/live/schema-field-discard-recovery-live-cell.test.ts:81-92` — the
`registryFragment` reader:
```ts
function registryFragment(code: string, substitutions: Readonly<Record<string, string>>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
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

`tests/live/withheld-binder-provenance-live-cell.test.ts:105-116` — the same
function body, byte-identical.

`tests/helpers/registry-oracle.ts:14-45` — the existing canonical helper
(`RegistryRow`, `readRegistry(shards)`, and the joined `REGISTRY` export) this
read already has a home in:
```ts
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

## Why this is a problem
`registry-oracle.ts`'s own header states this exact read ("read the four
sharded registry pages ... parse each through the real `parseRegistry`") was
already found redeclared byte-for-byte in several test files, and centralises
it for that reason; these three in-scope files redo the same hand roll over
one shard rather than calling `readRegistry(["parse"])`. Two of the three then
also independently declare a second, byte-identical helper
(`registryFragment`) that reads a message template from that hand-rolled
`REGISTRY` and substitutes placeholders — a second piece of duplicated logic
riding on top of the first, in the same two files.

## Suggested direction (non-binding, optional)
Calling `readRegistry(["parse"])` from `tests/helpers/registry-oracle.ts`
would remove the redeclared read at all three sites; whether the
`registryFragment` reader also belongs beside it is an observation left to
whoever next touches these files, not a design this filing owns.

## False-positive check
- Gate-pin carve-out: none of the three files match `*gate*.test.ts` or the
  named gate-file patterns; not applicable.
- Recording-double carve-out: `REGISTRY`/`registryFragment` are pure readers
  over a parsed doc, not a "never called" recording witness; not applicable.
- docs/bugs/ signature search: grepped each of the three bug numbers narrated
  in these files' headers (0133, 0246, 0143) — all are `status: fixed`
  entries the live cells verify against, not documented correct-reason reds.
- coverage-matrix/bug-doc citation search: grepped
  `docs/reference/coverage-matrix.md` for each of the three filenames — no
  hits. Grepped `docs/bugs/*.md` for each filename — each names its own file
  as that bug's live cell, but none pins the `REGISTRY` or `registryFragment`
  declarations or their line ranges specifically, so no citation blocks
  routing this read through the existing helper.
- Verified `tests/helpers/registry-oracle.ts` exports `readRegistry` and a
  joined `REGISTRY` covering the `parse` shard, by reading the file in full.
- Confirmed the three `REGISTRY` blocks and the two `registryFragment` bodies
  are byte-identical (not renamed-only or diverged) by direct side-by-side
  reading of all cited ranges immediately before filing.

## Triage
<!-- triage appends here -->
verdict: confirmed — independently re-verified: the seven-line `const REGISTRY = parseRegistry(...code-registry-parse.md...)` block sits at the cited lines in all three files and is byte-identical (own md5 8c53e5c9 over sed-extracted bodies, the same hash as the five d7-02 sibling cells), `registryFragment` is byte-identical in the two cited files (md5 a9d54c56); none of the three imports tests/helpers/registry-oracle (grep 0) whose readRegistry(["parse"]) (registry-oracle.ts:31-45) reads the same page through the same parseRegistry and every code looked up (4, all theta/parse/*) is on that shard so the swap is mechanical; all locations in tests/, no gate/recording-double/failLoudly carve-out, bug docs 0133/0143/0246 pin no REGISTRY/registryFragment mechanics (grep 0), coverage-matrix 0 hits; not a duplicate — no issues/ or resolved/ PTQ names these files (0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412 cite disjoint sets) and the same-wave pending live-cell siblings (d7-02, d7-75, d7-97-03, inline-rename/let-annotation pair) cite other files; acceptor note: `registryFragment` has 8 byte-identical copies across tests/live (this pair + d7-02's three + alias-sink + index-sentinel + nested-array-element-sink-descent), so merging the live-cell registry-oracle intakes into one fix with a shared fragment reader is sensible at acceptance (triage: claude-fable-5-1)
