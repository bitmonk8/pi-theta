// Bug 0028 — a typed-query annotation naming no lowerable declaration (a
// typo'd/undeclared name, a declared `enum`, or a schema-body forward/self
// reference) lowers permissively to `{}` with no diagnostic: the QRY-22 gate
// validates nothing and any payload binds as the typed value
// (docs/bugs/0028-unresolved-annotation-silent-permissive-lowering.md).
//
// Spec: schema-subset.md §"Lowering Algorithm" step 3 is a CLOSED per-form
// emission table — a named/inline schema reference lowers to
// `{ "$ref": "#/$defs/<Name>" }` (:76), an enum to
// `{ "type": "string", "enum": [...] }` (:80); no `{}` emission exists for any
// form. schemas.md §Recursion (:119–141): "Any reference to a named schema
// lowers to `$ref` against the file's `$defs`. Self- and mutual recursion are
// supported transparently" — and that section's own normative example
// (`pets: array<Animal>` with `Animal` declared LATER) is a forward reference.
// type-system.md: a named type is "any schema or enum identifier in scope"
// (:6) and "the same type grammar applies in every type-annotation position:
// schema fields, frontmatter `params:`, `let x: T`, function parameters, and
// `@<T>`…`` explicit query schemas" (:15). QRY-22
// (query/query-failure-and-repair.md:78): the runtime "MUST resolve that
// annotation to its declared shape, lower it to the validating JSON Schema per
// Schema Subset (SUBS-1), convey that lowered shape to the model on the
// forced-respond turn … and validate the final response against the lowered
// schema. … The runtime MUST NOT bind, as a typed query's value, a response
// that has not been validated against its declared schema."
// diagnostics/diagnostic-shape.md DIAG-2 (the registry is closed — a trigger
// widening is a spec change in lock-step) and DIAG-4 (the Message column is
// normative — every expected message string below is sourced from the registry
// via `registryMessage`, never copied prose).
//
// The defect (probed at HEAD c39e1c54 / 0.37.0): `lowerTypeExpr`
// (src/parser/params.ts) has ONE unresolved arm — push the name onto
// `ctx.unresolved`, return `{}` — and whether that becomes a diagnostic is
// decided entirely by which caller built the context. `parseParams` reads the
// list back and errors; `lowerTypeSource` (src/parser/body-type-lowering.ts)
// constructs `unresolved: []` and never reads it, and EVERY non-`params:`
// lowering site sits above `lowerTypeSource`. Three independent resolution gaps
// feed the arm: `buildBodyTypeMap` (src/runtime/query-schema-lowering.ts) is
// single-pass in declaration order (so a forward or self reference looks up a
// map entry that does not exist yet); `schemaDeclsOf`
// (src/extension/production-theta-producer.ts) filters `kind === "schema"` (so
// enum decls never reach the typed-query lowering at all); and a name declared
// nowhere resolves against nothing with no parse-, load-, or runtime-phase
// check at the annotation position. Probed HEAD outputs, verbatim:
//
//   @<Tirage> (Triage declared)                 diagnostics []   lowered {}
//   @<Triage> (control)                         diagnostics []   lowered closed
//   let r: Tirage = @`x`                        diagnostics []
//   @<{ x: NotDeclared, y: integer }>           diagnostics []
//   schema S { x: Ghost }                       diagnostics []
//   Person.pets (array<Animal>, Animal later)   items: {}
//   Tree.children (array<Tree>, self)           items: {}
//   @<Severity> (enum Severity { Low, High })   lowered {}   respond parameters {}
//   Tree compiled validator                     {name:"root",children:[{nope:1}]} → ok
//
// PINNED POST-FIX CONTRACT (bug doc §Fix, SETTLED — RED now, GREEN after):
//   (a) TWO-PASS whole-file body-type lowering. A schema-body field naming a
//       schema/enum declared LATER, or naming its OWN schema, lowers to
//       `{ "$ref": "#/$defs/<Name>" }` with the fragment reachable from the
//       document root's `$defs` — regardless of declaration order. The
//       construction must satisfy `pruneDocumentDefs`'s DEFECT GUARD
//       (src/runtime/query-schema-lowering.ts), which THROWS when a reachable
//       `$ref` has no hoisted fragment; cells LOWER-* and COMPILE pin that.
//   (b) A declared `enum` at the `@<T>` annotation root lowers to
//       `{ "type": "string", "enum": [...wire values...] }` — a NON-OBJECT root
//       — and that root reaches the respond-tool registration (cell RESPOND is
//       the first non-object root driven through that registration under test).
//   (c) A `NamedType` resolving to no top-level `schema`/`enum` declaration and
//       no imported `.thetalib` symbol is an ERROR-severity
//       `theta/parse/unresolved-named-type` with the registry's message
//       `unresolved named type '<name>'`, at the `@<T>` query annotation root
//       (including a name reached through an inline-object annotation field)
//       and at a `schema` body field type. The `params:` RHS already emits.
//   (d) `lowerQueryResponseSchema` STAYS a total function returning `{}` for an
//       unresolvable named annotation, and `undefined` STAYS reserved for the
//       empty annotation alone (cell TOTAL). Do not "improve" this seam.
//   (e) The forced-respond conveyance sentence in `renderTypedAwareQueryText`
//       becomes SHAPE-AGNOSTIC. Its exact post-fix wording is NOT pinned here —
//       three existing tests pin the current sentence and the implementer
//       updates them in lockstep with the source change (see the report).
//
// Emission is from the RESOLUTION SET, not from the lowering RESULT:
// `collectBodyTypes` (src/parser/theta-document.ts) maps alias-form and
// imported names to `{}` DELIBERATELY, *as resolved*, so a result-shape check
// would reject legal thetas. The SILENT cells below are that false-positive
// guard.
//
// Tier: unit / offline / deterministic. Nothing here crosses a provider. The
// diagnostic arms drive the real load path (`parseThetaDocument`); the lowering
// arms drive `lowerQueryResponseSchema` plus the real `AjvSchemaValidator`; the
// imported-symbol control additionally drives the shipped discovery walk
// (`discoverAndComposeFixtures`) over a real two-file `.thetalib` fixture; and
// the respond-tool registration arm drives the shipped production producer with
// only pi-ai's off-session `complete()` free function replaced by a recording
// script. An integration or live tier would add a provider round-trip to a
// contract that is fully determined at the parse / lowering / registration
// boundary, so the unit tier is sufficient AND stricter (a live model cannot be
// asked to prove a diagnostic fires).

import { describe, expect, it, vi } from "vitest";

// The recorded off-session `complete()` calls and the scripted reply queue
// (the tests/off-session-two-phase.test.ts harness discipline). `vi.hoisted` so
// the `vi.mock` factory — hoisted above every import — can close over a mutable
// holder. Only cell RESPOND drives it; every other cell leaves the queue empty,
// so any stray dispatch fails loudly instead of silently returning a stub.
const scripted = vi.hoisted(() => ({
  queue: [] as Array<
    (call: { model: unknown; context: unknown; options: unknown }) => unknown
  >,
  calls: [] as Array<{ model: unknown; context: unknown; options: unknown }>,
}));

vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (model: unknown, context: unknown, options: unknown) => {
      const call = { model, context, options };
      const index = scripted.calls.length;
      scripted.calls.push(call);
      if (scripted.queue.length === 0) {
        // No silent skipping: an unscripted dispatch fails loudly.
        throw new Error(
          `scripted complete() called with an EMPTY reply queue (call #${index + 1})`,
        );
      }
      // Sticky-last consumption: over-driving stays observable as a call-count
      // assertion instead of a mid-flight harness throw.
      const factory = scripted.queue[Math.min(index, scripted.queue.length - 1)]!;
      return factory(call);
    }),
  };
});

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { EnumDecl, SchemaDecl, ThetaDocument } from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import {
  AjvSchemaValidator,
  type CompiledValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { buildBinderEnvelopeSchema } from "../src/binder/binder-envelope";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import type { ThetaFixture } from "../src/extension/factory";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { executeBody } from "../src/runtime/statement-executor";
import type { RuntimeRoot } from "../src/runtime-root";
import { codes, parseDoc } from "./helpers/e2e-s1";

// ===========================================================================
// The registered code and its normative message (DIAG-2 / DIAG-4).
// ===========================================================================

const CODE = "theta/parse/unresolved-named-type";

interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

// The live four-page sharded registry, read from the spec corpus and
// concatenated — the same input tests/code-registry.test.ts reconciles and the
// same composition tests/ctor-unresolved-schema-name.test.ts reads for this
// exact row.
const REGISTRY_TEXT = [
  "code-registry-parse.md",
  "code-registry-load.md",
  "code-registry-runtime.md",
  "code-registry-host.md",
]
  .map((page) =>
    readFileSync(
      fileURLToPath(
        new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url),
      ),
      "utf8",
    ),
  )
  .join("\n");

const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];

/**
 * The row's normative *Message* template with its single `<name>` placeholder
 * filled (DIAG-4). Definedness is asserted first so a missing row reds by
 * naming the registry, never by a bare undefined comparison.
 */
function unresolvedMessage(name: string): string {
  const template = registryMessage(REGISTRY, CODE) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the ` +
      `Message row for ${CODE}`,
  ).toBeDefined();
  return template!.replace("<name>", name);
}

// ===========================================================================
// Fixtures + assertion helpers.
// ===========================================================================

/** The frontmatter prelude every diagnostic fixture carries. */
const FM = "---\nmode: prompt\n---\n";

function parse(body: string): ThetaDocument {
  return parseDoc(FM + body, "bug0028.theta");
}

function hits(doc: ThetaDocument): Diagnostic[] {
  return doc.diagnostics.filter((d) => d.code === CODE);
}

/** Render a document's whole diagnostic list for a failure message. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
  );
}

/**
 * The reject contract: exactly one `theta/parse/unresolved-named-type`, error
 * severity (the bug-0014 precedent — load refuses the theta, matching the
 * `params:` posture for the identical mistake), whose message is the registry's
 * with `<name>` rendered as the name the author wrote.
 */
function expectOneUnresolved(doc: ThetaDocument, name: string, why: string): void {
  const found = hits(doc);
  expect(
    found.length,
    `${why} — expected exactly one ${CODE} naming '${name}'; actual diagnostics=${render(doc)}`,
  ).toBe(1);
  const d = found[0]!;
  expect(
    d.severity,
    `${why} — the annotation gives the runtime nothing to validate the response ` +
      `against, so the theta must not load (bug-0014 precedent)`,
  ).toBe("error");
  expect(
    d.message,
    `${why} — DIAG-4: the message is the registry's, with <name> rendered`,
  ).toBe(unresolvedMessage(name));
}

/** The silent contract: the code does not fire (the false-positive guard). */
function expectNoUnresolved(doc: ThetaDocument, why: string): void {
  expect(codes(doc.diagnostics), `${why}; actual diagnostics=${render(doc)}`).not.toContain(
    CODE,
  );
}

/** A fresh real `AjvSchemaValidator` (content-addressed so no cache collisions). */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

/** Parse a body source and return its `schema` declarations (the lowering input). */
function schemaDeclsOf(body: string): readonly SchemaDecl[] {
  const doc = parse(body);
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}

/**
 * Lower `annotation` against `body`'s schema decls through the real seam. The
 * DEFECT GUARD (`pruneDocumentDefs`) throws at LOWERING time for a reachable
 * `$ref` with no hoisted fragment, so the call is wrapped: a throw reds naming
 * the guard rather than escaping as an unattributed harness error.
 */
function lower(annotation: string, body: string): LoweredSchema {
  const decls = schemaDeclsOf(body);
  let lowered: LoweredSchema | undefined;
  try {
    lowered = lowerQueryResponseSchema(annotation, decls);
  } catch (thrown) {
    expect.fail(
      `lowering \`${annotation}\` THREW — the two-pass construction must register each ` +
        `fragment as it lowers so pruneDocumentDefs's DEFECT GUARD is satisfied ` +
        `(src/runtime/query-schema-lowering.ts): ${String(thrown)}`,
    );
  }
  expect(
    lowered,
    `annotation \`${annotation}\` must lower to a schema document (undefined is ` +
      `reserved for the EMPTY annotation alone)`,
  ).toBeDefined();
  return lowered as LoweredSchema;
}

/** The assembled document's top-level `$defs` map (empty when absent). */
function defsOf(lowered: LoweredSchema): Record<string, Record<string, unknown>> {
  const defs = (lowered as { readonly $defs?: Record<string, Record<string, unknown>> })
    .$defs;
  return defs ?? {};
}

/** Compile through the real AJV seam, reddening on a throw instead of escaping. */
function compile(lowered: LoweredSchema, why: string): CompiledValidator {
  try {
    return ajv().compile(lowered);
  } catch (thrown) {
    expect.fail(
      `${why} — the real AjvSchemaValidator refused to compile ` +
        `${JSON.stringify(lowered)}: ${String(thrown)}`,
    );
  }
}

/** The lowered document's `properties.<field>` fragment, dug out for assertion. */
function propertyOf(lowered: LoweredSchema, field: string): unknown {
  const props = (lowered as { readonly properties?: Record<string, unknown> }).properties;
  expect(
    props,
    `the lowered root must be an object schema carrying properties; observed ` +
      `${JSON.stringify(lowered)}`,
  ).toBeDefined();
  return (props as Record<string, unknown>)[field];
}

// --- Diagnostic fixtures -------------------------------------------------------

/** schemas.md §Recursion's normative shape: `Animal` is declared AFTER `Person`. */
const FORWARD = [
  "schema Person { name: string, pets: array<Animal> }",
  "schema Animal { species: string }",
].join("\n");

/** The self-referential shape — never resolves at HEAD, whatever the order. */
const SELF = "schema Tree { name: string, children: array<Tree> }";

/** Mutual recursion: `A` is declared first, so `A.b` is the forward direction. */
const MUTUAL = ["schema A { b: array<B> }", "schema B { a: array<A> }"].join("\n");

/** The closed lowering of `schema Animal { species: string }`. */
const ANIMAL_BODY = {
  type: "object",
  properties: { species: { type: "string" } },
  required: ["species"],
  additionalProperties: false,
};

// ===========================================================================
// (c) The `@<T>` ANNOTATION ROOT — a name declared nowhere.
// RED at HEAD: the typo'd fixture parses with ZERO diagnostics, byte-identical
// to the correctly-spelled control (probed).
// ===========================================================================

