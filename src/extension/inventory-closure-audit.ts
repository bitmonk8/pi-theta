// V18b / V18b-T — the build-time inventory-closure audit seam.
//
// This module owns the negative-direction *inventory-closure audit* the
// pi-integration-contract audit shards specify (a post-1.0 hardening that
// mechanizes the loom-1.0 *surface-set closure* MUST):
//
//   • inventory-audit-intro.md §"Inventory-closure audit"
//   • audit-resolution.md   (scope, per-category join keys, exemption /
//                            malformed- / stale-marker discriminators)
//   • audit-recognised-shapes.md (recognised category-(1)/(2)/(3) shapes and
//                            the non-exemptible family-(4) prohibited shapes)
//   • audit-target-categories.md (the three target surface categories + the
//                            typebox `{ Type }` / `{ Unsafe }` sibling
//                            allow-lists)
//   • audit-failures.md     (the five-family Failure-surface contract, the
//                            three-class `audit/<class>/<family>/<symptom>`
//                            discriminator shape, the per-family record shape)
//   • audit-wire-and-canary.md (wire serialisation, fail-closed
//                            infrastructure-failure handling, the non-empty
//                            two-counter canary)
//
// The audit resolves every recognised Pi-side surface reference in the audited
// source tree against the `SDK_SURFACE_INVENTORY` rows + entry-kind taxonomy
// `V18a` establishes, the typebox sibling allow-lists, or a declared
// `// allow-pi-surface:` marker, and surfaces every unresolved / prohibited
// reference under exactly one of the five families as an
// `audit/<class>/<family>/<symptom>` record. It additionally emits, on every
// invocation, the non-empty-scan canary's two counters.
//
// SEAM SHAPE (V18b-T). The audit core is a pure function over an already-read
// in-memory file map (POSIX-form audited-source-tree path -> UTF-8 content),
// the inventory, and the two typebox allow-lists — so file-system walking,
// symlink/encoding handling, and the fail-closed infrastructure wrapper the
// spec assigns to the audit's disk driver stay outside this pure core and off
// the *Sequential by default* blocking-runtime surface. The V18b implementation
// fills `runInventoryClosureAudit` in (and wires a thin disk-walk + `npm test`
// driver around it); this tests-task ships the seam + a non-compliant stub so
// the paired failing tests red on their own primary assertions.

import ts from "typescript";
import type { SurfaceInventoryEntry } from "./sdk-inventory";

/** The literal five-character `<n/a>` sentinel (audit-wire-and-canary.md). */
const NA = "<n/a>";

/** The four `@earendil-works/*` peer packages the audit's category (2) covers. */
const PEER_PACKAGES = [
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-tui",
] as const;

/** The canonical carrier-type literals (audit-target-categories.md (1)/(3)). */
const CTX_TYPES: ReadonlySet<string> = new Set(["ExtensionContext", "ExtensionCommandContext"]);
const PI_TYPE = "ExtensionAPI";

/**
 * The three-class partition every emitted record's discriminator carries in its
 * `<class>` segment (audit-failures.md §"Three-class partition"): the five
 * inventory-closure-audit violation families, infrastructure failures, and the
 * non-empty-scan canary.
 */
export type AuditClass = "violation" | "infra" | "canary";

/**
 * One emitted audit record (audit-failures.md §"Failure-surface contract" +
 * §"Per-family record-shape table"; audit-wire-and-canary.md §"Wire
 * serialisation"). `discriminator` is the leading `audit/<class>/<family>/
 * <symptom>` token; the four packed fields follow in fixed order.
 */
export interface AuditRecord {
  /** The `audit/<class>/<family>/<symptom>` discriminator token. */
  readonly discriminator: string;
  /** Offending source path, or the literal `<n/a>` sentinel. */
  readonly path: string;
  /** 1-based integer line as a string, or the literal `<n/a>` sentinel. */
  readonly line: string;
  /** Family-keyed symbol value, or the literal `<n/a>` sentinel. */
  readonly symbol: string;
  /** Plain-ASCII resolution arm the contributor would take. */
  readonly proposedResolution: string;
}

