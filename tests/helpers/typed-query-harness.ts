// Shared forced-respond typed-query scaffold for offline schema-validation tests.
// The real parser, AJV validator and query loop stay under test; only the
// model's forced response and fixture identity are scripted here.

import type {
  ForcedRespondTurn,
  FreePhaseTurn,
  QueryModelDriver,
  QueryToolLoopConfig,
} from "../../src/runtime/query-tool-loop";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../../src/seams/schema-validator";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type SchemaDecl,
} from "../../src/parser/theta-document";
import type { ThetaSource } from "../../src/lexer/lexer";

export { SEAM_NOOP_CHECKPOINT as NOOP_CHECKPOINT } from "./invoke-seam-scaffold";

export function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

/**
 * A typed query at `max_rounds: 0` fires the forced-respond terminator as its
 * only turn (QRY-14) — no free-phase provider call — so the scripted driver
 * supplies only the forced-respond payload.
 */
export function forcedRespondConfig(
  fixture: Omit<QueryToolLoopConfig, "maxRounds">,
): QueryToolLoopConfig {
  return { maxRounds: 0, ...fixture };
}

/** A scripted `QueryModelDriver` whose forced-respond turn carries `payload`. */
export class RespondingModel implements QueryModelDriver {
  constructor(private readonly payload: unknown) {}
  nextFreePhaseTurn(): Promise<FreePhaseTurn> {
    // A `max_rounds: 0` typed query never reads a free-phase turn; fail loudly
    // rather than hang if a broken loop ever reaches here.
    throw new Error("no free-phase turn on a max_rounds:0 typed query");
  }
  runToolBatch(): Promise<readonly never[]> {
    throw new Error("no tool batch on a max_rounds:0 typed query");
  }
  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    return Promise.resolve({ kind: "respond", payload: this.payload });
  }
}

/** Parse a `.theta` source and return its body's `schema` declarations. */
export function schemaDeclsOf(src: string, path: string): readonly SchemaDecl[] {
  const deps = {
    systemNote: {
      pi: { sendMessage: () => Promise.resolve() },
      ui: { notify: () => {} },
      emitDiagnostic: () => {},
    },
    modelMatcher: { resolve: () => "resolved" as const },
  } as unknown as ParseThetaDocumentDeps;
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, deps);
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}

/** The production AJV validator with a fixture-specific schema slug. */
export function ajv(slug: string): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug,
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
