# References Explorer

Two applications on one catalogue (`DATASET`) and one keyword tree
(`GROUPS`, `PANELS` in `references/keywords.js`).

## Search References — `references/search.html`

### Filters

All filters combine with AND; within a filter the rules below apply.

| Filter | Rule |
|---|---|
| General search | DataTables search over every column, hidden ones included (`NOTES`, `Year_format`) |
| Period of time | `Year_format` within the slider range. Records without a year are **kept** |
| Categories | Author, title, year, publisher, place, language: exact match; several values in one field = OR |
| Keywords | `KEYWORDS` contains any ticked term ([details](data-model.md#how-keywords-match)) |

The category lists offer only values present in the current result, so they
narrow as the other filters narrow; values already selected are kept.

### Keyword tree

Built from `PANELS`. Each coloured button opens a panel; panels can nest.
A panel with `selectAll: true` gets a *Select / clear all* button that acts
on that panel's own checkboxes, not on those of nested panels: if any is
unticked it ticks them all, otherwise it clears them.

### Table

- Columns can be hidden and shown (*Columns*), copied and printed.
- Long fields (title, keywords, book title, journal) are clamped to five
  lines; click a cell to expand it.
- Click a row to select it; selection survives paging, sorting and
  filtering.

### BibTeX export

*Download BibTeX* offers two options: every record of the current result
(after all filters, including the general search), or only the selected
rows. The entry type comes from `CATEGORY`, the key from `BIBTEXKEY`; empty
fields are left out. The file is built in the browser — nothing is uploaded.

## Build Graphs — `references/graph.html`

### Chart types

| Type | What is drawn | Area selection |
|---|---|---|
| Bubble | one bubble per X × Y cell and colour value; area grows with the number of records (radius = 4 + 3.5 √n px) | yes |
| Bar | records per X category, stacked by the Y category; horizontal | yes |
| Pie | share of each value of the colour column (*Type of Entity*) | no |

Each of X, Y and colour can be Year, Place, Language or Typology of
publication (the record's `TYPE`). Year is a numeric axis; the others are
categorical.

### Filters

The keyword tree and the period slider filter the chart exactly as in
Search References, with one difference: here, **records without a year are
left out**, because they have no place on a year axis.

### Area selection

Drag a rectangle over a bubble or bar chart. Every bubble whose centre lies
inside the rectangle, and every bar segment the rectangle touches,
contributes all the records it stands for; the table underneath lists them,
without duplicates. *Clear selection* empties it.

### Export

- *Download Plot* — the chart as PNG, on a white background.
- *Download this table* — the selection as CSV (semicolon-separated), as a
  file Excel opens directly, or as BibTeX. The Excel option is the same
  semicolon-separated text with an `.xls` name and Excel media type, not a
  binary workbook.

## Implementation notes

**Categorical axes in Chart.js.** Categories are mapped to their index and
drawn on a linear axis with one tick per category, because Chart.js's own
category scale cannot place several points in the same category cell
without overlap bookkeeping.

**Colours.** A fixed palette of twelve; beyond twelve values the hue circle
is walked by the golden angle, so a column with thirty values stays legible.
With more than fourteen values the legend moves below the chart.

**Selection.** A small Chart.js plugin tracks pointer events on the canvas,
draws the rectangle in `afterDraw`, and on release tests it against the
rendered elements. Every element carries the records it was built from.
The listeners are bound to an `AbortController` owned by the chart, so they
are removed when the chart is redrawn.
