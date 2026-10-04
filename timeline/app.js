/* =====================================================================
   Timeline Explorer — static port of the original R/Shiny + timevis app.
   No server: the data come from data/timeline.js (global DATA), the
   dataset-specific settings from config.js (global TL_CONFIG); the
   rendering is vis-timeline.

   Features: groups as rows, points / ranges / background bands, period
   slider, zoom, entity search, deep links (?data=<id>), dual Julian /
   Gregorian dating, papal calendar, Easter dates, cross-links between
   cards. See docs/timeline-explorer.md and docs/calendars.md.
   ===================================================================== */

"use strict";

/* ----------------------------- config -------------------------------- */
const NA = "No information available";
const CFG = TL_CONFIG;
const REF_GROUP = CFG.referenceGroup;
const CHECKLISTS = CFG.checklists || {};
const INSTITUTION_GROUPS = new Set(CFG.institutionGroups || []);
const PERSON_GROUPS = new Set(CFG.personGroups || []);
const DEFAULT_ON = new Set(CFG.defaultOn || []);
const MAX_YEAR = CFG.maxYear || 9999;

/* ---------------------- calendar conversion --------------------------
   The vis-timeline axis is physical time rendered through JS Date, i.e.
   the proleptic GREGORIAN calendar. Source dates BEFORE the Gregorian
   reform (Rome: Julian 4 Oct 1582 -> Gregorian 15 Oct 1582) are recorded
   in the JULIAN calendar. Therefore:

   - POSITIONS: at load time every pre-reform source date is converted
     Julian -> Gregorian (via Julian Day Number), so items sit on their
     true physical instants. Positions never change when the display mode
     is toggled.
   - LABELS ("Show Historic time"): when ON, axis labels and dates in the
     details panel before the reform are shown in Julian reckoning — i.e.
     exactly as written in the sources; after the reform, Gregorian.
     When OFF, everything is displayed in proleptic Gregorian.

   NB: "Julian year" here means the civil year starting 1 January.
   Regional year-start styles (Annunciation, Easter style etc.) are a
   data-level problem, out of scope for the display layer.
   -------------------------------------------------------------------- */
const REFORM_JDN = 2299161;      // JDN of Gregorian 15 Oct 1582 (= Julian 5 Oct)
const UNIX_EPOCH_JDN = 2440588;  // JDN of Gregorian 1 Jan 1970
const DAY_MS = 86400000;

function julianToJDN(y, m, d) {
  const a = Math.floor((14 - m) / 12), y2 = y + 4800 - a, m2 = m + 12 * a - 3;
  return d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 + Math.floor(y2 / 4) - 32083;
}
function gregorianToJDN(y, m, d) {
  const a = Math.floor((14 - m) / 12), y2 = y + 4800 - a, m2 = m + 12 * a - 3;
  return d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 + Math.floor(y2 / 4)
       - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045;
}
function jdnToGregorian(jdn) {
  const a = jdn + 32044,
        b = Math.floor((4 * a + 3) / 146097),
        c = a - Math.floor(146097 * b / 4),
        d = Math.floor((4 * c + 3) / 1461),
        e = c - Math.floor(1461 * d / 4),
        m = Math.floor((5 * e + 2) / 153);
  return { d: e - Math.floor((153 * m + 2) / 5) + 1,
           m: m + 3 - 12 * Math.floor(m / 10),
           y: 100 * b + d - 4800 + Math.floor(m / 10) };
}
function jdnToJulian(jdn) {
  const c = jdn + 32082,
        d = Math.floor((4 * c + 3) / 1461),
        e = c - Math.floor(1461 * d / 4),
        m = Math.floor((5 * e + 2) / 153);
  return { d: e - Math.floor((153 * m + 2) / 5) + 1,
           m: m + 3 - 12 * Math.floor(m / 10),
           y: d - 4800 + Math.floor(m / 10) };
}
const jdnToMs = (jdn) => (jdn - UNIX_EPOCH_JDN) * DAY_MS;
const msToJDN = (ms) => Math.floor(ms / DAY_MS) + UNIX_EPOCH_JDN;

// "yyyy-mm-dd" as recorded in the source -> physical instant.
// Rule: if the date read as Gregorian falls on/after the reform, it IS
// Gregorian; otherwise it is a Julian source date and is converted.
// (Dates inside the ten skipped days are invalid in Roman sources and
// fall through to the Julian branch.)
function sourceToInstant(iso) {
  if (!iso) return null;
  const p = iso.split("-").map(Number);
  if (p.length !== 3 || p.some(Number.isNaN)) return null;
  const gj = gregorianToJDN(p[0], p[1], p[2]);
  if (gj >= REFORM_JDN) return { jdn: gj, julian: false };
  return { jdn: julianToJDN(p[0], p[1], p[2]), julian: true };
}

const pad2 = (n) => String(n).padStart(2, "0");
function fmtJDN(jdn, asJulian) {
  const c = asJulian ? jdnToJulian(jdn) : jdnToGregorian(jdn);
  return `${pad2(c.d)}-${pad2(c.m)}-${String(c.y).padStart(4, "0")}`;
}

// dd/mm/yyyy — used by the Easter hover, which shows a bare date
function fmtJDNSlash(jdn, asJulian) {
  const c = asJulian ? jdnToJulian(jdn) : jdnToGregorian(jdn);
  return `${pad2(c.d)}/${pad2(c.m)}/${String(c.y).padStart(4, "0")}`;
}

const MONTHS_S = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_L = ["", "January", "February", "March", "April", "May", "June",
                      "July", "August", "September", "October", "November", "December"];

/* ----------------------------- state --------------------------------- */
let ALL = [];                 // preprocessed records
let byId = new Map();         // id -> record
let selectedGroups = new Set();
let yearRange = [0, 0];
let dataMinYear = 0, dataMaxYear = 0;
let timeline = null;
let visItems = null, visGroups = null;
let historicMode = false;    // "Show Historic time": Julian labels before the reform
let papalMode = false;       // "Show the papal calendar": anno pontificatus band
let PAPAL = [];              // sorted pontificate/sede-vacante index
let SV_BG = [];              // sede-vacante background stripes (papal mode)
let lastSelectedId = null;   // to refresh the details panel on mode toggle
let axisPxPerYear = 200;     // measured on every range change; drives label density

