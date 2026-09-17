---
id: PTQ-0485
title: inbound-union-arm-dispatch.test.ts and index-element-alias-runtime-disposition.test.ts each retype tests/helpers/e2e-s1.ts's parseDeps/parseDoc instead of importing them
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/inbound-union-arm-dispatch.test.ts:183-191
  - tests/index-element-alias-runtime-disposition.test.ts:123-133
  - tests/helpers/e2e-s1.ts:38-45
  - tests/increment-decrement-wiring.test.ts:8
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# inbound-union-arm-dispatch.test.ts and index-element-alias-runtime-disposition.test.ts each retype tests/helpers/e2e-s1.ts's parseDeps/parseDoc instead of importing them

## Observation
tests/inbound-union-arm-dispatch.test.ts declares a module-scope `makeParseDeps(): ParseThetaDocumentDeps`
— an inert `SystemNoteChannelDeps` plus a trivially-resolving `ModelReferenceMatcher`
— and feeds it to a local `parseThetaDocument(source, makeParseDeps())` call.
tests/index-element-alias-runtime-disposition.test.ts declares the same shape
under the name `parseDeps()`, feeding it to a local `parseOnly(path, src)`
wrapper. tests/helpers/e2e-s1.ts already exports `parseDeps()` (the identical
inert deps builder) and `parseDoc(src, path)` (the identical
`parseThetaDocument` wrapper). The third file in this same review scope,
tests/increment-decrement-wiring.test.ts, imports `parseDoc` from that helper
directly rather than re-deriving either piece.

## Evidence
tests/inbound-union-arm-dispatch.test.ts:183-191 — the reimplemented deps builder:
```ts
function makeParseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}
```

tests/index-element-alias-runtime-disposition.test.ts:123-133 — the same shape, under a different local name, plus the `parseOnly` wrapper immediately below it (:135-138):
```ts
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}

function parseOnly(path: string, src: string): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}
```

tests/helpers/e2e-s1.ts:38-45 — the canonical helper already exporting both, with the same field values (`sendMessage`/`notify`/`emitDiagnostic` no-ops, `resolve` always `"resolved"`):
```ts
export function parseDeps(): ParseThetaDocumentDeps {
  return { systemNote: inertSystemNote(), modelMatcher: resolvingMatcher };
}

/** Parse a UTF-8 `.theta` source string through the whole-document pipeline. */
export function parseDoc(src: string, path = "test.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}
```

tests/increment-decrement-wiring.test.ts:8 — the third file in this same review scope, importing the canonical helper directly instead of re-deriving it:
```ts
import { parseDoc } from "./helpers/e2e-s1";
```

Neither of the two reimplementing files imports anything from `./helpers/e2e-s1`
at all — confirmed by reading each file's full import block (both files' own
opening `import` statements name only `../src/...` modules and `vitest`).

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: both reviewed files
re-implement, field for field and value for value, the `ParseThetaDocumentDeps`
double and the `parseThetaDocument`-wrapper pair `tests/helpers/e2e-s1.ts`
already exports under the equivalent names (`parseDeps`/`parseDoc`) — the same
inert `sendMessage`/`notify`/`emitDiagnostic` no-ops and the same
always-`"resolved"` model matcher, wired through the same
`{ path, bytes: new TextEncoder().encode(src) }` → `parseThetaDocument(source, deps)`
call shape. The canonical helper is not a hypothetical extraction target: it is
the same import the third file in this exact review batch already uses for the
identical purpose, so the reimplementation in the other two is neither forced
by anything specific to their own fixtures nor an isolated choice made in the
absence of a working alternative.

## Suggested direction (non-binding, optional)
Importing `parseDoc` (and, where a document must be inspected rather than
gated, `parseDeps` directly) from `tests/helpers/e2e-s1.ts` is the path already
adopted by the sibling file in this same batch; naming it here is an
observation about where that sibling file already points, not a design for
the change.

## False-positive check
- Gate-pin carve-out: neither file matches `*gate*.test.ts` or the named kin;
  not applicable.
- Recording-double carve-out: `parseDeps()`/`makeParseDeps()` are inert
  parse-time doubles, not recording doubles backing a "never called" witness;
  not applicable.
- docs/bugs/ signature search: `grep -rl "makeParseDeps\|inertSystemNote"
  docs/bugs/*.md` → 0 files; neither reimplementation is named by an open bug
  doc as a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "inbound-union-arm-dispatch\|index-element-alias-runtime-disposition"
  docs/reference/coverage-matrix.md` → 0 hits. Both files are cited by their
  own bug docs (0172, 0125) by filename and cell id, never by
  `makeParseDeps`/`parseDeps`/`parseOnly`'s names; this finding proposes no
  change to any `it()`/`describe()` name, count, or assertion — only to where
  the shared deps-builder and parse wrapper are defined.
- Reference/callers check: `tests/helpers/e2e-s1.ts`'s `parseDeps`/`parseDoc`
  exports are live, in-use exports — imported directly by
  tests/increment-decrement-wiring.test.ts (this same review batch) and by
  numerous other files repo-wide — not dead code being proposed as a target.
- Prior-filing search: `grep -rl "makeParseDeps\|inertSystemNote|e2e-s1"
  quality/intake/*.md quality/resolved/*.md` shows PTQ-0214 (resolved/fixed)
  and several other intake candidates addressed this same reimplementation
  shape in *other* files; none of them names
  tests/inbound-union-arm-dispatch.test.ts or
  tests/index-element-alias-runtime-disposition.test.ts as a location, so this
  is a new pair of sites of the same recurring class, not a re-filing of an
  already-covered instance.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `makeParseDeps` (tests/inbound-union-arm-dispatch.test.ts:183-191, live via `loadFixture` at :200 feeding six module-scope fixtures) and `parseDeps`/`parseOnly` (tests/index-element-alias-runtime-disposition.test.ts:123-138, live at :212) are field-for-field and value-for-value identical to `parseDeps`/`parseDoc` exported at tests/helpers/e2e-s1.ts:38-45 (helper predates both files: d23c22be 2026-07-13 vs ac4687db/e7f73ccf; 239 test files import it), neither file imports `helpers/e2e-s1` (grep → 0 hits) and neither carries a rationale for the local retype (the :115-121 comment explains gated-vs-inspected parsing, not helper avoidance); not a gate, not a recording double, docs/bugs `makeParseDeps|inertSystemNote` → 0 files, coverage-matrix → 0 hits; not a duplicate — resolved PTQ-0214/0239/0314/0386/0405 and same-wave intake d7-115-02 each cite different reimplementing files and name these two only in d7-115-02's FP-check prose, not as locations (triage: claude-fable-5-1)
