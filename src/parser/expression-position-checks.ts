// Type-phase boolean-position and indexed-access receiver diagnostics.

import type { Diagnostic } from "../diagnostics/diagnostic";
import {
  checkCompatible,
  type CompatType,
  type TypeEnv,
} from "./type-compat";
import { classifyIndexReceiver, type CompatSite } from "./type-compat-sites";

/**
 * The type-phase boolean-position check. Reports
 * `theta/parse/non-boolean-condition` for an operand in any of the six boolean
 * positions of expressions.md §Truthiness (the `if` / `while` scrutinees, the
 * ternary condition, the `&&` / `||` operands, or the unary `!` operand) whose
 * static type is other than `boolean` — theta performs no truthiness coercion.
 * Returns no diagnostic for a `boolean`-typed operand. The check is
 * position-independent: the caller classifies the site, the diagnostic names
 * only the operand's type.
 */
export function checkBooleanPosition(opts: {
  readonly operandType: CompatType;
  readonly site: CompatSite;
}): Diagnostic[] {
  const { operandType, site } = opts;

  // Only `boolean` is admissible in boolean position; theta performs no
  // truthiness coercion. Routed through the V2b `⊑` relation against `boolean`:
  // a `boolean` (or a boolean literal) is `compatible`; a statically
  // unresolvable operand is `unknown` and deferred to the bug 0369 runtime
  // belt (`BooleanPositionKindDefectError`, statement-executor.ts /
  // production-theta-producer.ts) (it raises nothing here); anything else
  // fires the diagnostic.
  const booleanType: CompatType = { kind: "prim", name: "boolean" };
  const r = checkCompatible(operandType, booleanType, {});
  if (r === "compatible" || r === "unknown") {
    return [];
  }

  // Message from diagnostics/code-registry-parse.md (`theta/parse/non-boolean-condition`).
  return [
    {
      severity: "error",
      code: "theta/parse/non-boolean-condition",
      file: site.file,
      range: site.range,
      message: `condition must be boolean; got ${displayCompatType(operandType)}`,
    },
  ];
}

/**
 * The type-phase indexed-access receiver check (expressions.md §"Supported
 * forms"). Reports `theta/parse/non-indexable-receiver` when the receiver `a` of
 * an `a[k]` index expression is neither `array<T>` nor an object value — e.g.
 * `s[i]` on a `string`. Returns no diagnostic for an `array<T>` or object
 * receiver, or a statically-unresolvable one (deferred to the runtime safety
 * net).
 */
export function checkIndexReceiver(opts: {
  readonly receiverType: CompatType;
  readonly env: TypeEnv;
  readonly site: CompatSite;
}): Diagnostic | undefined {
  const { receiverType, env, site } = opts;
  if (classifyIndexReceiver(receiverType, env) !== "primitive") {
    return undefined;
  }
  // Message from diagnostics/code-registry-parse.md (`theta/parse/non-indexable-receiver`).
  return {
    severity: "error",
    code: "theta/parse/non-indexable-receiver",
    file: site.file,
    range: site.range,
    message: `indexed access requires an array<T> or object receiver; got ${displayCompatType(
      receiverType,
    )}`,
  };
}

/**
 * Render a `CompatType` to the display name the `theta/parse/non-boolean-condition`
 * *Message* string interpolates (`condition must be boolean; got <type>`).
 */
function displayCompatType(type: CompatType): string {
  switch (type.kind) {
    case "prim":
      return type.name;
    case "literal":
      return type.typesAs;
    case "named":
      return type.name;
    case "array":
      return `array<${displayCompatType(type.element)}>`;
    case "union":
      return type.arms.map(displayCompatType).join(" | ");
    case "object":
      return `{ ${type.fields
        .map((f) => `${f.name}: ${displayCompatType(f.type)}`)
        .join(", ")} }`;
  }
}
