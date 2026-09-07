---
id: pending
title: EnvelopeScan's unparseableLines field is produced only by scanStreamForEnvelope, which its own doc records as having no src/ caller, and the doc states the field exists for a future caller
lens: D2
status: intake
verdict: pending
locations:
  - src/runtime/subagent-envelope.ts:423-434
  - src/runtime/subagent-envelope.ts:442-457
sites: 2
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# EnvelopeScan's unparseableLines field is produced only by scanStreamForEnvelope, which its own doc records as having no src/ caller, and the doc states the field exists for a future caller

## Observation
`EnvelopeScan` carries `unparseableLines` on both of its arms. The only
producer of an `EnvelopeScan` value is `scanStreamForEnvelope`, and the field's
own doc-comment records two facts about it: that `scanStreamForEnvelope` "has
no `src/` caller at HEAD, so it emits no diagnostic of its own", and that "the
field exists so a future caller inherits the class separation rather than
having to rediscover it". Confirmed against current code: no file under src/,
extensions/ or tools/ calls `scanStreamForEnvelope`, and the field is read
only in one test file, through a structural cast.

## Evidence
The declaration and the stated rationale —
src/runtime/subagent-envelope.ts:423-434:
```ts
/**
 * The stream-scan verdict: whether a reserved-key envelope line was found, its
 * parse, and every unparseable line skipped along the way (stream order,
 * excluding valid non-envelope JSON) — so this scanner no longer merges the
 * unparseable class into silence a second time (bug 0086 §Actual behaviour
 * item 5). `scanStreamForEnvelope` has no `src/` caller at HEAD, so it emits
 * no diagnostic of its own; the field exists so a future caller inherits the
 * class separation rather than having to rediscover it.
 */
export type EnvelopeScan =
  | { readonly found: false; readonly unparseableLines: readonly string[] }
  | { readonly found: true; readonly parse: EnvelopeParse; readonly unparseableLines: readonly string[] };
```

The sole producer — src/runtime/subagent-envelope.ts:442 and its body at
:446-457 (lines 443-445 are an explanatory comment), whose `unparseableLines`
mentions are the only construction of the field anywhere:
```ts
export function scanStreamForEnvelope(lines: readonly string[]): EnvelopeScan {
```
```ts
  const unparseableLines: string[] = [];
  for (const line of lines) {
    const classified = classifyChildStdoutLine(line);
    if (classified.kind === "envelope") {
      return { found: true, parse: parseEnvelopeLine(line), unparseableLines };
    }
    if (classified.kind === "unparseable") {
      unparseableLines.push(classified.line);
    }
  }
  return { found: false, unparseableLines };
}
```

Producer reachability. `grep -rn "\bscanStreamForEnvelope\b" --include=*.ts
--include=*.js src extensions tools` → 3 hits, all inside
src/runtime/subagent-envelope.ts (header line 15, doc line 428, declaration
line 442). No call site outside the declaring module.

Field readers. `grep -rn "\bunparseableLines\b" --include=*.ts src extensions
tools tests` → 6 hits in src/runtime/subagent-envelope.ts (the two declaration
arms and the four producer lines above) and 4 hits in
tests/subagent-wire-parse-failed-classifier.test.ts:112-113 and :124-125, each
of which reaches the field through a structural cast rather than the declared
type:
```ts
    const skipped = (scan as unknown as { readonly unparseableLines?: readonly string[] })
      .unparseableLines;
```

The production consumer of the same line classification does not use this
scanner: src/runtime/subagent-json-driver.ts:173 calls
`classifyChildStdoutLine(line)` directly and maintains its own emission bound.

## Why this is a problem
Speculative generality: an accumulated result field whose user count in
production is zero, added — by the doc's own words — for a caller that does not
exist ("so a future caller inherits the class separation"). The shape it widens
is itself produced by a function with no production caller, so nothing in the
shipped system can observe the separation the field encodes; the one real
consumer of the same classification, `subagent-json-driver.ts`, bypasses the
scanner entirely.

## Suggested direction (non-binding, optional)
The mechanical question is whether the stray-line scanner is a surface the
parent leg is meant to grow into or a residue of the pre-RFC-0006 parent-side
drive; the answer decides whether the field wants a real consumer or the
scanner wants to stop publishing a class separation nothing consumes.

## False-positive check
- Producer search: `grep -rn "\bscanStreamForEnvelope\b" --include=*.ts
  --include=*.js src extensions tools` → only the three self-references listed
  above; `grep -rn "\bscanStreamForEnvelope\b" --include=*.ts tests` → 7 hits
  across tests/subagent-envelope.test.ts and
  tests/subagent-wire-parse-failed-classifier.test.ts.
- Tests-are-callers check: this is deliberately NOT filed as a deadness claim.
  `scanStreamForEnvelope` is test-reachable and therefore alive under this
  repository's convention; the charge is that `unparseableLines` is a widening
  of its result whose stated purpose is a future caller, with zero production
  users today.
- Field search: `grep -rn "\bunparseableLines\b" --include=*.ts src extensions
  tools tests` → the 10 hits enumerated above and no others; no production file
  outside the declaring module names it.
- Dynamic / string-keyed access: searched for the quoted spelling
  `"unparseableLines"` and `["unparseableLines"]` across src/, extensions/,
  tools/, tests/ — no hits beyond the dotted accesses already counted.
- Re-export check: `grep -rn "export \*" --include=*.ts src extensions tools
  tests` → no hits anywhere in the repository.
- Git history intent check: `git log --oneline -- src/runtime/subagent-envelope.ts`
  shows 470071d8 (bug 0086, "widened EnvelopeScan in subagent-envelope.ts") as
  the commit that added the field; the same commit's diff removes this module's
  own `lineCarriesReservedKey` call and wires the driver's emission at
  subagent-json-driver.ts instead of at this scanner.

## Triage
