#!/usr/bin/env python3
"""
Generate the dummy datasets that ship with the repository.

The real SCC datasets are not public. This script writes synthetic records
that exercise every feature of the three applications, using the same
schemas as the production data:

  references/data/references.csv   bibliography (Search References, Build Graphs)
  timeline/data/timeline.csv       points, ranges and backgrounds (Timeline)

Output is deterministic (fixed seed), so re-running it produces identical
files and a clean `git diff`.

    python tools/generate_dummy_data.py
"""
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
rng = random.Random(20260401)

# ---------------------------------------------------------------- references
# Keyword vocabulary. Must match references/keywords.js.
G1 = ["Term 1.1", "Term 1.2", "Term 1.3", "Term 1.4", "Term 1.5"]
G2 = ["Term 2.1", "Term 2.2", "Term 2.3"]
G2D = ["Detail 2.a", "Detail 2.b", "Detail 2.c", "Detail 2.d"]
S3A = ["Term 3.A.1", "Term 3.A.2", "Term 3.A.3"]
S3B = ["Term 3.B.1", "Term 3.B.2"]
S3BD = ["Detail 3.B.a", "Detail 3.B.b"]

TYPES = [  # (TYPE, BibTeX CATEGORY, weight)
    ("Book", "BOOK", 5), ("Book Section", "INBOOK", 4),
    ("Journal Article", "ARTICLE", 6), ("Edited Book", "BOOK", 2),
    ("Thesis", "PHDTHESIS", 1), ("Source Edition", "BOOK", 2),
]
AUTHORS = [f"Author {i:02d}, {chr(65 + (i - 1) % 26)}." for i in range(1, 27)]
PLACES = [f"Place {i}" for i in range(1, 9)]
PUBLISHERS = [f"Publisher {i}" for i in range(1, 7)]
LANGUAGES = [f"Language {i}" for i in range(1, 6)]
JOURNALS = [f"Journal {c}" for c in "ABCDE"]

REF_COLUMNS = ["AUTHOR", "YEAR", "TITLE", "JOURNAL", "BOOKTITLE", "EDITOR",
               "PUBLISHER", "PLACE", "SERIES", "VOLUME", "NUMBER", "PAGES",
               "NOTES", "LANGUAGE", "TYPE", "KEYWORDS", "BIBTEXKEY", "CATEGORY"]


def year_for(i):
    # a few early sources, then a long tail towards the present
    if i < 6:
        return rng.randint(1560, 1790)
    if i < 12:
        return rng.randint(1800, 1950)
    return rng.randint(1951, 2024)


def keywords_for(i):
    kw = ["Group 1", G1[i % len(G1)]]            # every record has a Group 1 term
    if rng.random() < 0.6:
        kw += ["Group 2"] + rng.sample(G2, rng.randint(1, 2))
        if rng.random() < 0.5:
            kw += rng.sample(G2D, rng.randint(1, 2))
    if rng.random() < 0.6:
        kw.append("Group 3")
        if rng.random() < 0.7:
            kw += ["Section 3.A"] + rng.sample(S3A, rng.randint(1, 2))
        if rng.random() < 0.5:
            kw += ["Section 3.B"] + rng.sample(S3B, 1)
            if rng.random() < 0.5:
                kw.append(rng.choice(S3BD))
    return ", ".join(kw)


