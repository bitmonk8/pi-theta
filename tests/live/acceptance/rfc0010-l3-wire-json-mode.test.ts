// RFC 0010 (Phase 7d, H9a, live, L3) — the child-regime `theta_progress` wire,
// L3-B33 (PRESENT) / L3-B34 (ABSENT). Contract: `execute()`'s child-regime
// branch (EXST-15), the reserved-key wire line (PIC-74).
//
// UNLIKE `tests/live/rfc0010-l3-progress-wire-child-live-cell.test.ts` (whose
// header explains why an OUTER `pi -p` cannot observe a grandchild's wire
// line through its own stdout — the wire never crosses a SECOND process
// boundary), this cell does not spawn a parent that invokes a subagent child
// at all. It marks the SPAWNED `pi -p` PROCESS ITSELF as the subagent child:
// `PI_THETA_SUBAGENT_ROOT=<slug>` plus the authenticated
// `PI_THETA_SUBAGENT_PARENT_PID=<this test process's own pid>` (the real
// `ppid` of the spawned process, since `node:child_process` makes it a direct
// child of this harness) is exactly the two-variable carriage
// `buildSubagentChildEnv`/`assembleSubagentArgv` place on a REAL subagent
// child (`subagent-launcher.ts:450/486-500`) — the same mechanism, driven by
// hand instead of by `launchSubagentChild`. With the marker authenticated,
// `factory.ts`'s default export computes `isSubagentChild = true`
// (`factory.ts:1362`), so `theta_progress` executes its CHILD-regime arm
// (EXST-15): the wire line is `writeSync(1, …)`'d directly to fd 1 — which
// `node:child_process.spawn` captures as THIS process's own `child.stdout`
// pipe. No relay, no grandchild, no second boundary: the spawned process's
// captured stdout genuinely IS the wire surface (`v1`/`invocation_id`/`seq`/
// `event` schema-valid lines), which is what makes this an H9a cell rather
// than a second copy of the H8a parent-tap cell.
//
// The theta itself is `mode: subagent` (PIC-58's mode-regress guard requires
// the marked slug to match the invoked theta's own stem so the child drives
// it `in-process-root`, i.e. exactly the shape a real launched child drives),
// but the invocation never spawns a NESTED child — `theta_progress` is a
// factory-registered extension tool, not a `.theta` callable, so no
// RFC-0006 launch happens inside this process at all, and the
// #subagent-child-pins convention's per-launch obligations do not apply here
// (there is no nested launch to pin). The `-ne -e <extensions>` pin on the
// OUTER spawn is still applied (mirrors `spawnPiPrint`), so the extension
// under test is the one this working tree ships, not an ambient discovery
// hit.
//
// PRESENT (L3-B33): the theta calls `theta_progress` twice, separated by one
// real model turn (a task-framed fixed-pair-arithmetic query — never a
// verbatim-echo demand, AGENTS.md) — a real-wall-clock gap well over the
// 200ms EXST-14 acceptance interval, so no theta-language sleep primitive is
// needed and both calls are expected to be accepted (asserted at ≥1 to stay
// robust to any incidental scheduling skew). Assert: ≥1 captured stdout line
// parses as `{"theta_progress":{v:1,invocation_id,seq,event:{message}}}`
// with the pinned envelope fields, the message content is the exact clamped
// call argument, and the drive's own arithmetic answer is still correct
// (proving the wire calls did not derail the turn).
//
// ABSENT (L3-B34, settings-off direction): the IDENTICAL theta and the
// IDENTICAL regime marker — only `theta.progress: off` in the spawned
// process's OWN `.pi/settings.json` differs (the `<cwd>/.pi/settings.json`
// project-settings source, `discovery/settings.ts`'s resolved location).
// Assert: ZERO `theta_progress` lines anywhere in stdout, and the drive is
// still Ok (the off-gate silences the wire without touching the theta's own
// control flow) — isolating the settings ceiling as the cause, not the call
// count (both arms call `theta_progress` twice).
//
// Budget: one small live model turn per arm (the fixed-pair-arithmetic
// query), well inside the ≤2-turns-per-arm budget this cell targets.
//
// RED-DIRECTION PROOF (verified this pass, then restored): temporarily
// scanned `extractWireLines` for the wrong envelope key
// (`"theta_progress_WRONGKEY"` instead of `"theta_progress"`). Re-ran both
// arms: PRESENT reds on `expected 0 to be greater than or equal to 1` (the
// real wire lines are on stdout — verbatim, e.g.
// `{"theta_progress":{"v":1,"invocation_id":"83daca51-...","seq":2,"event":
// {"message":"json-mode wire tick two"}}}` — the scan just stopped finding
// them under the wrong key); ABSENT stayed green (it asserts an absence, so a
// broken positive-scan cannot falsely red it). Restored, both arms green
// again. This proves the PRESENT assertion is live, not vacuous.

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXTENSION_ENTRY,
  PI_CLI_ENTRY,
  failLoudly,
  resolveAcceptanceHost,
} from "./harness";
import {
  SUBAGENT_EXTENSION_PIN_ENV,
  SUBAGENT_PARENT_PID_ENV,
} from "../../../src/runtime/subagent-launcher";
import { SUBAGENT_ROOT_ENV_MARKER } from "../../../src/runtime/subagent-root-regime";

