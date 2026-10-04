# Architecture

## In one paragraph

Each application is a static HTML page plus one JavaScript file and one
stylesheet. Its data is a JavaScript file generated from a CSV, attached with
a `<script>` tag. Libraries come from a CDN. There is no server, no database,
no framework and no build step for the code: the browser does all the work,
and the same files run from a web server or straight from disk.

## Why no server

The applications began in R with Shiny and ran on a Shiny server. Every
interaction — ticking a keyword, moving a slider — went to the server and
back. The catalogue holds a few thousand records and the timeline about a
thousand entities: small enough for a browser to filter instantly. Moving the
work into the browser made the apps faster, removed the server to maintain,
and made hosting trivial (any static host, including GitHub Pages).

## Files and globals

```
references/
  data/references.js   → DATASET        generated from references.csv
  keywords.js          → GROUPS, PANELS keyword taxonomy, shared
  search.js            (no globals)     Search References
  graph.js             (no globals)     Build Graphs
timeline/
  data/timeline.js     → DATA           generated from timeline.csv
  config.js            → TL_CONFIG      everything dataset-specific
  app.js               (script scope)   the Timeline engine
```

Load order matters and is fixed in each HTML page: libraries, then the data
file, then the configuration, then the application.

The two reference applications are wrapped in an IIFE and add no globals. The
Timeline engine runs in script scope (its functions are globals); that is
inherited from the original and harmless on a page of its own, but keep it in
mind when embedding it next to other scripts.

## Why the data are a `.js` file and not fetched

`fetch('data.csv')` would be the obvious design, but browsers refuse `fetch()`
on `file://` URLs. Users of a research tool do download it and open it from
disk, so the data are compiled to a JavaScript file that a `<script>` tag can
load anywhere. The CSV stays the source of truth; the build scripts
(`tools/build_*.py`) regenerate the `.js` file and CI checks that the two
agree.

## Why the CSS is scoped

On the production platform, the applications sit inside pages that already
carry Bootstrap 3, Bootstrap 5 and a site stylesheet — all of which define
`.panel-body`, `.container`, `.table`, `h3` and so on. Every rule of an
application is therefore prefixed with its root element (`#scc-search`,
`#scc-graph`, `#tl-app`), so the host page cannot restyle the app and the app
cannot leak onto the host. The demo pages in this repository use a minimal
shell (`assets/demo.css`) instead, but the scoping is kept so the files can be
dropped into any site.

## Libraries

| Library | Role |
|---|---|
| DataTables (+ Buttons) | result tables; column visibility, copy, print |
| Select2 | multi-select category filters |
| noUiSlider | period sliders |
| Chart.js | charts in Build Graphs (replaces ggplot2) |
| vis-timeline | the Timeline (replaces timevis, which wraps the same library) |
| jQuery | required by DataTables and Select2 |

All are pinned to exact versions and loaded from jsDelivr with Subresource
Integrity hashes. jsDelivr serves npm packages byte for byte, which is what
makes the hashes reproducible: compute them from the npm tarball.

## What runs where

| Concern | Search References | Build Graphs | Timeline |
|---|---|---|---|
| Filtering | in the browser, on `DATASET` | same | in the browser, on `DATA` |
| Rendering | DataTables | Chart.js + DataTables | vis-timeline |
| Export | BibTeX, copy, print | PNG, CSV, Excel, BibTeX | — (deep links) |
| State in the URL | — | — | selected entity (`?data=<id>`) |
