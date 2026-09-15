// RFC-0012 §2 — the launch file: the control plane off inherited environment.
//
// Cells pin the parent-side write (0700 dir, 0600 file, closed key set), the
// child-side read-once-and-delete intake, and the verdict every failure takes
// — the SAME verdict a failed ppid check takes today: the control plane is
// dropped, the process runs as an ordinary top-level pi, no new code is minted.

import { describe, expect, it } from "vitest";
import {
  deleteLaunchFile,
  findLaunchFlagOnArgv,
  LAUNCH_FILE_DIR_MODE,
  LAUNCH_FILE_MODE,
  LAUNCH_FILE_VERSION,
  parseLaunchFileDocument,
  projectLaunchFileControlPlane,
  readChildControlPlane,
  readLaunchEntryFromEnv,
  readLaunchFileOnce,
  writeLaunchFile,
  type LaunchFileFs,
  type SubagentLaunchFileDocument,
} from "../src/runtime/subagent-launch-file";
import {
  SUBAGENT_INVOKE_DEPTH_ENV,
  SUBAGENT_LAUNCH_ENTRY_ENV,
  SUBAGENT_LAUNCH_FLAG,
  SUBAGENT_PARENT_PID_ENV,
} from "../src/runtime/subagent-launcher";
import { SUBAGENT_PARAMS_ENV } from "../src/runtime/subagent-params";
import { SUBAGENT_ROOT_ENV_MARKER } from "../src/runtime/subagent-root-regime";

interface FakeLaunchFs extends LaunchFileFs {
  readonly files: Map<string, { contents: string; mode: number; uid: number }>;
  readonly dirs: Map<string, number>;
  readonly log: string[];
  uid: number;
  unreadable: Set<string>;
}

function fakeFs(uid = 1000): FakeLaunchFs {
  const files = new Map<string, { contents: string; mode: number; uid: number }>();
  const dirs = new Map<string, number>();
  const log: string[] = [];
  let counter = 0;
  const fs: FakeLaunchFs = {
    files,
    dirs,
    log,
    uid,
    unreadable: new Set<string>(),
    mkdtemp: (prefix, mode): string => {
      counter += 1;
      const dir = `/tmp/${prefix}${counter}`;
      dirs.set(dir, mode);
      log.push(`mkdtemp:${dir}:${mode.toString(8)}`);
      return dir;
    },
    writeFile: (path, contents, mode): void => {
      files.set(path, { contents, mode, uid: fs.uid });
      log.push(`write:${path}:${mode.toString(8)}`);
    },
    readFile: (path): string => {
      if (fs.unreadable.has(path)) {
        throw Object.assign(new Error(`EACCES: ${path}`), { code: "EACCES" });
      }
      const file = files.get(path);
      if (file === undefined) {
        throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
      }
      log.push(`read:${path}`);
      return file.contents;
    },
    unlink: (path): void => {
      if (!files.delete(path)) {
        throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
      }
      log.push(`unlink:${path}`);
    },
    rmdir: (path): void => {
      if (!dirs.delete(path)) {
        throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
      }
      log.push(`rmdir:${path}`);
    },
    ownerUid: (path): number | undefined => files.get(path)?.uid,
    currentUid: (): number | undefined => fs.uid,
  };
  return fs;
}

function document(overrides?: Partial<SubagentLaunchFileDocument>): SubagentLaunchFileDocument {
  return {
    v: LAUNCH_FILE_VERSION,
    nonce: "n-0123",
    controlPlane: {
      [SUBAGENT_ROOT_ENV_MARKER]: "worker",
      [SUBAGENT_PARAMS_ENV]: '{"topic":"x"}',
      [SUBAGENT_INVOKE_DEPTH_ENV]: "2",
      [SUBAGENT_PARENT_PID_ENV]: "4242",
    },
    channel: { port: 40001, token: "t-abc" },
    presentation: "visible",
    entry: { kind: "fn", name: "step" },
    ...overrides,
  };
}

