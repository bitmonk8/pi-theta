import { describe, expect, it } from "vitest";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Bug 0134 — the citation-form gate.
//
// Convention. A citation from a comment, doc comment or assertion-message
// string in `src/**`, `tests/**`, the spec pages or `docs/reference/**` into a
// TypeScript construct names the FILE and the SYMBOL, never a line — e.g.
// "`lowerParamsFieldType` (`src/parser/params.ts`)". A `path:<line>` citation
// into a converted file is refused.
//
// Why the line form is refused: a line number is a claim about a position, and
// every insertion above that position falsifies it while leaving the sentence
// around it true. Nothing but this gate reads comment text, so the claim
// otherwise decays with no failure signal — bug 0134 measured 17 of 19 citations
// into one churning file already naming a different construct. A symbol name is
// insertion-invariant, and the citing prose already carries it.
//
// CONVERTED_FILES is a ratchet: a file enters when it has been swept and never
// leaves, so a later sweep widens the gate without weakening it. `docs/bugs/**`
// is out of scope in both directions — a bug document is a dated record of one
// HEAD (bug 0134 §Non-goals).
//
// This file is itself in the citing scope and complies: prose that must name
// the banned form spells it non-numerically.

/** Swept targets. Ratchet — append only. */
const CONVERTED_FILES = [
  "src/parser/params.ts",
  "src/discovery/discovery-walk.ts",
  "src/runtime/err-note-render.ts",
] as const;

type ConvertedFile = (typeof CONVERTED_FILES)[number];

/**
 * Roots of the citing scope. `docs/spec.md` plus `docs/spec_topics/` are the
 * spec pages; `docs/bugs/**` is absent by design.
 */
const CITING_ROOTS = [
  "src",
  "tests",
  "docs/spec.md",
  "docs/spec_topics",
  "docs/reference",
] as const;

const CITING_EXTENSIONS = [".ts", ".md"] as const;

/** Window, in lines either side of a citation, that may carry its symbol. */
const SYMBOL_WINDOW = 4;

function escapeForRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function basename(path: string): string {
  const last = path.split("/").pop();
  if (last === undefined || last === "") throw new Error(`unusable path: ${path}`);
  return last;
}

/** Every citable spelling of a converted file: full repo-relative path, or bare leaf. */
function citableForms(target: ConvertedFile): string[] {
  return [target, basename(target)];
}

/**
 * A citation token must start at a path boundary, so a longer basename that
 * merely ends in a converted file's leaf is not read as a citation of it.
 */
const BOUNDARY = "(?<![A-Za-z0-9_.\\-])";

function walkCitingScope(): string[] {
  const files: string[] = [];
  const visit = (path: string): void => {
    const ls = lstatSync(path);
    if (ls.isSymbolicLink()) return;
    const posix = path.split("\\").join("/");
    if (!ls.isDirectory()) {
      if (CITING_EXTENSIONS.some((ext) => posix.endsWith(ext))) files.push(posix);
      return;
    }
    for (const name of readdirSync(path).sort()) {
      if (name === "node_modules" || name === ".git") continue;
      visit(join(path, name));
    }
  };
  for (const root of CITING_ROOTS) visit(root);
  return files;
}

interface Site {
  readonly citingFile: string;
  readonly citingLine: number;
  readonly citedText: string;
  readonly target: ConvertedFile;
}

function matchConverted(cited: string): ConvertedFile | undefined {
  return CONVERTED_FILES.find((t) => t === cited || t.endsWith(`/${cited}`));
}

function targetOf(cited: string): ConvertedFile {
  const target = matchConverted(cited);
  if (target === undefined) throw new Error(`unmapped citation form: ${cited}`);
  return target;
}

/**
 * A path token in prose or code: any of the extensions the corpus cites. Used to
 * attribute a continuation citation to the file it continues.
 */
const FILE_TOKEN = /[A-Za-z0-9_./-]+\.(?:ts|mts|cts|js|mjs|cjs|json|md|theta|thetalib)\b/g;

