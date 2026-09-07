import { describe, expect, it } from "vitest";
import {
  runTypedQueryLoop,
  type ForcedRespondTurn,
  type FreePhaseTurn,
  type QueryModelDriver,
  type QueryToolLoopConfig,
  type TypedQuerySchemaValidation,
} from "../src/runtime/query-tool-loop";
import { buildTypedQueryValidation } from "../src/runtime/typed-query-validation";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import {
  mergedSchemaDeclsOf,
  mergedEnumDeclsOf,
} from "../src/extension/production-theta-producer";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import type { EnumDecl, SchemaDecl, ThetaDocument } from "../src/parser/theta-document";
import type { Checkpoint } from "../src/seams/checkpoint";
import { checkThetaImports } from "../src/extension/import-static-checks";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { FileSystem } from "../src/seams/file-system";
import { parseDeps, parseDoc } from "./helpers/e2e-s1";

// Bug 0465 — a typed `@<Schema>` query (or `invoke<Schema>` return) whose
// annotation names a schema IMPORTED from a `.thetalib` lowers to the permissive
// `{}`, so QRY-22's whole chain goes vacuous: the respond tool conveys no shape,
// AJV accepts every payload, respond-repair never engages, and a reply missing a
// required key binds as the typed query's `Ok` value. The byte-identical theta
// with the schema declared same-file refuses that same reply with `must have
// required property 'filed'` and drives repair.
//
// ROOT CAUSE (re-derived at HEAD 67a1c9a0 / v0.461.0): both producer call sites
// hand `lowerQueryResponseSchema` (src/runtime/query-schema-lowering.ts:153) the
// importing file's OWN `schema`/`enum` declarations only — the typed `@`-query
// site (src/extension/production-theta-producer.ts:3187, over
// `schemaDeclsOf(deps.theta.body)` at :3189) and `#validateInvokeReturn`
// (production-theta-producer.ts:4551, lowering at :4516 over the return site's
// `declarations` resolved by `#resolveReturnSite` at :4433). An imported name is
// absent from those decls, so the IDENTIFIER arm
// (query-schema-lowering.ts:166 / the `bodyTypeMap.get(s)` miss at :167) falls
// through to the unresolved-name arm and lowers `{}`. The seam is TOTAL by
// design (0028 §Fix: it must keep returning `{}` for a genuinely unresolvable
// name); the fix widens the DECLARATION INPUTS the producer passes, resolution
// moving before this seam — so the CONTROL cells below, which feed the same seam
// the byte-identical declaration same-file, already produce the exact declared
// shape and validation the imported cells owe.
//
// SPEC VIOLATED — three sentences, none licensing the imported class:
//   - schema-subset.md:72 (Lowering Algorithm step 1): the lowering "Collects
//     every named schema … (and transitively imported from `.thetalib` files
//     used by the file)". The shipped lowering collects same-file decls only.
//   - query/query-failure-and-repair.md:78 (QRY-22): the runtime MUST resolve
//     the annotation to its declared shape, convey it, validate against it, and
//     MUST NOT bind a response not validated against its declared schema.
//   - invocation.md:28 (Typed return): `invoke<Schema>` returns are AJV-validated
//     "against the schema" — the declared one, not a fragment accepting everything.
//
// TIER — unit, offline, deterministic, provider-free: the doc's e2e-S3 shape
// (real `parseThetaDocument` via `parseDoc`, producer-faithful
// `lowerQueryResponseSchema` inputs, real `AjvSchemaValidator`, real
// `buildTypedQueryValidation` + `runTypedQueryLoop` with a scripted
// `QueryModelDriver`), plus real `checkThetaImports` over an in-memory FS for the
// parse/load-silence invariant. A higher tier is insufficient rather than merely
// heavier: the defect's decision point is the lowering the producer wires
// SYNCHRONOUSLY before any provider turn, so an integration/live tier would add a
// provider to a seam no model participates in and could not sharpen the "binds
// Ok vs refuses" contrast the scripted driver pins deterministically.
//
// NO SILENT SKIPPING (CLAUDE.md): nothing early-returns or branches on the
// environment. A schema that fails to lower, a frontmatter that did not parse,
// and a library that did not materialise each FAIL LOUDLY naming the unmet
// precondition, so no assertion is measured vacuously.

// ===========================================================================
// Shared fixtures — the doc's §Reproduction fixtures verbatim.
// ===========================================================================

/** The importing `.theta`'s frontmatter (doc §Reproduction: `model`, `mode`). */
const FM = ["---", 'model: "sonnet"', "mode: prompt", "---", ""].join("\n");

/** The shared lib schema — the typed contract that crosses a subagent boundary. */
const REVIEW_SUMMARY_DECL = [
  "schema ReviewSummary {",
  "  shard: string,",
  "  filed: integer,",
  "  notes: string",
  "}",
].join("\n");

const LIB_PATH = "/proj/quality.thetalib";
const APP_PATH = "/proj/app.theta";

/**
 * The incident-shaped reply: the required `filed` key is absent (doc
 * §Reproduction). A schema that constrains the declared fields refuses it with
 * `must have required property 'filed'`; the permissive `{}` accepts it whole.
 */
