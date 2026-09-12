#!/usr/bin/env node
// Mechanical LOC / band / importer counter for the D9 lens (quality-loop-d9-
// design.md §1.1/§2). WHY: D9's breakdown class needs a mechanical count that
// the model never guesses at — every LOC, band and importer figure here comes
// from the TypeScript compiler API, never from the model reading a file.
// ESM, DI over ROOT exactly like store.mjs (QUALITY_STORE_ROOT); no deps
// beyond `typescript` (already a repo dependency) and node:fs/path/url.
//
// Module API (imported by store.mjs, same directory):
//   hostLoc(root, host) -> integer LOC of "<path>" (whole file) or
//   "<path>#<function>" (that function's declaration span). An unknown or
//   ambiguous function host throws, naming the file's candidates.
//
// CLI (line-oriented; repo-relative forward-slash paths in output):
//   loc --host <path[#fn]>
//       Print hostLoc(ROOT, host).
//   map --files <manifest> [--exemptions <quality/exemptions.json>]
//       quality/exemptions.json is per-lens since quality-loop-d4-d8-design.md
//       §3 ("<LENS>:<host>" keys, D9 and D8 today); this map annotates D9:
//       entries ONLY — a D8 keep-whole never silences D9's own breakdown
//       accounting, so a D8: entry on the same host is not read here.
//       Print the structural map (markdown) for every file listed in
//       <manifest> (one repo-relative path per line, e.g. a store.mjs shard
//       manifest): header, imports, declarations table, per-class members
//       table, over-threshold list. Deterministic: byte-identical across runs
//       for an unchanged tree.
//   bands
//       Print FILE_BANDS / FN_BANDS as JSON, so the lens brief interpolates
//       the thresholds from here and can never drift from the scanner.
//
// LOC definitions (design §1.1): a file's LOC is its physical line count
// (identical to store.mjs's countLines / `wc -l`). A function's LOC is
// last line - first line + 1 of its declaration node, EXCLUDING a leading
// doc comment (function = function/method/constructor/get/set/arrow-or-
// function-expression bound by a variable or class-property initializer,
// a body required — overload signatures, abstract/declare members and
// .d.ts files are not measured). Nested functions are measured separately
// AND counted inside their parent's span.