interface WireProbeResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Spawn the real `pi` binary marked as its OWN subagent-root regime (see the
 * file header): `-p "/<slug>"` against a scratch project workspace whose
 * `.pi/theta/<slug>.theta` IS the marked theta, with the two authenticated
 * control-plane env vars set on the child process itself. Mirrors
 * `./harness.ts`'s `spawnPiPrint` argv/env shape (extension pin, provider/model,
 * closed stdin) with the regime marker added and no `--theta` flag (project
 * discovery finds the workspace's own `.pi/theta/` root).
 */
async function spawnWireProbe(options: {
  readonly cwd: string;
  readonly slug: string;
}): Promise<WireProbeResult> {
  const host = await resolveAcceptanceHost();
  const args = [
    PI_CLI_ENTRY,
    "-ne",
    "-e",
    EXTENSION_ENTRY,
    "--mode",
    "json",
    "-p",
    `/${options.slug}`,
    "--no-session",
    "--provider",
    host.provider,
    "--model",
    host.model,
  ];
  return new Promise<WireProbeResult>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        [SUBAGENT_EXTENSION_PIN_ENV]: EXTENSION_ENTRY,
        [SUBAGENT_PARENT_PID_ENV]: String(process.pid),
        // The regime marker: this spawned process treats ITSELF as the
        // subagent child (see file header) — no launcher, no grandchild.
        [SUBAGENT_ROOT_ENV_MARKER]: options.slug,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}

/** One parsed `theta_progress` wire line's envelope, narrowed to the fields
 *  this cell scores (PIC-74's pinned shape). */
interface ParsedWireLine {
  readonly v: unknown;
  readonly invocation_id: unknown;
  readonly seq: unknown;
  readonly event: { readonly message?: unknown } | undefined;
}

/** Scan a captured stdout blob line-by-line for schema-valid `theta_progress`
 *  wire envelopes (PIC-74). A line that fails to parse as JSON, or parses but
 *  carries no `theta_progress` key, is not a wire line — ordinary `--mode
 *  json` traffic interleaves on the same stream. */
function extractWireLines(stdout: string): readonly ParsedWireLine[] {
  const found: ParsedWireLine[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) continue;
    const envelope = (parsed as Record<string, unknown>)["theta_progress"];
    if (typeof envelope !== "object" || envelope === null) continue;
    found.push(envelope as unknown as ParsedWireLine);
  }
  return found;
}