/**
 * The build-time inputs the closure audit resolves against.
 *
 * `files` is the already-read audited source tree keyed by POSIX-form path
 * (the disk driver the V18b implementation wraps this core in owns the
 * `src/**\/*.ts`-minus-exclusions glob, symlink, and encoding rules). The
 * `inventory` is the `SDK_SURFACE_INVENTORY` V18a pins; the two allow-lists are
 * the typebox `{ Type }` named-import and `{ Unsafe }` member-access siblings.
 */
export interface AuditInput {
  /** POSIX-form audited-source-tree path -> UTF-8 file content. */
  readonly files: ReadonlyMap<string, string>;
  /** The `SDK_SURFACE_INVENTORY` rows (V18a). */
  readonly inventory: readonly SurfaceInventoryEntry[];
  /** typebox named-import allow-list (loom 1.0: `{ Type }`). */
  readonly typeboxNamedImportAllowList: readonly string[];
  /** typebox member-access allow-list (loom 1.0: `{ Unsafe }`). */
  readonly typeboxMemberAccessAllowList: readonly string[];
}

/**
 * The audit's structured result: the ordered emitted records plus the
 * non-empty-scan canary's two counters (audit-wire-and-canary.md
 * §"Non-empty-scan canary") — the number of audited source files walked and
 * the number of in-scope surface references recognised.
 */
export interface AuditResult {
  readonly records: readonly AuditRecord[];
  readonly walked: number;
  readonly recognised: number;
}

/** A record plus its deterministic (file-index, byte-offset) sort key. */
interface OrderedRecord {
  readonly record: AuditRecord;
  readonly fileIndex: number;
  readonly pos: number;
}

/** Collapse every run of whitespace (incl. newlines) to a single ASCII space. */
function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Rightmost dot-separated segment of an inventory `id` (category-(1)/(3) key). */
function rightmostSegment(id: string): string {
  const parts = id.split(".");
  return parts[parts.length - 1] ?? id;
}

/** Leftmost dot-separated segment of an inventory `id` (category-(2) key). */
function leftmostSegment(id: string): string {
  return id.split(".")[0] ?? id;
}

/** True iff `spec` names one of the four peer packages (bare or sub-path). */
function isPeerPackage(spec: string): boolean {
  return PEER_PACKAGES.some((p) => spec === p || spec.startsWith(`${p}/`));
}

/** True iff `spec` names the typebox package (bare or sub-path). */
function isTypebox(spec: string): boolean {
  return spec === "typebox" || spec.startsWith("typebox/");
}

/** True iff `spec` is any in-scope peer/typebox specifier. */
function isInScopeSpecifier(spec: string): boolean {
  return isPeerPackage(spec) || isTypebox(spec);
}

/**
 * Parse a same-line trailing `// allow-pi-surface:` marker on `lineText`.
 * Returns `"well-formed"`, `"malformed"` (candidate prefix but bad grammar), or
 * `null` (no candidate prefix at all — not a lexical exemption candidate).
 * (audit-resolution.md §Exemption mechanism / Malformed-marker discriminator.)
 */
