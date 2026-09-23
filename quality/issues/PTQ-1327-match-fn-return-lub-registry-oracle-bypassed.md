---
id: PTQ-1327
title: match-fn-return-lub-dominating-discipline.test.ts reimplements the registry read and Trigger lookup instead of using tests/helpers/registry-oracle.ts's readRegistry
lens: D7
status: open
verdict: confirmed
locations:
  - tests/match-fn-return-lub-dominating-discipline.test.ts:6-9
  - tests/match-fn-return-lub-dominating-discipline.test.ts:152
  - tests/match-fn-return-lub-dominating-discipline.test.ts:160-176
  - tests/helpers/registry-oracle.ts:1-38
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# match-fn-return-lub-dominating-discipline.test.ts reimplements the registry read and Trigger lookup instead of using tests/helpers/registry-oracle.ts's readRegistry

## Observation
`tests/match-fn-return-lub-dominating-discipline.test.ts` imports `parseRegistry` directly from `tools/code-registry/index.js` and hand-rolls a local `RegistryRow` interface and `trigger()` lookup function over one registry shard (`docs/spec_topics/diagnostics/code-registry-parse.md`). The two other in-scope files in this same wave (`tests/match-pattern-increment-decrement.test.ts` and `tests/member-access-declared-field-type.test.ts`) both instead call `readRegistry(["parse"])` from the shared `tests/helpers/registry-oracle.ts`, which performs the identical read-shard/parse/join sequence and whose own header states it centralises this read because it "were redeclared byte-for-byte (confirmed via `diff`) in several test files."

## Evidence
tests/match-fn-return-lub-dominating-discipline.test.ts:6-9:
```
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry } from "../tools/code-registry/index.js";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { Expr, ThetaDocument } from "../src/parser/theta-document";
```

tests/match-fn-return-lub-dominating-discipline.test.ts:152,160-176:
```
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";
...
interface RegistryRow {
  readonly code: string;
  readonly trigger: string;
}

const REGISTRY = parseRegistry(corpus(REGISTRY_PAGE)) as RegistryRow[];

/** The registered *Trigger* of `code` — the DIAG-2 oracle THE STATED LAW makes normative. */
function trigger(code: string): string {
  const row = REGISTRY.find((r) => r.code === code);
  if (row === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PAGE} carries no row for ${code} — the *Trigger* column is this file's normative oracle (DIAG-2, docs/spec_topics/diagnostics/diagnostic-shape.md "The registry is closed"), so a missing row is a harness failure, never a skip`,
    );
  }
  return row.trigger;
}
```

Compare tests/match-pattern-increment-decrement.test.ts's use of the shared oracle (no local re-parse):
```
import { readRegistry, registryHintOf, type RegistryRow } from "./helpers/registry-oracle";
...
const REGISTRY = readRegistry(["parse"]);
```

and tests/member-access-declared-field-type.test.ts's identical call:
```
import { readRegistry } from "./helpers/registry-oracle";
...
const REGISTRY = readRegistry(["parse"]);
```

tests/helpers/registry-oracle.ts:1-38 (the canonical helper, already exporting exactly this read and a `RegistryRow` type with a `trigger` field):
```
// The shared four-page diagnostics-registry read (PTQ-0215).
//
// WHY THIS FILE EXISTS. `RegistryRow` and the `REGISTRY` load it backs — read
// the four sharded registry pages (code-registry-{parse,load,runtime,host}.md),
// parse each through the real `parseRegistry`, and join the rows into one
// array — were redeclared byte-for-byte (confirmed via `diff`) in several test
// files. This module centralises that read, placeholder interpolation,
// pointer-message composition and the identical live-cell fragment assertions.
...
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
          repoFile(`docs/spec_topics/diagnostics/code-registry-${shard}.md`),
          "utf8",
        ),
      )
      .join("\n"),
  ) as RegistryRow[];
}
```

## Why this is a problem
The two sibling test files reviewed in the same wave already call the shared `readRegistry(["parse"])`, whose own header names the exact motivation ("were redeclared byte-for-byte … in several test files") that this file's local `parseRegistry(corpus(...))` + local `RegistryRow` + local `trigger()` re-enacts: a second, narrower `RegistryRow` (missing `namespace`/`severity`/`phase`/`message`) and a second row-lookup-with-throw function duplicating the shape `readRegistry` plus a caller-side `.find` already provide.

## Suggested direction (non-binding, optional)
The natural home for this file's row lookup is the same `tests/helpers/registry-oracle.ts` the sibling files already call, using its exported `RegistryRow` shape and a `.find` over `readRegistry(["parse"])` in place of the local reimplementation.

## False-positive check
- Gate-pin check: filename does not match `*gate*.test.ts` or the named gate kin; not a census/pin gate.
- Recording-double check: not applicable — no fake/double involved, this is a registry-read helper duplication.
- docs/bugs/ signature search: `grep -n "registry-oracle|readRegistry|parseRegistry" docs/bugs/0158-match-arm-and-fn-return-lub-diverge-from-common-type.md` — no matches; the bug document does not direct or justify this file's bypass of the shared helper.
- coverage-matrix/bug-doc citation search: `grep -rn "match-fn-return-lub-dominating-discipline" docs/reference/coverage-matrix.md docs/bugs/*.md` found citations in docs/bugs/0144, 0158, 0241, 0346 — all cite the file as a witness by name/cell-count, none pin its internal registry-read mechanism; this finding proposes no merge/rename/delete of the test, only names the duplicated read as observation.
- Confirmed via direct read of both files' source (not grep alone) that the local `RegistryRow`/`trigger()` pair in the candidate file has no counterpart import of `tests/helpers/registry-oracle.ts`.

## Triage
verdict: confirmed — independently re-verified: all excerpts reproduce verbatim (test.ts:6-7 `parseRegistry` import from tools/code-registry, :152 `REGISTRY_PAGE`, :160-176 two-field local `RegistryRow` + `parseRegistry(corpus(REGISTRY_PAGE))` + `trigger()` lookup; registry-oracle.ts:20-43 exported superset `RegistryRow` with `trigger` field and `readRegistry(shards)` reading the same code-registry-parse.md through the same `parseRegistry`), the file imports nothing from tests/helpers/registry-oracle, both cited siblings do call `readRegistry(["parse"])` (match-pattern-increment-decrement:11/103, member-access-declared-field-type:1/148), the only lookups are two theta/parse/* codes so the parse-only shard covers every need, all locations in tests/, D7 boilerplate-duplication class with no gate/recording-double carve-out, bug docs 0144/0158/0241/0346 cite the file as a witness only with no registry-read pin; not a duplicate — no PTQ names this file as a location: resolved PTQ-0468 listed it only in its 22-file census and its fix cc0a8fe7 left the local read in place (still present at HEAD after c45a5b12), PTQ-0972's acceptance note listed it among 10 unfiled sibling residuals, and REVIEW_LOG:214 routed it to PTQ-0484 whose locations are only fn-call-arity-unchecked/fn-param-annotation-optional; store precedent (PTQ-0250/0327/0412/0842/0972) files per-file residuals separately; fixer note: `REGISTRY_PAGE` is also read as the error-message string at :171 and should survive as a string constant, and the `trigger()` throw-on-missing lookup has no exported registry-oracle counterpart so it stays local over the shared read (triage: claude-fable-5-1)
