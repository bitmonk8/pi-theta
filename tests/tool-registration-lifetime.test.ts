import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { SystemNote } from "../src/extension/system-note-channel";
import {
  type ActiveSetGateDeps,
  type ActiveSetPi,
  type RegistrationCacheDeps,
  type RegistrationEntry,
  createRegistrationCache,
  deriveToolLabel,
  registerToolInCache,
  withActiveSetGate,
} from "../src/runtime/tool-registration";

// V9f-T — tests for the paired `V9f` "tool-registration lifetime and
// visibility" implementation.
//
// Spec: pi-integration-contract/tool-registration-lifetime.md
//   - PIC-8  restore-failure protocol (single re-attempt → `active-set-restore-failed`
//            (E) + `display:true` note → propagate original error),
//   - PIC-19 snapshot/swap-install-failure protocol (step-1/step-2 throw →
//            `internal-error`, no restore owed),
//   - PIC-17 active-set allowlist gating (the step-2 install vector tracks the
//            invocation; the step-1 snapshot is NOT unioned in),
//   - PIC-44 cache-hit schema byte-equality verification (byte-equal reuses;
//            byte-mismatch fires `registration-cache-collision` + disambiguates);
// extension-bootstrap-and-per-theta.md §Per-theta registration `ToolDefinition.label`
//   derivation (GOV-22 un-anchored residue).
//
// The V9f implementation is in place (`src/runtime/tool-registration.ts`); each
// test below exercises it on its own primary observable — the step-2 install
// vector, the restore-failure diagnostic/note, the internal-error routing, the
// collision diagnostic, the derived label.

// Diagnostic codes sourced from the runtime diagnostics registry
// (diagnostics/code-registry-runtime.md).
const ACTIVE_SET_RESTORE_FAILED = "theta/runtime/active-set-restore-failed";
const REGISTRATION_CACHE_COLLISION = "theta/runtime/registration-cache-collision";

// --- test doubles ----------------------------------------------------------

/** A configurable double of the `pi` snapshot/restore surface. */
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

interface Recorders {
  readonly diagnostics: Diagnostic[];
  readonly notes: SystemNote[];
  readonly internalErrors: Error[];
}

function makeGateDeps(
  pi: ActiveSetPi,
  installVector: readonly string[],
  thetaName: string,
): { deps: ActiveSetGateDeps; rec: Recorders } {
  const rec: Recorders = { diagnostics: [], notes: [], internalErrors: [] };
  const deps: ActiveSetGateDeps = {
    pi,
    thetaName,
    installVector,
    emitDiagnostic: (d) => rec.diagnostics.push(d),
    emitSystemNote: (n) => rec.notes.push(n),
    routeInternalError: (e) => rec.internalErrors.push(e),
  };
  return { deps, rec };
}

// --- PIC-17 active-set install vector (tool-registration-lifetime.md §Acceptance
//     criteria — PIC-17 active-set install vector) ---------------------------

describe("V9f-T — PIC-17 active-set allowlist gating", () => {
  it("PIC-17(a): empty callable set on an untyped turn installs exactly [] and unions in no snapshot member", async () => {
    const pi = new FakeActiveSetPi(["user_tool_a", "user_tool_b"]);
    const { deps } = makeGateDeps(pi, [], "code-review");

    await withActiveSetGate(deps, async () => "ok");

    // PIC-17 step 2: the install vector is exactly `[]`, the theta's empty
    // declared callable set; the non-empty step-1 snapshot is NOT unioned in.
    expect(pi.installVectorSeen).toEqual([]);
    for (const name of pi.snapshot) {
      expect(pi.installVectorSeen).not.toContain(name);
    }
  });

  it("PIC-17(b): a forced-respond turn installs exactly [respondToolName]", async () => {
    const respondName = "__theta_respond_abc123def4567890";
    const pi = new FakeActiveSetPi(["user_tool_a"]);
    const { deps } = makeGateDeps(pi, [respondName], "code-review");

    await withActiveSetGate(deps, async () => "ok");

    // PIC-17 step 2: `[...thetaCallableSetNames, respondToolName]` = `[respondName]`
    // for an empty callable set; no snapshot member is unioned in.
    expect(pi.installVectorSeen).toEqual([respondName]);
    expect(pi.installVectorSeen).not.toContain("user_tool_a");
  });

  it("PIC-17 step 4: the callable set's visibility tracks the invocation — the snapshot is restored after the body", async () => {
    const pi = new FakeActiveSetPi(["user_tool_a", "user_tool_b"]);
    const { deps } = makeGateDeps(pi, ["__theta_callee_slug__review"], "code-review");

    await withActiveSetGate(deps, async () => "ok");

    // PIC-17 step 4: the `finally` restores the user session's prior active set,
    // so visibility tracks the theta invocation rather than the process lifetime.
    expect(pi.setCalls.at(-1)).toEqual(pi.snapshot);
  });
});

