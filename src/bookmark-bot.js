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
        *{box-sizing:border-box}.shell{--accent:#2563eb;--accent-hover:#1d4ed8;--text:#111827;--muted:#64748b;--surface:#fff;--subtle:#f8fafc;--border:#e2e8f0;--success:#15803d;--warning:#b45309;--error:#b91c1c;position:relative;color:var(--text)}.bot{padding:0;border:0;background:transparent;cursor:grab}.bot:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:8px}
        .panel{display:none;position:fixed;width:min(430px,calc(100vw - 24px));max-height:calc(100vh - 24px);background:var(--surface);border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 12px 32px rgba(15,23,42,.16);overflow:hidden}.panel.open{display:flex;flex-direction:column}.head{min-height:56px;padding:10px 12px;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px}.logo{width:30px;height:30px;border-radius:6px;background:var(--accent);color:#fff;display:grid;place-items:center;font-size:11px;font-weight:750}.title{font-size:13px;font-weight:700}.sub{font-size:10px;color:var(--muted);margin-top:1px}.close{margin-left:auto;width:32px;padding:0;justify-content:center}.scroll{padding:12px;overflow:auto}.source{padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--subtle)}.source strong{display:block;font-size:13px;font-weight:650}.meta,.notice{font-size:10px;color:var(--muted);line-height:1.45;margin-top:4px;overflow-wrap:anywhere}.notice{padding:8px 10px;background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;border-radius:6px;margin:12px 0}.label{font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin:16px 0 6px}.fields,.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.field,.btn{min-height:34px;border:1px solid #cbd5e1;background:var(--surface);color:#334155;border-radius:6px;padding:7px 9px;font:600 10px inherit;cursor:pointer;text-align:left;transition:background .15s,border-color .15s}.btn{display:inline-flex;align-items:center;gap:6px}.btn svg{width:14px;height:14px;flex:none}.field span{display:block;font-size:8px;color:var(--muted);text-transform:uppercase;font-weight:650}.field b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}.field:hover,.btn:hover:not(:disabled){border-color:#94a3b8;background:#f1f5f9}.field:focus-visible,.btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.btn:disabled,.field:disabled{opacity:.48;cursor:not-allowed}.primary{background:var(--accent);border-color:var(--accent);color:#fff}.primary:hover:not(:disabled){background:var(--accent-hover);border-color:var(--accent-hover)}.progress{height:6px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin-top:8px}.fill{height:100%;width:0;background:var(--accent);transition:width .25s}.result{border:1px solid var(--border);border-left:3px solid var(--warning);border-radius:8px;padding:10px;margin-top:8px}.result.direct{border-left-color:var(--error);background:#fffafa}.result.exact{border-left-color:var(--success)}.result h4{font-size:11px;margin:0 0 5px;font-weight:650}.result p{font-size:10px;color:#526174;margin:3px 0}.result-actions{display:flex;gap:8px;margin-top:8px}.empty{border:1px dashed #cbd5e1;border-radius:8px;padding:16px;text-align:center;color:var(--muted);font-size:10px}.actions{padding:10px 12px;border-top:1px solid var(--border);background:var(--subtle);display:flex;justify-content:flex-end}.danger{color:var(--error);border-color:#fecaca}.dragging{user-select:none}
        .result-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.result-heading h4{min-width:0;overflow-wrap:anywhere}.record-status{display:inline-block;flex:none;max-width:50%;overflow-wrap:anywhere;border:1px solid #cbd5e1;border-radius:999px;padding:2px 7px;font-size:9px;font-weight:650;line-height:1.4;background:#f1f5f9;color:#475569}.record-status[data-status=open]{background:#f0fdf4;border-color:#bbf7d0;color:#166534}.record-status[data-status=closed]{background:#fef2f2;border-color:#fecaca;color:#991b1b}.record-status[data-status=unverified]{background:#fffbeb;border-color:#fde68a;color:#92400e}.record-status[data-status=duplicate]{background:#eff6ff;border-color:#bfdbfe;color:#1e40af}
        .notice[data-tone=warning]{background:#fffbeb;border-color:#fde68a;color:#92400e;font-weight:600}
        ${root.PickerBookmarkRobot.css}
      </style>
      <div class="shell" data-state="ready">
        <button class="bot" title="Open Picker Bookmark v1" aria-label="Open Picker Bookmark v1">
          ${root.PickerBookmarkRobot.svg}
        </button>
        <section class="panel" aria-label="Picker Bookmark v1">
          <div class="head"><img class="logo" src="data:image/png;base64,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" alt="Picker logo"><div><div class="title">Picker Bookmark v1</div><div class="sub">Store and Retail duplicate checks</div></div><button class="btn close" data-icon="close" aria-label="Close panel"></button></div>
          <div class="scroll"><div class="source"><strong class="source-name">Reading source</strong><div class="meta source-meta"></div></div><div class="fields"></div><div class="notice" role="status">Ready.</div><div class="label">Duplicate checks</div><div class="progress"><div class="fill"></div></div><div class="meta progress-text"></div><div class="grid controls"><button class="btn primary run" data-icon="play">Run All Checks</button><button class="btn retry" data-icon="refresh">Retry Incomplete</button><button class="btn pause" data-icon="pause">Pause</button><button class="btn cancel" data-icon="square">Cancel</button></div><div class="label">Store tools</div><div class="grid"><button class="btn google-search" data-icon="search">Google Search</button><button class="btn address-search" data-icon="search">Google Address Search</button><button class="btn map-search" data-icon="map">Map Address Search</button><button class="btn copy-store" data-icon="copy">Copy Store Data</button></div><div class="label">Results</div><div class="results"></div></div>
          <div class="actions"><button class="btn danger kill" data-icon="power">Kill Bot</button></div>
        </section>
      </div>`;
    const ICONS = {
      close:'<path d="M18 6 6 18M6 6l12 12"/>',
      play:'<path d="m5 3 14 9-14 9V3z"/>',
      refresh:'<path d="M20 6v6h-6M4 18v-6h6"/><path d="M18.5 9A7 7 0 0 0 6.2 5.2L4 7m16 10-2.2 1.8A7 7 0 0 1 5.5 15"/>',
      pause:'<path d="M8 5v14M16 5v14"/>',
      square:'<rect width="14" height="14" x="5" y="5" rx="1"/>',
      search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
      map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6zM9 3v15M15 6v15"/>',
      copy:'<rect width="13" height="13" x="8" y="8" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
      power:'<path d="M12 2v10M18.4 6.6a8 8 0 1 1-12.8 0"/>'
    };
    const iconSvg = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]||''}</svg>`;
    const decorateIcons = scope => scope.querySelectorAll('[data-icon]').forEach(button => { if(button.querySelector('svg'))return; const label=button.textContent.trim(); button.innerHTML=iconSvg(button.dataset.icon); if(label){const span=document.createElement('span');span.className='button-label';span.textContent=label;button.appendChild(span);} });
    const setButtonLabel = (button, label) => { const span=button.querySelector('.button-label'); if(span)span.textContent=label; else button.textContent=label; };
    decorateIcons(shadow);
    document.documentElement.appendChild(host);
    const $ = selector => shadow.querySelector(selector);
    const shell = $('.shell');
    const panel = $('.panel');
    let open = false;
    let state = store.get() || {};
    let drag = null;
    let suppressClick = false;
    let motionTimer = null;
    let previousStatus = null;
    let killing = false;
    let killed = false;
    let killTimer = null;
    const robot = $('#astrobot-svg');
    const motionStates = ['idle','blinking','waving','thinking','celebrating','dragging','landing','killing'];
    const restingMotion = () => ['running','waiting'].includes(state.status) ? 'thinking' : ['paused','error','incomplete'].includes(state.status) ? 'blinking' : 'idle';
    function animateRobot(name, duration = 0) {
      if (killing && name !== 'killing') return;
      window.clearTimeout(motionTimer);
      robot.classList.remove(...motionStates.map(value => `state-${value}`));
      robot.classList.add(`state-${name}`);
      robot.dataset.motion = name;
      if (duration) motionTimer = window.setTimeout(() => animateRobot(restingMotion()), duration);
    }
    lifecycle.add(() => window.clearTimeout(motionTimer));

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
      if (!drag && state.status !== previousStatus) animateRobot(state.status === 'completed' ? 'celebrating' : restingMotion(), state.status === 'completed' ? 2400 : 0);
      previousStatus = state.status;
      const source = state.source || {};
      $('.source-name').textContent = source.bannerName || 'Manual screen required';
      $('.source-meta').textContent = [state.profile === 'retailSync' ? 'Retail' : 'Store', source.storeNumber && `Store #${source.storeNumber}`, address()].filter(Boolean).join(' · ');
      const fields = $('.fields'); fields.textContent = '';
      [['bannerName','Banner'],['storeNumber','Store #'],['address','Address'],['city','City'],['state','State'],['zip','ZIP'],['phone','Phone']].forEach(([key,label]) => { const button=document.createElement('button'); button.className='field'; button.dataset.copy=key; button.disabled=!source[key]; button.innerHTML=`<span>${label}</span><b></b>`; button.querySelector('b').textContent=source[key]||'Not available'; fields.appendChild(button); });
      const total = state.total || state.plan?.length || 0; const progress = state.progress || 0;
      const googleQuery = [source.bannerName, source.address, source.city, source.state, source.zip].filter(Boolean).join(' ');
      $('.fill').style.width = total ? `${Math.min(100, progress / total * 100)}%` : '0%';
      $('.progress-text').textContent = state.activeQuery ? `${progress}/${total} — ${state.activeQuery.label}` : `${progress}/${total} — ${state.status || 'ready'}`;
      const busy=['running','waiting','paused'].includes(state.status); $('.run').disabled=busy||!source.bannerName; $('.google-search').disabled=!googleQuery; $('.retry').disabled=busy||state.status!=='incomplete'; $('.pause').disabled=!busy; setButtonLabel($('.pause'),state.status==='paused'?'Resume':'Pause'); $('.cancel').disabled=!busy;
      $('.notice').textContent=state.diagnostic || (state.status === 'ready' ? 'Ready.' : state.status === 'completed' ? 'Checks complete.' : 'Checking current record.');
      const manualRequired = !state.source && !!state.diagnostic;
      $('.notice').dataset.tone = manualRequired ? 'warning' : 'info';
      $('.notice').setAttribute('role', manualRequired ? 'alert' : 'status');
      const results=$('.results'); results.textContent='';
      (state.results||[]).forEach((item,index)=>{ const candidate=item.candidate||item; const card=document.createElement('article'); card.className=`result ${item.directMatch?'direct':String(item.classification||'').startsWith('Exact')?'exact':''}`; card.innerHTML=`<div class="result-heading"><h4></h4><span class="record-status"></span></div><p class="kind"></p><p class="where"></p><p class="why"></p><div class="result-actions"><button class="btn" data-icon="copy" data-result="td" data-index="${index}">TD Copy</button><button class="btn" data-icon="copy" data-result="full" data-index="${index}">Full Copy</button></div>`; const rawStatus=Engine.cleanText(candidate.storeStatus || candidate.copyFields?.find(field => /^(?:STORE_STATUS|SL_STORE_STATUS|RS_STORE_STATUS|STATUS)$/i.test(field.header))?.value); const pill=card.querySelector('.record-status'); const statusKey=rawStatus.toLowerCase().replace(/[^a-z]/g,''); const knownStatus={open:'Open',closed:'Closed',unverified:'Unverified',unverifyed:'Unverified',duplicate:'Duplicate'}; pill.textContent=knownStatus[statusKey] || rawStatus || 'Status unavailable'; pill.dataset.status=statusKey==='unverifyed'?'unverified':statusKey; pill.title=rawStatus ? `Record status: ${rawStatus}` : 'Record status was not provided'; card.querySelector('h4').textContent=candidate.bannerName||`SL_ID ${candidate.slId||'Unknown'}`; card.querySelector('.kind').textContent=item.classification||'Potential duplicate'; card.querySelector('.where').textContent=[candidate.address,candidate.city,candidate.state,candidate.zip].filter(Boolean).join(', '); card.querySelector('.why').textContent=(item.matchedRules||[]).join(' • '); decorateIcons(card); results.appendChild(card); });
      if (!(state.results||[]).length) { const empty=document.createElement('div');empty.className='empty';empty.textContent=state.status==='completed'?'No duplicates found.':'Run checks to see duplicate results.';results.appendChild(empty); }
      position();
    }
    const unsubscribe = store.subscribe(render); lifecycle.add(unsubscribe);
    function openPanel() { if(killing)return; open=true; panel.classList.add('open'); window.requestAnimationFrame(position); }
    function closePanel() { open=false; panel.classList.remove('open'); }
    function finishKill() {
      if (killed) return;
      killed = true;
      window.clearTimeout(killTimer);
      host.remove();
      onKilled();
    }
    function kill({ immediate = false } = {}) {
      if (killed) return;
      if (killing) { if (immediate) finishKill(); return; }
      killing = true;
      drag = null;
      closePanel();
      host.style.pointerEvents = 'none';
      $('.bot').disabled = true;
      animateRobot('killing');
      // Stop searches, observers, listeners and idle timers immediately; keep only the visual farewell.
      controller.destroy();
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (immediate || reducedMotion) finishKill();
      else killTimer = window.setTimeout(finishKill, 1700);
    }
    lifecycle.listen(shadow, 'click', event => {
      const target=event.target.closest('button'); if(!target)return;
      if(target.classList.contains('bot')) { if(suppressClick){suppressClick=false;return;} animateRobot('waving',1200); return open?closePanel():openPanel(); }
      if(target.classList.contains('close')) return closePanel();
      if(target.classList.contains('run')||target.classList.contains('retry')) return controller.run().catch(error=>$('.notice').textContent=error.message);
      if(target.classList.contains('pause')) return state.status==='paused'?controller.resume():controller.pause();
      if(target.classList.contains('cancel')) return controller.cancel();
      if(target.classList.contains('kill')) return kill();
      if(target.dataset.copy) return copy(state.source?.[target.dataset.copy]);
      if(target.classList.contains('google-search')) { const source=state.source||{}; const query=[source.bannerName,source.address,source.city,source.state,source.zip].filter(Boolean).join(' '); if (!query) return; if(!controller.openExternal(`https://www.google.com/search?q=${encodeURIComponent(query)}`)) $('.notice').textContent='Allow popups to open Google Search.'; return; }
      if(target.classList.contains('copy-store')) return copy([`Banner: ${state.source?.bannerName||''}`,`Store #: ${state.source?.storeNumber||''}`,`Address: ${address()}`,`Phone: ${state.source?.phone||''}`].join('\n'));
      if(target.classList.contains('address-search')) { if(!controller.openExternal(`https://www.google.com/search?q=${encodeURIComponent(address())}`)) $('.notice').textContent='Allow popups to open the address search.'; return; }
      if(target.classList.contains('map-search')) { if(!controller.openExternal(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address())}`)) $('.notice').textContent='Allow popups to open Maps.'; return; }
      if(target.dataset.result){ const item=(state.results||[])[Number(target.dataset.index)]; const candidate=item?.candidate||item; return copy(target.dataset.result==='td'?Engine.formatTdCopy(candidate):Engine.formatFullCopy(candidate)); }
    });
    lifecycle.listen($('.bot'), 'pointerdown', event => {
      if (event.button !== 0) return;
      suppressClick=false;
      drag={x:event.clientX,y:event.clientY,lastX:event.clientX,right:parseFloat(host.style.right)||18,bottom:parseFloat(host.style.bottom)||18,moved:false};
      animateRobot('dragging');
      $('.bot').setPointerCapture?.(event.pointerId);
    });
    lifecycle.listen($('.bot'), 'pointermove', event => {
      if(!drag)return;
      const dx=event.clientX-drag.x, dy=event.clientY-drag.y;
      if(!drag.moved && Math.hypot(dx,dy)<4)return;
      drag.moved=true;
      closePanel();
      robot.style.setProperty('--tilt-deg',`${Math.max(-28,Math.min(28,-(event.clientX-drag.lastX)*1.65))}deg`);
      drag.lastX=event.clientX;
      host.style.right=`${Math.max(6,Math.min(window.innerWidth-126,drag.right-dx))}px`;
      host.style.bottom=`${Math.max(6,Math.min(window.innerHeight-146,drag.bottom-dy))}px`;
    });
    function endDrag() {
      if(!drag)return;
      suppressClick=drag.moved;
      drag=null;
      robot.style.setProperty('--tilt-deg','0deg');
      animateRobot('landing',620);
    }
    lifecycle.listen($('.bot'), 'pointerup', endDrag);
    lifecycle.listen($('.bot'), 'pointercancel', endDrag);
    lifecycle.listen($('.bot'), 'lostpointercapture', endDrag);
    lifecycle.listen($('.bot'), 'pointerenter', () => { if(!drag && restingMotion()==='idle')animateRobot('waving',1200); });
    lifecycle.listen(window, 'pointermove', event => {
      if(drag)return;
      const rect=$('.bot').getBoundingClientRect();
      robot.style.setProperty('--gaze-x',`${Math.max(-3,Math.min(3,(event.clientX-rect.left-rect.width/2)/30))}px`);
      robot.style.setProperty('--gaze-y',`${Math.max(-2,Math.min(2,(event.clientY-rect.top-rect.height/2)/30))}px`);
    }, { passive:true });
    lifecycle.listen($('.bot'), 'pointerleave', () => { robot.style.setProperty('--gaze-x','0px'); robot.style.setProperty('--gaze-y','0px'); });
    if (state.source) animateRobot('waving',1400);
    else animateRobot(restingMotion());
    lifecycle.listen(window, 'resize', position, { passive:true });
    return { open: openPanel, destroy: kill };
  }
  root.PickerBookmarkBot = { mount };
})(typeof globalThis !== 'undefined' ? globalThis : this);
