/* Timeline Explorer — configuration.
 *
 * Everything that depends on the dataset lives here; app.js is generic.
 * Group ids must match the `group` column of data/timeline.csv.
 * See docs/timeline-explorer.md for a walkthrough.
 */
const TL_CONFIG = {

  // Last year the axis can show; panning stops there.
  maxYear: 1650,

  // Reference chronology. Always pinned as the first row while it is on.
  // Its ranges define the papal calendar (regnal years, counted from the
  // start of each range) and, when the papal calendar is on, the hatched
  // vacancy stripes. A range is a vacancy when its className is
  // `vacancyClass`, or its label reads "sede vacante" / "sedes vacans".
  referenceGroup: 'Pontificates',
  vacancyClass: 'reign_vacancy',

  // Groups switched on at start.
  defaultOn: ['Pontificates', 'Persons', 'Meetings'],

  // Checkbox lists in the sidebar, rendered into <div id="list-KEY">.
  // A list with a <button data-selectall="KEY"> gets (Un)select All.
  checklists: {
    groups: [
      { value: 'Group_1', label: 'Group 1' },
      { value: 'Group_2', label: 'Group 2' },
      { value: 'Group_3', label: 'Group 3' }
    ],
    institutions: [
      { value: 'Institution_1', label: 'Institution 1' },
      { value: 'Institution_2', label: 'Institution 2' }
    ]
  },

  // Groups whose ranges are lifespans rather than events: drawn as bands
  // that cannot be selected, with the group's points sitting on top.
  institutionGroups: ['Institution_1', 'Institution_2'],

  // Groups whose entries are people. Names in a meeting card are matched
  // against these entries and become links back to the timeline.
  personGroups: ['Pontificates', 'Persons', 'Group_1', 'Group_2', 'Group_3'],

  // Details card per group: 'reign' | 'person' | 'meeting' | 'simple'.
  // Groups not listed use 'simple'.
  templates: {
    Pontificates: 'reign',
    Persons: 'person',
    Group_1: 'person',
    Group_2: 'person',
    Group_3: 'person',
    Meetings: 'meeting'
  },

  // Field labels of the 'reign' card for the start and end of a range of
  // the reference chronology (default: "Start" / "End").
  reignLabels: {
    start: 'Start of the Pontificate',
    end: 'End of the Pontificate'
  },

  // Heading of the 'simple' card per group (default: the group name).
  labels: {
    Institution_1: 'Institution 1',
    Institution_2: 'Institution 2'
  }
};
