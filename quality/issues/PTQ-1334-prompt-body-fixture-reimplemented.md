---
id: PTQ-1334
title: fn-param-not-identifier and fn-return-void-query-sink reimplement e2e-s1's parsePromptBody/body helpers locally
lens: D7
status: open
verdict: confirmed
locations:
  - tests/fn-param-not-identifier.test.ts:229-234
  - tests/fn-return-void-query-sink.test.ts:127-142
  - tests/helpers/e2e-s1.ts:127-142
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# fn-param-not-identifier and fn-return-void-query-sink reimplement e2e-s1's parsePromptBody/body helpers locally

## Observation
`tests/helpers/e2e-s1.ts` already exports `parsePromptBody(body, path = "test.theta")`
(wraps a `mode: prompt` frontmatter constant around a body string and parses
it) and `body(stmt)` (the same frontmatter plus a fixed `let a = 1\na\n` tail).
Both in-scope files declare their own private, byte-identical frontmatter
constant and re-derive the same two functions locally instead of importing
the exported ones, even though both files already import several other named
helpers from `./helpers/e2e-s1` in the same `import` statement.

## Evidence

**Canonical helper — `tests/helpers/e2e-s1.ts:127-142`**
```ts
export const FRONTMATTER: readonly string[] = ["---", "mode: prompt", "---"];
const FM = `${FRONTMATTER.join("\n")}\n`;

/** Parse `body` as a `.theta` under the standard frontmatter. */
export function parsePromptBody(body: string, path = "test.theta"): ThetaDocument {
  return parseDoc(FM + body, path);
}
...
const TAIL = "let a = 1\na\n";

/** A `mode: prompt` theta whose body is `stmt` followed by the tail. */
export function body(stmt: string): string {
  return `${FM}${stmt}\n${TAIL}`;
}
```

**Site 1 — `tests/fn-param-not-identifier.test.ts:225-234`** (imports
`parseDoc, topKinds` from `./helpers/e2e-s1` two lines above, but not
`parsePromptBody`):
```ts
/** Frontmatter for every row — occupies lines 1–3, so body line 1 is file line 4. */
const FM = "---\nmode: prompt\n---\n";

/** Parse `body` under the standard frontmatter, at `path` (default `.theta`). */
function theta(body: string, path = "test.theta"): ThetaDocument {
  return parseDoc(FM + body, path);
}
```
This `theta()` function has the same signature and the same body as the
exported `parsePromptBody` — `FM + body` parsed at `path`, defaulting to
`"test.theta"` — under a different local name.

**Site 2 — `tests/fn-return-void-query-sink.test.ts:127-142`** (imports
`collectByKind, parseDoc, rangeDiagnosticTable` from `./helpers/e2e-s1`, but
not `body`):
```ts
const FM = "---\nmode: prompt\n---\n";
const TAIL = "let a = 1\na\n";

/** A `mode: prompt` theta whose body is a block starting on line 4, plus the tail. */
function blockBody(lines: readonly string[]): string {
  return `${FM}${lines.join("\n")}\n${TAIL}`;
}

/** A `mode: prompt` theta whose body is the single statement `stmt` on line 4. */
function body(stmt: string): string {
  return blockBody([stmt]);
}
```
`body(stmt)` here reduces to `` `${FM}${stmt}\n${TAIL}` ``, byte-for-byte the
same expression as the exported `body()` in `e2e-s1.ts`, under the same local
name, re-declared rather than imported.

## Why this is a problem
Both files already draw several other symbols from `./helpers/e2e-s1` in the
same import line, so the re-declaration is not a missing-dependency
workaround — it is the same frontmatter fixture and the same wrapper function
written out a second and third time next to a helpers module that already
exports it under the identical name (`body`) or an equivalent one
(`parsePromptBody`). If `e2e-s1.ts`'s frontmatter constant or tail fixture
were ever changed (for example, to add a `model:` key the way
`parseBodyWithFrontmatter`'s default frontmatter already does), the two
in-scope files' local copies would silently diverge from the canonical
fixture while still compiling and passing, because nothing ties their bytes
to the export.

## Suggested direction (non-binding, optional)
`tests/fn-param-not-identifier.test.ts` could import `parsePromptBody` (or
`body`, since its `theta()` calls take a body string and an optional path)
and `tests/fn-return-void-query-sink.test.ts` could import `body` directly,
in both cases from the `./helpers/e2e-s1` import already present in the file,
rather than re-declaring the frontmatter constant and wrapper function.

## False-positive check
- Confirmed both cited local functions are live and used throughout their
  files (`theta(...)` and `body(...)` calls appear throughout both test
  bodies), not dead code.
- Confirmed the canonical exports (`parsePromptBody`, `body`) exist in
  `tests/helpers/e2e-s1.ts` at the cited lines and are exported (`export
  function`), so they are importable, not merely similarly-named private
  helpers.
- Checked `docs/reference/coverage-matrix.md` and searched `docs/bugs/` for
  either test file by name: no citation found that pins these specific local
  function declarations, so no merge/rename-of-cited-test concern applies.
- Not a gate/census file (`*gate*.test.ts` carve-out does not apply — neither
  file matches that naming or shape).
- Not a recording double / negative witness (both functions build fixture
  strings and parse them; neither records calls to assert a MUST-NOT).
- This is a coverage-neutral observation about existing test code re-deriving
  an existing exported helper's bytes, not a claim that any behaviour is
  untested.

## Triage
verdict: confirmed — excerpts reproduce at the cited lines: `theta(body, path = "test.theta")` → `parseDoc(FM + body, path)` (fn-param-not-identifier.test.ts:229-234) is signature- and body-identical to the exported `parsePromptBody` (e2e-s1.ts:131-133), and `body(stmt)` (fn-return-void-query-sink.test.ts:137-139) reduces to `` `${FM}${stmt}\n${TAIL}` `` byte-for-byte matching the exported `body` (e2e-s1.ts:140-142) with the same `FM`/`TAIL` bytes; both files already import from `./helpers/e2e-s1` (lines 7 and 100), both locals are live (23 `theta(` / 22 `body(`+`blockBody(` call sites), neither file is a gate/census file or cited by docs/reference/coverage-matrix.md (0 hits); not a duplicate — PTQ-0747 covered the same two files for the registry-oracle root cause and PTQ-0555 covered the FM/theta() builder in the generic-argument files, neither this pair's prompt-body wrapper (triage: claude-fable-5-1)
