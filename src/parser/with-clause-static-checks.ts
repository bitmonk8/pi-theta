// Compose-pass with-clause cwd type checks and local/imported callee classification.

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import type { CallableSetSnapshot } from "./callable-set";
import {
  invokeArgTypeMismatchMessage,
  withClauseInProcessCalleeMessage,
  withClausePiToolMessage,
  INVOKE_ARG_TYPE_MISMATCH_CODE,
  WITH_CLAUSE_IN_PROCESS_CALLEE_CODE,
  WITH_CLAUSE_IN_PROCESS_CALLEE_HINT,
  WITH_CLAUSE_PI_TOOL_CODE,
  WITH_CLAUSE_PI_TOOL_HINT,
} from "./invoke-diagnostics";
import type { StaticTypeInferencePass } from "./static-type-inference";
import type { CallExpr, CallWithClause, Stmt, ThetaBody } from "./theta-document";
import { checkCompatible, displayType, type CompatType, type TypeEnv } from "./type-compat";
import type { MaterializedImport } from "../runtime/lexical-environment";
import { checkToolCallArguments } from "../runtime/tool-call";
import { collectProvableArgTypes, renderCollectedTypes } from "../extension/invoke-expr-call-surface";
import { collectCallSites } from "../extension/invoke-static-checks";

/**
 * INV-6 (invocation.md `#options-surface`) — judge a call-site `with` clause's
 * `cwd` value as an ordinary argument slot of expected type `string`: "a type
 * mismatch is the ordinary type diagnostic; no dedicated code is minted". The
 * per-surface row is exactly the surface's own argument row —
 * `theta/parse/invoke-arg-type-mismatch` on the `invoke(...)` surface,
 * `theta/parse/tool-arg-type-mismatch` on the `.theta`-callable surface (both
 * Triggers name the clause value; no registry change).
 *
 * Provable-only, the same posture the per-argument loops keep: an emission
 * needs EVERY value the expression can take to be explicitly incompatible with
 * `string`; anything past the parser's static view defers to the runtime
 * validation arm. `string` is a primitive, so the verdict is decidable under
 * the empty callee-annotation env the argument loops also judge in.
 */
function checkClauseCwdType(input: {
  readonly clause?: CallWithClause;
  readonly surface:
    | { readonly kind: "invoke"; readonly providedCount: number }
    | { readonly kind: "theta-callable"; readonly name: string };
  readonly file: string;
  readonly fallbackRange: SourceRange;
  readonly typeEnv: TypeEnv;
  readonly typePass: StaticTypeInferencePass;
}): Diagnostic[] {
  const clause = input.clause;
  if (clause === undefined) {
    return [];
  }
  const expected: CompatType = { kind: "prim", name: "string" };
  const emptyCalleeAnnotationEnv: TypeEnv = Object.create(null) as TypeEnv;
  const out: Diagnostic[] = [];
  for (const field of clause.fields) {
    if (field.key !== "cwd") {
      // An unknown key already drew `theta/parse/with-clause-unknown-key` at
      // parse and un-registered the theta; it has no expected type here.
      continue;
    }
    const valueTypes = collectProvableArgTypes(field.value, input.typeEnv, input.typePass);
    if (valueTypes === undefined) {
      continue;
    }
    if (
      !valueTypes.every(
        (valueType) =>
          checkCompatible(valueType, expected, emptyCalleeAnnotationEnv) === "incompatible",
      )
    ) {
      continue;
    }
    const actual = renderCollectedTypes(valueTypes);
    if (input.surface.kind === "invoke") {
      out.push({
        severity: "error",
        code: INVOKE_ARG_TYPE_MISMATCH_CODE,
        file: input.file,
        range: field.value.range,
        // `<i>` renders the provided positional-argument count: the clause's
        // slot follows the last real argument, so that count is the slot
        // number an author reads off the call site. `<param>` is the key.
        message: invokeArgTypeMismatchMessage(
          input.surface.providedCount,
          "cwd",
          displayType(expected),
          actual,
        ),
      });
      continue;
    }
    out.push(
      ...checkToolCallArguments({
        toolName: input.surface.name,
        calleeKind: "theta-callable",
        // Neutralises the shared arity arm, exactly as the per-argument loop
        // below does: this site's real arity is checked by `checkInvokeArity`.
        positionalCount: 1,
        file: input.file,
        range: input.fallbackRange,
        staticResolution: {
          resolvable: true,
          matches: false,
          expected: displayType(expected),
          actual,
        },
      }),
    );
  }
  return out;
}

/**
 * RFC 0009 Erratum A′ + Erratum B (invocation.md INV-8) — the call-site
 * clause's DEFAULT-REJECT callee classification: ONE loop, TWO codes, a
 * four-way verdict against the frozen callable set plus the file's own
 * `subagent fn` declarations. The clause is legal on the three
 * child-spawning surfaces, so this loop convicts everything else on the
 * bare-ident call surface: a callee the set classifies `theta` is a legal
 * surface (the mode gate above owns it); a callee naming one of THIS file's
 * top-level `subagent fn`s is a legal surface (Erratum B, RFC 0012 §10 — the
 * body is a child process, so the clause has a working directory to address;
 * the `subagent` modifier is a declaration-site fact this pass already has);
 * a callee the set classifies `pi-tool` draws `theta/parse/with-clause-pi-tool`;
 * a callee that is an IMPORTED name is DEFERRED to `checkImportedWithClauseCallees`
 * (the declaring library resolves later in the compose pass, re-export chains
 * followed by materialisation, and only then is its fn kind known); and EVERY
 * other callee — plain `fn`, locals, builtins, anything the set does not bind —
 * draws `theta/parse/with-clause-in-process-callee`. `ResolvedCallable` is
 * a closed union (`"pi-tool" | "theta" | "runtime-tool"`), so the arms are
 * total: `"runtime-tool"` falls through to the default
 * `with-clause-in-process-callee` arm (RFC 0011 §3.2 row 1).
 *
 * PRECEDENCE: this loop runs only for a parse-clean theta —
 * `parseDiscoveredTheta` (production-composition.ts) drops any
 * error-severity parse diagnostic before the compose pass calls this
 * function — so an input that drew `theta/parse/unknown-identifier`,
 * `theta/parse/shadowed-callable-call` or
 * `theta/parse/with-clause-unknown-key` never reaches it, and those keep
 * their refusal ALONE on a `.theta` host. Driven directly at the unit
 * level the loop still emits for such inputs; the pipeline-level
 * precedence is a composition-level property, not this loop's own.
 */
