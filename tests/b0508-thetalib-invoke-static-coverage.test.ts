// Approved materialised-function-scope policy: real parser/import materialiser,
// graph and invoke checks; only filesystem/callee-summary I/O is doubled.
import { posix } from "node:path";
import { describe, expect, it } from "vitest";
import { checkThetaImports } from "../src/extension/import-static-checks";
import { buildInvokeGraph, checkInvokeStaticResolution, type CalleeArity } from "../src/extension/invoke-static-checks";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { collectCallSites } from "../src/parser/call-site-collect";
import type { CompatType } from "../src/parser/type-compat";
import { FakeFileSystem } from "./helpers/fake-file-system";
import { parseDeps, parseDoc } from "./helpers/e2e-s1";

const ROOT = "/proj/root";
const P = "---\nmode: prompt\n---\n";
const mismatch = "theta/parse/invoke-return-type-mismatch";
// FakeFileSystem canonicalises case only in realpath(), not readdir().
// The resolver enumerates a case-variant parent before using canonical identity;
// model that host operation explicitly without changing the shared fake.
class CaseInsensitiveProbeFileSystem extends FakeFileSystem {
  override async readdir(path: string): Promise<readonly string[]> {
    return super.readdir(await this.realpath(path));
  }
}
async function setup(libs: Record<string, string>, imports = 'import { entry } from "./lib.thetalib"', extra = "", caseInsensitive = false) {
  const files = Object.fromEntries(Object.entries({
    "caller.theta": P + `schema Expected = string\n${imports}\n${extra}\n0\n`,
    "child.theta": P + '"ok"\n', ...libs,
  }).map(([name, text]) => [posix.join(ROOT, name), text]));
  const dirs: Record<string, string[]> = { [ROOT]: [] };
  for (const path of Object.keys(files)) (dirs[posix.dirname(path)] ??= []).push(posix.basename(path));
  const FS = caseInsensitive ? CaseInsensitiveProbeFileSystem : FakeFileSystem;
  const fs = new FS({ cwd: ROOT, homedir: "/home", files, dirs, caseInsensitive });
  const parse = (name: string): ThetaCompositionInput => {
    const path = posix.join(ROOT, name); const doc = parseDoc(files[path]!, path);
    expect(doc.diagnostics, "clean fixture parse").toEqual([]);
    if (doc.frontmatter === null) throw new Error("missing frontmatter");
    return { slashName: posix.basename(name, ".theta"), sourcePath: path, body: doc.body, frontmatter: doc.frontmatter };
  };
  const caller = parse("caller.theta");
  const imported = await checkThetaImports(caller, { fs, parseDeps: parseDeps() });
  expect(imported.diagnostics, "clean import materialisation").toEqual([]);
  const input = { ...caller, imports: imported.imports, importedTypeDecls: imported.importedTypeDecls };
  const graph = await buildInvokeGraph([input, parse("child.theta")], fs);
  const requests: string[] = [];
  const check = (arity?: CalleeArity, returnType: CompatType | undefined = { kind: "prim", name: "string" }) => checkInvokeStaticResolution(input, {
    fs, activeRoots: [ROOT], graph,
    resolveCalleeArity: async path => { requests.push(path); return arity ?? { requiredCount: 0, totalCount: 0, fields: [], mode: "prompt" }; },
    resolveCalleeReturnType: async () => returnType,
  });
  return { fs, input, graph, check, requests };
}

