---
id: PTQ-0828
title: b0372's RecordingActiveSet re-derives FakeActiveSetPi's step-2-install/step-4-restore double, already written twice elsewhere
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0372-active-set-restore-protocol.test.ts:102-152
  - tests/tool-registration-lifetime.test.ts:43-76
  - tests/b0433-active-set-advisory-note-no-details.test.ts:101-127
sites: 3                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0372's RecordingActiveSet re-derives FakeActiveSetPi's step-2-install/step-4-restore double, already written twice elsewhere

## Observation
tests/b0372-active-set-restore-protocol.test.ts declares a module-scope class
`RecordingActiveSet` implementing the same `getActiveTools`/`setActiveTools`
contract as `ActiveSetPi` (src/runtime/tool-registration.ts): the first
`setActiveTools` call is recorded as the step-2 install, every later call is a
step-4 restore, and a `restoreAttempts` getter slices `setCalls` from index 1.
The file's own comment states this is a mirror: "Mirrors tests/tool-registration-lifetime.test.ts's
`FakeActiveSetPi`: the first `setActiveTools` is the step-2 install, every
later call is a step-4 restore." tests/tool-registration-lifetime.test.ts
already declares this exact double as `FakeActiveSetPi`, and
tests/b0433-active-set-advisory-note-no-details.test.ts declares a second,
independent copy also named `FakeActiveSetPi`, whose own doc comment likewise
states "`FakeActiveSetPi` mirror: first `setActiveTools` is the install; every
later call is a restore." No file under tests/helpers/ exports this double;
each of the three sites hand-rolls it, the b0372 copy under a third name and a
`mode`-string parameter instead of the other two's boolean throw flags.

## Evidence

tests/b0372-active-set-restore-protocol.test.ts:102-152 (re-read immediately
before filing; the class plus its own "Mirrors..." comment):
```ts
// --- The injectable active-set gate ----------------------------------------
// Mirrors tests/tool-registration-lifetime.test.ts's `FakeActiveSetPi`: the
// first `setActiveTools` is the step-2 install, every later call is a step-4
// restore. Its throw schedule reproduces the bug doc's §Reproduction probe
// shape (a restore throw from a healthy host at restore time).

type GateMode =
  | "healthy"
  | "throw-restore-once" // transient: first restore throws, the retry succeeds
  | "throw-restore-always" // persistent: both restore attempts throw
  | "throw-install"; // step-2 install throws (PIC-19 setup failure)

class RecordingActiveSet {
  readonly setCalls: string[][] = [];
  getCalls = 0;
  #installed = false;
  #restoreAttempts = 0;

  constructor(
    readonly snapshot: readonly string[],
    readonly mode: GateMode,
  ) {}

  getActiveTools(): string[] {
    this.getCalls += 1;
    return [...this.snapshot];
  }

  setActiveTools(names: string[]): void {
    this.setCalls.push([...names]);
    if (!this.#installed) {
      this.#installed = true;
      if (this.mode === "throw-install") {
        throw new Error("active-set install drift");
      }
      return;
    }
    this.#restoreAttempts += 1;
    if (this.mode === "throw-restore-always") {
      throw new Error("active-set restore failure");
    }
    if (this.mode === "throw-restore-once" && this.#restoreAttempts === 1) {
      throw new Error("active-set transient restore failure");
    }
  }

  /** Every `setActiveTools` call after the step-2 install. */
  get restoreAttempts(): string[][] {
    return this.setCalls.slice(1);
  }
}
```

tests/tool-registration-lifetime.test.ts:43-76 (the same double, boolean
throw flags in place of `mode`):
```ts
class FakeActiveSetPi implements ActiveSetPi {
  readonly setCalls: string[][] = [];
  getCalls = 0;
  throwOnGet = false;
  throwOnInstall = false;
  throwOnRestore = false;
  #installed = false;

  constructor(readonly snapshot: string[]) {}

  getActiveTools(): string[] {
    this.getCalls++;
    if (this.throwOnGet) throw new Error("getActiveTools SDK-shape drift");
    return [...this.snapshot];
  }

  setActiveTools(names: string[]): void {
    this.setCalls.push([...names]);
    if (!this.#installed) {
      this.#installed = true;
      if (this.throwOnInstall) throw new Error("setActiveTools install drift");
      return;
    }
    if (this.throwOnRestore) throw new Error("setActiveTools restore failure");
  }

  /** Step-2 install vector — the first `setActiveTools` call. */
  get installVectorSeen(): string[] | undefined {
    return this.setCalls[0];
  }

  /** Step-4 restore attempts — every `setActiveTools` call after the install. */
  get restoreAttempts(): string[][] {
    return this.setCalls.slice(1);
  }
}
```