import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.env.QUALITY_STORE_ROOT
  ? path.resolve(process.env.QUALITY_STORE_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------- bands

export const FILE_BANDS = { zone: 600, justify: 1000, strong: 2000 };
export const FN_BANDS = { zone: 60, justify: 100, strong: 200 };

// Verbatim posture text from design §1.1's band table (the header line's
// "burden sentence" — quoted, never retyped elsewhere).
const FILE_BURDEN = {
  exempt: "no breakdown finding may be filed against it (placement review still applies)",
  zone: "no presumption: a breakdown finding needs a distinct-concern inventory with \u2265 2 concerns",
  justify: "presumption of breakdown: not filed only when a concrete reason to keep it whole is found and recorded",
  strong: "presumption of breakdown: not filed only on a strong concrete reason",
};

// Short form for the "over threshold:" section's own file-band line (design
// §2 CLI bullet 5); the exempt wording is the literal string the design
// spells out verbatim.
const FILE_OVER_THRESHOLD_LINE = {
  exempt: "breakdown: exempt \u2014 placement review only",
  zone: `breakdown: zone \u2014 no presumption (needs a distinct-concern inventory with \u2265 2 concerns)`,
  justify: "breakdown: justify \u2014 presumption of breakdown (concrete reason required to keep whole)",
  strong: "breakdown: strong \u2014 presumption of breakdown (strong concrete reason required to keep whole)",
};

export function bandForFile(loc) {
  if (loc >= FILE_BANDS.strong) return "strong";
  if (loc >= FILE_BANDS.justify) return "justify";
  if (loc >= FILE_BANDS.zone) return "zone";
  return "exempt";
}

// null = below the review threshold - not an "over threshold" item at all.
export function bandForFn(loc) {
  if (loc >= FN_BANDS.strong) return "strong";
  if (loc >= FN_BANDS.justify) return "justify";
  if (loc >= FN_BANDS.zone) return "zone";
  return null;
}

// LOC = physical line count. Duplicated (not imported) from store.mjs's
// countLines: store.mjs executes its CLI switch unconditionally at import
// time (no `if (isMain)` guard), so importing it here would run whatever
// subcommand happened to be on process.argv as a side effect. store.mjs is
// the source of truth for this one-line rule. Exported so clone-scan.mjs
// (D4, quality-loop-d4-d8-design.md §1.5) reuses this counter instead of a
// third copy.
export function countLinesText(text) {
  if (text.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") n++;
  return text.endsWith("\n") ? n : n + 1;
}

function posixRel(root, abs) {
  return path.relative(root, abs).split(path.sep).join("/");
}

// ---------------------------------------------------------------- AST analysis

/**
 * One pass over a source file collecting everything the map/hostLoc need:
 *   functions      Map<hostName, [{start,end,loc}, ...]>  (>1 entry = ambiguous)
 *   functionsOrdered [{name,start,end,loc}, ...] in source order
 *   topDecls       [{start,end,loc,kind,name,exported}, ...] top-level, source order
 *   imports        [specifier-or-"export … from \"spec\"", ...] source order
 *   classOrder     [className, ...] first-seen order
 *   classMembers   Map<className, [{start,end,loc,visibility,name}, ...]>
 */
function analyzeSource(filePath, text) {
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const functions = new Map();
  const functionsOrdered = [];
  const topDecls = [];
  const imports = [];
  const classOrder = [];
  const classMembers = new Map();

  function lineOf(pos) {
    return sf.getLineAndCharacterOfPosition(pos).line + 1;
  }
  function span(node) {
    const startPos = node.getStart(sf, false); // false = exclude leading doc comment
    const start = lineOf(startPos);
    const endPos = node.end > startPos ? node.end - 1 : node.end;
    const end = lineOf(endPos);
    return { start, end, loc: end - start + 1 };
  }
  function modifiersOf(node) {
    return ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  }
  function isExported(node) {
    return !!modifiersOf(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  }
  function isDefault(node) {
    return !!modifiersOf(node)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
  }
  function isStatic(node) {
    return !!modifiersOf(node)?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword);
  }
  function visibilityOf(node) {
    const mods = modifiersOf(node);
    const vis = mods?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword)
      ? "private"
      : mods?.some((m) => m.kind === ts.SyntaxKind.ProtectedKeyword)
        ? "protected"
        : "public";
    return isStatic(node) ? `${vis} static` : vis;
  }
  function record(name, node) {
    const { start, end, loc } = span(node);
    const entry = { name, start, end, loc };
    if (!functions.has(name)) functions.set(name, []);
    functions.get(name).push(entry);
    functionsOrdered.push(entry);
  }
  function ownerOfObjectLiteral(objLit) {
    const p = objLit.parent;
    if (p && ts.isVariableDeclaration(p) && p.initializer === objLit && ts.isIdentifier(p.name)) {
      return p.name.text;
    }
    return null;
  }

  // Only a directly variable-bound object literal's members are addressable
  // as "<owner>.<key>"; a deeper/anonymous object literal's methods still get
  // an entry (over-threshold accounting must not silently drop them) using
  // the bare key as a best-effort name — documented as a punted ambiguity.
  function visit(node, hostPrefix) {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const className = node.name?.text ?? "(anon class)";
      if (!classMembers.has(className)) {
        classMembers.set(className, []);
        classOrder.push(className);
      }
      for (const member of node.members) {
        let form = null;
        let fnNode = null;

        if (ts.isConstructorDeclaration(member) && member.body) {
          form = `${className}.constructor`;
          fnNode = member;
        } else if (ts.isMethodDeclaration(member) && member.body) {
          const name = member.name.getText(sf);
          form = isStatic(member) ? `${className}.static ${name}` : `${className}.${name}`;
          fnNode = member;
        } else if (ts.isGetAccessorDeclaration(member) && member.body) {
          const name = member.name.getText(sf);
          form = isStatic(member) ? `${className}.static ${name}` : `${className}.get ${name}`;
          fnNode = member;
        } else if (ts.isSetAccessorDeclaration(member) && member.body) {
          const name = member.name.getText(sf);
          form = isStatic(member) ? `${className}.static ${name}` : `${className}.set ${name}`;
          fnNode = member;
        } else if (
          ts.isPropertyDeclaration(member) &&
          member.initializer &&
          (ts.isArrowFunction(member.initializer) || ts.isFunctionExpression(member.initializer)) &&
          member.initializer.body
        ) {
          const name = member.name.getText(sf);
          form = isStatic(member) ? `${className}.static ${name}` : `${className}.${name}`;
          fnNode = member.initializer;
        }

        if (
          ts.isPropertyDeclaration(member) ||
          ts.isMethodDeclaration(member) ||
          ts.isGetAccessorDeclaration(member) ||
          ts.isSetAccessorDeclaration(member) ||
          ts.isConstructorDeclaration(member)
        ) {
          const displayName = ts.isConstructorDeclaration(member) ? "constructor" : member.name.getText(sf);
          const { start, end, loc } = span(member);
          classMembers.get(className).push({ start, end, loc, visibility: visibilityOf(member), name: displayName });
        }

        if (form && fnNode) {
          record(form, fnNode);
          visit(fnNode.body, form);
        } else {
          ts.forEachChild(member, (c) => visit(c, hostPrefix));
        }
      }
      return;
    }

    if (ts.isFunctionDeclaration(node) && node.body) {
      const name = node.name?.text ?? (isDefault(node) ? "default" : null);
      if (name) {
        const form = hostPrefix ? `${hostPrefix}.${name}` : name;
        record(form, node);
        visit(node.body, form);
        return;
      }
    }

    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) &&
      node.initializer.body &&
      ts.isIdentifier(node.name)
    ) {
      const form = hostPrefix ? `${hostPrefix}.${node.name.text}` : node.name.text;
      record(form, node.initializer);
      visit(node.initializer.body, form);
      return;
    }

    if (ts.isObjectLiteralExpression(node)) {
      const owner = ownerOfObjectLiteral(node);
      for (const prop of node.properties) {
        if (ts.isMethodDeclaration(prop) && prop.body) {
          const key = prop.name.getText(sf);
          const form = owner ? `${owner}.${key}` : key;
          record(form, prop);
          visit(prop.body, form);
          continue;
        }
        if (
          ts.isPropertyAssignment(prop) &&
          prop.initializer &&
          (ts.isArrowFunction(prop.initializer) || ts.isFunctionExpression(prop.initializer)) &&
          prop.initializer.body
        ) {
          const key = prop.name.getText(sf);
          const form = owner ? `${owner}.${key}` : key;
          record(form, prop.initializer);
          visit(prop.initializer.body, form);
          continue;
        }
        ts.forEachChild(prop, (c) => visit(c, hostPrefix));
      }
      return;
    }

    ts.forEachChild(node, (c) => visit(c, hostPrefix));
  }
  visit(sf, null);

  // Top-level declarations + imports: a separate, source-order pass over
  // sf.statements only (deliberately not folded into the recursive walk,
  // which also descends into nested scopes that must NOT appear here).
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) {
      if (stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) imports.push(stmt.moduleSpecifier.text);
      continue;
    }
    if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
      imports.push(`export \u2026 from "${stmt.moduleSpecifier.text}"`);
      continue;
    }
    const exported = isExported(stmt);
    if (ts.isFunctionDeclaration(stmt) && stmt.body) {
      const name = stmt.name?.text ?? (isDefault(stmt) ? "default" : "(anonymous)");
      const { start, end, loc } = span(stmt);
      topDecls.push({ start, end, loc, kind: "function", name, exported });
    } else if (ts.isClassDeclaration(stmt)) {
      const name = stmt.name?.text ?? "(anonymous)";
      const { start, end, loc } = span(stmt);
      topDecls.push({ start, end, loc, kind: "class", name, exported });
    } else if (ts.isInterfaceDeclaration(stmt)) {
      const { start, end, loc } = span(stmt);
      topDecls.push({ start, end, loc, kind: "interface", name: stmt.name.text, exported });
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      const { start, end, loc } = span(stmt);
      topDecls.push({ start, end, loc, kind: "type", name: stmt.name.text, exported });
    } else if (ts.isEnumDeclaration(stmt)) {
      const { start, end, loc } = span(stmt);
      topDecls.push({ start, end, loc, kind: "enum", name: stmt.name.text, exported });
    } else if (ts.isVariableStatement(stmt)) {
      const kind = stmt.declarationList.flags & ts.NodeFlags.Const ? "const" : stmt.declarationList.flags & ts.NodeFlags.Let ? "let" : "var";
      for (const decl of stmt.declarationList.declarations) {
        const { start, end, loc } = span(decl);
        topDecls.push({ start, end, loc, kind, name: decl.name.getText(sf), exported });
      }
    }
  }

  return { functions, functionsOrdered, topDecls, imports, classOrder, classMembers };
}

