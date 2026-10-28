---
id: pending
title: runInventoryClosureAudit retains comment-trivia traversal inside its 193-LOC audit driver
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/inventory-closure-audit.ts:757-949
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/inventory-closure-audit.ts#runInventoryClosureAudit
d9_band: justify
wave: qw20261028153325
reported_by: lens-d9-placement (openai/gpt-6.1-sol)
date: 2026-10-28
triaged_at: e071eada0d46fdc4e5ebc1a9f3bb2a97f028d3a5
---

# runInventoryClosureAudit retains comment-trivia traversal inside its 193-LOC audit driver

## Observation
The authoritative map measures `runInventoryClosureAudit` at 193 LOC, function band justify, with 0 src / 1 test importers. The module header identifies the function as the in-memory core of the inventory-closure audit. Surface-shape recognition, reference collection and marker classification are delegated to module-private functions, but comment-trivia traversal still lives inside the per-file driver. That traversal owns its own deduplication set and result map.

## Evidence
Step inventory partitions the supplied 757-949 range; step spans include comments and separators, and sum to the map's 193 LOC. Reads/writes describe the boundary surface, not dependencies hidden inside existing delegated functions.

| phase | line ranges | LOC | locals read / written |
|---|---|---|---|
| inventory and allow-list indexing | 757-781 | 25 | reads input; writes inventory, cat1Members, cat3Members, cat2Names, typeboxNamed, typeboxMembers |
| file order, counters and source parsing | 782-796 | 15 | reads input; writes ordered, walked, recognised, paths, path, fileIndex, content, sf, lineOfPos, familyFourLines |
| shape-violation callbacks and delegation | 797-838 | 42 | reads ordered, path, fileIndex, lineOfPos, familyFourLines, sf; writes recognised; creates push, emitFamilyFour |
| reference callback, Type-import recognition and delegation | 839-888 | 50 | reads sf, lineOfPos, emitFamilyFour and five index sets; writes recognised, refs, clauseELines, typeboxTypeIsImported; creates resolveRef |
| comment-trivia collection | 889-914 | 26 | reads sf, content, lineOfPos; owns/writes commentByLine, seenComment; creates recordComment, collectComments |
| marker delegation and reference violation emission | 915-926 | 12 | reads sf, commentByLine, refs, familyFourLines, clauseELines, push; writes authorisedLines and records through push |
| canary, deterministic order and result | 927-949 | 23 | reads walked, recognised, ordered; writes canaryOk, ordered and returned records |

`src/extension/inventory-closure-audit.ts:895-908`:
```ts
    const commentByLine = new Map<number, string>();
    const seenComment = new Set<number>();
    const recordComment = (range: ts.CommentRange): void => {
      if (seenComment.has(range.pos)) return;
      seenComment.add(range.pos);
      commentByLine.set(lineOfPos(range.pos), content.slice(range.pos, range.end));
    };
    const collectComments = (node: ts.Node): void => {
      for (const range of ts.getLeadingCommentRanges(content, node.getFullStart()) ?? []) {
        recordComment(range);
      }
      for (const range of ts.getTrailingCommentRanges(content, node.getEnd()) ?? []) {
        recordComment(range);
      }
```

`src/extension/inventory-closure-audit.ts:909-918`:
```ts
      // `getChildren` (not `forEachChild`) descends into punctuation tokens too
      // (`}`, `,`), so a marker trailing the last specifier before a closing
      // brace on a multi-line import is captured as that brace's leading trivia.
      for (const child of node.getChildren(sf)) collectComments(child);
    };
    collectComments(sf);

    const authorisedLines = classifyAndEmitMarkers(
      sf, commentByLine, refs, familyFourLines, clauseELines, push,
    );
```

Only three outer locals enter comment collection (`sf`, `content`, `lineOfPos`), and one result leaves (`commentByLine`). Neither `seenComment` nor the recursive traversal touches the inventory indexes, record callbacks, counters, references or authorisation sets. The executable/declaration span 895-914 is 20 physical lines within the step's 26-line span; this is a boundary measurement, not a remeasurement of the mapped host.

## Why this is a problem
The justify band presumes breakdown unless a concrete keep-whole reason is evidenced. The remaining comment traversal has a three-input/one-output boundary independent of the driver's record and resolution state, so splitting that phase would not thread six or more shared locals through its helper signature.

Reasons considered: single algorithm with shared local state fails for that explicit boundary, even though other audit phases have larger signatures. Closed-enumeration dispatch does not explain the driver: it performs indexing, parsing, traversal, delegation and final emission rather than dispatching across short arms of one closed set. The comment phase itself uses `getChildren`, while the existing surface visitors use `forEachChild`, as the punctuation requirement in the excerpt explains. Data-only/type family and one grammar production do not describe this executable post-parse driver. There is no generated-code banner or generator attribution. The inventory-first-resolution rule orders checks, but a synchronous helper returning the same comment map at the same point does not change that order.

## Suggested direction (non-binding, optional)
Unproven hypothesis, for human ratification: Seam A: commentByLine/seenComment construction, recordComment, collectComments and its initial call -> module-private collectAuditComments helper (hypothesis) - 20 physical lines at 895-914, 0 exported symbols moved, external importers 0 src / 0 tests (these are nested locals absent from the export map), cross-references back into the host: sf, content and lineOfPos as inputs, commentByLine as output. No other seam is asserted.

## False-positive check
- Band: justify, 193 LOC, supplied map; no host size was recounted.
- Reasons-considered check: all five concrete reason classes examined above; the three-input trivia boundary defeats a keep-whole shared-state claim for the whole body.
- Exemptions check: quality/exemptions.json contains no entry for this function or file.
- Generated-code check: the scoped source search for `@generated|DO NOT EDIT|autogenerated` returned no hits. The file's follow-log contains implementation, bug and quality-fix commits, not a generator or reverted extraction.
- Spec-mirror check: audit-resolution.md#audit-inventory-first-resolution imposes resolution precedence; its malformed-marker and multi-line-placement rules explain real-comment/punctuation handling. audit-wire-and-canary.md#audit-non-empty-scan-canary imposes the final counters. These are sequential rule obligations, not one closed dispatch or a requirement that comment harvesting share the record-emission body.
- Prior-finding check: PTQ-0350 ratified visitShapes hoisting, and PTQ-0416 ratified visitRefs and classifyAndEmitMarkers hoisting. Those three functions now exist outside this driver. This candidate concerns the remaining trivia traversal, not any of those completed moves. The sibling file-level candidate concerns the marker language's module boundary and would still apply if this in-file helper landed; conversely this seam remains if the marker group moves modules.
- Placement/husk check: a deliberate pure build-gate core with a test importer, not dead production code or a facade. No test finding is made.

## Triage
verdict: questionable — accounting verified: size-scan reproduces 757-949, 193 LOC/justify and 0 src/1 test importers; excerpts and seven phase spans match, and comment harvesting owns separate deduplication/map state with only sf, content and lineOfPos as outer inputs. No applicable exemption, generated marker, reverted split or spec-required co-location was found; PTQ-0350/PTQ-0416 cover completed visitor/marker hoists, while the sibling intake concerns a module boundary. The remaining breakdown shape requires a human ruling under D9. (triage: claude-opus-5-5)
