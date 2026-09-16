// The shared `tools:` entry admission gate (PTQ-0382): every consumer of a
// `tools:` list in `production-composition.ts` — the depth-0 callee-cache
// loop in `resolveThetaToolsAtLoad`, and the three nested-containment walks
// (`calleeFailsOwnStructuralChecksBody`, `probeNestedToolsContainment`,
// `checkNestedToolsContainment`) — must apply the IDENTICAL subject test
// before doing anything else with an entry (bugs 0111/0248): a malformed or
// bare-name `tools:` entry draws exactly one diagnostic no matter which of
// those recursion depths meets it first. `production-composition.ts` is well
// past the D9 justify-band LOC threshold, so this lives in its own sibling
// module and is imported back rather than growing that file further.

import { parseToolsEntry } from "../parser/callable-set";

/**
 * Extract one `tools:` entry's callable spec (the token before an optional
 * `as <name>` rename). A PURE first-token projection — it applies no grammar
 * decision itself and returns `parts[0]` for any token count, malformed input
 * included. Grammar-free by design: every caller reaches this only through
 * {@link admissibleToolsSpec}, which gates on `parseToolsEntry` first (bug
 * 0248 §Fix (a)/(b)).
 */
function toolsEntrySpec(entry: string): string {
  const parts = entry.trim().split(/\s+/).filter((p) => p.length > 0);
  return parts[0] ?? "";
}

/**
 * Whether a `tools:` spec is a bare Pi-tool name (identifier-shaped, no path
 * separator or `.theta` extension) rather than a `.theta` path literal — the same
 * routing `resolveCallableSet` applies internally.
 */
function isBareToolName(spec: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(spec);
}

/**
 * The `tools:` entry admission gate every consumer of a `tools:` list applies
 * before doing anything else with an entry (bugs 0111/0248): reject an entry
 * that fails `parseToolsEntry`'s grammar check, extract its spec via
 * {@link toolsEntrySpec}, then withhold it when the spec is empty, is a bare
 * Pi-tool name ({@link isBareToolName}), or is already present in `seen` —
 * the SAME subject test at every recursion depth (bug 0111 ruled the
 * `.theta`-entry *Trigger* names the entry KIND, not the entry's depth, so
 * one subject test governs every depth). Returns the extracted spec, or
 * `undefined` when the entry should be skipped. A caller with an additional
 * caller-side admission conjunct (`resolveThetaToolsAtLoad`'s
 * `checkInvokeExtension` check) layers it on top of this result rather than
 * folding it in here.
 */
export function admissibleToolsSpec(
  entry: string,
  seen: { has(spec: string): boolean },
): string | undefined {
  if (parseToolsEntry(entry.trim()).kind !== "ok") {
    return undefined;
  }
  const spec = toolsEntrySpec(entry);
  if (spec.length === 0 || isBareToolName(spec) || seen.has(spec)) {
    return undefined;
  }
  return spec;
}
