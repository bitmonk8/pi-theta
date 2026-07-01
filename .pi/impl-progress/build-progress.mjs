#!/usr/bin/env node
// Deterministic progress generator for the pi-loom implementation run.
//
// This script holds NO judgement and calls NO model. It reconstructs the
// entire implementation state from two durable, crash-proof sources:
//
//   1. docs/plan_topics/*.md   — the leaves (task name + dependencies)
//   2. git completion tags     — `<id>-complete` / `<id>-T-complete`
//
// Because both survive power loss and agent crashes, the state is always
// reconstructable. Re-running this script after any interruption yields the
// exact same frontier — that is what makes the orchestrator resumable.
//
// Outputs:
//   - progress-data.js   the self-contained webpage's data (window.__LOOM__)
//   - stdout (--report)  a JSON frontier the orchestrator consumes each loop
//
// Usage:
//   node build-progress.mjs            # regenerate progress-data.js
//   node build-progress.mjs --report   # also print the orchestrator frontier
//   node build-progress.mjs --quiet    # regenerate without the human summary

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const PLAN_DIR = path.join(ROOT, "docs", "plan_topics");
const DATA_OUT = path.join(HERE, "progress-data.js");
const CATALOG = path.join(HERE, "catalog.json");
const DECISIONS = path.join(HERE, "decisions.jsonl");
const CURRENT = path.join(HERE, "current.json");
const CHANGELOG = path.join(ROOT, "CHANGELOG.md");

// Files in plan_topics/ that are not leaves.
const NON_LEAF = new Set([
	"conventions.md",
	"coverage-matrix.md",
	"leaf-template.md",
	"real-host-smoke-gate.md",
]);

// Human phase labels. These are intentionally plain-language and carry no
// internal codes; the webpage shows ONLY these, never the V-numbers.
const PHASE_LABELS = {
	H: "Foundations & safety nets",
	M: "First end-to-end command",
	V1: "Reading loom source",
	V2: "Types & values",
	V3: "Expressions & control flow",
	V4: "Errors & results",
	V5: "Data schemas",
	V6: "Prompt-file settings",
	V7: "Diagnostics & messages",
	V8: "Host integration points",
	V9: "Running inside the host",
	V10: "Finding & configuring looms",
	V11: "Typed replies (the binder)",
	V12: "Slash-command invocation",
	V13: "Model queries",
	V14: "Tool calls",
	V15: "Invoking looms & imports",
	V16: "Safety limits",
	V17: "Cancellation",
	V18: "Release safety gates",
};
const PHASE_ORDER = Object.keys(PHASE_LABELS);

const LEAF_ID = /^(H\d+[a-z]|M|V\d+[a-z])(-T)?$/;

function git(args) {
	try {
		return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
	} catch {
		return "";
	}
}

function readCatalog() {
	if (!fs.existsSync(CATALOG)) return { tasks: {}, phases: {} };
	try {
		const c = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
		return { tasks: c.tasks ?? {}, phases: c.phases ?? {} };
	} catch {
		return { tasks: {}, phases: {} };
	}
}

// Turn a raw leaf title into a plain-language task name: strip code spans,
// drop the "(tests)" marker, and remove jargon-laden parentheticals (those
// that contained backticks). The optional catalog.json overrides any of this
// with a hand-written name.
function humaniseTitle(raw) {
	let t = raw;
	t = t.replace(/\s*\(tests\)\s*$/i, "");
	// drop parentheticals that carried code/jargon
	t = t.replace(/\s*\([^)]*`[^)]*\)/g, "");
	t = t.replace(/`/g, "");
	t = t.replace(/\s{2,}/g, " ").trim();
	return t;
}