describe("bug 0028 (c) annotation root — a typo'd `@<T>` naming no declaration", () => {
  it("RED TYPO: `@<Tirage>` beside a declared `Triage` fires exactly one unresolved-named-type naming 'Tirage'", () => {
    // The bug doc's §Reproduction fixture verbatim. One transposed letter
    // silently disables response validation for this query while the sibling
    // `params: { a: Tirage }` position fails the load on the same code.
    const doc = parse(
      'schema Triage {\n  category: "bug" | "feature" | "question",\n  urgent: boolean\n}\n' +
        "let r = @<Tirage>`Classify: hello`\n" +
        "r\n",
    );
    expectOneUnresolved(doc, "Tirage", "TYPO — the bug doc's §Reproduction fixture");
  });

  it("CONTROL TYPO: the correctly-spelled `@<Triage>` yields ZERO diagnostics", () => {
    // The contrast that makes the red honest: at HEAD both spellings produce
    // `[]`, so nothing surfaces the difference to the author. After the fix only
    // the misspelling fires, and this control must stay empty.
    const doc = parse(
      'schema Triage {\n  category: "bug" | "feature" | "question",\n  urgent: boolean\n}\n' +
        "let r = @<Triage>`Classify: hello`\n" +
        "r\n",
    );
    expect(
      doc.diagnostics,
      `the correct spelling resolves whole-file and must stay clean; ${render(doc)}`,
    ).toEqual([]);
  });

  it("RED DIRECT-LET: `let r: Tirage = @`x`` fires the same single diagnostic (the ascription propagates into QueryExpr.schema)", () => {
    // The inferred form converges on the same surface: `parseLet` propagates the
    // `let` ascription onto the query's `schema` field, so inference and explicit
    // `@<T>` ascription reach one silent lowering. Exactly ONE diagnostic — the
    // `let x: T` position is NOT in the registry row's closed position list, so
    // the annotation root is the sole emitter.
    const doc = parse("let r: Tirage = @`x`\nr\n");
    expectOneUnresolved(doc, "Tirage", "DIRECT-LET — the inferred annotation form");
  });
});

// ===========================================================================
// (c) INLINE-OBJECT annotation fields. RED at HEAD: silent (probed).
// ===========================================================================

describe("bug 0028 (c) annotation root — an inline-object annotation field naming no declaration", () => {
  it("RED INLINE: `@<{ x: NotDeclared, y: integer }>` fires exactly one unresolved-named-type naming 'NotDeclared'", () => {
    // `lowerInlineObject` routes every field through `lowerTypeSource`, whose
    // fresh `unresolved: []` is discarded — `properties.x` lowers `{}` inside an
    // otherwise-closed object, so the hole is one property deep and invisible.
    const doc = parse("let r = @<{ x: NotDeclared, y: integer }>`x`\nr\n");
    expectOneUnresolved(doc, "NotDeclared", "INLINE — an inline-object annotation field");
  });

  it("CONTROL INLINE: `@<{ y: integer }>` (every field a primitive) yields ZERO diagnostics", () => {
    const doc = parse("let r = @<{ y: integer }>`x`\nr\n");
    expect(
      doc.diagnostics,
      `a primitive-only inline object resolves nothing and must stay clean; ${render(doc)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// (c) SCHEMA-BODY field types. RED at HEAD: silent (probed).
// ===========================================================================

describe("bug 0028 (c) schema body — a field type naming no declaration", () => {
  it("RED BODY: `schema S { x: Ghost }` fires exactly one unresolved-named-type naming 'Ghost', even with S referenced nowhere", () => {
    // The registry row's closed position list names "a `schema` body field
    // type", so the emission does not wait for the schema to be used at an
    // annotation: `S` is declared and never referenced here, and `Ghost` still
    // fires. Left silent, `@<S>` later becomes an accept-anything hole for `x`.
    const doc = parse("schema S { x: Ghost }\nlet r = @`x`\nr\n");
    expectOneUnresolved(doc, "Ghost", "BODY — a schema body field type, schema unused");
  });
});

// ===========================================================================
// SILENT CONTROLS — the false-positive guard. Every fixture below names only
// declarations that DO resolve whole-file, so the diagnostic must stay silent
// before AND after the fix. These are the reason the resolution SET is threaded
// through `lowerTypeSource` rather than the lowering RESULT being inspected:
// `collectBodyTypes` maps alias-form and imported names to `{}` deliberately,
// AS RESOLVED, so a result-shape check would reject legal thetas.
// GREEN at HEAD and post-fix.
// ===========================================================================

describe("bug 0028 silent controls — names that DO resolve whole-file stay diagnostic-free", () => {
  it("SILENT (i): `@<Later>` with `schema Later` declared AFTER the query stays clean (whole-file forward reference)", () => {
    // The registry row's own distinction-from-typos rule: "Resolution is
    // whole-file over the body's top-level declarations … so a
    // frontmatter-to-body forward reference is not itself a failure."
    const doc = parse("let r = @<Later>`x`\nschema Later { a: string }\nr\n");
    expectNoUnresolved(doc, "SILENT (i) — resolution is whole-file, so order is irrelevant");
    expect(doc.diagnostics, render(doc)).toEqual([]);
  });

  it("SILENT (ii): a self-referential `schema Node { … children: array<Node> }` + `@<Node>` stays clean", () => {
    // schemas.md §Recursion: "Self- and mutual recursion are supported
    // transparently." A schema resolves its own name.
    const doc = parse(
      "schema Node { name: string, children: array<Node> }\nlet r = @<Node>`x`\nr\n",
    );
    expectNoUnresolved(doc, "SILENT (ii) — a schema's own name resolves inside its body");
    expect(doc.diagnostics, render(doc)).toEqual([]);
  });

  it("SILENT (iii): `@<Severity>` over a declared `enum Severity { Low, High }` stays clean", () => {
    // type-system.md:6 — a named type is "any schema or ENUM identifier in
    // scope". The declared enum resolves; its LOWERING is cell ENUM-ROOT.
    const doc = parse("enum Severity { Low, High }\nlet r = @<Severity>`x`\nr\n");
    expectNoUnresolved(doc, "SILENT (iii) — a declared enum is an in-scope named type");
    expect(doc.diagnostics, render(doc)).toEqual([]);
  });

  it("SILENT (iv): an IMPORTED .thetalib symbol at BOTH the annotation root and a schema body field type stays clean — through the real two-file discovery walk", async () => {
    // The import nuance (bug doc §Fix): `ImportedSymbolKind` includes "schema",
    // so an imported name is IN SCOPE, but `MaterializedImport` carries no field
    // bodies — the name counts as RESOLVED for the diagnostic while its lowering
    // stays permissive. Emitting from the lowering result would reject this
    // legal theta at two positions at once.
    //
    // Driven as a REAL two-file fixture through the shipped discovery walk so
    // the `.thetalib` genuinely resolves (a missing sidecar would refuse the
    // load on `theta/load/unresolvable-thetalib-path` and the silence assertion
    // could pass for the wrong reason).
    const importerSource = [
      "---",
      "mode: prompt",
      "---",
      'import { Shape } from "./libshape.thetalib"',
      "schema Holder {",
      "  s: Shape",
      "}",
      "let r = @<Shape>`Describe`",
      "r",
      "",
    ].join("\n");

    const workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0028-import-"));
    try {
      const projectThetaDir = join(workspaceDir, ".pi", "theta");
      mkdirSync(projectThetaDir, { recursive: true });
      writeFileSync(
        join(projectThetaDir, "libshape.thetalib"),
        "schema Shape {\n  side: number\n}\n",
        "utf8",
      );
      const importerPath = join(projectThetaDir, "impshape.theta");
      writeFileSync(importerPath, importerSource, "utf8");
      // A clean control theta: proves the discovery walk found the workspace, so
      // the registration assertion below can never pass vacuously.
      writeFileSync(
        join(projectThetaDir, "goodctl.theta"),
        "---\nmode: prompt\n---\n@`hi`\n",
        "utf8",
      );

      const notifications: string[] = [];
      const pi = {
        getFlag: (): undefined => undefined,
        getCommands: (): readonly unknown[] => [],
        sendMessage: (): void => {},
        sendUserMessage: (): void => {},
        getActiveTools: (): readonly string[] => [],
        setActiveTools: (): void => {},
      } as unknown as ExtensionAPI;
      const ctx = {
        cwd: workspaceDir,
        // Interactive posture so a drop path does not also mirror to stderr; the
        // observable is ui.notify.
        hasUI: true,
        modelRegistry: { getAvailable: (): readonly unknown[] => [] },
        ui: {
          notify: (message: string): void => {
            notifications.push(message);
          },
        },
      } as unknown as ExtensionContext;

      const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
      const registered = fixtures.map((f) => f.slashName);

      expect(
        registered,
        "setup guard: the project .pi/theta/ discovery walk must register the clean " +
          `control theta; registered=${JSON.stringify(registered)}`,
      ).toContain("goodctl");
      expect(
        registered,
        "an imported .thetalib symbol is IN SCOPE at both the `@<T>` annotation root " +
          "and the `schema Holder` body field type, so the importer must keep " +
          `registering; registered=${JSON.stringify(registered)}; ` +
          `notified=${JSON.stringify(notifications)}`,
      ).toContain("impshape");
      expect(
        notifications,
        "no load-refusal note fires for a legal imported-symbol theta; " +
          `notified=${JSON.stringify(notifications)}`,
      ).toEqual([]);

      // The diagnostic-level witness, over the SAME bytes read back off disk so
      // the two legs cannot drift.
      const doc = parseDoc(readFileSync(importerPath, "utf8"), "impshape.theta");
      expectNoUnresolved(
        doc,
        "SILENT (iv) — an imported symbol resolves whole-file at every NamedType position",
      );
      expect(doc.diagnostics, render(doc)).toEqual([]);
    } finally {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it("SILENT (v): primitives, literal unions and generics at the annotation root stay clean", () => {
    // No NamedType to resolve at all. `@<string>` already lowers to a NON-OBJECT
    // root today (`{"type":"string"}`), which is why the enum root of cell
    // ENUM-ROOT is a lowering gap rather than a new shape class.
    for (const annotation of ["string", '"a" | "b"', "array<string>"]) {
      const doc = parse("let r = @<" + annotation + ">`x`\nr\n");
      expectNoUnresolved(
        doc,
        `SILENT (v) — \`@<${annotation}>\` names no declaration to resolve`,
      );
      expect(doc.diagnostics, `\`@<${annotation}>\`; ${render(doc)}`).toEqual([]);
    }
  });
});

