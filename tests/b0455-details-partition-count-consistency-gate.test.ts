import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// b0455 — count words / enumerations across the corpus track the
// `theta-system-note` `details` partition (five shapes, disjoint by key).
//
// Bug 0455 (docs/bugs/0455-details-partition-four-count-staleness.md) records a
// doc-internal inconsistency: bug 0432 (0.424.0) grew the channel's closed
// `details` partition to FIVE shapes by adding the `{ shutdown }` arm, and bug
// 0434 (0.433.0) generalised the matrix's first row to own the 21-class
// operator-facing serialised content, but ten summarising surfaces still say
// "four" (or enumerate four diagnostic-batch terms), and the channel bullet
// that bug 0436 head-widened to five terms still prescribes content for only
// three of them. The spec truth the whole corpus already carries is FIVE:
//   - runtime-event-channel.md:20 — "one of five normative payload shapes".
//   - runtime-event-channel.md:41 — "The five `details` shapes are disjoint".
//
// THE SETTLED FIX this file scores, from bug 0455 §Fix (one mechanical
// prose/comment/count-word sweep; the partition, matrix rows, and emitted bytes
// are untouched — §Non-goals):
//   (a) overview-and-orientation.md:65 — the *Runtime observability* bullet's
//       Diagnostics-ownership clause widens to name the operator-facing-routed
//       batch class (or drops the enumeration for the ownerless form).
//   (b) runtime-event-channel.md:22 — the diagnostics bullet's content TAIL
//       gains a content arm for the non-BNDR-9 operator-facing-routed case
//       (the head already names five batch classes; the tail carries three).
//   (c) coverage-matrix.md:183 — cka-58 reads "five `details` shapes".
//   (d) runtime-event-channel.ts:4 — module header reads "five `details`
//       variants".
//   (e)–(j) six test headers stop carrying the retired four-partition phrasings.
//
// Two directions per §Fix and §Expected behaviour: the RED-now cells assert the
// SPECIFIED (post-fix) behaviour, not the fork's; the GREEN-control cell F pins
// the byte-identical spec-truth neighbours the sweep must NOT touch, proving the
// gate reads real content and can distinguish green from red.
//
// Offline, provider-free, deterministic: every surface is read with fs and
// scored by content. A missing target file/line is a LOUD harness failure that
// names the surface — never a skip, so no cell can pass vacuously.

const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

/**
 * Read a corpus file. Unreadable or empty is a harness-precondition failure
 * that names the unmet precondition and throws — bug 0455 names each surface, so
 * an absent file must fail loudly rather than let a cell score nothing.
 */
function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is a surface bug 0455 owns — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(`harness precondition unmet: ${rel} is empty; nothing to score`);
  }
  return text;
}

/** Split tolerant of either terminator so scoring never depends on EOL flavor. */
const linesOf = (text: string): readonly string[] => text.split(/\r?\n/);

/**
 * The 1-based `n`th physical line of `rel`. A file with fewer than `n` lines is
 * a loud harness failure naming the surface — the task pins these count words to
 * specific lines, so a truncated/moved page must not let a cell pass vacuously.
 */
function lineAt(rel: string, n: number): string {
  const lines = linesOf(readCorpus(rel));
  if (lines.length < n) {
    throw new Error(
      `harness precondition unmet: ${rel} has ${lines.length} lines, fewer than the line ${n} bug 0455 pins — the surface moved; failing loudly rather than scoring an absent line`,
    );
  }
  return lines[n - 1] as string;
}

/**
 * Precondition anchor: assert a stable substring is present on an already-read
 * line, or fail loudly. Guards against the pinned line drifting out from under a
 * count-word cell (the count assertion would otherwise score the wrong line).
 */
function requireAnchor(rel: string, n: number, line: string, anchor: string): void {
  if (!line.includes(anchor)) {
    throw new Error(
      `harness precondition unmet: ${rel} line ${n} no longer contains the locate anchor "${anchor}" — the surface bug 0455 pins has moved; re-derive the line before trusting this cell. Line read: ${line.slice(0, 200)}`,
    );
  }
}

const OVERVIEW = "docs/spec_topics/overview-and-orientation.md";
const CHANNEL = "docs/spec_topics/pi-integration-contract/runtime-event-channel.md";
const COVERAGE = "docs/plan_topics/coverage-matrix.md";
const RUNTIME_TS = "src/runtime/runtime-event-channel.ts";

