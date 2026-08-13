// SPAWN-08 — the marshalled-params env patch must clear its SIBLING carrier.
//
// Spec: pi-integration-contract/subagent.md (PIC-60 #subagent-launch-contract
// params row — the dual `PI_THETA_PARAMS` / `PI_THETA_PARAMS_FILE` channel).
//
// The hazard this file pins is the LAYERING, not the cutover. `marshalParams`
// returns a patch that the launch path spreads over the launching process's own
// inherited environment (`{ ...parentEnv, ...marshalled.env }` in
// src/extension/production-theta-producer.ts), and that launching process is
// itself frequently a subagent child still carrying the carrier of the
// invocation that launched IT. A patch naming only the carrier THIS invocation
// chose cannot clear the inherited sibling, and `readMarshalledParams` resolves
// a two-carrier env by PREFERENCE (inline first, returning before it consults
// the file carrier) rather than by refusal — so the stale carrier does not
// surface as an error, it silently WINS and the callee runs on its caller's
// arguments.
//
// tests/subagent-params-marshalling.test.ts already covers the cutover itself
// (threshold boundary, 0600 mode, child-deletes-on-read, validation refusal,
// binder bypass) and asserts the unused key reads back `undefined` on a patch
// examined in ISOLATION. It never layers a patch over a populated parent env,
// so nothing there distinguishes "key omitted" from "key explicitly cleared" —
// which is the whole of SPAWN-08. This file adds only that: precise
// present-but-`undefined` assertions, both stale-carrier directions layered
// over a parent env, the spawn-boundary proof that `undefined` DELETES rather
// than empties, and marshal→read round-trips at both sizes.

import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  canonicalizeParamsJson,
  marshalParams,
  readMarshalledParams,
  SUBAGENT_PARAMS_ENV,
  SUBAGENT_PARAMS_FILE_ENV,
  SUBAGENT_PARAMS_THRESHOLD_BYTES,
  type ParamsIntakeDeps,
  type ParamsMarshalDeps,
} from "../src/runtime/subagent-params";

// ---------------------------------------------------------------------------
// Fixtures (fs seam doubles in the style of subagent-params-marshalling.test.ts).
// ---------------------------------------------------------------------------

/** A fake parent-side fs seam recording temp-file writes and unlinks. */
function fakeMarshalFs(): {
  readonly deps: ParamsMarshalDeps;
  readonly writes: { path: string; contents: string; mode: number }[];
  readonly unlinks: string[];
} {
  const writes: { path: string; contents: string; mode: number }[] = [];
  const unlinks: string[] = [];
  let counter = 0;
  return {
    writes,
    unlinks,
    deps: {
      writeTempFile: (contents, mode): string => {
        counter += 1;
        const path = `/tmp/pi-theta-params-${counter}.json`;
        writes.push({ path, contents, mode });
        return path;
      },
      unlink: (path): void => {
        unlinks.push(path);
      },
    },
  };
}

/**
 * A fake child-side fs seam serving one temp file's contents and recording
 * reads + deletes. An unknown path THROWS: a test that asserts the child never
 * opened a stale carrier gets that for free.
 */
function fakeIntakeFs(contentsByPath: Record<string, string>): {
  readonly deps: ParamsIntakeDeps;
  readonly reads: string[];
  readonly unlinks: string[];
} {
  const reads: string[] = [];
  const unlinks: string[] = [];
  return {
    reads,
    unlinks,
    deps: {
      readFile: (path): string => {
        const contents = contentsByPath[path];
        if (contents === undefined) {
          throw new Error(`fake intake fs: no file at ${path}`);
        }
        reads.push(path);
        return contents;
      },
      unlink: (path): void => {
        unlinks.push(path);
      },
    },
  };
}

/** Small params — strictly below the pinned threshold, so they ride the inline carrier. */
const SMALL_PARAMS: Record<string, unknown> = { topic: "sea" };

/** The level-2 callee's LARGE params — at/above the threshold, so they ride the temp file. */
const LARGE_PARAMS: Record<string, unknown> = {
  blob: "x".repeat(SUBAGENT_PARAMS_THRESHOLD_BYTES + 100),
};

/** The level-1 CALLER's own params — the payload a stale inherited carrier would substitute. */
const STALE_CALLER_PARAMS: Record<string, unknown> = { topic: "the caller's own arguments" };

/**
 * The child env exactly as the launch path builds it: the launching process's
 * inherited environment with the marshalled patch spread OVER it
 * (src/extension/production-theta-producer.ts `parentEnv`). Reproducing the
 * spread here is the point — a patch examined on its own cannot show whether an
 * inherited sibling survived.
 */
function childEnvOver(
  parentEnv: Readonly<Record<string, string | undefined>>,
  patch: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  return { ...parentEnv, ...patch };
}

/** Real-fs temp dirs this file created, removed after each test (the module writes real 0600 files). */
const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

// ---------------------------------------------------------------------------
// The patch shape: both carriers named on every path.
// ---------------------------------------------------------------------------

