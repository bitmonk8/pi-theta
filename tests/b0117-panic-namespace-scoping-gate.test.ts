import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MatchError } from "../src/runtime/match-result";
import {
  IndexOutOfBoundsPanic,
  InvokeDepthExceededPanic,
  MissingObjectKeyPanic,
  NullIndexAccessPanic,
  NullMemberAccessPanic,
  type ThetaPanic,
} from "../src/runtime/runtime-panics";
import { InterpolatedResultPanic } from "../src/render/query-render";

// b0117 — the panic-namespace scoping oracle.
//
// Bug 0117 (docs/bugs/0117-error-model-omits-parse-coded-interpolation-panic.md)
// records that `error-model.md` §"Runtime panics" introduces its six bullets as
// the closed set of "V1 panic sources — each carrying its registered
// `theta/runtime/*` code", while a SEVENTH `ThetaPanic` subclass ships —
// `InterpolatedResultPanic` (`src/render/query-render.ts`), QRY-18's runtime
// fallback — carrying the parse-namespaced code
// `theta/parse/interpolated-result`. No sentence on the page mentions it.
//
// THE SPEC AUTHORITY THIS FILE LOCKS, quoted with citation form normalized to
// this repo's "line NN" convention (the citation-symbol-form gate,
// tests/citation-symbol-form-gate.test.ts, forbids a bare `:NN` continuation
// beside a file name; the ruling's own `expressions.md:188` and
// `code-registry-runtime.md:7's` are rewritten to that convention below —
// a lossless normalization of citation form, not of the ruling's content:
//
//   "OPERATOR RULING (fifteenth set, ruling 1): 0117 = (a)(2). error-model.md
//   §Runtime panics enumerates the sources of theta/runtime/* panics — scope
//   the list header accordingly and state the one exception immediately beside
//   it: QRY-18's runtime fallback (InterpolatedResultPanic) panics with the
//   parse-namespaced code theta/parse/interpolated-result, cross-referencing
//   expressions.md line 188 which already names it. The namespace <-> list
//   correspondence stays exact; code-registry-runtime.md line 7's matching
//   prose stays true unmodified; the list is NOT widened to seven."
//
// So this oracle scores TWO things at once, and both directions matter:
//
//   Cells A-G are RED at the unfixed tree. They assert the SCOPING and the
//   EXCEPTION prose the ruling mandates, in the `**Runtime panics.**` paragraph
//   at docs/spec_topics/errors-and-results/error-model.md line 65, in
//   docs/spec_topics/expressions.md line 9, and in the GOV-30 lock-step mirror
//   docs/reference/errors-and-results.md §"Runtime panics".
//
//   Cells H-L are GREEN at the unfixed tree and MUST stay green. They pin the
//   half of the ruling that forbids the other disposition: the list is not
//   widened to seven, the namespace <-> list correspondence stays exact, and
//   docs/spec_topics/diagnostics/code-registry-runtime.md stays byte-untouched
//   (its line 7 prose "exactly six **panic sources**" plus the one-row-per-code
//   matching rule stays true UNMODIFIED). Cell J derives the shipped exception
//   set from `src/` so the sentence the spec is about to state is checked
//   against the code rather than against itself.
//
// Assertions are SEMANTIC PATTERNS over the extracted section, never verbatim
// snapshots of a whole sentence: the fix must survive editorial rewording while
// still reddening on the pre-fix bytes.
//
// Spec anchors (every line re-derived against this tree):
//   - docs/spec_topics/errors-and-results/error-model.md line 63 — the
//     `<a id="runtime-panics"></a>` anchor five test files and every sibling
//     page cite into.
//   - docs/spec_topics/errors-and-results/error-model.md line 65 — the defect
//     site: "V1 panic sources — each carrying its registered `theta/runtime/*`
//     code from [Diagnostics]". This paragraph is ONE long line and must stay
//     one line; the file must stay 94 lines.
//   - docs/spec_topics/errors-and-results/error-model.md lines 67-72 — the six
//     bullets. UNCHANGED by the fix and still six (cell H).
//   - docs/spec_topics/errors-and-results/error-model.md line 74 — "the six
//     closed-list sources above" and the runtime-defect surface.
//   - docs/spec_topics/errors-and-results/error-model.md line 76 — "registered
//     for its `theta/runtime/*` code in the [Diagnostics code registry]
//     (code-registry-runtime.md)"; cell D repairs that pointer for the one
//     exception only.
//   - docs/spec_topics/errors-and-results/error-model.md lines 78-85 — the
//     six-row message-template table (cell I).
//   - docs/spec_topics/expressions.md lines 9 and 10 — the two "canonical
//     closed list" claims pointing at [Errors and Results — Runtime panics].
//     Cell F scores EVERY occurrence of that phrase in the page, not the first
//     one only: a per-occurrence sweep is what keeps a second unscoped copy
//     from escaping the ruling.
//   - docs/spec_topics/expressions.md line 188 — the `?` operator paragraph the
//     ruling cross-references, which already names
//     `theta/parse/interpolated-result` and QRY-18.
//   - docs/spec_topics/query/query-escapes-stringification.md line 16 — QRY-18;
//     the same page's line 59 — QRY-21, whose `let _ =` non-containment the
//     `ThetaPanic` subclassing exists to preserve.
//   - docs/spec_topics/diagnostics/code-registry-runtime.md line 7 — the
//     matching prose the ruling pins as true UNMODIFIED (cell K).
//   - docs/spec_topics/diagnostics/code-registry-parse.md line 83 — the
//     `theta/parse/interpolated-result` row, i.e. where the exception's
//     *Message template* actually lives (cell D).
//   - docs/reference/errors-and-results.md lines 78-89 — the GOV-30 lock-step
//     mirror (cells G and L).

