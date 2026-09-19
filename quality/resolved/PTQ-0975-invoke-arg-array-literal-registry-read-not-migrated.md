---
id: PTQ-0975
title: invoke-arg-array-literal-provable.test.ts hand-parses the parse-shard registry page instead of calling registry-oracle.ts's readRegistry, which it already imports from
lens: D7
wave: qw20260918131151
status: fixed
verdict: confirmed
locations:
  - tests/invoke-arg-array-literal-provable.test.ts:1
  - tests/invoke-arg-array-literal-provable.test.ts:12
  - tests/invoke-arg-array-literal-provable.test.ts:82-96
  - tests/helpers/registry-oracle.ts:21-45
sites: 1
fix_scope: localized
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# invoke-arg-array-literal-provable.test.ts hand-parses the parse-shard registry page instead of calling registry-oracle.ts's readRegistry, which it already imports from

## Observation
`tests/invoke-arg-array-literal-provable.test.ts` already imports `interpolateStrict` from `./helpers/registry-oracle` (line 1). For its own `REGISTRY` value, it does not call that same module's exported `readRegistry(["parse"])` — instead it imports `parseRegistry` directly from the raw `tools/code-registry/index.js` module (line 12) and re-implements, in its own module scope, the identical "read the `code-registry-parse.md` file via `fileURLToPath`/`readFileSync`, then run it through `parseRegistry`" sequence that `readRegistry` already performs, declaring its own narrower local `RegistryRow` interface (four fields instead of `registry-oracle.ts`'s six) to type the result.

## Evidence
`tests/invoke-arg-array-literal-provable.test.ts:1,12` (re-read immediately before filing):
```ts
import { interpolateStrict } from "./helpers/registry-oracle";
...
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
```

`tests/invoke-arg-array-literal-provable.test.ts:82-96`:
```ts
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)),
    "utf8",
  ),
) as RegistryRow[];
```

`tests/helpers/registry-oracle.ts:21-45` — the canonical export this duplicates:
```ts
/** A parsed row of the sharded code registry, as `parseRegistry` yields it. */
export interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** Read only the requested shards, preserving page-specific registry oracles. */
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
`readRegistry(["parse"])` reads the exact same single file (`docs/spec_topics/diagnostics/code-registry-parse.md`) through the same `parseRegistry` call the file's own `REGISTRY` constant uses; the module already exporting it is the module the file's very first import line already draws from.

## Why this is a problem
`registry-oracle.ts`'s own header states it exists because the four-shard registry read "were redeclared byte-for-byte ... in several test files," and centralises exactly this read. `invoke-arg-array-literal-provable.test.ts` sits in the position that finding was written to prevent — it imports the module for one export (`interpolateStrict`) and, one import line later, reaches past it to the raw `tools/code-registry/index.js` module to retype the identical single-shard read the sibling export already performs. A change to how the shard files are located or parsed (the `fileURLToPath`/`readFileSync`/`parseRegistry` sequence) needs a matching hand-edit in this file in addition to `registry-oracle.ts`.

## Suggested direction (non-binding, optional)
Replacing the local `REGISTRY_PAGE`/`RegistryRow`/`REGISTRY` block with `readRegistry(["parse"])` is the substitution the already-imported sibling export exists for; the local four-field `RegistryRow` is a subset of the six-field exported one, so the file's own `registered()`/`fill()` readers (which only ever touch `code`/`message`) would need no further change.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or a named gate kin; not applicable.
- Recording-double check: `REGISTRY` is a parsed-markdown data table, not a "never called" recording double; not applicable.
- docs/bugs/ signature search: `grep -n "invoke-arg-array-literal-provable" docs/bugs/*.md` returns no hit naming this file's registry read as a documented correct-reason red; the file's own suite passes at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n "invoke-arg-array-literal-provable" docs/reference/coverage-matrix.md` returns no hit; this finding proposes no merge, rename, or deletion of any `it()`/`describe()`, only that the registry-read block import the already-adjacent sibling export.
- Prior-filing search: `grep -rl "invoke-arg-array-literal-provable" quality/issues quality/intake quality/resolved` (excluding this file) returns no hit for this root cause; the large `registry-oracle`-reimplemented PTQ family (PTQ-0404/0498/0634/0710/0718/0734/0757/0776/0908/0921/0948/0949, etc.) each name a disjoint file or file pair, and none names `invoke-arg-array-literal-provable.test.ts`.
- Coverage-drift check: this claim is about a duplicated registry-read DECLARATION in code that exists and passes; no assertion is made about a missing test path.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim (tests/invoke-arg-array-literal-provable.test.ts:1,12,82-96; tests/helpers/registry-oracle.ts:21-45), the local block reads the identical single `code-registry-parse.md` through the identical `fileURLToPath`/`readFileSync`/`parseRegistry` sequence that the already-imported module's `readRegistry(["parse"])` performs, and the fold is mechanical — the file's `REGISTRY` consumers read only `code`/`severity`/`phase`/`message` (registered():104, A1:513-517, A3:532, A4:539-546; the candidate's "only code/message" aside undercounts but the exported six-field `RegistryRow` is a superset either way), `REGISTRY_PAGE` stays live in the :107 error string, `parseRegistry` and `fileURLToPath` have no other use in the file; D7 boilerplate-duplication inside tests/, not a gate file, not a recording double, docs/bugs 0146/0452 cite the file for behaviour/pass-status only, coverage-matrix 0 hits, no it()/describe() touched; NOT a duplicate but note the candidate's prior-filing search does not reproduce as stated — `grep -rl` hits 11 quality files naming this test, of which the three open ones (PTQ-0599/0606/0814) cover different helpers and resolved PTQ-0468 listed this file among its 22-file sweep yet its fix left the local read in place (58 files still declare `const REGISTRY = parseRegistry(` at HEAD), so per PTQ-0468's own triage note this is a per-file residual the store files separately (PTQ-0250/0327/0412 precedent), and PTQ-0777 names tests/live/live-production-acceptance.test.ts only (triage: claude-fable-5-1)
