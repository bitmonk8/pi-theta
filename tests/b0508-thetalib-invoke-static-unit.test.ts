// Bug 0508: isolate the missing bridge from materialised library scopes to
// invoke graph/per-site orchestration. The import parser/materialiser and
// static checkers are real; only filesystem and callee-summary I/O are doubled.
// Every imported fn here is explicitly called: these tests do not adjudicate
// whether unused imports/declarations should contribute checks or graph edges.
import { posix } from "node:path";
import { describe, expect, it } from "vitest";
import { checkThetaImports } from "../src/extension/import-static-checks";
import { buildInvokeGraph, checkInvokeStaticResolution, type CalleeArity } from "../src/extension/invoke-static-checks";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { collectCallSites } from "../src/parser/call-site-collect";
import type { CompatType } from "../src/parser/type-compat";
import { FakeFileSystem } from "./helpers/fake-file-system";
import { parseDeps, parseDoc } from "./helpers/e2e-s1";

const P = "---\nmode: prompt\n---\n";
const APP = "/proj/root/caller.theta";
const LIB = "/proj/root/workers/lib.thetalib";
const CHILD = "/proj/root/workers/child.theta";
const PARAM_CHILD = "---\nmode: prompt\nparams:\n  x: string\n---\nx\n";

function theta(sourcePath: string, source: string): ThetaCompositionInput {
  const doc = parseDoc(source, sourcePath);
  expect(doc.diagnostics, `precondition: clean theta parse ${sourcePath}`).toEqual([]);
  if (doc.frontmatter === null) throw new Error(`precondition: missing frontmatter ${sourcePath}`);
  return { slashName: posix.basename(sourcePath, ".theta"), sourcePath, body: doc.body, frontmatter: doc.frontmatter };
}

async function setup(expression: string, route: "direct" | "reexport" | "transitive" = "direct") {
  const entry = route === "direct" ? "./workers/lib.thetalib" : "./facade.thetalib";
  const files: Record<string, string> = {
    [APP]: P + `schema Expected = string\nimport { probe } from "${entry}"\nprobe()?\n`,
    [LIB]: `schema Expected = integer\nfn probe() { ${expression} }\n`,
    [CHILD]: PARAM_CHILD,
    // Opposite return type and arity at the caller's residence. A library site
    // must not accidentally use this successful but incompatible decoy.
    "/proj/root/child.theta": P + "7\n",
    "/proj/outside.theta": P + '"outside"\n',
    "/proj/root/facade.thetalib": route === "reexport"
      ? 'export { probe } from "./workers/lib.thetalib"\n'
      : 'import { probe as leaf } from "./workers/lib.thetalib"\nfn probe() { leaf() }\n',
  };
  const dirs: Record<string, string[]> = { "/proj": [], "/proj/root": [], "/proj/root/workers": [] };
  for (const path of Object.keys(files)) dirs[posix.dirname(path)]!.push(posix.basename(path));
  const fs = new FakeFileSystem({ cwd: "/proj", homedir: "/home", files, dirs });
  const caller = theta(APP, files[APP]!);
  const imported = await checkThetaImports(caller, { fs, parseDeps: parseDeps() });
  expect(imported.diagnostics, "precondition: import resolution and fn-call shape are clean").toEqual([]);
  expect(imported.imports.map(i => [i.name, i.kind])).toEqual([["probe", "fn"]]);
  const materialized: ThetaCompositionInput = { ...caller, imports: imported.imports, importedTypeDecls: imported.importedTypeDecls };
  const child = theta(CHILD, files[CHILD]!);
  const requests: string[] = [];
  const resolveCalleeArity = async (path: string): Promise<CalleeArity | undefined> => {
    requests.push(path);
    const source = files[path];
    if (source === undefined) return undefined;
    const callee = theta(path, source);
    const fields = callee.frontmatter.params?.fields ?? [];
    return {
      requiredCount: fields.filter(f => !f.hasDefault && f.optional !== true).length,
      totalCount: fields.length,
      fields: fields.map(f => ({ typeSource: f.type, name: f.wireName })),
      mode: callee.frontmatter.mode,
    };
  };
  // Unit boundary: supplied summaries, not the composition root's private
  // cross-file return-inference function. The e2e matrix covers that wiring.
  const resolveCalleeReturnType = async (path: string): Promise<CompatType | undefined> =>
    path === CHILD ? { kind: "prim", name: "string" } : undefined;
  const graph = await buildInvokeGraph([materialized, child], fs);
  const check = (input: ThetaCompositionInput) => checkInvokeStaticResolution(input, {
    fs, activeRoots: ["/proj/root"], graph, resolveCalleeArity, resolveCalleeReturnType,
  });
  const scope = imported.imports[0]!.moduleScope;
  if (scope === undefined) throw new Error("precondition: imported fn must carry declaring scope");
  return { fs, materialized, child, check, scope, requests };
}

