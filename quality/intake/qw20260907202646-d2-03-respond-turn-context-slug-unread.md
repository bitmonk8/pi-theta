---
id: pending
title: RespondTurnContext.slug is populated at its single construction site and read by no code
lens: D2
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:4995-5002
  - src/extension/production-theta-producer.ts:3465-3467
  - src/extension/production-theta-producer.ts:3428
  - src/extension/production-theta-producer.ts:3480-3486
sites: 1
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# RespondTurnContext.slug is populated at its single construction site and read by no code

## Observation
`RespondTurnContext` is the module-private record that carries a typed query's
respond-turn machinery to both query drivers. Its first member is
`readonly slug: string`. `#buildRespondTurnContext` destructures `slug` out of
`#registerRespondTool(lowered)`, uses that LOCAL in the
`renderInitialRespondTurn` template call, and also writes it onto the returned
record. Nothing reads the record's `slug` member: no `respond.slug`,
`this.#respond.slug` or equivalent expression exists anywhere, and the
interface is not exported.

## Evidence
src/extension/production-theta-producer.ts:4995-5002 — the declaration:

```ts
/**
 * Bug 0010 (QRY-14 step 2): the LIVE typed query's respond-turn machinery —
 * the registered `__theta_respond_<slug>` identity, the lowered response
 * schema, the QRY-15 template, the resolved respond model with auth/signal
 * threading for the off-session `complete()` dispatch, the early-respond AJV
 * verdict, and the producer's capture-slot accessor.
 */
interface RespondTurnContext {
  readonly slug: string;
```

src/extension/production-theta-producer.ts:3428 — the local the value comes
from:

```ts
    const { slug, toolName } = this.#registerRespondTool(lowered);
```

src/extension/production-theta-producer.ts:3465-3467 — the sole write onto the
record:

```ts
    return {
      slug,
      toolName,
```

src/extension/production-theta-producer.ts:3480-3486 — the only consumer of the
value inside this method reads the destructured LOCAL from 3428, not the record
member:

```ts
      template: renderInitialRespondTurn({
        loweredSchema: respondToolWireSchema(lowered),
        slug,
        toolName,
      }),
```

`grep -c "\bslug\b" src/extension/production-theta-producer.ts` → 35. Reading
each: 20 are comment prose (726, 727, 830, 831, 1009, 1352, 2244, 2253, 2440,
2556, 2557, 2791, 2998, 2999, 3075, 3471, 3473, 3526, 3528, 4996); the
remaining 15 code hits are the unrelated `BinderForcedToolDispatch.slug`
(declaration 748, local 1018, write 1035, uses 1036 and `dispatch.slug` 1369),
the unrelated `regime.slug` read (2800) and child-launch argv
`slug: theta.slashName` (2588), `#registerRespondTool`'s own return-type member
(3534), local (3537), cache key (3540) and `return { slug, toolName }` (3547),
the destructure (3428), the two sites cited above (3466, 3483), and the
declaration (5002). None is a read of `RespondTurnContext.slug`.

## Why this is a problem
A write-only interface member. Every other `RespondTurnContext` member has at
least one reader in this file — `toolName` (5656, 5724, 6575, 7031, 7120, 7162,
7206), `lowered` (6579, 7033, 7169), `template` (5435, 5594, 6344, 6350, 6464),
`model` (7082, 7087, 7102), `auth` (7105), `signal` (7067, 7123, 7131, 7180),
`validate` (5724, 6584), `captureHost` (5727, 5872), `gateError` (5194, 5369,
5485, 6262, 6302, 6396) — so `slug` is the one field the record carries for no
consumer. `git blame` puts the declaration (5002) and the write (3466) in the
same commit, `30492948` (2026-07-27, bug 0010, v0.20.0): it never had a reader.
The surrounding comments spend several paragraphs on the PIC-44 slug-vs-minted-
name distinction, so a reader has to work out that the record's slug half is
inert.

## Suggested direction (non-binding, optional)
Drop the member and keep the slug local to `#buildRespondTurnContext`, or wire
the consumer that would justify carrying it on the record.

## False-positive check
- `grep -rn "RespondTurnContext" --include=*.ts src tests extensions tools`:
  all 10 hits are inside `production-theta-producer.ts` (declaration 5001, the
  builder's return type 3426, the two driver fields 5091/6215, the two
  constructor deps 5142/6242, `#dispatchRespondOverWindow`'s parameter 5591,
  the builder call 3209, one doc mention 3412). The interface carries no
  `export`, so no external module — and no test — can construct or read it.
- Member-read search: `grep -n "respond\.\(toolName\|lowered\|template\|model\|
  auth\|signal\|validate\|captureHost\|gateError\)\|#respond\.\|#respond?\."`
  returned 38 hits, enumerated above; extending the same search to `respond.slug`
  / `#respond.slug` / `#respond?.slug` returns zero.
- Dynamic / string-keyed access: searched this file for `["slug"]`, `'slug'`
  and `"slug"` as string literals — no hits.
- Verified the 3483 `slug` resolves to the destructured local, not to the
  record member: it appears inside the object literal being returned at 3465,
  where a bare identifier binds to the enclosing scope's `const` from 3428.
- Verified the sibling leaf is not implicated: `#registerRespondTool` returns
  `{ slug, toolName }` and its caller destructures both, so that contract has
  a live reader — only the `RespondTurnContext` member is claimed unread.
- Git intent: `git blame -L 5001,5003` and `-L 3465,3467` are both
  `30492948` (2026-07-27, "fix(bug-0010): typed forced respond runs
  off-session via complete() with forced tool choice — v0.20.0"), so this is a
  never-wired member rather than one that lost its reader.

## Triage
