// Bug 0440 — the discovery walk's cross-source-shadow mint site renders the
// `<higher>` / `<lower>` placeholders as bare resolved file paths
// (`winner.path` / `shadowed.path`) instead of the normative descriptor form
// `<kind>:"<value>"` the placeholder pin requires, and its sibling
// same-priority-collision arm wraps each `<paths>` element in placeholder-
// supplied single quotes the registry template does not authorise
// (docs/bugs/0440-cross-source-shadow-descriptor-form.md).
//
// The interpolation rule is normative:
//   - `<higher>` / `<lower>` are descriptor-shaped, rendered via the category-5
//     `<descriptor>` rule `<kind>:"<value>"` — kind unquoted from the closed
//     set, value the descriptor's source text verbatim
//     (docs/spec_topics/diagnostics/placeholder-rendering-b.md §5 "The
//     descriptor format is normative." / §7 "Descriptor-shaped (`<higher>`,
//     `<lower>`)"), byte-exact vector at placeholder-rendering-b.md:84.
//   - `<paths>` joins bare paths with `, ` and "Any quoting in the rendered
//     message comes from the surrounding registry template"
//     (placeholder-rendering-b.md §5/§7); the collision registry template
//     supplies no per-path quotes.
//
// WHY the registry code strings are located by MESSAGE FRAGMENT, never by their
// literal namespaced code text: the closed-set corpus gate
// (tests/registry-closed-set-corpus-gate.test.ts) pins that the shadow code has
// NO literal-code occurrence under tests/ (its carve-out entry is the code's
// only appearance there), and the shipped extractor treats any code-shaped
// literal in a tests/** source — comments included — as an assertion.
// Introducing either code literal here would break that gate. Filtering on the
// fragment mirrors the one pre-existing witness of this message
// (tests/b0331-root-winner-preempt.test.ts).
//
// RED against the current tree for the right reason:
//   - arms 1 & 2 red because the shadow mint site in `resolveSlashNames`
//     (`src/discovery/discovery-walk.ts`) renders bare `winner.path` /
//     `shadowed.path`, not `<kind>:"<value>"`.
//   - arm 3 reds because the same-priority-collision arm in `resolveSlashNames`
//     (`src/discovery/discovery-walk.ts`) wraps each path in single quotes.
// GREEN once the parent-adjudicated §Fix threads each candidate's descriptor
// value and renders the descriptor form / drops the placeholder-supplied quotes.

import { describe, expect, it } from "vitest";
import { discoverThetas, type DiscoveryInput } from "../src/discovery/discovery-walk";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { FakeFileSystem } from "./helpers/fake-file-system";

const HOME = "/home/theta";
const CWD = "/project";
// globalAgentDir() = <homedir>/.pi/agent, project root = <cwd>/.pi/theta —
// the two conventional roots' resolved directory paths (0268 forward-slashed),
// which the fix renders as the project/global descriptor VALUES.
const GLOBAL_ROOT = "/home/theta/.pi/agent/theta";
const PROJECT_ROOT = "/project/.pi/theta";

// The two message FRAGMENTS the two diagnostics carry — the shadow arm and the
// same-priority collision arm. Located by fragment (never by registry code) to
// keep the corpus gate's no-literal-code carve-out intact.
const SHADOW_FRAGMENT = "shadowed across discovery sources";
const COLLISION_FRAGMENT = "collides at the same priority";

/** Proper-ancestor directories of `leaf` as empty dirs, so a clean-leaf ENOENT
 *  walk finds every ancestor enterable. The leaf itself is NOT registered. */
function ancestors(leaf: string): Record<string, string[]> {
  const segs = leaf.split("/").filter((s) => s.length > 0);
  const out: Record<string, string[]> = { "/": [] };
  let parent = "/";
  for (let i = 0; i < segs.length - 1; i++) {
    const path = parent === "/" ? `/${segs[i]}` : `${parent}/${segs[i]}`;
    out[path] = [];
    parent = path;
  }
  return out;
}

/** Merge several dirs maps, concatenating entry lists for shared keys. */
function mergeDirs(
  ...maps: Record<string, readonly string[]>[]
): Record<string, readonly string[]> {
  const out: Record<string, string[]> = {};
  for (const m of maps) {
    for (const [k, v] of Object.entries(m)) {
      out[k] = [...(out[k] ?? []), ...v];
    }
  }
  return out;
}

interface FakeSpec {
  readonly dirs?: Record<string, readonly string[]>;
  readonly files?: Record<string, string>;
}

function build(spec: FakeSpec): FakeFileSystem {
  return new FakeFileSystem({
    homedir: HOME,
    cwd: CWD,
    dirs: spec.dirs ?? {},
    files: spec.files ?? {},
  });
}

function input(fs: FakeFileSystem, extra: Partial<DiscoveryInput> = {}): DiscoveryInput {
  return { fs, settings: {}, ...extra };
}

const THETA_BODY = "mode: prompt\n---\n";

/** All diagnostics whose message carries `fragment`. */
function byFragment(diagnostics: readonly Diagnostic[], fragment: string): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.message.includes(fragment));
}

/** The single diagnostic carrying `fragment`, or a loud failure naming the
 *  unmet precondition — never a silent skip when the expected diagnostic is
 *  absent or duplicated (the witness would otherwise be vacuous). */
function soleByFragment(diagnostics: readonly Diagnostic[], fragment: string): Diagnostic {
  const hits = byFragment(diagnostics, fragment);
  expect(
    hits,
    `expected exactly one diagnostic whose message contains '${fragment}'; got ${hits.length}: ${JSON.stringify(hits.map((d) => d.message))}`,
  ).toHaveLength(1);
  return hits[0]!;
}