/* ------------------------- papal calendar ----------------------------
   Display layer on the same physical axis. The reckoning follows the
   project convention (Annuario Pontificio): the pontificate STARTS at
   the ELECTION of the pope — which is exactly the `start` of every
   range of the reference group (TL_CONFIG.referenceGroup) — so anno
   pontificatus I begins on election day. Anniversaries across the
   Gregorian reform are taken on the nominal day/month in the calendar
   of the respective era (the curial practice of continuing the same
   nominal date). Before the first pontificate in the dataset the civil
   reckoning is shown unchanged.
   -------------------------------------------------------------------- */
function buildPapalIndex() {
  PAPAL = ALL
    .filter((d) => d.group === REF_GROUP && d.startJDN != null)
    .map((d) => ({
      name: (d.content || "").trim(),
      startJDN: d.startJDN,
      endJDN: (d.endJDN != null) ? d.endJDN : d.startJDN,
      vacante: (d.className || "") === CFG.vacancyClass || /sedes?\s+vacans?/i.test(d.content || "")
    }))
    .sort((a, b) => a.startJDN - b.startJDN);
}

// full-height hatched stripes marking every sede vacante, shown while the
// papal calendar is active so vacancies are never visually absorbed by
// the surrounding pontificates
function buildSvBackgrounds() {
  SV_BG = PAPAL.filter((p) => p.vacante).map((p, i) => ({
    id: 2000000 + i, type: "background", className: "sv_background",
    content: "", title: p.name,
    start: new Date(jdnToMs(p.startJDN)), end: new Date(jdnToMs(p.endJDN))
  }));
}

// last entry covering the instant; a pope wins over a sede vacante if
// the data contain a small overlap
function reignAt(jdn) {
  let lo = 0, hi = PAPAL.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (PAPAL[mid].startJDN <= jdn) { idx = mid; lo = mid + 1; } else hi = mid - 1;
  }
  let found = null;
  for (let i = idx; i >= 0 && i >= idx - 3; i--) {
    const p = PAPAL[i];
    if (p.startJDN <= jdn && jdn <= p.endJDN) {
      if (!p.vacante) return p;
      if (!found) found = p;
    }
  }
  return found;
}

// anno pontificatus at a given instant: anniversary arithmetic on
// calendar parts, each date taken in the calendar of its own era
function papalYearAt(jdn, reign) {
  const s = reign.startJDN < REFORM_JDN ? jdnToJulian(reign.startJDN) : jdnToGregorian(reign.startJDN);
  const c = jdn < REFORM_JDN ? jdnToJulian(jdn) : jdnToGregorian(jdn);
  let n = c.y - s.y;
  if (c.m < s.m || (c.m === s.m && c.d < s.d)) n--;
  return n + 1;
}

function toRoman(n) {
  if (!(n > 0) || n > 3999) return String(n);
  const R = [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],
             [50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]];
  let out = "";
  for (const [v, s] of R) while (n >= v) { out += s; n -= v; }
  return out;
}

// short papal designation for an instant, e.g. "Urbanus VIII · an. XII"
function papalLabelAt(jdn) {
  const r = reignAt(jdn);
  if (!r) return null;
  return r.vacante ? "Sedes vacans" : `${r.name} · an. ${toRoman(papalYearAt(jdn, r))}`;
}

/* ----------------------------- computus -------------------------------
   Easter Sunday for every year of the data range, one synthetic point
   per year in a dedicated "Easter" row. Years up to 1582 use the JULIAN
   computus (the date is a Julian calendar date); from 1583 the GREGORIAN
   computus (Meeus/Jones/Butcher). Both feed the same physical axis via
   JDN, so the row is consistent with the rest of the timeline.
   -------------------------------------------------------------------- */
function easterJulian(y) {              // -> {y,m,d} in the JULIAN calendar
  const a = y % 4, b = y % 7, c = y % 19;
  const d0 = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d0 + 34) % 7;
  return { y, m: Math.floor((d0 + e + 114) / 31), d: ((d0 + e + 114) % 31) + 1 };
}
function easterGregorian(y) {           // -> {y,m,d} in the GREGORIAN calendar
  const a = y % 19, b = Math.floor(y / 100), c = y % 100,
        d0 = Math.floor(b / 4), e = b % 4,
        f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
        h = (19 * a + b - d0 - g + 15) % 30,
        i = Math.floor(c / 4), k = c % 4,
        l = (32 + 2 * e + 2 * i - h - k) % 7,
        m = Math.floor((a + 11 * h + 22 * l) / 451);
  return { y, m: Math.floor((h + l - 7 * m + 114) / 31), d: ((h + l - 7 * m + 114) % 31) + 1 };
}
const EASTER_ID_BASE = 1000000;         // synthetic ids, far above CSV row ids
function buildEasterItems(y0, y1) {
  const items = [];
  for (let y = y0; y <= y1; y++) {
    const jul = y <= 1582;
    const e = jul ? easterJulian(y) : easterGregorian(y);
    const jdn = jul ? julianToJDN(e.y, e.m, e.d) : gregorianToJDN(e.y, e.m, e.d);
    items.push({
      id: EASTER_ID_BASE + y, group: "Easter", content: "\u271A",
      tooltip: `Easter ${y} — ${fmtJDN(jdn, jul)}${jul ? " (Julian)" : ""}`,
      dateSlash: fmtJDNSlash(jdn, jul),   // dd/mm/yyyy shown on hover
      type: "background", className: "easter_line", year: y, synthetic: true,
      startJDN: jdn, startIsJulian: jul, startMs: jdnToMs(jdn)
    });
  }
  return items;
}

/* ----------------------------- filtering ----------------------------- */
function filteredItems() {
  return ALL.filter((it) =>
    selectedGroups.has(it.group) &&
    typeof it.year === "number" &&
    it.year >= yearRange[0] && it.year <= yearRange[1]
  );
}
const PINNED_GROUP = REF_GROUP;   // the reference chronology is always the first row

function selectedGroupList() {
  // One timeline row per selected group. The order is the order in which
  // the groups were switched on — selectedGroups is a Set, and a Set keeps
  // insertion order, so re-enabling a group moves it to the bottom, which
  // is what a user who just clicked it expects. The reference chronology
  // is pinned to the top whenever it is on.
  const rows = [...selectedGroups]
    .filter((g) => g !== "Easter" && g !== PINNED_GROUP);  // Easter draws as full-height lines, not a row
  if (selectedGroups.has(PINNED_GROUP)) rows.unshift(PINNED_GROUP);
  return rows.map((g, i) => ({ id: g, content: g.replace(/_/g, " "), order: i }));
}

