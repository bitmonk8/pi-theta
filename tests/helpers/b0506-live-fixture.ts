import { parseDoc } from "./e2e-s1";

/** Shared by the live witness and its provider-free fixture/registration gate. */
export function b0506ProbeSource(cell: { readonly callerSchema: string; readonly good: boolean }): string {
  return [
    "---", "mode: prompt", "---",
    'import { via_lib } from "./workers/lib.thetalib"',
    cell.callerSchema,
    "let result = via_lib()",
    "let outcome = match result {",
    // A match arm is an expression, not a bare if statement. Use a block
    // expression with an explicit string tail; the nested if only updates it.
    "  Ok(v) => {",
    '    let mut label = "accepted-unexpected"',
    `    if ${cell.good ? 'v.tag == "x"' : 'v == "not-an-ROut"'} { label = "accepted-valid" }`,
    "    label",
    "  },",
    "  Err(e) => e.cause",
    "}",
    "@`Validation outcome: ${outcome}. What is 263 plus 514? Answer with the number only.`",
    "",
  ].join("\n");
}

/** Fail before model resolution/spawn, rather than paying for an unknown slash command as chat. */
export function assertB0506ProbeParses(source: string): void {
  const doc = parseDoc(source, "b0506-probe.theta");
  if (doc.diagnostics.length > 0) {
    throw new Error("B0506 fixture failed parse preflight: " + doc.diagnostics.map((diagnostic) =>
      `${diagnostic.code}: ${diagnostic.message}`,
    ).join("; "));
  }
}