/**
 * A citation continued as a colon and digits alone, with the file named earlier
 * in the prose. The colon abuts neither a path token — the adjacent form covers
 * that — nor a closing quote, which is a JSON key inside an example payload
 * (`{"const":7}`) and names no position at all.
 */
const CONTINUATION_LINE_FORM = /(?<![A-Za-z0-9_./\-"']):\d+(?:\s*[-\u2013]\s*\d+)?/g;

const COMMENT_LINE = /^[\t ]*(?:\/\/|\/\*|\*)/;

/** A comment line carrying nothing but its marker: the paragraph break inside a block. */
const COMMENT_BREAK = /^[\t ]*(?:\/\/+|\*|\/\*)[\t ]*$/;

/**
 * The run a continuation citation draws its file from, as a start line. A fixed
 * line window both over- and under-reaches: a comment block longer than the
 * window hides a continuation, and a window crossing into unrelated code
 * invents an antecedent. The run is the syntactic unit the sentence lives in —
 * `paragraph` stops at a marker-only comment line, `block` spans the whole
 * comment block. Contiguous ordinary code lines are NOT one unit: a path in a
 * neighbouring statement is not the antecedent of this line's citation, so a
 * code site's run is the concatenated-string run of one assertion message.
 */
function runStart(
  lines: readonly string[],
  lineIndex: number,
  prose: boolean,
  scope: "paragraph" | "block",
): number {
  const inComment = COMMENT_LINE.test(lines[lineIndex] ?? "");
  let start = lineIndex;
  if (inComment || prose) {
    while (start > 0) {
      const above = lines[start - 1] ?? "";
      if (above.trim() === "") break;
      if (scope === "paragraph" && COMMENT_BREAK.test(above)) break;
      if (COMMENT_LINE.test(above) !== inComment) break;
      start -= 1;
    }
    return start;
  }
  while (start > 0) {
    if (!(lines[start - 1] ?? "").trim().endsWith("+")) break;
    if (!/^[`"']/.test((lines[start] ?? "").trim())) break;
    start -= 1;
  }
  return start;
}

/** Last line of a converted file, so a position it does not have is recognisable. */
const convertedFileLength = (target: ConvertedFile): number =>
  readFileSync(target, "utf8").split(/\r?\n/).length;

/** Path tokens standing before a citation in its run, nearest last. */
function tokensBefore(
  lines: readonly string[],
  lineIndex: number,
  column: number,
  start: number,
): string[] {
  const tokens: string[] = [];
  for (let i = start; i <= lineIndex; i += 1) {
    const text = i === lineIndex ? (lines[i] ?? "").slice(0, column) : (lines[i] ?? "");
    for (const m of text.matchAll(FILE_TOKEN)) tokens.push(m[0]);
  }
  return tokens;
}

/**
 * The file a continuation citation belongs to. Two candidate kinds: a converted
 * file that HAS the cited line, and an *antecedent* — a token the run itself
 * cites with a line of its own, which is what a bare `:<line>` continues. A
 * token that is neither is passed over rather than allowed to intercept, so a
 * prose directory path or a bare filename mention cannot hide a stale
 * continuation behind it.
 *
 * An antecedent outranks a converted mention at every scope, paragraph as well
 * as block: a mention of a converted module is background, while a line-cited
 * file is the subject a continuation resumes (`docs/STYLE.md` §Citations). The
 * paragraph decides first, nearest token first within each rank; only when the
 * paragraph names no candidate at all does the whole comment block answer. A
 * site whose candidate is another file stays attributed to that file — a false
 * red on someone else's continuation is a defect too.
 *
 * Last, symbol-anchored attribution: a run that line-cites no file at all names
 * its subject by symbol instead, so a backticked name distinctive to one
 * converted file (`distinctiveAnchors`) attributes the continuation to that
 * file. Without this rank a run naming its target by symbol alone — the very
 * form this convention prescribes — is attributed to nothing and a stale line
 * inside it passes unseen (bug 0134 §Fix constraint 3).
 */
function continuationTarget(
  lines: readonly string[],
  lineIndex: number,
  column: number,
  citedLine: number,
  prose: boolean,
  lengths: ReadonlyMap<ConvertedFile, number>,
): string | undefined {
  const carriesCitedLine = (token: string): boolean => {
    const converted = matchConverted(token);
    return converted !== undefined && citedLine <= (lengths.get(converted) ?? 0);
  };
  const isLineCited = (token: string, runText: string): boolean =>
    new RegExp(`${escapeForRegex(token)}[\\s\`]{0,2}:\\s?\\d`).test(runText);
  const isAntecedent = (token: string, runText: string): boolean =>
    matchConverted(token) === undefined && isLineCited(token, runText);

  const paragraph = runStart(lines, lineIndex, prose, "paragraph");
  const paragraphText = lines.slice(paragraph, lineIndex + 1).join("\n");
  const near = tokensBefore(lines, lineIndex, column, paragraph);
  for (let i = near.length - 1; i >= 0; i -= 1) {
    const token = near[i] ?? "";
    if (isAntecedent(token, paragraphText)) return token;
  }
  for (let i = near.length - 1; i >= 0; i -= 1) {
    const token = near[i] ?? "";
    if (carriesCitedLine(token)) return token;
  }

  const block = runStart(lines, lineIndex, prose, "block");
  const blockText = lines.slice(block, lineIndex + 1).join("\n");
  const far = tokensBefore(lines, lineIndex, column, block);
  for (let i = far.length - 1; i >= 0; i -= 1) {
    const token = far[i] ?? "";
    if (isAntecedent(token, blockText)) return token;
  }
  for (let i = far.length - 1; i >= 0; i -= 1) {
    const token = far[i] ?? "";
    if (carriesCitedLine(token)) return token;
  }

  if (far.some((token) => isLineCited(token, blockText))) return undefined;
  const named = new Set<ConvertedFile>();
  for (const m of blockText.matchAll(BACKTICKED_SYMBOL)) {
    const owner = distinctiveAnchors.get(m[1] ?? "");
    if (owner !== undefined && citedLine <= (lengths.get(owner) ?? 0)) named.add(owner);
  }
  return named.size === 1 ? [...named][0] : undefined;
}

function formatSite(site: Site): string {
  return `${site.citingFile}:${site.citingLine}  ->  ${site.citedText}`;
}

/**
 * Names an anchor may resolve to inside a cited file: every declared
 * TypeScript binding, plus the spec row / REQ-ID tokens the file carries (a
 * citation naming `SNK-i` locates a construct as precisely as one naming a
 * function).
 */
function anchorIndex(source: string, moduleScopeOnly = false): Set<string> {
  const anchors = new Set<string>();
  const declaration = new RegExp(
    `^${moduleScopeOnly ? "" : "[\\t ]*"}(?:export\\s+)?(?:default\\s+)?(?:declare\\s+)?` +
      `(?:abstract\\s+)?(?:async\\s+)?(?:function|const|let|var|class|interface|type|enum)` +
      `\\s+([A-Za-z_$][\\w$]*)`,
    "gm",
  );
  for (const m of source.matchAll(declaration)) anchors.add(m[1] ?? "");
  for (const m of source.matchAll(/\b[A-Z][A-Z0-9]+-[A-Za-z0-9]+\b/g)) anchors.add(m[0]);
  for (const name of classMemberAnchors(source.split(/\r?\n/))) anchors.add(name);
  anchors.delete("");
  return anchors;
}

/**
 * Members of a `class` body: a method or field is a citable construct exactly
 * as a top-level binding is. Scoped to the one indentation level directly under
 * a class header, so statements nested inside a method body are not indexed as
 * anchors.
 */
function classMemberAnchors(lines: string[]): string[] {
  const indentOf = (line: string): number => line.length - line.trimStart().length;
  const names: string[] = [];
  let classIndent: number | undefined;
  let memberIndent: number | undefined;
  for (const line of lines) {
    if (line.trim() === "") continue;
    if (/^[\t ]*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s/.test(line)) {
      classIndent = indentOf(line);
      memberIndent = undefined;
      continue;
    }
    if (classIndent === undefined) continue;
    if (indentOf(line) <= classIndent) {
      classIndent = undefined;
      continue;
    }
    memberIndent ??= indentOf(line);
    if (indentOf(line) !== memberIndent) continue;
    const member =
      /^[\t ]*(?:(?:public|private|protected|static|abstract|override|readonly|async|get|set)\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*[(:=?]/.exec(line);
    if (member !== null) names.push(member[1] ?? "");
  }
  return names;
}

/**
 * REQ-ID first: the identifier alternative would otherwise match at every
 * position a REQ-ID starts, splitting `SNK-i` into two tokens that match no
 * indexed anchor.
 */
const WINDOW_TOKENS = /[A-Z][A-Z0-9]+-[A-Za-z0-9]+|[A-Za-z_$][\w$]*/g;

/**
 * A path that is the whole content of a `'`- or `"`-quoted literal is machine
 * data (a read argument, a ratchet entry), not a citation, and names no symbol.
 * Backticks are excluded: markdown-backticked prose is the convention's own
 * recommended spelling of a citation, so exempting it would exempt the rule.
 */
function isDataReference(line: string, target: ConvertedFile): boolean {
  return citableForms(target).some((form) =>
    new RegExp(`(["'])${escapeForRegex(form)}\\1`).test(line),
  );
}

const citingFiles = walkCitingScope();

/** A symbol as a citation spells it: backticked, so ordinary prose words are out. */
const BACKTICKED_SYMBOL = /`([A-Za-z_$][\w$]*)`/g;

/**
 * Names that identify one converted file on their own: anchored at module scope
 * in exactly one of them and declared by no other module under `src/**`. Both
 * narrowings are load-bearing for symbol-anchored attribution. A name bound
 * inside a function body is not a construct prose cites — `leaf` is a local in
 * `src/runtime/err-note-render.ts`, and admitting it mis-attributed three
 * continuations of a spec-page walk description to that file — and a name two
 * modules declare identifies neither.
 */
const distinctiveAnchors: ReadonlyMap<string, ConvertedFile> = (() => {
  const owners = new Map<string, ConvertedFile | undefined>();
  for (const target of CONVERTED_FILES) {
    for (const name of anchorIndex(readFileSync(target, "utf8"), true)) {
      owners.set(name, owners.has(name) ? undefined : target);
    }
  }
  for (const file of citingFiles) {
    if (!file.startsWith("src/") || !file.endsWith(".ts")) continue;
    if ((CONVERTED_FILES as readonly string[]).includes(file)) continue;
    for (const name of anchorIndex(readFileSync(file, "utf8"), true)) owners.delete(name);
  }
  const distinctive = new Map<string, ConvertedFile>();
  for (const [name, target] of owners) if (target !== undefined) distinctive.set(name, target);
  return distinctive;
})();

describe("bug 0134 — citations into converted files name symbols, not lines", () => {
  it("declares a reachable citing scope and converted-file set", () => {
    for (const root of CITING_ROOTS) {
      expect(existsSync(root), `citing root missing from the tree: ${root}`).toBe(true);
    }
    for (const target of CONVERTED_FILES) {
      expect(existsSync(target), `converted file missing from the tree: ${target}`).toBe(true);
    }
    expect(citingFiles.length, "citing scope walked to zero files").toBeGreaterThan(0);
  });

  it("refuses the line form: no converted file is cited with a line number", () => {
    const forms = CONVERTED_FILES.flatMap(citableForms).map(escapeForRegex).join("|");
    // `<form>:<digits>`, optionally a hyphen/en-dash range. A closing quote may
    // stand between the two: `"<form>":<digits>` is the same claim about a
    // position, spelled with the path quoted.
    const lineForm = new RegExp(
      `${BOUNDARY}(${forms})["']?:\\d+(?:\\s*[-\u2013]\\s*\\d+)?`,
      "g",
    );

    const lengths = new Map(CONVERTED_FILES.map((t) => [t, convertedFileLength(t)] as const));
    const offenders: Site[] = [];
    let unattributable = 0;
    for (const citingFile of citingFiles) {
      const lines = readFileSync(citingFile, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        for (const m of line.matchAll(lineForm)) {
          offenders.push({
            citingFile,
            citingLine: index + 1,
            citedText: m[0],
            target: targetOf(m[1] ?? ""),
          });
        }
        for (const m of line.matchAll(CONTINUATION_LINE_FORM)) {
          const citedLine = Number(/\d+/.exec(m[0])?.[0] ?? "0");
          const token = continuationTarget(
            lines,
            index,
            m.index ?? 0,
            citedLine,
            citingFile.endsWith(".md"),
            lengths,
          );
          if (token === undefined) {
            unattributable += 1;
            continue;
          }
          const target = matchConverted(token);
          if (target === undefined) continue;
          offenders.push({
            citingFile,
            citingLine: index + 1,
            citedText: `${m[0]} (continuing ${token})`,
            target,
          });
        }
      });
    }

    // The residual channel: continuations whose run names neither a line-cited
    // file nor a symbol distinctive to a converted file, so they are attributed
    // to nothing and a stale one into a converted file would pass unseen. The
    // count is pinned to keep the channel visible and non-growing — a new
    // unattributable continuation either names its file, or names its symbol and
    // moves this number down. Measured over the citing scope at the pin.
    const RESIDUAL = 415;
    expect(
      unattributable,
      `continuations attributed to nothing: ${unattributable}, pinned at ${RESIDUAL}. ` +
        "A rise means a new citation whose file the prose does not name. Name the file " +
        "beside the number, or name the symbol, rather than raising the pin.",
    ).toBeLessThanOrEqual(RESIDUAL);

    const perTarget = CONVERTED_FILES.map(
      (t) => `  ${t}: ${offenders.filter((o) => o.target === t).length}`,
    ).join("\n");
    const distinctFiles = new Set(offenders.map((o) => o.citingFile)).size;

    expect(
      offenders.map(formatSite),
      `line-form citations into converted files: ${offenders.length} sites in ` +
        `${distinctFiles} files\nper target:\n${perTarget}\n` +
        offenders.map(formatSite).join("\n"),
    ).toEqual([]);
  });

  it("resolves every line-free citation of a converted file to a symbol it declares", () => {
    const forms = CONVERTED_FILES.flatMap(citableForms).map(escapeForRegex).join("|");
    const symbolForm = new RegExp(`${BOUNDARY}(${forms})(?!:\\d)`, "g");
    const anchors = new Map(
      CONVERTED_FILES.map((t) => [t, anchorIndex(readFileSync(t, "utf8"))] as const),
    );

    const unresolved: Site[] = [];
    let resolved = 0;
    for (const citingFile of citingFiles) {
      const lines = readFileSync(citingFile, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        for (const m of line.matchAll(symbolForm)) {
          const target = targetOf(m[1] ?? "");
          if (isDataReference(line, target)) continue;
          const window = lines
            .slice(Math.max(0, index - SYMBOL_WINDOW), index + SYMBOL_WINDOW + 1)
            .join("\n");
          const index_ = anchors.get(target);
          if (index_ === undefined) throw new Error(`no anchor index for ${target}`);
          const hit = (window.match(WINDOW_TOKENS) ?? []).some((token) => index_.has(token));
          if (hit) resolved += 1;
          else
            unresolved.push({
              citingFile,
              citingLine: index + 1,
              citedText: m[0],
              target,
            });
        }
      });
    }

    expect(resolved, "no symbol-form citation of a converted file found at all").toBeGreaterThan(0);
    expect(
      unresolved.map(formatSite),
      `citations naming no symbol declared in the cited file: ${unresolved.length}\n` +
        unresolved.map(formatSite).join("\n"),
    ).toEqual([]);
  });
});