/* ---------------------------- timeline ------------------------------- */
function visItemOf(it) {
  // Easter entries render as thin full-height background stripes — a
  // vertical line across all rows, like the calendar-reform marker.
  // (Backgrounds without a group span the entire timeline.)
  if (it.group === "Easter") {
    return {
      id: it.id, content: "", title: it.tooltip || "",
      start: new Date(it.startMs), end: new Date(it.startMs + DAY_MS),
      type: "background", className: "easter_line"
    };
  }
  const isInstitutionSpan =
    it.type === "range" && INSTITUTION_GROUPS.has(it.group);
  const isInstitutionEvent =
    it.type === "point" && INSTITUTION_GROUPS.has(it.group);
  const v = {
    id: it.id, group: it.group, content: it.content || "",
    title: it.tooltip || it.content || "",
    // position by physical instant (Julian source dates already converted);
    // fall back to the raw ISO string if preprocessing found no valid date
    start: (it.startMs != null) ? new Date(it.startMs) : it.start,
    className: (it.className || "") +
               (isInstitutionSpan ? " institution_span" : "") +
               (isInstitutionEvent ? " institution_event" : ""),
    type: it.type || undefined
  };
  // Institutional lifespans stay ranges so they keep their colours — the
  // legacy rule `.vis-background { background-color: transparent }` would
  // make them invisible as backgrounds. vis-timeline honours a per-item
  // `selectable` flag, which is what removes the click without touching
  // the appearance.
  if (isInstitutionSpan) v.selectable = false;
  // Institution spans and their events share one subgroup, so the event
  // dots sit on the band instead of on a separate track above it.
  if (INSTITUTION_GROUPS.has(it.group)) v.subgroup = "A";
  else if (it.subgroup) v.subgroup = it.subgroup;   // parallel tracks within a group
  if (it.type === "range" || it.type === "background")
    v.end = (it.endMs != null) ? new Date(it.endMs) : (it.end || v.start);
  return v;
}

/* --------------------- axis labels (dual calendar) -------------------- */
// Grid lines sit on GREGORIAN year/month boundaries. The Julian date at
// such an instant still belongs to the previous Julian month/year (offset
// <= 13 days over the data range), so for month/year scales we sample the
// Julian value 16 days INTO the interval — past the offset, well short of
// the interval length — so the label names the calendar unit the interval
// actually represents.
const AXIS_DEFAULT_MINOR = { millisecond: "SSS", second: "s", minute: "HH:mm",
  hour: "HH:mm", weekday: "ddd D", day: "D", week: "w", month: "MMM", year: "YYYY" };
const AXIS_DEFAULT_MAJOR = { millisecond: "HH:mm:ss", second: "D MMMM HH:mm",
  minute: "ddd D MMMM", hour: "ddd D MMMM", weekday: "MMMM YYYY", day: "MMMM YYYY",
  week: "MMMM YYYY", month: "YYYY", year: "" };

function civilAxisLabel(date, scale, major, jdn) {
  // NB: "" is a legitimate format (major row on year scale is empty by
  // design) — fall back to "YYYY" only when the scale key is missing
  let defFmt = (major ? AXIS_DEFAULT_MAJOR : AXIS_DEFAULT_MINOR)[scale];
  if (defFmt === undefined) defFmt = "YYYY";
  if (!historicMode || jdn >= REFORM_JDN) return defFmt ? date.format(defFmt) : "";
  const probe = (scale === "month" || scale === "year") ? jdn + 16 : jdn;
  const jd = jdnToJulian(probe);
  if (!major) {
    switch (scale) {
      case "year":    return String(jd.y);
      case "month":   return MONTHS_S[jd.m];
      case "week":
      case "day":     return String(jdnToJulian(jdn).d);
      case "weekday": return String(jdnToJulian(jdn).d);
      default:        return defFmt ? date.format(defFmt) : "";
    }
  }
  switch (scale) {
    case "year":    return "";
    case "month":   return `${jd.y} (Julian)`;
    case "week":
    case "day":
    case "weekday": return `${MONTHS_L[jd.m]} ${jd.y} (Julian)`;
    default:        return defFmt ? date.format(defFmt) : "";
  }
}

