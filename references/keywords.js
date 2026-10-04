/* Keyword taxonomy shared by Search References and Build Graphs.
 *
 * GROUPS  — the checkbox groups: id -> list of keyword values. A record
 *           matches when its KEYWORDS field contains any ticked value.
 * PANELS  — the collapsible sidebar tree that lays the groups out.
 *
 * Edit this file to adapt the apps to another vocabulary; nothing else
 * needs to change. See docs/customising.md.
 *
 * PANELS entries:
 *   title      heading on the coloured button
 *   colour     button background
 *   selectAll  show a "Select all" button that toggles the groups of
 *              THIS panel only (not those of nested panels)
 *   rows       { g: <GROUPS id>, indent: 0 | 1 | 2 }  or  { hr: true }
 *   children   nested panels, rendered after the rows
 *
 * Matching is a substring test (see docs/references-explorer.md), so avoid
 * a value that occurs inside another value, e.g. "Term 1" next to "Term 10".
 */

const GROUPS = {
  group1:        ['Group 1'],
  group1_terms:  ['Term 1.1', 'Term 1.2', 'Term 1.3', 'Term 1.4', 'Term 1.5'],

  group2:        ['Group 2'],
  group2_terms:  ['Term 2.1', 'Term 2.2', 'Term 2.3'],
  group2_detail: ['Detail 2.a', 'Detail 2.b', 'Detail 2.c', 'Detail 2.d'],

  group3:        ['Group 3'],
  sec3a:         ['Section 3.A'],
  sec3a_terms:   ['Term 3.A.1', 'Term 3.A.2', 'Term 3.A.3'],
  sec3b:         ['Section 3.B'],
  sec3b_terms:   ['Term 3.B.1', 'Term 3.B.2'],
  sec3b_detail:  ['Detail 3.B.a', 'Detail 3.B.b']
};

const PANELS = [
  {
    title: 'Group 1', colour: '#606c38', selectAll: true,
    rows: [
      { g: 'group1', indent: 0 },
      { g: 'group1_terms', indent: 1 }
    ]
  },
  {
    title: 'Group 2', colour: '#41542c', selectAll: true,
    rows: [
      { g: 'group2', indent: 0 },
      { g: 'group2_terms', indent: 1 },
      { hr: true },
      { g: 'group2_detail', indent: 2 }
    ]
  },
  {
    // a panel without its own Select all, holding nested panels
    title: 'Group 3', colour: '#936639',
    rows: [{ g: 'group3', indent: 0 }],
    children: [
      {
        title: 'Section 3.A', colour: '#a68a64', selectAll: true,
        rows: [
          { g: 'sec3a', indent: 1 },
          { g: 'sec3a_terms', indent: 2 }
        ]
      },
      {
        title: 'Section 3.B', colour: '#a68a64', selectAll: true,
        rows: [
          { g: 'sec3b', indent: 1 },
          { g: 'sec3b_terms', indent: 2 },
          { hr: true },
          { g: 'sec3b_detail', indent: 2 }
        ]
      }
    ]
  }
];