// ===========================================================================
// (a) TWO-PASS WHOLE-FILE BODY-TYPE LOWERING — forward, self, mutual.
// RED at HEAD: `buildBodyTypeMap` is single-pass in declaration order, so each
// of these lowers `items: {}` (probed).
// ===========================================================================

describe("bug 0028 (a) lowering — a forward / self / mutual schema-body reference lowers to $ref against the document's $defs", () => {
  it("RED LOWER-FORWARD: `Person.pets: array<Animal>` with Animal declared AFTER lowers items to $ref, with $defs.Animal the closed body", () => {
    // schemas.md §Recursion's OWN normative example: `pets: array<Animal>` with
    // `Animal` declared later. At HEAD the emission is declaration-order
    // dependent — reordering the two decls flips it to the specified `$ref` —
    // which is invisible and stable under the coverage an author would test.
    const lowered = lower("Person", FORWARD);
    expect(
      propertyOf(lowered, "pets"),
      "schema-subset.md §Lowering Algorithm step 3: a named schema reference lowers " +
        'to { "$ref": "#/$defs/<Name>" }, whatever the declaration order. At HEAD ' +
        "`Animal` is not yet in the single-pass body-type map, so `items` lowers to " +
        `the accept-anything {}; observed ${JSON.stringify(propertyOf(lowered, "pets"))}`,
    ).toEqual({ type: "array", items: { $ref: "#/$defs/Animal" } });
    expect(
      defsOf(lowered)["Animal"],
      "the fragment the root-absolute $ref resolves against must be hoisted to the " +
        `document's top-level $defs; observed $defs=${JSON.stringify(defsOf(lowered))}`,
    ).toEqual(ANIMAL_BODY);
  });

  it("RED LOWER-SELF: `Tree.children: array<Tree>` lowers items to a recursive $ref, with $defs.Tree present", () => {
    // The self-reference NEVER resolves at HEAD, whatever the order:
    // `bodyTypeMap.get("Tree")` is undefined while `Tree`'s own body lowers.
    // schema-subset.md:10 pins "`$defs` + `$ref`, INCLUDING RECURSIVE
    // REFERENCES" as inside the subset.
    const lowered = lower("Tree", SELF);
    expect(
      propertyOf(lowered, "children"),
      "schemas.md §Recursion: self-recursion is supported transparently — the " +
        "self-reference lowers to a recursive $ref, not to the accept-anything {}; " +
        `observed ${JSON.stringify(propertyOf(lowered, "children"))}`,
    ).toEqual({ type: "array", items: { $ref: "#/$defs/Tree" } });
    const treeDef = defsOf(lowered)["Tree"];
    expect(
      treeDef,
      "pruneDocumentDefs's DEFECT GUARD requires a hoisted fragment for every " +
        "REACHABLE $ref name, and the root's own $ref makes `Tree` reachable; " +
        `observed $defs=${JSON.stringify(defsOf(lowered))}`,
    ).toBeDefined();
    expect(
      treeDef,
      "the hoisted fragment is the closed Tree object body, so the recursion " +
        `resolves to the same shape at every depth; observed ${JSON.stringify(treeDef)}`,
    ).toMatchObject({
      type: "object",
      required: ["name", "children"],
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        children: { type: "array", items: { $ref: "#/$defs/Tree" } },
      },
    });
  });

  it("RED LOWER-MUTUAL: `A.b: array<B>` (B declared after A) lowers items to $ref, and both mutual fragments are hoisted", () => {
    // The mutual pair the bug doc names alongside self-recursion. `A` is
    // declared first, so `A.b` is the forward direction; `B.a` already mints a
    // real `$ref` at HEAD, which is what makes the asymmetry order-dependent.
    // Both names are REACHABLE from the `A` root, so the DEFECT GUARD forces
    // both fragments into the document's $defs.
    const lowered = lower("A", MUTUAL);
    expect(
      propertyOf(lowered, "b"),
      "the forward direction of a mutual pair lowers to $ref like the backward " +
        `direction already does; observed ${JSON.stringify(propertyOf(lowered, "b"))}`,
    ).toEqual({ type: "array", items: { $ref: "#/$defs/B" } });
    expect(
      Object.keys(defsOf(lowered)).sort(),
      "every name reachable from the response-schema root carries a hoisted " +
        `fragment (pruneDocumentDefs's DEFECT GUARD); observed ` +
        `$defs=${JSON.stringify(defsOf(lowered))}`,
    ).toEqual(["A", "B"]);
  });
});

// ===========================================================================
// (a) The DEFECT GUARD pin — an AJV COMPILE over the self-recursive document.
// The guard (src/runtime/query-schema-lowering.ts, pruneDocumentDefs) THROWS
// when a reachable `$ref` has no hoisted fragment, converting a
// silent-permissive lowering into a lowering-time Error on the invoke/query
// dispatch path; AJV itself throws MissingRefError at compile for the same
// shape. RED at HEAD on the recursive-ref precondition: at HEAD the document
// carries NO $ref at all, so the compile leg is vacuous (probed: compiles).
// ===========================================================================

describe("bug 0028 (a) DEFECT GUARD — the self-recursive $ref document lowers and compiles", () => {
  it("RED COMPILE: the self-recursive document mints a recursive $ref with its fragment registered, and the real AjvSchemaValidator compiles it", () => {
    const lowered = lower("Tree", SELF);
    // Non-vacuity precondition: without a recursive $ref there is nothing for
    // the guard or for AJV's reference resolver to exercise.
    const children = propertyOf(lowered, "children") as { items?: { $ref?: unknown } };
    expect(
      children.items?.$ref,
      "the compile leg only guards the DEFECT GUARD if the document actually " +
        "carries a recursive $ref; at HEAD `children.items` is {} and nothing is " +
        `exercised; observed ${JSON.stringify(children)}`,
    ).toBe("#/$defs/Tree");
    expect(
      defsOf(lowered)["Tree"],
      "the construction must self-register `Tree`'s fragment WHILE its own body " +
        "lowers — `bodyTypeMap.get(\"Tree\")` is undefined at that moment, and a " +
        "$ref minted without a registered body makes pruneDocumentDefs throw " +
        `"references $defs entry 'Tree' but no fragment for it was collected"`,
    ).toBeDefined();
    // The pin itself: no lowering-time throw (already asserted by `lower`) and
    // no AJV MissingRefError.
    const validator = compile(
      lowered,
      "a recursive $ref whose fragment is hoisted is inside the pinned subset " +
        "(schema-subset.md:10)",
    );
    expect(
      validator,
      "the compiled validator exists, so neither the DEFECT GUARD nor AJV's " +
        "reference resolver refused the recursive document",
    ).toBeDefined();
  });
});