const MISSING_KEY_REPLY = { shard: "shard-03.json", notes: "two candidates staged" } as const;

/**
 * The declared shape `ReviewSummary` MUST lower to — the QRY-22 validating
 * schema. This is the exact fragment the same-file control produces (proven
 * green in every control cell), and the exact fragment each imported cell owes.
 */
const DECLARED_REVIEW_SUMMARY: Record<string, unknown> = {
  type: "object",
  properties: {
    shard: { type: "string" },
    filed: { type: "integer" },
    notes: { type: "string" },
  },
  required: ["shard", "filed", "notes"],
  additionalProperties: false,
};

// ===========================================================================
// Substrate — the e2e-S3 harness shape (mirrors
// tests/e2e-s3-typed-query-conformance.test.ts).
// ===========================================================================

const NOOP_CHECKPOINT: Checkpoint = { before: (): Promise<void> => Promise.resolve() };

function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

/** A typed query dispatches only the forced-respond terminator (`max_rounds: 0`). */
function config(): QueryToolLoopConfig {
  return {
    maxRounds: 0,
    querySite: { file: "app.theta", line: 1, column: 1 },
    thetaSlashName: "/app",
    invocationId: "inv-0465",
    occurredAt: 0,
  };
}

/** A scripted model whose forced-respond turn carries `payload`. */
class RespondingModel implements QueryModelDriver {
  constructor(private readonly payload: unknown) {}
  nextFreePhaseTurn(): Promise<FreePhaseTurn> {
    throw new Error("no free-phase turn on a max_rounds:0 typed query");
  }
  runToolBatch(): Promise<readonly never[]> {
    throw new Error("no tool batch on a max_rounds:0 typed query");
  }
  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    return Promise.resolve({ kind: "respond", payload: this.payload });
  }
}

function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: "review-summary",
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

/** Parse an importing `.theta` body under the shared frontmatter. */
function parseApp(body: string, path = APP_PATH): ThetaDocument {
  const doc = parseDoc(FM + body, path);
  expect(
    doc.frontmatter,
    `PRECONDITION: the theta frontmatter must parse, else the body is read against nothing. Diagnostics: ${JSON.stringify(doc.diagnostics.map((d) => d.code))}`,
  ).not.toBeNull();
  return doc;
}

/** The body's `schema` decls — byte-faithful to production `schemaDeclsOf`. */
function schemaDeclsOf(doc: ThetaDocument): readonly SchemaDecl[] {
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}

/** The body's `enum` decls — byte-faithful to production `enumDeclsOf`. */
function enumDeclsOf(doc: ThetaDocument): readonly EnumDecl[] {
  return doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
}

/**
 * Lower `annotation` over the importing file's OWN declarations only — the
 * SAME-FILE half of what the producer's typed-query call site merges
 * post-fix (the `lowerQueryResponseSchema` call in `ProductionThetaProducer`'s
 * typed-`@`-query dispatch, over `mergedSchemaDeclsOf(deps.theta)` /
 * `mergedEnumDeclsOf(deps.theta)`). Used by every SF control cell, where
 * same-file-only IS the
 * merge (no import to widen it with); the IMP cells route through
 * `producerLowerImported` below, which drives the real merged inputs.
 * `undefined` means the seam found no lowerable shape at all; every caller
 * here treats that as a loud failure rather than a silent skip.
 */
function producerLower(annotation: string, doc: ThetaDocument): LoweredSchema {
  const lowered = lowerQueryResponseSchema(annotation, schemaDeclsOf(doc), enumDeclsOf(doc));
  expect(
    lowered,
    `PRECONDITION: \`${annotation}\` lowered to undefined — the annotation carries no lowerable shape at all, a different failure than the vacuous \`{}\` this bug is about.`,
  ).toBeDefined();
  return lowered as LoweredSchema;
}

/**
 * Bug 0465 fix wiring — lower `annotation` exactly as the producer's typed-query
 * call site does POST-FIX (`mergedSchemaDeclsOf(deps.theta)` /
 * `mergedEnumDeclsOf(deps.theta)`, production-theta-producer.ts): the real load
 * pass's `checkThetaImports` resolves `doc`'s imports over `libFiles` (an
 * in-memory `.thetalib` FS, the same double cell 5's invariant already uses),
 * its `importedTypeDecls` channel is filtered same-file-wins and merged
 * imported-first ahead of the body's own decls, and the merged sets feed the
 * SAME `lowerQueryResponseSchema` seam `producerLower` calls — real production
 * data-flow, not hand-fabricated decls, so a regression in the load-pass
 * channel or the merge reds here exactly as it would in production.
 */
