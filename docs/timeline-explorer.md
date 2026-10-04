# Timeline Explorer

`timeline/index.html` · engine `timeline/app.js` · settings
`timeline/config.js` · data `timeline/data/timeline.js` (global `DATA`).

## What is on the screen

**Sidebar.** Name search and per-group entity lists, *Fit all items*, the
three calendar switches, and the group buttons and checkbox lists.
**Main area.** Period slider, the timeline, zoom slider, and the details card
of the selected item.

## Rows and items

Each group is one row. The reference chronology (`referenceGroup`) is pinned
to the top whenever it is on; the other rows appear in the order they were
switched on, so a group you just enabled lands at the bottom.

| Item | How it is drawn | Selectable |
|---|---|---|
| point (`type` = `point`) | a dot on the middle line of its row; its label is in the hover tooltip | yes |
| range (`type` = `range`) | a bar with the label inside, clipped | yes |
| institution span (a range in an `institutionGroups` row) | a bar behind the row's points | no |
| Easter line | a thin full-height line per year | no — hover shows the date |
| vacancy stripe | a hatched full-height band (papal calendar only) | no |

Items with different `subgroup` values run on parallel tracks inside their
row (see the *Group* rows in the demo, where overlapping members share a row). Institution spans and their points are put
on one track, so the dots sit on the band.

## Navigation

- **Period slider** — shows items whose *start* year lies in the range.
- **Zoom slider** — logarithmic, from the whole range down to one year.
  Mouse-wheel zoom is off; the wheel and dragging pan.
- **Fit all items** — fits the window to what is currently shown.
- **Search** — the box filters the per-group entity lists below it by name;
  picking an entity switches its group on if needed, centres it and opens
  its card.

## Deep links

The selected entity is mirrored in the address bar as `?data=<id>` (on
`file://`, where the query cannot be rewritten, as `#data=<id>`). Opening
such a link selects and centres the entity. Back and Forward step through
the entities reached via cross-links. Ids are row positions in the CSV —
see [Data model](data-model.md#what-the-build-does) on keeping them stable.

## Calendars

Three independent switches. The algorithms are in [Calendars](calendars.md).

- **Julian / Gregorian calendar.** Off: every date is shown in the proleptic
  Gregorian calendar, and pre-reform dates in cards also show the source
  date with a *prol. Greg.* badge. On: dates before the reform are shown in
  Julian reckoning, exactly as recorded, with a *Julian* badge; the axis
  labels follow; a vertical marker shows the reform. Item positions never
  move — only labels change.
- **Papal calendar.** The axis gains regnal years (*1574 · an. III*, with the
  name where a reign begins); cards gain a *Pontifical year* field; vacancies
  are drawn as hatched stripes.
- **Easter dates.** One line per year at Easter Sunday; hover for the date
  and the computus used.

The demo data are built to show the switches at work: Meeting 3
(4 October 1582) and Meeting 4 (15 October 1582) are consecutive days either
side of the reform, and Pontificate 5 spans it.

## Cross-links

In a meeting card, the names in *Chair*, *Secretary* and *Members* are
matched — ignoring case, accents and extra spaces — against the `content` of
entries in `personGroups`:

- one match: the name is a link; the timeline jumps to the entity and opens
  its card;
- several matches: the name is a link; a chooser lists the matches with
  their group and years;
- no match: the name stays plain text, so no link leads nowhere.

The index is rebuilt from the data at every load, so new people become link
targets without any change to the code. In the demo, *Person A* has two
matches (in *Persons* and *Group 1*) and *Person X* none.

## Optional enrichment

If a page also loads `data/enrichment.js` defining
`window.ENRICH = { people: { "<normalised name>": { … } } }`, person and
reign cards show authority records (VIAF, Wikidata), alternative names and a
coat of arms. Without the file nothing changes. Fields per person: `viaf`,
`wikidata`, `names` (array), `arms` (image URL). The key is the entity's
`content`, lower-cased, without accents.

## `config.js` reference

| Key | Type | Meaning |
|---|---|---|
| `maxYear` | number | last year of the axis; panning stops there |
| `referenceGroup` | string | group pinned to the top; its ranges define regnal years and vacancies |
| `vacancyClass` | string | a reference range with this `className` is a vacancy (labels reading *sede vacante* / *sedes vacans* count too) |
| `defaultOn` | string[] | groups shown at start |
| `checklists` | `{ key: [{ value, label }] }` | checkbox lists, rendered into `<div id="list-KEY">`; a `<button data-selectall="KEY">` toggles the list |
| `institutionGroups` | string[] | groups whose ranges are non-selectable lifespans |
| `personGroups` | string[] | groups whose entries are cross-link targets |
| `templates` | `{ group: 'reign' \| 'person' \| 'meeting' \| 'simple' }` | details card per group; default `simple` |
| `reignLabels` | `{ start, end }` | field labels for the start and end of a reign in the `reign` card; default *Start* / *End* (the demo: *Start of the Pontificate* / *End of the Pontificate*) |
| `labels` | `{ group: string }` | heading of the `simple` card; default: the group name |

Group buttons live in `index.html`: a
`<button class="btn-filter" data-group="GROUP" data-color="…">` toggles one
group. `data-color` picks the active colour defined in `timeline.css`.
