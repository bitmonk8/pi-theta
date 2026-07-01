import { describe, expect, it } from "vitest";
import {
  runPromptSuspendInvoke,
  type PromptSuspendPi,
} from "../src/runtime/invoke-prompt-suspend";
import type { CrossModeCell } from "../src/runtime/invoke-cross-mode";

// V15d-T — failing tests for the paired `V15d` prompt→prompt parent-suspend and
// `setActiveTools` snapshot/restore.
//
// Spec: invocation.md §Cross-mode semantics (the prompt→prompt cell: on entry
// the runtime snapshots the user session's ambient tool set and calls
// `pi.setActiveTools(childCallableSet)`; `invoke(...)` to a prompt-mode callee
// suspends the parent's body until the child returns) and
// pi-integration-contract/tool-registration-lifetime.md PIC-17 step-4 `finally`
// restore, generalised from the per-query window to the child's whole body.
//
// The prompt→prompt suspend/snapshot obligation is INV-area (un-anchored — no
// numbered PREFIX-N REQ-ID), so those tests cite the spec §section inline; the
// restore-on-inner-failure obligation cites PIC-17 inline.
//
// Each test reds on its own primary assertion because the V15d behaviour is
// absent: the stub runs the child body directly with NO snapshot / install /
// restore and reports the window as NOT engaged. So the window-engaged and
// snapshot-before-child assertions red (nothing installed), and the
// restore-after-failure assertions red (the pre-invoke set is never restored
// over a mid-window mutation). No test reds on a compile error, a missing
// fixture, or a harness throw.

// --------------------------------------------------------------------------
// A recording `pi` active-set surface: holds the current active-tool name list,
// mutating on `setActiveTools`, and logs every call in order so a test can
// witness the step-1 snapshot preceding the step-2 install.
// --------------------------------------------------------------------------

type PiCall = { readonly op: "get" } | { readonly op: "set"; readonly names: readonly string[] };

class RecordingActiveSetPi implements PromptSuspendPi {
  private active: string[];
  readonly calls: PiCall[] = [];

  constructor(initial: readonly string[]) {
    this.active = [...initial];
  }

  getActiveTools(): string[] {
    this.calls.push({ op: "get" });
    return [...this.active];
  }

  setActiveTools(names: string[]): void {
    this.calls.push({ op: "set", names: [...names] });
    this.active = [...names];
  }
}

const PROMPT_TO_PROMPT: CrossModeCell = { callerMode: "prompt", calleeMode: "prompt" };

// The user session's ambient active set before the invoke (the snapshot), the
// child's declared callable set (the install vector), and a distinct "foreign"
// set standing in for a mid-window active-set mutation the restore must
// overwrite (invocation.md §Cross-mode semantics: the loom's restore overwrites
// an intervening change with no diagnostic). All three are pairwise disjoint so
// each stage is observable.
const AMBIENT_SNAPSHOT = ["read", "bash"] as const;
const CHILD_CALLABLE_SET = ["write"] as const;
const FOREIGN_MID_WINDOW = ["foreign-tool"] as const;

// --------------------------------------------------------------------------
// INV area — prompt→prompt suspend + snapshot before the child runs.
// (invocation.md §Cross-mode semantics)
// --------------------------------------------------------------------------

describe("prompt→prompt suspend + snapshot before the child runs (invocation.md §Cross-mode semantics)", () => {
  it("snapshots the parent's active set and installs the child's callable set BEFORE the child body runs, engaging the window", async () => {
    const pi = new RecordingActiveSetPi(AMBIENT_SNAPSHOT);
    const events: string[] = [];
    let activeAtChildStart: readonly string[] | undefined;

    const childBody = async (): Promise<"child-value"> => {
      events.push("child-start");
      // Whatever the child observes while it runs, the parent must already have
      // snapshotted its ambient set and installed the child's callable set.
      activeAtChildStart = pi.getActiveTools();
      events.push("child-end");
      return "child-value";
    };

    const outcome = await runPromptSuspendInvoke({
      cell: PROMPT_TO_PROMPT,
      childCallableSet: CHILD_CALLABLE_SET,
      pi,
      childBody,
    });
    events.push("parent-resumed");

    // Primary: the prompt→prompt suspend + snapshot/restore window engaged.
    expect(outcome.engaged).toBe(true);
    expect(outcome.result).toBe("child-value");

    // The step-1 snapshot precedes the step-2 install, and both happen before
    // the child body runs (`activeAtChildStart` is captured inside the child).
    expect(pi.calls[0]).toEqual({ op: "get" });
    expect(pi.calls[1]).toEqual({ op: "set", names: [...CHILD_CALLABLE_SET] });

    // The child ran with its own callable set installed (the ambient snapshot is
    // deliberately NOT unioned in).
    expect(activeAtChildStart).toEqual([...CHILD_CALLABLE_SET]);
  });

  it("suspends the parent for the duration of the child invocation (the parent resumes only after the child settles)", async () => {
    const pi = new RecordingActiveSetPi(AMBIENT_SNAPSHOT);
    const events: string[] = [];

    const childBody = async (): Promise<null> => {
      events.push("child-start");
      // Yield a macrotask so a non-suspending parent would interleave here.
      await new Promise((resolve) => setTimeout(resolve, 0));
      events.push("child-end");
      return null;
    };

    const outcome = await runPromptSuspendInvoke({
      cell: PROMPT_TO_PROMPT,
      childCallableSet: CHILD_CALLABLE_SET,
      pi,
      childBody,
    });
    events.push("parent-resumed");

    // Primary: the window engaged (the parent-suspend path ran, not a pass-through).
    expect(outcome.engaged).toBe(true);
    // The parent resumes strictly after the child has fully settled.
    expect(events).toEqual(["child-start", "child-end", "parent-resumed"]);
    // On success the ambient snapshot is restored once the child settles.
    expect(pi.getActiveTools()).toEqual([...AMBIENT_SNAPSHOT]);
  });
});