function axisLabel(date, scale, major, step) {
  const jdn = msToJDN(date.valueOf());
  const civil = civilAxisLabel(date, scale, major, jdn);
  if (!papalMode) return civil;
  // Year scale, MINOR row: vis renders no repeating major gridlines here
  // (only a sticky label at the viewport edge), so the pontificate year
  // travels with every year label: "1650 · an. VI". The pope's name is
  // added in the year a pontificate begins (an. I) and whenever the reign
  // changed since the previous gridline (relevant when step > 1).
  if (scale === "year" && !major) {
    // wide windows: the per-year an. suffix collides with its neighbours,
    // so it is dropped and the sticky major label carries the reckoning
    if (timeline) {
      try {
        const w = timeline.getWindow();
        if ((w.end - w.start) / (DAY_MS * 365.25) > 60) return civil;
      } catch (e) { /* not ready yet */ }
    }
    const mid = jdn + 182;                        // reign dominating the civil year
    const r = reignAt(mid);
    if (!r || r.vacante) return civil;
    // density tiers: full names need ~140px per year column, "an. N" ~70px;
    // below that the civil year alone — the sticky major keeps the pope name
    const perCol = axisPxPerYear * Math.max(1, step || 1);
    if (perCol < 70) return civil;
    const n = papalYearAt(mid, r);
    const stepY = Math.max(1, step || 1);
    const prev = reignAt(mid - Math.round(stepY * 365.25));
    const withName = ((n === 1) || (prev !== r)) && perCol >= 140;
    return withName
      ? `${civil} \u00B7 ${r.name} \u00B7 an. ${toRoman(n)}`
      : `${civil} \u00B7 an. ${toRoman(n)}`;
  }
  if (!major) return civil;
  // Major rows: sticky orientation label on year scale, per-year band on
  // month scale (+16d sampling, as with the Julian labels).
  if (scale === "year") {
    return papalLabelAt(jdn + 182) || civil;      // major row is empty by default here
  }
  if (scale === "month" || scale === "week" || scale === "day" || scale === "weekday") {
    const pap = papalLabelAt(scale === "month" ? jdn + 16 : jdn);
    return pap ? (civil ? `${civil} \u00B7 ${pap}` : pap) : civil;
  }
  return civil;
}
function buildTimeline() {
  visItems = new vis.DataSet([]);
  visGroups = new vis.DataSet([]);
  timeline = new vis.Timeline(document.getElementById("timeline"), visItems, visGroups, {
    stack: false,
    groupOrder: "order",
    showTooltips: true,
    horizontalScroll: true,
    autoResize: true,
    margin: { item: { horizontal: 0, vertical: 2 } },
    zoomMin: 1000 * 60 * 60 * 24 * 365,        // minimum visible range = 1 year (axis shows months, not days)
    zoomable: false,                            // no scroll-zoom (use slider instead)
    horizontalScroll: true,                     // scroll = pan forward/backward
    max: new Date(MAX_YEAR, 11, 31),            // no panning past maxYear
    format: {                                   // dual-calendar axis labels
      minorLabels: (date, scale, step) => axisLabel(date, scale, false, step),
      majorLabels: (date, scale, step) => axisLabel(date, scale, true, step)
    }
  });
  // measured pixel density of the axis: labels adapt to available width
  function updateAxisDensity() {
    const win = timeline.getWindow();
    const years = (win.end.getTime() - win.start.getTime()) / (365.25 * 86400000);
    const w = document.getElementById("timeline").clientWidth || 1000;
    axisPxPerYear = w / Math.max(years, 0.01);
  }
  timeline.on("rangechanged", updateAxisDensity);
  updateAxisDensity();

  timeline.on("select", (props) => {
    const id = props.items && props.items[0];
    lastSelectedId = (id != null) ? id : null;
    setUrlId(lastSelectedId);                     // deselection clears the hash
    if (id != null) showDetails(byId.get(id));
  });

  // --- Zoom slider ---
  const zoomSlider = document.getElementById("zoom-slider");
  const MONTH_MS = 1000 * 60 * 60 * 24 * 365; // deepest zoom = 1 year visible
  function applyZoom(val) {
    // val 0 = full range, val 100 = 1 month
    const win = timeline.getWindow();
    const center = (win.start.getTime() + win.end.getTime()) / 2;
    const fullRange = (dataMaxYear - dataMinYear) * 365.25 * 24 * 3600 * 1000;
    // logarithmic interpolation between fullRange and MONTH_MS
    const t = val / 100;
    const span = fullRange * Math.pow(MONTH_MS / fullRange, t);
    timeline.setWindow(center - span / 2, center + span / 2, { animation: false });
  }
  zoomSlider.addEventListener("input", (e) => applyZoom(+e.target.value));
  // sync slider when user pans (window changes)
  timeline.on("rangechanged", () => {
    const win = timeline.getWindow();
    const span = win.end.getTime() - win.start.getTime();
    const fullRange = (dataMaxYear - dataMinYear) * 365.25 * 24 * 3600 * 1000;
    if (fullRange <= MONTH_MS) return;
    const t = Math.log(span / fullRange) / Math.log(MONTH_MS / fullRange);
    zoomSlider.value = Math.max(0, Math.min(100, Math.round(t * 100)));
  });
}
function renderTimeline() {
  const items = filteredItems();
  visGroups.clear(); visGroups.add(selectedGroupList());
  visItems.clear(); visItems.add(items.map(visItemOf));
  if (papalMode && SV_BG.length) visItems.add(SV_BG);
  const searchText = document.getElementById("global-search");
  buildEntitySelect(items, searchText ? searchText.value : "");
}

/* --------------------------- entity search --------------------------- */
// items that cannot be selected, so they must not appear as navigation
// targets in the dropdowns, the search or a deep link
function isBackgroundOnly(d) {
  return !!d && (d.group === "Easter" ||
                 (d.type === "range" && INSTITUTION_GROUPS.has(d.group)));
}

function buildEntitySelect(items, filterText) {
  const wrap = document.getElementById("entity-search-wrap");
  wrap.innerHTML = "";
  const ft = (filterText || "").trim().toLowerCase();
  const groups = {};
  items.forEach((it) => {
    if (isBackgroundOnly(it)) return;    // computus rows and institution bands are not targets
    if (ft && !(it.content || "").toLowerCase().includes(ft)) return;
    (groups[it.group] = groups[it.group] || []).push(it);
  });
  Object.keys(groups).sort().forEach((g) => {
    // group header
    const h = document.createElement("h4");
    h.className = "search-group-title";
    h.textContent = g.replace(/_/g, " ");
    wrap.appendChild(h);
    // select
    const sel = document.createElement("select");
    sel.className = "entity-select";
    const blank = document.createElement("option");
    blank.value = ""; blank.textContent = "Select an entity";
    sel.appendChild(blank);
    groups[g].sort((a, b) => (a.content || "").localeCompare(b.content || ""))
      .forEach((it) => {
        const o = document.createElement("option");
        o.value = it.id; o.textContent = it.content;
        sel.appendChild(o);
      });
    sel.addEventListener("change", (e) => {
      if (e.target.value) focusEntity(e.target.value);
    });
    wrap.appendChild(sel);
  });
}
/* --------------------------- deep linking ----------------------------
   The selected entity id is mirrored into the URL as ?data=<id> — the
   project's existing deep-link convention (already read at startup) —
   so the current selection can be copied from the address bar and
   opened directly. history.replaceState neither pollutes the browser
   history nor triggers navigation. On file:// the query string cannot
   be rewritten, so the hash form #data=<id> is used as a fallback and
   is also accepted when reading.
   -------------------------------------------------------------------- */
let suppressHistory = false;   // set while restoring from Back/Forward

