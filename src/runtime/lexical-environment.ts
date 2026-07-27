// V19b / V19b-T — the theta lexical environment and scope model.
//
// This module owns the runtime lexical environment and the real `EvalHost`
// implementation the `V19c` statement executor evaluates `V19a`'s body-AST
// expressions and statements against. It is an integration-realisation of the
// `V3a` (`EvalHost`), `V3b` (mutability), and `V15c` (import loader) seams at a
// real host; it closes no new coverage-matrix row.
//
// `V19b` OWNS the expressions.md §"Identifier resolution" first-match
// precedence — local `let` / parameter > top-level `fn` > import > callable —
// and IMPLEMENTS the local, top-level-`fn`-hoisting, and import arms of that
// order:
//
//   - local `let` / parameter bindings, immutable vs `let mut` slots, and the
//     per-iteration fresh `for` binding / `let _` discard rules of bindings.md;
//   - top-level `fn` declarations, hoisted so mutual recursion resolves in
//     either textual order (functions.md FN-1) and carrying `fn` bodies for the
//     `V19c` executor's final-value / `return` evaluation (FN-3…FN-5);
//   - imported `.thetalib` symbols (top-level `schema` / `enum` / `fn`) materialised
//     into the environment via `V15c`'s import loader (imports.md §Visibility),
//     an imported `fn` being callable with the cross-file `.thetalib fn` call
//     execution riding `V19d`'s invoke trampoline;
//   - top-level `schema` / `enum` declarations registered so runtime
//     `Enum.Variant` access and named-schema constructors resolve.
//
// `V19b` DEFINES the callable arm's precedence position (frontmatter `tools:`,
// `V6c`) but does NOT populate or execute it — that is supplied by `V19d`
// (effect wiring) / `V19e` (composition).
//
// V19b-T (tests-task) declares these seam shapes — the `LexicalEnvironment`
// scope model, the arm-labelled `Resolution`, the `WriteResult`, the
// `MaterializedImport` / `EnumRegistration` inputs, the `buildEnvironment`
// factory, and the real `ThetaEvalHost` realising `V3a`'s `EvalHost` — and stubs
// each behaviour-bearing method inertly so the failing tests compile and red on
// their own primary assertions:
//
//   - `resolve` returns the inert `unresolved` arm, so every precedence,
//     `fn`-hoisting, and import-materialisation assertion reds (no arm matches);
//   - `writeBinding` inertly accepts every write without recording it, so the
//     `let mut` value-update assertion reds (the value never changes) and the
//     immutable-rejection assertion reds (the write is not rejected);
//   - `bindIterationVariable` / `child` return inert scopes, so the
//     per-iteration fresh-binding assertion reds;
//   - `resolveSchema` / `resolveEnumVariant` return `undefined`, so the
//     schema-constructor / `Enum.Variant` assertions red;
//   - the `ThetaEvalHost` methods return the inert `null` sentinel, so the host
//     identifier-read / call assertions red.
//
// No test reds on a compile error, a missing fixture, or a harness throw. The
// paired V19b implementation leaf fills these in.
//
// Spec: expressions.md (§"Identifier resolution"), bindings.md, functions.md,
// imports.md, runtime-value-model.md.

import { makeEnumValue, type ThetaValue } from "./value";
import type { EvalHost } from "./expression-evaluator";
import type { FnDecl, ThetaBody, SchemaDecl } from "../parser/theta-document";
import type { SourceRange } from "../diagnostics/diagnostic";

// --------------------------------------------------------------------------
// Resolution model
// --------------------------------------------------------------------------

/**
 * The four resolution arms of expressions.md §"Identifier resolution", in
 * first-match precedence order, plus the `unresolved` terminal:
 *
 *   1. `local`    — a local `let` binding or function parameter in scope;
 *   2. `fn`       — a top-level `fn` declaration in the same `.theta` / `.thetalib`;
 *   3. `import`   — a symbol imported from a `.thetalib` file (`V15c`);
 *   4. `callable` — a name in the theta's callable set (`tools:`, `V6c`) — the
 *      precedence position `V19b` DEFINES but does not populate or execute.
 */
export type ResolutionArm = "local" | "fn" | "import" | "callable" | "unresolved";

