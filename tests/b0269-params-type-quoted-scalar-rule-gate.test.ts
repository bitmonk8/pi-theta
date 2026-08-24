import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// b0269 — conformance oracle over the `params:` **Type side** prose on the
// frontmatter authoring surface: the spec topic
// docs/spec_topics/frontmatter/frontmatter-fields-a.md and its reference mirror
// docs/reference/frontmatter.md.
//
// THE DEFECT (docs/bugs/0269-frontmatter-fields-a-params-type-side-silent-on-quoted-scalar-rule.md).
// Both Type-side bullets describe the right-hand side as inline text, not a
// YAML structure, and treat quoting only as a spelling that does not change the
// judgement of recovered text. Neither states the constraint YAML imposes on
// how that text is spelled: a type text whose first character is `"` or `'`
// must itself be written as a quoted YAML scalar — `p: '"a" | "b"'` — because
// the unwrapped `p: "a" | "b"` is not valid YAML and refuses the whole
// frontmatter block with `theta/load/malformed-frontmatter-yaml`. The remedy
// exists at fork in exactly one place: the *Hint* cell of that diagnostic's row
// in docs/spec_topics/diagnostics/code-registry-load.md, on that file's line 17.
//
// WHAT THIS FILE ASSERTS. Two prose cells, one per page, each over its own
// page's Type-side bullet, in the pattern of
// tests/b0266-category6-string-literal-rationale-gate.test.ts. Each cell
// requires four elements, matched as load-bearing tokens rather than a verbatim
// sentence so the wording stays the editor's:
//
//   1  the bullet names a type text that STARTS WITH / BEGINS WITH a quote
//      character (or names its first character);
//   2  it requires that text be written as a QUOTED YAML SCALAR — the whole
//      scalar wrapped;
//   3  it shows the authored form `p: '"a" | "b"'`;
//   4  it names `theta/load/malformed-frontmatter-yaml` as what the unwrapped
//      form draws;
//
//   and it requires the four to sit in one region: a proximity window over the
//   joined bullet text, so they cannot be scattered across the bullet.
//
// LOCKs, guarded here because they are cheap:
//
//   - Neither page gains a bullet. The fix extends an existing bullet in place;
//     the sub-bullet counts of the two `params:` regions are pinned to what
//     they are at fork sha d653d877 (two each).
//   - The registry *Hint* cell is not restated verbatim into either page. The
//     added prose mirrors the Hint's rule in each page's own register; the
//     exact Hint string is read out of the registry row and must appear in
//     neither page.
//
// Out of scope, per bug 0269 §Non-goals: the `p: "a"` quote-stripping face
// (a well-formed YAML scalar stripped to the text `a`, drawing
// `theta/parse/unresolved-named-type`). Nothing here asserts over it.
//
// Offline, provider-free, deterministic: three `readFileSync` calls over
// committed documentation. No precondition is tolerated silently — an
// unreadable page, an unlocatable heading, or an unlocatable bullet throws
// naming the unmet precondition (CLAUDE.md: no silent test skipping).

const SPEC_PATH = "docs/spec_topics/frontmatter/frontmatter-fields-a.md";
const MIRROR_PATH = "docs/reference/frontmatter.md";
const REGISTRY_PATH = "docs/spec_topics/diagnostics/code-registry-load.md";

/** Sub-bullet counts of the two `params:` regions, measured at fork sha d653d877. */
const SPEC_PARAMS_SUBBULLETS_AT_FORK = 2;
const MIRROR_PARAMS_BULLETS_AT_FORK = 2;

function readDoc(relPath: string, why: string): string[] {
  const path = fileURLToPath(new URL(`../${relPath}`, import.meta.url));
  try {
    return readFileSync(path, "utf8").split(/\r?\n/);
  } catch (cause) {
    throw new Error(
      `b0269 precondition unmet: cannot read ${relPath} at ${path} — this file is a conformance oracle over ${why}, so an unreadable page is a hard failure, never a skip. Cause: ${String(cause)}`,
    );
  }
}

