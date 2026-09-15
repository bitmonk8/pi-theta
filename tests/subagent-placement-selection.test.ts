// RFC-0012 §6 — selection and per-launch policy. `auto` ordering (priority
// desc, name asc, `detect()` gates, `exec` `when` gate, `pipe` last), the
// explicit forms, the fail-closed unavailable verdict and its
// `theta/load/subagent-placement-unavailable` row (message sourced from the
// registry, DIAG-4; mirrored in docs/reference/diagnostics.md), the load gate
// predicate, the visible cap, and the D6 credential guard cells.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import {
  createPlacementPolicy,
  createUnavailablePlacementBackend,
  credentialGuardNote,
  DEFAULT_SUBAGENT_PLACEMENT_MAX_VISIBLE,
  orderForAuto,
  placementUnavailableDiagnostic,
  resolvePlacementSelector,
  selectPlacement,
  SUBAGENT_PLACEMENT_ENV,
  SUBAGENT_PLACEMENT_UNAVAILABLE_CODE,
  thetaLaunchesChildren,
  type PlacementSelection,
} from "../src/runtime/subagent-placement-selection";
import {
  createPipePlacementBackend,
  type PlacedChild,
  type SubagentPlacementBackend,
} from "../src/runtime/subagent-placement";
import type { ThetaBody } from "../src/parser/theta-document";

const REGISTRY = parseRegistry(
  ["code-registry-parse.md", "code-registry-load.md", "code-registry-runtime.md", "code-registry-host.md"]
    .map((page) =>
      readFileSync(fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)), "utf8"),
    )
    .join("\n"),
) as { code: string; message: string; severity: string }[];

function backend(
  name: string,
  priority: number,
  detect: () => boolean = (): boolean => true,
  capabilities?: SubagentPlacementBackend["capabilities"],
): SubagentPlacementBackend {
  return {
    name,
    priority,
    ...(capabilities !== undefined ? { capabilities } : {}),
    detect,
    place: (): PlacedChild => ({
      handle: name,
      capabilities: { observesExit: false, inheritsEnv: capabilities?.inheritsEnv !== false, visible: true },
      onExit: (): void => {},
      kill: (): void => {},
    }),
  };
}

const pipe = createPipePlacementBackend(() => {
  throw new Error("never spawned here");
});

const EMPTY_BODY: ThetaBody = { statements: [], tail: null };

describe("RFC-0012 §6 — resolvePlacementSelector", () => {
  it("the env override wins when set and non-blank; else the settings value; else auto", () => {
    expect(SUBAGENT_PLACEMENT_ENV).toBe("PI_THETA_SUBAGENT_PLACEMENT");
    expect(resolvePlacementSelector(undefined, undefined)).toBe("auto");
    expect(resolvePlacementSelector("herdr", undefined)).toBe("herdr");
    expect(resolvePlacementSelector("herdr", "pipe")).toBe("pipe");
    expect(resolvePlacementSelector("herdr", "  ")).toBe("herdr");
    expect(resolvePlacementSelector(undefined, " exec ")).toBe("exec");
  });
});

