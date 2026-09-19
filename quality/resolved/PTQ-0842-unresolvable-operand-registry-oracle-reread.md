---
id: PTQ-0842
title: unresolvable-operand-structural-target-adjudication.test.ts re-parses the code-registry-parse.md shard locally instead of importing REGISTRY from tests/helpers/registry-oracle.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/unresolvable-operand-structural-target-adjudication.test.ts:263-279
  - tests/helpers/registry-oracle.ts:20-49
  - tests/union-generic-arm-lowering.test.ts:5
sites: 1
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# unresolvable-operand-structural-target-adjudication.test.ts re-parses the code-registry-parse.md shard locally instead of importing REGISTRY from tests/helpers/registry-oracle.ts

## Observation
`tests/helpers/registry-oracle.ts` exports `readRegistry(shards)` and a
pre-built `REGISTRY: readonly RegistryRow[]` constant that already joins the
`parse`/`load`/`runtime`/`host` code-registry shards (including
`code-registry-parse.md`) through the real `parseRegistry`, with a
`RegistryRow` interface carrying `code`/`namespace`/`severity`/`phase`/
`trigger`/`message`. `tests/unresolvable-operand-structural-target-adjudication.test.ts`
does not import this module; it declares its own narrower `RegistryRow`
interface (`code`/`trigger`/`message`), reads
`docs/spec_topics/diagnostics/code-registry-parse.md` through its own
`corpus()` wrapper, and calls `parseRegistry` on that single page to build
its own `REGISTRY` constant, then uses it exactly the way the sibling
in-scope file uses the canonical export (`registryMessage(REGISTRY, code)`).
`tests/union-generic-arm-lowering.test.ts` — the other file in this same
review's scope — already imports `REGISTRY` from
`./helpers/registry-oracle` for the identical `registryMessage(REGISTRY,
code)` read.

## Evidence
`tests/unresolvable-operand-structural-target-adjudication.test.ts:263-279`
(re-read immediately before filing):
```ts
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const FN_ARG_CODE = "theta/parse/fn-arg-type-mismatch";
const LET_RHS_CODE = "theta/parse/let-rhs-type-mismatch";
const ITERAND_CODE = "theta/parse/non-array-iterand";
// Bug 0262's widening code — the LOAD-REFUSAL oracle the four converted cells
// (b7, b10, e2, e5) assert against. Not part of bug 0144's own registered set;
// read from the SAME live registry so a template drift reds here too.
const UNRESOLVED_NAMED_TYPE_CODE = "theta/parse/unresolved-named-type";

interface RegistryRow {
  readonly code: string;
  readonly trigger: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(corpus(REGISTRY_PAGE)) as RegistryRow[];
```

`tests/helpers/registry-oracle.ts:20-49` (the canonical, already-exported
read covering the same `parse` shard among the four it joins):
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

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);
```

`tests/union-generic-arm-lowering.test.ts:5` (the sibling file in this same
review's scope, importing the canonical export for the identical purpose):
```ts
import { REGISTRY } from "./helpers/registry-oracle";
```

Every code the reviewed file reads off its local `REGISTRY`
(`fn-arg-type-mismatch`, `let-rhs-type-mismatch`, `non-array-iterand`,
`unresolved-named-type`) is a `theta/parse/*` code, so the canonical
`REGISTRY`'s `parse` shard already carries every row this file needs; the
local `RegistryRow` interface's three fields are a strict subset of the
canonical interface's six, so the canonical `REGISTRY` is a drop-in
replacement for every read this file performs (`row(code).trigger`,
`registryMessage(REGISTRY, code)`).

## Why this is a problem
The reviewed file re-executes the same `readFileSync` + `parseRegistry` read
the canonical helper already performs and exports, under a locally-scoped,
narrower `RegistryRow` type and a locally-scoped `REGISTRY` constant, rather
than importing the existing one — even though the other file in this same
review's scope reaches for the canonical export to do the exact same job.
Both files' `registered`/`registryMessage` readers consult a `REGISTRY`
value that a change to the shared helper's shard set or parse recipe would
not reach in this file, because this file's copy is parsed independently
from a private, unshared path.

## Suggested direction (non-binding, optional)
Importing `REGISTRY` from `./helpers/registry-oracle` in place of the local
`interface RegistryRow` / `const REGISTRY = parseRegistry(corpus(REGISTRY_PAGE))`
pair — as the sibling in-scope file already does — would remove the
independent read; `REGISTRY_PAGE` would keep its role naming the page in the
file's own comments and messages.

## False-positive check
- Gate-pin check: the file is not named `*gate*.test.ts` and matches none of
  the named gate kin; the cited `REGISTRY` constant backs a *Message*/
  *Trigger* oracle read, not a pinned count or inventory.
