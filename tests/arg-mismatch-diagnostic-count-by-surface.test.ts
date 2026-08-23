import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { ThetaFixture } from "../src/extension/factory";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";

// Bug 0147 — INTRA-SITE MULTIPLICITY for the argument-type-mismatch family.
//
// THE ADJUDICATED RULING (bug 0147 §Fix, Route C in its per-row form — "A
// paragraph that assigns multiplicity per row, naming the invoke and `fn` rows
// per-slot and the two `checkToolCallArguments` rows first-only, closes the gap
// with no code change and makes each surface's behaviour testable"). Written
// into `docs/spec_topics/diagnostics/diagnostic-shape.md` as the multiplicity
// paragraph beside *Multi-error reporting* and *Re-scan deduplication*; this
// file is the behavioural lock on what that paragraph names:
//
//   PER-SLOT  `theta/parse/invoke-arg-type-mismatch` and
//             `theta/parse/fn-arg-type-mismatch` (its same-file arm AND its
//             imported-`.thetalib` arm alike) — at a statically resolvable
//             callee that passes arity, ONE diagnostic per provably mistyped
//             judged slot, in source order, no dedup.
//   PER-SITE  `theta/parse/tool-arg-type-mismatch` — at most ONE diagnostic per
//             call site, at the FIRST provably mistyped judged slot.
//   ARITY FIRST on all four surfaces (invocation.md §"Argument arity"): a
//             wrong-arity site draws its arity row alone and ZERO type rows.
//
// Out of scope of the ruling and of this file: the Pi-tool field-level row
// `theta/parse/tool-arg-schema-conflict` (bug 0147 §Non-goals — it needs a host
// exposing registered Pi tools with input schemas, which this offline
// composition-root harness does not provide). No cell below asserts on it.
//
// THE FOUR SURFACES, and the loop in each whose shape this file pins (every
// citation re-derived against the tree at the time of writing):
//   S1 `invoke("./callee.theta", …)` literal — `checkInvokeArgTypes`, the
//      per-slot loop `src/parser/invoke-diagnostics.ts:266–291`, no `break`.
//   S2 same-file `fn` call — `checkFnCallArgs`, the per-slot loop
//      `src/parser/type-layer-checks.ts:2600–2651`, no `break`.
//   S3 `.theta`-callable call — the per-slot loop in
//      `src/extension/invoke-static-checks.ts`, whose `break;` at `:1149`
//      ("First mismatch only: this row's *Message* names neither the slot
//      index nor the parameter …", `:1142–1148`) is the per-site cap.
//   S4 imported-`.thetalib` `fn` call — `checkImportedFnCallArgs`, the per-slot
//      loop `src/extension/invoke-static-checks.ts:1393–1444`, no `break`. This
//      arm is the second half of `theta/parse/fn-arg-type-mismatch`'s own
//      *Trigger* (`docs/spec_topics/diagnostics/code-registry-parse.md`, the
//      `theta/parse/fn-arg-type-mismatch` row: "The same-file half is judged at
//      PARSE time … The imported `.thetalib` half is judged at the LOAD pass"),
//      so the ruling's per-slot assignment has to hold on both of its arms.
//
// THE MEASURED CHANNEL. One load of ONE planted `.pi/theta/` discovery
// workspace through the shipped composition root `discoverAndComposeFixtures`
// (`src/extension/production-composition.ts`), with the fake `pi` / `ctx` shape
// `tests/invoke-arg-type-mismatch-wired.test.ts:443` establishes and `hasUI`
// ABSENT, so `makeLoadEmit`'s per-diagnostic stderr mirror
// (`src/extension/production-composition.ts:216–238`, the no-UI write at
// `:233–235`) is live. That mirror is the only channel carrying the EMITTING
// FILE, and neither the invoke row's *Message* nor the callable row's names the
// caller, so it is the only channel on which a COUNT can be attributed to one
// caller. Every caller below therefore gets its own callee stem / `fn` name, and
// every count assertion is an EXACT ordered comparison of that caller's rendered
// messages — never a `toBeGreaterThan`, never a contains over an unbounded list.
//
// DIAG-4 (`docs/spec_topics/diagnostics/diagnostic-shape.md`): every expected
// string is read from the diagnostic registry's *Message* column through
// `registryMessage` and interpolated. No message prose is written out here; a
// missing row or a reshaped template throws naming the registry page.
//
// REGISTRATION IS COUNT-INDEPENDENT and is asserted anyway, because it is what
// proves each mistyped caller was actually judged: every row here is `E` and
// `hasLoadParseError` (`src/extension/production-composition.ts:2360–2367`)
// needs one `E` to deny registration, so every mistyped caller must be absent
// from the returned fixture list and every well-typed control must be present.
//
// TIER — unit, offline, provider-free, deterministic. Every observable settles
// inside one `discoverAndComposeFixtures` pass over a temp directory: no
// provider, no model, no child process, no network. An integration tier would
// add a discovery round trip to a decision this load pass has already made, and
// bug 0147 §Fix states it outright: "No live tier applies: every observable
// settles inside one load pass."
//
// NO SILENT SKIPPING (CLAUDE.md): nothing here early-returns or skips. A missing
// registry row, a suffix-ambiguous planted stem, a workspace that did not load,
// and a surface whose row never fired at all each FAIL LOUDLY naming the unmet
// precondition — see `assertSurfaceLive`, the per-surface positive control every
// absence-shaped cell (the two arity cells) runs first.

