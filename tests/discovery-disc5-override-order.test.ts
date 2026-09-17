import { expect, it } from "vitest";
import { discoverThetas } from "../src/discovery/discovery-walk";
import { discoverPackageThetas } from "../src/discovery/package-discovery";
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileSystem } from "./helpers/fake-file-system";

// DISC-5 (docs/spec_topics/discovery/package-and-settings.md): one table drives
// resolveSettingsSource (src/discovery/discovery-walk.ts) and resolvePiThetas
// (src/discovery/package-discovery.ts) through their public entry points.
// The no-plain starting set is package-specific: settings starts empty.
// A flat tree isolates override selection from directory contribution rules.
const ROOT = "/project/node_modules/p";
const FILES = ["a.theta", "b.theta", "c.theta", "x.theta"];

it.each([
  {
    name: "plain literal includes select their union, not the whole universe",
    entries: ["a.theta", "b.theta"],
    settings: ["a.theta", "b.theta"],
    package: ["a.theta", "b.theta"],
  },
  {
    name: "a plain glob selects matching files",
    entries: ["*.theta"],
    settings: FILES,
    package: FILES,
  },
  {
    name: "! drops matches after plain includes regardless of array order",
    entries: ["![bc].theta", "*.theta"],
    settings: ["a.theta", "x.theta"],
    package: ["a.theta", "x.theta"],
  },
  {
    name: "+ re-admits one exact path after ! regardless of array order",
    entries: ["+b.theta", "![bc].theta", "*.theta"],
    settings: ["a.theta", "b.theta", "x.theta"],
    package: ["a.theta", "b.theta", "x.theta"],
  },
  {
    name: "all four phases leave - with final precedence",
    entries: ["*.theta", "!{b,c,x}.theta", "+b.theta", "+x.theta", "-x.theta"],
    settings: ["a.theta", "b.theta"],
    package: ["a.theta", "b.theta"],
  },
  {
    name: "reversed array order preserves all four phases and final - precedence",
    entries: ["-x.theta", "+x.theta", "+b.theta", "!{b,c,x}.theta", "*.theta"],
    settings: ["a.theta", "b.theta"],
    package: ["a.theta", "b.theta"],
  },
  {
    name: "- treats its operand as an exact path, not a glob",
    entries: ["*.theta", "-*.theta"],
    settings: FILES,
    package: FILES,
  },
  {
    name: "an empty array selects the package universe but no settings paths",
    entries: [],
    settings: [],
    package: FILES,
  },
  {
    name: "! without plain includes filters only the package fallback",
    entries: ["!b.theta"],
    settings: [],
    package: ["a.theta", "c.theta", "x.theta"],
  },
  {
    name: "+ without plain includes adds to the source-specific starting set",
    entries: ["+b.theta"],
    settings: ["b.theta"],
    package: FILES,
  },
  {
    name: "- wins over + even without plain includes",
    entries: ["-x.theta", "+x.theta"],
    settings: [],
    package: ["a.theta", "b.theta", "c.theta"],
  },
])("DISC-5 shared override vectors: $name", async (vector) => {
  const fs = new FakeFileSystem({
    homedir: "/home/theta",
    cwd: "/project",
    dirs: {
      "/project/node_modules": ["p"],
      [ROOT]: ["package.json", ...FILES],
    },
    files: {
      [`${ROOT}/package.json`]: JSON.stringify({ pi: { theta: vector.entries } }),
      ...Object.fromEntries(FILES.map((file) => [`${ROOT}/${file}`, "mode: prompt\n---\n"])),
    },
  });

  const settings = await discoverThetas({
    fs,
    settings: { thetaPaths: vector.entries, thetaPathsBaseDir: ROOT },
  });
  const pkg = await discoverPackageThetas({ fs, clock: new FakeClock(), settings: {} });

  expect(settings.thetas.map((theta) => theta.path).sort()).toEqual(
    vector.settings.map((file) => `${ROOT}/${file}`).sort(),
  );
  expect(pkg.thetas.map((theta) => theta.path).sort()).toEqual(
    vector.package.map((file) => `${ROOT}/${file}`).sort(),
  );
  expect(settings.diagnostics).toEqual([]);
  expect(pkg.diagnostics).toEqual([]);
});
