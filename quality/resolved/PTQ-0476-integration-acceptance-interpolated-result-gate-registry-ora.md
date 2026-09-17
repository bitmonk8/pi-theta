---
id: PTQ-0476
title: integration-acceptance.test.ts and interpolated-result-gate.test.ts each reimplement tests/helpers/registry-oracle.ts's four-page REGISTRY read inline
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/integration-acceptance.test.ts:72-87
  - tests/interpolated-result-gate.test.ts:179-193
  - tests/helpers/registry-oracle.ts:20-40
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# integration-acceptance.test.ts and interpolated-result-gate.test.ts each reimplement tests/helpers/registry-oracle.ts's four-page REGISTRY read inline

## Observation
Both files under review declare their own module-scope `REGISTRY` constant by
reading the same four sharded diagnostics-registry pages
(`code-registry-{parse,load,runtime,host}.md`), joining them with `"\n"`, and
parsing the joined text through `parseRegistry` — the exact read
`tests/helpers/registry-oracle.ts` already performs and exports as
`readRegistry(["parse","load","runtime","host"])` / `REGISTRY`. Neither file
imports the helper module; each re-derives the same four-shard join locally.

## Evidence
tests/integration-acceptance.test.ts:72-87:
```ts
const REGISTRY = parseRegistry(
  ["parse", "load", "runtime", "host"]
    .map((family) =>
      readFileSync(
        fileURLToPath(
          new URL(
            `../docs/spec_topics/diagnostics/code-registry-${family}.md`,
            import.meta.url,
          ),
        ),
        "utf8",
      ),
    )
    .join("\n"),
);
```

tests/interpolated-result-gate.test.ts:179-193:
```ts
const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as readonly { readonly code: string; readonly message: string }[];
```

tests/helpers/registry-oracle.ts:20-40 — the canonical, already-exported
equivalent of both blocks above:
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

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);
```

Both files' inline blocks read the identical four pages, in the identical
order, joined the identical way (`.join("\n")`), through the identical
`parseRegistry` call — differing only in whether the four page names are
spelled as bare family words mapped into a template literal
(integration-acceptance.test.ts) or as full filenames
(interpolated-result-gate.test.ts), and in the cast applied to the result.

## Why this is a problem
`tests/helpers/registry-oracle.ts`'s own header states it exists because this
exact four-page join "were redeclared byte-for-byte (confirmed via `diff`) in
several test files" and centralises "that read only". Both files reviewed
here perform that same read inline rather than importing the module's
`REGISTRY` (or `readRegistry`), so a change to the shard list, page-name
spelling, or join behaviour has to be made correctly in three places (the
helper plus these two files) instead of one, with nothing enforcing that the
three stay in sync beyond the four-page list happening not to have changed
recently.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts` already exports a `REGISTRY` constant
built from exactly this read; importing it is the existing, purpose-built
home for this shape. Neither file's own message-comparison helpers
(`registryMessage`, `interpolatedResultMessage`, the inline `for` loop in
integration-acceptance.test.ts) would need to change, since those consume
`REGISTRY` by value regardless of where it is constructed.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` in the sense the
  carve-out targets census/pin gates (interpolated-result-gate.test.ts is
  named `-gate` but is a bug-witness file pinning specific diagnostic
  dispositions per docs/bugs/0079, 0114, 0116, 0118, not a census/inventory
  count of the kind the carve-out lists); the cited lines are a registry-read
  constant, not a pinned corpus count.
- Recording-double check: not applicable — no double or fake is involved in
  either cited block.
- docs/bugs/ signature search: `grep -rn "interpolated-result-gate.test.ts:1[7-9][0-9]" docs/bugs/*.md`
  finds one hit — docs/bugs/0117-error-model-omits-parse-coded-interpolation-panic.md:601,
  which cites `tests/interpolated-result-gate.test.ts:176–190` as evidence
  that "bug 0079's witnesses read the string out of the registry rather than
  copying it". That citation is about the BEHAVIOUR (reading the Message
  column from the registry rather than copying prose), not about the read
  being performed by an inline four-page join rather than an imported
  constant; importing `REGISTRY` from `tests/helpers/registry-oracle.ts`
  preserves that exact behaviour (the helper's `REGISTRY` is the same
  registry, read the same way), so this finding does not propose to change,
  merge, or remove anything docs/bugs/0117 cites. `grep -rn "integration-acceptance.test.ts:7[0-9]|8[0-7]" docs/bugs/*.md`
  finds no hits in the 72-87 range (the file's cited ranges elsewhere are
  170-190 and 274-288, both disjoint from the REGISTRY block).
- coverage-matrix/bug-doc citation search:
  `grep -rn "integration-acceptance.test.ts\|interpolated-result-gate.test.ts" docs/reference/coverage-matrix.md`
  returns no hits; both files are cited by name only in docs/bugs/*.md, at
  line ranges disjoint from the two blocks cited above (checked individually
  per file, above).
- Coverage check: the claim is about a duplicated registry-read
  DEFINITION, not a missing test path; every cell in both files that
  consumes `REGISTRY` continues to pass under the current inline definition.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/integration-acceptance.test.ts:72-87 and tests/interpolated-result-gate.test.ts:179-193, each reading the same four shards in the same order through `.join("\n")` + `parseRegistry` that tests/helpers/registry-oracle.ts:31-45 exports as `REGISTRY`; `grep registry-oracle` on both files returns nothing; consumers are `registryMessage(REGISTRY, …)` only (lines 253/264/281 and 206/222/1015/1079-1080), so importing the helper is a mechanical swap; the `*gate*` carve-out does not apply (no pinned-count assertion in the file, the cited block is a fixture read); docs/bugs/0117:601,916 cite the file's registry-read BEHAVIOUR, which the import preserves, and docs/reference/coverage-matrix.md cites neither file; no existing PTQ row cites either file — the resolved registry-oracle rows (PTQ-0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412) track this pattern per copy, so this is the same class with two new sites, not a duplicate (triage: claude-fable-5-1)