/**
 * The outcome of resolving a bare identifier against the environment, tagged
 * with the arm that matched so first-match precedence is observable. A `local`
 * resolution carries the bound value and slot mutability; an `fn` / `import`-`fn`
 * resolution carries the `FnDecl` body (for the executor's final-value / return
 * evaluation) and whether it is callable.
 */
export interface Resolution {
  readonly arm: ResolutionArm;
  /** The bound value — present for a `local` read. */
  readonly value?: ThetaValue;
  /** Whether a `local` slot was declared `let mut`. */
  readonly mutable?: boolean;
  /** The carried `fn` body — present for an `fn` / imported-`fn` resolution. */
  readonly fn?: FnDecl;
  /** Whether the resolution names a callable target (a `fn`, imported `fn`, or callable). */
  readonly callable?: boolean;
}

/**
 * The outcome of a reassignment write at the scope layer (bindings.md `cka-6`).
 * A write against a `let mut` slot is `accepted`; a write against an immutable
 * `let` slot is rejected (`accepted: false`) and the slot is left unchanged.
 */
export interface WriteResult {
  readonly accepted: boolean;
}

// --------------------------------------------------------------------------
// Import materialisation inputs (V15c import loader)
// --------------------------------------------------------------------------

/** A top-level `.thetalib` symbol kind — each is materialisable into the environment. */
export type ImportedSymbolKind = "fn" | "schema" | "enum";

/**
 * An imported `.thetalib` symbol materialised into the runtime environment via
 * `V15c`'s import loader (imports.md §Visibility). An imported `fn` carries its
 * `FnDecl` body and is callable; an imported `schema` / `enum` is registered so
 * its constructor / `Enum.Variant` access resolves.
 */
export interface MaterializedImport {
  /** The local binding name (the `as` alias, or the source name when unaliased). */
  readonly name: string;
  readonly kind: ImportedSymbolKind;
  /** The imported `fn` body — present only for `kind: "fn"`. */
  readonly fn?: FnDecl;
  /** The variant wire strings — present only for `kind: "enum"`. */
  readonly variants?: readonly string[];
}

/**
 * A top-level `enum` registration: the enum name and its variant wire strings.
 * `V19a`'s `EnumDecl` carries only the name, so the variant set is supplied
 * alongside it (see notes.md — the seam-shape decision).
 */
export interface EnumRegistration {
  readonly name: string;
  readonly variants: readonly string[];
  /**
   * Explicit `= "..."` wire values keyed by variant name (schemas.md §Enum
   * declarations). A variant absent here uses its name verbatim as the wire
   * value, preserving the name-is-wire default.
   */
  readonly values?: Readonly<Record<string, string>>;
}

/**
 * The inputs a root environment is built from: `V19a`'s parsed body AST (for
 * top-level `fn` hoisting and `schema` registration), the `V15c`-materialised
 * imports, the enum registrations, and the callable-set names (the precedence
 * position `V19b` defines but does not populate).
 */
export interface EnvironmentInputs {
  readonly body: ThetaBody;
  readonly imports?: readonly MaterializedImport[];
  readonly enums?: readonly EnumRegistration[];
  readonly callables?: readonly string[];
}

// --------------------------------------------------------------------------
// Lexical environment
// --------------------------------------------------------------------------

/**
 * The runtime lexical environment and scope model. A root environment holds the
 * hoisted top-level `fn` declarations, the registered `schema` / `enum`
 * declarations, the materialised imports, and the callable-set names; nested
 * scopes (`child`, `bindIterationVariable`) hold local `let` / parameter slots
 * and delegate outward for the identifier-resolution precedence walk.
 *
 * State is per-instance (constructor-injected) — no module-level mutable state.
 *
 * V19b-T stubs every behaviour-bearing method inertly (see the module header).
 * The paired V19b implementation leaf fills the scope model in.
 */
/** A local binding slot: its current value and whether it was declared `let mut`. */
interface LocalSlot {
  value: ThetaValue;
  readonly mutable: boolean;
}

/** A synthetic zero-width range for a schema materialised from an import (no source span). */
function syntheticRange(): SourceRange {
  return { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } };
}

/**
 * Build the variant-name → wire-value map for a registered enum: each name maps
 * to its explicit `= "..."` value when declared, else to the name verbatim
 * (schemas.md §Enum declarations — the name-is-wire default).
 */