describe("RFC-0012 §6 — selectPlacement", () => {
  it("auto: the highest-priority DETECTED registered backend wins; ties break by name", () => {
    const registered = [backend("zellij", 5), backend("herdr", 10, () => false), backend("cmux", 5), backend("wezterm", 1)];
    expect(orderForAuto(registered).map((b) => b.name)).toEqual(["herdr", "cmux", "zellij", "wezterm"]);
    const selection = selectPlacement({ selector: "auto", registered, exec: undefined, pipe });
    expect(selection.ok && selection.backend.name).toBe("cmux");
  });

  it("auto: no detected registered backend ⇒ exec when its `when` holds ⇒ else pipe; auto never refuses", () => {
    const exec = backend("exec", Number.NEGATIVE_INFINITY, () => true, { visible: true, inheritsEnv: false });
    const execOff = backend("exec", Number.NEGATIVE_INFINITY, () => false);
    expect(selectPlacement({ selector: "auto", registered: [backend("x", 1, () => false)], exec, pipe })).toEqual({ ok: true, backend: exec });
    expect(selectPlacement({ selector: "auto", registered: [], exec: execOff, pipe })).toEqual({ ok: true, backend: pipe });
    expect(selectPlacement({ selector: "auto", registered: [], exec: undefined, pipe })).toEqual({ ok: true, backend: pipe });
  });

  it("auto: a registered backend whose detect() throws counts as not detected", () => {
    const throwing = backend("bad", 99, () => {
      throw new Error("no socket");
    });
    expect(selectPlacement({ selector: "auto", registered: [throwing], exec: undefined, pipe })).toEqual({ ok: true, backend: pipe });
  });

  it("explicit pipe always selects pipe; explicit exec selects the template even when its `when` is false", () => {
    const execOff = backend("exec", Number.NEGATIVE_INFINITY, () => false);
    expect(selectPlacement({ selector: "pipe", registered: [backend("herdr", 1)], exec: execOff, pipe })).toEqual({ ok: true, backend: pipe });
    expect(selectPlacement({ selector: "exec", registered: [], exec: execOff, pipe })).toEqual({ ok: true, backend: execOff });
  });

  it("explicit named backend: detected ⇒ selected", () => {
    const herdr = backend("herdr", 1);
    expect(selectPlacement({ selector: "herdr", registered: [herdr], exec: undefined, pipe })).toEqual({ ok: true, backend: herdr });
  });

  it.each([
    ["exec without a global template", { selector: "exec", registered: [] }, "exec", "no `theta.subagentPlacementExec` template in the global settings file"],
    ["an unregistered name", { selector: "herdr", registered: [backend("zellij", 1)] }, "herdr", "no registered backend has this name"],
    ["a registered backend that is not detected", { selector: "herdr", registered: [backend("herdr", 1, () => false)] }, "herdr", "the backend is not detected in this environment"],
    [
      "a registered backend whose detect() throws",
      {
        selector: "herdr",
        registered: [
          backend("herdr", 1, () => {
            throw new Error("HERDR_SOCKET_PATH unset");
          }),
        ],
      },
      "herdr",
      "the backend's detect() threw: HERDR_SOCKET_PATH unset",
    ],
    ["a selector outside the name grammar (env override)", { selector: "Herdr!", registered: [] }, "Herdr!", "not a valid placement name"],
  ])("explicit unavailable — %s — is the fail-closed verdict, never a silent pipe", (_label, input, name, reason) => {
    const selection = selectPlacement({ ...input, exec: undefined, pipe });
    expect(selection).toEqual({ ok: false, name, reason });
  });

  it("the unavailable verdict renders the registry's theta/load/subagent-placement-unavailable row (DIAG-4), E, at the theta's file, and the reference page mirrors it", () => {
    const template = registryMessage(REGISTRY, SUBAGENT_PLACEMENT_UNAVAILABLE_CODE) as string | undefined;
    expect(template).toBe("subagent placement '<name>' is unavailable: <reason>");
    const selection: Extract<PlacementSelection, { ok: false }> = { ok: false, name: "herdr", reason: "no registered backend has this name" };
    const diagnostic = placementUnavailableDiagnostic(selection, "/w/.pi/theta/worker.theta");
    expect(diagnostic.code).toBe(SUBAGENT_PLACEMENT_UNAVAILABLE_CODE);
    expect(diagnostic.severity).toBe("error");
    expect(diagnostic.file).toBe("/w/.pi/theta/worker.theta");
    expect(diagnostic.message).toBe(
      (template as string).replace("<name>", "herdr").replace("<reason>", "no registered backend has this name"),
    );
    expect(REGISTRY.find((row) => row.code === SUBAGENT_PLACEMENT_UNAVAILABLE_CODE)?.severity).toBe("E");
    const mirror = readFileSync(fileURLToPath(new URL("../docs/reference/diagnostics.md", import.meta.url)), "utf8");
    expect(mirror).toContain(`| \`${SUBAGENT_PLACEMENT_UNAVAILABLE_CODE}\` | E | load | \`${template}\` |`);
  });

  it("the launch-time stand-in for an unavailable selection refuses at place() with the same text", async () => {
    const stub = createUnavailablePlacementBackend({ ok: false, name: "herdr", reason: "no registered backend has this name" });
    expect(stub.detect()).toBe(false);
    await expect(
      Promise.resolve().then(() =>
        stub.place({
          execPath: "x",
          args: [],
          cwd: "/w",
          env: {},
          label: "l",
          presentation: "headless",
          launchFile: undefined,
          context: { invokeDepth: 0, parallel: false },
        }),
      ),
    ).rejects.toThrow("subagent placement 'herdr' is unavailable: no registered backend has this name");
  });
});