// ===========================================================================
// DIAG-4 — the registry oracle.
// ===========================================================================

/** S1's row — per-slot under the ruling. */
const INVOKE_ARG_CODE = "theta/parse/invoke-arg-type-mismatch";
/** S3's row — per-site under the ruling. */
const TOOL_ARG_CODE = "theta/parse/tool-arg-type-mismatch";
/** S2's and S4's row — per-slot under the ruling, on both of its arms. */
const FN_ARG_CODE = "theta/parse/fn-arg-type-mismatch";
/** The arity rows of S1 / S3. */
const INVOKE_ARITY_TOO_FEW = "theta/parse/invoke-arity-too-few";
const INVOKE_ARITY_TOO_MANY = "theta/parse/invoke-arity-too-many";
/** The arity rows of S2 / S4. */
const FN_ARITY_TOO_FEW = "theta/parse/fn-arity-too-few";
const FN_ARITY_TOO_MANY = "theta/parse/fn-arity-too-many";

/** The registry page carrying all seven rows — the DIAG-4 oracle. */
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];

/**
 * A registered code's normative *Message* template, or a throw naming the
 * registry page: a missing row is a harness failure, never a skip, because
 * every expected string below is derived from it.
 */
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: no *Message* row for ${code} in ${REGISTRY_PAGE} — the DIAG-4 ` +
        "column is this file's only source for the expected strings",
    );
  }
  return template;
}

/**
 * Interpolate a template's `<…>` placeholders in ONE pass, so a substituted
 * value is never re-scanned: `<actual>` legitimately expands to text carrying
 * angle brackets (`array<string>`). An unsupplied placeholder and an unused
 * substitution both throw, so a reshaped registry row fails loudly here rather
 * than producing a string no emission can equal.
 */
function fill(code: string, subs: ReadonlyMap<string, string>): string {
  const used = new Set<string>();
  const message = registered(code).replace(/<[a-z]+>/g, (token) => {
    const value = subs.get(token);
    if (value === undefined) {
      throw new Error(
        `harness: the ${code} *Message* carries ${token}, which this file supplies no ` +
          "substitution for — the registry row changed shape",
      );
    }
    used.add(token);
    return value;
  });
  for (const token of subs.keys()) {
    if (!used.has(token)) {
      throw new Error(
        `harness: this file substitutes ${token} into the ${code} *Message*, which no ` +
          "longer carries it — the registry row changed shape",
      );
    }
  }
  return message;
}

/** `invoke argument <i> ('<param>') type mismatch: expected <expected>, got <actual>`. */
function invokeArgMessage(
  slot: number,
  paramName: string,
  expected: string,
  actual: string,
): string {
  return fill(
    INVOKE_ARG_CODE,
    new Map([
      ["<i>", String(slot)],
      ["<param>", paramName],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `tool '<name>' argument type mismatch: expected <expected>, got <actual>`. */
function toolArgMessage(name: string, expected: string, actual: string): string {
  return fill(
    TOOL_ARG_CODE,
    new Map([
      ["<name>", name],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `fn '<name>' argument <i> ('<param>') type mismatch: expected <expected>, got <actual>`. */
function fnArgMessage(
  name: string,
  slot: number,
  paramName: string,
  expected: string,
  actual: string,
): string {
  return fill(
    FN_ARG_CODE,
    new Map([
      ["<name>", name],
      ["<i>", String(slot)],
      ["<param>", paramName],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `invoke '<callee>' passes too few arguments: expected <required> non-defaulted, got <provided>`. */
function invokeTooFew(callee: string, required: number, provided: number): string {
  return fill(
    INVOKE_ARITY_TOO_FEW,
    new Map([
      ["<callee>", callee],
      ["<required>", String(required)],
      ["<provided>", String(provided)],
    ]),
  );
}

/** `invoke '<callee>' passes too many arguments: expected at most <max>, got <provided>`. */
function invokeTooMany(callee: string, max: number, provided: number): string {
  return fill(
    INVOKE_ARITY_TOO_MANY,
    new Map([
      ["<callee>", callee],
      ["<max>", String(max)],
      ["<provided>", String(provided)],
    ]),
  );
}

/** `fn '<name>' passes too few arguments: expected <required>, got <provided>`. */
function fnTooFew(name: string, required: number, provided: number): string {
  return fill(
    FN_ARITY_TOO_FEW,
    new Map([
      ["<name>", name],
      ["<required>", String(required)],
      ["<provided>", String(provided)],
    ]),
  );
}

/** `fn '<name>' passes too many arguments: expected <required>, got <provided>`. */
function fnTooMany(name: string, required: number, provided: number): string {
  return fill(
    FN_ARITY_TOO_MANY,
    new Map([
      ["<name>", name],
      ["<required>", String(required)],
      ["<provided>", String(provided)],
    ]),
  );
}

// ===========================================================================
// The cell grid — ten shapes × four surfaces, declared as DATA so the expected
// message sequence of each cell is derived from THE RULING (per-slot for S1 /
// S2 / S4, first-slot-only for S3, arity alone at a wrong-arity site) and not
// from whatever the loops happen to do.
// ===========================================================================

/** One provably mistyped judged slot: `<i>`, `<param>`, and the rendered `<actual>`. */
interface Mistype {
  readonly slot: number;
  readonly param: string;
  readonly actual: string;
}

/** A wrong-arity shape: no type row is licensed at all, only the arity row. */
interface ArityShape {
  readonly direction: "too-many" | "too-few";
  readonly declared: number;
  readonly provided: number;
}

interface Cell {
  /** Stem-forming key; also the `describe` label. */
  readonly key: string;
  /** Prose the failure messages quote. */
  readonly label: string;
  /** Declared param / parameter count of every callee this cell plants. */
  readonly params: number;
  /** The argument list source text, one entry per call site in the caller. */
  readonly sites: readonly string[];
  /** Provably mistyped judged slots per site, in source order. */
  readonly mistypes: readonly (readonly Mistype[])[];
  /** Set when the cell is a wrong-arity cell; then `mistypes` must be empty. */
  readonly arity?: ArityShape;
  /** Exact expected diagnostic count per surface, from the ruling. */
  readonly counts: { readonly S1: number; readonly S2: number; readonly S3: number; readonly S4: number };
}

const INT: (slot: number, param: string) => Mistype = (slot, param) => ({
  slot,
  param,
  actual: "integer",
});
const BOOL: (slot: number, param: string) => Mistype = (slot, param) => ({
  slot,
  param,
  actual: "boolean",
});

const CELLS: readonly Cell[] = [
  {
    key: "m2",
    label: "two mistyped slots at one site",
    params: 2,
    sites: ["1, true"],
    mistypes: [[INT(0, "x"), BOOL(1, "y")]],
    counts: { S1: 2, S2: 2, S3: 1, S4: 2 },
  },
  {
    key: "m3",
    label: "three mistyped slots at one site",
    params: 3,
    sites: ["1, true, 2"],
    mistypes: [[INT(0, "x"), BOOL(1, "y"), INT(2, "z")]],
    counts: { S1: 3, S2: 3, S3: 1, S4: 3 },
  },
  {
    // Control: slot 0 alone. Together with the two slot-1 controls it proves a
    // count of 1 on S3 is a FIRST-MISMATCH cap and not a dead check at slot 1.
    key: "c0",
    label: "control — slot 0 mistyped alone",
    params: 2,
    sites: ['1, "a"'],
    mistypes: [[INT(0, "x")]],
    counts: { S1: 1, S2: 1, S3: 1, S4: 1 },
  },
  {
    // Load-bearing control: slot 0 is WELL TYPED, so a surface that only ever
    // judged slot 0 would report nothing here. Every surface reports one.
    key: "c1b",
    label: "control — slot 1 mistyped alone (boolean)",
    params: 2,
    sites: ['"a", true'],
    mistypes: [[BOOL(1, "y")]],
    counts: { S1: 1, S2: 1, S3: 1, S4: 1 },
  },
  {
    // The same control at the same slot with the OTHER actual type: on S3 the
    // *Message* carries no `<i>` and no `<param>`, so `integer` at slot 1 is
    // what distinguishes "the loop reached slot 1" from "the loop re-reported
    // slot 0" — the two would render identically otherwise.
    key: "c1i",
    label: "control — slot 1 mistyped alone (integer)",
    params: 2,
    sites: ['"a", 1'],
    mistypes: [[INT(1, "y")]],
    counts: { S1: 1, S2: 1, S3: 1, S4: 1 },
  },
  {
    // The pass-level pin: the S3 cap is INTRA-SITE. Two sites × two mistypes
    // yields 2 on S3 and 4 on the three per-slot surfaces, so no surface
    // fast-fails the pass (`diagnostic-shape.md` §"Multi-error reporting").
    key: "two",
    label: "two call sites, two mistyped slots each",
    params: 2,
    sites: ["1, true", "1, true"],
    mistypes: [
      [INT(0, "x"), BOOL(1, "y")],
      [INT(0, "x"), BOOL(1, "y")],
    ],
    counts: { S1: 4, S2: 4, S3: 2, S4: 4 },
  },
  {
    key: "aover",
    label: "wrong arity, too many arguments, every matched slot also mistyped",
    params: 2,
    sites: ["1, true, 2"],
    mistypes: [[]],
    arity: { direction: "too-many", declared: 2, provided: 3 },
    counts: { S1: 1, S2: 1, S3: 1, S4: 1 },
  },
  {
    key: "aunder",
    label: "wrong arity, too few arguments, the provided slot also mistyped",
    params: 2,
    sites: ["1"],
    mistypes: [[]],
    arity: { direction: "too-few", declared: 2, provided: 1 },
    counts: { S1: 1, S2: 1, S3: 1, S4: 1 },
  },
  {
    // An `array` literal is judged by `collectProvableArgTypes`' exactness-tested
    // array arm (bug 0146's widening), so slot 0 here is a DECIDED mistype whose
    // `<actual>` renders `array<string>` — a second judged shape at slot 0, so
    // the multiplicity claim is not carried by primitive literals alone.
    key: "arrbool",
    label: "array literal at slot 0 and a boolean at slot 1",
    params: 2,
    sites: ['["a"], true'],
    mistypes: [[{ slot: 0, param: "x", actual: "array<string>" }, BOOL(1, "y")]],
    counts: { S1: 2, S2: 2, S3: 1, S4: 2 },
  },
  {
    // The per-surface well-typed control: zero diagnostics AND the caller
    // registers, which is what proves each surface admits a clean program from
    // this same load rather than being globally broken.
    key: "ok",
    label: "control — every argument well typed",
    params: 2,
    sites: ['"a", "b"'],
    mistypes: [[]],
    counts: { S1: 0, S2: 0, S3: 0, S4: 0 },
  },
];

/** `a`, `b`, … — the per-site suffix that keeps every callee / `fn` name distinct. */
const SITE_SUFFIX = ["a", "b", "c"] as const;

// ===========================================================================
// The planted discovery workspace.
// ===========================================================================

interface Planted {
  readonly stem: string;
  readonly ext: "theta" | "thetalib";
  readonly text: string;
}

const PLANTED: Planted[] = [];

function plant(stem: string, text: string, ext: "theta" | "thetalib" = "theta"): void {
  PLANTED.push({ stem, ext, text });
}

function lines(...parts: readonly string[]): string {
  return parts.join("\n") + "\n";
}

const PARAM_NAMES = ["x", "y", "z"] as const;

/** A `mode: subagent` callee declaring `n` `string` `params:` fields. */
function calleeTheta(n: number): string {
  return lines(
    "---",
    "mode: subagent",
    "params:",
    ...PARAM_NAMES.slice(0, n).map((name) => `  ${name}: string`),
    "---",
    "@`hi`",
  );
}

/** A `mode: subagent` caller with no `tools:` — S1, S2 and S4 all use this shell. */
function plainCaller(...body: readonly string[]): string {
  return lines("---", "mode: subagent", "---", ...body, "@`hi`");
}

/** A `mode: subagent` caller resolving `.theta` callables — the S3 shell. */
function callableCaller(entries: readonly string[], ...body: readonly string[]): string {
  return lines(
    "---",
    "mode: subagent",
    "tools:",
    ...entries.map((entry) => `  - ./${entry}.theta`),
    "---",
    ...body,
    "@`hi`",
  );
}

/** `fn <name>(x: string, …): string { x }` — the S2 declaration and the S4 library body. */
function fnSource(name: string, n: number): string {
  const params = PARAM_NAMES.slice(0, n)
    .map((param) => `${param}: string`)
    .join(", ");
  return `fn ${name}(${params}): string { x }`;
}

type SurfaceId = "S1" | "S2" | "S3" | "S4";

interface Surface {
  readonly id: SurfaceId;
  readonly label: string;
  /** The code its per-argument type row carries. */
  readonly typeCode: string;
  /** Caller stem for a cell. */
  readonly caller: (cellKey: string) => string;
  /** Plants the caller and everything it resolves against. */
  readonly plant: (cell: Cell) => void;
  /** The rendered type-mismatch message for one mistyped slot at one site. */
  readonly typeMessage: (cell: Cell, siteIndex: number, mistype: Mistype) => string;
  /** The rendered arity message for a wrong-arity cell. */
  readonly arityMessage: (cell: Cell, siteIndex: number, arity: ArityShape) => string;
  /** The code of that arity message. */
  readonly arityCode: (arity: ArityShape) => string;
  /**
   * The ruling's multiplicity for this surface: which of a site's mistyped
   * slots are reported. PER-SLOT surfaces report all; the PER-SITE surface
   * reports the first.
   */
  readonly reportedSlots: (mistypes: readonly Mistype[]) => readonly Mistype[];
}

const perSlot = (mistypes: readonly Mistype[]): readonly Mistype[] => mistypes;
const firstOnly = (mistypes: readonly Mistype[]): readonly Mistype[] =>
  mistypes.slice(0, 1);

/** S1 callee stem for cell `k`, site `i`. */
const s1Callee = (k: string, i: number): string => `k1${k}${SITE_SUFFIX[i]}`;
/** S2 / S4 `fn` name for cell `k`, site `i`. */
const s2Fn = (k: string, i: number): string => `g2${k}${SITE_SUFFIX[i]}`;
const s4Fn = (k: string, i: number): string => `g4${k}${SITE_SUFFIX[i]}`;
/** S3 callable (callee stem AND rendered `<name>`) for cell `k`, site `i`. */
const s3Callee = (k: string, i: number): string => `k3${k}${SITE_SUFFIX[i]}`;

const SURFACES: readonly Surface[] = [
  {
    id: "S1",
    label: "`invoke(\"./callee.theta\", …)` literal",
    typeCode: INVOKE_ARG_CODE,
    caller: (k) => `f1${k}`,
    plant: (cell) => {
      cell.sites.forEach((_, i) => plant(s1Callee(cell.key, i), calleeTheta(cell.params)));
      plant(
        `f1${cell.key}`,
        plainCaller(
          ...cell.sites.map(
            (args, i) => `invoke("./${s1Callee(cell.key, i)}.theta", ${args})?`,
          ),
        ),
      );
    },
    typeMessage: (_cell, _i, m) => invokeArgMessage(m.slot, m.param, "string", m.actual),
    arityMessage: (cell, i, arity) =>
      arity.direction === "too-many"
        ? invokeTooMany(`./${s1Callee(cell.key, i)}.theta`, arity.declared, arity.provided)
        : invokeTooFew(`./${s1Callee(cell.key, i)}.theta`, arity.declared, arity.provided),
    arityCode: (arity) =>
      arity.direction === "too-many" ? INVOKE_ARITY_TOO_MANY : INVOKE_ARITY_TOO_FEW,
    reportedSlots: perSlot,
  },
  {
    id: "S2",
    label: "same-file `fn` call",
    typeCode: FN_ARG_CODE,
    caller: (k) => `f2${k}`,
    plant: (cell) => {
      plant(
        `f2${cell.key}`,
        plainCaller(
          ...cell.sites.map((_, i) => fnSource(s2Fn(cell.key, i), cell.params)),
          ...cell.sites.map((args, i) => `let q${i} = ${s2Fn(cell.key, i)}(${args})`),
        ),
      );
    },
    typeMessage: (cell, i, m) =>
      fnArgMessage(s2Fn(cell.key, i), m.slot, m.param, "string", m.actual),
    arityMessage: (cell, i, arity) =>
      arity.direction === "too-many"
        ? fnTooMany(s2Fn(cell.key, i), arity.declared, arity.provided)
        : fnTooFew(s2Fn(cell.key, i), arity.declared, arity.provided),
    arityCode: (arity) =>
      arity.direction === "too-many" ? FN_ARITY_TOO_MANY : FN_ARITY_TOO_FEW,
    reportedSlots: perSlot,
  },
  {
    id: "S3",
    label: "`.theta`-callable call",
    typeCode: TOOL_ARG_CODE,
    caller: (k) => `f3${k}`,
    plant: (cell) => {
      cell.sites.forEach((_, i) => plant(s3Callee(cell.key, i), calleeTheta(cell.params)));
      plant(
        `f3${cell.key}`,
        callableCaller(
          cell.sites.map((_, i) => s3Callee(cell.key, i)),
          ...cell.sites.map((args, i) => `${s3Callee(cell.key, i)}(${args})?`),
        ),
      );
    },
    typeMessage: (cell, i, m) => toolArgMessage(s3Callee(cell.key, i), "string", m.actual),
    arityMessage: (cell, i, arity) =>
      arity.direction === "too-many"
        ? invokeTooMany(s3Callee(cell.key, i), arity.declared, arity.provided)
        : invokeTooFew(s3Callee(cell.key, i), arity.declared, arity.provided),
    arityCode: (arity) =>
      arity.direction === "too-many" ? INVOKE_ARITY_TOO_MANY : INVOKE_ARITY_TOO_FEW,
    reportedSlots: firstOnly,
  },
  {
    id: "S4",
    label: "imported-`.thetalib` `fn` call",
    typeCode: FN_ARG_CODE,
    caller: (k) => `f4${k}`,
    plant: (cell) => {
      plant(
        `l4${cell.key}`,
        cell.sites.map((_, i) => fnSource(s4Fn(cell.key, i), cell.params)).join("\n") + "\n",
        "thetalib",
      );
      plant(
        `f4${cell.key}`,
        plainCaller(
          `import { ${cell.sites.map((_, i) => s4Fn(cell.key, i)).join(", ")} } from ` +
            `"./l4${cell.key}.thetalib"`,
          ...cell.sites.map((args, i) => `let q${i} = ${s4Fn(cell.key, i)}(${args})`),
        ),
      );
    },
    typeMessage: (cell, i, m) =>
      fnArgMessage(s4Fn(cell.key, i), m.slot, m.param, "string", m.actual),
    arityMessage: (cell, i, arity) =>
      arity.direction === "too-many"
        ? fnTooMany(s4Fn(cell.key, i), arity.declared, arity.provided)
        : fnTooFew(s4Fn(cell.key, i), arity.declared, arity.provided),
    arityCode: (arity) =>
      arity.direction === "too-many" ? FN_ARITY_TOO_MANY : FN_ARITY_TOO_FEW,
    reportedSlots: perSlot,
  },
];

