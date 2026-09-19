// Shared Triage fixture source and independent closed-lowering expectation.

/** The closed lowering of `schema Triage { urgent: boolean }`. */
export const TRIAGE_DEF = {
  type: "object",
  properties: { urgent: { type: "boolean" } },
  required: ["urgent"],
  additionalProperties: false,
};

/** The resolution map every fixture here resolves `Triage` against. */
export function triageMap(): ReadonlyMap<string, Record<string, unknown>> {
  return new Map<string, Record<string, unknown>>([["Triage", TRIAGE_DEF]]);
}

/** The declared type every control that names Triage resolves against. */
export const DECLS = "schema Triage { urgent: boolean }\n";

/** A Triage declaration followed by one binding, shared by params fixtures. */
export const BODY = `${DECLS}let x = 1\n`;
