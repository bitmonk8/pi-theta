---
id: PTQ-0789
title: b0413 and b0415 each redeclare ANTHROPIC_MODEL, SessionEntryDouble and the entry-append body already exported by tests/helpers/scripted-live-session-harness.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0413-pic51b-non-error-terminators-witness.test.ts:106-111
  - tests/b0413-pic51b-non-error-terminators-witness.test.ts:135-141
  - tests/b0413-pic51b-non-error-terminators-witness.test.ts:221-225
  - tests/b0415-governor-max-rounds-final-boundary.test.ts:80-85
  - tests/b0415-governor-max-rounds-final-boundary.test.ts:100-106
  - tests/b0415-governor-max-rounds-final-boundary.test.ts:200-204
  - tests/helpers/scripted-live-session-harness.ts:44-49
  - tests/helpers/scripted-live-session-harness.ts:52-57
  - tests/helpers/scripted-live-session-harness.ts:90-94
sites: 6
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0413 and b0415 each redeclare ANTHROPIC_MODEL, SessionEntryDouble and the entry-append body already exported by tests/helpers/scripted-live-session-harness.ts

## Observation
tests/b0413-pic51b-non-error-terminators-witness.test.ts and tests/b0415-governor-max-rounds-final-boundary.test.ts each locally declare a module-scope `ANTHROPIC_MODEL` fixture-model constant, a `SessionEntryDouble` interface, and a private `#append(message)` id/parentId-chaining method on their respective session-double classes. `tests/helpers/scripted-live-session-harness.ts` — the file both tests already import `parse`/`ajv` from (per the resolved PTQ-0447 fix) — exports `ANTHROPIC_MODEL`, `SessionEntryDouble` and an `appendMessageEntry` helper performing the identical id/parentId derivation, built specifically to hold "the pieces that carry no cell-specific variation" across this prompt-mode-witness lineage.

## Evidence

`tests/helpers/scripted-live-session-harness.ts:44-49` (canonical, exported):
```ts
export const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};
```

`tests/b0413-pic51b-non-error-terminators-witness.test.ts:106-111` (local redeclaration, identical values):
```ts
const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};
```

`tests/b0415-governor-max-rounds-final-boundary.test.ts:80-85` (same values again):
```ts
const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};
```

`tests/helpers/scripted-live-session-harness.ts:52-57` (canonical, exported):
```ts
export interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}
```

`tests/b0413-pic51b-non-error-terminators-witness.test.ts:135-141` (local redeclaration, byte-identical field list):
```ts
/** A `SessionManager` message entry (the `buildSessionContext` read shape). */
interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}
```

`tests/b0415-governor-max-rounds-final-boundary.test.ts:100-106` (same fields again, module-local):
```ts
/** A `SessionManager` message entry (the `buildSessionContext` read shape). */
interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}
```

`tests/helpers/scripted-live-session-harness.ts:90-94` (canonical entry-append body):
```ts
function appendMessageEntry(entries: SessionEntryDouble[], message: Record<string, unknown>): void {
  const id = `e${entries.length + 1}`;
  const parentId = entries.length === 0 ? undefined : `e${entries.length}`;
  entries.push({ type: "message", id, parentId, message });
}
```

`tests/b0413-pic51b-non-error-terminators-witness.test.ts:221-225` (same id/parentId derivation, inlined as a private method):
```ts
  #append(message: Record<string, unknown>): void {
    const id = `e${this.entries.length + 1}`;
    const parentId = this.entries.length === 0 ? undefined : `e${this.entries.length}`;
    this.entries.push({ type: "message", id, parentId, message });
  }
```

`tests/b0415-governor-max-rounds-final-boundary.test.ts:200-204` (same body again):
```ts
  #append(message: Record<string, unknown>): void {
    const id = `e${this.entries.length + 1}`;
    const parentId = this.entries.length === 0 ? undefined : `e${this.entries.length}`;
    this.entries.push({ type: "message", id, parentId, message });
  }
```

All three pairs are byte-for-byte identical between b0413 and b0415, and each also matches the canonical helper's exported/module-scope counterpart (modulo `export` and the free-function-vs-private-method form of the append body). `grep -n "^const ANTHROPIC_MODEL\|^interface SessionEntryDouble" tests/b0413-pic51b-non-error-terminators-witness.test.ts tests/b0415-governor-max-rounds-final-boundary.test.ts` finds exactly these two sites per file; neither file imports `ANTHROPIC_MODEL` or `SessionEntryDouble` from `./helpers/scripted-live-session-harness` even though both already import `parse`/`ajv` from that same module.