function buildVariantWireMap(
  names: readonly string[],
  values: Readonly<Record<string, string>> | undefined,
): ReadonlyMap<string, string> {
  return new Map(names.map((name) => [name, values?.[name] ?? name]));
}

/** An identifier resolved to a non-value arm (`fn` / `import` / `callable` / `unresolved`) at a read position. */
class IdentifierNotReadableError extends Error {}

/**
 * The file-level registry references a fresh isolated `subagent fn` scope shares
 * with the enclosing environment's root (RFC 0001 FN-6). The maps are shared by
 * reference (read-only from the isolated scope's perspective), so an isolated
 * body resolves sibling top-level declarations without inheriting caller locals.
 */
interface SharedRegistries {
  readonly fns: Map<string, FnDecl>;
  readonly schemas: Map<string, SchemaDecl>;
  readonly enums: Map<string, ReadonlyMap<string, string>>;
  readonly imports: Map<string, MaterializedImport>;
  readonly callables: ReadonlySet<string>;
}

export class LexicalEnvironment {
  /** This scope's local `let` / parameter slots (`_` discards are never recorded). */
  private readonly locals = new Map<string, LocalSlot>();

  /**
   * The subset of this frame's `locals` bound from frontmatter `params:`
   * fields (`defineParamsFieldLocal`) — populated at the root only. WHY (bug
   * 0016): the parse gate's scope model seeds every plain-`fn` body with the
   * whole-file rootLocals — exactly the `params:` fields — plus the fn's own
   * parameters, so `localShadowsCallable` must count these across an `fn`
   * activation boundary while top-level `let` locals (which share the root
   * frame's `locals` map) stay invisible there under the no-closures model.
   */
  private readonly paramsFieldLocals = new Set<string>();

  /** Hoisted top-level `fn` declarations — populated at the root only. */
  private readonly fns: Map<string, FnDecl>;
  /** Registered top-level + imported `schema` declarations — root only. */
  private readonly schemas: Map<string, SchemaDecl>;
  /**
   * Registered top-level + imported `enum` variant → wire-value maps — root
   * only. The key is the variant name (`Enum.Variant` resolution keys by name);
   * the value is the variant's wire string (the explicit `= "..."` value when
   * declared, else the name verbatim), so `Enum.Variant` renders the correct
   * wire form (schemas.md §Enum declarations).
   */
  private readonly enums: Map<string, ReadonlyMap<string, string>>;
  /** Materialised imports keyed by local binding name — root only. */
  private readonly imports: Map<string, MaterializedImport>;
  /** The callable-set names (`tools:`, `V6c`) — the arm `V19b` defines but does not populate. */
  private readonly callables: ReadonlySet<string>;

  /**
   * True iff this scope is the root of a plain `fn` call's activation
   * (`childFnActivation`). WHY (bug 0016): theta 1.0 has no closures — an `fn`
   * body sees only the whole-file declarations plus its own parameters
   * (expressions.md §Identifier resolution; the parse walks model exactly
   * that) — but the executor chains the body scope to the CALLER's environment
   * so the shared registries resolve. The flag lets `localShadowsCallable`
   * stop its local walk at the activation edge — consulting only the root
   * frame's `params:`-field locals beyond it — so a caller-frame local that
   * happens to share a callable's name is not mistaken for an in-scope shadow
   * inside the body (the parse gate treats that call as the callable, and the
   * runtime must agree) while a `params:`-field shadow, which the parse gate
   * sees in every fn body, still counts.
   */
  private fnActivationBoundary = false;

