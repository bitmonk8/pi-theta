// PIC-64 rung 3 — LOAD-time code-side extension-tool reachability.
//
// PIC-64 pins a fail-closed code-side extension-tool dispatch ladder: rung 1 the
// upstream `pi.getToolDefinition` registry read, rung 2 host-loop dispatch, and —
// when NEITHER rung is available — rung 3: "a theta whose code calls an extension
// tool refuses to register with `theta/load/extension-tool-unreachable` (the
// runtime never silently falls through)". This module owns the LOAD-time
// realisation of rung 3 (spec option (a)): at theta registration, when the
// dispatch-ladder probe yields `unreachable` AND the theta body statically
// contains a code-side call (`<name>(args)`) to a callable-set EXTENSION tool,
// the theta does not register and the pinned diagnostic is emitted.
//
// SCOPE OF THE WALK (root body only, and why that is complete). The walk covers
// the theta's ROOT body — its top-level statements/tail and every nested block,
// including LOCAL `fn` bodies. It does NOT descend into imported `.thetalib` `fn`
// bodies, and it does not need to: an imported `fn` cannot statically name a
// caller-scoped extension tool. A `.thetalib` is parsed standalone with no
// frontmatter `tools:` of its own, so a bare `<extension-tool>(args)` call in an
// imported `fn` body resolves against nothing in scope and fails the `.thetalib`
// parse with `theta/parse/unknown-identifier` — which un-registers the IMPORTING
// theta at import resolution, strictly before this check runs. The transitive-
// import code-side extension-tool call therefore cannot arise; the asymmetry with
// the `.theta` content-hash closure (which hashes file CONTENT for tamper
// detection, a distinct purpose) is not a reachability gap. The runtime
// `#dispatchExtensionToolViaLadder` refusal remains the fail-closed floor for any
// path that bypasses this load check.
//
// SCOPE. The load-registry row and PIC-64 rung 3 state the rule context-generally
// ("A theta whose **code** calls an extension-registered Pi tool … the theta does
// **not** register"), with no restriction to the child or to a mode. This check
// therefore runs at EVERY registration (parent and spawned-child processes
// alike): registry-snapshot admission is MODE-INDEPENDENT
// (frontmatter-fields-a.md §`tools`), so prompt- and subagent-mode thetas alike
// hold extension-tool callables to detect, and refusal tracks RUNG AVAILABILITY
// — never the process regime or the frontmatter mode.
//
// The runtime-dispatch refusal in the producer's `#dispatchExtensionToolViaLadder`
// remains as a defence-in-depth backstop; once this load-time refusal exists the
// runtime path is unreachable for a registered theta.
//
// Spec: pi-integration-contract/subagent.md (PIC-64 #pic-64,
// #subagent-host-loop-dispatch), diagnostics/code-registry-load.md
// (`theta/load/extension-tool-unreachable`).

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { ThetaBody } from "../parser/theta-document";
import { walkCallSiteNodes } from "../parser/theta-document";
import {
  resolveDispatchLadder,
  type DispatchLadderProbe,
} from "../runtime/host-loop-dispatch";

/**
 * Collect every code-side `<name>(args)` call callee name reachable in a theta
 * body — the whole statement / expression tree (top-level statements + tail,
 * nested blocks, conditions, arms, arguments, `fn` bodies, `par for` bodies).
 * Mirrors the `subagent fn` self-reference-cycle walker's traversal; a `call`
 * node is the code-side tool-call surface (`<name>(args)`), distinct from
 * `invoke` / `method-call` / `query`. Shares its traversal
 * (`walkCallSiteNodes`, `../parser/theta-document.ts`) with `collectCallSites`
 * (`invoke-static-checks.ts`), `collectCallCallees`
 * (`subagent-fn-static-checks.ts`) and `collectClauseBearingCalls` (the
 * traversal's own module) — one walker so the four checks cannot drift out of
 * sync as the `Stmt` / `Expr` node shapes evolve (bug 0071).
 */
function collectCodeSideCallNames(body: ThetaBody): Set<string> {
  const out = new Set<string>();
  walkCallSiteNodes(body, (node) => {
    if (node.kind === "call") {
      out.add(node.callee);
    }
  });
  return out;
}

/** Inputs to the load-time code-side extension-tool reachability check. */
export interface ExtensionToolReachabilityInput {
  /** The parsed theta body walked for code-side `<name>(args)` call sites. */
  readonly body: ThetaBody;
  /**
   * The presented callable names (post-`as` rename) in the theta's callable set
   * that resolved to EXTENSION tools (admitted via `pi.getAllTools()`, not host
   * built-ins, not `.theta` callees).
   */
  readonly extensionToolNames: ReadonlySet<string>;
  /** The code-side dispatch-ladder probe (rung availability). */
  readonly probe: DispatchLadderProbe;
  /** The enclosing theta source file, for the located diagnostic. */
  readonly file: string;
}

/**
 * PIC-64 rung 3 (load-time). For each callable-set extension tool the body calls
 * from CODE (`<name>(args)`), resolve the dispatch ladder; when no rung is
 * available emit `theta/load/extension-tool-unreachable` (error-severity, so the
 * caller un-registers the theta). A theta that only reaches its extension tools
 * MODEL-facing (via an `@`-query) holds no code-side call site here and is
 * unaffected. Returns `[]` when the theta declares no extension-tool callable or
 * never calls one from code. Scope is the root body (see the module header): an
 * imported `.thetalib` `fn` cannot statically name a caller-scoped extension tool.
 */
export function checkExtensionToolReachability(
  input: ExtensionToolReachabilityInput,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (input.extensionToolNames.size === 0) {
    return diagnostics;
  }
  const called = collectCodeSideCallNames(input.body);
  for (const name of input.extensionToolNames) {
    if (!called.has(name)) {
      continue;
    }
    const resolution = resolveDispatchLadder(name, input.probe);
    if (resolution.kind === "unreachable") {
      // Locate the pinned refusal at the enclosing theta file.
      diagnostics.push({ ...resolution.diagnostic, file: input.file });
    }
  }
  return diagnostics;
}
