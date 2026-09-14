// A "recursively list every non-test `.ts` file under a directory" walker for
// the src/**-tree architectural-scan test files (PTQ-0265).
//
// WHY THIS FILE EXISTS. tests/clock-id-seams.test.ts,
// tests/cross-cutting-gates.test.ts, and tests/di-seam-skeleton.test.ts each
// independently declared the same `tsFiles(dir)` function to walk the real
// `src/**` tree for a different architectural invariant (the
// ambient-timing/crypto ban, the module-level-mutable-binding ban, and the
// ambient-primitive ban, respectively). This module centralises that one
// shared declaration; each file's own choice of what invariant to scan the
// returned list for stays local.
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module. `tsFiles` reads the real filesystem
// (`readdirSync`/`statSync`); it is not a fake or double.

import { readdirSync, statSync } from "node:fs";
import path from "node:path";

/** Every non-test `.ts` file under `dir`, walked recursively. */
export function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...tsFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}