const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

/**
 * Read a corpus file. A missing file is a HARNESS failure that names the unmet
 * precondition and throws — never a skip, never an early return.
 */
function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is this oracle's only source for the bug 0117 ruling — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(`harness precondition unmet: ${rel} is empty; nothing to score`);
  }
  return text;
}

const linesOf = (text: string): readonly string[] => text.split(/\r?\n/);

const ERROR_MODEL = "docs/spec_topics/errors-and-results/error-model.md";
const REFERENCE_MIRROR = "docs/reference/errors-and-results.md";
const EXPRESSIONS = "docs/spec_topics/expressions.md";
const REGISTRY_RUNTIME = "docs/spec_topics/diagnostics/code-registry-runtime.md";
const REGISTRY_PARSE = "docs/spec_topics/diagnostics/code-registry-parse.md";

/** The six codes the ruling forbids widening past. */
const SIX_RUNTIME_PANIC_CODES = [
  "theta/runtime/match-error",
  "theta/runtime/index-out-of-bounds",
  "theta/runtime/null-member-access",
  "theta/runtime/null-index-access",
  "theta/runtime/missing-object-key",
  "theta/runtime/invoke-depth-exceeded",
] as const;

/** The one exception the ruling names, by code and by class. */
const EXCEPTION_CODE = "theta/parse/interpolated-result";
const EXCEPTION_CLASS = "InterpolatedResultPanic";

const RUNTIME_NAMESPACE = "theta/runtime/";

/** First backticked `theta/<ns>/<name>` code token in a line, if any. */
function firstThetaCode(line: string): string | undefined {
  const m = /`(theta\/[a-z0-9-]+\/[a-z0-9-]+)`/.exec(line);
  return m?.[1];
}

/** Every backticked `theta/<ns>/<name>` code token in a string. */
function allThetaCodes(text: string): readonly string[] {
  return [...text.matchAll(/`(theta\/[a-z0-9-]+\/[a-z0-9-]+)`/g)].map((m) => m[1] as string);
}

// ---------------------------------------------------------------------------
// Section extraction — spec page
// ---------------------------------------------------------------------------

interface RuntimePanicsSection {
  /** The whole §"Runtime panics" run, anchor line to end of page. */
  readonly body: string;
  /** The single `**Runtime panics.**` list-header paragraph line. */
  readonly headerParagraph: string;
  /** 1-based line number of that paragraph, for failure messages. */
  readonly headerLine: number;
  /** The contiguous `- ` bullet run immediately below the header. */
  readonly bullets: readonly string[];
  /** Rows of the *Message template* table below the header. */
  readonly templateRows: readonly string[];
}