for (const cell of CELLS) {
  for (const surface of SURFACES) {
    surface.plant(cell);
  }
}

/** The full ordered message sequence the ruling licenses for one cell on one surface. */
function expectedMessages(surface: Surface, cell: Cell): readonly string[] {
  if (cell.arity !== undefined) {
    // Arity keeps precedence: the arity row alone, zero type rows.
    return cell.sites.map((_, i) =>
      surface.arityMessage(cell, i, cell.arity as ArityShape),
    );
  }
  return cell.mistypes.flatMap((siteMistypes, i) =>
    surface.reportedSlots(siteMistypes).map((m) => surface.typeMessage(cell, i, m)),
  );
}

/** The ordered diagnostic CODE sequence the ruling licenses for one cell on one surface. */
function expectedCodes(surface: Surface, cell: Cell): readonly string[] {
  if (cell.arity !== undefined) {
    return cell.sites.map(() => surface.arityCode(cell.arity as ArityShape));
  }
  return cell.mistypes.flatMap((siteMistypes) =>
    surface.reportedSlots(siteMistypes).map(() => surface.typeCode),
  );
}

// ===========================================================================
// The load, and the three channels it surfaces on.
// ===========================================================================

interface LoadOutcome {
  readonly registered: readonly string[];
  readonly notifications: readonly string[];
  /** `theta: <file>:<line>:<col>: <code>: <message>`, one per diagnostic. */
  readonly diagnosticLines: readonly string[];
}

