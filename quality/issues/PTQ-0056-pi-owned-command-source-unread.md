---
id: PTQ-0056
title: PiOwnedCommand.source is a required field every constructor must fill and no consumer ever reads
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-walk.ts:36-45
  - src/discovery/discovery-walk.ts:1512-1520
  - src/discovery/discovery-walk.ts:1545-1547
  - src/extension/production-composition.ts:3804
sites: 4                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# PiOwnedCommand.source is a required field every constructor must fill and no consumer ever reads

## Observation
`PiOwnedCommand` (the walk's view of an already-registered Pi-owned slash
command) declares a required `source: "prompt" | "skill" | "extension"`
member. The values flow from `readPiOwnedCommands`
(production-composition.ts) into `discoverThetas` → `resolveSlashNames`
(discovery-walk.ts), the only production consumer. `resolveSlashNames` reads
`name` and `path` off these commands and never `source`. The source-based
filtering the type's union suggests happens earlier, on the Pi SDK's own
command objects inside `readPiOwnedCommands`, before the `PiOwnedCommand`
copy is constructed; the copied field is carried and dropped.

## Evidence
src/discovery/discovery-walk.ts:36-45 — the interface:
```ts
export interface PiOwnedCommand {
  readonly name: string;
  readonly source: "prompt" | "skill" | "extension";
  /** The host-populated `SlashCommandInfo.sourceInfo.path`, rendered as the
   *  `.md`-sibling tail of the `theta/load/cross-format-collision` message
   *  (placeholder-rendering-b.md:57). Absent for a foreign extension command
   *  whose entry carries no host path — the Pi-owned mint then falls back to
   *  the command name. */
  readonly path?: string;
}
```

src/discovery/discovery-walk.ts:1512-1520 — the sole consumer's reads (name
only, to build the lookup structures):
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

src/discovery/discovery-walk.ts:1545-1547 — the only other member reads
(`path`, falling back to `name`):
```ts
      const siblingPaths = (piOwnedByName.get(name) ?? [])
        .map((command) => (command.path !== undefined && command.path !== "" ? normalizePath(command.path) : command.name))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
```

src/extension/production-composition.ts:3804 — the production writer copies
the SDK command's source into the field after the filtering already happened
on `command.source` (the SDK object) at :3785-3801:
```ts
    owned.push({ name: command.name, source: command.source, path: command.sourceInfo?.path });
```

## Why this is a problem
Vestigial field, proven: `PiOwnedCommand` values flow only into
`resolveSlashNames` (`discoverThetas` passes `input.piOwnedNames` straight
through at discovery-walk.ts:1303), and that function's member accesses are
exhaustively `command.name` and `command.path` — no `.source` read exists in
the file on a `PiOwnedCommand` value, and none exists in any test. Because
the field is required, the production writer and every test fixture
(tests/discovery-walk.test.ts:321,
tests/b0459-cross-format-collision-message-form.test.ts:179-186 and :214)
must supply a value that is dead on arrival. The union type restates the
collision source set that `readPiOwnedCommands` already enforces before
construction, so the field duplicates an upstream invariant as unread data.

## Suggested direction (non-binding, optional)
Drop `source` from `PiOwnedCommand` (the filter that needs source information
already runs on the SDK command objects before this type is built), updating
the handful of construction sites in the same change.

## False-positive check
Traced every flow of `PiOwnedCommand` values: constructed at
production-composition.ts:3804 and in three test literals; consumed only via
`DiscoveryInput.piOwnedNames` → `resolveSlashNames`. Searched discovery-walk.ts
for `.source` — all 20+ hits are on `SourcedCandidate` / `DiscoveredTheta`
values (`candidate.source`, `winner.source`, `PRIORITY[a.source]`), none on a
`PiOwnedCommand`. Searched tests/ for `.source` reads tied to these values:
tests/discovery-walk.test.ts:354 and tests/host-config-dir.test.ts:271/296/478
read `DiscoveredTheta.source` (walk results), not `PiOwnedCommand`; no test
reads back a `PiOwnedCommand` literal's field. No string-keyed access
(`["source"]`) on these values exists. Test-only-caller rule considered: tests
write the field (the type requires it) but nothing reads it, so it is not
test-reachable — it is unread. tests/b0460-skill-arm-vacuous-at-pin.test.ts
concerns the SDK-side `command.source` filter arm in `readPiOwnedCommands`, a
different object and a behavioral topic, not this copied field.

## Triage
verdict: confirmed — reproduced: `source` is written at production-composition.ts:3836 (cited :3804, post-wave drift, bytes identical) plus 3 test literals and read nowhere — every `.source` hit in src/, tests/, tools/, extensions/ is on an SDK `command`, `SourcedCandidate`, `DiscoveredTheta` or root, no string-keyed/destructured access, no exports map, and registration-steps.md keys the collision set on the SDK entry (membership-rule form explicitly non-normative), so the copied field is unread data with a production writer. (triage: claude-opus-5)
