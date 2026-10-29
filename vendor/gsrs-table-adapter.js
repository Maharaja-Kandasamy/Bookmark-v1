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
  function modelFromTable(table,sourceOnly=false,selectedSource=false){
    if(Array.isArray(table?.headers)&&Array.isArray(table?.rows))return table;
    const headers=[...table.querySelectorAll('thead th')].map(cell=>clean(cell.getAttribute('title')||cell.querySelector('[title]')?.getAttribute('title')||cell.textContent));
    const elements=[...table.querySelectorAll('tbody tr')].filter(row=>row.querySelector('td'));
    let selectedIndexes=elements.map((row,index)=>row.matches('.Mui-selected,.selected,.highlighted,[aria-selected="true"],[data-selected="true"]')?index:-1).filter(index=>index>=0);
    const chosen=(selectedSource||sourceOnly)&&selectedIndexes.length===1?[elements[selectedIndexes[0]]]:sourceOnly?elements.slice(0,1):elements;
    if((selectedSource||sourceOnly)&&selectedIndexes.length===1)selectedIndexes=[0];
    const rows=chosen.map(row=>[...row.querySelectorAll('td')].map(cell=>clean(cell.textContent)));
    return{headers,rows,selectedIndexes,sourceRowCount:elements.length};
  }
  function modelFromConfiguredXpaths(root,sourceOnly=false){const doc=root?.ownerDocument||root;if(!doc?.evaluate)return null;const XR=doc.defaultView?.XPathResult||globalThis.XPathResult;if(!XR)return null;const first=xpath=>doc.evaluate(xpath,doc,null,XR.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue;const table=first(TABLE_XPATH);const header=first(HEADER_XPATH);const client=first(CLIENT_ROW_XPATH);if(!table||!header||!client||table.closest?.('[data-testid="manual-match-search-table"]'))return null;const headers=[...header.querySelectorAll('th')].map(cell=>clean(cell.getAttribute('title')||cell.querySelector('[title]')?.getAttribute('title')||cell.textContent));const rowCells=row=>[...row.querySelectorAll('td')].map(cell=>clean(cell.textContent));const result=sourceOnly?{snapshotLength:0}:doc.evaluate(CANDIDATE_ROWS_XPATH,doc,null,XR.ORDERED_NODE_SNAPSHOT_TYPE,null);const candidates=[];for(let i=0;i<result.snapshotLength;i++)candidates.push(rowCells(result.snapshotItem(i)));return{headers,rows:[rowCells(client),...candidates]};}
  function extractSourceAndCandidates(table,requestedProfile){const model=modelFromTable(table);if(!model.headers.length)return{error:'source-headers-not-found'};const detected=detectProfile(model.headers);const effective=requestedProfile==='custom'?'storeView':requestedProfile||detected;if(detected==='unknown'||detected==='ambiguous')return{error:`profile-${detected}`};if(effective!==detected)return{error:'profile-mismatch',detectedProfile:detected,requestedProfile};if(!model.rows.length)return{error:'source-row-not-found'};const rows=model.rows.map(cells=>extractRow(model.headers,cells,detected));return{profile:detected,headers:model.headers,source:rows[0],candidates:rows.slice(1),sourceRowCount:model.rows.length,initialCandidateCount:Math.max(0,model.rows.length-1)};}
  function extractFromDocument(root,requestedProfile,options={}){
    const scoped=findScopedTable(root,'source');
    if(scoped.table){
      const model=modelFromTable(scoped.table,options.includeCandidates===false,true);
      if(model.selectedIndexes?.length>1)return{error:'multiple-highlighted-rows'};
      if(model.selectedIndexes?.length===1){
        const source=extractSourceAndCandidates({headers:model.headers,rows:[model.rows[model.selectedIndexes[0]]]},requestedProfile);
        if(source.error)return source;
        const results=options.includeCandidates===false?{}:findScopedTable(root,'results');
        const candidates=[];
        if(results.table){const resultModel=modelFromTable(results.table),profile=detectProfile(resultModel.headers);if(normalizedProfiles[profile])for(const cells of resultModel.rows)candidates.push(extractRow(resultModel.headers,cells,profile));}
        return{...source,candidates,sourceRowCount:model.sourceRowCount??model.rows.length,initialCandidateCount:candidates.length};
      }
      return extractSourceAndCandidates(model,requestedProfile);
    }
    if(scoped.error==='multiple-source-tables')return scoped;
    const configured=modelFromConfiguredXpaths(root,options.includeCandidates===false);
    if(configured)return extractSourceAndCandidates(configured,requestedProfile);
    return scoped;
  }
  function mergeCustomExtraction(extraction,overrides){const source={...(extraction?.source||{})};for(const [key,value] of Object.entries(overrides||{})){if(String(value||'').trim())source[key]=value;}return{...extraction,source};}
  const sourceSignature=extraction=>JSON.stringify([extraction?.profile,extraction?.source?.slId,extraction?.source?.bannerName,extraction?.source?.storeNumber,extraction?.source?.address,extraction?.source?.zip]);
  return{SOURCE_XPATH,RESULTS_XPATH,TABLE_XPATH,HEADER_XPATH,CLIENT_ROW_XPATH,CANDIDATE_ROWS_XPATH,SELECTORS,PROFILE_HEADERS,PROFILE_COLUMN_INDEXES,detectProfile,buildProfileHeaderMap,hasStableLayout,findScopedTable,extractRow,extractSourceAndCandidates,extractFromDocument,mergeCustomExtraction,sourceSignature};
});
