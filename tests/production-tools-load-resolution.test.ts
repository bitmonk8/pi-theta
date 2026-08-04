import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { ThetaFixture } from "../src/extension/factory";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";

// V20a-T — failing tests for the paired `V20a` "`tools:` load-time resolution
// wiring" implementation leaf.
//
// Convention: conventions.md (end-to-end harness; hardening/production-wiring
// realisation of an already-closed code-keyed area). Narrative spec references:
// frontmatter/frontmatter-fields-a.md (§`tools` callable set, FRNT-2/FRNT-3),
// invocation.md (`theta/load/callee-has-errors`). Closes no new spec REQ-ID.
//
// Bucket A — implemented-not-wired: `resolveCallableSet`
// (src/parser/callable-set.ts) exists and is exercised in isolation by
// tests/callable-set.test.ts, but it is never called on the PRODUCTION load /
// discovery path. `discoverAndComposeFixtures` (the shipped `session_start`
// composition root) parses each discovered `.theta` and composes it into a
// runnable fixture WITHOUT resolving its `tools:` callable set, so no
// `tools:`-resolution diagnostic ever fires against the shipped extension and a
// theta whose `tools:` is malformed is registered anyway.
//
// These tests drive that production load path over a real on-disk discovery
// source (the project `.pi/theta/` walk over the real `V8b` `PiFileSystem`),
// with a Pi tool registry threaded to load time (the shipped built-in tool set
// resolved against `ctx.cwd`). Each test reds today on its own primary
// assertion — the malformed-`tools:` theta is still registered (its fixture is
// returned) and its rejection diagnostic is never surfaced — NOT on a compile
// error, missing fixture, or harness throw. The paired `V20a` implementation
// wires `resolveCallableSet` into the load path and turns these green.
//
// Diagnostic *Message* strings are sourced verbatim from the diagnostics
// registry (diagnostics/code-registry-load.md) per the conventions.md
// *Diagnostic message anchors* rule; each asserting test cites its diagnostic
// code inline.

// --- Registry Message strings (diagnostics/code-registry-load.md) -----------
// The author-visible rejection message each `tools:`-resolution diagnostic
// renders. Sourced from the *Message* column so the assertions anchor on the
// exact string the shipped load path must surface.
const MSG = {
  // `theta/load/unknown-tool`
  unknownTool: "unknown Pi tool 'totally_unknown_xyz'",
  // `theta/load/prompt-mode-callable`
  promptModeCallable:
    "'tools:' entry './child.theta' points at a prompt-mode theta; only subagent-mode thetas are permitted",
  // `theta/load/tool-name-collision`
  toolNameCollision:
    "tool name 'dup' collides with another 'tools:' entry, top-level fn, or import",
  // `theta/load/invalid-tool-rename`
  invalidToolRename: "'as BadName' rename target must be lowercase-first; got 'BadName'",
  // `theta/load/invalid-derived-tool-name`
  invalidDerivedToolName:
    "'tools:' entry './2fast.theta' derives the default name '2fast', " +
    "which must be lowercase-first; rename the file or add an 'as' clause",
  // `theta/load/callee-has-errors`
  calleeHasErrors: "callee './broken.theta' has errors; see related diagnostics",
  // `theta/parse/invoke-arity-too-many` (diagnostics/code-registry-parse.md) —
  // the `.theta`-callable call surface renders `<callee>` as the presented
  // callable name written at the call site, not as the callee path.
  callableArityTooMany:
    "invoke 'b71callee' passes too many arguments: expected at most 2, got 3",
  // `theta/parse/invoke-arity-too-few`
  callableArityTooFew:
    "invoke 'b71callee' passes too few arguments: expected 2 non-defaulted, got 1",
  // `theta/parse/invoke-arity-too-few` at a zero-argument call site
  callableArityZeroArgs:
    "invoke 'b71callee' passes too few arguments: expected 2 non-defaulted, got 0",
  // Bug 0072 — `theta/parse/tool-arg-schema-conflict`
  // (diagnostics/code-registry-parse.md). Message template:
  //   `Pi tool '<name>' argument field '<field>' type is provably disjoint from
  //    the input schema: expected <expected>, got <actual>`
  // `<expected>` is the tool's registered schema type for the field; `<actual>`
  // is the field expression's rendered static type (an integer literal types as
  // `integer`).
  toolArgSchemaConflictPath:
    "Pi tool 'read' argument field 'path' type is provably disjoint from the " +
    "input schema: expected string, got integer",
  // The same row at a non-first field, proving the check reads the PER-FIELD
  // schema type: `offset` is registered as `number`.
  toolArgSchemaConflictOffset:
    "Pi tool 'read' argument field 'offset' type is provably disjoint from the " +
    "input schema: expected number, got string",
  // Bug 0072 — `theta/parse/tool-arg-type-mismatch`
  // (diagnostics/code-registry-parse.md). Message template:
  //   `tool '<name>' argument type mismatch: expected <expected>, got <actual>`
  // `<name>` renders the PRESENTED callable name written at the call site (the
  // rendering bug 0071 pinned for this surface in
  // diagnostics/placeholder-rendering-b.md §7); `<expected>` is the callee
  // `params:` field's verbatim type source.
  toolArgTypeMismatch:
    "tool 'b72typedcallee' argument type mismatch: expected string, got integer",
  // `theta/parse/invoke-arity-too-many` at the arity-before-type cell's callee.
  b72CallableArityTooMany:
    "invoke 'b72aritycallee' passes too many arguments: expected at most 1, got 2",
  // The same `theta/parse/tool-arg-type-mismatch` row at the gate cells' own
  // callee (`b72litcallee`), so the FIRE direction of the unknown-free gate is
  // attributable to its own cell rather than to `b72callmismatch`'s.
  toolArgTypeMismatchGate:
    "tool 'b72litcallee' argument type mismatch: expected string, got integer",
  // The same `theta/parse/tool-arg-schema-conflict` row under an `as` rename, so
  // the `<actual>` RENDERING of an all-integer-arm ternary is attributable to
  // one cell: `<name>` renders the post-rename callable-set name (the
  // `ToolCallArgCheckInput.toolName` contract), which is unique in the
  // workspace. `<actual>` must read `integer` — one arm's rendering, not one per
  // arm.
  toolArgSchemaConflictTernDedup:
    "Pi tool 'b72pinread' argument field 'path' type is provably disjoint from " +
    "the input schema: expected string, got integer",
  // The same row where the collected arm types are DISTINCT and still all miss
  // the schema kind: `<actual>` renders the union of what the field can evaluate
  // to, joined with " | " in source order.
  toolArgSchemaConflictUnion:
    "Pi tool 'b72boolgrep' argument field 'ignoreCase' type is provably disjoint " +
    "from the input schema: expected boolean, got integer | string",
  // `theta/parse/tool-arg-type-mismatch` at the mixed-arm cells' shared callee.
  toolArgTypeMismatchMixed:
    "tool 'b72mixcallee' argument type mismatch: expected string, got integer",
  // The same row where the callee's `params:` annotation MENTIONS a name the
  // check cannot resolve and the verdict is still decidable from the
  // annotation's structure alone: no integer is an array, whatever `B72Arr`
  // denotes. `<expected>` renders the callee's verbatim type source.
  toolArgTypeMismatchArrayNamed:
    "tool 'b72arrcallee' argument type mismatch: expected array<B72Arr>, got integer",
} as const;

// --- Planted discovery workspace -------------------------------------------

interface PlantedTheta {
  readonly stem: string;
  readonly text: string;
}

function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

/**
 * The `.theta` files planted under the project discovery source. Each malformed
 * theta pairs one `tools:`-resolution rejection with a positive control that
 * MUST still register, so the test distinguishes "the wiring rejects the bad
 * theta" from "the wiring rejects everything".
 */