// ---------------------------------------------------------------- hostLoc

export function hostLoc(root, host) {
  const hashIdx = host.indexOf("#");
  const filePart = hashIdx === -1 ? host : host.slice(0, hashIdx);
  const fnPart = hashIdx === -1 ? null : host.slice(hashIdx + 1);
  const abs = path.resolve(root, filePart);
  if (!fs.existsSync(abs)) throw new Error(`size-scan: no such file '${filePart}' (resolved ${abs})`);
  const text = fs.readFileSync(abs, "utf8");
  if (fnPart === null) return countLinesText(text);
  const { functions } = analyzeSource(abs, text);
  const spans = functions.get(fnPart);
  if (!spans || spans.length === 0) {
    const candidates = [...functions.keys()].sort();
    throw new Error(
      `size-scan: unknown host '${fnPart}' in ${filePart} \u2014 candidates: ${candidates.length ? candidates.join(", ") : "(none found)"}`,
    );
  }
  if (spans.length > 1) {
    const ranges = spans.map((s) => `${s.start}-${s.end}`).join(", ");
    throw new Error(`size-scan: ambiguous host '${fnPart}' in ${filePart} \u2014 ${spans.length} candidate spans: ${ranges}`);
  }
  return spans[0].loc;
}

// ---------------------------------------------------------------- importers

