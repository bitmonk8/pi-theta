#!/usr/bin/env python3
"""Split oversized spec topic files into subdir+index and globally repoint links.

Lossless: every source line lands in exactly one child; the original path becomes
an index page (H1 + lead + Contents). Anchors travel unchanged. All relative
markdown links across docs/ are recomputed from a global anchor->owner map.
"""
import os, re, json, pathlib

DOCS = pathlib.Path(__file__).resolve().parent.parent          # docs/
TOPICS = DOCS / "spec_topics"

# topicfile -> (intro_last_line, [(slug, start, end), ...])  (1-indexed inclusive)
PLANS = {
 "spec.md": (3, [
    ("overview-and-orientation", 4, 63),
    ("language-and-architecture", 64, 126),
    ("session-model-and-appendix", 127, 182),
 ]),
 "spec_topics/pi-integration-contract.md": (4, [
    ("host-prerequisites", 5, 34),
    ("capability-probe", 35, 116),
    ("registration-steps", 117, 121),
    ("unknown-reason-rule", 122, 126),
    ("patch-skew-degradation", 127, 141),
    ("drain-state-contract", 142, 156),
    ("active-invocation-registry", 157, 174),
    ("diagnostic-emission-isolation", 175, 175),
    ("session-only-degraded-state", 176, 177),
    ("session-shutdown-semantics", 178, 193),
    ("extension-bootstrap-and-per-loom", 194, 213),
    ("tool-registration-lifetime", 214, 239),
    ("conversation-drive", 240, 291),
    ("provider-error-mapping", 292, 351),
    ("subagent", 352, 399),
    ("binder-inference", 400, 519),
    ("runtime-event-channel", 520, 588),
    ("host-interfaces-core", 589, 679),
    ("host-interfaces-services", 680, 813),
    ("inventory-audit-intro", 814, 825),
    ("audit-recognised-shapes", 826, 826),
    ("audit-target-categories", 827, 827),
    ("audit-resolution", 828, 847),
    ("audit-failures", 848, 876),
    ("audit-wire-and-canary", 877, 884),
    ("capability-inventory-items", 885, 901),
    ("version-bump-intro", 902, 908),
    ("version-bump-step2", 909, 922),
    ("version-bump-step2b", 923, 930),
    ("version-bump-triggers", 931, 935),
 ]),
 "spec_topics/diagnostics.md": (4, [
    ("diagnostic-shape", 5, 75),
    ("placeholder-rendering-a", 76, 160),
    ("placeholder-rendering-b", 161, 271),
    ("code-registry-parse", 272, 367),
    ("code-registry-load", 368, 418),
    ("code-registry-runtime", 419, 442),
    ("code-registry-host", 443, 452),
 ]),
 "spec_topics/governance.md": (6, [
    ("corpus-direction-and-scope", 7, 31),
    ("req-id-prefix-table-active-a", 32, 100),
    ("req-id-prefix-table-active-b", 101, 162),
    ("req-id-prefix-table-retired", 163, 190),
    ("stable-inline-labels", 191, 214),
    ("release-version-naming", 215, 272),
    ("anchor-scheme-and-retired", 273, 304),
 ]),
 "spec_topics/binder.md": (6, [
    ("binder-model-and-context", 7, 87),
    ("binder-bypass-and-envelope", 88, 236),
    ("defaulting-system-note-echo", 237, 313),
    ("determinism-cancellation-failure", 314, 370),
 ]),
 "spec_topics/query.md": (4, [
    ("query-forms", 5, 135),
    ("query-escapes-stringification", 136, 192),
    ("query-tool-loop", 193, 274),
    ("query-failure-and-repair", 275, 346),
 ]),
 "spec_topics/errors-and-results.md": (4, [
    ("error-model", 5, 139),
    ("queryerror-variants", 140, 305),
 ]),
 "spec_topics/discovery.md": (4, [
    ("discovery-sources", 5, 100),
    ("package-and-settings", 101, 190),
 ]),
 "spec_topics/hard-ceilings.md": (8, [
    ("ceilings-3-and-4", 9, 69),
    ("ceiling-invariants-and-audit", 70, 114),
 ]),
 "spec_topics/future-considerations.md": (18, [
    ("surface-extensions", 19, 89),
    ("model-changes-and-non-goals", 90, 127),
 ]),
 "spec_topics/frontmatter.md": (4, [
    ("frontmatter-fields-a", 5, 88),
    ("frontmatter-fields-b-and-templates", 89, 155),
 ]),
}

ANCHOR_RE = re.compile(r'<a id="([^"]+)"')
LINK_RE = re.compile(r'\]\(([^)]+)\)')
HEAD_RE = re.compile(r'^#{1,6}\s+(.*)$')

def slugify(h):
    s = re.sub(r'`', '', h.strip().lower())
    s = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', s)
    s = re.sub(r'[^a-z0-9 \-]', '', s)
    return re.sub(r'\s+', '-', s)

def title_from_slug(s):
    return s.replace("-", " ")[:1].upper() + s.replace("-", " ")[1:]

