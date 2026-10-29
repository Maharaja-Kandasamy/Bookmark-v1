(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PickerRunController = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const timeout = async (promise, ms, onTimeout) => {
    let timer;
    try { return await Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => { onTimeout?.(); resolve({status:'incomplete',rows:[],diagnostic:`Timed out after ${Math.round(ms / 1000)} seconds`}); }, ms); })]); }
    finally { clearTimeout(timer); }
  };

  function createRunController(options) {
    const adapter = options.adapter;
    const onState = options.onState || (() => {});
    const queryTimeoutMs = options.queryTimeoutMs || 30000;
    const runTimeoutMs = options.runTimeoutMs || 180000;
    const safetyDelayMs = options.safetyDelayMs == null ? 900 : options.safetyDelayMs;
    let active = false;
    let paused = false;
    let cancelled = false;
    let resumeResolve = null;
    let currentAborter = null;
    let pauseStarted = 0;
    let pausedMs = 0;

    const publish = state => onState({ updatedAt: Date.now(), ...state, ...(paused && ['running','waiting'].includes(state.status) ? {status:'paused'} : {}) });
    const awaitResume = () => paused ? new Promise(resolve => { resumeResolve = resolve; }) : Promise.resolve();

    async function start(plan) {
      if (active) throw new Error('A duplicate check is already active');
      active = true; paused = false; cancelled = false;
      const startedAt = Date.now();
      pausedMs = 0; pauseStarted = 0;
      const elapsed = () => Date.now() - startedAt - pausedMs - (paused ? Date.now() - pauseStarted : 0);
      const observations = [];
      try {
        publish({ status: 'running', progress: 0, total: plan.length, progressText: `Search 0 of ${plan.length}` });
        for (let index = 0; index < plan.length; index += 1) {
          if (cancelled) break;
          await awaitResume();
          if (cancelled || elapsed() >= runTimeoutMs) break;
          const query = plan[index];
          publish({ status: 'waiting', progress: index + 1, total: plan.length, activeQuery: query, progressText: `Search ${index + 1} of ${plan.length}` });
          const remainingMs = Math.max(1, runTimeoutMs - elapsed());
          const aborter = new AbortController();
          currentAborter = aborter;
          const result = await timeout(Promise.resolve().then(() => adapter(query, { signal: aborter.signal })), Math.min(queryTimeoutMs, remainingMs), () => aborter.abort());
          currentAborter = null;
          observations.push({ queryId: query.id, query, ...result });
          publish({ status: 'running', progress: index + 1, total: plan.length, observations, progressText: `Search ${index + 1} of ${plan.length}` });
          if (index < plan.length - 1 && !cancelled) await wait(safetyDelayMs);
        }
        await awaitResume();
        const incomplete = observations.some(item => item.status !== 'complete') || observations.length < plan.length;
        const status = cancelled ? 'cancelled' : incomplete ? 'incomplete' : 'completed';
        const result = { status, observations, progress: observations.length, total: plan.length };
        publish(result);
        return result;
      } finally {
        active = false; paused = false; resumeResolve = null; currentAborter = null;
      }
    }

    return {
      start,
      pause() { if (active && !paused) { paused = true; pauseStarted = Date.now(); publish({ status: 'paused' }); } },
      resume() { if (active && paused) { pausedMs += Date.now() - pauseStarted; paused = false; if (resumeResolve) resumeResolve(); resumeResolve = null; publish({ status: 'running' }); } },
      cancel() { cancelled = true; paused = false; currentAborter?.abort(); if (resumeResolve) resumeResolve(); resumeResolve = null; publish({ status: 'cancelled' }); },
      isActive() { return active; }
    };
  }

  return { createRunController };
});
