(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PickerManualMatchAdapter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const Semantic = typeof PickerSemanticDiscovery !== 'undefined' ? PickerSemanticDiscovery : (typeof require === 'function' ? require('./semantic-discovery') : null);
  const Gsrs = typeof PickerGsrsTableAdapter !== 'undefined' ? PickerGsrsTableAdapter : (typeof require === 'function' ? require('./gsrs-table-adapter') : null);
  const FIELD_CONTROLS = {
    banner: { checkbox: 'grid-1-checkbox', input: 'grid-1-textfield' },
    storeNumber: { checkbox: 'grid-2-checkbox', input: 'grid-2-textfield' },
    address: { checkbox: 'grid-3-checkbox', input: 'grid-3-textfield' },
    city: { checkbox: 'grid-4-checkbox', input: 'grid-4-textfield' },
    state: { checkbox: 'grid-5-checkbox', input: 'grid-5-textfield' },
    zip: { checkbox: 'grid-6-checkbox', input: 'grid-6-textfield' },
    phone: { checkbox: 'grid-12-checkbox', input: 'grid-12-textfield' }
  };
  const PROFILE_CONTROLS = {
    storeView: FIELD_CONTROLS,
    retailSync: {
      banner:{checkbox:'grid-2-checkbox',input:'grid-2-textfield'}, storeNumber:{checkbox:'grid-9-checkbox',input:'grid-9-textfield'},
      address:{checkbox:'grid-3-checkbox',input:'grid-3-textfield'}, city:{checkbox:'grid-4-checkbox',input:'grid-4-textfield'},
      state:{checkbox:'grid-5-checkbox',input:'grid-5-textfield'}, zip:{checkbox:'grid-6-checkbox',input:'grid-6-textfield'},
      phone:{checkbox:'grid-10-checkbox',input:'grid-10-textfield'}
    }
  };

  const controlsForQuery = (query, profile = 'storeView') => Object.entries(query.fields || {}).map(([key, value]) => ({ key, ...(PROFILE_CONTROLS[profile] || FIELD_CONTROLS)[key], value })).filter(item => item.input);
  const rowFromCells = (cells, headers = []) => {
    if (headers.length && Semantic) {
      const extracted = Semantic.extractCanonicalRow(Semantic.buildHeaderMap(headers), cells, headers);
      return { ...extracted.canonical, copyFields: extracted.copyFields };
    }
    const names = headers.map(value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
    const valueFor = (...keys) => { const index = names.findIndex(name => keys.includes(name)); return index >= 0 ? cells[index] || '' : ''; };
    if (names.length) return {
      slId: valueFor('SLID'), storeStatus: valueFor('STORESTATUS'), bannerName: valueFor('SLSTORENAME','STORENAME'),
      storeNumber: valueFor('SLSTORENUMBER','STORENUMBER'), address: valueFor('SLPALINE1','STREETADDRESS'),
      city: valueFor('SLPACITYNAME','CITY'), state: valueFor('SLPASTATECODE','STATE'), zip: valueFor('SLPAPOSTALCODE','POSTALCODE','ZIP'),
      phone: `${valueFor('PHONEAREACODE','AREACODE')}${valueFor('PHONE','PHONENUMBER')}`
    };
    return { slId: cells[0] || '', storeStatus: cells[1] || '', bannerName: cells[2] || '', storeNumber: cells[3] || '', address: cells[4] || '', city: cells[5] || '', state: cells[6] || '', zip: cells[7] || '' };
  };

  const evaluate = (xpath, context) => {
    const doc = context?.ownerDocument || context || document;
    return doc.evaluate(xpath, context || doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  };
  const findDialog = () => typeof document === 'undefined' ? null : evaluate("//div[contains(@class,'modal-content-cls')][.//*[@data-testid='modal-title' and normalize-space()='MANUAL MATCH']]", document);
  const byTestId = (dialog, id) => dialog?.querySelector(`[data-testid="${id}"]`);

  const controlMatchesField = (input, key) => {
    const aliases=Semantic?.FIELD_ALIASES?.[key] || [key];
    const values=['id','name','aria-label'].map(name=>input?.getAttribute?.(name)).filter(Boolean);
    if (input?.labels) values.push(...[...input.labels].map(label=>label.textContent));
    const container=input?.closest?.('.MuiGrid-item, .MuiFormControl-root, label, [role="group"]');
    if(container?.textContent) values.push(container.textContent);
    return values.map(Semantic?.normalizeSemanticName || (value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,''))).some(value=>aliases.includes(value));
  };

  const discoverControl = (dialog, key, profile = 'storeView') => {
    const fixed = (PROFILE_CONTROLS[profile] || FIELD_CONTROLS)[key];
    const input = fixed && byTestId(dialog, fixed.input);
    const checkbox = fixed && byTestId(dialog, fixed.checkbox);
    if (input && checkbox && controlMatchesField(input,key)) return { input, checkbox, method:'verified-testid', confidence:100 };
    const semantic = Semantic?.discoverFieldControl(dialog, key);
    if (semantic && !semantic.error && semantic.input && semantic.checkbox) return semantic;
    return semantic || { error:'field-not-found' };
  };

  function setInputValue(input, value) {
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(input, value); else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function prepareQuery(query, options = {}) {
    const dialog = findDialog();
    if (!dialog) return { ok: false, diagnostic: 'Manual Match dialog not open' };
    const profile = options.profile === 'retailSync' ? 'retailSync' : 'storeView';
    const existingFields = Object.keys(FIELD_CONTROLS).map(key => {
      const found = discoverControl(dialog, key, profile);
      return { ...found, value: found.input?.value };
    });
    existingFields.forEach(({ checkbox }) => { if (checkbox?.checked) checkbox.click(); });
    // Some forms clear values when unchecked. Preserve those values while changing search selection.
    existingFields.forEach(({ input, value }) => { if (input && input.value !== value) setInputValue(input, value); });
    for (const control of controlsForQuery(query, profile)) {
      const found = discoverControl(dialog, control.key, profile);
      const { checkbox, input } = found;
      if (!checkbox || !input) return { ok: false, diagnostic: found.error === 'ambiguous-field' ? `Multiple ${control.key} fields matched; search stopped safely` : `Required ${control.key} control not found` };
      if (!checkbox.checked) checkbox.click();
      setInputValue(input, control.value);
      if (!checkbox.checked) return { ok:false, diagnostic:`${control.key} checkbox did not stay selected` };
      if (String(input.value).trim() !== String(control.value).trim()) return { ok:false, diagnostic:`${control.key} value was not accepted by the form` };
    }
    return { ok: true, dialog, controlsVerified:true };
  }

  const tableSignature = dialog => {
    const table = byTestId(dialog, 'manual-match-search-table');
    return table ? `${table.querySelectorAll('tbody tr').length}|${table.textContent.replace(/\s+/g, ' ').trim()}` : 'missing';
  };
  const resultObservationRoot = dialog => byTestId(dialog, 'manual-match-search-table')?.parentElement || byTestId(dialog, 'manual-match-search-table');
  const isResultActivity = (records, resultRoot) => !!resultRoot && (records || []).some(record => resultRoot.contains?.(record.target));

  function extractRows(dialog = findDialog()) {
    const table = byTestId(dialog, 'manual-match-search-table');
    if (!table) return [];
    const headers = [...table.querySelectorAll('thead th')].map(cell => cell.textContent.replace(/\s+/g, ' ').trim());
    const profile = Gsrs?.detectProfile(headers);
    return [...table.querySelectorAll('tbody tr')].filter(row => row.querySelector('td')).map(row => {
      const cells=[...row.querySelectorAll('td')].map(cell => cell.textContent.replace(/\s+/g, ' ').trim());
      return profile === 'storeView' || profile === 'retailSync' ? Gsrs.extractRow(headers,cells,profile) : rowFromCells(cells,headers);
    });
  }

  async function executeSearch(query, options = {}) {
    const timeoutMs = options.timeoutMs || 30000;
    const stableMs = options.stableMs || 1500;
    const prepared = prepareQuery(query, { profile:options.profile });
    if (!prepared.ok) return { status: 'incomplete', rows: [], diagnostic: prepared.diagnostic };
    const dialog = prepared.dialog;
    const search = evaluate(".//button[@data-testid='search-button'][.//span[normalize-space()='Search']]", dialog);
    if (!search) return { status: 'incomplete', rows: [], diagnostic: 'Visible Search button not found' };
    if (query.__pickerSubmitted) return { status:'incomplete', rows:[], diagnostic:'Search was already submitted for this query' };
    query.__pickerSubmitted = true;
    return submitAndWait(dialog, search, options);
  }

  function submitAndWait(dialog, search, options = {}) {
    const timeoutMs = options.timeoutMs || 30000;
    const stableMs = options.stableMs || 1500;
    if (options.signal?.aborted) return Promise.resolve({status:'incomplete',rows:[],diagnostic:'Search cancelled'});
    const before = tableSignature(dialog);
    const startedAt = Date.now();
    search.click();
    return new Promise(resolve => {
      let finished = false;
      let lastSignature = before;
      let stableSince = 0;
      let sawMutation = false;
      let sawBusy = false;
      const finish = result => {
        if (finished) return;
        finished = true; clearInterval(timer); clearTimeout(deadline);
        observer?.disconnect(); resolve(result);
      };
      const check = () => {
        const liveDialog = findDialog();
        if (options.isCurrent && !options.isCurrent()) return finish({ status: 'incomplete', rows: [], diagnostic: 'Source record changed' });
        if (!liveDialog) return finish({ status: 'incomplete', rows: [], diagnostic: 'Manual Match dialog closed during search' });
        const signature = tableSignature(liveDialog);
        const busy = !!liveDialog.querySelector('[aria-busy="true"], .MuiCircularProgress-root, [role="progressbar"]') || search.disabled;
        if (busy) sawBusy = true;
        if (signature !== lastSignature) { lastSignature = signature; stableSince = Date.now(); }
        const changedOrEmpty = signature !== before || /displaying\s+0\s*-/i.test(liveDialog.textContent) || /no (?:rows|records|results)/i.test(liveDialog.textContent);
        const settledUnchanged = !busy && (sawMutation || sawBusy) && Date.now() - startedAt >= Math.max(750, stableMs);
        if (!busy && changedOrEmpty && !stableSince) stableSince = Date.now();
        if (!busy && !changedOrEmpty && settledUnchanged && !stableSince) stableSince = Date.now();
        if (!busy && (changedOrEmpty || settledUnchanged) && stableSince && Date.now() - stableSince >= stableMs) finish({ status: 'complete', rows: extractRows(liveDialog), diagnostic: '' });
      };
      const observationRoot=resultObservationRoot(dialog);
      const observer = typeof MutationObserver === 'undefined' || !observationRoot ? null : new MutationObserver(records => { if (isResultActivity(records,observationRoot)) sawMutation = true; check(); });
      observer?.observe(observationRoot, { childList: true, subtree: true, characterData: true, attributes: true });
      const timer = setInterval(check, 250);
      const deadline = setTimeout(() => finish({ status: 'incomplete', rows: [], diagnostic: `Result screen did not stabilize within ${Math.round(timeoutMs / 1000)} seconds` }), timeoutMs);
      options.signal?.addEventListener('abort', () => finish({ status: 'incomplete', rows: [], diagnostic: 'Search cancelled' }), { once: true });
    });
  }

  function captureFields(profile = 'storeView') {
    const dialog = findDialog();
    if (!dialog) return null;
    const source = Gsrs?.extractFromDocument(document, profile);
    const identity = source?.source ? Gsrs.sourceSignature(source) : null;
    const fields = Object.keys(FIELD_CONTROLS).map(key => {
      const { input, checkbox } = discoverControl(dialog, key, profile);
      return { input, checkbox, value: input?.value, checked: checkbox?.checked };
    });
    return { dialog, fields, identity, profile };
  }
  function restoreFields(snapshot) {
    if (!snapshot || findDialog() !== snapshot.dialog) return;
    if (snapshot.identity) {
      const current = Gsrs?.extractFromDocument(document, snapshot.profile);
      if (!current?.source || Gsrs.sourceSignature(current) !== snapshot.identity) return;
    }
    snapshot.fields.forEach(({ checkbox, checked }) => {
      if (checkbox?.isConnected && checkbox.checked !== checked) checkbox.click();
    });
    snapshot.fields.forEach(({ input, value }) => {
      if (input?.isConnected && input.value !== value) setInputValue(input, value);
    });
  }
  async function execute(query, options = {}) {
    if (options.signal?.aborted) return { status: 'incomplete', rows: [], diagnostic: 'Search cancelled' };
    const snapshot = captureFields(options.profile);
    try { return await executeSearch(query, options); }
    finally { restoreFields(snapshot); }
  }

  return { FIELD_CONTROLS, PROFILE_CONTROLS, controlsForQuery, rowFromCells, findDialog, controlMatchesField, discoverControl, prepareQuery, extractRows, resultObservationRoot, isResultActivity, submitAndWait, setInputValue, captureFields, restoreFields, execute };
});