function extractSpecSection(): RuntimePanicsSection {
  const text = readCorpus(ERROR_MODEL);
  const lines = linesOf(text);
  const anchorIndex = lines.findIndex((l) => l.trim() === '<a id="runtime-panics"></a>');
  if (anchorIndex < 0) {
    throw new Error(
      `harness precondition unmet: ${ERROR_MODEL} carries no <a id="runtime-panics"></a> anchor (expected at ${ERROR_MODEL} line 63) — the §"Runtime panics" section cannot be located, so every cell below would be vacuous`,
    );
  }
  const headerIndex = lines.findIndex(
    (l, i) => i > anchorIndex && l.startsWith("**Runtime panics.**"),
  );
  if (headerIndex < 0) {
    throw new Error(
      `harness precondition unmet: ${ERROR_MODEL} carries no "**Runtime panics.**" list-header paragraph below its anchor (expected at ${ERROR_MODEL} line 65) — that paragraph is the site the bug 0117 ruling scopes, so it must exist`,
    );
  }

  const bullets: string[] = [];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      if (bullets.length > 0) break;
      continue;
    }
    if (!line.startsWith("- ")) break;
    bullets.push(line);
  }
  if (bullets.length === 0) {
    throw new Error(
      `harness precondition unmet: no bullet run found below the "**Runtime panics.**" paragraph in ${ERROR_MODEL} (expected ${ERROR_MODEL} lines 67-72)`,
    );
  }

  const tableStart = lines.findIndex((l, i) => i > headerIndex && l.startsWith("| Code |"));
  if (tableStart < 0) {
    throw new Error(
      `harness precondition unmet: no "| Code | Message template |" table found below the "**Runtime panics.**" paragraph in ${ERROR_MODEL} (expected ${ERROR_MODEL} lines 78-85)`,
    );
  }
  const templateRows: string[] = [];
  for (let i = tableStart + 2; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (!line.startsWith("|")) break;
    templateRows.push(line);
  }

  return {
    body: lines.slice(anchorIndex).join("\n"),
    headerParagraph: lines[headerIndex] ?? "",
    headerLine: headerIndex + 1,
    bullets,
    templateRows,
  };
}

// ---------------------------------------------------------------------------
// Section extraction — reference mirror
// ---------------------------------------------------------------------------

interface MirrorSection {
  readonly body: string;
  /** The prose run between the `## Runtime panics` heading and the bullets. */
  readonly headerProse: string;
  readonly bullets: readonly string[];
}

function extractMirrorSection(): MirrorSection {
  const lines = linesOf(readCorpus(REFERENCE_MIRROR));
  const start = lines.findIndex((l) => /^##\s+Runtime panics\s*$/.test(l));
  if (start < 0) {
    throw new Error(
      `harness precondition unmet: ${REFERENCE_MIRROR} carries no "## Runtime panics" heading (expected at ${REFERENCE_MIRROR} line 78) — the GOV-30 lock-step mirror cannot be located`,
    );
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i] ?? "")) {
      end = i;
      break;
    }
  }
  const section = lines.slice(start, end);

  const firstBullet = section.findIndex((l) => l.startsWith("- "));
  if (firstBullet < 0) {
    throw new Error(
      `harness precondition unmet: no bullet run in ${REFERENCE_MIRROR} §"Runtime panics" (expected ${REFERENCE_MIRROR} lines 84-89)`,
    );
  }
  const bullets: string[] = [];
  for (let i = firstBullet; i < section.length; i += 1) {
    const line = section[i] ?? "";
    if (!line.startsWith("- ")) break;
    bullets.push(line);
  }

  return {
    body: section.join("\n"),
    headerProse: section.slice(1, firstBullet).join(" "),
    bullets,
  };
}

// ---------------------------------------------------------------------------
// src/ derivation for cell J
// ---------------------------------------------------------------------------

/** Every `.ts` file under `src/`, for the rg-equivalent subclass scan. */
function sourceFiles(): readonly string[] {
  const root = repoFile("src");
  const out: string[] = [];
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        visit(full);
        continue;
      }
      if (full.endsWith(".ts")) out.push(full);
    }
  };
  visit(root);
  if (out.length === 0) {
    throw new Error(
      "harness precondition unmet: no .ts files found under src/ — cell J derives the shipped ThetaPanic set from source text and cannot be scored without it",
    );
  }
  return out;
}

