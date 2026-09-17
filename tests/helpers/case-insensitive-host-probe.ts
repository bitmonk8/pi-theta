// Runtime host-case-sensitivity probes for bug-witness test files.
//
// WHY THIS FILE EXISTS. tests/b0361-case-variant-import-dir-identity.test.ts
// and tests/b0362-case-variant-invoke-cycle-edge.test.ts each independently
// declared an async `detectCaseInsensitiveHost` probe sharing the identical
// `fsp.readdir(...).then(ok, err)` control flow and ENOENT-check-else-rethrow
// body, differing only in which already-populated directory/entry pair each
// bug's fixture layout happens to probe. This module centralises that shared
// control flow, parameterised on the probe directory and entry; each file's
// own fixture layout (and any extra file it plants before probing) stays
// local (PTQ-0269).
//
// `filesystemIsCaseInsensitive` (PTQ-0387) centralises a second,
// differently-shaped probe tests/b0329-hash-mismatch-refuses-invocation.test.ts
// declared: synchronous and self-contained, driven by writing a lowercase
// throwaway file and attempting the uppercase read, rather than `readdir`ing
// an already-populated directory/entry pair — not a drop-in for
// `detectCaseInsensitiveHost` above.
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module. Both probes read the real filesystem; neither
// is a fake or double.

import { promises as fsp, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Runtime host-case-sensitivity probe. After `<root>/<probeDir>` exists and
 * contains `probeEntry`, `readdir` the (caller-supplied, already-uppercased)
 * `probeDir` spelling: a resolution whose entries include `probeEntry` means
 * the host is case-INSENSITIVE; an ENOENT rejection means case-SENSITIVE. An
 * unexpected error rejects (fails loudly), never silently degrading the
 * branch selection — the `.then(ok, err)` rejection arm is the sanctioned
 * pattern (mirrors `PiFileSystem.exists`), not a broad `catch`.
 */
export async function detectCaseInsensitiveHost(
  root: string,
  probeDir: string,
  probeEntry: string,
): Promise<boolean> {
  return fsp.readdir(join(root, probeDir)).then(
    (entries) => entries.includes(probeEntry),
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return false;
      }
      throw error;
    },
  );
}

/**
 * Whether `dir`'s filesystem is case-insensitive: write a lowercase file,
 * attempt the uppercase read. A successful read ⇒ case-insensitive. Only ENOENT
 * is the case-sensitive signal; any other error is a real fault and rethrows
 * (no swallow — CLAUDE.md/AGENTS.md "let crash"). The probe file lives in
 * `dir` and is removed before this returns.
 */
export function filesystemIsCaseInsensitive(dir: string): boolean {
  const lower = join(dir, "b0329-case-probe-aa");
  writeFileSync(lower, "x", "utf8");
  try {
    readFileSync(join(dir, "b0329-case-probe-AA"), "utf8");
    return true;
  } catch (probeError: unknown) {
    const code = (probeError as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw probeError;
    }
    return false;
  } finally {
    rmSync(lower, { force: true });
  }
}