  public constructor(
    inputs: EnvironmentInputs,
    private readonly parent: LexicalEnvironment | null = null,
    shared?: SharedRegistries,
  ) {
    // A `subagent fn` body runs in a fresh isolated scope (RFC 0001 FN-6): it
    // shares the enclosing file's hoisted top-level `fn` / `schema` / `enum` /
    // import / callable registries (so in-body calls to sibling declarations
    // resolve) but carries NONE of the caller's local `let` / parameter slots
    // (no closure capture). `shared` threads those registry references into a
    // new root whose `locals` start empty.
    if (shared !== undefined) {
      this.fns = shared.fns;
      this.schemas = shared.schemas;
      this.enums = shared.enums;
      this.imports = shared.imports;
      this.callables = shared.callables;
      return;
    }
    // The root owns the fn / schema / enum / import / callable registries; a
    // nested scope holds only its local slots and delegates outward for the
    // resolution walk, so registries are built exactly once.
    this.fns = new Map();
    this.schemas = new Map();
    this.enums = new Map();
    this.imports = new Map();
    let callables: ReadonlySet<string> = new Set();

    if (parent === null) {
      // Top-level `fn` declarations are hoisted (functions.md FN-1) so mutual
      // recursion resolves in either textual order.
      for (const stmt of inputs.body.statements) {
        if (stmt.kind === "fn") {
          this.fns.set(stmt.name, stmt);
        } else if (stmt.kind === "schema") {
          this.schemas.set(stmt.name, stmt);
        }
      }
      // Top-level `enum` registrations carry the variant sets (`V19a`'s
      // `EnumDecl` carries only the name — see notes.md seam-shape decision).
      for (const reg of inputs.enums ?? []) {
        this.enums.set(reg.name, buildVariantWireMap(reg.variants, reg.values));
      }
      // Imported `.thetalib` symbols materialised via `V15c`'s import loader
      // (imports.md §Visibility): an `fn` is resolvable + callable, a `schema`
      // resolves as a constructor, an `enum` resolves its variants.
      for (const imp of inputs.imports ?? []) {
        this.imports.set(imp.name, imp);
        if (imp.kind === "schema") {
          this.schemas.set(imp.name, { kind: "schema", name: imp.name, range: syntheticRange() });
        } else if (imp.kind === "enum") {
          // Imported enums carry variant names only; each name is its own wire
          // value (imported explicit values are not threaded through the
          // materialisation seam).
          this.enums.set(imp.name, buildVariantWireMap(imp.variants ?? [], undefined));
        }
      }
      callables = new Set(inputs.callables ?? []);
    }
    this.callables = callables;
  }

  /** The root environment (the scope that owns the fn / schema / enum / import / callable registries). */
  private root(): LexicalEnvironment {
    return this.parent === null ? this : this.parent.root();
  }

  /**
   * Define a local `let` / parameter binding in this scope. A `let _` discard
   * (`name === "_"`) records no resolvable binding (bindings.md §Discard).
   */
  public defineLocal(name: string, value: ThetaValue, mutable: boolean): void {
    if (name === "_") {
      return;
    }
    this.locals.set(name, { value, mutable });
  }

  /**
   * Define a frontmatter `params:`-field binding (the binder's bound args, or
   * an invoke's positional args bound onto the callee's declared params) as an
   * immutable ROOT-frame local, recording it as a `params:` field. WHY the
   * distinct entry point (bug 0016): a `params:` field is the one local kind
   * the parse gate treats as visible inside every plain-`fn` body (it seeds
   * each fn body scope with the rootLocals), so `localShadowsCallable` must
   * distinguish it from a top-level `let` sharing the same root frame when
   * its walk crosses an `fn` activation boundary.
   */
  public defineParamsFieldLocal(name: string, value: ThetaValue): void {
    this.defineLocal(name, value, false);
    if (name !== "_") {
      this.paramsFieldLocals.add(name);
    }
  }

  /**
   * Write a reassignment against a local binding: accepted only against a
   * `let mut` slot, rejected against an immutable `let` slot at the scope layer
   * (bindings.md `cka-6`). The write targets the nearest enclosing local slot;
   * an immutable-slot write leaves the slot unchanged.
   */
  public writeBinding(name: string, value: ThetaValue): WriteResult {
    for (let env: LexicalEnvironment | null = this; env !== null; env = env.parent) {
      const slot = env.locals.get(name);
      if (slot !== undefined) {
        if (!slot.mutable) {
          return { accepted: false };
        }
        slot.value = value;
        return { accepted: true };
      }
    }
    return { accepted: false };
  }

