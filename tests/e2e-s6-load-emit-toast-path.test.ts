import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";

// S6 (PIC) — the `makeLoadEmit` toast+stderr diagnostic router on the H8a
// `discoverAndComposeFixtures` helper path.
//
// code-surface.md §5 flags a "load-phase routing gap": full `theta-system-note`
// routing for discovery diagnostics is deferred on the `makeLoadEmit` path
// (production-composition.ts:166-182 — the router holds no channel deps). It
// is CLOSED on the shipped default export's `composeExtensionInstance` path
// (proven by tests/load-phase-pre-eval-routing.test.ts). This test pins the
// ACTUAL behaviour of the OTHER path — `discoverAndComposeFixtures`, used by
// the H8a `discoverFixtures` wiring / hardening probe harness — so the gap is
// a documented, tested state rather than an unknown. The router is
// severity-routed (bug 0013): a load/parse ERROR surfaces via the transient
// `ctx.ui.notify(message,"error")` toast AND, in the no-UI (`-p` / CI / RPC)
// case, is mirrored to `process.stderr`; a load-phase WARNING is mirrored to
// that SAME no-UI stderr arm ONLY — never a toast (the `UiNotifier` surface
// is error-typed). Neither severity ever reaches the note channel or stdout
// on this path. The failing theta is dropped; siblings still compose. The
// warning arm's delivery contract is pinned in
// tests/load-warning-delivery.test.ts (B cells); here it appears as the
// tolerated settings-warning stderr lines in the clean-load cell.
//
// Spec: errors-and-results/error-model.md (pre-eval failure surfacing);
// REQ-PIC-11/87 surfacing surface; the FMC-1 / DISCLI-2 / IMPORTS-3 no-UI gap
// noted inline at production-composition.ts:188-199.

const GOOD_THETA = ["---", "mode: prompt", "tools: read", "---", "@`hi`", ""].join(
  "\n",
);
// `tools:` names a Pi tool absent from the threaded registry →
// `theta/load/unknown-tool` (error-severity ERR-6). The theta is dropped.
const BAD_THETA = [
  "---",
  "mode: prompt",
  "tools: totally_unknown_xyz",
  "---",
  "@`hi`",
  "",
].join("\n");

interface Recorder {
  readonly notifications: { message: string; type: string }[];
  readonly notes: unknown[];
}

function makePi(recorder: Recorder): ExtensionAPI {
  return {
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] => [],
    sendMessage: (message: unknown): void => {
      recorder.notes.push(message);
    },
    sendUserMessage: (): void => {},
    registerCommand: (): void => {},
    registerMessageRenderer: (): void => {},
    registerFlag: (): void => {},
    on: (): void => {},
  } as unknown as ExtensionAPI;
}

function makeCtx(cwd: string, hasUI: boolean, recorder: Recorder): ExtensionContext {
  return {
    cwd,
    hasUI,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, type: string): void => {
        recorder.notifications.push({ message, type });
      },
    },
  } as unknown as ExtensionContext;
}

describe("S6 — discoverAndComposeFixtures load diagnostics route to the ctx.ui.notify toast", () => {
  let workspace: string;
  let thetaDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "theta-s6-toast-"));
    thetaDir = join(workspace, ".pi", "theta");
    mkdirSync(thetaDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("surfaces a load failure on the transient toast and mirrors it to stderr in the no-UI case; the failing theta is dropped, siblings compose", async () => {
    writeFileSync(join(thetaDir, "goodtool.theta"), GOOD_THETA, "utf8");
    writeFileSync(join(thetaDir, "unknowntool.theta"), BAD_THETA, "utf8");

    const recorder: Recorder = { notifications: [], notes: [] };
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((): boolean => true);

    try {
      const thetas = await discoverAndComposeFixtures(
        makePi(recorder),
        makeCtx(workspace, /* hasUI */ false, recorder),
      );

      // Sibling composed; failing theta dropped.
      const names = thetas.map((l) => l.slashName);
      expect(names).toContain("goodtool");
      expect(names).not.toContain("unknowntool");

      // The load failure surfaced on the transient error toast (the retained
      // routing gap on this path — NOT the theta-system-note channel).
      const errorToasts = recorder.notifications.filter((n) => n.type === "error");
      expect(errorToasts.length).toBeGreaterThanOrEqual(1);
      expect(
        errorToasts.some((n) => /unknown Pi tool|totally_unknown_xyz/.test(n.message)),
      ).toBe(true);

      // No-UI (`-p`/CI/RPC) mirror to stderr so the failure is not silent.
      const stderrText = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
      expect(stderrText).toMatch(/theta\/load\/unknown-tool/);
      // stderr line is prefixed `theta: ` per production-composition.ts:201.
      expect(stderrText).toMatch(/^theta: /m);

      // This path does NOT route load diagnostics onto the note channel.
      const loadNotes = recorder.notes.filter(
        (n) => (n as { customType?: string }).customType === "theta-system-note",
      );
      expect(loadNotes).toHaveLength(0);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("does NOT mirror to stderr when a UI is present (hasUI:true) — toast only", async () => {
    writeFileSync(join(thetaDir, "unknowntool.theta"), BAD_THETA, "utf8");

    const recorder: Recorder = { notifications: [], notes: [] };
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((): boolean => true);

    try {
      await discoverAndComposeFixtures(
        makePi(recorder),
        makeCtx(workspace, /* hasUI */ true, recorder),
      );

      // Toast fired.
      expect(recorder.notifications.filter((n) => n.type === "error").length)
        .toBeGreaterThanOrEqual(1);
      // No stderr mirror carrying a theta load line when a UI is present.
      const stderrText = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
      expect(stderrText).not.toMatch(/theta\/load\/unknown-tool/);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("a clean load produces no error toast and no error stderr mirror", async () => {
    writeFileSync(join(thetaDir, "goodtool.theta"), GOOD_THETA, "utf8");

    const recorder: Recorder = { notifications: [], notes: [] };
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((): boolean => true);

    try {
      const thetas = await discoverAndComposeFixtures(
        makePi(recorder),
        makeCtx(workspace, /* hasUI */ false, recorder),
      );
      expect(thetas.map((l) => l.slashName)).toContain("goodtool");
      expect(recorder.notifications.filter((n) => n.type === "error")).toHaveLength(0);
      // The headless mirror carries WARNING lines too (bug 0013), and this
      // workspace is not warning-free: the settings source reads BOTH halves
      // through the real filesystem (no home-dir seam), so the planted
      // workspace's missing `.pi/settings.json` emits
      // `theta/load/settings-unreadable`, while the runner's REAL global
      // `~/.pi/agent/settings.json` is machine-dependent — missing (→
      // `settings-unreadable`) or present but malformed JSON (→
      // `theta/load/settings-invalid-json`); both are the settings-source W
      // rows of package-and-settings.md §Failure modes. The clean-load pin is
      // therefore: every theta line on stderr is a settings-source WARNING —
      // nothing error-severity, nothing about the planted theta.
      const stderrText = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
      const thetaLines = stderrText
        .split("\n")
        .filter((line) => line.includes("theta/"));
      for (const line of thetaLines) {
        expect(line).toMatch(/theta\/load\/settings-(unreadable|invalid-json)/);
      }
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
