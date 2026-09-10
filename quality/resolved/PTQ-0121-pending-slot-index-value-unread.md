---
id: PTQ-0121
title: TypeParser.parseObject's `pendingSlotIndex` stores a `pending`-array index that no expression reads; both readers test only its definedness and then `pop()` the array's tail
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/parser/type-grammar.ts:867-877
  - src/parser/type-grammar.ts:921-928
  - src/parser/type-grammar.ts:944-947
  - src/parser/type-grammar.ts:970-973
sites: 2
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# TypeParser.parseObject's `pendingSlotIndex` stores a `pending`-array index that no expression reads; both readers test only its definedness and then `pop()` the array's tail

## Observation
`TypeParser.parseObject` declares `pendingSlotIndex: number | undefined` and
assigns `pending.length - 1` to it at two sites. Its doc comment describes it
as "the `pending` index of the most recently opened empty entry slot's own
buffered line". The two places that read the variable test only
`pendingSlotIndex !== undefined` and then remove the buffered line with
`pending.pop()` — the array's tail, not the recorded index. No expression in
the module reads the stored number. The remaining eleven assignments write
`undefined`.

## Evidence
src/parser/type-grammar.ts:867-877 — the declaration and the doc comment that
names the payload:
```
    // Bug 0257 (operator adjudication) — SL2/SL3/SL4/SL5's own state, additive
    // to bug 0244's above and cleared on the same events. `pendingSlotIndex` is
    // the `pending` index of the most recently opened empty entry slot's own
    // buffered line, valid only until the IMMEDIATELY following entry has been
    // judged (cleared once a `Field` derives, once a genuine entry separator is
    // crossed, or once that judgement has run) — the window SL5's adjacency
    // collapse is scoped to. `emptySlotBodyPushed` guards SL3's per-interior
    // cap: `theta/parse/empty-schema-body` reads "'{}' has no fields", which
    // cannot be true twice of one interior, so a second comma-only slot before
    // any `Field` derives buffers nothing further.
    let pendingSlotIndex: number | undefined;
```

src/parser/type-grammar.ts:921-928 — the two assignments that write a number:
```
              if (fieldTypes.length > 0) {
                pending.push(this.discardedEntryRefusal());
                pendingSlotIndex = pending.length - 1;
              } else if (!emptySlotBodyPushed) {
                pending.push(emptySchemaBodyDiagnostic("{}", this.site));
                emptySlotBodyPushed = true;
                pendingSlotIndex = pending.length - 1;
              }
```

src/parser/type-grammar.ts:944-947 — reader 1 (the non-`ident` discard arm):
```
            if (pendingSlotIndex !== undefined) {
              pending.pop();
              pendingSlotIndex = undefined;
            }
```

src/parser/type-grammar.ts:970-973 — reader 2 (the colon-gate discard arm),
byte-identical:
```
            if (pendingSlotIndex !== undefined) {
              pending.pop();
              pendingSlotIndex = undefined;
            }
```

Exhaustive occurrence list (`grep -n "pendingSlotIndex"
src/parser/type-grammar.ts` → 15 hits): :868 and :877 (doc + declaration),
:923 and :927 (the two numeric writes above), :944 and :970 (the two
definedness reads above), and :930, :946, :955, :972, :977, :994, :1018,
:1058, :1066 (writes of `undefined`). No hit outside those, and none uses the
variable in an arithmetic, indexing, or comparison position.

## Why this is a problem
Vestigial payload: a value is computed and stored at two sites and never read.
The variable's declared type (`number | undefined`) and its doc comment both
advertise an index that carries information the code does not consume — the
two readers are satisfied by presence alone, and the removal they perform is
positional (`pop()`) rather than index-addressed. A reader tracing why the
index is recorded finds no consumer, and the doc comment's framing ("the
`pending` index of … its own buffered line") describes a mechanism the code
does not implement.

## Suggested direction (non-binding, optional)
Either the readers use the recorded index, or the state is recorded as the
presence fact the two readers actually consult; the fix stage owns the call.

## False-positive check
- Identifier search across the whole repository:
  `grep -rn "pendingSlotIndex" --include=*.ts src extensions tools tests` →
  hits only in src/parser/type-grammar.ts (15, enumerated above). The variable
  is a function-scoped `let` inside `TypeParser.parseObject`, so it is
  unreachable from any other module by construction; no test observes it.
- Dynamic/string-keyed access: `grep -rn "pendingSlotIndex" .` (excluding
  `node_modules`, `.git`, `dist`, `.pi/tmp`) → the same 15 source hits plus
  none in any string literal, so no `obj["pendingSlotIndex"]`-style read
  exists.
- Value-read check: each of the 15 hits was inspected in context. The only two
  reads are the `!== undefined` tests at :944 and :970; neither uses the
  number, and both are immediately followed by `pending.pop()`.
- Tests-are-callers check: not applicable — this is a local variable, so no
  caller of any kind (test or production) can reach it; the finding is about a
  write with no read inside the same function, not about test-only
  reachability.
- Git-intent check: the surrounding comments attribute the state to "Bug 0257
  (operator adjudication) — SL2/SL3/SL4/SL5's own state" and describe an
  index-scoped window, so the numeric form was deliberate at authoring time;
  the current code reaches the same behaviour through `pop()` alone.

## Triage
verdict: confirmed — I re-ran the hunt myself: `grep -rn pendingSlotIndex --include=*.ts src extensions tools tests` returns exactly 15 hits, all in src/parser/type-grammar.ts, and line-by-line inspection of all 15 partitions them as 1 comment (:868), 1 declaration (:877), 2 numeric writes (:923/:927), 9 `undefined` writes (:930/:946/:955/:972/:977/:994/:1018/:1058/:1066) and 2 definedness-tests (:944/:970) — zero arithmetic, indexing or comparison reads, so the stored number is provably unread; all four excerpts byte-match at the cited lines and the two reader blocks are byte-identical per `diff`; repo-wide grep excluding node_modules/.git/dist finds no string-keyed or dynamic access (only intake docs and .pi/tmp echo the name), and since it is a function-scoped `let` with no other occurrence no closure can reach it, so no re-export or test-caller escape exists; the payload is redundant by an audited invariant, not by accident — .pi/tmp/fixes/0257-report.md:132 records the reviewer auditing "the `pendingSlotIndex === pending.length - 1` invariant on every path", which is exactly why `pop()` suffices; `git log -S` shows one commit ever touched the identifier (a6816b96, bug 0257), so the numeric form was never read at any point in history, and unlike the `questionable` abortsignal-member-labels peer no doc pins this value — docs/bugs/0257:668-672 mandates only replacement semantics ("its line REPLACES the slot's") and no docs/ file mentions `pendingSlot` at all; in scope (live production source under src/, not test-only-reachable) and not a duplicate (the one peer citing these lines, qw20260907183353-d2-06-empty-schema-body-caller-roster-stale, is a stale caller roster in schema-declarations.ts and its own triage note distinguishes this filing). Two immaterial blemishes noted, neither refuting nor blocking: Observation says "eleven assignments write `undefined`" where 9 do (11 is the total including the two numeric writes — the Evidence list enumerates the correct 9), and "describes a mechanism the code does not implement" overstates slightly since the comment accurately describes what is stored and it is only the removal that is positional; the root cause stands on the mechanically proven write-only payload alone. (triage: claude-opus-5)
