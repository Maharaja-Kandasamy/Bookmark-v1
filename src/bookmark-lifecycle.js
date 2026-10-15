(function (root) {
  function create() {
    const disposers = [];
    let disposed = false;
    const add = disposer => {
      if (typeof disposer !== 'function') return disposer;
      if (disposed) disposer(); else disposers.push(disposer);
      return disposer;
    };
    const api = {
      get disposed() { return disposed; },
      add,
      listen(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        add(() => target.removeEventListener(type, handler, options));
        return handler;
      },
      timeout(fn, ms) {
        const id = setTimeout(fn, ms);
        add(() => clearTimeout(id));
        return id;
      },
      frame(fn) {
        const id = requestAnimationFrame(fn);
        add(() => cancelAnimationFrame(id));
        return id;
      },
      observe(observer, target, options) {
        observer.observe(target, options);
        add(() => observer.disconnect());
        return observer;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        while (disposers.length) {
          try { disposers.pop()(); } catch { /* best-effort cleanup */ }
        }
      }
    };
    return api;
  }
  root.PickerBookmarkLifecycle = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
