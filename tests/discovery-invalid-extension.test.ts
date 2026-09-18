import { byCode } from "./helpers/e2e-s1";
import { describe, expect, it } from "vitest";
import { discoverThetas } from "../src/discovery/discovery-walk";
import {
  FakeFileSystem,
  ancestors,
  mergeDirs,
  DISCOVERY_BASE as BASE,
  discoveryInput as input,
} from "./helpers/fake-file-system";

// V20f-T — failing tests for the paired `V20f` production-wiring fix (Bucket C:
// implemented wrongly). A `--theta <file>` / settings `thetaPaths` entry naming a
// non-`.theta` file MUST emit `theta/load/invalid-extension` per Lexical
// §"Extension matching" ("the settings/CLI extension check") and the
// `thetaPaths` entry schema in discovery/package-and-settings.md, with the
// message sourced from the diagnostics/code-registry-load.md *Message* column.
//
// These tests red today because the CLI `--theta` path reclassifies a non-`.theta`
// regular file to `theta/load/wrong-type-source` (the currently-dead
// `invalid-extension` path is never reached on the CLI source), so the
// assertions red on the wrong emitted code — the discovery walk runs and
// classifies, it is the emitted diagnostic that is wrong, not a compile error,
// fixture, or harness throw.

const HOME = "/home/theta";
const CWD = "/project";

interface FakeSpec {
  readonly dirs?: Record<string, readonly string[]>;
  readonly files?: Record<string, string>;
}

function build(spec: FakeSpec): FakeFileSystem {
  return new FakeFileSystem({
    homedir: HOME,
    cwd: CWD,
    dirs: mergeDirs(BASE, spec.dirs ?? {}),
    files: spec.files ?? {},
    errors: {},
    symlinks: {},
  });
}

// --------------------------------------------------------------------------
// theta/load/invalid-extension — a CLI/settings non-`.theta` file entry (Lexical
// §"Extension matching"; discovery/package-and-settings.md `thetaPaths` schema).
// --------------------------------------------------------------------------

describe("V20f-T — non-`.theta` file entry → theta/load/invalid-extension", () => {
  it("theta/load/invalid-extension: a `--theta <file>` entry naming a non-`.theta` file emits invalid-extension, not wrong-type-source", async () => {
    // A regular file with a `.md` extension named on the CLI. Lexical
    // §"Extension matching" routes the settings/CLI extension check to
    // `theta/load/invalid-extension`; today the CLI source reclassifies it to
    // `theta/load/wrong-type-source`, so this reds.
    const fs = build({
      dirs: { ...ancestors("/x/foo.md"), "/x": ["foo.md"] },
      files: { "/x/foo.md": "not a theta" },
    });
    const { diagnostics } = await discoverThetas(input(fs, { cliPaths: ["/x/foo.md"] }));

    expect(byCode(diagnostics, "theta/load/invalid-extension")).toHaveLength(1);
    expect(byCode(diagnostics, "theta/load/wrong-type-source")).toHaveLength(0);
  });

  it("theta/load/invalid-extension: both a `--theta <file>` and a settings `thetaPaths` non-`.theta` file entry emit invalid-extension, never wrong-type-source", async () => {
    // One CLI entry (`/x/foo.md`) and one settings entry (`/y/bar.md`), both
    // non-`.theta` regular files. Per Lexical §"Extension matching" both sides
    // of the "settings/CLI extension check" emit `theta/load/invalid-extension`.
    const fs = build({
      dirs: {
        ...ancestors("/x/foo.md"),
        "/x": ["foo.md"],
        ...ancestors("/y/bar.md"),
        "/y": ["bar.md"],
      },
      files: { "/x/foo.md": "not a theta", "/y/bar.md": "not a theta" },
    });
    const { diagnostics } = await discoverThetas(
      input(fs, { cliPaths: ["/x/foo.md"], settings: { thetaPaths: ["/y/bar.md"] } }),
    );

    // Both entries must surface invalid-extension; none may surface
    // wrong-type-source. Today the CLI entry emits wrong-type-source, so the
    // count is 1/1 rather than the required 2/0.
    expect(byCode(diagnostics, "theta/load/invalid-extension")).toHaveLength(2);
    expect(byCode(diagnostics, "theta/load/wrong-type-source")).toHaveLength(0);

    // Message anchor: the diagnostics carry the registry *Message* tail for
    // `theta/load/invalid-extension` (code-registry-load.md:
    // `'thetaPaths[<index>]' resolves to '<path>' which does not end in .theta`).
    for (const d of byCode(diagnostics, "theta/load/invalid-extension")) {
      expect(d.severity).toBe("error");
      expect(d.message).toContain("does not end in .theta");
    }
  });
});