describe("RFC-0012 §6 — thetaLaunchesChildren (the load-gate predicate)", () => {
  it("a mode: subagent theta and a theta declaring a top-level subagent fn are gated; a plain prompt-mode theta (plain fns included) is not", () => {
    expect(thetaLaunchesChildren({ frontmatter: { mode: "subagent" }, body: EMPTY_BODY })).toBe(true);
    const withSubagentFn = {
      statements: [{ kind: "fn", name: "step", subagent: true } as unknown as ThetaBody["statements"][number]],
      tail: null,
    };
    expect(thetaLaunchesChildren({ frontmatter: { mode: "prompt" }, body: withSubagentFn })).toBe(true);
    const withPlainFn = {
      statements: [{ kind: "fn", name: "helper" } as unknown as ThetaBody["statements"][number]],
      tail: null,
    };
    expect(thetaLaunchesChildren({ frontmatter: { mode: "prompt" }, body: withPlainFn })).toBe(false);
    expect(thetaLaunchesChildren({ frontmatter: {}, body: EMPTY_BODY })).toBe(false);
  });
});

describe("RFC-0012 §6 — createPlacementPolicy: the visible cap", () => {
  const visible = backend("herdr", 1, () => true, { visible: true, inheritsEnv: true });

  function policy(maxVisible = DEFAULT_SUBAGENT_PLACEMENT_MAX_VISIBLE): ReturnType<typeof createPlacementPolicy> {
    return createPlacementPolicy({
      select: (): PlacementSelection => ({ ok: true, backend: visible }),
      pipe,
      maxVisible,
      emitSystemNote: (): void => {
        throw new Error("no note expected");
      },
    });
  }

  it("the default cap is 8: eight concurrent visible launches are placed, the ninth uses pipe", () => {
    expect(DEFAULT_SUBAGENT_PLACEMENT_MAX_VISIBLE).toBe(8);
    const resolve = policy();
    const leases = Array.from({ length: 8 }, () => resolve({ provider: "anthropic", callee: "/w" }));
    expect(leases.every((lease) => lease.backend === visible)).toBe(true);
    expect(resolve({ provider: "anthropic", callee: "/w" }).backend).toBe(pipe);
  });

  it("releasing a lease frees the slot; release is idempotent; a pipe lease's release is a no-op", () => {
    const resolve = policy(1);
    const first = resolve({ provider: "p", callee: "/w" });
    expect(first.backend).toBe(visible);
    const overflow = resolve({ provider: "p", callee: "/w" });
    expect(overflow.backend).toBe(pipe);
    overflow.release();
    expect(resolve({ provider: "p", callee: "/w" }).backend).toBe(pipe);
    first.release();
    first.release();
    expect(resolve({ provider: "p", callee: "/w" }).backend).toBe(visible);
  });

  it("a cap of 0 makes every launch headless", () => {
    expect(policy(0)({ provider: "p", callee: "/w" }).backend).toBe(pipe);
  });

  it("an unavailable selection at launch yields the refusing stand-in (never pipe) and holds no slot", () => {
    const resolve = createPlacementPolicy({
      select: (): PlacementSelection => ({ ok: false, name: "herdr", reason: "no registered backend has this name" }),
      pipe,
      maxVisible: 8,
      emitSystemNote: (): void => {},
    });
    const lease = resolve({ provider: "p", callee: "/w" });
    expect(lease.backend.name).toBe("herdr");
    expect(() => lease.backend.place({} as never)).toThrow("is unavailable");
  });
});

