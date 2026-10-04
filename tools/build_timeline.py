#!/usr/bin/env python3
"""
Convert the timeline CSV into a JavaScript data file.

    python tools/build_timeline.py [input.csv] [output.js]

Defaults: timeline/data/timeline.csv -> timeline/data/timeline.js

The CSV is the source of truth; the generated file defines one global,
`DATA`, loaded by timeline/index.html with a <script> tag (so the app also
runs from file:// without a server).

What the conversion does:
  - assigns each row a stable numeric `id` (its 1-based position), which is
    also the deep-link id in ?data=<id>;
  - dates: dd-mm-yyyy  ->  yyyy-mm-dd. Dates are kept AS RECORDED: the app
    decides at load time whether a date is Julian or Gregorian (see
    docs/calendars.md); no calendar conversion happens here;
  - `year`: the start year as a number (used by the period slider);
  - "Label (https://...)" in the place / location fields becomes a link;
  - empty descriptive cells become "No information available"; structural
    cells (dates, group, type, className, subgroup) stay empty.

Rows without a valid start date are skipped and reported.
Pass --check to verify the output is up to date (used in CI).
"""
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NA = "No information available"
STRUCTURAL = {"start", "end", "group", "subgroup", "type", "className", "year", "id"}
LINK_FIELDS = ["place", "location"]
REQUIRED = ["content", "group", "type", "start", "end"]


def make_link(val):
    m = re.search(r"\((https?://[^)]+)\)", val or "")
    if not m:
        return val
    name = (val[:m.start()] + val[m.end():]).strip()
    return f"<a href='{m.group(1)}' target='_blank' rel='noopener'>{name}</a>"


def parse_date(s):
    m = re.fullmatch(r"(\d{1,2})-(\d{1,2})-(\d{1,4})", (s or "").strip())
    if not m:
        return None, None
    d, mo, y = (int(x) for x in m.groups())
    if not (1 <= mo <= 12 and 1 <= d <= 31):
        return None, None
    return f"{y:04d}-{mo:02d}-{d:02d}", y


def build(src):
    with open(src, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f, delimiter=";"))
    if not rows:
        sys.exit(f"{src}: no rows")
    missing = [c for c in REQUIRED if c not in rows[0]]
    if missing:
        sys.exit(f"{src}: missing required columns {missing}")

    items, skipped = [], []
    for idx, r in enumerate(rows, start=1):
        o = {k: (v or "").strip() for k, v in r.items() if k}
        o["id"] = idx
        o["start"], year = parse_date(o.get("start"))
        o["end"], _ = parse_date(o.get("end"))
        o["year"] = year
        if not o["start"]:
            skipped.append(idx + 1)               # +1: header line
            continue
        for f in LINK_FIELDS:
            if o.get(f):
                o[f] = make_link(o[f])
        for k, v in list(o.items()):
            if k not in STRUCTURAL and v == "":
                o[k] = NA
        items.append(o)
    if skipped:
        print(f"skipped {len(skipped)} rows without a valid start date "
              f"(CSV lines {skipped[:10]}{'…' if len(skipped) > 10 else ''})", file=sys.stderr)
    return items


def render(items, src):
    return ("// Generated from %s by tools/build_timeline.py. Do not edit by hand.\n"
            "const DATA = %s;\n" % (src, json.dumps(items, ensure_ascii=False, indent=1)))


def main(argv):
    check = "--check" in argv
    args = [a for a in argv if a != "--check"]
    src = Path(args[0]) if args else ROOT / "timeline/data/timeline.csv"
    dst = Path(args[1]) if len(args) > 1 else ROOT / "timeline/data/timeline.js"
    label = src.relative_to(ROOT) if src.is_absolute() and ROOT in src.parents else src
    items = build(src)
    text = render(items, label.as_posix())
    if check:
        if not dst.exists() or dst.read_text(encoding="utf-8") != text:
            sys.exit(f"{dst} is out of date: run python tools/build_timeline.py")
        print(f"{dst.name} is up to date")
        return
    dst.write_text(text, encoding="utf-8")
    print(f"wrote {len(items)} items -> {dst}")


if __name__ == "__main__":
    main(sys.argv[1:])