const IMPORT_CORPUS_DIRS = [
  { dir: "src", exts: [".ts"] },
  { dir: "tests", exts: [".ts"] },
  { dir: "extensions", exts: [".ts"] },
  { dir: "tools", exts: [".mjs", ".ts"] },
];

/**
 * Every file under root/dir whose name ends in one of exts, excluding
 * .d.ts, sorted directory-by-directory (deterministic — the map/importer
 * counters and clone-scan.mjs's D4 pre-scan all need a stable file order).
 * Exported so clone-scan.mjs (quality-loop-d4-d8-design.md §1.5) reuses this
 * walker for its src/**\/*.ts corpus instead of a second copy.
 */
export function listTsFiles(root, dir, exts) {
  const out = [];
  const base = path.join(root, dir);
  if (!fs.existsSync(base)) return out;
  const walk = (d) => {
    const entries = [...fs.readdirSync(d, { withFileTypes: true })].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (exts.some((ext) => p.endsWith(ext)) && !p.endsWith(".d.ts")) out.push(p);
    }
  };
  walk(base);
  return out;
}

function listImportCorpusFiles(root) {
  const out = [];
  for (const { dir, exts } of IMPORT_CORPUS_DIRS) out.push(...listTsFiles(root, dir, exts));
  return out;
}

