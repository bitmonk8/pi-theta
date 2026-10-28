---
id: PTQ-1776
title: FakeWireServer repeats the shared result-channel FakeServer double.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/production-result-channel.test.ts:187-199
  - tests/helpers/result-channel-harness.ts:40-54
sites: 2
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# FakeWireServer repeats the shared result-channel FakeServer double.

## Observation
`production-result-channel.test.ts` declares a local `FakeWireServer` implementing `ChannelServerSeam`. Its `listen` stores the supplied connection callback and resolves a port/close pair whose close callback sets `closed` to true. The existing `FakeServer` in `tests/helpers/result-channel-harness.ts` implements the same sequence and state, with a constructor-configurable port instead of the local literal `45000`. That helper is the existing shared home for this result-channel server double.

## Evidence
Local double — `tests/production-result-channel.test.ts:187-199`:
```ts
class FakeWireServer implements ChannelServerSeam {
  closed = false;
  connect: ((connection: ChannelConnection) => void) | undefined;
  listen(onConnection: (connection: ChannelConnection) => void): Promise<{ readonly port: number; close(): void }> {
    this.connect = onConnection;
    return Promise.resolve({
      port: 45000,
      close: (): void => {
        this.closed = true;
      },
    });
  }
}
```

Canonical helper — `tests/helpers/result-channel-harness.ts:40-54`:
```ts
export class FakeServer implements ChannelServerSeam {
  closed = false;
  #onConnection: ((connection: ChannelConnection) => void) | undefined;
  readonly port: number;
  constructor(port = 40001) {
    this.port = port;
  }
  listen(onConnection: (connection: ChannelConnection) => void): Promise<{ readonly port: number; close(): void }> {
    this.#onConnection = onConnection;
    return Promise.resolve({
      port: this.port,
      close: (): void => {
        this.closed = true;
      },
    });
```

The inventory is one local reimplementation plus its existing helper counterpart, not a claim that the two complete classes are byte-identical. The callback member's visibility/name and the configurable versus literal port differ; the callback-storage, resolved listener handle, and close-recording sequence are repeated.

## Why this is a problem
This is the D7 **copy-paste fixtures/doubles** class: a test-local implementation repeats a double already provided under `tests/helpers/`. Both cited implementations independently encode the same server-listen/close contract, including the promise-wrapped handle and the close flag, rather than the local class expressing a different test scenario. The local port value does not require a separate implementation because the helper already accepts its port as constructor data. The concern is duplication of existing test machinery, not production behaviour or the number of scenarios exercised.

## False-positive check
- **Gate-pin:** the reviewed file is a result-channel adapter/wire test, not a census or inventory gate. The observation concerns the double's implementation, not a pinned expected count.
- **Recording-double:** `closed` is a legitimate recording observable. This finding does not dispute any assertion against it or characterize a MUST-NOT witness as vacuous; it concerns the duplicate implementation of that recorder.
- **docs/bugs/ signature search:** `rg -n 'FakeWireServer|FakeServer|RFC-0012 §2/§3 — createProductionSubagentWire|opens the channel first|launch-file write failure releases|adapt\(\) yields a channel-backed|default silence budget is' docs/bugs docs/reference/coverage-matrix.md` returned no matches. This is not a report about a red or disabled test, and no documented correct-reason red is being changed.
- **Coverage-matrix/bug-doc citation search:** `rg -n -F 'tests/production-result-channel.test.ts' docs/reference/coverage-matrix.md docs/bugs` returned two file citations, in `docs/bugs/0484-synthesised-exit-abandons-live-child-without-kill.md:24` and `docs/bugs/0493-visible-children-no-parent-tether-silent-print-parent.md:657`, and none in the matrix. No merge, rename, or deletion of a cited test is proposed.
- **Duplicate-topic search:** `rg -n 'FakeWireServer|fakeLaunchFs|fakeChannelClient|result-channel-harness.*FakeServer|FakeServer.*result-channel-harness' quality/issues quality/resolved quality/intake` returned no matches before filing. A separate `rg -l 'FakeServer|wire server|wire-server|channel server double|server double' quality/issues quality/resolved quality/intake` also returned no matches.
- **History intent:** `git log --oneline --follow -- tests/helpers/result-channel-harness.ts` identifies the helper's introduction in `0b0deb06`, the bug-0484 result-channel change. The shared helper already carries a configurable port; the local literal does not establish a distinct server contract.
- **Scope:** both evidence locations are under `tests/`; the finding judges a double that exists today and makes no coverage claim or production-code recommendation.

## Triage
verdict: confirmed — Both excerpts match; FakeWireServer repeats FakeServer's callback storage, promise-wrapped listener handle and close recorder, and the shared helper's configurable port covers 45000 at all four local uses (none reads connect). Searches reproduce apart from this filing's own matches; no D7 carve-out or duplicate applies, and resolved PTQ-1333 concerns only the distinct PlacedChild fixture, not this server double. (triage: claude-opus-5-5)