describe("RFC-0012 §2 — parent-side write", () => {
  it("writes the document into a fresh 0700 directory as a 0600 file and returns the file path", () => {
    const fs = fakeFs();
    const path = writeLaunchFile(document(), fs);
    expect(path).toBe("/tmp/pi-theta-launch-1/launch.json");
    expect(fs.dirs.get("/tmp/pi-theta-launch-1")).toBe(LAUNCH_FILE_DIR_MODE);
    expect(LAUNCH_FILE_DIR_MODE).toBe(0o700);
    expect(fs.files.get(path)?.mode).toBe(LAUNCH_FILE_MODE);
    expect(LAUNCH_FILE_MODE).toBe(0o600);
    expect(JSON.parse(fs.files.get(path)!.contents)).toEqual(document());
  });

  it("one directory per launch — two writes never share a path (par for fan-out)", () => {
    const fs = fakeFs();
    expect(writeLaunchFile(document(), fs)).not.toBe(writeLaunchFile(document(), fs));
  });

  it("projectLaunchFileControlPlane lifts exactly the present control-plane keys out of a composed env", () => {
    const projected = projectLaunchFileControlPlane({
      PATH: "/usr/bin",
      ANTHROPIC_API_KEY: "sk",
      [SUBAGENT_ROOT_ENV_MARKER]: "worker",
      [SUBAGENT_PARENT_PID_ENV]: "1",
      [SUBAGENT_PARAMS_ENV]: undefined,
    });
    expect(projected).toEqual({ [SUBAGENT_ROOT_ENV_MARKER]: "worker", [SUBAGENT_PARENT_PID_ENV]: "1" });
  });

  it("deleteLaunchFile removes the file and its directory and swallows an already-consumed file", () => {
    const fs = fakeFs();
    const path = writeLaunchFile(document(), fs);
    deleteLaunchFile(path, fs);
    expect(fs.files.size).toBe(0);
    expect(fs.dirs.size).toBe(0);
    expect(() => deleteLaunchFile(path, fs)).not.toThrow();
  });
});

describe("RFC-0012 §2 — child-side read-once-and-delete", () => {
  it("returns the document, deletes the file and its directory, and a second read finds nothing", () => {
    const fs = fakeFs();
    const path = writeLaunchFile(document(), fs);
    expect(readLaunchFileOnce(path, fs)).toEqual(document());
    expect(fs.files.has(path)).toBe(false);
    expect(fs.dirs.size).toBe(0);
    expect(readLaunchFileOnce(path, fs)).toBeUndefined();
  });

  it("a file owned by another user is never read and is still deleted", () => {
    const fs = fakeFs(1000);
    const path = writeLaunchFile(document(), fs);
    fs.uid = 2000;
    expect(readLaunchFileOnce(path, fs)).toBeUndefined();
    expect(fs.log.some((entry) => entry.startsWith("read:"))).toBe(false);
    expect(fs.files.has(path)).toBe(false);
  });

  it("a host without uids (Windows) skips the ownership check", () => {
    const fs = fakeFs();
    const path = writeLaunchFile(document(), fs);
    fs.ownerUid = (): undefined => undefined;
    fs.currentUid = (): undefined => undefined;
    expect(readLaunchFileOnce(path, fs)).toEqual(document());
  });

  it("an unreadable path drops the control plane (undefined), never throws", () => {
    const fs = fakeFs();
    const path = writeLaunchFile(document(), fs);
    fs.unreadable.add(path);
    expect(readLaunchFileOnce(path, fs)).toBeUndefined();
    expect(readLaunchFileOnce("/tmp/nope/launch.json", fs)).toBeUndefined();
  });

  it("a malformed file is consumed (deleted) AND dropped", () => {
    const fs = fakeFs();
    const path = writeLaunchFile(document(), fs);
    fs.files.get(path)!.contents = "{ not json";
    expect(readLaunchFileOnce(path, fs)).toBeUndefined();
    expect(fs.files.has(path)).toBe(false);
  });
});

describe("RFC-0012 §2 — document validation is closed", () => {
  const ok = (): unknown => JSON.parse(JSON.stringify(document()));
  const mutate = (fn: (d: Record<string, unknown>) => void): string => {
    const d = ok() as Record<string, unknown>;
    fn(d);
    return JSON.stringify(d);
  };

  it("accepts a well-formed document, with and without a channel", () => {
    expect(parseLaunchFileDocument(JSON.stringify(document()))).toEqual(document());
    const noChannel = document();
    const { channel: _dropped, ...rest } = noChannel;
    expect(parseLaunchFileDocument(JSON.stringify(rest))).toEqual(rest);
  });

  it.each([
    ["wrong version", mutate((d) => { d["v"] = 2; })],
    ["empty nonce", mutate((d) => { d["nonce"] = ""; })],
    ["control plane not an object", mutate((d) => { d["controlPlane"] = []; })],
    ["control plane carrying a non-control-plane key (no env injection)", mutate((d) => { (d["controlPlane"] as Record<string, unknown>)["PATH"] = "/evil"; })],
    ["control plane value not a string", mutate((d) => { (d["controlPlane"] as Record<string, unknown>)[SUBAGENT_ROOT_ENV_MARKER] = 7; })],
    ["unknown presentation", mutate((d) => { d["presentation"] = "popup"; })],
    ["entry of unknown kind", mutate((d) => { d["entry"] = { kind: "script" }; })],
    ["fn entry without a name", mutate((d) => { d["entry"] = { kind: "fn" }; })],
    ["channel port out of range", mutate((d) => { d["channel"] = { port: 70000, token: "t" }; })],
    ["channel port not an integer", mutate((d) => { d["channel"] = { port: 1.5, token: "t" }; })],
    ["channel token empty", mutate((d) => { d["channel"] = { port: 4000, token: "" }; })],
    ["root not an object", "42"],
    ["not JSON", "nope"],
  ])("rejects: %s", (_label, raw) => {
    expect(parseLaunchFileDocument(raw)).toBeUndefined();
  });
});

