#!/usr/bin/env python3
"""Validate intra-doc markdown links: target file exists; #anchor exists in target."""
import re, sys, pathlib
DOCS = pathlib.Path(__file__).resolve().parent.parent
LINK_RE = re.compile(r'\]\(([^)]+)\)')
ANCHOR_RE = re.compile(r'<a id="([^"]+)"')
# also accept GitHub-style heading anchors
HEAD_RE = re.compile(r'^#{1,6}\s+(.*)$')

def slugify(h):
    s = h.strip().lower()
    s = re.sub(r'`', '', s)
    s = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', s)  # link text
    s = re.sub(r'[^a-z0-9 \-]', '', s)
    s = re.sub(r'\s+', '-', s)
    return s

def anchors_of(path):
    txt = path.read_text(encoding="utf-8")
    a = set(ANCHOR_RE.findall(txt))
    for line in txt.splitlines():
        m = HEAD_RE.match(line)
        if m: a.add(slugify(m.group(1)))
    return a

def main():
    cache = {}
    broken_file = []
    broken_anchor = []
    for md in DOCS.rglob("*.md"):
        if "_tools" in md.parts: continue
        txt = md.read_text(encoding="utf-8")
        for m in LINK_RE.finditer(txt):
            inner = m.group(1)
            if "://" in inner or inner.startswith("mailto:") or inner.startswith("slack"): continue
            if "#" in inner: path, frag = inner.split("#", 1)
            else: path, frag = inner, None
            if path == "":
                tgt = md
            else:
                if not path.endswith(".md"): continue
                tgt = (md.parent / path).resolve()
                if not tgt.exists():
                    broken_file.append((str(md.relative_to(DOCS)), inner)); continue
            if frag:
                if tgt not in cache: cache[tgt] = anchors_of(tgt)
                if frag not in cache[tgt]:
                    broken_anchor.append((str(md.relative_to(DOCS)), inner))
    print(f"broken file targets: {len(broken_file)}")
    for f,i in broken_file[:40]: print(f"  {f}  ->  {i}")
    print(f"broken anchors: {len(broken_anchor)}")
    for f,i in broken_anchor[:60]: print(f"  {f}  ->  {i}")
    return len(broken_file)+len(broken_anchor)

if __name__ == "__main__":
    sys.exit(0 if main()==0 else 1)
