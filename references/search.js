/* SCC References Explorer — Search References
 *
 * Static port of the original R/Shiny catalogue. No server: the data come
 * from data/references.js (global DATASET), the keyword tree from
 * keywords.js (globals GROUPS, PANELS).
 *
 * Filters, all combined with AND:
 *   - general search          DataTables search over every column
 *   - period slider           Year_format within [from, to]
 *   - category selects        exact match on AUTHOR, TITLE, YEAR, PUBLISHER,
 *                             PLACE, LANGUAGE (several values = OR)
 *   - keyword tree            KEYWORDS contains ANY ticked value
 *
 * Depends on: jQuery, DataTables (+ Buttons: colVis, html5, print),
 *             Select2, noUiSlider.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------ helpers */

  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const slug = (s) => s.replace(/[^a-z0-9]+/gi, '_');

  /* ------------------------------------------------------ keyword tree */

  function checkGroup(gid, indent) {
    const box = el('div', 'checkgroup indent-' + (indent || 0));
    box.dataset.group = gid;
    (GROUPS[gid] || []).forEach((val) => {
      const label = el('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = 'cb_' + gid + '_' + slug(val);
      cb.value = val;
      cb.checked = true;
      cb.dataset.group = gid;
      cb.className = 'kw-cb';
      label.appendChild(cb);
      label.appendChild(document.createTextNode(val));
      box.appendChild(label);
    });
    return box;
  }

  // Builds one collapsible panel from a PANELS entry, recursively.
  function buildPanel(panel, parent, depth) {
    const btn = el('button', 'btn-section collapsed');
    btn.type = 'button';
    btn.style.backgroundColor = panel.colour;
    btn.appendChild(el('span', null, panel.title));
    btn.appendChild(el('span', 'chev', '▼'));

    const body = el('div', 'panel-body' + (depth ? ' nested' : ''));
    body.style.display = 'none';
    btn.addEventListener('click', () => {
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      btn.classList.toggle('collapsed', open);
    });

    if (panel.selectAll) {
      const sa = el('button', 'select-all-btn', 'Select / clear all');
      sa.type = 'button';
      sa.addEventListener('click', () => {
        // only the checkboxes that belong to THIS panel, not nested ones
        const boxes = Array.from(body.querySelectorAll('input.kw-cb'))
          .filter((cb) => cb.closest('.panel-body') === body);
        const turnOn = boxes.some((cb) => !cb.checked);
        boxes.forEach((cb) => { cb.checked = turnOn; });
        applyFilters();
      });
      body.appendChild(sa);
    }

    (panel.rows || []).forEach((row) => {
      if (row.hr) body.appendChild(el('hr', 'thin'));
      else body.appendChild(checkGroup(row.g, row.indent));
    });
    (panel.children || []).forEach((child) => buildPanel(child, body, depth + 1));

    parent.appendChild(btn);
    parent.appendChild(body);
  }

  /* --------------------------------------------------------- filtering */

  let YEAR_RANGE = [0, 9999];
  const CAT_INPUTS = ['AUTHOR', 'TITLE', 'YEAR', 'PUBLISHER', 'PLACE', 'LANGUAGE'];

  function selectedKeywords() {
    return Array.from(document.querySelectorAll('input.kw-cb:checked')).map((cb) => cb.value);
  }

  function catSelections() {
    const out = {};
    CAT_INPUTS.forEach((k) => {
      const sel = document.getElementById('cat_' + k);
      out[k] = sel ? Array.from(sel.selectedOptions).map((o) => o.value).filter(Boolean) : [];
    });
    return out;
  }

  function filteredRows() {
    const kws = selectedKeywords();
    if (!kws.length) return [];                         // nothing ticked: nothing matches
    const rx = new RegExp(kws.map(escapeRe).join('|'));
    const [lo, hi] = YEAR_RANGE;
    const cats = catSelections();
    return DATASET.filter((r) => {
      const y = parseInt(r.Year_format, 10);
      if (!isNaN(y) && (y < lo || y > hi)) return false;
      if (!rx.test(r.KEYWORDS || '')) return false;
      for (const k of CAT_INPUTS) {
        if (cats[k].length && !cats[k].includes(r[k] || '')) return false;
      }
      return true;
    });
  }

  /* ------------------------------------------------------------- table */

  const COLUMNS = ['AUTHOR', 'YEAR', 'Year_format', 'TITLE', 'JOURNAL', 'BOOKTITLE',
    'EDITOR', 'PUBLISHER', 'PLACE', 'SERIES', 'VOLUME', 'NUMBER', 'PAGES', 'NOTES',
    'LANGUAGE', 'TYPE', 'KEYWORDS', 'BIBTEXKEY', 'CATEGORY'];
  const HIDDEN = ['Year_format', 'NOTES'];             // searchable, not shown
  const COL_WIDTH = {
    AUTHOR: 130, YEAR: 58, TITLE: 380, JOURNAL: 110, BOOKTITLE: 220, EDITOR: 120,
    PUBLISHER: 110, PLACE: 80, SERIES: 80, VOLUME: 55, NUMBER: 55, PAGES: 70,
    LANGUAGE: 90, TYPE: 105, KEYWORDS: 300, BIBTEXKEY: 85, CATEGORY: 85
  };
  // Long fields are clamped to five lines; a click expands them.
  const CLAMP = new Set(['TITLE', 'KEYWORDS', 'BOOKTITLE', 'JOURNAL']);
  const clampRender = (data, type) => {
    if (type !== 'display') return data;              // raw value for sort / search / copy
    const safe = String(data || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return '<div class="dt-clamp">' + safe + '</div>';
  };

  let table;
  const SELECTED = new Set();                         // BIBTEXKEYs of rows the user clicked
  const KEY_IDX = COLUMNS.indexOf('BIBTEXKEY');
  const toRow = (r) => COLUMNS.map((c) => r[c] || '');
  const toObj = (arr) => Object.fromEntries(COLUMNS.map((c, i) => [c, arr[i]]));

  function initTable() {
    const rows = filteredRows();
    table = $('#refTable').DataTable({
      data: rows.map(toRow),
      columns: COLUMNS.map((c) => {
        const def = { title: c };
        if (COL_WIDTH[c]) def.width = COL_WIDTH[c] + 'px';
        if (CLAMP.has(c)) def.render = clampRender;
        if (HIDDEN.includes(c)) { def.visible = false; def.searchable = true; }
        return def;
      }),
      scrollX: true,
      autoWidth: false,
      pageLength: 10,
      dom: '<"dt-top"<"dt-row"<"dt-left"B><"dt-right"p>>><"dt-row dt-meta"li>rt<"dt-bottom"p>',
      buttons: [
        { extend: 'colvis', text: 'Columns' },
        'copy',
        'print',
        { text: 'Download BibTeX', className: 'buttons-bibexport', action: showBibModal }
      ],
      language: { emptyTable: 'No records match the current filters.' }
    });
    populateCategoryFilters(rows);
    requestAnimationFrame(() => table.columns.adjust());
  }

  function refreshTable() {
    const rows = filteredRows();
    table.clear();
    table.rows.add(rows.map(toRow));
    table.draw(false);
    table.columns.adjust();
    populateCategoryFilters(rows);
  }

  // The category lists offer only values present in the current result,
  // so they narrow as the other filters narrow.
  function populateCategoryFilters(rows) {
    CAT_INPUTS.forEach((k) => {
      const sel = document.getElementById('cat_' + k);
      if (!sel) return;
      const keep = new Set(Array.from(sel.selectedOptions).map((o) => o.value));
      const values = Array.from(new Set(rows.map((r) => (r[k] || '').trim()).filter(Boolean))).sort();
      sel.innerHTML = '';
      values.forEach((v) => {
        const o = el('option', null, v);
        o.value = v;
        if (keep.has(v)) o.selected = true;
        sel.appendChild(o);
      });
      $(sel).trigger('change.select2');               // redraw Select2 without re-filtering
    });
  }

  let timer = null;
  function applyFilters() {
    clearTimeout(timer);
    timer = setTimeout(() => { if (table) refreshTable(); }, 80);
  }

  /* ----------------------------------------------------------- BibTeX */

  const BIB_FIELDS = ['AUTHOR', 'YEAR', 'TITLE', 'JOURNAL', 'BOOKTITLE', 'EDITOR',
    'PUBLISHER', 'PLACE', 'SERIES', 'VOLUME', 'NUMBER', 'PAGES', 'LANGUAGE', 'TYPE', 'KEYWORDS'];
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';

  function toBibTeX(rows) {
    return rows.map((r) => {
      const fields = BIB_FIELDS
        .filter((f) => r[f] && r[f].trim())
        .map((f) => '  ' + cap(f) + ' = {' + r[f].trim() + '}')
        .join(',\n');
      return '@' + cap(r.CATEGORY || 'Misc') + '{' + (r.BIBTEXKEY || '') + ',\n' + fields + '\n}';
    }).join('\n\n');
  }

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/x-bibtex' }));
    const a = el('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function showBibModal() {
    const back = el('div', 'modal-back');
    const box = el('div', 'modal-box');
    const x = el('button', 'close-x', '×');
    x.type = 'button';
    box.appendChild(x);
    box.appendChild(el('h4', null, 'Download BibTeX'));
    box.appendChild(el('p', null,
      'Download every record of the current result, or only the rows you selected ' +
      'by clicking on them in the table.'));
    const actions = el('div', 'actions');
    const all = el('button', 'dl-btn', 'Current results');
    const sel = el('button', 'dl-btn', 'Selected rows (' + SELECTED.size + ')');
    const cancel = el('button', 'cancel-btn', 'Cancel');
    [all, sel, cancel].forEach((b) => { b.type = 'button'; actions.appendChild(b); });
    box.appendChild(actions);
    back.appendChild(box);

    const close = () => back.remove();
    all.addEventListener('click', () => {
      const rows = table.rows({ search: 'applied' }).data().toArray().map(toObj);
      download('references.bib', toBibTeX(rows));
      close();
    });
    sel.addEventListener('click', () => {
      if (!SELECTED.size) { alert('No rows selected. Click rows in the table to select them.'); return; }
      download('references.bib', toBibTeX(DATASET.filter((r) => SELECTED.has(r.BIBTEXKEY))));
      close();
    });
    [x, cancel].forEach((b) => b.addEventListener('click', close));
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    document.getElementById('scc-search').appendChild(back);
  }

  /* -------------------------------------------------------------- init */

  function init() {
    // top-level collapsibles of the sidebar
    document.querySelectorAll('#scc-search [data-toggle-panel]').forEach((btn) => {
      const panel = document.getElementById(btn.dataset.togglePanel);
      btn.addEventListener('click', () => {
        const open = panel.style.display !== 'none';
        panel.style.display = open ? 'none' : 'block';
        btn.classList.toggle('collapsed', open);
      });
    });

    // keyword tree
    const host = document.getElementById('keywordPanels');
    PANELS.forEach((p) => buildPanel(p, host, 0));
    host.addEventListener('change', (e) => { if (e.target.matches('input.kw-cb')) applyFilters(); });

    // period slider
    const years = DATASET.map((r) => parseInt(r.Year_format, 10)).filter((n) => !isNaN(n));
    const minY = Math.min(...years), maxY = Math.max(...years);
    YEAR_RANGE = [minY, maxY];
    const slider = document.getElementById('yearSlider');
    noUiSlider.create(slider, {
      start: [minY, maxY], connect: true, step: 1, range: { min: minY, max: maxY },
      format: { to: (v) => Math.round(v), from: (v) => parseInt(v, 10) }
    });
    slider.noUiSlider.on('update', (v) => {
      YEAR_RANGE = [+v[0], +v[1]];
      document.getElementById('yearLo').textContent = v[0];
      document.getElementById('yearHi').textContent = v[1];
    });
    slider.noUiSlider.on('set', applyFilters);

    // category selects
    CAT_INPUTS.forEach((k) => {
      const sel = document.getElementById('cat_' + k);
      $(sel).select2({ placeholder: k, allowClear: true, width: '100%',
                       dropdownParent: $('#scc-search') });
      $(sel).on('change', applyFilters);
    });

    // general search: DataTables' own search, driven from the sidebar box
    document.getElementById('globalSearch').addEventListener('input', (e) => {
      table.search(e.target.value).draw();
    });

    initTable();

    // click a clamped cell to expand it; click a row to (de)select it
    $('#refTable tbody').on('click', '.dt-clamp', function (e) {
      e.stopPropagation();
      this.classList.toggle('expanded');
    });
    $('#refTable tbody').on('click', 'tr', function () {
      const d = table.row(this).data();
      if (!d) return;
      const key = d[KEY_IDX];
      if (SELECTED.has(key)) SELECTED.delete(key); else SELECTED.add(key);
      $(this).toggleClass('selected', SELECTED.has(key));
    });
    // selection survives paging, sorting and filtering; the count follows
    // every filter, including the general search box
    table.on('draw', () => {
      document.getElementById('resultCount').textContent = table.rows({ search: 'applied' }).count();
      table.rows({ page: 'current' }).every(function () {
        const d = this.data();
        if (d) $(this.node()).toggleClass('selected', SELECTED.has(d[KEY_IDX]));
      });
    });
    document.getElementById('resultCount').textContent = table.rows({ search: 'applied' }).count();

    let resize = null;
    window.addEventListener('resize', () => {
      clearTimeout(resize);
      resize = setTimeout(() => table.columns.adjust(), 150);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