function setUrlId(id, push) {
  if (suppressHistory) return;                    // don't rewrite during popstate
  const p = new URLSearchParams(location.search);
  if (id != null) p.set("data", id); else p.delete("data");
  const q = p.toString();
  const url = location.pathname + (q ? "?" + q : "") + location.hash;
  try {
    if (push) history.pushState({ data: id }, "", url);
    else      history.replaceState({ data: id }, "", url);
  } catch (e) {                                   // file:// — fall back to the hash
    try {
      const hash = (id != null ? "#data=" + id : "");
      if (push) location.hash = hash;             // assigning the hash adds an entry
      else history.replaceState({ data: id }, "", location.pathname + location.search + hash);
    } catch (e2) { /* no history API at all — give up silently */ }
  }
}
function readUrlId() {
  const q = new URLSearchParams(location.search).get("data");
  if (q && /^\d+$/.test(q)) return +q;
  const m = location.hash.match(/^#(?:data=|id=)?(\d+)$/);
  return m ? +m[1] : null;
}
function applyUrlId() {
  const id = readUrlId();
  if (id == null || !byId.has(id) || id === lastSelectedId) return;
  if (isBackgroundOnly(byId.get(id))) return;     // background bands are not selectable
  focusEntity(id);
}

function focusEntity(id, pushHistory) {
  id = +id;
  if (!byId.has(id)) return;
  const grp = byId.get(id).group;
  if (!selectedGroups.has(grp)) { enableGroup(grp); renderTimeline(); }
  timeline.setSelection([id], { focus: true, animation: true });
  lastSelectedId = id;
  setUrlId(id, pushHistory);
  showDetails(byId.get(id));
}

/* Back/Forward: restore the entity recorded in the URL. suppressHistory
   stops focusEntity from writing a new entry while we are replaying one. */
function initHistoryNav() {
  const restore = () => {
    const id = readUrlId();
    suppressHistory = true;
    if (id != null && byId.has(id) && byId.get(id).group !== "Easter") {
      focusEntity(id);
    } else {
      timeline.setSelection([]);
      lastSelectedId = null;
      showDetails(null);
    }
    suppressHistory = false;
  };
  window.addEventListener("popstate", restore);
  window.addEventListener("hashchange", restore);   // file:// fallback
}

/* ----------------------- sidebar construction ------------------------ */
function makeCheck(listEl, value, label, group) {
  const id = "chk_" + value;
  const wrap = document.createElement("label");
  wrap.className = "check";
  wrap.innerHTML = `<input type="checkbox" value="${value}" id="${id}"> <span>${label}</span>`;
  wrap.querySelector("input").addEventListener("change", (e) => {
    if (e.target.checked) selectedGroups.add(value); else selectedGroups.delete(value);
    renderTimeline();
  });
  listEl.appendChild(wrap);
}
function setCheck(value, on) {
  const el = document.getElementById("chk_" + value);
  if (el) el.checked = on;
  if (on) selectedGroups.add(value); else selectedGroups.delete(value);
}
function enableGroup(group) {
  selectedGroups.add(group);
  const chk = document.getElementById("chk_" + group);
  if (chk) chk.checked = true;
  const btn = document.querySelector(`.btn-filter[data-group="${group}"]`);
  if (btn) btn.classList.add("active");
  // open the collapse that holds it, if any
  document.querySelectorAll(".collapse-body, .tl-collapse-body").forEach((b) => {
    if (b.querySelector("#chk_" + CSS.escape(group))) b.classList.add("open");
  });
}
function initSidebar() {
  // populate the checkbox lists declared in TL_CONFIG.checklists
  Object.keys(CHECKLISTS).forEach((key) => {
    const list = document.getElementById("list-" + key);
    if (list) CHECKLISTS[key].forEach((o) => makeCheck(list, o.value, o.label, key));
  });

  // filter buttons (toggle a single group)
  document.querySelectorAll(".btn-filter").forEach((btn) => {
    const g = btn.dataset.group;
    btn.addEventListener("click", () => {
      if (selectedGroups.has(g)) { selectedGroups.delete(g); btn.classList.remove("active"); }
      else { selectedGroups.add(g); btn.classList.add("active"); }
      renderTimeline();
    });
  });

  // collapsible headers
  // both naming schemes: standalone (.collapse-*) and site shell (.tl-collapse-*,
  // renamed there to avoid clashing with Bootstrap's .collapse)
  document.querySelectorAll(".collapse-head, .tl-collapse-head").forEach((h) => {
    h.addEventListener("click", () => {
      const body = document.querySelector(
        `.collapse-body[data-body="${h.dataset.head}"], .tl-collapse-body[data-body="${h.dataset.head}"]`);
      if (body) body.classList.toggle("open");
    });
  });

  // (un)select-all toggles
  document.querySelectorAll("[data-selectall]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const set = (CHECKLISTS[btn.dataset.selectall] || []).map((o) => o.value);
      const allOn = set.every((v) => selectedGroups.has(v));
      set.forEach((v) => setCheck(v, !allOn));
      renderTimeline();
    });
  });

  // global search bar — filters all per-group dropdowns by name
  document.getElementById("global-search").addEventListener("input", (e) => {
    buildEntitySelect(filteredItems(), e.target.value);
  });

  // fit button
  document.getElementById("btn-fit").addEventListener("click", () => timeline.fit({ animation: true }));

  // "Show Historic time" toggle — Julian reckoning before 15 Oct 1582 (Greg.)
  const historicToggle = document.getElementById("historic-toggle");
  if (historicToggle) historicToggle.addEventListener("change", (e) => setHistoricMode(e.target.checked));

  // "Show the papal calendar" toggle — anno pontificatus band on the axis
  const papalToggle = document.getElementById("papal-toggle");
  if (papalToggle) papalToggle.addEventListener("change", (e) => setPapalMode(e.target.checked));

  // "Show Easter dates" toggle — enables the computus row on the timeline
  const easterToggle = document.getElementById("easter-toggle");
  if (easterToggle) easterToggle.addEventListener("change", (e) => {
    if (e.target.checked) selectedGroups.add("Easter"); else selectedGroups.delete("Easter");
    renderTimeline();
  });

  // apply defaults
  DEFAULT_ON.forEach((g) => enableGroup(g));
}

/* ------------------------------ slider ------------------------------- */
function initSlider() {
  const el = document.getElementById("year-slider");
  noUiSlider.create(el, {
    start: [dataMinYear, dataMaxYear],
    connect: true, step: 1,
    range: { min: dataMinYear, max: dataMaxYear },
    format: { to: (v) => Math.round(v), from: (v) => Number(v) }
  });
  const lo = document.getElementById("year-min");
  const hi = document.getElementById("year-max");
  el.noUiSlider.on("update", (vals) => {
    yearRange = [+vals[0], +vals[1]];
    lo.textContent = vals[0]; hi.textContent = vals[1];
  });
  el.noUiSlider.on("set", () => renderTimeline());
}

/* -------------------- entity links in details ------------------------
   Names mentioned inside a card (meeting chair / secretary / members)
   become internal links to the matching entity on the timeline. The
   index is rebuilt from the dataset at load time (entries of
   TL_CONFIG.personGroups), so it follows every data update. If a name
   matches several entities (the same person in two groups), a chooser
   popup lets the user pick the exact one.
   -------------------------------------------------------------------- */
let NAME_INDEX = [];   // [{key, id, content, group, y0, y1}]
const PERSON_GROUP = (g) => PERSON_GROUPS.has(g);

