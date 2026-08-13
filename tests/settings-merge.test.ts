import { describe, expect, it } from "vitest";
import {
  loadSettings,
  mergeSettings,
  type JsonObject,
} from "../src/discovery/settings";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { FileSystem } from "../src/seams/file-system";
import { FakeFileSystem } from "./helpers/fake-file-system";

// V10c-T — failing tests for the paired `V10c` settings reads-and-merge
// implementation (`src/discovery/settings.ts`). The bullets trace to DISC-7
// (the deep-merge precedence) and the four `theta/load/settings-*` codes in
// discovery/package-and-settings.md, with diagnostic messages sourced from the
// diagnostics/code-registry-load.md *Message* column.
//
// These tests red because the V10c `mergeSettings` / `loadSettings` bodies are
// absent — the stubs return an empty merge object and an empty
// settings/diagnostics result, so each assertion reds on the missing merged key
// or the missing diagnostic, not on a compile error, fixture, or harness throw.

// Resolved settings-file locations the seam reads (POSIX-joined per the module
// contract: project = `<cwd>/.pi/settings.json`, global =
// `<homedir>/.pi/agent/settings.json`).
const HOME = "/home/theta";
const CWD = "/project";
const PROJECT_PATH = "/project/.pi/settings.json";
const GLOBAL_PATH = "/home/theta/.pi/agent/settings.json";

/** One settings file's on-disk state: present-with-content, unreadable, or (omitted) missing. */
interface FileSpec {
  readonly content?: string;
  readonly error?: string;
}

/** A valid, empty settings file — contributes no keys and no diagnostics. */
const EMPTY: FileSpec = { content: "{}" };

/** Build a FileSystem fake placing the two settings files at their resolved paths. */
function build(project: FileSpec, global: FileSpec): FileSystem {
  const files: Record<string, string> = {};
  const errors: Record<string, string> = {};
  if (project.content !== undefined) files[PROJECT_PATH] = project.content;
  if (project.error !== undefined) errors[PROJECT_PATH] = project.error;
  if (global.content !== undefined) files[GLOBAL_PATH] = global.content;
  if (global.error !== undefined) errors[GLOBAL_PATH] = global.error;
  return new FakeFileSystem({ homedir: HOME, cwd: CWD, files, errors });
}

/** Diagnostics matching a registry code. */
function byCode(diagnostics: readonly Diagnostic[], code: string): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}

// --------------------------------------------------------------------------
// DISC-7 — deep-merge precedence (objects deep-merge, arrays/scalars replace,
// project over global).
// --------------------------------------------------------------------------

describe("V10c-T — DISC-7 settings merge semantics", () => {
  it("DISC-7: nested objects deep-merge — project keys override, global-only keys retained", () => {
    const global: JsonObject = { theta: { scanPackages: true, scanPackagesMaxFiles: 100 } };
    const project: JsonObject = { theta: { scanPackagesMaxFiles: 200 } };
    const merged = mergeSettings(global, project);
    const thetas = merged.theta as { scanPackages?: boolean; scanPackagesMaxFiles?: number } | undefined;
    expect(thetas?.scanPackagesMaxFiles).toBe(200); // project overrides
    expect(thetas?.scanPackages).toBe(true); // global-only nested key retained
  });

  it("DISC-7: array values are replaced wholesale (not concatenated or deduplicated)", () => {
    const global: JsonObject = { thetaPaths: ["a.theta", "b.theta"] };
    const project: JsonObject = { thetaPaths: ["c.theta"] };
    const merged = mergeSettings(global, project);
    expect(merged.thetaPaths).toEqual(["c.theta"]);
  });

  it("DISC-7: scalar values are replaced — project overrides global", () => {
    const global: JsonObject = { theta: { binderModel: "global-model" } };
    const project: JsonObject = { theta: { binderModel: "project-model" } };
    const merged = mergeSettings(global, project);
    const thetas = merged.theta as { binderModel?: string } | undefined;
    expect(thetas?.binderModel).toBe("project-model");
  });

  it("DISC-7: a key present in only one file is kept as-is", () => {
    const global: JsonObject = { thetaPaths: ["g.theta"] };
    const project: JsonObject = { theta: { scanPackages: false } };
    const merged = mergeSettings(global, project);
    const thetas = merged.theta as { scanPackages?: boolean } | undefined;
    expect(merged.thetaPaths).toEqual(["g.theta"]); // global-only top-level key kept
    expect(thetas?.scanPackages).toBe(false); // project-only nested object kept
  });
});

