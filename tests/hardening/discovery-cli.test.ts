import { describe, it, expect } from "vitest";
import { requireLiveProvider, runProbe, type PlantedFile } from "./probe-harness";

// Hardening probes — DISCOVERY / CLI / SLASH-NAME VALIDITY / COLLISIONS /
// SETTINGS. Mostly zero-token: outcomes read off `registeredNames` and the
// error-severity load diagnostics the load phase routes onto the
// `theta-system-note` channel (`probe.systemNotes`).
//
// NOTE ON OBSERVABILITY (V4e + bug 0013): the shipped composition root routes
// ALL load/parse/settings/binder-model diagnostics onto the
// `theta-system-note` channel — errors per-diagnostic via `emitLoadNote`'s
// pre-eval routing, WARNINGS (case-collision, cross-source-shadow,
// non-canonical-extension, settings-unreadable/invalid-json, unreadable) as
// per-group batch notes — so BOTH severities land on `probe.systemNotes`,
// never `probe.diagnostics` (ctx.ui.notify), which stays empty at load time
// (see the probe-harness header). `systemNotes` entries are therefore MIXED
// severity: probes MUST discriminate by message content (each rendered
// `<[file:line:col:] >code: message`), never by assuming every entry is an
// error. A workspace whose machine lacks a global `~/.pi/agent/settings.json`
// additionally carries one `settings-unreadable` warning note (the missing-file
// failure mode), so exact whole-array equality over `systemNotes` is unsound.
//
// Findings written to tests/hardening/findings/discovery-cli.md.

const provider = requireLiveProvider();
const FM = "---\nmode: prompt\nbind_model: claude-opus-4-8\n---\n@`say ok`\n";

function theta(source: PlantedFile["source"], path: string): PlantedFile {
  return { source, path, text: FM };
}

function msgs(probe: { systemNotes: readonly string[] }): string[] {
  return [...probe.systemNotes];
}

// ===========================================================================
// BASELINE — the discovery surface that behaves correctly (guards against
// regressions and frames the two bugs below).
// ===========================================================================

describe("discovery — correct behaviour (baseline guards)", () => {
  it("rejects the six invalid slash-name stems; the valid sibling registers", async () => {
    const probe = await runProbe({
      provider,
      files: [
        theta("project", "Foo.theta"),
        theta("project", "foo bar.theta"),
        theta("project", "foo!.theta"),
        theta("project", ".foo.theta"),
        theta("project", "--help.theta"),
        theta("project", "café.theta"),
        theta("project", "valid.theta"),
      ],
    });
    try {
      expect(probe.registeredNames).toEqual(["valid"]);
      const invalid = probe.systemNotes.filter((n) =>
        n.includes("slash names must be lowercase"),
      );
      expect(invalid).toHaveLength(6);
    } finally {
      await probe.dispose();
    }
  });

  it("non-recursive; .thetalib never a slash command; digit/underscore/hyphen stems ok", async () => {
    const probe = await runProbe({
      provider,
      files: [
        theta("project", "a.theta"),
        theta("project", "0.theta"),
        theta("project", "a-b_c9.theta"),
        theta("project", "personas.thetalib"),
        theta("project", "sub/nested.theta"),
      ],
    });
    try {
      expect(probe.registeredNames.sort()).toEqual(["0", "a", "a-b_c9"]);
    } finally {
      await probe.dispose();
    }
  });

  it("uppercase extension (Plan.THETA) does not register", async () => {
    const probe = await runProbe({
      provider,
      files: [theta("project", "Plan.THETA"), theta("project", "ok.theta")],
    });
    try {
      expect(probe.registeredNames).toEqual(["ok"]);
    } finally {
      await probe.dispose();
    }
  });

  it("CLI source outranks project for the same slash name (single registration)", async () => {
    const probe = await runProbe({
      provider,
      files: [theta("cli", "dup.theta"), theta("project", "dup.theta")],
    });
    try {
      expect(probe.registeredNames).toEqual(["dup"]);
    } finally {
      await probe.dispose();
    }
  });

  it("same-priority theta-vs-theta collision drops both (cross-format-collision error)", async () => {
    const probe = await runProbe({
      provider,
      files: [
        { source: "rel", path: ".pi/a/dup.theta", text: FM },
        { source: "rel", path: ".pi/b/dup.theta", text: FM },
      ],
      projectSettings: { thetaPaths: ["a", "b"] },
    });
    try {
      expect(probe.registeredNames).toEqual([]);
      const collision = probe.systemNotes.filter((n) =>
        n.includes("collides at the same priority"),
      );
      expect(collision).toHaveLength(1);
      expect(collision[0]!).toContain("a/dup.theta");
      expect(collision[0]!).toContain("b/dup.theta");
    } finally {
      await probe.dispose();
    }
  });

  it("settings thetaPaths: non-.theta file entry -> invalid-extension error", async () => {
    const probe = await runProbe({
      provider,
      files: [{ source: "rel", path: ".pi/extra/notes.md", text: "x" }],
      projectSettings: { thetaPaths: ["extra/notes.md"] },
    });
    try {
      expect(probe.registeredNames).toEqual([]);
      // Content-filtered (not whole-array equality): warning-severity notes
      // ride the same channel since bug 0013.
      const wrongType = probe.systemNotes.filter((n) =>
        n.includes("does not end in .theta"),
      );
      expect(wrongType, `expected one invalid-extension error; got ${JSON.stringify(msgs(probe))}`).toHaveLength(1);
    } finally {
      await probe.dispose();
    }
  });

  it("settings: malformed top-level shapes and scalar ranges are error diagnostics", async () => {
    const cases: { settings: unknown; needle: string }[] = [
      { settings: { thetaPaths: "x" }, needle: "settings key thetaPaths value is out of range" },
      { settings: { thetaPaths: null, theta: null }, needle: "value is out of range; got null" },
      { settings: [1, 2, 3], needle: "settings key (root) value is out of range; got array" },
      { settings: { theta: { scanPackagesMaxFiles: 0 } }, needle: "scanPackagesMaxFiles value is out of range" },
      { settings: { theta: { scanPackagesMaxFiles: 25.5 } }, needle: "scanPackagesMaxFiles value is out of range" },
      { settings: { theta: { binderModel: "" } }, needle: "binderModel value is out of range" },
    ];
    for (const c of cases) {
      const probe = await runProbe({ provider, files: [], projectSettings: c.settings });
      try {
        expect(
          probe.systemNotes.some((n) => n.includes(c.needle)),
          `${JSON.stringify(c.settings)} -> ${c.needle}\nGOT ${JSON.stringify(msgs(probe))}`,
        ).toBe(true);
      } finally {
        await probe.dispose();
      }
    }
  });

  it("settings thetaPaths: non-string entries -> settings-invalid-entry (per entry)", async () => {
    const probe = await runProbe({
      provider,
      files: [theta("project", "p.theta")],
      projectSettings: { thetaPaths: [123, true, null, "extra"] },
    });
    try {
      const invalid = probe.systemNotes.filter((n) => n.includes("must be a string path"));
      expect(invalid).toHaveLength(3);
    } finally {
      await probe.dispose();
    }
  });
});

