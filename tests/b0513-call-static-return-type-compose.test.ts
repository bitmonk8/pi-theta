// Real filesystem -> production composition -> public diagnostics/registration.
// Only the outer SDK host is doubled. Call-through observations identify all
// four production map constructors; none supplies a semantic verdict or type.
// This does not prove a real host/provider or runtime subagent projection.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as maps from "../src/parser/fn-call-return-types";
import { allDiagnostics, runLoadPass } from "./helpers/compose-workspace-harness";
const P = "---\nmode: prompt\n---\n";
async function workspace(files: Record<string, string>, run: (cwd: string) => Promise<void>) {
  const cwd = realpathSync(mkdtempSync(join(process.cwd(), ".pi", "tmp", "b0513-compose-")));
  try {
    const root = join(cwd, ".pi", "theta");
    mkdirSync(root, { recursive: true });
    writeFileSync(join(cwd, ".pi", "settings.json"), "{}\n");
    for (const [name, source] of Object.entries(files)) writeFileSync(join(root, name), source);
    await run(cwd);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
afterEach(() => vi.restoreAllMocks());

describe("B0513 production call-return composition", () => {
  for (const route of ["direct", "library"] as const) {
    for (const variant of ["bad", "compatible", "unknown", "subagent"] as const) {
      it(`${route}: ${variant} child call payload has the required registration disposition`, async () => {
        const type = variant === "compatible" ? "string" : "integer";
        const annotation = variant === "unknown" ? "" : ": string";
        const modifier = variant === "subagent" ? "subagent " : "";
        await workspace({
          "child.theta": P + `${modifier}fn payload()${annotation} { "value" }\npayload()\n`,
          "lib.thetalib": `fn probe() { invoke<${type}>("./child.theta") }\n`,
          // Caller homonym must not decide the child's payload or library scope.
          "caller.theta": P + 'fn payload(): integer { 1 }\n' + (route === "direct"
            ? `invoke<${type}>("./child.theta")?\n`
            : 'import { probe } from "./lib.thetalib"\nprobe()?\n'),
        }, async cwd => {
          const pass = await runLoadPass({ cwd });
          const rows = allDiagnostics(pass.notes);
          expect(pass.notified).toEqual([]); expect(pass.offChannel).toEqual([]);
          expect([...pass.registered].sort()).toEqual(variant === "bad" ? ["child"] : ["caller", "child"]);
          expect(rows.map(d => [d.severity, d.code])).toEqual(variant === "bad"
            ? [["error", "theta/parse/invoke-return-type-mismatch"]] : []);
          if (variant === "bad") expect(rows[0]?.message).toBe("invoke<Schema> annotation incompatible with callee './child.theta' return type string");
        });
      });
    }
  }

  it("all four constructors derive ordinary maps from their own body, with no imported-return or argument-proof expansion", async () => {
    const original = maps.collectFnCallReturnTypes;
    const observed: { stack: string; keys: string[]; types: unknown[] }[] = [];
    vi.spyOn(maps, "collectFnCallReturnTypes").mockImplementation((statements, shadows) => {
      const result = original(statements, shadows);
      observed.push({ stack: new Error().stack ?? "", keys: [...result.keys()], types: [...result.values()] });
      return result;
    });
    await workspace({
      // A single string param is binder-bypass eligible, keeping this
      // offline composition fixture independent of ambient model settings.
      "child.theta": "---\nmode: prompt\nparams:\n  x: string\n---\nx\n",
      "lib.thetalib": 'fn local(): integer { 1 }\nfn consume(x: integer) { invoke("./child.theta", local()) }\n',
      "caller.theta": P + 'import { consume } from "./lib.thetalib"\nfn local(): string { "a" }\nconsume(local())\n',
    }, async cwd => {
      const pass = await runLoadPass({ cwd });
      // Calls still withhold argument proofs even with known reduced types.
      expect(allDiagnostics(pass.notes)).toEqual([]);
      expect(pass.notified).toEqual([]); expect(pass.offChannel).toEqual([]);
      expect([...pass.registered].sort()).toEqual(["caller", "child"]);
    });
    for (const caller of ["buildTypeLayerWalk", "checkImportedFnCallArgs", "checkInvokeStaticResolution"]) {
      expect(observed.some(o => o.stack.includes(caller)), `real production constructor ${caller} ran`).toBe(true);
    }
    const invoke = observed.filter(o => o.stack.includes("checkInvokeStaticResolution"));
    expect(invoke.some(o => JSON.stringify(o.types) === JSON.stringify([{ kind: "prim", name: "string" }]))).toBe(true);
    expect(invoke.some(o => JSON.stringify(o.types) === JSON.stringify([{ kind: "prim", name: "integer" }]))).toBe(true);
    const importer = observed.filter(o => o.stack.includes("checkImportedFnCallArgs"));
    expect(importer.some(o => JSON.stringify(o.keys) === '["local"]' && JSON.stringify(o.types) === '[{"kind":"prim","name":"string"}]')).toBe(true);
    expect(observed.every(o => !o.keys.includes("consume")), "unannotated/imported consume never gains a return claim").toBe(true);
  });
});
