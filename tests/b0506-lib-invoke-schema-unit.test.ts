// Bug 0506 diagnosis: isolate module materialisation, invoke-site selection,
// and AJV separately. These are OFFLINE UNIT tests, not the E2E witness.
// The filesystem and driven child result are doubles; the parser, loader,
// LexicalEnvironment, InvokeMachinery, lowering and AJV are production code.
// No new production API is assumed. Existing real-host witnesses cover the
// parser/host/child composition that these seam-level tests do not prove.
import type { ExtensionCommandContext, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { checkThetaImports } from "../src/extension/import-static-checks";
import { InvokeMachinery } from "../src/extension/invoke-machinery";
import { resolveReturnSite, validateInvokeReturn } from "../src/extension/invoke-return-validation";
import { mergedEnumDeclsOf, mergedSchemaDeclsOf } from "../src/extension/query-text-render";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { lowerQueryResponseSchema } from "../src/parser/query-schema-lowering";
import { parseThetaDocument, type InvokeExpr } from "../src/parser/theta-document";
import { LexicalEnvironment } from "../src/runtime/lexical-environment";
import { makeErr, makeOk, type ResultValue } from "../src/runtime/value";
import type { SchemaValidator, LoweredSchema } from "../src/seams/schema-validator";
import { noopPi, rootDouble } from "./helpers/call-with-clause-harness";
import { parseDeps } from "./helpers/e2e-s1";
import { FakeFileSystem } from "./helpers/fake-file-system";
import { ajv } from "./helpers/scripted-live-session-harness";

const APP = "/b0506/caller.theta";
const LIB = "/b0506/workers/lib.thetalib";
const TYPES = "/b0506/workers/types.thetalib";
const CHILD = "/b0506/workers/child.theta";
const FM = "---\nmode: prompt\n---\n";
const LIB_SCHEMA = "schema ROut { tag: string }";
const CONFLICT = "schema ROut { other: boolean }";
const SHAPE = {
  type: "object", properties: { tag: { type: "string" } },
  required: ["tag"], additionalProperties: false,
};
const ENUM_SHAPE = { type: "string", enum: ["yes", "no"] };
const VALIDATION_ERROR = {
  ok: false,
  error: {
    kind: "invoke_infra", cause: "return_validation", callee_path: "./child.theta",
    message: "invoke<ROut> return value failed validation",
  },
};

function parse(path: string, source: string) {
  const doc = parseThetaDocument({ path, bytes: new TextEncoder().encode(source) }, parseDeps());
  expect(doc.diagnostics, `fixture ${path} must parse without diagnostics`).toEqual([]);
  return doc;
}

function theta(path: string, source: string): ThetaCompositionInput {
  const doc = parse(path, source);
  if (doc.frontmatter === null) throw new Error(`fixture ${path} requires frontmatter`);
  return {
    slashName: "unit", sourcePath: path, body: doc.body, frontmatter: doc.frontmatter,
    callableSet: { entries: new Map() },
  };
}

async function loaded(callerSchema: string, importedSchema = false) {
  const libSource = [
    importedSchema ? 'import { ROut, Choice } from "./types.thetalib"' : LIB_SCHEMA,
    'fn via_lib() { invoke<ROut>("./child.theta") }',
  ].join("\n");
  const caller = theta(APP, FM + 'import { via_lib } from "./workers/lib.thetalib"\n' + callerSchema + "\nvia_lib()\n");
  const fs = new FakeFileSystem({
    homedir: "/home/unit", cwd: "/b0506",
    files: { [LIB]: libSource, [TYPES]: LIB_SCHEMA + '\nenum Choice { Yes = "yes", No = "no" }\n' },
    dirs: { "/b0506/workers": ["lib.thetalib", "types.thetalib"] },
  });
  const check = await checkThetaImports(caller, { fs, parseDeps: parseDeps() });
  expect(check.diagnostics, "clean loader prerequisites").toEqual([]);
  expect(check.imports.map((imp) => imp.name)).toEqual(["via_lib"]);
  const scope = check.imports[0]?.moduleScope;
  if (scope === undefined) throw new Error("loader must supply declaring module scope");
  const root = new LexicalEnvironment({ body: caller.body, imports: check.imports });
  const fn = root.resolve("via_lib");
  if (fn.fn === undefined || fn.moduleEnv === undefined) throw new Error("imported fn must carry its own moduleEnv");
  const expr = fn.fn.body.tail;
  if (expr?.kind !== "invoke") throw new Error("library fixture must have an invoke tail");
  const env = fn.moduleEnv.childFnActivation().child();
  expect(root.currentResidence()).toBeUndefined();
  expect(env.currentResidence(), "residence survives activation and nested scopes").toBe(LIB);
  return { caller: { ...caller, imports: check.imports, importedTypeDecls: check.importedTypeDecls }, scope, env, expr };
}

/** Only the child payload and parse seam are controlled, never the return validator. */
async function drive(callerSchema: string, payload: ResultValue, importedSchema = false) {
  const fixture = await loaded(callerSchema, importedSchema);
  const schemas: LoweredSchema[] = [];
  const real = ajv();
  const recorder: SchemaValidator = {
    compile: (schema) => { schemas.push(schema); return real.compile(schema); },
  };
  const parseCalls: unknown[] = [];
  const lifecycle: string[] = [];
  const callee = theta(CHILD, "---\nmode: subagent\n---\nnull\n");
  const machinery = new InvokeMachinery({
    input: {
      pi: noopPi(), root: { ...rootDouble(), schemaValidator: recorder },
      modelRegistry: {} as ModelRegistry,
      parseCallee: async (base, path) => { parseCalls.push([base, path]); return { kind: "ok", input: callee }; },
    },
    systemNoteChannel: () => { throw new Error("unit must not emit system notes"); },
    recoverDeclaredDefaults: async () => { throw new Error("fixture has no params"); },
    bindPromptConversation: () => { throw new Error("unit selects the spawned return seam"); },
    spawnSubagentConversation: async () => ({
      drivenAgainst: "subagent-private-session",
      drive: async () => { lifecycle.push("drive"); return payload; },
      teardown: () => { lifecycle.push("teardown"); },
      finishInvocation: () => { lifecycle.push("finish"); },
    }),
  });
  const child = machinery.resolveInvoke(
    fixture.caller, fixture.expr as InvokeExpr, fixture.env,
    { cwd: "/b0506" } as ExtensionCommandContext,
    { depth: 1 }, new AbortController().signal, "prompt", undefined, undefined,
  );
  expect(child.resolvedCalleePath).toBe(CHILD);
  const outcome = await child.drive();
  expect(parseCalls, "path uses the library even when the return scope is wrong").toEqual([[LIB, "./child.theta"]]);
  expect(lifecycle, "cleanup is complete before asserting bug semantics").toEqual(["drive", "teardown", "finish"]);
  return { outcome, schemas };
}

describe("B0506 module type-declaration carrier", () => {
  it("retains own-body schema and lexical residence CONTROL", async () => {
    const { scope } = await loaded("");
    expect(lowerQueryResponseSchema("ROut", mergedSchemaDeclsOf(scope), mergedEnumDeclsOf(scope))).toEqual(SHAPE);
  });
  it("retains the library's imported schema shape for lowering", async () => {
    const { scope } = await loaded("", true);
    expect(scope.imports.map((imp) => [imp.kind, imp.name])).toEqual([["schema", "ROut"], ["enum", "Choice"]]);
    expect(lowerQueryResponseSchema("ROut", mergedSchemaDeclsOf(scope), mergedEnumDeclsOf(scope)),
      "B0506 module imported schema shape").toEqual(SHAPE);
  });
  it("retains the library's imported enum shape for lowering", async () => {
    const { scope } = await loaded("", true);
    expect(lowerQueryResponseSchema("Choice", mergedSchemaDeclsOf(scope), mergedEnumDeclsOf(scope)),
      "B0506 module imported enum shape").toEqual(ENUM_SHAPE);
  });
});

describe("B0506 invoke selection isolated from child execution", () => {
  for (const importedSchema of [false, true]) {
    const origin = importedSchema ? "imported library schema" : "local library schema";
    it(`${origin}: missing caller rejects wrong shape`, async () => {
      const { outcome } = await drive("", makeOk("not-an-ROut"), importedSchema);
      expect(outcome, "B0506 isolated wrong-shape result").toEqual({ source: "boundary-minted", result: VALIDATION_ERROR });
    });
    it(`${origin}: conflicting caller accepts library shape`, async () => {
      const { outcome } = await drive(CONFLICT, makeOk({ tag: "x" }), importedSchema);
      expect(outcome, "B0506 isolated conformant result").toEqual({ source: "callee-returned", result: { ok: true, value: { tag: "x" } } });
    });
    it(`${origin}: selected AJV schema is the declaring shape, not an empty/caller shape`, async () => {
      const { schemas } = await drive("", makeOk("not-an-ROut"), importedSchema);
      expect(schemas[0], "B0506 isolated selected AJV schema").toEqual(SHAPE);
    });
    it(`${origin}: matching caller rejects bad and accepts good CONTROL`, async () => {
      const bad = await drive(LIB_SCHEMA, makeOk("not-an-ROut"), importedSchema);
      expect(bad.outcome).toEqual({ source: "boundary-minted", result: VALIDATION_ERROR });
      const good = await drive(LIB_SCHEMA, makeOk({ tag: "x" }), importedSchema);
      expect(good.outcome).toEqual({ source: "callee-returned", result: { ok: true, value: { tag: "x" } } });
    });
  }
});

describe("B0506 added carrier and closure protection", () => {
  it("keeps module metadata through activation, iteration and isolated roots, but never app scopes", async () => {
    const { scope, env, caller } = await loaded("", true);
    for (const nested of [env, env.childFnActivation(), env.bindIterationVariable("i", 1), env.spawnIsolatedScope().child()]) {
      expect(nested.currentTypeDeclarationSite()).toBe(scope);
    }
    const app = new LexicalEnvironment({ body: caller.body });
    for (const nested of [app, app.child(), app.childFnActivation(), app.spawnIsolatedScope()]) {
      expect(nested.currentTypeDeclarationSite()).toBeUndefined();
    }
  });
  it("captures independent module sites without leaking even with concurrent drives", async () => {
    const [bad, good] = await Promise.all([
      drive("", makeOk("not-an-ROut"), true),
      drive(CONFLICT, makeOk({ tag: "x" }), false),
    ]);
    expect(bad.outcome).toEqual({ source: "boundary-minted", result: VALIDATION_ERROR });
    expect(good.outcome).toEqual({ source: "callee-returned", result: makeOk({ tag: "x" }) });
    const { env, scope } = await loaded("");
    expect(env.currentTypeDeclarationSite()).toBe(scope);
    expect(scope.importedTypeDecls).toEqual({ schemas: [], enums: [] });
  });

  async function moduleCheck(lib: string, types: string, extra: Record<string, string> = {}) {
    const caller = theta(APP, FM + 'import { one, two } from "./workers/lib.thetalib"\nnull\n');
    const files = { [LIB]: lib + '\nfn one() { null }\nfn two() { null }\n', [TYPES]: types, ...extra };
    const fs = new FakeFileSystem({ homedir: "/home/unit", cwd: "/b0506", files,
      dirs: { "/b0506/workers": Object.keys(files).map((p) => p.split("/").at(-1)!) } });
    const check = await checkThetaImports(caller, { fs, parseDeps: parseDeps() });
    const scope = check.imports[0]?.moduleScope;
    if (scope === undefined) throw new Error("missing module scope");
    return { check, scope };
  }
  it("retains aliases, recursive source names, sibling dependencies and explicit enum wires", async () => {
    const { check, scope } = await moduleCheck(
      'import { Node as Alias, Choice as Pick } from "./types.thetalib"',
      'enum Choice { Yes = "yes", No = "no" }\nschema Node { choice: Choice, children: array<Node> }',
    );
    expect(check.diagnostics).toEqual([]);
    expect(scope.importedTypeDecls?.schemas.map((s) => s.name)).toEqual(["Node", "Alias"]);
    expect(scope.importedTypeDecls?.enums.map((e) => e.name)).toEqual(["Choice", "Pick"]);
    const lowered = lowerQueryResponseSchema("Alias", mergedSchemaDeclsOf(scope), mergedEnumDeclsOf(scope));
    if (lowered === undefined) throw new Error("missing alias schema");
    const validator = ajv().compile(lowered);
    expect(validator.validate({ choice: "yes", children: [{ choice: "no", children: [] }] }).ok).toBe(true);
    expect(validator.validate({ choice: "invalid", children: [] }).ok).toBe(false);
  });
  it("refuses a module-local alias collision once even when two functions share the module", async () => {
    const line = 'import { Wrapper as Detail } from "./types.thetalib"';
    const { check } = await moduleCheck(line, 'schema Detail { n: integer }\nschema Wrapper { detail: Detail }');
    expect(check.diagnostics).toHaveLength(1);
    expect(check.diagnostics[0]).toMatchObject({
      severity: "error", code: "theta/load/imported-type-name-collision", file: LIB,
      message: "imported type name 'Detail' is claimed by two different declarations in the imported schema closure; disambiguate with a different 'as' alias",
      range: { start: { line: 1, column: line.indexOf("Wrapper") + 1 }, end: { line: 1, column: line.indexOf("Detail") + 7 } },
    });
    expect(check.diagnostics[0]?.hint).toBeTruthy();
  });
  for (const identical of [false, true]) {
    it(`module cross-specifier ${identical ? "position-shifted diamond admits" : "different shape refuses"}`, async () => {
      const { check } = await moduleCheck(
        'import { A } from "./types.thetalib"\nimport { B } from "./other.thetalib"',
        'schema Shared { n: integer }\nschema A { s: Shared }',
        { "/b0506/workers/other.thetalib": `\nschema Shared { n: ${identical ? "integer" : "string"} }\nschema B { s: Shared }` },
      );
      if (identical) expect(check.diagnostics).toEqual([]);
      else {
        expect(check.diagnostics).toHaveLength(1);
        expect(check.diagnostics[0]).toMatchObject({ file: LIB, code: "theta/load/imported-type-name-collision", range: { start: { line: 2 } } });
      }
    });
  }
});

describe("B0506 lowering and validation healthy controls", () => {
  it("unresolved name lowers to {} (not undefined) and real AJV admits the wrong string", () => {
    const lowered = lowerQueryResponseSchema("ROut", [], []);
    expect(lowered).toEqual({});
    if (lowered === undefined) throw new Error("expected permissive schema, not absent schema");
    expect(ajv().compile(lowered).validate("not-an-ROut")).toEqual({ ok: true });
  });
  it("a correct declaration site rejects with the exact infra error and accepts the conformant payload", () => {
    const body = parse(LIB, LIB_SCHEMA).body;
    const site = { annotation: "ROut", declarations: body };
    const validator = ajv();
    expect(validateInvokeReturn(validator, "./child.theta", site, makeOk("not-an-ROut"), CHILD)).toEqual(VALIDATION_ERROR);
    expect(validateInvokeReturn(validator, "./child.theta", site, makeOk({ tag: "x" }), CHILD)).toEqual({ ok: true, value: { tag: "x" } });
  });
  it("an explicitly supplied imported declaration site validates without a same-file schema", () => {
    const body = parse(LIB, "").body;
    const types = parse(TYPES, LIB_SCHEMA).body;
    const schemas = mergedSchemaDeclsOf({ body: types });
    const site = { annotation: "ROut", declarations: body, importedTypeDecls: { schemas, enums: [] } };
    expect(validateInvokeReturn(ajv(), "./child.theta", site, makeOk("not-an-ROut"), CHILD)).toEqual(VALIDATION_ERROR);
    expect(validateInvokeReturn(ajv(), "./child.theta", site, makeOk({ tag: "x" }), CHILD)).toEqual({ ok: true, value: { tag: "x" } });
  });
  it("top-level annotated uses caller imports; inferred uses callee declarations; untyped has no site", () => {
    const caller = theta(APP, FM + "null\n");
    const imported = { schemas: mergedSchemaDeclsOf({ body: parse(TYPES, LIB_SCHEMA).body }), enums: [] };
    const callee = theta(CHILD, FM + 'schema Kid { n: number }\nKid { n: 7 }\n');
    const annotated = resolveReturnSite({ ...caller, importedTypeDecls: imported }, { kind: "annotated", annotation: "ROut" }, callee);
    expect(annotated).toEqual({ annotation: "ROut", declarations: caller.body, importedTypeDecls: imported });
    expect(resolveReturnSite(caller, { kind: "callee-inferred" }, callee)).toEqual({ annotation: "Kid", declarations: callee.body });
    expect(resolveReturnSite(caller, { kind: "untyped" }, callee)).toBeNull();
  });
  it("Err and no-site results pass through by identity without compiling AJV", () => {
    const never: SchemaValidator = { compile: () => { throw new Error("must not compile"); } };
    const error = makeErr({ kind: "cancelled", message: "unit cancellation" });
    const site = { annotation: "ROut", declarations: parse(LIB, LIB_SCHEMA).body };
    expect(validateInvokeReturn(never, "./child.theta", site, error, CHILD)).toBe(error);
    const ok = makeOk("untyped payload");
    expect(validateInvokeReturn(never, "./child.theta", null, ok, CHILD)).toBe(ok);
  });
});