// ===========================================================================
// (a) DEPTH ENFORCEMENT — the consequence the recursion fix buys. RED at HEAD:
// with `children.items: {}` an invalid nested child validates OK (probed
// `{"ok":true}`), so depth is not enforced at all.
// ===========================================================================

describe("bug 0028 (a) depth enforcement — the compiled self-recursive validator rejects an invalid nested child", () => {
  it("RED DEPTH: `{name:'root',children:[{nope:1}]}` REJECTS and `{name:'root',children:[]}` ACCEPTS", () => {
    const lowered = lower("Tree", SELF);
    const validator = compile(lowered, "the self-recursive document must compile");
    expect(
      validator.validate({ name: "root", children: [{ nope: 1 }] }).ok,
      "the recursive $ref applies the SAME closed Tree body at every depth, so a " +
        "child missing `name`/`children` and carrying an undeclared `nope` is a " +
        "validation failure. At HEAD `children.items` is {} — accept-anything — so " +
        "the nested garbage validates OK and QRY-22 is met only vacuously below " +
        "the top level",
    ).toBe(false);
    expect(
      validator.validate({ name: "root", children: [] }).ok,
      "a conforming leaf still ACCEPTS — the fix must not over-reject the base case",
    ).toBe(true);
  });

  it("RED DEPTH-MUTUAL: an `A` whose `b` holds a non-conforming `B` REJECTS, and a conforming one ACCEPTS", () => {
    const lowered = lower("A", MUTUAL);
    const validator = compile(lowered, "the mutual-recursion document must compile");
    expect(
      validator.validate({ b: [{ nope: 1 }] }).ok,
      "`A.b` items resolve to the closed `B` body, so an element that is not a `B` " +
        "rejects. At HEAD `A.b.items` is {} and the garbage element validates OK",
    ).toBe(false);
    expect(
      validator.validate({ b: [{ a: [] }] }).ok,
      "a conforming `B` (its own `a` an empty array) still ACCEPTS",
    ).toBe(true);
  });
});

// ===========================================================================
// (b) A DECLARED ENUM AT THE ANNOTATION ROOT reaches the respond-tool
// registration as a NON-OBJECT root. RED at HEAD: `schemaDeclsOf`
// (src/extension/production-theta-producer.ts) filters `kind === "schema"`, so
// enum decls never reach the typed-query lowering — the annotation lowers `{}`
// and the presented respond tool's `parameters` are `{}` (probed).
//
// This is the FIRST non-object root driven through the respond-tool
// registration under test: both existing `@<string>` fixtures blank the parsed
// QueryExpr's schema to `""` before driving, so the registration assertion
// ("the presented respond tool's parameters carry the lowered response schema",
// tests/off-session-two-phase.test.ts) has only ever run over an object root.
// ===========================================================================

/** The lowered form schema-subset.md:80 pins for `enum Severity { Low, High }`. */
const SEVERITY_LOWERED = { type: "string", enum: ["Low", "High"] };

/**
 * The WIRE schema the respond tool is registered with for that non-object root
 * (bug 0028 §Fix): a tool call's arguments are a JSON object at the wire, so the
 * enum root is carried in a single-property envelope. Registered bare, the host
 * rejects every possible call (`root: must be string`) and the model
 * repair-spins until the invocation is torn down.
 */
const SEVERITY_WIRE = {
  type: "object",
  properties: { value: SEVERITY_LOWERED },
  required: ["value"],
};

/** The resolved off-session model (distinct `.api` / `.provider`, as the siblings do). */
const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

/**
 * A prompt-mode theta whose `subagent fn` body issues a typed `@<Severity>`
 * query over a top-level declared enum — the tests/off-session-two-phase.test.ts
 * fixture shape, so the drive resolves through the in-process subagent-fn host
 * → the off-session driver → the scripted `complete()`. `respond_repair.attempts:
 * 0` bounds the drive to exactly two dispatches (free phase + forced respond).
 */
const ENUM_FN_THETA = [
  "---",
  "mode: prompt",
  "respond_repair:",
  "  attempts: 0",
  "---",
  "enum Severity { Low, High }",
  "subagent fn helper(a: string) {",
  "  let v = @<Severity>`Ping`?",
  "  v",
  "}",
  'let out = helper("x")',
  "out",
  "",
].join("\n");

/** An `AssistantMessage`-shaped scripted reply (the sibling harness's builder). */
function assistantReply(fields: {
  readonly stopReason: string;
  readonly text?: string;
  readonly toolCalls?: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly arguments: unknown;
  }>;
}): Record<string, unknown> {
  const content: Record<string, unknown>[] = [];
  if (fields.text !== undefined) {
    content.push({ type: "text", text: fields.text });
  }
  for (const call of fields.toolCalls ?? []) {
    content.push({
      type: "toolCall",
      id: call.id,
      name: call.name,
      arguments: call.arguments,
    });
  }
  return {
    role: "assistant",
    content,
    api: "anthropic-messages",
    stopReason: fields.stopReason,
    timestamp: 0,
  };
}

/** The recorded `complete()` call's `context.tools`, duck-typed. */
function contextToolsOf(call: { readonly context: unknown }):
  | readonly Record<string, unknown>[]
  | undefined {
  const tools = (call.context as { readonly tools?: unknown }).tools;
  return tools === undefined ? undefined : (tools as readonly Record<string, unknown>[]);
}

