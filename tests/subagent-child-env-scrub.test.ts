// Bug 0474 — the child control plane is composed from THIS launch alone.
//
// `buildSubagentChildEnv` inherits the parent environment wholesale (the
// RFC-0005 credential mechanism: credentials are never marshalled) and then
// writes its own markers. Until this bug it wrote ONLY the root marker
// (conditionally), the parent-PID carriage and the invoke depth — so every
// OTHER control-plane carrier present in the launching process's own
// environment (the callable-hash map, both params carriers, the marked-root
// winner path, and the root marker on a slug-less call) rode along untouched.
//
// That is not a theoretical leak: the launching process is frequently itself a
// subagent child, and any harness whose own environment carries a control plane
// (a quality-loop wrapper session; `PI_THETA_SUBAGENT_ROOT=…`,
// `PI_THETA_SUBAGENT_CALLABLE_HASHES={…}`, `PI_THETA_PARAMS_FILE=…`) forwards
// `process.env` as `parentEnv`. The child's parent-pid authentication
// (#subagent-control-plane-authentication) then LEGITIMATELY validates — the
// launcher wrote the real pid beside the stale values — so the child HONOURS a
// foreign hash map / a foreign params file and refuses fail-closed.
//
// Authentication is therefore not the mitigation here: the composition is. The
// launcher scrubs every per-launch control-plane key out of the inherited
// environment before applying this launch's own values. The one deliberate
// exception is the extension pin (#subagent-extension-pin, AGENTS.md
// #subagent-child-pins), which is documented as heritable down the process tree.
//
// Spec: pi-integration-contract/subagent.md #subagent-launch-contract (the
// fail-closed control-plane scrub sentence), #subagent-control-plane-authentication,
// #subagent-extension-pin.

import { describe, expect, it } from "vitest";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import {
  buildSubagentChildEnv,
  SUBAGENT_EXTENSION_PIN_ENV,
  SUBAGENT_INVOKE_DEPTH_ENV,
  SUBAGENT_PARENT_PID_ENV,
} from "../src/runtime/subagent-launcher";
import {
  SUBAGENT_ROOT_ENV_MARKER,
  SUBAGENT_ROOT_WINNER_ENV,
} from "../src/runtime/subagent-root-regime";
import { SUBAGENT_CALLABLE_HASHES_ENV } from "../src/runtime/subagent-callable-hash";
import {
  SUBAGENT_PARAMS_ENV,
  SUBAGENT_PARAMS_FILE_ENV,
} from "../src/runtime/subagent-params";
import { fakeExecutableHost, makeFakeJsonChildLauncher } from "./helpers/fake-json-child";
import type { ModelRegistry, ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint, CheckpointKind, CheckpointSite } from "../src/seams/checkpoint";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { ThetaBody } from "../src/parser/theta-document";
import { parseExpressionSource } from "../src/parser/theta-document";

/**
 * The per-launch control-plane carriers: every control-plane key EXCEPT the
 * deliberately heritable extension pin. A child env composed by a launch that
 * does not itself name one of these must not carry it at all.
 */
const PER_LAUNCH_CONTROL_KEYS: readonly string[] = [
  SUBAGENT_ROOT_ENV_MARKER,
  SUBAGENT_ROOT_WINNER_ENV,
  SUBAGENT_PARAMS_ENV,
  SUBAGENT_PARAMS_FILE_ENV,
  SUBAGENT_INVOKE_DEPTH_ENV,
  SUBAGENT_CALLABLE_HASHES_ENV,
  SUBAGENT_PARENT_PID_ENV,
];

/**
 * The field-witnessed poisoned environment: a process whose OWN env carries a
 * complete, realistically-valued control plane, plus ordinary inherited
 * variables (credentials among them) that must survive untouched.
 */
