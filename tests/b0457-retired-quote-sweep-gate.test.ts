import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync, type Dirent } from "node:fs";
import { describe, expect, it } from "vitest";

// b0457 — the retired-normative-text quote sweep gate.
//
// Bug 0457 (docs/bugs/0457-retired-text-quoted-as-current.md) records six
// committed surfaces that QUOTE retired normative text as the current contract:
//
//   - Cell A: bug 0439 (fixed 0.418.0) reworded the wrong-kind stdlib belt's
//     false laundering diagnosis. The retired tail phrase "did not reject this
//     laundered-receiver" survives in the b0394 header
//     (tests/b0394-stdlib-wrong-kind-args-belt.test.ts:56, line-wrapped across
//     lines 56–57) under a "the implementer matches it" claim about a template the
//     implementer no longer ships. The ONLY sanctioned live use of that exact
//     phrase is inside tests/b0439-kind-belt-message-honesty.test.ts, whose
//     mention (line 264) documents the token an absence-assertion removes — that
//     file is the one allowlisted exception.
//
//   - Cell B: bug 0150 (fixed 0.177.0) relaxed the FnParam production to an
//     optional annotation (`FnParam ::= Ident (":" Type)?`, spec truth
//     docs/spec_topics/grammar.md:145). The retired mandatory form
//     `FnParam ::= Ident ":" Type` survives across five enforced-scope surfaces
//     (three test headers, a parser comment, and the fn-param-not-identifier
//     registry Trigger prose), several asserting it as "THE RULE".
//
// This is a small offline CONTENT gate (the b0419/b0421 pattern) — it reads
// quoted text against its source and holds no assertion load on the quoted
// text itself. Two RED-now cells (A, B) encode the §Fix END STATE (the retired
// text is gone), so each goes GREEN once the sweep lands; one GREEN-control
// cell (C) pins the spec truth the sweep aligns to, guarding the targets.
//
// SCOPE DISCIPLINE (bug 0457 §Affected / §Non-goals — intentional NON-instances
// that MUST NOT be scored):
//   - The bare word "laundered-receiver" is legitimate elsewhere (b0315/b0393
//     scenario references, runtime-panics.ts:478's DIFFERENT bug-0315 tail
//     "did not reject this site — a laundered-receiver gate gap",
//     stdlib-array/object comments) — Cell A bans ONLY the exact retired phrase.
//   - The FnParam era-narrations tests/fn-param-annotation-optional.test.ts:10
//     and tests/live/fn-param-annotation-optional-live-cell.test.ts:84 narrate
//     the pre-fix state / the rejected route-1 counterfactual; era-pinned
//     docs/bugs/** are history. Cell B pins EXACTLY the five enforced-scope
//     files and never scans those.

const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

/**
 * Read a corpus file. A missing or empty file is a HARNESS failure that names
 * the unmet precondition and throws — never a skip, never an early return, so an
 * absent source cannot let a cell pass vacuously (the bug-0421 readCorpus
 * pattern this file mirrors).
 */
function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is a source this gate scores for the bug 0457 quote sweep — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(`harness precondition unmet: ${rel} is empty; nothing to score`);
  }
  return text;
}

/** Line splitting tolerates a CRLF terminator. */
const linesOf = (text: string): readonly string[] => text.split(/\r?\n/);

/** The 1-based line numbers of `needle` in `text` (a file:line locator for messages). */
function lineHits(text: string, needle: string): readonly number[] {
  const out: number[] = [];
  linesOf(text).forEach((line, index) => {
    if (line.includes(needle)) out.push(index + 1);
  });
  return out;
}

/**
 * Every *.ts file under a repo-relative directory, recursively, as repo-relative
 * POSIX paths. A directory that cannot be read is a loud precondition failure —
 * a corpus this gate sweeps must exist.
 */
