---
id: PTQ-1250
title: lexer.ts re-exports firstInvalidUtf8Offset from encoding.ts but nothing imports it through that surface
lens: D2
wave: qw20260922150013
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
status: fixed
verdict: confirmed
locations:
  - src/lexer/lexer.ts:23
sites: 1
fix_scope: localized
---

# lexer.ts re-exports firstInvalidUtf8Offset from encoding.ts but nothing imports it through that surface

## Observation
`lexer.ts` re-exports `decodeUtf8`, `firstInvalidUtf8Offset`, and
`normaliseNewlines` from `./encoding` in one statement. `decodeUtf8` and
`normaliseNewlines` are imported through this re-export by
`src/extension/execution-status/render/styled-lines.ts`. `firstInvalidUtf8Offset`
is used only inside `encoding.ts` itself (where it is defined and called by
`validateUtf8Encoding`); nothing imports it via the `lexer.ts` re-export path
or via `encoding.ts` directly.

## Evidence
`src/lexer/lexer.ts:23`:
```
export { decodeUtf8, firstInvalidUtf8Offset, normaliseNewlines } from "./encoding";
```

`src/lexer/encoding.ts:20,47`:
```
  const invalidOffset = firstInvalidUtf8Offset(bytes);
...
export function firstInvalidUtf8Offset(bytes: Uint8Array): number {
```

Search: `grep -rn "firstInvalidUtf8Offset" src/ tests/ extensions/ tools/` —
3 hits total: the definition and internal call in `encoding.ts`, and the
re-export line in `lexer.ts`. No file imports the symbol (neither via
`"../lexer/lexer"` nor via `"../lexer/encoding"`); the only other mention is
a prose reference inside a test comment (`tests/b0410-encoding-gate-document-path.test.ts:10`),
not an import.

By contrast, the sibling re-exports in the same statement ARE reached through
`lexer.ts`: `src/extension/execution-status/render/styled-lines.ts:27-30`
imports `decodeUtf8` and `normaliseNewlines` from `"../../../lexer/lexer"`.

## Why this is a problem
The re-export of `firstInvalidUtf8Offset` from `lexer.ts` has zero importers
through that surface (or any surface besides the module that defines it), so
that one named export in the re-export statement is dead surface area: the
function itself stays alive (called internally by `encoding.ts`), but the
lexer.ts re-export line does no reachable work for any caller.

## Suggested direction (non-binding, optional)
Drop `firstInvalidUtf8Offset` from the re-export list in `lexer.ts`, leaving
`decodeUtf8` and `normaliseNewlines`, which are actually consumed through that
path.

## False-positive check
Ran `grep -rn "firstInvalidUtf8Offset" src/ tests/ extensions/ tools/` (3
hits, none an import through `lexer.ts` or elsewhere) and
`grep -rn "lexer/lexer\"" src/ tests/ extensions/ tools/` to enumerate every
import statement that names `lexer.ts` as a module path, confirming none
destructures `firstInvalidUtf8Offset`. Checked the one test mention
(`tests/b0410-encoding-gate-document-path.test.ts:10`) and found it is a
comment, not an import — so this is not a test-only-reachable case either;
it is unreached from any file.

## Triage
verdict: confirmed — excerpts match at lexer.ts:23 / encoding.ts:20,47; independent grep across src/, tests/, extensions/, tools/ yields exactly 3 code hits (definition, internal call in validateUtf8Encoding, the re-export) with no namespace import, string-keyed access, or test importer of the symbol; every importer of ../lexer/lexer (styled-lines, pass-parse-cache, body-parser, frontmatter-yaml, object-pattern-fields, params, theta-document, type-walk) destructures other names only, and the bug-0410 consumer parseThetaDocument now imports validateUtf8Encoding directly from ../lexer/encoding (theta-document.ts:27,180), so the re-export is the vestige left when PTQ-1113 folded the gate and commit eed3cf39 (PTQ-1148 fix) moved the function to encoding.ts; not test-only-reachable (zero test importers); no existing PTQ names this re-export as its root cause (PTQ-1113/1148/1222 mention the symbol incidentally) (triage: claude-fable-5-1)