  /**
   * Resolve a bare identifier against this scope chain in the expressions.md
   * §"Identifier resolution" first-match order (local > `fn` > import >
   * callable), a local binding shadowing all outer scopes.
   */
  public resolve(name: string): Resolution {
    // 1. local `let` / parameter — a local binding shadows all outer scopes.
    for (let env: LexicalEnvironment | null = this; env !== null; env = env.parent) {
      const slot = env.locals.get(name);
      if (slot !== undefined) {
        return { arm: "local", value: slot.value, mutable: slot.mutable };
      }
    }
    const root = this.root();
    // 2. top-level `fn` (hoisted).
    const fn = root.fns.get(name);
    if (fn !== undefined) {
      return { arm: "fn", fn, callable: true };
    }
    // 3. imported `.thetalib` symbol.
    const imp = root.imports.get(name);
    if (imp !== undefined) {
      return imp.fn !== undefined
        ? { arm: "import", fn: imp.fn, callable: imp.kind === "fn" }
        : { arm: "import", callable: imp.kind === "fn" };
    }
    // 4. callable set — the arm `V19b` defines but does not populate/execute.
    if (root.callables.has(name)) {
      return { arm: "callable", callable: true };
    }
    return { arm: "unresolved" };
  }

  /** Open a nested lexical scope (a `{ … }` block / loop body). */
  public child(): LexicalEnvironment {
    return new LexicalEnvironment({ body: { statements: [], tail: null } }, this);
  }

  /**
   * Open the scope a plain `fn` call binds its parameters into. Identical to
   * `child()` except the scope is marked as an activation boundary, so
   * `localShadowsCallable` sees the fn's own parameters, body locals, and the
   * root frame's `params:`-field locals (the parse model's rootLocals) but
   * never the caller's frames — the no-closures scope model the parse walks
   * enforce (bug 0016; a `subagent fn` gets the stronger `spawnIsolatedScope`
   * instead, whose `parent: null` bounds the walk structurally).
   */
  public childFnActivation(): LexicalEnvironment {
    const scope = this.child();
    scope.fnActivationBoundary = true;
    return scope;
  }

  /**
   * Whether `name` is a callable-set name that a local binding shadows within
   * the CURRENT `fn` activation — the runtime mirror of the parse gate
   * `theta/parse/shadowed-callable-call` (bug 0016). Both conjuncts are
   * deliberate:
   *
   *   - callable-set membership first, so a non-colliding local callee
   *     (`let g = "x"` … `g()`) keeps its existing disposition (the
   *     unknown-tool `Err`) instead of becoming a defect — the parse gate
   *     fires only on collision, and the belt must not out-reject the gate;
   *   - the local walk stops at an `fn` activation boundary (inclusive of the
   *     boundary frame's own parameter slots), because a caller-frame local is
   *     not in scope inside the body under the spec's no-closures model —
   *     `resolve()`'s unbounded walk would false-positive there;
   *   - AT the boundary the ROOT frame's `params:`-field locals are consulted
   *     before returning (parse-model parity, bug 0016): the parse gate seeds
   *     every plain-`fn` body scope with the whole-file rootLocals — the
   *     `params:` fields, which `buildBoundEnvironment` defines onto the root
   *     frame via `defineParamsFieldLocal` — plus the fn's own parameters, so
   *     a params-shadowed callee inside an `fn` body is gate-rejected and the
   *     belt must reject it too. The consultation reads `paramsFieldLocals`,
   *     NOT the root's full `locals` map, because top-level `let` locals share
   *     that map yet are invisible inside an `fn` body (no closures — the
   *     caller-frame rule above). KNOWN RESIDUAL: the parse gate DOES fire
   *     for a `params:`-field shadow inside a `subagent fn` body (the walk
   *     seeds rootLocals into every fn body, subagent included), but this
   *     belt cannot — the `spawnIsolatedScope` root carries no
   *     `params:`-field locals and no boundary flag, so that shape is
   *     gate-only covered. Accepted: at runtime the isolated scope genuinely
   *     resolves the name to the callable (`params:` fields are not
   *     materialised into subagent scopes — the pre-existing parse/runtime
   *     divergence over `params:` visibility), so a belt throw there would
   *     assert a gate gap the runtime scope model does not support.
   */
  public localShadowsCallable(name: string): boolean {
    const root = this.root();
    if (!root.callables.has(name)) {
      return false;
    }
    for (let env: LexicalEnvironment | null = this; env !== null; env = env.parent) {
      if (env.locals.has(name)) {
        return true;
      }
      if (env.fnActivationBoundary) {
        return root.paramsFieldLocals.has(name);
      }
    }
    return false;
  }

