# Security policy

The applications are static pages: there is no server, no login and no
user data. The realistic risks are in the browser — for example script
injection through crafted data, or a compromised third-party library.

## Supported versions

Only the latest release on `main` receives fixes.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting
instead: *Security* tab → *Report a vulnerability*. Include the affected
page, the steps to reproduce, and the impact you expect. You will receive
an answer within ten working days.

## Third-party libraries

Every library is pinned to an exact version and loaded with a Subresource
Integrity hash, so a modified file on the CDN is refused by the browser.
The list of libraries and versions is in the [README](README.md#technology).
