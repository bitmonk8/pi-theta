// Shared Triage fixture source and independent closed-lowering expectation.

/** The closed lowering of `schema Triage { urgent: boolean }`. */
export const TRIAGE_DEF = {
  type: "object",
  properties: { urgent: { type: "boolean" } },
  required: ["urgent"],
  additionalProperties: false,
};

/** A Triage declaration followed by one binding, shared by params fixtures. */
export const BODY = "schema Triage { urgent: boolean }\nlet x = 1\n";
