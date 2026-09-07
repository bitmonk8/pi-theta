---
id: pending
title: subagent-isolation.ts and subagent-json-driver.ts headers narrate RFC-0005 artefacts that no longer exist in the tree (preSpawnModelGuard, subagent-rpc-driver.ts)
lens: D2
status: intake
verdict: pending
locations:
  - src/runtime/subagent-isolation.ts:16-22
  - src/runtime/subagent-isolation.ts:49-54
  - src/runtime/subagent-json-driver.ts:1
  - src/runtime/subagent-json-driver.ts:19-21
sites: 4
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# subagent-isolation.ts and subagent-json-driver.ts headers narrate RFC-0005 artefacts that no longer exist in the tree (preSpawnModelGuard, subagent-rpc-driver.ts)

## Observation
Four comment sites in the two subagent-drive modules describe code that has
been removed rather than code that is present. Two paragraphs in
`subagent-isolation.ts` record that a former `preSpawnModelGuard` function
"is deleted" / "that used to live here is deleted"; there is no such
identifier declared anywhere in the tree. The `subagent-json-driver.ts` header
names `subagent-rpc-driver.ts` twice — once as the module it succeeds, once as
the contract it retires — and no file of that name exists under `src/`.

## Evidence
src/runtime/subagent-isolation.ts:16-22 — the header's RETIRED paragraph:

```ts
// RETIRED with the RFC-0005 RPC drive (moved elsewhere): the PIC-62 pre-spawn
// model guard (now the SINGLE-SOURCE-OF-TRUTH `guardResolvedModel` in
// `subagent-model-guard.ts`; the dead RFC-0005 `preSpawnModelGuard` duplicate is
// deleted), the child-side model pre-flight (now `confirmChildModel` in
// `subagent-model-guard.ts`, reported through the envelope), abort forwarding
// (now the kill in `subagent-json-driver.ts`, PIC-66), and
// terminal-`agent_end` extraction (now the child's own prompt-mode driver).
```

src/runtime/subagent-isolation.ts:49-54 — the same deletion restated above the
re-export block:

```ts
// The pre-spawn model guard itself is the SINGLE-SOURCE-OF-TRUTH
// `guardResolvedModel` in the PIC-62 module (`subagent-model-guard.ts`); the
// dead RFC-0005 `preSpawnModelGuard` duplicate that used to live here is deleted.
// The diagnostic codes / message / renderer are re-exported from here so
// existing RFC-0005 importers (and the isolation suite) keep resolving them
// unchanged.
```

src/runtime/subagent-json-driver.ts:1 — the module title:

```ts
// RFC-0006 — parent-side subagent JSON driver (successor of subagent-rpc-driver).
```

src/runtime/subagent-json-driver.ts:19-21 — the retired-contract paragraph
naming a module file:

```ts
// The RFC-0005 RPC drive contract (`subagent-rpc-driver.ts`, the
// prompt/`agent_end`/abort mapping) is RETIRED by this driver, not kept as a
// fallback.
```

Absence proof for both named artefacts:

```
$ ls src/runtime | grep -i rpc            # (no output)
$ grep -rn "preSpawnModelGuard" --include=*.ts src extensions tools tests
src/extension/production-theta-producer.ts:2278:    // `preSpawnModelGuard` duplicate is deleted.
src/runtime/subagent-isolation.ts:18:// `subagent-model-guard.ts`; the dead RFC-0005 `preSpawnModelGuard` duplicate is
src/runtime/subagent-isolation.ts:51:// dead RFC-0005 `preSpawnModelGuard` duplicate that used to live here is deleted.
tests/subagent-isolation.test.ts:9,64                (comments only)
$ grep -rn "subagent-rpc-driver" --include=*.ts src extensions tools tests
src/runtime/subagent-json-driver.ts:1
src/runtime/subagent-json-driver.ts:19
```

Every hit for both names is a comment; neither is declared, imported, or
present as a file.

## Why this is a problem
Historical narration: these four sites carry no information about the code as
it stands — they describe a deletion and a removed module by name. A reader
following `subagent-rpc-driver.ts` finds nothing to read, and a reader
grepping `preSpawnModelGuard` finds only the comments that mention it, which
is the shape the D2 lens names as leftover narration of the build history
rather than of the current surface. The two artefacts are provably absent:
`ls src/runtime | grep -i rpc` is empty and every `preSpawnModelGuard` hit in
`src/`, `extensions/`, `tools/` and `tests/` is inside a comment.

## Suggested direction (non-binding, optional)
The current-state facts these paragraphs wrap around — that the pre-spawn
guard lives in `subagent-model-guard.ts` and that the parent-side driver is the
JSON envelope consumer — can be stated without naming the removed function or
the removed file.

## False-positive check
- `grep -rn "preSpawnModelGuard" --include=*.ts src extensions tools tests` —
  five hits, all inside comments (two in the cited file, one in
  production-theta-producer.ts, two in tests/subagent-isolation.test.ts). No
  declaration, no import, no export.
- `grep -rn "subagent-rpc-driver" --include=*.ts --include=*.md src extensions tools tests docs`
  — three hits: the two cited comment lines plus one bug-investigation note in
  `docs/`. No such module file.
- `ls src/runtime | grep -i rpc` — no file matches, confirming the named module
  is gone rather than renamed within the directory.
- Checked for dynamic/string-keyed resolution of either name (`grep -rn
  "\"preSpawnModelGuard\"\|'preSpawnModelGuard'" src extensions tools tests`) —
  no hits.
- Distinct from the already-filed launcher narration candidate
  (`qw20260907130901-d2-04-launcher-rfc0005-drive-narration-stale`), which
  concerns stale *behavioural* claims in `subagent-launcher.ts`; this one is
  about two other files naming artefacts that no longer exist.
- Distinct from `qw20260907183353-d2-01-json-driver-provenance-citations-drifted`,
  which cites lines 73-82 and 226-235 of the same file (the provenance
  line-number citations), not the header.

## Triage
