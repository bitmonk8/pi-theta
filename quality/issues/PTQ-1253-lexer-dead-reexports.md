---
id: PTQ-1253
title: lexer.ts re-exports collapseContinuations and contextualDiagnostics that nothing imports through it
lens: D2
status: open
verdict: confirmed
locations:
  - src/lexer/lexer.ts:20-26
sites: 2
fix_scope: localized
wave: qw20260922164435
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# lexer.ts re-exports collapseContinuations and contextualDiagnostics that nothing imports through it

## Observation
`src/lexer/lexer.ts` imports `collapseContinuations` from `./continuation` and
`contextualDiagnostics` from `./contextual-checks` for its own use inside
`lexTheta`, then immediately re-exports both under the same names
(`export { collapseContinuations } from "./continuation";` and
`export { contextualDiagnostics } from "./contextual-checks";`). No file in
`src/`, `extensions/`, `tools/`, or `tests/` imports either name from
`../lexer/lexer` or `./lexer` — every reference to either identifier outside
its own home module is a documentation comment, not an import statement.

## Evidence
`src/lexer/lexer.ts:20-26`:
```ts
import { decodeUtf8, normaliseNewlines, validateUtf8Encoding } from "./encoding";
import { collapseContinuations } from "./continuation";
import { contextualDiagnostics } from "./contextual-checks";
export { decodeUtf8, normaliseNewlines } from "./encoding";
export { collapseContinuations } from "./continuation";
export { contextualDiagnostics } from "./contextual-checks";
export type { Pos, RawToken };
```

Search 1 — every import of `collapseContinuations` repo-wide:
`grep -rn "collapseContinuations\b" src extensions tools tests --include=*.ts`
finds it defined/used in `src/lexer/continuation.ts` (its home module) and
consumed once inside `src/lexer/lexer.ts:126`
(`const tokens = collapseContinuations(scanned.tokens);`). Every other hit
(`src/parser/body-parser.ts:310` and six `tests/*.test.ts` lines) is inside a
`//` comment naming the function for documentation, not an `import` statement.

Search 2 — every import of `contextualDiagnostics` repo-wide:
`grep -rn "contextualDiagnostics\b" src extensions tools tests --include=*.ts`
finds it defined/used in `src/lexer/contextual-checks.ts` (its home module) and
consumed once inside `src/lexer/lexer.ts:127`
(`const contextual = contextualDiagnostics(tokens, file);`). Every other hit
(`src/parser/type-compat.ts:144,154` and dozens of `tests/*.test.ts` lines) is
inside a comment, never an `import`.

Search 3 — every import of `../lexer/lexer` or `./lexer` repo-wide (to find any
consumer of the re-export surface): the full list of import sites (8 in `src/`,
1 in `src/extension/execution-status/render/styled-lines.ts`, and ~70 in
`tests/`) imports only `ThetaSource`, `Token`, `LexResult`, `reservedKeywords`,
`lexTheta`, and (in `styled-lines.ts`) `decodeUtf8` / `normaliseNewlines` —
never `collapseContinuations` or `contextualDiagnostics`.

## Why this is a problem
`collapseContinuations` and `contextualDiagnostics` are both alive — each has
exactly one production caller, inside `lexTheta` in this same file, reached
through the plain `import` two lines above the re-export. The `export`
keyword on lines 24-25 adds a second, unreached path to the same two names
that no call site anywhere in the repository uses; unlike `decodeUtf8` /
`normaliseNewlines` (re-exported on line 23 and genuinely imported through
`../../../lexer/lexer` by `styled-lines.ts`), these two re-exports have no
counterpart consumer.

## Suggested direction (non-binding, optional)
Dropping the two re-export lines would leave `collapseContinuations` and
`contextualDiagnostics` exactly as reachable as today, since `lexTheta` already
reaches them through the plain imports on lines 21-22.

## False-positive check
Ran `grep -rn "collapseContinuations\b"` and `grep -rn "contextualDiagnostics\b"`
across `src/`, `extensions/`, `tools/`, `tests/`: no import statement anywhere
names either identifier alongside a `from "..."` path other than each
function's own home module. Ran a full-repo scan of every `from
".../lexer/lexer"` / `from "./lexer"` import (`grep -rn 'from ["\x27].*lexer/lexer["\x27]'`
plus the local `./lexer` form inside `src/lexer/`) and enumerated every
destructured name at each site: none names `collapseContinuations` or
`contextualDiagnostics`. Checked the sibling re-export of `decodeUtf8` /
`normaliseNewlines` on the same block for contrast — that one IS consumed,
by `src/extension/execution-status/render/styled-lines.ts:27-32`, confirming
the search methodology surfaces real consumers where they exist. No
string-keyed or dynamic access pattern applies to a named ES-module export.

## Triage
verdict: confirmed — excerpt byte-exact at src/lexer/lexer.ts:20-26; independent grep of both identifiers across src/, extensions/, tools/, tests/ (non-comment hits only) finds solely the home-module definition/export, the plain import at lexer.ts:21-22, the re-export at :24-25 and the single lexTheta call at :119-120; no `import * as` / `export *` of lexer.ts exists, no string-keyed access, and all ~80 `lexer/lexer` import sites name only ThetaSource/Token/LexResult/reservedKeywords/lexTheta (+ decodeUtf8/normaliseNewlines in styled-lines.ts); the re-exports were minted by the D9 split commit eed3cf39 (qw20260921070027) as a compatibility surface nothing ever consumed, so the two lines are dead re-export cruft in production src/ — not a duplicate (PTQ-1242/1243/1244/1245/1249/1250 cover other files' re-exports) (triage: claude-fable-5-1)
