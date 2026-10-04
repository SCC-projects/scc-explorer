# Data model

Both datasets are semicolon-separated CSV files in UTF-8, with a header row.
Semicolons rather than commas because titles, keyword lists and member lists
contain commas.

## Bibliography — `references/data/references.csv`

One row per record. The column set follows the BibTeX export of the
production catalogue.

| Column | Required | Used for |
|---|---|---|
| `AUTHOR` | yes | table, category filter, BibTeX |
| `YEAR` | yes | table, category filter, period slider (via `Year_format`), graph axis |
| `TITLE` | yes | table, category filter, BibTeX |
| `JOURNAL` | | table, BibTeX |
| `BOOKTITLE` | | table, BibTeX |
| `EDITOR` | | table, BibTeX |
| `PUBLISHER` | | table, category filter, BibTeX |
| `PLACE` | | table, category filter, graph axis, BibTeX |
| `SERIES`, `VOLUME`, `NUMBER`, `PAGES` | | table, BibTeX |
| `NOTES` | | searchable by the general search, not shown |
| `LANGUAGE` | | table, category filter, graph axis, BibTeX |
| `TYPE` | yes | table, graph axis (as *Typology of publication*), BibTeX |
| `KEYWORDS` | yes | keyword tree (see below) |
| `BIBTEXKEY` | yes, unique | row selection, BibTeX key |
| `CATEGORY` | yes | BibTeX entry type (`BOOK`, `INBOOK`, `ARTICLE`…) |

`tools/build_references.py` trims every cell, turns `NA` into an empty
string, adds **`Year_format`** (the first four-digit year found in `YEAR`, so
`"1650-1652"` and `"c. 1650"` both yield `1650`), drops exact duplicate rows,
sorts by author and year, and stops with an error if a required column is
missing or a `BIBTEXKEY` occurs twice.

### How keywords match

`KEYWORDS` is a comma-separated list of terms taken from
`references/keywords.js`. A record is kept when its `KEYWORDS` field
**contains any ticked term**: all ticked terms are joined into one regular
expression (`term1|term2|…`, special characters escaped) and tested against
the field.

Two consequences:

- **The test is a substring test**, not an exact match per item. A ticked
  `Term 1` would also match a record tagged `Term 10`. Choose terms that do
  not occur inside one another.
- **The test is OR across the whole tree.** A record tagged with five terms
  stays visible until all five are unticked. To isolate one subject, clear
  everything, then tick that subject alone.

With nothing ticked, nothing matches.

## Timeline — `timeline/data/timeline.csv`

One row per item on the timeline.

### Structural columns

| Column | Required | Meaning |
|---|---|---|
| `content` | yes | label on the timeline, title of the card, name used by cross-links |
| `group` | yes | row id; must match a group in `config.js` or a sidebar button |
| `type` | yes | `range` (start → end) or `point` (a single date) |
| `start` | yes | `dd-mm-yyyy`, as recorded in the source (see below) |
| `end` | yes | `dd-mm-yyyy`; for a point, the same as `start` |
| `subgroup` | | track within the row; items with different values run in parallel |
| `className` | | CSS class of the item: colour and shape (`timeline/timeline.css`) |

### Descriptive columns

Shown in the details card. Which card a group uses is set in `config.js`
(`templates`); each card reads the columns below. Empty cells are shown as
*No information available*.

| Column | `reign` | `person` | `meeting` | `simple` |
|---|:-:|:-:|:-:|:-:|
| `info` | | ✓ | | ✓ |
| `name` (full personal name) | ✓ | ✓ | | |
| `bib` (bibliography) | ✓ | ✓ | | |
| `date_of_birth` (shown as the year only) | ✓ | | | |
| `date_of_death` | ✓ | | | |
| `record_id` | ✓ | | ✓ | |
| `place`, `location` | | | ✓ | |
| `chair`, `secretary`, `members` | | | ✓ (as links) | |
| `source_transcription`, `archival_reference`, `notes` | | | ✓ | |

`place` and `location` may be written `Label (https://…)`; the build turns
them into links. `chair`, `secretary` and `members` hold names separated by
commas; each name becomes a link to the matching entity (see
[Timeline Explorer](timeline-explorer.md#cross-links)).

### Dates are recorded as written

Write every date **as the source gives it**. Before the Gregorian reform
(15 October 1582) that is a Julian date; from then on, Gregorian. Do not
convert. The build only changes the format (`dd-mm-yyyy` → `yyyy-mm-dd`); the
application decides at load time which calendar a date belongs to and
converts it for positioning — see [Calendars](calendars.md).

### What the build does

`tools/build_timeline.py` gives each row a numeric `id` (its position in the
CSV, starting at 1 — also the id in deep links), reformats the dates, adds
`year` (the start year, used by the period slider), turns `Label (URL)` into
links, fills empty descriptive cells, and skips — with a report — any row
without a valid start date.

Because the `id` is the row position, **inserting or deleting rows changes
the ids of all rows below**, and with them any deep links that were shared.
Append new rows at the end if links must stay stable.
