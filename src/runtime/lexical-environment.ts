// V19b / V19b-T — the loom lexical environment and scope model.
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
//   - imported `.warp` symbols (top-level `schema` / `enum` / `fn`) materialised
//     into the environment via `V15c`'s import loader (imports.md §Visibility),
//     an imported `fn` being callable with the cross-file `.warp fn` call
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
// factory, and the real `LoomEvalHost` realising `V3a`'s `EvalHost` — and stubs
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
//   - the `LoomEvalHost` methods return the inert `null` sentinel, so the host
//     identifier-read / call assertions red.
//
// No test reds on a compile error, a missing fixture, or a harness throw. The
// paired V19b implementation leaf fills these in.
//
// Spec: expressions.md (§"Identifier resolution"), bindings.md, functions.md,
// imports.md, runtime-value-model.md.

import { makeEnumValue, type LoomValue } from "./value";
import type { EvalHost } from "./expression-evaluator";
import type { FnDecl, LoomBody, SchemaDecl } from "../parser/loom-document";
import type { SourceRange } from "../diagnostics/diagnostic";

// --------------------------------------------------------------------------
// Resolution model
// --------------------------------------------------------------------------

/**
 * The four resolution arms of expressions.md §"Identifier resolution", in
 * first-match precedence order, plus the `unresolved` terminal:
 *
 *   1. `local`    — a local `let` binding or function parameter in scope;
 *   2. `fn`       — a top-level `fn` declaration in the same `.loom` / `.warp`;
 *   3. `import`   — a symbol imported from a `.warp` file (`V15c`);
 *   4. `callable` — a name in the loom's callable set (`tools:`, `V6c`) — the
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
  readonly value?: LoomValue;
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

/** A top-level `.warp` symbol kind — each is materialisable into the environment. */
export type ImportedSymbolKind = "fn" | "schema" | "enum";

/**
 * An imported `.warp` symbol materialised into the runtime environment via
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
}

/**
 * The inputs a root environment is built from: `V19a`'s parsed body AST (for
 * top-level `fn` hoisting and `schema` registration), the `V15c`-materialised
 * imports, the enum registrations, and the callable-set names (the precedence
 * position `V19b` defines but does not populate).
 */
export interface EnvironmentInputs {
  readonly body: LoomBody;
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
  value: LoomValue;
  readonly mutable: boolean;
}

/** A synthetic zero-width range for a schema materialised from an import (no source span). */
function syntheticRange(): SourceRange {
  return { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } };
}

/** An identifier resolved to a non-value arm (`fn` / `import` / `callable` / `unresolved`) at a read position. */
class IdentifierNotReadableError extends Error {}

export class LexicalEnvironment {
  /** This scope's local `let` / parameter slots (`_` discards are never recorded). */
  private readonly locals = new Map<string, LocalSlot>();

  /** Hoisted top-level `fn` declarations — populated at the root only. */
  private readonly fns: Map<string, FnDecl>;
  /** Registered top-level + imported `schema` declarations — root only. */
  private readonly schemas: Map<string, SchemaDecl>;
  /** Registered top-level + imported `enum` variant sets — root only. */
  private readonly enums: Map<string, ReadonlySet<string>>;
  /** Materialised imports keyed by local binding name — root only. */
  private readonly imports: Map<string, MaterializedImport>;
  /** The callable-set names (`tools:`, `V6c`) — the arm `V19b` defines but does not populate. */
  private readonly callables: ReadonlySet<string>;

  public constructor(
    inputs: EnvironmentInputs,
    private readonly parent: LexicalEnvironment | null = null,
  ) {
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
        this.enums.set(reg.name, new Set(reg.variants));
      }
      // Imported `.warp` symbols materialised via `V15c`'s import loader
      // (imports.md §Visibility): an `fn` is resolvable + callable, a `schema`
      // resolves as a constructor, an `enum` resolves its variants.
      for (const imp of inputs.imports ?? []) {
        this.imports.set(imp.name, imp);
        if (imp.kind === "schema") {
          this.schemas.set(imp.name, { kind: "schema", name: imp.name, range: syntheticRange() });
        } else if (imp.kind === "enum") {
          this.enums.set(imp.name, new Set(imp.variants ?? []));
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
  public defineLocal(name: string, value: LoomValue, mutable: boolean): void {
    if (name === "_") {
      return;
    }
    this.locals.set(name, { value, mutable });
  }

  /**
   * Write a reassignment against a local binding: accepted only against a
   * `let mut` slot, rejected against an immutable `let` slot at the scope layer
   * (bindings.md `cka-6`). The write targets the nearest enclosing local slot;
   * an immutable-slot write leaves the slot unchanged.
   */
  public writeBinding(name: string, value: LoomValue): WriteResult {
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
    // 3. imported `.warp` symbol.
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
   * Enter a fresh `for` iteration scope binding `name` to `value` in a
   * per-iteration fresh slot (bindings.md §"per-iteration fresh binding"), so
   * each iteration's binding is independent of the others. The iteration
   * variable is an immutable binding.
   */
  public bindIterationVariable(name: string, value: LoomValue): LexicalEnvironment {
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
  public resolveEnumVariant(enumName: string, variant: string): LoomValue | undefined {
    const variants = this.root().enums.get(enumName);
    if (variants === undefined || !variants.has(variant)) {
      return undefined;
    }
    return makeEnumValue(enumName, variant);
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
export class LoomEvalHost implements EvalHost {
  public constructor(private readonly env: LexicalEnvironment) {}

  public resolveIdentifier(name: string): LoomValue {
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

  public callFunction(name: string, args: readonly LoomValue[]): LoomValue {
    void this.env;
    void args;
    // `V19b` DEFINES the callable arm's precedence position but does NOT
    // execute it: the cross-file `.warp fn` call execution rides `V19d`'s
    // invoke trampoline (`V19d` / `V19e`). Calling here is a wiring error.
    throw new IdentifierNotReadableError(
      `call execution for '${name}' is wired by V19d's invoke trampoline, not the scope layer`,
    );
  }
}
