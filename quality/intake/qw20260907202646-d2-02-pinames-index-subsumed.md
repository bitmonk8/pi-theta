---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: "`resolveSlashNames` builds the `piNames` Set for one membership test the adjacent `piOwnedByName` Map already answers"
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-walk.ts:1512-1521
  - src/discovery/discovery-walk.ts:1541
  - src/discovery/discovery-walk.ts:1545
sites: 3                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# `resolveSlashNames` builds the `piNames` Set for one membership test the adjacent `piOwnedByName` Map already answers

## Observation

`resolveSlashNames` opens by indexing the same `piOwned` array twice, in
consecutive statements: `piNames`, a `Set` of `command.name`, and
`piOwnedByName`, a `Map` from `command.name` to the commands carrying it. Both
are built unconditionally from every element of `piOwned` under the same key
expression. `piNames` is read once, as the Pi-owned collision guard
`piNames.has(name)`; `piOwnedByName` is read four lines later, inside the block
that guard opens. Because both indexes are derived from the same array with the
same key, `piNames.has(name)` and `piOwnedByName.has(name)` hold for exactly the
same names. `piNames` dates from the module's first commit; `piOwnedByName` was
added later, by the bug-0459 commit that introduced the sibling-path tail.

## Evidence

src/discovery/discovery-walk.ts:1512-1521 — both indexes built from `piOwned`
in consecutive statements:

```ts
  const piNames = new Set(piOwned.map((command) => command.name));
  const piOwnedByName = new Map<string, PiOwnedCommand[]>();
  for (const command of piOwned) {
    const bucket = piOwnedByName.get(command.name);
    if (bucket === undefined) {
      piOwnedByName.set(command.name, [command]);
    } else {
      bucket.push(command);
    }
  }
```

src/discovery/discovery-walk.ts:1541 — the only read of `piNames` (`grep -n
"piNames" src/discovery/discovery-walk.ts` yields exactly two hits: the
declaration at 1512 and this one):

```ts
    if (piNames.has(name)) {
```

src/discovery/discovery-walk.ts:1545 — `piOwnedByName` read inside the block
that guard opens, on the same `name`:

```ts
      const siblingPaths = (piOwnedByName.get(name) ?? [])
```

Git history of the two declarations: `git log -S "const piNames" --format="%h
%s" -- src/discovery/discovery-walk.ts` → `070a1ef3 V10a — Discovery walk,
sources, and collisions` (the module's first commit); `git log -S
"piOwnedByName" --format="%h %s" -- src/discovery/discovery-walk.ts` →
`69e8f632 fix(bug-0459, bug-0460): collision message form (suffix drop, ordered
paths, sibling tail) …`, so the Map post-dates the Set.

## Why this is a problem

Redundant state, with the subsuming structure cited: the function keeps two
indexes over one array where the later-added one answers the earlier one's sole
question. The equivalence is mechanical rather than stylistic — both are
populated by a full pass over `piOwned` keyed on `command.name`, neither
filters, and `piOwned` is not mutated between the two statements, so no name
can be a member of one and not the other. A reader of the guard at :1541 must
re-derive that fact to see that the `?? []` fallback at :1545 cannot fire, and
the two structures have to be kept in step by hand if the key expression
changes.

## Suggested direction (non-binding, optional)

The guard's question can be asked of the structure already consulted inside the
block it opens; nothing else reads the Set.

## False-positive check

- Reference searches: `grep -n "piNames" src/discovery/discovery-walk.ts` → 2
  hits (declaration :1512, read :1541). `grep -rn -w "piNames" src extensions
  tools tests` → 4 hits: those two, plus two prose mentions inside comments in
  tests/b0460-skill-arm-vacuous-at-pin.test.ts:5 and :162 ("the byte-exact
  `piNames.has(stem)` membership test in `resolveSlashNames`"). Those are
  narration, not references: `piNames` is a function-local `const`, so no
  module can import or otherwise reach it.
- Enclosing-function reachability: `grep -rn "resolveSlashNames" src extensions
  tools tests` → the declaration (:1506, not exported), its single call
  (:1301), one comment in the same file (:62), one comment in
  src/extension/production-composition.ts:661, and comments in nine test files.
  No import of the symbol exists anywhere, so both indexes are observable only
  through this function's own body.
- Dynamic/string-keyed access: no reflective or string-keyed use of either name
  appears in the greps above; both are plain local bindings.
- Equivalence check: read both constructions at :1512-1521 — neither applies a
  filter, both key on `command.name`, both consume the same `piOwned`
  parameter, and nothing mutates `piOwned` between them.
- Tests-only-caller rule: not applicable — the finding is about a redundant
  index, not about deadness; both indexes are read on the production path.
- Git-history intent: the Set predates the Map by the bug-0459 commit shown
  above, so the overlap arrived with a later change rather than being a
  deliberate pairing introduced together.

## Triage
