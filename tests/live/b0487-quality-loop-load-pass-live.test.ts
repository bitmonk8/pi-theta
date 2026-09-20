import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { requireLiveProvider, runProbe, type PlantedFile, type ProbeResult } from "./hardening/probe-harness";

// Bug 0487 — Load-time false-positive diagnostics on subagent callees.
// (docs/bugs/0487-load-time-false-positive-diagnostics-on-subagent-callees.md)
//
// THE SEAM UNDER TEST — the SHIPPED extension's real composition root, driven
// end to end over the REAL, UNMODIFIED `.pi/theta/` tree this repository ships
// (`quality-loop.theta` and every `workers/*.theta` / `workers/quality.thetalib`
// file) through `runProbe` (tests/live/hardening/probe-harness.ts): a real
// `AgentSession` over the shipped `extensions/index.ts` entry, `.pi/settings.json`
// carrying the SAME `theta.binderModel` this repo's own `.pi/settings.json` pins
// (`anthropic/claude-sonnet-5`), and zero drives (the three codes below are
// LOAD-time diagnostics; a model turn adds nothing to this witness and would
// only spend tokens). This is the CLOSEST a live test gets to what an operator
// actually sees loading this repo's own quality-loop workers.
//
// WHY THE REAL TREE, UNMODIFIED. This repo's own `.pi/theta` `workers/` tree is the
// bug's ORIGINAL "First observed" reproduction site (`fix-cluster-tree.theta`
// declares `theta_progress` in `tools:`; `quality-loop.theta` invokes it as a
// callee). Loading the actual shipped files — never a synthetic stand-in —
// is the strongest available witness that the fix (and the settings-fallback
// behaviour bug 0487 part (2) already relies on) holds for the files it was
// filed against. Per AGENTS.md / the task constraints this test reads `.pi/
// theta/**` and MUST NOT modify it.
//
// SCOPE OF THE ASSERTION. Three codes only —
// `theta/load/unknown-tool`, `theta/load/callee-has-errors`,
// `theta/load/binder-model-unresolved` — restricted to `quality-loop.theta`
// and `workers/fix-cluster-tree.theta`, the two files the bug's symptoms name.
// The wider worker roster (`workers/fix-cluster.theta`,
// `workers/lens-d4-duplication.theta`, `workers/lens-d8-simplification.theta`,
// `workers/triage-finding.theta`) declares `model:` values naming providers
// not necessarily available to every environment this suite runs in
// (organisation-internal aliases); a `theta/load/model-unresolved` on one of
// those is an orthogonal, pre-existing environment/provider-availability
// condition, NOT a bug-0487 symptom, and this test does not gate on it.
//
// A KNOWN LIMITATION OF THIS WITNESS (recorded rather than hidden — see the
// verification report). Reverting the bug-0487-part-(1) resolver arm in
// `resolveEntry` (src/parser/callable-set.ts) does NOT redden this test: on
// the currently pinned Pi host (`@earendil-works/pi-coding-agent@0.80.10`),
// `pi.getAllTools()` ALREADY reflects this extension's own `theta_progress`
// registration by the time the load-time snapshot is read (verified directly
// — see the verification report's Obligation 3 section) — so the false
// `unknown-tool` this bug names does not currently reproduce through the real
// getAllTools() path with or without the fix. The fix's own wiring is
// witnessed instead by `tests/b0487-theta-progress-callable-set-resolution.test.ts`
// and `tests/b0487-theta-progress-callee-composition.test.ts` (offline,
// synthetic `pi.getAllTools()` doubles that DO omit `theta_progress`, matching
// the bug's stated premise). This live cell's job is the AFFIRMATIVE claim —
// the real shipped tree loads clean of the three named codes today — not a
// red/green discriminator for part (1) on this host.
//
// TIER — H8a-adjacent (probe-harness), live, token-bounded (zero drives: the
// provider/model is resolved to build a real `AgentSession`, but no turn
// runs).

const REPO_ROOT = join(__dirname, "..", "..");
const THETA_ROOT = join(REPO_ROOT, ".pi", "theta");

