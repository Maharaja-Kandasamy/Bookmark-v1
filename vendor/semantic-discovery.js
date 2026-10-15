(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PickerSemanticDiscovery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ALIASES = {
    slId: ['slid','sourceid'], storeStatus: ['storestatus','status'], bannerName: ['slstorename','storename','tdlinxstorename','banner','bannername'],
    storeNumber: ['slstorenumber','storenumber','store','tdlinxstorenumber'], address: ['slpaline1','streetaddress','accstreetaddress','address','addressline'],
    city: ['slpacityname','city'], state: ['slpastatecode','state','statecode'], zip: ['slpapostalcode','postalcode','zipcode','zip'],
    areaCode: ['phoneareacode','areacode'], phone: ['phone','phonenumber','telephone']
  };
  const normalizeSemanticName = value => String(value || '').replace(/[↑↓↕▲▼]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const canonicalFor = value => {
    const normalized = normalizeSemanticName(value);
    return Object.keys(ALIASES).find(key => ALIASES[key].includes(normalized));
  };
  function buildHeaderMap(headers) {
    const map = {};
    (headers || []).forEach((header, index) => { const key = canonicalFor(typeof header === 'object' ? (header.title || header.text || '') : header); if (key && map[key] == null) map[key] = index; });
    return map;
  }
  function scoreSourceTable(tableModel) {
    const map = buildHeaderMap(tableModel?.headers || []);
    let score = ['slId','bannerName','address','city','state','zip','storeNumber'].reduce((n, key) => n + (map[key] != null ? 3 : 0), 0);
    if (map.slId != null && map.bannerName != null) score += 8;
    if (tableModel?.highlightedRows === 1) score += 10;
    if (tableModel?.highlightedRows > 1) score -= 20;
    return score;
  }
  function selectHighlightedRow(rows) {
    const selected = (rows || []).filter(row => !!row.rowHighlight || Number(row.cellHighlights || 0) > 0 || row.ariaSelected === true);
    if (!selected.length) return { error:'no-highlighted-row', candidates:[] };
    if (selected.length > 1) return { error:'multiple-highlighted-rows', candidates:selected };
    return { row:selected[0] };
  }
  function extractCanonicalRow(headerMap, cells, headers) {
    const canonical = {};
    Object.entries(headerMap || {}).forEach(([key, index]) => { const value = String(cells?.[index] ?? '').replace(/\s+/g, ' ').trim(); if (value) canonical[key] = value; });
    if (canonical.areaCode || canonical.phone) canonical.phone = `${canonical.areaCode || ''}${canonical.phone || ''}`;
    delete canonical.areaCode;
    const usefulIndexes = new Set(Object.values(headerMap || {}));
    const copyFields = (headers || []).map((header, index) => ({ header:String(header || '').replace(/\s+/g,' ').trim(), value:String(cells?.[index] ?? '').replace(/\s+/g,' ').trim(), index })).filter(item => usefulIndexes.has(item.index) && item.header && item.value).map(({header,value})=>({header,value}));
    return { canonical, copyFields };
  }
  const FIELD_ALIASES = { banner:['banner','bannername','storename','tdlinxstorename'], storeNumber:['storenumber','store','tdlinxstorenumber'], address:['address','addressline','streetaddress'], city:['city'], state:['state','statecode'], zip:['zip','zipcode','postalcode'], phone:['phone','phonenumber','telephone'] };
  const methodWeight = { testid:100, forlabel:90, aria:85, container:70, label:70 };
  function chooseFieldCandidate(field, candidates) {
    const aliases = FIELD_ALIASES[field] || [field];
    const scored = (candidates || []).map(candidate => {
      const labels = (candidate.labels || []).map(normalizeSemanticName);
      const match = Math.max(0, ...labels.map(label => aliases.includes(label) ? 30 : aliases.some(a => label.includes(a) || a.includes(label)) ? 18 : 0));
      return { ...candidate, confidence:(methodWeight[candidate.method] || 0) + match };
    }).filter(x => x.confidence > 20).sort((a,b) => b.confidence-a.confidence);
    if (!scored.length) return { error:'field-not-found', candidates:[] };
    if (scored[1] && scored[1].confidence === scored[0].confidence) return { error:'ambiguous-field', candidates:scored.filter(x => x.confidence === scored[0].confidence) };
    return scored[0];
  }
  const text = el => String(el?.getAttribute?.('title') || el?.textContent || '').replace(/\s+/g,' ').trim();
  function discoverFieldControl(root, field) {
    if (!root?.querySelectorAll) return { error:'field-not-found', candidates:[] };
    const candidates = [];
    [...root.querySelectorAll('input:not([type="checkbox"]), textarea')].forEach(input => {
      const group = input.closest('.horizontalPanelMM, .form-group, [role="group"], .MuiGrid-container') || input.parentElement;
      const labels = [];
      const testid = input.getAttribute('data-testid') || '';
      if (testid) labels.push(testid.replace(/textfield|input/gi,''));
      if (input.labels) labels.push(...[...input.labels].map(text));
      ['aria-label','placeholder','name'].forEach(attr => { const v=input.getAttribute(attr); if(v) labels.push(v); });
      if (group) labels.push(...[...group.querySelectorAll('label,[title],.MuiFormLabel-root')].map(text));
      const checkbox = group?.querySelector('input[type="checkbox"]') || null;
      const method = testid && normalizeSemanticName(testid).includes('grid') ? 'testid' : input.labels?.length ? 'forlabel' : input.getAttribute('aria-label') ? 'aria' : 'container';
      candidates.push({ input, checkbox, labels, method });
    });
    return chooseFieldCandidate(field, candidates);
  }
  function elementHighlighted(element) {
    if (!element) return false;
    if (element.getAttribute?.('aria-selected') === 'true' || element.matches?.('.selected,.highlighted,.Mui-selected,[data-selected="true"]')) return true;
    return false;
  }
  const background = element => {
    const style=typeof getComputedStyle==='function'?getComputedStyle(element):element?.style;
    const value=String(style?.backgroundColor||'').replace(/\s+/g,'');
    return !value || value==='transparent' || value==='rgba(0,0,0,0)' ? '' : value;
  };
  const isSalientColor = value => {
    const rgb=String(value||'').match(/[\d.]+/g)?.slice(0,3).map(Number)||[];
    return rgb.length===3 && Math.max(...rgb)-Math.min(...rgb)>=70;
  };
  function inspectTable(table) {
    const headers = [...table.querySelectorAll('thead th')].map(cell => cell.getAttribute('title') || cell.querySelector('[title]')?.getAttribute('title') || text(cell));
    const elements=[...table.querySelectorAll('tbody tr')].filter(row=>row.querySelector('td'));
    const rowColors=elements.map(row=>[...row.querySelectorAll('td')].map(cell=>background(cell)||background(row)));
    const counts=new Map(); rowColors.flat().filter(Boolean).forEach(color=>counts.set(color,(counts.get(color)||0)+1));
    const dominant=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
    const rows = elements.map((row,index) => {
      const colors=rowColors[index].filter(Boolean); const colorCounts=new Map(); colors.forEach(c=>colorCounts.set(c,(colorCounts.get(c)||0)+1));
      const strongest=[...colorCounts.entries()].sort((a,b)=>b[1]-a[1])[0];
      const consistent=!!strongest && strongest[1]>=Math.max(2,Math.ceil(rowColors[index].length/2));
      const relativeHighlight=consistent && (strongest[0]!==dominant || (elements.length===1 && isSalientColor(strongest[0])));
      return { element:row, rowHighlight:elementHighlighted(row)||relativeHighlight, cellHighlights:relativeHighlight?strongest[1]:[...row.querySelectorAll('td')].filter(elementHighlighted).length, ariaSelected:row.getAttribute('aria-selected') === 'true' };
    });
    return { element:table, headers, rows, highlightedRows:rows.filter(r => r.rowHighlight || r.cellHighlights || r.ariaSelected).length };
  }
  function discoverSource(root) {
    const tables = [...(root || document).querySelectorAll('table')]
      .filter(table => !table.closest('.modal-content-cls,[role="dialog"]') && table.getAttribute('data-testid') !== 'manual-match-search-table')
      .map(inspectTable).sort((a,b) => scoreSourceTable(b)-scoreSourceTable(a));
    if (!tables.length || scoreSourceTable(tables[0]) < 12) return { error:'source-table-not-found' };
    if (tables[1] && scoreSourceTable(tables[1]) === scoreSourceTable(tables[0])) return { error:'ambiguous-source-table' };
    const selected = selectHighlightedRow(tables[0].rows);
    if (selected.error) return { ...selected, table:tables[0].element };
    const cells = [...selected.row.element.querySelectorAll('td')].map(text);
    return { ...extractCanonicalRow(buildHeaderMap(tables[0].headers), cells, tables[0].headers), table:tables[0].element, row:selected.row.element, method:'semantic-highlight' };
  }
  return { ALIASES, FIELD_ALIASES, normalizeSemanticName, buildHeaderMap, scoreSourceTable, selectHighlightedRow, extractCanonicalRow, chooseFieldCandidate, discoverFieldControl, inspectTable, discoverSource };
});