describe("SPAWN-08 — the params env patch names BOTH carriers", () => {
  it("small payload → inline carrier set, file carrier PRESENT as an explicit `undefined` clear", () => {
    const fs = fakeMarshalFs();
    const marshalled = marshalParams(SMALL_PARAMS, fs.deps);
    expect(marshalled.env[SUBAGENT_PARAMS_ENV]).toBe(canonicalizeParamsJson(SMALL_PARAMS));
    // PRESENT, not omitted: the key must exist so the spread overwrites (and thus
    // clears) an inherited sibling. Omission would leave the inherited value.
    expect(Object.hasOwn(marshalled.env, SUBAGENT_PARAMS_FILE_ENV)).toBe(true);
    // Cleared with `undefined` — NOT an empty string, which would still satisfy
    // `readMarshalledParams`'s `!== undefined` test and then fail closed on parse.
    expect(marshalled.env[SUBAGENT_PARAMS_FILE_ENV]).toBeUndefined();
    expect(fs.writes).toHaveLength(0);
  });

  it("large payload (≥ threshold) → file carrier set, inline carrier PRESENT as an explicit `undefined` clear", () => {
    const fs = fakeMarshalFs();
    const marshalled = marshalParams(LARGE_PARAMS, fs.deps);
    expect(fs.writes).toHaveLength(1);
    expect(marshalled.env[SUBAGENT_PARAMS_FILE_ENV]).toBe(fs.writes[0]!.path);
    expect(Object.hasOwn(marshalled.env, SUBAGENT_PARAMS_ENV)).toBe(true);
    expect(marshalled.env[SUBAGENT_PARAMS_ENV]).toBeUndefined();
    marshalled.cleanup();
    expect(fs.unlinks).toEqual([fs.writes[0]!.path]);
  });

  it("the patch names EXACTLY the two carriers — clearing a sibling never widens the patch", () => {
    const small = marshalParams(SMALL_PARAMS, fakeMarshalFs().deps);
    const large = marshalParams(LARGE_PARAMS, fakeMarshalFs().deps);
    // Sorted, because the patch is a spread source: key ORDER is irrelevant, the
    // key SET is the contract (any third key would be an unreviewed env write).
    expect(Object.keys(small.env).sort()).toEqual([SUBAGENT_PARAMS_ENV, SUBAGENT_PARAMS_FILE_ENV]);
    expect(Object.keys(large.env).sort()).toEqual([SUBAGENT_PARAMS_ENV, SUBAGENT_PARAMS_FILE_ENV]);
  });
});

// ---------------------------------------------------------------------------
// THE REGRESSION: a stale inherited carrier must not reach the grandchild.
// ---------------------------------------------------------------------------

