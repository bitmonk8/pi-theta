---
id: PTQ-1741
title: The callee post-parse seam test redeclares the shared thetalib filesystem double.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/callee-post-parse-errors-un-register-tools-caller.test.ts:237-270
  - tests/callee-post-parse-errors-un-register-tools-caller.test.ts:613-621
  - tests/helpers/thetalib-load-harness.ts:89-137
sites: 1
fix_scope: module
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The callee post-parse seam test redeclares the shared thetalib filesystem double.

## Observation
The post-parse callee test defines `memoryFs` to derive directory entries from a path-to-text map and implement `readdir` and UTF-8 `readBytes`. Its remaining asynchronous filesystem members reject with a fixed unexpected-use error. `tests/helpers/thetalib-load-harness.ts` already exports `fakeThetaLibFs` with these same mechanisms, plus optional unreadable paths and an own-property check. The local double is used by the existing direct import-check seam cell; the count is one local reimplementation, with the helper shown for comparison.

## Evidence
`tests/callee-post-parse-errors-un-register-tools-caller.test.ts:237-247`:
```ts
function memoryFs(files: Readonly<Record<string, string>>): FileSystem {
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
```

`tests/callee-post-parse-errors-un-register-tools-caller.test.ts:258-270`:
```ts
    readdir: (path: string): Promise<readonly string[]> => {
      const entries = dirs.get(path);
      return entries === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(entries);
    },
    readBytes: (path: string): Promise<Uint8Array> => {
      const content = files[path];
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  } as FileSystem;
```

`tests/helpers/thetalib-load-harness.ts:89-103`:
```ts
export function fakeThetaLibFs(
  files: Record<string, string>,
  unreadable: readonly string[] = [],
): FileSystem {
  const dirs = new Map<string, string[]>();
  const list = (path: string): void => {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  };
  for (const path of Object.keys(files)) list(path);
  for (const path of unreadable) list(path);
  const unreadableSet = new Set(unreadable);
```

`tests/helpers/thetalib-load-harness.ts:104-115`:
```ts
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
```

`tests/helpers/thetalib-load-harness.ts:116-121`:
```ts
    readdir: (path: string): Promise<readonly string[]> => {
      const entries = dirs.get(path);
      return entries === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(entries);
    },
```

`tests/helpers/thetalib-load-harness.ts:130-137`:
```ts
      const content = Object.prototype.hasOwnProperty.call(files, path)
        ? files[path]
        : undefined;
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  } as FileSystem;
```

`tests/callee-post-parse-errors-un-register-tools-caller.test.ts:613-621`:
```ts
    const check = await checkThetaImports(input, {
      fs: memoryFs({ "/proj/b0267lib.thetalib": BROKEN_LIB_SOURCE }),
      parseDeps: parseDeps(),
    });
    const errors = check.diagnostics.filter((d) => d.severity === "error");
    expect(
      errors.map((d) => d.code),
      "the import check over the same parsed input must un-register the callee",
    ).not.toEqual([]);
```

## Why this is a problem
This is D7's copy-paste-double class: the existing test maintains directory derivation, missing-path rejection and byte encoding independently of the canonical helper implementing those same operations. The displayed `readdir` bodies are identical, and the byte readers differ in lookup guarding rather than in the fixture's requested behavior. The stimulus supplied here is one own string-valued path with no unreadable override, a shape the shared double already accepts. The observation concerns duplicated test machinery, not a filesystem behavior defect.

## Suggested direction (non-binding, optional)
`tests/helpers/thetalib-load-harness.ts` is the existing shared home for this import-check filesystem double.

## False-positive check
- Gate-pin: the scoped file is not a census/pin gate; no count or inventory assertion is challenged.
- Recording-double: this double serves fixture bytes and rejects unexpected operations; it does not record calls. No MUST-NOT witness or fail-loud rejection is challenged.
- docs/bugs/ signature search: searched `docs/bugs/` and `docs/reference/coverage-matrix.md` for `memoryFs`, `fakeThetaLibFs`, and the scoped filename. The filename is cited by bugs 0267, 0270, 0271, 0275 and 0276; bug 0304 mentions duplication of `fakeThetaLibFs`. Those records do not make the local duplicate a required failure signature. No claim is made that any documented red should be weakened or disabled.
- Coverage-matrix/bug-doc citation: the same search found no coverage-matrix citation; the bug-document filename citations above are retained. No test merge, rename or deletion is proposed.
- Existing-topic: searched `quality/` for `memoryFs` and the scoped filename. PTQ-0428 and PTQ-1425 concern workspace/load/drop-route helpers, and PTQ-0525 concerns the live-cell registry reader, not this local filesystem definition.
- Intent/history: inspected file history and the shared helper's current explanatory header. The helper explicitly centralizes the flat-map directory/readBytes double for real import checks; the scoped cell uses that same seam.
- Scope: only existing test-double duplication is reported. There is no coverage, suite-composition, runtime-risk or production-code claim.

## Triage
verdict: confirmed — All excerpts and stated searches reproduce: memoryFs duplicates the shared fakeThetaLibFs directory derivation, ENOENT handling, byte encoding and unexpected-use rejection, and its sole seam call needs neither unreadable paths nor inherited-key lookup; this is tests-only copy-paste-double machinery, with no gate/recording-witness carve-out, no requirement in the cited bug records to retain the local definition, and no prior issue prescribing or tracking this copy (PTQ-0428/1425 cover other harness helpers; PTQ-0525 covers live registry readers). (triage: claude-opus-5-5)
