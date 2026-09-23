// `@`-query wire-text rendering for the production theta producer
// (production-theta-producer.ts). Hosts the typed-aware query text renderer
// (bug 0010 degraded-arm conveyance), the merged same-file / imported schema-
// and enum-decl views (bug 0465), and the FN-7-aware launch respond-tool-name
// enumeration (bug 0488). None of these touch `ProductionThetaProducer`
// instance state; they consume only their arguments. The interpolation
// stringify / outbound-translation walk (bug 0476) lives with its runtime
// substrate in runtime/query-interpolation.ts (PTQ-1289).
//
// Split out of production-theta-producer.ts (PTQ-1285); that module re-exports
// the previously-public names so existing importers resolve unchanged.

import type { SubagentLaunchEntry } from "../runtime/subagent-placement";
import type { ConversationBindInput, ThetaCompositionInput } from "./theta-composition-producer";
import type { LexicalEnvironment } from "../runtime/lexical-environment";
import type { InvokeChain } from "../runtime/invoke-depth-cycle";
import type {
  EnumDecl,
  QueryExpr,
  SchemaDecl,
  ThetaBody,
} from "../parser/theta-document";
import { collectSessionTypedQueries } from "../parser/theta-document";
import { lowerQueryResponseSchema } from "../parser/query-schema-lowering";
import type { LoweredSchema } from "../seams/schema-validator";
import { respondSchemaSlug, respondToolName } from "../runtime/typed-query-validation";
import { renderQueryText } from "../runtime/query-interpolation";
import { buildBoundEnvironment, presentedCallableNames } from "./callable-lowering";

/**
 * Render one `@`-query to its wire text, appending the typed-query JSON-only
 * instruction for a schema-typed query. Bug 0010: this fused conveyance
 * survives ONLY on the DEGRADED arm (an unlowerable annotation, no respond
 * context) of both drivers — the two-phase paths open with the bare rendered
 * template and convey the shape via the respond tool + QRY-15 template
 * instead. The degraded conveyance falls back to the annotation text because
 * the schema did not lower.
 *
 * WHY "JSON value" and not "JSON object" (bug 0028 §Fix): a declared `enum`
 * annotation lowers to a non-object root (schema-subset.md:80 —
 * `{ "type": "string", "enum": […] }`), and type-system.md:15 applies the
 * same type grammar to every `@<T>` position, so a bare enum at the
 * annotation root is legal. The instruction wording is shape-agnostic so it
 * stays true of a lowered enum or primitive root, not only an object root.
 */
export function renderTypedAwareQueryText(
  expr: QueryExpr,
  env: LexicalEnvironment,
  lowered?: LoweredSchema,
  chain?: InvokeChain,
): string {
  const base = renderQueryText(expr, env, chain);
  if (expr.schema === null) {
    return base;
  }
  const shape = lowered !== undefined ? JSON.stringify(lowered) : expr.schema;
  return (
    `${base}\n\nRespond with ONLY a single minified JSON value matching this JSON ` +
    `schema, and nothing else — no prose, no markdown, no code fences: ${shape}`
  );
}

/** The theta body's `schema` declarations, for whole-file named-type resolution. */
function schemaDeclsOf(body: ThetaBody): SchemaDecl[] {
  return body.statements.filter((stmt): stmt is SchemaDecl => stmt.kind === "schema");
}

/**
 * The theta body's SAME-FILE `enum` declarations (bug 0028 §Fix:
 * `schemaDeclsOf`'s enum sibling). Both `lowerQueryResponseSchema` call sites
 * pass `mergedEnumDeclsOf` / `mergedSchemaDeclsOf` (bug 0465), which merge
 * these same-file decls with the theta's imported ones; `enumDeclsOf` /
 * `schemaDeclsOf` supply the same-file half so a declared `enum` annotation
 * (`@<Severity>`) resolves at the typed-query / `invoke<T>` lowering exactly
 * as it does on the `params:` path.
 */
function enumDeclsOf(body: ThetaBody): EnumDecl[] {
  return body.statements.filter((stmt): stmt is EnumDecl => stmt.kind === "enum");
}

