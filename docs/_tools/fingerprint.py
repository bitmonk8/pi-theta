#!/usr/bin/env python3
"""Print the link-target + normative fingerprint of a markdown file:
sorted <a id> anchors, heading slugs, and REQ-IDs. Used to verify a
condensation pass drops none of them."""
import re, sys, pathlib
ANCHOR=re.compile(r'<a id="([^"]+)"'); HEAD=re.compile(r'^#{1,6}\s+(.*)$')
REQ=re.compile(r'\b(?:PIC|GOV|SM|HC\d|BNDR|ERR|NOCEIL|CIO|PRF|DISC|QRY|REQ)-[A-Za-z0-9]+\b')
def slug(h):
    s=re.sub(r'`','',h.strip().lower()); s=re.sub(r'\[([^\]]*)\]\([^)]*\)',r'\1',s)
    s=re.sub(r'[^a-z0-9 \-]','',s); return re.sub(r'\s+','-',s)
def fp(p):
    t=pathlib.Path(p).read_text(encoding="utf-8")
    a=sorted(set(ANCHOR.findall(t)))
    h=sorted({slug(m.group(1)) for m in (HEAD.match(l) for l in t.splitlines()) if m})
    r=sorted(set(REQ.findall(t)))
    return a,h,r
if __name__=="__main__":
    for p in sys.argv[1:]:
        a,h,r=fp(p)
        print(f"## {p}\nANCHORS({len(a)}): {' '.join(a)}\nHEADINGS({len(h)}): {' '.join(h)}\nREQIDS({len(r)}): {' '.join(r)}\n")
