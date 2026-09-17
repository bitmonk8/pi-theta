---
id: PTQ-0735
title: The RegistryRow/msg/FRONTMATTER/diagsOf/rowsOf/fnParamCarrier diagnostic-oracle harness is redeclared identically across both in-scope withheld-sentinel-*.test.ts files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/withheld-sentinel-author-twin-provenance.test.ts:96-126
  - tests/withheld-sentinel-author-twin-provenance.test.ts:239-254
  - tests/withheld-sentinel-mooting-and-render-pins.test.ts:114-150
  - tests/withheld-sentinel-mooting-and-render-pins.test.ts:155-165
  - tests/withheld-sentinel-mooting-and-render-pins.test.ts:374-376
sites: 2
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The RegistryRow/msg/FRONTMATTER/diagsOf/rowsOf/fnParamCarrier diagnostic-oracle harness is redeclared identically across both in-scope withheld-sentinel-*.test.ts files

## Observation
tests/withheld-sentinel-author-twin-provenance.test.ts and
tests/withheld-sentinel-mooting-and-render-pins.test.ts each declare their own
module-scope `interface RegistryRow`, `msg()` registry-message-filler, the
`FRONTMATTER` body-prefix constant, and the `diagsOf`/`rowsOf`/`fnParamCarrier`
production-parse-harness trio. The `msg()` bodies are identical apart from one
word in an internal assertion message; `FRONTMATTER`, `diagsOf`, `rowsOf`, and
`fnParamCarrier` are byte-identical between the two files. Both files' own
header comments state they were deliberately split from what was once framed
as one witness — the author-twin-provenance file imports a factory the
pre-fix tree does not export and so fails to collect until the fix lands,
while the mooting-and-render-pins file must stay independently runnable and
green — but neither header addresses the diagnostic-oracle plumbing the split
duplicated.

## Evidence

tests/withheld-sentinel-author-twin-provenance.test.ts:96-126 (re-read
immediately before filing):
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

/** The registry row's normative *Message* template with its placeholders filled. */
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

tests/withheld-sentinel-author-twin-provenance.test.ts:239-254:
```ts
const FRONTMATTER: readonly string[] = ["---", "mode: prompt", "---"];

/** The diagnostics the production parse reports for `body`, in emission order. */
function diagsOf(body: readonly string[]): readonly Diagnostic[] {
  return parseDoc([...FRONTMATTER, ...body].join("\n")).diagnostics;
}

/** `(code, message)` pairs in emission order — the whole list, unfiltered. */
function rowsOf(body: readonly string[]): Array<readonly [string, string]> {
  return diagsOf(body).map((d) => [d.code, d.message] as const);
}

/** An UNANNOTATED `fn` parameter read inside an `array<…>`, plus a call. */
function fnParamCarrier(body: readonly string[]): readonly string[] {
  return ["fn f(p) {", ...body, "}", "let z = f(1)", "1"];
}
```

tests/withheld-sentinel-mooting-and-render-pins.test.ts:114-150 — the same
`interface RegistryRow` and the same `msg()` body, only the internal
assertion-message wording differs ("docs/spec_topics/diagnostics/
code-registry-parse.md must carry" vs "the sharded registry must carry"):
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}
...
/** The registry row's normative *Message* template with its placeholders filled. */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: the sharded registry must carry the Message row for ${code}`,
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

tests/withheld-sentinel-mooting-and-render-pins.test.ts:155-165 —
byte-identical to the first file's `FRONTMATTER`/`diagsOf`/`rowsOf`:
```ts
const FRONTMATTER: readonly string[] = ["---", "mode: prompt", "---"];

/** The diagnostics the production parse reports for `body`, in emission order. */
function diagsOf(body: readonly string[]): readonly Diagnostic[] {
  return parseDoc([...FRONTMATTER, ...body].join("\n")).diagnostics;
}

