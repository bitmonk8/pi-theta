// The PI_THETA_* control-plane authentication (subagent.md
// #subagent-control-plane-authentication).
//
// The control-plane variables select the process regime, supply callee
// arguments with the binder bypassed, and name a file to load as an extension —
// and the environment is not a channel this extension can treat as
// parent-authored on every host (Oh-My-Pi loads `<cwd>/.env` before any
// provider lookup). `readParentEnv` therefore honours them only when the
// carriage `PI_THETA_SUBAGENT_PARENT_PID` names this process's REAL parent —
// a per-run, externally-assigned value a file written ahead of time cannot
// state. A real launcher always writes it (`buildSubagentChildEnv` spreads its
// markers last), so a genuine child authenticates; a planted environment does
// not.
//
// These cells pin the seam directly (`authenticateControlPlane` is exported for
// exactly this) plus the production reader `readParentEnv` against the real
// process env, both directions.

import { afterEach, describe, expect, it } from "vitest";
import {
  authenticateControlPlane,
  readParentEnv,
} from "../src/extension/production-subagent-host";
import {
  SUBAGENT_EXTENSION_PIN_ENV,
  SUBAGENT_INVOKE_DEPTH_ENV,
  SUBAGENT_PARENT_PID_ENV,
} from "../src/runtime/subagent-launcher";
import { SUBAGENT_ROOT_ENV_MARKER } from "../src/runtime/subagent-root-regime";
import { SUBAGENT_CALLABLE_HASHES_ENV } from "../src/runtime/subagent-callable-hash";
import {
  SUBAGENT_PARAMS_ENV,
  SUBAGENT_PARAMS_FILE_ENV,
} from "../src/runtime/subagent-params";

/** Every control-plane key the authentication governs, by its exported constant. */
const CONTROL_KEYS: readonly string[] = [
  SUBAGENT_EXTENSION_PIN_ENV,
  SUBAGENT_ROOT_ENV_MARKER,
  SUBAGENT_PARAMS_ENV,
  SUBAGENT_PARAMS_FILE_ENV,
  SUBAGENT_INVOKE_DEPTH_ENV,
  SUBAGENT_CALLABLE_HASHES_ENV,
  SUBAGENT_PARENT_PID_ENV,
];

/** A fully-populated control plane plus unrelated inherited environment. */
function plantedEnv(parentPid?: number): Record<string, string | undefined> {
  return {
    PATH: "/usr/bin",
    ANTHROPIC_API_KEY: "sk-unrelated",
    [SUBAGENT_EXTENSION_PIN_ENV]: "/planted/extensions",
    [SUBAGENT_ROOT_ENV_MARKER]: "planted-slug",
    [SUBAGENT_PARAMS_ENV]: '{"topic":"planted"}',
    [SUBAGENT_PARAMS_FILE_ENV]: "/planted/params.json",
    [SUBAGENT_INVOKE_DEPTH_ENV]: "3",
    [SUBAGENT_CALLABLE_HASHES_ENV]: '{"x":"sha256:planted"}',
    ...(parentPid !== undefined
      ? { [SUBAGENT_PARENT_PID_ENV]: String(parentPid) }
      : {}),
  };
}

describe("authenticateControlPlane — the parent-pid carriage gates the whole control plane", () => {
  it("a carriage naming the real parent pid keeps every control-plane key", () => {
    const env = plantedEnv(4242);
    const authenticated = authenticateControlPlane(env, 4242);
    // The genuine-child fast path: the same object, nothing dropped.
    expect(authenticated).toBe(env);
    for (const key of CONTROL_KEYS) {
      expect(authenticated[key]).toBe(env[key]);
    }
  });

  it("an ABSENT carriage drops all seven control-plane keys and nothing else", () => {
    const authenticated = authenticateControlPlane(plantedEnv(), 4242);
    for (const key of CONTROL_KEYS) {
      expect(authenticated[key]).toBeUndefined();
      // Deleted, not present-and-undefined: a spread of the authenticated env
      // must not re-plant the key over a launcher's own markers.
      expect(key in authenticated).toBe(false);
    }
    // Full inheritance survives for everything outside the control plane — the
    // RFC-0005 credential mechanism is untouched.
    expect(authenticated["PATH"]).toBe("/usr/bin");
    expect(authenticated["ANTHROPIC_API_KEY"]).toBe("sk-unrelated");
  });

  it("a WRONG pid drops the control plane (a file written ahead of time cannot name the real parent)", () => {
    const authenticated = authenticateControlPlane(plantedEnv(9999), 4242);
    for (const key of CONTROL_KEYS) {
      expect(key in authenticated).toBe(false);
    }
  });

  it("the equality is exact string equality — padded or decorated spellings do not authenticate", () => {
    for (const spelling of [" 4242", "4242 ", "+4242", "04242"]) {
      const env = {
        ...plantedEnv(),
        [SUBAGENT_PARENT_PID_ENV]: spelling,
      };
      const authenticated = authenticateControlPlane(env, 4242);
      expect(SUBAGENT_EXTENSION_PIN_ENV in authenticated).toBe(false);
    }
  });
});

describe("readParentEnv — the production reader applies the authentication to the real environment", () => {
  const saved: Record<string, string | undefined> = {};

  function setEnv(key: string, value: string | undefined): void {
    if (!(key in saved)) {
      saved[key] = process.env[key];
    }
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
      delete saved[key];
    }
  });

  it("keeps a pin accompanied by the real ppid — the harness top-of-chain contract (AGENTS.md #subagent-child-pins)", () => {
    setEnv(SUBAGENT_EXTENSION_PIN_ENV, "/tree/under/test/extensions");
    setEnv(SUBAGENT_PARENT_PID_ENV, String(process.ppid));
    expect(readParentEnv()[SUBAGENT_EXTENSION_PIN_ENV]).toBe(
      "/tree/under/test/extensions",
    );
  });

  it("strips a pin planted without the carriage — the .env-planted case", () => {
    setEnv(SUBAGENT_EXTENSION_PIN_ENV, "/planted/extensions");
    setEnv(SUBAGENT_PARENT_PID_ENV, undefined);
    expect(readParentEnv()[SUBAGENT_EXTENSION_PIN_ENV]).toBeUndefined();
  });
});