## Why this is a problem
Both files are the same prompt-mode-witness lineage tests/helpers/scripted-live-session-harness.ts was built for — its header names "the fixture model, the `SessionManager` entry shape, ... and the entry-append pair" as exactly the pieces it centralised because they "carry no cell-specific variation between" the lineage's files. b0413 and b0415 already import two of that module's five exported pieces (`parse`, `ajv`, per the resolved PTQ-0447 fix) but still carry their own full copies of the other three (`ANTHROPIC_MODEL`, `SessionEntryDouble`, the append-entry id/parentId derivation) — the same duplication the helper exists to end, left half-migrated.

## Suggested direction (non-binding, optional)
Importing `ANTHROPIC_MODEL` and `SessionEntryDouble` from `./helpers/scripted-live-session-harness` in both files, and routing each file's `#append` through the helper's exported `appendMessageEntry` (or `appendUserEntry`/`appendAssistantEntry`, which already build the same message shapes both files construct inline), would complete the migration PTQ-0447 started.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin patterns; the cited lines are a fixture-model constant, an entry-shape interface, and an id-derivation method, not a pinned count or inventory.
- Recording-double check: `SessionEntryDouble`/`#append` construct fixture data for later reading, not a call-recording double backing a MUST-NOT witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "b0413-pic51b-non-error-terminators-witness\|b0415-governor-max-rounds-final-boundary" docs/bugs/*.md` finds each file's own subject bug doc (0413, 0415), citing the file as its witness but not discussing this harness duplication; both bug docs describe the intended fix's *production* behaviour, not a reason these three declarations must diverge or stay file-local.
- coverage-matrix/bug-doc citation search: `grep -n "b0413-pic51b-non-error-terminators-witness\|b0415-governor-max-rounds-final-boundary" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename or deletion of any `it()`/`describe()`.
- Already-filed check: quality/resolved/PTQ-0447 covers only the `parseDeps`/`parse`/`ajv` trio between these same two files (its own triage note flags `ANTHROPIC_MODEL`/`SessionEntryDouble` duplication as an aside but does not file or fix it — both are still locally redeclared at HEAD, confirmed by direct read); no other PTQ in quality/issues or quality/resolved names `ANTHROPIC_MODEL` alongside b0413 or b0415.
- Coverage check: this claim is about a duplicated fixture-constant/interface/method DEFINITION, not a missing test path; every cell in both files exercises its own copy successfully.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all nine excerpts reproduce at the cited lines; sed-extracted snippets diffed under $TEMP show `ANTHROPIC_MODEL` (b0413 :106-111, b0415 :80-85, helper :44-49) and `SessionEntryDouble` (b0413 :136-141, b0415 :101-106, helper :52-57) byte-identical across all three modulo `export`, and the `#append` body (b0413 :222-224, b0415 :201-203) identical to the helper's `appendMessageEntry` :91-93 modulo `this.`/indent; all three copies are live in both files (2/3/4 and 2/3/3 references), both files import only `parse, ajv` from ./helpers/scripted-live-session-harness (:73, :53), the stated `^const ANTHROPIC_MODEL|^interface SessionEntryDouble` grep hits exactly the four cited sites, coverage-matrix → 0 hits, docs/bugs hits are only 0413/0415's own witness citations, both files pass at HEAD (15/15); the PTQ-0447 fix commit cc0a8fe7 removed only parseDeps/parse/ajv from these two files and left these three declarations untouched, so this is a genuine half-migrated residual of the PTQ-0328 helper in the same per-file pattern PTQ-0754/0459/0464/0556/0564/0572/0668/0726/0728 were each confirmed on — no existing/resolved row or same-wave sibling cites these b0413/b0415 ranges (siblings cite prompt-provider-field-derivation and ctor-proto-named-field), D7 boilerplate/copy-paste-fixture class in tests/ only, not a gate test, not a recording double, no merge/rename/delete proposed; one correction on record: the helper's `appendMessageEntry` carries no `export` (helper :90 is module-private; only `appendUserEntry`/`appendAssistantEntry` are exported), so routing b0413's `toolResult` append through it requires exporting it first — non-refuting (triage: claude-fable-5-1)
