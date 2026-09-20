// Shared root-path resolution and cache-key spelling for callable closures.

import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Resolve the closure root and its forward-slash-normalised cache key. */
export function resolveCallableClosurePath(
  ctx: ExtensionContext,
  callerPath: string | undefined,
  calleePath: string,
): { readonly rootAbs: string; readonly cacheKey: string } {
  const baseDir = callerPath !== undefined ? dirname(callerPath) : ctx.cwd;
  const rootAbs = isAbsolute(calleePath) ? calleePath : resolvePath(baseDir, calleePath);
  const cacheKey = rootAbs.replace(/\\/g, "/");
  return { rootAbs, cacheKey };
}
