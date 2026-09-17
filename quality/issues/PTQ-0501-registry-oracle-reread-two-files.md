---
id: PTQ-0501
title: Two reviewed test files re-parse the code-registry corpus and redefine an identical msg() helper instead of importing tests/helpers/registry-oracle.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/brace-and-angle-annotation-junk-refusal.test.ts:175-218
  - tests/brace-rooted-union-arm-capture.test.ts:113-154
  - tests/helpers/registry-oracle.ts:20-49
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Two reviewed test files re-parse the code-registry corpus and redefine an identical msg() helper instead of importing tests/helpers/registry-oracle.ts

## Observation
`tests/helpers/registry-oracle.ts` exists to hold one `RegistryRow` interface and one `REGISTRY`/`readRegistry` read of the sharded `docs/spec_topics/diagnostics/code-registry-*.md` corpus through `parseRegistry`, precisely so this read is not redeclared per file (its own header cites PTQ-0215). Both `tests/brace-and-angle-annotation-junk-refusal.test.ts` and `tests/brace-rooted-union-arm-capture.test.ts` redeclare a local, narrower `RegistryRow` (`code`/`message` only) and re-run the same `readFileSync`+`parseRegistry` read locally — one over all four pages, one over the single `parse` page, both of which `readRegistry(["parse", ...])` already supports — and each then defines its own `msg()` function, whose body is byte-for-byte identical between the two files apart from one interpolated string in the "row is absent" failure message.

## Evidence
`tests/helpers/registry-oracle.ts:20-49` (the canonical export, parameterised by shard):
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

export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);
```

`tests/brace-and-angle-annotation-junk-refusal.test.ts:175-218` (four-page read re-declared locally, plus `msg()`):
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live four-page sharded registry, read from the spec corpus (DIAG-4). */
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
) as RegistryRow[];

function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/ must carry the Message row for ${code}`,
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

`tests/brace-rooted-union-arm-capture.test.ts:113-154` (single-page read re-declared locally, same `msg()` body):
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

// ...

function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${code}`,
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

Both `msg()` bodies are otherwise identical: same signature, same `toBeDefined()`/`toContain()` assertion pair, same replace loop, same return.

## Why this is a problem
This is harness code — reading the diagnostics registry corpus and filling its `<placeholder>` templates — not domain logic specific to either bug's subject. `tests/helpers/registry-oracle.ts` already centralises exactly the corpus-read half of this (`RegistryRow`, `readRegistry`, `REGISTRY`) with its own header explaining it exists because this read "were redeclared byte-for-byte ... in several test files" (PTQ-0215), and `readRegistry` already accepts a `shards` argument so a single-page caller (the second file) needs no four-page read at all. Both reviewed files re-derive this read locally instead, and additionally carry a second, file-to-file identical piece of harness — the `msg()` placeholder-filling function — that has no shared home at all.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts` is the established home for the corpus-read half; a `msg()`-shaped placeholder filler sits naturally beside it as a further export, parameterised by the registry passed in, since both reviewed files' bodies already agree byte-for-byte on its behaviour.

## False-positive check
- Gate-pin: neither file matches `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); this is not a pinned-count assertion, it is a duplicated read-and-render helper definition.
- Recording-double: `msg()`/`REGISTRY` read an already-parsed corpus and fill a template; they record no calls and back no "never called" assertion, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "registryMessage" docs/bugs/` → 0 files naming this duplication as a documented correct-reason design.
- coverage-matrix/bug-doc citation search: `grep -n "brace-and-angle-annotation-junk-refusal\|brace-rooted-union-arm-capture" docs/reference/coverage-matrix.md` → 0 hits. Both files are however each their own bug's named "Witness" (bug 0252 and bug 0095 respectively) in their own header comments — this finding proposes no change to any `it()`/`describe()` name, count, or assertion, only to where the registry-read and `msg()` definitions live, so neither witness's pinned test count or behaviour moves.
- Prior-finding search: `grep -rl "brace-and-angle-annotation-junk-refusal\|brace-rooted-union-arm-capture" quality/intake quality/resolved` → only `quality/resolved/PTQ-0205-diagline-rendering-helper-duplication.md`, which is a distinct root cause (the `diagLines`/`diagCodes` diagnostic-rendering helpers, not the registry-read/`msg()` pair this finding cites) at different line ranges in these same two files. `quality/resolved/PTQ-0404-registry-oracle-reimplemented-three-files.md` is the same root-cause class filed against three different files; these two files are not among its cited locations.
- Coverage check: the claim is entirely about repeated harness DEFINITIONS, not a missing test path; both are exercised by every diagnostic-message assertion in their own file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts match at the cited lines (helper :20-49 exports RegistryRow/readRegistry(shards)/REGISTRY; brace-and-angle :175-218 redeclares the two-field RegistryRow plus the four-page parseRegistry join; brace-rooted :113-154 redeclares the same RegistryRow plus a single-parse-page read that readRegistry(["parse"]) already covers), the two msg() bodies diff to exactly one interpolated-string line (16 lines each), neither file matches a gate-pin pattern, coverage-matrix cites neither (0 hits), and both bug-doc witness citations (0252:511, 0095:931) pin the files not their helper definitions; dedupe clean — these two files sit in no PTQ's cited locations (PTQ-0205 at the same files is the distinct diagLines/diagCodes root cause; PTQ-0404/0411/0412 and the same-wave ctor-tests/division-modulo siblings cite disjoint file sets, the established per-file-set convention for this class). Fixer note: the registry-oracle header (PTQ-0215's ratified fix) rules the per-file registryMessageOf-shaped reader "stays local, parameterised by the REGISTRY this module exports", so the mechanical fix is migrating the read to readRegistry/REGISTRY; hoisting msg() into the helper is the non-binding direction and remains a fixer/human call under that ruling (triage: claude-fable-5-1)