/** `(code, message)` pairs in emission order — the whole list, unfiltered. */
function rowsOf(body: readonly string[]): Array<readonly [string, string]> {
  return diagsOf(body).map((d) => [d.code, d.message] as const);
}
```

tests/withheld-sentinel-mooting-and-render-pins.test.ts:374-376 —
byte-identical to the first file's `fnParamCarrier`:
```ts
/** An unannotated `fn` parameter read inside an `array<…>`, plus a call. */
function fnParamCarrier(body: readonly string[]): readonly string[] {
  return ["fn f(p) {", ...body, "}", "let z = f(1)", "1"];
}
```

Search performed: manual comparison of every module-scope declaration in both
files (both under 600 lines); `interface RegistryRow`, `FRONTMATTER`,
`diagsOf`, `rowsOf`, and `fnParamCarrier` are byte-identical between the two;
`msg()` is identical apart from one clause of one internal assertion string.
Both files already import `parseDoc` from `./helpers/e2e-s1` (their own
`import` lines), so the shared harness is layered directly on top of an
already-centralised parse entry point.

## Why this is a problem
The two files are explicitly one logical witness split across files for
collection reasons (stated in both files' own header comments), yet each
redeclares its own copy of the DIAG-4 registry-message oracle
(`RegistryRow`/`msg`) and its own copy of the production-parse-body harness
(`FRONTMATTER`/`diagsOf`/`rowsOf`/`fnParamCarrier`) rather than sharing one
declaration. A change to the DIAG-4 message-filling contract or to the
`fn`-parameter withheld-binder carrier shape (both files' own comments note
this carrier is the one "the settled fix" and "bug 0247" currently share) has
to be made twice to stay in sync between the two files.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting the `RegistryRow`/`msg`-style
registry-message filler and the `FRONTMATTER`/`diagsOf`/`rowsOf`/
`fnParamCarrier` production-parse-body harness is the shape both files already
converge on independently.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or its named kin; the
  cited lines are harness/oracle declarations, not a pinned count or
  inventory.
- Recording-double check: none of the cited functions is a fake that records
  calls to back a MUST-NOT-called witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "withheld-sentinel-author-twin-provenance\|withheld-sentinel-mooting-and-render-pins" docs/bugs/*.md` → docs/bugs/0143, docs/bugs/0247, docs/bugs/0252 each name one or both files as their reproduction/witness files; none documents the HARNESS duplication itself as a correct-reason red, and this finding proposes no merge, rename, or deletion of either file or any `it()`/`describe()` block — only that the shared oracle/harness declarations could be centralised.
- coverage-matrix/bug-doc citation search: `grep -n "withheld-sentinel-author-twin-provenance\|withheld-sentinel-mooting-and-render-pins" docs/reference/coverage-matrix.md` → 0 hits.
- Overlap check: `grep -rli "RegistryRow\|fnParamCarrier" quality/intake/*.md quality/resolved/*.md` (excluding this file) → no hits naming this pair of files or this specific harness duplication.
- Coverage-drift check: this finding is about a harness declaration repeated across two files that already exist and already pass; it makes no claim that any behaviour or path is untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: every excerpt reproduces at the cited lines (own diff: FRONTMATTER/diagsOf/rowsOf at 239-250 vs 155-165 and fnParamCarrier at 252-254 vs 374-376 byte-identical bar one blank line; msg() bodies differ only in the one "code-registry-parse.md" vs "the sharded registry" assertion clause; RegistryRow identical; the REGISTRY read itself differs one-page vs two-shard and the filing correctly did not claim it identical), fnParamCarrier greps to these two files only, neither file imports tests/helpers/registry-oracle.ts (30 other test files do; it already exports RegistryRow + readRegistry(["parse"]) / readRegistry(["parse","load"]) covering both local REGISTRY reads — the PTQ-0215/0222/0237/0250/0260/0275/0311/0313/0404/0411/0412 class, none of which cites either file), both files were added together in 24093511 as one split witness, both green (22/22 vitest), bugs 0143/0247/0252 all fixed so no correct-reason-red carve-out, not a gate file, coverage-matrix 0 hits, sibling intake d7-161-02 cites a disjoint file — genuine D7 boilerplate/copy-paste-fixture duplication confined to tests/; fixer note: registry-oracle.ts's header rules the per-file msg()-shaped reader "stays local" (58 test files declare one), so the mandatory dedupe is the RegistryRow/REGISTRY read via readRegistry plus the FRONTMATTER/diagsOf/rowsOf/fnParamCarrier quartet; sharing msg() between these two files is permitted, not required (triage: claude-fable-5-1)
