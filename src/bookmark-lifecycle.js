(function (root) {
  function create(options = {}) {
    const disposers = [];
    let reporting=false;
    const reportError=error=>{if(reporting)return;reporting=true;try{options.onError?.(error);}catch{}finally{reporting=false;}};
    const guard=fn=>(...args)=>{try{const result=fn(...args);result?.catch?.(reportError);return result;}catch(error){reportError(error);}};
    let disposed = false;
    const add = disposer => {
      if (typeof disposer !== 'function') return disposer;
      if (disposed) disposer(); else disposers.push(disposer);
      return disposer;
    };
    const api = {
      get disposed() { return disposed; },
      add,
      reportError,
      listen(target, type, handler, options) {
        const listener=guard(handler);
        target.addEventListener(type, listener, options);
        add(() => target.removeEventListener(type, listener, options));
        return handler;
      },
      timeout(fn, ms) {
        const id = setTimeout(guard(fn), ms);
        add(() => clearTimeout(id));
        return id;
      },
      frame(fn) {
        const id = requestAnimationFrame(guard(fn));
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