function classifyMarker(lineText: string): "well-formed" | "malformed" | null {
  // Candidate prefix: a `//` line-comment whose letter/`-` run case-folds to
  // `allow-pi-surface`. Block-comment (`/*`) candidates are malformed (clause g).
  const blockCandidate = /\/\*\s*allow-pi-surface/i.test(lineText);
  const lineCandidate = /\/\/\s*([A-Za-z-]+)/.exec(lineText);
  const candidateRun = lineCandidate?.[1];
  const isCandidate =
    (candidateRun !== undefined && candidateRun.toLowerCase() === "allow-pi-surface") ||
    blockCandidate;
  if (!isCandidate) return null;

  // Well-formed grammar: single-line `//`, lowercase-ASCII run, trailing `:`,
  // a REQ-<n> or PIC#<kebab> citation, an em-dash or hyphen-minus separator with
  // surrounding spaces, and a >=4-char justification carrying a non-punct char.
  const wf =
    /\/\/\s*allow-pi-surface:\s*(REQ-[0-9]+|PIC#[a-z0-9]+(?:-[a-z0-9]+)*)\s+(?:—|-)\s+(.+)$/.exec(
      lineText,
    );
  if (!wf) return "malformed";
  const justification = (wf[2] ?? "").trim();
  if (justification.length < 4) return "malformed";
  // At least one char that is neither ASCII whitespace nor ASCII punctuation.
  if (!/[^\s!-/:-@[-`{-~]/.test(justification)) return "malformed";
  return "well-formed";
}

/** The explicit textual type annotation of a parameter, or `null` if absent. */
function paramTypeText(p: ts.ParameterDeclaration, sf: ts.SourceFile): string | null {
  return p.type ? p.type.getText(sf).trim() : null;
}

/**
 * Run the inventory-closure audit over an in-memory audited source tree.
 *
 * A static-AST walker (no TypeScript program load): each file is parsed with
 * `ts.createSourceFile`, and category-(1)/(2)/(3) references, the non-exemptible
 * family-(4) shapes, and `// allow-pi-surface:` markers are recognised by source
 * shape, resolved against the inventory + the two typebox sibling allow-lists +
 * same-line markers, and surfaced as `audit/<class>/<family>/<symptom>` records.
 * On every invocation it additionally emits the non-empty-scan canary's two
 * counters and exactly one `audit/canary/...` record.
 */
export function runInventoryClosureAudit(input: AuditInput): AuditResult {
  const inventory = input.inventory;
  const cat1Members = new Set(
    inventory.filter((e) => e.id.startsWith("pi.")).map((e) => rightmostSegment(e.id)),
  );
  const cat3Members = new Set(
    inventory
      .filter(
        (e) =>
          e.id.startsWith("ctx.") ||
          e.id.startsWith("ExtensionContext.") ||
          e.id.startsWith("ExtensionCommandContext."),
      )
      .map((e) => rightmostSegment(e.id)),
  );
  // Category-(2) leftmost-segment keys: only single-segment named-import entry
  // ids (a `pi.`/`ctx.`-prefixed member id is a carrier-member key, not a
  // named-import key, so it never resolves a category-(2) import).
  const cat2Names = new Set(
    inventory
      .filter((e) => !e.id.includes(".") || /^[A-Z]/.test(e.id))
      .map((e) => leftmostSegment(e.id)),
  );
  const typeboxNamed = new Set(input.typeboxNamedImportAllowList);
  const typeboxMembers = new Set(input.typeboxMemberAccessAllowList);

  const ordered: OrderedRecord[] = [];
  let walked = 0;
  let recognised = 0;

  const paths = [...input.files.keys()].sort();
  paths.forEach((path, fileIndex) => {
    walked += 1;
    const content = input.files.get(path) ?? "";
    const lines = content.split("\n");
    const sf = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const lineOfPos = (pos: number): number =>
      sf.getLineAndCharacterOfPosition(pos).line + 1;
    const lineTextAt = (n: number): string => lines[n - 1] ?? "";

    // Lines carrying a non-exemptible family-(4) shape (clause-(h) + no-authorise).
    const familyFourLines = new Set<number>();

    const push = (
      pos: number,
      cls: AuditClass,
      family: string,
      symptom: string,
      line: string,
      symbol: string,
      proposedResolution: string,
    ): void => {
      ordered.push({
        record: {
          discriminator: `audit/${cls}/${family}/${symptom}`,
          path,
          line,
          symbol,
          proposedResolution,
        },
        fileIndex,
        pos,
      });
    };

    const emitFamilyFour = (pos: number, symptom: string, symbol: string): void => {
      const ln = lineOfPos(pos);
      familyFourLines.add(ln);
      recognised += 1;
      push(
        pos,
        "violation",
        "out-of-scope-shape",
        symptom,
        String(ln),
        singleLine(symbol),
        "rewrite-into-recognised-shape (see bump-step-2b-rewrite-shape)",
      );
    };

    // ---- Pass 1: family-(4) shapes (import/export/param shapes). ----
    const visitShapes = (n: ts.Node): void => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        const spec = n.moduleSpecifier.text;
        if (isInScopeSpecifier(spec)) {
          const ic = n.importClause;
          if (!ic) {
            emitFamilyFour(n.getStart(sf), "side-effect-import", n.getText(sf));
          } else {
            if (ic.name) emitFamilyFour(n.getStart(sf), "default-import", n.getText(sf));
            if (ic.namedBindings && ts.isNamespaceImport(ic.namedBindings)) {
              emitFamilyFour(n.getStart(sf), "namespace-import", n.getText(sf));
            }
            if (ic.namedBindings && ts.isNamedImports(ic.namedBindings)) {
              for (const el of ic.namedBindings.elements) {
                if (el.propertyName) {
                  emitFamilyFour(n.getStart(sf), "aliased-import", n.getText(sf));
                }
              }
            }
          }
        }
      }
      if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
        const spec = n.moduleSpecifier.text;
        if (isInScopeSpecifier(spec)) {
          if (!n.exportClause) {
            emitFamilyFour(n.getStart(sf), "export-star", n.getText(sf));
          } else if (ts.isNamespaceExport(n.exportClause)) {
            emitFamilyFour(n.getStart(sf), "export-star", n.getText(sf));
          } else if (ts.isNamedExports(n.exportClause)) {
            for (const el of n.exportClause.elements) {
              if (el.propertyName) {
                emitFamilyFour(n.getStart(sf), "aliased-export", n.getText(sf));
              }
            }
          }
        }
      }
      // Dynamic import() of an in-scope package.
      if (
        ts.isCallExpression(n) &&
        n.expression.kind === ts.SyntaxKind.ImportKeyword &&
        n.arguments.length === 1
      ) {
        const arg = n.arguments[0];
        if (arg && ts.isStringLiteral(arg) && isInScopeSpecifier(arg.text)) {
          emitFamilyFour(n.getStart(sf), "dynamic-import", n.getText(sf));
        }
      }
      // Off-canonical parameter carriers.
      if (ts.isParameter(n) && ts.isIdentifier(n.name)) {
        const name = n.name.text;
        const ty = paramTypeText(n, sf);
        if (name === "ctx" && (ty === null || !CTX_TYPES.has(ty))) {
          emitFamilyFour(n.getStart(sf), "off-canonical-annotation-ctx", n.getText(sf));
        } else if (name !== "ctx" && ty !== null && CTX_TYPES.has(ty)) {
          emitFamilyFour(n.getStart(sf), "off-canonical-name-ctx", n.getText(sf));
        }
        if (name === "pi" && ty !== null && ty !== PI_TYPE) {
          emitFamilyFour(n.getStart(sf), "off-canonical-annotation-pi", n.getText(sf));
        } else if (name !== "pi" && ty === PI_TYPE) {
          emitFamilyFour(n.getStart(sf), "off-canonical-name-pi", n.getText(sf));
        }
      }
      ts.forEachChild(n, visitShapes);
    };
    visitShapes(sf);

    // ---- Pass 3: collect category-(1)/(2)/(3) references (emitted in pass 4). ----
    interface Ref {
      readonly pos: number;
      readonly line: number;
      readonly family: string;
      readonly resolved: boolean;
      readonly symbol: string;
      readonly proposedResolution: string;
    }
    const refs: Ref[] = [];
    const resolveRef = (
      pos: number,
      family: string,
      resolvedByInventoryOrAllowList: boolean,
      symbol: string,
      proposedResolution: string,
    ): void => {
      recognised += 1;
      refs.push({
        pos,
        line: lineOfPos(pos),
        family,
        resolved: resolvedByInventoryOrAllowList,
        symbol,
        proposedResolution,
      });
    };

    // Is `Type` imported from typebox anywhere in this file (carrier for the
    // typebox member-access carve-out)?
    let typeboxTypeIsImported = false;
    const scanTypeImport = (n: ts.Node): void => {
      if (
        ts.isImportDeclaration(n) &&
        ts.isStringLiteral(n.moduleSpecifier) &&
        isTypebox(n.moduleSpecifier.text)
      ) {
        const ic = n.importClause;
        if (ic && ic.namedBindings && ts.isNamedImports(ic.namedBindings)) {
          for (const el of ic.namedBindings.elements) {
            if (!el.propertyName && el.name.text === "Type") typeboxTypeIsImported = true;
          }
        }
      }
      ts.forEachChild(n, scanTypeImport);
    };
    scanTypeImport(sf);

    // Category (2): named imports from the four peers + typebox.
    const visitRefs = (n: ts.Node): void => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        const spec = n.moduleSpecifier.text;
        const ic = n.importClause;
        if (ic && ic.namedBindings && ts.isNamedImports(ic.namedBindings)) {
          for (const el of ic.namedBindings.elements) {
            if (el.propertyName) continue; // aliased → family (4), handled in pass 1
            const nm = el.name.text;
            if (isTypebox(spec)) {
              resolveRef(
                el.getStart(sf),
                "peer-import",
                typeboxNamed.has(nm),
                `typebox#${nm}`,
                "promote-to-typebox-named-allow-list-or-add-allow-pi-surface-marker",
              );
            } else if (isPeerPackage(spec)) {
              resolveRef(
                el.getStart(sf),
                "peer-import",
                cat2Names.has(nm),
                `${spec}#${nm}`,
                "promote-to-inventory-or-add-allow-pi-surface-marker (see bump-step-2b-promote)",
              );
            }
          }
        }
      }
      // Member access on the canonical `pi` / `ctx` carriers, and typebox `Type`.
      if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) {
        const recv = n.expression.text;
        const member = n.name.text;
        if (recv === "pi" && inPiCarrier(n)) {
          resolveRef(
            n.name.getStart(sf),
            "pi-member",
            cat1Members.has(member),
            member,
            "promote-to-inventory-or-add-allow-pi-surface-marker (see bump-step-2b-promote)",
          );
        } else if (recv === "ctx" && inCtxCarrier(n)) {
          resolveRef(
            n.name.getStart(sf),
            "ctx-member",
            cat3Members.has(member),
            member,
            "promote-to-inventory-or-add-allow-pi-surface-marker (see bump-step-2b-promote)",
          );
        } else if (recv === "Type" && typeboxTypeIsImported) {
          resolveRef(
            n.name.getStart(sf),
            "peer-import",
            typeboxMembers.has(member),
            `typebox#Type.${member}`,
            "promote-to-typebox-member-allow-list-or-add-allow-pi-surface-marker",
          );
        }
      }
      ts.forEachChild(n, visitRefs);
    };

    visitRefs(sf);

    // ---- Pass 2: markers, scoped to lines carrying a reference or family-(4)
    // shape. Orphan / standalone markers on lines with no such surface are not
    // classified (a documented divergence: family-(5) (s1) no-surface-on-line
    // and stale sub-kinds are deferred). ----
    const authorisedLines = new Set<number>();
    const referenceLines = new Set(refs.map((r) => r.line));
    const markerLines = new Set<number>([...referenceLines, ...familyFourLines]);
    for (const ln of markerLines) {
      const kind = classifyMarker(lineTextAt(ln));
      if (kind === null) continue;
      const pos = sf.getPositionOfLineAndCharacter(ln - 1, 0);
      if (familyFourLines.has(ln)) {
        // Clause (h): a marker on a non-exemptible family-(4) line is malformed
        // and routes to family (5); the family-(4) record fired independently.
        push(
          pos,
          "violation",
          "stale-or-malformed-marker",
          "marker-on-non-exemptible-family-4-line",
          String(ln),
          NA,
          "delete-marker-and-rewrite-shape (see bump-step-2b-stale-rewrite)",
        );
        continue;
      }
      if (kind === "malformed") {
        push(
          pos,
          "violation",
          "stale-or-malformed-marker",
          "malformed-grammar",
          String(ln),
          NA,
          "rewrite-marker-grammar (see bump-step-2b-stale-rewrite)",
        );
        continue;
      }
      authorisedLines.add(ln);
    }

    // ---- Pass 4: emit reference violations (skip resolved / marker-authorised). ----
    for (const r of refs) {
      if (r.resolved) continue;
      if (authorisedLines.has(r.line)) continue;
      push(r.pos, "violation", r.family, "off-inventory", String(r.line), r.symbol, r.proposedResolution);
    }
  });

  // ---- Non-empty-scan canary (fail-closed, once per invocation). ----
  const canaryOk = walked > 0 && recognised > 0;
  ordered.push({
    record: {
      discriminator: canaryOk
        ? "audit/canary/scan-floor/ok"
        : recognised === 0
          ? "audit/canary/scan-floor/recognised-zero"
          : "audit/canary/scan-floor/walked-zero",
      path: NA,
      line: NA,
      symbol: NA,
      proposedResolution: `walked=${walked} recognised=${recognised}`,
    },
    // Sort the canary after every violation record.
    fileIndex: Number.MAX_SAFE_INTEGER,
    pos: Number.MAX_SAFE_INTEGER,
  });

  ordered.sort((a, b) => a.fileIndex - b.fileIndex || a.pos - b.pos);
  return { records: ordered.map((o) => o.record), walked, recognised };
}