function tsFilesUnder(relDir: string): readonly string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    // `withFileTypes: true` with no `encoding` option resolves the string-path
    // Dirent overload; the bare `ReturnType<typeof readdirSync>` picks the
    // default (Buffer-path) overload instead and mismatches at assignment.
    let entries: Dirent<string>[];
    try {
      entries = readdirSync(repoFile(rel), { withFileTypes: true });
    } catch (cause) {
      throw new Error(
        `harness precondition unmet: ${rel}/ is unreadable, and it is a corpus root this gate sweeps for bug 0457 — a missing corpus directory is a loud failure, never a skip (${String(cause)})`,
      );
    }
    for (const entry of entries) {
      const childRel = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(childRel);
      else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(childRel);
    }
  };
  walk(relDir);
  if (out.length === 0) {
    throw new Error(
      `harness precondition unmet: ${relDir}/ holds no .ts files — the bug 0457 Cell A sweep would score nothing`,
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cell A constants — the exact retired belt tail (bug 0457 §Affected instance 1).
// ---------------------------------------------------------------------------

// The retired tail phrase, byte-exact. bug 0439 removed this from the shipped
// belt message; the current tail is pinned in Cell C. The bare word
// "laundered-receiver" is NOT banned (see SCOPE DISCIPLINE above) — only this
// full phrase, which is the tail bug 0439 retired.
const RETIRED_BELT_TAIL = "did not reject this laundered-receiver";

// The ONE production file allowed to carry the phrase: its mentions document the
// token an absence-assertion strips (the b0439 gate, line 264), so quoting it there is
// the removal witness, not a re-plant (bug 0457 §Affected, §Fix constraint 1).
const BELT_TAIL_ALLOWED = "tests/b0439-kind-belt-message-honesty.test.ts";

// This gate file itself must define the retired phrase as its detection needle;
// it is not an instance of the drift and must be excluded, or the cell could
// never reach GREEN after the b0394 header is swept (both directions reachable).
const SELF = "tests/b0457-retired-quote-sweep-gate.test.ts";
const BELT_TAIL_EXEMPT: readonly string[] = [BELT_TAIL_ALLOWED, SELF];

// ---------------------------------------------------------------------------
// Cell B constants — the retired FnParam production (bug 0457 §Affected 2–6).
// ---------------------------------------------------------------------------

// The retired mandatory-annotation form, byte-exact. The current optional form
// `FnParam ::= Ident (":" Type)?` does NOT contain this substring (after
// `Ident ` comes `(`, not `"`), so a whole-file `includes` check flips to GREEN
// once each site is refreshed. Three comment sites spell the SAME retired
// production with backslash-escaped quotes instead of the literal ones this
// needle matches — `FnParam ::= Ident \":\" Type` at
// tests/fn-param-name-reserved-keyword.test.ts lines 399 and 534, and
// tests/fn-param-name-case.test.ts:244 — so this byte-exact needle cannot
// reach them, and bug 0457's own §Reproduction grep (`FnParam ::= Ident ":"
// Type`, literal quotes) never adjudicated them either: they sit outside the
// six-instance enumeration this gate encodes, not inside it scored as clean.
// Two of the three (lines 399, 534) also carry the reference-side
// `docs/reference/grammar.md:254` cite that 0457 §Non-goals carves out as a
// separate line-cite audit, and line 534's "non-conformant … mandatory
// annotation" framing is itself falsified by bug 0150's optional-annotation
// relaxation (the same relaxation this gate's Cell B enforces) and needs a
// re-frame, not a bare quote swap. They are a residual for a follow-on sweep,
// not something this gate scores at all.
const RETIRED_FNPARAM = 'FnParam ::= Ident ":" Type';

// The five enforced-scope surfaces (bug 0457 §Affected instances 2–6), pinned
// exactly. The two era-framed non-instances are deliberately absent.
const FNPARAM_ENFORCED_SCOPE: readonly string[] = [
  "tests/fn-param-list-unclosed.test.ts", // instance 2
  "tests/fn-param-name-reserved-keyword.test.ts", // instance 3
  "tests/fn-param-not-identifier.test.ts", // instance 4
  "src/parser/theta-document.ts", // instance 5
  "docs/spec_topics/diagnostics/code-registry-parse.md", // instance 6 (Trigger prose)
];

// ---------------------------------------------------------------------------
// Cell C constants — spec truth the sweep aligns to (bug 0457 §Affected Truth).
// ---------------------------------------------------------------------------

const GRAMMAR = "docs/spec_topics/grammar.md";
const GRAMMAR_FNPARAM_LINE = 145; // the current optional-form production line
const GRAMMAR_FNPARAM_OPTIONAL = 'FnParam      ::= Ident (":" Type)?';

const RUNTIME_PANICS = "src/runtime/runtime-panics.ts";
const RUNTIME_PANICS_BELT_LINE = 509; // the current wrong-kind belt template
const RUNTIME_PANICS_CURRENT_TAIL = "reached the runtime belt unjudged (bugs 0394/0402)";

describe("bug 0457 — six committed surfaces quote retired normative text as current", () => {
  // =========================================================================
  // Cell A — RED at fork. The retired belt tail (bug 0439's) appears in the
  // b0394 header (line 56); after the sweep it appears in NO tests/**|src/** file
  // outside the b0439 absence-witness. Encodes the §Fix end state.
  // =========================================================================
  it("cell A (RED) — the retired belt tail lives in no tests/** or src/** file except the b0439 absence-witness", () => {
    // Precondition: the allowlisted exception file must exist AND still carry the
    // phrase, else the exception is meaningless and the cell could pass vacuously.
    const allowed = readCorpus(BELT_TAIL_ALLOWED);
    expect(
      allowed.includes(RETIRED_BELT_TAIL),
      `cell A precondition: ${BELT_TAIL_ALLOWED} must still carry the retired phrase "${RETIRED_BELT_TAIL}" (its absence-assertion documents that token); if it does not, this gate's allowlist is stale.`,
    ).toBe(true);

    const corpus = [...tsFilesUnder("tests"), ...tsFilesUnder("src")];
    const offenders: string[] = [];
    for (const rel of corpus) {
      if (BELT_TAIL_EXEMPT.includes(rel)) continue;
      const text = readCorpus(rel);
      for (const line of lineHits(text, RETIRED_BELT_TAIL)) {
        offenders.push(`${rel}:${line}`);
      }
    }
    expect(
      offenders,
      `cell A: no tests/** or src/** file outside ${BELT_TAIL_ALLOWED} may quote the retired belt tail "${RETIRED_BELT_TAIL}" (bug 0439 retired it; the current tail is "${RUNTIME_PANICS_CURRENT_TAIL}"). Offending file:line → expected none, actual: ${offenders.join(", ") || "(none)"}`,
    ).toEqual([]);
  });

  // =========================================================================
  // Cell B — RED at fork. Each of the five enforced-scope files carries the
  // retired mandatory FnParam production; the sweep replaces it with the
  // optional form. Encodes the §Fix end state, one file at a time.
  // =========================================================================
  it.each(FNPARAM_ENFORCED_SCOPE)(
    "cell B (RED) — %s no longer quotes the retired mandatory FnParam production",
    (rel) => {
      const text = readCorpus(rel);
      const hits = lineHits(text, RETIRED_FNPARAM);
      expect(
        hits,
        `cell B: ${rel} must not quote the retired production \`${RETIRED_FNPARAM}\` — bug 0150 relaxed it to \`${GRAMMAR_FNPARAM_OPTIONAL.trim()}\` (spec truth ${GRAMMAR}:${GRAMMAR_FNPARAM_LINE}). Offending line(s) → expected none, actual: ${hits.join(", ") || "(none)"}`,
      ).toEqual([]);
    },
  );

  // =========================================================================
  // Cell C — GREEN control. Pins the spec truth the sweep aligns to. Passes at
  // the fork and after the fix; guards the targets so a spec drift reds here.
  // =========================================================================
  it("cell C (GREEN control) — grammar.md:145 carries the optional FnParam form and runtime-panics.ts:509 carries the current belt tail", () => {
    const grammarLines = linesOf(readCorpus(GRAMMAR));
    expect(
      grammarLines.length,
      `cell C precondition: ${GRAMMAR} must have at least ${GRAMMAR_FNPARAM_LINE} lines; found ${grammarLines.length}.`,
    ).toBeGreaterThanOrEqual(GRAMMAR_FNPARAM_LINE);
    const fnParamLine = grammarLines[GRAMMAR_FNPARAM_LINE - 1] ?? "";
    expect(
      fnParamLine.includes(GRAMMAR_FNPARAM_OPTIONAL),
      `cell C: ${GRAMMAR}:${GRAMMAR_FNPARAM_LINE} must carry the current optional form \`${GRAMMAR_FNPARAM_OPTIONAL}\`. expected → contains it; actual line → ${JSON.stringify(fnParamLine)}`,
    ).toBe(true);

    const panicsLines = linesOf(readCorpus(RUNTIME_PANICS));
    expect(
      panicsLines.length,
      `cell C precondition: ${RUNTIME_PANICS} must have at least ${RUNTIME_PANICS_BELT_LINE} lines; found ${panicsLines.length}.`,
    ).toBeGreaterThanOrEqual(RUNTIME_PANICS_BELT_LINE);
    const beltLine = panicsLines[RUNTIME_PANICS_BELT_LINE - 1] ?? "";
    expect(
      beltLine.includes(RUNTIME_PANICS_CURRENT_TAIL),
      `cell C: ${RUNTIME_PANICS}:${RUNTIME_PANICS_BELT_LINE} must carry the current belt tail "${RUNTIME_PANICS_CURRENT_TAIL}". expected → contains it; actual line → ${JSON.stringify(beltLine)}`,
    ).toBe(true);
  });
});
