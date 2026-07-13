// Hardening probes — lens: DISCOVERY DYNAMICS (settings / package discovery /
// binderModel resolution). Load-time, mostly zero-token registration+diagnostic
// probes driven through the SHIPPED extension via `runProbe`.
//
// Run:
//   npx vitest run --config vitest.hardening.config.ts tests/hardening/session-discodyn.test.ts

import { describe, it, expect } from "vitest";
import { requireLiveProvider, runProbe } from "./probe-harness";

const NON_BYPASS_LOOM = [
  "---",
  "mode: prompt",
  "params:",
  "  count: integer",
  "  topic: string",
  "---",
  "@`topic=${topic} count=${count} reply OK`",
].join("\n");

const BYPASS_LOOM = ["---", "mode: prompt", "---", "@`Reply OK`"].join("\n");

describe("discovery-dynamics hardening", () => {
  const provider = requireLiveProvider();

  // ---- (1) binderModel resolution -----------------------------------------

  it("DISCO-A (FIXED): non-bypass loom, NO binderModel configured — binder-model-unresolved fires and the loom fails to load", async () => {
    const probe = await runProbe({
      provider,
      files: [{ source: "project", path: "needsbind.loom", text: NON_BYPASS_LOOM }],
    });
    try {
      // DISCO-1 FIXED. binder-model resolution is now wired into the shipped
      // composition root: a non-bypass loom with no bind_model and no
      // looms.binderModel FAILS load with loom/load/binder-model-unresolved
      // (error). V4e: error-severity load diagnostics route onto the
      // `loom-system-note` channel (probe.systemNotes), NOT ctx.ui.notify
      // (probe.diagnostics), and the loom is NOT registered.
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

  it("DISCO-B (FIXED): non-bypass loom WITH looms.binderModel set — resolves and registers", async () => {
    const probe = await runProbe({
      provider,
      files: [{ source: "project", path: "hasbind.loom", text: NON_BYPASS_LOOM }],
      projectSettings: { looms: { binderModel: provider.modelId } },
    });
    try {
      // DISCO-1 FIXED. With looms.binderModel set to a resolvable model, the
      // two-step chain (bind_model: → looms.binderModel) resolves over the
      // shared model matcher and the loom registers (the strict-capability
      // probe is the universal-W branch under the Pi-SDK pin — a warning,
      // suppressed by the error-only route, and the loom still registers).
      expect(probe.registeredNames).toContain("hasbind");
      expect(
        probe.diagnostics.some((d) => d.message.includes("binder model unresolved")),
      ).toBe(false);
    } finally {
      await probe.dispose();
    }
  });

  it("DISCO-A2 (FIXED): non-bypass looms with UNRESOLVABLE binder model (settings + bind_model) — fail load", async () => {
    const viaSettings = NON_BYPASS_LOOM; // relies on looms.binderModel
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
        { source: "project", path: "viasettings.loom", text: viaSettings },
        { source: "project", path: "viafm.loom", text: viaFrontmatter },
      ],
      projectSettings: { looms: { binderModel: "no-such-model-xyz-does-not-exist" } },
    });
    try {
      // DISCO-1 FIXED. A bind_model / looms.binderModel reference matching no
      // available model resolves to no model, so both looms FAIL load with
      // loom/load/binder-model-unresolved and neither registers. V4e: those
      // error notes land on the `loom-system-note` channel (probe.systemNotes).
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

  it("DISCO-C/D/E/F: pi.looms manifest, non-string[], escape, looms/ fallback", async () => {
    const probe = await runProbe({
      provider,
      files: [
        // C: valid pi.looms string[] registering a loom
        {
          source: "rel",
          path: "node_modules/pkgfoo/package.json",
          text: JSON.stringify({ name: "pkgfoo", pi: { looms: ["mypkgloom.loom"] } }),
        },
        { source: "rel", path: "node_modules/pkgfoo/mypkgloom.loom", text: BYPASS_LOOM },
        // D: non-string[] pi.looms → manifest-invalid (error)
        {
          source: "rel",
          path: "node_modules/pkgbad/package.json",
          text: JSON.stringify({ name: "pkgbad", pi: { looms: "not-an-array" } }),
        },
        // E: entry escaping package root → manifest-escapes-package (warning)
        {
          source: "rel",
          path: "node_modules/pkgesc/package.json",
          text: JSON.stringify({ name: "pkgesc", pi: { looms: ["../sneaky.loom"] } }),
        },
        { source: "rel", path: "node_modules/sneaky.loom", text: BYPASS_LOOM },
        // F: no pi.looms → conventional looms/ fallback
        {
          source: "rel",
          path: "node_modules/pkgbar/package.json",
          text: JSON.stringify({ name: "pkgbar" }),
        },
        { source: "rel", path: "node_modules/pkgbar/looms/barloom.loom", text: BYPASS_LOOM },
      ],
    });
    try {
      // Verified-conformant: pi.looms manifest (C) + looms/ fallback (F) register;
      // escape entry (E) blocked; non-string[] (D) → manifest-invalid error.
      expect(probe.registeredNames).toEqual(
        expect.arrayContaining(["mypkgloom", "barloom"]),
      );
      expect(probe.registeredNames).not.toContain("sneaky");
      // V4e: the manifest-invalid (D) error note routes onto the
      // `loom-system-note` channel (probe.systemNotes), not ctx.ui.notify. The
      // escape entry (E) is a warning and surfaces on neither channel.
      expect(
        probe.systemNotes.some((n) => n.includes("invalid 'pi.looms'")),
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
          text: JSON.stringify({ name: "pkgfoo", pi: { looms: ["mypkgloom.loom"] } }),
        },
        { source: "rel", path: "node_modules/pkgfoo/mypkgloom.loom", text: BYPASS_LOOM },
      ],
      projectSettings: { looms: { scanPackages: false } },
    });
    try {
      // Verified-conformant: scanPackages:false disables the whole walk.
      expect(probe.registeredNames).not.toContain("mypkgloom");
    } finally {
      await probe.dispose();
    }
  });

  // ---- (2) loomPaths settings entry ---------------------------------------

  it("DISCO-H: loomPaths dir entry registers; missing path; non-.loom file", async () => {
    const probe = await runProbe({
      provider,
      files: [
        // a real dir (relative to .pi/) containing a .loom
        { source: "rel", path: ".pi/extralooms/extra.loom", text: BYPASS_LOOM },
        // a non-.loom file targeted directly by loomPaths
        { source: "rel", path: ".pi/notes.txt", text: "not a loom" },
      ],
      projectSettings: {
        loomPaths: ["extralooms", "notes.txt", "does-not-exist-xyz"],
      },
    });
    try {
      // Verified-conformant: dir entry registers; non-.loom → invalid-extension;
      // missing path → missing-source error (confirms the fixed DISC-1). V4e:
      // both error notes route onto the `loom-system-note` channel
      // (probe.systemNotes), not ctx.ui.notify.
      expect(probe.registeredNames).toContain("extra");
      expect(
        probe.systemNotes.some((n) => n.includes("does not end in .loom")),
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
      files: [{ source: "project", path: "plain.loom", text: BYPASS_LOOM }],
      projectSettings: {
        looms: {
          scanPackagesTimeoutMs: -5,
          scanPackagesMaxFiles: null,
          scanPackages: "true",
        },
      },
    });
    try {
      // Verified-conformant: string/null/negative scalar values → out-of-range
      // error (per key, non-fatal); the plain loom still registers. V4e: the
      // three per-key out-of-range error notes route onto the
      // `loom-system-note` channel (probe.systemNotes), not ctx.ui.notify
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

  it("DISCO-J: invalid-JSON settings file treated as {} (project loom still registers)", async () => {
    const probe = await runProbe({
      provider,
      files: [
        { source: "project", path: "plain.loom", text: BYPASS_LOOM },
        { source: "rel", path: ".pi/settings.json", text: "{ this is : not json" },
      ],
    });
    try {
      // Verified-conformant: invalid-JSON settings treated as {}, no crash; the
      // project loom still registers. (invalid-json is a warning, suppressed by
      // the error-only ctx.ui.notify route — the known routing gap.)
      expect(probe.registeredNames).toContain("plain");
    } finally {
      await probe.dispose();
    }
  });
});