async function producerLowerImported(
  annotation: string,
  doc: ThetaDocument,
  libFiles: Record<string, string>,
): Promise<{ lowered: LoweredSchema; decls: readonly SchemaDecl[] }> {
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: APP_PATH,
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const result = await checkThetaImports(input, {
    fs: fakeThetaLibFs(libFiles),
    parseDeps: parseDeps(),
  });
  expect(
    result.diagnostics,
    `PRECONDITION: the load pass must resolve the import with no diagnostic. Diagnostics: ${JSON.stringify(result.diagnostics.map((d) => d.code))}`,
  ).toEqual([]);
  const sameFileSchemas = schemaDeclsOf(doc);
  const sameFileEnums = enumDeclsOf(doc);
  const sameFileSchemaNames = new Set(sameFileSchemas.map((d) => d.name));
  const sameFileEnumNames = new Set(sameFileEnums.map((d) => d.name));
  // Same-file wins a name collision (the existing whole-file rule); filtered
  // out before the merge rather than relied on to lose a later tie-break.
  const schemas = [
    ...result.importedTypeDecls.schemas.filter((d) => !sameFileSchemaNames.has(d.name)),
    ...sameFileSchemas,
  ];
  const enums = [
    ...result.importedTypeDecls.enums.filter((d) => !sameFileEnumNames.has(d.name)),
    ...sameFileEnums,
  ];
  const lowered = lowerQueryResponseSchema(annotation, schemas, enums);
  expect(
    lowered,
    `PRECONDITION: \`${annotation}\` lowered to undefined — the annotation carries no lowerable shape at all, a different failure than the vacuous \`{}\` this bug is about.`,
  ).toBeDefined();
  return { lowered: lowered as LoweredSchema, decls: schemas };
}

/**
 * Drive the QRY-22 loop for one lowered schema and one forced-respond payload,
 * exactly as the producer composes it, counting respond-repair follow-ups so
 * "repair never engaged" (the vacuous-validation tell) is observable. One
 * respond-repair slot is offered and its follow-up re-supplies the same
 * missing-key reply, so a real gate exhausts to a terminal `validation` outcome
 * whose leading issue is stable, while a vacuous `{}` gate binds `Ok` on turn
 * one and never reaches the slot.
 */
async function driveMissingKey(
  lowered: LoweredSchema,
  decls: readonly SchemaDecl[],
): Promise<{ outcome: Awaited<ReturnType<typeof runTypedQueryLoop>>; followUps: number }> {
  const state = { followUps: 0 };
  const validation: TypedQuerySchemaValidation = buildTypedQueryValidation({
    lowered,
    resolveShape: () => decls.find((s) => s.name === "ReviewSummary"),
    schemaValidator: ajv(),
    attempts: 1,
    maxRounds: 0,
    driveFollowUp: () => {
      state.followUps += 1;
      return Promise.resolve(JSON.stringify(MISSING_KEY_REPLY));
    },
  });
  const outcome = await runTypedQueryLoop(
    NOOP_CHECKPOINT,
    liveSignal(),
    new RespondingModel(MISSING_KEY_REPLY),
    config(),
    validation,
  );
  return { outcome, followUps: state.followUps };
}

/** The in-memory `.thetalib` FS double (only `readdir`/`readBytes` are read). */
function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  }
  const reject = (): Promise<never> =>
    Promise.reject(new Error("filesystem member not exercised by this test"));
  return {
    readText: reject,
    writeText: reject,
    exists: reject,
    homedir: (): string => "/home",
    cwd: (): string => "/proj",
    configDirName: (): string => ".pi",
    globalAgentDir: (): string => "/home/.pi/agent",
    lstat: reject,
    realpath: reject,
    readdir: (path: string): Promise<readonly string[]> => {
      const entries = dirs.get(path);
      return entries === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(entries);
    },
    readBytes: (path: string): Promise<Uint8Array> => {
      const content = Object.prototype.hasOwnProperty.call(files, path)
        ? files[path]
        : undefined;
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  } as FileSystem;
}

// ===========================================================================
// Cell 1 — lowering shape. CONTROL (same-file) green; DEFECT (imported) red.
// ===========================================================================

describe("bug 0465 (1) — an imported ReviewSummary annotation lowers to the declared object schema", () => {
  it("1-SF control: the same-file spelling lowers to the full object schema with required keys", () => {
    const doc = parseApp(
      `${REVIEW_SUMMARY_DECL}\nlet summary: ReviewSummary = @\`review the shard\`?\nsummary\n`,
    );
    // schema-subset.md:72 / QRY-22: the declared shape, not a bare name.
    expect(producerLower("ReviewSummary", doc)).toEqual(DECLARED_REVIEW_SUMMARY);
  });

  it("1-IMP defect: the imported spelling owes the byte-identical declared schema, not `{}`", async () => {
    const doc = parseApp(
      `import { ReviewSummary } from "./quality.thetalib"\nlet summary: ReviewSummary = @\`review the shard\`?\nsummary\n`,
    );
    // RED before the fix: `schemaDeclsOf(body)` is `[]` for an importing file,
    // so the IDENTIFIER arm misses and the annotation lowers to the permissive
    // `{}` (query-schema-lowering.ts:167). The fix widens the producer's
    // declaration inputs (real `checkThetaImports` data, merged same-file-wins)
    // so this resolves to the SAME fragment the control produces.
    const { lowered } = await producerLowerImported("ReviewSummary", doc, {
      [LIB_PATH]: `${REVIEW_SUMMARY_DECL}\n`,
    });
    expect(
      lowered,
      "the imported annotation must lower to its declared shape (schema-subset.md:72); at HEAD it is the vacuous `{}`",
    ).toEqual(DECLARED_REVIEW_SUMMARY);
  });
});