tests/b0433-active-set-advisory-note-no-details.test.ts:101-127 (the third
copy, same name as the second, with its own "mirror" comment):
```ts
/** `FakeActiveSetPi` mirror: first `setActiveTools` is the install; every later
 *  call is a restore. `throwOnRestore` makes both restore attempts throw so the
 *  PIC-8(c) advisory fires (the double-throw path). */
class FakeActiveSetPi implements ActiveSetPi {
  readonly setCalls: string[][] = [];
  throwOnRestore = false;
  #installed = false;

  constructor(readonly snapshot: string[]) {}

  getActiveTools(): string[] {
    return [...this.snapshot];
  }

  setActiveTools(names: string[]): void {
    this.setCalls.push([...names]);
    if (!this.#installed) {
      this.#installed = true;
      return;
    }
    if (this.throwOnRestore) throw new Error("setActiveTools restore failure");
  }

  get restoreAttempts(): string[][] {
    return this.setCalls.slice(1);
  }
}
```

All three implement the identical state machine: `setCalls` array, an
`#installed` private flag flipped on the first `setActiveTools` call, a
conditional throw on that first call, a conditional throw on every later
call, and a `restoreAttempts` getter computed as `setCalls.slice(1)`. Each of
the three files' own doc comments states the relationship to at least one of
the others ("Mirrors...", "mirror").

## Why this is a problem
The same install/restore recording state machine — the mechanism
tests/tool-registration-lifetime.test.ts's own file was written to exercise
via `FakeActiveSetPi` — is written out a third time in tests/b0372, under a
fourth set of field/parameter names, instead of being imported. Each of the
three declaring files' own comments names at least one sibling copy by name,
so the duplication is acknowledged in-line at each site rather than resolved
by sharing the double.

## Suggested direction (non-binding, optional)
A shared tests/helpers/ module exporting one `ActiveSetPi` recording double
parameterised over its throw schedule (a `mode` argument, as b0372's own copy
already generalises to) is the natural home all three copies' comments
already point at by naming each other.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or a named
  kin; not applicable.
- Recording-double check: the class records calls to enable an assertion, but
  the assertions built on it (retry counts, restore vectors, the advisory
  note) are not "never called" negative witnesses — the carve-out protects a
  fake used to prove an absence of a call, not a stateful double reused
  verbatim across files; this claim is squarely the D7 copy-paste-fixture
  class.
- docs/bugs/ signature search: `grep -rl "RecordingActiveSet\|FakeActiveSetPi" docs/bugs/` → 0 hits; the duplication claim is unrelated to any documented correct-reason red, and none of the three files' cells cite a skip.
- coverage-matrix/bug-doc citation search: `grep -n "b0372-active-set-restore-protocol\|tool-registration-lifetime\|b0433-active-set-advisory-note" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any file, `describe()`, or `it()` — only that the double could be imported from a shared module instead of redeclared a third time.
- Coverage check: the claim is about a repeated fixture DEFINITION, not a missing test path; every cell exercising each copy is unaffected.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at tests/b0372-active-set-restore-protocol.test.ts:102-152 (`RecordingActiveSet`, incl. its own "Mirrors tests/tool-registration-lifetime.test.ts's `FakeActiveSetPi`" comment), tests/tool-registration-lifetime.test.ts:43-76 and tests/b0433-active-set-advisory-note-no-details.test.ts:101-127 (its own "`FakeActiveSetPi` mirror" comment); the three share the same state machine (`setCalls` push → `#installed` flip → conditional install throw → conditional restore throw → `restoreAttempts = setCalls.slice(1)`) against the 2-method `ActiveSetPi` contract at src/runtime/tool-registration.ts:78-83, differing only in throw-schedule surface (mode string vs boolean flags vs restore-only subset); every copy is live (5/6/1 `new` sites); `grep -n "ActiveSetPi\|setActiveTools\|#installed" tests/helpers/*.ts` finds only no-op `setActiveTools: () => {}` stubs, no shared stateful double, and tests/invoke-prompt-suspend.test.ts's `RecordingActiveSetPi` is a different shape (no install/restore state machine) so sites=3 is accurate; stated searches reproduce (docs/bugs `RecordingActiveSet\|FakeActiveSetPi` → 0; coverage-matrix file cites → 0); all locations under tests/, D7 copy-paste-double class; no gate file, the doubles drive positive assertions (retry counts, restore vectors, advisory note) not negative witnesses, bugs 0372/0433 cite the files as witnesses but no merge/rename/delete is proposed; no PTQ in quality/issues/ or quality/intake/ mentions ActiveSet/setActiveTools (the fake-pi PTQs 0442/0446/0630/0714 track unrelated host-loop FakePi harnesses) — a single parameterised `ActiveSetPi` recording double under tests/helpers/ is a mechanical dedupe (triage: claude-fable-5-1)