function normName(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, " ")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // strip diacritics
    .replace(/['\u2019\u2018\u02BC]/g, "'")
    .toLowerCase().replace(/\s+/g, " ").trim();
}
function buildNameIndex() {
  NAME_INDEX = [];
  for (const d of ALL) {
    if (!PERSON_GROUP(d.group)) continue;
    const key = normName(d.content);
    if (!key || /sedes?\s+vacans?/.test(key)) continue;
    NAME_INDEX.push({
      key, id: d.id, content: d.content, group: d.group,
      y0: d.year, y1: (d.endJDN != null) ? jdnToGregorian(d.endJDN).y : d.year
    });
  }
}
function findEntitiesByName(raw) {
  const q = normName(raw);
  if (!q || q === normName(NA)) return [];
  let hits = NAME_INDEX.filter((e) => e.key === q);
  if (!hits.length)
    hits = NAME_INDEX.filter((e) => e.key.includes(q) || q.includes(e.key));
  const seen = new Set();
  return hits.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
}

// wraps each comma-separated name in a value into a clickable
// .entity-link span — but only names that match an entity on the
// timeline; the others stay plain text, so no link leads nowhere.
// Names that arrive from the CSV as external <a> links are unwrapped:
// the NAME navigates internally, the external source stays available as
// a trailing \u2197 icon.
function linkifyPeople(value) {
  if (!value || value === NA) return value;
  return String(value)
    .split(/,(?![^<]*>)/)                       // commas outside of tags
    .map((part) => {
      const m = part.match(/<a\s[^>]*href=['"]([^'"]*)['"][^>]*>([\s\S]*?)<\/a>/i);
      const text = (m ? m[2] : part).replace(/<[^>]*>/g, "").trim();
      if (!text || text === NA) return part;
      if (!findEntitiesByName(text).length) return part.trim();   // no target: plain text
      const attr = normName(text).replace(/"/g, "&quot;");
      const ext = m
        ? ` <a href="${m[1]}" target="_blank" class="ext-link" title="External source">\u2197</a>`
        : "";
      return `<span class="entity-link" data-name="${attr}" title="Show on the timeline">${text}</span>${ext}`;
    })
    .join(", ");
}

function closeEntityChooser() {
  const p = document.getElementById("entity-chooser");
  if (p) p.remove();
}
function openEntityChooser(matches, x, y) {
  closeEntityChooser();
  const p = document.createElement("div");
  p.id = "entity-chooser";
  p.innerHTML = `<div class="chooser-title">Several entities match \u2014 choose one:</div>` +
    matches.map((m) =>
      `<button class="chooser-item" data-id="${m.id}">
         <span class="chooser-name">${m.content}</span>
         <span class="chooser-meta">${String(m.group).replace(/_/g, " ")}${
           m.y0 ? ` \u00B7 ${m.y0}${m.y1 && m.y1 !== m.y0 ? "\u2013" + m.y1 : ""}` : ""}</span>
       </button>`).join("");
  document.body.appendChild(p);
  const pad = 8, w = p.offsetWidth || 280, h = p.offsetHeight || 160;
  p.style.left = Math.min(x, window.innerWidth  - w - pad) + "px";
  p.style.top  = Math.min(y, window.innerHeight - h - pad) + "px";
  p.addEventListener("click", (e) => {
    const b = e.target.closest(".chooser-item");
    if (!b) return;
    closeEntityChooser();
    focusEntity(b.getAttribute("data-id"), true);
  });
}
function flashNotFound(el) {
  el.classList.add("entity-link-miss");
  setTimeout(() => el.classList.remove("entity-link-miss"), 900);
}
function initEntityLinks() {
  document.getElementById("details").addEventListener("click", (e) => {
    if (e.target.closest("a")) return;              // external links keep working
    const el = e.target.closest(".entity-link");
    if (!el) return;
    const matches = findEntitiesByName(el.getAttribute("data-name") ||
                                       el.textContent);
    if (!matches.length) { flashNotFound(el); return; }
    if (matches.length === 1) { focusEntity(matches[0].id, true); return; }
    openEntityChooser(matches, e.clientX + 6, e.clientY + 6);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#entity-chooser") && !e.target.closest(".entity-link"))
      closeEntityChooser();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeEntityChooser(); });
}

/* ----------------------- external enrichment -------------------------
   data/enrichment.js (generated by build/enrich.py, optional) exposes
   window.ENRICH = { people: { "<normalised name>": { viaf, wikidata,
   arms, names[], born, died } } }. The app degrades gracefully when the
   file is absent. Only validated records should be exported there.
   -------------------------------------------------------------------- */
function enrichFor(d) {
  const E = (typeof window !== "undefined" && window.ENRICH) || null;
  if (!E || !E.people || !d) return null;
  return E.people[normName(d.content)] || null;
}
function authorityField(d) {
  const e = enrichFor(d);
  if (!e) return "";
  const bits = [];
  if (e.viaf) bits.push(`<a href="https://viaf.org/viaf/${e.viaf}" target="_blank">VIAF ${e.viaf}</a>`);
  if (e.wikidata) bits.push(`<a href="https://www.wikidata.org/wiki/${e.wikidata}" target="_blank">Wikidata ${e.wikidata}</a>`);
  return bits.length ? field("Authority records", bits.join(" \u00B7 ")) : "";
}
function enrichedNames(d, rawValue) {
  const hasData = rawValue && rawValue !== NA && !/^(No information available\s*)+$/.test(String(rawValue).replace(/<[^>]*>/g, "").trim());
  if (hasData) return rawValue;
  const e = enrichFor(d);
  if (e && e.names && e.names.length)
    return e.names.join(", ") + ` <span class="cal-badge cal-viaf" title="From the validated authority list">authority</span>`;
  return rawValue;
}
function armsHtml(d) {
  const e = enrichFor(d);
  if (!e || !e.arms) return "";
  return `<div class="center pope-arms-wrap">
    <img class="pope-arms" src="${e.arms}" alt="Coat of arms of ${$(d, "content")}" loading="lazy" />
    <div class="pope-arms-src">Coat of arms \u00B7 Wikimedia Commons</div>
  </div>`;
}

/* ----------------------- Easter line tooltip -------------------------
   Background items are not selectable in vis-timeline, so the Easter
   lines get their own hover tooltip: a delegated listener on the
   timeline container resolves the hovered instant via
   timeline.getEventProperties() and looks the year's item up by id.
   -------------------------------------------------------------------- */
function initEasterTooltip() {
  const tip = document.createElement("div");
  tip.id = "easter-tip";
  tip.style.display = "none";
  document.body.appendChild(tip);
  const tl = document.getElementById("timeline");

  function easterItemAt(e) {
    // The Easter stripes live in vis-timeline's BACKGROUND panel, which the
    // foreground panel covers completely. The mouse therefore never lands on
    // the stripe element itself, so `e.target.closest(".easter_line")` never
    // matched — that is why the hover never fired. Instead the cursor's
    // instant is compared against each year's Easter instant, with a
    // tolerance of a few pixels converted into milliseconds at the current
    // zoom level.
    if (!selectedGroups.has("Easter")) return null;
    const props = timeline.getEventProperties(e);
    if (!props || !props.time || props.what === "axis") return null;

    const centre = tl.querySelector(".vis-center");
    const width = centre ? centre.offsetWidth : 0;
    if (!width) return null;

    const win = timeline.getWindow();
    const msPerPx = (win.end.getTime() - win.start.getTime()) / width;
    const tolerance = 6 * msPerPx;              // ~6px grab radius
    const t = props.time.getTime();

    // check the year under the cursor and its neighbours: near a year
    // boundary the closest Easter can belong to the adjacent year
    const y = jdnToGregorian(msToJDN(t)).y;
    let best = null, bestDist = Infinity;
    for (const yy of [y - 1, y, y + 1]) {
      const d = byId.get(EASTER_ID_BASE + yy);
      if (!d) continue;
      const dist = Math.abs(d.startMs - t);
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    return bestDist <= tolerance ? best : null;
  }
  tl.addEventListener("mousemove", (e) => {
    const d = easterItemAt(e);
    if (!d) {
      tip.style.display = "none";
      if (tl.dataset.easterHover) { tl.style.cursor = ""; delete tl.dataset.easterHover; }
      return;
    }
    // the stripe never receives the pointer, so its CSS `cursor: help`
    // cannot apply — set it on the container instead
    if (!tl.dataset.easterHover) { tl.style.cursor = "help"; tl.dataset.easterHover = "1"; }
    const extra = [d.startIsJulian ? "Julian computus" : "Gregorian computus"];
    if (papalMode) {
      const p = papalLabelAt(d.startJDN);
      if (p) extra.push(p);
    }
    tip.innerHTML =
      `<strong>\u271A Easter ${d.dateSlash}</strong><span>${extra.join(" \u00B7 ")}</span>`;
    // show first so the box has measurable dimensions, then flip near edges
    tip.style.display = "block";
    const box = tip.getBoundingClientRect();
    let x = e.clientX + 14;
    let y = e.clientY + 14;
    if (x + box.width  > window.innerWidth  - 8) x = e.clientX - box.width  - 14;
    if (y + box.height > window.innerHeight - 8) y = e.clientY - box.height - 14;
    tip.style.left = Math.max(8, x) + "px";
    tip.style.top  = Math.max(8, y) + "px";
  });
  tl.addEventListener("mouseleave", () => {
    tip.style.display = "none";
    tl.style.cursor = "";
    delete tl.dataset.easterHover;
  });
}

/* ----------------------- historic time toggle ------------------------ */
function setHistoricMode(on) {
  historicMode = !!on;
  document.body.classList.toggle("historic-mode", historicMode);
  if (historicMode) {
    // vertical marker at the calendar reform; pointer-events disabled in CSS
    try {
      timeline.addCustomTime(new Date(jdnToMs(REFORM_JDN)), "reform");
      if (typeof timeline.setCustomTimeMarker === "function")
        timeline.setCustomTimeMarker(
          "Gregorian reform — Julian 4 Oct 1582 → Gregorian 15 Oct 1582", "reform", false);
    } catch (e) { /* marker already exists */ }
  } else {
    try { timeline.removeCustomTime("reform"); } catch (e) { /* not present */ }
  }
  timeline.redraw();                                    // re-evaluate axis labels
  if (lastSelectedId != null) showDetails(byId.get(lastSelectedId));
}

/* ----------------------- papal calendar toggle ----------------------- */
function setPapalMode(on) {
  papalMode = !!on;
  document.body.classList.toggle("papal-mode", papalMode);
  renderTimeline();                                     // adds/removes SV stripes
  timeline.redraw();                                    // re-evaluate axis labels
  if (lastSelectedId != null) showDetails(byId.get(lastSelectedId));
}

// "Pontifical year" container for the details panel: "Year 1 of <Pope>".
// Skipped for the pontificate rows themselves (they ARE the reference)
// and for anything outside the coverage of the pontificate dataset.
function papalField(d) {
  if (!PAPAL.length || d.group === REF_GROUP) return "";
  const s = d.startJDN;
  if (s == null) return "";
  const rs = reignAt(s);
  if (!rs) return "";
  const chip = (n) => ` <span class="cal-badge cal-papal">an. ${toRoman(n)}</span>`;
  const one = (jdn, r) => {
    if (r.vacante) return r.name || "Sedes vacans";
    const n = papalYearAt(jdn, r);
    return `Year ${n} of ${r.name}${chip(n)}`;
  };
  let txt = one(s, rs);
  const e = d.endJDN;
  if (e != null && e !== s) {
    const re = reignAt(e);
    if (re && re === rs && !rs.vacante) {
      const n1 = papalYearAt(s, rs), n2 = papalYearAt(e, re);
      if (n1 !== n2)
        txt = `Year ${n1} \u2013 Year ${n2} of ${rs.name}` +
              ` <span class="cal-badge cal-papal">an. ${toRoman(n1)}\u2013${toRoman(n2)}</span>`;
    } else if (re) {
      txt = `${one(s, rs)} \u2192 ${one(e, re)}`;
    }
  }
  return field("Pontifical year", txt);
}

// Date for the details panel, mode-aware. Pre-reform dates carry a badge:
//  - historic mode: the Julian date, exactly as recorded in the source;
//  - modern mode:   the proleptic Gregorian equivalent + the source date.
function displayDate(d, which) {
  const jdn = d[which + "JDN"];
  if (jdn == null) return $(d, which + "_original");    // fallback: raw source string
  if (!d[which + "IsJulian"]) return fmtJDN(jdn, false);
  return historicMode
    ? `${fmtJDN(jdn, true)} <span class="cal-badge cal-jul" title="As recorded in the source">Julian</span>`
    : `${fmtJDN(jdn, false)} <span class="cal-badge cal-greg" title="Proleptic Gregorian">prol. Greg.</span>` +
      ` <span class="cal-src">source: ${fmtJDN(jdn, true)} (Julian)</span>`;
}

/* --------------------------- details panel --------------------------- */
const $ = (item, key) => {
  const v = item ? item[key] : undefined;
  return (v == null || String(v).trim() === "") ? NA : v;
};
function field(title, value) {
  return `<h4>${title}</h4><div class="panel-inner">${value}</div>`;
}
// The `img` column points at local files (Popes/…) that are not deployed
// yet, so rendering it produced broken-image icons. Only the validated
// coat of arms from the enrichment list is shown; when that list is
// absent this returns "" and no image row appears at all.
function imgHtml(d) {
  return armsHtml(d);
}
// Birth dates are shown as a year only, whatever precision the data have.
function yearOnly(v) {
  if (v == null || v === NA) return v;
  const m = String(v).match(/\d{3,4}/);
  return m ? m[0] : v;
}

// Reference chronology entry (a reign, or a vacancy)
function reignDetails(d) {
  const lbl = Object.assign({ start: "Start", end: "End" }, CFG.reignLabels || {});
  return `
    <h3 class="center">${$(d,"content")}</h3>
    <div class="panel-inner center">${field("Record ID", $(d,"record_id"))}</div>
    ${imgHtml(d)}
    ${field("Personal name", enrichedNames(d, $(d,"name")))}
    ${authorityField(d)}
    <div class="row2">
      <div>${field("Date of birth", yearOnly($(d,"date_of_birth")))}</div>
      <div>${field("Date of death", $(d,"date_of_death"))}</div>
    </div>
    <div class="row2">
      <div>${field(lbl.start, displayDate(d,"start"))}</div>
      <div>${field(lbl.end, displayDate(d,"end"))}</div>
    </div>
    ${field("Bibliography", $(d,"bib"))}`;
}
// A person, or a member of a group
function personDetails(d) {
  return `
    <h3 class="center">${$(d,"content")}</h3>
    ${imgHtml(d)}
    ${field("Names", enrichedNames(d, $(d,"name")))}
    ${authorityField(d)}
    ${field("Start of the Appointment – End of the Appointment",
      `<div>${displayDate(d,"start")}</div><div>${displayDate(d,"end")}</div>`)}
    ${papalField(d)}
    ${field("Information", $(d,"info"))}
    ${field("Bibliography", $(d,"bib"))}`;
}
// A dated meeting with participants: their names link back to the timeline
function meetingDetails(d) {
  return `
    <h3 class="center">${$(d,"content")}</h3>
    <div class="panel-inner center">${field("Record ID", $(d,"record_id"))}</div>
    <div class="row2">
      <div>
        ${field("Date", displayDate(d,"start"))}
        ${papalField(d)}
      </div>
      <div>
        ${field("Place", $(d,"place"))}
        ${field("Location", $(d,"location"))}
      </div>
    </div>
    <div class="row2">
      <div>${field("Transcription of the source", $(d,"source_transcription"))}</div>
      <div>${field("Archival reference", $(d,"archival_reference"))}</div>
    </div>
    <div class="row2">
      <div>
        ${field("Chair", linkifyPeople($(d,"chair")))}
        ${field("Secretary", linkifyPeople($(d,"secretary")))}
        ${field("Members", linkifyPeople($(d,"members")))}
      </div>
      <div>${field("Notes", $(d,"notes"))}</div>
    </div>`;
}
function simpleDetails(label, d) {
  return `<h2>${label}</h2><h3>${$(d,"content")}</h3>${imgHtml(d)}<p>${$(d,"info")}</p>
    ${field("Dates", `${displayDate(d,"start")}${d.endJDN != null && d.endJDN !== d.startJDN ? " \u2013 " + displayDate(d,"end") : ""}`)}
    ${papalField(d)}`;
}
function easterDetails(d) {
  return `
    <h3 class="center">Easter ${$(d,"year")}</h3>
    ${field("Date of Easter Sunday", displayDate(d,"start"))}
    ${field("Computus", d.startIsJulian
        ? "Julian computus (pre-reform ecclesiastical calendar)"
        : "Gregorian computus (Meeus/Jones/Butcher algorithm)")}
    ${papalField(d)}`;
}
function showDetails(d) {
  const box = document.getElementById("details");
  if (!d) { box.innerHTML = `<p class="muted">No item selected.</p>`; return; }
  if (d.group === "Easter") { box.innerHTML = easterDetails(d); return; }
  const tpl = (CFG.templates || {})[d.group] || "simple";
  const label = (CFG.labels || {})[d.group] || String(d.group || "").replace(/_/g, " ");
  box.innerHTML =
    tpl === "reign"   ? reignDetails(d) :
    tpl === "person"  ? personDetails(d) :
    tpl === "meeting" ? meetingDetails(d) :
                        simpleDetails(label, d);
}

/* ------------------------------- init -------------------------------- */
function main() {
  if (typeof DATA === "undefined" || !DATA.length) {
    document.getElementById("loading").textContent =
      "No data found. Build data/timeline.js first: python tools/build_timeline.py";
    return;
  }

  // Preprocess: resolve every source date into a physical instant.
  // Pre-reform dates are Julian in the sources -> converted for positioning.
  ALL = DATA.map((d) => {
    const s = sourceToInstant(d.start), e = sourceToInstant(d.end);
    if (s) { d.startJDN = s.jdn; d.startIsJulian = s.julian; d.startMs = jdnToMs(s.jdn); }
    if (e) { d.endJDN = e.jdn; d.endIsJulian = e.julian; d.endMs = jdnToMs(e.jdn); }
    return d;
  });
  byId = new Map(ALL.map((d) => [d.id, d]));
  const years = ALL.map((d) => d.year).filter((y) => typeof y === "number");
  dataMinYear = Math.min(...years);
  dataMaxYear = Math.min(Math.max(...years), MAX_YEAR);   // never past maxYear
  yearRange = [dataMinYear, dataMaxYear];

  buildPapalIndex();
  buildSvBackgrounds();
  buildNameIndex();
  // one Easter Sunday per year of the data range (Julian computus to 1582,
  // Gregorian from 1583), as a dedicated row toggled from the sidebar
  const easterItems = buildEasterItems(dataMinYear, dataMaxYear);
  ALL = ALL.concat(easterItems);
  easterItems.forEach((d) => byId.set(d.id, d));

  buildTimeline();
  initEasterTooltip();
  initEntityLinks();
  initHistoryNav();
  initSidebar();

  // If none of the default-on groups have data, switch on whatever groups
  // exist so the timeline is never blank.
  const present = new Set(ALL.map((d) => d.group));
  if (![...selectedGroups].some((g) => present.has(g))) present.forEach(enableGroup);

  initSlider();
  renderTimeline();
  timeline.fit({ animation: false });   // initial fit (was fit=TRUE in app.R)

  // URL deep-link: ?data=<id> (or #data=<id> from the file:// fallback).
  // hashchange/popstate are handled by initHistoryNav().
  setTimeout(applyUrlId, 300);                    // after the initial fit settles

  document.getElementById("loading").style.display = "none";
}
main();