// --------------------------------------------------------------------------
// PIC area — PIC-17 step-4 `finally` restore on inner failure, prompt→prompt
// `invoke` path. After a child that throws or cancels inside the suspended
// window, the parent's active set is restored to its pre-invoke snapshot and
// the inner failure surfaces unmasked. Both sub-cases transit the same `finally`.
// --------------------------------------------------------------------------

describe("PIC-17 step-4 finally restore on inner failure, prompt→prompt invoke path (tool-registration-lifetime.md)", () => {
  it("PIC-17: after the child THROWS inside the window, restores the pre-invoke snapshot and surfaces the throw unmasked", async () => {
    const pi = new RecordingActiveSetPi(AMBIENT_SNAPSHOT);
    const boom = new Error("child body exploded");

    const childBody = async (): Promise<never> => {
      // A mid-window active-set mutation the finally restore must overwrite.
      pi.setActiveTools([...FOREIGN_MID_WINDOW]);
      throw boom;
    };

    // The inner throw surfaces unmasked (not swallowed by the restore).
    await expect(
      runPromptSuspendInvoke({
        cell: PROMPT_TO_PROMPT,
        childCallableSet: CHILD_CALLABLE_SET,
        pi,
        childBody,
      }),
    ).rejects.toBe(boom);

    // Primary: the pre-invoke snapshot is restored once the failed child settles.
    expect(pi.getActiveTools()).toEqual([...AMBIENT_SNAPSHOT]);
  });

  it("PIC-17: after the child CANCELS inside the window, restores the pre-invoke snapshot and surfaces the cancellation unmasked", async () => {
    const pi = new RecordingActiveSetPi(AMBIENT_SNAPSHOT);
    const cancelled = new Error("invoke cancelled");
    cancelled.name = "CancellationError";

    const childBody = async (): Promise<never> => {
      pi.setActiveTools([...FOREIGN_MID_WINDOW]);
      throw cancelled;
    };

    // The cancellation surfaces unmasked (not swallowed by the restore).
    await expect(
      runPromptSuspendInvoke({
        cell: PROMPT_TO_PROMPT,
        childCallableSet: CHILD_CALLABLE_SET,
        pi,
        childBody,
      }),
    ).rejects.toBe(cancelled);

    // Primary: the pre-invoke snapshot is restored once the cancelled child settles.
    expect(pi.getActiveTools()).toEqual([...AMBIENT_SNAPSHOT]);
  });

  it("PIC-17: after the child FAILS (returns Err) inside the window, restores the pre-invoke snapshot and surfaces the Err unmasked", async () => {
    const pi = new RecordingActiveSetPi(AMBIENT_SNAPSHOT);
    const errValue = { ok: false as const, error: "callee returned Err" };

    const childBody = async (): Promise<typeof errValue> => {
      pi.setActiveTools([...FOREIGN_MID_WINDOW]);
      return errValue;
    };

    const outcome = await runPromptSuspendInvoke({
      cell: PROMPT_TO_PROMPT,
      childCallableSet: CHILD_CALLABLE_SET,
      pi,
      childBody,
    });

    // The Err value surfaces unmasked as the child body's result.
    expect(outcome.result).toBe(errValue);
    // Primary: the pre-invoke snapshot is restored once the failed child settles.
    expect(pi.getActiveTools()).toEqual([...AMBIENT_SNAPSHOT]);
  });
});
