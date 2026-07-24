// RFC-0006 new coverage — marshalled-params channel (PIC-60).
//
// Spec: pi-integration-contract/subagent.md (PIC-60 #subagent-launch-contract
// params row, #subagent-return-envelope escalation-sharing), binder.md (binder
// inference remains exclusive to human slash invocation),
// diagnostics/code-registry-runtime.md
// (`theta/runtime/subagent-params-validation-failed`).
//
// Covers the RFC's named list for params:
//   - below-threshold → env var with canonical JSON;
//   - at/above threshold → temp file, 0600 mode (perm assertion skipped on
//     Windows via process.platform), child deletes after read, parent-`finally`
//     backstop;
//   - schema-validation rejection → pinned diagnostic + Err(InvokeInfraError
//     { cause: "validation" });
//   - binder NOT invoked for the marshalled path (binder bypassed).
//
// RED EXPECTATION (RFC-0006 not yet implemented): the canonicalise / channel /
// marshal / intake helpers throw `not implemented: RFC 0006`, so each assertion
// reds on its primary behaviour; the paired implementation leaf greens them.

import { describe, expect, it } from "vitest";
import { rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  canonicalizeParamsJson,
  chooseParamsChannel,
  intakeChildParams,
  marshalParams,
  readMarshalledParams,
  SUBAGENT_PARAMS_ENV,
  SUBAGENT_PARAMS_FILE_ENV,
  SUBAGENT_PARAMS_TEMP_FILE_MODE,
  SUBAGENT_PARAMS_THRESHOLD_BYTES,
  SUBAGENT_PARAMS_VALIDATION_FAILED_CODE,
  type ParamsIntakeDeps,
  type ParamsMarshalDeps,
  type ParamsSchemaValidator,
} from "../src/runtime/subagent-params";

// ---------------------------------------------------------------------------
// In-memory fs seam doubles (test code is unrestricted).
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

/** A fake child-side fs seam serving one temp file's contents and recording deletes. */
function fakeIntakeFs(contentsByPath: Record<string, string>): {
  readonly deps: ParamsIntakeDeps;
  readonly unlinks: string[];
} {
  const unlinks: string[] = [];
  return {
    unlinks,
    deps: {
      readFile: (path): string => {
        const contents = contentsByPath[path];
        if (contents === undefined) {
          throw new Error(`fake intake fs: no file at ${path}`);
        }
        return contents;
      },
      unlink: (path): void => {
        unlinks.push(path);
      },
    },
  };
}

const ALWAYS_VALID: ParamsSchemaValidator = {
  validate: () => ({ ok: true }),
};

/** A validator that rejects, naming the failing param path (the pinned diagnostic detail). */
const REJECTS_TOPIC: ParamsSchemaValidator = {
  validate: () => ({ ok: false, errorPath: "/topic", detail: "must be string" }),
};

/** A payload padded past the pinned byte threshold, to force the temp-file channel. */
function bigParams(): Record<string, unknown> {
  return { blob: "x".repeat(SUBAGENT_PARAMS_THRESHOLD_BYTES + 100) };
}

/**
 * A canonical `{"blob":"…"}` JSON string of EXACTLY `bytes` UTF-8 bytes, ASCII
 * padded. Since `canonicalizeParamsJson` is a not-implemented stub, the canonical
 * string is built directly the same `{ blob: "x".repeat(…) }` way `bigParams`
 * frames its payload, and the boundary is asserted through `chooseParamsChannel`.
 */
function canonicalStringOfBytes(bytes: number): string {
  const framing = '{"blob":""}';
  const pad = "x".repeat(bytes - Buffer.byteLength(framing, "utf8"));
  return `{"blob":"${pad}"}`;
}

// ---------------------------------------------------------------------------
// Canonical JSON + threshold channel cutover.
// ---------------------------------------------------------------------------