// ===========================================================================
// Cell 2 — QRY-22 end to end. CONTROL refuses+repairs; DEFECT binds Ok.
// ===========================================================================

describe("bug 0465 (2) — a missing-key reply is refused and routed through repair, not bound Ok", () => {
  it("2-SF control: same-file — outcome `validation`, leading issue `filed`, repair engaged", async () => {
    const doc = parseApp(
      `${REVIEW_SUMMARY_DECL}\nlet summary: ReviewSummary = @\`review the shard\`?\nsummary\n`,
    );
    const decls = schemaDeclsOf(doc);
    const { outcome, followUps } = await driveMissingKey(producerLower("ReviewSummary", doc), decls);
    expect(outcome.kind).toBe("validation");
    if (outcome.kind === "validation") {
      expect(outcome.error.validation_errors[0]).toEqual({
        path: "",
        message: "must have required property 'filed'",
        schema_keyword: "required",
      });
    }
    // QRY-22: non-conformance MUST route through respond-repair (QRY-11).
    expect(followUps, "the same-file gate engaged respond-repair").toBeGreaterThan(0);
  });

  it("2-IMP defect: imported — the missing-key reply MUST be refused, not bound as Ok", async () => {
    const doc = parseApp(
      `import { ReviewSummary } from "./quality.thetalib"\nlet summary: ReviewSummary = @\`review the shard\`?\nsummary\n`,
    );
    const { lowered, decls } = await producerLowerImported("ReviewSummary", doc, {
      [LIB_PATH]: `${REVIEW_SUMMARY_DECL}\n`,
    });
    const { outcome, followUps } = await driveMissingKey(lowered, decls);
    // RED at HEAD: the imported annotation lowers `{}`, AJV accepts the reply,
    // and the loop binds `{shard, notes}` as the typed `Ok` value with zero
    // follow-up drives — the live `/quality-loop` incident's silent wrong value.
    expect(
      outcome.kind,
      "QRY-22: a response not validated against its declared schema MUST NOT bind as the value; at HEAD it binds Ok",
    ).toBe("validation");
    if (outcome.kind === "validation") {
      expect(outcome.error.validation_errors[0]).toEqual({
        path: "",
        message: "must have required property 'filed'",
        schema_keyword: "required",
      });
    }
    expect(
      followUps,
      "QRY-22: terminal non-conformance MUST route through repair; at HEAD repair never engages (0 drives)",
    ).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Cell 3 — invoke<Schema> return validation (invocation.md:28). The producer
// AJV-validates the child's return against the SAME lowering, inside
// `#validateInvokeReturn` (the `schemaValidator.compile(lowered).validate(...)`
// pair), over the merged `mergedSchemaDeclsOf`/`mergedEnumDeclsOf` inputs
// post-fix. `projectForValidation` is identity for a
// plain record, so validating the reply object directly is faithful.
// ===========================================================================

describe("bug 0465 (3) — an `invoke<ReviewSummary>` return AJV-validates against the declared schema", () => {
  it("3-SF control: same-file — the missing-key return is rejected `must have required property 'filed'`", () => {
    const doc = parseApp(
      `${REVIEW_SUMMARY_DECL}\nlet r = invoke<ReviewSummary>("./child.theta")\nr\n`,
    );
    const compiled = ajv().compile(producerLower("ReviewSummary", doc));
    const verdict = compiled.validate(MISSING_KEY_REPLY);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.errors[0]?.message).toBe("must have required property 'filed'");
    }
  });

  it("3-IMP defect: imported — the missing-key return MUST be rejected, not accepted by `{}`", async () => {
    const doc = parseApp(
      `import { ReviewSummary } from "./quality.thetalib"\nlet r = invoke<ReviewSummary>("./child.theta")\nr\n`,
    );
    const { lowered } = await producerLowerImported("ReviewSummary", doc, {
      [LIB_PATH]: `${REVIEW_SUMMARY_DECL}\n`,
    });
    const compiled = ajv().compile(lowered);
    // RED at HEAD: the imported return lowers `{}`, which AJV accepts for every
    // payload — the vacuity crosses the invoke boundary (invocation.md:28).
    expect(
      compiled.validate(MISSING_KEY_REPLY).ok,
      "invocation.md:28: the return is validated against the DECLARED schema; at HEAD `{}` accepts everything",
    ).toBe(false);
  });
});

// ===========================================================================
// Cell 4 — nested face: an imported-typed FIELD is unconstrained. CONTROL (both
// same-file) green; DEFECT (inner type imported) red.
// ===========================================================================

describe("bug 0465 (4) — a same-file `Outer { inner: ReviewSummary }` constrains `inner` even when ReviewSummary is imported", () => {
  const OUTER_WITH_REF: Record<string, unknown> = {
    type: "object",
    properties: { inner: { $ref: "#/$defs/ReviewSummary" } },
    required: ["inner"],
    additionalProperties: false,
    $defs: { ReviewSummary: DECLARED_REVIEW_SUMMARY },
  };

  it("4-SF control: ReviewSummary same-file — `properties.inner` is the `$ref` to the declared schema", () => {
    const doc = parseApp(
      `${REVIEW_SUMMARY_DECL}\nschema Outer { inner: ReviewSummary }\nlet o: Outer = @\`x\`?\no\n`,
    );
    expect(producerLower("Outer", doc)).toEqual(OUTER_WITH_REF);
  });

  it("4-IMP defect: ReviewSummary imported — `properties.inner` MUST be the declared schema, not `{}`", async () => {
    const doc = parseApp(
      `import { ReviewSummary } from "./quality.thetalib"\nschema Outer { inner: ReviewSummary }\nlet o: Outer = @\`x\`?\no\n`,
    );
    // RED at HEAD: `inner` lowers to `{}` and its `$defs.ReviewSummary` is absent,
    // so `{ inner: 17 }` validates ok — the imported-typed field is unconstrained.
    const { lowered } = await producerLowerImported("Outer", doc, {
      [LIB_PATH]: `${REVIEW_SUMMARY_DECL}\n`,
    });
    expect(
      lowered,
      "schema-subset.md:72: an imported-typed field must lower to the declared schema; at HEAD `properties.inner` is `{}`",
    ).toEqual(OUTER_WITH_REF);
  });
});

// ===========================================================================
// Cell 5 — parse/load-silence INVARIANT (not a defect witness): GREEN before AND
// after the fix. code-registry-parse.md:115 admits an imported name by design,
// so the importing theta parses clean and `checkThetaImports` (the load pass)
// emits no diagnostic. Pinned so a future fix that wrongly REFUSES the import
// (the rejected §Fix option 2 stopgap) reds here.
// ===========================================================================

describe("bug 0465 (5) — INVARIANT: the importing theta parses and loads silent (imports.md admits the name)", () => {
  it("5-invariant: parse emits no error and `checkThetaImports` materialises `schema ReviewSummary` with no diagnostic", async () => {
    const doc = parseApp(
      `import { ReviewSummary } from "./quality.thetalib"\nlet summary: ReviewSummary = @\`review the shard\`?\nsummary\n`,
    );
    expect(
      doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code),
      "the importing theta must parse clean — the imported annotation is admitted at parse (code-registry-parse.md:115)",
    ).toEqual([]);
    const input: ThetaCompositionInput = {
      slashName: "app",
      sourcePath: APP_PATH,
      frontmatter: doc.frontmatter as ParsedFrontmatter,
      body: doc.body,
    };
    const result = await checkThetaImports(input, {
      fs: fakeThetaLibFs({ [LIB_PATH]: `${REVIEW_SUMMARY_DECL}\n` }),
      parseDeps: parseDeps(),
    });
    // Anti-vacuity: the symbol materialised, so the load pass genuinely resolved
    // and parsed the lib — the silence is a judged silence, not a missed import.
    expect(
      result.imports.map((m) => `${m.kind} ${m.name}`),
      `PRECONDITION: the load pass must materialise the imported schema. Diagnostics: ${JSON.stringify(result.diagnostics.map((d) => d.code))}`,
    ).toContain("schema ReviewSummary");
    expect(
      result.diagnostics,
      "imports.md admits the imported annotation by design — the load pass emits no diagnostic (the defect is vacuous runtime validation, not a missing refusal)",
    ).toEqual([]);
  });

  it("5b: `checkThetaImports` surfaces the imported schema decl on its `importedTypeDecls` channel under BOTH its source name and the local (`as`) binding", async () => {
    const doc = parseApp(
      `import { ReviewSummary as Summary } from "./quality.thetalib"\nlet summary: Summary = @\`x\`?\nsummary\n`,
    );
    const input: ThetaCompositionInput = {
      slashName: "app",
      sourcePath: APP_PATH,
      frontmatter: doc.frontmatter as ParsedFrontmatter,
      body: doc.body,
    };
    const result = await checkThetaImports(input, {
      fs: fakeThetaLibFs({ [LIB_PATH]: `${REVIEW_SUMMARY_DECL}\n` }),
      parseDeps: parseDeps(),
    });
    // The bug-0465 channel surfaces each reachable decl under its lib-local
    // (SOURCE) name so a self / cycle / transitive field-ref resolves, PLUS the
    // entry under the specifier's LOCAL (`as`) binding so `@<Summary>`
    // resolves. Storing only under the alias would drop a renamed schema's own
    // self-reference (face (b) below), so both names ride the channel.
    expect(result.importedTypeDecls.schemas.map((s) => s.name)).toEqual([
      "ReviewSummary",
      "Summary",
    ]);
    const summary = result.importedTypeDecls.schemas.find((s) => s.name === "Summary");
    expect(summary?.fields?.map((f) => f.name)).toEqual(["shard", "filed", "notes"]);
    expect(result.importedTypeDecls.enums).toEqual([]);
  });
});

// ===========================================================================
// Cell 6 — composition faces that guide the fix: each RED now, GREEN once the
// producer supplies imported declarations to the shared lowering seam.
// ===========================================================================

describe("bug 0465 (6a) — an imported alias-of-schema annotation lowers to the declared schema", () => {
  it("6a-SF control: the same-file spelling lowers to the declared object schema", () => {
    const doc = parseApp(
      `${REVIEW_SUMMARY_DECL}\nlet summary: ReviewSummary = @\`x\`?\nsummary\n`,
    );
    expect(producerLower("ReviewSummary", doc)).toEqual(DECLARED_REVIEW_SUMMARY);
  });

  it("6a-IMP defect: `import { ReviewSummary as Summary }` — the alias annotation owes the declared schema", async () => {
    const doc = parseApp(
      `import { ReviewSummary as Summary } from "./quality.thetalib"\nlet summary: Summary = @\`x\`?\nsummary\n`,
    );
    // RED at HEAD: the local (alias) binding `Summary` names an imported schema
    // absent from same-file decls, so it lowers `{}`. The fix resolves the
    // alias to the declared shape (the entry decl renamed to its LOCAL `as`
    // binding — checkThetaImports' `importedTypeDecls` channel).
    const { lowered } = await producerLowerImported("Summary", doc, {
      [LIB_PATH]: `${REVIEW_SUMMARY_DECL}\n`,
    });
    expect(
      lowered,
      "an imported schema's alias must lower to its declared shape; at HEAD it is `{}`",
    ).toEqual(DECLARED_REVIEW_SUMMARY);
  });
});

describe("bug 0465 (6b) — an inline object annotation referencing an imported schema constrains the field", () => {
  const INLINE_WITH_REF: Record<string, unknown> = {
    type: "object",
    properties: { s: { $ref: "#/$defs/ReviewSummary" } },
    required: ["s"],
    additionalProperties: false,
    $defs: { ReviewSummary: DECLARED_REVIEW_SUMMARY },
  };

  it("6b-SF control: same-file — `@<{ s: ReviewSummary }>` lowers `properties.s` to the `$ref`", () => {
    const doc = parseApp(
      `${REVIEW_SUMMARY_DECL}\nlet o = @<{ s: ReviewSummary }>\`x\`?\no\n`,
    );
    expect(producerLower("{ s: ReviewSummary }", doc)).toEqual(INLINE_WITH_REF);
  });

  it("6b-IMP defect: imported — `@<{ s: ReviewSummary }>` MUST constrain `s`, not lower it to `{}`", async () => {
    const doc = parseApp(
      `import { ReviewSummary } from "./quality.thetalib"\nlet o = @<{ s: ReviewSummary }>\`x\`?\no\n`,
    );
    // RED at HEAD: the inline object's field references an imported name absent
    // from same-file decls, so `properties.s` lowers to `{}`.
    const { lowered } = await producerLowerImported("{ s: ReviewSummary }", doc, {
      [LIB_PATH]: `${REVIEW_SUMMARY_DECL}\n`,
    });
    expect(
      lowered,
      "an inline-object field naming an imported schema must lower to the declared schema; at HEAD `properties.s` is `{}`",
    ).toEqual(INLINE_WITH_REF);
  });
});

describe("bug 0465 (6c) — a transitive lib-of-lib closure: an imported schema's own field references another lib schema", () => {
  // schema-subset.md:72 says "transitively imported" — an imported schema whose
  // own body references another schema declared in the same lib must carry that
  // nested field's declared shape through, not `{}`.
  const DETAIL: Record<string, unknown> = {
    type: "object",
    properties: { count: { type: "integer" } },
    required: ["count"],
    additionalProperties: false,
  };
  const SUMMARY_WITH_DETAIL_REF: Record<string, unknown> = {
    type: "object",
    properties: { shard: { type: "string" }, detail: { $ref: "#/$defs/Detail" } },
    required: ["shard", "detail"],
    additionalProperties: false,
    $defs: { Detail: DETAIL },
  };

  it("6c-SF control: both schemas same-file — `properties.detail` is the `$ref` to Detail", () => {
    const doc = parseApp(
      `schema Detail { count: integer }\nschema ReviewSummary { shard: string, detail: Detail }\nlet s: ReviewSummary = @\`x\`?\ns\n`,
    );
    expect(producerLower("ReviewSummary", doc)).toEqual(SUMMARY_WITH_DETAIL_REF);
  });

  it("6c-IMP defect: ReviewSummary+Detail imported from one lib — the closure MUST carry through, not `{}`", async () => {
    const doc = parseApp(
      `import { ReviewSummary } from "./quality.thetalib"\nlet s: ReviewSummary = @\`x\`?\ns\n`,
    );
    // RED at HEAD: the whole annotation names an imported schema absent from
    // same-file decls, so it lowers `{}` — its transitive Detail field vanishes.
    // The lib itself carries BOTH schemas (`Detail` is never imported by name
    // here) — schema-subset.md:72's closure must pull `Detail` in transitively
    // off `ReviewSummary`'s own field type, not off a second import specifier.
    const { lowered } = await producerLowerImported("ReviewSummary", doc, {
      [LIB_PATH]: "schema Detail { count: integer }\nschema ReviewSummary { shard: string, detail: Detail }\n",
    });
    expect(
      lowered,
      "schema-subset.md:72: the transitive lib-of-lib closure must lower; at HEAD the whole schema is `{}`",
    ).toEqual(SUMMARY_WITH_DETAIL_REF);
  });
});

// ===========================================================================
// Cell R1 — the producer MERGE helper itself, exported so a revert of the
// merge logic (same-file-wins filter + imported-first order) reds a test
// directly. `mergedSchemaDeclsOf`/`mergedEnumDeclsOf` are what both call sites
// pass to `lowerQueryResponseSchema`; a partial producer revert that stopped
// merging would otherwise leave every cell above green through the test's own
// `producerLowerImported` re-implementation of the merge.
// ===========================================================================

describe("bug 0465 (R1) — mergedSchemaDeclsOf / mergedEnumDeclsOf: same-file-wins filter, imported-first order", () => {
  it("R1: merges imported decls ahead of same-file, dropping an imported decl whose name collides with a same-file one", () => {
    // Same-file body declares `Foo` and `enum E`; the imported channel offers a
    // COLLIDING `Foo`/`E` plus a non-colliding `Bar`/`F`. Real parsed decls,
    // not fabricated nodes, so the helper sees production-shaped input.
    const doc = parseApp("schema Foo { a: string }\nenum E { X }\nlet z = @`x`?\nz\n");
    const libDoc = parseApp(
      "schema Foo { imported: integer }\nschema Bar { b: integer }\nenum E { Y }\nenum F { Z }\nlet z = @`x`?\nz\n",
      "/proj/other.theta",
    );
    const theta = {
      body: doc.body,
      importedTypeDecls: {
        schemas: schemaDeclsOf(libDoc),
        enums: enumDeclsOf(libDoc),
      },
    };

    const mergedSchemas = mergedSchemaDeclsOf(theta);
    // Imported-first, colliding `Foo` filtered out — so the surviving `Foo` is
    // the SAME-FILE one (its field is `a`, not the imported `imported`).
    expect(mergedSchemas.map((s) => s.name)).toEqual(["Bar", "Foo"]);
    expect(mergedSchemas.find((s) => s.name === "Foo")?.fields?.map((f) => f.name)).toEqual(["a"]);

    const mergedEnums = mergedEnumDeclsOf(theta);
    expect(mergedEnums.map((e) => e.name)).toEqual(["F", "E"]);
    // Same-file `E` (variant `X`) wins over the imported `E` (variant `Y`).
    expect(mergedEnums.find((e) => e.name === "E")?.variants).toEqual(["X"]);
  });
});

// ===========================================================================
// Cell R3 — the imported-ENUM positive path and an imported field's `as "wire"`
// rename, both through the real merged channel (must-settle d).
// ===========================================================================

describe("bug 0465 (R3) — an imported enum annotation lowers to its wire-value string enum", () => {
  it('R3-enum: `@<Color>` naming an imported `enum Color { Red, Green = "g" }` lowers to the wire values', async () => {
    const doc = parseApp(
      'import { Color } from "./quality.thetalib"\nlet c: Color = @`pick`?\nc\n',
    );
    const { lowered } = await producerLowerImported("Color", doc, {
      [LIB_PATH]: 'enum Color { Red, Green = "g" }\n',
    });
    // schema-subset.md §Enum declarations: the wire value is the explicit `= …`
    // RHS or the variant name. The imported enum conveys the same string enum
    // the same-file spelling would, `Green`'s wire value honoured as `"g"`.
    expect(lowered).toEqual({ type: "string", enum: ["Red", "g"] });
  });

  it('R3-wire-rename: an imported schema whose field carries `as "wire"` lowers identically to the same-file spelling', async () => {
    const RENAMED = 'schema Rec { kind as "wire": string, n: integer }';
    const sf = parseApp(`${RENAMED}\nlet r: Rec = @\`x\`?\nr\n`);
    const sfLowered = producerLower("Rec", sf);
    const imp = parseApp(
      'import { Rec } from "./quality.thetalib"\nlet r: Rec = @`x`?\nr\n',
    );
    const { lowered } = await producerLowerImported("Rec", imp, { [LIB_PATH]: `${RENAMED}\n` });
    // must-settle (d): once an imported schema lowers for real, its `as` wire
    // rename must ride the outbound lowering exactly as the same-file
    // spelling's does — imported ≡ same-file, and both are a real object, not `{}`.
    expect(lowered).toEqual(sfLowered);
    expect((lowered as { properties?: Record<string, unknown> }).properties).toBeDefined();
  });
});

// ===========================================================================
// Cell F1-b / F1-c — the ALIAS-RENAME anti-vacuity witnesses. A renamed
// imported schema's SOURCE-named self-reference / cycle back-edge must resolve,
// so its recursive field is CONSTRAINED and a garbage nested value is REFUSED —
// not lowered to `{}` and bound Ok. Pre-fix the alias stored the decl only
// under its `as` name, so the source-named ref resolved to nothing.
// ===========================================================================

describe("bug 0465 (F1-b) — a renamed self-recursive imported schema constrains its recursive field, not `{}`", () => {
  const SELF_REC = "schema ReviewSummary { shard: string, next: ReviewSummary | null }";
  const GARBAGE = { shard: "x", next: { garbage: true } };
  const CONFORMING = { shard: "x", next: { shard: "y", next: null } };

  it("F1-b-SF control: same-file self-recursive spelling refuses the garbage nested value, accepts a conforming one", () => {
    const doc = parseApp(`${SELF_REC}\nlet s: ReviewSummary = @\`x\`?\ns\n`);
    const compiled = ajv().compile(producerLower("ReviewSummary", doc));
    expect(compiled.validate(GARBAGE).ok).toBe(false);
    expect(compiled.validate(CONFORMING).ok).toBe(true);
  });

  it("F1-b: `import { ReviewSummary as Summary }` of a self-recursive schema — the recursive `next` is CONSTRAINED, junk refused", async () => {
    const doc = parseApp(
      'import { ReviewSummary as Summary } from "./quality.thetalib"\nlet s: Summary = @`x`?\ns\n',
    );
    const { lowered } = await producerLowerImported("Summary", doc, { [LIB_PATH]: `${SELF_REC}\n` });
    const compiled = ajv().compile(lowered);
    // Anti-vacuity: pre-fix `Summary` stored the decl ONLY under `Summary`, so
    // the field's `ReviewSummary` self-ref resolved to nothing and lowered `{}`
    // — the garbage nested value bound Ok. The fix stores the decl under its
    // SOURCE name too, so the self-ref resolves and junk is refused.
    expect(
      compiled.validate(GARBAGE).ok,
      "the recursive `next` must be constrained (schema-subset.md:72); a garbage nested value MUST be refused",
    ).toBe(false);
    expect(compiled.validate(CONFORMING).ok).toBe(true);
  });
});

describe("bug 0465 (F1-c) — a renamed imported schema in a mutual cycle constrains the back-edge, not `{}`", () => {
  const CYCLE_LIB = "schema A { b: B | null }\nschema B { a: A | null }\n";
  const GARBAGE = { b: { a: 99 } };
  const CONFORMING = { b: { a: null } };

  it("F1-c-SF control: both cycle schemas same-file — the back-edge refuses the garbage value, accepts a conforming one", () => {
    const doc = parseApp(
      "schema A { b: B | null }\nschema B { a: A | null }\nlet x: A = @`x`?\nx\n",
    );
    const compiled = ajv().compile(producerLower("A", doc));
    expect(compiled.validate(GARBAGE).ok).toBe(false);
    expect(compiled.validate(CONFORMING).ok).toBe(true);
  });

  it("F1-c: `import { A as X }` of a mutual-cycle pair `A { b: B|null }`, `B { a: A|null }` — the `B.a` back-edge is CONSTRAINED", async () => {
    const doc = parseApp('import { A as X } from "./quality.thetalib"\nlet x: X = @`x`?\nx\n');
    // The lib carries BOTH A and B; only A is imported (aliased to X). The
    // closure must pull B in transitively off A's own field, and B's `a`
    // back-edge names the SOURCE `A` — pre-fix that resolved to nothing (`{}`),
    // binding junk Ok. The fix stores A under its source name, so `B.a`
    // resolves and the garbage nested value is refused.
    const { lowered } = await producerLowerImported("X", doc, { [LIB_PATH]: CYCLE_LIB });
    const compiled = ajv().compile(lowered);
    expect(
      compiled.validate(GARBAGE).ok,
      "the `B.a` cycle back-edge must be constrained; a garbage nested value MUST be refused",
    ).toBe(false);
    expect(compiled.validate(CONFORMING).ok).toBe(true);
  });
});

describe("bug 0465 (F1-a) — DOCUMENTED RESIDUAL: aliasing an import to the source name of its own same-lib dependency", () => {
  it("F1-a: `import { ReviewSummary as Detail }` where ReviewSummary references a sibling `Detail` — first-wins gives the ALIAS the `Detail` name, deterministically", async () => {
    // Pathological authoring (NOT a defect): the local alias `Detail` collides
    // with the SOURCE name of a sibling schema `Detail` that ReviewSummary
    // itself references. One flat-`$defs` name cannot mean both;
    // `collectImportedTypeDecls` stores the aliased ENTRY under `Detail` first,
    // so `@<Detail>` resolves to ReviewSummary's shape and the same-lib sibling
    // of that name is dropped. No diagnostic is minted — the outcome is
    // deterministic (the documented residual in `collectImportedTypeDecls`).
    const doc = parseApp(
      'import { ReviewSummary as Detail } from "./quality.thetalib"\nlet d: Detail = @`x`?\nd\n',
    );
    const { lowered } = await producerLowerImported("Detail", doc, {
      [LIB_PATH]:
        "schema Detail { count: integer }\nschema ReviewSummary { shard: string, detail: Detail }\n",
    });
    // The alias entry won the `Detail` name: `@<Detail>` resolves to the
    // ReviewSummary shape, so the root carries `shard` (ReviewSummary's field),
    // NOT the sibling `Detail`'s `count`. Deterministic, first-wins.
    const props = (lowered as { properties?: Record<string, unknown> }).properties ?? {};
    expect(props).toHaveProperty("shard");
    expect(props).not.toHaveProperty("count");
  });
});