// --------------------------------------------------------------------------
// Arm 1 — cli-flag vs settings. A `--theta` file (priority 1) and a settings
// `thetaPaths` file (priority 2) derive the same slash name; the cli source
// wins. The winner descriptor value is the CLI operand as passed
// (`--theta <raw>`); the shadowed descriptor value is the settings entry text
// verbatim. Byte-exact against placeholder-rendering-b.md:84's worked form.
// --------------------------------------------------------------------------

describe("b0440 arm 1 — cli-flag vs settings shadow renders the descriptor form", () => {
  it("renders 'cli-flag:\"--theta …\"' wins over 'settings:\"…\"', not bare paths", async () => {
    const fs = build({
      dirs: mergeDirs(
        ancestors("/ext/plan.theta"),
        { "/ext": ["plan.theta"] },
        ancestors("/work/plan.theta"),
        { "/work": ["plan.theta"] },
      ),
      files: {
        "/ext/plan.theta": THETA_BODY,
        "/work/plan.theta": THETA_BODY,
      },
    });

    const { diagnostics } = await discoverThetas(
      input(fs, {
        cliPaths: ["/ext/plan.theta"],
        settings: { thetaPaths: ["/work/plan.theta"] },
      }),
    );

    const shadow = soleByFragment(diagnostics, SHADOW_FRAGMENT);
    expect(shadow.message).toBe(
      `slash name 'plan' shadowed across discovery sources: 'cli-flag:"--theta /ext/plan.theta"' wins over 'settings:"/work/plan.theta"'`,
    );
  });
});

// --------------------------------------------------------------------------
// Arm 2 — project vs global. The §Fix adjudicates the descriptor kinds absent
// from the closed §5 set for these two conventional sources: project→`project`,
// global→`global`; the descriptor VALUE is the conventional root's resolved
// directory path, forward-slashed (0268).
// --------------------------------------------------------------------------

describe("b0440 arm 2 — project vs global shadow renders the descriptor form", () => {
  it("renders 'project:\"…/.pi/theta\"' wins over 'global:\"…/.pi/agent/theta\"', not bare paths", async () => {
    const fs = build({
      dirs: mergeDirs(
        ancestors(`${PROJECT_ROOT}/dup.theta`),
        { [PROJECT_ROOT]: ["dup.theta"] },
        ancestors(`${GLOBAL_ROOT}/dup.theta`),
        { [GLOBAL_ROOT]: ["dup.theta"] },
      ),
      files: {
        [`${PROJECT_ROOT}/dup.theta`]: THETA_BODY,
        [`${GLOBAL_ROOT}/dup.theta`]: THETA_BODY,
      },
    });

    const { diagnostics } = await discoverThetas(input(fs));

    const shadow = soleByFragment(diagnostics, SHADOW_FRAGMENT);
    expect(shadow.message).toBe(
      `slash name 'dup' shadowed across discovery sources: 'project:"/project/.pi/theta"' wins over 'global:"/home/theta/.pi/agent/theta"'`,
    );
  });
});

// --------------------------------------------------------------------------
// Arm 3 — same-priority collision quoting rider. Two settings directory entries
// (both priority 2) each ship `col.theta`; the E-arm fires. The registry
// template supplies no per-path quotes, so `<paths>` must join bare paths with
// `, ` — the placeholder-supplied single quotes are the sibling micro-
// divergence the §Fix removes.
// --------------------------------------------------------------------------

describe("b0440 arm 3 — same-priority collision joins bare paths with no per-path quotes", () => {
  it("renders the two colliding paths bare, comma-space joined, with no placeholder-supplied quotes", async () => {
    // The two settings dir entries. Held in constants so no source literal
    // contains a contiguous `theta`-namespaced-slash-word substring the
    // closing-gate extractor would misread as a bogus asserted registry code;
    // the RUNTIME values (and therefore the byte-exact message below) are
    // exactly `/a/theta` and `/b/theta` as the §Fix spec pins them.
    const dirA = "/a/theta";
    const dirB = "/b/theta";
    const fs = build({
      dirs: mergeDirs(
        ancestors(`${dirA}/col.theta`),
        { [dirA]: ["col.theta"] },
        ancestors(`${dirB}/col.theta`),
        { [dirB]: ["col.theta"] },
      ),
      files: {
        [`${dirA}/col.theta`]: THETA_BODY,
        [`${dirB}/col.theta`]: THETA_BODY,
      },
    });

    const { diagnostics } = await discoverThetas(
      input(fs, { settings: { thetaPaths: [dirA, dirB] } }),
    );

    const collision = soleByFragment(diagnostics, COLLISION_FRAGMENT);
    // (a) No placeholder-supplied per-path quote: the current arm wraps each
    // path in `'…'`, so a single-quote immediately preceding a path separator
    // (`'/`) is the exact divergence. Unconditional — holds whatever the join
    // order turns out to be.
    expect(collision.message).not.toContain(`'/`);
    // (b) Bare, comma-space joined. This fixture (dirA before dirB) satisfies
    //     both the insertion order and §7's priority-then-path order pin, which
    //     bug 0440 §Non-goals leaves out of scope — the assertion turns on the
    //     absence of quotes and the `, ` join, not on the order.
    expect(collision.message).toBe(
      `slash name 'col' collides at the same priority: ${dirA}/col.theta, ${dirB}/col.theta`,
    );
  });
});