function poisonedParentEnv(): Record<string, string | undefined> {
  return {
    PATH: "/usr/bin",
    HOME: "/home/u",
    ANTHROPIC_API_KEY: "sk-inherited-credential",
    [SUBAGENT_ROOT_ENV_MARKER]: "fix_cluster",
    [SUBAGENT_ROOT_WINNER_ENV]: "/stale/tree/thetas/fix_cluster.theta",
    [SUBAGENT_PARAMS_ENV]: '{"stale":"inline-params"}',
    [SUBAGENT_PARAMS_FILE_ENV]: "/tmp/pi-theta-params-stale/params.json",
    [SUBAGENT_INVOKE_DEPTH_ENV]: "5",
    [SUBAGENT_CALLABLE_HASHES_ENV]: '{"fix_cluster":"sha256:deadbeef"}',
    [SUBAGENT_PARENT_PID_ENV]: "999999",
    [SUBAGENT_EXTENSION_PIN_ENV]: "/tree/under/test/extensions",
  };
}

describe("bug 0474 — buildSubagentChildEnv composes the control plane from THIS launch alone", () => {
  it("drops every inherited per-launch carrier the call does not itself set", () => {
    const env = buildSubagentChildEnv(poisonedParentEnv(), 4242, 3, "callee");

    // The four carriers this call names nothing for are ABSENT — not
    // present-and-stale, and not present-and-undefined either: the child reads
    // them by presence (`readMarshalledParams` prefers an inline carrier before
    // it ever consults the file carrier).
    for (const key of [
      SUBAGENT_ROOT_WINNER_ENV,
      SUBAGENT_PARAMS_ENV,
      SUBAGENT_PARAMS_FILE_ENV,
      SUBAGENT_CALLABLE_HASHES_ENV,
    ]) {
      expect(env[key]).toBeUndefined();
      expect(key in env).toBe(false);
    }

    // The three the call DOES set carry this launch's values, not the stale ones.
    expect(env[SUBAGENT_ROOT_ENV_MARKER]).toBe("callee");
    expect(env[SUBAGENT_PARENT_PID_ENV]).toBe("4242");
    expect(env[SUBAGENT_INVOKE_DEPTH_ENV]).toBe("3");
  });

  it("drops an inherited root marker when the call supplies no slug (the marker names the callee)", () => {
    const env = buildSubagentChildEnv(poisonedParentEnv(), 4242, 0);
    expect(env[SUBAGENT_ROOT_ENV_MARKER]).toBeUndefined();
    expect(SUBAGENT_ROOT_ENV_MARKER in env).toBe(false);
  });

  it("keeps the extension pin — heritable by design (#subagent-extension-pin)", () => {
    const env = buildSubagentChildEnv(poisonedParentEnv(), 4242, 0, "callee");
    expect(env[SUBAGENT_EXTENSION_PIN_ENV]).toBe("/tree/under/test/extensions");
  });

  it("leaves every non-control-plane variable inherited untouched (the credential mechanism)", () => {
    const parentEnv = poisonedParentEnv();
    const env = buildSubagentChildEnv(parentEnv, 4242, 0, "callee");
    expect(env["PATH"]).toBe("/usr/bin");
    expect(env["HOME"]).toBe("/home/u");
    expect(env["ANTHROPIC_API_KEY"]).toBe("sk-inherited-credential");
    // The scrub is non-mutating: the caller's environment object is not edited.
    expect(parentEnv[SUBAGENT_CALLABLE_HASHES_ENV]).toBe('{"fix_cluster":"sha256:deadbeef"}');
  });

  it("applies THIS launch's own control-plane carriage over the scrubbed inheritance", () => {
    const env = buildSubagentChildEnv(poisonedParentEnv(), 4242, 1, "callee", {
      [SUBAGENT_PARAMS_ENV]: '{"topic":"this-launch"}',
      [SUBAGENT_PARAMS_FILE_ENV]: undefined,
      [SUBAGENT_CALLABLE_HASHES_ENV]: undefined,
      [SUBAGENT_ROOT_WINNER_ENV]: "/live/tree/thetas/callee.theta",
    });
    expect(env[SUBAGENT_PARAMS_ENV]).toBe('{"topic":"this-launch"}');
    expect(env[SUBAGENT_ROOT_WINNER_ENV]).toBe("/live/tree/thetas/callee.theta");
    // A carrier this launch CLEARS is named-and-undefined (the spawn seam drops
    // such entries from the real child environment) — never the inherited value.
    expect(env[SUBAGENT_PARAMS_FILE_ENV]).toBeUndefined();
    expect(env[SUBAGENT_CALLABLE_HASHES_ENV]).toBeUndefined();
  });

  it("never lets the call's own carriage be overwritten by the inherited one", () => {
    const env = buildSubagentChildEnv(poisonedParentEnv(), 7, 0, "callee", {
      [SUBAGENT_CALLABLE_HASHES_ENV]: '{"callee":"sha256:live"}',
    });
    expect(env[SUBAGENT_CALLABLE_HASHES_ENV]).toBe('{"callee":"sha256:live"}');
    expect(env[SUBAGENT_PARENT_PID_ENV]).toBe("7");
  });
});