describe("bug 0028 (b) enum root — a declared `enum` annotation reaches the respond-tool registration as its lowered non-object root", () => {
  it("RED RESPOND: the presented respond tool's parameters carry {\"type\":\"string\",\"enum\":[\"Low\",\"High\"]} under the wire envelope on BOTH the free-phase and forced-respond dispatches", async () => {
    const doc = parseDoc(ENUM_FN_THETA, "enumroot.theta");
    expect(
      doc.diagnostics,
      `fixture guard: the enum-root theta must parse cleanly before it is driven; ` +
        `${render(doc)}`,
    ).toEqual([]);
    expect(
      doc.frontmatter,
      "fixture guard: the theta must carry parseable frontmatter",
    ).not.toBeNull();

    scripted.queue = [
      // complete() #1 — the free-phase round-0 turn terminates in plain text.
      () => assistantReply({ stopReason: "stop", text: "thinking" }),
      // complete() #2 — the forced respond turn. The tool name is read off what
      // the production code actually presented: the slug is content-addressed
      // over the lowered schema, so it CHANGES with the fix and must never be
      // hardcoded here.
      (call) => {
        const tools = contextToolsOf(call);
        const name = tools?.[0]?.["name"];
        expect(
          typeof name,
          `the forced respond dispatch must present the respond tool; observed ` +
            `tools=${JSON.stringify(tools)}`,
        ).toBe("string");
        return assistantReply({
          stopReason: "toolUse",
          // A conforming CALL against the registered wire schema: the declared
          // enum's wire value in the envelope's `value` position, which unwraps
          // to `"Low"` and validates against the enum root.
          toolCalls: [{ id: "tc1", name: name as string, arguments: { value: "Low" } }],
        });
      },
    ];

    const theta: ThetaCompositionInput = {
      slashName: "enumroot",
      sourcePath: "/theta/enumroot.theta",
      frontmatter: doc.frontmatter!,
      body: doc.body,
    };
    const notes: string[] = [];
    const deps = createProductionProducerDeps({
      pi: {
        sendMessage: (message: { readonly content?: unknown }): void => {
          notes.push(String(message.content ?? ""));
        },
        registerTool: (): void => {},
        getActiveTools: (): string[] => [],
        setActiveTools: (): void => {},
        on: (): void => {},
      } as unknown as ExtensionAPI,
      root: {
        checkpoint: { before: (): Promise<void> => Promise.resolve() },
        idSource: {
          newInvocationId: (): string => "inv-1",
          newToolCallId: (): string => "tc-1",
        },
        clock: { wallNow: (): number => 0 },
        schemaValidator: ajv(),
      } as unknown as RuntimeRoot,
      modelRegistry: {
        getAvailable: () => [ANTHROPIC_MODEL],
        getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k-test" }),
      } as unknown as ModelRegistry,
    });
    const binding = deps.bindPromptConversation({
      theta,
      args: "",
      ctx: {
        model: ANTHROPIC_MODEL,
        sessionManager: {
          getEntries: (): readonly unknown[] => [],
          getLeafId: (): undefined => undefined,
        },
      } as unknown as ExtensionCommandContext,
    });
    await executeBody(theta.body, binding.executeDeps);

    // The drive must actually have reached the registration, or the assertions
    // below would pass over an empty list.
    expect(
      scripted.calls.length,
      "the two-phase drive issues exactly TWO complete() calls — the free-phase " +
        "turn and the forced respond turn (QRY-14); without them the respond tool " +
        "was never presented and this cell would assert nothing",
    ).toBe(2);

    for (const [index, label] of [
      [0, "free-phase"],
      [1, "forced-respond"],
    ] as const) {
      const tools = contextToolsOf(scripted.calls[index]!);
      expect(
        Array.isArray(tools) && tools!.length === 1,
        `the ${label} dispatch presents exactly the respond tool (the theta's ` +
          `callable set is empty); observed ${JSON.stringify(tools)}`,
      ).toBe(true);
      const parameters = JSON.parse(JSON.stringify(tools![0]!["parameters"])) as {
        readonly properties?: Record<string, unknown>;
      };
      expect(
        parameters,
        `the presented respond tool's parameters carry the lowered response schema, ` +
          `and schema-subset.md:80 pins a declared enum's lowering to ` +
          `{"type":"string","enum":[…wire values…]}. At HEAD schemaDeclsOf filters ` +
          `kind === "schema", so the enum never reaches the lowering and the ` +
          `${label} dispatch conveys the accept-anything {} — the author did ` +
          `everything right and still gets no validation (QRY-22 conveyance clause). ` +
          `The root is carried in the single-property WIRE ENVELOPE, because a tool ` +
          `call's arguments are a JSON object at the wire and a bare non-object root ` +
          `is unsatisfiable by every possible call`,
      ).toEqual(SEVERITY_WIRE);
      expect(
        parameters.properties?.["value"],
        `the envelope carries the LOWERED root verbatim at its payload position — the ` +
          `envelope is a wire wrapper, never a rewrite of the subset's emission table`,
      ).toEqual(SEVERITY_LOWERED);
    }

    // The enveloped call must BIND, not merely validate: the unwrap is what
    // turns `{value:"Low"}` back into the declared enum's value. `attempts: 0`
    // means a validation failure would surface as an Err note instead.
    expect(
      notes.filter((note) => /returned Err|aborted/.test(note)),
      `the enveloped respond call must unwrap to "Low" and bind as the typed value; ` +
        `a failed unwrap validates the ENVELOPE OBJECT against the enum root and ` +
        `surfaces a fail-closed note instead. Notes: ${JSON.stringify(notes)}`,
    ).toEqual([]);
  });

  it("RED ENUM-LOWER: `lowerQueryResponseSchema` lowers a declared enum annotation to its wire-value enum root", async () => {
    // The seam-level twin of the drive above, localising the asymmetry: the SAME
    // enum reached through the `params:` path already lowers to
    // {"type":"string","enum":["Low","High"]} (`buildBodyTypeSchemas` lowers
    // enums FIRST), so the two lowering entry points must converge.
    const doc = parse("enum Severity { Low, High }\nlet r = @<Severity>`x`\nr\n");
    const decls = doc.body.statements.filter(
      (s): s is SchemaDecl => s.kind === "schema",
    );
    const enumDecls = doc.body.statements.filter(
      (s): s is EnumDecl => s.kind === "enum",
    );
    expect(
      enumDecls.length,
      `fixture guard: the body must carry the declared enum; statements=` +
        JSON.stringify(doc.body.statements.map((s) => s.kind)),
    ).toBe(1);
    // The enum decls are handed to the seam explicitly: the fix widens the
    // lowering's inputs from `schema` decls to `schema` + `enum` decls, so the
    // two entry points (`params:` and typed-query) resolve the same universe.
    expect(
      lowerQueryResponseSchema("Severity", decls, enumDecls),
      "schema-subset.md §Lowering Algorithm step 3 (:80): an enum lowers to " +
        '{ "type": "string", "enum": [...] }. At HEAD the typed-query lowering is ' +
        "handed schema decls ONLY, so the declared enum is unresolvable by " +
        "construction and lowers to the accept-anything {}",
    ).toEqual(SEVERITY_LOWERED);
  });
});

// ===========================================================================
// (d) TOTALITY PINS — the seam contract the fix deliberately does NOT change.
// GREEN at HEAD and post-fix. With the parse gate in place both inputs are
// UNREACHABLE FROM SOURCE, so these are reachable only by calling the seam
// directly, as here.
// ===========================================================================

describe("bug 0028 (d) totality — lowerQueryResponseSchema stays a total function", () => {
  it("TOTAL-UNRESOLVED: an unresolvable named annotation still lowers to {} (not undefined, not a throw)", () => {
    // Bug doc §Fix, "lowerQueryResponseSchema stays a total function returning
    // `{}`": `#validateInvokeReturn`'s early-return arm returns its result
    // UNVALIDATED on `undefined`, which is strictly WORSE than `{}` for
    // `invoke<T>`. Do not "improve" this.
    expect(
      lowerQueryResponseSchema("NotDeclaredAnywhere", []),
      "the seam's total-function contract is unchanged by this fix — the parse gate " +
        "is the sole enforcement point, and the seam remains defence in depth behind it",
    ).toEqual({});
  });

  it("TOTAL-EMPTY: `undefined` stays reserved for the EMPTY annotation alone", () => {
    // tests/empty-query-annotation.test.ts (the bug-0014 suite) pins `""` as the
    // sole unlowerable input; this fix must not widen that arm.
    expect(
      lowerQueryResponseSchema("", []),
      "the empty annotation has no lowerable shape — undefined, and nothing else " +
        "maps to undefined",
    ).toBeUndefined();
  });
});

// ===========================================================================
// (c) REGISTRY ROW (DIAG-2) — the shipped `unresolved-named-type` row's Trigger
// already names both positions this fix emits at. GREEN at HEAD: bug 0025 wrote
// the widened row in the immediately preceding commit; this cell pins that the
// positions the fix adds are the REGISTERED ones and that no per-site code is
// minted.
// ===========================================================================