const bad = 'invoke<integer>("./child.theta")';
const good = 'invoke<string>("./child.theta")';
describe("B0508 approved library scope closure", () => {
  for (const healthy of [false, true]) {
    for (const declaration of ["fn", "subagent fn"]) {
      it(`unused ${declaration} sibling ${healthy ? "healthy" : "bad"}`, async () => {
        const s = await setup({ "lib.thetalib": `fn entry() { 0 }\n${declaration} unused() { ${healthy ? good : bad} }\n` });
        expect((await s.check()).map(d => d.code)).toEqual(healthy ? [] : [mismatch]);
        expect(s.graph.edges.get("caller")).toEqual(["child"]);
      });
    }
    it(`unused imported function ${healthy ? "healthy" : "bad"}`, async () => {
      const s = await setup({ "lib.thetalib": `fn entry() { ${healthy ? good : bad} }\n` });
      expect((await s.check()).map(d => d.code)).toEqual(healthy ? [] : [mismatch]);
    });
    it(`unused transitive function import ${healthy ? "healthy" : "bad"}`, async () => {
      const s = await setup({
        "lib.thetalib": 'import { helper } from "./leaf.thetalib"\nfn entry() { 0 }\n',
        "leaf.thetalib": `fn helper() { ${healthy ? good : bad} }\n`,
      });
      const rows = await s.check();
      expect(rows.map(d => d.code)).toEqual(healthy ? [] : [mismatch]);
      if (!healthy) expect(rows[0]?.file).toBe(ROOT + "/leaf.thetalib");
    });
  }
  it("re-export aliases select terminal scope, not facade sibling; independent facade fn activates it", async () => {
    const libs = {
      "lib.thetalib": 'export { terminal as entry } from "./leaf.thetalib"\nfn unused() { invoke<integer>("./child.theta") }\n',
      "leaf.thetalib": 'schema Expected = string\nfn terminal() { invoke<Expected>("./child.theta") }\n',
    };
    const s = await setup(libs, 'import { entry as alias } from "./lib.thetalib"');
    expect(await s.check()).toEqual([]);
    const activated = await setup(libs, 'import { entry, unused } from "./lib.thetalib"');
    expect((await activated.check()).map(d => [d.code, d.file])).toEqual([[mismatch, ROOT + "/lib.thetalib"]]);
  });
  for (const kind of ["schema", "enum"]) {
    it(`${kind}-only root and dependency exclude function invokes`, async () => {
      const declaration = kind === "schema" ? "schema T = string" : "enum T { One, Two }";
      const leaf = `${declaration}\nfn broken() { invoke("./caller.theta") }\n`;
      for (const rootImport of [true, false]) {
        const s = await setup({
          "leaf.thetalib": leaf,
          "lib.thetalib": 'import { T } from "./leaf.thetalib"\nfn entry() { 0 }\n',
        }, rootImport ? 'import { T } from "./leaf.thetalib"' : undefined);
        expect(await s.check()).toEqual([]);
        expect(s.graph.edges.get("caller")).toEqual([]);
      }
    });
  }
  it("aliases and diamonds visit one physical scope once without merging same-basename scopes", async () => {
    const s = await setup({
      "lib.thetalib": 'import { f } from "./left/same.thetalib"\nimport { f as g } from "./right/same.thetalib"\nfn entry() { 0 }\n',
      "left/same.thetalib": 'import { leaf } from "../leaf.thetalib"\nfn f() { 0 }\n',
      "right/same.thetalib": 'import { leaf } from "../leaf.thetalib"\nfn f() { invoke<integer>("../child.theta") }\n',
      "leaf.thetalib": `fn leaf() { ${bad} }\n`,
    }, 'import { entry, entry as duplicate } from "./lib.thetalib"');
    const rows = await s.check();
    expect(rows.map(d => d.file)).toEqual([ROOT + "/leaf.thetalib", ROOT + "/right/same.thetalib"]);
    expect(s.requests).toEqual([ROOT + "/child.theta", ROOT + "/child.theta"]);
    expect(s.graph.edges.get("caller")).toEqual(["child"]);
  });
  it("case-variant declaring routes materialise one canonical scope and canonical target", async () => {
    const s = await setup({ "workers/lib.thetalib": 'fn entry() { invoke<integer>("../CHILD.theta") }\n' },
      'import { entry } from "./workers/lib.thetalib"\nimport { entry as alias } from "./WORKERS/lib.thetalib"', "", true);
    expect(s.input.imports.map(i => i.moduleScope?.residence)).toEqual([ROOT + "/workers/lib.thetalib", ROOT + "/workers/lib.thetalib"]);
    expect((await s.check()).map(d => d.code)).toEqual([mismatch]);
    expect(s.graph.edges.get("caller")).toEqual(["child"]);
    expect(s.requests).toHaveLength(1);
  });
  for (const reverse of [false, true]) {
    for (const mode of ["prompt", "subagent"] as const) {
      it(`complete library graph under actual input order reverse=${reverse}, mode=${mode}`, async () => {
        const bSource = P + 'import { entry } from "./b.thetalib"\n0\n';
        const s = await setup({
          "lib.thetalib": 'fn entry() { invoke("./b.theta") }\n',
          "b.thetalib": 'fn entry() { invoke("./caller.theta") }\n', "b.theta": bSource,
        });
        const doc = parseDoc(bSource, ROOT + "/b.theta");
        expect(doc.diagnostics).toEqual([]);
        if (doc.frontmatter === null) throw new Error("missing frontmatter");
        const b: ThetaCompositionInput = { sourcePath: ROOT + "/b.theta", slashName: "b", body: doc.body, frontmatter: { ...doc.frontmatter, mode } };
        const imported = await checkThetaImports(b, { fs: s.fs, parseDeps: parseDeps() });
        expect(imported.diagnostics).toEqual([]);
        const inputs = [s.input, { ...b, imports: imported.imports }];
        const graph = await buildInvokeGraph(reverse ? inputs.reverse() : inputs, s.fs);
        expect(graph.edges.get("caller")).toEqual(["b"]); expect(graph.edges.get("b")).toEqual(["caller"]);
        for (const input of inputs) {
          expect((await checkInvokeStaticResolution(input, {
            fs: s.fs, activeRoots: [ROOT], graph,
            resolveCalleeArity: async () => ({ requiredCount: 0, totalCount: 0, fields: [], mode }),
          })).map(d => d.code)).toEqual(["theta/load/invocation-cycle"]);
        }
      });
    }
  }
  it("composite annotation accepts narrower string and rejects disjoint boolean", async () => {
    const s = await setup({ "lib.thetalib": 'fn entry() { invoke<string | integer>("./child.theta") }\n' });
    expect(await s.check()).toEqual([]);
    expect((await s.check(undefined, { kind: "prim", name: "boolean" })).map(d => d.code)).toEqual([mismatch]);
  });
  it("syntactic self-cycle in false branch remains location-less", async () => {
    const s = await setup({ "lib.thetalib": 'fn entry() { if false { invoke("./caller.theta") } }\n' });
    const rows = await s.check();
    expect(rows).toEqual([{ severity: "error", code: "theta/load/invocation-cycle", message: "invocation cycle: caller → caller" }]);
  });
  it("located library range is the actual multiline invoke expression", async () => {
    const s = await setup({ "lib.thetalib": `fn entry() {\n  0\n  ${bad}\n}\n` });
    const rows = await s.check();
    const scope = s.input.imports[0]!.moduleScope!;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ file: ROOT + "/lib.thetalib", range: collectCallSites(scope.body).invokeExprs[0]!.range });
    expect(rows[0]?.range?.start.line).toBe(3);
  });
  it("materialised imported alias closure, not caller homonym, supplies annotation types", async () => {
    for (const type of ["integer", "string"]) {
      const s = await setup({
        "lib.thetalib": 'import { Payload as Expected } from "./types.thetalib"\nfn entry() { invoke<Expected>("./child.theta") }\n',
        "types.thetalib": `schema Base = ${type}\nschema Payload = Base\n`,
      });
      expect((await s.check()).map(d => d.code)).toEqual(type === "integer" ? [mismatch] : []);
    }
  });
  it("multiple mistyped argument slots remain separate and arity still precedes type", async () => {
    const s = await setup({ "lib.thetalib": 'fn entry() { invoke("./child.theta", 1, 2) }\n' });
    const arity: CalleeArity = { requiredCount: 2, totalCount: 2, fields: [{ name: "x", typeSource: "string" }, { name: "y", typeSource: "string" }], mode: "prompt" };
    expect((await s.check(arity)).map(d => d.code)).toEqual(["theta/parse/invoke-arg-type-mismatch", "theta/parse/invoke-arg-type-mismatch"]);
    expect((await s.check({ ...arity, requiredCount: 0, totalCount: 0, fields: [] })).map(d => d.code)).toEqual(["theta/parse/invoke-arity-too-many"]);
  });
  it("subagent cwd uses existing string slot checks", async () => {
    for (const cwd of ["7", '"."']) {
      const s = await setup({ "lib.thetalib": `fn entry() { invoke("./child.theta") with { cwd: ${cwd} } }\n` });
      expect((await s.check({ requiredCount: 0, totalCount: 0, fields: [], mode: "subagent" })).map(d => d.code)).toEqual(cwd === "7" ? ["theta/parse/invoke-arg-type-mismatch"] : []);
    }
  });
  it("unknown callee return and unknown argument retain existing deferrals", async () => {
    const s = await setup({ "lib.thetalib": 'fn entry(value) { invoke<integer>("./child.theta", value) }\n' });
    // Omitted summary models an undecidable callee, not an incompatible string.
    const rows = await checkInvokeStaticResolution(s.input, {
      fs: new FakeFileSystem({ cwd: ROOT, homedir: "/home", files: { [ROOT + "/child.theta"]: P }, dirs: { [ROOT]: ["child.theta"] } }),
      activeRoots: [ROOT], graph: s.graph,
      resolveCalleeArity: async () => ({ requiredCount: 1, totalCount: 1, fields: [{ name: "x", typeSource: "string" }], mode: "prompt" }),
      resolveCalleeReturnType: async () => undefined,
    });
    expect(rows).toEqual([]);
  });
});