const THETAS: readonly PlantedTheta[] = [
  // A control theta whose `tools:` resolves cleanly (a known built-in Pi tool):
  // registers today and after `V20a`.
  { stem: "goodtool", text: theta("---", "mode: prompt", "tools: read", "---", "@`hi`") },

  // `theta/load/unknown-tool`: a `tools:` entry naming a Pi tool absent from the
  // threaded registry.
  {
    stem: "unknowntool",
    text: theta("---", "mode: prompt", "tools: totally_unknown_xyz", "---", "@`hi`"),
  },

  // `theta/load/prompt-mode-callable`: a `.theta` callee that is prompt-mode.
  {
    stem: "promptcallee",
    text: theta("---", "mode: subagent", "tools:", "  - ./child.theta", "---", "@`hi`"),
  },
  // The prompt-mode callee `promptcallee` points at (valid on its own merits —
  // registers as `/child`).
  { stem: "child", text: theta("---", "mode: prompt", "---", "@`child`") },

  // `theta/load/tool-name-collision`: two `tools:` entries resolve to `dup`.
  {
    stem: "collision",
    text: theta("---", "mode: prompt", "tools:", "  - read as dup", "  - grep as dup", "---", "@`hi`"),
  },
  // Positive control: an `as` rename disambiguates, so the theta registers.
  {
    stem: "renameresolves",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - read as reader",
      "  - grep as searcher",
      "---",
      "@`hi`",
    ),
  },

  // `theta/load/invalid-tool-rename`: a non-theta-identifier `as` rename target.
  {
    stem: "badrename",
    text: theta("---", "mode: prompt", "tools:", "  - read as BadName", "---", "@`hi`"),
  },

  // `theta/load/invalid-derived-tool-name`: a `.theta` entry whose DERIVED
  // default name is not lowercase-first, so the callable it mints has no
  // bare-identifier spelling in theta code (bug 0070).
  {
    stem: "digitdefault",
    text: theta("---", "mode: subagent", "tools:", "  - ./2fast.theta", "---", "@`hi`"),
  },
  // The digit-leading callee both `digitdefault` and `digitrenamed` point at.
  // Valid on its own merits: the discovery stem regex `^[a-z0-9][a-z0-9_-]*$`
  // admits a leading digit, so it registers as `/2fast`.
  { stem: "2fast", text: theta("---", "mode: subagent", "---", "@`fast`") },
  // Positive control: the `as` override supplies the presented name, so the
  // derived name is never used and the theta registers.
  {
    stem: "digitrenamed",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./2fast.theta as fast",
      "---",
      "@`hi`",
    ),
  },

  // `theta/load/callee-has-errors`: a subagent-mode `.theta` callee that itself
  // carries an error-severity load/parse diagnostic.
  {
    stem: "calleeerrors",
    text: theta("---", "mode: subagent", "tools:", "  - ./broken.theta", "---", "@`hi`"),
  },
  // The erroring callee `calleeerrors` points at: subagent-mode (so NOT
  // prompt-mode-callable) but carrying `theta/parse/unresolved-named-type`.
  {
    stem: "broken",
    text: theta("---", "mode: subagent", "params:", "  x: NoSuchType", "---", "@`broken`"),
  },

  // Bug 0071 — `theta/parse/invoke-arity-too-few` / `-too-many` over the
  // `.theta`-callable call surface. The `b71` stem prefix keeps this group's
  // callee names disjoint from every other planted theta: `ctx.ui.notify`
  // carries the message text with no caller attribution, so a cell asserting
  // the absence of an arity diagnostic is sound only when its callee name
  // cannot occur in a sibling group's message.
  //
  // The callee for the three rejected call forms: two non-defaulted `params:`,
  // so `requiredCount` and `totalCount` are both 2.
  {
    stem: "b71callee",
    text: theta("---", "mode: subagent", "params:", "  x: string", "  y: string", "---", "@`hi`"),
  },
  {
    stem: "b71toomany",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./b71callee.theta",
      "---",
      'b71callee("a", "b", "c")?',
      "@`hi`",
    ),
  },
  {
    stem: "b71toofew",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./b71callee.theta",
      "---",
      'b71callee("a")?',
      "@`hi`",
    ),
  },
  {
    stem: "b71zero",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./b71callee.theta",
      "---",
      "b71callee()?",
      "@`hi`",
    ),
  },
  // The correct-arity control's own callee, referenced by `b71ctl` alone.
  {
    stem: "b71ctlcallee",
    text: theta("---", "mode: subagent", "params:", "  x: string", "  y: string", "---", "@`hi`"),
  },
  {
    stem: "b71ctl",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./b71ctlcallee.theta",
      "---",
      'b71ctlcallee("a", "b")?',
      "@`hi`",
    ),
  },
  // A defaulted tail param lowers `requiredCount` to 1, so the 1-argument call
  // in `b71def` supplies every non-defaulted param and is legal.
  {
    stem: "b71defcallee",
    text: theta(
      "---",
      "mode: subagent",
      "params:",
      "  x: string",
      '  y: string = "d"',
      "---",
      "@`hi`",
    ),
  },
  {
    stem: "b71def",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./b71defcallee.theta",
      "---",
      'b71defcallee("a")?',
      "@`hi`",
    ),
  },

  // Bug 0072 — the two static tool-argument TYPE rules, at the production load
  // level. The `b72` stem prefix keeps this group disjoint from every other
  // planted theta: `ctx.ui.notify` carries the message text with no caller
  // attribution, so the sound per-cell absence observable is REGISTRATION (an
  // error-severity diagnostic un-registers exactly its own theta), and every
  // callee name a cell filters notifications by is unique in the workspace.
  //
  // (1) `theta/parse/tool-arg-schema-conflict` — the Pi-tool arm. An integer
  // literal into `read`'s string `path` is the paradigm provable disjointness:
  // no `format` / `pattern` / refinement / union escape hatch on either side.
  {
    stem: "b72disjoint",
    text: theta("---", "mode: prompt", "tools: read", "---", "read({ path: 123 })?", "@`hi`"),
  },
  // The same rule at a non-first field: `path` is fine, `offset` is registered
  // as `number` and receives a string.
  {
    stem: "b72offset",
    text: theta(
      "---",
      "mode: prompt",
      "tools: read",
      "---",
      'read({ path: "a", offset: "3" })?',
      "@`hi`",
    ),
  },
  // UNPROVABLE control: a `let`-bound identifier's static type is a nominal
  // self-reference, not a subset kind, so nothing is provable and the value
  // falls through to the runtime AJV net. Must keep registering — the parse
  // check must never reject a value AJV would accept.
  {
    stem: "b72unprov",
    text: theta(
      "---",
      "mode: prompt",
      "tools: read",
      "---",
      'let p = "x"',
      "read({ path: p })?",
      "@`hi`",
    ),
  },
  // INTERSECTING control: a string literal into the string `path` field.
  {
    stem: "b72inter",
    text: theta("---", "mode: prompt", "tools: read", "---", 'read({ path: "a" })?', "@`hi`"),
  },
  // OUT-OF-REACH control: an unknown FIELD NAME has no registered schema type to
  // be disjoint from, so the parse arm cannot see it (`read` registers no
  // `additionalProperties: false`; the violation is the absent `required` field).
  // It is the runtime half's case — this cell pins that the parse arm does not
  // reach for it.
  {
    stem: "b72unknownfield",
    text: theta(
      "---",
      "mode: prompt",
      "tools: read",
      "---",
      'read({ nosuchfield: "a" })?',
      "@`hi`",
    ),
  },

  // (2) `theta/parse/tool-arg-type-mismatch` — the `.theta`-callable arm. A
  // callee named by a literal `tools:` entry is statically resolvable
  // (invocation.md §Static resolution), so an argument that does not type-check
  // against its `params:` is a parse error.
  {
    stem: "b72typedcallee",
    text: theta("---", "mode: subagent", "params:", "  x: string", "---", "@`hi`"),
  },
  {
    stem: "b72callmismatch",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - ./b72typedcallee.theta",
      "---",
      "b72typedcallee(123)?",
      "@`hi`",
    ),
  },
  // The matching-type control's own callee, referenced by `b72callok` alone.
  {
    stem: "b72okcallee",
    text: theta("---", "mode: subagent", "params:", "  x: string", "---", "@`hi`"),
  },
  {
    stem: "b72callok",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - ./b72okcallee.theta",
      "---",
      'b72okcallee("a")?',
      "@`hi`",
    ),
  },
  // ARITY-BEFORE-TYPE: one `params:` field, two arguments, and the argument in
  // the slot that DOES have a corresponding param is wrong-typed. The arity
  // violation must be the only diagnostic (invocation.md §Argument arity), so a
  // type mismatch must not stack on top of it.
  {
    stem: "b72aritycallee",
    text: theta("---", "mode: subagent", "params:", "  x: string", "---", "@`hi`"),
  },
  {
    stem: "b72callarity",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - ./b72aritycallee.theta",
      "---",
      "b72aritycallee(123, 456)?",
      "@`hi`",
    ),
  },

  // (3) An UNRESOLVABLE SIBLING ARM. Both type rules judge an expression by the
  // SET of types it can evaluate to (`collectProvableArgTypes`,
  // `src/extension/invoke-static-checks.ts`), and an unresolvable arm makes that
  // set unknown, so the expression is withheld from both.
  //
  // `StaticTypeInferencePass`'s composite narrowing accepts the first candidate
  // every sibling is `compatible` OR `unknown` against, so an unresolvable arm
  // is ERASED instead of widening the node to a union no subset kind can
  // represent. A check that trusted that reduction would read `flag ? 1 : p` as
  // `integer` and reject a runtime value of `"legit"` — a value `read`'s
  // `path: { type: "string" }` accepts — which tool-calls.md §"Provable-
  // disjointness check (parse time)" forbids ("The check therefore never
  // rejects a program the runtime AJV check would accept"). The erasure is
  // ORDER-DEPENDENT (only the arm order that puts the resolvable candidate
  // first collapses), so both orders are pinned.
  {
    stem: "b72ternfwd",
    text: theta(
      "---",
      "mode: prompt",
      "tools: read",
      "---",
      "let flag = false",
      'let p = "legit"',
      "read({ path: flag ? 1 : p })?",
      "@`hi`",
    ),
  },
  {
    stem: "b72ternrev",
    text: theta(
      "---",
      "mode: prompt",
      "tools: read",
      "---",
      "let flag = false",
      'let p = "legit"',
      "read({ path: flag ? p : 1 })?",
      "@`hi`",
    ),
  },
  // The gate is not a blanket disable: a ternary whose BOTH arms are literals
  // is unknown-free, reduces to `integer` for real, and every runtime value it
  // can take is one AJV rejects.
  {
    stem: "b72ternlit",
    text: theta(
      "---",
      "mode: prompt",
      "tools: read",
      "---",
      "let flag = false",
      "read({ path: flag ? 1 : 2 })?",
      "@`hi`",
    ),
  },
  // The `match` sibling of the gate's arm-body recursion, in the only shape
  // that reaches this layer — see the cell comment for why the mixed-arm shape
  // cannot be witnessed here.
  {
    stem: "b72matchlit",
    text: theta(
      "---",
      "mode: prompt",
      "tools: read",
      "---",
      "let flag = false",
      "read({ path: match flag { true => 1, false => 2 } })?",
      "@`hi`",
    ),
  },
  // The same gate on the `.theta`-callable arm: bug 0072 §Fix's parse half
  // states that only an explicit incompatibility is a mismatch and `unknown`
  // defers to the runtime net, which the engine's erasure otherwise defeats.
  {
    stem: "b72gatecallee",
    text: theta("---", "mode: subagent", "params:", "  x: string", "---", "@`hi`"),
  },
  {
    stem: "b72callgate",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - ./b72gatecallee.theta",
      "---",
      "let flag = false",
      'let p = "legit"',
      "b72gatecallee(flag ? 1 : p)?",
      "@`hi`",
    ),
  },
  {
    stem: "b72litcallee",
    text: theta("---", "mode: subagent", "params:", "  x: string", "---", "@`hi`"),
  },
  {
    stem: "b72calllit",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - ./b72litcallee.theta",
      "---",
      "let flag = false",
      "b72litcallee(flag ? 1 : 2)?",
      "@`hi`",
    ),
  },

  // (4) MUTUALLY INCOMPATIBLE sibling arms — the composite whose arms are all
  // statically resolved and share no common type.
  //
  // `StaticTypeInferencePass.#commonType` returns `candidates[0]` when no
  // candidate narrows the rest, so `flag ? 1 : "a"` reduces to `integer` with
  // the string arm DROPPED, no `unknown` anywhere in the reduction. `ternary` is
  // the reachable carrier: the V20c parse layer rejects the same shape in a
  // `match` (`theta/parse/match-arm-type-mismatch`), an array literal
  // (`theta/parse/array-no-common-type`) and mixed `+` / ordering operands, but
  // has no common-type check over ternary branches, so a ternary argument
  // reaches the compose pass intact.
  //
  // Every cell below MUST register: with `flag = false` each runtime value is
  // one the very schema / `params:` field the diagnostic would name accepts, and
  // `docs/spec_topics/tool-calls.md` §"Provable-disjointness check (parse time)"
  // binds the check to "a provable disjointness guarantees the runtime AJV check
  // would reject the same value … The check therefore never rejects a program the
  // runtime AJV check would accept".
  {
    stem: "b72mixpath",
    text: theta(
      "---",
      "mode: prompt",
      "tools: read",
      "---",
      "let flag = false",
      'read({ path: flag ? 1 : "a" })?',
      "@`hi`",
    ),
  },
  // Arm order symmetry: the reduction's fallback takes the FIRST candidate, so
  // the string arm leading is the order that reduces to `string` and would have
  // registered even unrepaired — pinned so neither order can regress alone.
  {
    stem: "b72mixpathrev",
    text: theta(
      "---",
      "mode: prompt",
      "tools: read",
      "---",
      "let flag = false",
      'read({ path: flag ? "a" : 1 })?',
      "@`hi`",
    ),
  },
  // The same vector at a NUMERIC field (`offset` is registered as `number`), in
  // both arm orders: the integer arm cannot be the one that fires there, so the
  // string arm is the dropped one and no operand order is safe.
  {
    stem: "b72mixoff",
    text: theta(
      "---",
      "mode: prompt",
      "tools: read",
      "---",
      "let flag = false",
      'read({ path: "a", offset: flag ? 1 : "b" })?',
      "@`hi`",
    ),
  },
  {
    stem: "b72mixoffrev",
    text: theta(
      "---",
      "mode: prompt",
      "tools: read",
      "---",
      "let flag = false",
      'read({ path: "a", offset: flag ? "b" : 1 })?',
      "@`hi`",
    ),
  },
  // The FIRE direction with its `<actual>` rendering attributable: `as` renames
  // the callable so `<name>` names this cell alone. Both arms are integer
  // literals, so the collected set DEDUPLICATES to one member and the message
  // must read `got integer`.
  {
    stem: "b72litpin",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - read as b72pinread",
      "---",
      "let flag = false",
      "b72pinread({ path: flag ? 1 : 2 })?",
      "@`hi`",
    ),
  },
  // The FIRE direction where the arms are DISTINCT and still all miss the schema
  // kind: `grep`'s `ignoreCase` is registered as `boolean`, which neither an
  // integer nor a string satisfies, so this is sound in both arms — and its
  // `<actual>` pins the `" | "` union rendering.
  {
    stem: "b72unionfire",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - grep as b72boolgrep",
      "---",
      "let flag = false",
      'b72boolgrep({ pattern: "a", ignoreCase: flag ? 1 : "a" })?',
      "@`hi`",
    ),
  },
  // The `.theta`-callable analogue, both directions at ONE callee: a mixed-arm
  // argument must register (the string arm type-checks against `x: string`) and
  // an all-integer-arm argument at the same callee must still fire.
  {
    stem: "b72mixcallee",
    text: theta("---", "mode: subagent", "params:", "  x: string", "---", "@`hi`"),
  },
  {
    stem: "b72mixcall",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - ./b72mixcallee.theta",
      "---",
      "let flag = false",
      'b72mixcallee(flag ? 1 : "a")?',
      "@`hi`",
    ),
  },
  {
    stem: "b72mixcalllit",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - ./b72mixcallee.theta",
      "---",
      "let flag = false",
      "b72mixcallee(flag ? 1 : 2)?",
      "@`hi`",
    ),
  },

  // (5) CROSS-FILE NAME CAPTURE on the EXPECTED side. The callee's `params:`
  // annotation is a bare name lifted out of the callee's file, so it must not
  // resolve against the CALLER's `schema` declarations.
  //
  // Divergent homonym: the callee's `B72Conf` is `integer` and the caller's is
  // `string`, and the argument is an integer the callee accepts. Both callers
  // must register.
  {
    stem: "b72homcallee",
    text: theta(
      "---",
      "mode: subagent",
      "params:",
      "  x: B72Conf",
      "---",
      "schema B72Conf = integer",
      "@`hi`",
    ),
  },
  {
    stem: "b72homcaller",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - ./b72homcallee.theta",
      "---",
      "schema B72Conf = string",
      "b72homcallee(1)?",
      "@`hi`",
    ),
  },
  // The no-homonym sibling: the identical call from a caller that declares no
  // `B72Conf`. Its verdict is what makes the pair a controlled comparison — a
  // difference between the two is attributable to the caller's declaration and
  // to nothing else.
  {
    stem: "b72homplain",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - ./b72homcallee.theta",
      "---",
      "b72homcallee(1)?",
      "@`hi`",
    ),
  },
  // The REVERSE divergence: the caller's homonym would ACCEPT the argument the
  // callee's own declaration rejects (`B72Rev` is `string` at the callee,
  // `integer` at the caller). The check has no standing to decide either way,
  // so this caller registers and the callee's own runtime validation owns the
  // rejection.
  {
    stem: "b72revcallee",
    text: theta(
      "---",
      "mode: subagent",
      "params:",
      "  x: B72Rev",
      "---",
      "schema B72Rev = string",
      "@`hi`",
    ),
  },
  {
    stem: "b72revcaller",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - ./b72revcallee.theta",
      "---",
      "schema B72Rev = integer",
      "b72revcallee(1)?",
      "@`hi`",
    ),
  },
  // An expected type that MENTIONS an unresolvable name and is still decidable
  // from its own structure: no integer is an `array<…>`, whatever `B72Arr`
  // denotes. The FIRE direction of the namespace rule.
  {
    stem: "b72arrcallee",
    text: theta(
      "---",
      "mode: subagent",
      "params:",
      "  x: array<B72Arr>",
      "---",
      "schema B72Arr = integer",
      "@`hi`",
    ),
  },
  {
    stem: "b72arrcaller",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - ./b72arrcallee.theta",
      "---",
      "b72arrcallee(1)?",
      "@`hi`",
    ),
  },
];

