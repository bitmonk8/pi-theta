---
id: PTQ-0247
title: b0417's RecordingRegistry duplicates b0397's invocation-recording double verbatim, but b0417 never reads the capture and structurally cannot
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0417-responses-binder-toolchoice-gate.test.ts:163-176
  - tests/b0417-responses-binder-toolchoice-gate.test.ts:248-251
  - tests/b0417-responses-binder-toolchoice-gate.test.ts:266-281
  - tests/b0397-binder-failure-note-runtime-event.test.ts:122-135
  - tests/b0397-binder-failure-note-runtime-event.test.ts:359-369
  - tests/b0397-binder-failure-note-runtime-event.test.ts:400-410
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0417's RecordingRegistry duplicates b0397's invocation-recording double verbatim, but b0417 never reads the capture and structurally cannot

## Observation
tests/b0417-responses-binder-toolchoice-gate.test.ts:170-176 defines a
`RecordingRegistry` class extending `ActiveInvocationRegistry` whose overridden
`add()` pushes each inserted entry's `invocationId` onto a `readonly
addedIds: string[]` field before delegating to `super.add(entry)`. This class
body is byte-for-byte identical (verified with `diff`) to the `RecordingRegistry`
already defined one day earlier, per `git log`, in
tests/b0397-binder-failure-note-runtime-event.test.ts:129-135. In b0397 the
class carries an explanatory doc comment and its `addedIds` field is read by
two live assertions. In b0417 the class carries no doc comment, `addedIds` is
written once and never read anywhere else in the file, and the function that
instantiates it (`driveDispatch`) returns a `DriveOutcome` type that omits the
registry entirely, so no caller in the file can ever reach `addedIds`.

## Evidence
tests/b0417-responses-binder-toolchoice-gate.test.ts:163-176 (the copied class;
no doc comment, unlike its origin):
```ts
interface CapturedNote {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
  readonly details?: { readonly event?: Record<string, unknown> };
}

class RecordingRegistry extends ActiveInvocationRegistry {
  readonly addedIds: string[] = [];
  override add(entry: ActiveInvocationEntry): void {
    this.addedIds.push(entry.invocationId);
    super.add(entry);
  }
}
```

tests/b0417-responses-binder-toolchoice-gate.test.ts:248-251 (`DriveOutcome`
— the only return shape `driveDispatch` produces, and it excludes the
registry):
```ts
interface DriveOutcome {
  readonly notes: CapturedNote[];
  readonly completeCalls: number;
}
```

tests/b0417-responses-binder-toolchoice-gate.test.ts:266-281 (the
instantiation, its one use as `activeInvocations`, and the return statement
that drops `registry` on the floor):
```ts
  const registry = new RecordingRegistry();
  const deps = createProductionProducerDeps({
    pi,
    root: rootDouble(),
    modelRegistry,
    activeInvocations: registry,
  });
  await composeThetaFixture(twoParamTheta(), deps).run("alpha beta", {
    signal: undefined,
  } as unknown as ExtensionCommandContext);
  return { notes, completeCalls: scripted.calls.length };
}
```
Exact search: `grep -n "addedIds" tests/b0417-responses-binder-toolchoice-gate.test.ts`
→ 2 hits total, both inside the class shown above (the field declaration and
the one `push`) — zero read sites anywhere else in the file. `grep -n
"registry\."  tests/b0417-responses-binder-toolchoice-gate.test.ts` → 0 hits
outside the class body itself, confirming `registry` is never queried after
construction.

tests/b0397-binder-failure-note-runtime-event.test.ts:122-135 (the class's
origin, with the doc comment b0417's copy dropped):
```ts
/**
 * A real `ActiveInvocationRegistry` that records each inserted entry's
 * `invocationId` at `add`-time. The dispatch `finally` removes the entry before
 * `run()` resolves, so a post-drive `snapshot()` is empty — recording the id on
 * insertion is how the witness reads the entry the event must source from
 * (`runtime-event-channel.md:83`), and proves the entry was GENUINELY inserted.
 */
