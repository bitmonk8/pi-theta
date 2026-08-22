// Bug 0088 — the invoke-hop provenance ledger must never turn a returned `Err`
// VALUE into a thrown abort.
//
// WHAT IS ASSERTED. `attach` (`createInvocationProvenanceLedger`,
// `src/runtime/invoke-provenance-ledger.ts`) is awaited on the hot path of a
// failed `invoke` hop: `runInvokeEffect`
// (`src/runtime/effectful-statement-host.ts`) awaits
// `deps.recordInvokeHop?.(...)` between building the `invoke_callee` wrapper and
// returning it as the expression's `Err` value. Both `realpath` consumers inside
// `attach` — `recordInvocationProvenance` on the parent path and the direct seam
// call on the callee path — can reject: the production seam is
// `fs.realpath.native` (`realpath` in `src/seams/pi-file-system.ts`), which
// rejects with ENOENT/EPERM when the parent or callee file is deleted, renamed
// or made unreadable while the callee runs (the composition root names exactly
// this concurrent watch-driven root churn around its own
// rejection-to-`undefined` guards in `parseCalleeTheta`,
// `src/extension/production-composition.ts`).
//
// A rejection escaping `attach` would propagate out of `runInvokeEffect`, so a
// theta about to `match` on the `Err` would instead abort under the
// `theta/runtime/internal-error` framing and the operator would read that in
// place of the SLSH-3 note. These cells pin the degrade SLSH-5 allows instead:
// the hop is not recorded, `chainFor` skips the wrapper it has no entry for, and
// the note loses one attribution suffix rather than the whole run.
//
// WHY THIS TIER — a direct drive of the ledger seam with a `FileSystem` stub
// whose `realpath` rejects. The failure is a property of `attach` alone and
// needs no workspace, no composition root and no provider; the end-to-end
// suffix behaviour is pinned separately by
// `tests/slsh5-invoke-cascade-chain-suffix.test.ts`.
//
// Spec: `docs/spec_topics/slash-invocation.md:54` (SLSH-5 — the chain suffix and
// its per-hop `<callee_path>` / `<parent_path>:<line>` placeholders).

import { describe, expect, it } from "vitest";
import type { FileSystem } from "../src/seams/file-system";
import { createInvocationProvenanceLedger } from "../src/runtime/invoke-provenance-ledger";
import type { InvokeCalleeError, QueryError } from "../src/runtime/query-error";

/** The wrapper `runInvokeEffect` builds for a callee-returned `Err`, in miniature. */
function wrapperOver(inner: QueryError, calleePath: string): InvokeCalleeError {
  return {
    kind: "invoke_callee",
    message: `invoke of ${calleePath} callee returned Err(validation)`,
    callee_path: calleePath,
    inner,
  };
}

/** The leaf the wrapper carries: any non-wrapper kind terminates `chainFor`'s walk. */
const LEAF: QueryError = {
  kind: "validation",
  message: "rendered query template was empty",
  cause: "empty_template",
  attempts: 0,
} as unknown as QueryError;

/**
 * A `realpath` seam that rejects the way `fs.realpath.native` does when the file
 * is gone, counting its calls so a cell can prove the seam was consulted at all.
 */
function rejectingFs(calls: string[]): Pick<FileSystem, "realpath"> {
  return {
    realpath: (path: string): Promise<string> => {
      calls.push(path);
      return Promise.reject(
        Object.assign(new Error(`ENOENT: no such file or directory, realpath '${path}'`), {
          code: "ENOENT",
        }),
      );
    },
  };
}

/** A `realpath` seam that resolves, so the recorded-hop direction is observable. */
function resolvingFs(calls: string[]): Pick<FileSystem, "realpath"> {
  return {
    realpath: (path: string): Promise<string> => {
      calls.push(path);
      return Promise.resolve(`/canonical${path}`);
    },
  };
}

const PARENT = "/w/.pi/theta/parent.theta";
const CALLEE = "/w/.pi/theta/child.theta";

describe("bug 0088 — a rejecting `realpath` degrades the chain, never the run", () => {
  it("attach resolves and records no hop when the seam rejects, so chainFor yields an empty chain — ", async () => {
    const calls: string[] = [];
    const ledger = createInvocationProvenanceLedger({ fs: rejectingFs(calls) });
    const wrapper = wrapperOver(LEAF, "./child.theta");

    // A rejection that escaped here is the defect: `runInvokeEffect` awaits this
    // call, so the throw would replace the caller's `Err` value with an abort.
    await expect(
      ledger.attach(wrapper, {
        parentPath: PARENT,
        calleePath: CALLEE,
        callSite: { style: "literal_invoke", invokeToken: { line: 4, column: 1 } },
      }),
    ).resolves.toBeUndefined();

    if (calls.length === 0) {
      throw new Error(
        "harness precondition unmet: `attach` consulted the injected `realpath` seam zero " +
          "times, so this cell exercised no rejection at all and its green means nothing",
      );
    }

    expect(
      ledger.chainFor(wrapper),
      "an unrecorded hop is `chainFor`'s documented skip: the note loses one attribution " +
        "suffix, and the theta still receives its Err as a value it can match on",
    ).toEqual([]);
  });

  it("the same drive over a resolving seam records the hop, so the empty chain above is the rejection's doing — ", async () => {
    const calls: string[] = [];
    const ledger = createInvocationProvenanceLedger({ fs: resolvingFs(calls) });
    const wrapper = wrapperOver(LEAF, "./child.theta");

    await ledger.attach(wrapper, {
      parentPath: PARENT,
      calleePath: CALLEE,
      callSite: { style: "literal_invoke", invokeToken: { line: 4, column: 1 } },
    });

    if (calls.length === 0) {
      throw new Error(
        "harness precondition unmet: `attach` consulted the injected `realpath` seam zero " +
          "times, so the control below cannot distinguish a guarded rejection from a ledger " +
          "that records nothing under any seam",
      );
    }

    expect(ledger.chainFor(wrapper)).toEqual([
      {
        calleePath: `/canonical${CALLEE}`,
        record: { parentPath: `/canonical${PARENT}`, callSiteLine: 4 },
      },
    ]);
  });
});