const SLUG_PRESENT = "l3jsonwirepresent";
const THETA_PRESENT = [
  "---",
  "mode: subagent",
  "tools:",
  "  - theta_progress",
  "---",
  'let _ = theta_progress({message: "json-mode wire tick one"})?',
  "@`What is 148 plus 209? Answer with the number only.`?",
  'let _ = theta_progress({message: "json-mode wire tick two"})?',
  "",
].join("\n");

const SLUG_ABSENT = "l3jsonwireabsent";
// Identical topology and identical theta_progress call count to the PRESENT
// arm — isolating the settings off-gate as the cause of silence, not a
// reduced call count.
const THETA_ABSENT = THETA_PRESENT;

function plantWorkspace(slug: string, thetaText: string, settingsJson: string): {
  readonly cwd: string;
  dispose(): void;
} {
  const cwd = mkdtempSync(join(tmpdir(), `theta-l3-json-wire-${slug}-`));
  const thetaDir = join(cwd, ".pi", "theta");
  mkdirSync(thetaDir, { recursive: true });
  writeFileSync(join(thetaDir, `${slug}.theta`), thetaText, "utf8");
  writeFileSync(join(cwd, ".pi", "settings.json"), settingsJson, "utf8");
  return {
    cwd,
    dispose(): void {
      rmSync(cwd, { recursive: true, force: true });
    },
  };
}

describe("RFC 0010 (H9a, live, L3) — theta_progress child-regime wire on the spawned process's own captured stdout", () => {
  it("PRESENT: schema-valid theta_progress wire lines land on captured stdout, drive Ok, arithmetic answer correct", async () => {
    const workspace = plantWorkspace(SLUG_PRESENT, THETA_PRESENT, "{}");
    try {
      const result = await spawnWireProbe({ cwd: workspace.cwd, slug: SLUG_PRESENT });

      if (result.exitCode !== 0) {
        failLoudly(
          `PRESENT wire probe exited ${result.exitCode}. stdout: ${result.stdout} ` +
            `stderr: ${result.stderr}`,
        );
      }

      const wireLines = extractWireLines(result.stdout);
      expect(
        wireLines.length,
        "expected at least one theta_progress wire line on stdout. stdout: " +
          result.stdout,
      ).toBeGreaterThanOrEqual(1);

      for (const line of wireLines) {
        expect(line.v).toBe(1);
        expect(typeof line.invocation_id).toBe("string");
        expect(typeof line.seq).toBe("number");
        expect(typeof line.event?.message).toBe("string");
      }
      const messages = wireLines.map((l) => l.event?.message);
      expect(
        messages.some((m) => m === "json-mode wire tick one" || m === "json-mode wire tick two"),
        "no wire line carried either expected clamped message. Messages: " +
          JSON.stringify(messages),
      ).toBe(true);

      expect(
        result.stdout.includes("357"),
        `expected the arithmetic answer 357 somewhere in stdout; got: ${result.stdout}`,
      ).toBe(true);
    } finally {
      workspace.dispose();
    }
  }, 90_000);

  it("ABSENT: theta.progress: off silences the wire entirely — zero lines on stdout, drive Ok", async () => {
    const workspace = plantWorkspace(
      SLUG_ABSENT,
      THETA_ABSENT,
      JSON.stringify({ theta: { progress: "off" } }),
    );
    try {
      const result = await spawnWireProbe({ cwd: workspace.cwd, slug: SLUG_ABSENT });

      if (result.exitCode !== 0) {
        failLoudly(
          `ABSENT wire probe exited ${result.exitCode}. stdout: ${result.stdout} ` +
            `stderr: ${result.stderr}`,
        );
      }

      const wireLines = extractWireLines(result.stdout);
      expect(
        wireLines.length,
        "expected zero theta_progress wire lines under theta.progress: off. stdout: " +
          result.stdout,
      ).toBe(0);

      expect(
        result.stdout.includes("357"),
        `expected the arithmetic answer 357 somewhere in stdout; got: ${result.stdout}`,
      ).toBe(true);
    } finally {
      workspace.dispose();
    }
  }, 90_000);
});