let outcome: LoadOutcome;
let workspaceDir: string;

async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const chunks: string[] = [];
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

  // The stderr mirror is a real production channel (a `-p` / CI operator's only
  // sight of a load diagnostic) written directly rather than through an
  // injectable seam, so interposing on the handle is the only way to read it.
  // The window is one awaited call and the handle is restored on both outcomes,
  // so no assertion below runs while the interposition is live.
  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: unknown): boolean => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(
    pi,
    ctx,
  ).finally(() => {
    process.stderr.write = write;
  });

  return {
    registered: fixtures.map((f) => f.slashName),
    notifications,
    diagnosticLines: chunks
      .join("")
      .split(/\r?\n/)
      .filter((line) => line.length > 0),
  };
}

beforeAll(async () => {
  // No planted stem may be a suffix of another: the per-caller channel filter
  // matches `<separator><stem>.<ext>`, so a suffix pair would let one caller's
  // diagnostic satisfy or defeat another caller's exact-count assertion.
  const stems = PLANTED.map((p) => p.stem);
  const duplicates = stems.filter((stem, i) => stems.indexOf(stem) !== i);
  expect(
    duplicates,
    `harness: planted stems collide: ${JSON.stringify(duplicates)} — one cell's file ` +
      "would overwrite another's",
  ).toEqual([]);
  for (const stem of stems) {
    const shadowed = stems.filter((other) => other !== stem && other.endsWith(stem));
    expect(
      shadowed,
      `harness: planted stem '${stem}' is a suffix of ${JSON.stringify(shadowed)}, so ` +
        "per-caller diagnostic attribution below is ambiguous",
    ).toEqual([]);
  }

  workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0147-"));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const planted of PLANTED) {
    writeFileSync(
      join(projectThetaDir, `${planted.stem}.${planted.ext}`),
      planted.text,
      "utf8",
    );
  }
  // A minimal valid settings file pins the fixture's settings read to a known
  // value; an ABSENT settings file is silent, so this is hermeticity rather
  // than noise suppression.
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
  outcome = await runProductionLoad(workspaceDir);
  // The grid plants ~150 files (four surfaces × ten cells, each with its own
  // callees / library), and one composition-root pass parses and type-checks
  // every one of them, which exceeds vitest's 10 s default hook budget on a
  // cold transform. The explicit budget is the house pattern
  // (tests/e2e-s5-package-discovery-composition-root.test.ts:97).
}, 60000);

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});

