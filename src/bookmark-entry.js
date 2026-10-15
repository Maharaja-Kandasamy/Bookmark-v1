(function (root) {
  function launch() {
    const existing = window.__pickerBookmarkV1;
    if (existing) { existing.kill(); }
    const lifecycle = root.PickerBookmarkLifecycle.create();
    const store = root.PickerBookmarkStore.create({ status:'ready',results:[],observations:[] });
    const controller = root.PickerBookmarkController.create({ document, window, store, lifecycle });
    const scanned = controller.scan();
    if (scanned?.error) {
      lifecycle.dispose(); store.destroy();
      window.alert(`Picker Bookmark v1: Store or Retail Manual Match table not found (${scanned.error}).`);
      return null;
    }
    const instance = { open(){ controller.refresh(); bot.open(); }, kill(){ bot.destroy(); } };
    const bot = root.PickerBookmarkBot.mount({ document, window, store, controller, lifecycle, onKilled(){ if (window.__pickerBookmarkV1 === instance) delete window.__pickerBookmarkV1; } });
    window.__pickerBookmarkV1 = instance;
    bot.open();
    return instance;
  }
  function kill() { window.__pickerBookmarkV1?.kill(); }
  root.PickerBookmarkV1 = { launch, kill };
  launch();
})(typeof globalThis !== 'undefined' ? globalThis : this);
