(function(root) {
  const norm = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const visible = element => !!element?.getClientRects().length && !element.closest('[hidden],[aria-hidden="true"]');
  function labels(element) {
    const doc = element.ownerDocument;
    return [element.getAttribute('aria-label'), element.getAttribute('placeholder'), element.getAttribute('name'), element.getAttribute('id'),
      ...(element.labels ? [...element.labels].map(label => label.textContent) : []),
      ...(element.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => doc.getElementById(id)?.textContent)
    ].filter(Boolean).map(norm);
  }
  function findTdField(dialog) {
    const aliases = ['td','tds','tdlinxnumber','tdlinxnumbers','tdid','tdids','tdnumber','tdnumbers','tdlinx','tdlinxid','tdlinxids','slid','slids','linkstd','tdlinks'];
    const matches = [...dialog.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]),textarea')]
      .filter(visible).filter(input => labels(input).some(label => aliases.includes(label.replace(/(?:textfield|input)$/,''))));
    if (matches.length !== 1) return { error: matches.length ? 'Multiple TD fields found in Links search' : 'TD field not found in Links search' };
    const input = matches[0];
    const group = input.closest('.horizontalPanelMM,.form-group,[role="group"],.MuiGrid-container') || input.parentElement;
    const checkboxes = [...group.querySelectorAll('input[type="checkbox"]')].filter(visible);
    return { input, checkbox: checkboxes.length === 1 ? checkboxes[0] : null };
  }
  function findLinksControl(dialog) {
    const matches = [...dialog.querySelectorAll('button,a,[role="tab"],[role="radio"],input[type="checkbox"],input[type="radio"]')].filter(visible)
      .filter(el => [...labels(el), norm(el.textContent)].some(value => ['links','linksearch','linkssearch'].includes(value)));
    return matches.length === 1 ? { control: matches[0] } : { error: matches.length ? 'Multiple Links controls found' : 'Links control not found' };
  }
  async function execute(ids, options = {}) {
    const Adapter = root.PickerManualMatchAdapter;
    const value = ids.join(',');
    if (!ids.length || ids.length > 5 || ids.some(id => !/^\d+$/.test(id))) return { status:'incomplete',diagnostic:'No valid top TD IDs available',value };
    const dialog = Adapter.findDialog();
    if (!dialog) return { status:'incomplete',diagnostic:'Manual Match dialog not open for Links search',value };
    const snapshot = Adapter.captureFields(options.profile);
    let mode = null, modeChecked, field = null, previousValue, previousChecked;
    const priorTd = findTdField(dialog);
    const priorTdValue = priorTd.input?.value;
    const priorTdChecked = priorTd.checkbox?.checked;
    const current = () => !options.signal?.aborted && (!options.isCurrent || options.isCurrent()) && Adapter.findDialog() === dialog;
    try {
      const foundMode = findLinksControl(dialog);
      if (foundMode.error) return { status:'incomplete',diagnostic:foundMode.error,value };
      mode = foundMode.control;
      modeChecked = typeof mode.checked === 'boolean' ? mode.checked : undefined;
      if (!current()) return {status:'incomplete',diagnostic:'Links search cancelled',value};
      if (modeChecked !== true && mode.getAttribute('aria-selected') !== 'true' && mode.getAttribute('aria-checked') !== 'true') mode.click();
      const deadline = Date.now() + (options.discoveryTimeoutMs || 5000);
      let found;
      do {
        if (!current()) return {status:'incomplete',diagnostic:'Links search cancelled or source changed',value};
        found = findTdField(dialog);
        if (found.input || /Multiple/.test(found.error)) break;
        await new Promise(resolve => setTimeout(resolve,100));
      } while (Date.now() < deadline);
      if (found.error) return {status:'incomplete',diagnostic:found.error,value};
      field = found; previousValue = field.input === priorTd.input ? priorTdValue : field.input.value; previousChecked = field.checkbox === priorTd.checkbox ? priorTdChecked : field.checkbox?.checked;
      // Isolate the final query while retaining the user's original filter values.
      snapshot?.fields.forEach(({checkbox}) => {if(checkbox?.checked && checkbox !== mode && checkbox !== field.checkbox)checkbox.click();});
      snapshot?.fields.forEach(({input,value:original}) => {if(input && input !== field.input && input.value !== original)Adapter.setInputValue(input,original);});
      if (field.checkbox && !field.checkbox.checked) field.checkbox.click();
      Adapter.setInputValue(field.input,value);
      if (field.input.value !== value) return {status:'incomplete',diagnostic:'TD list was not accepted by Links search',value};
      const searches = [...dialog.querySelectorAll('button,input[type="submit"],[role="button"]')].filter(visible)
        .filter(el => !el.disabled && ['search','searchlinks','linkssearch'].includes(norm(el.getAttribute('aria-label') || el.textContent || el.value)));
      if (searches.length !== 1) return {status:'incomplete',diagnostic:searches.length?'Multiple Search buttons found in Links search':'Links Search button not found',value};
      if (!current()) return {status:'incomplete',diagnostic:'Links search cancelled or source changed',value};
      const result = await Adapter.submitAndWait(dialog,searches[0],options);
      return {...result,value,tdIds:[...ids]};
    } catch (error) {
      return {status:'incomplete',diagnostic:`Links search failed: ${error.message}`,value};
    } finally {
      const sameSource = !snapshot?.identity || Adapter.captureFields(options.profile)?.identity === snapshot.identity;
      if (sameSource && Adapter.findDialog() === dialog) {
        if(field?.checkbox?.isConnected && field.checkbox.checked !== previousChecked)field.checkbox.click();
        if(mode?.isConnected && modeChecked !== undefined && mode.checked !== modeChecked)mode.click();
        Adapter.restoreFields(snapshot);
        if(field?.input?.isConnected && field.input.value !== previousValue)Adapter.setInputValue(field.input,previousValue);
      }
    }
  }
  root.PickerBookmarkLinks = { findTdField, findLinksControl, execute };
})(typeof globalThis !== 'undefined' ? globalThis : this);
