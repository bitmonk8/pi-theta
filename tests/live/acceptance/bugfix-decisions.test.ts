// Real production bugfix-decide.theta, real subagent process and real Astra
// provider. The tiny prompt-mode caller only persists the worker's typed value;
// it never supplies a verdict, implements a fix, approves a dialog or ships.
import { describe, expect, it } from "vitest";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { failLoudly, parseSystemNoteCodes, spawnPiPrint } from "./harness";
import { parseThetaDocument } from "../../../src/parser/theta-document";
import { parseDeps } from "../../helpers/e2e-s1";

const root = process.cwd();
const helper = join(root, "tools/bugfix/run.mjs");
const workerPath = join(root, ".pi", "theta", "workers", "bugfix-decide.theta");
const scalarFields = ["summary", "recommendation", "rationale"] as const;
const flagFields = ["clear_preference", "has_tradeoff", "evidence_sufficient"] as const;

async function requireAstra() {
  // Intentional exception to the normal Sol live-harness preference: this is
  // acceptance of the shipped decision worker's actual pinned Astra policy.
  // Availability/authentication is a loud precondition, never skip/fallback.
  const runtime = await ModelRuntime.create();
  const registry = new ModelRegistry(runtime);
  await registry.refresh();
  if (!registry.getAvailable().some(model => model.provider === "openai" && model.id === "gpt-6-astra")) {
    failLoudly("bugfix decision live precondition unmet: credentialed openai/gpt-6-astra is required; do not substitute Sol or Claude for the actual Astra worker.");
  }
}
function git(cwd: string, ...args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout.trim();
}
function invoke(cwd: string, ...args: string[]) {
  const r = spawnSync(process.execPath, [helper, ...args], { cwd, encoding: "utf8" });
  expect(r.status, r.stderr + r.stdout).toBe(0);
  return r.stdout.trim();
}
type FixtureKind = "preferred-baseline" | "unresolved-tradeoff";
function fixture(kind: FixtureKind) {
  const cwd = mkdtempSync(join(tmpdir(), "theta-decision-live-"));
  const put = (path: string, text: string) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), text);
  };
  const theta = join(cwd, ".pi/theta");
  const preferred = kind === "preferred-baseline";
  const request = preferred
    ? "Authorize only tests/value.test.cjs case legacy-known: change expected lookup('known') from 1 to 2. Retain known=2 and unknown=undefined controls unchanged; add no production/spec scope. This exactly implements docs/owner-decisions.md#exact-legacy-ruling. Retain the original witnesses.json, argv/signature and red-0.json unchanged. Independent review and all green gates still required."
    : "Choose the exact tokens accepted by src/token.cjs valid(): option A accepts authenticated legacy tokens without exp for offline deployment compatibility; option B rejects every token without exp to enforce bounded credential lifetime. The pending proposed implementation is A, but there is no existing owner preference for A over B. No implementation or spec changes are authorized yet. Preserve original witness proof, independent review and green gates.";
  put(".gitignore", ".pi/tmp/\n");
  put("AGENTS.md", [
    "# Fixture project principles",
    "Preserve established language/runtime semantics and exact explicit owner rulings.",
    "A test that contradicts an exact governing contract may be corrected only in its named scope while preserving controls and original red evidence.",
    "Never erase an original witness/red, invent owner precedent, waive gates/review or grant broad future edit authority.",
    "Compatibility and credential lifetime are both material requirements. No general priority between them has been established in this project.",
    "No commits, pushes, publication, version bumps or implementation agents are needed for this decision-only fixture.", "",
  ].join("\n"));
  put("docs/bugs/0001-example.md", "# Incorrect decoded count\n- **Status:** open\n\nThe independent original end-to-end witness expects decodedCount()=2 but observes 1. The exact assertion red is recorded in the run. A separate pending scope decision is required before continuing.\n");
  put("src/value.cjs", "exports.lookup = key => key === 'known' ? 2 : undefined;\nexports.decodedCount = () => 1;\n");
  put("tests/value.test.cjs", [
    "const assert = require('node:assert/strict');",
    "const { lookup } = require('../src/value.cjs');",
    "// legacy-known: obsolete expectation; exact owner ruling permits only this oracle correction.",
    "assert.equal(lookup('known'), 1);",
    "// Known/unknown controls must stay independently asserted.",
    "assert.equal(lookup('known'), 2);",
    "assert.equal(lookup('missing'), undefined);", "",
  ].join("\n"));
  put("src/token.cjs", "// Legacy deployments authenticate the signature before this policy boundary.\nexports.valid = token => token.signatureValid && (token.exp === undefined || token.exp > token.now);\n");
  put("docs/spec_topics/value.md", "# Lookup\nlookup('known') is 2; unknown keys return undefined. This established contract must not change.\n");
  put("docs/spec_topics/token.md", "# Token policy requirements\nAuthenticated legacy offline deployments require unexpired offline usability; old deployed tokens have no exp. Security-sensitive online tenants require bounded credential lifetime. The project has not established a priority or migration policy for tokens lacking exp. Both requirements are real; there is no governing rule that chooses one.\n");
  put("docs/owner-decisions.md", preferred ? [
    "# Exact legacy ruling",
    "Recorded owner decision for this bug: lookup('known')=2 and unknown=undefined remain the established contract.",
    "The ONLY permitted legacy baseline correction is tests/value.test.cjs case legacy-known expected 1 -> 2, with both known/unknown controls unchanged.",
    "The original decodedCount end-to-end manifest, argv/signature and recorded red must remain unchanged; baseline cleanup is not a substitute for fixing that defect.",
    "This exact earlier ruling prefers correction of the contradictory oracle over preserving it. It does not authorize new semantics, broad rebaselining or any review/gate/shipment waiver.", "",
  ].join("\n") : [
    "# Unresolved credential policy",
    "Owner record: offline compatibility and bounded credential lifetime are both valid requirements with materially different user impacts.",
    "I have not chosen whether authenticated legacy tokens without exp should remain valid or be rejected. Neither option is preferred by any earlier ruling.",
    "Do not invent a priority. Choosing compatibility preserves existing offline deployments but leaves long-lived credentials; choosing rejection removes that risk but breaks deployed offline clients.",
    "There is no approved migration mechanism or implementation plan that satisfies both. A policy preference is needed, not a missing credential, reviewer, gate or red-proof repair.", "",
  ].join("\n"));
  mkdirSync(join(theta, "workers"), { recursive: true });
  copyFileSync(workerPath, join(theta, "workers/bugfix-decide.theta"));
  // Test-only transport sink: receives the actual typed child return directly,
  // without another model turn or a handwritten replacement worker verdict.
  const decisionSchema = {
    type: "object", additionalProperties: false,
    properties: {
      disposition: { type: "string", enum: ["continue", "human", "blocked"] },
      ...Object.fromEntries(flagFields.map(field => [field, { type: "boolean" }])),
      ...Object.fromEntries(scalarFields.map(field => [field, { type: "string" }])),
      basis: { type: "array", items: { type: "string" } },
      alternatives: { type: "array", items: { type: "string" } },
    },
    required: ["disposition", ...flagFields, ...scalarFields, "basis", "alternatives"],
  };
  put("persist-decision.mjs", [
    'import { writeFileSync } from "node:fs";',
    "export default function(pi) { pi.registerTool({",
    '  name: "persist_bug_decision", label: "Persist actual decision", description: "Test transport sink for a typed child return; no model assessment.",',
    "  parameters: " + JSON.stringify({ type: "object", properties: { context: { type: "string" }, verdict: decisionSchema }, required: ["context", "verdict"], additionalProperties: false }) + ",",
    "  async execute(_id, params) {",
    '    writeFileSync(params.context + ".verdict.json", JSON.stringify(params.verdict, null, 2) + "\\n");',
    '    return { content: [{type: "text", text: "Persisted actual typed decision"}] };',
    "  }",
    "}); }", "",
  ].join("\n"));
  // The caller is written before init so the worker's control identity is
  // immutable. Its single string argument bypasses binder model requests.
  put(join(".pi", "theta", "decision-probe.theta"), [
    "---", "mode: prompt", "tools:", "  - ./workers/bugfix-decide.theta", "  - persist_bug_decision", "params:", "  context_path: string", "---",
    "let actual = bugfix_decide(context_path)?",
    "persist_bug_decision({ context: context_path, verdict: actual })?",
    '"Decision captured without implementation or shipment"', "",
  ].join("\n"));
  for (const path of [join(theta, "decision-probe.theta"), join(theta, "workers/bugfix-decide.theta")]) {
    const doc = parseThetaDocument({ path, bytes: new Uint8Array(readFileSync(path)) }, parseDeps());
    expect(doc.diagnostics, path).toEqual([]);
  }
  git(cwd, "init", "-b", "main");
  git(cwd, "config", "user.email", "test@example.invalid");
  git(cwd, "config", "user.name", "Test");
  git(cwd, "add", "."); git(cwd, "commit", "-m", "live decision fixture");
  const run = invoke(cwd, "init", "1");
  const manifest = JSON.stringify({
    e2e: [{ argv: [process.execPath, "-e", "if(require('./src/value.cjs').decodedCount()!==2){console.error('AssertionError: original decoded count expected 2 got 1');process.exit(1)}"], failure_pattern: "AssertionError: original decoded count expected 2 got 1" }],
    unit: [], unit_omission_reason: "Independent e2e witness suffices for the decision-only fixture", live_required: false, live: [],
  });
  writeFileSync(join(run, "witnesses.json"), manifest);
  invoke(cwd, "red", run);
  invoke(cwd, "begin", run, "implement");
  writeFileSync(join(run, "implement.md"), "Implementation has not changed the pending scope. Exact decision-request.md is the complete request. Original red is genuine; no prerequisite/integrity failures or reviewer rejection. The request grants no shipping/review/gate authority.\n");
  writeFileSync(join(run, "decision-request.md"), request);
  writeFileSync(join(run, "stage-implement-result.txt"), "needs_decision\nExact scope decision required before continuing");
  invoke(cwd, "record", run, "implement");
  writeFileSync(join(run, "plan.md"), "Preserve the original decoded-count witness; fix only the decoded-count defect after the independent scope decision. No new normative contract or gate waiver is proposed.\n");
  writeFileSync(join(run, "evidence-review.md"), "CLEAN — independent review confirms the exact original red and retained controls; the only unresolved item is the separate scoped decision-request.md.\n");
  const context = invoke(cwd, "decision-start", run, "implement");
  return { cwd, theta, run, context, request, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

interface Decision {
  disposition: "continue" | "human" | "blocked";
  clear_preference: boolean;
  has_tradeoff: boolean;
  evidence_sufficient: boolean;
  summary: string;
  recommendation: string;
  rationale: string;
  basis: string[];
  alternatives: string[];
}

describe("live Astra autonomous bug-fix decisions", () => {
  it.each([
    ["preferred-baseline", "continue", "CONTINUE"],
    ["unresolved-tradeoff", "human", "HUMAN"],
  ] as const)("%s persists an actual typed %s decision without running an implementation agent", async (kind, disposition, record) => {
    await requireAstra();
    const source = readFileSync(workerPath, "utf8");
    expect(source).toMatch(/^model: "openai\/gpt-6-astra"$/m);
    const f = fixture(kind);
    try {
      expect(readFileSync(join(f.theta, "workers/bugfix-decide.theta"), "utf8")).toBe(source);
      const originals = ["witnesses.json", "red-0.json"].map(path => readFileSync(join(f.run, path)));
      const contextBytes = readFileSync(f.context);
      const head = git(f.cwd, "rev-parse", "HEAD");
      const session = join(f.cwd, ".pi/tmp/decision-session.jsonl");
      // spawnPiPrint authenticates the parent PID, scrubs inherited worker
      // control state, pins real CLI + this checkout's extension for children.
      const result = await spawnPiPrint({
        cwd: f.cwd, thetaDir: f.theta, extraThetaDirs: [join(f.theta, "workers")],
        slashInvocation: "/decision-probe " + f.context,
        extraArgs: ["--mode", "json", "-e", join(f.cwd, "persist-decision.mjs"), "--session", session],
        abortAfterMs: 210000,
      });
      const diagnostic = result.stderr + "\n" + result.stdout;
      expect(result.exitCode, diagnostic).toBe(0);
      expect(result.stderr).toBe("");
      expect(parseSystemNoteCodes(diagnostic)).toEqual([]);
      expect(result.stdout).not.toContain("theta-system-note");
      // Score the COMPLETE JSONL stream, not merely message_end events.
      expect(result.stdout).not.toContain("theta_result");
      expect(readFileSync(session, "utf8")).not.toMatch(/"customType"\s*:\s*"theta-system-note"/);
      expect(existsSync(f.context + ".verdict.json"), diagnostic).toBe(true);
      const verdict = JSON.parse(readFileSync(f.context + ".verdict.json", "utf8")) as Decision;
      expect(verdict.disposition, JSON.stringify(verdict, null, 2)).toBe(disposition);
      expect(verdict.clear_preference).toBe(disposition === "continue");
      expect(verdict.has_tradeoff).toBe(disposition === "human");
      expect(verdict.evidence_sufficient).toBe(true);
      for (const field of scalarFields) expect(verdict[field].trim().length, field).toBeGreaterThan(0);
      expect(verdict.basis.length).toBeGreaterThan(0);
      expect(verdict.basis.join("\n")).toMatch(/owner-decisions\.md|AGENTS\.md|spec_topics/);
      expect(verdict.alternatives.length).toBeGreaterThanOrEqual(2);
      expect(verdict.alternatives.every(text => text.trim().length > 0)).toBe(true);
      expect(invoke(f.cwd, "decision-record", f.run, f.context)).toBe(record);
      // A settled provider prompt alone is not success: inspect the controller's
      // persisted decision/authority, and ensure HUMAN never grants permission.
      const state = JSON.parse(readFileSync(join(f.run, "state.json"), "utf8"));
      const saved = JSON.parse(readFileSync(state.decisions.at(-1).path, "utf8"));
      expect(saved).toMatchObject({ outcome: record, source: "astra", phase: "implement", contextPath: f.context, verdict });
      expect(state.specApproved).not.toBe(true);
      expect(state.verifiedDigest).toBeUndefined();
      if (disposition === "continue") {
        expect(readFileSync(join(f.run, "decision-authorizations.md"), "utf8")).toContain(f.request);
      } else {
        expect(state.decisions.at(-1)).toMatchObject({ outcome: "HUMAN", authority: null });
        expect(readFileSync(join(f.run, "decision-authorizations.md"), "utf8")).toContain("No approval or expanded scope granted.");
        expect(verdict.rationale + " " + verdict.alternatives.join(" ")).toMatch(/compatib|offline|legacy/i);
        expect(verdict.rationale + " " + verdict.alternatives.join(" ")).toMatch(/secur|lifetime|expir|credential/i);
      }
      expect(readFileSync(f.context)).toEqual(contextBytes);
      ["witnesses.json", "red-0.json"].forEach((path, index) => expect(readFileSync(join(f.run, path))).toEqual(originals[index]));
      expect(git(f.cwd, "status", "--porcelain")).toBe("");
      expect(git(f.cwd, "rev-parse", "HEAD")).toBe(head);
      expect(existsSync(join(f.run, "shipment.json"))).toBe(false);
    } finally { f.cleanup(); }
  }, 240000);
});
