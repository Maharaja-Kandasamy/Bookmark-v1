(function (root) {
  const STORAGE_KEY = 'picker-bookmark-v1-recovery';
  const INPUT_JOBS_URL = 'https://gsrs-prod.azure-gsrs-p.nielsencsp.net/#/InputMMJobs';
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const key = value => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  const visible = element => {
    if (!element || !element.getClientRects?.().length) return false;
    const view = element.ownerDocument?.defaultView;
    for (let node = element; node?.nodeType === 1; node = node.parentElement) {
      if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
      const style = view?.getComputedStyle?.(node);
      if (style && (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0)) return false;
    }
    return true;
  };
  const setValue = (input, value) => {
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  function clickLikeUser(element, win) {
    if (!element?.isConnected || element.disabled) return false;
    const rect = element.getBoundingClientRect();
    const point = { bubbles: true, cancelable: true, view: win, button: 0, buttons: 1,
      clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    element.focus?.();
    try { if (win.PointerEvent) element.dispatchEvent(new win.PointerEvent('pointerdown', { ...point, pointerId: 1, pointerType: 'mouse', isPrimary: true })); } catch {}
    element.dispatchEvent(new win.MouseEvent('mousedown', point));
    try { if (win.PointerEvent) element.dispatchEvent(new win.PointerEvent('pointerup', { ...point, buttons: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true })); } catch {}
    element.dispatchEvent(new win.MouseEvent('mouseup', { ...point, buttons: 0 }));
    element.dispatchEvent(new win.MouseEvent('click', { ...point, buttons: 0 }));
    return true;
  }
  function invokeReactClick(button, win) {
    if (!button?.isConnected) return false;
    const icon = button.querySelector('svg[data-testid^="action-button-"]');
    const candidates = [button, button.querySelector('.MuiIconButton-label'), icon].filter(Boolean);
    for (const element of candidates) {
      const propertyKey = Object.keys(element).find(name => name.startsWith('__reactProps$') || name.startsWith('__reactEventHandlers$'));
      const handler = propertyKey && element[propertyKey]?.onClick;
      if (typeof handler !== 'function') continue;
      const nativeEvent = new win.MouseEvent('click', { bubbles: true, cancelable: true, view: win, button: 0 });
      const event = {
        type: 'click', target: icon || button, currentTarget: button, nativeEvent, button: 0, buttons: 0,
        preventDefault() { nativeEvent.preventDefault(); },
        stopPropagation() { nativeEvent.stopPropagation(); },
        persist() {},
      };
      try { handler(event); return true; } catch {}
    }
    return false;
  }
  function capture(doc, win) {
    const manual = [...doc.querySelectorAll('[data-testid="manual-match"]')].find(visible);
    const filter = (manual && [...manual.querySelectorAll('#matchFilter')].find(visible)) || [...doc.querySelectorAll('#matchFilter')].find(visible);
    const scope = doc.querySelector('.modal-content-cls') || doc.body;
    const text = clean(scope?.innerText || scope?.textContent);
    const batchId = clean(text.match(/Batch\s*Id\s*:\s*([\w-]+)/i)?.[1] || doc.querySelector('#batchId')?.value);
    const filterName = clean(filter?.value);
    return { batchId, filterName, noFilter: !filterName, filterCaptured: !!filter, capturedAt: Date.now(), sourceUrl: win.location.href };
  }
  function create({ document: doc, window: win }) {
    const current = capture(doc, win);
    let previous = {};
    try { previous = JSON.parse(win.sessionStorage.getItem(STORAGE_KEY) || '{}'); } catch {}
    const context = {
      ...current,
      batchId: current.batchId || previous.batchId || '',
      filterName: current.filterCaptured ? current.filterName : (previous.filterName || ''),
      noFilter: current.filterCaptured ? !current.filterName : (previous.noFilter ?? true),
      filterCaptured: current.filterCaptured || !!previous.filterCaptured,
    };
    try { win.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context)); } catch {}
    let timer = 0, stopped = false, stage = 'start', startedAt = 0, stableAt = 0, lastSignature = '', actionButton = null, actionAttempts = 0, reactClickTried = false, menuItemsBefore = new WeakSet(), overlaysBefore = new WeakSet(), filterBeforeSignature = '', filterSearchClicked = false;
    const elapsed = () => Date.now() - startedAt;
    const announce = (message, error = false) => { try { onStatus?.(message, error); } catch {} };
    let onStatus = null;
    function fail(message) { stopped = true; clearInterval(timer); announce(message, true); return false; }
    function done(message) { stopped = true; clearInterval(timer); announce(message, false); return true; }
    function routeToJobs() {
      if (!win.location.href.startsWith(INPUT_JOBS_URL.split('#')[0])) return fail('Recovery stopped: this bookmark only works on the GSRS production site.');
      const target = new URL(INPUT_JOBS_URL);
      if (win.location.hash !== target.hash) { stage = 'jobs'; win.location.hash = target.hash; startedAt = Date.now(); announce('Opening Input MM Jobs…'); return; }
      stage = 'batch-search'; startedAt = Date.now();
    }
    function findTableByHeaders(required, scope = doc) {
      return [...scope.querySelectorAll('table')].map(table => {
        const headers = [...table.querySelectorAll('thead th')].map(cell => key(cell.getAttribute('title') || cell.textContent));
        return { table, headers };
      }).find(item => required.every(header => item.headers.some(value => value === key(header) || value.includes(key(header)))));
    }
    function findFilterDialog() {
      const title = [...doc.querySelectorAll('[data-testid="modal-title"]')].find(el => visible(el) && /match\s*filter/i.test(clean(el.innerText)));
      return title?.closest('.modal-content-cls') || title?.closest('[role="dialog"]') || null;
    }
    function filterTableSignature(table) {
      return table ? [...table.querySelectorAll('tbody tr')].map(row => clean(row.innerText)).join('|') : 'missing';
    }
    function snapshotActionPopup() {
      menuItemsBefore = new WeakSet([...doc.querySelectorAll('body *')].filter(el => visible(el) && key(el.innerText) === 'manualmatch'));
      overlaysBefore = new WeakSet([...doc.querySelectorAll('.MuiPopover-root, .MuiMenu-paper, .MuiPaper-root, [role="menu"]')].filter(visible));
    }
    function findNewManualMatchItem() {
      const exact = [...doc.querySelectorAll('body *')].filter(el => visible(el) && key(el.innerText) === 'manualmatch' && !menuItemsBefore.has(el));
      for (const element of exact) {
        const clickable = element.closest('.MuiMenuItem-root, [role="menuitem"], li, button, [role="button"], [tabindex="0"]') || element;
        if (visible(clickable) && key(clickable.innerText) === 'manualmatch') return clickable;
      }
      return null;
    }
    function findManualMatchInPopup() {
      const roots = [...doc.querySelectorAll('.MuiPopover-root, .MuiMenu-paper, .MuiPaper-root, .MuiPopper-root, [role="menu"], [role="listbox"]')].filter(visible);
      for (const root of roots) {
        const exact = [...root.querySelectorAll('*')].filter(el => visible(el) && key(el.innerText) === 'manualmatch');
        for (const element of exact) {
          const clickable = element.closest('.MuiMenuItem-root, [role="menuitem"], li, button, [role="button"], [tabindex="0"]') || element;
          if (root.contains(clickable) && visible(clickable) && key(clickable.innerText) === 'manualmatch') return clickable;
        }
      }
      return null;
    }
    function actionPopupOpen() {
      return [...doc.querySelectorAll('.MuiPopover-root, .MuiMenu-paper, .MuiPaper-root, [role="menu"]')]
        .some(el => visible(el) && !overlaysBefore.has(el));
    }
    function tick() {
      if (stopped) return;
      try {
        if (stage === 'start') {
          if (!context.batchId) return fail('Recovery could not find a Batch ID from when Picker launched. Reopen Picker on the Manual Match screen and try again.');
          if (!context.filterCaptured) return fail('Recovery could not read the Match Filter setting from when Picker launched. Reopen Picker on the Manual Match screen and try again.');
          routeToJobs(); return;
        }
        if (elapsed() > 120000) return fail('GSRS took too long to respond. Wait for the page to finish, then start recovery again.');
        if (stage === 'jobs') {
          if (win.location.hash !== '#/InputMMJobs') return;
          stage = 'batch-search'; startedAt = Date.now();
        }
        if (stage === 'batch-search') {
          const input = doc.querySelector('input#batchId, input[data-testid="batchid"]');
          if (!input || !visible(input)) return;
          const search = doc.querySelector('[data-testid="search-button"]');
          if (!search) return;
          if (input.value !== context.batchId) setValue(input, context.batchId);
          search.click();
          stage = 'batch-results'; startedAt = Date.now(); stableAt = 0; lastSignature = '';
          announce(`Searching for Batch ID ${context.batchId}…`); return;
        }
        if (stage === 'batch-results') {
          const tableRoot = doc.querySelector('[data-testid="inputjobs-densetable"]') || doc;
          const found = findTableByHeaders(['Batch ID'], tableRoot);
          if (!found) return;
          if (found.table.querySelector('[aria-busy="true"], [role="progressbar"], .MuiCircularProgress-root') || elapsed() < 1800) return;
          const batchIndex = found.headers.findIndex(value => value.includes('batchid'));
          const rows = [...found.table.querySelectorAll('tbody tr')].filter(row => clean(row.children[batchIndex]?.innerText) === context.batchId);
          const signature = `${rows.length}:${rows.map(row => clean(row.innerText)).join('|')}`;
          if (signature !== lastSignature) { lastSignature = signature; stableAt = Date.now(); return; }
          if (!stableAt || Date.now() - stableAt < 1200) return;
          if (rows.length !== 1) return fail(`Recovery found ${rows.length} rows for Batch ID ${context.batchId}. It needs exactly one matching batch.`);
          const row = rows[0];
          const actionIcon = row.querySelector('svg[data-testid^="action-button-"]');
          actionButton = actionIcon?.closest('button[type="button"]') || actionIcon?.parentElement?.closest('button') || row.querySelector('button[aria-label*="Action"], button[title*="Action"]');
          if (!actionButton) return fail('The matching batch row has no Action menu.');
          actionAttempts = 1;
          reactClickTried = false;
          snapshotActionPopup();
          actionButton.scrollIntoView?.({ block: 'center', inline: 'center' });
          clickLikeUser(actionButton, win); stage = 'batch-menu'; startedAt = Date.now(); announce('Found the batch row button. Clicking its three dots…'); return;
        }
        if (stage === 'batch-menu') {
          const menuItem = findManualMatchInPopup() || findNewManualMatchItem();
          if (!menuItem) {
            const popupOpen = actionPopupOpen();
            if (!popupOpen && Date.now() - startedAt > 1800 && actionAttempts < 3 && actionButton?.isConnected) {
              actionAttempts++;
              if (!reactClickTried) {
                reactClickTried = true;
                if (invokeReactClick(actionButton, win)) { startedAt = Date.now(); announce('Asking the GSRS row button to open its Action menu…'); return; }
              }
              snapshotActionPopup();
              clickLikeUser(actionButton, win); startedAt = Date.now(); announce(`The three-dot button did not open its menu; retrying (${actionAttempts}/3)…`);
            } else if (popupOpen && Date.now() - startedAt > 6000) return fail('The Action popup opened, but its Manual Match option could not be identified.');
            else if (!popupOpen && Date.now() - startedAt > 6000) return fail('The batch is found, but GSRS is not opening the row Action menu. The bookmark cannot continue until that menu opens.');
            return;
          }
          clickLikeUser(menuItem, win); stage = 'manual-screen'; startedAt = Date.now(); announce('Selecting Manual Match from the open Action popup…'); return;
        }
        if (stage === 'manual-screen') {
          const manual = [...doc.querySelectorAll('[data-testid="manual-match"]')].find(visible);
          if (!manual) return;
          const filter = [...manual.querySelectorAll('#matchFilter')].find(visible);
          if (!filter) return;
          if (context.noFilter) {
            if (clean(filter.value)) return fail('The Manual Match screen has a selected filter, but Picker launched with no filter selected.');
            return done(`Recovered Batch ID ${context.batchId}. Manual Match is open with no filter selected.`);
          }
          if (clean(filter.value) === context.filterName) return done(`Recovered Batch ID ${context.batchId} and restored filter ${context.filterName}.`);
          filter.click(); stage = 'filter-dialog'; startedAt = Date.now(); announce(`Finding Match Filter ${context.filterName}…`); return;
        }
        if (stage === 'filter-dialog') {
          const modal = findFilterDialog();
          if (!modal) return;
          const labels = [...modal.querySelectorAll('label')];
          const nameLabel = labels.find(label => clean(label.textContent).toLowerCase() === 'filter name');
          const nameInput = nameLabel?.parentElement?.querySelector('input') || nameLabel?.closest('.MuiFormControl-root')?.querySelector('input');
          const search = [...modal.querySelectorAll('button')].find(button => clean(button.getAttribute('title')).toLowerCase() === 'search');
          if (!nameInput || !search) return;
          const table = findTableByHeaders(['Filter ID', 'Filter Name'], modal)?.table;
          filterBeforeSignature = filterTableSignature(table);
          filterSearchClicked = false;
          setValue(nameInput, context.filterName);
          if (clean(nameInput.value) !== context.filterName) return fail('GSRS did not accept the saved filter name in the Filter Name search field.');
          ['keydown', 'keypress', 'keyup'].forEach(type => nameInput.dispatchEvent(new win.KeyboardEvent(type, { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })));
          stage = 'filter-results'; startedAt = Date.now(); stableAt = 0; lastSignature = filterBeforeSignature; announce(`Searching filters for “${context.filterName}”…`); return;
        }
        if (stage === 'filter-results') {
          const modal = findFilterDialog();
          if (!modal) return;
          const table = modal && findTableByHeaders(['Filter ID', 'Filter Name'], modal)?.table;
          if (!table) return;
          const currentSignature = filterTableSignature(table);
          if (!filterSearchClicked && currentSignature === filterBeforeSignature && elapsed() > 1000) {
            const search = [...modal.querySelectorAll('button')].find(button => clean(button.getAttribute('title')).toLowerCase() === 'search');
            if (search) {
              filterSearchClicked = true; search.click(); startedAt = Date.now(); stableAt = 0; lastSignature = currentSignature;
              announce('Submitting the filter name search…'); return;
            }
          }
          if (table.querySelector('[aria-busy="true"], [role="progressbar"], .MuiCircularProgress-root') || elapsed() < 1800) return;
          const headers = [...table.querySelectorAll('thead th')].map(cell => key(cell.getAttribute('title') || cell.textContent));
          const nameIndex = headers.findIndex(value => value.includes('filtername'));
          const rows = [...table.querySelectorAll('tbody tr')].filter(row => clean(row.children[nameIndex]?.innerText) === context.filterName);
          const signature = `${rows.length}:${currentSignature}`;
          if (signature !== lastSignature) { lastSignature = signature; stableAt = Date.now(); return; }
          if (!stableAt || Date.now() - stableAt < 1200) return;
          if (rows.length !== 1) return fail(`Filter search returned ${rows.length} exact matches for “${context.filterName}”. It needs exactly one.`);
          const selection = rows[0].querySelector('input[type="radio"],input[type="checkbox"]');
          announce(`Found the filter “${context.filterName}”. Selecting it…`);
          if (selection) clickLikeUser(selection, win); else clickLikeUser(rows[0], win);
          stage = 'filter-accept'; startedAt = Date.now(); return;
        }
        if (stage === 'filter-accept') {
          const modal = findFilterDialog();
          if (!modal) { stage = 'filter-applied'; startedAt = Date.now(); return; }
          const ok = modal.querySelector('[data-testid="ok-button"]');
          if (ok && !ok.disabled) {
            clickLikeUser(ok, win); stage = 'filter-applied'; startedAt = Date.now(); announce('Confirming the selected filter…'); return;
          }
          if (elapsed() > 15000) return fail('The filter row was found, but GSRS did not enable OK after selection.');
          return;
        }
        if (stage === 'filter-applied') {
          const filter = [...(doc.querySelector('[data-testid="manual-match"]')?.querySelectorAll('#matchFilter') || [])].find(visible);
          if (filter && clean(filter.value) === context.filterName) return done(`Recovered Batch ID ${context.batchId} and restored filter ${context.filterName}.`);
        }
      } catch (error) { fail(`Recovery stopped safely: ${clean(error?.message) || 'GSRS changed during recovery'}`); }
    }
    function recover(statusCallback) {
      if (stopped) { stage = 'start'; stopped = false; }
      onStatus = statusCallback;
      startedAt = Date.now();
      timer = win.setInterval(tick, 400);
      tick();
      return { cancel() { stopped = true; win.clearInterval(timer); } };
    }
    return { context, recover };
  }
  root.PickerBookmarkRecovery = { create, capture };
})(typeof globalThis !== 'undefined' ? globalThis : this);