function depsFromLine(line) {
	if (!line) return [];
	// Only the part before any em-dash carries the dependency tokens; the rest
	// is prose (e.g. the V9l blocked-obligation note).
	const head = line.split("—")[0];
	const ids = [];
	const re = /`([^`]+)`/g;
	let m;
	while ((m = re.exec(head)) !== null) {
		// A single backtick span may hold several comma/space-separated ids,
		// e.g. `H5b, H5c, H7a`. Split and test each token.
		for (const tok of m[1].split(/[,\s]+/)) {
			const t = tok.trim();
			if (LEAF_ID.test(t)) ids.push(t);
		}
	}
	return ids;
}

function parseLeaves() {
	const files = fs
		.readdirSync(PLAN_DIR)
		.filter((f) => f.endsWith(".md") && !NON_LEAF.has(f));
	const leaves = {};
	for (const f of files) {
		const text = fs.readFileSync(path.join(PLAN_DIR, f), "utf8");
		const lines = text.split(/\r?\n/);
		const titleLine = lines.find((l) => l.startsWith("# "));
		if (!titleLine) continue;
		// `# `<id>` — <title>`
		const tm = titleLine.match(/^#\s+`([^`]+)`\s*[—-]\s*(.*)$/);
		if (!tm) continue;
		const id = tm[1].trim();
		if (!LEAF_ID.test(id)) continue;
		const rawTitle = tm[2].trim();
		const depsLine = lines.find((l) => l.startsWith("**Deps.**")) ?? "";
		const deps = depsFromLine(depsLine.replace(/^\*\*Deps\.\*\*/, ""));
		const blocked = /blocked/i.test(depsLine);
		const isTest = id.endsWith("-T");
		const base = isTest ? id.slice(0, -2) : id;
		const phase = id === "M" || id === "M-T" ? "M" : id.match(/^(H\d+|V\d+|H|V)/)?.[0] ?? "?";
		const phaseKey = id.startsWith("H") ? "H" : id.startsWith("M") ? "M" : phase;
		leaves[id] = { id, base, isTest, rawTitle, deps, blocked, phaseKey };
	}
	return leaves;
}

function tagSet() {
	const out = git(["tag", "--list", "*-complete"]);
	return new Set(out ? out.split(/\r?\n/).filter(Boolean) : []);
}

function readCurrent() {
	if (!fs.existsSync(CURRENT)) return null;
	try {
		return JSON.parse(fs.readFileSync(CURRENT, "utf8"));
	} catch {
		return null;
	}
}

function readDecisions() {
	if (!fs.existsSync(DECISIONS)) return [];
	return fs
		.readFileSync(DECISIONS, "utf8")
		.split(/\r?\n/)
		.filter((l) => l.trim())
		.map((l) => {
			try {
				return JSON.parse(l);
			} catch {
				return null;
			}
		})
		.filter(Boolean);
}

function readChangelog(limit = 12) {
	if (!fs.existsSync(CHANGELOG)) return [];
	return fs
		.readFileSync(CHANGELOG, "utf8")
		.split(/\r?\n/)
		.filter((l) => /^\d{4}-\d{2}-\d{2}\b/.test(l.trim()))
		.slice(-limit)
		.reverse();
}

function leafStatus(leaf, tags, current) {
	const done = tags.has(`${leaf.id}-complete`);
	if (done) return "done";
	if (leaf.blocked) return "blocked";
	if (current && current.leaf === leaf.id) return "in-progress";
	const ready = leaf.deps.every((d) => tags.has(`${d}-complete`));
	return ready ? "ready" : "waiting";
}