/** The sole index of a line satisfying `pred`, or a throw naming the precondition. */
function soleIndex(lines: readonly string[], pred: (l: string) => boolean, what: string): number {
  const hits: number[] = [];
  lines.forEach((line, i) => {
    if (pred(line)) hits.push(i);
  });
  if (hits.length !== 1) {
    throw new Error(
      `b0269 precondition unmet: expected exactly one ${what}, found ${hits.length}. The prose under test is located by content, not by position; a retitled or split bullet must re-point this gate deliberately rather than delete it.`,
    );
  }
  return hits[0] as number;
}

/** Newlines and wrap indentation collapse to single spaces, so a wrapped clause reads as one. */
function joinBullet(lines: readonly string[]): string {
  return lines.join("\n").replace(/\s*\r?\n\s*/g, " ").trim();
}

/**
 * The spec topic's Type-side bullet is one line of markdown, so the line IS the
 * bullet.
 */
function specTypeSideBullet(lines: readonly string[]): string {
  const i = soleIndex(
    lines,
    (l) => l.startsWith("  - **Type side.**"),
    `sub-bullet opening '  - **Type side.**' in ${SPEC_PATH}`,
  );
  return joinBullet([lines[i] as string]);
}

/**
 * The spec topic's `params:` region: from the `params` field-group bullet to
 * the `model` / `tools` field-group bullet that follows it. The `Defaults.`
 * sub-bullet sits inside that region, so the region carries two sub-bullets.
 */
function specParamsRegion(lines: readonly string[]): string[] {
  const start = soleIndex(
    lines,
    (l) => l.startsWith("- `params` are validated"),
    `field-group bullet opening '- \`params\` are validated' in ${SPEC_PATH}`,
  );
  const end = soleIndex(
    lines,
    (l) => l.startsWith("- `model` and `tools`"),
    `field-group bullet opening '- \`model\` and \`tools\`' in ${SPEC_PATH}`,
  );
  if (end <= start) {
    throw new Error(
      `b0269 precondition unmet: in ${SPEC_PATH} the 'model'/'tools' field-group bullet must follow the 'params' one; the two bullets delimit the region whose sub-bullet count this gate pins.`,
    );
  }
  return lines.slice(start, end);
}

/** The mirror's `## \`params:\`` section, heading excluded. */
function mirrorParamsSection(lines: readonly string[]): string[] {
  const start = soleIndex(
    lines,
    (l) => l.trim() === "## `params:`",
    `heading '## \`params:\`' in ${MIRROR_PATH}`,
  );
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if ((lines[i] as string).startsWith("## ")) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end);
}

/**
 * The mirror's Type-side bullet wraps at roughly 78 columns, so it is a block:
 * the `- **Type side.**` line up to the next line opening a bullet (`- **`).
 */
function mirrorTypeSideBullet(section: readonly string[]): string {
  const start = soleIndex(
    section,
    (l) => l.startsWith("- **Type side.**"),
    `bullet opening '- **Type side.**' under '## \`params:\`' in ${MIRROR_PATH}`,
  );
  let end = section.length;
  for (let i = start + 1; i < section.length; i += 1) {
    if ((section[i] as string).startsWith("- **")) {
      end = i;
      break;
    }
  }
  return joinBullet(section.slice(start, end));
}

