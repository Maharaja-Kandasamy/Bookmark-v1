(function (root) {
  function create(initialState = {},options = {}) {
    let state = { ...initialState };
    let destroyed = false;
    const listeners = new Set();
    const reportError=error=>{try{options.onError?.(error);}catch{}};
    const notify=listener=>{try{listener(state)?.catch?.(reportError);}catch(error){reportError(error);}};
    const api = {
      get() { return destroyed ? null : state; },
      set(patch) {
        if (destroyed) return null;
        const update=typeof patch === 'function'?patch(state):patch;
        if(!update || Object.keys(update).every(key=>Object.is(state[key],update[key])))return state;
        state={...state,...update};
        listeners.forEach(notify);
        return state;
      },
      subscribe(listener) {
        if (destroyed) return () => {};
        listeners.add(listener);
        notify(listener);
        return () => listeners.delete(listener);
      },
      destroy() { destroyed = true; state = null; listeners.clear(); }
    };
    return api;
  }
  root.PickerBookmarkStore = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
