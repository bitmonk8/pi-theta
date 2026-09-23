---
id: pending
title: The QRY-19 parse-time check cluster (checkDiscardedQueryResult and its code/message/hint and input types) lives in src/runtime/query-discard.ts while its only production consumer is the parser's structural walk
lens: D9
status: intake
verdict: pending
locations:
  - src/runtime/query-discard.ts:41-110
  - src/parser/structural-checks.ts:26
  - src/parser/structural-checks.ts:544-566
sites: 6
fix_scope: cross-module
wave: qw20260923145222
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# The QRY-19 parse-time check cluster (checkDiscardedQueryResult and its code/message/hint and input types) lives in src/runtime/query-discard.ts while its only production consumer is the parser's structural walk

## Observation
`src/runtime/query-discard.ts` (208 LOC) states in its header that it "owns two
coupled obligations": QRY-19, "the `theta/parse/discarded-query-result` parse
error on a bare `@`...`` expression-statement", and QRY-20, the runtime
discard-observability event. The QRY-19 half — 6 declarations:
`DISCARDED_QUERY_RESULT_CODE` (:42), `DISCARDED_QUERY_RESULT_MESSAGE` (:49-50),
`DISCARDED_QUERY_RESULT_HINT` (:53-54), `QueryStatementDisposition` (:61-70),
`QueryStatement` (:75-86), `checkDiscardedQueryResult` (:92-110), ~70 LOC — is
a pure parse-phase diagnostic, and its sole production importer is a parser
module, `src/parser/structural-checks.ts`, imported upward across the
parser→runtime boundary.

