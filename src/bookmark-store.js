(function (root) {
  function create(initialState = {}) {
    let state = { ...initialState };
    let destroyed = false;
    const listeners = new Set();
    const api = {
      get() { return destroyed ? null : state; },
      set(patch) {
        if (destroyed) return null;
        state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
        listeners.forEach(listener => listener(state));
        return state;
      },
      subscribe(listener) {
        if (destroyed) return () => {};
        listeners.add(listener);
        listener(state);
        return () => listeners.delete(listener);
      },
      destroy() { destroyed = true; state = null; listeners.clear(); }
    };
    return api;
  }
  root.PickerBookmarkStore = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