function collectImportsFromFile(sf) {
  const records = [];
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const spec = stmt.moduleSpecifier.text;
      const clause = stmt.importClause;
      if (!clause) continue;
      if (clause.name) records.push({ spec, kind: "named", names: ["default"] });
      const nb = clause.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) {
        records.push({ spec, kind: "namespace", names: null });
      } else if (nb && ts.isNamedImports(nb)) {
        for (const el of nb.elements) {
          const imported = (el.propertyName ?? el.name).text;
          records.push({ spec, kind: "named", names: [imported] });
        }
      }
    } else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const spec = stmt.moduleSpecifier.text;
      if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) {
          const imported = (el.propertyName ?? el.name).text;
          records.push({ spec, kind: "named", names: [imported] });
        }
      } else if (!stmt.exportClause) {
        records.push({ spec, kind: "namespace", names: null }); // export * from "./x"
      }
    }
  }
  return records;
}

function resolveRelative(root, importerAbsFile, spec) {
  if (!spec.startsWith(".")) return null; // only relative specifiers resolve to a file in the corpus
  const baseDir = path.dirname(importerAbsFile);
  const joined = path.resolve(baseDir, spec);
  const candidates = [];
  if (spec.endsWith(".ts")) candidates.push(joined);
  else if (spec.endsWith(".js")) candidates.push(joined.slice(0, -3) + ".ts");
  else {
    candidates.push(joined + ".ts");
    candidates.push(path.join(joined, "index.ts"));
  }
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return posixRel(root, c);
  }
  return null;
}

function buildImportRecords(root) {
  const files = listImportCorpusFiles(root);
  const out = [];
  for (const f of files) {
    const importerRel = posixRel(root, f);
    const text = fs.readFileSync(f, "utf8");
    const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    for (const r of collectImportsFromFile(sf)) {
      const target = resolveRelative(root, f, r.spec);
      if (!target) continue;
      out.push({ importerRel, target, kind: r.kind, names: r.names });
    }
  }
  return out;
}

// Two counts: importers whose repo-relative path starts with "src/" (folding
// in extensions/ and tools/ — production-side callers) vs "tests/".
function importerCounts(records, targetRelPath, exportName) {
  const src = new Set();
  const tests = new Set();
  for (const r of records) {
    if (r.target !== targetRelPath || r.importerRel === targetRelPath) continue;
    const hit = r.kind === "namespace" || (r.names && r.names.includes(exportName));
    if (!hit) continue;
    (r.importerRel.startsWith("tests/") ? tests : src).add(r.importerRel);
  }
  return { src: src.size, tests: tests.size };
}

// ---------------------------------------------------------------- map

// quality/exemptions.json keys are "<LENS>:<host>" (store.mjs owns the
// format); this map only ever annotates D9's own breakdown accounting, so
// strip to D9:-prefixed entries and drop the prefix back to a bare host key.
function d9OnlyExemptions(exemptions) {
  const out = {};
  for (const [key, record] of Object.entries(exemptions)) {
    if (key.startsWith("D9:")) out[key.slice("D9:".length)] = record;
  }
  return out;
}

function exemptAnnotation(record, currentLoc) {
  const then = record.loc;
  const growth = then > 0 ? Math.round(((currentLoc - then) / then) * 100) : 0;
  return `EXEMPT (human-ruled ${record.date}: ${record.reason}; LOC then ${then}, now ${currentLoc}, growth ${growth}%)`;
}