/** Recursively list every file under `dir`, relative to `dir`, forward-slashed. */
function listFilesRelative(dir: string): readonly string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listFilesRelative(full).map((p) => join(entry, p)));
    } else {
      out.push(entry);
    }
  }
  return out.map((p) => p.split(sep).join("/"));
}

const UNKNOWN_TOOL_CODE = "theta/load/unknown-tool";
const CALLEE_HAS_ERRORS_CODE = "theta/load/callee-has-errors";
const BINDER_MODEL_UNRESOLVED_CODE = "theta/load/binder-model-unresolved";
const NAMED_CODES = [UNKNOWN_TOOL_CODE, CALLEE_HAS_ERRORS_CODE, BINDER_MODEL_UNRESOLVED_CODE] as const;

// The two files the bug's symptoms name directly. `quality-loop.theta` sits at
// the tree root; `workers/fix-cluster-tree.theta` is the file that declares
// `theta_progress` in `tools:` and is invoked as a callee by `quality-loop.theta`.
const IN_SCOPE_STEMS = ["quality-loop", "workers/fix-cluster-tree"] as const;

/** Lines in `notes` that carry one of `NAMED_CODES` AND mention `stem`'s own file. */
function namedCodeLinesFor(notes: readonly string[], stem: string): readonly string[] {
  const needle = `${stem}.theta`.split("/").join(sep);
  const needleFwd = `${stem}.theta`;
  return notes
    .flatMap((n) => n.split("\n"))
    .filter(
      (line) =>
        NAMED_CODES.some((code) => line.includes(code)) &&
        (line.includes(needle) || line.includes(needleFwd)),
    );
}

const provider = requireLiveProvider();
let probe: ProbeResult;

afterAll(async () => {
  await probe?.dispose();
});

describe("bug 0487 — the real .pi/theta/ tree loads clean of the three named false-positive codes", () => {
  it("loads the real, unmodified .pi/theta tree and registers quality-loop", async () => {
    const relFiles = listFilesRelative(THETA_ROOT);
    expect(relFiles.length, `expected files under ${THETA_ROOT}`).toBeGreaterThan(0);
    const planted: PlantedFile[] = relFiles.map((rel) => ({
      source: "project",
      path: rel,
      text: readFileSync(join(THETA_ROOT, rel), "utf8"),
    }));
    // Mirrors this repo's own `.pi/settings.json` `theta.binderModel` pin — the
    // documented config bug 0487 part (2) is verified against.
    probe = await runProbe({
      provider,
      files: planted,
      projectSettings: { theta: { binderModel: "anthropic/claude-sonnet-5" } },
    });

    // Precondition: the walk ran and reached the real tree (never a silent
    // empty-walk pass-through).
    expect(
      probe.registeredNames,
      `discovery did not register quality-loop; registered=${JSON.stringify(probe.registeredNames)} ` +
        `systemNotes=${JSON.stringify(probe.systemNotes)}`,
    ).toContain("quality-loop");

    for (const stem of IN_SCOPE_STEMS) {
      const lines = namedCodeLinesFor(probe.systemNotes, stem);
      expect(
        lines,
        `'${stem}.theta' carried a bug-0487 false-positive diagnostic ` +
          `(one of ${NAMED_CODES.join(", ")}): ${JSON.stringify(lines)}. ` +
          `Full systemNotes: ${JSON.stringify(probe.systemNotes)}`,
      ).toEqual([]);
    }
    // Also confirm the capturing ctx.ui.notify channel carries none of the
    // three codes for the in-scope files (belt-and-braces; per the probe
    // harness header these load diagnostics are expected on `systemNotes`,
    // not here, but a future delivery-channel change should not silently
    // reopen this witness).
    for (const stem of IN_SCOPE_STEMS) {
      const uiLines = namedCodeLinesFor(
        probe.diagnostics.map((d) => d.message),
        stem,
      );
      expect(uiLines).toEqual([]);
    }
  }, 60000);
});