class RecordingRegistry extends ActiveInvocationRegistry {
  readonly addedIds: string[] = [];
  override add(entry: ActiveInvocationEntry): void {
    this.addedIds.push(entry.invocationId);
    super.add(entry);
  }
}
```

tests/b0397-binder-failure-note-runtime-event.test.ts:359-369 (b0397's
counterpart function DOES thread `registry` back to its caller):
```ts
  const registry = new RecordingRegistry();
  const deps = createProductionProducerDeps({
    pi,
    root: rootDouble(),
    modelRegistry,
    activeInvocations: registry,
  });

  await composeThetaFixture(theta, deps).run(args, ctx);
  return { notes, registry };
}
```

tests/b0397-binder-failure-note-runtime-event.test.ts:400-410 (and the
`addedIds` reads that make the class earn its keep there):
```ts
): void {
  const { notes, registry } = outcome;
  // Loud precondition: the registry entry was genuinely inserted, so
  // runtime-event-channel.md:83 has
  // something to source from. A silent absence here would make the id/theta
  // assertions vacuous.
  expect(
    registry.addedIds.length,
    "beginInvocation must have inserted exactly one ActiveInvocationRegistry entry for this dispatch (runtime-event-channel.md:83 sourcing)",
  ).toBe(1);
  const entryId = registry.addedIds[0]!;
```

`grep -rln "extends ActiveInvocationRegistry" tests --include="*.test.ts"` →
exactly 2 files: tests/b0397-binder-failure-note-runtime-event.test.ts and
tests/b0417-responses-binder-toolchoice-gate.test.ts. `git log --diff-filter=A
--format=%ad --date=short` shows b0397 added 2026-09-03 and b0417 added
2026-09-04 — one day later, so the class already existed, working, in the
tree when b0417 was authored.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" shape: a recording double (the
rubric's own named example category) is re-implemented byte-for-byte in a
second file instead of reusing what the first file already built one commit
earlier. The duplication is not cosmetic — b0417's copy is strictly weaker
than its origin: b0397 threads `registry` out of its drive function and reads
`addedIds` twice to prove an `ActiveInvocationRegistry` entry was genuinely
inserted before trusting a downstream field-sourcing claim; b0417's
`DriveOutcome` (lines 248-251) never carries `registry` out of `driveDispatch`
at all, so `addedIds` is write-only by construction — no assertion in the file
touches it, and none could without first changing the return type. Every
behaviour b0417's own two `it()` bodies check (`completeCalls`, the note
contents) is available from the plain `ActiveInvocationRegistry` base class
b0417 already imports; the subclass contributes nothing this file's tests can
observe.

## Suggested direction (non-binding, optional)
b0417 already imports the plain `ActiveInvocationRegistry` base class it
extends; `activeInvocations` only needs a working registry instance, which the
base class provides on its own. If a future file needs the same
genuinely-inserted-entry witness b0397 uses, tests/helpers/ is the kind of
place a shared recording double would live — the repository already
centralised a comparable repeated fixture there for `runProductionLoad`
(tests/helpers/production-load-harness.ts).

## False-positive check
- Gate-pin check: tests/b0417-responses-binder-toolchoice-gate.test.ts's
  filename matches `*gate*.test.ts`, but this finding touches no pinned count
  or inventory assertion — it is about an internal, unused helper class
  definition, not about a value the file fixes for itself — so the
  census/pin-gate carve-out does not shield it.
- Recording-double check: b0397's identical class IS a legitimate recording
  double — its `addedIds` backs two real assertions (lines 407 and 410) that
  prove a genuine insertion, and that copy is not what this finding
  challenges. b0417's copy is not functioning as a MUST-NOT (or any) witness:
  `addedIds` is written once and read nowhere, and `DriveOutcome` (lines
  248-251) excludes `registry` from ever reaching a caller, so there is no
  negative witness here for the carve-out to protect.
- docs/bugs/ signature search: docs/bugs/0417-binder-openai-responses-toolchoice-400.md
  is Status "fixed (0.401.0)"; its Fix/Face-B text asks only for a
  `complete()` call count and note-content assertions, never for
  invocation-registry inspection. docs/bugs/0397-binder-failure-notes-empty-event-payload.md
  is Status "fixed (0.392.0)"; its own witness needs (proving "the entry was
  genuinely inserted") are exactly what the same class serves there. `npx
  vitest run tests/b0417-responses-binder-toolchoice-gate.test.ts` → 5/5
  green, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0417-responses-binder-toolchoice-gate" docs/reference/coverage-matrix.md`
  → 0 hits. `grep -rn "RecordingRegistry\|addedIds" docs/bugs/*.md` → 0 hits
  in any bug doc. docs/bugs/0417-binder-openai-responses-toolchoice-400.md:316-319
  cites the file itself as its own witness (expected — every bug-witness file
  is named in its own bug doc) but never cites the `RecordingRegistry` class
  or `addedIds` by name. This finding proposes no merge, rename, or deletion
  of any `it()`/`describe()` — only that one internal, unused helper class
  duplicate could be dropped in favour of the base class already imported —
  so no witness-list citation is disturbed.
- Coverage check: not a claim that a path is untested; `driveDispatch`'s
  actual observables (`completeCalls`, `notes`) are unaffected by this
  finding and are read by both of the file's `it()` bodies exactly as before.
- Scope: only tests/b0417-responses-binder-toolchoice-gate.test.ts is in this
  wave's review scope; tests/b0397-binder-failure-note-runtime-event.test.ts
  is cited solely as the sibling this class was copied from (one day earlier
  per `git log`) and as proof the class has a genuine, non-vacuous use
  elsewhere — not as an additional reviewed location.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — verified byte-identical RecordingRegistry class (diff confirms) with b0397 predating b0417 by one day (git log), and grep confirms b0417's `addedIds`/`registry` are written but never read while `DriveOutcome` structurally excludes `registry`, making the copy an inert double unlike b0397's genuine two-assertion use (triage: claude-opus-5)