export function buildMap(root, relFiles, exemptions = {}) {
  const records = buildImportRecords(root);
  const sections = relFiles.map((relPath) => {
    const abs = path.resolve(root, relPath);
    const text = fs.readFileSync(abs, "utf8");
    const loc = countLinesText(text);
    const band = bandForFile(loc);
    const { functionsOrdered, topDecls, imports, classOrder, classMembers } = analyzeSource(abs, text);

    const lines = [];
    lines.push(`## ${relPath}`);
    lines.push("");
    lines.push(`${relPath} \u2014 ${loc} LOC \u2014 band ${band} \u2014 ${FILE_BURDEN[band]}`);
    lines.push("");
    lines.push("Measurement excludes: overload signatures, abstract/declare members, and .d.ts files (no function body to count).");
    lines.push("");
    lines.push("imports:");
    if (imports.length === 0) lines.push("- (none)");
    else for (const spec of [...new Set(imports)]) lines.push(`- ${spec}`); // value + type imports of one module list once
    lines.push("");
    lines.push("declarations:");
    lines.push("| lines | LOC | kind | name | exported | importers src/tests |");
    lines.push("|---|---|---|---|---|---|");
    for (const d of topDecls) {
      const importers = d.exported ? importerCounts(records, relPath, d.name) : { src: 0, tests: 0 };
      lines.push(`| ${d.start}-${d.end} | ${d.loc} | ${d.kind} | ${d.name} | ${d.exported ? "yes" : "no"} | ${importers.src}/${importers.tests} |`);
    }
    lines.push("");
    for (const className of classOrder) {
      lines.push(`members: ${className}`);
      lines.push("| lines | LOC | visibility | name |");
      lines.push("|---|---|---|---|");
      for (const m of classMembers.get(className)) {
        lines.push(`| ${m.start}-${m.end} | ${m.loc} | ${m.visibility} | ${m.name} |`);
      }
      lines.push("");
    }
    // File band and function bands are independent burdens (design §1.1): an
    // exempt-band file carries no FILE breakdown burden, but a function inside
    // it that clears FN_BANDS.zone is still a breakdown host in its own right.
    lines.push("over threshold:");
    lines.push(FILE_OVER_THRESHOLD_LINE[band]);
    const fileExempt = exemptions[relPath];
    if (fileExempt) lines.push(exemptAnnotation(fileExempt, loc));
    for (const fn of functionsOrdered) {
      const fnBand = bandForFn(fn.loc);
      if (!fnBand) continue;
      lines.push(`- ${relPath}#${fn.name} \u2014 ${fn.start}-${fn.end} \u2014 ${fn.loc} LOC \u2014 band ${fnBand}`);
      const fnExempt = exemptions[`${relPath}#${fn.name}`];
      if (fnExempt) lines.push(`  ${exemptAnnotation(fnExempt, fn.loc)}`);
    }
    return lines.join("\n");
  });
  return sections.join("\n\n") + "\n";
}

// ---------------------------------------------------------------- CLI

function die(msg) {
  process.stderr.write(`size-scan.mjs: ${msg}\n`);
  process.exit(1);
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    }
  }
  return flags;
}

function main() {
  const [, , cmd, ...rest] = process.argv;
  const flags = parseFlags(rest);
  try {
    switch (cmd) {
      case "loc": {
        const host = flags.host ?? die("--host required");
        process.stdout.write(String(hostLoc(ROOT, host)) + "\n");
        break;
      }
      case "map": {
        const manifest = flags.files ?? die("--files required");
        const relFiles = fs
          .readFileSync(path.resolve(ROOT, manifest), "utf8")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        let exemptions = {};
        if (flags.exemptions) {
          const p = path.resolve(ROOT, flags.exemptions);
          if (fs.existsSync(p)) exemptions = d9OnlyExemptions(JSON.parse(fs.readFileSync(p, "utf8")));
        }
        process.stdout.write(buildMap(ROOT, relFiles, exemptions));
        break;
      }
      case "bands": {
        process.stdout.write(JSON.stringify({ FILE_BANDS, FN_BANDS }, null, 2) + "\n");
        break;
      }
      default:
        die(`unknown subcommand '${cmd ?? "(none)"}' \u2014 see header comment for usage (loc | map | bands)`);
    }
  } catch (err) {
    die(err instanceof Error ? err.message : String(err));
  }
}

// Only run the CLI when this file is the process entrypoint: tests import
// hostLoc/buildMap/bandForFile/bandForFn directly (file:// URL), and those
// imports must not trigger `main()` reading process.argv and exiting.
const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
  } catch {
    return false;
  }
})();
if (isMain) main();