// ---------------------------------------------------------------------------
// Full-launch composition (the production producer's augmentation site).
// ---------------------------------------------------------------------------

class NoopCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: new NoopCheckpoint(),
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      now: () => 0,
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
  } as unknown as RuntimeRoot;
}

function subagentTheta(): ThetaCompositionInput {
  const frontmatter = { mode: "subagent" } as unknown as ParsedFrontmatter;
  const body: ThetaBody = { statements: [], tail: parseExpressionSource('"unused-parent-side"') };
  return {
    slashName: "worker",
    sourcePath: "/theta/worker.theta",
    frontmatter,
    body,
    callableSet: { entries: new Map() },
  } as unknown as ThetaCompositionInput;
}

function bindInput(): ConversationBindInput {
  const ctx = {
    model: { id: "claude-test", provider: "anthropic" },
    cwd: "/tmp",
    signal: undefined,
  } as unknown as ExtensionCommandContext;
  return { theta: subagentTheta(), args: "", ctx, thetaAbort: new AbortController() };
}

describe("bug 0474 — the production launch composition carries only this launch's control plane", () => {
  it("a poisoned parent environment reaches the child with every stale carrier removed", async () => {
    const launcher = makeFakeJsonChildLauncher();
    const deps = createProductionProducerDeps({
      pi: { sendMessage: (): void => {}, getAllTools: () => [] } as unknown as ExtensionAPI,
      root: rootDouble(),
      modelRegistry: {
        getApiKeyAndHeaders: () => Promise.resolve({ ok: false }),
        getAvailable: () => [],
      } as unknown as ModelRegistry,
      subagentSpawn: launcher.spawn,
      subagentExecutableHost: fakeExecutableHost(),
      subagentParentEnv: poisonedParentEnv(),
      subagentParentPid: 4242,
    });

    await deps.spawnSubagentConversation(bindInput());
    expect(launcher.spawns).toHaveLength(1);
    const env = launcher.spawns[0]!.env;

    // This callee binds no params and declares no `.theta` callables: this
    // launch marshals its OWN (empty) canonical params object and no hash map,
    // so the stale inline params, stale params file and stale hash map must not
    // reach the child under any spelling.
    expect(env[SUBAGENT_PARAMS_ENV]).toBe("{}");
    expect(env[SUBAGENT_PARAMS_FILE_ENV]).toBeUndefined();
    expect(env[SUBAGENT_CALLABLE_HASHES_ENV]).toBeUndefined();
    // The winner path is THIS callee's source path, never the inherited one.
    expect(env[SUBAGENT_ROOT_WINNER_ENV]).toBe("/theta/worker.theta");
    // The regime marker names THIS callee; the depth/pid are this launch's.
    expect(env[SUBAGENT_ROOT_ENV_MARKER]).toBe("worker");
    expect(env[SUBAGENT_PARENT_PID_ENV]).toBe("4242");
    expect(env[SUBAGENT_INVOKE_DEPTH_ENV]).toBe("0");
    // The pin and the ordinary inheritance survive.
    expect(env[SUBAGENT_EXTENSION_PIN_ENV]).toBe("/tree/under/test/extensions");
    expect(env["ANTHROPIC_API_KEY"]).toBe("sk-inherited-credential");
    // No per-launch carrier retains a stale VALUE under any key.
    for (const key of PER_LAUNCH_CONTROL_KEYS) {
      expect(env[key]).not.toBe(poisonedParentEnv()[key]);
    }
  });
});
