(function (root) {
  function create(options) {
    const doc = options.document;
    const win = options.window;
    const store = options.store;
    const lifecycle = options.lifecycle;
    const Engine = root.PickerDuplicateEngine;
    const Gsrs = root.PickerGsrsTableAdapter;
    const Adapter = root.PickerManualMatchAdapter;
    const Runner = root.PickerRunController;
    let runner = null;
    let runBusy = false;
    let extraction = null;
    let destroyed = false;
    let revision = 0;
    let completionAborter = null;
    let paused = false;
    let continueResolve = null;
    const waitForContinue = () => paused ? new Promise(resolve => { continueResolve = resolve; }) : Promise.resolve();
    function clearPause() { paused = false; continueResolve?.(); continueResolve = null; }
    const signature = found => JSON.stringify([found?.profile, found?.source || null]);
    function invalidate() {
      revision++;
      clearPause();
      completionAborter?.abort();
      runner?.cancel?.();
      runner = null;
    }
    function readSource(includeCandidates = true) {
      try {
        const profile = extraction?.profile || 'storeView';
        let found = Gsrs.extractFromDocument(doc,profile,{includeCandidates});
        if (found?.error === 'profile-mismatch') found = Gsrs.extractFromDocument(doc,found.detectedProfile || (profile==='storeView'?'retailSync':'storeView'),{includeCandidates});
        return found?.error || found?.source ? found : {error:'source-read-failed',diagnostic:'The current record is incomplete. Refresh the Manual screen and retry.'};
      } catch { return {error:'source-read-failed',diagnostic:'The current record could not be read. Refresh the Manual screen and retry.'}; }
    }
    function refresh() {
      if (destroyed) return;
      const found = readSource(false);
      if (found.error) {
        if (extraction || store.get()?.source) scan(found);
      } else if (signature(found) !== signature(extraction)) scan();
    }
    // Ignore result/filter animation updates; source edits and record selection remain immediate.
    if (win.MutationObserver && doc.documentElement && lifecycle.observe) {
      let pending = null;
      const ignored = '[data-testid="manual-match-search-table"],.horizontalPanelMM,#picker-bookmark-v1-host';
      const observer = new win.MutationObserver(records => {
        const relevant = records.some(record => {
          const element = record.target.nodeType===1?record.target:record.target.parentElement;
          if (element?.closest?.(ignored)) return false;
          if (record.type==='attributes' || record.type==='characterData') return !!element?.closest?.('[data-testid="manual-match-table"]');
          return true;
        });
        if (!relevant || pending != null) return;
        pending = win.setTimeout(() => { pending=null; refresh(); },100);
      });
      lifecycle.observe(observer,doc.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','aria-selected','data-selected']});
      lifecycle.add(() => win.clearTimeout(pending));
    }
    if (win.setInterval && lifecycle.add) {
      const timer = win.setInterval(() => {if(!doc.hidden)refresh();},2500);
      lifecycle.add(() => win.clearInterval(timer));
    }

    function scan(found = readSource()) {
      if (destroyed) return { error: 'bookmark-destroyed' };
      let normalized;
      if(!found?.error){try{normalized=Engine.normalizeSource?Engine.normalizeSource(found.source):{...found.source,zip:Engine.normalizeZip(found.source.zip)};}catch{found={error:'source-read-failed',diagnostic:'The current record could not be prepared. Refresh the Manual screen and retry.'};}}
      invalidate();
      extraction = null;
      if (found?.error) {
        store.set({ status: 'error', diagnostic: found.diagnostic || 'You need to be in the Manual screen to activate me.', diagnosticCode: found.error, source: null, results: [], linksSearch: null, tdIds: [], initialCandidates: [], observations: [], plan: [], progress: 0, total: 0, activeQuery: null });
        return found;
      }
      extraction = found;
      store.set({ status: 'ready', profile: found.profile, source: normalized, initialCandidates: found.candidates || [], sourceRowCount: found.sourceRowCount, initialCandidateCount: found.initialCandidateCount, results: [], linksSearch: null, tdIds: [], observations: [], plan: [], progress: 0, total: 0, activeQuery: null, diagnostic: '', diagnosticCode: '' });
      return found;
    }

    async function runChecks(group = 'all') {
      scan();
      const runRevision = revision;
      const current = store.get();
      if (!current?.source) return { status: 'error', observations: [], diagnostic: current?.diagnostic || 'Source table not found' };
      const groups = { banner: ['banner-exact-zip','banner-wildcard-zip'], bannerState: ['banner-state'], address: ['address-city','address-zip'], phone: ['phone'], store: ['store-banner'] };
      const plan = Engine.createSearchPlan(current.source).filter(query => group === 'all' || groups[group]?.includes(query.type));
      if (!plan.length) {
        const result = { status: 'incomplete', observations: [], progress: 0, total: 0, diagnostic: 'Not enough source data to create searches' };
        store.set(result);
        return result;
      }
      runner = Runner.createRunController({
        adapter: (query, runOptions) => Adapter.execute(query, { ...runOptions, timeoutMs: 30000, stableMs: 600, profile: current.profile, isCurrent:() => { refresh(); return !destroyed && revision === runRevision; } }),
        onState: state => { if (!destroyed && runRevision === revision) store.set(state.status === 'completed' ? {...state,status:'running'} : state); },
        queryTimeoutMs: 30000,
        runTimeoutMs: 180000,
        safetyDelayMs: 150
      });
      const runResult = await runner.start(plan);
      refresh();
      if (destroyed || runRevision !== revision) return { status: 'cancelled', observations: [], results: [] };
      const initial = (current.initialCandidates || []).map(candidate => ({ queryId: 'initial-table', candidate }));
      const searched = (runResult.observations || []).flatMap(observation => (observation.rows || []).map(candidate => ({ queryId: observation.queryId, candidate })));
      const results = Engine.consolidateCandidates(current.source, [...initial, ...searched]);
      const tdIds = Engine.getTopTdIds ? Engine.getTopTdIds(results) : [];
      let linksSearch = null;
      if (runResult.status === 'completed' && tdIds.length) {
        const aborter = new AbortController();
        completionAborter = aborter;
        store.set({status:'waiting',results,tdIds,activeQuery:{type:'links',label:`Reviewing links for the top ${tdIds.length} matches...`},progress:plan.length,total:plan.length+1});
        try {
          linksSearch = await root.PickerBookmarkLinks.execute(tdIds,{profile:current.profile,signal:aborter.signal,timeoutMs:30000,stableMs:600,beforeSubmit:waitForContinue,
            isCurrent:() => { refresh(); return !destroyed && revision === runRevision; }});
          await waitForContinue();
        } finally { if(completionAborter === aborter)completionAborter = null; }
        if (aborter.signal.aborted && linksSearch) linksSearch = {...linksSearch,status:'cancelled'};
        refresh();
        if (destroyed || runRevision !== revision) return {status:'cancelled',observations:[],results:[]};
      }
      const linksIncomplete = linksSearch && linksSearch.status !== 'complete';
      const result = { ...runResult, plan, results, linksSearch, tdIds, activeQuery: null,
        ...(linksSearch ? {status:linksSearch.status==='cancelled'?'cancelled':linksIncomplete?'incomplete':'completed',progress:plan.length+(linksIncomplete?0:1),total:plan.length+1,
          diagnostic:linksIncomplete ? `Ranked results saved. Final Links search incomplete: ${linksSearch.diagnostic || 'Search did not finish'}. TDs: ${tdIds.join(',')}` : `Top ${tdIds.length} TDs searched in Links: ${tdIds.join(',')}`} : {}) };
      store.set(result);
      runner = null;
      return result;
    }

    async function run(group = 'all') {
      if (destroyed) return {status:'cancelled',observations:[],results:[]};
      if (runBusy) return {status:'busy',diagnostic:'A search is already running. Use Pause or Stop before starting another.'};
      runBusy=true;
      let runRevision=revision;
      try {
        const pending=runChecks(group);
        runRevision=revision;
        return await pending;
      } catch (error) {
        completionAborter?.abort(); runner?.cancel?.();
        if(destroyed || revision!==runRevision)return {status:'cancelled',observations:[],results:[]};
        const current=store.get() || {};
        const message=String(error?.message || 'Unexpected search failure').split(/[\r\n]/)[0].slice(0,180);
        const result={status:'incomplete',observations:current.observations || [],results:current.results || [],activeQuery:null,diagnostic:`Search stopped safely: ${message}. Retry the search.`};
        store.set(result); return result;
      } finally { clearPause(); runner=null; completionAborter=null; runBusy=false; }
    }

    function cancel() { clearPause(); runner?.cancel?.(); completionAborter?.abort(); }
    function pause() { if (!runner?.isActive?.() && !completionAborter) return; paused = true; runner?.pause?.(); store.set({status:'paused'}); }
    function resume() { if (!paused) return; clearPause(); runner?.resume?.(); store.set({status:completionAborter?'waiting':'running'}); }
    function openExternal(url) {
      try { return !!win.open(url, '_blank', 'noopener,noreferrer'); } catch { return false; }
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      clearPause();
      completionAborter?.abort();
      runner?.cancel?.();
      runner = null;
      lifecycle.dispose();
      store.destroy();
    }
    return { scan, refresh, run, pause, resume, cancel, openExternal, destroy };
  }
  root.PickerBookmarkController = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