describe("PIC-60 — canonical JSON marshalling", () => {
  it("marshals param values as canonical JSON (stable key order, key-order-independent)", () => {
    const a = canonicalizeParamsJson({ topic: "sea", count: 3 });
    const b = canonicalizeParamsJson({ count: 3, topic: "sea" });
    // Canonical: the same params always produce the same bytes regardless of key
    // insertion order.
    expect(a).toBe(b);
    expect(JSON.parse(a)).toEqual({ topic: "sea", count: 3 });
  });
});

describe("PIC-60 — env / temp-file threshold cutover", () => {
  it("the pinned threshold is on the order of 8 KB (conservative under the tightest env-block cap)", () => {
    expect(SUBAGENT_PARAMS_THRESHOLD_BYTES).toBe(8 * 1024);
  });

  it("below the threshold → env-var channel carrying the canonical JSON", () => {
    const canonical = canonicalizeParamsJson({ topic: "sea" });
    const plan = chooseParamsChannel(canonical);
    expect(plan.kind).toBe("env");
    if (plan.kind === "env") {
      expect(plan.value).toBe(canonical);
    }
  });

  it("at/above the threshold → temp-file channel carrying the canonical JSON as contents", () => {
    const canonical = canonicalizeParamsJson(bigParams());
    const plan = chooseParamsChannel(canonical);
    expect(plan.kind).toBe("file");
    if (plan.kind === "file") {
      expect(plan.contents).toBe(canonical);
    }
  });

  it("EXACT boundary: a canonical payload of exactly the threshold in UTF-8 bytes → temp-file channel (at-or-above)", () => {
    const canonical = canonicalStringOfBytes(SUBAGENT_PARAMS_THRESHOLD_BYTES);
    // The payload measures EXACTLY the pinned threshold in UTF-8 bytes.
    expect(Buffer.byteLength(canonical, "utf8")).toBe(SUBAGENT_PARAMS_THRESHOLD_BYTES);
    const plan = chooseParamsChannel(canonical);
    // "At or above" rides the temp file: the threshold byte itself is on the file side.
    expect(plan.kind).toBe("file");
  });

  it("EXACT boundary: a canonical payload of exactly threshold-1 UTF-8 bytes → env channel (strictly below)", () => {
    const canonical = canonicalStringOfBytes(SUBAGENT_PARAMS_THRESHOLD_BYTES - 1);
    // One byte under the threshold.
    expect(Buffer.byteLength(canonical, "utf8")).toBe(SUBAGENT_PARAMS_THRESHOLD_BYTES - 1);
    const plan = chooseParamsChannel(canonical);
    // "Strictly below" rides the env var.
    expect(plan.kind).toBe("env");
  });

  it("below-threshold marshalParams sets PI_THETA_PARAMS and writes no temp file", () => {
    const fs = fakeMarshalFs();
    const marshalled = marshalParams({ topic: "sea" }, fs.deps);
    expect(marshalled.env[SUBAGENT_PARAMS_ENV]).toBe(canonicalizeParamsJson({ topic: "sea" }));
    expect(marshalled.env[SUBAGENT_PARAMS_FILE_ENV]).toBeUndefined();
    expect(fs.writes).toHaveLength(0);
    // The env-channel cleanup backstop is a no-op (nothing to delete).
    marshalled.cleanup();
    expect(fs.unlinks).toHaveLength(0);
  });

  it("at/above-threshold marshalParams writes a 0600 temp file and puts its path on PI_THETA_PARAMS_FILE", () => {
    const fs = fakeMarshalFs();
    const marshalled = marshalParams(bigParams(), fs.deps);
    expect(fs.writes).toHaveLength(1);
    // The temp file is written 0600 (owner read/write only).
    expect(fs.writes[0]!.mode).toBe(SUBAGENT_PARAMS_TEMP_FILE_MODE);
    expect(marshalled.env[SUBAGENT_PARAMS_FILE_ENV]).toBe(fs.writes[0]!.path);
    // The large payload does NOT also ride the env var (that would defeat the cutover).
    expect(marshalled.env[SUBAGENT_PARAMS_ENV]).toBeUndefined();
  });

  it("the parent-`finally` backstop deletes the temp file (PIC-60 / PIC-9 teardown)", () => {
    const fs = fakeMarshalFs();
    const marshalled = marshalParams(bigParams(), fs.deps);
    marshalled.cleanup();
    expect(fs.unlinks).toEqual([fs.writes[0]!.path]);
  });

  it("the pinned temp-file mode is 0600; on POSIX a real write is owner-only", () => {
    // The mode is 0600 by contract on every platform. The on-disk permission
    // assertion is POSIX-only — Windows does not honour the mode bits.
    expect(SUBAGENT_PARAMS_TEMP_FILE_MODE).toBe(0o600);
    if (process.platform === "win32") {
      return;
    }
    // POSIX only: a real fs write at the pinned mode is owner read/write only.
    const path = join(tmpdir(), `pi-theta-params-perm-${process.pid}.json`);
    const realFs: ParamsMarshalDeps = {
      writeTempFile: (contents, mode): string => {
        writeFileSync(path, contents, { mode });
        return path;
      },
      unlink: (p): void => {
        rmSync(p, { force: true });
      },
    };
    const marshalled = marshalParams(bigParams(), realFs);
    try {
      const stat = statSync(path);
      expect(stat.mode & 0o777).toBe(0o600);
    } finally {
      marshalled.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Child-side intake: read env / file (delete), validate, binder-bypass.
// ---------------------------------------------------------------------------

describe("PIC-60 — child-side intake", () => {
  it("reads the below-threshold params from PI_THETA_PARAMS (no file touched)", () => {
    const fs = fakeIntakeFs({});
    const parsed = readMarshalledParams(
      { [SUBAGENT_PARAMS_ENV]: canonicalizeParamsJson({ topic: "sea" }) },
      fs.deps,
    );
    expect(parsed).toEqual({ topic: "sea" });
    expect(fs.unlinks).toHaveLength(0);
  });

  it("reads the at/above-threshold params from the temp file AND deletes it after read", () => {
    const path = "/tmp/pi-theta-params-1.json";
    const fs = fakeIntakeFs({ [path]: canonicalizeParamsJson({ topic: "sea" }) });
    const parsed = readMarshalledParams({ [SUBAGENT_PARAMS_FILE_ENV]: path }, fs.deps);
    expect(parsed).toEqual({ topic: "sea" });
    // The child deletes the temp file on read (PIC-60).
    expect(fs.unlinks).toEqual([path]);
  });

  it("intake validates against the callee's `params:` schema and BYPASSES the binder on success", () => {
    const fs = fakeIntakeFs({});
    const intake = intakeChildParams(
      { [SUBAGENT_PARAMS_ENV]: canonicalizeParamsJson({ topic: "sea" }) },
      ALWAYS_VALID,
      fs.deps,
    );
    expect(intake.ok).toBe(true);
    if (intake.ok) {
      expect(intake.params).toEqual({ topic: "sea" });
      // PIC-60: the binder is skipped entirely on the marshalled path.
      expect(intake.binderBypassed).toBe(true);
    }
  });

  it("a schema-validation rejection refuses fail-closed with the pinned diagnostic + Err(invoke_infra validation)", () => {
    const fs = fakeIntakeFs({});
    const intake = intakeChildParams(
      { [SUBAGENT_PARAMS_ENV]: canonicalizeParamsJson({ topic: 5 }) },
      REJECTS_TOPIC,
      fs.deps,
    );
    expect(intake.ok).toBe(false);
    if (!intake.ok) {
      expect(intake.diagnostic.code).toBe(SUBAGENT_PARAMS_VALIDATION_FAILED_CODE);
      expect(intake.diagnostic.severity).toBe("error");
      // Surfaces to an `invoke` parent as Err(InvokeInfraError { cause: "validation" }).
      expect(intake.error.kind).toBe("invoke_infra");
      expect(intake.error.cause).toBe("validation");
    }
  });
});
