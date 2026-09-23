// V6b — the render-side projection of a `params:` field's declared type.
//
// This module owns `projectRenderedParamType` (bug 0251 §Fix): projecting a
// `params:` field's declared surface type to what the field's lowering
// (`lowerParamsFieldType`, params-lowering.ts) actually encoded, for the
// binder system prompt's `Parameters:` line. It mirrors
// `lowerParamsFieldType`'s own dispatch order and reuses the lowering
// family's own accept/reject decisions, so rendering and contract can never
// diverge.
import { classifyInlineObjectEntry, lowerLiteralSublanguage } from "./params-lowering";
import {
  isBraceBalanced,
  isSingleEnclosingBraceGroup,
  splitTopLevel,
} from "./type-text-split";
/**
 * Project one brace group's rendered text to what `hoistInlineObjectType`
 * kept: reuse `classifyInlineObjectEntry`'s accept/reject decision entry by
 * entry, drop a rejected entry, and recurse the projection into an accepted
 * entry's own field type (a nested inline object can carry the same tolerated
 * junk one level down). Returns the `group` argument itself — the author's own
 * bytes, never a reconstruction — whenever no entry was dropped and no nested
 * field type projected differently.
 *
 * ZERO ACCEPTED ENTRIES returns the group VERBATIM rather than the permissive
 * `{}` `hoistInlineObjectType` itself would emit for it: an empty schema
 * encodes nothing and forbids nothing (`additionalProperties` is never set),
 * so there is no lowered contract for the rendered text to contradict, and
 * bug 0251 §Fix only reconciles a rendering against a contract that exists.
 *
 * REBUILDING WITH `", "` IS ONLY EVER REACHED ON A GROUP THAT ACTUALLY LOST A
 * SEGMENT (`changed`), which is why the reconstruction can never perturb a
 * well-formed declaration's bytes: a group whose every entry survives
 * classification and whose every field type projects unchanged returns
 * `group` itself, untouched.
 */
function projectBraceGroup(group: string): string {
  const interior = group.slice(1, -1);
  const entries = splitTopLevel(interior, ",", "angle-and-brace");
  const kept: string[] = [];
  let changed = false;
  for (const entry of entries) {
    const classified = classifyInlineObjectEntry(entry);
    if (classified === undefined) {
      changed = true;
      continue;
    }
    const { fieldName, fieldType } = classified;
    const projectedFieldType = projectRenderedParamType(fieldType);
    if (projectedFieldType !== fieldType) {
      kept.push(`${fieldName}: ${projectedFieldType}`);
      changed = true;
    } else {
      // `entry` is already `splitTopLevel`'s trimmed segment text — identical
      // to re-emitting `${fieldName}: ${fieldType}` byte for byte, kept as the
      // ORIGINAL text rather than reassembled so an entry this loop never had
      // to touch never risks a whitespace or quoting difference from the
      // author's own bytes.
      kept.push(entry);
    }
  }
  if (kept.length === 0 || !changed) {
    return group;
  }
  return `{${kept.join(", ")}}`;
}

/**
 * Project a `params:` field's declared surface type to what the field's
 * lowering (`lowerParamsFieldType`, above) actually encoded, for the binder
 * system prompt's `Parameters:` line (bug 0251 §Fix). Byte-identical to
 * `source` unless the lowering discarded a top-level inline-object segment
 * somewhere inside it — a well-formed declared type is therefore unaffected,
 * matching §Fix's identity-on-well-formed-input constraint.
 *
 * MIRRORS `lowerParamsFieldType`'s OWN DISPATCH ORDER, because a rendering
 * that asked a different question of the same source could accept an entry
 * the lowering rejected (or the reverse), which is the exact divergence this
 * fix closes:
 *
 *   1. the literal sublanguage (`lowerLiteralSublanguage`) on the trimmed
 *      source — a literal type hoists nothing, so it renders verbatim;
 *   2. a single enclosing brace group — project it (`projectBraceGroup`);
 *   3. `lowerBraceGroupUnionArms`'s own guard, reproduced exactly (`arms =
 *      splitTopLevel(s, "|")`, `arms.length > 1 && arms.every(isBraceBalanced)
 *      && arms.some(isSingleEnclosingBraceGroup)`) — project only the arms
 *      that are themselves a single enclosing brace group; every other arm
 *      lowers through `lowerTypeExpr`, which hoists nothing, so it is left
 *      untouched here too;
 *   4. otherwise verbatim.
 *
 * ROUTE 4 DOES NOT DESCEND INTO A GENERIC ARGUMENT ON PURPOSE.
 * `array<{a: integer, b > c, m: integer}>` lowers through `lowerTypeExpr`'s
 * generic-application arm, which never calls `hoistInlineObjectType` on its
 * argument and lowers the whole application permissively (`{}`) instead — the
 * interior is not hoisted AT ALL, tolerated segment and declared fields both.
 * Projecting the interior here would drop `b > c` from a rendering whose
 * matching schema is `{}`, encoding a property set the schema never asked
 * for and making the two diverge in the OTHER direction from the one this
 * fix closes. `array<...>` is therefore route 4's fallback, identical to
 * every other shape this dispatch does not recognise.
 */
export function projectRenderedParamType(source: string): string {
  const s = source.trim();
  if (lowerLiteralSublanguage(s) !== undefined) {
    return source;
  }
  if (isSingleEnclosingBraceGroup(s)) {
    const projected = projectBraceGroup(s);
    return projected === s ? source : projected;
  }
  const arms = splitTopLevel(s, "|");
  if (
    arms.length > 1 &&
    arms.every((arm) => isBraceBalanced(arm)) &&
    arms.some((arm) => isSingleEnclosingBraceGroup(arm))
  ) {
    let changed = false;
    const projectedArms = arms.map((arm) => {
      if (!isSingleEnclosingBraceGroup(arm)) {
        return arm;
      }
      const projected = projectBraceGroup(arm);
      if (projected !== arm) {
        changed = true;
      }
      return projected;
    });
    return changed ? projectedArms.join(" | ") : source;
  }
  return source;
}
