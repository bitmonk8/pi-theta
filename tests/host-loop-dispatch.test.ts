// RFC-0006 new coverage — code-side extension-tool dispatch ladder (PIC-64).
//
// Spec: pi-integration-contract/subagent.md (PIC-64 #subagent-host-loop-dispatch,
// the probe-asserted fail-closed ladder), diagnostics/code-registry-load.md
// (`theta/load/extension-tool-unreachable`), docs/bugs/0001-extension-tools-
// unreachable.md (origin).
//
// Covers what is unit-testable via fakes (the live-host-loop happy path is
// deferred to integration):
//   - ladder fail-closed refusal: NO rung available → load refusal
//     `theta/load/extension-tool-unreachable` with the precise diagnostic;
//   - rung selection: the upstream `getToolDefinition` rung is preferred when
//     available, else host-loop dispatch;
//   - the host-loop dispatch seam: provider registration → host turn → result
//     read-back → provider unregister → model restore, driven over fakes.
//
// RED EXPECTATION (RFC-0006 not yet implemented): `resolveDispatchLadder` /
// `renderExtensionToolUnreachableMessage` / `dispatchViaHostLoop` throw `not
// implemented: RFC 0006`, so each assertion reds on its primary behaviour; the
// paired implementation greens them.

import { describe, expect, it } from "vitest";
import {
  dispatchViaHostLoop,
  EXTENSION_TOOL_UNREACHABLE_CODE,
  renderExtensionToolUnreachableMessage,
  resolveDispatchLadder,
  type EncodedToolRequest,
  type HostLoopDispatchDeps,
  type HostToolResult,
} from "../src/runtime/host-loop-dispatch";
import { checkExtensionToolReachability } from "../src/extension/extension-tool-reachability";
import type { Expr, ThetaBody } from "../src/parser/theta-document";
import type { SourceRange } from "../src/diagnostics/diagnostic";

describe("PIC-64 — code-side dispatch ladder (fail-closed)", () => {
  it("no rung available → fail-closed load refusal with the precise extension-tool-unreachable diagnostic", () => {
    const resolution = resolveDispatchLadder("finding_store", {
      getToolDefinitionAvailable: false,
      hostLoopAvailable: false,
    });
    // Fail-closed: a theta whose code calls an extension tool refuses to register
    // when no code-side dispatch rung is available (never silently falls through).
    expect(resolution.kind).toBe("unreachable");
    if (resolution.kind === "unreachable") {
      expect(resolution.diagnostic.code).toBe(EXTENSION_TOOL_UNREACHABLE_CODE);
      expect(resolution.diagnostic.severity).toBe("error");
      // The registry-pinned Message-column string (code-registry-load.md,
      // `theta/load/extension-tool-unreachable`) — asserted as the literal, not
      // against the renderer under test (that would be tautological).
      expect(resolution.diagnostic.message).toBe(
        "extension tool 'finding_store' is unreachable from theta code: no code-side dispatch rung available",
      );
    }
  });

  it("renderExtensionToolUnreachableMessage emits the registry-pinned Message-column string verbatim", () => {
    // Direct pin of the renderer against the literal registry string, so a drift
    // in either the renderer or the registry template reds independently.
    expect(renderExtensionToolUnreachableMessage("finding_store")).toBe(
      "extension tool 'finding_store' is unreachable from theta code: no code-side dispatch rung available",
    );
  });

  it("host-loop dispatch is selected when it is the only available rung", () => {
    const resolution = resolveDispatchLadder("finding_store", {
      getToolDefinitionAvailable: false,
      hostLoopAvailable: true,
    });
    expect(resolution.kind).toBe("rung");
    if (resolution.kind === "rung") {
      expect(resolution.rung).toBe("host-loop");
    }
  });

  it("the upstream getToolDefinition rung is PREFERRED when available", () => {
    const resolution = resolveDispatchLadder("finding_store", {
      getToolDefinitionAvailable: true,
      hostLoopAvailable: true,
    });
    expect(resolution.kind).toBe("rung");
    if (resolution.kind === "rung") {
      // When it lands upstream it slots in as the top rung, replacing host-loop dispatch.
      expect(resolution.rung).toBe("get-tool-definition");
    }
  });

  it("PIC-64: the getToolDefinition rung is preferred over host-loop even when host-loop is the only OTHER rung (parent leg included)", () => {
    // PIC-64 pins the rung-1 preference "in both parent and child" — the ladder
    // is probe-driven and mode-agnostic, so the same probe yields the same rung
    // wherever it is evaluated. getToolDefinition-only probe → rung 1.
    const resolution = resolveDispatchLadder("projection", {
      getToolDefinitionAvailable: true,
      hostLoopAvailable: false,
    });
    expect(resolution.kind).toBe("rung");
    if (resolution.kind === "rung") {
      expect(resolution.rung).toBe("get-tool-definition");
    }
  });
});

// ===========================================================================
// PIC-64 rung 3 (load-time realisation) — `checkExtensionToolReachability` is
// MODE-INDEPENDENT: it consumes only the body's code-side call sites, the
// extension-tool classification, and the dispatch-ladder probe. A prompt-mode
// theta (parent, against the user's live host session) is admitted when the
// host-loop rung is available and refused fail-closed when no rung is.
// Spec: pi-integration-contract/subagent.md PIC-64 (#pic-64, the fail-closed
// rung ladder), diagnostics/code-registry-load.md
// (`theta/load/extension-tool-unreachable` — "the **mode-independent**
// fail-closed refusal for code-side extension-tool reach").
// ===========================================================================

