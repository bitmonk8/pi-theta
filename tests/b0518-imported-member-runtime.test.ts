// Real source -> production parse/import materialisation over PiFileSystem ->
// production producer binding -> executeBody. SDK host/model are inert because
// these bodies issue no queries. H9a separately supplies the real host boundary.
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ForIterandKindDefectError } from "../src/runtime/executor-defects";
import { executeBody } from "../src/runtime/statement-executor";
import { PiFileSystem } from "../src/seams/pi-file-system";
import { span } from "./helpers/invoke-seam-scaffold";
import { assertInternalError } from "./helpers/runtime-belt-probe-harness";
import { bindImportedBodyOverFs } from "./helpers/thetalib-load-harness";
import { PARSE_REGISTRY_PATH, registryMessageOf } from "./helpers/load-row-harness";
import { readRegistry } from "./helpers/registry-oracle";

const LIB = 'schema R6 { xs: array<string>, note: string }\nenum Sev { Low }\n';
const IMPORT = 'import { R6, Sev } from "./p6lib.thetalib"';
const VALUE = 'let r = R6 { xs: ["a", "b"], note: "init" }';
const registry = readRegistry(["parse"]);
async function prepare(body: string) {
  const cwd = mkdtempSync(join(process.env.PI_THETA_TEST_ARTIFACT_DIR ?? tmpdir(), "b0518-runtime-"));
  const sourcePath = join(cwd, "app.theta");
  writeFileSync(join(cwd, "p6lib.thetalib"), LIB);
  // Retain the exact source used by the shared parser, including its inert
  // historical model pin; no provider is selected or contacted by this tier.
  writeFileSync(sourcePath, '---\nmodel: "anthropic/claude-sonnet-5"\nmode: prompt\n---\n' + body);
  const prepared = await bindImportedBodyOverFs(body, sourcePath, new PiFileSystem(cwd), {} as ModelRegistry);
  expect(prepared.app.diagnostics, "all runtime fixtures must really parse clean").toEqual([]);
  expect(JSON.stringify(prepared.check.diagnostics)).not.toContain("<withheld>");
  expect(prepared.check.imports.map(i => i.name)).toEqual(["R6", "Sev"]);
  return { ...prepared, sourcePath };
}
async function clean(body: string) {
  const prepared = await prepare(body);
  expect(prepared.check.diagnostics, "never execute a refused load").toEqual([]);
  return prepared;
}

function assertArrayResult(actual: unknown, expected: unknown) {
  expect(actual, "B0518 imported arrays must execute actual iterations, not an empty/null substitute").toEqual(expected);
}

describe("B0518 real imported-member execution", () => {
  for (const [xs, expected] of [['["a", "b"]', ["ab", 2]], ['[]', ["", 0]]] as const) {
    it(`sequential imported array ${xs} has exact concatenation and iteration count`, async () => {
      const { app, binding } = await clean(`${IMPORT}\nlet r = R6 { xs: ${xs}, note: "init" }\nlet mut out = ""\nlet mut count = 0\nfor x in r.xs { out = out + x\ncount += 1 }\n[out, count]\n`);
      const execution = await executeBody(app.body, binding.executeDeps);
      expect(execution.outcome).toBe("success");
      assertArrayResult(execution.result.value, expected);
    });
  }
  it("parallel imported array returns two ordered Ok payloads, not empty/null", async () => {
    const { app, binding } = await clean(`${IMPORT}\n${VALUE}\nlet results = par for x in r.xs { x }\nresults\n`);
    const execution = await executeBody(app.body, binding.executeDeps);
    expect(execution.outcome).toBe("success");
    assertArrayResult(JSON.parse(JSON.stringify(execution.result.value)), [{ ok: true, value: "a" }, { ok: true, value: "b" }]);
  });
  it("the same exact runtime oracle rejects fabricated empty/null values", () => {
    for (const bad of [[], null]) {
      expect(() => assertArrayResult(bad, ["ab", 2])).toThrow(/B0518 imported arrays must execute actual iterations/);
    }
  });
  for (const iterand of ["r.note", "Sev.Low"]) {
    for (const loop of ["for", "par for"]) {
      it(`${loop} over imported ${iterand} frames an internal error before any iteration or worker lane`, async () => {
        const { app, binding, sourcePath } = await clean(`${IMPORT}\n${VALUE}\n${loop} x in ${iterand} { let seen = x }\n99\n`);
        const traces: string[] = [];
        const open = vi.fn(() => ({ claim: vi.fn(), settle: vi.fn(), close: vi.fn() }));
        let caught: unknown;
        let returned = false;
        try {
          await executeBody(app.body, { ...binding.executeDeps, statusLanes: { open }, trace: (_site, kind) => { traces.push(kind); return undefined; } });
          returned = true;
        } catch (error) { caught = error; }
        expect(returned, "a non-array must not fabricate success/empty iteration").toBe(false);
        expect(caught).toBeInstanceOf(ForIterandKindDefectError);
        assertInternalError(caught, { file: sourcePath, range: span() }, `${loop} ${iterand}`);
        expect(traces.filter(kind => kind === "loop-iter")).toEqual([]);
        // Only import, let and loop/expression dispatch; no body or trailing
        // statement was reached. A fabricated zero-loop success traces 99 too.
        expect(traces.filter(kind => kind === "stmt")).toHaveLength(3);
        expect(open, "non-array abort precedes parallel worker scheduling").not.toHaveBeenCalled();
      });
    }
  }
  it("unknown imported variant is still refused by the real filesystem load pass", async () => {
    const { check } = await prepare(`${IMPORT}\nlet x = Sev.Nope\nx\n`);
    const code = "theta/parse/unknown-variant";
    expect(check.diagnostics.map(d => ({ code: d.code, severity: d.severity, message: d.message }))).toEqual([{
      code, severity: "error", message: registryMessageOf(registry, PARSE_REGISTRY_PATH, code, [["<variant>", "Nope"], ["<enum>", "Sev"]]),
    }]);
    // Deliberately do not execute: a refused fixture is not a runtime witness.
  });
});
