import { describe, expect, it } from "vitest";
import { loadSettings, type ThetaSettings } from "../src/discovery/settings";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { FileSystem } from "../src/seams/file-system";
import { FakeFileSystem } from "./helpers/fake-file-system";

// RFC 0010 (execution-status.md EXST-10) — `tests/execution-status-settings-progress.test.ts`
// (T-CMD settings half). Behaviour-matrix rows B56-B58. Mirrors
// `tests/settings-merge.test.ts`'s `FileSpec`/`build`/`byCode` harness
// exactly (same FakeFileSystem-backed `loadSettings` entry point).
//
// `theta.progress` is NOT yet a recognised `thetas.*` scalar key in
// `src/discovery/settings.ts` (the seam sheet par. 1 edit is the paired
// analyst's, not this builder pass's) — so every assertion below reds:
// a valid `"counts"` value never survives `cleanSettingsFile`'s
// `THETAS_SCALAR_KEYS` allowlist (the cleaned `theta` object has no
// `progress` key at all, so `settings.theta?.progress` is always
// `undefined`, never `"counts"`), and an invalid value fires no
// `theta/load/settings-value-out-of-range` diagnostic for the `progress`
// key at all (the key is silently dropped as "unrecognised", not validated
// and rejected).

const HOME = "/home/theta";
const CWD = "/project";
const PROJECT_PATH = "/project/.pi/settings.json";
const GLOBAL_PATH = "/home/theta/.pi/agent/settings.json";

interface FileSpec {
  readonly content?: string;
}

const EMPTY: FileSpec = { content: "{}" };

function build(project: FileSpec, global: FileSpec): FileSystem {
  const files: Record<string, string> = {};
  if (project.content !== undefined) files[PROJECT_PATH] = project.content;
  if (global.content !== undefined) files[GLOBAL_PATH] = global.content;
  return new FakeFileSystem({ homedir: HOME, cwd: CWD, files, errors: {} });
}

function byCode(diagnostics: readonly Diagnostic[], code: string): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}

/**
 * `ThetasSettings.progress` is not yet a declared field on the production
 * type (the seam sheet par. 1 edit is the paired analyst's, not this
 * builder pass's) — read it through an `unknown` widening so the test
 * compiles against TODAY's type and still observes tomorrow's field once it
 * lands, rather than asserting against a locally-augmented interface no
 * production code ever produces.
 */
function progressOf(settings: ThetaSettings): unknown {
  return (settings.theta as Record<string, unknown> | undefined)?.["progress"];
}

// ---------------------------------------------------------------------------
// B56 — a valid `theta.progress` value survives into the cleaned settings.
// ---------------------------------------------------------------------------

describe("T-CMD — B56: theta.progress: \"counts\" survives into ThetaSettings.theta.progress", () => {
  it("a valid value is present in the cleaned settings view", async () => {
    const fs = build({ content: JSON.stringify({ theta: { progress: "counts" } }) }, EMPTY);
    const { settings } = await loadSettings(fs);
    expect(progressOf(settings)).toBe("counts");
  });
});

// ---------------------------------------------------------------------------
// B57 — invalid values fire settings-value-out-of-range and are treated absent.
// ---------------------------------------------------------------------------

describe("T-CMD — B57: invalid theta.progress values -> settings-value-out-of-range, treated absent", () => {
  it.each([
    ["nAmes", '"nAmes"'],
    ["7", "7"],
    ["null", "null"],
    ["true", "true"],
  ] as const)("value %s: exactly one out-of-range diagnostic naming thetas.progress; key absent", async (_label, jsonLiteral) => {
    const fs = build(
      { content: `{"theta":{"progress":${jsonLiteral}}}` },
      EMPTY,
    );
    const { settings, diagnostics } = await loadSettings(fs);
    const hits = byCode(diagnostics, "theta/load/settings-value-out-of-range");
    const progressHit = hits.find((d) => d.message.includes("thetas.progress"));
    expect(progressHit, "expected a thetas.progress out-of-range diagnostic").toBeDefined();
    expect(progressOf(settings)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// B58 — absent key -> absent in the cleaned view (the "names" default is a
// read-site concern, per module convention, so this asserts absence only).
// ---------------------------------------------------------------------------

describe("T-CMD — B58: theta.progress absent -> absent in ThetaSettings", () => {
  it("no diagnostic, key absent", async () => {
    const fs = build(EMPTY, EMPTY);
    const { settings, diagnostics } = await loadSettings(fs);
    expect(progressOf(settings)).toBeUndefined();
    expect(byCode(diagnostics, "theta/load/settings-value-out-of-range")).toHaveLength(0);
  });
});