- Recording-double check: not applicable — `REGISTRY` is a static
  markdown-derived array read once and consulted by value; nothing here
  records a call to back a "never called" witness.
- docs/bugs/ signature search: `grep -rl "REGISTRY_PAGE\|RegistryRow"
  docs/bugs/0144-annotated-unresolvable-arg-structural-param-emits.md` → 0
  hits; the bug doc gives no rationale for a file-local registry read.
- coverage-matrix/bug-doc citation search: `grep -n
  "unresolvable-operand-structural-target-adjudication"
  docs/reference/coverage-matrix.md` → 0 hits. docs/bugs/0144 cites this file
  by name and by its own cell ids (a1, b2, b7, d4, ...) for behaviour, never
  for the `REGISTRY`/`RegistryRow` read; this finding proposes no merge,
  rename, or deletion of any `it()`/`describe()` — only that the existing
  helper's export be imported in place of a local re-parse — so no pinned
  citation is disturbed.
- Coverage check: the claim is about a repeated read DEFINITION, not a
  missing test path; the local `REGISTRY` is exercised by every `row`/
  `registered`/`interpolate` call in the file.
- Overlap check: resolved `PTQ-0468-fn-arg-single-page-registry-oracle-duplicated.md`
  names this exact file in its pattern-wide grep of 22 files sharing the
  `REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md"`
  local-read shape, but its own `locations` field cites only four other
  files and its triage explicitly treats un-cited files in that grep as
  separate per-wave residuals (naming PTQ-0250/PTQ-0327/PTQ-0412 as
  precedent); `grep -rl "unresolvable-operand-structural-target-adjudication"
  quality/intake quality/issues quality/resolved` finds PTQ-0547, PTQ-0733-01
  and PTQ-0738-02, none of which names `REGISTRY`, `RegistryRow`, or
  `REGISTRY_PAGE` — this is the first filing to cite this file's own copy of
  that read against the canonical `registry-oracle.ts` export by name.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: the excerpt reproduces verbatim at tests/unresolvable-operand-structural-target-adjudication.test.ts:263-279 (local 3-field `RegistryRow` + `const REGISTRY = parseRegistry(corpus(REGISTRY_PAGE))`), the file imports nothing from ./helpers/registry-oracle (grep → 0) while tests/helpers/registry-oracle.ts:20-49 exports the 6-field `RegistryRow` and four-shard `REGISTRY` (128 test-file importers) and tests/union-generic-arm-lowering.test.ts:5 imports it for the same `registryMessage(REGISTRY, code)` read; the local copy is live (`REGISTRY.find` :283, `registryMessage(REGISTRY,…)` :294, `row(..).trigger` :453/465/537) and each of the four `theta/parse/*` codes it reads is a single row in exactly one shard, so the canonical export is a drop-in; both locations under tests/, D7 boilerplate-duplication class, not a gate file, no recording double, stated searches reproduce (docs/bugs/0144 `REGISTRY_PAGE|RegistryRow` → 0; coverage-matrix → 0; quality/* file-name grep → PTQ-0547/0733-01/0738-02 in issues, none about the registry read, plus resolved PTQ-0468/0510/0683); not a duplicate — resolved PTQ-0468 named this file only in its 22-file pattern grep, its fix migrated only its cited files and 11 residual `REGISTRY_PAGE` local reads remain today including this one, and store precedent (PTQ-0250/0327/0412/0468) files per-wave residuals of the registry-oracle gap separately; no open PTQ names this file's registry read (triage: claude-fable-5-1)
