---
id: PTQ-1252
title: Two extraction-facade re-exports in production-theta-producer.ts (pure-expression-evaluator, binder-echo-type) have zero importers through this module
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:23-24
  - src/extension/production-theta-producer.ts:38-39
sites: 2
fix_scope: localized
wave: qw20260922164435
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# Two extraction-facade re-exports in production-theta-producer.ts have zero importers through this module

## Observation
`production-theta-producer.ts` carries two adjacent import+`export { … } from` pairs pulling in names from modules the same commit extracted them into: `evaluateCallSiteCwd`, `evaluatePureExpression`, `raiseInterpolatedResult` from `../runtime/pure-expression-evaluator` (lines 23-24), and `echoTypeFromValue` from `./binder-echo-type` (lines 38-39). Each name's `import` is genuinely read inside this file (evidence below); each corresponding `export { … } from` statement on the very next line is a second, distinct re-export surface that nothing in the repository imports through this module's path.

## Evidence
`src/extension/production-theta-producer.ts:23-24`:
```ts
import { evaluateCallSiteCwd, evaluatePureExpression, raiseInterpolatedResult } from "../runtime/pure-expression-evaluator";
export { evaluateCallSiteCwd, evaluatePureExpression, raiseInterpolatedResult } from "../runtime/pure-expression-evaluator";
```

`src/extension/production-theta-producer.ts:38-39`:
```ts
import { echoTypeFromValue } from "./binder-echo-type";
export { echoTypeFromValue } from "./binder-echo-type";
```

Internal use of the imported bindings (proving the `import` line is alive):
- `evaluatePureExpression`: `production-theta-producer.ts:1808, 2220, 4360, 4785, 4834, 5899, 6341`
- `evaluateCallSiteCwd`: `production-theta-producer.ts:3620, 4802, 4835`
- `raiseInterpolatedResult`: `production-theta-producer.ts:6367`
- `echoTypeFromValue`: `production-theta-producer.ts:1353`

Search for any importer reaching these four names through `production-theta-producer.ts` (rather than the modules where they are declared), across the whole tree:
```
grep -rn "evaluateCallSiteCwd\|evaluatePureExpression\|raiseInterpolatedResult" --include=*.ts . | grep "from \""
grep -rn "echoTypeFromValue" --include=*.ts . | grep "from \""
```
Both searches, run over the entire repository (excluding `node_modules`), return only the declaring-module import lines and the two re-export lines inside `production-theta-producer.ts` itself — no other file (`src/`, `extensions/`, `tools/`, `tests/`) imports any of these four names from `production-theta-producer.ts`, and none imports them from their true source modules either (`pure-expression-evaluator.ts`, `binder-echo-type.ts`), so no test-only caller exists for the re-export path.

## Why this is a problem
Both pairs were introduced together in commit `475e62db` ("quality: qw20260921053528 fix d9/…"), which extracted these four names out of `production-theta-producer.ts` into their own modules and re-exported them back in — presumably to preserve any external import path that previously reached them through this file. No such external caller exists: the repo-wide search finds zero importers of any of the four names via the `production-theta-producer` path (or via any path at all besides this file's own internal use), so the `export { … } from` statements are a second, unread public surface layered on top of an import this file already needs for its own logic — the same shape as the accepted `import-static-checks.ts` / `resolveReExportClosure` precedent.

## Suggested direction (non-binding, optional)
Drop the four-name and one-name `export { … } from` lines, keeping the plain `import` statements this file already uses for its own logic.

## False-positive check
- Ran `grep -rn` for all four identifiers across the whole repository tree (`src/`, `extensions/`, `tools/`, `tests/`, excluding `node_modules`), restricted to lines containing `from "`, to find every import site; the only hits are the two `import`/`export` line pairs inside `production-theta-producer.ts` itself.
- Confirmed each of the four names IS read inside `production-theta-producer.ts` via its `import` binding, at the line numbers listed above — the import statements are alive; only the paired `export` statements are unread.
- Checked for `import * as` / namespace / dynamic (`require`) access to `production-theta-producer.ts` anywhere in the tree: none found.
- Checked `extensions/` and `tools/` directories for any reference to `production-theta-producer`: none found.
- Ran `git log -L` on both line ranges: both pairs were added together in commit `475e62db`, confirming a single extraction-facade root cause rather than independent drift.
- This is not a test-only-reachable case exempted by the brief's carve-out: no caller at all — test or production — reaches these four names through this re-export path, so "tests are legitimate callers" does not apply here.

## Triage
verdict: confirmed — excerpts match at 23-24/38-39 and `git blame` pins all four lines to 475e62db; independent grep of the four names across src/, extensions/, tools/, tests/ finds no import of any of them from any module other than the producer's own lines 23/38 (external hits are only prose inside test failure-message strings), no `import * as`/`export *`/dynamic import of production-theta-producer exists, and the internal uses (1353, 1808, 2220, 3620, 4360, 4785, 4802, 4834-4835, 5899, 6341, 6367) all bind through the `import` lines, so the two `export { … } from` statements are a zero-importer surface; not a duplicate (PTQ-1247 covers different unread imports; PTQ-1150/1196 are the D9 breakdowns that minted these lines) and it matches the confirmed PTQ-1242/1244/1249/1250 unused-re-export precedent (triage: claude-fable-5-1)
