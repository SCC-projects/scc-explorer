# Contributing

Thank you for helping. Bug reports, fixes, documentation and new features are
all welcome.

## The one rule

**Never commit research data from the SCC project.** That includes records
from the bibliography, the timeline, archival references and transcriptions,
in whole or in part, also as test fixtures or in screenshots. This repository
ships synthetic data only. If you need a record shape that the generator
does not produce, extend `tools/generate_dummy_data.py`.

## Reporting a bug

Open an issue with the bug template. The most useful reports say which
application, which browser, what you did, what you expected, what happened,
and include any errors from the browser console. For the Timeline, a deep
link (`?data=<id>`) to the affected entity saves a lot of time.

## Setting up

There is no toolchain. You need a browser and Python 3.8 or later (standard
library only).

```sh
git clone https://github.com/SCC-projects/scc-explorer.git
cd scc-explorer
python -m http.server 8000
```

## Making a change

1. Branch from `main`.
2. Keep the change focused; one pull request per concern.
3. If you change a CSV, or the generator, rebuild the data files and commit
   them together with the CSV:
   ```sh
   python tools/generate_dummy_data.py    # only if you changed the generator
   python tools/build_references.py
   python tools/build_timeline.py
   ```
   CI fails when a generated file does not match its CSV.
4. Test the affected application by hand in at least one Chromium-based
   browser and Firefox, from a web server **and** from `file://`.
5. Update the documentation in `docs/` when behaviour changes, and add a line
   to `CHANGELOG.md` under *Unreleased*.

## Code style

- Plain JavaScript (ES2019), no framework, no bundler. Each application is
  wrapped so it adds as few globals as possible; the data files and the two
  configuration files (`keywords.js`, `config.js`) are the intended globals.
- CSS for an application stays scoped under its root id (`#scc-search`,
  `#scc-graph`, `#tl-app`), so the apps can be embedded in a host page.
- New libraries are pinned to an exact version and carry an `integrity`
  hash. Prefer jsDelivr, which serves npm files byte for byte, so the hash
  can be computed from the npm package.
- Comments explain *why*; the code shows *what*.
- Indent with two spaces in JavaScript, HTML and CSS, four in Python
  (see `.editorconfig`).

## Licensing of contributions

By contributing you agree that your code is released under the
[MIT licence](LICENSE) and your documentation under
[CC BY 4.0](docs/LICENSE), as the rest of the repository.

## Code of conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