describe("bug 0028 (c) registry contract — the unresolved-named-type row covers this fix's positions (DIAG-2)", () => {
  it("REG: the row's Trigger names BOTH the `@<T>` query annotation and a `schema` body field type, severity stays E", () => {
    const row = REGISTRY.find((r) => r.code === CODE);
    expect(
      row,
      `DIAG-2: docs/spec_topics/diagnostics/code-registry-parse.md must carry the ${CODE} row`,
    ).toBeDefined();
    expect(
      row!.severity,
      "error severity follows the bug-0014 precedent — load refuses the theta — and " +
        "matches the `params:` posture for the identical mistake",
    ).toBe("E");
    expect(row!.phase, "emitted during the whole-file parse").toBe("parse");
    expect(
      row!.trigger,
      `DIAG-2: the row's closed position list must name the \`@<T>\` query annotation ` +
        `— one row, one message, no per-site code (bug doc §Fix, "Registry"; shared ` +
        `with bug 0025); observed trigger=${JSON.stringify(row!.trigger)}`,
    ).toContain("`@<T>` query annotation");
    expect(
      row!.trigger,
      `DIAG-2: the row's closed position list must name a \`schema\` body field type ` +
        `— the position \`schema S { x: Ghost }\` emits at; observed ` +
        `trigger=${JSON.stringify(row!.trigger)}`,
    ).toContain("a `schema` body field type");
    expect(
      unresolvedMessage("Tirage"),
      "DIAG-4: one message template for every position",
    ).toBe("unresolved named type 'Tirage'");
  });
});

// ===========================================================================
// (a) THE `params:` SIBLING OF THE HOIST. The two-pass lowering is shared with
// `collectBodyTypes` (theta-document.ts), so a `params:` field naming a
// cross-referencing schema now receives a fragment that MINTS `$ref`s. Those
// pointers are root-absolute, so the `params:` document needs the same
// hoist-to-root the annotation path performs (`pruneDocumentDefs`); without it
// a name reached only THROUGH another name dangles and AJV refuses the whole
// document with `can't resolve reference #/$defs/<Name>`.
//
// Production reach: a multi-param / non-string-param theta routes to the
// binder, and `buildBinderEnvelopeSchema` lifts this `$defs` table verbatim to
// the envelope-document root. The envelope is compiled LAZILY at extraction
// (`dispatch.envelopeValidator()`), which sits OUTSIDE the transport
// try/catch — a resolver throw there escapes the dispatch AFTER the binder LLM
// call has already spent tokens.
// ===========================================================================

/** A `params:`-bearing theta over `body`'s declarations, binder-routed. */
function paramsTheta(param: string, body: string): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: binder-model",
    "params:",
    `  p: ${param}`,
    "---",
    body,
    "@`go`",
    "",
  ].join("\n");
}

const FORWARD_PARAMS = paramsTheta("Person", FORWARD);
const MUTUAL_PARAMS = paramsTheta("A", MUTUAL);
const SELF_PARAMS = paramsTheta("Tree", SELF);
/** A two-level BACKWARD chain: `Item.loc: Loc`, `Loc` declared first. */
const BACKWARD_PARAMS = paramsTheta(
  "Item",
  ["schema Loc { city: string }", "schema Item { loc: Loc }"].join("\n"),
);

/** The lowered `params:` document of a cleanly-parsing theta. */
function paramsSchemaOf(source: string): LoweredSchema {
  const doc = parseDoc(source, "bug0028-params.theta");
  expect(
    doc.diagnostics,
    `fixture guard: the params theta must parse cleanly; ${render(doc)}`,
  ).toEqual([]);
  const lowered = doc.frontmatter?.params?.loweredSchema;
  expect(
    lowered,
    "a `params:` block that parsed cleanly must lower to a document (BIND-1)",
  ).toBeDefined();
  return lowered as LoweredSchema;
}

describe("bug 0028 (a) params: — a cross-referencing schema's transitive $defs reach the document root", () => {
  for (const [label, source, param, expectedDefs] of [
    [
      "FORWARD (`Person.pets: array<Animal>`, Animal declared after)",
      FORWARD_PARAMS,
      "Person",
      ["Animal", "Person"],
    ],
    ["MUTUAL (`A.b: array<B>`, `B.a: array<A>`)", MUTUAL_PARAMS, "A", ["A", "B"]],
    ["SELF (`Tree.children: array<Tree>`)", SELF_PARAMS, "Tree", ["Tree"]],
    [
      "BACKWARD (`Item.loc: Loc`, Loc declared first)",
      BACKWARD_PARAMS,
      "Item",
      ["Item", "Loc"],
    ],
  ] as const) {
    it(`PARAMS-HOIST ${label}: every ref the document mints resolves from its own root, and the binder envelope compiles`, () => {
      const paramsSchema = paramsSchemaOf(source);
      // Non-vacuity: without a minted `$ref` there is nothing for AJV's
      // resolver to resolve and the compile legs below prove nothing.
      expect(
        (paramsSchema as { readonly properties?: Record<string, unknown> }).properties?.[
          "p"
        ],
        `the two-pass lowering must mint a $ref for the \`params:\` RHS; observed ` +
          `${JSON.stringify(paramsSchema)}`,
      ).toEqual({ $ref: `#/$defs/${param}` });
      expect(
        Object.keys(defsOf(paramsSchema)).sort(),
        `every name transitively reachable from the \`params:\` document root must ` +
          `carry a fragment AT THAT ROOT — a root-absolute #/$defs/<Name> pointer ` +
          `resolves nowhere else, so a closure left nested inside another fragment's ` +
          `own $defs dangles; observed $defs=${JSON.stringify(defsOf(paramsSchema))}`,
      ).toEqual([...expectedDefs]);
      // No fragment may retain a nested `$defs`: root-pointer semantics make it
      // dead weight, and a duplicated nested body could drift from the hoisted
      // copy it shadows.
      for (const [name, fragment] of Object.entries(defsOf(paramsSchema))) {
        expect(
          fragment["$defs"],
          `$defs.${name} must have shed its fragment-local $defs on the way up`,
        ).toBeUndefined();
      }
      compile(
        paramsSchema,
        "the `params:` document is compiled at invocation-time argument validation",
      );
      // The crash site: `buildBinderEnvelopeSchema` hoists the params `$defs`
      // verbatim to the envelope root, and `dispatch.envelopeValidator()`
      // compiles that envelope lazily at extraction — outside every catch.
      compile(
        buildBinderEnvelopeSchema({ paramsSchema, defaultedFields: [] }) as LoweredSchema,
        "the binder envelope is compiled at the routing step, after the binder LLM " +
          "call has already spent tokens; a resolver throw there escapes the dispatch",
      );
    });
  }

  it("PARAMS-BINDER: a forward-referencing `params:` schema binds through the REAL binder dispatch — the envelope compile does not throw", async () => {
    // The production reach in full: `runBinder` → forced-tool `complete()` →
    // envelope extraction → `dispatch.envelopeValidator()` (the lazy compile).
    const doc = parseDoc(FORWARD_PARAMS, "bug0028-params.theta");
    expect(
      doc.diagnostics,
      `fixture guard: the binder-routed params theta must parse cleanly; ${render(doc)}`,
    ).toEqual([]);
    const binderModel = { ...ANTHROPIC_MODEL, id: "binder-model" };
    // `scripted.calls` accumulates across cells in this file (the mock is
    // module-scoped), so the dispatch count is asserted as a DELTA.
    const callsBefore = scripted.calls.length;
    // The binder tool name is content-addressed over the envelope schema, so it
    // is read off what production actually presented, never hardcoded.
    scripted.queue = [
      (call) => {
        const tools = contextToolsOf(call);
        const name = tools?.[0]?.["name"];
        expect(
          typeof name,
          `the binder dispatch must attach exactly one forced binder tool; observed ` +
            `tools=${JSON.stringify(tools)}`,
        ).toBe("string");
        return assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            {
              id: "tc1",
              name: name as string,
              arguments: {
                envelope: {
                  kind: "ok",
                  args: { p: { name: "rex", pets: [{ species: "dog" }] } },
                },
              },
            },
          ],
        });
      },
    ];
    const notes: string[] = [];
    const deps = createProductionProducerDeps({
      pi: {
        sendMessage: (message: { readonly content?: unknown }): void => {
          notes.push(String(message.content ?? ""));
        },
        registerTool: (): void => {},
        getActiveTools: (): string[] => [],
        setActiveTools: (): void => {},
        on: (): void => {},
      } as unknown as ExtensionAPI,
      root: {
        checkpoint: { before: (): Promise<void> => Promise.resolve() },
        idSource: {
          newInvocationId: (): string => "inv-1",
          newToolCallId: (): string => "tc-1",
        },
        clock: { wallNow: (): number => 0 },
        schemaValidator: ajv(),
      } as unknown as RuntimeRoot,
      modelRegistry: {
        getAvailable: () => [binderModel],
        getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k-test" }),
      } as unknown as ModelRegistry,
    });
    const result = await deps.runBinder({
      theta: {
        slashName: "paramsforward",
        sourcePath: "/theta/paramsforward.theta",
        frontmatter: doc.frontmatter!,
        body: doc.body,
        binderModel: "binder-model",
      },
      args: "a dog named rex",
      ctx: {} as unknown as ExtensionCommandContext,
    });
    expect(
      scripted.calls.length - callsBefore,
      "the binder pass issues exactly one forced-tool complete() call for a " +
        "well-formed ok envelope (no retry — a malformed or transport class would " +
        "add attempts); without it the envelope validator was never reached and " +
        "this cell would assert nothing",
    ).toBe(1);
    expect(
      result.bound,
      `the envelope AJV compile at the routing step must resolve every #/$defs ` +
        `pointer the params document minted; a MissingRefError there escapes ` +
        `runBinder entirely (it sits outside the transport catch). Notes: ` +
        `${JSON.stringify(notes)}`,
    ).toBe(true);
    expect(result.args, "the validated ok arm's args reach the body unchanged").toEqual({
      p: { name: "rex", pets: [{ species: "dog" }] },
    });
  });
});