// ===========================================================================
// DISC-1 (bug): a MISSING settings thetaPaths path emits NO diagnostic — the
// DISC-2-mandated `theta/load/missing-source` (error) never fires on Windows.
// ===========================================================================

describe("DISC-1 — missing explicit settings path emits theta/load/missing-source (error)", () => {
  it("absolute path with a genuinely-missing intermediate ancestor is unreadable (warning note), not a clean-leaf missing", async () => {
    const probe = await runProbe({
      provider,
      files: [theta("project", "p.theta")],
      projectSettings: { thetaPaths: ["/definitely/missing/xyz123/theta"] },
    });
    try {
      // Registration proceeds. `/definitely` itself does not exist, so this is
      // NOT an "otherwise-clean leaf": per DISC-2 the ancestor walk hits an
      // ENOENT ancestor and classifies the path as `unreadable-source`
      // (warning) — delivered as a warning note on the channel since bug 0013.
      // This is spec-correct — the DISC-1 bug is the clean-leaf case below.
      expect(probe.registeredNames).toEqual(["p"]);
      const unreadable = probe.systemNotes.filter((n) =>
        n.includes("discovery source is unreadable"),
      );
      expect(
        unreadable.length,
        `a missing intermediate ancestor is one unreadable-source warning; got ${JSON.stringify(msgs(probe))}`,
      ).toBe(1);
      const missing = probe.systemNotes.filter((n) => n.includes("does not exist"));
      expect(
        missing.length,
        `NOT a missing-source error — the leaf is not clean; got ${JSON.stringify(msgs(probe))}`,
      ).toBe(0);
    } finally {
      await probe.dispose();
    }
  });

  it("FIXED: relative missing thetaPaths entry on a clean leaf (parent .pi exists) emits one missing-source error", async () => {
    const probe = await runProbe({
      provider,
      files: [theta("project", "p.theta")],
      projectSettings: { thetaPaths: ["nope-does-not-exist"] },
    });
    try {
      // The unrelated project theta still registers; the missing settings entry
      // is a clean leaf (every ancestor — including the drive root on Windows —
      // exists), so DISC-2 mandates one `theta/load/missing-source` ERROR.
      expect(probe.registeredNames).toEqual(["p"]);
      const missing = probe.systemNotes.filter(
        (n) => n.includes("does not exist"),
      );
      expect(
        missing.length,
        `expected one missing-source error; got ${JSON.stringify(msgs(probe))}`,
      ).toBe(1);
    } finally {
      await probe.dispose();
    }
  });
});

// ===========================================================================
// DISC-2 (bug): SLSH-1 no-params overflow note is never emitted by the shipped
// dispatch (dispatchNoParamsTheta/renderNoParamsOverflowNote are dead code — the
// production runBinder no-params bypass emits no note). Extra slash arguments
// to a no-params theta are silently swallowed. Needs one drive.
// ===========================================================================

describe("DISC-2 — SLSH-1 no-params overflow note is never emitted", () => {
  it("FIXED: a no-params theta with trailing arguments emits one overflow note before running", async () => {
    const probe = await runProbe({
      provider,
      files: [
        {
          source: "project",
          path: "greet.theta",
          text: [
            "---",
            "mode: prompt",
            "bind_model: claude-opus-4-8",
            "---",
            "@`Reply with exactly the single word: READY`",
          ].join("\n"),
        },
      ],
      drives: ["/greet these are extra arguments the theta takes no params"],
    });
    try {
      expect(probe.registeredNames).toEqual(["greet"]);
      const turn = probe.turns[0]!;
      // The no-params bypass path ran the body (deterministic user-turn text).
      const allUser = turn.userTexts.join("\n");
      expect(allUser).toContain("Reply with exactly the single word: READY");
      expect(turn.error, `unexpected throw: ${turn.error}`).toBeUndefined();
      // FIXED (SLSH-1): exactly one overflow note is emitted on the
      // `theta-system-note` channel before the body runs.
      const notes = turn.systemNotes.filter((n) => n.includes("ignoring extra arguments"));
      expect(notes).toHaveLength(1);
      expect(notes[0]).toBe(
        "theta /greet: ignoring extra arguments \u2014 this theta takes no parameters",
      );
    } finally {
      await probe.dispose();
    }
  });
});