def references(n=60):
    weighted = [t for t in TYPES for _ in range(t[2])]
    rows = []
    for i in range(n):
        typ, cat, _ = rng.choice(weighted)
        r = dict.fromkeys(REF_COLUMNS, "")
        r.update({
            "AUTHOR": rng.choice(AUTHORS),
            "YEAR": str(year_for(i)),
            "TITLE": f"Sample title {i + 1:02d}: a dummy record for testing",
            "PUBLISHER": rng.choice(PUBLISHERS),
            "PLACE": rng.choice(PLACES),
            "LANGUAGE": rng.choice(LANGUAGES),
            "TYPE": typ,
            "CATEGORY": cat,
            "KEYWORDS": keywords_for(i),
            "BIBTEXKEY": f"DUMMY{i + 1:03d}",
        })
        if typ == "Journal Article":
            r.update(JOURNAL=rng.choice(JOURNALS), VOLUME=str(rng.randint(1, 80)),
                     NUMBER=str(rng.randint(1, 4)), PUBLISHER="", PLACE="")
        if typ == "Book Section":
            r.update(BOOKTITLE=f"Sample volume {rng.randint(1, 9)}",
                     EDITOR=rng.choice(AUTHORS))
        if typ in ("Journal Article", "Book Section"):
            p = rng.randint(1, 400)
            r["PAGES"] = f"{p}-{p + rng.randint(8, 40)}"
        if typ == "Edited Book":
            r["EDITOR"] = r["AUTHOR"]
        if rng.random() < 0.2:
            r["SERIES"] = f"Series {rng.choice('XYZ')}"
        rows.append(r)
    # Every vocabulary term must occur at least once, so no checkbox is inert
    used = {t.strip() for r in rows for t in r["KEYWORDS"].split(",")}
    for term in G1 + G2 + G2D + S3A + S3B + S3BD:
        if term not in used:
            r = rng.choice(rows)
            r["KEYWORDS"] += ", " + term
    rows.sort(key=lambda r: (r["AUTHOR"], r["YEAR"]))
    return rows


# ------------------------------------------------------------------ timeline
TL_COLUMNS = ["content", "group", "subgroup", "type", "className", "start", "end",
              "name", "info", "bib", "date_of_birth", "date_of_death",
              "place", "location", "chair", "secretary", "members",
              "source_transcription", "archival_reference", "notes", "record_id"]


def tl(content, group, start, end="", type_="range", className="", subgroup="A", **kw):
    r = dict.fromkeys(TL_COLUMNS, "")
    r.update(content=content, group=group, subgroup=subgroup, type=type_,
             className=className, start=start, end=end or start)
    r.update(kw)
    return r