// --- PIC-8 restore-failure protocol ---------------------------------------

describe("V9f-T — PIC-8 restore-failure protocol", () => {
  it("PIC-8: a step-4 restore throw triggers exactly one re-attempt, then active-set-restore-failed (E) + a display:true note, and propagates the original error", async () => {
    const pi = new FakeActiveSetPi(["user_tool_a", "user_tool_b"]);
    pi.throwOnRestore = true;
    const { deps, rec } = makeGateDeps(pi, [], "code-review");
    const originalError = new Error("provider exploded mid-query");

    let thrown: unknown;
    try {
      await withActiveSetGate(deps, async () => {
        throw originalError;
      });
    } catch (e) {
      thrown = e;
    }

    // PIC-8(a): re-attempt the restore exactly once — two restore attempts, no
    // third try (no exponential backoff).
    expect(pi.restoreAttempts.length).toBe(2);
    for (const attempt of pi.restoreAttempts) {
      expect(attempt).toEqual(pi.snapshot);
    }

    // PIC-8(b): emit `theta/runtime/active-set-restore-failed` (E) with the
    // snapshot tool names in `hint`.
    const diag = rec.diagnostics.find((d) => d.code === ACTIVE_SET_RESTORE_FAILED);
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe("error");
    for (const name of pi.snapshot) {
      expect(diag?.hint ?? "").toContain(name);
    }

    // PIC-8(c): a `display: true` note carrying the verbatim template (only
    // `<name>` substituted).
    const note = rec.notes.find((n) => n.display === true);
    expect(note?.content).toBe(
      "theta: failed to restore tool active-set after /code-review; the user session may have unexpected tools active. Run /reload to reset.",
    );

    // PIC-8(d): the original exception the `finally` was protecting propagates
    // unmasked — restore failure does not mask the inner error.
    expect(thrown).toBe(originalError);
  });
});

// --- PIC-19 snapshot/swap-install-failure protocol ------------------------

describe("V9f-T — PIC-19 snapshot/swap-install-failure protocol", () => {
  it("PIC-19: a step-1 snapshot throw surfaces as internal-error with no restore owed", async () => {
    const pi = new FakeActiveSetPi(["user_tool_a"]);
    pi.throwOnGet = true;
    const { deps, rec } = makeGateDeps(pi, ["__theta_respond_x"], "code-review");

    await expect(
      withActiveSetGate(deps, async () => "body-must-not-run"),
    ).rejects.toThrow();

    // PIC-19: the failure routes onto `theta/runtime/internal-error`; a step-1
    // throw has committed no active-set change, so no restore is owed and no
    // `setActiveTools` (install or restore) is ever called.
    expect(rec.internalErrors.length).toBe(1);
    expect(pi.setCalls.length).toBe(0);
    expect(
      rec.diagnostics.some((d) => d.code === ACTIVE_SET_RESTORE_FAILED),
    ).toBe(false);
  });

  it("PIC-19: a step-2 swap-install throw surfaces as internal-error with no restore owed", async () => {
    const pi = new FakeActiveSetPi(["user_tool_a"]);
    pi.throwOnInstall = true;
    const { deps, rec } = makeGateDeps(pi, ["__theta_respond_x"], "code-review");

    await expect(
      withActiveSetGate(deps, async () => "body-must-not-run"),
    ).rejects.toThrow();

    // PIC-19: a step-2 throw leaves the install uncommitted, so no restore is
    // owed — `setActiveTools` is called exactly once (the failed install) and
    // never re-called to restore; the failure routes to internal-error.
    expect(rec.internalErrors.length).toBe(1);
    expect(pi.restoreAttempts.length).toBe(0);
    expect(
      rec.diagnostics.some((d) => d.code === ACTIVE_SET_RESTORE_FAILED),
    ).toBe(false);
  });
});