def main():
    # moved[(source_relposix, anchor)] = child_relposix(under docs)
    moved = {}
    child_abs = {}              # child_relposix -> abs path
    child_source = {}           # child_relposix -> source_relposix (authoring base origin)
    split_sources = set()       # source_relposix that were split

    # PASS 1: physical split
    for src_rel, (intro_last, children) in PLANS.items():
        src_relposix = src_rel
        split_sources.add(src_relposix)
        src_abs = DOCS / src_rel
        lines = src_abs.read_text(encoding="utf-8").splitlines()
        n = len(lines)
        topic = pathlib.PurePosixPath(src_rel).stem        # e.g. pi-integration-contract
        topicdir_rel = str(pathlib.PurePosixPath(src_rel).with_suffix(""))  # spec_topics/<topic>
        (DOCS / topicdir_rel).mkdir(exist_ok=True)

        # coverage check
        assert children[0][1] == intro_last + 1, (src_rel, "first child must start at intro_last+1")
        for i in range(len(children) - 1):
            assert children[i][2] + 1 == children[i+1][1], (src_rel, "non-contiguous", children[i], children[i+1])
        assert children[-1][2] == n, (src_rel, "last child must end at EOF", children[-1][2], n)

        # anchor -> line
        anchor_line = {}
        for ln, text in enumerate(lines, 1):
            hm = HEAD_RE.match(text)
            if hm:
                anchor_line.setdefault(slugify(hm.group(1)), ln)
            for m in ANCHOR_RE.finditer(text):
                anchor_line[m.group(1)] = ln

        for slug, start, end in children:
            child_rel = f"{topicdir_rel}/{slug}.md"
            cabs = DOCS / child_rel
            body = "\n".join(lines[start-1:end]).strip("\n")
            cabs.write_text(f"# {title_from_slug(slug)}\n\n{body}\n", encoding="utf-8")
            child_abs[child_rel] = cabs
            child_source[child_rel] = src_relposix
            for a, ln in anchor_line.items():
                if start <= ln <= end:
                    moved[(src_relposix, a)] = child_rel

        # index page overwrites original path
        intro = "\n".join(lines[:intro_last]).rstrip("\n")
        toc = "\n".join(f"- [{title_from_slug(slug)}](./{topic}/{slug}.md)" for slug, _, _ in children)
        src_abs.write_text(f"{intro}\n\n## Contents\n\n{toc}\n", encoding="utf-8")

    # PASS 2: global link rewrite over every .md under docs/
    def rel_under_docs(p): return str(p.relative_to(DOCS).as_posix())

    stats = {"files": 0, "rewritten": 0}
    for md in DOCS.rglob("*.md"):
        if "_tools" in md.parts: continue
        F_rel = rel_under_docs(md)
        is_child = F_rel in child_abs
        if is_child:
            authoring_dir_abs = (DOCS / child_source[F_rel]).parent   # spec_topics
            self_topic = child_source[F_rel]
        else:
            authoring_dir_abs = md.parent
            self_topic = F_rel
        Fdir = md.parent
        text = md.read_text(encoding="utf-8")
        changed = [0]

        def repl(m):
            inner = m.group(1)
            if "://" in inner or inner.startswith("mailto:"):
                return m.group(0)
            if "#" in inner:
                path, frag = inner.split("#", 1)
            else:
                path, frag = inner, None
            # only handle md links or pure-anchor links
            if path == "":
                # pure #frag: resolve against own topic (works for children AND index pages)
                if (is_child or F_rel in split_sources) and frag is not None:
                    owner = moved.get((self_topic, frag))
                    if owner:
                        if owner == F_rel:
                            return m.group(0)
                        newpath = os.path.relpath(DOCS / owner, Fdir).replace("\\", "/")
                        if not newpath.startswith("."): newpath = "./" + newpath
                        changed[0] += 1
                        return f"]({newpath}#{frag})"
                return m.group(0)
            if not path.endswith(".md"):
                return m.group(0)
            target_abs = (authoring_dir_abs / path).resolve()
            try:
                target_rel = rel_under_docs(target_abs)
            except ValueError:
                return m.group(0)
            if frag is not None and (target_rel, frag) in moved:
                owner_abs = DOCS / moved[(target_rel, frag)]
                newpath = os.path.relpath(owner_abs, Fdir).replace("\\", "/")
                if not newpath.startswith("."): newpath = "./" + newpath
                changed[0] += 1
                return f"]({newpath}#{frag})"
            # unchanged target file (or page-level link); recompute path (F may have moved)
            newpath = os.path.relpath(target_abs, Fdir).replace("\\", "/")
            if not newpath.startswith("."): newpath = "./" + newpath
            new = f"]({newpath}#{frag})" if frag is not None else f"]({newpath})"
            if new != m.group(0): changed[0] += 1
            return new

        new_text = LINK_RE.sub(repl, text)
        if new_text != text:
            md.write_text(new_text, encoding="utf-8")
            stats["files"] += 1
            stats["rewritten"] += changed[0]
        stats  # noqa

    print(json.dumps({"moved_anchors": len(moved), "children": len(child_abs),
                      "files_rewritten": stats["files"], "links_rewritten": stats["rewritten"]}, indent=2))

if __name__ == "__main__":
    main()