/** Class names declared as `class <X> extends ThetaPanic` anywhere in `src/`. */
function shippedPanicClassNames(): readonly string[] {
  const names = new Set<string>();
  for (const file of sourceFiles()) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/\bclass\s+([A-Za-z0-9_]+)\s+extends\s+ThetaPanic\b/g)) {
      names.add(m[1] as string);
    }
  }
  return [...names].sort();
}

/**
 * The same seven classes, imported rather than regexed, so the CODE VALUES are
 * the real shipped ones. Each takes a single `message` string.
 */
const IMPORTED_PANICS: ReadonlyArray<new (message: string) => ThetaPanic> = [
  MatchError,
  IndexOutOfBoundsPanic,
  MissingObjectKeyPanic,
  NullIndexAccessPanic,
  NullMemberAccessPanic,
  InvokeDepthExceededPanic,
  InterpolatedResultPanic,
];

// ---------------------------------------------------------------------------

const SPEC = extractSpecSection();
const MIRROR = extractMirrorSection();

/** Words a correspondence claim ("exactly", "iff", "corresponds") can use. */
const CORRESPONDENCE = /\b(?:correspond\w*|if and only if|iff|exact\w*)\b/i;

describe("bug 0117 — §Runtime panics is namespace-scoped and names its one exception", () => {
  // =========================================================================
  // RED-at-HEAD cells. The ruling's disposition (a)(2) makes these green.
  // =========================================================================

  it("cell A — the error-model.md list header scopes the enumeration to `theta/runtime/*` and states the exact namespace <-> list correspondence", () => {
    const p = SPEC.headerParagraph;
    expect(
      /\benumerat\w*/i.test(p) && /`theta\/runtime\/\*`/.test(p),
      `cell A (ruling clause "error-model.md §Runtime panics enumerates the sources of theta/runtime/* panics — scope the list header accordingly"): the "**Runtime panics.**" paragraph at ${ERROR_MODEL} line ${SPEC.headerLine} must SAY it enumerates the sources of \`theta/runtime/*\` panics. Found no enumeration-scoping clause naming that namespace. Paragraph head: ${p.slice(0, 300)}`,
    ).toBe(true);
    expect(
      /\bnamespace\b/i.test(p) && CORRESPONDENCE.test(p),
      `cell A (ruling clause "The namespace <-> list correspondence stays exact"): the paragraph at ${ERROR_MODEL} line ${SPEC.headerLine} must state the correspondence explicitly — a source is listed iff its registered code is in the \`theta/runtime/*\` namespace. Found no namespace-correspondence sentence.`,
    ).toBe(true);
  });

  it("cell B — the same header paragraph names the exception by class and by literal code", () => {
    const p = SPEC.headerParagraph;
    expect(
      p.includes(EXCEPTION_CLASS),
      `cell B (ruling clause "state the one exception immediately beside it: QRY-18's runtime fallback (InterpolatedResultPanic)"): ${ERROR_MODEL} line ${SPEC.headerLine} must name ${EXCEPTION_CLASS}.`,
    ).toBe(true);
    expect(
      p.includes(EXCEPTION_CODE),
      `cell B (ruling clause "panics with the parse-namespaced code theta/parse/interpolated-result"): ${ERROR_MODEL} line ${SPEC.headerLine} must carry that literal code.`,
    ).toBe(true);
  });

  it("cell C — the exception statement cross-references QRY-18 and the `?` operator paragraph", () => {
    const p = SPEC.headerParagraph;
    expect(
      /query-escapes-stringification\.md#qry-18/.test(p),
      `cell C (ruling clause "QRY-18's runtime fallback", cross-reference half): ${ERROR_MODEL} line ${SPEC.headerLine} must link query/query-escapes-stringification.md#qry-18 (QRY-18 is at ${"docs/spec_topics/query/query-escapes-stringification.md"} line 16).`,
    ).toBe(true);
    expect(
      /expressions\.md#question-operator/.test(p),
      `cell C (ruling clause "cross-referencing expressions.md line 188 which already names it"): ${ERROR_MODEL} line ${SPEC.headerLine} must link expressions.md#question-operator (the anchor is at ${EXPRESSIONS} line 186; the naming sentence is at ${EXPRESSIONS} line 188).`,
    ).toBe(true);
  });

  it("cell D — the exception statement names code-registry-parse.md as the registry its Message template lives in", () => {
    const p = SPEC.headerParagraph;
    expect(
      /code-registry-parse\.md/.test(p),
      `cell D (bug 0117 §Fix (a)(2) — the exception's template is NOT in the runtime registry): ${ERROR_MODEL} line ${SPEC.headerLine} must name code-registry-parse.md as where ${EXCEPTION_CODE}'s Message template is registered, repairing for this one panic the blanket runtime-registry pointer at ${ERROR_MODEL} line 76. The row lives at ${REGISTRY_PARSE} line 83.`,
    ).toBe(true);
    expect(
      /\btemplate\b/i.test(p),
      `cell D (same clause): the sentence at ${ERROR_MODEL} line ${SPEC.headerLine} must say it is the *Message template* that is registered there, matching the wording of ${ERROR_MODEL} line 76.`,
    ).toBe(true);
  });

  it("cell E — the exception keeps panic routing, is not contained by `match` / `?` / `let _ =`, and is not on the runtime-defect surface", () => {
    const p = SPEC.headerParagraph;
    expect(
      p.includes("let _ ="),
      `cell E (ruling: the exception "is a panic in every other respect" — QRY-21 containment): ${ERROR_MODEL} line ${SPEC.headerLine} must state the panic is not contained by \`let _ =\` (QRY-21, ${"docs/spec_topics/query/query-escapes-stringification.md"} line 59).`,
    ).toBe(true);
    expect(
      /QRY-21/.test(p),
      `cell E (same clause): ${ERROR_MODEL} line ${SPEC.headerLine} must cite QRY-21 by req id, since that is the invariant the ThetaPanic subclassing exists to preserve.`,
    ).toBe(true);
    expect(
      /runtime-defect/i.test(p) && /\b(?:not|never|outside)\b/i.test(p),
      `cell E (ruling: the exception "is deliberate/registered and therefore NOT on the runtime-defect surface"): ${ERROR_MODEL} line ${SPEC.headerLine} must say so, because the exclusion clause at ${ERROR_MODEL} line 74 ("not one of the six closed-list sources above") otherwise classifies it as a runtime defect.`,
    ).toBe(true);
  });

  it("cell F — every canonical-closed-list claim in expressions.md carries the `theta/runtime/*` namespace qualifier", () => {
    const text = readCorpus(EXPRESSIONS);
    const phrase = "canonical closed list";
    const lines = linesOf(text);

    // Per-occurrence, because scoring only the first copy lets a second
    // unscoped sentence assert the reading the ruling rejected.
    const occurrences: Array<{ line: number; window: string }> = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      for (let at = line.indexOf(phrase); at >= 0; at = line.indexOf(phrase, at + 1)) {
        occurrences.push({
          line: i + 1,
          window: line.slice(Math.max(0, at - 60), at + 240),
        });
      }
    }
    if (occurrences.length === 0) {
      throw new Error(
        `harness precondition unmet: ${EXPRESSIONS} carries no "${phrase}" phrase (expected at ${EXPRESSIONS} line 9 and ${EXPRESSIONS} line 10) — cell F has nothing to score and must never pass vacuously`,
      );
    }

    for (const occurrence of occurrences) {
      expect(
        /canonical closed list of `theta\/runtime\/\*` panic sources/.test(occurrence.window),
        `cell F (ruling clause "The namespace <-> list correspondence stays exact"): the "${phrase}" claim at ${EXPRESSIONS} line ${occurrence.line} must be qualified to the closed list of \`theta/runtime/*\` panic sources, or it keeps asserting the unscoped reading the ruling rejected. Window: ${occurrence.window}`,
      ).toBe(true);
    }
  });

  it("cell G — the docs/reference mirror carries the same scoping and names the exception code (GOV-30 lock-step)", () => {
    const prose = MIRROR.headerProse;
    expect(
      /\bnamespace\b/i.test(prose) && CORRESPONDENCE.test(prose),
      `cell G (GOV-30 lock-step mirror of cell A): ${REFERENCE_MIRROR} §"Runtime panics" head prose (from ${REFERENCE_MIRROR} line 80) must carry the same namespace-scoping and correspondence claim as ${ERROR_MODEL} line ${SPEC.headerLine}. Found: ${prose.slice(0, 300)}`,
    ).toBe(true);
    expect(
      MIRROR.body.includes(EXCEPTION_CODE),
      `cell G (GOV-30 lock-step mirror of cell B): ${REFERENCE_MIRROR} §"Runtime panics" must carry a condensed exception paragraph naming ${EXCEPTION_CODE}.`,
    ).toBe(true);
  });

  // =========================================================================
  // GREEN-at-HEAD preservation cells. The ruling forbids the widening
  // disposition, so these must be green before AND after the fix.
  // =========================================================================

  it("cell H — the error-model.md bullet list stays SIX entries carrying exactly the six runtime panic codes", () => {
    expect(
      SPEC.bullets.length,
      `cell H (ruling clause "the list is NOT widened to seven"): ${ERROR_MODEL} lines 67-72 must stay six bullets. Found ${SPEC.bullets.length}.`,
    ).toBe(6);
    const codes = SPEC.bullets.map((b, i) => {
      const code = firstThetaCode(b);
      if (code === undefined) {
        throw new Error(
          `harness precondition unmet: bullet ${i + 1} of ${ERROR_MODEL} §"Runtime panics" carries no backticked theta code: ${b}`,
        );
      }
      return code;
    });
    expect(
      [...codes].sort(),
      `cell H (ruling clause "the list is NOT widened to seven"): the bullet code set at ${ERROR_MODEL} lines 67-72 must equal the six closed sources exactly.`,
    ).toEqual([...SIX_RUNTIME_PANIC_CODES].sort());
  });

  it("cell I — every bullet code is in the `theta/runtime/` namespace and the message-template table carries the same six", () => {
    for (const bullet of SPEC.bullets) {
      const code = firstThetaCode(bullet) as string;
      expect(
        code.startsWith(RUNTIME_NAMESPACE),
        `cell I (ruling clause "The namespace <-> list correspondence stays exact", list -> namespace direction): every entry of ${ERROR_MODEL} lines 67-72 must carry a \`theta/runtime/*\` code. Found ${code}.`,
      ).toBe(true);
    }
    const tableCodes = SPEC.templateRows.map((row, i) => {
      const code = firstThetaCode(row);
      if (code === undefined) {
        throw new Error(
          `harness precondition unmet: row ${i + 1} of the message-template table at ${ERROR_MODEL} lines 78-85 carries no backticked theta code: ${row}`,
        );
      }
      return code;
    });
    expect(
      [...tableCodes].sort(),
      `cell I (bug 0117 §Affected — ${ERROR_MODEL} line 76's "The six V1 templates"): the template table at ${ERROR_MODEL} lines 78-85 must carry exactly the same six codes as the bullet list, since the ruling adds no runtime-namespaced source.`,
    ).toEqual([...SIX_RUNTIME_PANIC_CODES].sort());
  });

  it("cell J — src/ ships exactly seven ThetaPanic subclasses, exactly one outside the `theta/runtime/` namespace, and it carries the exception code", () => {
    const scanned = shippedPanicClassNames();
    expect(
      scanned.length,
      `cell J (the shipped set the spec sentence must match): a source-text scan of src/ for "extends ThetaPanic" must find exactly seven classes — the six closed sources plus ${EXCEPTION_CLASS}. Found ${scanned.length}: ${scanned.join(", ")}.`,
    ).toBe(7);

    const imported = IMPORTED_PANICS.map((Ctor) => new Ctor("probe")).map((p) => ({
      name: p.constructor.name,
      code: p.code,
    }));
    expect(
      imported.map((p) => p.name).sort(),
      `cell J (derivation integrity): the classes imported by this oracle must be exactly the classes the src/ scan found, or the code values below are read off a stale set.`,
    ).toEqual([...scanned]);

    const outside = imported.filter((p) => !p.code.startsWith(RUNTIME_NAMESPACE));
    expect(
      outside.length,
      `cell J (ruling clause "state the ONE exception"): exactly one shipped ThetaPanic must carry a code outside the \`theta/runtime/\` namespace. Found ${outside.length}: ${outside.map((p) => `${p.name}=${p.code}`).join(", ")}.`,
    ).toBe(1);
    expect(
      outside[0],
      `cell J (ruling clause "InterpolatedResultPanic panics with the parse-namespaced code theta/parse/interpolated-result"): the single exception must be that class with that code.`,
    ).toEqual({ name: EXCEPTION_CLASS, code: EXCEPTION_CODE });

    const runtimeCoded = imported
      .filter((p) => p.code.startsWith(RUNTIME_NAMESPACE))
      .map((p) => p.code)
      .sort();
    expect(
      runtimeCoded,
      `cell J (ruling clause "The namespace <-> list correspondence stays exact", namespace -> list direction): the shipped \`theta/runtime/*\` panic codes must equal the six enumerated at ${ERROR_MODEL} lines 67-72.`,
    ).toEqual([...SIX_RUNTIME_PANIC_CODES].sort());
  });

  it("cell K — code-registry-runtime.md's six-source prose and one-row-per-code rule stay true UNMODIFIED", () => {
    const registry = readCorpus(REGISTRY_RUNTIME);
    const line7 = linesOf(registry)[6] ?? "";
    expect(
      /exactly six \*\*panic sources\*\*/.test(line7),
      `cell K (ruling clause "code-registry-runtime.md line 7's matching prose stays true unmodified"): ${REGISTRY_RUNTIME} line 7 must still say theta 1.0.0 has exactly six panic sources. Found: ${line7.slice(0, 240)}`,
    ).toBe(true);
    expect(
      /one row per code in that list/.test(line7),
      `cell K (same clause): ${REGISTRY_RUNTIME} line 7 must still assert the one-row-per-code matching rule against the closed list.`,
    ).toBe(true);
    for (const code of SIX_RUNTIME_PANIC_CODES) {
      const rows = linesOf(registry).filter(
        (l) => l.startsWith("|") && firstThetaCode(l) === code,
      );
      expect(
        rows.length,
        `cell K (the matching rule made mechanical): ${REGISTRY_RUNTIME} must carry exactly one table row for ${code}. Found ${rows.length}.`,
      ).toBe(1);
    }
    expect(
      allThetaCodes(registry).includes(EXCEPTION_CODE),
      `cell K (ruling: code-registry-runtime.md is byte-untouched and no registry cell is edited): ${EXCEPTION_CODE} must NOT appear in ${REGISTRY_RUNTIME}; its row stays at ${REGISTRY_PARSE} line 83.`,
    ).toBe(false);
    expect(
      allThetaCodes(readCorpus(REGISTRY_PARSE)).includes(EXCEPTION_CODE),
      `cell K (the exception's real registry home): ${REGISTRY_PARSE} must carry the ${EXCEPTION_CODE} row that cell D makes the spec point at.`,
    ).toBe(true);
  });

  it("cell L — the docs/reference mirror keeps exactly six bullets carrying the same six codes", () => {
    expect(
      MIRROR.bullets.length,
      `cell L (ruling clause "the list is NOT widened to seven", mirror half): ${REFERENCE_MIRROR} lines 84-89 must stay six bullets. Found ${MIRROR.bullets.length}.`,
    ).toBe(6);
    const codes = MIRROR.bullets.map((b, i) => {
      const code = firstThetaCode(b);
      if (code === undefined) {
        throw new Error(
          `harness precondition unmet: mirror bullet ${i + 1} in ${REFERENCE_MIRROR} §"Runtime panics" carries no backticked theta code: ${b}`,
        );
      }
      return code;
    });
    expect(
      [...codes].sort(),
      `cell L (GOV-30 lock-step with cell H): the mirror bullet codes at ${REFERENCE_MIRROR} lines 84-89 must equal the same six closed sources.`,
    ).toEqual([...SIX_RUNTIME_PANIC_CODES].sort());
  });
});
