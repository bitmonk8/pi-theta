---
id: PTQ-0133
title: SESSION_CONTEXT_TOKEN_CAP and SESSION_CONTEXT_TURN_CAP are exported but no module outside session-context-walk.ts references them
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/binder/session-context-walk.ts:32-36
  - src/binder/session-context-walk.ts:144-147
sites: 2
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# SESSION_CONTEXT_TOKEN_CAP and SESSION_CONTEXT_TURN_CAP are exported but no module outside session-context-walk.ts references them

## Observation

`session-context-walk.ts` declares the walk's two inclusive caps as exported
module constants. Both are read exactly once each, inside the same file, in the
walk's own candidate-turn test. Nothing else in the repository names either
identifier: not src/, not extensions/, not tools/, not tests/, not docs. The
module's one production importer (`production-theta-producer.ts`) imports only
`walkSessionContext`; the module's one test importer imports only
`walkSessionContext` and the `SessionContextWalkInput` type, and pins the cap
values as bare numeric literals in its assertions.

## Evidence

src/binder/session-context-walk.ts:32-36 — the two exported constants:

```ts
/** The inclusive running-token-total cap of the truncation walk (8000 tokens). */
export const SESSION_CONTEXT_TOKEN_CAP = 8000;

/** The inclusive running-turn-count cap of the truncation walk (20 turns). */
export const SESSION_CONTEXT_TURN_CAP = 20;
```

src/binder/session-context-walk.ts:144-147 — their only reads, in the same
file:

```ts
    if (
      candidateTokens > SESSION_CONTEXT_TOKEN_CAP ||
      candidateTurns > SESSION_CONTEXT_TURN_CAP
    ) {
```

Whole-repository search (excluding `node_modules/` and `dist/`):
`grep -rn "SESSION_CONTEXT_TOKEN_CAP\|SESSION_CONTEXT_TURN_CAP" . --include=*.ts
--include=*.md --include=*.json` returns exactly four hits — the two
declarations above and the two reads above.

The module's importers, in full
(`grep -rn "session-context-walk" src extensions tools tests --include=*.ts`):

```
src/extension/production-theta-producer.ts:335:import { walkSessionContext } from "../binder/session-context-walk";
tests/session-context-truncation.test.ts:12:} from "../src/binder/session-context-walk";
```

tests/session-context-truncation.test.ts:9-12 — the test's named-import list,
which does not include either constant:

```ts
import {
  walkSessionContext,
  type SessionContextWalkInput,
} from "../src/binder/session-context-walk";
```

## Why this is a problem

A dead export: the `export` modifier on both constants advertises a module
surface that no importer binds, so the constants are effectively file-private
values wearing a public marker. The published surface of `session-context-walk.ts`
is therefore wider than anything that exists to consume it, and a reader
looking for "who depends on the 8000/20 caps" is pointed at a cross-module
seam that has no other side. This is not a test-only-reachable case — the
witness-test carve-out does not apply, because the test importer does not name
either identifier either (its cap assertions use the literals `8000` and `20`
directly, tests/session-context-truncation.test.ts:109, :156).

## Suggested direction (non-binding, optional)

Drop the `export` modifier (the constants stay live as file-local names), or
have the sites that today spell the same two numbers as literals bind these
names instead.

## False-positive check

- Identifier search across the whole tree (minus `node_modules/`, `dist/`):
  `grep -rn "SESSION_CONTEXT_TOKEN_CAP\|SESSION_CONTEXT_TURN_CAP" .
  --include=*.ts --include=*.md --include=*.json` — 4 hits, all inside
  session-context-walk.ts (2 declarations, 2 reads).
- Importer enumeration: `grep -rn "session-context-walk" src extensions tools
  tests --include=*.ts` — three hits: one production import
  (`walkSessionContext` only), one test import (`walkSessionContext` +
  `SessionContextWalkInput` only), one prose comment in
  tests/b0398-custom-type-unsafe-note-details-diagnostics.test.ts:146.
- Re-export check: `grep -rn "export \*" src extensions tools --include=*.ts`
  returns no hits — there are no export-star barrels in the tree, so no
  indirect re-export path exists.
- String-keyed / dynamic access: the constants are module-level `const`
  bindings, not object properties; no `["SESSION_CONTEXT_…"]` form appears
  anywhere in the search above.
- Test-only-caller check: performed and negative — tests/session-context-truncation.test.ts
  neither imports nor names either constant, so the "tests are legitimate
  callers" protection does not apply.
- Live-value check: the constants themselves are NOT dead — they are read at
  :145 and :146 by the walk. The claim is scoped to the `export` modifier.
- Adjacent-literal note (context, not a duplication claim): the only other
  place in src/ that spells both numbers is the prompt's session-context
  opening line, src/binder/binder-system-prompt.ts:437
  (`"Recent session context (most recent 20 turns / 8000 tokens):\n"`), which
  writes them as literals rather than importing these names — so even the one
  plausible second consumer does not use the export.

## Triage
verdict: confirmed — reproduced exactly: `git grep` over all tracked files yields only the 2 declarations (src/binder/session-context-walk.ts:33,:36) and 2 in-module reads (:145,:146); the sole production importer (production-theta-producer.ts:335) and sole test importer (session-context-truncation.test.ts:12) bind only `walkSessionContext`/`SessionContextWalkInput` and pin the caps as literals 8000/20 (:109,:156); no `export *`, no src/binder barrel, no `import * as`, no dynamic access, no doc/spec/config names either identifier, and no importer existed in any commit — a numeric-cap export like the confirmed DEFAULT_SCAN trio, not the diagnostic-anchor convention class ruled questionable in qw20260907183353-d2-03 (triage: claude-opus-5)