// --- Fake host `pi` / `ctx` for the load path ------------------------------

interface LoadOutcome {
  /** Slash names the shipped composition root registered (returned fixtures). */
  readonly registered: readonly string[];
  /** Error-severity diagnostic messages surfaced via `ctx.ui.notify`. */
  readonly notifications: readonly string[];
}

let outcome: LoadOutcome;
let workspaceDir: string;

async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;

  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
  return { registered: fixtures.map((f) => f.slashName), notifications };
}

beforeAll(async () => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-v20a-"));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const l of THETAS) {
    writeFileSync(join(projectThetaDir, `${l.stem}.theta`), l.text, "utf8");
  }
  // A minimal valid settings file — noise suppression for the bug-0013
  // warning surface, NOT behaviour under test: without it the headless
  // helper path mirrors a `theta/load/settings-unreadable` WARNING for the
  // workspace's absent `.pi/settings.json` to real stderr in every
  // `npm test` run.
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
  outcome = await runProductionLoad(workspaceDir);
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});

// A precondition guard shared by every bullet: the discovery walk found the
// planted thetas at all (so a red below is a `tools:`-resolution red, never an
// empty-walk / setup red). `goodtool`'s clean `tools: read` must always
// register.
describe("V20a-T — production load path discovered the planted workspace", () => {
  it("registers the clean control theta whose `tools:` resolves (goodtool)", () => {
    expect(
      outcome.registered,
      "the project `.pi/theta/` discovery walk did not register the clean control theta — " +
        "the setup precondition is unmet. Registered: " + JSON.stringify(outcome.registered),
    ).toContain("goodtool");
  });
});