// --- PIC-44 cache-hit schema byte-equality verification -------------------

function makeCacheDeps(): {
  deps: RegistrationCacheDeps;
  registered: string[];
  diagnostics: Diagnostic[];
} {
  const registered: string[] = [];
  const diagnostics: Diagnostic[] = [];
  const deps: RegistrationCacheDeps = {
    registerTool: (name) => registered.push(name),
    emitDiagnostic: (d) => diagnostics.push(d),
  };
  return { deps, registered, diagnostics };
}

describe("V9f-T — PIC-44 cache-hit schema byte-equality verification", () => {
  it("PIC-44: a byte-equal cache hit reuses the registration without re-registering or firing a collision", () => {
    const cache = createRegistrationCache();
    const { deps, registered, diagnostics } = makeCacheDeps();
    const entry: RegistrationEntry = {
      kind: "callee",
      slug: "0011223344556677",
      canonicalFormBytes: '{"type":"object"}',
      postRenameName: "review",
    };

    const first = registerToolInCache(cache, entry, deps);
    const second = registerToolInCache(cache, { ...entry }, deps);

    // PIC-44: byte-equality holds, so the second use reuses the first
    // registration — `pi.registerTool` runs once and no collision fires.
    expect(first).toBe("__theta_callee_0011223344556677__review");
    expect(second).toBe(first);
    expect(registered).toEqual(["__theta_callee_0011223344556677__review"]);
    expect(
      diagnostics.some((d) => d.code === REGISTRATION_CACHE_COLLISION),
    ).toBe(false);
  });

  it("PIC-44: a byte-mismatch on the same slug fires registration-cache-collision, refuses to dedup, and registers a callee under a disambiguated per-slug-counter name (n = 2)", () => {
    const cache = createRegistrationCache();
    const { deps, registered, diagnostics } = makeCacheDeps();
    const slug = "0011223344556677";

    const first = registerToolInCache(
      cache,
      { kind: "callee", slug, canonicalFormBytes: '{"a":1}', postRenameName: "review" },
      deps,
    );
    const second = registerToolInCache(
      cache,
      { kind: "callee", slug, canonicalFormBytes: '{"a":2}', postRenameName: "review" },
      deps,
    );

    // PIC-44: byte-mismatch → fire `theta/runtime/registration-cache-collision`,
    // refuse to dedup, and register the second schema under the disambiguated
    // per-slug-counter name `__theta_callee_<slug>_2__<post-rename-name>`.
    expect(first).toBe(`__theta_callee_${slug}__review`);
    expect(second).toBe(`__theta_callee_${slug}_2__review`);
    expect(registered).toEqual([first, second]);
    const collision = diagnostics.find(
      (d) => d.code === REGISTRATION_CACHE_COLLISION,
    );
    expect(collision).toBeDefined();
    expect(collision?.severity).toBe("error");
  });

  it("PIC-44: a byte-mismatch on a typed-query respond slug disambiguates as __theta_respond_<slug>_2", () => {
    const cache = createRegistrationCache();
    const { deps } = makeCacheDeps();
    const slug = "aabbccddeeff0011";

    const first = registerToolInCache(
      cache,
      { kind: "respond", slug, canonicalFormBytes: '{"x":1}' },
      deps,
    );
    const second = registerToolInCache(
      cache,
      { kind: "respond", slug, canonicalFormBytes: '{"x":2}' },
      deps,
    );

    // PIC-44: typed-query one-shot disambiguation starts at `n = 2`.
    expect(first).toBe(`__theta_respond_${slug}`);
    expect(second).toBe(`__theta_respond_${slug}_2`);
  });
});

// --- ToolDefinition.label derivation (extension-bootstrap-and-per-theta.md
//     §Per-theta registration — GOV-22 un-anchored residue) -----------------

describe("V9f-T — ToolDefinition.label derivation", () => {
  it("derives a theta callee label from the basename: interior hyphen preserved, leading character capitalised (code-review.theta → \"Code-review\")", () => {
    expect(deriveToolLabel({ kind: "theta-file", basename: "code-review" })).toBe(
      "Code-review",
    );
  });

  it("synthesises the typed-query one-shot tool label as the literal \"Theta typed-query response\"", () => {
    expect(deriveToolLabel({ kind: "typed-query-respond" })).toBe(
      "Theta typed-query response",
    );
  });
});
