---
id: PTQ-0817
title: reserved-keyword-misfire-faces.test.ts's REGISTRY/msg() re-derives tests/helpers/load-row-harness.ts's PARSE_REGISTRY/registryMessageOf
lens: D7
status: open
verdict: confirmed
locations:
  - tests/reserved-keyword-misfire-faces.test.ts:135-190
  - tests/helpers/load-row-harness.ts:34-77
sites: 2
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# reserved-keyword-misfire-faces.test.ts's REGISTRY/msg() re-derives tests/helpers/load-row-harness.ts's PARSE_REGISTRY/registryMessageOf

## Observation
`tests/reserved-keyword-misfire-faces.test.ts` declares its own module-scope `RegistryRow` interface, its own `REGISTRY` constant (a `readFileSync`+`fileURLToPath`+`parseRegistry` read of `docs/spec_topics/diagnostics/code-registry-parse.md`), and its own `msg(code, fills)` function that reads a row's *Message* template, asserts it is defined, asserts each fill placeholder is present, substitutes it, and returns the filled string. `tests/helpers/load-row-harness.ts` already exports the identical read (`PARSE_REGISTRY`, parsing the same page) and the identical fill-and-assert function (`registryMessageOf`), parameterised on the registry array and page path rather than closed over module-scope constants. The in-scope file imports `parseRegistry`/`registryMessage` directly from `tools/code-registry/index.js` and never imports `tests/helpers/load-row-harness.ts`.

## Evidence
`tests/reserved-keyword-misfire-faces.test.ts:135-190`:
```ts
interface RegistryRow {
  readonly code: string;
  readonly severity: string;
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
...
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

`tests/helpers/load-row-harness.ts:34-77` — the canonical helper already exporting the same read and the same function, only parameterised:
```ts
export interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** A parsed row of `code-registry-parse.md`, with the four columns several `b02xx` files read. */
export interface ParseCodeRegistryRow extends RegistryRow {
  readonly severity: string;
  readonly phase: string;
}

/** The single-page diagnostics registry several `b02xx` load harnesses share. */
export const PARSE_REGISTRY_PATH = "docs/spec_topics/diagnostics/code-registry-parse.md";

/** `code-registry-parse.md`, parsed once. */
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

The two `msg`/`registryMessageOf` bodies are byte-identical apart from `registry`/`registryPath` being closure constants in the in-scope file versus explicit parameters in the helper, and the two `REGISTRY`/`PARSE_REGISTRY` reads are byte-identical apart from the relative-path depth (`../` from `tests/` vs `../../` from `tests/helpers/`) needed to reach the same target page.

## Why this is a problem
The same "read `code-registry-parse.md` off disk through `parseRegistry`, then read one row's *Message* template with placeholder-presence assertions and substitution" sequence is authored twice: once as the exported, parameterised, shared helper in `tests/helpers/load-row-harness.ts` (itself created, per its own header, to end exactly this kind of per-file redeclaration for the `b02xx` files), and again as an unexported, closure-bound duplicate inside the in-scope file. A change to the registry-row shape, the page path, or the placeholder-substitution rule has to be hand-applied at both declaration sites.

## Suggested direction (non-binding, optional)
`tests/helpers/load-row-harness.ts`'s exported `PARSE_REGISTRY` and `registryMessageOf` already cover this exact page and this exact fill-and-assert sequence; the in-scope file's `REGISTRY`/`msg()` pair sits on the same convergence point that pattern already serves other `b02xx`-style files.

## False-positive check
- Gate-pin check: `tests/reserved-keyword-misfire-faces.test.ts` does not match `*gate*.test.ts` or a named gate kind; not a census/pin gate.
- Recording-double check: `REGISTRY`/`msg()` read a static doc page and fill a message template; neither is a recording double or a MUST-NOT witness.
- docs/bugs/ signature search: `grep -rl "REGISTRY\b" docs/bugs/0242-reserved-keyword-refusal-misfires-on-three-faces.md` shows only prose references to the diagnostics registry as a spec artefact, none naming this file's local `REGISTRY`/`msg()` declaration as a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "reserved-keyword-misfire-faces" docs/reference/coverage-matrix.md` returns 0 hits; no merge, rename, or deletion of the file or any cell is proposed — only that `REGISTRY`/`msg()` could read off the already-exported helper.
- Prior-filing search: `grep -rl "reserved-keyword-misfire-faces" quality/issues quality/intake` before this filing returns only `PTQ-0618` (a different file, `tests/live/reserved-keyword-misfire-faces-live-cell.test.ts`, covering a different function, `reservedKeywordFragment`) and `PTQ-0646`/`PTQ-0645` (the sibling in-scope file, covering `rootDouble`/`producer`/`execute`/`expectValue`/`DiagShape`/`shapes`/`render`, none of which name `REGISTRY` or `msg`); no existing filing already tracks this specific `REGISTRY`/`msg()` pairing against `load-row-harness.ts`.

## Triage
verdict: confirmed — independently re-verified: RegistryRow/REGISTRY/msg reproduce verbatim at tests/reserved-keyword-misfire-faces.test.ts:135-139/141-148/175-190; own diff of the msg body (:176-189) against tests/helpers/load-row-harness.ts registryMessageOf (:68-81) after `REGISTRY`→`registry` and path-literal→`${registryPath}` substitution is empty, and REGISTRY is `PARSE_REGISTRY` (:50-55) bar `../` depth; imports (:1-10) confirm 0 load-row-harness imports vs 33 elsewhere in tests/; the helper's ParseCodeRegistryRow carries the `severity`+`message` fields the file's only extra REGISTRY use (:363-374) reads, so it is a drop-in; both locations under tests/, D7 boilerplate-duplication class, not a gate file, not a recording double, coverage-matrix → 0, and bug docs citing the file as a witness are immaterial since no merge/rename/delete is proposed (filing's bug-0242 `REGISTRY\b` grep actually yields 0 hits, not prose — immaterial); not a duplicate: no PTQ names this file's REGISTRY/msg (PTQ-0618 is the live cell's reservedKeywordFragment; sibling intake d7-02 is lines()/at() at :214-237), and identical single-file pairs were ruled individually as PTQ-0495/0616/0569/0567 (triage: claude-fable-5-1)