/**
 * Bug 0488: the synthesised `__theta_respond_<slug>` tool names for every
 * typed query the session THIS launch spawns will drive — the launch-time
 * input to `SubagentArgvInput.respondToolNames`. A `.theta` callable's
 * `--tools` allowlist must carry these or the ≥0.86 strict allowlist
 * suppresses the child's own mid-session respond-tool registration
 * (docs/bugs/0488-….md).
 *
 * Bodies the driven session executes inline (each contributing its typed
 * queries' respond names):
 *  - `fn` entry — the NAMED `subagent fn`'s own body (an unresolved name
 *    yields no names; the drive path `#driveSubagentFnEntry` reports the
 *    parent/child parse divergence, this function does not speculate about
 *    it), PLUS every SAME-FILE top-level ordinary `fn` body: a sibling
 *    ordinary fn called from the subagent-fn body runs inline in the same
 *    child session and registers its typed queries' respond tools
 *    mid-session, yet it is a statement of the enclosing theta's body — never
 *    of `fn.body` — so `collectSessionTypedQueries(fn.body)` alone misses it.
 *    The enclosing theta's top-level body is NOT added (the fn session does
 *    not drive it — FN-7 symmetry).
 *  - theta entry (the default) — the theta's own body, whose walk already
 *    descends same-file ordinary `fn` bodies and stops at `subagent fn`
 *    boundaries.
 *  - BOTH entries — every imported module's body (`imp.moduleScope.body`):
 *    an imported ordinary `.thetalib` `fn` is inline-callable, and its body
 *    lives only in the import's module scope, never in `theta.body`.
 *    `collectSessionTypedQueries` skips `subagent fn` bodies inside it.
 *
 * Over-collection is SAFE (bug 0488 cell 4: pi ≥0.86 tolerates an allowlist
 * name unknown at startup; the OMP dialect gates all respond names out at the
 * emit site), so this over-approximates rather than tracks reachability.
 *
 * Every schema is lowered against the CALLER theta's merged decls
 * (`mergedSchemaDeclsOf(theta)` / `mergedEnumDeclsOf(theta)`) — parity with
 * the child's actual lowering site: `#driveSubagentFnEntry` binds the body
 * over `configured.theta` (`#applySubagentFnConfig` overrides only frontmatter
 * / callable set, leaving `body`/`imports`/`importedTypeDecls` the caller's),
 * so the child's `#resolvePromptQuery` lowers each query with
 * `mergedSchemaDeclsOf(deps.theta)` = the CALLER theta's decls. Lowering here
 * against any other decl set would mint a name the child never registers.
 * Each lowered schema mints its respond name via the SAME `respondSchemaSlug`
 * + `respondToolName` recipe the drive layer uses (single-source, bug
 * 0099/0488); an unlowerable schema is skipped as the drive layer's degraded
 * arm treats it. Deduped and SORTED for a deterministic argv.
 */
export function collectLaunchRespondNames(
  theta: ConversationBindInput["theta"],
  entry: SubagentLaunchEntry,
): string[] {
  const bodies: ThetaBody[] = [];
  if (entry.kind === "fn") {
    const lookupEnv = buildBoundEnvironment(
      theta.body,
      undefined,
      theta.imports,
      presentedCallableNames(theta),
      theta.sourcePath,
    );
    const resolution = lookupEnv.resolve(entry.name);
    const fn =
      (resolution.arm === "fn" || resolution.arm === "import") && resolution.fn?.subagent === true
        ? resolution.fn
        : undefined;
    if (fn === undefined) {
      return [];
    }
    bodies.push(fn.body);
    for (const stmt of theta.body.statements) {
      if (stmt.kind === "fn" && stmt.subagent !== true) {
        bodies.push(stmt.body);
      }
    }
  } else {
    bodies.push(theta.body);
  }
  for (const imp of theta.imports ?? []) {
    if (imp.moduleScope?.body !== undefined) {
      bodies.push(imp.moduleScope.body);
    }
  }
  const schemaDecls = mergedSchemaDeclsOf(theta);
  const enumDecls = mergedEnumDeclsOf(theta);
  const names = new Set<string>();
  for (const body of bodies) {
    for (const q of collectSessionTypedQueries(body)) {
      if (q.schema === null) {
        continue;
      }
      const lowered = lowerQueryResponseSchema(q.schema, schemaDecls, enumDecls);
      if (lowered === undefined) {
        continue;
      }
      names.add(respondToolName(respondSchemaSlug(lowered)));
    }
  }
  return [...names].sort();
}

/**
 * Bug 0465 — the merged declaration set `lowerQueryResponseSchema` resolves an
 * annotation against: this theta's OWN `schema` decls, plus every imported
 * schema `checkThetaImports` materialised for it (`theta.importedTypeDecls`,
 * absent for a theta with no top-level `import`, matching `imports`). SAME-FILE
 * WINS a name collision (the existing whole-file rule schema-subset.md already
 * gives a same-file decl over anything else): an imported decl whose name
 * collides with a same-file one is filtered out before the merge, so it is
 * never even offered to `buildBodyTypeSchemas` — not relied on to lose a
 * `.set()` tie-break downstream. Imported decls are listed FIRST only so a
 * same-file decl's later `.set()` write is the one that survives if this
 * filter were ever bypassed; the filter is what actually decides the winner.
 */
export function mergedSchemaDeclsOf(theta: {
  readonly body: ThetaBody;
  readonly importedTypeDecls?: ThetaCompositionInput["importedTypeDecls"];
}): SchemaDecl[] {
  const sameFile = schemaDeclsOf(theta.body);
  const sameFileNames = new Set(sameFile.map((decl) => decl.name));
  const imported = (theta.importedTypeDecls?.schemas ?? []).filter(
    (decl) => !sameFileNames.has(decl.name),
  );
  return [...imported, ...sameFile];
}

/** The `enum` sibling of {@link mergedSchemaDeclsOf} — same same-file-wins filter. */
export function mergedEnumDeclsOf(theta: {
  readonly body: ThetaBody;
  readonly importedTypeDecls?: ThetaCompositionInput["importedTypeDecls"];
}): EnumDecl[] {
  const sameFile = enumDeclsOf(theta.body);
  const sameFileNames = new Set(sameFile.map((decl) => decl.name));
  const imported = (theta.importedTypeDecls?.enums ?? []).filter(
    (decl) => !sameFileNames.has(decl.name),
  );
  return [...imported, ...sameFile];
}
