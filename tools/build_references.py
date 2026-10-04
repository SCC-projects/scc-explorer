#!/usr/bin/env python3
"""
Convert the bibliography CSV into a JavaScript data file.

    python tools/build_references.py [input.csv] [output.js]

Defaults: references/data/references.csv -> references/data/references.js

The CSV is the source of truth. The generated file defines one global,
`DATASET`, shared by Search References and Build Graphs. It is loaded with
a <script> tag rather than fetched, because browsers refuse fetch() on
file:// URLs: the apps then work straight from disk, without a server.

Preparation applied to every row:
  - cells are trimmed; "NA" becomes an empty string;
  - Year_format: the first four-digit year found in YEAR (used by the
    period slider and the graph axis);
  - exact duplicate rows are dropped;
  - rows are sorted by AUTHOR, then YEAR.

Pass --check to verify that the output file is up to date (exit code 1 if
not), which is what the CI workflow runs.
"""
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REQUIRED = ["AUTHOR", "YEAR", "TITLE", "KEYWORDS", "BIBTEXKEY", "CATEGORY", "TYPE"]


def clean(v):
    v = (v or "").strip()
    return "" if v == "NA" else v


def build(src):
    with open(src, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f, delimiter=";"))
    if not rows:
        sys.exit(f"{src}: no rows")
    missing = [c for c in REQUIRED if c not in rows[0]]
    if missing:
        sys.exit(f"{src}: missing required columns {missing}")

    out, seen = [], set()
    for r in rows:
        rec = {k: clean(v) for k, v in r.items() if k}
        m = re.search(r"\d{4}", rec.get("YEAR", ""))
        rec["Year_format"] = m.group(0) if m else ""
        key = json.dumps(rec, sort_keys=True, ensure_ascii=False)
        if key in seen:
            continue
        seen.add(key)
        out.append(rec)

    keys = [r["BIBTEXKEY"] for r in out]
    dupes = sorted({k for k in keys if keys.count(k) > 1})
    if dupes:
        sys.exit(f"{src}: duplicate BIBTEXKEY values {dupes}")

    out.sort(key=lambda r: (r["AUTHOR"].lower(), r["Year_format"]))
    return out


def render(rows, src):
    return ("// Generated from %s by tools/build_references.py. Do not edit by hand.\n"
            "const DATASET = %s;\n" % (src, json.dumps(rows, ensure_ascii=False, indent=1)))


def main(argv):
    check = "--check" in argv
    args = [a for a in argv if a != "--check"]
    src = Path(args[0]) if args else ROOT / "references/data/references.csv"
    dst = Path(args[1]) if len(args) > 1 else ROOT / "references/data/references.js"
    label = src.relative_to(ROOT) if src.is_absolute() and ROOT in src.parents else src
    text = render(build(src), label.as_posix())
    if check:
        if not dst.exists() or dst.read_text(encoding="utf-8") != text:
            sys.exit(f"{dst} is out of date: run python tools/build_references.py")
        print(f"{dst.name} is up to date")
        return
    dst.write_text(text, encoding="utf-8")
    n = text.count('"BIBTEXKEY"')
    print(f"wrote {n} records -> {dst}")


if __name__ == "__main__":
    main(sys.argv[1:])
