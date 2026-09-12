// A runtime host-case-sensitivity probe for the b0361/b0362 case-variant
// bug-witness files (PTQ-0269).
//
// WHY THIS FILE EXISTS. tests/b0361-case-variant-import-dir-identity.test.ts
// and tests/b0362-case-variant-invoke-cycle-edge.test.ts each independently
// declared an async `detectCaseInsensitiveHost` probe sharing the identical
// `fsp.readdir(...).then(ok, err)` control flow and ENOENT-check-else-rethrow
// body, differing only in which already-populated directory/entry pair each
// bug's fixture layout happens to probe. This module centralises that shared
// control flow, parameterised on the probe directory and entry; each file's
// own fixture layout (and any extra file it plants before probing) stays
// local.
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module. `detectCaseInsensitiveHost` reads the real
// filesystem (`fsp.readdir`); it is not a fake or double.

import { promises as fsp } from "node:fs";
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