// The six test-file headers carrying instances (e)–(j).
const HEADER_FILES = [
  "tests/b0383-slsh4-note-details-event.test.ts",
  "tests/b0398-custom-type-unsafe-note-details-diagnostics.test.ts",
  "tests/b0404-custom-type-unsafe-note-matrix-row.test.ts",
  "tests/b0436-shape-enumeration-sentences-gate.test.ts",
  "tests/tool-registration-lifetime.test.ts",
  "tests/b0401-informational-notes-omit-details.test.ts",
] as const;

// The retired partition phrasings, each falsified by the five-shape spec truth.
// The bare word "four" is deliberately NOT banned: legitimate non-instances live
// in the same corpus (four registry table pages, four `internal-error` carve-out
// codes, four captured `event.reason` forms, b0401's four matrix-less
// informational notes) — bug 0455 §Non-goals. Only these exact partition
// phrases are stale.
const RETIRED_PARTITION_PHRASES = [
  "four normative arms",
  // Generic hyphenated form: covers instance (i) at tool-registration-lifetime
  // line 85 ("the four-shape `SystemNote` type"), whose referent spelling no
  // `details`-suffixed phrase matches, so cell E's claim to cover (e)–(j) would
  // otherwise be overstated for (i).
  "four-shape",
  "four-shape `details",
  "four-arm partition",
  "four normative payload shapes",
  "four `- `details",
  "four `details` shapes",
  "reading the four",
  "fixed four-shape",
] as const;