  /**
   * Open a fresh isolated root scope for a `subagent fn` body (RFC 0001 FN-6):
   * it shares this environment's file-level registries (hoisted top-level `fn`,
   * registered `schema` / `enum`, materialised imports, callable-set names) so
   * in-body references to sibling declarations resolve, but carries none of the
   * caller's local `let` / parameter bindings — there is no lexical capture of
   * the enclosing scope across the session boundary.
   */
  public spawnIsolatedScope(): LexicalEnvironment {
    const root = this.root();
    return new LexicalEnvironment(
      { body: { statements: [], tail: null } },
      null,
      {
        fns: root.fns,
        schemas: root.schemas,
        enums: root.enums,
        imports: root.imports,
        callables: root.callables,
      },
    );
  }

  /**
   * Enter a fresh `for` iteration scope binding `name` to `value` in a
   * per-iteration fresh slot (bindings.md §"per-iteration fresh binding"), so
   * each iteration's binding is independent of the others. The iteration
   * variable is an immutable binding.
   */
  public bindIterationVariable(name: string, value: ThetaValue): LexicalEnvironment {
    const scope = this.child();
    scope.defineLocal(name, value, false);
    return scope;
  }

  /**
   * Resolve a registered top-level or imported `schema` by name so a
   * named-schema constructor resolves (expressions.md §"Object construction").
   */
  public resolveSchema(name: string): SchemaDecl | undefined {
    return this.root().schemas.get(name);
  }

  /**
   * Resolve a registered `enum`'s `Enum.Variant` access to its runtime
   * `EnumValue` (runtime-value-model.md, enum row). Returns `undefined` for an
   * unregistered enum or an unknown variant.
   */
  public resolveEnumVariant(enumName: string, variant: string): ThetaValue | undefined {
    const variants = this.root().enums.get(enumName);
    if (variants === undefined || !variants.has(variant)) {
      return undefined;
    }
    // Resolve to the variant's wire value (the explicit `= "..."` value when
    // declared, else the name) so `Enum.Variant` carries the correct wire form.
    return makeEnumValue(enumName, variants.get(variant) as string);
  }
}

/**
 * Build a root lexical environment from `V19a`'s parsed body AST and the
 * `V15c`-materialised imports: hoists every top-level `fn` (so mutual recursion
 * resolves in either textual order), registers top-level `schema` / `enum`
 * declarations, materialises imported symbols, and records the callable-set
 * names (the precedence position `V19b` defines but does not populate).
 *
 * V19b-T stubs this inert — it returns an environment whose methods are inert,
 * so no hoisting / registration / materialisation is observable. The paired
 * V19b leaf fills it in.
 */
export function buildEnvironment(inputs: EnvironmentInputs): LexicalEnvironment {
  return new LexicalEnvironment(inputs, null);
}

// --------------------------------------------------------------------------
// The real EvalHost (V3a seam realisation)
// --------------------------------------------------------------------------

/**
 * The real `EvalHost` (`V3a`'s seam): resolves a bare identifier read and
 * performs a call `f(args)` against the lexical environment, in the
 * expressions.md §"Identifier resolution" first-match order.
 *
 * V19b-T stubs both methods as the inert `null` sentinel — neither consults the
 * environment — so the host identifier-read / call assertions red. The paired
 * V19b leaf wires the host to the environment.
 */
export class ThetaEvalHost implements EvalHost {
  public constructor(private readonly env: LexicalEnvironment) {}

  public resolveIdentifier(name: string): ThetaValue {
    const r = this.env.resolve(name);
    if (r.arm === "local") {
      return r.value ?? null;
    }
    // A bare identifier naming a `fn` / import / callable is not a first-class
    // readable value, and an unresolved name has no value. `V19b` owns only the
    // scope-layer resolution; surfacing these as runtime diagnostics is not its
    // responsibility, so it raises a specific error rather than a silent null.
    throw new IdentifierNotReadableError(
      `identifier '${name}' does not resolve to a readable value (arm: ${r.arm})`,
    );
  }

  public callFunction(name: string, args: readonly ThetaValue[]): ThetaValue {
    void this.env;
    void args;
    // `V19b` DEFINES the callable arm's precedence position but does NOT
    // execute it: the cross-file `.thetalib fn` call execution rides `V19d`'s
    // invoke trampoline (`V19d` / `V19e`). Calling here is a wiring error.
    throw new IdentifierNotReadableError(
      `call execution for '${name}' is wired by V19d's invoke trampoline, not the scope layer`,
    );
  }
}