/** The *Hint* cell of the `theta/load/malformed-frontmatter-yaml` row. */
function malformedYamlHintCell(): string {
  const lines = readDoc(REGISTRY_PATH, "the load registry row this fix must not restate verbatim");
  const i = soleIndex(
    lines,
    (l) => l.startsWith("| `theta/load/malformed-frontmatter-yaml` |"),
    `row for \`theta/load/malformed-frontmatter-yaml\` in ${REGISTRY_PATH}`,
  );
  // Trailing empty cell from the leading and trailing pipes drops out; the Hint
  // is the second-to-last populated cell, the message template the last.
  const cells = (lines[i] as string)
    .split(" | ")
    .map((c) => c.replace(/^\|\s*/, "").replace(/\s*\|$/, "").trim());
  const hint = cells[cells.length - 2];
  if (hint === undefined || !hint.includes("quote")) {
    throw new Error(
      `b0269 precondition unmet: could not read the Hint cell off the \`theta/load/malformed-frontmatter-yaml\` row in ${REGISTRY_PATH} — the LOCK guard needs that cell's exact text to prove it is not restated verbatim. Read: ${String(hint)}`,
    );
  }
  return hint;
}

function matchIndices(text: string, needle: RegExp): number[] {
  const re = new RegExp(
    needle.source,
    needle.flags.includes("g") ? needle.flags : `${needle.flags}g`,
  );
  const out: number[] = [];
  for (const m of text.matchAll(re)) out.push(m.index ?? 0);
  return out;
}

/**
 * True when some occurrence of `anchor` carries every one of `tokens` within
 * `window` characters either side. A proximity window stands in for "in the
 * same region" without demanding a sentence-splitting heuristic.
 */
function nearAll(
  text: string,
  anchor: RegExp,
  tokens: readonly RegExp[],
  window = 500,
): boolean {
  return matchIndices(text, anchor).some((at) => {
    const slice = text.slice(Math.max(0, at - window), at + window);
    return tokens.every((t) => t.test(slice));
  });
}

/** Element 1 — a type text whose first character is a quote. */
const LEADING_QUOTE =
  /(?:start|begin|open)\w*\s+with[^.]{0,60}quote|first\s+character[^.]{0,60}quote/i;
/** Element 2 — the text must be spelled as a quoted YAML scalar. */
const QUOTED_SCALAR =
  /quoted\s+(?:YAML\s+)?scalar|scalar[^.]{0,40}(?:quoted|in\s+quotes)|wrap\w*[^.]{0,60}scalar/i;
/** Element 3 — the authored form, tolerant of internal whitespace. */
const AUTHORED_FORM = /p:\s*'"a"\s*\|\s*"b"'/;
/** Element 4 — the code the unwrapped form draws. */
const MALFORMED_CODE = /theta\/load\/malformed-frontmatter-yaml/;

const specLines = readDoc(SPEC_PATH, "its `params:` Type-side bullet");
const mirrorLines = readDoc(MIRROR_PATH, "its `params:` Type-side bullet");
const SPEC_BULLET = specTypeSideBullet(specLines);
const MIRROR_SECTION = mirrorParamsSection(mirrorLines);
const MIRROR_BULLET = mirrorTypeSideBullet(MIRROR_SECTION);

