# Customising

How to run the applications on your own data. No JavaScript needs to change
for the common cases below.

## Your own bibliography

1. Export your references to a semicolon-separated CSV with the columns in
   [Data model](data-model.md#bibliography--referencesdatareferencescsv).
   From Zotero or EndNote, a BibTeX export converted with a script, or a
   spreadsheet saved as CSV, both work.
2. Replace `references/data/references.csv`.
3. Rebuild: `python tools/build_references.py`.
4. Adapt the keyword tree (next section) to the terms in your `KEYWORDS`.

The build stops with a message if a required column is missing or a
`BIBTEXKEY` repeats.

## Your own keyword tree

Edit `references/keywords.js`; both reference applications read it.

```js
const GROUPS = {
  periods:   ['Middle Ages', 'Early modern'],
  places:    ['Rome', 'Trent', 'Bologna']
};

const PANELS = [
  { title: 'Periods', colour: '#606c38', selectAll: true,
    rows: [{ g: 'periods', indent: 0 }] },
  { title: 'Places', colour: '#936639', selectAll: true,
    rows: [{ g: 'places', indent: 1 }] }
];
```

- Every term in `GROUPS` should appear in some record's `KEYWORDS`;
  otherwise its checkbox does nothing.
- Avoid terms that occur inside other terms (`Rome` and `Roman Curia`
  would both match *Roman Curia*) — matching is a substring test.
- `rows` may contain `{ hr: true }` for a separator; `children` nests panels.

## Your own timeline

1. Write `timeline/data/timeline.csv` following
   [Data model](data-model.md#timeline--timelinedatatimelinecsv). Record
   every date as the source gives it.
2. Rebuild: `python tools/build_timeline.py`.
3. In `timeline/config.js`, list your groups: which one is the reference
   chronology (if any), which are people, which are institutions, which card
   each uses. See the [configuration reference](timeline-explorer.md#configjs-reference).
4. In `timeline/index.html`, add one button per group you want to toggle:
   ```html
   <button class="btn-filter" type="button" data-group="Councils" data-color="event">Councils</button>
   ```
   and, for checkbox lists, a container plus an optional select-all button:
   ```html
   <button class="btn-mini" type="button" data-selectall="dioceses">(Un)select all</button>
   <div class="check-list" id="list-dioceses"></div>
   ```
   with the matching `checklists.dioceses` entry in `config.js`.

### Without a reference chronology

If your data have no reigns, set `referenceGroup` to a group that does not
exist. The papal calendar then finds no reigns and leaves the axis and the
cards unchanged; remove its switch from `index.html` to avoid confusion.
Easter dates and the Julian / Gregorian switch work regardless.

### A different reference chronology

Any sequence of consecutive ranges can serve: reigns of kings, terms of
office, abbacies. The regnal year is counted from the start of each range;
rename the switch label in `index.html` to match.

## Colours

- **Keyword panels:** the `colour` of each entry in `PANELS`.
- **Timeline items:** one CSS rule per `className` in `timeline/timeline.css`,
  for example
  ```css
  #tl-app .vis-item.council { background: #5c5c3d; border-color: #3d3d28; color: #fff; }
  #tl-app .vis-item.council .vis-dot { border-color: #5c5c3d; }   /* for points */
  ```
- **Group buttons:** add a `data-color` value and its `.active` rule in
  `timeline/timeline.css`.
- **Demo page shell:** the variables at the top of `assets/demo.css`.

## Regenerating the synthetic data

`tools/generate_dummy_data.py` writes both CSV files from a fixed seed.
Change the seed or the record lists to produce a different demo, then run the
two build scripts.