def timeline():
    rows = []
    # Reference chronology: drives the papal calendar (regnal years) and the
    # sede vacante stripes. Pontificate 5 deliberately spans the Gregorian
    # reform of October 1582, to exercise regnal-year arithmetic across it.
    reigns = [
        ("Pontificate 1", "11-02-1550", "20-03-1555"),
        ("Sede vacante", "20-03-1555", "06-04-1555"),
        ("Pontificate 2", "06-04-1555", "15-08-1559"),
        ("Sede vacante", "15-08-1559", "22-12-1559"),
        ("Pontificate 3", "22-12-1559", "06-12-1565"),
        ("Sede vacante", "06-12-1565", "04-01-1566"),
        ("Pontificate 4", "04-01-1566", "28-04-1572"),
        ("Sede vacante", "28-04-1572", "10-05-1572"),
        ("Pontificate 5", "10-05-1572", "07-04-1585"),
        ("Sede vacante", "07-04-1585", "21-04-1585"),
        ("Pontificate 6", "21-04-1585", "24-08-1590"),
        ("Sede vacante", "24-08-1590", "02-02-1592"),
        ("Pontificate 7", "02-02-1592", "01-03-1605"),
        ("Sede vacante", "01-03-1605", "14-05-1605"),
        ("Pontificate 8", "14-05-1605", "26-01-1621"),
    ]
    for i, (name, s, e) in enumerate(reigns):
        vac = name == "Sede vacante"
        rows.append(tl(name, "Pontificates", s, e,
                       className="reign_vacancy" if vac else "reign",
                       name="" if vac else f"Personal name of {name}",
                       date_of_birth="" if vac else str(int(s[-4:]) - 60),   # year only
                       date_of_death="" if vac else e,
                       bib="" if vac else "Sample bibliography entry for the reference chronology.",
                       record_id="" if vac else f"REIGN-{i // 2 + 1:02d}"))

    # Persons: ranges, targets of the cross-links in meeting cards
    holders = [
        ("Person A", "03-03-1556", "17-07-1571"),
        ("Person B", "17-07-1571", "09-02-1589"),
        ("Person C", "09-02-1589", "28-11-1604"),
        ("Person D", "28-11-1604", "30-06-1619"),
    ]
    for name, s, e in holders:
        rows.append(tl(name, "Persons", s, e, className="person",
                       name=f"{name}, full personal name",
                       info=f"{name} held the office in this period.",
                       bib="Sample bibliography entry for a person."))

    # Groups: three rows behind one (Un)select All. Person A appears here AND
    # among the Persons, so clicking that name in a meeting card opens the
    # disambiguation chooser.
    members = [
        ("Group_1", "Person A", "1557", "1575"),
        ("Group_1", "Person E", "1560", "1584"),
        ("Group_2", "Person F", "1572", "1598"),
        ("Group_2", "Person G", "1580", "1601"),
        ("Group_3", "Person H", "1594", "1614"),
        ("Group_3", "Person I", "1600", "1620"),
    ]
    for i, (grp, name, y0, y1) in enumerate(members):
        # overlapping members of one group run on two parallel tracks
        rows.append(tl(name, grp, f"01-06-{y0}", f"01-06-{y1}", className="member",
                       subgroup="A" if i % 2 == 0 else "B",
                       name=f"{name}, full personal name",
                       info=f"{name} was a member of {grp.replace('_', ' ')}."))

    # Meetings: points whose cards carry participant names that link back to
    # the timeline. "Person X" is deliberately absent from the data: a name
    # without a match is shown as plain text, not as a link.
    # Meetings 3 and 4 fall on consecutive days either side of the Gregorian
    # reform: 4 October 1582 (Julian) and 15 October 1582 (Gregorian).
    meetings = [
        ("Meeting 1", "07-05-1562", "Person A", "Person E", "Person E, Person X"),
        ("Meeting 2", "21-09-1574", "Person B", "Person A", "Person A, Person F"),
        ("Meeting 3", "04-10-1582", "Person B", "Person F", "Person F, Person G"),
        ("Meeting 4", "15-10-1582", "Person B", "Person F", "Person E, Person G"),
        ("Meeting 5", "11-04-1597", "Person C", "Person H", "Person G, Person H"),
        ("Meeting 6", "29-08-1610", "Person D", "Person I", "Person H, Person I"),
    ]
    for i, (name, d, chair, secr, mem) in enumerate(meetings, 1):
        rows.append(tl(name, "Meetings", d, d, type_="point", className="meeting",
                       place="Place 1", location=f"Building {1 + i % 2}",
                       chair=chair, secretary=secr, members=mem,
                       source_transcription=f"Sample transcription of the record of {name}.",
                       archival_reference=f"Archive, Fonds 1, vol. {i}, f. {10 * i}r",
                       notes="Names of participants found on the timeline are links to them.",
                       record_id=f"MEET-{i:03d}"))

    # Institutions: the lifespan is a background band (not clickable);
    # the events are points drawn on top of it.
    inst = [
        ("Institution_1", "Institution 1", "01-01-1550", "31-12-1620",
         [("Foundation of Institution 1", "12-03-1552"),
          ("Reform of Institution 1", "08-08-1588")]),
        ("Institution_2", "Institution 2", "15-07-1567", "31-12-1620",
         [("Foundation of Institution 2", "15-07-1567"),
          ("Reform of Institution 2", "02-02-1603")]),
    ]
    for grp, band, s, e, evs in inst:
        rows.append(tl(band, grp, s, e, className="institution",
                       info=f"Lifespan of {grp.replace('_', ' ')}."))
        for name, d in evs:
            rows.append(tl(name, grp, d, d, type_="point", className="institution_point",
                           info=f"Description of the {name.lower()}."))
    return rows


def write(path, columns, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=columns, delimiter=";", lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows):3d} rows -> {path.relative_to(ROOT)}")


if __name__ == "__main__":
    write(ROOT / "references/data/references.csv", REF_COLUMNS, references())
    write(ROOT / "timeline/data/timeline.csv", TL_COLUMNS, timeline())
