/* Picker Bookmark v1 — self-contained GSRS duplicate assistant */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PickerDuplicateEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const suffixes = new Map([
    ['street', 'st'], ['st', 'st'], ['road', 'rd'], ['rd', 'rd'],
    ['avenue', 'ave'], ['ave', 'ave'], ['boulevard', 'blvd'], ['blvd', 'blvd'],
    ['drive', 'dr'], ['dr', 'dr'], ['lane', 'ln'], ['ln', 'ln'],
    ['highway', 'hwy'], ['hwy', 'hwy'], ['route', 'rte'], ['rte', 'rte'],
    ['west', 'w'], ['east', 'e'], ['north', 'n'], ['south', 's']
  ]);

  const cleanText = value => String(value || '').trim().replace(/\s+/g, ' ');
  const normalizeWords = value => cleanText(value).toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizeAddress = value => normalizeWords(value).replace(/\s+(?:suite|ste|unit|apt)\s+.*$/i, '').split(' ')
    .filter(Boolean)
    .map(token => suffixes.get(token) || token).join(' ')
    .trim();
  const digits = value => String(value || '').replace(/\D/g, '');

  function createZip3(value) {
    let zip = digits(value);
    if (!zip) return '';
    if (zip.length > 5) zip = zip.slice(0, 5);
    zip = zip.padStart(5, '0');
    return `${zip.slice(0, 3)}*`;
  }

  function wildcardWords(value, kind) {
    let words = (kind === 'address' ? normalizeAddress(value) : normalizeWords(value)).split(' ').filter(Boolean);
    if (kind === 'address') words = words.filter(word => !['suite', 'ste', 'unit', 'apt'].includes(word));
    return words.map((word, index) => {
      if (kind === 'address' && index === 0 && /^\d+$/.test(word)) return word;
      if (word.length <= 3) return word;
      return word.slice(0, Math.max(2, Math.min(word.length, kind === 'banner' ? 4 : 5)));
    }).join('*') + (words.length ? '*' : '');
  }

  function normalizeSource(raw) {
    const combinedPhone = `${raw.areaCode || ''}${raw.phone || ''}`;
    const phoneDigits = digits(combinedPhone);
    return {
      ...raw,
      slId: cleanText(raw.slId),
      bannerName: cleanText(raw.bannerName),
      bannerKey: normalizeWords(raw.bannerName),
      address: cleanText(raw.address),
      addressKey: normalizeAddress(raw.address),
      city: cleanText(raw.city),
      cityKey: normalizeWords(raw.city),
      zip: cleanText(raw.zip),
      zip3: createZip3(raw.zip),
      storeNumber: cleanText(raw.storeNumber),
      storeKey: normalizeWords(raw.storeNumber),
      phone10: phoneDigits.length >= 10 ? phoneDigits.slice(-10) : '',
      phone7: phoneDigits.length >= 7 ? phoneDigits.slice(-7) : ''
    };
  }

  function createSearchPlan(raw) {
    const source = normalizeSource(raw);
    const bannerWildcard = wildcardWords(source.bannerName, 'banner');
    const addressWildcard = wildcardWords(source.address, 'address');
    const candidates = [
      source.bannerKey && source.zip3 && { type: 'banner-exact-zip', label: 'Exact banner + ZIP3', fields: { banner: source.bannerName, zip: source.zip3 } },
      bannerWildcard && source.zip3 && { type: 'banner-wildcard-zip', label: 'Wildcard banner + ZIP3', fields: { banner: bannerWildcard, zip: source.zip3 } },
      addressWildcard && source.city && { type: 'address-city', label: 'Wildcard address + city', fields: { address: addressWildcard, city: source.city } },
      addressWildcard && source.zip3 && { type: 'address-zip', label: 'Wildcard address + ZIP3', fields: { address: addressWildcard, zip: source.zip3 } },
      source.phone7 && { type: 'phone', label: 'Last 7 phone digits', fields: { phone: source.phone7 } },
      source.storeNumber && bannerWildcard && { type: 'store-banner', label: 'Store number + wildcard banner', fields: { storeNumber: source.storeNumber, banner: bannerWildcard } }
    ].filter(Boolean);
    const seen = new Set();
    return candidates.filter(query => {
      const signature = JSON.stringify(query.fields);
      if (seen.has(signature)) return false;
      seen.add(signature);
      query.id = `${query.type}:${signature}`;
      return true;
    });
  }

  const includesAddress = (a, b) => a && b && (a === b || a.includes(b) || b.includes(a));

  function classify(source, candidate) {
    const other = normalizeSource(candidate);
    const rules = [];
    const fieldMatches = {};
    let score = 0;
    const sameBanner = !!(source.bannerKey && source.bannerKey === other.bannerKey);
    const sameStore = !!(source.storeKey && source.storeKey === other.storeKey);
    if (sameBanner) { rules.push('Same standardized banner name'); fieldMatches.bannerName=true; score+=15; }
    if (sameStore) { rules.push('Same store number'); fieldMatches.storeNumber=true; score+=20; }
    const sameAddress = includesAddress(source.addressKey, other.addressKey);
    if (sameAddress) { const exactAddress=source.addressKey===other.addressKey; rules.push(exactAddress?'Same standardized address':'Same or partial standardized address'); fieldMatches.address=true; score+=exactAddress?25:15; }
    if (sameAddress && sameStore) rules.push('Same address and store number');
    for (const [field,key,points,label] of [['city','cityKey',10,'Same city'],['state','stateKey',10,'Same state']]) {
      if(source[key]&&source[key]===other[key]){fieldMatches[field]=true;score+=points;rules.push(label);}
    }
    const sourceZip=digits(source.zip).slice(0,5);const otherZip=digits(other.zip).slice(0,5);
    if(sourceZip&&sourceZip===otherZip){fieldMatches.zip=true;score+=10;rules.push('Same ZIP');}
    const samePhone10=!!(source.phone10&&source.phone10===other.phone10);
    const samePhone7=!!(source.phone7&&source.phone7===other.phone7);
    if(samePhone10){fieldMatches.phone=true;score+=20;rules.push('Same area code and last seven phone digits');}
    else if(samePhone7){fieldMatches.phone7=true;score+=10;rules.push('Same last seven phone digits (different or missing area code)');}
    const directReason=samePhone10?'Same full 10-digit phone':sameBanner&&sameStore?'Same banner and store number':'';
    const directMatch=!!directReason;
    const scorePercent=Math.min(100,Math.round(score/110*100));
    const classification=directMatch?'Direct Duplicate':scorePercent>=80?'Exact Duplicate':scorePercent>=60?'High-Confidence Duplicate':rules.length?'Partial Duplicate — Review Required':'';
    return { rules, classification, directMatch, directReason, score, scorePercent, fieldMatches };
  }

  function consolidateCandidates(rawSource, observations) {
    const source = normalizeSource(rawSource);
    const grouped = new Map();
    observations.forEach(observation => {
      const candidate = observation.candidate || observation;
      if (source.slId && cleanText(candidate.slId).toLowerCase() === source.slId.toLowerCase()) return;
      const judged = classify(source, candidate);
      if (!judged.classification) return;
      const normalized = normalizeSource(candidate);
      const key = normalized.slId
        ? `id:${normalized.slId.toLowerCase()}`
        : `fallback:${normalized.bannerKey}|${normalized.addressKey}|${normalized.storeKey}|${normalized.phone7}`;
      const current = grouped.get(key) || { key, candidate: { ...candidate, copyFields:[...(candidate.copyFields || [])] }, classification: judged.classification, directMatch:judged.directMatch, directReason:judged.directReason, score:judged.score, scorePercent:judged.scorePercent, fieldMatches:judged.fieldMatches, matchedRules: [], queries: [] };
      const existingFields = new Map((current.candidate.copyFields || []).map(item => [item.header, item]));
      (candidate.copyFields || []).forEach(item => { if (item?.header && item.value && !existingFields.has(item.header)) existingFields.set(item.header, item); });
      current.candidate.copyFields = [...existingFields.values()];
      if (judged.directMatch || judged.score > current.score) Object.assign(current,{classification:judged.classification,directMatch:judged.directMatch,directReason:judged.directReason,score:judged.score,scorePercent:judged.scorePercent,fieldMatches:judged.fieldMatches});
      current.matchedRules = [...new Set([...current.matchedRules, ...judged.rules])];
      current.queries = [...new Set([...current.queries, observation.queryId].filter(Boolean))];
      grouped.set(key, current);
    });
    return [...grouped.values()].sort((a,b)=>Number(b.directMatch)-Number(a.directMatch)||b.score-a.score||String(a.candidate.slId||'').localeCompare(String(b.candidate.slId||'')));
  }

  const formatTdCopy = candidate => cleanText(candidate?.slId);
  const formatFullCopy = candidate => {
    const fields = candidate?.copyFields || [];
    if (fields.length) return fields.filter(item => item?.header && item.value != null && String(item.value).trim()).map(item => `${cleanText(item.header)}: ${cleanText(item.value)}`).join('\n');
    return [['SL_ID',candidate?.slId],['SL_STORE_NAME',candidate?.bannerName],['SL_STORE_NUMBER',candidate?.storeNumber],['SL_PA_LINE1',candidate?.address],['SL_PA_CITY_NAME',candidate?.city],['SL_PA_STATE_CODE',candidate?.state],['SL_PA_POSTAL_CODE',candidate?.zip],['PHONE',candidate?.phone]].filter(([,v]) => cleanText(v)).map(([h,v]) => `${h}: ${cleanText(v)}`).join('\n');
  };

  return { cleanText, normalizeWords, normalizeAddress, createZip3, wildcardWords, normalizeSource, createSearchPlan, consolidateCandidates, formatTdCopy, formatFullCopy };
});
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PickerRunController = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const timeout = (promise, ms, onTimeout) => Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => { onTimeout?.(); resolve({ status: 'incomplete', rows: [], diagnostic: `Timed out after ${Math.round(ms / 1000)} seconds` }); }, ms))
  ]);

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

    const publish = state => onState({ updatedAt: Date.now(), ...state });
    const awaitResume = () => paused ? new Promise(resolve => { resumeResolve = resolve; }) : Promise.resolve();

    async function start(plan) {
      if (active) throw new Error('A duplicate check is already active');
      active = true; paused = false; cancelled = false;
      const startedAt = Date.now();
      const observations = [];
      try {
        publish({ status: 'running', progress: 0, total: plan.length, progressText: `Search 0 of ${plan.length}` });
        for (let index = 0; index < plan.length; index += 1) {
          if (cancelled || Date.now() - startedAt >= runTimeoutMs) break;
          await awaitResume();
          if (cancelled) break;
          const query = plan[index];
          publish({ status: 'waiting', progress: index + 1, total: plan.length, activeQuery: query, progressText: `Search ${index + 1} of ${plan.length}` });
          const remainingMs = Math.max(1, runTimeoutMs - (Date.now() - startedAt));
          const aborter = new AbortController();
          currentAborter = aborter;
          const result = await timeout(Promise.resolve().then(() => adapter(query, { signal: aborter.signal })), Math.min(queryTimeoutMs, remainingMs), () => aborter.abort());
          currentAborter = null;
          observations.push({ queryId: query.id, query, ...result });
          publish({ status: 'running', progress: index + 1, total: plan.length, observations, progressText: `Search ${index + 1} of ${plan.length}` });
          if (index < plan.length - 1 && !cancelled) await wait(safetyDelayMs);
        }
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
      pause() { if (active) { paused = true; publish({ status: 'paused' }); } },
      resume() { if (active && paused) { paused = false; if (resumeResolve) resumeResolve(); resumeResolve = null; publish({ status: 'running' }); } },
      cancel() { cancelled = true; paused = false; currentAborter?.abort(); if (resumeResolve) resumeResolve(); resumeResolve = null; publish({ status: 'cancelled' }); },
      isActive() { return active; }
    };
  }

  return { createRunController };
});
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PickerSemanticDiscovery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ALIASES = {
    slId: ['slid','sourceid'], storeStatus: ['storestatus','status'], bannerName: ['slstorename','storename','tdlinxstorename','banner','bannername'],
    storeNumber: ['slstorenumber','storenumber','store','tdlinxstorenumber'], address: ['slpaline1','streetaddress','accstreetaddress','address','addressline'],
    city: ['slpacityname','city'], state: ['slpastatecode','state','statecode'], zip: ['slpapostalcode','postalcode','zipcode','zip'],
    areaCode: ['phoneareacode','areacode'], phone: ['phone','phonenumber','telephone']
  };
  const normalizeSemanticName = value => String(value || '').replace(/[↑↓↕▲▼]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const canonicalFor = value => {
    const normalized = normalizeSemanticName(value);
    return Object.keys(ALIASES).find(key => ALIASES[key].includes(normalized));
  };
  function buildHeaderMap(headers) {
    const map = {};
    (headers || []).forEach((header, index) => { const key = canonicalFor(typeof header === 'object' ? (header.title || header.text || '') : header); if (key && map[key] == null) map[key] = index; });
    return map;
  }
  function scoreSourceTable(tableModel) {
    const map = buildHeaderMap(tableModel?.headers || []);
    let score = ['slId','bannerName','address','city','state','zip','storeNumber'].reduce((n, key) => n + (map[key] != null ? 3 : 0), 0);
    if (map.slId != null && map.bannerName != null) score += 8;
    if (tableModel?.highlightedRows === 1) score += 10;
    if (tableModel?.highlightedRows > 1) score -= 20;
    return score;
  }
  function selectHighlightedRow(rows) {
    const selected = (rows || []).filter(row => !!row.rowHighlight || Number(row.cellHighlights || 0) > 0 || row.ariaSelected === true);
    if (!selected.length) return { error:'no-highlighted-row', candidates:[] };
    if (selected.length > 1) return { error:'multiple-highlighted-rows', candidates:selected };
    return { row:selected[0] };
  }
  function extractCanonicalRow(headerMap, cells, headers) {
    const canonical = {};
    Object.entries(headerMap || {}).forEach(([key, index]) => { const value = String(cells?.[index] ?? '').replace(/\s+/g, ' ').trim(); if (value) canonical[key] = value; });
    if (canonical.areaCode || canonical.phone) canonical.phone = `${canonical.areaCode || ''}${canonical.phone || ''}`;
    delete canonical.areaCode;
    const usefulIndexes = new Set(Object.values(headerMap || {}));
    const copyFields = (headers || []).map((header, index) => ({ header:String(header || '').replace(/\s+/g,' ').trim(), value:String(cells?.[index] ?? '').replace(/\s+/g,' ').trim(), index })).filter(item => usefulIndexes.has(item.index) && item.header && item.value).map(({header,value})=>({header,value}));
    return { canonical, copyFields };
  }
  const FIELD_ALIASES = { banner:['banner','bannername','storename','tdlinxstorename'], storeNumber:['storenumber','store','tdlinxstorenumber'], address:['address','addressline','streetaddress'], city:['city'], state:['state','statecode'], zip:['zip','zipcode','postalcode'], phone:['phone','phonenumber','telephone'] };
  const methodWeight = { testid:100, forlabel:90, aria:85, container:70, label:70 };
  function chooseFieldCandidate(field, candidates) {
    const aliases = FIELD_ALIASES[field] || [field];
    const scored = (candidates || []).map(candidate => {
      const labels = (candidate.labels || []).map(normalizeSemanticName);
      const match = Math.max(0, ...labels.map(label => aliases.includes(label) ? 30 : aliases.some(a => label.includes(a) || a.includes(label)) ? 18 : 0));
      return { ...candidate, confidence:(methodWeight[candidate.method] || 0) + match };
    }).filter(x => x.confidence > 20).sort((a,b) => b.confidence-a.confidence);
    if (!scored.length) return { error:'field-not-found', candidates:[] };
    if (scored[1] && scored[1].confidence === scored[0].confidence) return { error:'ambiguous-field', candidates:scored.filter(x => x.confidence === scored[0].confidence) };
    return scored[0];
  }
  const text = el => String(el?.getAttribute?.('title') || el?.textContent || '').replace(/\s+/g,' ').trim();
  function discoverFieldControl(root, field) {
    if (!root?.querySelectorAll) return { error:'field-not-found', candidates:[] };
    const candidates = [];
    [...root.querySelectorAll('input:not([type="checkbox"]), textarea')].forEach(input => {
      const group = input.closest('.horizontalPanelMM, .form-group, [role="group"], .MuiGrid-container') || input.parentElement;
      const labels = [];
      const testid = input.getAttribute('data-testid') || '';
      if (testid) labels.push(testid.replace(/textfield|input/gi,''));
      if (input.labels) labels.push(...[...input.labels].map(text));
      ['aria-label','placeholder','name'].forEach(attr => { const v=input.getAttribute(attr); if(v) labels.push(v); });
      if (group) labels.push(...[...group.querySelectorAll('label,[title],.MuiFormLabel-root')].map(text));
      const checkbox = group?.querySelector('input[type="checkbox"]') || null;
      const method = testid && normalizeSemanticName(testid).includes('grid') ? 'testid' : input.labels?.length ? 'forlabel' : input.getAttribute('aria-label') ? 'aria' : 'container';
      candidates.push({ input, checkbox, labels, method });
    });
    return chooseFieldCandidate(field, candidates);
  }
  function elementHighlighted(element) {
    if (!element) return false;
    if (element.getAttribute?.('aria-selected') === 'true' || element.matches?.('.selected,.highlighted,.Mui-selected,[data-selected="true"]')) return true;
    return false;
  }
  const background = element => {
    const style=typeof getComputedStyle==='function'?getComputedStyle(element):element?.style;
    const value=String(style?.backgroundColor||'').replace(/\s+/g,'');
    return !value || value==='transparent' || value==='rgba(0,0,0,0)' ? '' : value;
  };
  const isSalientColor = value => {
    const rgb=String(value||'').match(/[\d.]+/g)?.slice(0,3).map(Number)||[];
    return rgb.length===3 && Math.max(...rgb)-Math.min(...rgb)>=70;
  };
  function inspectTable(table) {
    const headers = [...table.querySelectorAll('thead th')].map(cell => cell.getAttribute('title') || cell.querySelector('[title]')?.getAttribute('title') || text(cell));
    const elements=[...table.querySelectorAll('tbody tr')].filter(row=>row.querySelector('td'));
    const rowColors=elements.map(row=>[...row.querySelectorAll('td')].map(cell=>background(cell)||background(row)));
    const counts=new Map(); rowColors.flat().filter(Boolean).forEach(color=>counts.set(color,(counts.get(color)||0)+1));
    const dominant=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
    const rows = elements.map((row,index) => {
      const colors=rowColors[index].filter(Boolean); const colorCounts=new Map(); colors.forEach(c=>colorCounts.set(c,(colorCounts.get(c)||0)+1));
      const strongest=[...colorCounts.entries()].sort((a,b)=>b[1]-a[1])[0];
      const consistent=!!strongest && strongest[1]>=Math.max(2,Math.ceil(rowColors[index].length/2));
      const relativeHighlight=consistent && (strongest[0]!==dominant || (elements.length===1 && isSalientColor(strongest[0])));
      return { element:row, rowHighlight:elementHighlighted(row)||relativeHighlight, cellHighlights:relativeHighlight?strongest[1]:[...row.querySelectorAll('td')].filter(elementHighlighted).length, ariaSelected:row.getAttribute('aria-selected') === 'true' };
    });
    return { element:table, headers, rows, highlightedRows:rows.filter(r => r.rowHighlight || r.cellHighlights || r.ariaSelected).length };
  }
  function discoverSource(root) {
    const tables = [...(root || document).querySelectorAll('table')]
      .filter(table => !table.closest('.modal-content-cls,[role="dialog"]') && table.getAttribute('data-testid') !== 'manual-match-search-table')
      .map(inspectTable).sort((a,b) => scoreSourceTable(b)-scoreSourceTable(a));
    if (!tables.length || scoreSourceTable(tables[0]) < 12) return { error:'source-table-not-found' };
    if (tables[1] && scoreSourceTable(tables[1]) === scoreSourceTable(tables[0])) return { error:'ambiguous-source-table' };
    const selected = selectHighlightedRow(tables[0].rows);
    if (selected.error) return { ...selected, table:tables[0].element };
    const cells = [...selected.row.element.querySelectorAll('td')].map(text);
    return { ...extractCanonicalRow(buildHeaderMap(tables[0].headers), cells, tables[0].headers), table:tables[0].element, row:selected.row.element, method:'semantic-highlight' };
  }
  return { ALIASES, FIELD_ALIASES, normalizeSemanticName, buildHeaderMap, scoreSourceTable, selectHighlightedRow, extractCanonicalRow, chooseFieldCandidate, discoverFieldControl, inspectTable, discoverSource };
});
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PickerGsrsTableAdapter=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const SOURCE_XPATH="//*[@data-testid='manual-match-table']//table[contains(concat(' ', normalize-space(@class), ' '), ' table-wrap-cls ')]";
  const RESULTS_XPATH="//*[@data-testid='manual-match-search-table']";
  const TABLE_XPATH='/html/body/div[3]/div[3]/div/div[2]/div/div[4]/div/div/div[1]/table';
  const HEADER_XPATH=`${TABLE_XPATH}/thead`;
  const CLIENT_ROW_XPATH=`${TABLE_XPATH}/tbody/tr[1]`;
  const CANDIDATE_ROWS_XPATH=`${TABLE_XPATH}/tbody/tr[position() >= 2]`;
  const SELECTORS={source:'[data-testid="manual-match-table"] table.table-wrap-cls',results:'table[data-testid="manual-match-search-table"], [data-testid="manual-match-search-table"] table'};
  const normalize=value=>String(value||'').replace(/[↑↓↕▲▼]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const PROFILE_HEADERS={
    storeView:{slId:['SL_ID'],storeStatus:['STORE_STATUS'],bannerName:['SL_STORE_NAME'],storeNumber:['SL_STORE_NUMBER'],address:['SL_PA_LINE1'],city:['SL_PA_CITY_NAME'],state:['SL_PA_STATE_CODE'],zip:['SL_PA_POSTAL_CODE'],areaCode:['PHONE_AREA_CODE'],phone:['PHONE','SL_PHONE_NUMBER']},
    retailSync:{slId:['RS_ID'],storeStatus:['STORE_STATUS'],bannerName:['RS_STORE_NAME'],storeNumber:['RS_STORE_NUMBER'],address:['RS_PA_LINE1'],city:['RS_PA_CITY_NAME'],state:['RS_PA_STATE_CODE'],zip:['RS_PA_POSTAL_CODE'],areaCode:['PHONE_AREA_CODE'],phone:['RS_PHONE_NUMBER']}
  };
  const PROFILE_COLUMN_INDEXES={
    storeView:{slId:0,bannerName:2,storeNumber:3,address:4,city:5,state:6,zip:7,phone:8,areaCode:9},
    retailSync:{slId:0,bannerName:1,storeNumber:2,address:4,city:5,state:6,zip:7,areaCode:8,phone:9}
  };
  const normalizedProfiles=Object.fromEntries(Object.entries(PROFILE_HEADERS).map(([p,fields])=>[p,Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.map(normalize)]))]));
  function detectProfile(headers){const names=(headers||[]).map(normalize);const store=names.some(x=>x==='SLID'||x==='SLSTORENAME');const retail=names.some(x=>x==='RSID'||x==='RSSTORENAME');return store&&retail?'ambiguous':store?'storeView':retail?'retailSync':'unknown';}
  function buildProfileHeaderMap(headers,profile){const aliases=normalizedProfiles[profile]||normalizedProfiles.storeView;const names=(headers||[]).map(normalize);const map={};for(const [field,values] of Object.entries(aliases)){const index=names.findIndex(x=>values.includes(x));if(index>=0)map[field]=index;}return map;}
  function hasStableLayout(headers,profile){const names=(headers||[]).map(normalize);const indexes=PROFILE_COLUMN_INDEXES[profile];const aliases=normalizedProfiles[profile];return !!(indexes&&aliases&&['slId','bannerName','storeNumber'].every(field=>aliases[field]?.includes(names[indexes[field]])));}
  function findScopedTable(root,kind='source'){const selector=SELECTORS[kind];const matches=[...(root||document).querySelectorAll(selector)];if(matches.length===1)return{table:matches[0]};return{error:matches.length?`multiple-${kind}-tables`:`${kind}-table-not-found`,count:matches.length};}
  const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
  function extractRow(headers,cells,profile){const headerMap=buildProfileHeaderMap(headers,profile);const map=hasStableLayout(headers,profile)?PROFILE_COLUMN_INDEXES[profile]:headerMap;const row={};for(const [field,index] of Object.entries(map)){const value=clean(cells[index]);if(value)row[field]=value;}for(const [field,index] of Object.entries(headerMap)){if(!row[field]){const value=clean(cells[index]);if(value)row[field]=value;}}
    const names=headers.map(normalize);const phoneAliases=normalizedProfiles[profile]?.phone||[];const phoneValues=names.map((name,index)=>phoneAliases.includes(name)?clean(cells[index]):'').filter(Boolean);if(phoneValues.length)row.phone=phoneValues.find(value=>String(value).replace(/\D/g,'').length>=7)||phoneValues[0];
    const area=String(row.areaCode||'').replace(/\D/g,'');const phone=String(row.phone||'').replace(/\D/g,'');
    if(area||phone)row.phone=phone.startsWith(area)&&area?phone:`${area}${phone}`;delete row.areaCode;
    const allAliases=new Set(Object.values(normalizedProfiles[profile]||{}).flat());const useful=new Set(names.map((name,index)=>allAliases.has(name)?index:-1).filter(index=>index>=0));row.copyFields=headers.map((header,index)=>({header:clean(header),value:clean(cells[index]),index})).filter(x=>useful.has(x.index)&&x.header&&x.value).map(({header,value})=>({header,value}));return row;}
  function modelFromTable(table){if(Array.isArray(table?.headers)&&Array.isArray(table?.rows))return table;const headers=[...table.querySelectorAll('thead th')].map(cell=>clean(cell.getAttribute('title')||cell.querySelector('[title]')?.getAttribute('title')||cell.textContent));const rows=[...table.querySelectorAll('tbody tr')].filter(row=>row.querySelector('td')).map(row=>[...row.querySelectorAll('td')].map(cell=>clean(cell.textContent)));return{headers,rows};}
  function modelFromConfiguredXpaths(root){const doc=root?.ownerDocument||root;if(!doc?.evaluate)return null;const XR=doc.defaultView?.XPathResult||globalThis.XPathResult;if(!XR)return null;const first=xpath=>doc.evaluate(xpath,doc,null,XR.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue;const table=first(TABLE_XPATH);const header=first(HEADER_XPATH);const client=first(CLIENT_ROW_XPATH);if(!table||!header||!client)return null;const headers=[...header.querySelectorAll('th')].map(cell=>clean(cell.getAttribute('title')||cell.querySelector('[title]')?.getAttribute('title')||cell.textContent));const rowCells=row=>[...row.querySelectorAll('td')].map(cell=>clean(cell.textContent));const result=doc.evaluate(CANDIDATE_ROWS_XPATH,doc,null,XR.ORDERED_NODE_SNAPSHOT_TYPE,null);const candidates=[];for(let i=0;i<result.snapshotLength;i++)candidates.push(rowCells(result.snapshotItem(i)));return{headers,rows:[rowCells(client),...candidates]};}
  function extractSourceAndCandidates(table,requestedProfile){const model=modelFromTable(table);if(!model.headers.length)return{error:'source-headers-not-found'};const detected=detectProfile(model.headers);const effective=requestedProfile==='custom'?'storeView':requestedProfile||detected;if(detected==='unknown'||detected==='ambiguous')return{error:`profile-${detected}`};if(effective!==detected)return{error:'profile-mismatch',detectedProfile:detected,requestedProfile};if(!model.rows.length)return{error:'source-row-not-found'};const rows=model.rows.map(cells=>extractRow(model.headers,cells,detected));return{profile:detected,headers:model.headers,source:rows[0],candidates:rows.slice(1),sourceRowCount:model.rows.length,initialCandidateCount:Math.max(0,model.rows.length-1)};}
  function extractFromDocument(root,requestedProfile){const configured=modelFromConfiguredXpaths(root);if(configured)return extractSourceAndCandidates(configured,requestedProfile);const scoped=findScopedTable(root,'source');if(scoped.error)return scoped;return extractSourceAndCandidates(scoped.table,requestedProfile);}
  function mergeCustomExtraction(extraction,overrides){const source={...(extraction?.source||{})};for(const [key,value] of Object.entries(overrides||{})){if(String(value||'').trim())source[key]=value;}return{...extraction,source};}
  const sourceSignature=extraction=>JSON.stringify([extraction?.profile,extraction?.source?.slId,extraction?.source?.bannerName,extraction?.source?.storeNumber,extraction?.source?.address,extraction?.source?.zip]);
  return{SOURCE_XPATH,RESULTS_XPATH,TABLE_XPATH,HEADER_XPATH,CLIENT_ROW_XPATH,CANDIDATE_ROWS_XPATH,SELECTORS,PROFILE_HEADERS,PROFILE_COLUMN_INDEXES,detectProfile,buildProfileHeaderMap,hasStableLayout,findScopedTable,extractRow,extractSourceAndCandidates,extractFromDocument,mergeCustomExtraction,sourceSignature};
});
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PickerManualMatchAdapter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const Semantic = typeof PickerSemanticDiscovery !== 'undefined' ? PickerSemanticDiscovery : (typeof require === 'function' ? require('./semantic-discovery') : null);
  const Gsrs = typeof PickerGsrsTableAdapter !== 'undefined' ? PickerGsrsTableAdapter : (typeof require === 'function' ? require('./gsrs-table-adapter') : null);
  const FIELD_CONTROLS = {
    banner: { checkbox: 'grid-1-checkbox', input: 'grid-1-textfield' },
    storeNumber: { checkbox: 'grid-2-checkbox', input: 'grid-2-textfield' },
    address: { checkbox: 'grid-3-checkbox', input: 'grid-3-textfield' },
    city: { checkbox: 'grid-4-checkbox', input: 'grid-4-textfield' },
    state: { checkbox: 'grid-5-checkbox', input: 'grid-5-textfield' },
    zip: { checkbox: 'grid-6-checkbox', input: 'grid-6-textfield' },
    phone: { checkbox: 'grid-12-checkbox', input: 'grid-12-textfield' }
  };
  const PROFILE_CONTROLS = {
    storeView: FIELD_CONTROLS,
    retailSync: {
      banner:{checkbox:'grid-2-checkbox',input:'grid-2-textfield'}, storeNumber:{checkbox:'grid-9-checkbox',input:'grid-9-textfield'},
      address:{checkbox:'grid-3-checkbox',input:'grid-3-textfield'}, city:{checkbox:'grid-4-checkbox',input:'grid-4-textfield'},
      state:{checkbox:'grid-5-checkbox',input:'grid-5-textfield'}, zip:{checkbox:'grid-6-checkbox',input:'grid-6-textfield'},
      phone:{checkbox:'grid-10-checkbox',input:'grid-10-textfield'}
    }
  };

  const controlsForQuery = (query, profile = 'storeView') => Object.entries(query.fields || {}).map(([key, value]) => ({ key, ...(PROFILE_CONTROLS[profile] || FIELD_CONTROLS)[key], value })).filter(item => item.input);
  const rowFromCells = (cells, headers = []) => {
    if (headers.length && Semantic) {
      const extracted = Semantic.extractCanonicalRow(Semantic.buildHeaderMap(headers), cells, headers);
      return { ...extracted.canonical, copyFields: extracted.copyFields };
    }
    const names = headers.map(value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
    const valueFor = (...keys) => { const index = names.findIndex(name => keys.includes(name)); return index >= 0 ? cells[index] || '' : ''; };
    if (names.length) return {
      slId: valueFor('SLID'), storeStatus: valueFor('STORESTATUS'), bannerName: valueFor('SLSTORENAME','STORENAME'),
      storeNumber: valueFor('SLSTORENUMBER','STORENUMBER'), address: valueFor('SLPALINE1','STREETADDRESS'),
      city: valueFor('SLPACITYNAME','CITY'), state: valueFor('SLPASTATECODE','STATE'), zip: valueFor('SLPAPOSTALCODE','POSTALCODE','ZIP'),
      phone: `${valueFor('PHONEAREACODE','AREACODE')}${valueFor('PHONE','PHONENUMBER')}`
    };
    return { slId: cells[0] || '', storeStatus: cells[1] || '', bannerName: cells[2] || '', storeNumber: cells[3] || '', address: cells[4] || '', city: cells[5] || '', state: cells[6] || '', zip: cells[7] || '' };
  };

  const evaluate = (xpath, context) => {
    const doc = context?.ownerDocument || context || document;
    return doc.evaluate(xpath, context || doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  };
  const findDialog = () => typeof document === 'undefined' ? null : evaluate("//div[contains(@class,'modal-content-cls')][.//*[@data-testid='modal-title' and normalize-space()='MANUAL MATCH']]", document);
  const byTestId = (dialog, id) => dialog?.querySelector(`[data-testid="${id}"]`);

  const controlMatchesField = (input, key) => {
    const aliases=Semantic?.FIELD_ALIASES?.[key] || [key];
    const values=['id','name','aria-label'].map(name=>input?.getAttribute?.(name)).filter(Boolean);
    if (input?.labels) values.push(...[...input.labels].map(label=>label.textContent));
    const container=input?.closest?.('.MuiGrid-item, .MuiFormControl-root, label, [role="group"]');
    if(container?.textContent) values.push(container.textContent);
    return values.map(Semantic?.normalizeSemanticName || (value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,''))).some(value=>aliases.includes(value));
  };

  const discoverControl = (dialog, key, profile = 'storeView') => {
    const fixed = (PROFILE_CONTROLS[profile] || FIELD_CONTROLS)[key];
    const input = fixed && byTestId(dialog, fixed.input);
    const checkbox = fixed && byTestId(dialog, fixed.checkbox);
    if (input && checkbox && controlMatchesField(input,key)) return { input, checkbox, method:'verified-testid', confidence:100 };
    const semantic = Semantic?.discoverFieldControl(dialog, key);
    if (semantic && !semantic.error && semantic.input && semantic.checkbox) return semantic;
    return semantic || { error:'field-not-found' };
  };

  function setInputValue(input, value) {
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(input, value); else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function prepareQuery(query, options = {}) {
    const dialog = findDialog();
    if (!dialog) return { ok: false, diagnostic: 'Manual Match dialog not open' };
    const profile = options.profile === 'retailSync' ? 'retailSync' : 'storeView';
    Object.keys(FIELD_CONTROLS).forEach(key => {
      const { checkbox, input } = discoverControl(dialog, key, profile);
      if (checkbox?.checked) checkbox.click();
      if (input) setInputValue(input, '');
    });
    for (const control of controlsForQuery(query, profile)) {
      const found = discoverControl(dialog, control.key, profile);
      const { checkbox, input } = found;
      if (!checkbox || !input) return { ok: false, diagnostic: found.error === 'ambiguous-field' ? `Multiple ${control.key} fields matched; search stopped safely` : `Required ${control.key} control not found` };
      if (!checkbox.checked) checkbox.click();
      setInputValue(input, control.value);
      if (!checkbox.checked) return { ok:false, diagnostic:`${control.key} checkbox did not stay selected` };
      if (String(input.value).trim() !== String(control.value).trim()) return { ok:false, diagnostic:`${control.key} value was not accepted by the form` };
    }
    return { ok: true, dialog, controlsVerified:true };
  }

  const tableSignature = dialog => {
    const table = byTestId(dialog, 'manual-match-search-table');
    return table ? `${table.querySelectorAll('tbody tr').length}|${table.textContent.replace(/\s+/g, ' ').trim()}` : 'missing';
  };
  const resultObservationRoot = dialog => byTestId(dialog, 'manual-match-search-table')?.parentElement || byTestId(dialog, 'manual-match-search-table');
  const isResultActivity = (records, resultRoot) => !!resultRoot && (records || []).some(record => resultRoot.contains?.(record.target));

  function extractRows(dialog = findDialog()) {
    const table = byTestId(dialog, 'manual-match-search-table');
    if (!table) return [];
    const headers = [...table.querySelectorAll('thead th')].map(cell => cell.textContent.replace(/\s+/g, ' ').trim());
    const profile = Gsrs?.detectProfile(headers);
    return [...table.querySelectorAll('tbody tr')].filter(row => row.querySelector('td')).map(row => {
      const cells=[...row.querySelectorAll('td')].map(cell => cell.textContent.replace(/\s+/g, ' ').trim());
      return profile === 'storeView' || profile === 'retailSync' ? Gsrs.extractRow(headers,cells,profile) : rowFromCells(cells,headers);
    });
  }

  async function execute(query, options = {}) {
    const timeoutMs = options.timeoutMs || 30000;
    const stableMs = options.stableMs || 1500;
    const prepared = prepareQuery(query, { profile:options.profile });
    if (!prepared.ok) return { status: 'incomplete', rows: [], diagnostic: prepared.diagnostic };
    const dialog = prepared.dialog;
    const search = evaluate(".//button[@data-testid='search-button'][.//span[normalize-space()='Search']]", dialog);
    if (!search) return { status: 'incomplete', rows: [], diagnostic: 'Visible Search button not found' };
    const before = tableSignature(dialog);
    const startedAt = Date.now();
    if (query.__pickerSubmitted) return { status:'incomplete', rows:[], diagnostic:'Search was already submitted for this query' };
    query.__pickerSubmitted = true;
    search.click();
    return new Promise(resolve => {
      let finished = false;
      let lastSignature = before;
      let stableSince = 0;
      let sawMutation = false;
      let sawBusy = false;
      const finish = result => {
        if (finished) return;
        finished = true; clearInterval(timer); clearTimeout(deadline);
        observer?.disconnect(); resolve(result);
      };
      const check = () => {
        const liveDialog = findDialog();
        if (!liveDialog) return finish({ status: 'incomplete', rows: [], diagnostic: 'Manual Match dialog closed during search' });
        const signature = tableSignature(liveDialog);
        const busy = !!liveDialog.querySelector('[aria-busy="true"], .MuiCircularProgress-root, [role="progressbar"]') || search.disabled;
        if (busy) sawBusy = true;
        if (signature !== lastSignature) { lastSignature = signature; stableSince = Date.now(); }
        const changedOrEmpty = signature !== before || /displaying\s+0\s*-/i.test(liveDialog.textContent) || /no (?:rows|records|results)/i.test(liveDialog.textContent);
        const settledUnchanged = !busy && (sawMutation || sawBusy) && Date.now() - startedAt >= Math.max(750, stableMs);
        if (!busy && changedOrEmpty && !stableSince) stableSince = Date.now();
        if (!busy && !changedOrEmpty && settledUnchanged && !stableSince) stableSince = Date.now();
        if (!busy && (changedOrEmpty || settledUnchanged) && stableSince && Date.now() - stableSince >= stableMs) finish({ status: 'complete', rows: extractRows(liveDialog), diagnostic: '' });
      };
      const observationRoot=resultObservationRoot(dialog);
      const observer = typeof MutationObserver === 'undefined' || !observationRoot ? null : new MutationObserver(records => { if (isResultActivity(records,observationRoot)) sawMutation = true; check(); });
      observer?.observe(observationRoot, { childList: true, subtree: true, characterData: true, attributes: true });
      const timer = setInterval(check, 250);
      const deadline = setTimeout(() => finish({ status: 'incomplete', rows: [], diagnostic: `Result screen did not stabilize within ${Math.round(timeoutMs / 1000)} seconds` }), timeoutMs);
      options.signal?.addEventListener('abort', () => finish({ status: 'incomplete', rows: [], diagnostic: 'Search cancelled' }), { once: true });
    });
  }

  return { FIELD_CONTROLS, PROFILE_CONTROLS, controlsForQuery, rowFromCells, findDialog, controlMatchesField, discoverControl, prepareQuery, extractRows, resultObservationRoot, isResultActivity, execute };
});
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PickerBotLayout=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  function buildFullAddress(source={}) { return [source.address,source.city,source.state,source.zip].map(v=>String(v||'').trim()).filter(Boolean).join(', '); }
  function computePanelPlacement(anchor,panel,viewport,margin=12){
    const width=Math.min(panel.width,Math.max(0,viewport.width-margin*2));
    const height=Math.min(panel.height,Math.max(0,viewport.height-margin*2));
    const leftRoom=anchor.left-margin, rightRoom=viewport.width-anchor.right-margin;
    const above=anchor.top-margin, below=viewport.height-anchor.bottom-margin;
    let left,top;
    if (above >= height+10 || below >= height+10) {
      const anchorWidth=anchor.width ?? (anchor.right-anchor.left);
      left=clamp(anchor.left+anchorWidth/2-width/2,margin,viewport.width-width-margin);
      top=above>=height+10?anchor.top-height-10:anchor.bottom+10;
    } else {
      left=rightRoom>=leftRoom?anchor.right+10:anchor.left-width-10;
      left=clamp(left,margin,viewport.width-width-margin);
      const anchorHeight=anchor.height ?? (anchor.bottom-anchor.top);
      top=clamp(anchor.top+anchorHeight/2-height/2,margin,viewport.height-height-margin);
    }
    return {left,top,width,maxHeight:height};
  }
  return {buildFullAddress,computePanelPlacement};
});
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
        *{box-sizing:border-box}.shell{--accent:#2563eb;--accent-hover:#1d4ed8;--text:#111827;--muted:#64748b;--surface:#fff;--subtle:#f8fafc;--border:#e2e8f0;--success:#15803d;--warning:#b45309;--error:#b91c1c;position:relative;color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.bot{width:76px;height:84px;padding:0;border:0;background:transparent;cursor:pointer;filter:drop-shadow(0 8px 8px rgba(15,23,42,.18));transform-origin:50% 100%;animation:breathe 3s ease-in-out infinite}.bot:hover{transform:translateY(-2px)}.bot:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:8px}svg{overflow:visible}.body{fill:#f8fafc;stroke:#94a3b8;stroke-width:2}.face{fill:#1e293b}.eye{fill:white}.pupil{fill:var(--accent);transform:translate(var(--eye-x,0),var(--eye-y,0));transition:.08s}.ring{fill:none;stroke:var(--accent);stroke-width:3}.mouth{fill:none;stroke:#60a5fa;stroke-width:2.4;stroke-linecap:round}.antenna{transform-origin:38px 15px}.arm{fill:none;stroke:#94a3b8;stroke-width:5;stroke-linecap:round}
        .shell[data-state=running] .antenna,.shell[data-state=waiting] .antenna{animation:vibrate .18s infinite alternate}.shell[data-state=running] .ring,.shell[data-state=waiting] .ring{stroke-dasharray:9 5;animation:dash 1s linear infinite}.shell[data-state=completed] .bot{animation:nod .42s 2}.shell[data-state=completed] .ring{stroke:var(--success)}.shell[data-state=incomplete] .ring{stroke:var(--warning)}.shell[data-state=error] .ring{stroke:var(--error)}.shell[data-state=exiting] .bot{animation:panic-exit .7s ease-in forwards}.shell[data-state=exiting] .body{fill:#fef2f2;stroke:var(--error)}.shell[data-state=exiting] .face{fill:#450a0a}.shell[data-state=exiting] .ring{stroke:var(--error)}.shell.dragging .bot{animation:none;cursor:grabbing}
        .panel{display:none;position:fixed;width:min(430px,calc(100vw - 24px));max-height:calc(100vh - 24px);background:var(--surface);border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 12px 32px rgba(15,23,42,.16);overflow:hidden}.panel.open{display:flex;flex-direction:column}.head{min-height:56px;padding:10px 12px;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px}.logo{width:30px;height:30px;border-radius:6px;background:var(--accent);color:#fff;display:grid;place-items:center;font-size:11px;font-weight:750}.title{font-size:13px;font-weight:700}.sub{font-size:10px;color:var(--muted);margin-top:1px}.close{margin-left:auto;width:32px;padding:0;justify-content:center}.scroll{padding:12px;overflow:auto}.source{padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--subtle)}.source strong{display:block;font-size:13px;font-weight:650}.meta,.notice{font-size:10px;color:var(--muted);line-height:1.45;margin-top:4px;overflow-wrap:anywhere}.notice{padding:8px 10px;background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;border-radius:6px;margin:12px 0}.label{font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin:16px 0 6px}.fields,.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.field,.btn{min-height:34px;border:1px solid #cbd5e1;background:var(--surface);color:#334155;border-radius:6px;padding:7px 9px;font:600 10px inherit;cursor:pointer;text-align:left;transition:background .15s,border-color .15s}.btn{display:inline-flex;align-items:center;gap:6px}.btn svg{width:14px;height:14px;flex:none}.field span{display:block;font-size:8px;color:var(--muted);text-transform:uppercase;font-weight:650}.field b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}.field:hover,.btn:hover:not(:disabled){border-color:#94a3b8;background:#f1f5f9}.field:focus-visible,.btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.btn:disabled,.field:disabled{opacity:.48;cursor:not-allowed}.primary{background:var(--accent);border-color:var(--accent);color:#fff}.primary:hover:not(:disabled){background:var(--accent-hover);border-color:var(--accent-hover)}.progress{height:6px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin-top:8px}.fill{height:100%;width:0;background:var(--accent);transition:width .25s}.result{border:1px solid var(--border);border-left:3px solid var(--warning);border-radius:8px;padding:10px;margin-top:8px}.result.direct{border-left-color:var(--error);background:#fffafa}.result.exact{border-left-color:var(--success)}.result h4{font-size:11px;margin:0 0 5px;font-weight:650}.result p{font-size:10px;color:#526174;margin:3px 0}.result-actions{display:flex;gap:8px;margin-top:8px}.empty{border:1px dashed #cbd5e1;border-radius:8px;padding:16px;text-align:center;color:var(--muted);font-size:10px}.actions{padding:10px 12px;border-top:1px solid var(--border);background:var(--subtle);display:flex;justify-content:flex-end}.danger{color:var(--error);border-color:#fecaca}.dragging{user-select:none}@keyframes breathe{50%{transform:translateY(-2px)}}@keyframes vibrate{to{transform:rotate(5deg)}}@keyframes dash{to{stroke-dashoffset:-28}}@keyframes nod{50%{transform:rotate(4deg)}}@keyframes panic-exit{0%{transform:scale(1)}35%{transform:rotate(-7deg) scale(1.04)}100%{transform:translateY(72px) scale(.2);opacity:0}}
      </style>
      <div class="shell" data-state="ready">
        <button class="bot" title="Open Picker Bookmark v1" aria-label="Open Picker Bookmark v1">
          <svg viewBox="0 0 76 84" aria-hidden="true"><g class="antenna"><path d="M38 16V8" stroke="#64748b" stroke-width="4"/><circle cx="38" cy="6" r="5" fill="#38bdf8"/></g><path class="arm" d="M15 54L6 66M61 54L70 66"/><circle class="body" cx="38" cy="47" r="29"/><rect class="face" x="18" y="28" width="40" height="31" rx="13"/><ellipse class="eye" cx="30" cy="41" rx="7" ry="8"/><ellipse class="eye" cx="47" cy="41" rx="7" ry="8"/><circle class="pupil" cx="31" cy="42" r="3"/><circle class="pupil" cx="48" cy="42" r="3"/><path class="mouth" d="M32 51q6 6 12 0"/><circle class="ring" cx="38" cy="47" r="32"/></svg>
        </button>
        <section class="panel" aria-label="Picker Bookmark v1">
          <div class="head"><img class="logo" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAeASURBVFhH7Zfbj1tXFcbdNjNj+/jc7zefc3yZ8X3G9kw8k3gumYRMJ5kkQEgpJCqipKWkqWjS0kgol6IqbdJASwtp1QdoCYEHICAVqYDaKi0EFR1PlEKqooCAB5D6F/D8ob2PZyYZm4gH3mBLn2xZltfvrPWttZdjsf+fW47Iy17tKS1ovKv69VDzG6GWaYRauhLqmWZo13eHdutA6M0+FFqVbaGZbYZmrkVl5Se72hTaI5sjFdpUbnE6TJdm33UK06d53hPWR40Oz4tKuvZ7LWhCcspUolWAZJegVxdhbfwszLE90PJtqF4DqjcG1a9D8xvQAqIm9AzROPTMBIzsRhjZFszcJJWV3wSvshVuceY655Sk9eFjslN+WgvqSKkZcHoOnOJBcEehNfZBKX4MglmAoGUgGCOQrBIFk2wCWoFM5FaplHStq9EI0utC+gS6TiHskc1n18ePyW7tPcEqgNOyYOU0xMwk9OY9EJxaBGOO0IyIVhHizQArEF0A2V0DUNIrAGsQVn4KpCTr48cUp7rMmyNISS7ETAta41MUhtMy4I1hqv8GBCmHU2xfXR8/priVkCcBrQrUxj4amGhwSMXAgIzBQQVDQ0QqWDmgwVcgSAl4LQ8mZYHlbLC8Q8XLfgTRLQWRmWvBLkx31sePSXYEoI5+ApxVQkpOg9UymD56Ente/h6WXriAHc9fwK5vX0Buy16woreaCV7JIDOzD/NPX8TMiR+gffyHaJ/4Pqr7T0G2y1BoRgjEGDWmXWj3Aoh6NpRH5iHl55ASLTBiGnJQw5EbH2HhzLcw/fhpTD3yJOaOPwt/agdYyV8tB6dk4bWWMHX0OTQOnkHtvqcw9cR3sHTxH1C8OmSn3C3HKO2O/gB2MdTG9iIlB2CVgAIouTo+/9ZV+lkiZSDbvhtDCQ0pkZiysOoJUgZezSERV+GUW/DHpyE5o9j64jWowTj1yEp3kBa1hzf3AmilbaFS3A6GN5AiAIILJTuG+y9fh+RVYZYncc93fwTBGqEwpFWJaW82JsO5mDz4GBZOnYPkbcT8ix9AJXOF+KRrTDInrOGpXgB19JMh746BER2kZB9JwYXkV/GZS1cgZ8jnaSRYE7xVgDd7L/0OK3u3QJBAnJoHK3gwSnNon/4tLUEEEHUIGVZWvg+A2ToQsloOjOSCkT0agGRCDkbBqhkqRnQhZZrY/+t/Yv4bvwSnD4PhTQpwS4uaRTpJtdxUT4uSiWnlJ3sBrNaBkDg/SQCk9CpEkrSUEkQAggO9ugXbXngbzS+/hMXX/gi9uhUJRgZvrIMgMvK3zgmnQse22Q/AbO1fZkQbSdHpgSCZoMbkLZjNRcw//zY23Mkgt/QwFi/+HZnFQ0gkRfB6jprzdsOKDqN8qxdAKy8sk8CJLkA/iCRrwJn8OGbPvYkkbyMeF6DVtmH+5RuoPvASGM4Ap/i3hSAXmJnrA8Dr2ZCRfSSEtSyQ18GETEEIRCKlwZ3+NKZP/wIJVgerZZFkdXBGHhPHf4XmsTfAGcNgJZeWg5PdLsgKRIkOo38DkA/J0yYEi0IkeAuskcPk0W+Cs0aQFF0kkgq8LZ/DpidfRzyprJozmVJADNw8/g7a5z+CPDID0akif+95iHYZIvXGGoCe3dgPIBcmpfQqwBCrQ0iXsffSnyB6o4izOgbuvAvB9gfR+uolbLhjkJpP8JsYP3EZEyffwejR11H+0mtQhjdBykyifurPEJ0aBCO/akwyDc3bAcR5k0IQAM4pYenVq+DsYTBGBdqWk8juOoLaF8/Dmb0f6fkHKMTk2Q/hbj2E+MAApNJu6Jsfgeg1UHn8GgS7Al4nAJEnCICeHe8DoGVDUncCEOcJgEYBdrz6Plg9i4SchVD/AvyFQ2ifCzF7/m+YOnMN8TgPZ/ZBjB27jPhgHHJ5N9TmfXSZKT/2hy5AtjsrCtE0DPoAsARAdBDnDAoxlNLAKD52XriBhVc6mPv6b9D+2s8x/8pfsPNngFSYQfXwjxHsPIaB2B0oHfopSoffQOXRyyg+/BbKT7yP4pHr4I08BVjZJ+g0DJr9AUgLDnF6NwsmhjgDYqYBo7Ed+tgC1Mo8/LsPw5k7iA2xu6DV96BxchmcXUb50TdR+cp7kIbnoFZ3Qa0uQcxM0aWGQnSXGtklw6gvQCZcMd9KFogGkzIGEyIGE1L0Pi5gKCmC+GUowaH40E8w8exfEex7DrxTA8OqYASTXums7Eb7pU4AItERHTR6AVKqvxyn5tN6IIgnVtvzpjmR4E2wdhW8P4F4nAMj2KutSUVXuuwahB6NZtWv965kKdX7HQEYTKkU4D+HMJDkjZ6x3RdCy0FySgSgdyllpPSZlBpgQ1LqQkSZID64GSSC6IIQiJ67ow8I3S+zIL+vBg0oXvXc+vixWIyTUor3AfkSyQRR9LRrQSJFgagUEsinP0z+T7AqedroSaOUR8ajN6VVoPeAkq59yLKWvD76yhEZJf0MqwVXWDXosBpRlorXch1eX1G+I5hEw5GsQkekKnZEu9iR7FJHsssdySl3FKJ0taN4tSuSWzkb47jef0X/0+dfEVJKYXWYMOsAAAAASUVORK5CYII=" alt="Picker logo"><div><div class="title">Picker Bookmark v1</div><div class="sub">Store and Retail duplicate checks</div></div><button class="btn close" data-icon="close" aria-label="Close panel"></button></div>
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
      const googleQuery = [source.bannerName, source.address, source.city, source.state, source.zip].filter(Boolean).join(' ');
      $('.fill').style.width = total ? `${Math.min(100, progress / total * 100)}%` : '0%';
      $('.progress-text').textContent = state.activeQuery ? `${progress}/${total} — ${state.activeQuery.label}` : `${progress}/${total} — ${state.status || 'ready'}`;
      const busy=['running','waiting','paused'].includes(state.status); $('.run').disabled=busy||!source.bannerName; $('.google-search').disabled=!googleQuery; $('.retry').disabled=busy||state.status!=='incomplete'; $('.pause').disabled=!busy; setButtonLabel($('.pause'),state.status==='paused'?'Resume':'Pause'); $('.cancel').disabled=!busy;
      if (state.diagnostic) $('.notice').textContent=state.diagnostic;
      const results=$('.results'); results.textContent='';
      (state.results||[]).forEach((item,index)=>{ const candidate=item.candidate||item; const card=document.createElement('article'); card.className=`result ${item.directMatch?'direct':String(item.classification||'').startsWith('Exact')?'exact':''}`; card.innerHTML=`<h4></h4><p class="kind"></p><p class="where"></p><p class="why"></p><div class="result-actions"><button class="btn" data-icon="copy" data-result="td" data-index="${index}">TD Copy</button><button class="btn" data-icon="copy" data-result="full" data-index="${index}">Full Copy</button></div>`; card.querySelector('h4').textContent=candidate.bannerName||`SL_ID ${candidate.slId||'Unknown'}`; card.querySelector('.kind').textContent=item.classification||'Potential duplicate'; card.querySelector('.where').textContent=[candidate.address,candidate.city,candidate.state,candidate.zip].filter(Boolean).join(', '); card.querySelector('.why').textContent=(item.matchedRules||[]).join(' • '); decorateIcons(card); results.appendChild(card); });
      if (!(state.results||[]).length) { const empty=document.createElement('div');empty.className='empty';empty.textContent=state.status==='completed'?'No duplicates found.':'Run checks to see duplicate results.';results.appendChild(empty); }
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
      if(target.classList.contains('google-search')) { const source=state.source||{}; const query=[source.bannerName,source.address,source.city,source.state,source.zip].filter(Boolean).join(' '); if (!query) return; if(!controller.openExternal(`https://www.google.com/search?q=${encodeURIComponent(query)}`)) $('.notice').textContent='Allow popups to open Google Search.'; return; }
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
(function (root) {
  function launch() {
    const existing = window.__pickerBookmarkV1;
    if (existing) { existing.open(); return existing; }
    const lifecycle = root.PickerBookmarkLifecycle.create();
    const store = root.PickerBookmarkStore.create({ status:'ready',results:[],observations:[] });
    const controller = root.PickerBookmarkController.create({ document, window, store, lifecycle });
    const scanned = controller.scan();
    if (scanned?.error) {
      lifecycle.dispose(); store.destroy();
      window.alert(`Picker Bookmark v1: Store or Retail Manual Match table not found (${scanned.error}).`);
      return null;
    }
    const instance = { open(){ bot.open(); }, kill(){ bot.destroy(); } };
    const bot = root.PickerBookmarkBot.mount({ document, window, store, controller, lifecycle, onKilled(){ delete window.__pickerBookmarkV1; } });
    window.__pickerBookmarkV1 = instance;
    bot.open();
    return instance;
  }
  function kill() { window.__pickerBookmarkV1?.kill(); }
  root.PickerBookmarkV1 = { launch, kill };
  launch();
})(typeof globalThis !== 'undefined' ? globalThis : this);