function build() {
	const leaves = parseLeaves();
	const tags = tagSet();
	const current = readCurrent();
	const catalog = readCatalog();

	// Per-leaf status (used by the orchestrator frontier).
	const leafReport = {};
	for (const id of Object.keys(leaves)) {
		leafReport[id] = leafStatus(leaves[id], tags, current);
	}

	// The current leaf may be a `-T` tests leaf; its work belongs to the impl
	// card, which is keyed by the bare id. Normalise so the marker lights up the
	// right card whether the agent is writing tests or the implementation.
	const curBase =
		current && current.leaf
			? current.leaf.endsWith("-T")
				? current.leaf.slice(0, -2)
				: current.leaf
			: null;

	// Build human-facing FEATURE cards: one card per implementation/horizontal
	// leaf (the bare id). Its `-T` partner becomes the "tests" checkpoint.
	const features = [];
	for (const id of Object.keys(leaves)) {
		const leaf = leaves[id];
		if (leaf.isTest) continue; // tests fold into their impl partner
		const partner = leaves[`${id}-T`];
		const name =
			catalog.tasks[id]?.name ?? humaniseTitle(leaf.rawTitle);
		const blurb = catalog.tasks[id]?.blurb ?? "";
		const builtDone = tags.has(`${id}-complete`);
		const testsDone = partner ? tags.has(`${partner.id}-complete`) : null;
		// A card is in-progress when the agent is on either its impl leaf or its
		// `-T` tests partner. leafStatus itself stays exact so the orchestrator
		// frontier keeps tracking the precise leaf id.
		let status = leafStatus(leaf, tags, current);
		let writingTests = false;
		if (!builtDone && !leaf.blocked && curBase === id) {
			status = "in-progress";
			writingTests = !!partner && current.leaf === partner.id;
		}
		features.push({
			phase: leaf.phaseKey,
			name,
			blurb,
			hasTests: !!partner,
			testsDone,
			builtDone,
			status,
			writingTests,
		});
	}

	// Group features into phases, ordered.
	const phases = [];
	for (const key of PHASE_ORDER) {
		const items = features.filter((f) => f.phase === key);
		if (items.length === 0) continue;
		const done = items.filter((f) => f.builtDone).length;
		phases.push({
			key,
			label: catalog.phases[key] ?? PHASE_LABELS[key] ?? key,
			total: items.length,
			done,
			items: items.map(({ phase, ...rest }) => rest),
		});
	}

	const totalFeatures = features.length;
	const doneFeatures = features.filter((f) => f.builtDone).length;
	const blocked = features.filter((f) => f.status === "blocked");
	const inProgress = features.filter((f) => f.status === "in-progress");

	const data = {
		generatedAt: new Date().toISOString(),
		catalogPresent: fs.existsSync(CATALOG),
		totals: { features: totalFeatures, done: doneFeatures },
		phases,
		inProgress: inProgress.map((f) => ({ name: f.name, blurb: f.blurb })),
		blocked: blocked.map((f) => ({ name: f.name, blurb: f.blurb })),
		decisions: readDecisions()
			.slice(-30)
			.reverse()
			.map((d) => ({
				date: d.date ?? "",
				task: d.task ?? d.leaf ?? "",
				summary: d.summary ?? "",
				detail: d.detail ?? "",
			})),
		activity: readChangelog(),
	};

	fs.writeFileSync(
		DATA_OUT,
		`// Generated by build-progress.mjs — do not edit by hand.\n` +
			`window.__LOOM__ = ${JSON.stringify(data, null, 2)};\n`,
	);

	// Leaf-level frontier for the orchestrator.
	const frontier = {
		completed: [],
		ready: [],
		waiting: [],
		blocked: [],
		inProgress: [],
	};
	for (const id of Object.keys(leafReport)) {
		const s = leafReport[id];
		if (s === "done") frontier.completed.push(id);
		else if (s === "ready") frontier.ready.push(id);
		else if (s === "waiting") frontier.waiting.push(id);
		else if (s === "blocked") frontier.blocked.push(id);
		else if (s === "in-progress") frontier.inProgress.push(id);
	}
	const sortIds = (a, b) => a.localeCompare(b, "en", { numeric: true });
	for (const k of Object.keys(frontier)) frontier[k].sort(sortIds);

	return { data, frontier, leaves, leafReport };
}

const argv = process.argv.slice(2);
const { data, frontier } = build();

if (argv.includes("--report")) {
	// Machine-readable frontier for the orchestrator (single JSON object).
	process.stdout.write(JSON.stringify(frontier, null, 2) + "\n");
} else if (!argv.includes("--quiet")) {
	const { features, done } = data.totals;
	const pct = features ? Math.round((done / features) * 100) : 0;
	console.log(`pi-loom progress: ${done}/${features} features (${pct}%)`);
	console.log(
		`ready: ${frontier.ready.length}  waiting: ${frontier.waiting.length}  blocked: ${frontier.blocked.length}  in-progress: ${frontier.inProgress.length}`,
	);
	if (!data.catalogPresent)
		console.log("note: catalog.json absent — using sanitised titles (run the cataloguer to upgrade names)");
	console.log(`wrote ${path.relative(ROOT, DATA_OUT)}`);
}
