---
id: PTQ-0527
title: b0290's local message() reimplements the exported messageEntry fixture from tests/live/harness.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/b0290-re-ask-count-observable.test.ts:76-78
  - tests/live/harness.ts:849-851
sites: 1
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0290's local message() reimplements the exported messageEntry fixture from tests/live/harness.ts

## Observation
tests/b0290-re-ask-count-observable.test.ts declares its own local
`message(role, content, stopReason)` helper at lines 76-78, whose body is
byte-identical to `messageEntry(role, content, stopReason)`, exported from
tests/live/harness.ts at lines 849-851. tests/b0290-re-ask-count-observable.test.ts
already imports from `./live/harness` (`liveHarness` namespace and
`failLoudly`) but does not import `messageEntry`. The sibling file
tests/b0289-settled-empty-text-turn-classification.test.ts, reviewed in the
same wave, imports the canonical export directly (`messageEntry as message`)
instead of redeclaring it.

## Evidence
tests/b0290-re-ask-count-observable.test.ts:76-78:
```ts
function message(role: string, content: unknown, stopReason?: string): unknown {
  return { type: "message", message: { role, content, stopReason } };
}
```

tests/live/harness.ts:849-851:
```ts
export function messageEntry(role: string, content: unknown, stopReason?: string): unknown {
  return { type: "message", message: { role, content, stopReason } };
}
```

tests/b0289-settled-empty-text-turn-classification.test.ts:1-5 (the sibling
file in the same wave, importing the canonical export instead of
redeclaring it):
```ts
import { describe, expect, it } from "vitest";
import * as liveHarness from "./live/harness";
import {
  failLoudly,
  messageEntry as message,
```

## Why this is a problem
The fixture body — `{ type: "message", message: { role, content, stopReason } }`
shaping one `SessionManager` message entry — already exists as a named,
exported helper in tests/live/harness.ts and is consumed under an aliased
name (`messageEntry as message`) by another file in this same bug lineage
(tests/b0289-settled-empty-text-turn-classification.test.ts). b0290 imports
other symbols from the same module (`failLoudly`) but reimplements this one
locally rather than importing it the same way its sibling does.

## Suggested direction (non-binding, optional)
Importing `messageEntry as message` from `./live/harness`, the way the
sibling b0289 file already does, is the same-shaped fix the duplication
points at.

## False-positive check
Gate-pin: the file name matches no `*gate*.test.ts` pattern; not a
census/pin gate. Recording-double: `message()` constructs a fixture entry, it
does not record calls for a MUST-NOT witness — carve-out does not apply.
docs/bugs/ signature search: docs/bugs/0290-exact-rendered-query-counts-red-when-bug-0289s-bounded-re-ask-fires.md
describes the re-ask counting behaviour, not this local reimplementation;
no documented correct-reason red covers it. coverage-matrix/bug-doc citation
search: `grep -rn "b0290-re-ask-count-observable" docs/reference/coverage-matrix.md
docs/bugs/` found no citation pinning this file's helper structure. This is a
claim about code that exists (a redundant local function), not a claim that a
test is missing.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: b0290:76-78 and harness.ts:849-851 bodies are byte-identical, b0290 already imports from ./live/harness yet is now the ONLY remaining local `function message(role` copy in tests/ (b0287 and b0289 import `messageEntry as message`); not a duplicate of resolved PTQ-0229, which listed only b0287/b0289 as locations, explicitly called b0290 "outside this review's scope", and whose fix commit c85b0239 did not touch b0290 (residual copy, same posture as PTQ-0228); the file's only "declared locally" rationale (line 45) covers the CaptureSettledTurn type, not message(); not a gate test, not a recording double, docs/bugs/0290 cites the file as witness without pinning helper structure, coverage-matrix has no citation; sibling intake d7-03 covers different helpers (81-108) (triage: claude-fable-5-1)
