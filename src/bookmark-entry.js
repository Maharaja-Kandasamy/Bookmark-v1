(function (root) {
  function launch() {
    let lifecycle,store,controller,instance;
    try {
      document.getElementById?.('picker-bookmark-startup-error')?.remove();
      const existing = window.__pickerBookmarkV1;
      if (existing) { existing.kill({ immediate: true }); }
      lifecycle = root.PickerBookmarkLifecycle.create({onError(error){
        try{controller?.cancel();}catch{}
        const message=String(error?.message || 'An action could not finish').split(/[\r\n]/)[0].slice(0,180);
        store?.set({status:'incomplete',activeQuery:null,diagnostic:`Action stopped safely: ${message}. Retry the action.`});
      }});
      store = root.PickerBookmarkStore.create({ status:'ready',results:[],observations:[] },{onError:lifecycle.reportError});
      controller = root.PickerBookmarkController.create({ document, window, store, lifecycle });
      controller.scan();
      let bot;
      instance = { open(){ controller.refresh(); bot.open(); }, kill(options){ bot.destroy(options); } };
      bot = root.PickerBookmarkBot.mount({ document, window, store, controller, lifecycle, onKilled(){ if (window.__pickerBookmarkV1 === instance) delete window.__pickerBookmarkV1; } });
      window.__pickerBookmarkV1 = instance;
      bot.open();
      return instance;
    } catch {
      try{controller?.destroy();}catch{}
      try{lifecycle?.dispose();store?.destroy();}catch{}
      if(window.__pickerBookmarkV1===instance)delete window.__pickerBookmarkV1;
      try {
        document.getElementById?.('picker-bookmark-v1-host')?.remove();
        const notice=document.createElement('div');
        notice.id='picker-bookmark-startup-error';notice.setAttribute('role','alert');
        notice.style.cssText='position:fixed;right:18px;bottom:18px;max-width:320px;padding:14px;border:1px solid #f59e0b;border-radius:8px;background:#fffbeb;color:#78350f;z-index:2147483647;font:13px Segoe UI,sans-serif';
        notice.textContent='Picker could not start. Refresh the Manual screen and launch your bookmark again. ';
        const dismiss=document.createElement('button');dismiss.textContent='Dismiss';dismiss.onclick=()=>notice.remove();notice.appendChild(dismiss);
        document.documentElement.appendChild(notice);
      } catch {}
      return null;
    }
  }
  function kill() { window.__pickerBookmarkV1?.kill(); }
  root.PickerBookmarkV1 = { launch, kill };
  launch();
})(typeof globalThis !== 'undefined' ? globalThis : this);
