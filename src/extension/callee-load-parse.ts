// Shared callee read/parse gate for static arity and return-type resolution.

import type { FileSystem } from "../seams/file-system";
import type { ParsedFrontmatter } from "../parser/frontmatter";
import type { ThetaBody } from "../parser/theta-document";
import { parseViaPassCache, type PassParseDeps } from "./pass-parse-cache";
import { hasLoadParseError } from "./production-discovered-theta";

/** Read a statically resolvable callee's frontmatter and body, or return undefined. */
export async function readCalleeDocument(
  fs: FileSystem,
  absolutePath: string,
  deps: PassParseDeps,
): Promise<{ readonly frontmatter: ParsedFrontmatter; readonly body: ThetaBody } | undefined> {
  const bytes = await fs.readBytes(absolutePath).then(
    (value) => value,
    () => undefined,
  );
  if (bytes === undefined) {
    return undefined;
  }
  // Bug 0264: route through the pass-scoped cache — this callee may already
  // have been parsed this pass (a discovered theta, or another `.theta`-callable
  // arity check reaching the same file).
  const document = parseViaPassCache({ path: absolutePath, bytes }, deps);
  if (document.frontmatter === null || hasLoadParseError(document.diagnostics)) {
    return undefined;
  }
  return { frontmatter: document.frontmatter, body: document.body };
}
