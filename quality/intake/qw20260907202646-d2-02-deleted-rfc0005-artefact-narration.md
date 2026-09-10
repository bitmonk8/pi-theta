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
verdict: questionable — all four excerpts are verbatim (site 2 drifted to :54-59) and both absence claims reproduce (no `preSpawnModelGuard` declaration and no `subagent-rpc-driver.ts` anywhere; every hit a comment, no dynamic/string-keyed access), but the anchor is taste rather than a demonstrated mismatch: the comments accurately state the deletion, `git blame` puts all four lines in the deletion commit itself (4866d4d2 "child-process theta execution (RFC 0006)") as deliberate single-source-of-truth notes rather than leftovers of an earlier commit (unlike the confirmed d2-04 launcher siblings, which survived from fda23a4b making false behavioural claims), every "moved elsewhere" pointer resolves live (`guardResolvedModel` subagent-model-guard.ts:105, `confirmChildModel` :150, the PIC-66 kill at subagent-json-driver.ts:361) and "not kept as a fallback" is true (only one driver in src/runtime), which refutes the premise that these sites "carry no information about the code as it stands" — the isolation :54-59 note also explains why the module re-exports the codes but not the guard, and the sibling copy at production-theta-producer.ts:2276-2278 sits directly above the live `guardResolvedModel(...)` call as an anti-regression note; site 2 additionally falls inside the already-confirmed qw20260907130901-d2-06-isolation-model-guard-reexport-unused (:48-61), so a human should rule whether accurate provenance guard-rails count as cruft (triage: claude-opus-5)
verdict: questionable — every fact reproduces (four excerpts verbatim, site 2 drifted to :54-59; `preSpawnModelGuard` has no declaration/import/export and `subagent-rpc-driver.ts` is absent from the tree and `git ls-files`, every hit a comment, no string-keyed access) and historical narration is in the D2 hunt list, but the stated anchor — the sites "carry no information about the code as it stands" — fails independent check: the "moved elsewhere" pointers resolve live (`guardResolvedModel` subagent-model-guard.ts:105, `confirmChildModel` :150, PIC-66 kill subagent-json-driver.ts:361), "not kept as a fallback" is true (zero non-comment rpc hits in src, one driver file), nothing narrated is false, and blame puts every cited line in the deletion commit itself (4866d4d2 removed `export function preSpawnModelGuard` and the 360-line rpc driver and wrote these notes in the same diff; :21-22 re-touched by 21937ef5b) — deliberate deletion records, unlike the confirmed precedents (PTQ-0040/0114 false claims predating the mechanism, PTQ-0119 a pre-deletion pointer to lost rationale); site 2 also sits wholly inside open PTQ-0051 (:48-61), whose Why already flags that rationale sentence as stale, leaving sites 1/3/4 as accurate-but-historical name-drops whose removal is a taste call for a human (triage: claude-opus-5)
verdict: questionable — sites 1/3/4 (subagent-isolation.ts:16-22, subagent-json-driver.ts:1, :19-21) reproduce verbatim and both absence claims hold independently re-run (no `preSpawnModelGuard` declaration/import anywhere in src/extensions/tools/tests, only comment hits; no `subagent-rpc-driver.ts` or similarly-named file under src, only tests/helpers/fake-rpc-child.ts), and every "moved elsewhere" pointer resolves live (`guardResolvedModel` subagent-model-guard.ts:101, `confirmChildModel`:146, PIC-66 kill subagent-json-driver.ts:362) with git blame showing deliberate contemporaneous RFC-0006 authorship (4866d4d2/21937ef5b) rather than confused leftovers, refuting the "carries no information about the code as it stands" premise and leaving only a taste-level anchor; site 2 (subagent-isolation.ts:49-54) no longer exists anywhere in the file — its whole PIC-62 reexport-plus-rationale block was deleted wholesale by ae6733f3 (2026-09-10, fixing PTQ-0051), so only 3 of the 4 filed sites remain live for a human to weigh (triage: claude-opus-5)
verdict: questionable — independently re-verified: sites 1/3/4 reproduce verbatim at the exact cited lines (no drift), site 2's text is gone from the file entirely, not merely drifted (ae6733f3 deleted the whole PIC-62 block while fixing PTQ-0051), and both absence claims hold (no `preSpawnModelGuard` declaration/import/export anywhere in src/extensions/tools/tests, no `subagent-rpc-driver.ts` file or import, every hit a comment, no string-keyed access); but `git blame` puts every surviving cited line in 4866d4d2, the same RFC-0006 commit whose own message records deleting `subagent-rpc-driver.ts` (360 lines) and `preSpawnModelGuard` — contemporaneous anti-regression notes written in the deletion diff itself, not decayed leftovers — and every "moved elsewhere" pointer resolves live (`guardResolvedModel` subagent-model-guard.ts:101, `confirmChildModel` :146, PIC-66 kill in subagent-json-driver.ts:357-363), with the identical redirect pattern still live directly above the call site at production-theta-producer.ts:2290-2294, so the "carries no information about the code as it stands" premise is refuted and only a taste-level anchor over the 3 remaining sites is left for a human to weigh (triage: claude-opus-5)
