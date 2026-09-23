// Shared hand-built `SchemaSidecar` fixtures for the `translateInbound` /
// `translateOutbound` unit tests (src/runtime/wire-translation.ts), so the
// wire-name and named-enum-position literals those files drive are authored
// once rather than re-literalised per file.
import { type SchemaSidecar } from "../../src/parser/schema-lowering";

/**
 * A minimal V5f sidecar for a schema with one renamed field
 * (`first_name as "FirstName"`) and one non-renamed named-enum field
 * (`severity: Severity`). It carries NO `refTargets` map; a caller that needs
 * the always-emitted empty map (the `buildSidecar` shape) spreads one in.
 */
export function renamedFieldNamedEnumSidecar(): SchemaSidecar {
  return {
    wireNames: [{ theta: "first_name", wire: "FirstName" }],
    namedEnumPositions: [{ pointer: "/properties/severity", enumName: "Severity" }],
  };
}