describe("RFC-0012 §6 (D6) — createPlacementPolicy: the credential guard", () => {
  const noInherit = backend("wezterm", 1, () => true, { visible: true, inheritsEnv: false });
  const inherits = backend("herdr", 1, () => true, { visible: true, inheritsEnv: true });

  function guarded(
    selected: SubagentPlacementBackend,
    status: ((provider: string) => { source?: string } | undefined) | undefined,
  ): { resolve: ReturnType<typeof createPlacementPolicy>; notes: string[] } {
    const notes: string[] = [];
    const resolve = createPlacementPolicy({
      select: (): PlacementSelection => ({ ok: true, backend: selected }),
      pipe,
      maxVisible: 8,
      ...(status !== undefined ? { providerAuthStatus: status } : {}),
      emitSystemNote: (content): void => {
        notes.push(content);
      },
    });
    return { resolve, notes };
  }

  it("source: environment + inheritsEnv: false ⇒ the child is placed by pipe and exactly one theta-system-note with the pinned template is emitted", () => {
    const { resolve, notes } = guarded(noInherit, () => ({ source: "environment" }));
    const lease = resolve({ provider: "anthropic", callee: "/review" });
    expect(lease.backend).toBe(pipe);
    expect(notes).toEqual(["theta: placement 'wezterm' does not carry environment credentials for anthropic; running /review headless"]);
    expect(notes[0]).toBe(credentialGuardNote("wezterm", "anthropic", "/review"));
  });

  it("source: stored ⇒ placed by the selected backend, no note", () => {
    const { resolve, notes } = guarded(noInherit, () => ({ source: "stored" }));
    expect(resolve({ provider: "anthropic", callee: "/review" }).backend).toBe(noInherit);
    expect(notes).toEqual([]);
  });

  it("inheritsEnv: true ⇒ placed regardless of source, no note", () => {
    const { resolve, notes } = guarded(inherits, () => ({ source: "environment" }));
    expect(resolve({ provider: "anthropic", callee: "/review" }).backend).toBe(inherits);
    expect(notes).toEqual([]);
  });

  it("an AuthStatus without `source`, an absent getProviderAuthStatus, or a throwing one ⇒ placed, no note (the documented caveat)", () => {
    expect(guarded(noInherit, () => ({})).resolve({ provider: "p", callee: "/w" }).backend).toBe(noInherit);
    expect(guarded(noInherit, undefined).resolve({ provider: "p", callee: "/w" }).backend).toBe(noInherit);
    const throwing = guarded(noInherit, () => {
      throw new Error("registry unavailable");
    });
    expect(throwing.resolve({ provider: "p", callee: "/w" }).backend).toBe(noInherit);
    expect(throwing.notes).toEqual([]);
  });

  it("the note is emitted once per (backend, provider): a fan-out says it once; a second provider gets its own note; every affected child still runs headless", () => {
    const { resolve, notes } = guarded(noInherit, () => ({ source: "environment" }));
    for (let i = 0; i < 5; i += 1) {
      expect(resolve({ provider: "anthropic", callee: "/w" }).backend).toBe(pipe);
    }
    expect(resolve({ provider: "openai", callee: "/w" }).backend).toBe(pipe);
    expect(notes).toHaveLength(2);
    expect(notes[1]).toContain("for openai;");
  });

  it("the guard's pipe fallback holds no visible slot, so it never consumes the cap", () => {
    const { resolve } = guarded(noInherit, () => ({ source: "environment" }));
    const seen = Array.from({ length: 20 }, () => resolve({ provider: "anthropic", callee: "/w" }).backend);
    expect(seen.every((b) => b === pipe)).toBe(true);
  });
});
