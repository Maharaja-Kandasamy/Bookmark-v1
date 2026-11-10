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
    let searchSession = null;
    let extraction = null;
    let destroyed = false;
    let revision = 0;
    let completionAborter = null;
    let paused = false;
    let continueResolve = null;
    const queryTimeoutMs = 120000, stableMs = 1500, safetyDelayMs = 900;
    const waitBeforeFinalSearch = signal => new Promise(resolve => {
      if(signal.aborted){resolve(false);return;}
      const finish = ready => {clearTimeout(timer);signal.removeEventListener('abort',onAbort);resolve(ready);};
      const onAbort = () => finish(false);
      const timer = setTimeout(() => finish(true),safetyDelayMs);
      signal.addEventListener('abort',onAbort,{once:true});
    });
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
      if (destroyed || navigation) return;
      const found = readSource(false);
      if (found.error) {
        if (extraction || store.get()?.source) scan(found);
      } else if (signature(found) !== signature(extraction)) scan();
    }
    // Monitor a record transition only after the user activates Next/Previous Record.
    let navigation = null;
    function stopNavigation() {
      if(!navigation)return;
      navigation.observer?.disconnect();
      win.clearTimeout(navigation.pending);
      win.clearTimeout(navigation.deadline);
      navigation=null;
    }
    function onRecordNavigation(event) {
      const target=event.target?.closest?.('[title="Next Record"],[title="Previous Record"],.forwardIconStyleMM,.backIconStyleMM,[aria-label="Next Record"],[aria-label="Previous Record"]');
      if(!target || target.disabled || target.getAttribute?.('aria-disabled')==='true')return;
      if(!target.closest?.('.modal-content-cls'))return;
      stopNavigation();
      const previous=signature(extraction);
      invalidate();
      store.set({status:'waiting',source:null,results:[],observations:[],plan:[],tdIds:[],linksSearch:null,activeQuery:null,progress:0,total:0,diagnostic:'Waiting for the selected record to load...'});
      const transition={observer:null,pending:null,deadline:null};
      navigation=transition;
      const check=()=>{
        transition.pending=null;
        if(destroyed || navigation!==transition)return;
        const found=readSource(false);
        if(found?.error || signature(found)===previous)return;
        stopNavigation();scan(found);
      };
      if(win.MutationObserver && doc.documentElement){
        transition.observer=new win.MutationObserver(records=>{
          if(navigation!==transition || transition.pending!=null)return;
          const relevant=records.some(record=>{
            const element=record.target.nodeType===1?record.target:record.target.parentElement;
            if(element?.closest?.('[data-testid="manual-match-search-table"],.horizontalPanelMM,#picker-bookmark-v1-host'))return false;
            return !!element?.closest?.('[data-testid="manual-match-table"]') || [...(record.addedNodes || [])].some(node=>node.matches?.('[data-testid="manual-match-table"]') || node.querySelector?.('[data-testid="manual-match-table"]'));
          });
          if(relevant)transition.pending=win.setTimeout(check,100);
        });
        transition.observer.observe(doc.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','aria-selected','data-selected']});
      }
      transition.pending=win.setTimeout(check,100);
      transition.deadline=win.setTimeout(()=>{
        if(navigation!==transition)return;
        stopNavigation();
        store.set({status:'incomplete',source:null,diagnostic:'The next record did not finish loading. Wait for the page, then activate Picker again.'});
      },queryTimeoutMs);
    }
    if(lifecycle.listen && doc.addEventListener)lifecycle.listen(doc,'click',onRecordNavigation,true);
    lifecycle.add?.(stopNavigation);

    function scan(found = readSource()) {
      if (destroyed) return { error: 'bookmark-destroyed' };
      let normalized;
      if(!found?.error){try{normalized=Engine.normalizeSource?Engine.normalizeSource(found.source):{...found.source,zip:Engine.normalizeZip(found.source.zip)};}catch{found={error:'source-read-failed',diagnostic:'The current record could not be prepared. Refresh the Manual screen and retry.'};}}
      invalidate();
      extraction = null;
      if (found?.error) {
        store.set({ status: 'error', diagnostic: found.diagnostic || 'You need to be in the Manual screen to activate me.', diagnosticCode: found.error, source: null, results: [], searchGroup: null, linksSearch: null, tdIds: [], initialCandidates: [], observations: [], plan: [], progress: 0, total: 0, activeQuery: null });
        return found;
      }
      extraction = found;
      store.set({ status: 'ready', profile: found.profile, source: normalized, initialCandidates: found.candidates || [], sourceRowCount: found.sourceRowCount, initialCandidateCount: found.initialCandidateCount, results: [], searchGroup: null, linksSearch: null, tdIds: [], observations: [], plan: [], progress: 0, total: 0, activeQuery: null, diagnostic: '', diagnosticCode: '' });
      return found;
    }

    async function runChecks(group = 'all') {
      if(navigation)return {status:'incomplete',observations:[],diagnostic:'Wait for the selected record to load before searching.'};
      // Existing table rows may belong to a previous search. Start with source data only.
      scan(readSource(false));
      const runRevision = revision;
      const current = store.get();
      if (!current?.source) return { status: 'error', observations: [], diagnostic: current?.diagnostic || 'Source table not found' };
      store.set({searchGroup:group});
      const groups = { banner: ['banner-exact-zip','banner-city','banner-wildcard-zip'], bannerState: ['banner-state'], address: ['address-city','address-state','address-zip','address-door'], phone: ['phone'], store: ['store-banner'] };
      const plan = Engine.createSearchPlan(current.source).filter(query => group === 'all' || groups[group]?.includes(query.type));
      if (!plan.length) {
        const result = { status: 'incomplete', observations: [], progress: 0, total: 0, diagnostic: 'Not enough source data to create searches' };
        store.set(result);
        return result;
      }
      searchSession=Adapter.beginSearchSession?.(current.profile) || null;
      if(searchSession?.ok===false){
        const result={status:'incomplete',observations:[],results:[],activeQuery:null,diagnostic:searchSession.diagnostic};
        store.set(result);return result;
      }
      runner = Runner.createRunController({
        adapter: (query, runOptions) => Adapter.execute(query, { ...runOptions, session:searchSession, timeoutMs: queryTimeoutMs, stableMs, profile: current.profile, isCurrent:() => { refresh(); return !destroyed && revision === runRevision; } }),
        onState: state => { if (!destroyed && runRevision === revision) store.set(state.status === 'completed' ? {...state,status:'running'} : state); },
        queryTimeoutMs,
        runTimeoutMs: plan.length * queryTimeoutMs + Math.max(0,plan.length-1) * safetyDelayMs + 5000,
        safetyDelayMs,
        stopOnIncomplete: true
      });
      const runResult = await runner.start(plan);
      refresh();
      if (destroyed || runRevision !== revision) return { status: 'cancelled', observations: [], results: [] };
      const currentQueryIds = new Set(plan.map(query => query.id));
      const searched = (runResult.observations || [])
        .filter(observation => observation.status === 'complete' && currentQueryIds.has(observation.queryId))
        .flatMap(observation => (observation.rows || []).map(candidate => ({ queryId: observation.queryId, candidate })));
      const results = Engine.consolidateCandidates(current.source, searched);
      const tdIds = group === 'all' && Engine.getTopTdIds ? Engine.getTopTdIds(results) : [];
      let linksSearch = null;
      if (group === 'all' && runResult.status === 'completed' && tdIds.length) {
        const aborter = new AbortController();
        completionAborter = aborter;
        store.set({status:'waiting',results,tdIds,activeQuery:{type:'links',label:`Reviewing links for the top ${tdIds.length} matches...`},progress:plan.length,total:plan.length+1});
        try {
          if(await waitBeforeFinalSearch(aborter.signal)){
            linksSearch = await root.PickerBookmarkLinks.execute(tdIds,{profile:current.profile,session:searchSession,signal:aborter.signal,timeoutMs:queryTimeoutMs,stableMs,beforeSubmit:waitForContinue,
              isCurrent:() => { refresh(); return !destroyed && revision === runRevision; }});
          }else linksSearch = {status:'cancelled',diagnostic:'Search stopped before the final TD request'};
          await waitForContinue();
        } finally { if(completionAborter === aborter)completionAborter = null; }
        if (aborter.signal.aborted && linksSearch) linksSearch = {...linksSearch,status:'cancelled'};
        refresh();
        if (destroyed || runRevision !== revision) return {status:'cancelled',observations:[],results:[]};
      }
      const linksIncomplete = linksSearch && linksSearch.status !== 'complete';
      const result = { ...runResult, searchGroup:group, plan, results, linksSearch, tdIds, activeQuery: null,
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
      let completedResult;
      try {
        const pending=runChecks(group);
        runRevision=revision;
        completedResult=await pending;return completedResult;
      } catch (error) {
        completionAborter?.abort(); runner?.cancel?.();
        if(destroyed || revision!==runRevision)return {status:'cancelled',observations:[],results:[]};
        const current=store.get() || {};
        const message=String(error?.message || 'Unexpected search failure').split(/[\r\n]/)[0].slice(0,180);
        const result={status:'incomplete',observations:current.observations || [],results:current.results || [],activeQuery:null,diagnostic:`Search stopped safely: ${message}. Retry the search.`};
        completedResult=result;store.set(result); return result;
      } finally {
        let restored;
        try{restored=Adapter.endSearchSession?.(searchSession);}catch{restored={ok:false,diagnostic:'Some previous search fields could not be restored. Review the form.'};}
        searchSession=null;
        if(restored?.ok===false && !destroyed && revision===runRevision){
          const patch={status:'incomplete',activeQuery:null,diagnostic:restored.diagnostic};
          if(completedResult)Object.assign(completedResult,patch);
          store.set(patch);
        }
        clearPause();runner=null;completionAborter=null;runBusy=false;
      }
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
