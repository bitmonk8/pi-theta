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
  /**
   * The imported `fn`'s DECLARING-module environment (bug 0303) — present only
   * on the `import` arm for an imported `fn`. The executor opens the body scope
   * against this environment (falling back to the caller's when absent) so free
   * names in the body resolve against the lib that declared it, not the calling
   * theta's root registries.
   */
  readonly moduleEnv?: LexicalEnvironment;
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
 * Mint the declaration-identity key for an imported/re-exported `enum` (bug
 * 0305): the declaring `.thetalib` file's resolved path plus the declared
 * name, NOT the resolution-site local alias. Two aliases of one declaration
 * (`import { Sev as A, Sev as B }`) and a direct import vs. a re-export
 * rename of the same declaration (`export { Sev as Level } from …`) both
 * resolve to the SAME declaring file + declared name, so they mint the same
 * key and their runtime tags compare equal; two distinct declarations that
 * happen to share a name resolve to different declaring files and stay
 * distinct. Bug 0303 (imported `fn` body scope) can reuse this helper so a
 * lib-body enum read and an importer-side read of the same declaration mint
 * identical keys.
 */
export function enumDeclaringKey(resolvedPath: string, declaredName: string): string {
  return `${resolvedPath}#${declaredName}`;
}

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
  /**
   * Explicit `= "..."` wire values keyed by variant name — present only for
   * `kind: "enum"`. A variant absent here uses its name verbatim as the wire
   * value, preserving the name-is-wire default (schemas.md §Enum declarations).
   */
  readonly values?: Readonly<Record<string, string>>;
  /**
   * For an imported/re-exported enum: its declaring-declaration identity key
   * (`enumDeclaringKey`), so its runtime tag is the declaration, not the
   * local alias (bug 0305).
   */
  readonly declaringKey?: string;
  /**
   * The DECLARING `.thetalib`'s own module scope (bug 0303) — present only for
   * `kind: "fn"`. Built at materialisation time from the declaring lib's own
   * body, its own materialised imports (recursively), and its own enum
   * registrations, so the imported `fn`'s body can close over the file that
   * declared it rather than the importer's.
   */
  readonly moduleScope?: ModuleScope;
}

/**
 * The declaring-module environment inputs for an imported `.thetalib` `fn`
 * (bug 0303): the lib's own body (for hoisted `fn`/`schema`), the lib's own
 * materialised imports (recursively — a lib-to-lib import), and the lib's own
 * enum registrations (`declaringKey`-tagged). `LexicalEnvironment`'s
 * constructor builds a nested environment from this so the imported `fn`'s
 * free names resolve in its DECLARING file's scope, not the caller's.
 */
export interface ModuleScope {
  readonly body: ThetaBody;
  readonly imports: readonly MaterializedImport[];
  readonly enums: readonly EnumRegistration[];
  /**
   * The declaring lib's own resolved path (bug 0354, INV-4). The cross-file
   * `.thetalib` `fn` classifier (`thetalibFnFrameKind`) compares a caller's
   * residence against a callee's — this is the callee's, fixed to the file
   * that DECLARED the `fn`, so a re-export or `as`-alias (which name a
   * different import record but not a different declaration) does not change
   * which frame class the call counts as.
   */
  readonly residence: string;
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
  /**
   * The declaring-declaration identity key (`enumDeclaringKey`, bug 0305). A
   * file-loaded top-level `.theta` enum now carries
   * `declaringKey = enumDeclaringKey(<theta resolvedPath>, name)` (bug 0337,
   * generalising 0305's scheme) so two distinct `.theta` files' same-named
   * enums mint distinct keys. Absent only for a harness/in-memory theta with
   * no source path, where the tag falls back to the bare name. The constructor
   * tags the runtime `EnumEntry` with `reg.declaringKey ?? reg.name` so a
   * module-scope enum and a caller-side imported read of the SAME declaration
   * mint identical tags.
   */
  readonly declaringKey?: string;
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
  /**
   * The declaring lib's own resolved path when this environment IS a
   * declaring module's nested root (bug 0354, INV-4) — undefined for the
   * top-level app scope. Stored at the root and read back through
   * `currentResidence()` so `evalUserFnCall` / `evaluatePureFnCall` can
   * compare a callee's declaration residence against its caller's.
   */
  readonly moduleResidence?: string;
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

/**
 * One registered enum's variant → wire-value map paired with the tag
 * `resolveEnumVariant` mints the runtime `EnumValue` from (bug 0305). The tag
 * is the declaring-declaration identity (`enumDeclaringKey`), not the
 * resolution-site local name — for `.theta`-file enums (bug 0337) as well as
 * imported/re-exported `.thetalib` enums; the bare declared name is only the
 * fallback when no declaring path is supplied.
 */
interface EnumEntry {
  readonly variants: ReadonlyMap<string, string>;
  readonly tag: string;
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
  readonly enums: Map<string, EnumEntry>;
  readonly imports: Map<string, MaterializedImport>;
  readonly callables: ReadonlySet<string>;
  /**
   * Local binding name → the built declaring-module environment for that
   * imported `fn` (bug 0303) — shared so a `subagent fn`'s isolated scope
   * (`spawnIsolatedScope`) still resolves an imported sibling's body against
   * its OWN declaring module, not the isolated scope's root.
   */
  readonly moduleEnvs: Map<string, LexicalEnvironment>;
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
   * Registered top-level + imported `enum` variant → wire-value maps, each
   * paired with the declaring-declaration tag `resolveEnumVariant` mints the
   * runtime value from — root only. The key is the resolution-site local
   * name (`Enum.Variant` resolution keys by name); the `tag` is the SAME
   * declaring key for every alias of one declaration (bug 0305), so aliases
   * mint identical `EnumValue` tags and compare equal.
   */
  private readonly enums: Map<string, EnumEntry>;
  /** Materialised imports keyed by local binding name — root only. */
  private readonly imports: Map<string, MaterializedImport>;
  /**
   * Local binding name → the built declaring-module environment for that
   * imported `fn` (bug 0303) — root only. Built recursively in the
   * constructor's imports loop from the import's `moduleScope`, so an
   * imported `fn`'s body can be opened against the file that declared it.
   */
  private readonly moduleEnvs: Map<string, LexicalEnvironment>;
  /** The callable-set names (`tools:`, `V6c`) — the arm `V19b` defines but does not populate. */
  private readonly callables: ReadonlySet<string>;
  /**
   * The declaring lib's resolved path when this environment IS a declaring
   * module's nested root (bug 0354, INV-4) — undefined at the top-level app
   * scope. Root only; read back through `currentResidence()`.
   */
  private readonly moduleResidencePath: string | undefined;

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

