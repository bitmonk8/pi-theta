// Offline contracts for the shared filesystem double and full-document load driver.

import { describe, expect, it } from "vitest";
import { fakeThetaLibFs, importCheckCodes } from "./helpers/thetalib-load-harness";

describe("fakeThetaLibFs", () => {
  it("serves listed UTF-8 files and rejects absent paths", async () => {
    const fs = fakeThetaLibFs({ "/proj/a.thetalib": "// café\n", "/proj/b.thetalib": "" });
    expect(fs.cwd()).toBe("/proj");
    await expect(fs.readdir("/proj")).resolves.toEqual(["a.thetalib", "b.thetalib"]);
    await expect(fs.readBytes("/proj/a.thetalib")).resolves.toEqual(new TextEncoder().encode("// café\n"));
    await expect(fs.readBytes("/proj/b.thetalib")).resolves.toEqual(new Uint8Array());
    await expect(fs.readBytes("/proj/missing.thetalib")).rejects.toThrow("ENOENT: /proj/missing.thetalib");
    await expect(fs.readdir("/missing")).rejects.toThrow("ENOENT: /missing");
  });

  it("lists unreadable paths but rejects their bytes with EACCES, even when content exists", async () => {
    const fs = fakeThetaLibFs(
      { "/proj/readable.thetalib": "ok", "/proj/blocked.thetalib": "hidden" },
      ["/proj/unreadable.thetalib", "/proj/blocked.thetalib"],
    );
    await expect(fs.readdir("/proj")).resolves.toEqual([
      "readable.thetalib", "blocked.thetalib", "unreadable.thetalib", "blocked.thetalib",
    ]);
    await expect(fs.readBytes("/proj/readable.thetalib")).resolves.toEqual(new TextEncoder().encode("ok"));
    for (const path of ["/proj/unreadable.thetalib", "/proj/blocked.thetalib"]) {
      await expect(fs.readBytes(path)).rejects.toMatchObject({
        message: `EACCES: permission denied, open '${path}'`,
        code: "EACCES",
      });
    }
  });
});

describe("importCheckCodes", () => {
  const source = '---\nmode: prompt\n---\nimport { af } from "./a.thetalib"\n"done"\n';

  it("resolves relative imports at the supplied full-document path", async () => {
    await expect(importCheckCodes(source, "/proj/nested/probe.theta", {
      "/proj/nested/a.thetalib": "fn af(x: integer): integer { x }\n",
    })).resolves.toEqual([]);
  });

  it("reports transitive load errors rather than only parsing the importing theta", async () => {
    await expect(importCheckCodes(source, "/proj/nested/probe.theta", {
      "/proj/nested/a.thetalib": 'import { bf } from "./missing.thetalib"\nfn af(x: integer): integer { x }\n',
    })).resolves.toEqual(["theta/load/unresolvable-thetalib-path"]);
  });

  it("fails the attribution precondition when frontmatter cannot parse", async () => {
    await expect(importCheckCodes("not a theta document", "/proj/probe.theta", {})).rejects.toThrow(
      "attribution: /proj/probe.theta frontmatter must parse or the load pass reads nothing",
    );
  });
});
