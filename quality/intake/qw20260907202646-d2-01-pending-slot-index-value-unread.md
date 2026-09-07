---
id: pending
title: TypeParser.parseObject's `pendingSlotIndex` stores a `pending`-array index that no expression reads; both readers test only its definedness and then `pop()` the array's tail
lens: D2
status: intake
verdict: pending
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
