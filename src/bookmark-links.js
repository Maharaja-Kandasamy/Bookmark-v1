(function(root) {
  const norm = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const visible = element => !!element?.getClientRects().length && !element.closest('[hidden],[aria-hidden="true"]');
  const fieldSelector = 'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]),textarea';
  function fieldGroup(input) {
    return input.closest('.horizontalPanelMM,.form-group,[role="group"],.MuiGrid-container') || input.parentElement;
  }
  function labels(element) {
    const doc = element.ownerDocument;
    const group = fieldGroup(element);
    // GSRS repeats each ID on the checkbox and text input, so input.labels can be empty.
    const nearby = group && group.querySelectorAll(fieldSelector).length === 1
      ? [...group.querySelectorAll('label,[title],.MuiFormLabel-root')].map(label => label.getAttribute('title') || label.textContent) : [];
    return [element.getAttribute('aria-label'), element.getAttribute('placeholder'), element.getAttribute('name'), element.getAttribute('id'),
      ...(element.labels ? [...element.labels].map(label => label.textContent) : []), ...nearby,
      ...(element.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => doc.getElementById(id)?.textContent)
    ].filter(Boolean).map(norm);
  }
  function findTdField(dialog) {
    const aliases = ['tdlinxstorecode','td','tds','tdlinxnumber','tdlinxnumbers','tdid','tdids','tdnumber','tdnumbers','tdlinx','tdlinxid','tdlinxids','linkstd','tdlinks'];
    const candidates = [...dialog.querySelectorAll(fieldSelector)].filter(visible).map(input => ({input,labels:labels(input).map(label => label.replace(/(?:textfield|input)$/,''))}));
    const exact = candidates.filter(item => item.labels.includes('tdlinxstorecode'));
    const matches = exact.length ? exact : candidates.filter(item => item.labels.some(label => aliases.includes(label)));
    if (matches.length !== 1) return {error:matches.length?'Multiple TDLINX_STORE_CODE fields found':'TDLINX_STORE_CODE field not found'};
    const input = matches[0].input;
    const checkboxes = [...fieldGroup(input).querySelectorAll('input[type="checkbox"]')].filter(visible);
    return {input,checkbox:checkboxes.length === 1 ? checkboxes[0] : null};
  }
  async function execute(ids, options = {}) {
    const Adapter = root.PickerManualMatchAdapter;
    const value = ids.join(',');
    if (!ids.length || ids.length > 5 || ids.some(id => !/^\d+$/.test(id))) return {status:'incomplete',diagnostic:'No valid top TD IDs available',value};
    const dialog = Adapter.findDialog();
    if (!dialog) return {status:'incomplete',diagnostic:'Manual Match dialog not open for ranked TD search',value};
    const snapshot = Adapter.captureFields(options.profile);
    const current = () => !options.signal?.aborted && (!options.isCurrent || options.isCurrent()) && Adapter.findDialog() === dialog;
    try {
      const field = findTdField(dialog);
      if (field.error) return {status:'incomplete',diagnostic:field.error,value};
      if (!field.checkbox || field.checkbox.disabled) return {status:'incomplete',diagnostic:'TDLINX_STORE_CODE search checkbox not available',value};
      const search = Adapter.findSearchButton(dialog);
      if (search.error) return {status:'incomplete',diagnostic:search.error,value};
      await options.beforeSubmit?.();
      if (!current()) return {status:'incomplete',diagnostic:'Ranked TD search cancelled or source changed',value};
      const cleared = Adapter.clearSearchFilters(snapshot);
      if (!cleared.ok) return {status:'incomplete',diagnostic:cleared.diagnostic,value};
      if (!field.checkbox.checked) field.checkbox.click();
      if (!field.checkbox.checked) return {status:'incomplete',diagnostic:'TDLINX_STORE_CODE checkbox did not stay selected',value};
      Adapter.setInputValue(field.input,value);
      if (field.input.value !== value) return {status:'incomplete',diagnostic:'TD list was not accepted by TDLINX_STORE_CODE',value};
      if (!current()) return {status:'incomplete',diagnostic:'Ranked TD search cancelled or source changed',value};
      const result = await Adapter.submitAndWait(dialog,search.button,options);
      return {...result,value,tdIds:[...ids]};
    } catch (error) {
      return {status:'incomplete',diagnostic:`Ranked TD search failed: ${error.message}`,value};
    } finally {
      if (!options.isCurrent || options.isCurrent()) Adapter.restoreFields(snapshot);
    }
  }
  root.PickerBookmarkLinks = {findTdField,execute};
})(typeof globalThis !== 'undefined' ? globalThis : this);