describe("PIC-64 rung 3 — checkExtensionToolReachability (prompt-mode / parent leg)", () => {
  const FILE = "/theta/prompt-demo.theta";

  function span(): SourceRange {
    return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
  }

  /** A body whose tail code-side-calls `callee({ op: "write" })`. */
  function bodyCalling(callee: string): ThetaBody {
    const arg: Expr = {
      kind: "object",
      typeName: null,
      fields: [{ name: "op", value: { kind: "string", value: "write", range: span() } }],
      range: span(),
    };
    const call: Expr = { kind: "call", callee, args: [arg], range: span() };
    return { statements: [], tail: call };
  }

  /** A body with NO code-side call site (model-facing-only reach). */
  function bodyModelFacingOnly(): ThetaBody {
    return { statements: [], tail: null };
  }

  it("does NOT refuse a prompt-mode theta whose code calls an extension tool when the host-loop rung is available", () => {
    const diagnostics = checkExtensionToolReachability({
      body: bodyCalling("finding_store"),
      extensionToolNames: new Set(["finding_store"]),
      probe: { getToolDefinitionAvailable: false, hostLoopAvailable: true },
      file: FILE,
    });
    expect(diagnostics).toEqual([]);
  });

  it("DOES refuse when no rung is available — error severity, the pinned code, the tool named, located at the theta file", () => {
    const diagnostics = checkExtensionToolReachability({
      body: bodyCalling("finding_store"),
      extensionToolNames: new Set(["finding_store"]),
      probe: { getToolDefinitionAvailable: false, hostLoopAvailable: false },
      file: FILE,
    });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe("error");
    expect(diagnostics[0]?.code).toBe(EXTENSION_TOOL_UNREACHABLE_CODE);
    expect(diagnostics[0]?.message).toContain("finding_store");
    expect(diagnostics[0]?.file).toBe(FILE);
  });

  it("a model-facing-only theta (no code-side call site) is never refused — rung or no rung", () => {
    for (const hostLoopAvailable of [true, false]) {
      const diagnostics = checkExtensionToolReachability({
        body: bodyModelFacingOnly(),
        extensionToolNames: new Set(["finding_store"]),
        probe: { getToolDefinitionAvailable: false, hostLoopAvailable },
        file: FILE,
      });
      expect(diagnostics, `hostLoopAvailable=${String(hostLoopAvailable)}`).toEqual([]);
    }
  });
});

describe("PIC-64 — host-loop dispatch seam (provider register → turn → read-back)", () => {
  /** A recording fake of the host-loop dispatch collaborators. */
  function fakeDeps(result: HostToolResult): {
    readonly deps: HostLoopDispatchDeps;
    readonly log: string[];
    readonly registered: EncodedToolRequest[];
  } {
    const log: string[] = [];
    const registered: EncodedToolRequest[] = [];
    return {
      log,
      registered,
      deps: {
        registerProvider: (request): (() => void) => {
          registered.push(request);
          log.push("register");
          return (): void => {
            log.push("unregister");
          };
        },
        runHostTurn: (): Promise<HostToolResult> => {
          log.push("run-turn");
          return Promise.resolve(result);
        },
        restoreModel: (): void => {
          log.push("restore-model");
        },
      },
    };
  }

  it("registers the theta-controlled provider with the verbatim args, runs the host turn, reads the result back, then unregisters + restores the model", async () => {
    const fake = fakeDeps({ content: [{ type: "text", text: "TOOL-RAN" }], isError: false });
    const request: EncodedToolRequest = { toolName: "finding_store", args: { op: "write", id: 7 } };

    const result = await dispatchViaHostLoop(request, fake.deps);

    // The code-supplied arguments are authored verbatim into the provider.
    expect(fake.registered).toEqual([request]);
    // The result is read back from the host agent loop's appended tool result.
    expect(result.isError).toBe(false);
    const text = result.content.map((block) => (block.type === "text" ? block.text : "")).join("");
    expect(text).toBe("TOOL-RAN");
    // Ordering: register → run turn → unregister → restore model (costs confined
    // to the child's private, discarded session).
    expect(fake.log).toEqual(["register", "run-turn", "unregister", "restore-model"]);
  });

  it("an isError host tool result is returned to code (not fabricated away)", async () => {
    const fake = fakeDeps({ content: [{ type: "text", text: "boom" }], isError: true });
    const result = await dispatchViaHostLoop({ toolName: "finding_store", args: {} }, fake.deps);
    expect(result.isError).toBe(true);
  });

  it("PIC-64 (e): a THROWING unregister does not skip restoreModel — the restore still runs and the throw propagates unswallowed", async () => {
    // On the parent leg the backing session is the USER's live session: PIC-64
    // (e) pins the bridge model / active set as "never left installed", so the
    // restore must run even when `pi.unregisterProvider` itself throws. The
    // seam uses a nested `finally` (no `catch`), so the unregister throw still
    // reaches the caller — asserted via the rejection below.
    const log: string[] = [];
    const deps: HostLoopDispatchDeps = {
      registerProvider: (): (() => void) => {
        log.push("register");
        return (): void => {
          log.push("unregister-throw");
          throw new Error("unregisterProvider failed");
        };
      },
      runHostTurn: (): Promise<HostToolResult> => {
        log.push("run-turn");
        return Promise.resolve({
          content: [{ type: "text", text: "TOOL-RAN" }],
          isError: false,
        });
      },
      restoreModel: (): void => {
        log.push("restore-model");
      },
    };

    await expect(
      dispatchViaHostLoop({ toolName: "finding_store", args: {} }, deps),
    ).rejects.toThrow("unregisterProvider failed");
    expect(log).toEqual(["register", "run-turn", "unregister-throw", "restore-model"]);
  });
});