/**
 * Serialise one audit record to its line-delimited wire form
 * (audit-wire-and-canary.md §"Wire serialisation"): the
 * `audit/<class>/<family>/<symptom>` discriminator, then a single ASCII tab,
 * then the `path:line` segment, then a tab, then `symbol`, then a tab, then
 * `proposed-resolution` — four tab-delimited fields, no trailing newline.
 */
export function formatAuditRecordLine(r: AuditRecord): string {
  return [r.discriminator, `${r.path}:${r.line}`, r.symbol, r.proposedResolution].join("\t");
}

/** True iff `node` is inside a function whose parameter is a `pi: ExtensionAPI` carrier. */
function inPiCarrier(node: ts.Node): boolean {
  return hasCarrierAncestor(node, "pi", (ty) => ty === PI_TYPE);
}

/** True iff `node` is inside a function whose parameter is a canonical `ctx` carrier. */
function inCtxCarrier(node: ts.Node): boolean {
  return hasCarrierAncestor(node, "ctx", (ty) => ty !== null && CTX_TYPES.has(ty));
}

function hasCarrierAncestor(
  node: ts.Node,
  name: string,
  typeOk: (ty: string | null) => boolean,
): boolean {
  let cur: ts.Node | undefined = node;
  while (cur) {
    if (
      ts.isFunctionDeclaration(cur) ||
      ts.isFunctionExpression(cur) ||
      ts.isArrowFunction(cur) ||
      ts.isMethodDeclaration(cur) ||
      ts.isConstructorDeclaration(cur)
    ) {
      for (const p of cur.parameters) {
        if (ts.isIdentifier(p.name) && p.name.text === name) {
          const sf = cur.getSourceFile();
          return typeOk(p.type ? p.type.getText(sf).trim() : null);
        }
      }
    }
    cur = cur.parent;
  }
  return false;
}
