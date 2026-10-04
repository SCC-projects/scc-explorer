# Deployment

The repository is the website: there is nothing to build. Any host that
serves static files will do.

## GitHub Pages

The workflow `.github/workflows/pages.yml` publishes the repository on every
push to `main`.

1. *Settings → Pages → Build and deployment → Source:* **GitHub Actions**.
2. Push to `main`, or run the workflow by hand from the *Actions* tab.
3. The site appears at `https://<organisation>.github.io/<repository>/`.

## Any other host

Copy the files as they are — Apache, nginx, an institutional web space, an
S3 bucket, Netlify. Relative links only, so the site works in a sub-folder.
`tools/` and the CSV files are not needed at runtime but do no harm.

## From disk

Open `index.html` directly. Everything works from `file://`, including the
Timeline's deep links (they fall back to `#data=<id>`). Only the libraries
need the network, on first load.

## Fully offline

To run without a network connection, serve the libraries locally:

1. Download the files listed in the [README](../README.md#technology) —
   the exact URLs are in the `<link>` and `<script>` tags of each page, e.g.
   `https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js`.
   `npm install jquery@3.7.1 datatables.net@1.13.8 …` fetches the same files.
2. Put them in a folder such as `vendor/`.
3. Point the tags at the local copies. Keep or drop the `integrity`
   attributes: the hashes are of the files themselves and remain valid.

## Embedding in an existing site

This is how the applications run on the production platform, inside pages
with their own navbar, footer and Bootstrap.

1. Copy the application's block — everything inside `<div id="scc-search">`,
   `<div id="scc-graph">` or `<div id="tl-app">` — into the host page.
2. Add its stylesheet and libraries to the host page's `<head>`, and its
   scripts (libraries → data → configuration → application) before
   `</body>`.
3. Leave `assets/demo.css` out; the host page provides the shell.

The applications' CSS is scoped under their root id, so the host page's
styles do not reach in and the app's do not leak out. Watch for these:

- **jQuery versions.** If the host already loads jQuery, load it once. A
  *slim* build lacks what DataTables needs; use the full build.
- **DataTables styling.** Use the default build (`jquery.dataTables`), not a
  Bootstrap integration build, when the host mixes Bootstrap versions.
- **Fixed headers.** A fixed navbar can cover the app's top edge; add top
  padding to the app's container.
- **The Timeline's globals.** `app.js` runs in script scope, so its
  top-level names (`DATA`, `timeline`, `main`, `field` …) are shared with
  every other script on the page. One matters in particular: it declares a
  small helper called `$`, which is *not* jQuery. Being a top-level `const`,
  it shadows jQuery's `$` for every script that runs after it. Host scripts
  on the same page must call `jQuery(…)` instead of `$(…)` — or give the
  Timeline a page of its own, as the platform does.
