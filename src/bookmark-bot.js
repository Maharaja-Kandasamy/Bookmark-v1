(function (root) {
  function mount({ document, window, store, controller, lifecycle, onKilled }) {
    const Engine = root.PickerDuplicateEngine;
    const Layout = root.PickerBotLayout;
    const host = document.createElement('div');
    host.id = 'picker-bookmark-v1-host';
    host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;font-family:Inter,Segoe UI,Arial,sans-serif';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        *{box-sizing:border-box}.shell{--blue:#2563eb;--navy:#0f172a;position:relative;color:#172033}.bot{width:78px;height:86px;padding:0;border:0;background:transparent;cursor:pointer;filter:drop-shadow(0 12px 14px rgba(15,23,42,.28));transform-origin:50% 100%;animation:breathe 3s ease-in-out infinite}.bot:hover{transform:translateY(-3px) scale(1.04)}svg{overflow:visible}.body{fill:#f8fafc;stroke:#93c5fd;stroke-width:2}.face{fill:var(--navy)}.eye{fill:white}.pupil{fill:#38bdf8;transform:translate(var(--eye-x,0),var(--eye-y,0));transition:.08s}.ring{fill:none;stroke:var(--blue);stroke-width:3}.mouth{fill:none;stroke:#38bdf8;stroke-width:2.4;stroke-linecap:round}.antenna{transform-origin:38px 15px}.arm{fill:none;stroke:#94a3b8;stroke-width:5;stroke-linecap:round}
        .shell[data-state=running] .antenna,.shell[data-state=waiting] .antenna{animation:vibrate .18s infinite alternate}.shell[data-state=running] .ring,.shell[data-state=waiting] .ring{stroke-dasharray:9 5;animation:dash 1s linear infinite}.shell[data-state=completed] .bot{animation:nod .42s 2}.shell[data-state=incomplete] .ring,.shell[data-state=error] .ring{stroke:#ef4444}.shell[data-state=exiting] .bot{animation:panic-exit .7s ease-in forwards;filter:drop-shadow(0 0 13px #ef4444)}.shell[data-state=exiting] .body{fill:#fee2e2;stroke:#ef4444}.shell[data-state=exiting] .face{fill:#450a0a}.shell[data-state=exiting] .ring{stroke:#ef4444}.shell.dragging .bot{animation:none;cursor:grabbing}
        .panel{display:none;position:fixed;width:min(430px,calc(100vw - 24px));max-height:calc(100vh - 24px);background:#fff;border:1px solid #bfdbfe;border-radius:18px;box-shadow:0 28px 80px rgba(15,23,42,.3);overflow:hidden}.panel.open{display:flex;flex-direction:column}.head{padding:13px 15px;background:var(--navy);color:#fff;display:flex;align-items:center;gap:10px}.logo{width:31px;height:31px;border-radius:10px;background:#eff6ff;color:#1d4ed8;display:grid;place-items:center;font-weight:900}.title{font-size:14px;font-weight:900}.sub{font-size:10px;color:#bfdbfe}.close{margin-left:auto}.scroll{padding:13px;overflow:auto}.source{padding:10px;border:1px solid #dbe7f5;border-radius:11px;background:#f8fbff}.source strong{display:block;font-size:13px}.meta,.notice{font-size:10px;color:#64748b;line-height:1.45;margin-top:4px;overflow-wrap:anywhere}.notice{padding:9px;background:#eff6ff;color:#1e40af;border-radius:9px;margin:10px 0}.label{font-size:9px;font-weight:900;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin:12px 0 6px}.fields,.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}.field,.btn{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:8px;padding:7px 9px;font:700 10px inherit;cursor:pointer;text-align:left}.field span{display:block;font-size:8px;color:#94a3b8;text-transform:uppercase}.field b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.field:hover,.btn:hover{border-color:#60a5fa;background:#eff6ff}.btn:disabled{opacity:.45;cursor:not-allowed}.progress{height:7px;background:#e2e8f0;border-radius:10px;overflow:hidden}.fill{height:100%;width:0;background:var(--blue);transition:.25s}.result{border:1px solid #dbe4ef;border-left:4px solid #f59e0b;border-radius:10px;padding:9px;margin-top:7px}.result.direct{border-left-color:#ef4444;background:#fff7f7}.result.exact{border-left-color:#10b981}.result h4{font-size:11px;margin:0 0 5px}.result p{font-size:10px;color:#526174;margin:3px 0}.result-actions{display:flex;gap:6px;margin-top:7px}.actions{padding:11px 13px;border-top:1px solid #e2e8f0;background:#f8fafc;display:flex;gap:6px;flex-wrap:wrap}.danger{color:#b91c1c;border-color:#fecaca}.dragging{user-select:none}
        @keyframes breathe{50%{transform:translateY(-2px)}}@keyframes vibrate{to{transform:rotate(5deg)}}@keyframes dash{to{stroke-dashoffset:-28}}@keyframes nod{50%{transform:rotate(4deg)}}@keyframes panic-exit{0%{transform:scale(1)}35%{transform:rotate(-8deg) scale(1.08)}100%{transform:translateY(80px) scale(.15);opacity:0}}
      </style>
      <div class="shell" data-state="ready">
        <button class="bot" title="Open Picker Bookmark v1" aria-label="Open Picker Bookmark v1">
          <svg viewBox="0 0 76 84" aria-hidden="true"><g class="antenna"><path d="M38 16V8" stroke="#64748b" stroke-width="4"/><circle cx="38" cy="6" r="5" fill="#38bdf8"/></g><path class="arm" d="M15 54L6 66M61 54L70 66"/><circle class="body" cx="38" cy="47" r="29"/><rect class="face" x="18" y="28" width="40" height="31" rx="13"/><ellipse class="eye" cx="30" cy="41" rx="7" ry="8"/><ellipse class="eye" cx="47" cy="41" rx="7" ry="8"/><circle class="pupil" cx="31" cy="42" r="3"/><circle class="pupil" cx="48" cy="42" r="3"/><path class="mouth" d="M32 51q6 6 12 0"/><circle class="ring" cx="38" cy="47" r="32"/></svg>
        </button>
        <section class="panel" aria-label="Picker Bookmark v1">
          <div class="head"><div class="logo">P1</div><div><div class="title">Picker Bookmark v1</div><div class="sub">Store & Retail Duplicate Assistant</div></div><button class="btn close">×</button></div>
          <div class="scroll"><div class="source"><strong class="source-name">Reading source…</strong><div class="meta source-meta"></div></div><div class="fields"></div><div class="notice">Ready.</div><div class="label">Duplicate checks</div><div class="progress"><div class="fill"></div></div><div class="meta progress-text"></div><div class="grid controls"><button class="btn run">Run All Checks</button><button class="btn retry">Retry Incomplete</button><button class="btn pause">Pause</button><button class="btn cancel">Cancel</button></div><div class="label">Store tools</div><div class="grid"><button class="btn address-search">Google Address Search</button><button class="btn map-search">Map Address Search</button><button class="btn copy-store">Copy Store Data</button></div><div class="label">Results</div><div class="results"></div></div>
          <div class="actions"><button class="btn danger kill">Kill Bot</button></div>
        </section>
      </div>`;
    document.documentElement.appendChild(host);
    const $ = selector => shadow.querySelector(selector);
    const shell = $('.shell');
    const panel = $('.panel');
    let open = false;
    let state = store.get() || {};
    let drag = null;

    const address = () => [state.source?.address, state.source?.city, state.source?.state, state.source?.zip].filter(Boolean).join(', ');
    const copy = async text => {
      try { await window.navigator.clipboard.writeText(String(text || '')); $('.notice').textContent = 'Copied to clipboard.'; }
      catch { $('.notice').textContent = 'Copy failed. Select the visible text and copy it manually.'; }
    };
    const position = () => {
      if (!open) return;
      const rect = $('.bot').getBoundingClientRect();
      const placement = Layout.computePanelPlacement(rect, { width: 430, height: Math.min(680, panel.scrollHeight || 680) }, { width: window.innerWidth, height: window.innerHeight });
      Object.assign(panel.style, { left: `${placement.left}px`, top: `${placement.top}px`, width: `${placement.width}px`, maxHeight: `${placement.maxHeight}px` });
    };
    function render(next) {
      state = next || {};
      shell.dataset.state = state.status || 'ready';
      const source = state.source || {};
      $('.source-name').textContent = source.bannerName || 'Open a Store or Retail Manual Match table';
      $('.source-meta').textContent = [state.profile === 'retailSync' ? 'Retail' : 'Store', source.storeNumber && `Store #${source.storeNumber}`, address()].filter(Boolean).join(' · ');
      const fields = $('.fields'); fields.textContent = '';
      [['bannerName','Banner'],['storeNumber','Store #'],['address','Address'],['city','City'],['state','State'],['zip','ZIP'],['phone','Phone']].forEach(([key,label]) => { const button=document.createElement('button'); button.className='field'; button.dataset.copy=key; button.disabled=!source[key]; button.innerHTML=`<span>${label}</span><b></b>`; button.querySelector('b').textContent=source[key]||'Not available'; fields.appendChild(button); });
      const total = state.total || state.plan?.length || 0; const progress = state.progress || 0;
      $('.fill').style.width = total ? `${Math.min(100, progress / total * 100)}%` : '0%';
      $('.progress-text').textContent = state.activeQuery ? `${progress}/${total} — ${state.activeQuery.label}` : `${progress}/${total} — ${state.status || 'ready'}`;
      const busy=['running','waiting','paused'].includes(state.status); $('.run').disabled=busy||!source.bannerName; $('.retry').disabled=busy||state.status!=='incomplete'; $('.pause').disabled=!busy; $('.pause').textContent=state.status==='paused'?'Resume':'Pause'; $('.cancel').disabled=!busy;
      if (state.diagnostic) $('.notice').textContent=state.diagnostic;
      const results=$('.results'); results.textContent='';
      (state.results||[]).forEach((item,index)=>{ const candidate=item.candidate||item; const card=document.createElement('article'); card.className=`result ${item.directMatch?'direct':String(item.classification||'').startsWith('Exact')?'exact':''}`; card.innerHTML=`<h4></h4><p class="kind"></p><p class="where"></p><p class="why"></p><div class="result-actions"><button class="btn" data-result="td" data-index="${index}">TD Copy</button><button class="btn" data-result="full" data-index="${index}">Full Copy</button></div>`; card.querySelector('h4').textContent=candidate.bannerName||`SL_ID ${candidate.slId||'Unknown'}`; card.querySelector('.kind').textContent=item.classification||'Potential duplicate'; card.querySelector('.where').textContent=[candidate.address,candidate.city,candidate.state,candidate.zip].filter(Boolean).join(', '); card.querySelector('.why').textContent=(item.matchedRules||[]).join(' • '); results.appendChild(card); });
      if (!(state.results||[]).length) results.textContent=state.status==='completed'?'No duplicate found.':'No duplicate check has run yet.';
      position();
    }
    const unsubscribe = store.subscribe(render); lifecycle.add(unsubscribe);
    function openPanel() { open=true; panel.classList.add('open'); window.requestAnimationFrame(position); }
    function closePanel() { open=false; panel.classList.remove('open'); }
    function kill() {
      shell.setAttribute('data-state', 'exiting'); closePanel();
      window.setTimeout(() => { host.remove(); controller.destroy(); onKilled(); }, 700);
    }
    lifecycle.listen(shadow, 'click', event => {
      const target=event.target.closest('button'); if(!target)return;
      if(target.classList.contains('bot')) return open?closePanel():openPanel();
      if(target.classList.contains('close')) return closePanel();
      if(target.classList.contains('run')||target.classList.contains('retry')) return controller.run().catch(error=>$('.notice').textContent=error.message);
      if(target.classList.contains('pause')) return state.status==='paused'?controller.resume():controller.pause();
      if(target.classList.contains('cancel')) return controller.cancel();
      if(target.classList.contains('kill')) return kill();
      if(target.dataset.copy) return copy(state.source?.[target.dataset.copy]);
      if(target.classList.contains('copy-store')) return copy([`Banner: ${state.source?.bannerName||''}`,`Store #: ${state.source?.storeNumber||''}`,`Address: ${address()}`,`Phone: ${state.source?.phone||''}`].join('\n'));
      if(target.classList.contains('address-search')) { if(!controller.openExternal(`https://www.google.com/search?q=${encodeURIComponent(address())}`)) $('.notice').textContent='Allow popups to open the address search.'; return; }
      if(target.classList.contains('map-search')) { if(!controller.openExternal(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address())}`)) $('.notice').textContent='Allow popups to open Maps.'; return; }
      if(target.dataset.result){ const item=(state.results||[])[Number(target.dataset.index)]; const candidate=item?.candidate||item; return copy(target.dataset.result==='td'?Engine.formatTdCopy(candidate):Engine.formatFullCopy(candidate)); }
    });
    lifecycle.listen($('.bot'), 'pointerdown', event => { drag={x:event.clientX,y:event.clientY,right:parseFloat(host.style.right)||18,bottom:parseFloat(host.style.bottom)||18}; $('.bot').setPointerCapture?.(event.pointerId); });
    lifecycle.listen($('.bot'), 'pointermove', event => { if(!drag)return; shell.classList.add('dragging'); closePanel(); host.style.right=`${Math.max(6,Math.min(window.innerWidth-80,drag.right-(event.clientX-drag.x)))}px`; host.style.bottom=`${Math.max(6,Math.min(window.innerHeight-88,drag.bottom-(event.clientY-drag.y)))}px`; });
    lifecycle.listen($('.bot'), 'pointerup', () => { drag=null; shell.classList.remove('dragging'); });
    lifecycle.listen(window, 'resize', position, { passive:true });
    return { open: openPanel, destroy: kill };
  }
  root.PickerBookmarkBot = { mount };
})(typeof globalThis !== 'undefined' ? globalThis : this);