## Evidence
The upward import and its one use site (walkStatement's `query` arm):

src/parser/structural-checks.ts:26
```ts
import { checkDiscardedQueryResult } from "../runtime/query-discard";
```
src/parser/structural-checks.ts:556-564
```ts
      pushDiag(
        out,
        checkDiscardedQueryResult({
          isQuery: true,
          disposition: "bare-expr-statement",
          file,
          range: s.range,
        }),
      );
```

Affinity counted both ways: `checkDiscardedQueryResult` (query-discard.ts:92-110)
touches 4 members of its own QRY-19 cluster (`DISCARDED_QUERY_RESULT_CODE`,
`_MESSAGE`, `_HINT`, `QueryStatement`) and 0 members of its module's runtime
half (`DiscardSite`, `DiscardedOutcome`, `DiscardEmitInput`, `buildDiscardEvent`,
`emitDiscardObservability` — none referenced at :41-110); its only imports in
use are `Diagnostic` / `SourceRange` from `../diagnostics/diagnostic`. The
QRY-20 half is the module's only genuinely runtime-touching code
(`emitRuntimeEvent`, `RuntimeEvent`, `QueryError`, `SystemNoteChannelDeps`).
Importer search (`grep -rn 'query-discard' src --include=*.ts`, excluding the
module itself): exactly 2 hits — src/parser/structural-checks.ts:26 (the import)
and src/extension/production-theta-producer.ts:417 (a comment). `grep -rln
checkDiscardedQueryResult src tests`: src/parser/structural-checks.ts,
src/parser/lexical-call-sites.ts (comment only, :17), tests/par-for.test.ts,
tests/query-discard.test.ts. Sibling pattern: every other `theta/parse/*`
checker in this shard lives under src/parser/ — structural-checks.ts,
query-annotation-check.ts (`theta/parse/query-annotation-*`),
schema-graph-checks.ts, stdlib-arg-diagnostics.ts
(`theta/parse/stdlib-arity-mismatch`, homed in src/parser despite its runtime
signature import) — so a parse-error emitter homed under src/runtime/ has no
sibling-in-kind there.

## Why this is a problem
A declaration's affinity is counted, not felt: the QRY-19 cluster touches 0
runtime members and 2 diagnostics members, is exported to exactly 1 production
importer, and that importer is a layer below its home — the parser's
whole-document structural walk reaches upward into src/runtime/ for a parse
error every sibling parse check gets from src/parser/. The header's "two
coupled obligations" coupling is by spec document
(query-escapes-stringification.md names both QRY-19 and QRY-20), not by code:
the two halves of query-discard.ts share no declaration, constant, or helper.

## Suggested direction (non-binding, optional)
Rightful-home hypothesis (unproven): move the 6 QRY-19 declarations
(query-discard.ts:41-110, ~70 LOC) into src/parser/ (structural-checks.ts's own
per-node check battery, or a small sibling module), leaving query-discard.ts as
the QRY-20 runtime-observability module its remaining imports actually use.
Cross-references back: none (the cluster references nothing in the QRY-20
half).

## False-positive check
Affinity counts both ways: 4 own-cluster members / 0 own-module runtime members
/ 2 diagnostics members (listed above). Sibling-pattern citation: the four
parser-homed `theta/parse/*` checkers in this shard, named per instance above.
Importer search run: `grep -rn "query-discard" src --include=*.ts` (2 hits, one
a comment) and `grep -rln checkDiscardedQueryResult src tests` (2 src hits, one
a comment). Barrel/facade check: query-discard.ts is a behaviour-bearing V13g
seam module, not a re-export facade. D2-deadness check: checkDiscardedQueryResult
has a live production caller (structural-checks.ts:558), so this is
misplacement, not deadness; separately, the QRY-20 half (`buildDiscardEvent`,
`emitDiscardObservability`, :112-208) has ONLY test callers
(tests/query-discard.test.ts) — routed to D2 in the wave notes, not filed here.
Prior-filing check: no PTQ or pending candidate names query-discard.ts;
PTQ-1212 (resolved) concerned query-schema-lowering.ts, a different module.

## Triage
verdict: questionable — accounting verified: query-discard.ts:41-110 reproduces byte-for-byte (CODE :42, MESSAGE :49-50, HINT :53-54, QueryStatementDisposition :61-70, QueryStatement :75-86, checkDiscardedQueryResult :92-110) and the cluster references only Diagnostic/SourceRange from ../diagnostics — 0 of the module's runtime members (DiscardSite, DiscardedOutcome, DiscardEmitInput, buildDiscardEvent, emitDiscardObservability) and the QRY-20 half references none of the QRY-19 cluster back; size-scan map confirms 208 LOC / exempt band (placement review applies) and checkDiscardedQueryResult 1/1 importers, my grep across src/, extensions/, tools/, tests/ finding the single production importer at src/parser/structural-checks.ts:26 with its one call at :558 (production-theta-producer.ts:417 and lexical-call-sites.ts:17 are comments; whole-program-parser.test.ts, par-for.test.ts, query-discard.test.ts are test callers), the structural-checks.ts:21-25 comment stating the upward import is deliberate ('QRY-19 lives in the runtime discard module … established pattern') being a placement rationale, not a spec-cited invariant; sibling pattern holds for the four named src/parser checkers (query-annotation-check 8, schema-graph-checks 5, stdlib-arg-diagnostics 10 theta/parse/ codes) though 'no sibling-in-kind under src/runtime/' is overstated — stdlib-array.ts and stdlib-object.ts also carry theta/parse/ codes (PTQ-1271 territory), not load-bearing here; no exemptions.json row, no prior placement filing on query-discard.ts (PTQ-1212/1265/1266/1268/1277 are different modules; TRIAGE_LOG 2026-09-11 human ruling on d2-04 concerned the accepted-form arms, a different root cause); frontmatter omits d9_class (misplacement is unambiguous from body, not blocking) — the target home (src/parser/ sibling module vs structural-checks.ts battery) is a design decision needing a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified; target home needs a human ruling: query-discard.ts:41-110 reproduces (CODE :42, MESSAGE :49-50, HINT :53-54, Disposition :61-69, QueryStatement :75-84, checkDiscardedQueryResult :92-110), and the cluster touches 4 of its own QRY-19 members, 0 of the module's QRY-20 runtime members, and only Diagnostic/SourceRange from ../diagnostics; the QRY-20 half references none of it back; size-scan map gives 208 LOC, exempt band (placement review applies), checkDiscardedQueryResult importers 1/1; the lone production importer is structural-checks.ts:25 (the filing says :26, small drift) with its call at :556-564; the query-discard hits in production-theta-producer.ts:417 and lexical-call-sites.ts are comments only; the "no sibling-in-kind under src/runtime/" claim is overstated: parse-time checkers consumed upward from runtime also exist (stdlib-array checkArrayJoin, stdlib-object checkObjectIndex, tool-call checkToolCallArguments), but those sit beside their runtime member, so the affinity count still stands; the structural-checks.ts:20-24 comment is a placement rationale, not a spec-cited invariant; not a duplicate: resolved PTQ-1265/1212/1277 concern other modules, and the 2026-09-11 human ruling on d2-04 covered the accepted-form arms; d9_class is missing from the frontmatter but misplacement is clear from the body, so this does not block evaluation (triage: claude-opus-5-5)
verdict: questionable — accounting verified; the target home needs a human ruling: size-scan map gives query-discard.ts 208 LOC, exempt band (placement review applies), with the six QRY-19 declarations at 42/49-50/53-54/61-69/75-84/92-110; checkDiscardedQueryResult has 1 src importer and 1 test importer; that one src importer is structural-checks.ts:25 (the filing says :26, small drift), with the call at :556-564; the cluster uses only Diagnostic/SourceRange plus its own 4 members, touches none of DiscardSite/DiscardedOutcome/DiscardEmitInput/buildDiscardEvent/emitDiscardObservability, and the QRY-20 half does not reference it back; other hits (production-theta-producer.ts:417, lexical-call-sites.ts:17, par-for.test.ts:775, b0399 test) are comments or tests; the structural-checks.ts:20-24 comment ('parser→runtime pure-function imports are an established pattern') gives a placement reason, not a spec invariant, so the affinity count stands; not a duplicate: PTQ-1156 mentioned this import only from the theta-document importer side, and PTQ-1272/0164/0677 cover other root causes (triage: claude-opus-5-5)
