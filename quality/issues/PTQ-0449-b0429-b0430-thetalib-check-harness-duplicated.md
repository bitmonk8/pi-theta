---
id: PTQ-0449
title: b0429 and b0430 each hand-roll an identical checkThetaImports load harness a canonical tests/helpers/ version already covers
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0429-imported-schema-ctor-field-set.test.ts:133-169
  - tests/b0429-imported-schema-ctor-field-set.test.ts:171-225
  - tests/b0430-imported-enum-unknown-variant.test.ts:141-176
  - tests/b0430-imported-enum-unknown-variant.test.ts:179-233
  - tests/helpers/thetalib-load-harness.ts:70-102
  - tests/helpers/thetalib-load-harness.ts:110-140
sites: 2
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0429 and b0430 each hand-roll an identical checkThetaImports load harness a canonical tests/helpers/ version already covers

## Observation
tests/b0429-imported-schema-ctor-field-set.test.ts and tests/b0430-imported-enum-unknown-variant.test.ts each locally declare a `fakeThetaLibFs` in-memory `FileSystem` double, a `ComposeResult` interface, a `render` diagnostic-line formatter, a `parseApp` wrapper, an `async compose` function that drives `checkThetaImports`, and an `expectMaterialised` precondition helper. These six declarations are either byte-identical or differ only in a doc-comment word choice ("symptom"/"enum" vs "symbol") between the two files. `tests/helpers/thetalib-load-harness.ts` already exports a `fakeThetaLibFs(files: Record<string,string>): FileSystem` with the same signature and near-identical body, plus a `loadThetaLibDiags` driver over `checkThetaImports`, built specifically because three or more prior `b0`-numbered files independently redeclared this exact bundle (its own header cites PTQ-0232, PTQ-0315, PTQ-0347, PTQ-0393 as the same recurring pattern).

## Evidence

tests/b0429-imported-schema-ctor-field-set.test.ts:133-169
```ts
function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  }
  const reject = (): Promise<never> =>
    Promise.reject(new Error("filesystem member not exercised by this test"));
  return {
    readText: reject,
    writeText: reject,
    exists: reject,
    homedir: (): string => "/home",
    cwd: (): string => "/proj",
    configDirName: (): string => ".pi",
    globalAgentDir: (): string => "/home/.pi/agent",
    lstat: reject,
    realpath: reject,
    readdir: (path: string): Promise<readonly string[]> => {
      const entries = dirs.get(path);
      return entries === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(entries);
    },
    readBytes: (path: string): Promise<Uint8Array> => {
      const content = Object.prototype.hasOwnProperty.call(files, path)
        ? files[path]
        : undefined;
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  } as FileSystem;
}
```

tests/b0430-imported-enum-unknown-variant.test.ts:141-176 is the same function body verbatim (the same 36 lines, same parameter shape, same member list, same `hasOwnProperty` guard).

tests/b0429-imported-schema-ctor-field-set.test.ts:171-210 (`ComposeResult`, `render`, `parseApp`, `compose`):
```ts
interface ComposeResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly materialised: readonly string[];
  readonly rendered: readonly string[];
}

function render(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map(
    (d) => `${d.severity} ${d.code} ${d.file === undefined ? "-" : d.file}: ${d.message}`,
  );
}

function parseApp(body: string): ThetaDocument {
  return parseDoc(FM + body, APP_PATH);
}

async function compose(doc: ThetaDocument, libs: Record<string, string>): Promise<ComposeResult> {
  expect(
    doc.frontmatter,
    `PRECONDITION: the importing theta's frontmatter must parse, or the load pass reads nothing. Parse diagnostics: ${JSON.stringify(render(doc.diagnostics))}`,
  ).not.toBeNull();
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: APP_PATH,
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const result = await checkThetaImports(input, {
    fs: fakeThetaLibFs(libs),
    parseDeps: parseDeps(),
  });
  return {
    diagnostics: result.diagnostics,
    materialised: result.imports.map((m) => `${m.kind} ${m.name}`),
    rendered: render(result.diagnostics),
  };
}
```

tests/b0430-imported-enum-unknown-variant.test.ts:179-218 reproduces this block verbatim (identical field names, identical body, identical `expect` message text).

`expectMaterialised` differs only in its doc-comment wording ("the constructor walk" vs "the member-access walk", "exported the symbol" vs "exported the enum with its variant set") — the function body and signature are identical: tests/b0429:220-225, tests/b0430:228-233.

`tests/helpers/thetalib-load-harness.ts:70-102` already exports the same-signature `fakeThetaLibFs` and a `loadThetaLibDiags` driver over `checkThetaImports` that parses the importing document, asserts the frontmatter precondition, and returns `{ appParseCodes, diagnostics, diagLines }` — the same three steps `compose` repeats in both b0429 and b0430, minus the `materialised` field each file additionally derives from `result.imports`.

## Why this is a problem
The same six-declaration bundle (a `FileSystem` double, a result shape, a renderer, a parse wrapper, a compose driver, and a materialisation-precondition helper) is repeated byte-for-byte or near byte-for-byte across two sibling files in this review's scope, and a version of the double plus driver already exists in `tests/helpers/thetalib-load-harness.ts`, built by an earlier fix specifically to end this recurrence (its header names four prior PTQ tickets for the same pattern). Two more instances of the identical bundle exist in files not yet touched by that consolidation.

## Suggested direction (non-binding, optional)
`tests/helpers/thetalib-load-harness.ts` is the natural home; its `fakeThetaLibFs` could be imported directly by both files, and its `loadThetaLibDiags` driver is one `materialised` field away from serving `compose`'s job in both.

## False-positive check
Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin patterns — not applicable. Recording-double check: `fakeThetaLibFs` in both files is a stub double answering fixed reads, not a call-recording double used for a MUST-NOT witness — the negative-witness carve-out does not apply. docs/bugs/ signature search: `docs/bugs/0429-imported-schema-ctor-field-set-never-judged.md` and `docs/bugs/0430-imported-enum-unknown-variant-panics-null-member.md` were read; neither documents a reason the two files' harnesses must diverge or stay file-local. coverage-matrix/bug-doc citation search: `grep -rn "b0429-imported-schema-ctor-field-set\|b0430-imported-enum-unknown-variant" docs/` returns only the two bug docs' own self-references, not `docs/reference/coverage-matrix.md` or any other bug doc's witness list, so neither file is pinned by name elsewhere. This finding does not propose a coverage change — it only observes that the harness code inside the two files' current bodies is repeated.

## Triage
verdict: confirmed — independently re-verified: `fakeThetaLibFs` at b0429:133-169 and b0430:141-176 diff byte-identical, and the `ComposeResult`/`render`/`parseApp`/`compose`/`expectMaterialised` block (b0429:171-225, b0430:179-233) differs only in one doc comment and one failure-message string; both files landed in the same commit fae6d6a4 (repeated drift, not design); tests/helpers/thetalib-load-harness.ts already exports `fakeThetaLibFs` (now at :85-117, differing only by `export` and a hasOwnProperty guard) and `loadThetaLibDiags` (:137-170) performing the same parse→precondition→`checkThetaImports` sequence — helper line citations drifted but content matches; no coverage-matrix pin (docs/ grep re-run: only the two bug docs' own gate lines), no gate/recording-double carve-out, and no issue/resolved ticket names b0429/b0430 (PTQ-0232/0310/0393 cover other b0 files; sibling intake d7-02 is the distinct registry-oracle block) (triage: claude-fable-5-1)