describe("SPAWN-08 — a stale inherited carrier is cleared, not preferred", () => {
  it("stale inline carrier + LARGE payload → the child reads its OWN temp-file params, not its caller's", () => {
    // Level 1 was launched with SMALL params, so its own process env holds the
    // inline carrier. This is the reported break's exact shape.
    const staleJson = canonicalizeParamsJson(STALE_CALLER_PARAMS);
    const parentEnv: Record<string, string | undefined> = {
      PATH: "/usr/bin",
      [SUBAGENT_PARAMS_ENV]: staleJson,
    };
    // Level 1 now invokes a level-2 callee whose params are LARGE → file carrier.
    const fs = fakeMarshalFs();
    const marshalled = marshalParams(LARGE_PARAMS, fs.deps);
    const childEnv = childEnvOver(parentEnv, marshalled.env);

    // The stale value is no longer presented on the inline carrier.
    expect(childEnv[SUBAGENT_PARAMS_ENV]).toBeUndefined();
    expect(childEnv[SUBAGENT_PARAMS_ENV]).not.toBe(staleJson);
    // Unrelated inherited environment is untouched (full inheritance is the
    // credential mechanism — the clear is surgical, per-carrier).
    expect(childEnv.PATH).toBe("/usr/bin");

    // The child's intake resolves to the NEW large params and DOES open its own
    // temp file. Against the old single-key patch this read returned the stale
    // caller params and never touched the file at all.
    const write = fs.writes[0]!;
    const intake = fakeIntakeFs({ [write.path]: write.contents });
    const parsed = readMarshalledParams(childEnv, intake.deps);
    expect(parsed).toEqual(LARGE_PARAMS);
    expect(parsed).not.toEqual(STALE_CALLER_PARAMS);
    expect(intake.reads).toEqual([write.path]);
    expect(intake.unlinks).toEqual([write.path]);

    marshalled.cleanup();
  });

  it("stale FILE carrier + SMALL payload → the child reads the new inline params and never opens the stale file", () => {
    // The mirror direction: level 1 was launched with LARGE params, so its env
    // holds a file-carrier path. Its callee's params are SMALL. A surviving
    // stale path would be read (and DELETED) only after the inline carrier
    // missed — but it must not survive at all.
    const stalePath = "/tmp/pi-theta-params-stale.json";
    const parentEnv: Record<string, string | undefined> = {
      [SUBAGENT_PARAMS_FILE_ENV]: stalePath,
    };
    const marshalled = marshalParams(SMALL_PARAMS, fakeMarshalFs().deps);
    const childEnv = childEnvOver(parentEnv, marshalled.env);

    expect(childEnv[SUBAGENT_PARAMS_FILE_ENV]).toBeUndefined();

    // The fake intake fs THROWS on an unknown path, so a surviving stale path
    // would fail this read outright; the empty `reads` log pins that no file was
    // consulted once the inline carrier hit.
    const intake = fakeIntakeFs({});
    const parsed = readMarshalledParams(childEnv, intake.deps);
    expect(parsed).toEqual(SMALL_PARAMS);
    expect(intake.reads).toHaveLength(0);
    expect(intake.unlinks).toHaveLength(0);
  });

  it("`undefined` DELETES the carrier at the real spawn boundary (it is not passed as an empty string)", () => {
    // The clear only works because the spawn seam drops `undefined` entries when
    // it builds the child's environment block (src/extension/production-subagent-
    // host.ts hands the assembled env straight to `child_process.spawn`). That is
    // a HOST behaviour, so it is probed against a real child process rather than
    // assumed: `process.execPath -e …` runs under whichever runtime executes this
    // suite, which is the same runtime that spawns subagent children.
    const fs = fakeMarshalFs();
    const marshalled = marshalParams(LARGE_PARAMS, fs.deps);
    const childEnv = childEnvOver(
      { [SUBAGENT_PARAMS_ENV]: canonicalizeParamsJson(STALE_CALLER_PARAMS) },
      marshalled.env,
    );
    const probe = spawnSync(
      process.execPath,
      [
        "-e",
        `process.stdout.write(JSON.stringify({` +
          ` inlinePresent: ${JSON.stringify(SUBAGENT_PARAMS_ENV)} in process.env,` +
          ` filePresent: ${JSON.stringify(SUBAGENT_PARAMS_FILE_ENV)} in process.env,` +
          ` file: process.env[${JSON.stringify(SUBAGENT_PARAMS_FILE_ENV)}] }))`,
      ],
      { env: childEnv, shell: false, encoding: "utf8" },
    );
    expect(probe.error).toBeUndefined();
    expect(probe.status).toBe(0);
    const seen: unknown = JSON.parse(probe.stdout);
    // The cleared carrier is ABSENT in the child (`in` is false) — not present
    // with an empty value, which `readMarshalledParams` would accept and then
    // fail closed on.
    expect(seen).toEqual({
      inlinePresent: false,
      filePresent: true,
      file: fs.writes[0]!.path,
    });

    marshalled.cleanup();
  });
});

// ---------------------------------------------------------------------------
// Round-trip: marshal → layered child env → intake, at both sizes.
// ---------------------------------------------------------------------------

describe("SPAWN-08 — marshal → read round-trip at both payload sizes", () => {
  it("small payload round-trips through the inline carrier with the values intact", () => {
    const params: Record<string, unknown> = { topic: "sea", depth: 3, tags: ["a", "b"] };
    const marshalled = marshalParams(params, fakeMarshalFs().deps);
    const intake = fakeIntakeFs({});
    const parsed = readMarshalledParams(childEnvOver({ HOME: "/home/x" }, marshalled.env), intake.deps);
    expect(parsed).toEqual(params);
  });

  it("large payload round-trips through a REAL 0600 temp file with the values intact", () => {
    // Real fs on both sides: the parent writes the temp file, the child reads and
    // deletes it. `afterEach` removes the containing dir either way, so a failure
    // before the child's delete leaves nothing behind.
    const dir = mkdtempSync(join(tmpdir(), "pi-theta-params-carrier-"));
    tempDirs.push(dir);
    const path = join(dir, "params.json");
    const realMarshalFs: ParamsMarshalDeps = {
      writeTempFile: (contents, mode): string => {
        writeFileSync(path, contents, { mode });
        return path;
      },
      unlink: (p): void => {
        rmSync(p, { force: true });
      },
    };
    const realIntakeFs: ParamsIntakeDeps = {
      readFile: (p): string => readFileSync(p, "utf8"),
      unlink: (p): void => {
        rmSync(p, { force: true });
      },
    };
    const marshalled = marshalParams(LARGE_PARAMS, realMarshalFs);
    try {
      const childEnv = childEnvOver(
        { [SUBAGENT_PARAMS_ENV]: canonicalizeParamsJson(STALE_CALLER_PARAMS) },
        marshalled.env,
      );
      const parsed = readMarshalledParams(childEnv, realIntakeFs);
      expect(parsed).toEqual(LARGE_PARAMS);
      // The child deleted the temp file on read (PIC-60); the parent-`finally`
      // backstop below is then a no-op on an already-gone file.
      expect(() => readFileSync(path, "utf8")).toThrow();
    } finally {
      marshalled.cleanup();
    }
  });
});