/** The diagnostic lines this load attributed to one planted file. */
function linesFor(stem: string, ext = "theta"): readonly string[] {
  const attributed = new RegExp(`[\\\\/]${stem}\\.${ext}[:\\s]`);
  return outcome.diagnosticLines.filter((line) => attributed.test(line));
}

/** The `<code>` of each of one caller's diagnostic lines, in emission order. */
function codesFor(stem: string): readonly string[] {
  return linesFor(stem).map((line) => {
    const match = /: (theta\/[a-z0-9/-]+): /.exec(line);
    if (match === null) {
      throw new Error(
        `harness: diagnostic line for '${stem}' does not carry a \`theta/…\` code, so ` +
          `the per-caller channel cannot be read: ${JSON.stringify(line)}`,
      );
    }
    return match[1] as string;
  });
}

/** The rendered *Message* of each of one caller's diagnostic lines, in emission order. */
function messagesFor(stem: string): readonly string[] {
  return linesFor(stem).map((line) => {
    const match = /: theta\/[a-z0-9/-]+: (.*)$/.exec(line);
    if (match === null) {
      throw new Error(
        `harness: diagnostic line for '${stem}' does not carry a rendered message: ` +
          JSON.stringify(line),
      );
    }
    return match[1] as string;
  });
}

/**
 * The per-surface positive control, run first by every cell whose expectation
 * is an ABSENCE (the two arity cells, and the well-typed control): THIS load
 * produced this surface's type row for THIS surface's slot-0 control cell. Without
 * it a "zero type rows" assertion passes while the surface is unreachable and
 * nothing is being measured.
 */