// ===========================================================================
// (c) THE `let` ANNOTATION IS NOT AN `@<T>` POSITION. `parseLet` propagates a
// `let` annotation verbatim onto a bare-query initialiser, and a query's
// declared value type is `Result<T, QueryError>` (QRY-1) — so the annotation
// check must not report the `E` side. grammar.md:107 admits `Result` at `let`
// annotations and pins that `Result` is "never lowered to a JSON Schema
// fragment"; the registry row's closed four-position list does not include the
// `let` annotation, and the author wrote no `@<T>` at all.
// ===========================================================================

describe("bug 0028 (c) the propagated `let` annotation — a `Result<T, E>` value type is not an unresolved annotation", () => {
  for (const [label, body] of [
    [
      "QRY-1's documented return type",
      "let r: Result<string, QueryError> = @`hello`\nr\n",
    ],
    ["its `?`-propagating form", "let r: Result<string, QueryError> = @`hello`?\nr\n"],
    [
      "written at the annotation root",
      "let r = @<Result<string, QueryError>>`hello`\nr\n",
    ],
  ] as const) {
    it(`RESULT-LET ${label}: loads clean`, () => {
      const doc = parse(body);
      expectNoUnresolved(
        doc,
        `RESULT-LET — \`QueryError\` is a builtin observed only by theta code and ` +
          `never lowered to a JSON Schema fragment (grammar.md ` +
          `§"Generic-application constructors"), so it resolves to no declaration ` +
          `BY DESIGN`,
      );
      expect(
        doc.diagnostics,
        `the \`let\` annotation is outside the registry row's closed position list ` +
          `and \`Result\` is admitted there by the grammar (grammar.md:107); ` +
          `${render(doc)}`,
      ).toEqual([]);
    });
  }

  it("RESULT-LET-TYPO: the `Result` ok side is still checked — `let r: Result<Tirage, QueryError>` fires on 'Tirage' alone", () => {
    // The peel is confined to the E side: `T` is the shape the response is
    // validated against, so a typo there is still the accept-anything hole this
    // fix closes. Exactly ONE diagnostic — never a second naming `QueryError`.
    const doc = parse(
      "schema Triage { urgent: boolean }\nlet r: Result<Tirage, QueryError> = @`x`\nr\n",
    );
    expectOneUnresolved(doc, "Tirage", "RESULT-LET-TYPO — the Result ok side");
  });

  it("CONTROL RESULT-LET: `let r: Result<Triage, QueryError>` over a DECLARED Triage stays clean", () => {
    const doc = parse(
      "schema Triage { urgent: boolean }\nlet r: Result<Triage, QueryError> = @`x`\nr\n",
    );
    expect(
      doc.diagnostics,
      `a declared ok side resolves whole-file and must stay clean; ${render(doc)}`,
    ).toEqual([]);
  });

  // The peel splits `Result`'s type-argument list, so it must agree with the
  // parser that computes `theta/parse/generic-arity-mismatch` on where an
  // argument ends. `ObjectType` is a `Type` in any position (grammar.md
  // §"Inline object types"), so a brace-carrying ok side puts a
  // top-level-LOOKING comma inside argument one: an angle-depth-only split
  // reports THREE arguments where the grammar reports two, and the peel then
  // descends the whole unpeeled `Result<…>` — which both names the builtin
  // `QueryError` (a spurious load refusal at a position outside the registry
  // row's closed list) and MISSES a real typo inside the object.
  for (const [label, okSide, expected] of [
    ["two fields", "{a: string, b: integer}", undefined],
    ["three fields", "{a: string, b: integer, c: boolean}", undefined],
    ["one field (no top-level-looking comma)", "{a: string}", undefined],
    ["a field whose type is itself brace-carrying", "{a: {x: string, y: integer}}", undefined],
    ["nested under array<…>", "array<{a: string, b: integer}>", undefined],
    ["a typo among two fields", "{a: Tirage, b: integer}", "Tirage"],
  ] as const) {
    it(`RESULT-LET-BRACE ${label}: the argument split tracks brace depth`, () => {
      const doc = parse(
        `schema Triage { urgent: boolean }\nlet r: Result<${okSide}, QueryError> = @\`x\`\nr\n`,
      );
      if (expected === undefined) {
        expect(
          doc.diagnostics,
          `the grammar sees arity 2 here, so the ok side — and ONLY the ok side — is ` +
          `checked; \`QueryError\` must never be named; ${render(doc)}`,
        ).toEqual([]);
        return;
      }
      expectOneUnresolved(
        doc,
        expected,
        `RESULT-LET-BRACE — a typo inside a brace-carrying ok side is still the ` +
          `accept-anything hole this fix closes, and is named ALONE`,
      );
    });
  }

  // A `Result` application of the wrong arity is `generic-arity-mismatch`'s
  // alone: which argument would have been `T` is not determinable, so the peel
  // reports nothing rather than naming `QueryError` and every stray argument
  // beside the real error.
  for (const [label, annotation, arity] of [
    ["arity 3", "Result<string, QueryError, extra>", 3],
    ["arity 1", "Result<string>", 1],
  ] as const) {
    it(`RESULT-LET-ARITY ${label}: the arity breach is reported ALONE`, () => {
      const doc = parse(`let r: ${annotation} = @\`x\`\nr\n`);
      expectNoUnresolved(
        doc,
        `RESULT-LET-ARITY — a malformed \`Result\` application is the arity check's ` +
          `to report; ${CODE} beside it is noise naming the builtin the peel exists ` +
          `to protect`,
      );
      expect(
        codes(doc.diagnostics),
        `the arity breach itself must still refuse the load; ${render(doc)}`,
      ).toEqual(["theta/parse/generic-arity-mismatch"]);
      expect(
        doc.diagnostics[0]?.message,
        `the arity diagnostic names the real argument count; ${render(doc)}`,
      ).toContain(`got ${arity}`);
    });
  }
});
