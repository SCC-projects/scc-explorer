/* SCC References Explorer — Build Graphs
 *
 * Static port of the original R/Shiny + ggplot2 board. No server.
 * Reads the same catalogue as Search References (data/references.js,
 * global DATASET) and the same keyword tree (keywords.js: GROUPS, PANELS).
 *
 *   Bubble  one bubble per X × Y cell and colour value; area = record count
 *   Bar     records per X category, stacked by Y (horizontal, as coord_flip)
 *   Pie     composition of the colour column
 *
 * Dragging a rectangle over a bubble or bar chart lists the records it
 * covers in the table below; the selection can be exported as CSV, Excel
 * or BibTeX, and the chart itself as PNG.
 *
 * Depends on: jQuery, DataTables, Chart.js 4, noUiSlider.
 */

(function () {
  'use strict';

  const AXIS_COLS = ['Year', 'PLACE', 'LANGUAGE', 'TYPOLOGY_OF_PUBLICATION'];
  const TABLE_COLS = ['AUTHOR', 'YEAR', 'TITLE', 'PUBLISHER', 'TYPE', 'PLACE',
    'KEYWORDS', 'LANGUAGE', 'TYPOLOGY_OF_PUBLICATION'];
  const BIB_COLS = ['AUTHOR', 'YEAR', 'TITLE', 'JOURNAL', 'BOOKTITLE', 'EDITOR', 'PUBLISHER',
    'PLACE', 'SERIES', 'VOLUME', 'NUMBER', 'PAGES', 'LANGUAGE', 'TYPE', 'KEYWORDS',
    'BIBTEXKEY', 'CATEGORY'];

  // Qualitative palette, keyed by position in the Z-category list.
  const PALETTE = ['#606c38', '#bc6c25', '#41542c', '#936639', '#a68a64', '#7f4f24',
    '#582f0e', '#283618', '#dda15e', '#6b705c', '#b08968', '#3a5a40'];

  // Beyond the hand-picked palette, walk the hue circle by the golden angle so
  // that categories such as PLACE (30+ levels) stay distinguishable.
  function colour(i, n) {
    if (n <= PALETTE.length) return PALETTE[i];
    const h = (i * 137.508) % 360;
    return 'hsl(' + h.toFixed(1) + ', 45%, ' + (i % 2 ? 38 : 52) + '%)';
  }

  // A legend on the right eats the plot once there are many levels.
  function legendCfg(n) {
    return {
      display: true,
      position: n > 14 ? 'bottom' : 'right',
      maxHeight: n > 14 ? 120 : undefined,
      labels: { boxWidth: 12, boxHeight: 12, font: { size: 11 } }
    };
  }

  const state = {
    selected: {},        // group id -> Set of checked values
    yearRange: null,
    plotType: 'Bubble',
    x: 'Year',
    y: 'TYPOLOGY_OF_PUBLICATION',
    z: 'LANGUAGE',
    brushed: [],         // records currently inside the brush rectangle
    chart: null,
    table: null
  };

  /* ------------------------------------------------------------------ data */

  // Two derived columns, as the R app prepared them at start-up:
  // Year (numeric axis) and TYPOLOGY_OF_PUBLICATION (= TYPE).
  const DATA = DATASET.map((r, i) => Object.assign({}, r, {
    _i: i,
    Year: r.Year_format,
    TYPOLOGY_OF_PUBLICATION: r.TYPE
  }));

  const years = DATA.map(r => parseInt(r.Year, 10)).filter(n => !isNaN(n));
  const YEAR_MIN = Math.min.apply(null, years);
  const YEAR_MAX = Math.max.apply(null, years);

  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const html = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Mirrors dsub_graph(): year window + OR-match of every checked keyword
  // against the KEYWORDS column.
  function filtered() {
    const terms = [];
    Object.keys(GROUPS).forEach(g => {
      state.selected[g].forEach(v => terms.push(v));
    });
    if (!terms.length) return [];
    const re = new RegExp(terms.map(esc).join('|'));
    const [lo, hi] = state.yearRange;
    return DATA.filter(r => {
      const y = parseInt(r.Year, 10);
      return !isNaN(y) && y >= lo && y <= hi && re.test(r.KEYWORDS);
    });
  }

  const val = (r, col) => (r[col] === '' || r[col] == null) ? 'NA' : r[col];

  /* --------------------------------------------------------------- sidebar */

  function checkboxRow(gid, indent) {
    const items = GROUPS[gid].map((v, k) => {
      const id = 'cb_' + gid + '_' + k;
      return '<div class="cb"><input type="checkbox" id="' + id + '" data-group="' + gid +
        '" value="' + html(v) + '" checked><label for="' + id + '">' + html(v) + '</label></div>';
    }).join('');
    return '<div class="cb-group indent-' + indent + '" data-group="' + gid + '">' + items + '</div>';
  }

  function panelHtml(p, depth) {
    const body = (p.rows || []).map(r =>
      r.hr ? '<hr>' : checkboxRow(r.g, r.indent)).join('') +
      (p.children || []).map(c => panelHtml(c, depth + 1)).join('');
    const selectAll = p.selectAll
      ? '<button type="button" class="btn-selectall" data-panel="' + html(p.title) + '">Select All</button>'
      : '';
    return '<div class="panel-kw depth-' + depth + '">' +
      '<button type="button" class="panel-head" style="background-color:' + p.colour + '">' +
      html(p.title) + '</button>' +
      '<div class="panel-body-kw" hidden>' + selectAll + body + '</div></div>';
  }

  function buildSidebar() {
    Object.keys(GROUPS).forEach(g => { state.selected[g] = new Set(GROUPS[g]); });
    document.getElementById('kwPanels').innerHTML =
      PANELS.map(p => panelHtml(p, 0)).join('');

    document.getElementById('kwPanels').addEventListener('click', function (e) {
      const head = e.target.closest('.panel-head');
      if (head) {
        const body = head.nextElementSibling;
        body.hidden = !body.hidden;
        head.classList.toggle('open', !body.hidden);
        return;
      }
      const all = e.target.closest('.btn-selectall');
      if (all) {
        const scope = all.parentElement;
        // Only the groups directly under this panel, not those of nested panels.
        const boxes = Array.prototype.filter.call(
          scope.querySelectorAll('input[type=checkbox]'),
          b => b.closest('.panel-body-kw') === scope);
        const turnOn = boxes.some(b => !b.checked);
        boxes.forEach(b => { b.checked = turnOn; syncBox(b); });
        refresh();
      }
    });

    document.getElementById('kwPanels').addEventListener('change', function (e) {
      if (e.target.matches('input[type=checkbox]')) { syncBox(e.target); refresh(); }
    });
  }

  function syncBox(box) {
    const set = state.selected[box.dataset.group];
    if (box.checked) set.add(box.value); else set.delete(box.value);
  }

  /* ---------------------------------------------------------------- charts */

  function categories(col) {
    if (col === 'Year') return null;                       // numeric axis
    return Array.from(new Set(DATA.map(r => val(r, col)))).sort((a, b) => a.localeCompare(b));
  }

  function scaleFor(col, cats) {
    if (!cats) {
      return {
        type: 'linear', title: { display: true, text: col },
        ticks: { precision: 0, callback: v => String(Math.round(v)) }
      };
    }
    return {
      type: 'linear', min: -0.5, max: cats.length - 0.5,
      title: { display: true, text: col },
      // One tick per category — Chart.js would otherwise start ticks at min (-0.5)
      // and every label would fall between categories.
      afterBuildTicks: axis => { axis.ticks = cats.map((_, i) => ({ value: i })); },
      ticks: {
        autoSkip: false,
        callback: v => (cats[v] !== undefined ? cats[v] : '')
      },
      grid: { color: 'rgba(0,0,0,.06)' }
    };
  }

  const pos = (r, col, cats) =>
    cats ? cats.indexOf(val(r, col)) : parseInt(r.Year, 10);

  function buildBubble(rows) {
    const xc = categories(state.x), yc = categories(state.y);
    const zVals = Array.from(new Set(rows.map(r => val(r, state.z))))
      .sort((a, b) => a.localeCompare(b));

    const datasets = zVals.map((z, i) => {
      const cells = new Map();
      rows.filter(r => val(r, state.z) === z).forEach(r => {
        const key = pos(r, state.x, xc) + '|' + pos(r, state.y, yc);
        if (!cells.has(key)) cells.set(key, { x: pos(r, state.x, xc), y: pos(r, state.y, yc), recs: [] });
        cells.get(key).recs.push(r);
      });
      return {
        label: z,
        backgroundColor: colour(i, zVals.length),
        borderColor: 'rgba(57,60,56,.55)',
        data: Array.from(cells.values()).map(c => ({
          x: c.x, y: c.y, r: 4 + Math.sqrt(c.recs.length) * 3.5, recs: c.recs
        }))
      };
    });

    return {
      type: 'bubble',
      data: { datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        scales: { x: scaleFor(state.x, xc), y: scaleFor(state.y, yc) },
        plugins: {
          legend: legendCfg(zVals.length),
          tooltip: {
            callbacks: {
              label: ctx => {
                const p = ctx.raw;
                const xl = xc ? xc[p.x] : p.x, yl = yc ? yc[p.y] : p.y;
                return ctx.dataset.label + ' — ' + xl + ' / ' + yl +
                  ' (' + p.recs.length + ' ' + (p.recs.length === 1 ? 'record' : 'records') + ')';
              }
            }
          }
        }
      }
    };
  }

  function buildBar(rows) {
    // coord_flip() in app.R: categories run down the y axis, counts along x.
    const xc = Array.from(new Set(rows.map(r => val(r, state.x))))
      .sort((a, b) => a.localeCompare(b));
    const yVals = Array.from(new Set(rows.map(r => val(r, state.y))))
      .sort((a, b) => a.localeCompare(b));

    const datasets = yVals.map((y, i) => {
      const counts = xc.map(() => 0), recs = xc.map(() => []);
      rows.filter(r => val(r, state.y) === y).forEach(r => {
        const k = xc.indexOf(val(r, state.x));
        counts[k]++; recs[k].push(r);
      });
      return {
        label: y, data: counts, recs,
        backgroundColor: colour(i, yVals.length),
        borderColor: '#393C38', borderWidth: 1
      };
    });

    return {
      type: 'bar',
      data: { labels: xc, datasets },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: false,
        scales: {
          x: { stacked: true, beginAtZero: true, title: { display: true, text: 'Number of records' } },
          y: { stacked: true, title: { display: true, text: state.x } }
        },
        plugins: { legend: legendCfg(yVals.length) }
      }
    };
  }

  function buildPie(rows) {
    const zVals = Array.from(new Set(rows.map(r => val(r, state.z))))
      .sort((a, b) => a.localeCompare(b));
    const counts = zVals.map(z => rows.filter(r => val(r, state.z) === z).length);
    return {
      type: 'pie',
      data: {
        labels: zVals,
        datasets: [{
          data: counts,
          backgroundColor: zVals.map((_, i) => colour(i, zVals.length)),
          borderColor: '#fff', borderWidth: 1
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: legendCfg(zVals.length) }
      }
    };
  }

  /* ----------------------------------------------------------------- brush */

  // Drag-rectangle selection over the plot area, replacing Shiny's brushOpts().
  const brushPlugin = {
    id: 'brush',
    afterDraw(chart) {
      const b = chart.$brush;
      if (!b || !b.rect) return;
      const { ctx } = chart;
      const [x1, y1, x2, y2] = b.rect;
      ctx.save();
      ctx.fillStyle = 'rgba(128,0,32,.15)';
      ctx.strokeStyle = 'rgba(128,0,32,.8)';
      ctx.lineWidth = 1;
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      ctx.restore();
    }
  };

  function attachBrush(chart) {
    const canvas = chart.canvas;
    // Listeners are bound to the chart's lifetime: refresh() aborts the signal
    // before destroying the chart, so nothing fires against a dead context.
    chart.$abort = new AbortController();
    const opt = { signal: chart.$abort.signal };
    chart.$brush = { rect: null };
    let start = null;

    const at = e => {
      const b = canvas.getBoundingClientRect();
      return [e.clientX - b.left, e.clientY - b.top];
    };

    canvas.addEventListener('mousedown', e => {
      if (state.plotType === 'Pie') return;
      start = at(e);
      chart.$brush.rect = null;
      chart.draw();
    }, opt);

    canvas.addEventListener('mousemove', e => {
      if (!start) return;
      const p = at(e);
      chart.$brush.rect = [Math.min(start[0], p[0]), Math.min(start[1], p[1]),
        Math.max(start[0], p[0]), Math.max(start[1], p[1])];
      chart.draw();
    }, opt);

    const finish = () => {
      if (!start) return;
      start = null;
      const rect = chart.$brush.rect;
      if (!rect || (rect[2] - rect[0] < 3 && rect[3] - rect[1] < 3)) {
        chart.$brush.rect = null;
        setBrushed([]);
        chart.draw();
        return;
      }
      setBrushed(collect(chart, rect));
    };

    canvas.addEventListener('mouseup', finish, opt);
    canvas.addEventListener('mouseleave', finish, opt);
  }

  function collect(chart, [x1, y1, x2, y2]) {
    const out = new Map();
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      meta.data.forEach((el, ei) => {
        let hit = false;
        if (state.plotType === 'Bubble') {
          hit = el.x >= x1 && el.x <= x2 && el.y >= y1 && el.y <= y2;
        } else {
          const p = el.getProps(['x', 'y', 'base', 'height'], true);
          const bx1 = Math.min(p.base, p.x), bx2 = Math.max(p.base, p.x);
          const by1 = p.y - p.height / 2, by2 = p.y + p.height / 2;
          hit = bx1 <= x2 && bx2 >= x1 && by1 <= y2 && by2 >= y1;
        }
        if (!hit) return;
        const recs = state.plotType === 'Bubble' ? (ds.data[ei].recs || []) : (ds.recs[ei] || []);
        recs.forEach(r => out.set(r._i, r));
      });
    });
    return Array.from(out.values());
  }

  function setBrushed(rows) {
    state.brushed = rows;
    drawTable();
  }

  /* ----------------------------------------------------------------- table */

  function drawTable() {
    const body = state.brushed.map(r =>
      '<tr>' + TABLE_COLS.map(c => '<td>' + html(r[c]) + '</td>').join('') + '</tr>').join('');
    if (state.table) { state.table.destroy(); state.table = null; }
    document.querySelector('#brushTable tbody').innerHTML = body;
    state.table = $('#brushTable').DataTable({
      scrollX: true, autoWidth: true, pageLength: 10, info: false,
      language: { emptyTable: 'Drag a rectangle over the graph to list the records it covers.' }
    });
    document.getElementById('selCount').textContent = state.brushed.length;
  }

  /* ------------------------------------------------------------- downloads */

  function download(name, text, mime) {
    const blob = new Blob(['\ufeff' + text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  const csvCell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';

  function toCsv(rows) {   // write_csv2(): semicolon separated
    return [BIB_COLS.join(';')].concat(
      rows.map(r => BIB_COLS.map(c => csvCell(r[c])).join(';'))).join('\r\n');
  }

  function toBib(rows) {
    return rows.map(r => {
      const type = (r.CATEGORY || 'misc').toLowerCase();
      const fields = BIB_COLS.filter(c => c !== 'BIBTEXKEY' && c !== 'CATEGORY')
        .filter(c => r[c])
        .map(c => '  ' + c.toLowerCase() + ' = {' + r[c] + '}')
        .join(',\n');
      return '@' + type + '{' + (r.BIBTEXKEY || 'noKey') + ',\n' + fields + '\n}';
    }).join('\n\n');
  }

  /* ------------------------------------------------------------------ init */

  function refresh() {
    const rows = filtered();
    document.getElementById('rowCount').textContent = rows.length;

    if (state.chart) {
      if (state.chart.$abort) state.chart.$abort.abort();
      state.chart.destroy();
      state.chart = null;
    }
    const cfg = state.plotType === 'Bubble' ? buildBubble(rows)
      : state.plotType === 'Bar' ? buildBar(rows) : buildPie(rows);
    cfg.plugins = [brushPlugin];
    state.chart = new Chart(document.getElementById('plotui'), cfg);
    attachBrush(state.chart);

    setBrushed([]);
    document.getElementById('pieNote').hidden = state.plotType !== 'Pie';
    document.getElementById('legendNote').textContent = state.plotType === 'Bar'
      ? 'Bar fill: ' + state.y + '. Bar length: number of records.'
      : 'Colour: ' + state.z + (state.plotType === 'Bubble' ? '. Bubble area: number of records.' : '.');
  }

  function init() {
    buildSidebar();

    // Axis pickers
    [['selY', 'y'], ['selX', 'x'], ['selZ', 'z']].forEach(([id, key]) => {
      const sel = document.getElementById(id);
      sel.innerHTML = AXIS_COLS.map(c =>
        '<option value="' + c + '"' + (state[key] === c ? ' selected' : '') + '>' + c + '</option>').join('');
      sel.addEventListener('change', () => { state[key] = sel.value; refresh(); });
    });

    document.getElementById('plotnumber').addEventListener('change', function () {
      state.plotType = this.value;
      refresh();
    });

    // Year range
    const slider = document.getElementById('yearSlider');
    state.yearRange = [YEAR_MIN, YEAR_MAX];
    noUiSlider.create(slider, {
      start: [YEAR_MIN, YEAR_MAX], connect: true, step: 1,
      range: { min: YEAR_MIN, max: YEAR_MAX },
      format: { to: v => Math.round(v), from: v => Number(v) }
    });
    const out = document.getElementById('yearOut');
    out.textContent = YEAR_MIN + ' – ' + YEAR_MAX;
    slider.noUiSlider.on('update', v => {
      state.yearRange = [Number(v[0]), Number(v[1])];
      out.textContent = v[0] + ' – ' + v[1];
    });
    slider.noUiSlider.on('set', refresh);

    // Downloads
    document.getElementById('downloadPlot').addEventListener('click', () => {
      const src = state.chart.canvas;
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(src, 0, 0);
      const a = document.createElement('a');
      a.href = c.toDataURL('image/png');
      a.download = 'graph.png';
      document.body.appendChild(a); a.click(); a.remove();
    });

    const modal = document.getElementById('dlModal');
    document.getElementById('Download').addEventListener('click', () => { modal.hidden = false; });
    modal.addEventListener('click', e => {
      if (e.target === modal || e.target.matches('[data-close]')) modal.hidden = true;
    });
    document.getElementById('dl_csv').addEventListener('click', () =>
      download('selection.csv', toCsv(state.brushed), 'text/csv'));
    document.getElementById('dl_xls').addEventListener('click', () =>
      download('selection.xls', toCsv(state.brushed), 'application/vnd.ms-excel'));
    document.getElementById('dl_bib').addEventListener('click', () =>
      download('selection.bib', toBib(state.brushed), 'application/x-bibtex'));

    document.getElementById('clearBrush').addEventListener('click', () => {
      if (state.chart) { state.chart.$brush.rect = null; state.chart.draw(); }
      setBrushed([]);
    });

    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