function assertSurfaceLive(surface: Surface): void {
  const control = CELLS.find((cell) => cell.key === "c0") as Cell;
  const stem = surface.caller(control.key);
  expect(
    messagesFor(stem),
    `unmet precondition: surface ${surface.id} (${surface.label}) produced no ` +
      `${surface.typeCode} for its slot-0 control caller '${stem}', so this surface's ` +
      "row is not firing at all in this load and no absence assertion over it measures " +
      `anything. Lines for that caller: ${JSON.stringify(linesFor(stem))}`,
  ).toEqual(expectedMessages(surface, control));
}

// ===========================================================================
// Cell R — DIAG-4 sourcing. Every row this file renders is registered and
// carries the placeholders the expected strings interpolate, so a registry edit
// reds here rather than silently detaching the assertions from the registry.
// ===========================================================================
describe("bug 0147 cell R — the seven rows are registered with the placeholders this file fills", () => {
  const PLACEHOLDERS: Record<string, readonly string[]> = {
    [INVOKE_ARG_CODE]: ["<i>", "<param>", "<expected>", "<actual>"],
    [TOOL_ARG_CODE]: ["<name>", "<expected>", "<actual>"],
    [FN_ARG_CODE]: ["<name>", "<i>", "<param>", "<expected>", "<actual>"],
    [INVOKE_ARITY_TOO_FEW]: ["<callee>", "<required>", "<provided>"],
    [INVOKE_ARITY_TOO_MANY]: ["<callee>", "<max>", "<provided>"],
    [FN_ARITY_TOO_FEW]: ["<name>", "<required>", "<provided>"],
    [FN_ARITY_TOO_MANY]: ["<name>", "<required>", "<provided>"],
  };

  for (const [code, placeholders] of Object.entries(PLACEHOLDERS)) {
    it(`R: ${code} is registered at error severity and carries ${placeholders.join(" ")}`, () => {
      const row = REGISTRY.find((r) => r.code === code);
      expect(
        row,
        `${code} has no row in ${REGISTRY_PAGE} — a cell below renders its *Message*`,
      ).toBeDefined();
      expect(row?.severity, `${code} is no longer an E-severity row`).toBe("E");
      const message = registered(code);
      for (const placeholder of placeholders) {
        expect(message, `${code}: *Message* template lost ${placeholder}`).toContain(
          placeholder,
        );
      }
    });
  }

  it("R: the S3 row carries NEITHER `<i>` NOR `<param>` — the reason its ruling is per-site", () => {
    const message = registered(TOOL_ARG_CODE);
    expect(
      message,
      `${TOOL_ARG_CODE} gained an argument index. Per-site multiplicity was adjudicated ` +
        "partly because two per-slot emissions at one site would render byte-identically " +
        "on this row; if the *Message* can now name a slot, the ruling's premise moved",
    ).not.toContain("<i>");
    expect(
      message,
      `${TOOL_ARG_CODE} gained a param name — see the previous assertion`,
    ).not.toContain("<param>");
  });
});

