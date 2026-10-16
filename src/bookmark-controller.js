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
    let extraction = null;
    let destroyed = false;
    let revision = 0;
    const signature = found => JSON.stringify([found?.profile, found?.source || null]);
    function invalidate() {
      revision++;
      runner?.cancel?.();
      runner = null;
    }
    function refresh() {
      if (destroyed) return;
      let found = Gsrs.extractFromDocument(doc, 'storeView');
      if (found?.error === 'profile-mismatch' || found?.detectedProfile === 'retailSync') found = Gsrs.extractFromDocument(doc, 'retailSync');
      if (found?.error) {
        if (extraction || store.get()?.source) scan();
      } else if (signature(found) !== signature(extraction)) scan();
    }
    // Observe only the page DOM: the bot renders in its own shadow root.
    if (win.MutationObserver && doc.documentElement && lifecycle.observe) {
      let pending = null;
      const observer = new win.MutationObserver(() => {
        win.clearTimeout(pending);
        pending = win.setTimeout(refresh, 100);
      });
      lifecycle.observe(observer, doc.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
      lifecycle.add(() => win.clearTimeout(pending));
    }
    if (win.setInterval && lifecycle.add) {
      const timer = win.setInterval(refresh, 750);
      lifecycle.add(() => win.clearInterval(timer));
    }

    function scan() {
      if (destroyed) return { error: 'bookmark-destroyed' };
      let found = Gsrs.extractFromDocument(doc, 'storeView');
      if (found?.error === 'profile-mismatch' || found?.detectedProfile === 'retailSync') found = Gsrs.extractFromDocument(doc, 'retailSync');
      invalidate();
      extraction = null;
      if (found?.error) {
        store.set({ status: 'error', diagnostic: 'You need to be in the Manual screen to activate me.', diagnosticCode: found.error, source: null, results: [], initialCandidates: [], observations: [], plan: [], progress: 0, total: 0, activeQuery: null });
        return found;
      }
      extraction = found;
      store.set({ status: 'ready', profile: found.profile, source: found.source, initialCandidates: found.candidates || [], sourceRowCount: found.sourceRowCount, initialCandidateCount: found.initialCandidateCount, results: [], observations: [], plan: [], progress: 0, total: 0, activeQuery: null, diagnostic: '', diagnosticCode: '' });
      return found;
    }

    async function run(group = 'all') {
      if (destroyed) throw new Error('Bookmark was closed');
      if (runner?.isActive?.()) throw new Error('A duplicate check is already active');
      scan();
      const runRevision = revision;
      const current = store.get();
      if (!current?.source) return { status: 'error', observations: [], diagnostic: current?.diagnostic || 'Source table not found' };
      const groups = { banner: ['banner-exact-zip','banner-wildcard-zip'], address: ['address-city','address-zip'], phone: ['phone'], store: ['store-banner'] };
      const plan = Engine.createSearchPlan(current.source).filter(query => group === 'all' || groups[group]?.includes(query.type));
      if (!plan.length) {
        const result = { status: 'incomplete', observations: [], progress: 0, total: 0, diagnostic: 'Not enough source data to create searches' };
        store.set(result);
        return result;
      }
      runner = Runner.createRunController({
        adapter: (query, runOptions) => Adapter.execute(query, { ...runOptions, timeoutMs: 30000, stableMs: 1500, profile: current.profile }),
        onState: state => { if (!destroyed && runRevision === revision) store.set(state); },
        queryTimeoutMs: 30000,
        runTimeoutMs: 180000,
        safetyDelayMs: 900
      });
      const runResult = await runner.start(plan);
      refresh();
      if (destroyed || runRevision !== revision) return { status: 'cancelled', observations: [], results: [] };
      const initial = (current.initialCandidates || []).map(candidate => ({ queryId: 'initial-table', candidate }));
      const searched = (runResult.observations || []).flatMap(observation => (observation.rows || []).map(candidate => ({ queryId: observation.queryId, candidate })));
      const results = Engine.consolidateCandidates(current.source, [...initial, ...searched]);
      const result = { ...runResult, plan, results, activeQuery: null };
      store.set(result);
      runner = null;
      return result;
    }

    function cancel() { runner?.cancel?.(); }
    function pause() { runner?.pause?.(); }
    function resume() { runner?.resume?.(); }
    function openExternal(url) {
      try { return !!win.open(url, '_blank', 'noopener,noreferrer'); } catch { return false; }
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      runner?.cancel?.();
      runner = null;
      lifecycle.dispose();
      store.destroy();
    }
    return { scan, refresh, run, pause, resume, cancel, openExternal, destroy };
  }
  root.PickerBookmarkController = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
