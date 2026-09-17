---
id: PTQ-0728
title: typed-two-phase-live.test.ts redeclares tests/helpers/scripted-live-session-harness.ts's ANTHROPIC_MODEL/SessionEntryDouble/parseDeps/parse/ajv instead of importing them
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/typed-two-phase-live.test.ts:159-165
  - tests/typed-two-phase-live.test.ts:444-450
  - tests/typed-two-phase-live.test.ts:599-620
  - tests/typed-two-phase-live.test.ts:644-650
  - tests/helpers/scripted-live-session-harness.ts:33-47
  - tests/helpers/scripted-live-session-harness.ts:88-113
sites: 1
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# typed-two-phase-live.test.ts redeclares tests/helpers/scripted-live-session-harness.ts's ANTHROPIC_MODEL/SessionEntryDouble/parseDeps/parse/ajv instead of importing them

## Observation
`tests/typed-two-phase-live.test.ts` declares, module-scope, its own `ANTHROPIC_MODEL` fixture object, `SessionEntryDouble` interface, `parseDeps()`, `parse()` and `ajv()` — five pieces that are byte-identical in body (apart from doc-comment wording and one added `expect` message in `parse()`) to the same five pieces already exported by `tests/helpers/scripted-live-session-harness.ts`, including the same literal path string `"probe.theta"`, the same field names, and the same AJV `slugOf` recipe. The file does not import this helper.

## Evidence

`tests/typed-two-phase-live.test.ts:159-165` (`ANTHROPIC_MODEL`):
```ts
/** The user session's selected model (`ctx.model`). */
const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};
```

`tests/helpers/scripted-live-session-harness.ts:33-40` (byte-identical object literal, exported):
```ts
export const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};
```

`tests/typed-two-phase-live.test.ts:444-450` (`SessionEntryDouble`):
```ts
/** A `SessionManager` message entry (the `buildSessionContext` read shape). */
interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}
```

`tests/helpers/scripted-live-session-harness.ts:42-47` (byte-identical, exported):
```ts
export interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}
```

`tests/typed-two-phase-live.test.ts:599-620` (`parseDeps` + `parse`):
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

/** Parse `.theta` source through the production whole-file parser (must be clean). */
function parse(src: string): ThetaDocument {
  const source: ThetaSource = {
    path: "probe.theta",
    bytes: new TextEncoder().encode(src),
  };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the fixture theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the fixture theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}
```

`tests/helpers/scripted-live-session-harness.ts:88-104` (byte-identical body, same `"probe.theta"` path, same two `expect(...)` messages, exported):
```ts
export function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

/** Parse `.theta` source through the production whole-file parser (must be clean). */
export function parse(src: string): ThetaDocument {
  const source: ThetaSource = { path: "probe.theta", bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the fixture theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the fixture theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}
```

`tests/typed-two-phase-live.test.ts:644-650` (`ajv`) is byte-identical to `tests/helpers/scripted-live-session-harness.ts:107-113` (exported):
```ts
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```

## Why this is a problem
`tests/helpers/scripted-live-session-harness.ts`'s own header states it exists specifically to stop sibling files from "each redeclared byte-for-byte the pieces that carry no cell-specific variation between them: the fixture model, the `SessionManager` entry shape, … and the document-parsing / AJV factories," naming three migrated siblings (b0288, b0319, b0414). `tests/typed-two-phase-live.test.ts` carries the identical `ANTHROPIC_MODEL`, `SessionEntryDouble`, `parseDeps`, `parse` (same `"probe.theta"` literal, same two `expect(...)` messages) and `ajv` the helper already exports, but is not among the migrated files and does not import the helper.

## Suggested direction (non-binding, optional)
`tests/helpers/scripted-live-session-harness.ts` already exports `ANTHROPIC_MODEL`, `SessionEntryDouble`, `parseDeps`, `parse`, `ajv`; importing them is the existing, purpose-built home for this exact shape.

## False-positive check
- Gate-pin check: `tests/typed-two-phase-live.test.ts` does not match `*gate*.test.ts` or the named gate kin; the cited lines are a fixture constant, an interface, and parse/AJV factory functions, not a pinned count or inventory assertion.
- Recording-double check: none of the five cited pieces is a recording double (no call-counting, no "never called" witness); the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "typed-two-phase-live" docs/bugs/` finds docs/bugs/0010, 0012, 0014, 0028, 0099, 0288, 0291, 0480 — each names this file as a sibling regression-pin suite for its own defect, none discusses or pins this harness-duplication shape as a documented correct-reason red; the file passes at HEAD on the cells that use these five pieces.
- coverage-matrix/bug-doc citation search: `grep -n "typed-two-phase-live" docs/reference/coverage-matrix.md` finds no citation of specific line ranges inside this harness scaffolding (lines 159-650); no merge, rename or deletion of any `it()`/`describe()` is proposed.
- Coverage check: the claim is about a duplicated fixture/parse-factory DEFINITION, not a missing test path; every cell in the file that uses these pieces continues to pass under the current inline definitions.
- Prior-finding check: `quality/intake/qw20260917154546-d7-12-provider-field-derivation-scripted-session-not-migrated.md` already files the identical shape for `tests/prompt-provider-field-derivation.test.ts` against the same helper; that finding does not cite `tests/typed-two-phase-live.test.ts` as a location (only as unrelated context in a sibling finding's pattern-wide grep list), so this is a distinct location, not a re-file.

## Triage
verdict: confirmed — independently re-verified: all five excerpts reproduce at the cited lines (ANTHROPIC_MODEL :159-165, SessionEntryDouble :444-450, parseDeps/parse :599-620, ajv :644-650) and are body-identical to the exported pieces at tests/helpers/scripted-live-session-harness.ts:33-47/88-113 (same "probe.theta" literal, same two expect messages, same slugOf recipe); `grep scripted-live-session-harness tests/` hits only b0288/b0319/b0414, so the file is not an importer; the helper landed in feefe7ca (2026-09-14, PTQ-0328) and the file was last touched 2b68c847 (2026-09-17) so this is a live un-migrated copy; D7 copy-paste fixture class in tests/, no gate/recording-double/bug-red/coverage-matrix carve-out (coverage-matrix has zero hits), and no tracked PTQ cites typed-two-phase-live against this helper (PTQ-0328 covers the three witness files only; PTQ-0229 cites b0287/b0289; intake siblings cite this file only as the source copy for other files) (triage: claude-fable-5-1)