// ===========================================================================
// Cell W — the workspace-level control, deliberately unguarded: it separates
// "a surface never fired" from "the workspace never loaded".
// ===========================================================================
describe("bug 0147 cell W — the planted workspace loaded", () => {
  it("W: every surface's well-typed control caller registered", () => {
    const wellTyped = SURFACES.map((surface) => surface.caller("ok"));
    expect(
      wellTyped.filter((stem) => !outcome.registered.includes(stem)),
      "a well-typed control caller did not register, so this file is reading a broken " +
        `workspace rather than measuring diagnostic counts. Registered: ${JSON.stringify(
          outcome.registered,
        )}`,
    ).toEqual([]);
  });

  it("W: every diagnostic line this load produced is attributable to a planted file", () => {
    const attributable = outcome.diagnosticLines.filter((line) =>
      PLANTED.some((p) => new RegExp(`[\\\\/]${p.stem}\\.${p.ext}[:\\s]`).test(line)),
    );
    const orphans = outcome.diagnosticLines
      .filter((line) => !attributable.includes(line))
      // `renderDiagnosticLine` follows a diagnostic carrying a *Hint* with an
      // indented `  hint: …` continuation line, which names no file by design.
      .filter((line) => !/^\s+hint: /.test(line));
    expect(
      orphans,
      "the load emitted a diagnostic line naming no planted file, so a count below may " +
        "be reading a diagnostic this workspace did not intend to provoke",
    ).toEqual([]);
  });
});

// ===========================================================================
// The grid — ten cell shapes × four surfaces. Each cell asserts THREE exact
// things about one caller: the ordered rendered *Message* sequence, the ordered
// diagnostic-code sequence, and the literal count from the ruling's table.
// Registration is asserted alongside, because it is what proves the caller was
// judged rather than skipped.
// ===========================================================================
for (const surface of SURFACES) {
  describe(`bug 0147 — ${surface.id}, the ${surface.label} surface`, () => {
    for (const cell of CELLS) {
      const stem = surface.caller(cell.key);
      const count = cell.counts[surface.id];
      const isAbsenceCell = cell.arity !== undefined || cell.key === "ok";

      it(`${surface.id}/${cell.key}: ${cell.label} draws exactly ${count} diagnostic(s)`, () => {
        if (isAbsenceCell) {
          // An absence-shaped expectation (zero type rows) is only meaningful
          // once this surface's row is proven live in THIS load.
          assertSurfaceLive(surface);
        }
        expect(
          messagesFor(stem),
          `${surface.id} (${surface.label}), cell '${cell.key}' (${cell.label}): the ` +
            "ordered rendered messages diverge from the adjudicated multiplicity " +
            `(${surface.reportedSlots === firstOnly ? "PER-SITE, first mistyped judged slot" : "PER-SLOT, one per mistyped judged slot in source order"}` +
            `${cell.arity !== undefined ? "; wrong arity, so the arity row alone and zero type rows" : ""}). ` +
            `Lines for '${stem}': ${JSON.stringify(linesFor(stem))}`,
        ).toEqual(expectedMessages(surface, cell));

        expect(
          codesFor(stem),
          `${surface.id}, cell '${cell.key}': the ordered diagnostic CODE sequence ` +
            `diverges. Lines for '${stem}': ${JSON.stringify(linesFor(stem))}`,
        ).toEqual(expectedCodes(surface, cell));

        expect(
          linesFor(stem).length,
          `${surface.id}, cell '${cell.key}': the ruling fixes this cell's count at ` +
            `${count} on this surface. Lines for '${stem}': ${JSON.stringify(linesFor(stem))}`,
        ).toBe(count);
      });

      it(`${surface.id}/${cell.key}: the caller ${count === 0 ? "registers" : "does not register"}`, () => {
        if (count === 0) {
          expect(
            outcome.registered,
            `${surface.id}, cell '${cell.key}': a caller drawing no error-severity ` +
              `diagnostic must register. Registered: ${JSON.stringify(outcome.registered)}`,
          ).toContain(stem);
        } else {
          expect(
            outcome.registered,
            `${surface.id}, cell '${cell.key}': every row here is E-severity, so ` +
              "`hasLoadParseError` (src/extension/production-composition.ts:2360) must " +
              `deny registration. Registered: ${JSON.stringify(outcome.registered)}`,
          ).not.toContain(stem);
        }
      });
    }

    it(`${surface.id}: the wrong-arity cells draw ZERO ${surface.typeCode} rows`, () => {
      assertSurfaceLive(surface);
      for (const cell of CELLS.filter((c) => c.arity !== undefined)) {
        const stem = surface.caller(cell.key);
        expect(
          linesFor(stem).filter((line) => line.includes(surface.typeCode)),
          `${surface.id}, cell '${cell.key}': arity is checked BEFORE per-argument type ` +
            "(invocation.md §\"Argument arity\"), so a wrong-arity site draws its arity " +
            `row alone. Lines for '${stem}': ${JSON.stringify(linesFor(stem))}`,
        ).toEqual([]);
      }
    });
  });
}

