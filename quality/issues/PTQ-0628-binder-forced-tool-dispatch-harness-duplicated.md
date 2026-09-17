---
id: PTQ-0628
title: binder-forced-tool-dispatch.test.ts redeclares the parseDeps/parse/ctxDouble/noteChannelEntries/CapturedNote/TWO_PARAM_THETA sextet tests/e2e-s5-binder-echo-emission.test.ts already carries
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/binder-forced-tool-dispatch.test.ts:163-167
  - tests/binder-forced-tool-dispatch.test.ts:174-183
  - tests/binder-forced-tool-dispatch.test.ts:272-293
  - tests/binder-forced-tool-dispatch.test.ts:357-359
  - tests/binder-forced-tool-dispatch.test.ts:385-387
  - tests/e2e-s5-binder-echo-emission.test.ts:76-80
  - tests/e2e-s5-binder-echo-emission.test.ts:102-122
  - tests/e2e-s5-binder-echo-emission.test.ts:175-177
  - tests/e2e-s5-binder-echo-emission.test.ts:182-191
  - tests/e2e-s5-binder-echo-emission.test.ts:209-211
sites: 2
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# binder-forced-tool-dispatch.test.ts redeclares the parseDeps/parse/ctxDouble/noteChannelEntries/CapturedNote/TWO_PARAM_THETA sextet tests/e2e-s5-binder-echo-emission.test.ts already carries

## Observation
`tests/binder-forced-tool-dispatch.test.ts` declares, module-scope, its own `CapturedNote` interface, `parseDeps()`, `parse(src)`, `ctxDouble()`, `noteChannelEntries()`, and `TWO_PARAM_THETA` fixture — six pieces that are byte-identical (function/const bodies, whitespace and all) to the same six pieces already declared in `tests/e2e-s5-binder-echo-emission.test.ts`, which drives the same production seam (`ProductionThetaProducer.runBinder()` over a mocked `complete()`). `tests/binder-forced-tool-dispatch.test.ts`'s own header comment even calls its harness "the e2e-s5 pattern" ("harness (copied from the e2e-s5 pattern, extended per the header)"), naming the source it typed a fresh copy of rather than importing.

## Evidence

`tests/binder-forced-tool-dispatch.test.ts:163-167` (`CapturedNote`):
```ts
interface CapturedNote {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
}
```

`tests/e2e-s5-binder-echo-emission.test.ts:76-80` (byte-identical):
```ts
interface CapturedNote {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
}
```

`tests/binder-forced-tool-dispatch.test.ts:272-293` (`parseDeps` + `parse`):
```ts
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

/** Parse `.theta` source through the production whole-file parser. */
function parse(src: string) {
  const source: ThetaSource = {
    path: "code-review.theta",
    bytes: new TextEncoder().encode(src),
  };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the binder theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the binder theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}
```

`tests/e2e-s5-binder-echo-emission.test.ts:102-122` (byte-identical `parseDeps`/`parse`, same hard-coded `"code-review.theta"` path, same messages):
```ts
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

/** Parse `.theta` source through the production whole-file parser. */
function parse(src: string) {
  const source: ThetaSource = {
    path: "code-review.theta",
    bytes: new TextEncoder().encode(src),
  };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the binder theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the binder theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}
```

`tests/binder-forced-tool-dispatch.test.ts:357-359` (`ctxDouble`) and `tests/e2e-s5-binder-echo-emission.test.ts:175-177` (byte-identical):
```ts
function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}
```

`tests/binder-forced-tool-dispatch.test.ts:385-387` (`noteChannelEntries`) and `tests/e2e-s5-binder-echo-emission.test.ts:209-211` (byte-identical):
```ts
function noteChannelEntries(notes: readonly CapturedNote[]): CapturedNote[] {
  return notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL);
}
```

