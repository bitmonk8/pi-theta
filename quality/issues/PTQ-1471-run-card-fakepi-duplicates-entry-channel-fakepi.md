---
id: PTQ-1471
title: execution-status-run-card.test.ts's fakePi redeclares execution-status-entry-channel.test.ts's recording-pi double instead of importing/sharing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/execution-status-run-card.test.ts:78-100
  - tests/execution-status-entry-channel.test.ts:23-60
sites: 2
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# execution-status-run-card.test.ts's fakePi redeclares execution-status-entry-channel.test.ts's recording-pi double instead of importing/sharing it

## Observation
`tests/execution-status-run-card.test.ts` declares a local `fakePi()` helper
that builds a minimal recording `pi` double (`registerEntryRenderer` +
`appendEntry`, with an `appendEntryThrows` knob) for the "D3 — entry channel
run-card surface" describe block. The file's own header comment above the
function states it "mirrors tests/execution-status-entry-channel.test.ts's
recording pi" — an explicit admission that this is a second hand-written copy
of the same double rather than an import of a shared one. Neither file's
`fakePi` lives under `tests/helpers/`.

## Evidence

tests/execution-status-run-card.test.ts:78-100:
```ts
// ---------------------------------------------------------------------------
// Fakes (mirrors tests/execution-status-entry-channel.test.ts's recording pi).
// ---------------------------------------------------------------------------

function fakePi(options: { readonly appendEntryThrows?: boolean } = {}): {
  pi: ExtensionAPI;
  appendCalls: { customType: string; data: unknown }[];
  registrations: Map<string, unknown>;
} {
  const appendCalls: { customType: string; data: unknown }[] = [];
  const registrations = new Map<string, unknown>();
  const base: Record<string, unknown> = {
    registerEntryRenderer: (type: string, renderer: unknown): void => {
      registrations.set(type, renderer);
    },
    appendEntry: (customType: string, data: unknown): void => {
      if (options.appendEntryThrows === true) {
        throw new Error("appendEntry host seam absent");
      }
      appendCalls.push({ customType, data });
    },
  };
  return { pi: base as unknown as ExtensionAPI, appendCalls, registrations };
}
```

tests/execution-status-entry-channel.test.ts:23-60 (the double it mirrors —
same two recorded members, same "throws to model the host seam absent" shape,
just with more knobs: `absentAppendEntry`, `absentRegisterEntryRenderer`,
`registerEntryRendererThrows`, and a call-indexed `appendEntryThrows`):
```ts
/** A recording fake `pi` exposing appendEntry + registerEntryRenderer (mirrors
 *  tests/extension-factory-harness.test.ts's `makeAbsentSeamPi` recording-double
 *  style: every call recorded, selected members optionally throw). */
function fakePi(options: {
  readonly absentAppendEntry?: boolean;
  readonly absentRegisterEntryRenderer?: boolean;
  readonly registerEntryRendererThrows?: boolean;
  readonly appendEntryThrows?: boolean | ((n: number) => boolean);
}): {
  pi: ExtensionAPI;
  appendCalls: { customType: string; data: unknown }[];
  ...
} {
  let appendCount = 0;
  const base: Record<string, unknown> = {};
  if (!options.absentRegisterEntryRenderer) {
    base.registerEntryRenderer = (_type: string, renderer: unknown): void => {
      if (options.registerEntryRendererThrows) {
        throw new Error("registerEntryRenderer host seam absent");
      }
      registeredRenderer = renderer;
    };
  }
  if (!options.absentAppendEntry) {
    base.appendEntry = (customType: string, data: unknown): void => {
      appendCount += 1;
      ...
    };
  }
  ...
}
```

Both build the identical two-member `ExtensionAPI` shape
(`registerEntryRenderer` recording into a map/variable, `appendEntry`
recording into an array with an optional throw to model "host seam absent"),
diverging only in which knobs each file happened to need.

## Why this is a problem
This is boilerplate duplication of a fake/double: the run-card file's own
comment names the entry-channel file's `fakePi` as the thing it mirrors,
rather than importing it (or a canonical superset of it) from
`tests/helpers/`. Two independent hand-written copies of "a recording `pi`
double for appendEntry + registerEntryRenderer" now exist in the tree; a
third file (`tests/extension-factory-harness.test.ts`, cited inside the
entry-channel file's own comment as the *third* precedent for this recording-
double style) is a further indication this shape recurs and has no shared
home yet.

## Suggested direction (non-binding, optional)
The entry-channel file's `fakePi` (the superset with the knobs run-card.test.ts
doesn't need) is the natural candidate to promote under `tests/helpers/` and
have `execution-status-run-card.test.ts` import instead of redeclaring its own
narrower copy — naming this as an observation about where the shape already
lives, not a design for the extraction.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts`; not a census/pin gate.
- Recording-double negative-witness check: `fakePi`'s `appendEntry`/
  `registerEntryRenderer` recordings are used as POSITIVE observables (asserting
  what WAS delivered), not as MUST-NOT-be-called witnesses, so the recording-
  double carve-out for negative witnesses does not apply here — this finding is
  about the double's construction being duplicated, not about the double's
  legitimate recording role.
- docs/bugs/ signature search: `grep -ri "fakePi" docs/bugs/` — no hits; this
  is not a documented correct-reason red.
- coverage-matrix / bug-doc citation search: `grep -rn "execution-status-run-card.test.ts\|execution-status-entry-channel.test.ts" docs/reference/coverage-matrix.md docs/bugs/*.md` — no hits naming either file's `fakePi` by name; no citation pins this helper.
- Confirmed this is a D7-shaped observation (copy-paste double), not a coverage
  claim: no assertion is made that either file's own tests are inadequate.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — both excerpts match verbatim at the cited lines (run-card.test.ts:78-100 incl. the "mirrors tests/execution-status-entry-channel.test.ts's recording pi" comment; entry-channel.test.ts:23-61), both hand-build the same two-member recording ExtensionAPI double (registerEntryRenderer recorder + appendEntry recorder with an "appendEntry host seam absent" throw knob) and a third uncited copy exists as fakeEntryPi at tests/execution-status-entry-migration-witnesses.test.ts:55-70 while tests/helpers/ has no recording double for these members (production-load-harness.ts:441 is a no-op), which is D7 copy-paste fixture/double in tests/ only; stated searches re-run — no docs/bugs/ fakePi hit, neither file is a gate test, the recordings are positive observables not negative witnesses, and bug 0469:215's citation of the entry-channel test as a witness is untouched by hoisting the double (no merge/rename/delete proposed); the only inaccuracy is the non-binding direction's "superset" claim (entry-channel's copy records a single registeredRenderer — captured by value at return, so never observable — whereas run-card needs a per-type Map), so the shared helper must record per type, which does not change the root cause; dedupe — PTQ-1312 (fixed) covered run-card.test.ts's composeHost at :598-680, a different double, and no open/resolved PTQ cites either file's fakePi; the fix is a mechanical hoist of a parameterised recording pi double into tests/helpers/ (triage: claude-fable-5-1)