// ===========================================================================
// Cell X — the cross-surface statement of the ruling, read off the same load:
// the per-slot / per-site split IS the adjudicated contract, stated as one
// table so a future harmonisation of the family reds here explicitly rather
// than in nine scattered cells.
// ===========================================================================
describe("bug 0147 cell X — the adjudicated per-row multiplicity, stated as one table", () => {
  const MULTI_SLOT_CELLS = ["m2", "m3", "two", "arrbool"] as const;

  it("X: the three per-slot surfaces report one row per mistyped judged slot", () => {
    const measured: Record<string, Record<string, number>> = {};
    for (const surface of SURFACES.filter((s) => s.reportedSlots === perSlot)) {
      measured[surface.id] = {};
      for (const key of MULTI_SLOT_CELLS) {
        (measured[surface.id] as Record<string, number>)[key] = linesFor(
          surface.caller(key),
        ).length;
      }
    }
    expect(
      measured,
      "the per-slot surfaces (S1 invoke literal, S2 same-file `fn`, S4 imported " +
        "`.thetalib` `fn`) no longer report one diagnostic per mistyped judged slot",
    ).toEqual({
      S1: { m2: 2, m3: 3, two: 4, arrbool: 2 },
      S2: { m2: 2, m3: 3, two: 4, arrbool: 2 },
      S4: { m2: 2, m3: 3, two: 4, arrbool: 2 },
    });
  });

  it("X: the per-site surface reports at most one row per call site", () => {
    const measured: Record<string, number> = {};
    for (const key of MULTI_SLOT_CELLS) {
      measured[key] = linesFor(("f3" + key) as string).length;
    }
    expect(
      measured,
      "S3 (`.theta`-callable) no longer caps at one diagnostic per call site — the " +
        "`break` at src/extension/invoke-static-checks.ts:1149 is the mechanism the " +
        "adjudicated per-site ruling names",
    ).toEqual({ m2: 1, m3: 1, two: 2, arrbool: 1 });
  });

  it("X: the three slot-isolating controls report exactly one row on every surface", () => {
    const measured: Record<string, Record<string, number>> = {};
    for (const surface of SURFACES) {
      measured[surface.id] = {
        c0: linesFor(surface.caller("c0")).length,
        c1b: linesFor(surface.caller("c1b")).length,
        c1i: linesFor(surface.caller("c1i")).length,
      };
    }
    expect(
      measured,
      "the slot-isolating controls are what prove S3's count of one is a FIRST-MISMATCH " +
        "cap and not a dead check at slot 1: `c1b` and `c1i` leave slot 0 well typed, so " +
        "a surface that only judged slot 0 would report nothing for them",
    ).toEqual({
      S1: { c0: 1, c1b: 1, c1i: 1 },
      S2: { c0: 1, c1b: 1, c1i: 1 },
      S3: { c0: 1, c1b: 1, c1i: 1 },
      S4: { c0: 1, c1b: 1, c1i: 1 },
    });
  });

  it("X: the slot-1 controls name slot 1, not slot 0, wherever the *Message* can say so", () => {
    // S3's row carries no `<i>`, so on that surface the discriminator is the
    // rendered `<actual>`: `c1i` puts an `integer` at slot 1 behind a well-typed
    // slot 0, and `c1b` a `boolean`. Both differ from a slot-0 re-report, which
    // would have to render the well-typed `string` argument.
    for (const surface of SURFACES) {
      const boolCell = CELLS.find((c) => c.key === "c1b") as Cell;
      const intCell = CELLS.find((c) => c.key === "c1i") as Cell;
      expect(
        messagesFor(surface.caller("c1b")),
        `${surface.id}: the slot-1 boolean control did not render as a slot-1 verdict`,
      ).toEqual(expectedMessages(surface, boolCell));
      expect(
        messagesFor(surface.caller("c1i")),
        `${surface.id}: the slot-1 integer control did not render as a slot-1 verdict`,
      ).toEqual(expectedMessages(surface, intCell));
      expect(
        messagesFor(surface.caller("c1b")),
        `${surface.id}: the two slot-1 controls rendered identically, so neither ` +
          "discriminates the slot the loop reached",
      ).not.toEqual(messagesFor(surface.caller("c1i")));
    }
  });
});
