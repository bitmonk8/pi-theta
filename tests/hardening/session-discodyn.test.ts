// Hardening probes — lens: DISCOVERY DYNAMICS (settings / package discovery /
// binderModel resolution). Load-time, mostly zero-token registration+diagnostic
// probes driven through the SHIPPED extension via `runProbe`.
//
// Run:
//   npx vitest run --config config/vitest/vitest.hardening.config.ts tests/hardening/session-discodyn.test.ts

import { describe, it, expect } from "vitest";
import { requireLiveProvider, runProbe } from "./probe-harness";

const NON_BYPASS_THETA = [
  "---",
  "mode: prompt",
  "params:",
  "  count: integer",
  "  topic: string",
  "---",
  "@`topic=${topic} count=${count} reply OK`",
].join("\n");

const BYPASS_THETA = ["---", "mode: prompt", "---", "@`Reply OK`"].join("\n");

describe("discovery-dynamics hardening", () => {
  const provider = requireLiveProvider();

  // ---- (1) binderModel resolution -----------------------------------------

  it("DISCO-A (FIXED): non-bypass theta, NO binderModel configured — binder-model-unresolved fires and the theta fails to load", async () => {
    const probe = await runProbe({
      provider,
      files: [{ source: "project", path: "needsbind.theta", text: NON_BYPASS_THETA }],
    });
    try {
      // DISCO-1 FIXED. binder-model resolution is now wired into the shipped
      // composition root: a non-bypass theta with no bind_model and no
      // theta.binderModel FAILS load with theta/load/binder-model-unresolved
      // (error). V4e: error-severity load diagnostics route onto the
      // `theta-system-note` channel (probe.systemNotes), NOT ctx.ui.notify
      // (probe.diagnostics), and the theta is NOT registered.
      //   Before (buggy): registeredNames contained "needsbind"; no diagnostic
      //     (binder-model resolution entirely unwired).
      //   After (fixed):  registeredNames excludes "needsbind"; a
      //     "binder model unresolved" error note is on the load systemNotes.
      expect(probe.registeredNames).not.toContain("needsbind");
      expect(
        probe.systemNotes.some((n) => n.includes("binder model unresolved")),
      ).toBe(true);
    } finally {
      await probe.dispose();
    }
  });

  it("DISCO-B (FIXED): non-bypass theta WITH theta.binderModel set — resolves and registers", async () => {
    const probe = await runProbe({
      provider,
      files: [{ source: "project", path: "hasbind.theta", text: NON_BYPASS_THETA }],
      projectSettings: { theta: { binderModel: (await provider.resolved).modelId } },
    });
    try {
      // DISCO-1 FIXED. With theta.binderModel set to a resolvable model, the
      // two-step chain (bind_model: → theta.binderModel) resolves over the
      // shared model matcher and the theta registers (the strict-capability
      // probe is the universal-W branch under the Pi-SDK pin — a warning,
      // suppressed by the error-only route, and the theta still registers).
      expect(probe.registeredNames).toContain("hasbind");
      expect(
        probe.diagnostics.some((d) => d.message.includes("binder model unresolved")),
      ).toBe(false);
    } finally {
      await probe.dispose();
    }
  });

  it("DISCO-A2 (FIXED): non-bypass thetas with UNRESOLVABLE binder model (settings + bind_model) — fail load", async () => {
    const viaSettings = NON_BYPASS_THETA; // relies on theta.binderModel
    const viaFrontmatter = [
      "---",
      "mode: prompt",
      "bind_model: no-such-model-xyz-does-not-exist",
      "params:",
      "  count: integer",
      "  topic: string",
      "---",
      "@`topic=${topic} count=${count}`",
    ].join("\n");
    const probe = await runProbe({
      provider,
      files: [
        { source: "project", path: "viasettings.theta", text: viaSettings },
        { source: "project", path: "viafm.theta", text: viaFrontmatter },
      ],
      projectSettings: { theta: { binderModel: "no-such-model-xyz-does-not-exist" } },
    });
    try {
      // DISCO-1 FIXED. A bind_model / theta.binderModel reference matching no
      // available model resolves to no model, so both thetas FAIL load with
      // theta/load/binder-model-unresolved and neither registers. V4e: those
      // error notes land on the `theta-system-note` channel (probe.systemNotes).
      //   Before (buggy): both registered; no diagnostics.
      //   After (fixed):  neither registers; a binder-model-unresolved error
      //     note is present for each on the load systemNotes.
      expect(probe.registeredNames).not.toContain("viafm");
      expect(probe.registeredNames).not.toContain("viasettings");
      expect(
        probe.systemNotes.filter((n) => n.includes("binder model unresolved"))
          .length,
      ).toBeGreaterThanOrEqual(2);
    } finally {
      await probe.dispose();
    }
  });

  // ---- (5) package discovery: manifest / fallback / escape ----------------

  it("DISCO-C/D/E/F: pi.theta manifest, non-string[], escape, theta/ fallback", async () => {
    const probe = await runProbe({
      provider,
      files: [
        // C: valid pi.theta string[] registering a theta
        {
          source: "rel",
          path: "node_modules/pkgfoo/package.json",
          text: JSON.stringify({ name: "pkgfoo", pi: { theta: ["mypkgtheta.theta"] } }),
        },
        { source: "rel", path: "node_modules/pkgfoo/mypkgtheta.theta", text: BYPASS_THETA },
        // D: non-string[] pi.theta → manifest-invalid (error)
        {
          source: "rel",
          path: "node_modules/pkgbad/package.json",
          text: JSON.stringify({ name: "pkgbad", pi: { theta: "not-an-array" } }),
        },
        // E: entry escaping package root → manifest-escapes-package (warning)
        {
          source: "rel",
          path: "node_modules/pkgesc/package.json",
          text: JSON.stringify({ name: "pkgesc", pi: { theta: ["../sneaky.theta"] } }),
        },
        { source: "rel", path: "node_modules/sneaky.theta", text: BYPASS_THETA },
        // F: no pi.theta → conventional theta/ fallback
        {
          source: "rel",
          path: "node_modules/pkgbar/package.json",
          text: JSON.stringify({ name: "pkgbar" }),
        },
        { source: "rel", path: "node_modules/pkgbar/theta/bartheta.theta", text: BYPASS_THETA },
      ],
    });
    try {
      // Verified-conformant: pi.theta manifest (C) + theta/ fallback (F) register;
      // escape entry (E) blocked; non-string[] (D) → manifest-invalid error.
      expect(probe.registeredNames).toEqual(
        expect.arrayContaining(["mypkgtheta", "bartheta"]),
      );
      expect(probe.registeredNames).not.toContain("sneaky");
      // V4e: the manifest-invalid (D) error note routes onto the
      // `theta-system-note` channel (probe.systemNotes), not ctx.ui.notify. The
      // escape entry (E) is a warning and surfaces on neither channel.
      expect(
        probe.systemNotes.some((n) => n.includes("invalid 'pi.theta'")),
      ).toBe(true);
    } finally {
      await probe.dispose();
    }
  });

  it("DISCO-G: scanPackages:false disables the package walk", async () => {
    const probe = await runProbe({
      provider,
      files: [
        {
          source: "rel",
          path: "node_modules/pkgfoo/package.json",
          text: JSON.stringify({ name: "pkgfoo", pi: { theta: ["mypkgtheta.theta"] } }),
        },
        { source: "rel", path: "node_modules/pkgfoo/mypkgtheta.theta", text: BYPASS_THETA },
      ],
      projectSettings: { theta: { scanPackages: false } },
    });
    try {
      // Verified-conformant: scanPackages:false disables the whole walk.
      expect(probe.registeredNames).not.toContain("mypkgtheta");
    } finally {
      await probe.dispose();
    }
  });

  // ---- (2) thetaPaths settings entry ---------------------------------------

  it("DISCO-H: thetaPaths dir entry registers; missing path; non-.theta file", async () => {
    const probe = await runProbe({
      provider,
      files: [
        // a real dir (relative to .pi/) containing a .theta
        { source: "rel", path: ".pi/extrathetas/extra.theta", text: BYPASS_THETA },
        // a non-.theta file targeted directly by thetaPaths
        { source: "rel", path: ".pi/notes.txt", text: "not a theta" },
      ],
      projectSettings: {
        thetaPaths: ["extrathetas", "notes.txt", "does-not-exist-xyz"],
      },
    });
    try {
      // Verified-conformant: dir entry registers; non-.theta → invalid-extension;
      // missing path → missing-source error (confirms the fixed DISC-1). V4e:
      // both error notes route onto the `theta-system-note` channel
      // (probe.systemNotes), not ctx.ui.notify.
      expect(probe.registeredNames).toContain("extra");
      expect(
        probe.systemNotes.some((n) => n.includes("does not end in .theta")),
      ).toBe(true);
      expect(
        probe.systemNotes.some((n) => n.includes("does not exist")),
      ).toBe(true);
    } finally {
      await probe.dispose();
    }
  });

  // ---- (4)+(6) settings out-of-range / invalid JSON -----------------------

  it("DISCO-I: scanPackages* out-of-range + null values", async () => {
    const probe = await runProbe({
      provider,
      files: [{ source: "project", path: "plain.theta", text: BYPASS_THETA }],
      projectSettings: {
        theta: {
          scanPackagesTimeoutMs: -5,
          scanPackagesMaxFiles: null,
          scanPackages: "true",
        },
      },
    });
    try {
      // Verified-conformant: string/null/negative scalar values → out-of-range
      // error (per key, non-fatal); the plain theta still registers. V4e: the
      // three per-key out-of-range error notes route onto the
      // `theta-system-note` channel (probe.systemNotes), not ctx.ui.notify
      // (count verified live = 3: scanPackages, scanPackagesMaxFiles,
      // scanPackagesTimeoutMs).
      expect(probe.registeredNames).toContain("plain");
      expect(
        probe.systemNotes.filter((n) => n.includes("out of range")).length,
      ).toBe(3);
    } finally {
      await probe.dispose();
    }
  });

  it("DISCO-J: invalid-JSON settings file treated as {} (project theta still registers)", async () => {
    const probe = await runProbe({
      provider,
      files: [
        { source: "project", path: "plain.theta", text: BYPASS_THETA },
        { source: "rel", path: ".pi/settings.json", text: "{ this is : not json" },
      ],
    });
    try {
      // Verified-conformant: invalid-JSON settings treated as {}, no crash; the
      // project theta still registers. (invalid-json is a warning, suppressed by
      // the error-only ctx.ui.notify route — the known routing gap.)
      expect(probe.registeredNames).toContain("plain");
    } finally {
      await probe.dispose();
    }
  });
});