// --------------------------------------------------------------------------
// theta/load/settings-invalid-json — present-but-unparseable file.
// --------------------------------------------------------------------------

describe("V10c-T — theta/load/settings-invalid-json", () => {
  it("theta/load/settings-invalid-json: a present-but-invalid-JSON file fires one load-phase diagnostic", async () => {
    const fs = build({ content: "{ not: valid json" }, EMPTY);
    const { diagnostics } = await loadSettings(fs);
    const hits = byCode(diagnostics, "theta/load/settings-invalid-json");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe("warning"); // registry severity W
  });
});

// --------------------------------------------------------------------------
// theta/load/settings-unreadable — a file that EXISTS but cannot be read is
// treated as {} and warns; an ABSENT file is treated as {} SILENTLY. Either
// way the other file's value is unaffected, and a warning fires at most once
// per file.
// --------------------------------------------------------------------------

describe("V10c-T — theta/load/settings-unreadable", () => {
  it("theta/load/settings-unreadable: an unreadable file is treated as {}, the other file's value is unaffected, one diagnostic fires", async () => {
    const fs = build(
      { error: "EACCES" },
      { content: JSON.stringify({ thetaPaths: ["g.theta"] }) },
    );
    const { settings, diagnostics } = await loadSettings(fs);
    const hits = byCode(diagnostics, "theta/load/settings-unreadable");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe("warning"); // registry severity W
    expect(settings.thetaPaths).toEqual(["g.theta"]); // readable file unaffected
  });

  it("theta/load/settings-unreadable: a missing settings file is treated as {} and fires NOTHING", async () => {
    // Project present & valid; global absent (ENOENT on disk). Both settings
    // files are OPTIONAL, so absence is the ordinary case and carries no
    // diagnostic — the registry trigger for this code is "exists but is
    // unreadable" (docs/bugs/0013). Warning here made the diagnostic
    // unconditional on any host that does not itself create the file.
    const fs = build({ content: JSON.stringify({ thetaPaths: ["p.theta"] }) }, {});
    const { settings, diagnostics } = await loadSettings(fs);
    expect(byCode(diagnostics, "theta/load/settings-unreadable")).toHaveLength(0);
    expect(settings.thetaPaths).toEqual(["p.theta"]); // present file's value unaffected
  });

  it("theta/load/settings-unreadable: BOTH files absent loads empty settings and fires nothing", async () => {
    // The universal case on a host that never creates a settings file: it must
    // be indistinguishable from a clean load, or every session in every
    // workspace carries two spurious warnings.
    const { settings, diagnostics } = await loadSettings(build({}, {}));
    expect(diagnostics).toEqual([]);
    expect(settings.thetaPaths).toBeUndefined();
    expect(settings.theta).toBeUndefined();
  });
});

// --------------------------------------------------------------------------
// theta/load/settings-value-out-of-range — top-level shape validation.
// --------------------------------------------------------------------------

describe("V10c-T — theta/load/settings-value-out-of-range (top-level shape)", () => {
  it("settings-value-out-of-range: non-array thetaPaths and non-object thetas are each absent, one diagnostic per malformed key (no nested cascade)", async () => {
    const fs = build(
      { content: JSON.stringify({ thetaPaths: 42, theta: [1, 2] }) },
      EMPTY,
    );
    const { settings, diagnostics } = await loadSettings(fs);
    const hits = byCode(diagnostics, "theta/load/settings-value-out-of-range");
    // Exactly one per malformed top-level key — a malformed `theta` does NOT
    // additionally log one per nested thetas.* key.
    expect(hits).toHaveLength(2);
    for (const h of hits) expect(h.severity).toBe("error"); // registry severity E
    expect(settings.thetaPaths).toBeUndefined(); // treated as absent
    expect(settings.theta).toBeUndefined(); // treated as absent
    // Messages sourced from the registry Message column (parsed-scalar carve-out,
    // byte-exact): `<observed>` is the parsed value's kind/value.
    const messages = hits.map((h) => h.message);
    expect(messages).toContain("settings key thetaPaths value is out of range; got 42");
    expect(messages).toContain("settings key thetas value is out of range; got array");
  });

  it("settings-value-out-of-range: a non-object JSON root fires exactly one (root) diagnostic with no per-key cascade", async () => {
    const fs = build({ content: JSON.stringify(["top", "level", "array"]) }, EMPTY);
    const { settings, diagnostics } = await loadSettings(fs);
    const hits = byCode(diagnostics, "theta/load/settings-value-out-of-range");
    expect(hits).toHaveLength(1);
    // Registry Message column, byte-exact: `(root)` and the `array` kind token.
    expect(hits[0]!.message).toBe("settings key (root) value is out of range; got array");
    expect(settings.thetaPaths).toBeUndefined();
    expect(settings.theta).toBeUndefined();
  });
});

