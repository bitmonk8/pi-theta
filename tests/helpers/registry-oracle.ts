// The shared four-page diagnostics-registry read (PTQ-0215).
//
// WHY THIS FILE EXISTS. `RegistryRow` and the `REGISTRY` load it backs — read
// the four sharded registry pages (code-registry-{parse,load,runtime,host}.md),
// parse each through the real `parseRegistry`, and join the rows into one
// array — were redeclared byte-for-byte (confirmed via `diff`) in several test
// files. This module centralises that read only: each file's own
// `registryMessageOf` / `registryRowOf`-shaped reader — whose assertion style
// and wording vary per file — stays local, parameterised by the `REGISTRY` this
// module exports rather than by a locally re-parsed copy.
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry } from "../../tools/code-registry/index.js";

/** A parsed row of the sharded code registry, as `parseRegistry` yields it. */
export interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** Read only the requested shards, preserving page-specific registry oracles. */
export function readRegistry(
  shards: readonly ("parse" | "load" | "runtime" | "host")[],
): readonly RegistryRow[] {
  return parseRegistry(
    shards
      .map((shard) =>
        readFileSync(
          fileURLToPath(
            new URL(`../../docs/spec_topics/diagnostics/code-registry-${shard}.md`, import.meta.url),
          ),
          "utf8",
        ),
      )
      .join("\n"),
  ) as RegistryRow[];
}

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);