const sites = [
  { name: "too-many", code: "theta/parse/invoke-arity-too-many", bad: 'invoke("./child.theta", "x", "y")', good: 'invoke("./child.theta", "x")' },
  { name: "too-few", code: "theta/parse/invoke-arity-too-few", bad: 'invoke("./child.theta")', good: 'invoke("./child.theta", "x")' },
  { name: "arg-type", code: "theta/parse/invoke-arg-type-mismatch", bad: 'invoke("./child.theta", 7)', good: 'invoke("./child.theta", "x")' },
  { name: "arity-before-type", code: "theta/parse/invoke-arity-too-many", bad: 'invoke("./child.theta", 7, 8)', good: 'invoke("./child.theta", "x")' },
  { name: "return-type", code: "theta/parse/invoke-return-type-mismatch", bad: 'invoke<integer>("./child.theta", "x")', good: 'invoke<string>("./child.theta", "x")' },
  { name: "declaring-schema", code: "theta/parse/invoke-return-type-mismatch", bad: 'invoke<Expected>("./child.theta", "x")', good: 'invoke<string>("./child.theta", "x")' },
  { name: "escape", code: "theta/load/invoke-path-escape", bad: 'invoke("../../outside.theta")', good: 'invoke("./child.theta", "x")' },
  { name: "prompt-with-clause", code: "theta/parse/with-clause-prompt-mode-callee", bad: 'invoke("./child.theta", "x") with { cwd: "." }', good: 'invoke("./child.theta", "x")' },
  { name: "missing-callee-warning", code: "theta/load/callee-has-errors", bad: 'invoke("./missing.theta")', good: 'invoke("./child.theta", "x")' },
] as const;

describe("B0508 materialised scope -> invoke static orchestration", () => {
  for (const site of sites) {
    for (const route of ["library", "declaring-body-control", "healthy-control"] as const) {
      it(`${site.name} ${route}`, async () => {
        const s = await setup(route === "healthy-control" ? site.good : site.bad);
        // Supplying the already-parsed declaring document directly is a unit
        // control, not an implementation: proves the walker and emitter work
        // when given the missing document, with its correct residence/schema.
        const input = route === "declaring-body-control"
          ? { ...s.materialized, sourcePath: s.scope.residence, body: s.scope.body, imports: s.scope.imports }
          : s.materialized;
        const diagnostics = await s.check(input);
        expect(diagnostics.map(d => ({ code: d.code, severity: d.severity })), `B0508 unit ${site.name} ${route}: imported-site verdict`).toEqual(route === "healthy-control" ? [] : [{
          code: site.code, severity: site.name === "missing-callee-warning" ? "warning" : "error",
        }]);
        if (route === "declaring-body-control" && !["escape", "missing-callee-warning"].includes(site.name)) {
          expect(s.requests, "resolution uses library residence, never importer decoy").toEqual([CHILD]);
        }
      });
    }
  }

  for (const route of ["direct", "reexport", "transitive"] as const) {
    it(`${route} graph preserves imported fn edge`, async () => {
      const s = await setup('invoke("./child.theta", "x")', route);
      const graph = await buildInvokeGraph([s.materialized, s.child], s.fs);
      expect(graph.edges.get("caller"), `B0508 unit ${route}: importer -> library callee edge`).toEqual(["child"]);
      expect(graph.edges.get("child")).toEqual([]);
    });
    it(`${route} imported edge closes cycle`, async () => {
      const s = await setup('invoke("../caller.theta")', route);
      const graph = await buildInvokeGraph([s.materialized], s.fs);
      const diagnostics = await checkInvokeStaticResolution(s.materialized, {
        fs: s.fs, activeRoots: ["/proj/root"], graph,
        resolveCalleeArity: async () => ({ requiredCount: 0, totalCount: 0, fields: [], mode: "prompt" }),
      });
      expect(diagnostics.map(d => d.code), `B0508 unit ${route}: cycle through called imported fn`).toEqual(["theta/load/invocation-cycle"]);
    });
  }

  it("CONTROL walker reaches nested invoke in parsed library; importer AST is not flattened", async () => {
    const s = await setup('if true { invoke("./child.theta", "x") }');
    expect(collectCallSites(s.materialized.body).invokeExprs).toEqual([]);
    expect(collectCallSites(s.scope.body).invokeExprs.map(i => i.path)).toEqual(["./child.theta"]);
    expect(s.scope.residence).toBe(LIB);
    expect(s.materialized.imports?.[0]?.fn?.name).toBe("probe");
  });

  it("CONTROL materialisation preserves re-export residence and transitive scope", async () => {
    const reexport = await setup('invoke("./child.theta", "x")', "reexport");
    expect(reexport.scope.residence).toBe(LIB);
    const transitive = await setup('invoke("./child.theta", "x")', "transitive");
    expect(transitive.scope.residence).toBe("/proj/root/facade.thetalib");
    expect(transitive.scope.imports.map(i => [i.name, i.moduleScope?.residence])).toEqual([["leaf", LIB]]);
  });
});
