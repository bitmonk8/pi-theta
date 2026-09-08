---
id: PTQ-0104
title: emptySchemaBodyDiagnostic's doc enumerates two calling positions ("the two positions") while three call sites exist
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/schema-declarations.ts:54-62
sites: 1
fix_scope: localized
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# emptySchemaBodyDiagnostic's doc enumerates two calling positions ("the two positions") while three call sites exist

## Observation
The doc comment on `emptySchemaBodyDiagnostic` presents an exhaustive roster of its callers: `checkObjectSchema`'s zero-field arm and `walkType` (type-grammar.ts), closing with "A second construction site would let the two positions' messages drift apart." The current code has three call sites: the two named ones plus a third inside type-grammar.ts's `parseObject` (the bug-0257 empty-comma-slot arm), which the roster does not mention.

## Evidence
src/parser/schema-declarations.ts:54-62 — the roster:
```
/**
 * The `theta/parse/empty-schema-body` diagnostic (schemas.md §Object schema;
 * grammar.md §"Inline object types"), naming `subject` as whatever has no
 * fields. The SOLE construction point for this code: `checkObjectSchema`'s
 * zero-field arm below passes the declaration's name, and `walkType`
 * (type-grammar.ts) passes the literal two bytes `{}` for an inline object
 * whose brace interior carries no token. A second construction site would let
 * the two positions' messages drift apart.
 */
```
The three actual call sites (`grep -rn "emptySchemaBodyDiagnostic(" src tests extensions tools`):
- src/parser/schema-declarations.ts:96 — `checkObjectSchema`'s zero-field arm (named by the roster).
- src/parser/type-grammar.ts:1549 — inside `walkType` (function begins :1484; `case "object"` :1542) for a token-free interior (named by the roster).
- src/parser/type-grammar.ts:925 — inside the class method `parseObject()` (declared above :925; the call reads `this.site`), the empty-comma-slot arm:
```
              if (fieldTypes.length > 0) {
                pending.push(this.discardedEntryRefusal());
                pendingSlotIndex = pending.length - 1;
              } else if (!emptySlotBodyPushed) {
                pending.push(emptySchemaBodyDiagnostic("{}", this.site));
                emptySlotBodyPushed = true;
```
This third site is not `walkType` and not `checkObjectSchema`; the roster names neither `parseObject` nor a third position.

## Why this is a problem
Historical narration drift: the comment's caller roster — written as the rationale for keeping one construction point ("the two positions' messages") — no longer matches the code. A reader auditing where `theta/parse/empty-schema-body` can be raised is told two positions and would miss the parse-time comma-slot emission at type-grammar.ts:925, which fires on a different trigger (an empty entry slot in a brace interior that does carry tokens) than the token-free-interior arm the roster describes. The single-construction-point claim itself remains true; only the enumeration of who calls it is stale.

## Suggested direction (non-binding, optional)
Update the roster to name the third caller (or restate it non-exhaustively, e.g. "checkObjectSchema plus type-grammar's inline-object positions"), keeping the sole-construction-point sentence.

## False-positive check
- Caller search: `grep -rn "emptySchemaBodyDiagnostic"` across src/, extensions/, tools/, tests/ — call sites are exactly schema-declarations.ts:96, type-grammar.ts:925, type-grammar.ts:1549; tests reference the name in comments only (inline-object-quoted-field-name-refusal.test.ts:468, generic-argument-inline-field-key-rules.test.ts:27), no fourth call.
- Enclosing-function check for :925: the nearest preceding method declaration is `private parseObject(): TypeNode` and the call passes `this.site` — `walkType` (:1484) is a standalone function with a `site` parameter, so :925 cannot be inside it.
- Both type-grammar sites pass the same `"{}"` subject, so no message drift exists today — the finding is the stale roster, not a divergence; no behavior claim is made.
- Duplicate check: the filed citation-drift findings (qw20260907183353-d2-01-producer-line-citations-drifted, d2-02-composition-line-citations-drifted, d2-02-param-line-tokenise-citation-drifted, d2-08-import-separator-check-citations-drifted, qw20260907130901-d2-04-interpolation-source-stale-call-site-count, d2-06-ledger-errnote-call-site-count-stale) cite other files; none touches schema-declarations.ts:54-62.

## Triage
verdict: confirmed — both excerpts byte-match at the cited lines, my own grep reproduces exactly three call sites (schema-declarations.ts:96, type-grammar.ts:925, :1549) plus two comment-only test mentions, and the enclosing-function check holds (:925 sits in `private parseObject()` at :815, not `walkType` at :1484); git proves the drift rather than an error at birth — the roster was written 2026-08-03 in bug-0045 commit 9ea93511e when exactly the two named positions existed, and the third landed 2026-08-24 in bug-0257 commit a6816b96c ("empty inline-object entry slots refuse") without updating it, so "the two positions" is now false of three; the third site is live production code, not dead (reached via parsePrimaryHead:723 and witnessed by tests/inline-object-empty-entry-slot-refusal.test.ts), the candidate's narrower "SOLE construction point" claim independently verifies as still true (no other src/ site builds `theta/parse/empty-schema-body`), and no peer filing shares this root cause (lower-query-schema-two-pins explicitly disclaims it; pending-slot-index-value-unread cites the same lines for a write-only variable). (triage: claude-opus-5)