describe("RFC-0012 §2 — the --theta-launch flag on a raw argv", () => {
  it("finds the pair form and the = form, and answers undefined for an absent or empty value", () => {
    expect(findLaunchFlagOnArgv(["node", "cli.js", `--${SUBAGENT_LAUNCH_FLAG}`, "/tmp/x/launch.json", "-p", "/w"])).toBe(
      "/tmp/x/launch.json",
    );
    expect(findLaunchFlagOnArgv(["node", `--${SUBAGENT_LAUNCH_FLAG}=/tmp/y/launch.json`])).toBe("/tmp/y/launch.json");
    expect(findLaunchFlagOnArgv(["node", "cli.js", "--theta", "/roots"])).toBeUndefined();
    expect(findLaunchFlagOnArgv(["node", `--${SUBAGENT_LAUNCH_FLAG}`])).toBeUndefined();
    expect(findLaunchFlagOnArgv(["node", `--${SUBAGENT_LAUNCH_FLAG}=`])).toBeUndefined();
  });
});

describe("RFC-0012 §2 — the child control-plane view", () => {
  const authenticated = {
    PATH: "/usr/bin",
    [SUBAGENT_ROOT_ENV_MARKER]: "from-env",
    [SUBAGENT_PARENT_PID_ENV]: "77",
  };

  it("no launch file on argv ⇒ today's view: the authenticated env, the entry from the env key", () => {
    const fs = fakeFs();
    const view = readChildControlPlane({
      authenticatedEnv: { ...authenticated, [SUBAGENT_LAUNCH_ENTRY_ENV]: '{"kind":"fn","name":"step"}' },
      launchFilePath: undefined,
      launchFs: fs,
    });
    expect(view.env[SUBAGENT_ROOT_ENV_MARKER]).toBe("from-env");
    expect(view.entry).toEqual({ kind: "fn", name: "step" });
    expect(view.launch).toBeUndefined();
    expect(fs.log).toEqual([]);
  });

  it("a valid launch file REPLACES env carriage: stale control-plane keys are scrubbed, the file's values projected, the launch facts exposed", () => {
    const fs = fakeFs();
    const path = writeLaunchFile(document(), fs);
    const view = readChildControlPlane({
      authenticatedEnv: { ...authenticated, [SUBAGENT_LAUNCH_ENTRY_ENV]: '{"kind":"theta"}' },
      launchFilePath: path,
      launchFs: fs,
    });
    expect(view.env.PATH).toBe("/usr/bin");
    expect(view.env[SUBAGENT_ROOT_ENV_MARKER]).toBe("worker");
    expect(view.env[SUBAGENT_PARENT_PID_ENV]).toBe("4242");
    expect(view.env[SUBAGENT_PARAMS_ENV]).toBe('{"topic":"x"}');
    // The env's own entry key is scrubbed with the rest; the file's entry wins.
    expect(view.env[SUBAGENT_LAUNCH_ENTRY_ENV]).toBeUndefined();
    expect(view.entry).toEqual({ kind: "fn", name: "step" });
    expect(view.launch).toEqual({
      nonce: "n-0123",
      presentation: "visible",
      channel: { port: 40001, token: "t-abc" },
    });
    expect(fs.files.has(path)).toBe(false);
  });

  it("a launch file on argv that fails ⇒ the control plane is DROPPED (the failed-ppid verdict): no regime, no params, theta entry", () => {
    const fs = fakeFs();
    const view = readChildControlPlane({
      authenticatedEnv: { ...authenticated, [SUBAGENT_PARAMS_ENV]: "{}" },
      launchFilePath: "/tmp/planted/launch.json",
      launchFs: fs,
    });
    expect(view.env).toEqual({ PATH: "/usr/bin" });
    expect(view.entry).toEqual({ kind: "theta" });
    expect(view.launch).toBeUndefined();
  });

  it("readLaunchEntryFromEnv: absent or malformed ⇒ the theta entry; a theta entry ⇒ theta; a fn entry ⇒ fn", () => {
    expect(readLaunchEntryFromEnv({})).toEqual({ kind: "theta" });
    expect(readLaunchEntryFromEnv({ [SUBAGENT_LAUNCH_ENTRY_ENV]: "{bad" })).toEqual({ kind: "theta" });
    expect(readLaunchEntryFromEnv({ [SUBAGENT_LAUNCH_ENTRY_ENV]: '{"kind":"fn","name":""}' })).toEqual({ kind: "theta" });
    expect(readLaunchEntryFromEnv({ [SUBAGENT_LAUNCH_ENTRY_ENV]: '{"kind":"theta"}' })).toEqual({ kind: "theta" });
    expect(readLaunchEntryFromEnv({ [SUBAGENT_LAUNCH_ENTRY_ENV]: '{"kind":"fn","name":"go"}' })).toEqual({
      kind: "fn",
      name: "go",
    });
  });
});