// ===========================================================================
// Tests bullet 1 — `theta/load/unknown-tool` (cka-11 FRNT area, owned on V6c).
// A `tools:` entry naming a Pi tool absent from the threaded registry is
// rejected at PRODUCTION load time. Reds today: unwired — the theta registers
// and no diagnostic fires.
// ===========================================================================
describe("V20a-T — theta/load/unknown-tool rejected at production load time", () => {
  it("theta/load/unknown-tool: an unknown Pi tool in `tools:` un-registers the theta at load time", () => {
    expect(
      outcome.registered,
      "resolveCallableSet is not wired into the production load path: the theta whose " +
        "`tools:` names an unknown Pi tool was registered anyway. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("unknowntool");
  });

  it("theta/load/unknown-tool: the load path surfaces the registry rejection message", () => {
    expect(
      outcome.notifications,
      "no theta/load/unknown-tool diagnostic surfaced — the shipped load path never resolves " +
        "the `tools:` callable set. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(MSG.unknownTool);
  });
});

// ===========================================================================
// Tests bullet 2 — `theta/load/prompt-mode-callable` (owned on V6c). A
// prompt-mode `.theta` callee in `tools:` is rejected at production load time.
// ===========================================================================
describe("V20a-T — theta/load/prompt-mode-callable rejected at production load time", () => {
  it("theta/load/prompt-mode-callable: a prompt-mode `.theta` callee in `tools:` un-registers the parent", () => {
    expect(
      outcome.registered,
      "the parent theta naming a prompt-mode `.theta` callee in `tools:` was registered anyway — " +
        "resolveCallableSet is unwired on the load path. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("promptcallee");
  });

  it("theta/load/prompt-mode-callable: the load path surfaces the registry rejection message", () => {
    expect(
      outcome.notifications,
      "no theta/load/prompt-mode-callable diagnostic surfaced. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(MSG.promptModeCallable);
  });
});

// ===========================================================================
// Tests bullet 3 — `theta/load/tool-name-collision` (owned on V6c). A `tools:`
// name collision fires at production load time; an `as` rename resolves.
// ===========================================================================
describe("V20a-T — theta/load/tool-name-collision fires at production load time", () => {
  it("theta/load/tool-name-collision: two `tools:` entries resolving to one name un-register the theta", () => {
    expect(
      outcome.registered,
      "the theta whose two `tools:` entries collide on one name was registered anyway. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("collision");
  });

  it("theta/load/tool-name-collision: the load path surfaces the registry rejection message", () => {
    expect(
      outcome.notifications,
      "no theta/load/tool-name-collision diagnostic surfaced. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(MSG.toolNameCollision);
  });

  it("theta/load/tool-name-collision: an `as` rename resolves the collision — the theta registers", () => {
    // Green today (nothing rejects it) and after V20a (a clean callable set): the
    // positive control proves V20a rejects the collision case specifically, not
    // every `as`-renamed `tools:` theta.
    expect(
      outcome.registered,
      "the `as`-disambiguated theta must still register. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("renameresolves");
  });
});

// ===========================================================================
// Tests bullet 4 — `theta/load/invalid-tool-rename` (owned on V6c). A
// non-theta-identifier `as` rename target is rejected at production load time.
// ===========================================================================
describe("V20a-T — theta/load/invalid-tool-rename rejected at production load time", () => {
  it("theta/load/invalid-tool-rename: a non-identifier `as` target un-registers the theta", () => {
    expect(
      outcome.registered,
      "the theta whose `as` rename target is not theta-identifier-shaped was registered anyway. " +
        "Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("badrename");
  });

  it("theta/load/invalid-tool-rename: the load path surfaces the registry rejection message", () => {
    expect(
      outcome.notifications,
      "no theta/load/invalid-tool-rename diagnostic surfaced. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(MSG.invalidToolRename);
  });
});

// ===========================================================================
// Tests bullet 5 — `theta/load/callee-has-errors` (cka-14 INV area, owned on
// V15f). A `tools:` `.theta` callee that itself carries error-severity
// load/parse diagnostics is rejected at production load time (E severity — the
// callable cannot be created and the parent does not register).
// ===========================================================================
describe("V20a-T — theta/load/callee-has-errors rejected at production load time", () => {
  it("theta/load/callee-has-errors: an erroring `.theta` callee in `tools:` un-registers the parent", () => {
    expect(
      outcome.registered,
      "the parent theta naming an erroring `.theta` callee in `tools:` was registered anyway — " +
        "the `tools:` static-resolution pass is unwired on the load path. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("calleeerrors");
  });

  it("theta/load/callee-has-errors: the load path surfaces the registry rejection message", () => {
    expect(
      outcome.notifications,
      "no theta/load/callee-has-errors diagnostic surfaced. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(MSG.calleeHasErrors);
  });
});

// ===========================================================================
// Bug 0070 — `theta/load/invalid-derived-tool-name`. The presented name of a
// `.theta` entry comes from the `as` override or from the derived default, and
// the lowercase-first identifier rule
// (frontmatter/frontmatter-fields-a.md §`tools`) governs both, but at the
// baseline only the `as` override was checked. A derived name outside that
// rule was bound into the frozen callable set, offered to the model and
// counted for collision detection, while theta code had no bare-identifier
// form for it (tool-calls.md §opening). The paired cell keeps the gate honest
// in both directions: the derived name un-registers, the `as` override
// registers.
// ===========================================================================
describe("V20a-T — theta/load/invalid-derived-tool-name rejected at production load time", () => {
  it("theta/load/invalid-derived-tool-name: a digit-leading derived default name un-registers the theta", () => {
    expect(
      outcome.registered,
      "the theta whose `tools:` entry derives the unspellable callable name " +
        "`2fast` was registered anyway. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("digitdefault");
  });

  it("theta/load/invalid-derived-tool-name: the load path surfaces the registry rejection message", () => {
    expect(
      outcome.notifications,
      "no theta/load/invalid-derived-tool-name diagnostic surfaced, so the only " +
        "signal the author gets is a parse error at their own call site. " +
        "Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(MSG.invalidDerivedToolName);
  });

  it("theta/load/invalid-derived-tool-name: an `as` override resolves it — the theta registers", () => {
    // Green today (nothing rejects it) and after the fix (the override supplies
    // the presented name): the positive control proves the rule rejects the
    // derived name specifically, not every entry naming a digit-leading callee.
    expect(
      outcome.registered,
      "the `as`-overridden theta must still register. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("digitrenamed");
  });
});

// ===========================================================================
// Bug 0071 — `theta/parse/invoke-arity-too-few` / `-too-many` over the
// `.theta`-callable call surface. `docs/spec_topics/tool-calls.md`
// §"Argument shape" binds both codes to both call surfaces by name — they
// "apply equally to a `.theta` callable call" — and one shared call-site walk
// carries both surfaces into the compose pass: `collectInvokeExprs` and the
// `.theta`-callable-call resolution read the same traversal result, which the
// INV-3 arity block of `checkInvokeStaticResolution` consumes.
//
// The three rejected forms are pinned here; the correct-arity control and the
// defaulted-param callee hold green in both directions, so the arity check is
// pinned to wrong arity rather than to the `.theta`-callable call form itself.
// The full matrix — the `as` rename, the hyphen→underscore rewrite, the
// already-failed `tools:` entry, and the `invoke(...)` rendering divergence —
// lives in `tests/theta-callable-call-arity.test.ts`.
// ===========================================================================
describe("bug 0071 — `.theta`-callable call arity rejected at production load time", () => {
  it("theta/parse/invoke-arity-too-many: a 3-argument `.theta`-callable call at a 2-param callee un-registers the caller", () => {
    expect(
      outcome.registered,
      "the arity check does not reach the `.theta`-callable call surface: the caller " +
        "passing 3 arguments to a 2-param callee was registered anyway. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("b71toomany");
  });

  it("theta/parse/invoke-arity-too-many: the load path surfaces the registry rejection message", () => {
    expect(
      outcome.notifications,
      "no theta/parse/invoke-arity-too-many diagnostic surfaced, so the surplus " +
        "argument is discarded with no signal at either phase. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(MSG.callableArityTooMany);
  });

  it("theta/parse/invoke-arity-too-few: a 1-argument `.theta`-callable call at a 2-param callee un-registers the caller", () => {
    expect(
      outcome.registered,
      "the caller passing 1 argument to a 2-non-defaulted-param callee was registered " +
        "anyway, deferring the rejection to the callee-side runtime AJV net. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("b71toofew");
  });

  it("theta/parse/invoke-arity-too-few: the load path surfaces the registry rejection message", () => {
    expect(
      outcome.notifications,
      "no theta/parse/invoke-arity-too-few diagnostic surfaced for the " +
        "`.theta`-callable call form. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(MSG.callableArityTooFew);
  });

  it("theta/parse/invoke-arity-too-few: a zero-argument `.theta`-callable call at a 2-param callee un-registers the caller", () => {
    expect(
      outcome.registered,
      "the caller passing no arguments to a 2-non-defaulted-param callee was registered " +
        "anyway. Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("b71zero");
  });

  it("theta/parse/invoke-arity-too-few: the zero-argument call renders `got 0`", () => {
    expect(
      outcome.notifications,
      "no theta/parse/invoke-arity-too-few diagnostic surfaced for the zero-argument " +
        "`.theta`-callable call form. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(MSG.callableArityZeroArgs);
  });

  it("theta/parse/invoke-arity-*: a correct-arity `.theta`-callable call registers", () => {
    // Green today (nothing rejects it) and after the fix (the arity matches):
    // the control proves the check rejects wrong arity specifically, not every
    // `.theta`-callable call.
    expect(
      outcome.registered,
      "the exact-arity `.theta`-callable caller must still register. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("b71ctl");
    expect(
      outcome.notifications.filter(
        (n) => n.includes("b71ctlcallee") && n.includes("passes too"),
      ),
      "an arity diagnostic fired against a call supplying exactly the callee's 2 " +
        "declared params",
    ).toEqual([]);
  });

  it("theta/parse/invoke-arity-too-few: a call omitting a defaulted param registers", () => {
    // `<required>` counts non-defaulted `params:` fields, not fields; a
    // defaulted tail param makes the 1-argument call legal. Green in both
    // directions.
    expect(
      outcome.registered,
      "the caller omitting its callee's defaulted tail param must still register. " +
        "Registered: " + JSON.stringify(outcome.registered),
    ).toContain("b71def");
    expect(
      outcome.notifications.filter(
        (n) => n.includes("b71defcallee") && n.includes("passes too"),
      ),
      "an arity diagnostic fired against a call supplying every non-defaulted param " +
        "of its callee",
    ).toEqual([]);
  });
});

// ===========================================================================
// Bug 0072 — the two static tool-argument TYPE rules at production load time.
// `checkToolCallArguments` (`src/runtime/tool-call.ts`) implements both and has
// no `src/` caller, so `theta/parse/tool-arg-schema-conflict` and
// `theta/parse/tool-arg-type-mismatch` cannot fire against any input:
// `read({ path: 123 })` and `typedcallee(123)` against `params: x: string` both
// load clean (docs/bugs/0072-tool-arg-checks-dead-and-no-runtime-net.md
// §Reproduction rows `disjoint` and `calleemismatch`).
//
// Spec: `docs/spec_topics/tool-calls.md` §"Provable-disjointness check (parse
// time)" — the parser emits an error "when, and only when, a field-value
// expression's static type is provably disjoint from the tool's registered
// input-schema type for that field"; same page on the `.theta`-callable arm —
// "an argument that does not type-check against the callee's `params:` surfaces
// as `theta/parse/tool-arg-type-mismatch` when the callee is statically
// resolvable".
//
// Each rejected form is paired with a control that MUST keep registering, so the
// cells pin the rules to the violation rather than to the call form: an
// unprovable field type (a `let`-bound identifier), an intersecting field type,
// an unknown field name (deliberately outside the parse arm's reach — the
// runtime AJV net's case, pinned in
// `tests/tool-arg-runtime-schema-validation.test.ts`), a matching-type
// `.theta`-callable call, and the arity-before-type ordering.
//
// The full parse-half matrix — the arity code, the `bare-object-literal`
// re-scope and their exact ranges — lives in
// `tests/tool-arg-parse-checks.test.ts`.
// ===========================================================================
describe("bug 0072 — theta/parse/tool-arg-schema-conflict at production load time", () => {
  it("theta/parse/tool-arg-schema-conflict: an integer literal in a string schema field un-registers the theta", () => {
    expect(
      outcome.registered,
      "the RFC-0002 provable-disjointness check has never run in production: the theta " +
        "passing an integer to `read`'s string `path` field was registered anyway, so the " +
        "wrong-typed argument is handed to the host tool. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("b72disjoint");
  });

  it("theta/parse/tool-arg-schema-conflict: the load path surfaces the registry rejection message", () => {
    expect(
      outcome.notifications,
      "no theta/parse/tool-arg-schema-conflict diagnostic surfaced. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(MSG.toolArgSchemaConflictPath);
  });

  it("theta/parse/tool-arg-schema-conflict: a non-first field is checked against ITS OWN schema type", () => {
    expect(
      outcome.registered,
      "the theta passing a string to `read`'s numeric `offset` field was registered " +
        "anyway. Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("b72offset");
    expect(
      outcome.notifications,
      "the disjointness diagnostic must name the offending field and its own schema " +
        "type, not the first field's. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(MSG.toolArgSchemaConflictOffset);
  });

  it("theta/parse/tool-arg-schema-conflict: an UNPROVABLE field type still registers (the check never front-runs an AJV accept)", () => {
    // A `let`-bound identifier's static type is a nominal self-reference, which
    // reduces to no subset kind set, so disjointness is not provable and the
    // value defers to the runtime AJV net. Green today (nothing checks) and
    // after the fix (nothing is provable) — the soundness pin.
    expect(
      outcome.registered,
      "a field value whose static type is not provably disjoint must keep registering. " +
        "Registered: " + JSON.stringify(outcome.registered),
    ).toContain("b72unprov");
  });

  it("theta/parse/tool-arg-schema-conflict: an INTERSECTING field type still registers", () => {
    expect(
      outcome.registered,
      "a string literal in `read`'s string `path` field must keep registering. " +
        "Registered: " + JSON.stringify(outcome.registered),
    ).toContain("b72inter");
  });

  it("theta/parse/tool-arg-schema-conflict: an UNKNOWN FIELD NAME is out of the parse arm's reach and still registers", () => {
    // The row's Trigger is "provably disjoint from the tool's registered
    // input-schema type FOR THAT FIELD"; an absent field has no schema type, so
    // the parse arm cannot reach it. `read({ nosuchfield: "a" })` is discharged
    // by the runtime input-schema check instead (`read`'s `required: ["path"]`),
    // witnessed in tests/tool-arg-runtime-schema-validation.test.ts cell E2.
    expect(
      outcome.registered,
      "the parse arm must not widen to unknown field names. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("b72unknownfield");
  });
});

describe("bug 0072 — theta/parse/tool-arg-type-mismatch at production load time", () => {
  it("theta/parse/tool-arg-type-mismatch: an integer argument at a `params: x: string` callee un-registers the caller", () => {
    expect(
      outcome.registered,
      "the `.theta`-callable argument type check has no emitter: the caller passing an " +
        "integer to a string-typed `params:` field was registered anyway. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("b72callmismatch");
  });

  it("theta/parse/tool-arg-type-mismatch: the load path surfaces the registry rejection message", () => {
    expect(
      outcome.notifications,
      "no theta/parse/tool-arg-type-mismatch diagnostic surfaced for the statically " +
        "resolvable `.theta` callee. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(MSG.toolArgTypeMismatch);
  });

  it("theta/parse/tool-arg-type-mismatch: a MATCHING-type argument registers", () => {
    // Green today (nothing checks) and after the fix (the types match): the
    // control proves the check rejects the mismatch, not every `.theta`-callable
    // call with an argument.
    expect(
      outcome.registered,
      "the type-conforming `.theta`-callable caller must still register. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("b72callok");
    expect(
      outcome.notifications.filter(
        (n) => n.includes("b72okcallee") && n.includes("type mismatch"),
      ),
      "a type-mismatch diagnostic fired against a call whose argument type matches its " +
        "callee's declared `params:` field",
    ).toEqual([]);
  });

  it("theta/parse/tool-arg-type-mismatch: ARITY IS CHECKED FIRST — a wrong-arity call draws the arity code alone", () => {
    // invocation.md §"Argument arity": arity before type. `b72aritycallee(123,
    // 456)` violates both (one `params:` field, two arguments; and the argument
    // in the corresponding slot is an integer against `x: string`), so the type
    // check must stand down once arity has reported. Green today (the 0071 arity
    // check ships; no type check exists) and green after — it reds if the fix
    // stacks a type mismatch on an already-failed arity site.
    expect(
      outcome.registered,
      "the wrong-arity caller must be un-registered by the arity check. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("b72callarity");
    expect(
      outcome.notifications,
      "the arity rejection must still surface. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(MSG.b72CallableArityTooMany);
    expect(
      outcome.notifications.filter(
        (n) => n.includes("b72aritycallee") && n.includes("type mismatch"),
      ),
      "a type-mismatch diagnostic was stacked on a call site the arity check already " +
        "rejected, breaking the arity-before-type ordering",
    ).toEqual([]);
  });
});

// ===========================================================================
// Bug 0072 — an UNRESOLVABLE SIBLING ARM withholds an expression from both
// static type rules, because each judges it by the SET of types it can evaluate
// to (`collectProvableArgTypes`, `src/extension/invoke-static-checks.ts`) and an
// unresolvable arm leaves that set unknown.
//
// `StaticTypeInferencePass.#commonType` (`src/parser/static-type-inference.ts`)
// picks the first candidate every sibling is `compatible` OR `unknown` against,
// so a statically unresolvable arm is ERASED rather than widening the composite
// to a union the schema subset cannot represent. Rendering that reduced type as
// the field's static type rejects a value the runtime AJV check accepts, which
// `docs/spec_topics/tool-calls.md` §"Provable-disjointness check (parse time)"
// forbids outright: the parser emits the error "when, and only when, a
// field-value expression's static type is provably disjoint …", and "The check
// therefore never rejects a program the runtime AJV check would accept; a
// merely-suspicious or narrowing mismatch is not a parse error". On the
// `.theta`-callable arm the same erasure defeats bug 0072 §Fix's rule that only
// an explicit incompatibility is a mismatch while `unknown` defers to the
// runtime net. The sibling group below covers the reduction's OTHER
// arm-dropping path — mutually incompatible arms, no `unknown` involved.
//
// The erasure is ORDER-DEPENDENT — only the arm order that offers the
// resolvable candidate first collapses — so both orders are pinned. Each cell's
// observable is REGISTRATION: an error-severity diagnostic un-registers exactly
// its own theta, and `ctx.ui.notify` carries no caller attribution.
// ===========================================================================
describe("bug 0072 — the static type checks never front-run a runtime AJV accept", () => {
  it("a ternary with an unresolvable arm keeps registering (arm order: literal FIRST)", () => {
    // `read({ path: flag ? 1 : p })` for a `let`-bound string `p`. The runtime
    // value is `"legit"`, which `read`'s `path: { type: "string" }` accepts, so
    // rejecting this theta at parse breaks the soundness rule quoted above. This
    // is the order the erasure collapses: candidate `integer` survives because
    // `p`'s nominal type answers `unknown` rather than blocking it.
    expect(
      outcome.registered,
      "the disjointness check rejected a field whose composite static type was " +
        "reduced by ERASING a statically unresolvable arm — the runtime value is a " +
        "string `read` accepts. Registered: " + JSON.stringify(outcome.registered),
    ).toContain("b72ternfwd");
  });

  it("a ternary with an unresolvable arm keeps registering (arm order: literal SECOND)", () => {
    // The mirror of the cell above (`flag ? p : 1`). Green even without the
    // gate, because `#commonType` settles on `p`'s nominal type first and
    // nothing is provable from it — which is exactly why the pair is needed: a
    // single-order cell cannot witness the erasure at all.
    expect(
      outcome.registered,
      "a field value whose static type is not provably disjoint must keep " +
        "registering, in either arm order. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("b72ternrev");
  });

  it("a ternary whose BOTH arms are provably-disjoint literals still FIRES — the gate is not a blanket disable", () => {
    // `read({ path: flag ? 1 : 2 })`: unknown-free, so the reduction to
    // `integer` is real and every runtime value the expression can take is one
    // AJV rejects. The gate must withhold only composites that absorbed an
    // unresolvable operand.
    expect(
      outcome.registered,
      "the gate suppressed a genuinely provable disjointness: both ternary arms " +
        "are integer literals, so no runtime value of this field can satisfy " +
        "`path: string`. Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("b72ternlit");
  });

  it("a `match` whose arm bodies are provably-disjoint literals FIRES — the gate recurses into arm bodies, not the scrutinee", () => {
    // `read({ path: match flag { true => 1, false => 2 } })`. The `match`
    // sibling of the cell above, and the only `match` shape that reaches this
    // layer: the mixed shape `match flag { true => 1, false => p }` is
    // un-registered at PARSE by `theta/parse/match-arm-type-mismatch` (the
    // pre-existing V20c arm-body check, probed in both operand orders), so the
    // compose pass never runs for it and no cell here can witness the gate's
    // `match` arm in the unresolvable-arm direction. The unresolvable-arm
    // direction of the gate's recursion is witnessed on the `ternary` and the
    // `.theta`-callable cells instead.
    expect(
      outcome.registered,
      "the disjointness check did not reach a `match` whose arm bodies are both " +
        "integer literals against `path: string`. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("b72matchlit");
  });

  it("theta/parse/tool-arg-type-mismatch: an argument with an unresolvable ternary arm keeps registering", () => {
    // `b72gatecallee(flag ? 1 : p)` against `params: x: string`. The
    // `.theta`-callable arm reads its `actual` through the same reduction, so
    // the same erasure would report `integer` for an expression whose runtime
    // value is `"legit"` — the callee's own AJV load is the net for it.
    expect(
      outcome.registered,
      "the `.theta`-callable type check reported a mismatch from a type reduced " +
        "over an ERASED unresolvable arm; only an explicit incompatibility is a " +
        "mismatch and `unknown` defers to the runtime net. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("b72callgate");
  });

  it("theta/parse/tool-arg-type-mismatch: an argument whose BOTH ternary arms are integer literals still FIRES", () => {
    // `b72litcallee(flag ? 1 : 2)` against `params: x: string` — the FIRE
    // direction of the gate on the `.theta`-callable arm, attributable by its
    // own callee name.
    expect(
      outcome.registered,
      "the gate suppressed a real `.theta`-callable mismatch: both ternary arms " +
        "are integer literals against a string-typed `params:` field. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("b72calllit");
    expect(
      outcome.notifications,
      "the type-mismatch rejection must still surface, naming this cell's own " +
        "callee. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(MSG.toolArgTypeMismatchGate);
  });
});

// ===========================================================================
// Bug 0072 — MUTUALLY INCOMPATIBLE sibling arms: the second way
// `StaticTypeInferencePass.#commonType` (`src/parser/static-type-inference.ts`)
// drops an arm. When no candidate narrows the rest, the reduction returns
// `candidates[0]` and every other arm is gone — with no `unknown` anywhere in
// the reduction, so nothing about the operands' resolvability can withhold it.
// `flag ? 1 : "a"` therefore renders as `integer`, and a check that trusts that
// rendering un-registers a theta whose runtime value (`flag = false`) is
// accepted by the very schema field / `params:` field the diagnostic names as
// disjoint.
//
// `docs/spec_topics/tool-calls.md` §"Provable-disjointness check (parse time)"
// admits the error "when, and only when, a field-value expression's static type
// is provably disjoint", because "a provable disjointness guarantees the runtime
// AJV check would reject the same value … The check therefore never rejects a
// program the runtime AJV check would accept"; the registry row
// (`theta/parse/tool-arg-schema-conflict`,
// `docs/spec_topics/diagnostics/code-registry-parse.md`) repeats the guarantee.
// On the `.theta`-callable arm the same drop defeats bug 0072 §Fix's rule that
// only an explicit incompatibility is a mismatch while `unknown` defers.
//
// `ternary` is the reachable carrier for the shape: the V20c parse layer rejects
// mutually incompatible `match` arm bodies
// (`theta/parse/match-arm-type-mismatch`), array elements
// (`theta/parse/array-no-common-type`) and mixed `+` / ordering operands, and
// those rejections drop the theta at parse — but it has no common-type check
// over ternary branches, so a ternary argument reaches this compose pass intact.
//
// Both checks therefore reason over `collectProvableArgTypes`
// (`src/extension/invoke-static-checks.ts`) — the SET of types the expression can
// evaluate to — rather than over the single type the reduction narrows a
// composite to.
// ===========================================================================
describe("bug 0072 — mutually incompatible sibling arms are not reduced away", () => {
  it("a ternary field value with incompatible arms keeps registering (integer arm FIRST)", () => {
    // `read({ path: flag ? 1 : "a" })`. With `flag = false` the runtime value is
    // `"a"`, which `read`'s `path: { type: "string" }` accepts, so rejecting
    // this theta at parse front-runs an AJV ACCEPT. This is the order the
    // reduction collapses: `integer` is `candidates[0]` and the string arm is
    // dropped.
    expect(
      outcome.registered,
      "the disjointness check rejected a field whose composite static type was " +
        "reduced by DROPPING a mutually incompatible sibling arm — the runtime " +
        "value is a string `read` accepts. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("b72mixpath");
  });

  it("a ternary field value with incompatible arms keeps registering (string arm FIRST)", () => {
    // `read({ path: flag ? "a" : 1 })`: the mirror order, where the surviving
    // candidate is the string one and the field appears to type-check. Green in
    // either direction, so the pair proves the verdict does not depend on which
    // arm the reduction happened to keep.
    expect(
      outcome.registered,
      "a field value whose arms include one the schema accepts must keep " +
        "registering, in either arm order. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("b72mixpathrev");
  });

  it("the same vector at a NUMERIC field keeps registering, in both arm orders", () => {
    // `read({ path: "a", offset: flag ? 1 : "b" })` and its mirror. `offset` is
    // registered as `number`, so here it is the STRING arm the reduction drops
    // when the integer arm leads: no operand order is safe, and a fix that only
    // handled a leading-integer arm at a string field would leave this open.
    // With `flag = false` the values are `"b"` and `1`, each accepted by
    // `offset: { type: "number" }` in exactly one of the two cells.
    expect(
      outcome.registered,
      "the disjointness check rejected a numeric field whose composite type was " +
        "reduced by DROPPING an arm. Registered: " + JSON.stringify(outcome.registered),
    ).toContain("b72mixoff");
    expect(
      outcome.registered,
      "the reverse arm order at the numeric field must also keep registering. " +
        "Registered: " + JSON.stringify(outcome.registered),
    ).toContain("b72mixoffrev");
  });

  it("an all-integer-arm ternary still FIRES, and `<actual>` renders ONE arm's type", () => {
    // `b72pinread({ path: flag ? 1 : 2 })` — `read` under an `as` rename so the
    // message's `<name>` attributes it to this cell alone. Every value the field
    // can take is an integer, which `path: { type: "string" }` rejects, so the
    // front-run is certain and must survive. The message pins the DEDUPLICATED
    // rendering: two integer arms read `integer`, not `integer | integer`, so
    // the composite renders exactly as a single integer literal does and no
    // pinned message moves.
    expect(
      outcome.registered,
      "a genuinely provable disjointness was suppressed: both ternary arms are " +
        "integer literals against `path: string`. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("b72litpin");
    expect(
      outcome.notifications,
      "the `<actual>` placeholder must render the collected arm types " +
        "deduplicated — `integer`, not `integer | integer`. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(MSG.toolArgSchemaConflictTernDedup);
  });

  it("a ternary whose DISTINCT arms all miss the schema kind FIRES, rendering the union", () => {
    // `b72boolgrep({ pattern: "a", ignoreCase: flag ? 1 : "a" })` — `grep` under
    // an `as` rename. `ignoreCase` is registered as `boolean`, which neither an
    // integer nor a string satisfies, so BOTH arms are certain AJV rejections
    // and the front-run is sound whichever arm runs. `<actual>` renders the
    // whole collected set, `" | "`-joined in source order — the top-level-union
    // spelling the disjointness reduction splits back into kinds.
    expect(
      outcome.registered,
      "a field whose EVERY arm is a certain AJV rejection must still be caught. " +
        "Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("b72unionfire");
    expect(
      outcome.notifications,
      "the `<actual>` placeholder must render the union of the collected arm " +
        "types. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(MSG.toolArgSchemaConflictUnion);
  });

  it("theta/parse/tool-arg-type-mismatch: a mixed-arm ternary argument keeps registering", () => {
    // `b72mixcallee(flag ? 1 : "a")` against `params: x: string`. The string arm
    // type-checks, so a runtime value may well satisfy the callee's `params:`
    // and the site defers to the callee's own AJV load: a mismatch requires
    // EVERY value the argument can take to be explicitly incompatible.
    expect(
      outcome.registered,
      "the `.theta`-callable type check reported a mismatch from a type reduced " +
        "by DROPPING a compatible sibling arm. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("b72mixcall");
  });

  it("theta/parse/tool-arg-type-mismatch: an all-integer-arm ternary at the SAME callee still FIRES", () => {
    // `b72mixcallee(flag ? 1 : 2)` — the FIRE direction at the callee the cell
    // above defers on, so one callee name witnesses both directions of the
    // every-arm-incompatible rule.
    expect(
      outcome.registered,
      "the every-arm-incompatible rule suppressed a real mismatch: both ternary " +
        "arms are integer literals against a string-typed `params:` field. " +
        "Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("b72mixcalllit");
    expect(
      outcome.notifications,
      "the type-mismatch rejection must still surface at the shared callee. " +
        "Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(MSG.toolArgTypeMismatchMixed);
  });
});

// ===========================================================================
// Bug 0072 — the `.theta`-callable type check resolves the callee's `params:`
// annotation in the CALLEE's namespace, never in the caller's.
//
// `annotationToCompatType` (`src/parser/type-layer-checks.ts`) maps every
// non-primitive annotation to a `named` reference, so the check's EXPECTED side
// is a bare name lifted out of the callee's file. Resolving it against the
// caller's own `schema` declarations lets a caller-local homonym decide a
// verdict about a contract the caller does not own, and makes the verdict a
// function of the caller's declarations rather than of the callee's `params:`.
//
// `docs/spec_topics/tool-calls.md` §"Argument shape" puts the judgement in the
// callee's namespace — the mismatch is "against the callee's `params:`" — and
// the check front-runs "the runtime AJV check", which resolves that same
// annotation through the CALLEE's own body declarations (`lowerTypeExpr` over
// `bodyTypeMap`, `src/parser/params.ts`) when it lowers `params:` to the schema
// the marshalled arguments are validated against. A `tools:` `.theta` entry is
// subagent-mode only (`theta/load/prompt-mode-callable`), so every such call
// marshals through the child and meets that lowered schema.
//
// Runtime counterfactual for the divergent-homonym pair: `b72homcallee`
// declares `schema B72Conf = integer` and `params: x: B72Conf`, so the child
// validates `{ x: 1 }` against a lowered integer schema and ACCEPTS it. A parse
// rejection driven by the CALLER's `schema B72Conf = string` would reject a
// program the runtime accepts, which the same page forbids outright ("The check
// therefore never rejects a program the runtime AJV check would accept").
//
// Every callee in this group carries a non-primitive `params:` type, so none is
// binder-bypass-eligible and none registers in this model-registry-less
// workspace (`theta/load/binder-model-unresolved`). The observable throughout is
// the CALLER's registration; a callee's own binder-model outcome does not gate
// it.
// ===========================================================================
describe("bug 0072 — the callee's `params:` type resolves in the callee's namespace", () => {
  it("a caller-local homonym of the callee's `params:` type does not un-register the caller", () => {
    // `b72homcaller` declares `schema B72Conf = string` and calls
    // `b72homcallee(1)`, whose `params: x: B72Conf` is `integer` in the
    // callee's own file. Resolving the expected side through the caller's
    // declarations reads the argument as `integer` against `string` and
    // un-registers a caller whose call the runtime accepts.
    expect(
      outcome.registered,
      "the caller was un-registered by a type mismatch computed against ITS OWN " +
        "declaration of the callee's `params:` type name — the callee declares " +
        "that name as `integer` and accepts the integer argument. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("b72homcaller");
    expect(
      outcome.notifications.filter(
        (n) => n.includes("b72homcallee") && n.includes("type mismatch"),
      ),
      "a type-mismatch diagnostic named a callee whose `params:` field type is " +
        "unresolvable from the callee's annotation alone",
    ).toEqual([]);
  });

  it("the identical call from a caller with NO homonym also registers", () => {
    // The controlled comparison: same callee, same argument, no local
    // `B72Conf`. A verdict that differs from the cell above is a verdict about
    // the caller's declarations rather than about the callee's `params:`.
    expect(
      outcome.registered,
      "the no-homonym sibling of the divergent-homonym caller must register — " +
        "an unresolvable expected type defers to the callee's own runtime " +
        "validation. Registered: " + JSON.stringify(outcome.registered),
    ).toContain("b72homplain");
  });

  it("a caller-local homonym that would ACCEPT what the callee rejects also defers", () => {
    // `b72revcaller` declares `schema B72Rev = integer` and calls
    // `b72revcallee(1)`, whose `params: x: B72Rev` is `string` in the callee's
    // own file — so here the caller's homonym would silence a rejection the
    // callee's runtime validation will make. The check has no standing either
    // way, and registering is the correct disposition: this surface reports
    // only an explicit incompatibility of the CALLEE's contract, and the
    // callee's own load owns the rest.
    expect(
      outcome.registered,
      "the reverse-divergence caller must register. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("b72revcaller");
    expect(
      outcome.notifications.filter(
        (n) => n.includes("b72revcallee") && n.includes("type mismatch"),
      ),
      "a type-mismatch diagnostic fired at a callee whose `params:` field type " +
        "the check cannot resolve",
    ).toEqual([]);
  });

  it("an expected type MENTIONING an unresolvable name still fires when its structure decides", () => {
    // `b72arrcallee(1)` against `params: x: array<B72Arr>`. The name is
    // unresolvable to this check, but no integer is an array whatever `B72Arr`
    // denotes, so the disjointness is certain and the callee's runtime
    // validation would reject the same value. The FIRE direction pins that the
    // expected side is EMPTIED of caller declarations rather than withheld
    // whenever it mentions a name.
    expect(
      outcome.registered,
      "a structurally-certain mismatch was suppressed because the callee's " +
        "`params:` annotation mentions a name. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("b72arrcaller");
    expect(
      outcome.notifications,
      "the type-mismatch rejection must still surface, rendering the callee's " +
        "verbatim `params:` type source. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(MSG.toolArgTypeMismatchArrayNamed);
  });
});
