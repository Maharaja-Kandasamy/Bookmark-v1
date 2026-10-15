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

    function scan() {
      if (destroyed) return { error: 'bookmark-destroyed' };
      let found = Gsrs.extractFromDocument(doc, 'storeView');
      if (found?.error === 'profile-mismatch' || found?.detectedProfile === 'retailSync') found = Gsrs.extractFromDocument(doc, 'retailSync');
      if (found?.error) {
        store.set({ status: 'error', diagnostic: found.error, source: null, results: [] });
        return found;
      }
      extraction = found;
      store.set({ status: 'ready', profile: found.profile, source: found.source, initialCandidates: found.candidates || [], sourceRowCount: found.sourceRowCount, initialCandidateCount: found.initialCandidateCount, results: [], observations: [], diagnostic: '' });
      return found;
    }

    async function run() {
      if (destroyed) throw new Error('Bookmark was closed');
      if (runner?.isActive?.()) throw new Error('A duplicate check is already active');
      if (!extraction) scan();
      const current = store.get();
      if (!current?.source) return { status: 'error', observations: [], diagnostic: current?.diagnostic || 'Source table not found' };
      const plan = Engine.createSearchPlan(current.source);
      if (!plan.length) {
        const result = { status: 'incomplete', observations: [], progress: 0, total: 0, diagnostic: 'Not enough source data to create searches' };
        store.set(result);
        return result;
      }
      runner = Runner.createRunController({
        adapter: (query, runOptions) => Adapter.execute(query, { ...runOptions, timeoutMs: 30000, stableMs: 1500, profile: current.profile }),
        onState: state => store.set(state),
        queryTimeoutMs: 30000,
        runTimeoutMs: 180000,
        safetyDelayMs: 900
      });
      const runResult = await runner.start(plan);
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
    return { scan, run, pause, resume, cancel, openExternal, destroy };
  }
  root.PickerBookmarkController = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