function checkWithClauseDefaultReject(
  callerPath: string,
  callExprs: readonly CallExpr[],
  callableSet: CallableSetSnapshot | undefined,
  statements: readonly Stmt[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (callableSet !== undefined) {
    const subagentFns = topLevelSubagentFnNames(statements);
    const imported = importedLocalNames(statements);
    for (const call of callExprs) {
      if (call.withClause === undefined) {
        continue;
      }
      // Bug 0071 §Fix constraint 2 / the 0031-0038 hazard rule: `Map.get`
      // plus an explicit `!== undefined` test — a callee name is
      // author-controlled source text.
      const entry = callableSet.entries.get(call.callee);
      if (entry !== undefined && entry.kind === "theta") {
        continue;
      }
      // Erratum B: a same-file `subagent fn` is a child-spawning surface.
      // expressions.md §"Identifier resolution" ranks `fn` above `callable`,
      // so a name the set ALSO binds resolves to the declaration first.
      if (entry === undefined && subagentFns.has(call.callee)) {
        continue;
      }
      // An imported name's fn kind is the declaring library's fact; judged
      // once the import materialises (`checkImportedWithClauseCallees`).
      if (entry === undefined && imported.has(call.callee)) {
        continue;
      }
      if (entry !== undefined && entry.kind === "pi-tool") {
        diagnostics.push({
          severity: "error",
          code: WITH_CLAUSE_PI_TOOL_CODE,
          file: callerPath,
          // The Pi-tool arm ranges over the CALL: a Pi tool is never a
          // clause-bearing surface at all, so the whole call site is the
          // fault, not just the clause.
          range: call.range,
          message: withClausePiToolMessage(call.callee),
          hint: WITH_CLAUSE_PI_TOOL_HINT,
        });
        continue;
      }
      diagnostics.push({
        severity: "error",
        code: WITH_CLAUSE_IN_PROCESS_CALLEE_CODE,
        file: callerPath,
        // The default arm ranges over the CLAUSE: the callee is fine (it is a
        // legal in-process call), the clause is what cannot apply to it.
        range: call.withClause.range,
        message: withClauseInProcessCalleeMessage(call.callee),
        hint: WITH_CLAUSE_IN_PROCESS_CALLEE_HINT,
      });
    }
  }
  return diagnostics;
}

/** The names of every top-level `subagent fn` declared in `statements` (a declaration-site fact). */
function topLevelSubagentFnNames(statements: readonly Stmt[]): ReadonlySet<string> {
  const names = new Set<string>();
  for (const stmt of statements) {
    if (stmt.kind === "fn" && stmt.subagent === true) {
      names.add(stmt.name);
    }
  }
  return names;
}

/** The LOCAL binding names of every `import` declaration (`ImportDecl.symbols`: the alias where written, else the source name). */
function importedLocalNames(statements: readonly Stmt[]): ReadonlySet<string> {
  const names = new Set<string>();
  for (const stmt of statements) {
    if (stmt.kind === "import") {
      for (const symbol of stmt.symbols) {
        names.add(symbol);
      }
    }
  }
  return names;
}

/**
 * RFC 0009 Erratum B (RFC 0012 §10) — the DEFERRED half of the call-site
 * clause's default-reject classification, judged once the caller's imports
 * have materialised (re-export chains followed): a clause on a call whose
 * callee is an IMPORTED name is admitted when the materialised import is a
 * `subagent fn` (a child-spawning surface, FN-9) and draws
 * `theta/parse/with-clause-in-process-callee` otherwise — an imported plain
 * `fn`, or an imported `schema` / `enum` name used as a callee. A callee the
 * frozen callable set binds is not an imported name here (the load pass's own
 * loop owned it). An import that failed to materialise at all already drew its
 * own IMP-* refusal and un-registered the theta before this runs.
 */
export function checkImportedWithClauseCallees(
  callerPath: string,
  body: ThetaBody,
  imports: readonly MaterializedImport[],
  callableSet: CallableSetSnapshot | undefined,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const importedNames = importedLocalNames(body.statements);
  const byName = new Map(imports.map((entry) => [entry.name, entry] as const));
  for (const call of collectCallSites(body).callExprs) {
    if (call.withClause === undefined || !importedNames.has(call.callee)) {
      continue;
    }
    if (callableSet?.entries.get(call.callee) !== undefined) {
      continue;
    }
    const materialised = byName.get(call.callee);
    if (materialised?.kind === "fn" && materialised.fn?.subagent === true) {
      continue;
    }
    diagnostics.push({
      severity: "error",
      code: WITH_CLAUSE_IN_PROCESS_CALLEE_CODE,
      file: callerPath,
      range: call.withClause.range,
      message: withClauseInProcessCalleeMessage(call.callee),
      hint: WITH_CLAUSE_IN_PROCESS_CALLEE_HINT,
    });
  }
  return diagnostics;
}

export { checkClauseCwdType, checkWithClauseDefaultReject };