describe("b0269 — the params: Type side states the leading-quote quoted-scalar rule", () => {
  it(`1: ${SPEC_PATH} — the spec topic's Type-side bullet carries the rule`, () => {
    expect(
      LEADING_QUOTE.test(SPEC_BULLET),
      `b0269: the Type-side bullet in ${SPEC_PATH} must name the case it is silent on — a type text whose first character is a quote (\`"\` or \`'\`)`,
    ).toBe(true);
    expect(
      QUOTED_SCALAR.test(SPEC_BULLET),
      `b0269: the Type-side bullet in ${SPEC_PATH} must require such a text to be written as a quoted YAML scalar — the whole scalar wrapped`,
    ).toBe(true);
    expect(
      AUTHORED_FORM.test(SPEC_BULLET),
      `b0269: the Type-side bullet in ${SPEC_PATH} must show the authored form \`p: '"a" | "b"'\``,
    ).toBe(true);
    expect(
      MALFORMED_CODE.test(SPEC_BULLET),
      `b0269: the Type-side bullet in ${SPEC_PATH} must name \`theta/load/malformed-frontmatter-yaml\` as what the unwrapped spelling draws, refusing the whole frontmatter block`,
    ).toBe(true);
    expect(
      nearAll(SPEC_BULLET, AUTHORED_FORM, [LEADING_QUOTE, QUOTED_SCALAR, MALFORMED_CODE]),
      `b0269: in ${SPEC_PATH} the four elements — leading quote, quoted YAML scalar, the authored form, and \`theta/load/malformed-frontmatter-yaml\` — must sit in one region of the Type-side bullet, not scattered across it`,
    ).toBe(true);
  });

  it(`2: ${MIRROR_PATH} — the reference mirror's Type-side bullet carries the rule`, () => {
    expect(
      LEADING_QUOTE.test(MIRROR_BULLET),
      `b0269: the Type-side bullet under '## \`params:\`' in ${MIRROR_PATH} must name a type text whose first character is a quote (\`"\` or \`'\`)`,
    ).toBe(true);
    expect(
      QUOTED_SCALAR.test(MIRROR_BULLET),
      `b0269: the Type-side bullet in ${MIRROR_PATH} must require such a text to be written as a quoted YAML scalar — the whole scalar wrapped`,
    ).toBe(true);
    expect(
      AUTHORED_FORM.test(MIRROR_BULLET),
      `b0269: the Type-side bullet in ${MIRROR_PATH} must show the authored form \`p: '"a" | "b"'\` (matched over the bullet with its wrap collapsed, so line breaks do not hide it)`,
    ).toBe(true);
    expect(
      MALFORMED_CODE.test(MIRROR_BULLET),
      `b0269: the Type-side bullet in ${MIRROR_PATH} must name \`theta/load/malformed-frontmatter-yaml\` as what the unwrapped spelling draws`,
    ).toBe(true);
    expect(
      nearAll(MIRROR_BULLET, AUTHORED_FORM, [LEADING_QUOTE, QUOTED_SCALAR, MALFORMED_CODE]),
      `b0269: in ${MIRROR_PATH} the four elements must sit in one region of the Type-side bullet, not scattered across it`,
    ).toBe(true);
  });

  it("3: LOCK — the addition extends the existing bullets and adds no new one", () => {
    const specSub = specParamsRegion(specLines).filter((l) => /^ {2}- \*\*/.test(l));
    expect(
      specSub.length,
      `b0269 LOCK: the \`params:\` region of ${SPEC_PATH} carries ${SPEC_PARAMS_SUBBULLETS_AT_FORK} sub-bullets (Type side, Defaults) at fork sha d653d877; the fix extends the Type-side bullet in place, so a changed count means a new section or a split bullet`,
    ).toBe(SPEC_PARAMS_SUBBULLETS_AT_FORK);
    const mirrorBullets = MIRROR_SECTION.filter((l) => /^- \*\*/.test(l));
    expect(
      mirrorBullets.length,
      `b0269 LOCK: the '## \`params:\`' section of ${MIRROR_PATH} carries ${MIRROR_PARAMS_BULLETS_AT_FORK} bullets (Type side, Defaults) at fork sha d653d877; the mirror addition extends the Type-side bullet in place`,
    ).toBe(MIRROR_PARAMS_BULLETS_AT_FORK);
  });

  it("4: LOCK — the registry Hint is mirrored in each page's register, not restated verbatim", () => {
    const hint = malformedYamlHintCell();
    for (const [path, lines] of [
      [SPEC_PATH, specLines],
      [MIRROR_PATH, mirrorLines],
    ] as const) {
      expect(
        lines.join("\n").includes(hint),
        `b0269 LOCK: the *Hint* cell of the \`theta/load/malformed-frontmatter-yaml\` row — ${REGISTRY_PATH}, that file's line 17 at fork sha d653d877 — must not be copied verbatim into ${path}. The added prose states the same rule in the page's own register; the registry cell itself stays byte-unchanged.`,
      ).toBe(false);
    }
  });
});