  /**
   * True iff this scope is a `par for` iteration's per-iteration binding
   * scope (`bindParIterationVariable`). WHY: the CTRL-4 parse-side scan is
   * the primary defence against a body write reaching an outer `let mut`
   * (bug 0396) — a data race under concurrent worker scheduling — but a scan
   * miss must not let the write land silently. Marking the iteration scope
   * as a write boundary makes `writeBinding` fail closed the same way
   * `fnActivationBoundary` does (bug 0370), turning any future gap into a
   * loud `RejectedWriteDefectError` instead of a landed racy write. Reads
   * are unaffected: `resolve()` does not consult this flag, so an outer
   * binding stays readable inside the body (CTRL-4's read/write split).
   */
  private parIterationBoundary = false;

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
    // Root-only carriage (bug 0354, INV-4): stamped from `inputs` before the
    // `shared` early-return so an isolated `subagent fn` scope (also a fresh
    // root, RFC 0001 FN-6) keeps its own declaring residence rather than
    // inheriting the enclosing file's.
    this.moduleResidencePath = inputs.moduleResidence;
    if (shared !== undefined) {
      this.fns = shared.fns;
      this.schemas = shared.schemas;
      this.enums = shared.enums;
      this.imports = shared.imports;
      this.callables = shared.callables;
      this.moduleEnvs = shared.moduleEnvs;
      return;
    }
    // The root owns the fn / schema / enum / import / callable registries; a
    // nested scope holds only its local slots and delegates outward for the
    // resolution walk, so registries are built exactly once.
    this.fns = new Map();
    this.schemas = new Map();
    this.enums = new Map();
    this.imports = new Map();
    this.moduleEnvs = new Map();
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
        // A file-loaded `.theta` enum's tag is its file-qualified
        // `declaringKey` (bug 0337, generalising bug 0305's scheme), so two
        // distinct `.theta` files' same-named enums no longer collide across
        // an in-process `invoke`. The bare-name fallback below applies only
        // when no source path was threaded (a harness/in-memory theta).
        this.enums.set(reg.name, {
          variants: buildVariantWireMap(reg.variants, reg.values),
          tag: reg.declaringKey ?? reg.name,
        });
      }
      // Imported `.thetalib` symbols materialised via `V15c`'s import loader
      // (imports.md §Visibility): an `fn` is resolvable + callable, a `schema`
      // resolves as a constructor, an `enum` resolves its variants.
      for (const imp of inputs.imports ?? []) {
        this.imports.set(imp.name, imp);
        if (imp.kind === "fn" && imp.moduleScope !== undefined) {
          // The declaring lib's own environment (bug 0303): its own body
          // (hoisted fns/schemas), its own materialised imports (recursively
          // — a lib-to-lib import), and its own enum registrations, chained
          // with `parent: null` (its OWN root) but sharing the CALLER's
          // callables (`inputs.callables`) so effects/queries stay anchored to
          // the calling theta's conversation (constraint 1) while free NAMES
          // resolve in the declaring file. The nested constructor call builds
          // ITS OWN nested module envs the same way, so a lib-to-lib import
          // chain resolves recursively; the chain terminates because the
          // materialisation pass that built `imp.moduleScope` is itself
          // bounded by a visited-path set (IMP-5-independent, constraint 4).
          this.moduleEnvs.set(
            imp.name,
            new LexicalEnvironment(
              {
                body: imp.moduleScope.body,
                imports: imp.moduleScope.imports,
                enums: imp.moduleScope.enums,
                callables: inputs.callables ?? [],
                moduleResidence: imp.moduleScope.residence,
              },
              null,
            ),
          );
        }
        if (imp.kind === "schema") {
          this.schemas.set(imp.name, { kind: "schema", name: imp.name, range: syntheticRange() });
        } else if (imp.kind === "enum") {
          // Imported enums thread their explicit `= "..."` values (schemas.md
          // §Enum declarations), exactly as the same-file arm above. The tag
          // is the declaring-declaration key (bug 0305), not the local alias
          // `imp.name`, so two aliases of one declaration — or a direct
          // import and a re-export rename of the same declaration — mint the
          // same runtime tag.
          this.enums.set(imp.name, {
            variants: buildVariantWireMap(imp.variants ?? [], imp.values),
            tag: imp.declaringKey ?? imp.name,
          });
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
   * The declaration-residence of the currently-executing module (bug 0354,
   * INV-4): undefined at the top-level app scope, the declaring lib's
   * resolved path inside an imported `fn`'s body (that body's scope chains
   * down from the nested moduleEnv this residence was stamped on). Read at
   * the root because only a module's own root carries its stamp; a nested
   * `child()` scope has no stamp of its own to consult.
   */
  public currentResidence(): string | undefined {
    return this.root().moduleResidencePath;
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
      if (env.fnActivationBoundary) {
        // Mirrors `localShadowsCallable`'s stop (bug 0016's activation
        // boundary; bug 0370 §Fix layer 2): a caller-frame local is not in
        // scope inside the body under the no-closures model, so the walk
        // must not continue past the boundary into the caller's frames. The
        // root frame's `params:`-field locals ARE visible at the boundary
        // (parse-model parity), but `defineParamsFieldLocal` always records
        // them immutable, so a write reaching here is rejected either way
        // without a caller-slot mutation ever taking place.
        return { accepted: false };
      }
      if (env.parIterationBoundary) {
        // Belt for bug 0396: a `par for` body write that does not resolve to
        // a slot inside the iteration scope is reaching for an outer
        // binding — the CTRL-4 hazard the parse-side scan exists to refuse.
        // Stopping here (rather than continuing outward like a plain `for`)
        // turns any scan gap into the same loud `RejectedWriteDefectError`
        // path as an `fnActivationBoundary` miss, instead of a landed write
        // racing across concurrent workers.
        return { accepted: false };
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
      if (imp.fn === undefined) {
        return { arm: "import", callable: imp.kind === "fn" };
      }
      const moduleEnv = root.moduleEnvs.get(name);
      return {
        arm: "import",
        fn: imp.fn,
        callable: imp.kind === "fn",
        ...(moduleEnv !== undefined ? { moduleEnv } : {}),
      };
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
      // Carry the declaring module's residence into the isolated root (bug
      // 0354, INV-4): the receiver is `(moduleEnv ?? env)`, so its root's
      // `moduleResidencePath` is the declaring lib's residence for a
      // lib-declared `subagent fn` (undefined for an app-declared one). The
      // constructor reads this before the `shared` early-return, so the
      // isolated body's intra-module calls resolve residence-equal instead of
      // misattributing the caller to the enclosing app file.
      {
        body: { statements: [], tail: null },
        ...(root.moduleResidencePath !== undefined
          ? { moduleResidence: root.moduleResidencePath }
          : {}),
      },
      null,
      {
        fns: root.fns,
        schemas: root.schemas,
        enums: root.enums,
        imports: root.imports,
        callables: root.callables,
        moduleEnvs: root.moduleEnvs,
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
   * Enter a fresh `par for` iteration scope binding `name` to `value`
   * (identical per-iteration freshness to `bindIterationVariable`), but
   * additionally marked as a write boundary (bug 0396 belt layer, mirroring
   * `childFnActivation`'s boundary shape). A body write that walks out of
   * this scope to an outer binding is exactly the CTRL-4 hazard — concurrent
   * workers racing on shared mutable state — the parse-side scan exists to
   * refuse; the boundary rejects it here too rather than letting it land.
   * Reads keep crossing (`resolve()` does not consult the boundary), so an
   * outer binding stays readable inside the body per CTRL-4's read/write
   * split.
   */
  public bindParIterationVariable(name: string, value: ThetaValue): LexicalEnvironment {
    const scope = this.bindIterationVariable(name, value);
    scope.parIterationBoundary = true;
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
    const entry = this.root().enums.get(enumName);
    if (entry === undefined || !entry.variants.has(variant)) {
      return undefined;
    }
    // Mint the runtime tag from the registered DECLARATION identity (bug
    // 0305), not the access-site local name `enumName`: two aliases of one
    // declaration, or a direct import and a re-export rename of the same
    // declaration, share `entry.tag` and so compare equal; two distinct
    // declarations that happen to share a name do not. Resolve to the
    // variant's wire value (the explicit `= "..."` value when declared, else
    // the name) so `Enum.Variant` carries the correct wire form.
    return makeEnumValue(entry.tag, entry.variants.get(variant) as string);
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