describe("bug 0455 — corpus count words / enumerations track the five-shape `details` partition", () => {
  // =========================================================================
  // RED-at-fork cells (A–E). Bug 0455 §Fix makes each green.
  // =========================================================================

  it("cell A (RED-now) — overview-and-orientation.md:65 Diagnostics-ownership clause names the operator-facing-routed batch class (or is ownerless)", () => {
    const n = 65;
    const line = lineAt(OVERVIEW, n);
    requireAnchor(OVERVIEW, n, line, "Runtime observability");
    // bug 0455 §Fix (a): widen to "… / runtime-panic / operator-facing-routed
    // diagnostic batches", or reword to the ownerless "the diagnostic batches
    // that share the channel are owned by [Diagnostics]". At the fork the clause
    // reads "the parse / load / type / runtime-panic diagnostic batches …" —
    // four terms, excluding the operator-facing-routed class (21 registry rows
    // per 0434) that Diagnostics likewise owns.
    const namesClass = line.includes("operator-facing-routed diagnostic batches");
    const ownerless = line.includes("the diagnostic batches that share the channel are owned by");
    expect(
      namesClass || ownerless,
      `cell A: ${OVERVIEW} line ${n} — the *Runtime observability* bullet's Diagnostics-ownership clause must either name the operator-facing-routed batch class ("operator-facing-routed diagnostic batches") or use the ownerless form ("the diagnostic batches that share the channel are owned by"). Neither present at the fork — the clause enumerates only "parse / load / type / runtime-panic diagnostic batches" (four terms). Line read: ${line.slice(0, 320)}`,
    ).toBe(true);
  });

  it("cell B (RED-now) — runtime-event-channel.md:22 diagnostics bullet's content tail carries the non-BNDR-9 operator-facing-routed content arm", () => {
    const n = 22;
    const line = lineAt(CHANNEL, n);
    // GREEN controls: the b0265/b0404 locate predicates must survive the fix —
    // the bullet stays a single physical line with the same prefix and still
    // names the runtime-panic case (bug 0455 §Fix (b) keeps both).
    expect(
      line.startsWith("- `details: { diagnostics: Diagnostic[] }`"),
      `cell B control: ${CHANNEL} line ${n} must still start with "- \`details: { diagnostics: Diagnostic[] }\`" (the b0265/b0404 locate prefix). Line read: ${line.slice(0, 120)}`,
    ).toBe(true);
    expect(
      line.includes("runtime-panic case"),
      `cell B control: ${CHANNEL} line ${n} must still contain "runtime-panic case" (the b0265/b0404 locate predicate). Line read: ${line.slice(0, 320)}`,
    ).toBe(true);
    // RED-now: bug 0455 §Fix (b) appends a content arm for the non-BNDR-9
    // operator-facing-routed case. At the fork the tail enumerates only three
    // content arms (parse/load/type; runtime-panic; BNDR-9), so the head's fifth
    // term has no content rule in the bullet that introduces it.
    expect(
      line.includes("routed as a note other than the BNDR-9"),
      `cell B: ${CHANNEL} line ${n} — the diagnostics bullet's content tail must carry a content arm for the non-BNDR-9 operator-facing-routed case ("routed as a note other than the BNDR-9"). Absent at the fork: the tail enumerates only three arms (parse/load/type; runtime-panic; BNDR-9) while the head names five batch classes. Line read: ${line.slice(0, 480)}`,
    ).toBe(true);
  });

  it("cell C (RED-now) — coverage-matrix.md:183 cka-58 row reads five `details` shapes", () => {
    const n = 183;
    const line = lineAt(COVERAGE, n);
    requireAnchor(COVERAGE, n, line, "cka-58");
    expect(
      line.includes("the five `details` shapes are disjoint"),
      `cell C: ${COVERAGE} line ${n} — the cka-58 row must read "the five \`details\` shapes are disjoint" (spec truth: runtime-event-channel.md:41). Line read: ${line.slice(0, 320)}`,
    ).toBe(true);
    expect(
      line.includes("the four `details` shapes"),
      `cell C: ${COVERAGE} line ${n} — the cka-58 row must NOT contain the retired "the four \`details\` shapes" phrasing. Line read: ${line.slice(0, 320)}`,
    ).toBe(false);
  });

  it("cell D (RED-now) — runtime-event-channel.ts:4 module header reads five `details` variants", () => {
    const n = 4;
    const line = lineAt(RUNTIME_TS, n);
    requireAnchor(RUNTIME_TS, n, line, "matrix across the");
    expect(
      line.includes("five `details` variants"),
      `cell D: ${RUNTIME_TS} line ${n} — the module header must read "five \`details\` variants" (the matrix at runtime-event-channel.md:28–40 pairs five variants). Line read: ${line.slice(0, 200)}`,
    ).toBe(true);
    expect(
      line.includes("four `details` variants"),
      `cell D: ${RUNTIME_TS} line ${n} — the module header must NOT contain the retired "four \`details\` variants" phrasing. Line read: ${line.slice(0, 200)}`,
    ).toBe(false);
  });

  it("cell E (RED-now) — no test-file header carries a retired four-partition phrasing (sites e–j)", () => {
    const hits: string[] = [];
    for (const rel of HEADER_FILES) {
      const lines = linesOf(readCorpus(rel));
      lines.forEach((line, index) => {
        for (const phrase of RETIRED_PARTITION_PHRASES) {
          if (line.includes(phrase)) {
            hits.push(`${rel}:${index + 1} — "${phrase}" — ${line.trim().slice(0, 160)}`);
          }
        }
      });
    }
    expect(
      hits,
      `cell E: no test-file header may carry a retired four-partition phrasing (bug 0455 §Fix (c)–(j) rewrites the partition count/enumeration to five). Retired phrases scanned: [${RETIRED_PARTITION_PHRASES.join(
        ", ",
      )}]. The bare word "four" is intentionally NOT banned (legitimate non-instances exist — §Non-goals). Stale hits at the fork:\n${hits.join("\n")}`,
    ).toEqual([]);
  });

  // =========================================================================
  // GREEN-control cell F. Green at the fork AND after the fix — the spec truth
  // the sweep must NOT touch. Proves the gate reads real content and pins the
  // byte-identical neighbours the RED cells derive their "five" from.
  // =========================================================================

  it("cell F (GREEN-control) — runtime-event-channel.md:20/:42 carry the five-shape spec truth", () => {
    const intro = lineAt(CHANNEL, 20);
    expect(
      intro.includes("one of five normative payload shapes"),
      `cell F: ${CHANNEL} line 20 must contain the spec-truth intro "one of five normative payload shapes" (untouched by bug 0455's sweep). Line read: ${intro.slice(0, 240)}`,
    ).toBe(true);
    const disjoint = lineAt(CHANNEL, 42);
    expect(
      disjoint.includes("The five `details` shapes are disjoint by key"),
      `cell F: ${CHANNEL} line 42 must contain the spec-truth "The five \`details\` shapes are disjoint by key" (untouched by bug 0455's sweep). Line read: ${disjoint.slice(0, 240)}`,
    ).toBe(true);
  });
});