`tests/binder-forced-tool-dispatch.test.ts:174-183` (`TWO_PARAM_THETA`) and `tests/e2e-s5-binder-echo-emission.test.ts:182-191` (byte-identical):
```ts
const TWO_PARAM_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  topic: string",
  "  audience: string",
  "---",
  "@`review ${topic} for ${audience}`",
  "",
```

Verification performed during this review: `diff` over each `sed`-extracted block (`^interface CapturedNote`..closing `}`; `^function parseDeps`..closing `}`; `^function parse(src`..closing `}`; `^function ctxDouble`..closing `}`; `^function noteChannelEntries`..closing `}`; `^const TWO_PARAM_THETA = [`..`].join`) between the two files reports zero diff lines for all six blocks.

## Why this is a problem
Six module-scope pieces — an interface, two parse-scaffolding functions, a command-context double, a channel filter, and a fixture theta literal — are typed twice, byte-for-byte, across two files rather than imported once. `tests/binder-forced-tool-dispatch.test.ts`'s own header comment identifies `tests/e2e-s5-binder-echo-emission.test.ts`'s harness as the origin it followed ("copied from the e2e-s5 pattern"), so the duplication is authored knowledge, not independent coincidence. `tests/helpers/` holds no module exporting any of these six pieces today.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module exporting the binder-parse scaffolding (`parseDeps`/`parse`), the `ctxDouble`/`CapturedNote`/`noteChannelEntries` note-capture trio, and the `TWO_PARAM_THETA` fixture would sit beside the existing `tests/helpers/*` convention (e.g. `e2e-s1.ts`, `model-registry-fixture.ts`) that other files in this same lineage already point to by name.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin; the cited code is harness/fixture declaration, not a pinned count or inventory assertion.
- Recording-double check: `noteChannelEntries`/the `notes` sink in both files is a positive read-back mechanism (tests assert what WAS captured, e.g. `toHaveLength(1)` + content equality), not a "never called" negative witness; the recording-double carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "binder-forced-tool-dispatch\|e2e-s5-binder-echo-emission" docs/bugs/` finds no doc marking either file as a documented correct-reason red for this harness code; both files pass at HEAD for the RED-pin cells whose own header explains the intended-red reason (bug 0011/bug 0198), unrelated to this finding.
- coverage-matrix/bug-doc citation search: `grep -n "binder-forced-tool-dispatch\|e2e-s5-binder-echo-emission" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of either file or any `it()`/`describe()`.
- Coverage check: the claim is entirely about a repeated harness/fixture DEFINITION; both files' own tests exercise their own copy, so this is not a coverage-gap claim.
- Prior-finding check: this wave already filed several findings citing `tests/e2e-s5-binder-echo-emission.test.ts` as the same lineage's origin (e.g. the `b0381`, `b0397`/`b0398`/`b0399`, and `b0401` harness-duplication findings); none of those locations lists `tests/binder-forced-tool-dispatch.test.ts`, so this is a new, previously uncited site in the same cluster rather than a re-file.

## Triage
verdict: confirmed — independently re-verified: awk-extracted + diffed all six blocks (CapturedNote, parseDeps, parse, ctxDouble, noteChannelEntries, TWO_PARAM_THETA) between tests/binder-forced-tool-dispatch.test.ts and tests/e2e-s5-binder-echo-emission.test.ts → 0 diff lines each at the cited ranges; the "copied from the e2e-s5 pattern" header is real (line 270); both files live (24+4 it(), no skips); no gate/negative-witness/bug-doc carve-out applies and no open/resolved PTQ tracks this sextet (PTQ-0276 covered only deepKeyOccurrences in this file, already fixed); one correction for the fixer — the candidate's "tests/helpers/ exports none of these" is wrong: scripted-live-session-harness.ts:92-114 exports byte-identical parseDeps + near-identical parse, tool-call-dispatch-harness.ts:108 exports byte-identical ctxDouble, e2e-s1.ts:38 exports an equivalent parseDeps, so canonical homes already exist (triage: claude-fable-5-1)
