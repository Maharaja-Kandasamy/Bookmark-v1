(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PickerDuplicateEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const suffixes = new Map([
    ['street', 'st'], ['st', 'st'], ['road', 'rd'], ['rd', 'rd'],
    ['avenue', 'ave'], ['ave', 'ave'], ['boulevard', 'blvd'], ['blvd', 'blvd'],
    ['drive', 'dr'], ['dr', 'dr'], ['lane', 'ln'], ['ln', 'ln'],
    ['highway', 'hwy'], ['hwy', 'hwy'], ['route', 'rte'], ['rte', 'rte'], ['rt', 'rte'],
    ['west', 'w'], ['east', 'e'], ['north', 'n'], ['south', 's']
  ]);

  const cleanText = value => String(value ?? '').trim().replace(/\s+/g, ' ');
  const normalizeWords = value => cleanText(value).toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  function standaloneBuilding(value) {
    const match=/^(?:building|bldg)[.\s:#-]*(?:(?:no\.?|number)\s*)?(\d+[a-z]?(?:-\d+[a-z]?)?)[.\s]*$/i.exec(cleanText(value));
    return match?match[1].toLowerCase():'';
  }
  function hyphenatedDoor(value) {
    const text=cleanText(value).replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g,'-');
    const match=/^(\d+)\s*-\s*(\d+)(?:\s+([a-z])(?=\s+[a-z]{2,}))?(?:\s+(.+))?$/i.exec(text);
    if(!match)return null;
    const unit=match[3] && !/^[nsew]$/i.test(match[3])?match[3]:'';
    return {door:match[1]+'-'+match[2],unit,street:((match[3] && !unit?match[3]+' ':'')+(match[4] || '')).trim()};
  }
  function splitAddress(value) {
    const composite=hyphenatedDoor(value);
    const text = composite?.unit ? composite.door+' '+composite.street : cleanText(value);
    const building=standaloneBuilding(text);
    if(building)return {base:'building '+building,unitKey:''};
    const unit = /(?:#|\b(?:suite|ste|unit|apt|apartment|room|rm|floor|fl(?![.\s:#-]*(?:rout|route|rt|rte|hwy|highway|road|rd|sr|cr)[.\s-]*\d)|building|bldg)\b[.\s:#-]*)\s*([a-z0-9]+(?:-[a-z0-9]+)?)/i.exec(text);
    const base = (unit ? text.slice(0, unit.index) : text).trim();
    return { base, unitKey: composite?.unit ? normalizeWords(composite.unit) : unit ? normalizeWords(unit[1]) : '' };
  }
  const normalizeAddress = value => normalizeWords(splitAddress(value).base).split(' ')
    .filter(Boolean).map(token => suffixes.get(token) || token).join(' ').trim();
  const addressNoise = new Set('street st road rd avenue ave av boulevard blvd drive dr lane ln highway hwy route rte court ct circle cir place pl terrace ter parkway pkwy way trail trl square sq expressway expy junction jct mount mt mountain mtn fort ft saint us west w east e north n south s northeast ne northwest nw southeast se southwest sw'.split(' '));
  function inferStoreNumber(value) {
    const numbers = [...new Set([...cleanText(value).matchAll(/#\s*(\d+)(?![\da-z-])/gi)].map(match => match[1]))];
    return numbers.length === 1 ? numbers[0] : '';
  }
  const withoutBannerStoreNumber = value => cleanText(value).replace(/#\s*\d+(?![\da-z-])/gi, ' ');
  // Explicit brand aliases: never rewrite bare 711 or numbers inside other tokens.
  const brandSeparator = '[\\s._/\\\\&+\\u2010-\\u2015\\u2212\\uFE58\\uFE63\\uFF0D-]';
  const sevenElevenPattern = new RegExp('(^|[^a-z0-9])(?:7'+brandSeparator+'+11|7'+brandSeparator+'*eleven|seven'+brandSeparator+'*(?:eleven|11))(?=$|[^a-z0-9])','gi');
  const canonicalBanner = value => cleanText(value).replace(sevenElevenPattern, '$1'+'7 eleven');
  const normalizeBanner = value => normalizeWords(canonicalBanner(withoutBannerStoreNumber(value)).replace(/([a-z0-9])['\u2019]s\b/gi, '$1s'))
    .replace(/\b(?:l\s+l\s+c|l\s+t\s+d|i\s+n\s+c)\b/g, ' ')
    .replace(/\b([a-z0-9]+)\s+s\b/g, '$1s')
    .split(' ').filter(word => word && !['limited','ltd','inc','incorporated','llc','llp','plc','corp','corporation','co','company'].includes(word)).join(' ');

  // User-supplied vocabulary is comparison evidence, never an automatic identity.
  const bannerAbbreviations = [
    ['aafes','army air force exchange services'],['bdi','bulk data importer'],['billetins','military lodging'],
    ['bpoe','benevolent protective order of elks'],['bw3','buffalo wild wings'],['byob','bring your own booze','bring your own bottle'],
    ['cid','client information delivery'],['deca','defense commissary agency'],['dpv','delivery point validation'],
    ['dso','date of store opening'],['dsw','data specialist workbench'],['fmi','food marketing institute'],
    ['foe','fraternal order of eagles'],['fop','fraternal order of police'],['fte','full time employee'],
    ['hbc','health and beauty care'],['hq','headquarters'],['iga','independent grocers alliance'],
    ['ipc','information processing center'],['irt','immediate reports to'],['koa','kampgrounds of america'],
    ['koc','knights of columbus'],['mfr','mark for review'],['msw','matching specialist workbench'],
    ['nacds','national association of chain and drug stores'],['nacs','national association of convenience stores'],
    ['nexcom','navy exchange service command'],['nga','national grocery association'],['ogrds','one global reference data system'],
    ['otc','over the counter'],['otm','one to many'],['ouf','outlet updated frequency'],['phm','potential historical match'],
    ['plu','price look ups'],['pos','point of sale'],['px','army exchange'],['qc','quality check','quality control'],
    ['rv','recreational vehicle'],['rx','prescription'],['sla','service level agreement'],
    ['sop','standard operating procedure','standard operating proceedure'],['sow','statement of work'],
    ['tdo','trade dimensions operation'],['usps','united states postal services','united states postal service'],
    ['vfw','veterans of foreign wars'],['vss','verified store status source'],['al','american legion']
  ];
  function abbreviationBannerKey(value) {
    let text=' '+normalizeBanner(value).replace(/\band\b/g,' ').replace(/\s+/g,' ')+' ';
    for(const [short,...phrases] of bannerAbbreviations){
      for(const phrase of phrases){
        const normalized=normalizeBanner(phrase).replace(/\band\b/g,' ').replace(/\s+/g,' ').trim();
        text=text.split(' '+normalized+' ').join(' '+short+' ');
      }
    }
    return text.trim().replace(/\s+/g,' ');
  }
  const digits = value => String(value || '').replace(/\D/g, '');

  function normalizePostal(value) {
    const text = String(value ?? '').trim().replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-').replace(/\s*-\s*/g, '-');
    if (/^\d{1,5}$/.test(text)) return text.padStart(5, '0');
    const extended = text.match(/^(\d{1,5})-(\d{4})$/);
    if (extended) return `${extended[1].padStart(5, '0')}-${extended[2]}`;
    if (/^\d{6,9}$/.test(text)) {
      const full = text.padStart(9, '0');
      return `${full.slice(0, 5)}-${full.slice(5)}`;
    }
    return '';
  }

  function normalizeZip(value) {
    return normalizePostal(value).slice(0, 5);
  }

  function createZip3(value) {
    const zip = normalizeZip(value);
    return zip ? `${zip.slice(0, 3)}*` : '';
  }

  const highwayStates = [
    ['alabama','al'],['alaska','ak'],['arizona','az'],['arkansas','ar'],['california','ca'],
    ['colorado','co'],['connecticut','ct'],['delaware','de'],['florida','fl'],['georgia','ga'],
    ['hawaii','hi'],['idaho','id'],['illinois','il'],['indiana','in'],['iowa','ia'],
    ['kansas','ks'],['kentucky','ky'],['louisiana','la'],['maine','me'],['maryland','md'],
    ['massachusetts','ma'],['michigan','mi'],['minnesota','mn'],['mississippi','ms'],['missouri','mo'],
    ['montana','mt'],['nebraska','ne'],['nevada','nv'],['new hampshire','nh'],['new jersey','nj'],
    ['new mexico','nm'],['new york','ny'],['north carolina','nc'],['north dakota','nd'],['ohio','oh'],
    ['oklahoma','ok'],['oregon','or'],['pennsylvania','pa'],['rhode island','ri'],['south carolina','sc'],
    ['south dakota','sd'],['tennessee','tn'],['texas','tx'],['utah','ut'],['vermont','vt'],
    ['virginia','va'],['washington','wa'],['west virginia','wv'],['wisconsin','wi'],['wyoming','wy'],
    ['district of columbia','dc']
  ];
  const highwayStatePattern = highwayStates.flatMap(([name,code]) => [name,code,code.split('').join(' ')]).sort((a,b)=>b.length-a.length).join('|');
  const highwayPrefixPattern = `(?:${highwayStatePattern}|us|state|county|co|north|south|east|west|n|s|e|w)`;
  const numberedRoutePattern = new RegExp(`^(?:(\\d+[a-z]?)\\s+)?(?:${highwayPrefixPattern}\\s+)*(?:rout|route|rt|rte|hwy|highway|road|rd|sr|cr|interstate|i|us|${highwayStatePattern})\\s*(?:(?:us|${highwayStatePattern})\\s+)?(\\d+[a-z]?)\\b`);

  function addressSearchText(value) {
    const text=cleanText(value)
      .replace(/\b(street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln)(?=\d+(?:st|nd|rd|th)\s*(?:floor|fl))/gi,'$1 ')
      .replace(/\b(street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln)(?=(?:apt|apartment|suite|ste|unit)\s*[.#-]*\s*\d)/gi,'$1 ');
    const detail=/(?:^|\s)(?:(?:\d+(?:st|nd|rd|th)?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|ground|upper|lower)\s*(?:floor|fl)(?=$|[\s\d.,#-])|(?:basement|bsmt|bsmnt|cellar|ground floor|upper level|lower level)\b)(?!\s+(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln)\b)/i.exec(text);
    return detail && detail.index>0 ? text.slice(0,detail.index).trim() : text;
  }
  function addressSearchParts(value) {
    const base = normalizeWords(splitAddress(addressSearchText(value)).base).replace(/\bu\s+s\b/g, 'us');
    const numberedRoute = numberedRoutePattern.exec(base);
    if (numberedRoute) return {houseNumber: numberedRoute[1] || '', street: [numberedRoute[2]], numberedRoute: true};
    const words = base.split(' ').filter(Boolean);
    const houseIndex = words.findIndex(word => /^\d+[a-z]?$/.test(word));
    const houseNumber = houseIndex >= 0 ? words[houseIndex] : '';
    const street = [];
    const roadTypes = new Set('street st road rd avenue ave av boulevard blvd drive dr lane ln highway hwy route rte court ct circle cir place pl terrace ter parkway pkwy way trail trl square sq expressway expy junction jct'.split(' '));
    for (const word of words.slice(houseIndex >= 0 ? houseIndex + 1 : 0)) {
      if (roadTypes.has(word) && street.length) break;
      if (addressNoise.has(word) || ['county','co'].includes(word) || /^[a-z]$/.test(word)) continue;
      if (/^\d/.test(word) && street.length) break;
      street.push(word);
    }
    return {houseNumber, street};
  }
  function fallbackAddressNumber(value) {
    const text=cleanText(value);
    const locator=/^(?:#|(?:building|bldg|suite|ste|unit|apartment|apt|room|rm|floor|fl|lot|block|site|warehouse|hangar|kiosk|stall|office)[.\s:#-]*)(\d+)\b/i.exec(text);
    if(locator)return locator[1];
    const base=splitAddress(text).base;
    const numbers=[...new Set((base.match(/\d+/g) || text.match(/\d+/g) || []))];
    return numbers.length===1?numbers[0]:'';
  }
  const streetOrdinalWords = new Set('first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth thirteenth fourteenth fifteenth sixteenth seventeenth eighteenth nineteenth twentieth thirtieth fortieth fiftieth sixtieth seventieth eightieth ninetieth hundredth thousandth'.split(' '));
  function searchableStreetWords(street) {
    const tens=new Set('twenty thirty forty fifty sixty seventy eighty ninety'.split(' '));
    return street.filter((word,index)=>!/[0-9]/.test(word) && !streetOrdinalWords.has(word) && !(tens.has(word) && streetOrdinalWords.has(street[index+1])));
  }
  function addressWildcard(value) {
    const composite=hyphenatedDoor(value);
    if(composite){
      const {street}=addressSearchParts('1 '+composite.street);
      const words=searchableStreetWords(street).map(word=>word.slice(0,Math.max(1,word.length-2)));
      const door=composite.door.replace(/[^a-z0-9]+/gi,'*');
      return words.length?door+'*'+words.join('*')+'*':'*'+door+'*';
    }
    const box = /^(?:p\s*\.?\s*o\s*\.?\s*box|post\s+office\s+box|pobox)\s*[.:#-]*\s*(\d+)\b/i.exec(cleanText(value));
    if(box)return '*'+box[1]+'*';
    const building=standaloneBuilding(value);
    if(building)return '*'+building.split('-')[0]+'*';
    const {houseNumber,street,numberedRoute} = addressSearchParts(value);
    const letteredHouse = /^(\d+)[a-z]$/i.exec(houseNumber);
    const house = letteredHouse ? letteredHouse[1] : houseNumber ? houseNumber.slice(0, Math.max(1,houseNumber.length-(houseNumber.length>4?2:1))) : '';
    const placeholders=new Set('unknown unavailable invalid unspecified missing none null na not available provided address tbd'.split(' '));
    const usefulStreet=street.some(word=>/[a-z]/i.test(word) && !placeholders.has(word));
    if(!numberedRoute && /^\d/.test(cleanText(value)) && house && street.some(word=>/\d/.test(word)) && !usefulStreet)return '*'+house+'*';
    if(!numberedRoute && (!usefulStreet || (!houseNumber && /\d/.test(cleanText(value))))){
      const number=fallbackAddressNumber(value);
      return number?'*'+number+'*':'';
    }
    if (numberedRoute) return '*'+(house || street[0])+'*';
    const words = searchableStreetWords(street).map(word=>word.slice(0,Math.max(1,word.length-2)));
    if(house && !words.length)return '*'+house+'*';
    return [house,...words].filter(Boolean).join('*')+'*';
  }

  const bannerDescriptors = new Set('store stores cstore cstores convenience pump pumps hotel hotels motel motels dispensary dispensaries shop shops'.split(' '));

  // Remove operational suffix chunks only at explicit separators; keep named businesses intact.
  const bannerMetadataSuffixes = new Set(['fintech','fountain','draft','draught','on premise','on premises','off premise','off premises','eft','pos terminal','payment processing','merchant services']);
  function bannerSearchText(value) {
    const text=canonicalBanner(withoutBannerStoreNumber(value)).replace(/\b(?:store\s+)?status\s*[:=]\s*(?:open|op|closed|close|active|inactive|unverified|duplicate)\b/gi,' ').replace(/<[^>]*>/g,' ')
      .replace(/&(?:[a-z]+|#\d+|#x[a-f0-9]+);/gi,' ')
      .replace(/\b(?:https?:\/\/|www\.)\S+/gi,' ')
      .replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g,' ');
    const chunks=text.replace(/\S*\d\S*/g,word=>/^\W*bw3\W*$/i.test(word)?word:' ').split(/\s*[-\u2010-\u2015|;]\s*/);
    while(chunks.length>1 && bannerMetadataSuffixes.has(normalizeWords(chunks[chunks.length-1])))chunks.pop();
    return chunks.join(' ').replace(/\bfintech\b/gi,' ');
  }
  function bannerSearchWords(value) {
    const text = bannerSearchText(value).replace(/<[^>]*>/g, ' ')
      .replace(/&(?:[a-z]+|#\d+|#x[a-f0-9]+);/gi, ' ')
      .replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ')
      .replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g, ' ')
      .replace(/\bBW3\b/gi, ' bwthreeplaceholder ').replace(/\S*\d\S*/g, ' ').replace(/bwthreeplaceholder/g, 'bw3')
      .replace(/&/g, ' ');
    const searchable = normalizeWords(text).replace(/\b(?:(?:temporarily|temp|permanently|perm)\s+(?:close|closed)|(?:re\s+)?opening\s+soon|closing\s+soon|(?:now|currently)\s+(?:open|closed)|out\s+of\s+business|no\s+longer\s+operating)\b/g,' ');
    const words = searchable.split(' ').filter(word => word.length > 1 && !/^\d{7,}$/.test(word) && !['undefined','null','nan','and','close','closed','open','op','reopened'].includes(word));
    return normalizeBanner(words.join(' ')).split(' ').filter(word => word.length > 1 && !bannerDescriptors.has(word));
  }

  function wildcardWords(value, kind) {
    if (kind === 'address') return addressWildcard(value);
    if (kind === 'banner') {
      const numericBrand = cleanText(withoutBannerStoreNumber(value));
      if (/^\d+$/.test(numericBrand)) return `*${numericBrand}*`;
      const words = bannerSearchWords(value);
      if (!words.length) return '';
      const searchText = canonicalBanner(value).toLowerCase();
      const firstIndex = searchText.indexOf(words[0]);
      const leading = firstIndex > 0 && searchText.slice(0,firstIndex).trim() ? '*' : '';
      return leading + words.map(word => words.length === 1 ? word : word.slice(0,4)).join('*') + '*';
    }
    let words = (kind === 'address' ? normalizeAddress(value) : kind === 'banner' ? normalizeBanner(value) : normalizeWords(value)).split(' ').filter(Boolean);
    if (kind === 'address') words = words.filter(word => !addressNoise.has(word));
    return words.map((word, index) => {
      if (kind === 'address' && index === 0 && /^\d+$/.test(word)) return word;
      if (word.length <= 3) return word;
      return word.slice(0, Math.max(2, Math.min(word.length, kind === 'banner' ? 4 : 5)));
    }).join('*') + (words.length ? '*' : '');
  }

  function storeBannerWildcard(source) {
    let text=cleanText(source.bannerName)
      .replace(/<[^>]*>/g,' ')
      .replace(/^\s*[^a-z0-9]*(?:(?:store|business|banner)\s*name|banner|business|store|name)\s*[:=]\s*/i,'')
      .replace(/([A-Z]+)([A-Z][a-z])/g,'$1 $2')
      .replace(/([a-z])([A-Z])/g,'$1 $2')
      ;
    const tokens=[...text.matchAll(/[a-z0-9]+/gi)];
    const street=normalizeAddress(source.address).split(' ').filter(Boolean);
    // Remove an appended address only when it matches this client's address.
    if(street.length>1 && street.some(word=>/^\d/.test(word))){
      const normalized=tokens.map(token=>suffixes.get(token[0].toLowerCase()) || token[0].toLowerCase());
      for(let index=1;index<=tokens.length-street.length;index++){
        if(!street.every((word,offset)=>word===normalized[index+offset]))continue;
        const prefix=text.slice(0,tokens[index].index).trim();
        if(bannerSearchWords(prefix).length || /^\d+$/.test(cleanText(withoutBannerStoreNumber(prefix))))text=prefix;
        break;
      }
    }
    const wildcard=wildcardWords(text,'banner');
    if(wildcard)return wildcard;
    // Keep numeric brands when their only other words are removable descriptors.
    const numeric=normalizeBanner(text).split(' ').filter(word=>!bannerDescriptors.has(word)).join(' ');
    return /^\d/.test(text.trim()) && /^\d+$/.test(numeric)?'*'+numeric+'*':'';
  }

  function normalizeSource(raw) {
    const combinedPhone = `${raw.areaCode || ''}${raw.phone || ''}`;
    const phoneDigits = digits(combinedPhone);
    const explicitStoreNumber = cleanText(raw.storeNumber);
    const inferredStoreNumber = explicitStoreNumber ? '' : inferStoreNumber(raw.bannerName);
    const storeNumber = explicitStoreNumber || inferredStoreNumber;
    return {
      ...raw,
      slId: cleanText(raw.slId),
      bannerName: cleanText(raw.bannerName),
      bannerKey: normalizeBanner(raw.bannerName),
      abbreviationBannerKey: abbreviationBannerKey(raw.bannerName),
      address: cleanText(raw.address),
      addressKey: normalizeAddress(raw.address),
      unitKey: splitAddress(raw.address).unitKey,
      city: cleanText(raw.city),
      cityKey: normalizeWords(raw.city),
      stateKey: normalizeWords(raw.state),
      zip: normalizeZip(raw.zip),
      zip3: createZip3(raw.zip),
      storeNumber,
      storeNumberInferred: !!inferredStoreNumber || !!raw.storeNumberInferred,
      storeKey: normalizeWords(storeNumber),
      phone10: phoneDigits.length >= 10 ? phoneDigits.slice(-10) : '',
      phone7: phoneDigits.length >= 7 ? phoneDigits.slice(-7) : ''
    };
  }

  const wrapBannerSearch = value => value?'*'+value.replace(/^\*+|\*+$/g,'')+'*':'';
  function createSearchPlan(raw) {
    const source = normalizeSource(raw);
    const bannerWildcard = wrapBannerSearch(wildcardWords(source.bannerName, 'banner'));
    const addressWildcard = wildcardWords(source.address, 'address');
    const storeBanner = source.storeNumber ? wrapBannerSearch(storeBannerWildcard(source)) : '';
    const compositeDoor = hyphenatedDoor(source.address);
    const bannerNeedsWildcard = /[0-9]|[^a-z0-9\s]|\band\b/i.test(source.bannerName);
    const candidates = [
      bannerWildcard && source.city && { type: 'banner-city', label: 'Wildcard banner + city', fields: { banner: bannerWildcard, city: source.city } },
      !bannerNeedsWildcard && bannerWildcard && source.zip3 && { type: 'banner-exact-zip', label: 'Full banner words + ZIP3', fields: { banner: wrapBannerSearch(bannerSearchWords(source.bannerName).join('*')), zip: source.zip3 } },
      bannerWildcard && cleanText(source.state) && { type: 'banner-state', label: 'Wildcard banner + state', fields: { banner: bannerWildcard, state: cleanText(source.state) } },
      bannerWildcard && source.zip3 && { type: 'banner-wildcard-zip', label: 'Wildcard banner + ZIP3', fields: { banner: bannerWildcard, zip: source.zip3 } },
      addressWildcard && source.city && { type: 'address-city', label: 'Wildcard address + city', fields: { address: addressWildcard, city: source.city } },
      addressWildcard && cleanText(source.state) && { type: 'address-state', label: 'Wildcard address + state', fields: { address: addressWildcard, state: cleanText(source.state) } },
      addressWildcard && source.zip3 && { type: 'address-zip', label: 'Wildcard address + ZIP3', fields: { address: addressWildcard, zip: source.zip3 } },
      compositeDoor && {type:'address-door',label:'Full hyphenated door number',fields:{address:'*'+compositeDoor.door.replace(/[^a-z0-9]+/gi,'*')+'*',...(source.city?{city:source.city}:cleanText(source.state)?{state:cleanText(source.state)}:source.zip3?{zip:source.zip3}:{})}},
      source.phone7 && { type: 'phone', label: 'Last 7 phone digits', fields: { phone: source.phone7 } },
      source.storeNumber && storeBanner && { type: 'store-banner', label: 'Store number + main banner', fields: { storeNumber: source.storeNumber, banner: storeBanner } }
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

  const includesAddress = (a, b) => a && b && (a === b || (!/^building \d/.test(a) && !/^building \d/.test(b) && (a.includes(b) || b.includes(a))));

  function classify(source, other) {
    const rules = [];
    const fieldMatches = {};
    let score = 0;
    const sameBanner = !!(source.bannerKey && source.bannerKey === other.bannerKey);
    const abbreviationMatch = !sameBanner && !!(source.abbreviationBannerKey && source.abbreviationBannerKey === other.abbreviationBannerKey);
    const sameStore = !!(source.storeKey && source.storeKey === other.storeKey);
    if (sameBanner) { rules.push('Same standardized banner name'); fieldMatches.bannerName=true; score+=15; }
    if (abbreviationMatch) { rules.push('Equivalent banner abbreviation (review required)'); fieldMatches.bannerAbbreviation=true; score+=10; }
    if (sameStore) { rules.push('Same store number'); fieldMatches.storeNumber=true; score+=20; }
    const sameAddress = includesAddress(source.addressKey, other.addressKey);
    if (sameAddress) { const exactAddress=source.addressKey===other.addressKey; rules.push(exactAddress?'Same standardized address':'Same or partial standardized address'); fieldMatches.address=true; score+=exactAddress?25:15; }
    const exactUnitMatch = !!(source.addressKey && source.unitKey && source.unitKey === other.unitKey && source.addressKey === other.addressKey);
    if (exactUnitMatch) { score+=10; fieldMatches.unit=true; rules.push('Same full address and unit'); }
    if (source.unitKey && other.unitKey && source.unitKey !== other.unitKey) rules.push(`Different unit: ${other.unitKey.toUpperCase()} instead of ${source.unitKey.toUpperCase()}`);
    if (sameAddress && sameStore) rules.push('Same address and store number');
    for (const [field,key,points,label] of [['city','cityKey',10,'Same city'],['state','stateKey',10,'Same state']]) {
      if(source[key]&&source[key]===other[key]){fieldMatches[field]=true;score+=points;rules.push(label);}
    }
    const sourceZip=normalizeZip(source.zip);const otherZip=normalizeZip(other.zip);
    if(sourceZip&&sourceZip===otherZip){fieldMatches.zip=true;score+=10;rules.push('Same ZIP');}
    const samePhone10=!!(source.phone10&&source.phone10===other.phone10);
    const samePhone7=!!(source.phone7&&source.phone7===other.phone7);
    if(samePhone10){fieldMatches.phone=true;score+=20;rules.push('Same area code and last seven phone digits');}
    else if(samePhone7){fieldMatches.phone7=true;score+=10;rules.push('Same last seven phone digits (different or missing area code)');}
    const directReason=samePhone10?'Same full 10-digit phone':sameBanner&&sameStore?'Same banner and store number':'';
    const directMatch=!!directReason;
    const scorePercent=Math.min(100,Math.round(score/110*100));
    const classification=directMatch?'Direct Duplicate':scorePercent>=80?'Exact Duplicate':scorePercent>=60?'High-Confidence Duplicate':rules.length?'Partial Duplicate — Review Required':'';
    return { rules, classification, exactUnitMatch, directMatch, directReason, score, scorePercent, fieldMatches };
  }

  function consolidateCandidates(rawSource, observations) {
    const source = normalizeSource(rawSource);
    const grouped = new Map();
    observations.forEach(observation => {
      const candidate = observation.candidate || observation;
      if (source.slId && cleanText(candidate.slId).toLowerCase() === source.slId.toLowerCase()) return;
      const normalized = normalizeSource(candidate);
      const judged = classify(source, normalized);
      if (!judged.classification) return;
      const key = normalized.slId
        ? `id:${normalized.slId.toLowerCase()}`
        : `fallback:${normalized.bannerKey}|${normalized.addressKey}|${normalized.storeKey}|${normalized.phone7}`;
      const current = grouped.get(key) || { key, candidate: { ...candidate, copyFields:[...(candidate.copyFields || [])] }, classification: judged.classification, exactUnitMatch:judged.exactUnitMatch, directMatch:judged.directMatch, directReason:judged.directReason, score:judged.score, scorePercent:judged.scorePercent, fieldMatches:judged.fieldMatches, matchedRules: [], queries: [] };
      const existingFields = new Map((current.candidate.copyFields || []).map(item => [item.header, item]));
      (candidate.copyFields || []).forEach(item => { if (item?.header && item.value && !existingFields.has(item.header)) existingFields.set(item.header, item); });
      current.candidate.copyFields = [...existingFields.values()];
      if (!cleanText(current.candidate.storeStatus) && cleanText(candidate.storeStatus)) current.candidate.storeStatus = candidate.storeStatus;
      if ((judged.exactUnitMatch && !current.exactUnitMatch) || (judged.exactUnitMatch === current.exactUnitMatch && (Number(judged.directMatch) > Number(current.directMatch) || (judged.directMatch === current.directMatch && judged.score > current.score)))) {
        Object.assign(current,{classification:judged.classification,exactUnitMatch:judged.exactUnitMatch,directMatch:judged.directMatch,directReason:judged.directReason,score:judged.score,scorePercent:judged.scorePercent,fieldMatches:judged.fieldMatches});
        current.candidate = {...current.candidate,...candidate,copyFields:current.candidate.copyFields};
      }
      current.matchedRules = [...new Set([...current.matchedRules, ...judged.rules])];
      current.queries = [...new Set([...current.queries, observation.queryId].filter(Boolean))];
      grouped.set(key, current);
    });
    return [...grouped.values()].sort((a,b)=>Number(b.exactUnitMatch)-Number(a.exactUnitMatch)||Number(b.directMatch)-Number(a.directMatch)||b.score-a.score||String(a.candidate.slId||'').localeCompare(String(b.candidate.slId||'')));
  }

  function explainCandidate(rawSource, result) {
    const source = normalizeSource(rawSource || {});
    const candidate = normalizeSource(result.candidate || result);
    const matches = result.fieldMatches || {};
    const reasons = [];
    if (result.exactUnitMatch) reasons.push('Same address and unit');
    else if (matches.address) reasons.push('Same or similar address');
    if (matches.bannerName) reasons.push('Same business name');
    else {
      const names = bannerSearchWords(candidate.bannerName);
      if (bannerSearchWords(source.bannerName).some(word => word.length >= 3 && names.includes(word))) reasons.push('Similar business name');
    }
    if (matches.storeNumber) reasons.push('Same store number');
    if (matches.phone) reasons.push('Same phone number');
    else if (matches.phone7) reasons.push('Same last 7 phone digits');
    if (!reasons.length && matches.zip) reasons.push('Same ZIP');
    if (!reasons.length && matches.city) reasons.push('Same city');
    const conflicts = [];
    if (source.unitKey && candidate.unitKey && source.unitKey !== candidate.unitKey) conflicts.push(`Different unit: ${candidate.unitKey.toUpperCase()} instead of ${source.unitKey.toUpperCase()}`);
    if (source.storeKey && candidate.storeKey && source.storeKey !== candidate.storeKey) conflicts.push(`Different store number: ${candidate.storeNumber} instead of ${source.storeNumber}`);
    return {summary: reasons.slice(0,3).join('; ') || 'Review this possible match', conflicts};
  }

  function getTopTdIds(results) {
    const ids = [];
    for (const item of results || []) {
      const id = cleanText((item.candidate || item).slId);
      if (/^\d+$/.test(id) && !ids.includes(id)) ids.push(id);
      if (ids.length === 5) break;
    }
    return ids;
  }

  const formatTdCopy = candidate => cleanText(candidate?.slId);
  const formatFullCopy = candidate => {
    const fields = candidate?.copyFields || [];
    if (fields.length) return fields.filter(item => item?.header && item.value != null && String(item.value).trim()).map(item => `${cleanText(item.header)}: ${cleanText(item.value)}`).join('\n');
    return [['SL_ID',candidate?.slId],['SL_STORE_NAME',candidate?.bannerName],['SL_STORE_NUMBER',candidate?.storeNumber],['SL_PA_LINE1',candidate?.address],['SL_PA_CITY_NAME',candidate?.city],['SL_PA_STATE_CODE',candidate?.state],['SL_PA_POSTAL_CODE',candidate?.zip],['PHONE',candidate?.phone]].filter(([,v]) => cleanText(v)).map(([h,v]) => `${h}: ${cleanText(v)}`).join('\n');
  };

  return { cleanText, normalizeWords, normalizeBanner, inferStoreNumber, bannerSearchWords, splitAddress, normalizeAddress, addressWildcard, normalizePostal, normalizeZip, createZip3, wildcardWords, storeBannerWildcard, normalizeSource, createSearchPlan, consolidateCandidates, explainCandidate, getTopTdIds, formatTdCopy, formatFullCopy };
});
