import { describe, expect, it } from "vitest";
import { topLevelThetaHostEnv, resetTopLevelThetaControlPlane } from "./helpers/top-level-theta-env";
import {
  SUBAGENT_CONTROL_PLANE_ENV_KEYS,
  SUBAGENT_EXTENSION_PIN_ENV,
  SUBAGENT_PARENT_PID_ENV,
} from "../src/runtime/subagent-launcher";
import { SUBAGENT_ROOT_ENV_MARKER } from "../src/runtime/subagent-root-regime";

const pin = "/checkout/extensions";
function contaminated(): Record<string, string> {
  return {
    ...Object.fromEntries(SUBAGENT_CONTROL_PLANE_ENV_KEYS.map(key => [key, "foreign:" + key])),
    OPENAI_API_KEY: "test-key-not-a-credential",
    PI_CODING_AGENT_DIR: "/operator/agent",
    PATH: "/test/bin",
    PI_UNRELATED_SETTING: "preserve",
  };
}

describe("top-level test-host control-plane isolation", () => {
  it("scrubs every ambient control-plane key before authenticating only its own extension pin", () => {
    const parent = contaminated();
    const env = topLevelThetaHostEnv(parent, pin, 1234);
    for (const key of SUBAGENT_CONTROL_PLANE_ENV_KEYS) {
      if (key === SUBAGENT_EXTENSION_PIN_ENV) expect(env[key]).toBe(pin);
      else if (key === SUBAGENT_PARENT_PID_ENV) expect(env[key]).toBe("1234");
      else expect(env).not.toHaveProperty(key);
    }
    expect(env.OPENAI_API_KEY).toBe(parent.OPENAI_API_KEY);
    expect(env.PI_CODING_AGENT_DIR).toBe(parent.PI_CODING_AGENT_DIR);
    expect(env.PATH).toBe(parent.PATH);
    expect(env.PI_UNRELATED_SETTING).toBe(parent.PI_UNRELATED_SETTING);
    expect(parent[SUBAGENT_ROOT_ENV_MARKER]).toBe("foreign:" + SUBAGENT_ROOT_ENV_MARKER);
  });

  it("allows an explicit wire-probe regime, not a foreign ambient one, without overriding the authenticating pin/PID", () => {
    const env = topLevelThetaHostEnv(contaminated(), pin, 1234, {
      [SUBAGENT_ROOT_ENV_MARKER]: "own-wire-probe",
      [SUBAGENT_PARENT_PID_ENV]: "wrong-pid",
      [SUBAGENT_EXTENSION_PIN_ENV]: "/wrong/extensions",
      PI_CODING_AGENT_DIR: "/explicit/agent",
    });
    expect(env[SUBAGENT_ROOT_ENV_MARKER]).toBe("own-wire-probe");
    expect(env[SUBAGENT_PARENT_PID_ENV]).toBe("1234");
    expect(env[SUBAGENT_EXTENSION_PIN_ENV]).toBe(pin);
    expect(env.PI_CODING_AGENT_DIR).toBe("/explicit/agent");
  });

  it("in-process harness reset deletes old keys instead of leaving them present through Object.assign", () => {
    const env = contaminated();
    const expected = topLevelThetaHostEnv(env, pin, 4567);
    resetTopLevelThetaControlPlane(env, pin, 4567);
    expect(env).toEqual(expected);
    expect(env).not.toHaveProperty(SUBAGENT_ROOT_ENV_MARKER);
  });
});
