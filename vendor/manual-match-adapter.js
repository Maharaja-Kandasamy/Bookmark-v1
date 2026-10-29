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

  function captureSearchFields(dialog, profile = 'storeView') {
    const fields = [], seenInputs = new Set(), seenCheckboxes = new Set();
    const add = (input, checkbox) => {
      if (seenInputs.has(input)) input = null;
      if (seenCheckboxes.has(checkbox)) checkbox = null;
      if (!input && !checkbox) return;
      if (input) seenInputs.add(input);
      if (checkbox) seenCheckboxes.add(checkbox);
      fields.push({input,checkbox,value:input?.value,checked:checkbox?.checked});
    };
    // Include every search-filter row, including filters unknown to the query planner.
    // Result-selection checkboxes have no search text field and are excluded.
    for (const input of dialog.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="submit"]):not([type="button"]),textarea')) {
      if (input.closest('table,[data-testid="manual-match-search-table"],[data-testid="manual-match-table"]')) continue;
      const group = input.closest('.horizontalPanelMM,.form-group,[role="group"],.MuiGrid-container');
      if (!group) continue;
      const checkboxes = [...group.querySelectorAll('input[type="checkbox"]')];
      if (!checkboxes.length) continue;
      add(input,checkboxes.length === 1 ? checkboxes[0] : null);
      checkboxes.forEach(checkbox => add(null,checkbox));
    }
    for (const key of Object.keys(FIELD_CONTROLS)) {
      const {input,checkbox} = discoverControl(dialog,key,profile);
      add(input,checkbox);
    }
    return fields;
  }

  function clearSearchFilters(snapshot) {
    if (!snapshot || findDialog() !== snapshot.dialog) return {ok:false,diagnostic:'Manual Match dialog changed'};
    try {
      for (const {checkbox} of snapshot.fields) {
        if (!checkbox?.checked) continue;
        if (checkbox.disabled) return {ok:false,diagnostic:'A selected search filter is disabled and could not be unchecked'};
        checkbox.click();
        if (checkbox.checked) return {ok:false,diagnostic:'A previous search filter could not be unchecked'};
      }
      if (snapshot.fields.some(({checkbox}) => checkbox?.checked)) return {ok:false,diagnostic:'A previous search filter was reselected by the form'};
      return {ok:true};
    } finally {
      // Unchecking a filter can clear its value; restore values before preparing the new query.
      snapshot.fields.forEach(({input,value}) => {if (input?.isConnected && input.value !== value) setInputValue(input,value);});
    }
  }

  function findSearchButton(dialog) {
    const visible = element => !!element.getClientRects().length && !element.closest('[hidden],[aria-hidden="true"]') && getComputedStyle(element).visibility !== 'hidden';
    const candidates = [...dialog.querySelectorAll('button,input[type="submit"],[role="button"]')].filter(visible)
      .filter(element => !element.disabled && /^search$/i.test(String(element.textContent || element.value || element.getAttribute('aria-label') || '').trim()));
    const standard = candidates.filter(element => element.getAttribute('data-testid') === 'search-button');
    const matches = standard.length ? standard : candidates;
    return matches.length === 1 ? {button:matches[0]} : {error:matches.length?'Multiple Search buttons found':'Visible Search button not found'};
  }

  function prepareQuery(query, options = {}) {
    const dialog = findDialog();
    if (!dialog) return { ok: false, diagnostic: 'Manual Match dialog not open' };
    const profile = options.profile === 'retailSync' ? 'retailSync' : 'storeView';
    const cleared = clearSearchFilters({dialog,fields:captureSearchFields(dialog,profile)});
    if (!cleared.ok) return cleared;
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
    const foundSearch = findSearchButton(dialog);
    if (foundSearch.error) return { status: 'incomplete', rows: [], diagnostic: foundSearch.error };
    const search = foundSearch.button;
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
    const fields = captureSearchFields(dialog,profile);
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

  return { FIELD_CONTROLS, PROFILE_CONTROLS, controlsForQuery, rowFromCells, findDialog, controlMatchesField, discoverControl, prepareQuery, captureSearchFields, clearSearchFilters, findSearchButton, extractRows, resultObservationRoot, isResultActivity, submitAndWait, setInputValue, captureFields, restoreFields, execute };
});