// --------------------------------------------------------------------------
// theta/load/settings-value-out-of-range — scalar-key validation.
// --------------------------------------------------------------------------

describe("V10c-T — theta/load/settings-value-out-of-range (scalar keys)", () => {
  it("settings-value-out-of-range: each of the four thetas.* keys failing its type/range is absent, one diagnostic per offending key", async () => {
    const fs = build(
      {
        content: JSON.stringify({
          thetaPaths: ["keep.theta"], // valid sibling — must survive
          theta: {
            binderModel: "", // invalid: must be a non-empty string
            scanPackages: "yes", // invalid: must be JSON true/false
            scanPackagesMaxFiles: 0, // invalid: integer ≥ 1
            scanPackagesTimeoutMs: 2.5, // invalid: integer ≥ 1 (non-integer)
          },
        }),
      },
      EMPTY,
    );
    const { settings, diagnostics } = await loadSettings(fs);
    const hits = byCode(diagnostics, "theta/load/settings-value-out-of-range");
    expect(hits).toHaveLength(4); // one per offending key
    for (const h of hits) expect(h.severity).toBe("error");
    // Each offending key treated as absent.
    expect(settings.theta?.binderModel).toBeUndefined();
    expect(settings.theta?.scanPackages).toBeUndefined();
    expect(settings.theta?.scanPackagesMaxFiles).toBeUndefined();
    expect(settings.theta?.scanPackagesTimeoutMs).toBeUndefined();
    // The valid sibling key still resolves.
    expect(settings.thetaPaths).toEqual(["keep.theta"]);
  });

  it("settings-value-out-of-range: null is out of range for a scalar key and is treated as absent", async () => {
    const fs = build(
      { content: JSON.stringify({ theta: { scanPackagesMaxFiles: null, scanPackages: true } }) },
      EMPTY,
    );
    const { settings, diagnostics } = await loadSettings(fs);
    const hits = byCode(diagnostics, "theta/load/settings-value-out-of-range");
    expect(hits).toHaveLength(1); // only the null key offends
    expect(settings.theta?.scanPackagesMaxFiles).toBeUndefined();
    expect(settings.theta?.scanPackages).toBe(true); // valid sibling survives
  });

  it("settings-value-out-of-range (per file): a malformed scalar in one file does not suppress a valid value of the same key in the other file", async () => {
    const fs = build(
      { content: JSON.stringify({ theta: { scanPackagesMaxFiles: 500 } }) }, // project valid
      { content: JSON.stringify({ theta: { scanPackagesMaxFiles: 0 } }) }, // global invalid
    );
    const { settings, diagnostics } = await loadSettings(fs);
    const hits = byCode(diagnostics, "theta/load/settings-value-out-of-range");
    expect(hits).toHaveLength(1); // only the global file's malformed value
    expect(settings.theta?.scanPackagesMaxFiles).toBe(500); // project value survives the merge
  });
});

// --------------------------------------------------------------------------
// theta/load/settings-invalid-entry — per-entry rejection inside thetaPaths.
// --------------------------------------------------------------------------

describe("V10c-T — theta/load/settings-invalid-entry", () => {
  it("settings-invalid-entry: a non-string thetaPaths entry is rejected per-entry while the other entries still process", async () => {
    const fs = build(
      { content: JSON.stringify({ thetaPaths: ["good.theta", 42, "good2.theta"] }) },
      EMPTY,
    );
    const { settings, diagnostics } = await loadSettings(fs);
    const hits = byCode(diagnostics, "theta/load/settings-invalid-entry");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe("error"); // registry severity E
    // Registry Message column, byte-exact: index and JSON kind of the offender.
    expect(hits[0]!.message).toBe("settings 'thetaPaths[1]' must be a string path; got number");
    // The offending entry contributes nothing; the other string entries process.
    expect(settings.thetaPaths).toEqual(["good.theta", "good2.theta"]);
  });
});
