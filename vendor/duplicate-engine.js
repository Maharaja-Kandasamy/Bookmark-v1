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
  const addressNoise = new Set('street st road rd avenue ave av boulevard blvd drive dr lane ln highway hwy route rte court ct circle cir place pl terrace ter parkway pkwy way trail trl square sq expressway expy junction jct mount mt mountain mtn fort ft saint west w east e north n south s northeast ne northwest nw southeast se southwest sw'.split(' '));
  const normalizeBanner = value => normalizeWords(value)
    .replace(/\b(?:l\s+l\s+c|l\s+t\s+d|i\s+n\s+c)\b/g, ' ')
    .split(' ').filter(word => word && !['limited','ltd','inc','incorporated','llc','llp','plc','corp','corporation','co','company'].includes(word)).join(' ');
  const digits = value => String(value || '').replace(/\D/g, '');

  function createZip3(value) {
    let zip = digits(value);
    if (!zip) return '';
    if (zip.length > 5) zip = zip.slice(0, 5);
    zip = zip.padStart(5, '0');
    return `${zip.slice(0, 3)}*`;
  }

  function wildcardWords(value, kind) {
    let words = (kind === 'address' ? normalizeAddress(value) : kind === 'banner' ? normalizeBanner(value) : normalizeWords(value)).split(' ').filter(Boolean);
    if (kind === 'address') words = words.filter(word => !addressNoise.has(word));
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
      bannerKey: normalizeBanner(raw.bannerName),
      address: cleanText(raw.address),
      addressKey: normalizeAddress(raw.address),
      city: cleanText(raw.city),
      cityKey: normalizeWords(raw.city),
      stateKey: normalizeWords(raw.state),
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
      if (!cleanText(current.candidate.storeStatus) && cleanText(candidate.storeStatus)) current.candidate.storeStatus = candidate.storeStatus;
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

  return { cleanText, normalizeWords, normalizeBanner, normalizeAddress, createZip3, wildcardWords, normalizeSource, createSearchPlan, consolidateCandidates, formatTdCopy, formatFullCopy };
});
