---
id: PTQ-0714
title: prompt-tool-loop-governor.test.ts's FakePi class duplicates the same before_provider_request/tool_call recording shape tests/b0308-snk-h-null-last-tool.test.ts already declares
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/prompt-tool-loop-governor.test.ts:31-73
  - tests/b0308-snk-h-null-last-tool.test.ts:214-250
sites: 2
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# prompt-tool-loop-governor.test.ts's FakePi class duplicates the same before_provider_request/tool_call recording shape tests/b0308-snk-h-null-last-tool.test.ts already declares

## Observation
`tests/prompt-tool-loop-governor.test.ts` declares a `class FakePi` that records the `before_provider_request` and `tool_call` handlers `PromptToolLoopGovernor.ensureRegistered` registers on an `ExtensionAPI`, exposing `providerRequest()`/`toolCall(toolName, input)` replay methods. `tests/b0308-snk-h-null-last-tool.test.ts` declares a class of the same name with the same constructor logic, the same private-field shape (`#bpr`, `#toolCall`), and the same two replay methods — differing only in that the governor-suite's copy adds a `registrations` counter (incremented in `on(...)`) and a `Math.random()`-suffixed `toolCallId` plus a defaulted `input` parameter on `toolCall`.

## Evidence

`tests/prompt-tool-loop-governor.test.ts:31-73`:
```ts
class FakePi {
  #bpr: (() => void) | undefined;
  #toolCall: ((event: ToolCallEvent) => ToolCallEventResult | undefined) | undefined;
  registrations = 0;

  readonly api: ExtensionAPI;

  constructor() {
    // Only `on` is used; the rest is an unused stub cast to the interface.
    const on = (event: string, handler: ExtensionHandler<unknown, unknown>): void => {
      this.registrations += 1;
      if (event === "before_provider_request") {
        this.#bpr = () => {
          void handler(undefined as never, undefined as never);
        };
      } else if (event === "tool_call") {
        this.#toolCall = (e: ToolCallEvent) =>
          handler(e as never, undefined as never) as
            | ToolCallEventResult
            | undefined;
      }
    };
    this.api = { on } as unknown as ExtensionAPI;
  }

  /** Replay one provider request (a fresh model round boundary). */
  providerRequest(): void {
    this.#bpr?.();
  }

  /**
   * Replay one `tool_call` and return the governor's block decision. `input`
   * defaults to the shallow `{}` (depth-1, within the ceiling-#4 cap); a caller
   * exercising the model-driven depth row passes a deeper argument document.
   */
  toolCall(toolName: string, input: Record<string, unknown> = {}): ToolCallEventResult | undefined {
    const event = {
      type: "tool_call",
      toolCallId: `tc-${toolName}-${Math.random()}`,
      toolName,
      input,
    } as unknown as TCE;
    return this.#toolCall?.(event);
  }
}
```

`tests/b0308-snk-h-null-last-tool.test.ts:214-250` (the counterpart — same private-field pair, same `on(...)` dispatch, same two replay methods, minus the `registrations` counter and the `input` parameter):
```ts
class FakePi {
  #bpr: (() => void) | undefined;
  #toolCall:
    | ((event: ToolCallEvent) => ToolCallEventResult | undefined)
    | undefined;

  readonly api: ExtensionAPI;

  constructor() {
    const on = (
      event: string,
      handler: ExtensionHandler<unknown, unknown>,
    ): void => {
      if (event === "before_provider_request") {
        this.#bpr = () => {
          void handler(undefined as never, undefined as never);
        };
      } else if (event === "tool_call") {
        this.#toolCall = (e: ToolCallEvent) =>
          handler(e as never, undefined as never) as
            | ToolCallEventResult
            | undefined;
      }
    };
    this.api = { on } as unknown as ExtensionAPI;
  }

  providerRequest(): void {
    this.#bpr?.();
  }

  toolCall(toolName: string): ToolCallEventResult | undefined {
    const event = {
      type: "tool_call",
      toolCallId: `tc-${toolName}`,
      toolName,
      input: {},
    } as unknown as ToolCallEvent;
    return this.#toolCall?.(event);
  }
}
```

Both files also declare the same `round(pi, toolNames)` helper pattern (`prompt-tool-loop-governor.test.ts` names it `round`; `b0308-snk-h-null-last-tool.test.ts` drives the same `providerRequest()` + `toolCall()` pair inline per cell) to replay one provider-request-then-tool-batch round against `PromptToolLoopGovernor`.

## Why this is a problem
Both files drive the exact same production seam — `PromptToolLoopGovernor.ensureRegistered(pi.api)` registering `before_provider_request`/`tool_call` handlers — through a hand-built fake `pi` that captures those two handlers and exposes replay methods. The two `FakePi` classes are structurally identical (same private fields, same constructor dispatch, same method names and shapes); the governor-suite's copy is a superset (adds the registration counter and a depth-capable `input` argument) rather than an independent design. No `tests/helpers/` module holds this `PromptToolLoopGovernor`-driving fake `pi` shape today.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` fake exporting the `before_provider_request`/`tool_call`-recording `pi` double (parameterised by whether a registration counter or a depth-capable `input` argument is needed) would be the natural home both files' copies point to.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin; the cited lines are a fake `pi` recording double, not a pinned count or inventory assertion.
- Recording-double check: `FakePi` records handler registrations for later REPLAY (`providerRequest()`/`toolCall()` drive the governor), not a "never called" MUST-NOT witness; the negative-witness carve-out does not apply to the class itself — it is a stimulus/replay fake, and this finding is about its duplicated construction, not about any assertion it backs.
- docs/bugs/ signature search: `grep -rl "prompt-tool-loop-governor\|b0308-snk-h-null-last-tool" docs/bugs/` finds `docs/bugs/0308` (the latter file's own subject — the `exhausted`/`lastToolName` invariant), which does not discuss or pin this `FakePi` duplication; both files pass at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n "prompt-tool-loop-governor\|b0308-snk-h-null-last-tool" docs/reference/coverage-matrix.md` → 0 hits pinning this class by name. This finding proposes no merge, rename or deletion of any `it()`/`describe()`.
- Coverage check: the claim is about a duplicated fake-double DEFINITION, not a missing test path; every cell in both files exercises its own copy successfully.

## Triage
verdict: confirmed — independently re-verified: both `class FakePi` excerpts reproduce verbatim at tests/prompt-tool-loop-governor.test.ts:31-73 and tests/b0308-snk-h-null-last-tool.test.ts:214-250 (same `#bpr`/`#toolCall` fields, same `on(...)` dispatch, same `providerRequest()`/`toolCall()` replay; the b0308 copy differs only by lacking `registrations`, the `input` param and the `Math.random()` id suffix, and its own header comment at :211 admits "FakePi mirrors tests/prompt-tool-loop-governor.test.ts"); `grep -rn "class FakePi\|#bpr" tests src extensions tools` finds exactly these two copies, and the other ensureRegistered drivers (b0416's `RecordingPi` records event names only; b0415/typed-two-phase-live use handler-map doubles) are different shapes, so sites: 2 is accurate; no tests/helpers/ module exports a governor-driving pi double; FakePi is unnamed in docs/reference/coverage-matrix.md and every docs/bugs/ hit (7 files, not the 1 the filing states — non-refuting); both files pass at HEAD (16/16); no store entry tracks this — a D7 copy-paste-double filing in tests/ only, not a gate test, not a negative witness (triage: claude-fable-5-1)
